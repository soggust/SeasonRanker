// The play-money settler: every user's open bet on a game that's begun, settled from ESPN's final score by the
// bettor's own rules (settle-lib.mjs: won, lost or pushed, its winnings paid into the user's wallet; void, its
// stake back, when the game's called off, the player didn't play, or its price wasn't one on the board), each in
// a transaction of its own (a bet already settled is left alone, so a run cut short or run twice pays nothing
// twice). A parlay's legs each graded the same way (settle-lib.mjs settleParlay: a leg lost loses it at once, a
// pushed or void leg drops out, its legs graded so far kept on it while it's open). Then the leaderboards (leaderboards/{week|season|all}: the public players' records) from each user's
// tally (tallies/{uid}, kept here). And each run, the next three days' lines snapshotted (lines/{sport}_{event}),
// so a bet's price can be checked against the board it was placed from. A UFC bout's bet (sport 'mma', a
// moneyline or a round total, straight or a parlay's leg) settled from the bout as the MMA desk grades it
// (settle-lib.mjs settleMmaBet: ESPN's UFC scoreboard and the desk's kept bouts, mmaBouts). An NHL skater's
// shots and points by the league's own box (nhl-official.mjs), and one settled on a count the league's box
// doesn't bear out settled again, its payout reversed and the new one paid (correctSettled).
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
import { CORRECT_WINDOW, OFFICIAL_SINCE, officialLookup } from '../model/nhl-official.mjs';
import { FILES as MMA_FILES, boutsOf, mergeBouts } from '../model/mma-desk.mjs';
import {
  CORRECT_DAYS,
  DAY,
  correctable,
  correctionOf,
  parlayCorrectionOf,
  removeFromTally,
  boutFor,
  TALLY_VERSION,
  addToTally,
  boardObservations,
  botObservations,
  botPickAt,
  gradeBot,
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
  sportsOfBets,
} from './settle-lib.mjs';

const PROJECT = 'qbranker2026';
const ROOT = path.resolve(import.meta.dirname, '../../../..');
const SITE = 'https://site.api.espn.com/apis/site/v2/sports';
const CORE = 'https://sports.core.api.espn.com/v2/sports';
export const LEAGUES = { nfl: 'football/nfl', nba: 'basketball/nba', nhl: 'hockey/nhl', mlb: 'baseball/mlb' };
// (UFC bouts too: settled from the MMA desk's bouts (settle-lib.mjs settleMmaBet), not a game's summary; no
// lines' snapshots, their prices checked against the bettor's MMA bets and its board's)
const MMA = 'mma';
const SETTLED = [...Object.keys(LEAGUES), MMA];
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
  for (const sport of SETTLED) {
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
  for (const sport of SETTLED) {
    try {
      const seen = JSON.parse(fs.readFileSync(path.join(root, 'apps', sport, 'scripts/model/board-seen.json'), 'utf8'));
      out[sport] = Object.fromEntries(Object.entries(seen.games ?? {}).map(([id, g]) => [id, g.o ?? {}]));
    } catch {
      out[sport] = {};
    }
  }
  return out;
}

// (the bot's sides its board showed, each sport's (board.mjs botSeenUpdate: board-seen.json's b): event -> market
// -> rows, for You vs the Bot (settle-lib.mjs botPickAt); none read, none)
export function readBotBoards(root = ROOT) {
  const out = {};
  for (const sport of SETTLED) {
    try {
      const seen = JSON.parse(fs.readFileSync(path.join(root, 'apps', sport, 'scripts/model/board-seen.json'), 'utf8'));
      out[sport] = Object.fromEntries(Object.entries(seen.games ?? {}).map(([id, g]) => [id, g.b ?? {}]));
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

// (the MMA desk's kept bouts (apps/mma/scripts/model/games.json, written by its run just before this one: each
// bout's result, and off when it was cancelled or a fighter replaced); none read, none)
export function readMmaKept(file = MMA_FILES.games) {
  try {
    const kept = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(kept) ? kept : [];
  } catch {
    return [];
  }
}

// (a UTC day as ESPN's MMA scoreboard takes it, as the desk asks: "20261017")
const utcDay = (t) => new Date(t).toISOString().slice(0, 10).replace(/-/g, '');

// The bouts the due MMA bets are on: ESPN's UFC scoreboard over their days (the desk's own source, read as it
// reads it: mma-desk.mjs boutsOf), brought into the desk's kept bouts (mergeBouts: a bout gone from its card
// cancelled, its fighters changed replaced); the kept alone when ESPN can't be read. One ask a run, a month back
// at most
export async function mmaBouts(fetchJson, starts, { kept = readMmaKept(), now = Date.now() } = {}) {
  const t = starts.map((s) => Date.parse(s)).filter(Number.isFinite);
  if (!t.length) return [];
  const from = Math.max(Math.min(...t) - DAY, now - 30 * DAY);
  const to = Math.min(Math.max(...t) + DAY, now + DAY);
  const body = await fetchJson(`${SITE}/mma/ufc/scoreboard?dates=${utcDay(from)}-${utcDay(to)}&limit=100`);
  const board = body ? boutsOf(body) : [];
  return board.length ? mergeBouts(kept, board, new Date(now)) : kept;
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
// (D98: the notes a bet voided over its price was given, and how far back such a void is graded again)
export const PRICE_VOIDS = ['price didn’t match the board', 'couldn’t check the price: no board for this market'];
export const PRICE_VOID_DAYS = 14;

export async function settleOpen(db, { fetchJson = get, now = Date.now(), ledgers = readLedgers(), seen = readBoards(), botSeen = readBotBoards(), mmaKept, dry = false, log = console.log } = {}) {
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
  // (the UFC bouts the due MMA bets and legs are on: read once a run, the first time one's needed)
  let bouts = null;
  const boutsDue = () => {
    const starts = due.flatMap((d) => (d.get('kind') === 'parlay' ? (d.get('legs') ?? []) : [d.data()])).filter((b) => b.sport === MMA && b.start).map((b) => iso(b.start)).filter((s) => s <= nowIso);
    bouts ??= mmaBouts(fetchJson, starts, { kept: mmaKept ?? readMmaKept(), now });
    return bouts;
  };
  // (what settlePlayBet takes for a bet or a parlay's leg: its game, what was on the board, a prop's count; a
  // bout's: the bout, and the bettor's bets on it and every price its MMA board showed)
  const inputsFor = async (bet) => {
    if (bet.sport === MMA) {
      const mine = (ledgers[MMA] ?? []).filter((b) => String(b.event) === String(bet.event));
      return { game: boutFor(bet, await boutsDue()), observations: [...botObservations(mine), ...boardObservations(seen[MMA]?.[String(bet.event)])] };
    }
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
      propValue = graded ? graded.actual : await statInFinal(bet.sport, bet, g.body, null, bet.sport === 'nhl' ? { official } : {});
      if (propValue === null && !graded && bet.propType === 'tb') propValue = undefined;
    }
    return { game: g.game, observations, propValue, previewLines };
  };
  const counts = { settled: 0, void: 0, waiting: 0 };
  // (an NHL skater's shots and points by the league's box, waiting till it's official: nhl-official.mjs)
  const official = officialLookup({ fetchJson, now });
  const done = async (d, bet, result, start, extra) => {
    counts[result.status === 'void' ? 'void' : 'settled']++;
    log(`${bet.sport ?? 'parlay'} ${bet.matchup ?? `${bet.legs.length} legs`} ${bet.pick} ${bet.odds} x${bet.stake}: ${result.status}${result.note ? ` (${result.note})` : ''}`);
    if (!dry) await settleOne(db, d.ref, result, { start, ...extra });
  };
  // (the straight bets, a game's together)
  const straight = due.filter((d) => d.get('kind') !== 'parlay').sort((a, b) => `${a.get('sport')}|${a.get('event')}`.localeCompare(`${b.get('sport')}|${b.get('event')}`));
  for (const d of straight) {
    if (!SETTLED.includes(d.get('sport'))) continue;
    const bet = { ...d.data(), id: d.id, start: iso(d.get('start')), placedAt: iso(d.get('placedAt')) };
    const inputs = await inputsFor(bet);
    const result = settlePlayBet(bet, inputs.game, { observations: inputs.observations, propValue: inputs.propValue, previewLines: inputs.previewLines, now });
    if (!result) {
      counts.waiting++;
      continue;
    }
    // (the bot's call on the same market when it was placed, graded beside it: You vs the Bot)
    const bot = botFor(bet, result, { botSeen, ledgers, game: inputs.game, propValue: inputs.propValue });
    // (filed under the game's own start, not the one the browser wrote)
    await done(d, bet, result, inputs.game?.date, { bot, ...(Number.isFinite(result.paidOdds) ? { paidOdds: result.paidOdds } : {}) });
  }
  // (D98: a straight bet voided over its price in the last PRICE_VOID_DAYS, before the rule changed, graded again: paid
  // at its price (priceFor), its void swapped for the result in its wallet and tally (correctOne), once)
  try {
    const old = await db.collectionGroup('bets').where('status', '==', 'void').get();
    const revive = old.docs.filter((d) => d.ref.parent.parent?.parent?.id === 'users' && d.get('kind') !== 'parlay' && PRICE_VOIDS.includes(d.get('note')) && (d.get('settledAt')?.toMillis?.() ?? 0) >= now - PRICE_VOID_DAYS * DAY && SETTLED.includes(d.get('sport')));
    log(`price voids (D98): ${revive.length} of ${old.size} voids to grade again${old.size && !revive.length ? ` (${old.docs.map((d) => `${d.get('sport')}/${d.get('kind') ?? 'straight'}/${PRICE_VOIDS.includes(d.get('note')) ? 'price' : 'other'}/settled ${d.get('settledAt')?.toDate?.()?.toISOString?.()?.slice(0, 16) ?? typeof d.get('settledAt')}`).slice(0, 10).join(', ')})` : ''}`);
    for (const d of revive) {
      const bet = { ...d.data(), id: d.id, start: iso(d.get('start')), placedAt: iso(d.get('placedAt')) };
      const inputs = await inputsFor(bet);
      const result = settlePlayBet(bet, inputs.game, { observations: inputs.observations, propValue: inputs.propValue, previewLines: inputs.previewLines, now });
      if (!result || result.status === 'void') {
        log(`price void ${d.ref.path}: not graded again (${result ? result.note : 'its game not final'})`);
        continue;
      }
      const bot = botFor(bet, result, { botSeen, ledgers, game: inputs.game, propValue: inputs.propValue });
      log(`regraded (D98): ${bet.sport} ${bet.matchup} ${bet.pick} ${bet.odds} x${bet.stake}: void to ${result.status}${result.note ? ` (${result.note})` : ''}${dry ? ' (dry)' : ''}`);
      if (!dry) await correctOne(db, d.ref, result, { was: { status: 'void', profit: d.get('profit') ?? 0, final: d.get('final') ?? null }, bot, why: 'D98: never void over its price', ...(Number.isFinite(result.paidOdds) ? { paidOdds: result.paidOdds } : {}) });
    }
  } catch (error) {
    log(`price voids: not regraded (${error?.message ?? error})`);
  }
  // (the parlays: each leg graded as a straight bet is, once its game's begun; a leg graded on an earlier run
  // kept as it was, and a malformed one never looked up (legProblem: settleParlay voids it). One that fails is
  // logged and passed over, the rest still settled)
  for (const d of due.filter((x) => x.get('kind') === 'parlay')) {
    try {
      const legs = (d.get('legs') ?? []).map((l) => ({ ...l, start: iso(l.start) }));
      const parlay = { ...d.data(), id: d.id, legs, start: iso(d.get('start')), placedAt: iso(d.get('placedAt')) };
      const inputs = await Promise.all(legs.map((l) => (SETTLED.includes(l.sport) && !legProblem(l) && l.start <= nowIso && (!l.status || l.status === 'open') ? inputsFor(l) : null)));
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

// (a straight bet's bot: the bot's side on its market at its placement, graded beside its result (settle-lib.mjs
// botPickAt, gradeBot); null without a board row for it then, or a void bet)
export function botFor(bet, result, { botSeen = {}, ledgers = {}, game = null, propValue } = {}) {
  const rows = botSeen[bet.sport]?.[String(bet.event)];
  const mine = (ledgers[bet.sport] ?? []).filter((b) => String(b.event) === String(bet.event));
  return gradeBot(bet, result, botPickAt(bet, rows, mine), { game, propValue });
}

// The bot's call filled in on the straight bets settled before it was kept (the last BACKFILL_DAYS: the
// board's rows go a week past a game's start), each once: null where the board can't say. Graded from the
// bet's own result (a moved line not graded again: null)
const BACKFILL_DAYS = 8;
export async function backfillBot(db, { now = Date.now(), botSeen = readBotBoards(), ledgers = readLedgers(), dry = false, log = console.log } = {}) {
  const snap = await db.collectionGroup('bets').where('settledAt', '>=', Timestamp.fromMillis(now - BACKFILL_DAYS * DAY)).get();
  const todo = snap.docs.filter((d) => d.ref.parent.parent?.parent?.id === 'users' && d.get('kind') !== 'parlay' && d.get('bot') === undefined && ['won', 'lost', 'push', 'void'].includes(d.get('status')));
  let filled = 0;
  for (const d of todo) {
    const bet = { ...d.data(), start: iso(d.get('start')), placedAt: iso(d.get('placedAt')) };
    const bot = botFor(bet, { status: bet.status }, { botSeen, ledgers });
    if (bot) filled++;
    if (!dry) await d.ref.update({ bot });
  }
  log(`bot calls: ${todo.length} settled bet${todo.length === 1 ? '' : 's'} looked at, ${filled} with the Bot's side${dry ? ' (dry)' : ''}`);
  return { looked: todo.length, filled };
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
export async function settleOne(db, ref, result, { start = null, legs = null, paidOdds, bot } = {}) {
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
      // (a straight bet's: the bot's own call on it, or null where the board can't say)
      ...(bot !== undefined ? { bot } : {}),
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
// Corrections (settle-lib.mjs correctionOf): every NHL shots or points prop settled in the last CORRECT_DAYS,
// straight or a parlay's leg, against the count now: the bettor's graded pick's (graded again by the league's
// box, run.mjs officialRegrade), else the league's box itself (never ESPN's); one that moved settled again,
// each in a transaction of its own with its wallet and tally: the old payout taken back and the new one paid
// (paysInto's rule; a balance never below 0), the old result out of the tally and the new one in, the bet
// marked corrected (what it was). A bet changed since it was read is left alone, so a run twice corrects once
// ---------------------------------------------------------------------------
export async function correctSettled(db, { fetchJson = get, now = Date.now(), ledgers = readLedgers(), dry = false, log = console.log } = {}) {
  const snap = await db.collectionGroup('bets').where('settledAt', '>=', Timestamp.fromMillis(now - CORRECT_DAYS * DAY)).get();
  const docs = snap.docs.filter((d) => d.ref.parent.parent?.parent?.id === 'users' && (d.get('kind') === 'parlay' ? (d.get('legs') ?? []).some(correctable) : correctable(d.data())));
  if (!docs.length) return 0;
  const official = officialLookup({ fetchJson, now });
  const games = new Map();
  // (the bettor's pick's count, else the league's box: read for a bet settled before OFFICIAL_SINCE, on ESPN's
  // count, or in the last CORRECT_WINDOW, as the bettor reads its own; else it stands)
  const countOf = async (b, readBox) => {
    const graded = gradedPick(b, (ledgers.nhl ?? []).filter((x) => String(x.event) === String(b.event)));
    if (graded) return typeof graded.actual === 'number' ? graded.actual : undefined;
    if (!readBox) return undefined;
    const key = String(b.event);
    if (!games.has(key)) games.set(key, gameAndBox(fetchJson, 'nhl', b.event).catch(() => null));
    const g = await games.get(key);
    if (!g?.game?.final || !g.body) return undefined;
    const v = await statInFinal('nhl', b, g.body, null, { official, officialOnly: true });
    return typeof v === 'number' ? v : undefined;
  };
  let n = 0;
  for (const d of docs) {
    try {
      const bet = { ...d.data(), id: d.id, start: iso(d.get('start')), placedAt: iso(d.get('placedAt')) };
      const was = { status: bet.status, profit: bet.profit, final: bet.final ?? null };
      const settled = d.get('settledAt')?.toMillis?.() ?? 0;
      const readBox = settled < OFFICIAL_SINCE || now - settled < CORRECT_WINDOW;
      if (bet.kind === 'parlay') {
        const legs = (bet.legs ?? []).map((l) => ({ ...l, start: iso(l.start) }));
        const values = await Promise.all(legs.map((l) => (correctable(l) && ['won', 'lost', 'push'].includes(l.status) ? countOf(l, readBox) : undefined)));
        const c = parlayCorrectionOf({ ...bet, legs }, values);
        if (!c) continue;
        log(`corrected: parlay ${legs.length} legs x${bet.stake}: ${was.status} to ${c.result.status} (${c.result.final})${dry ? ' (dry)' : ''}`);
        if (!dry && !(await correctOne(db, d.ref, c.result, { was, days: [parlayDay(legs), parlayDay(c.legs)], legs: c.legs, ...(Number.isFinite(c.result.odds) ? { paidOdds: c.result.odds } : {}) }))) continue;
      } else {
        const value = await countOf(bet, readBox);
        const r = correctionOf(bet, value);
        if (!r) continue;
        // (the bot's call beside it graded again from the new result)
        const bot = bet.bot ? gradeBot(bet, r, { side: bet.bot.side, line: bet.bot.line, price: bet.bot.price, units: bet.bot.units, kelly: bet.bot.kelly, forced: bet.bot.forced }, { propValue: value }) : undefined;
        log(`corrected: nhl ${bet.matchup} ${bet.pick} ${bet.odds} x${bet.stake}: ${was.final} ${was.status} to ${r.final} ${r.status}${dry ? ' (dry)' : ''}`);
        if (!dry && !(await correctOne(db, d.ref, r, { was, ...(bot !== undefined ? { bot } : {}) }))) continue;
      }
      n++;
    } catch (error) {
      log(`${d.ref.path}: not corrected (${error?.message ?? error})`);
    }
  }
  log(`corrections: ${n} of ${docs.length} settled NHL shots and points bets settled again by the league's count${dry ? ' (dry)' : ''}`);
  return n;
}

// One settled bet settled again: its old result (was: { status, profit, final } as it was read; one that's
// changed since is left alone) for the new one, the wallet's credit moved by the difference, the tally's
// result swapped (days: the old and the new tally day, a parlay's; else the bet's start)
export async function correctOne(db, ref, result, { was, days = null, legs = null, paidOdds, bot, why = "the league's official count" } = {}) {
  const uid = ref.parent.parent.id;
  const walletRef = db.doc(`users/${uid}/wallet/main`);
  const tallyRef = db.doc(`tallies/${uid}`);
  return db.runTransaction(async (tx) => {
    const [bet, wallet, tally] = await tx.getAll(ref, walletRef, tallyRef);
    if (!bet.exists || bet.get('status') !== was.status || bet.get('profit') !== was.profit || (bet.get('final') ?? null) !== was.final) return false;
    const start = iso(bet.get('start'));
    tx.update(ref, {
      status: result.status,
      profit: result.profit,
      ...(result.final ? { final: result.final } : {}),
      ...(legs ? { legs: withResults(bet.get('legs') ?? [], legs) } : {}),
      ...(paidOdds !== undefined ? { paidOdds } : {}),
      ...(bot !== undefined ? { bot } : {}),
      corrected: { status: was.status, profit: was.profit, final: was.final, why },
      ...(why !== "the league's official count" ? (result.note ? { note: result.note } : { note: FieldValue.delete() }) : {}),
      correctedAt: FieldValue.serverTimestamp(),
    });
    const stake = bet.get('stake');
    const delta = round2(creditOf(stake, result) - creditOf(stake, was));
    if (delta !== 0 && wallet.exists && paysInto(bet.data(), wallet.data())) {
      tx.update(walletRef, { balance: Math.max(0, round2((wallet.get('balance') ?? 0) + delta)) });
    }
    if (tally.exists) {
      const data = bet.data();
      const out = removeFromTally(tally.data(), { ...data, start: days?.[0] ?? start }, was);
      tx.set(tallyRef, { ...addToTally(out, { ...data, start: days?.[1] ?? start }, result), updatedAt: FieldValue.serverTimestamp() });
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// The tallies' one-time fill: a tally from before TALLY_VERSION 2 has no sports (each day's profit by sport, the
// wallet's chart's lines), so they're made from its owner's settled bets' documents, once, and it's marked 2.
// Each in a transaction with the tally (a bet settling at the same time waits on it, or it on the bet), its
// all and days left as they are (the record, kept through a cleared history). The settler does it as it writes
// the boards (boardsDue: due until the week's board says TALLY_VERSION), so production needs no write by hand
// ---------------------------------------------------------------------------
export async function upgradeTallies(db, docs, { dry = false, log = console.log } = {}) {
  const old = docs.filter((t) => (t.get('v') ?? 1) < TALLY_VERSION);
  if (!old.length) return 0;
  let done = 0;
  for (const t of old) {
    if (dry) {
      done++;
      continue;
    }
    const upgraded = await db.runTransaction(async (tx) => {
      const tally = await tx.get(t.ref);
      if (!tally.exists || (tally.get('v') ?? 1) >= TALLY_VERSION) return false;
      const bets = await tx.get(db.collection(`users/${t.id}/bets`).where('status', 'in', ['won', 'lost', 'push']));
      const sports = sportsOfBets(bets.docs.map((d) => ({ ...d.data(), start: iso(d.get('start')) })));
      tx.update(t.ref, { sports, v: TALLY_VERSION });
      return true;
    });
    if (upgraded) done++;
  }
  log(`tallies: ${done} filled in to version ${TALLY_VERSION}${dry ? ' (dry)' : ''}`);
  return done;
}

// ---------------------------------------------------------------------------
// The leaderboards
// ---------------------------------------------------------------------------
export async function writeLeaderboards(db, { now = Date.now(), dry = false, log = console.log } = {}) {
  const tallies = await db.collection('tallies').get();
  // (the older tallies filled in first, their owners' profiles there: a gone account's is deleted below)
  const present = tallies.empty ? [] : await db.getAll(...tallies.docs.map((t) => db.doc(`users/${t.id}`)));
  await upgradeTallies(db, tallies.docs.filter((_, i) => present[i].exists), { dry, log });
  const profiles = present;
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
    if (!dry) await db.doc(`leaderboards/${period}`).set({ ...boards[period], tallyVersion: TALLY_VERSION, updatedAt: FieldValue.serverTimestamp() });
  }
  log(`leaderboards: ${boards.week.rows.length} this week, ${boards.season.rows.length} this season, ${boards.all.rows.length} all time${dry ? ' (dry)' : ''}`);
  return boards;
}

// Whether the boards need writing again: something settled this run (or settling failed, so it can't be told),
// the week moved on since they were written, or they're a day old (a name, picture or privacy setting changed,
// an account gone, a reload), or the tallies aren't filled in to TALLY_VERSION yet (upgradeTallies: the next run
// after this one's deployed); else they stand, and every tally, profile and wallet isn't read again each hour
export async function boardsDue(db, counts, now = Date.now()) {
  if (!counts || counts.settled + counts.void + (counts.corrected ?? 0) > 0) return true;
  const week = await db.doc('leaderboards/week').get();
  if (!week.exists || week.get('tallyVersion') !== TALLY_VERSION) return true;
  const written = week.get('updatedAt')?.toMillis?.() ?? 0;
  return week.get('from') !== periodsAt(now).week.from || now - written >= 864e5;
}

// The whole run: settle, then the boards (when they're due), then the lines' snapshots (each part on its own: one
// failing doesn't stop the others)
export async function run({ db = getFirestore(adminApp()), fetchJson = get, now = Date.now(), ledgers, seen, botSeen, mmaKept, dry = false, log = console.log } = {}) {
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
  ledgers ??= readLedgers();
  botSeen ??= readBotBoards();
  const counts = await step('Settling', () => settleOpen(db, { fetchJson, now, ledgers, seen: seen ?? readBoards(), botSeen, mmaKept, dry, log }));
  // (the NHL shots and points bets settled on a count the league's box doesn't bear out, settled again)
  const corrected = await step('Corrections', () => correctSettled(db, { fetchJson, now, ledgers, dry, log }));
  if (counts && corrected) counts.corrected = corrected;
  // (the bot's call on bets settled before it was kept: its failing (its index still building) fails nothing)
  try {
    await backfillBot(db, { now, botSeen, ledgers, dry, log });
  } catch (error) {
    log(`bot calls: not filled (${error?.message ?? error})`);
  }
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
