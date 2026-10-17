// The MMA rankings audit's fixes (owner 2026-10-17): the rating scored on a fixed scale like Peak (1600 to
// 2400, no z-cap tie among the elite), an inactive unranked UFC fighter counting as #12 on Org Rank (not the
// pool's average), and the twelve striking and grappling rates at half strength behind their sliders in the
// current lists as in the all-time ones (boxBoost). DEFAULT stays all-50; the sliders stay the only user weights.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './support/engine.mjs';

const BOX = ['slpm', 'strAcc', 'sapm', 'strDef', 'kd15', 'td15', 'tdAcc', 'tdDef', 'sub15', 'strDiff', 'kdAgainst', 'adv15'];
const fighter = (name, stats, own = {}) => ({ gsisId: name, name, games: 10, statFights: 8, promotion: 'UFC', stats, ...own });
const value = (u, s) => u.stats[s.key] ?? null;

test('mma: the rating is scored on a fixed scale (1600 to 2400), so two elite ratings are not tied at the cap', async () => {
  const { SKILL_STATS, weightedTotals, DEFAULT_SETTINGS } = await loadEngine('mma');
  const settings = DEFAULT_SETTINGS.sport;
  const stats = SKILL_STATS.LW;
  const rating = stats.find((s) => s.key === 'rating');
  assert.deepEqual(rating.scale, [2400, 1600]);
  assert.equal(rating.boost(settings), 12);
  // (twenty fighters at 1800, two elite ones: standardized, both would clamp at +2.5 and tie)
  const units = [fighter('A', { rating: 2300 }), fighter('B', { rating: 2250 }), ...Array.from({ length: 20 }, (_, i) => fighter(`f${i}`, { rating: 1800 }))];
  const totals = weightedTotals(units, stats, { rating: 50 }, value, null, settings);
  const onScale = (v) => 2.5 * (1 - (2 * (v - 2400)) / (1600 - 2400)) * 12;
  assert.ok(Math.abs(totals.get(units[0]) - onScale(2300)) < 1e-9, `A scored ${totals.get(units[0])}`);
  assert.ok(Math.abs(totals.get(units[1]) - onScale(2250)) < 1e-9, `B scored ${totals.get(units[1])}`);
  assert.ok(totals.get(units[0]) > totals.get(units[1]), 'the higher rating ranks higher');
  // (and the all-time lists still leave it out)
  assert.equal(rating.boost({ ...settings, era: 'alltime' }), 0);
});

test('mma: an inactive, unranked UFC fighter counts as #12 on Org Rank; retired or fighting elsewhere stays average', async () => {
  const { SPORT, SKILL_STATS, DEFAULT_SETTINGS } = await loadEngine('mma');
  const settings = DEFAULT_SETTINGS.sport;
  const stat = SKILL_STATS.LW.find((s) => s.key === 'officialRank');
  const score = (own, shown = null) => SPORT.scoreValue(fighter('X', { officialRank: shown }, own), stat, shown, settings);
  assert.equal(score({ inactive: true }), 12);
  // (a ranked fighter keeps his rank, inactive or not; the champion is #0)
  assert.equal(score({ inactive: true }, 7), 7);
  assert.equal(score({ inactive: true, titleHolder: true }), 0);
  // (an active unranked fighter is just past the top 15; a retired one, or one fighting elsewhere, says nothing)
  assert.equal(score({}), 16);
  assert.equal(score({ retired: true }), null);
  assert.equal(score({ inactive: true, promotion: 'Bellator' }), null);
  assert.equal(score({ inactive: true, promotion: 'PFL' }), null);
  // (pound-for-pound: his rank score, or #12 for the same fighter)
  assert.equal(score({ inactive: true, rankScore: null }), 12);
  assert.equal(score({ inactive: true, rankScore: 9.5 }), 9.5);
});

test('mma: the striking and grappling rates count half behind their sliders in the current lists as all-time', async () => {
  const { SKILL_STATS, weightedTotals, DEFAULT_SETTINGS } = await loadEngine('mma');
  const current = DEFAULT_SETTINGS.sport;
  const allTime = { ...current, era: 'alltime' };
  const stats = SKILL_STATS.LW;
  for (const key of BOX) {
    const stat = stats.find((s) => s.key === key);
    assert.equal(stat.boost(current), 0.5, `${key} current`);
    assert.equal(stat.boost(allTime), 0.5, `${key} all-time`);
  }
  // (through the engine: the strength behind each slider at 50, and the slider still the user's weight)
  const units = [fighter('A', { slpm: 5, rating: 2000 }), fighter('B', { slpm: 3, rating: 1900 }), fighter('C', { slpm: 4, rating: 1800 })];
  const strengths = new Map();
  weightedTotals(units, stats, { slpm: 50, rating: 50 }, value, null, current, undefined, undefined, strengths);
  assert.equal(strengths.get('slpm'), 0.5);
  assert.equal(strengths.get('rating'), 12);
  const doubled = new Map();
  weightedTotals(units, stats, { slpm: 100 }, value, null, current, undefined, undefined, doubled);
  assert.equal(doubled.get('slpm'), 1);
});
