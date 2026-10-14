// The play-money settler: every user's open bet on a game that's begun, settled from ESPN's final score by the
// bettor's own rules (settle-lib.mjs: won, lost or pushed, its winnings paid into the user's wallet; void, its
// stake back, when the game's called off, the player didn't play, or its price wasn't one on the board), each in
// a transaction of its own (a bet already settled is left alone, so a run cut short or run twice pays nothing
// twice). A parlay's legs each graded the same way (settle-lib.mjs settleParlay: a leg lost loses it at once, a
// pushed or void leg drops out, its legs graded so far kept on it while it's open). Then the leaderboards (leaderboards/{week|season|all}: the public players' records) from each user's
// tally (tallies/{uid}, kept here). And each run, the next three days' lines snapshotted (lines/{sport}_{event}),
// so a bet's price can be checked against the board it was placed from.
//
//   node libs/ranker/scripts/accounts/settle.mjs [--dry]
//
// Run hourly by the Model Desk workflow after the bettor (its ledgers fresh), skipped without the secret.
// Credentials: FIREBASE_SERVICE_ACCOUNT (the service account's JSON) or GOOGLE_APPLICATION_CREDENTIALS; with
// FIRESTORE_EMULATOR_HOST set it works on the emulator instead. --dry: reads and reports, writes nothing.
// Free: ESPN's public API, and a few hundred Firestore reads and writes a run.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { get } from '../model/sources.mjs';
import { gameOf, linesOf } from '../model/espn.mjs';
import { statInFinal } from '../model/props.mjs';
import {
  DAY,
  addToTally,
  boardObservations,
  botObservations,
  coreObservations,
  creditOf,
  gradedPick,
  observationsOf,
  paysInto,
  periodsAt,
  leaderboard,
  legProblem,
  mergePreviewSeen,
  parlayDay,
  previewLinesOf,
  previewSeen,
  round2,
  settleParlay,
  settlePlayBet,
} from './settle-lib.mjs';

const PROJECT = 'qbranker2026';
const ROOT = path.resolve(import.meta.dirname, '../../../..');
const SITE = 'https://site.api.espn.com/apis/site/v2/sports';
const CORE = 'https://sports.core.api.espn.com/v2/sports';
export const LEAGUES = { nfl: 'football/nfl', nba: 'basketball/nba', nhl: 'hockey/nhl', mlb: 'baseball/mlb' };
// (how many snapshots a game keeps: an hourly run's worth for a week and more)
const SNAPS = 240;

function adminApp() {
  if (getApps().length) return getApps()[0];
  if (process.env.FIRESTORE_EMULATOR_HOST) return initializeApp({ projectId: process.env.GCLOUD_PROJECT || PROJECT });
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (json) {
    let account;
    try {
      account = JSON.parse(json);
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT isn’t valid JSON');
    }
    return initializeApp({ credential: cert(account), projectId: account.project_id ?? PROJECT });
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return initializeApp({ projectId: PROJECT });
  throw new Error('Set FIREBASE_SERVICE_ACCOUNT (the JSON) or GOOGLE_APPLICATION_CREDENTIALS (its path)');
}

// (the bettor's ledgers, each sport's: its own bets, for the props' values and the price check; its CHECKs
// too (checks.mjs: their own file, checks.json, or an older ledger's checks), for the price check alone)
export function readLedgers(root = ROOT) {
  const out = {};
  for (const sport of Object.keys(LEAGUES)) {
    const dir = path.join(root, 'apps', sport, 'src/StaticData/model');
    try {
      const ledger = JSON.parse(fs.readFileSync(path.join(dir, 'ledger.json'), 'utf8'));
      let checks = ledger.checks ?? [];
      try {
        checks = JSON.parse(fs.readFileSync(path.join(dir, 'checks.json'), 'utf8')).checks ?? checks;
      } catch {
        // (no checks file yet: the ledger's own, or none)
      }
      out[sport] = [...(ledger.bets ?? []), ...checks];
    } catch {
      out[sport] = [];
    }
  }
  return out;
}

// (the bettor's betting boards seen, each sport's (board.mjs seenUpdate: board-seen.json): event -> every price
// its board showed, for the price check; none read, none)
export function readBoards(root = ROOT) {
  const out = {};
  for (const sport of Object.keys(LEAGUES)) {
    try {
      const seen = JSON.parse(fs.readFileSync(path.join(root, 'apps', sport, 'scripts/model/board-seen.json'), 'utf8'));
      out[sport] = Object.fromEntries(Object.entries(seen.games ?? {}).map(([id, g]) => [id, g.o ?? {}]));
    } catch {
      out[sport] = {};
    }
  }
  return out;
}

// (ESPN's day for a date: US Eastern, "20261011")
const espnDay = (t) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(t));
  const part = (k) => parts.find((p) => p.type === k)?.value ?? '';
  return `${part('year')}${part('month')}${part('day')}`;
};

const iso = (v) => (v instanceof Timestamp ? v.toDate().toISOString() : typeof v?.toDate === 'function' ? v.toDate().toISOString() : String(v));

// A game by its ESPN id, from its summary: as the bettor keeps it (gameOf), and the summary (its box score)
async function gameAndBox(fetchJson, sport, event) {
  const body = await fetchJson(`${SITE}/${LEAGUES[sport]}/summary?event=${event}`);
  const h = body?.header;
  const c = h?.competitions?.[0];
  return { game: c ? gameOf({ ...h, date: c.date, status: c.status }, { innings: sport === 'mlb' }) : null, body };
}

// ---------------------------------------------------------------------------
// Preview props' lines (settle-lib.mjs previewLinesOf): a game's DraftKings prop lines off ESPN's core API, every
// page (a thousand items a page, five at most); null when it can't be read
// ---------------------------------------------------------------------------
export async function fetchPreviewLines(fetchJson, sport, event) {
  const [kind, lg] = LEAGUES[sport].split('/');
  const items = [];
  for (let page = 1; page <= 5; page++) {
    const body = await fetchJson(`${CORE}/${kind}/leagues/${lg}/events/${event}/competitions/${event}/odds/100/propBets?lang=en&region=us&limit=1000&page=${page}`);
    if (!body?.items) {
      if (page === 1) return null;
      break;
    }
    items.push(...body.items);
    if (page >= (body.pageCount ?? 1)) break;
  }
  return previewLinesOf(sport, items);
}

// The settler's look at the preview lines of each game an open preview bet is on (a straight bet or a parlay's
// leg) that hasn't begun: each player's stat's lowest and highest main line seen kept (propLines/{sport}_{event}),
// so a line the page showed between ESPN's open and its last still checks once it's moved on. Only those games:
// a few reads a run
export async function snapshotPreviewLines(db, docs, { fetchJson = get, now = Date.now(), dry = false, log = console.log } = {}) {
  const nowIso = new Date(now).toISOString();
  const games = new Map();
  for (const d of docs) {
    const bets = d.get('kind') === 'parlay' ? (d.get('legs') ?? []) : [d.data()];
    for (const b of bets) {
      const start = iso(b.start);
      if (b.preview === true && LEAGUES[b.sport] && /^[0-9]{1,20}$/.test(String(b.event ?? '')) && start > nowIso) games.set(`${b.sport}_${b.event}`, { sport: b.sport, event: String(b.event), start });
    }
  }
  let written = 0;
  for (const [id, g] of games) {
    const lines = await fetchPreviewLines(fetchJson, g.sport, g.event);
    if (!lines?.size) continue;
    const ref = db.doc(`propLines/${id}`);
    const doc = await ref.get();
    const seen = mergePreviewSeen(doc.exists ? doc.get('seen') : null, lines);
    if (!seen) continue;
    written++;
    if (!dry) await ref.set({ sport: g.sport, event: g.event, start: g.start, seen, at: nowIso });
  }
  log(`preview lines: ${games.size} game${games.size === 1 ? '' : 's'} with open preview bets, ${written} with new lines${dry ? ' (dry)' : ''}`);
  return written;
}

// ---------------------------------------------------------------------------
// The lines' snapshots
// ---------------------------------------------------------------------------
export async function snapshotLines(db, { fetchJson = get, now = Date.now(), dry = false, log = console.log } = {}) {
  let written = 0;
  for (const [sport, league] of Object.entries(LEAGUES)) {
    for (let d = 0; d < 3; d++) {
      const events = (await fetchJson(`${SITE}/${league}/scoreboard?dates=${espnDay(now + d * DAY)}&limit=200`))?.events ?? [];
      for (const e of events) {
        if (e.competitions?.[0]?.status?.type?.state !== 'pre') continue;
        const lines = linesOf(e);
        if (!lines) continue;
        const snap = { spread: lines.spread, total: lines.total, ml: lines.ml };
        const ref = db.doc(`lines/${sport}_${e.id}`);
        const doc = await ref.get();
        const snaps = doc.exists ? (doc.get('snaps') ?? []) : [];
        const last = snaps.at(-1);
        if (last && JSON.stringify({ spread: last.spread, total: last.total, ml: last.ml }) === JSON.stringify(snap)) continue;
        written++;
        if (!dry) await ref.set({ sport, event: String(e.id), start: e.date, snaps: [...snaps, { at: new Date(now).toISOString(), ...snap }].slice(-SNAPS) });
      }
    }
  }
  log(`lines: ${written} game${written === 1 ? '' : 's'} with new prices${dry ? ' (dry)' : ''}`);
  return written;
}

// ---------------------------------------------------------------------------
// Settling
// ---------------------------------------------------------------------------
export async function settleOpen(db, { fetchJson = get, now = Date.now(), ledgers = readLedgers(), seen = readBoards(), dry = false, log = console.log } = {}) {
  const snap = await db.collectionGroup('bets').where('status', '==', 'open').get();
  const users = snap.docs.filter((d) => d.ref.parent.parent?.parent?.id === 'users');
  // (a deleted account's open bets: the browser can't delete an open bet (firestore.rules), so they go here,
  // with its tally, never settled)
  const gone = await goneUsers(db, users);
  if (gone.size) await removeGone(db, users.filter((d) => gone.has(d.ref.parent.parent.id)), gone, { dry, log });
  // (due by the start the bet says (a parlay's: its first leg's); it's checked against the game's own below)
  const nowIso = new Date(now).toISOString();
  const due = users.filter((d) => !gone.has(d.ref.parent.parent.id) && iso(d.get('start')) <= nowIso);
  // (each game read once a run, however many bets and parlay legs are on it: its final and box score, and what
  // was on the board: the bettor's own bets and every price its betting board showed; the open, the close and
  // the settler's snapshots too once it's final, when a bet on it isn't a prop)
  const games = new Map();
  const gameFor = (sport, event) => {
    const key = `${sport}|${event}`;
    if (!games.has(key)) {
      games.set(
        key,
        gameAndBox(fetchJson, sport, event).then(({ game, body }) => {
          const mine = (ledgers[sport] ?? []).filter((b) => String(b.event) === String(event));
          return { game, body, mine, observations: [...botObservations(mine), ...boardObservations(seen[sport]?.[String(event)])], board: null };
        }),
      );
    }
    return games.get(key);
  };
  const finalBoard = (sport, event, g) => {
    g.board ??= (async () => {
      const [kind, lg] = LEAGUES[sport].split('/');
      const out = coreObservations(await fetchJson(`${CORE}/${kind}/leagues/${lg}/events/${event}/competitions/${event}/odds/100?lang=en&region=us`));
      const lines = await db.doc(`lines/${sport}_${event}`).get();
      for (const s of lines.exists ? (lines.get('snaps') ?? []) : []) out.push(...observationsOf(s, 'snap', Date.parse(s.at)));
      return out;
    })();
    return g.board;
  };
  // (what settlePlayBet takes for a bet or a parlay's leg: its game, what was on the board, a prop's count)
  const inputsFor = async (bet) => {
    const g = await gameFor(bet.sport, bet.event);
    const observations = g.game?.final && bet.market !== 'prop' ? [...g.observations, ...(await finalBoard(bet.sport, bet.event, g))] : g.observations;
    let propValue;
    let previewLines;
    // (a preview prop's lines seen: ESPN's now (its open and its last), the settler's looks before the start, and
    // the bot's board's and bets' on the same prop)
    if (bet.preview !== undefined && g.game?.final) {
      g.preview ??= (async () => {
        const espn = await fetchPreviewLines(fetchJson, bet.sport, bet.event).catch(() => null);
        const kept = await db.doc(`propLines/${bet.sport}_${bet.event}`).get();
        return { espn, snap: kept.exists ? (kept.get('seen') ?? null) : null };
      })();
      const { espn, snap } = await g.preview;
      previewLines = previewSeen(bet, { espn, snap, observations: g.observations });
    }
    if (bet.market === 'prop' && g.game?.final) {
      // (the bettor's graded value for the same pick, else the box score's count)
      const graded = gradedPick(bet, g.mine);
      propValue = graded ? graded.actual : await statInFinal(bet.sport, bet, g.body, null);
      if (propValue === null && !graded && bet.propType === 'tb') propValue = undefined;
    }
    return { game: g.game, observations, propValue, previewLines };
  };
  const counts = { settled: 0, void: 0, waiting: 0 };
  const done = async (d, bet, result, start, extra) => {
    counts[result.status === 'void' ? 'void' : 'settled']++;
    log(`${bet.sport ?? 'parlay'} ${bet.matchup ?? `${bet.legs.length} legs`} ${bet.pick} ${bet.odds} x${bet.stake}: ${result.status}${result.note ? ` (${result.note})` : ''}`);
    if (!dry) await settleOne(db, d.ref, result, { start, ...extra });
  };
  // (the straight bets, a game's together)
  const straight = due.filter((d) => d.get('kind') !== 'parlay').sort((a, b) => `${a.get('sport')}|${a.get('event')}`.localeCompare(`${b.get('sport')}|${b.get('event')}`));
  for (const d of straight) {
    if (!LEAGUES[d.get('sport')]) continue;
    const bet = { ...d.data(), id: d.id, start: iso(d.get('start')), placedAt: iso(d.get('placedAt')) };
    const inputs = await inputsFor(bet);
    const result = settlePlayBet(bet, inputs.game, { observations: inputs.observations, propValue: inputs.propValue, previewLines: inputs.previewLines, now });
    if (!result) {
      counts.waiting++;
      continue;
    }
    // (filed under the game's own start, not the one the browser wrote)
    await done(d, bet, result, inputs.game?.date);
  }
  // (the parlays: each leg graded as a straight bet is, once its game's begun; a leg graded on an earlier run
  // kept as it was, and a malformed one never looked up (legProblem: settleParlay voids it). One that fails is
  // logged and passed over, the rest still settled)
  for (const d of due.filter((x) => x.get('kind') === 'parlay')) {
    try {
      const legs = (d.get('legs') ?? []).map((l) => ({ ...l, start: iso(l.start) }));
      const parlay = { ...d.data(), id: d.id, legs, start: iso(d.get('start')), placedAt: iso(d.get('placedAt')) };
      const inputs = await Promise.all(legs.map((l) => (LEAGUES[l.sport] && !legProblem(l) && l.start <= nowIso && (!l.status || l.status === 'open') ? inputsFor(l) : null)));
      const { result, legs: graded } = settleParlay(parlay, inputs, { now });
      if (!result) {
        counts.waiting++;
        // (its legs graded so far written on the open parlay: the page shows them)
        if (!dry && graded.some((l, i) => l.status !== legs[i].status)) await gradeLegs(db, d.ref, graded);
        continue;
      }
      await done(d, parlay, result, parlayDay(graded), { legs: graded, ...(Number.isFinite(result.odds) ? { paidOdds: result.odds } : {}) });
    } catch (error) {
      counts.failed = (counts.failed ?? 0) + 1;
      log(`parlay ${d.ref.path}: not settled (${error?.message ?? error})`);
    }
  }
  log(`bets: ${counts.settled} settled, ${counts.void} void, ${counts.waiting} waiting${counts.failed ? `, ${counts.failed} failed` : ''}${dry ? ' (dry)' : ''}`);
  // (then the preview lines of the games not begun that open preview bets are on; its failing doesn't stop the run)
  try {
    await snapshotPreviewLines(db, users.filter((d) => !gone.has(d.ref.parent.parent.id)), { fetchJson, now, dry, log });
  } catch (error) {
    log(`preview lines: not read (${error?.message ?? error})`);
  }
  return counts;
}

// (a parlay's legs' results onto its stored legs: each leg's status, final and note, and its game's own start,
// nothing else of it touched)
const LEG_RESULT = ['status', 'final', 'note', 'date'];
const withResults = (stored, legs) => stored.map((l, i) => ({ ...l, ...Object.fromEntries(LEG_RESULT.filter((k) => legs[i]?.[k] !== undefined).map((k) => [k, legs[i][k]])) }));

// An open parlay's legs as graded so far, written back while it's still open (one settled since left alone)
async function gradeLegs(db, ref, legs) {
  return db.runTransaction(async (tx) => {
    const bet = await tx.get(ref);
    if (!bet.exists || bet.get('status') !== 'open') return false;
    tx.update(ref, { legs: withResults(bet.get('legs') ?? [], legs) });
    return true;
  });
}

// (the owners of these bets whose profile is gone: their accounts deleted)
async function goneUsers(db, docs) {
  const uids = [...new Set(docs.map((d) => d.ref.parent.parent.id))];
  if (!uids.length) return new Set();
  const profiles = await db.getAll(...uids.map((uid) => db.doc(`users/${uid}`)));
  return new Set(uids.filter((_, i) => !profiles[i].exists));
}

// A deleted account's open bets and its tally, removed
async function removeGone(db, docs, gone, { dry = false, log = console.log } = {}) {
  log(`removed: ${docs.length} open bet${docs.length === 1 ? '' : 's'} of ${gone.size} deleted account${gone.size === 1 ? '' : 's'}${dry ? ' (dry)' : ''}`);
  if (dry) return;
  const refs = [...docs.map((d) => d.ref), ...[...gone].map((uid) => db.doc(`tallies/${uid}`))];
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + 400)) batch.delete(ref);
    await batch.commit();
  }
}

// One bet settled, its wallet paid and its owner's tally added to, together (a bet no longer open is left
// alone: settled already). A bet placed before a reload counts in the record; its payout stays with its run,
// and a bet placed before the wallet was made (deleted and made again) is paid nothing (paysInto). The tally's
// day is the game's own start when it's known (`start`), not the one the browser wrote on the bet.
export async function settleOne(db, ref, result, { start = null, legs = null, paidOdds } = {}) {
  const uid = ref.parent.parent.id;
  const walletRef = db.doc(`users/${uid}/wallet/main`);
  const tallyRef = db.doc(`tallies/${uid}`);
  return db.runTransaction(async (tx) => {
    const [bet, wallet, tally] = await tx.getAll(ref, walletRef, tallyRef);
    if (!bet.exists || bet.get('status') !== 'open') return false;
    const data = { ...bet.data(), start: start ?? iso(bet.get('start')) };
    tx.update(ref, {
      status: result.status,
      profit: result.profit,
      ...(result.final ? { final: result.final } : {}),
      ...(result.note ? { note: result.note } : {}),
      // (a parlay: its legs' results, and the price it paid at once a leg dropped out)
      ...(legs ? { legs: withResults(bet.get('legs') ?? [], legs) } : {}),
      ...(paidOdds !== undefined ? { paidOdds } : {}),
      settledAt: FieldValue.serverTimestamp(),
    });
    const credit = creditOf(data.stake, result);
    if (credit > 0 && wallet.exists && paysInto(bet.data(), wallet.data())) {
      tx.update(walletRef, { balance: round2((wallet.get('balance') ?? 0) + credit) });
    }
    tx.set(tallyRef, { ...addToTally(tally.exists ? tally.data() : null, data, result), updatedAt: FieldValue.serverTimestamp() });
    return true;
  });
}

// ---------------------------------------------------------------------------
// The leaderboards
// ---------------------------------------------------------------------------
export async function writeLeaderboards(db, { now = Date.now(), dry = false, log = console.log } = {}) {
  const tallies = await db.collection('tallies').get();
  const profiles = tallies.empty ? [] : await db.getAll(...tallies.docs.map((t) => db.doc(`users/${t.id}`)));
  // (each player's wallet, for the reloads beside their row)
  const wallets = tallies.empty ? [] : await db.getAll(...tallies.docs.map((t) => db.doc(`users/${t.id}/wallet/main`)));
  const entries = [];
  for (const [i, t] of tallies.docs.entries()) {
    // (a tally whose account is gone: removed, and off the boards)
    if (!profiles[i].exists) {
      if (!dry) await t.ref.delete();
      continue;
    }
    entries.push({ uid: t.id, profile: profiles[i].data(), tally: t.data(), wallet: wallets[i].exists ? wallets[i].data() : null });
  }
  const periods = periodsAt(now);
  const boards = {};
  for (const [period, { from, label }] of Object.entries(periods)) {
    boards[period] = { period, label, from, rows: leaderboard(entries, from), updatedAt: new Date(now).toISOString() };
    if (!dry) await db.doc(`leaderboards/${period}`).set({ ...boards[period], updatedAt: FieldValue.serverTimestamp() });
  }
  log(`leaderboards: ${boards.week.rows.length} this week, ${boards.season.rows.length} this season, ${boards.all.rows.length} all time${dry ? ' (dry)' : ''}`);
  return boards;
}

// Whether the boards need writing again: something settled this run (or settling failed, so it can't be told),
// the week moved on since they were written, or they're a day old (a name, picture or privacy setting changed,
// an account gone, a reload); else they stand, and every tally, profile and wallet isn't read again each hour
export async function boardsDue(db, counts, now = Date.now()) {
  if (!counts || counts.settled + counts.void > 0) return true;
  const week = await db.doc('leaderboards/week').get();
  if (!week.exists) return true;
  const written = week.get('updatedAt')?.toMillis?.() ?? 0;
  return week.get('from') !== periodsAt(now).week.from || now - written >= 864e5;
}

// The whole run: settle, then the boards (when they're due), then the lines' snapshots (each part on its own: one
// failing doesn't stop the others)
export async function run({ db = getFirestore(adminApp()), fetchJson = get, now = Date.now(), ledgers, seen, dry = false, log = console.log } = {}) {
  let failed = false;
  const step = async (name, fn) => {
    try {
      return await fn();
    } catch (error) {
      failed = true;
      console.error(`${name} failed: ${error.code ?? ''} ${error.message}`.trim());
      return null;
    }
  };
  const counts = await step('Settling', () => settleOpen(db, { fetchJson, now, ledgers: ledgers ?? readLedgers(), seen: seen ?? readBoards(), dry, log }));
  const boards = await step('Leaderboards', async () => ((await boardsDue(db, counts, now)) ? writeLeaderboards(db, { now, dry, log }) : null));
  const lines = await step('Lines', () => snapshotLines(db, { fetchJson, now, dry, log }));
  return { counts, boards, lines, failed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run({ dry: process.argv.includes('--dry') })
    .then(({ failed }) => process.exit(failed ? 1 : 0))
    .catch((error) => {
      console.error(`Settler failed: ${error.code ?? ''} ${error.message}`.trim());
      process.exit(1);
    });
}
