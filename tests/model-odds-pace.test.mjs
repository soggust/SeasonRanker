// The Odds API's paced budget (libs/ranker/scripts/model/oddsapi.mjs; DECISIONS.md D55): the $30 plan's 20,000 credits
// a month never exceeded, whatever the API's balance says (the 5M plan's millions, a lost cache, credits spent
// elsewhere), the reserve kept, the cuts in order (the snapshot, then props, then lines), the props' asks by value
// (first, then news and owed, then late, then a refresh), the optional refreshes only while the month's projection is
// under its target; and the game lines bought only where ESPN's free DraftKings line moved, a game newly due or the
// quote gone stale (linesWant).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MONTHLY, RESERVE, TARGET, TIERS, budgetOf, linesWant, withMirror, projectedMonth, recordOn, refreshOn, spendable } from '../libs/ranker/scripts/model/oddsapi.mjs';

const DAY = 864e5;
const START = Date.parse('2026-11-19T04:00:00Z');

// (a month of desk runs every `every` minutes, each wanting what demand(t) says, every ask through spendable as the
// desk does, the API's balance after each call as given by apiRemaining)
function simulate({ every = 20, demand, apiStart = MONTHLY, lose = null, elsewhere = 0, days = 30 }) {
  let u = { cycleStart: null, remaining: null, used: null, calls: [], features: {} };
  let api = apiStart;
  let mirror = null;
  let spent = 0;
  const byDay = new Map();
  for (let t = START; t < START + days * DAY; t += every * 6e4) {
    // (a lost cache: the desk's usage file gone, the committed mirror still there)
    if (lose && t >= lose && !u.lost) u = { cycleStart: null, remaining: null, used: null, calls: [], features: {}, lost: true };
    // (credits spent outside the desk at the month's start, an owner's local pull: the API's balance shows them)
    if (t === START) api -= elsewhere;
    for (const [feature, cost, tier] of demand(t)) {
      const b = budgetOf(u, t, { mirror });
      if (!spendable(feature, cost, b, tier)) continue;
      api -= cost;
      spent += cost;
      // (as record does: the usage read with its mirror first)
      u = withMirror(u, mirror, t);
      recordOn(u, feature, cost, api, apiStart - api, new Date(t).toISOString());
      mirror = { cycleStart: u.cycleStart, cycle: structuredClone(u.cycle), remaining: u.remaining };
      const d = new Date(t).toISOString().slice(0, 10);
      byDay.set(d, (byDay.get(d) ?? 0) + cost);
    }
  }
  return { spent, byDay, u, api };
}

// (a greedy desk: every run wants a lines call of each sport, every NFL game's props, refreshes, the snapshot)
const greedy = (t) => {
  const sunday = new Date(t).getUTCDay() === 0;
  return [
    ['snapshot', 40, undefined],
    ...['nfl', 'nba', 'nhl', 'mlb', 'mma'].map(() => ['lines', 3, undefined]),
    ...Array.from({ length: sunday ? 14 : 3 }, () => ['props', 11, 'first']),
    ['props', 11, 'news'],
    ['props', 11, 'late'],
    ['props', 11, 'refresh'],
  ];
};

test('D55 a greedy month never spends past the $30 plan: under MONTHLY less the reserve, on the 20K balance and on the 5M one', () => {
  for (const apiStart of [MONTHLY, 5_000_000]) {
    const { spent } = simulate({ demand: greedy, apiStart });
    assert.ok(spent <= MONTHLY - RESERVE, `${apiStart}: spent ${spent}`);
    // (and it uses the month: at least 90% of it, the reserve aside)
    assert.ok(spent >= 0.9 * (MONTHLY - RESERVE), `${apiStart}: spent only ${spent}`);
  }
});

test('D55 paced: no day takes more than its burst of what was left, so the month never runs dry before its end', () => {
  const { byDay } = simulate({ demand: greedy, apiStart: 5_000_000 });
  const days = [...byDay.keys()].sort();
  // (the last week still spends: the pace saved credits for it)
  const lastWeek = days.slice(-7).reduce((s, d) => s + byDay.get(d), 0);
  assert.ok(lastWeek > 0.1 * (MONTHLY - RESERVE), `the last week ${lastWeek}`);
  assert.ok(Math.max(...byDay.values()) < 0.25 * MONTHLY, `the biggest day ${Math.max(...byDay.values())}`);
});

test('D55 a lost cache mid-month: the committed mirror carries the cycle, still under MONTHLY on the 5M balance', () => {
  const { spent } = simulate({ demand: greedy, apiStart: 5_000_000, lose: START + 12 * DAY });
  assert.ok(spent <= MONTHLY - RESERVE, `spent ${spent}`);
});

test('D55 credits spent elsewhere (the API balance lower than the desk counts): the balance binds, the reserve held', () => {
  const { spent, api } = simulate({ demand: greedy, apiStart: MONTHLY, elsewhere: 8000 });
  assert.ok(api >= RESERVE - 11, `the balance left ${api}`);
  assert.ok(spent <= MONTHLY - 8000 - RESERVE, `spent ${spent}`);
});

test('D55 the cuts: with little left the snapshot stops first, then the props, the lines last; the tiers by value', () => {
  // (the month's last day: its straight line (AHEAD_DAYS) allows the whole of it)
  const at = START + 29 * DAY;
  const u = { cycleStart: new Date(START).toISOString(), remaining: null, used: null, calls: [], features: {} };
  recordOn(u, 'props', 0, MONTHLY, 0, new Date(START).toISOString());
  // (left: 1,500 past the reserve on the last day: the snapshot's hold not met; props and lines still on)
  u.cycle.spent.props = MONTHLY - RESERVE - 1500;
  const b = budgetOf(u, at);
  assert.equal(spendable('snapshot', 10, b), false);
  assert.equal(spendable('props', 11, b, 'first'), true);
  assert.equal(spendable('lines', 3, b), true);
  // (nothing left past the reserve: nothing at all)
  u.cycle.spent.props = MONTHLY - RESERVE - 2;
  const z = budgetOf(u, at);
  for (const f of ['snapshot', 'props', 'lines', 'history']) assert.equal(spendable(f, 3, z, 'first'), false, f);
  // (the tiers: a share of the day's props allowance each, first the whole of it)
  assert.ok(TIERS.first > TIERS.news && TIERS.news >= TIERS.owed && TIERS.owed > TIERS.late && TIERS.late > TIERS.refresh);
  const day = budgetOf({ ...structuredClone(u), cycle: { start: u.cycle.start, spent: { props: 1000 } } }, at);
  const room = day.allowance.props;
  const at80 = { ...day, today: { ...day.today, props: Math.floor(room * 0.8) } };
  assert.equal(spendable('props', 11, at80, 'first'), true);
  assert.equal(spendable('props', 11, at80, 'refresh'), false);
});

test("D55 the month's projection reads the desk's own tally, never the 5M plan's used count; the refreshes only under the target", () => {
  const u = { cycleStart: new Date(START).toISOString(), remaining: 2_670_000, used: 2_330_000, calls: [], features: {} };
  recordOn(u, 'lines', 3, 2_670_000, 2_330_000, new Date(START + DAY).toISOString());
  u.cycle.spent.props = 3000;
  const b = budgetOf(u, START + 10 * DAY);
  const p = projectedMonth(b, START + 10 * DAY);
  assert.ok(p < MONTHLY, `projected ${p}`);
  assert.equal(b.remaining <= MONTHLY - 3003, true);
  assert.equal(refreshOn(b, START + 10 * DAY), true);
  u.cycle.spent.props = 9000;
  assert.equal(refreshOn(budgetOf(u, START + 10 * DAY), START + 10 * DAY), false, 'on pace past the target: no refreshes');
  assert.equal(TARGET, 0.95);
});

test('D55 the lines bought only where wanted: never quoted, ESPN moved since the quote, newly in the last chance, or stale', () => {
  const now = START + 5 * 36e5;
  const sig = { spread: -3, total: 44.5, ml: 0.6, sp: 0.5, ou: 0.5 };
  const q = { at: new Date(now - 30 * 6e4).toISOString(), espn: sig, phase: 'window' };
  assert.match(linesWant(null, sig, 'window', now), /never quoted/);
  assert.equal(linesWant(q, sig, 'window', now), null);
  // (the Odds API's decimal rounding a cent off ESPN's is not a move; half a point is)
  assert.equal(linesWant(q, { ...sig, ml: 0.602 }, 'window', now), null);
  assert.match(linesWant(q, { ...sig, spread: -3.5 }, 'window', now), /moved/);
  assert.match(linesWant(q, sig, 'last', now), /last chance/);
  assert.match(linesWant({ ...q, at: new Date(now - 4 * 36e5).toISOString() }, sig, 'window', now), /stale/);
  // (under the month's target the quote goes stale sooner)
  assert.match(linesWant({ ...q, at: new Date(now - 70 * 6e4).toISOString() }, sig, 'window', now, { refresh: true }), /stale/);
  assert.equal(linesWant({ ...q, at: new Date(now - 70 * 6e4).toISOString() }, sig, 'window', now, { refresh: false }), null);
});
