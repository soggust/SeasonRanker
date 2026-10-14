// The presets (each sport's skill-presets.ts, weighed by its positions.ts presetWeights): DEFAULT is every
// stat at 50 (no designer bias); a preset sets the stats it names, puts every other one at the rest weight
// (restWeight: 25 on a small tab, down to 10 on a big one; MMA a flat 10, its style presets setting the
// results stats low themselves) and leaves the support grades at 50; a Fantasy preset ranks on its own
// stats alone. Every stat a preset names is on its tab, and the presets the audit cut stay cut.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPORTS, loadEngine } from './support/engine.mjs';

const engines = {};
const engineFor = (sport) => (engines[sport] ??= loadEngine(sport));

// (the NFL's combined pairs' parent sliders, set with the pair: not stats of their own)
const PARENTS = new Set(['totalYards', 'totalTds', 'turnovers']);
// (the NFL's rough on/off reads, at 10 in DEFAULT too)
const SMALL = new Set(['runBlockEpa', 'passProPct']);
// (the presets on one stat: Fantasy (its points), the NFL coaches' 4th-down Aggressive and the NBA teams'
// Offense and Defense, their ranks: the audit's fix list kept them so)
const ONE_STAT = new Set(['nfl HC analytics', 'nba TM offense', 'nba TM defense']);

test('the rest weight: 25 up to six unnamed stats, then 25 x 6 / unnamed, never under 10', async () => {
  const { restWeight } = await engineFor('nfl');
  for (const n of [0, 1, 3, 6]) assert.equal(restWeight(n), 25);
  assert.equal(restWeight(7), 21);
  assert.equal(restWeight(8), 19);
  assert.equal(restWeight(10), 15);
  assert.equal(restWeight(12), 13);
  for (const n of [15, 20, 26, 40]) assert.equal(restWeight(n), 10);
});

for (const sport of SPORTS) {
  test(`${sport}: DEFAULT is every stat at 50, untouched by the presets`, async () => {
    const { SKILL_STATS, presetWeights } = await engineFor(sport);
    for (const [tab, stats] of Object.entries(SKILL_STATS)) {
      const weights = presetWeights(tab, 'default');
      for (const stat of stats) {
        if (stat.infoOnly) assert.equal(weights[stat.key], undefined, `${tab} ${stat.key}: no slider`);
        else assert.equal(weights[stat.key], stat.positionAdjust ? 0 : sport === 'nfl' && SMALL.has(stat.key) ? 10 : 50, `${tab} ${stat.key}`);
      }
    }
  });

  test(`${sport}: a preset sets what it names, the rest weight on the others, support at 50`, async () => {
    const { SKILL_STATS, SKILL_PRESETS, presetWeights, restWeight } = await engineFor(sport);
    for (const [tab, presets] of Object.entries(SKILL_PRESETS)) {
      const stats = SKILL_STATS[tab].filter((stat) => !stat.infoOnly);
      assert.ok(presets.length >= 2, `${tab}: presets`);
      assert.equal(new Set(presets.map((p) => p.key)).size, presets.length, `${tab}: keys`);
      assert.equal(new Set(presets.map((p) => p.label)).size, presets.length, `${tab}: labels`);
      for (const preset of presets) {
        const name = `${tab} ${preset.label}`;
        const named = preset.weights;
        // (every stat it names on the tab, MMA's on some division's (its pound-for-pound tabs have no Peak
        // Rank), and at least two of them: one would be sorting a column)
        const known = (key) => (sport === 'mma' ? Object.values(SKILL_STATS).flat() : stats).some((s) => s.key === key) || (sport === 'nfl' && PARENTS.has(key));
        for (const key of Object.keys(named)) assert.ok(known(key), `${name}: ${key} isn't on the tab`);
        const single = preset.key === 'fantasy' || ONE_STAT.has(`${sport} ${tab} ${preset.key}`);
        assert.ok(Object.values(named).filter((w) => w > 0).length >= (single ? 1 : 2), `${name}: names one stat`);
        assert.ok(!/\.\s*$/.test(preset.description) && preset.description.length <= 120, `${name}: one line, no closing period`);
        const weights = presetWeights(tab, preset.key);
        const only = preset.key === 'fantasy';
        const unnamed = stats.filter((s) => !s.support && !s.positionAdjust && !(sport === 'nfl' && SMALL.has(s.key)) && !(s.key in named));
        const rest = sport === 'mma' ? 10 : restWeight(unnamed.length);
        for (const stat of stats) {
          const expected = stat.key in named ? named[stat.key] : only || stat.positionAdjust ? 0 : stat.support ? 50 : sport === 'nfl' && SMALL.has(stat.key) ? 10 : rest;
          assert.equal(weights[stat.key], expected, `${name}: ${stat.key}`);
        }
      }
      // (Fantasy, where a tab has one, last)
      const fantasy = presets.findIndex((p) => p.key === 'fantasy');
      if (fantasy !== -1) assert.equal(fantasy, presets.length - 1, `${tab}: Fantasy last`);
    }
  });
}

test('the big tabs rest at 10, the small ones at 25', async () => {
  const nfl = await engineFor('nfl');
  // (WR: 19 stats with a rest weight, 5 named: 25 x 6 / 14)
  assert.equal(nfl.presetWeights('WR', 'deepThreat').yac, 11);
  assert.equal(nfl.presetWeights('WR', 'deepThreat').runBlockEpa, 10);
  assert.equal(nfl.presetWeights('K', 'bigLeg').fgPct, 25);
  assert.equal(nfl.presetWeights('HC', 'winner').atsPct, 21);
  const nba = await engineFor('nba');
  assert.equal(nba.presetWeights('PG', 'scorer').rebounds, 10);
  assert.equal(nba.presetWeights('PG', 'scorer').teammates, 50);
  assert.equal(nba.presetWeights('TOP', 'impact').posAdj, 0);
  assert.equal(nba.presetWeights('HC', 'winner').lift, 25);
});

test('the cuts and merges stay out; the additions are in', async () => {
  const keys = async (sport, tab) => (await engineFor(sport)).SKILL_PRESETS[tab].map((p) => p.key);
  assert.ok(!(await keys('nfl', 'QB')).includes('support'));
  assert.ok(!(await keys('nfl', 'TE')).includes('redZone'));
  assert.ok(!(await keys('nfl', 'K')).includes('volume'));
  for (const key of ['discipline', 'shortYardage']) assert.ok(!(await keys('nfl', 'OL')).includes(key));
  assert.ok(!(await keys('nfl', 'HC')).includes('discipline'));
  assert.ok((await keys('nfl', 'HC')).includes('units'));
  assert.ok(!(await keys('nhl', 'C')).includes('faceoffs'));
  assert.ok(!(await keys('nhl', 'G')).includes('winner'));
  assert.deepEqual(await keys('nhl', 'TM'), ['contender', 'analytics', 'roster', 'offense', 'defense']);
  assert.ok(!(await keys('mma', 'LW')).includes('momentum'));
  for (const tab of ['TOP', 'PG', 'SG', 'SF', 'PF', 'C']) assert.equal((await keys('nba', tab)).at(-1), 'fantasy', `nba ${tab}`);
  assert.ok((await keys('nba', 'PF')).includes('pointForward'));
  assert.deepEqual(await keys('mlb', 'DH'), ['war', 'saber', 'slugger', 'onBase', 'classic']);
  assert.ok(!(await keys('mlb', 'C')).includes('speed'));
  // (the Top 50: the shared lenses only, Total Impact first)
  for (const sport of ['nba', 'nhl', 'mlb']) assert.equal((await keys(sport, 'TOP'))[0], sport === 'mlb' ? 'war' : 'impact');
});
