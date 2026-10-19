// No look-ahead in the Bot's replayed history, by timestamp (DECISIONS.md D48; the forum audit: the daily sports'
// clean opens were priced with that game's day-of context, the lineups, goalies, probables and inactives an opening
// line predates, and beat the close 85 to 95% on LOVE and LOCK). Pinned: every replayed bet's price read only facts
// dated at or before its placement (the replay's own check, lateFacts, and the shipped files' count, flags.facts.late,
// 0 in every sport); an open whose price read a later fact falls to the close, a close that read one isn't bet; the
// day-of terms are known only so long before the start (context.mjs DAY_OF_TERMS, DAY_OF_LEAD) and read at what was
// known before (the NBA's prior game's absentees, the NHL's last starter, none for the rest); the ratings replay prices
// a game as of a moment from the finals over by then alone (ratings.mjs replay's asOf, featsAt), without touching its
// own run; MMA's early opens read the fit standing at the open and the fighters' bouts before it (gate-mma.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as desk from '../libs/ranker/scripts/model/desk.mjs';
import * as picks from '../libs/ranker/scripts/model/picks.mjs';
import * as leagues from '../libs/ranker/scripts/model/leagues.mjs';
import * as lineupRisk from '../libs/ranker/scripts/model/lineup-risk.mjs';
import { knownAt, lateFacts, replayRecord } from '../libs/ranker/scripts/model/replay-record.mjs';
import { DAY_OF_LEAD, DAY_OF_TERMS, dayOfFacts, dayOfKnownAt, dayOfMinLead, featurize } from '../libs/ranker/scripts/model/context.mjs';
import { featsAt, replay } from '../libs/ranker/scripts/model/ratings.mjs';
import { walkTrust } from '../libs/ranker/scripts/model/gate-history.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const V = { desk, picks, leagues, lineupRisk: { ...lineupRisk, survivalAt: () => 1 } };
const H = 36e5;
const DAY = 864e5;
const T0 = Date.parse('2025-01-10T00:00:00Z');
const names = () => ({ home: 'HOME', away: 'AWAY', matchup: 'AWAY @ HOME' });
// (the fact kinds the replay must never read early: the starters' (the NFL's quarterbacks and line, MLB's probables),
// the inactives, the goalies, the lineups, the weather at the start, the crew)
const KINDS = ['inactives', 'goalies', 'probables', 'lineups', 'starters', 'weather', 'officials'];

// (a game line at the open (lead hours out) and the close (a minute out); factsAt per row)
function lineRows(i, { p = 0.6, f = 0.5, y = 1, lead = 10, openFacts = null, closeFacts = null } = {}) {
  const t = T0 + i * DAY;
  const key = `h:g${i}:spread`;
  const row = (kind, at, factsAt) => ({ id: `${key}:${kind}`, key, event: `g${i}`, sport: 'nba', market: 'spread', stat: 'spread', kind, line: -3.5, t, at, factsAt, season: 2025, f, p, y, overOdds: -110, underOdds: -110 });
  return { open: row('o', t - lead * H, openFacts), close: row('c', t - 60e3, closeFacts) };
}
const split = (list) => ({ open: list.map((r) => r.open), close: list.map((r) => r.close) });
// (the lineup risk always survives in these: so the open is bet wherever it may be)
const R = (rows) => replayRecord(V, 'nba', split(rows), { names, epoch: '2026-10-19T00:00:00Z', now: T0 + 400 * DAY });

test('the timestamp check: a bet whose price read a fact dated after its placement is caught', () => {
  assert.equal(lateFacts([{ at: 10, factsAt: 9 }, { at: 10, factsAt: 10 }, { at: 10, factsAt: null }]).length, 0);
  assert.equal(lateFacts([{ at: 10, factsAt: 11 }]).length, 1);
  assert.equal(lateFacts([{ at: null, factsAt: 11 }]).length, 1, 'a stamped row with no snapshot time is never known');
  assert.ok(knownAt({ at: 5, factsAt: null }));
  assert.ok(!knownAt({ at: 5, factsAt: 6 }));
});

test('replay: an open whose price read a later fact falls to the close; a close that read one is neither bet nor picked; no replayed bet ever reads a fact after its placement', () => {
  const rows = [];
  // (0-9: an open priced as of its own snapshot (facts the night before): bet at the open)
  for (let i = 0; i < 10; i++) rows.push(lineRows(i, { openFacts: T0 + i * DAY - 20 * H, closeFacts: T0 + i * DAY - 30 * 60e3 }));
  // (10-19: an open whose price read the day-of facts (half an hour before the start): held to the close)
  for (let i = 10; i < 20; i++) rows.push(lineRows(i, { openFacts: T0 + i * DAY - 30 * 60e3, closeFacts: T0 + i * DAY - 30 * 60e3 }));
  // (20-24: both read a fact after the start: never bet, never a practice pick)
  for (let i = 20; i < 25; i++) rows.push(lineRows(i, { openFacts: T0 + i * DAY + H, closeFacts: T0 + i * DAY + H }));
  const r = R(rows);
  assert.equal(r.flags.facts.late, 0, 'no replayed bet read a fact after its placement');
  assert.equal(r.flags.facts.openHeld, 15);
  assert.equal(r.flags.facts.closeHeld, 5);
  assert.equal(r.flags.timing.open, 10);
  assert.equal(r.flags.timing.close, 10);
  assert.equal(r.n.bets + r.n.practice, 20, 'the five games with only late facts are never bet or picked');
  for (const b of r.last) {
    assert.ok(b.factsAt === null || Date.parse(b.factsAt) <= Date.parse(b.at), `${b.id}: its facts by its placement`);
    if (Number(b.id.match(/g(\d+)/)[1]) >= 10) assert.equal(b.timing, 'close', `${b.id}: the day-of facts read at the close only`);
  }
  // (the stamps are what the check reads: a row priced with the day-of facts but stamped as if not is the bug the
  // test exists to catch; here the planted bug, an open stamped after itself, is never bet at the open)
  const bug = R([lineRows(0, { openFacts: T0 - 9 * H })]);
  assert.equal(bug.flags.timing.open, 0);
  assert.equal(bug.flags.facts.late, 0);
});

test('the day-of terms: every sport names its day-of facts, known only so long before the start, the props reading the latest of them', () => {
  for (const sport of ['nfl', 'nba', 'nhl', 'mlb']) {
    const facts = new Set(Object.values(DAY_OF_TERMS[sport]).flat());
    for (const f of facts) assert.ok(KINDS.includes(f) && DAY_OF_LEAD[f] > 0, `${sport} ${f}`);
    assert.equal(dayOfMinLead(sport), Math.min(...[...facts].map((f) => DAY_OF_LEAD[f])));
  }
  assert.deepEqual(dayOfFacts('nba', 'out'), ['inactives']);
  assert.deepEqual(dayOfFacts('nhl', 'goalie'), ['goalies']);
  assert.deepEqual(dayOfFacts('mlb', 'pitcher'), ['probables']);
  assert.deepEqual(dayOfFacts('mlb', 'parkL:31'), ['lineups', 'probables']);
  assert.deepEqual(dayOfFacts('mlb', 'park:31'), [], "a park's own total is the schedule's");
  assert.deepEqual(dayOfFacts('nba', 'rest'), []);
  assert.deepEqual(dayOfFacts('mlb', 'temp'), ['weather']);
  assert.deepEqual(dayOfFacts('nba', 'refTotal'), ['officials']);
  // (a term needing two facts is known when the later-posted one is)
  assert.equal(dayOfKnownAt(['lineups', 'officials'], T0), T0 - 1 * H);
  assert.equal(dayOfKnownAt([], T0), null);
});

// (an NBA season: A and B play every other day; A's star (30 production) sits game 3 and plays game 4)
function nbaHistory() {
  const games = [];
  const box = {};
  const star = ['s', 36, 30];
  const mate = (id) => [id, 30, 15];
  for (let i = 0; i < 6; i++) {
    const id = `n${i}`;
    games.push({ id, date: new Date(T0 + i * 2 * DAY).toISOString(), season: 2025, type: 2, home: 'A', away: 'B', homeAbbr: 'A', awayAbbr: 'B', neutral: false, final: true, hs: 100, as: 98 });
    box[id] = { h: i === 3 ? [mate('a1'), mate('a2')] : [star, mate('a1'), mate('a2')], a: [mate('b1'), mate('b2')] };
  }
  return { games, facts: { games: box } };
}
const cfg = { context: { restCap: 4 } };

test("featurize: the NBA's missing production is a day-of fact, known half an hour before the tip; before it, the prior game's absentees", () => {
  const { games, facts } = nbaHistory();
  const { terms, feats } = featurize('nba', cfg, games, facts, new Map());
  // (outT: the production missing on both sides, to the total)
  const iOut = terms.t.findIndex((t) => t.key === 'outT');
  const out = (id) => feats.get(id).t[iOut];
  const early = (id) => (feats.get(id).dayOf.t.find((x) => x[0] === iOut) ?? [iOut, out(id)])[1];
  // (game 3: he sits; known only at the inactives; before them, his prior game says he played: 0 out)
  assert.ok(out('n3') > 0, 'the box: the star out');
  assert.equal(early('n3'), 0, 'before the inactives: he played the game before');
  const known = feats.get('n3').dayOf.t.find((x) => x[0] === iOut)[2];
  assert.equal(known, Date.parse(games[3].date) - DAY_OF_LEAD.inactives * H);
  // (game 4: he plays; before the inactives, the prior game says he sat)
  assert.equal(out('n4'), 0);
  assert.ok(early('n4') > 0, "the prior game's absentee read as out before the inactives");
  // (featsAt: before the inactives the early value, after them the box's)
  const f3 = feats.get('n3');
  assert.equal(featsAt(f3, known - 1).t[iOut], 0);
  assert.equal(featsAt(f3, known - 1).factsAt, null);
  assert.equal(featsAt(f3, known).t[iOut], out('n3'));
  assert.equal(featsAt(f3, known).factsAt, known);
});

test('ratings replay asOf: a game priced as of a moment reads only the finals over by then and the terms known then, and leaves the replay itself untouched', () => {
  const { games, facts } = nbaHistory();
  // (a third team's game ends between the open and the game: its result moves the league's scoring, never the open)
  games.push({ id: 'x', date: new Date(T0 + 5 * 2 * DAY - 10 * H).toISOString(), season: 2025, type: 2, home: 'C', away: 'D', homeAbbr: 'C', awayAbbr: 'D', neutral: false, final: true, hs: 150, as: 140 });
  facts.games.x = { h: [['c1', 30, 15]], a: [['d1', 30, 15]] };
  games.sort((a, b) => a.date.localeCompare(b.date));
  const { terms, feats } = featurize('nba', cfg, games, facts, new Map());
  const ctx = { feats, terms, scale: { m: terms.m.map(() => 1), t: terms.t.map(() => 1) }, lambda: 1, off: new Set() };
  const params = { sigma: 12, sigmaT: 18, hfa: 2, k: 0.1, kO: 0.05, revert: 0.7, avg: 110 };
  const g5 = games.find((g) => g.id === 'n5');
  const t5 = Date.parse(g5.date);
  const plain = new Map();
  replay(games, params, 0, ctx, (g, e) => plain.set(g.id, e));
  const seen = new Map();
  const again = new Map();
  replay(games, params, 0, ctx, (g, e) => again.set(g.id, e), { at: new Map([['n5', [t5 - 20 * H, t5 - 60e3]]]), gameHours: 4, on: (g, at, e) => seen.set(at, e) });
  assert.deepEqual([...again], [...plain], "the replay's own expectations are untouched by the asks");
  const open = seen.get(t5 - 20 * H);
  const close = seen.get(t5 - 60e3);
  assert.ok(open && close);
  // (the open: before game x was over, so x's result isn't in it; the close: x is in, as the replay's own)
  assert.ok(open.factsAt < t5 - 20 * H, `the open's facts by its time (${open.factsAt})`);
  assert.ok(close.factsAt <= t5 - 60e3);
  assert.notEqual(open.total, close.total, "x's result moves the league's scoring between the two");
  assert.ok(Math.abs(close.total - plain.get('n5').total) < 1e-9, 'the close as the replay itself prices it');
});

test("walkTrust's at(k, t): the trust as of a moment reads only the rows of the months before it", () => {
  const rows = [];
  for (let i = 0; i < 40; i++) rows.push({ id: `r${i}`, market: 'spread', raw: 0.6, f: 0.5, y: i % 2, event: `e${i}`, t: Date.parse('2025-01-01T00:00:00Z') + i * DAY });
  const calls = [];
  const fitTrust = (list) => (calls.push(list.length), { trust: list.length / 100 });
  const tr = walkTrust(rows, () => 'spread', fitTrust, () => 0.5);
  // (a moment in February: January's 31 rows; one in January: none, the start)
  assert.equal(tr.at('spread', Date.parse('2025-02-03T00:00:00Z')), 0.31);
  assert.equal(tr.at('spread', Date.parse('2025-01-20T00:00:00Z')), 0.5);
});

test('the shipped replayed records: every sport stamped, no bet past its placement', () => {
  for (const sport of ['nfl', 'nba', 'nhl', 'mlb', 'mma']) {
    const file = path.join(ROOT, 'apps', sport, 'src/StaticData/model/replay-record.json');
    if (!existsSync(file)) continue;
    const r = JSON.parse(readFileSync(file, 'utf8'));
    assert.ok(r.flags?.facts, `${sport}: the file carries the timestamp check (gate.mjs --record)`);
    assert.equal(r.flags.facts.late, 0, `${sport}: no replayed bet read a fact after its placement`);
    if (sport !== 'nfl') assert.ok(r.flags.facts.stamped > 0, `${sport}: the bets are stamped`);
    for (const b of r.last) assert.ok(b.factsAt === null || Date.parse(b.factsAt) <= Date.parse(b.at), `${sport} ${b.id}: its facts by its placement`);
  }
});

test("the Book's own prices: Pinnacle's open is its own first sighting, so it is the fair only where it was seen by DraftKings' snapshot; a moneyline reads the spread's frame only where the spread was posted by then", async () => {
  const { historyLineBets } = await import('../libs/ranker/scripts/model/gate-history.mjs');
  const start = '2025-01-10T00:00:00Z';
  const events = new Map([['o1', { oid: 'o1', id: '1', t: start }], ['o2', { oid: 'o2', id: '2', t: start }]]);
  const games = [{ id: '1', final: true, hs: 100, as: 90, season: 2025 }, { id: '2', final: true, hs: 100, as: 90, season: 2025 }];
  const at = (h) => new Date(Date.parse(start) - h * H).toISOString();
  const L = (oid, book, market, ts, line, a, b) => ({ oid, kind: 'o', ts, book, market, line, a, b });
  const lines = [
    // (game 1: Pinnacle first seen 10 hours after DraftKings' open, its price moved: not the fair at DraftKings' open)
    L('o1', 'dk', 'h2h', at(20), null, -150, 130), L('o1', 'dk', 'spreads', at(20), -3.5, -110, -110),
    L('o1', 'pin', 'h2h', at(10), null, -200, 180), L('o1', 'pin', 'spreads', at(10), -3.5, -130, 115),
    // (game 2: Pinnacle seen at the same snapshot: the fair; the spread first posted after the moneyline)
    L('o2', 'dk', 'h2h', at(20), null, -150, 130), L('o2', 'dk', 'spreads', at(15), -3.5, -110, -110),
    L('o2', 'pin', 'h2h', at(20), null, -160, 145),
  ];
  const bets = historyLineBets(events, lines, games);
  const one = (g, m) => bets.find((b) => b.event === g && b.market === m);
  const dkFair = (a, b) => (a < 0 ? -a / (-a + 100) : 100 / (a + 100)) / ((a < 0 ? -a / (-a + 100) : 100 / (a + 100)) + (b < 0 ? -b / (-b + 100) : 100 / (b + 100)));
  assert.ok(Math.abs(one('1', 'ml').fair - dkFair(-150, 130)) < 1e-9, "game 1: DraftKings' own no-vig, Pinnacle not yet seen");
  assert.ok(Math.abs(one('1', 'spread').fair - 0.5) < 1e-9);
  assert.ok(Math.abs(one('2', 'ml').fair - dkFair(-160, 145)) < 1e-9, "game 2: Pinnacle's, seen by then");
  assert.equal(one('2', 'ml').spreadHome, false, "game 2's moneyline: the spread wasn't posted at its snapshot");
  assert.ok(one('1', 'ml').spreadHome && one('1', 'ml').spreadHome.line === -3.5);
});
