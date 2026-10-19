// The markets tracked, not bet (2026-10-13, the owner's: every bet the bot places is a LIKE or better; a market
// with no edge, the old action bet, is tracked instead: libs/ranker/scripts/model/desk.mjs TRACK). A tracked row
// stakes nothing and is never in the record, the caps, the picks or the board's marks, but everything that
// learns reads it exactly as it read the action bet it replaces: the trust fit, the self-check. And the site's
// Algorithm desk keeps it out of the bets, in its own Tracked panel at a unit each.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';
import { capGame, fitTrust, isTracked, learnView, makeRoom, oneSide, outcomeOf, placement, record, trackedRecord } from '../libs/ranker/scripts/model/desk.mjs';
import { buildPicks, level, levelOf } from '../libs/ranker/scripts/model/picks.mjs';
import { canon, selfCheck } from '../libs/ranker/scripts/model/selfcheck.mjs';
import { MODEL_EPOCH } from '../libs/ranker/scripts/model/leagues.mjs';

const desk = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'book-entry.ts'), data: {} });

const now = new Date('2026-10-12T13:00:00Z');
const H = 36e5;
const at = (hoursAgo) => new Date(now.getTime() - hoursAgo * H).toISOString();

// (a graded NHL prop, edge or action, its result from won; the action bet's stake 0.5, as the desk placed them)
let seq = 0;
function row(over = {}, won = true) {
  const n = ++seq;
  const action = over.intent === 'action';
  const units = action ? 0.5 : 1;
  const odds = over.odds ?? (n % 3 ? -110 : 120);
  return {
    id: `401${n % 7}:prop:pts:${n}`,
    event: `401${n % 7}`,
    sport: 'nhl',
    start: at(50),
    placedAt: at(60),
    gradedAt: at(46),
    matchup: 'SJ @ EDM',
    market: 'prop',
    propType: 'pts',
    statLabel: 'Points',
    player: `Player ${n}`,
    athlete: String(n),
    team: '25',
    side: n % 2 ? 'over' : 'under',
    line: 0.5,
    odds,
    model: action ? 0.5 : 0.6 + (n % 5) / 100,
    fair: 0.5,
    p: action ? 0.5 : 0.55,
    ev: action ? -0.045 : 0.05,
    units,
    intent: 'edge',
    pricesFrom: 'the odds api',
    projection: { mean: 0.8, role: 'C1', applied: { scale: 1 } },
    actual: won ? 1 : 0,
    status: won ? 'won' : 'lost',
    ...outcomeOf({ units, odds }, won ? 1 : -1),
    pick: `Player ${n} Over 0.5 Points`,
    weight: 1,
    clv: { q: 0.5 + (n % 4) / 100, beat: n % 2 === 0, prob: 0.01, ev: 0.01, pts: null },
    ...over,
  };
}
// (the same row as the desk now keeps it: tracked, units 0, nothing won or lost, its action stake kept)
const asTracked = (b) => (b.intent === 'action' ? { ...b, intent: 'track', units: 0, profit: 0, trackUnits: b.units } : b);

test('placement: an edge bet at its stake; anything else tracked, units 0, its stake kept as trackUnits', () => {
  assert.deepEqual(placement(true, 1.5), { intent: 'edge', units: 1.5 });
  assert.deepEqual(placement(false, 0.5), { intent: 'track', units: 0, trackUnits: 0.5 });
  assert.equal(isTracked({ intent: 'track' }), true);
  assert.equal(isTracked({ intent: 'action' }), false);
});

test('learnView reads a tracked row as the action bet it was: intent action, its stake, its profit at it', () => {
  for (const won of [true, false]) {
    for (const odds of [-110, 135, -250]) {
      const action = row({ intent: 'action', odds }, won);
      const { trackUnits, ...seen } = learnView(asTracked(action));
      assert.equal(trackUnits, 0.5);
      assert.deepEqual(seen, action);
    }
  }
  const push = asTracked(row({ intent: 'action', status: 'push', profit: 0 }));
  assert.equal(learnView(push).profit, 0);
  const edge = row();
  assert.equal(learnView(edge), edge, 'a bet as it is');
});

test('the record is the bets alone; the tracked rows have their own, a unit each', () => {
  const bets = [row({}, true), row({}, false), asTracked(row({ intent: 'action', odds: -110 }, true)), asTracked(row({ intent: 'action', odds: 150 }, false)), asTracked(row({ intent: 'action', odds: 120 }, true))];
  const r = record(bets);
  assert.equal(r.bets, 2);
  assert.equal(r.staked, 2);
  const t = trackedRecord(bets);
  assert.deepEqual([t.won, t.lost, t.staked], [2, 1, 3]);
  assert.equal(t.profit, Math.round((100 / 110 + 1.2 - 1) * 100) / 100);
});

test('the trust fit over a ledger whose action bets became tracked rows comes out the same', () => {
  const ledger = [...Array.from({ length: 30 }, (_, i) => row({}, i % 3 !== 0)), ...Array.from({ length: 30 }, (_, i) => row({ intent: 'action' }, i % 2 === 0))];
  const tracked = ledger.map(asTracked);
  assert.equal(tracked.filter(isTracked).length, 30);
  const before = fitTrust(ledger, 0.5);
  assert.equal(before.fitted, true);
  assert.deepEqual(fitTrust(tracked, 0.5), before);
});

test('the self-check over a ledger whose action bets became tracked rows comes out the same', () => {
  const ledger = [...Array.from({ length: 24 }, (_, i) => row({}, i % 3 !== 0)), ...Array.from({ length: 24 }, (_, i) => row({ intent: 'action' }, i % 2 === 0))];
  const run = (bets) => canon(selfCheck({ sport: 'nhl', now, ledger: { bets }, state: {}, snaps: [] }));
  assert.deepEqual(run(ledger.map(asTracked)), run(ledger));
});

test('capGame: a tracked row stakes nothing, always kept, outside the cap; makeRoom never takes one back', () => {
  const edge = (units, ev) => ({ units, ev, intent: 'edge', market: 'spread' });
  const tracked = { units: 0, ev: -0.02, intent: 'track', trackUnits: 0.5, market: 'total' };
  const res = capGame([edge(3, 0.05), edge(2, 0.03), tracked], 0, 5);
  assert.deepEqual(res.kept.map((b) => b.units), [3, 2, 0]);
  assert.deepEqual(res.dropped, []);
  // (a game over its cap already: the bets dropped, the tracked row kept)
  const full = capGame([edge(1, 0.02), tracked], 5, 5);
  assert.deepEqual(full.kept, [tracked]);
  assert.equal(full.dropped.length, 1);
  const open = [{ id: 'a', units: 0, ev: -0.1, intent: 'track', market: 'prop' }, { id: 'b', units: 0.5, ev: -0.1, intent: 'action', market: 'prop' }];
  assert.deepEqual(makeRoom(open, 5, 5).map((b) => b.id), ['b']);
});

test('oneSide: an edge bet keeps its side over one that would be tracked, whatever the returns', () => {
  const pick = (side, ev) => ({ side, ev, other: { side: side === 'home' ? 'away' : 'home', ev: -0.01 } });
  const picks = [
    { market: 'spread', id: 's', pick: pick('home', 0.02) },
    // (the better return, but a guard cut it: it would be tracked)
    { market: 'ml', id: 'm', pick: pick('home', 0.06), guard: { why: 'line moved' } },
  ];
  const out = oneSide(picks);
  assert.equal(out.find((x) => x.id === 's').drop, undefined);
  assert.ok(out.find((x) => x.id === 'm').drop);
});

test('picks: a tracked row is never a pick nor in the record; every pick a LIKE or better', () => {
  const future = '2026-10-14T17:00:00Z';
  const base = { sport: 'nfl', placedAt: '', matchup: 'TB @ DAL', market: 'spread', side: 'home', line: -3, pick: 'DAL -3', odds: -110, model: 0.55, fair: 0.5, status: 'open', profit: 0, event: 'e1' };
  const bets = [
    { ...base, id: 'small', start: future, p: 0.525, ev: 0.0023, units: 0.5, intent: 'edge' },
    { ...base, id: 'big', start: future, p: 0.56, ev: 0.069, units: 2, intent: 'edge' },
    { ...base, id: 'tracked', start: future, p: 0.5, ev: -0.045, units: 0, trackUnits: 0.5, intent: 'track', market: 'total' },
    { ...base, id: 'done', start: '2026-10-01T17:00:00Z', status: 'won', profit: 0.45, units: 0, intent: 'track', published: true, publishedLevel: 'low' },
  ];
  const out = buildPicks('nfl', { bets }, {}, new Map(), new Date('2026-10-12T12:00:00Z'), { replay: null });
  assert.deepEqual(out.picks.map((p) => p.id), ['big', 'small']);
  assert.deepEqual(out.picks.map((p) => p.level), ['lock', 'medium']);
  assert.equal(out.record.overall.wins, 0);
  assert.equal(bets[2].shown, undefined);
  // (the bands: LIKE any Kelly over 0, the same on the page)
  assert.equal(level(0.004), 'medium');
  assert.equal(levelOf({ intent: 'edge' }, 0.004), 'medium');
  assert.equal(desk.confidenceOf(0.004, 0.52, true), 'medium');
  // (an edge bet scored 0 or a hair under it by the rounding: a LIKE in both copies; further under, PASS)
  assert.equal(desk.confidenceOf(0, 0.52, true), 'medium');
  assert.equal(desk.confidenceOf(-0.0001, 0.52, true), 'medium');
  assert.equal(levelOf({ intent: 'edge' }, 0), 'medium');
  assert.equal(levelOf({ intent: 'edge' }, -0.0001), 'medium');
  assert.equal(desk.confidenceOf(-0.002, 0.52, true), 'low');
  assert.equal(levelOf({ intent: 'edge' }, -0.002), 'low');
  assert.equal(desk.confidenceOf(0, 0.52, undefined), 'low', 'no edge flag (an older file): by the score alone');
  assert.equal(desk.confidenceOf(0.03, 0.52, false), 'low');
  assert.equal(desk.BANDS.medium, 0);
});

test('the Algorithm desk: a tracked row at a unit for its own panel, as if bet', () => {
  const won = desk.atUnit({ intent: 'track', units: 0, profit: 0, odds: 150, status: 'won' });
  assert.deepEqual([won.units, won.profit], [1, 1.5]);
  assert.equal(desk.atUnit({ intent: 'track', units: 0, profit: 0, odds: -110, status: 'lost' }).profit, -1);
  assert.equal(desk.atUnit({ intent: 'track', units: 0, profit: 0, odds: -110, status: 'push', void: true }).profit, 0);
  assert.equal(desk.isTracked({ intent: 'track' }), true);
  assert.equal(desk.isTracked({ intent: 'edge' }), false);
});

test('MODEL_EPOCH moved for the tracked rows (the owner\'s rule: a major change starts the trust over)', () => {
  assert.ok(Date.parse(MODEL_EPOCH) >= Date.parse('2026-10-13T17:00:00Z'));
});
