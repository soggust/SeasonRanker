// The CHECK picks and the owner's notes (libs/ranker/scripts/model/checks.mjs, notes.mjs): a market too far
// from the book to bet kept on the model's side, apart from the bets; written again only while it isn't
// locked and something material changed, closed when the gap does; graded at a unit, out of the record, then
// trimmed; in picks.json's own list (checks), never its picks; kept in their own file (checks.json); a prop's
// other side's price on its bet, its pick and the settler's price check; the notes read
// from Firestore's REST API (a mock: no network, no real key) and put into a game's own injury report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gapGuard, record, settle } from '../libs/ranker/scripts/model/desk.mjs';
import { settleProp } from '../libs/ranker/scripts/model/props.mjs';
import { atUnit, CHECK_KELLY, checkLocked, checkOf, checkResultOf, checkSummary, checkTrim, closeChecks, markPlaced, modelKelly, modelSide, TRIM_AFTER, upsertCheck } from '../libs/ranker/scripts/model/checks.mjs';
import { readLedgers } from '../libs/ranker/scripts/accounts/settle.mjs';
import { applyNotes, fromValue, keptNote, MAX_PAGES, noteOf, noteWords, publicNote, PUBLIC_NOTE_KEYS, readDeskNotes } from '../libs/ranker/scripts/model/notes.mjs';
import { ledgerWrites, readChecks } from '../libs/ranker/scripts/model/checks-file.mjs';
import { buildPicks } from '../libs/ranker/scripts/model/picks.mjs';
import { botObservations, checkPrice } from '../libs/ranker/scripts/accounts/settle-lib.mjs';

const now = new Date('2026-10-09T12:00:00Z');
const bet = (over = {}) => ({ id: 'x', event: '401', sport: 'nfl', start: '2026-10-10T17:00:00Z', placedAt: '2026-10-09T11:00:00Z', matchup: 'TB @ DAL', market: 'spread', side: 'home', line: -3, pick: 'DAL -3', odds: -110, model: 0.6, fair: 0.5, p: 0.535, ev: 0.0214, units: 1, status: 'open', profit: 0, ...over });
const GAP_WHY = { skip: true, kind: 'gap', why: "the model's 70% against the book's 50%: too far from the market to trust" };
// (a gap CHECK as an older one was kept, shown: the gap's are shadows now (checks.mjs shadowOf), so the
// lifecycle's tests take one made before the rule)
const shown = ({ hidden: _h, passAs: _p, passWhy: _w, ...c }) => c;
const check = (over = {}) => shown(checkOf(bet({ id: '401:spread', model: 0.7, fair: 0.5, p: 0.5, ev: -0.045, intent: 'edge', ...over }), GAP_WHY));

test("gapGuard: past the market's gap it skips, kind 'gap' (a CHECK); inside it, nothing", () => {
  assert.deepEqual({ ...gapGuard('spread', 0.7, 0.5), why: null }, { skip: true, kind: 'gap', why: null });
  assert.equal(gapGuard('prop', 0.6, 0.5), null);
});

test("modelSide: the side whose chance is over the book's, whatever the price; the other beside it", () => {
  const over = { side: 'over', model: 0.3, fair: 0.5, ev: 0.01, odds: -105 };
  const under = { side: 'under', model: 0.7, fair: 0.5, ev: -0.02, odds: -115 };
  const s = modelSide([over, under]);
  assert.equal(s.side, 'under');
  assert.equal(s.other.odds, -105);
});

test("checkOf: no units, intent 'check', the gap signed for its side, the guard's words its reason", () => {
  const c = check();
  assert.equal(c.units, 0);
  assert.equal(c.intent, 'check');
  assert.equal(c.gap, 0.2);
  assert.match(c.reason, /too far from the market/);
  // (never in a record: record() reads the bets alone, and a CHECK at 0 units would add nothing anyway)
  assert.equal(record([]).bets, 0);
});

test('upsertCheck: new, then written again only while open, not locked, and something material changed', () => {
  const ledger = { bets: [] };
  assert.equal(upsertCheck(ledger, check(), now), 'new');
  assert.equal(ledger.checks.length, 1);
  assert.equal(ledger.checks[0].n, 1);
  // (the refit's small move: not material)
  assert.equal(upsertCheck(ledger, check({ model: 0.701, placedAt: '2026-10-09T12:00:00Z' }), now), null);
  // (the price moved: written again, its first time kept)
  assert.equal(upsertCheck(ledger, check({ odds: -120, placedAt: '2026-10-09T12:00:00Z' }), now), 'updated');
  assert.deepEqual([ledger.checks[0].odds, ledger.checks[0].firstAt, ledger.checks[0].n], [-120, '2026-10-09T11:00:00Z', 2]);
  // (the price it stood at before kept, for the settler: a bet taken at it still matches)
  assert.deepEqual(ledger.checks[0].earlier.map((e) => [e.at, e.odds]), [['2026-10-09T11:00:00Z', check().odds]]);
  // (the model moved, the price didn't: nothing more kept)
  assert.equal(upsertCheck(ledger, check({ odds: -120, model: 0.75, placedAt: '2026-10-09T13:00:00Z' }), now), 'updated');
  assert.equal(ledger.checks[0].earlier.length, 1);
  // (locked: 20 minutes from the start)
  const late = new Date(Date.parse(ledger.checks[0].start) - 10 * 60e3);
  assert.ok(checkLocked(ledger.checks[0], late));
  assert.equal(upsertCheck(ledger, check({ odds: -130 }), late), null);
  // (graded: left as it is)
  ledger.checks[0].checkResult = { status: 'won' };
  assert.equal(upsertCheck(ledger, check({ odds: -130 }), now), null);
  assert.equal(ledger.checks.length, 1);
});

test('closeChecks: a CHECK whose market was priced without the gap skipping it is closed (open, unbet, unlocked only); a later gap opens it again', () => {
  const ledger = { bets: [] };
  upsertCheck(ledger, check(), now);
  upsertCheck(ledger, check({ id: '401:total' }), now);
  assert.equal(closeChecks(ledger, new Set(['401:spread', 'nope']), now), 1);
  assert.equal(ledger.checks[0].closedAt, now.toISOString());
  assert.equal(ledger.checks[1].closedAt, undefined);
  // (closed once: not again)
  assert.equal(closeChecks(ledger, new Set(['401:spread']), now), 0);
  // (locked: as it stood)
  const late = new Date(Date.parse(ledger.checks[1].start) - 10 * 60e3);
  assert.equal(closeChecks(ledger, new Set(['401:total']), late), 0);
  // (the gap back, the same numbers: opened again)
  assert.equal(upsertCheck(ledger, check(), now), 'updated');
  assert.equal(ledger.checks[0].closedAt, undefined);
  // (off the page, out of the hit rate, tallied apart)
  ledger.checks[0].closedAt = now.toISOString();
  ledger.checks[0].checkResult = { status: 'won', profit: 0.909 };
  ledger.checks[1].checkResult = { status: 'lost', profit: -1 };
  const s = checkSummary(ledger.checks);
  assert.deepEqual([s.n, s.won, s.lost, s.hitRate, s.closed.n, s.closed.won], [1, 0, 1, 0, 1, 1]);
});

test('checkTrim: a graded CHECK loses its context and its projection but the mean, TRIM_AFTER on; its result kept', () => {
  const graded = { ...check({ projection: { mean: 61.2, sd: 20, rate: 55 }, context: { weather: { wind: 3 } } }), checkResult: { status: 'won', profit: 0.909, gradedAt: now.toISOString() } };
  const open = check({ id: 'o', context: { weather: {} } });
  assert.equal(checkTrim([graded, open], new Date(now.getTime() + TRIM_AFTER - 1)), 0);
  assert.equal(checkTrim([graded, open], new Date(now.getTime() + TRIM_AFTER)), 1);
  assert.deepEqual([graded.context, graded.projection, graded.trimmed, graded.checkResult.status], [undefined, { mean: 61.2 }, true, 'won']);
  assert.ok(open.context);
  assert.equal(checkTrim([graded], new Date(now.getTime() + 2 * TRIM_AFTER)), 0);
});

test("readLedgers: the settler reads the CHECKs from their own file, or an older ledger's", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'checks-'));
  try {
    const dir = (s) => path.join(root, 'apps', s, 'src/StaticData/model');
    fs.mkdirSync(dir('nfl'), { recursive: true });
    fs.mkdirSync(dir('nba'), { recursive: true });
    fs.writeFileSync(path.join(dir('nfl'), 'ledger.json'), JSON.stringify({ bets: [bet()] }));
    fs.writeFileSync(path.join(dir('nfl'), 'checks.json'), JSON.stringify({ sport: 'nfl', checks: [check()] }));
    fs.writeFileSync(path.join(dir('nba'), 'ledger.json'), JSON.stringify({ bets: [], checks: [check({ sport: 'nba' })] }));
    const got = readLedgers(root);
    assert.deepEqual(got.nfl.map((b) => b.id), ['x', '401:spread']);
    assert.deepEqual(got.nba.map((b) => b.id), ['401:spread']);
    assert.deepEqual(got.nhl, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('markPlaced: a CHECK whose market was bet after all notes the bet, once', () => {
  const ledger = { bets: [bet({ id: '401:spread', placedAt: '2026-10-09T14:00:00Z', units: 2, intent: 'edge' })] };
  upsertCheck(ledger, check(), now);
  assert.equal(markPlaced(ledger), 1);
  assert.deepEqual(ledger.checks[0].bet, { at: '2026-10-09T14:00:00Z', side: 'home', line: -3, odds: -110, units: 2, intent: 'edge' });
  assert.equal(markPlaced(ledger), 0);
});

test('graded at a unit: a spread CHECK and a prop CHECK, what they would have done; void out of the hit rate', () => {
  const game = { awayAbbr: 'TB', homeAbbr: 'DAL', hs: 24, as: 20 };
  const g = checkResultOf(settle(atUnit(check()), game), '2026-10-11T00:00:00Z');
  assert.deepEqual(g, { status: 'won', profit: 0.909, final: 'TB 20 @ DAL 24', gradedAt: '2026-10-11T00:00:00Z' });
  const prop = check({ id: '401:prop:recYds:9', market: 'prop', propType: 'recYds', player: 'A B', statLabel: 'Receiving Yards', side: 'under', line: 50.5 });
  const p = checkResultOf(settleProp(atUnit(prop), 61), 'x');
  assert.deepEqual([p.status, p.profit, p.actual], ['lost', -1, 61]);
  const checks = [
    { ...check(), checkResult: g, note: keptNote(noteOf('401:spread', { reason: 'news', player: '12', status: 'out' })) },
    { ...prop, checkResult: p, note: keptNote(noteOf('p', { reason: 'market-wrong' })) },
    { ...check({ id: 'v' }), checkResult: { status: 'push', void: true, profit: 0 } },
    { ...check({ id: 'o' }) },
  ];
  const s = checkSummary(checks);
  assert.deepEqual([s.n, s.open, s.won, s.lost, s.push, s.hitRate, s.profit, s.noted], [4, 1, 1, 1, 0, 0.5, -0.09, 2]);
  assert.deepEqual(Object.keys(s.byReason), ['market-wrong', 'news']);
  assert.equal(s.byReason.news.won, 1);
  assert.equal(s.byMarket['prop:recYds'].lost, 1);
});

test("buildPicks: the CHECKs in their own list, never the picks (the page's rows); no units, the model's chance, not in the record, gone once bet or closed; a prop keeps its other side", () => {
  const ledger = {
    bets: [
      bet({ id: 'lock', model: 0.66, fair: 0.6, p: 0.627, ev: 0.197, intent: 'edge' }),
      bet({ id: 'love', market: 'total', side: 'over', pick: 'Over 47.5', model: 0.58, fair: 0.5123, p: 0.5427, ev: 0.036, intent: 'edge' }),
      bet({ id: 'prop', market: 'prop', propType: 'recYds', statLabel: 'Receiving Yards', player: 'A B', side: 'over', line: 50.5, otherOdds: -120, odds: -105, model: 0.55, fair: 0.49, p: 0.52, ev: 0.06, intent: 'edge' }),
      bet({ id: '402:spread', event: '402', placedAt: '2026-10-09T13:00:00Z' }),
    ],
    checks: [
      check({ id: '401:total', market: 'total', side: 'under', pick: 'Under 47.5', otherOdds: -110 }),
      check({ id: '401:ml', market: 'ml', model: 0.8, line: null, pick: 'DAL ML' }),
      // (bet after all: the bet shows, not the CHECK)
      check({ id: '402:spread', event: '402' }),
      // (graded, or on a game started: not shown)
      { ...check({ id: '403:spread', event: '403' }), checkResult: { status: 'won' } },
      check({ id: '404:spread', event: '404', start: '2026-10-09T11:00:00Z' }),
      // (closed: the gap gone since)
      { ...check({ id: '405:spread', event: '405' }), closedAt: now.toISOString() },
    ],
  };
  const out = buildPicks('nfl', ledger, { spread: { fitted: true } }, new Map(), now);
  const ids = out.picks.map((p) => `${p.level}:${p.id}`);
  assert.equal(ids[0], 'lock:lock');
  assert.equal(out.picks.filter((p) => p.level === 'check').length, 0);
  assert.ok(ids.includes(`${out.picks.find((p) => p.id === '402:spread').level}:402:spread`));
  // (the picks in their Kelly score order, as before the CHECKs)
  assert.deepEqual(out.picks.map((p) => p.score), out.picks.map((p) => p.score).sort((a, b) => b - a));
  // (the biggest model Kelly first)
  assert.deepEqual(out.checks.map((p) => `${p.level}:${p.id}`), ['check:401:ml', 'check:401:total']);
  const c = out.checks.find((p) => p.id === '401:ml');
  // (its chance the model's: past the gap the trusted chance is about the book's)
  assert.deepEqual([c.units, c.edge, c.gap, c.rank, c.chance, c.checkCause], [0, false, 0.3, 1, 80, 'gap']);
  assert.equal(c.modelKelly, modelKelly(-110, 0.8));
  assert.deepEqual(out.checkRule, { kelly: CHECK_KELLY });
  // (its write-up leads with the model's Kelly, then the chances, then why; the guard's words in checkReason)
  assert.match(c.reason, /Would be a \+58\.00 Kelly bet on the model's own number \(DAL 80% against DraftKings' no-vig 50%\)\. Not bet: a 30-point gap with nothing to explain it/);
  assert.match(c.reason, /The question: /);
  assert.match(c.risk, /more often been the model missing something than an edge/);
  assert.match(c.checkReason, /too far from the market/);
  assert.equal(out.picks.find((p) => p.id === 'prop').otherOdds, -120);
  assert.equal(out.picks.find((p) => p.id === 'love').otherOdds, null);
  // (never shown or published: the record is the bets')
  assert.ok(ledger.checks.every((x) => !x.shown && !x.published));
  assert.deepEqual(out.picks.map((p) => p.rank), out.picks.map((_, i) => i + 1));
});

test("the settler's price check: a prop's other side at its otherOdds, so a bet against the bot's is checked", () => {
  const obs = botObservations([{ market: 'prop', side: 'over', propType: 'recYds', athlete: 9, line: 50.5, odds: -105, otherOdds: -120, placedAt: '2026-10-09T20:00Z' }]);
  const play = { market: 'prop', side: 'under', propType: 'recYds', athlete: '9', line: 50.5, odds: -120, placedAt: '2026-10-10T10:00Z' };
  assert.ok(checkPrice(play, obs).ok);
  assert.equal(checkPrice({ ...play, odds: 110 }, obs).ok, false);
  // (no other side known: none observed)
  assert.equal(botObservations([{ market: 'prop', side: 'over', propType: 'recYds', athlete: 9, line: 50.5, odds: -105, placedAt: '2026-10-09T20:00Z' }]).length, 1);
  // (a CHECK written again at a new price: a bet at the price the page showed before still matches, either side)
  const moved = { market: 'prop', side: 'over', propType: 'recYds', athlete: 9, line: 54.5, odds: -125, otherOdds: 105, placedAt: '2026-10-10T12:00Z', earlier: [{ at: '2026-10-10T11:00Z', side: 'over', line: 54.5, odds: -110, otherOdds: -110 }] };
  const over = { market: 'prop', side: 'over', propType: 'recYds', athlete: '9', line: 54.5, odds: -110, placedAt: '2026-10-10T11:20Z' };
  assert.ok(checkPrice(over, botObservations([moved])).ok);
  assert.ok(checkPrice({ ...over, side: 'under' }, botObservations([moved])).ok);
  assert.equal(checkPrice(over, botObservations([{ ...moved, earlier: undefined }])).ok, false);
});

// ---------------------------------------------------------------------------
// The owner's notes
// ---------------------------------------------------------------------------

const DOC = (id, fields) => ({ name: `projects/p/databases/(default)/documents/deskNotes/${encodeURIComponent(id)}`, fields });
const json = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });

test("noteOf and fromValue: Firestore's REST values as plain data; a reason outside the list is other, a bad status none", () => {
  assert.deepEqual(fromValue({ mapValue: { fields: { a: { integerValue: '5' }, b: { timestampValue: '2026-10-09T12:00:00Z' }, c: { arrayValue: { values: [{ stringValue: 'x' }] } }, d: { nullValue: null } } } }), { a: 5, b: '2026-10-09T12:00:00Z', c: ['x'], d: null });
  const n = noteOf('401:spread', { reason: 'gossip', player: 3139477, status: 'gone', note: 'x'.repeat(600), by: 'u1', at: '2026-10-09T12:00:00Z' });
  assert.deepEqual([n.reason, n.player, n.status, n.note.length], ['other', '3139477', null, 500]);
  assert.equal(noteOf('a', { reason: 'news', player: 'abc' }).player, null);
});

test('readDeskNotes: none without credentials (quietly); the emulator, paged; a failure is none, with a short warning', async () => {
  const calls = [];
  const warn = [];
  const log = { warn: (m) => warn.push(m) };
  assert.equal(await readDeskNotes({ env: {}, fetchImpl: async () => assert.fail('asked'), log }), null);
  const pages = [
    json({ documents: [DOC('401:spread', { reason: { stringValue: 'news' }, player: { stringValue: '12' }, status: { stringValue: 'out' }, by: { stringValue: 'u1' }, at: { timestampValue: '2026-10-09T12:00:00Z' } })], nextPageToken: 't2' }),
    json({ documents: [DOC('402:prop:recYds:9', { reason: { stringValue: 'market-wrong' } })] }),
  ];
  const got = await readDeskNotes({
    env: { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8186', GCLOUD_PROJECT: 'demo-x' },
    fetchImpl: async (url, opts) => (calls.push([url, opts.headers.authorization]), pages.shift()),
    log,
  });
  assert.equal(got.size, 2);
  assert.deepEqual(got.get('401:spread'), { id: '401:spread', reason: 'news', player: '12', status: 'out', team: null, sport: null, note: null, by: 'u1', at: '2026-10-09T12:00:00Z' });
  assert.match(calls[0][0], /^http:\/\/127\.0\.0\.1:8186\/v1\/projects\/demo-x\/databases\/\(default\)\/documents\/deskNotes\?pageSize=300$/);
  assert.match(calls[1][0], /pageToken=t2$/);
  assert.equal(calls[0][1], 'Bearer owner');
  assert.equal(await readDeskNotes({ env: { FIRESTORE_EMULATOR_HOST: 'h:1' }, fetchImpl: async () => json({}, false, 500), log }), null);
  assert.equal(await readDeskNotes({ env: { FIREBASE_SERVICE_ACCOUNT: '{nope' }, fetchImpl: async () => assert.fail('asked'), log }), null);
  assert.equal(warn.length, 2);
  assert.ok(warn.every((m) => !/PRIVATE KEY/.test(m)));
});

test('readDeskNotes: the service account signs a token (RS256) and reads with it; its key never in a warning', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const account = { project_id: 'proj', client_email: 'bot@proj.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
  const seen = [];
  const fetchImpl = async (url, opts) => {
    seen.push(url);
    if (url === 'https://oauth2.googleapis.com/token') {
      const form = new URLSearchParams(opts.body);
      assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
      const [head, claims, sig] = form.get('assertion').split('.');
      assert.deepEqual(JSON.parse(Buffer.from(head, 'base64url')), { alg: 'RS256', typ: 'JWT' });
      assert.equal(JSON.parse(Buffer.from(claims, 'base64url')).iss, account.client_email);
      assert.ok(sig.length > 100);
      return json({ access_token: 'tok' });
    }
    assert.equal(opts.headers.authorization, 'Bearer tok');
    return json({ documents: [] });
  };
  const got = await readDeskNotes({ env: { FIREBASE_SERVICE_ACCOUNT: JSON.stringify(account) }, fetchImpl, log: { warn: assert.fail } });
  assert.equal(got.size, 0);
  assert.match(seen[1], /^https:\/\/firestore\.googleapis\.com\/v1\/projects\/proj\/databases\/\(default\)\/documents\/deskNotes/);
  // (the token refused: none, and the warning says only that)
  const warn = [];
  assert.equal(await readDeskNotes({ env: { FIREBASE_SERVICE_ACCOUNT: JSON.stringify(account) }, fetchImpl: async () => json({}, false, 401), log: { warn: (m) => warn.push(m) } }), null);
  assert.equal(warn.length, 1);
  assert.ok(!warn[0].includes('PRIVATE'));
});

test("applyNotes: a note's player out, questionable or active in his game's own copy of the report, flagged; his team found or the note left", async () => {
  const report = new Map([
    ['1', [{ id: '12', name: 'Q Back', pos: 'QB', status: 'Questionable' }]],
    ['2', []],
  ]);
  const live = new Map([
    ['401', { injuries: report }],
    ['402', { injuries: report }],
    ['403', { injuriesFailed: true }],
  ]);
  const upcoming = ['401', '402', '403'].map((id) => ({ game: { id, home: '1', away: '2' } }));
  const notes = new Map(
    [
      noteOf('401:spread', { reason: 'news', player: '12', status: 'out' }),
      noteOf('401:prop:recYds:9', { reason: 'role', player: '9', status: 'questionable' }),
      noteOf('402:total', { reason: 'news', player: '12', status: 'active' }),
      noteOf('402:ml', { reason: 'news', player: '77', status: 'out' }),
      noteOf('403:ml', { reason: 'news', player: '12', status: 'out' }),
      noteOf('401:ml', { reason: 'news', player: '12', status: 'out', sport: 'nba' }),
      noteOf('999:ml', { reason: 'news', player: '12', status: 'out' }),
      noteOf('401:total', { reason: 'weather' }),
    ].map((n) => [n.id, n]),
  );
  const checks = [{ id: '401:prop:recYds:9', athlete: '9', team: '2', player: 'W R' }];
  const applied = await applyNotes('nfl', live, upcoming, notes, { checks, rosterOf: async (t) => (t === '2' ? new Set(['77']) : null) });
  assert.deepEqual(
    applied.map((x) => `${x.id} ${x.team} ${x.name} ${x.status}`),
    ['401:spread 1 Q Back out', '401:prop:recYds:9 2 W R questionable', '402:total 1 Q Back active', '402:ml 2 athlete 77 out'],
  );
  // (the league's report untouched: each game its own copy)
  assert.equal(report.get('1')[0].status, 'Questionable');
  assert.deepEqual(live.get('401').injuries.get('1'), [{ id: '12', name: 'Q Back', pos: 'QB', status: 'Out', from: 'owner note' }]);
  assert.deepEqual(live.get('401').injuries.get('2'), [{ id: '9', name: 'W R', pos: '', status: 'Questionable', from: 'owner note' }]);
  assert.deepEqual(live.get('402').injuries.get('1'), []);
  assert.equal(live.get('403').injuries, undefined);
  assert.deepEqual(noteWords(live.get('401')), ['Owner note: Q Back out', 'Owner note: W R questionable']);
  // (MLB: no report of its own, the notes' alone; none, nothing)
  const mlb = new Map([['501', {}]]);
  const one = await applyNotes('mlb', mlb, [{ game: { id: '501', home: '5', away: '6' } }], new Map([['501:prop:k:3', noteOf('501:prop:k:3', { reason: 'news', player: '3', status: 'out', team: '5' })]]));
  assert.equal(one.length, 1);
  assert.equal(mlb.get('501').injuries.get('5')[0].status, 'Out');
  assert.deepEqual(await applyNotes('nfl', live, upcoming, null), []);
});

test("keptNote / publicNote: a CHECK keeps a note's reason, player, status, when and whether applied; never its words or its writer's uid", () => {
  const n = noteOf('401:spread', { reason: 'news', player: '12', status: 'out', note: 'my private words', by: 'uid-abc', at: '2026-10-09T12:00:00Z' });
  const kept = keptNote(n, true);
  assert.deepEqual(kept, { reason: 'news', player: '12', status: 'out', at: '2026-10-09T12:00:00Z', applied: true });
  assert.deepEqual(keptNote(n, false), { reason: 'news', player: '12', status: 'out', at: '2026-10-09T12:00:00Z' });
  assert.ok(Object.keys(kept).every((k) => PUBLIC_NOTE_KEYS.includes(k)));
  // (an older file's note, its words and writer on it: dropped)
  const old = { reason: 'market-wrong', player: null, status: null, note: 'words', by: 'uid', at: 'x', applied: true };
  assert.deepEqual(publicNote(old), { reason: 'market-wrong', player: null, status: null, at: 'x', applied: true });
  assert.equal(publicNote(null), null);
});

test("checkSummary: a closed CHECK's note still tallied by its reason (its own closed tally), out of the open ones'", () => {
  const g = { status: 'won', profit: 0.909 };
  const checks = [
    { ...check({ id: 'a' }), checkResult: g, note: keptNote(noteOf('a', { reason: 'news', player: '1', status: 'out' })) },
    { ...check({ id: 'b' }), closedAt: now.toISOString(), checkResult: { status: 'lost', profit: -1 }, note: keptNote(noteOf('b', { reason: 'news' })) },
    { ...check({ id: 'c' }), closedAt: now.toISOString(), checkResult: g, note: keptNote(noteOf('c', { reason: 'weather' })) },
  ];
  const s = checkSummary(checks);
  assert.deepEqual(Object.keys(s.byReason), ['news', 'weather']);
  assert.deepEqual([s.byReason.news.n, s.byReason.news.won, s.byReason.news.closed.n, s.byReason.news.closed.lost], [1, 1, 1, 1]);
  assert.deepEqual([s.byReason.weather.n, s.byReason.weather.closed.n, s.byReason.weather.closed.won], [0, 1, 1]);
  assert.deepEqual([s.n, s.noted, s.closed.n, s.closed.noted], [1, 1, 2, 2]);
});

test('readDeskNotes: every page read (past the old 5-page stop), a repeated token ends it', async () => {
  let i = 0;
  const fetchImpl = async () => {
    i++;
    return json({ documents: [DOC(`40${i}:spread`, { reason: { stringValue: 'news' } })], ...(i < 9 ? { nextPageToken: `t${i}` } : {}) });
  };
  const got = await readDeskNotes({ env: { FIRESTORE_EMULATOR_HOST: 'h:1' }, fetchImpl, log: { warn: assert.fail } });
  assert.equal(got.size, 9);
  assert.ok(MAX_PAGES >= 100);
  let j = 0;
  const loop = await readDeskNotes({ env: { FIRESTORE_EMULATOR_HOST: 'h:1' }, fetchImpl: async () => (j++, json({ documents: [DOC(`5${j}:ml`, {})], nextPageToken: 'same' })), log: { warn: assert.fail } });
  assert.deepEqual([j, loop.size], [2, 2]);
});

test("readChecks: a corrupt checks.json falls back (the ledger's own, or none), warned of once and flagged so it's never written over; a readable one's notes made public", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'checks-read-'));
  const warn = console.warn;
  const said = [];
  console.warn = (m) => said.push(m);
  try {
    const file = path.join(root, 'checks.json');
    const r = { sport: 'nfl', files: { checks: file } };
    assert.deepEqual(readChecks(r, null), []);
    assert.equal(r.checksUnreadable, undefined);
    fs.writeFileSync(file, '{"sport":"nfl","checks":[{"id":');
    assert.deepEqual(readChecks(r, { checks: [check()] }).map((c) => c.id), ['401:spread']);
    assert.deepEqual(readChecks(r, {}), []);
    assert.equal(r.checksUnreadable, true);
    assert.equal(said.length, 1);
    assert.match(said[0], /checks.json unreadable/);
    const r2 = { sport: 'nfl', files: { checks: file } };
    fs.writeFileSync(file, JSON.stringify({ sport: 'nfl', checks: 'nope' }));
    assert.deepEqual(readChecks(r2, {}), []);
    assert.equal(r2.checksUnreadable, true);
    const r3 = { sport: 'nfl', files: { checks: file } };
    fs.writeFileSync(file, JSON.stringify({ sport: 'nfl', checks: [{ ...check(), note: { reason: 'news', player: '1', status: 'out', note: 'words', by: 'uid', at: 'x' } }, null] }));
    const got = readChecks(r3, {});
    assert.deepEqual(got.map((c) => c.note), [{ reason: 'news', player: '1', status: 'out', at: 'x' }]);
    assert.equal(r3.checksUnreadable, undefined);
  } finally {
    console.warn = warn;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("ledgerWrites: a readable file gets the CHECKs, their notes public (no note's words or writer's uid anywhere in either file); an unreadable one is never written, the ledger's own list kept on it", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'checks-write-'));
  const warn = console.warn;
  console.warn = () => {};
  try {
    const file = path.join(root, 'checks.json');
    const WORDS = 'Starter hurt his hamstring in practice';
    const UID = 'uid-owner-0001';
    const noted = () => ({ ...check(), note: { reason: 'injury', player: '1', status: 'out', note: WORDS, text: WORDS, by: UID, uid: UID, at: 'x', applied: true } });
    const r = { sport: 'nfl', now, files: { checks: file } };
    const out = ledgerWrites(r, { sport: 'nfl', bets: [bet()], checks: [noted()] });
    assert.equal(out.ledger.checks, undefined);
    assert.deepEqual(out.checks.checks.map((c) => c.id), ['401:spread']);
    // (every string anywhere in what's written: never the note's words or its writer)
    const strings = [];
    const walk = (x) => (typeof x === 'string' ? strings.push(x) : x && typeof x === 'object' && Object.values(x).forEach(walk));
    walk(out);
    assert.ok(!strings.some((x) => x.includes(WORDS) || x.includes(UID)));
    // (the written file read back: the same)
    fs.writeFileSync(file, JSON.stringify(out.checks));
    assert.ok(!fs.readFileSync(file, 'utf8').includes(UID));
    assert.deepEqual(readChecks({ sport: 'nfl', files: { checks: file } }, {}).map((c) => c.id), ['401:spread']);
    // (unreadable: checks.json not written, an older ledger's own list kept on the ledger, notes public)
    fs.writeFileSync(file, '{"sport":"nfl","checks":[');
    const r2 = { sport: 'nfl', now, files: { checks: file } };
    const old = { sport: 'nfl', bets: [bet()], checks: [noted()] };
    old.checks = readChecks(r2, old);
    const out2 = ledgerWrites(r2, old);
    assert.equal(out2.checks, null);
    assert.deepEqual(out2.ledger.checks.map((c) => c.id), ['401:spread']);
    assert.ok(!JSON.stringify(out2).includes(UID) && !JSON.stringify(out2).includes(WORDS));
    // (and with no list of its own: the ledger as it was, no checks key)
    const out3 = ledgerWrites(r2, { sport: 'nfl', bets: [], checks: [] });
    assert.deepEqual([out3.checks, 'checks' in out3.ledger], [null, false]);
  } finally {
    console.warn = warn;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("buildPicks keepChecks (checks.json unreadable): no write-up but a finished bet's pruned, so the CHECKs' write-ups survive till the file's mended", () => {
  const ledger = { bets: [bet({ id: '500:spread', event: '500', status: 'won' }), bet({ id: '501:spread', event: '501' })], checks: [] };
  const items = () => ({ '500:spread': { a: 1 }, '501:spread': { a: 1 }, '401:ml': { a: 1 }, '402:prop:pts:1': { a: 1 } });
  const kept = { items: items() };
  buildPicks('nfl', ledger, { spread: { fitted: true } }, new Map(), now, { writeups: kept, keepChecks: true });
  assert.deepEqual(['500:spread', '501:spread', '401:ml', '402:prop:pts:1'].map((id) => id in kept.items), [false, true, true, true]);
  const pruned = { items: items() };
  buildPicks('nfl', ledger, { spread: { fitted: true } }, new Map(), now, { writeups: pruned });
  assert.deepEqual(['500:spread', '501:spread', '401:ml', '402:prop:pts:1'].map((id) => id in pruned.items), [false, true, false, false]);
});

test("the public model files hold no owner's note words or writer: every note on a CHECK publicNote's fields alone", () => {
  const apps = path.resolve(import.meta.dirname, '../apps');
  for (const sport of fs.readdirSync(apps)) {
    const dir = path.join(apps, sport, 'src/StaticData/model');
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const walk = (x) => {
        if (!x || typeof x !== 'object') return;
        if (!Array.isArray(x) && x.note && typeof x.note === 'object' && !Array.isArray(x.note)) {
          for (const k of Object.keys(x.note)) assert.ok(PUBLIC_NOTE_KEYS.includes(k), `${sport}/${name}: a note's ${k}`);
        }
        for (const v of Object.values(x)) walk(v);
      };
      walk(JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
    }
  }
});
