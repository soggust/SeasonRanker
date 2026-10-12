// The owner's notes on the desk's picks (Firestore's deskNotes/{id}, the id a pick's: a CHECK's mostly, which
// the Bets page's CHECK rows let an admin explain: desk-note.component.ts): { reason: news | role | weather | suspension | market-wrong |
// other, player?: ESPN's athlete id, status?: out | questionable | active, team?: ESPN's team id, note?, by, at }.
//
//   read     once a process, by Firestore's REST API with the service account the workflow already has
//            (FIREBASE_SERVICE_ACCOUNT, as the play bets' settler uses: its key signs a token, nothing
//            installed, so it works before the workflow's npm install); FIRESTORE_EMULATOR_HOST for the
//            emulator. Read only: nothing is written back (each note's outcome is its CHECK's result, kept on
//            the ledger: checks.mjs). Without the secret, or on any failure, no notes: quietly, the desk as
//            it was. The key is never printed
//   applied  a note with concrete news (a player and his status) is an injury override for its game's pricing
//            from the next run on, till the game starts: merged into that game's injury report (a copy of the
//            league's, the game's own; MLB's, which the desk doesn't read, a report of the notes alone), the
//            player put out or questionable (flagged from: 'owner note'; a CHECK's news research, research.mjs, the same way, flagged 'research') or taken off it (active). So the
//            game's context, its props and its inputs (timing.mjs inputsOf: an open bet on it is priced again)
//            all see it, and the CHECK can come back as a real bet. His team: the note's, else the report's,
//            else the CHECK's own player's, else the two teams' rosters; none found, the note isn't applied
//   a team   a note with no player, reason news or other, on a team (the note's team, else its CHECK's
//            player's): that team flagged for the game as the news flags one (teamNotes; news.mjs), its
//            players' props held as CHECKs and its game lines at the minimum stake
//   kept     on its CHECK (checks.mjs, in the public model/checks.json) only as publicNote has it: its reason,
//            player, status, when and whether it was applied. Its own words (note) and its writer's uid (by)
//            stay in Firestore and in the run's memory, never in a file the site serves or the repo commits

import { createSign } from 'node:crypto';

const PROJECT = 'qbranker2026';
export const REASONS = ['news', 'role', 'weather', 'suspension', 'market-wrong', 'other'];
// (a note's status as the injury report words it; active: off the report)
export const NOTE_STATUS = { out: 'Out', questionable: 'Questionable', active: null };
const TIMEOUT = 15e3;
// (the notes a run reads a page at a time, 300 a page, every page there is; MAX_PAGES only a guard against a
// listing that never ends, warned of when it's reached)
const PAGE_SIZE = 300;
export const MAX_PAGES = 1000;

// (a Firestore REST value as plain data: strings, numbers, booleans, null, times as ISO strings, maps, lists)
export function fromValue(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return !!v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, fromValue(x)]));
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(fromValue);
  return null;
}

// A note as the desk reads it, or null when it isn't one: its id the doc's; reason one of REASONS (else
// other); player and team as strings of digits; status one of NOTE_STATUS's (else none)
export function noteOf(id, d) {
  if (!id || !d || typeof d !== 'object') return null;
  const digits = (x) => (x !== null && x !== undefined && /^\d{1,12}$/.test(String(x)) ? String(x) : null);
  const reason = REASONS.includes(d.reason) ? d.reason : 'other';
  const status = Object.hasOwn(NOTE_STATUS, d.status ?? '') ? d.status : null;
  return {
    id: String(id),
    reason,
    player: digits(d.player),
    status,
    team: digits(d.team),
    sport: typeof d.sport === 'string' ? d.sport : null,
    note: typeof d.note === 'string' ? d.note.slice(0, 500) : null,
    by: typeof d.by === 'string' ? d.by : null,
    at: typeof d.at === 'string' ? d.at : Number.isFinite(d.at) ? new Date(d.at).toISOString() : null,
  };
}

const b64url = (x) => Buffer.from(x).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

// (the service account's access token: a JWT its key signs, swapped at Google's token endpoint)
async function tokenOf(account, fetchImpl) {
  const now = Math.floor(Date.now() / 1000);
  const aud = account.token_uri || 'https://oauth2.googleapis.com/token';
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud, iat: now, exp: now + 3600 }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${head}.${claims}`);
  const jwt = `${head}.${claims}.${b64url(signer.sign(account.private_key))}`;
  const res = await fetchImpl(aud, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }).toString(),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`token: HTTP ${res.status}`);
  const body = await res.json();
  if (!body?.access_token) throw new Error('token: none given');
  return body.access_token;
}

// Every note (id -> note), or null: no credentials (quietly), or any failure (a short warning, no secrets).
// env: process.env's names; fetchImpl: fetch (a test's mock)
export async function readDeskNotes({ env = process.env, fetchImpl = globalThis.fetch, log = console } = {}) {
  try {
    let base;
    let token;
    if (env.FIRESTORE_EMULATOR_HOST) {
      base = `http://${env.FIRESTORE_EMULATOR_HOST}/v1/projects/${env.GCLOUD_PROJECT || PROJECT}/databases/(default)/documents`;
      token = 'owner';
    } else if (env.FIREBASE_SERVICE_ACCOUNT) {
      let account;
      try {
        account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
      } catch {
        throw new Error('FIREBASE_SERVICE_ACCOUNT isn’t valid JSON');
      }
      if (!account?.client_email || !account?.private_key) throw new Error('FIREBASE_SERVICE_ACCOUNT has no key');
      base = `https://firestore.googleapis.com/v1/projects/${account.project_id || PROJECT}/databases/(default)/documents`;
      token = await tokenOf(account, fetchImpl);
    } else return null;
    const out = new Map();
    let page = '';
    const seen = new Set();
    for (let i = 0; ; i++) {
      if (i >= MAX_PAGES) {
        log.warn?.(`owner's notes: stopped at ${MAX_PAGES} pages (${out.size} notes read)`);
        break;
      }
      const url = `${base}/deskNotes?pageSize=${PAGE_SIZE}${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`;
      const res = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT) });
      if (!res.ok) throw new Error(`deskNotes: HTTP ${res.status}`);
      const body = await res.json();
      for (const doc of body?.documents ?? []) {
        const id = decodeURIComponent(String(doc.name ?? '').split('/').pop() ?? '');
        const n = noteOf(id, fromValue({ mapValue: { fields: doc.fields ?? {} } }));
        if (n) out.set(n.id, n);
      }
      page = body?.nextPageToken ?? '';
      // (no more pages, or a token given twice: a listing going round in circles)
      if (!page || seen.has(page)) break;
      seen.add(page);
    }
    return out;
  } catch (err) {
    log.warn?.(`owner's notes not read (${String(err?.message ?? err).slice(0, 120)})`);
    return null;
  }
}

// The notes with concrete news put into their games' injury reports (see above). live: run.mjs r.live (each
// coming game's facts, its injuries a Map of team id -> [{ id, name, pos, status }]); upcoming: the coming
// games ({ game }); checks: the ledger's CHECKs (the note's player's name and team, when he's theirs);
// rosterOf(team): a team's roster ids (a Set) or null. Returns the notes applied ({ id, event, team, player,
// name, status }), each game's also on its live facts (ownerNotes)
export async function applyNotes(sport, live, upcoming, notes, { checks = [], rosterOf = async () => null } = {}) {
  const applied = [];
  if (!notes?.size || !live?.size) return applied;
  const games = new Map((upcoming ?? []).map((u) => [String(u.game.id), u.game]));
  for (const n of notes.values()) {
    if (!n.player || !n.status || (n.sport && n.sport !== sport)) continue;
    const game = games.get(n.id.split(':')[0]);
    const l = game && live.get(game.id);
    // (a game whose report failed isn't bet this run anyway: run.mjs blindOf)
    if (!l || l.injuriesFailed) continue;
    const sides = [String(game.home), String(game.away)];
    const report = l.injuries instanceof Map ? l.injuries : new Map();
    let team = n.team && sides.includes(n.team) ? n.team : null;
    let listed = null;
    for (const t of sides) {
      const e = (report.get(t) ?? []).find((p) => String(p.id) === n.player);
      if (e && (!team || team === t)) (team = t), (listed = e);
    }
    const check = checks.find((c) => c.id === n.id && String(c.athlete ?? '') === n.player);
    if (!team && check?.team && sides.includes(String(check.team))) team = String(check.team);
    for (const t of sides) {
      if (team) break;
      const ids = await rosterOf(t).catch(() => null);
      if (ids?.has?.(n.player)) team = t;
    }
    if (!team) continue;
    const name = listed?.name || check?.player || `athlete ${n.player}`;
    // (the game's own copy: the league's report is one Map every game shares)
    const mine = new Map(report);
    const list = (mine.get(team) ?? []).filter((p) => String(p.id) !== n.player);
    if (NOTE_STATUS[n.status]) list.push({ id: n.player, name, pos: listed?.pos ?? '', status: NOTE_STATUS[n.status], from: n.from === 'research' ? 'research' : 'owner note' });
    mine.set(team, list);
    l.injuries = mine;
    const one = { id: n.id, event: String(game.id), team, player: n.player, name, status: n.status, ...(n.from === 'research' ? { from: 'research' } : {}) };
    l.ownerNotes = [...(l.ownerNotes ?? []), one];
    applied.push(one);
  }
  return applied;
}

// The notes with no player, reason news or other, on a team: the team flagged for that game as the news
// flags one (news.mjs: l.news, unit 'team', from 'owner note'), so its players' props are held as CHECKs and
// its game lines cut to the minimum. The team: the note's, else its CHECK's (a prop's player's team); none
// that's one of the game's two sides, not applied. The note's words never put in (the flag's headline says
// only that there's a note). Returns the flags put on ({ id, event, team })
export function teamNotes(sport, live, upcoming, notes, { checks = [] } = {}) {
  const applied = [];
  if (!notes?.size || !live?.size) return applied;
  const games = new Map((upcoming ?? []).map((u) => [String(u.game.id), u.game]));
  for (const n of notes.values()) {
    if (n.player || !['news', 'other'].includes(n.reason) || (n.sport && n.sport !== sport)) continue;
    const game = games.get(n.id.split(':')[0]);
    const l = game && live.get(game.id);
    if (!l) continue;
    const sides = [String(game.home), String(game.away)];
    const check = checks.find((c) => c.id === n.id);
    const team = n.team && sides.includes(n.team) ? n.team : check?.team && sides.includes(String(check.team)) ? String(check.team) : null;
    if (!team) continue;
    l.news = [...(l.news ?? []), { team, unit: 'team', headline: "an owner's note on the team", at: n.at ?? null, id: `note:${n.id}`, from: 'owner note' }];
    applied.push({ id: n.id, event: String(game.id), team });
  }
  return applied;
}

// (a game's owner notes as words for a bet's context: "Owner note: Jalen Hurts out")
export const noteWords = (l) => (l?.ownerNotes ?? []).map((x) => `${x.from === 'research' ? 'Research' : 'Owner note'}: ${x.name} ${x.status}`);

// (a note as anything public keeps it (checks.json is served and committed): its reason, player, status, when,
// and whether it was applied; never its words or its writer's uid, which stay in Firestore. An older file's
// note passed through here loses them too)
export const PUBLIC_NOTE_KEYS = ['reason', 'player', 'status', 'applied', 'at'];
export function publicNote(n) {
  if (!n || typeof n !== 'object') return null;
  const out = { reason: REASONS.includes(n.reason) ? n.reason : 'other', player: n.player ?? null, status: n.status ?? null, at: n.at ?? null };
  if (n.applied === true) out.applied = true;
  return out;
}

// (a note as a CHECK keeps it: its outcome is the CHECK's result; publicNote's fields alone)
export const keptNote = (n, applied) => publicNote({ ...n, applied: !!applied });
