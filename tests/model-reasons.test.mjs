// The reason tiers (libs/ranker/scripts/model/reasons.mjs; DECISIONS.md D58): a bet's reasons from what the Bot knows
// at placement, each judged walk-forward on the picks settled before it (never one after: a planted future pins it),
// LIKE / LOVE / LOCK from the proven ones under the owner's Kelly floor, the tiers' own place, the stake caps, the
// live desk's read of the file and picks.mjs levelOf's band. Made-up picks, no files, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOVE_FLOOR, PLACE_MIN, R_MIN, TIER_UNITS, contextOf, fileOf, liveTier, placeTiers, placed, reasonText, reasonsFor, tierOf, tierUnits, verdictOf, walkReasons } from '../libs/ranker/scripts/model/reasons.mjs';
import { capOf, levelOf } from '../libs/ranker/scripts/model/picks.mjs';

const DAY = 864e5;
const T0 = Date.parse('2022-10-01T00:00:00Z');
// (a stream of NHL moneyline picks over three seasons: the ones carrying `good` win 60% at +100, the rest 48%)
function stream({ n = 1800, good = 'restedVsB2b', from = T0, winGood = 0.6, winRest = 0.48 } = {}) {
  const out = [];
  let s = 7;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < n; i++) {
    const t = from + i * DAY * 0.6;
    const has = i % 3 === 0;
    const win = rnd() < (has ? winGood : winRest);
    out.push({ t, season: 2023 + Math.floor((t - T0) / (365 * DAY)), market: 'ml', reasons: has ? [good, 'seg:ml:dog:late'] : ['seg:ml:fav:late'], profit: win ? 1 : -1, beat: null, kelly: 0.03 });
  }
  return out;
}

test('reasonsFor reads the schedule, the timing, the segment and a prop stat from the context alone', () => {
  const c = contextOf({ sport: 'nhl', market: 'ml', side: 'home', fS: 0.45, pS: 0.47, kelly: 0.025, odds: 130, early: true, pin: true, sched: { rest: [3, 1], b2b: [false, true] } });
  const ids = reasonsFor(c).map((r) => r.id);
  assert.ok(ids.includes('restedVsB2b'));
  assert.ok(ids.includes('rest2'));
  assert.ok(ids.includes('cleanOpen'));
  assert.ok(ids.includes('openGap'), 'DraftKings +130 (43.5%) under the sharp fair 45%: the gap');
  assert.ok(ids.includes('kelly2'));
  assert.ok(ids.includes('seg:ml:dog:early'));
  // (the other side of the same game: the back-to-back side, no rest reason)
  const away = reasonsFor(contextOf({ sport: 'nhl', market: 'ml', side: 'away', fS: 0.55, kelly: 0.01, odds: -120, sched: { rest: [3, 1], b2b: [false, true] } })).map((r) => r.id);
  assert.ok(!away.includes('restedVsB2b') && !away.includes('rest2') && !away.includes('cleanOpen'));
  // (no rest reason in a sport the patterns weren't found in; a prop's stat and side, its projection past the line)
  assert.ok(!reasonsFor(contextOf({ sport: 'mlb', market: 'ml', side: 'home', fS: 0.5, sched: { rest: [3, 1], b2b: [false, true] } })).some((r) => r.family === 'rest'));
  const prop = reasonsFor(contextOf({ sport: 'nba', market: 'prop', side: 'under', stat: 'points', fS: 0.5, kelly: 0.01, odds: -110, sdEdge: 1.2 })).map((r) => r.id);
  assert.deepEqual(prop.sort(), ['sd1', 'stat:points:under']);
});

test('a reason is proven only on a lead beyond noise over the rest of its market, in most seasons, and with its picks winning', () => {
  const picks = stream();
  const w = walkReasons(picks);
  const v = w.final.get('ml').get('restedVsB2b');
  assert.equal(v.on, true, v.why);
  assert.ok(v.lead > 0 && v.z >= 1.645 && v.seasons.of >= 2);
  // (a reason whose picks lose isn't proven however it compares)
  assert.equal(w.final.get('ml').get('seg:ml:fav:late').on, false);
  // (too few picks: never)
  const few = walkReasons(stream({ n: R_MIN }));
  assert.equal(few.final.get('ml').get('restedVsB2b').on, false);
});

test('the walk never reads a pick settled after the moment it judges (a planted future)', () => {
  // (the first two seasons the reason is a coin; from the third it wins every time)
  const picks = stream({ winGood: 0.48 }).map((p) => (p.season >= 2025 && p.reasons.includes('restedVsB2b') ? { ...p, profit: 1 } : p));
  const w = walkReasons(picks);
  const early = picks.find((p) => p.season === 2024);
  assert.notEqual(w.at(early.t, 'ml')?.get('restedVsB2b')?.on, true, 'the future wins are not read in 2024');
  assert.equal(w.final.get('ml').get('restedVsB2b').on, true);
  // (a moment before any pick: nothing proven)
  assert.equal(w.at(T0 - DAY, 'ml'), null);
});

test('tierOf: LOVE a proven reason, LOCK two families or one strong, never over the Kelly floor', () => {
  const verdicts = new Map([
    ['restedVsB2b', { on: true, n: 300, roi: 0.05 }],
    ['rest2', { on: true, n: 200, roi: 0.04 }],
    ['cleanOpen', { on: true, n: 500, roi: 0.03 }],
    ['kelly2', { on: false }],
    ['big', { on: true, strong: true, n: 400, roi: 0.12 }],
  ]);
  assert.equal(tierOf(['kelly2'], verdicts, 0.03).tier, 'medium');
  assert.equal(tierOf(['restedVsB2b'], verdicts, 0.03).tier, 'high');
  // (two of one family: still a LOVE)
  assert.equal(tierOf(['restedVsB2b', 'rest2'], verdicts, 0.03).tier, 'high');
  assert.equal(tierOf(['restedVsB2b', 'cleanOpen'], verdicts, 0.03).tier, 'lock');
  assert.equal(tierOf(['big'], verdicts, 0.03).tier, 'lock');
  // (the owner's floor: under 2% Kelly a LIKE whatever its reasons)
  assert.equal(tierOf(['restedVsB2b', 'cleanOpen'], verdicts, LOVE_FLOOR - 0.001).tier, 'medium');
  assert.equal(tierOf(['restedVsB2b', 'cleanOpen'], verdicts, LOVE_FLOOR - 0.001).raw, 'lock');
});

test("the tiers' own place: a LOVE shows only once the would-be LOVEs before it beat the LIKEs, a LOCK the LOVEs", () => {
  const bets = [];
  for (let i = 0; i < 400; i++) bets.push({ t: T0 + i * DAY, tier: i % 2 ? 'high' : 'medium', profit: i % 2 ? (i % 5 === 1 ? -1 : 0.9) : i % 3 === 0 ? 0.9 : -1, beat: null });
  const p = placeTiers(bets);
  assert.deepEqual(p.at(T0), { love: false, lock: false }, 'nothing before the first month');
  assert.equal(p.final.love, true);
  assert.equal(p.final.lock, false, 'no would-be LOCKs: never shown');
  // (LOVE losing to LIKE: held)
  const worse = placeTiers(bets.map((b) => ({ ...b, profit: b.tier === 'high' ? -1 : 0.9 })));
  assert.equal(worse.final.love, false);
  assert.equal(placed('lock', { love: true, lock: false }), 'high');
  assert.equal(placed('lock', { love: false, lock: false }), 'medium');
  assert.equal(placed('high', { love: true, lock: false }), 'high');
  assert.ok(PLACE_MIN >= 20);
});

test('stakes are held to the tier: a LIKE 1u, a LOVE 2u, a LOCK 3u', () => {
  assert.equal(tierUnits(3, 'medium'), TIER_UNITS.medium);
  assert.equal(tierUnits(3, 'high'), 2);
  assert.equal(tierUnits(1.5, 'lock'), 1.5);
});

test("the live desk's read: the file's verdicts and place give the band, its reasons in words with their records", () => {
  const w = walkReasons(stream());
  const file = fileOf('nhl', w, { final: { love: true, lock: false } });
  const ctx = contextOf({ sport: 'nhl', market: 'ml', side: 'home', fS: 0.45, pS: 0.48, kelly: 0.03, odds: 125, sched: { rest: [2, 1], b2b: [false, true] } });
  const lt = liveTier(file, ctx, { units: 3 });
  assert.equal(lt.tier, 'high');
  assert.equal(lt.units, 2);
  assert.match(lt.proven[0].text, /^NHL rested against a back-to-back \(moneyline\): \d+ of \d+ seasons, \+\d/);
  // (no file: none)
  assert.equal(liveTier(null, ctx), null);
  assert.match(reasonText('nba', 'spread', { id: 'rest2', label: 'two or more days more rest', n: 120, roi: 0.053, seasons: { lead: 5, of: 6 } }), /NBA two or more days more rest \(spread\): 5 of 6 seasons, \+5.3% on 120/);
});

test("picks.mjs levelOf reads the reason tier over the Kelly band and D52's cap, under the floor and the rules' caps", () => {
  const b = { intent: 'edge', p: 0.56, conf: { cap: 'medium', tier: 'high' } };
  assert.equal(levelOf(b, 0.03), 'high', 'a LOVE by its reason though D52 capped it');
  assert.equal(levelOf({ ...b, conf: { cap: 'medium', tier: 'lock' } }, 0.03), 'lock', 'a LOCK by its reasons under the Kelly LOCK bar');
  assert.equal(levelOf({ ...b, conf: { tier: 'lock' } }, 0.015), 'medium', 'under the 2% floor: a LIKE');
  assert.equal(levelOf({ ...b, conf: { tier: 'medium' } }, 0.08), 'medium', 'no proven reason: a LIKE whatever the Kelly');
  assert.equal(levelOf({ ...b, suspect: { why: 'x' }, conf: { tier: 'lock' } }, 0.03), 'medium', "a suspect price: the rule's LIKE");
  assert.equal(levelOf({ ...b, conf: { tier: 'lock' } }, -0.01), 'low', 'no edge: PASS');
  assert.equal(capOf({ ...b, conf: { cap: 'medium', tier: 'high' } }), null, "D52's cap gives way to the tier");
  // (no tier: D52's cap as before)
  assert.equal(levelOf({ intent: 'edge', p: 0.56, conf: { cap: 'medium' } }, 0.03), 'medium');
});

test('verdictOf compares against the rest of the market and says why', () => {
  const picks = stream();
  const w = walkReasons(picks);
  const v = w.final.get('ml').get('restedVsB2b');
  assert.match(v.why, /points over the rest/);
  assert.equal(typeof verdictOf, 'function');
});
