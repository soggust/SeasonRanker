// The Team tab's rank gems (player-card/depth-ranks.ts): each player on a team card's depth chart shows where he
// ranks at his own tab for the card's season, under the user's settings for that tab, as his card would open:
// his place in the tab's list; UR when he's under Min Games or played outside the list; ranked where he'd
// fall when the list's other filters leave him out (Injured Players off); nothing for a team unit's tab (the
// O-line's rank is the line's) or a player the site hasn't got. And the gem's digits, colors and hover words.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const ENTRY = path.join(import.meta.dirname, 'support', 'depth-ranks-entry.ts');
let nfl;
before(async () => {
  nfl = await loadEngine('nfl', { entry: ENTRY, data: {} });
});

const player = (gsisId, games) => ({ gsisId, name: gsisId, games });
// (a tab of 32: 30 listed, one hurt and filtered out of the list, one under Min Games)
const listed = Array.from({ length: 30 }, (_, i) => player(`p${i + 1}`, 10));
const hurt = player('hurt', 9);
const fringe = player('fringe', 1);
const rows = [...listed, hurt, fringe];
const under = (p) => p.games < 3;
// (ranking the list with him in it: the hurt one falls fourth, by his games)
let rankedCalls = 0;
const rankIn = (players) => {
  rankedCalls++;
  const rest = players.filter((p) => p !== hurt);
  return [...rest.slice(0, 3), hurt, ...rest.slice(3)];
};

test('tab places: a listed player is his index, under Min Games is UR, one outside the rows is UR', () => {
  const { tabPlaces } = nfl;
  const places = tabPlaces(listed, rows, under, rankIn);
  assert.equal(places.of, 30);
  assert.deepEqual(places.rankOf('p1'), { rank: 1, of: 30 });
  assert.deepEqual(places.rankOf('p30'), { rank: 30, of: 30 });
  assert.equal(places.rankOf('fringe'), 'ur');
  // (a player who played outside the ranked list: not among the rows at all)
  assert.equal(places.rankOf('nobody'), 'ur');
});

test('tab places: a player the filters left out is ranked where he would fall, worked out once', () => {
  const { tabPlaces } = nfl;
  rankedCalls = 0;
  const places = tabPlaces(listed, rows, under, rankIn);
  assert.deepEqual(places.rankOf('hurt'), { rank: 4, of: 31 });
  assert.deepEqual(places.rankOf('hurt'), { rank: 4, of: 31 });
  assert.equal(rankedCalls, 1);
  // (the listed ones never ask)
  places.rankOf('p7');
  assert.equal(rankedCalls, 1);
});

test('a linked player: his rank at his tab; none for a team unit, an unlinked player or a tab not ranked yet', () => {
  const { tabPlaces, depthRank } = nfl;
  const qb = tabPlaces(listed, rows, under, rankIn);
  const places = (position) => (position === 'QB' ? qb : null);
  const teamTabs = ['TM', 'OFF', 'DEF', 'ST', 'OL'];
  assert.deepEqual(depthRank({ position: 'QB', gsisId: 'p3' }, places, teamTabs), { rank: 3, of: 30 });
  assert.equal(depthRank({ position: 'QB', gsisId: 'fringe' }, places, teamTabs), 'ur');
  // (an O-lineman's link is the line's tab: the line's rank sits on the line as a whole)
  assert.equal(depthRank({ position: 'OL', gsisId: 'p3' }, places, teamTabs), null);
  assert.equal(depthRank(null, places, teamTabs), null);
  assert.equal(depthRank(undefined, places, teamTabs), null);
  // (a tab whose ranking is still on its way)
  assert.equal(depthRank({ position: 'RB', gsisId: 'p3' }, places, teamTabs), null);
});

test('the gem: digits, the rank column colors, and its hover', () => {
  const { depthRankText, depthRankClass, depthRankTitle } = nfl;
  assert.equal(depthRankText({ rank: 3, of: 32 }), '3');
  assert.equal(depthRankText('ur'), 'UR');
  assert.equal(depthRankClass({ rank: 1, of: 32 }), 'rank-top');
  assert.equal(depthRankClass({ rank: 10, of: 32 }), 'rank-top');
  assert.equal(depthRankClass({ rank: 11, of: 32 }), '');
  assert.equal(depthRankClass({ rank: 22, of: 32 }), '');
  assert.equal(depthRankClass({ rank: 23, of: 32 }), 'rank-bottom');
  assert.equal(depthRankClass({ rank: 32, of: 32 }), 'rank-bottom');
  assert.equal(depthRankClass('ur'), 'unranked');
  assert.equal(depthRankTitle({ rank: 3, of: 32 }, 'Quarterbacks', 'this season'), 'No. 3 of 32 Quarterbacks this season');
  assert.equal(depthRankTitle({ rank: 3, of: 32 }, 'Quarterbacks', 'in 2024'), 'No. 3 of 32 Quarterbacks in 2024');
  assert.equal(depthRankTitle('ur', 'Running Backs', 'this season'), 'Unranked (UR) among the Running Backs this season: under Min Games, or outside the list');
});

// Where the gem sits (the owner's call, 2026-10-17: beside the name it clashed with the text): on a headshot
// circle (a chip's, a special teams item's) overlaid inside the circle as a badge, the name line plain under
// it; in a text row (a slot's popover, a coach, the full roster) leading the name
test('the gem sits on the circle as a badge, or leads a text row', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(path.join(import.meta.dirname, '..', 'libs', 'ranker', 'src', 'engine', 'player-card', 'tabs', 'team.component.html'), 'utf8');
  const gems = [...html.matchAll(/<ng-container \*ngTemplateOutlet="gem; context: \{([^}]*)\}" \/>/g)].map((m) => m[1]);
  assert.equal(gems.length, 5, 'the chip, the special teams, a popover row, a coach, a roster row');
  // (the two circles: the badge inside .depth-head, after the injury flag, the name line after the circle)
  for (const head of html.match(/<span class="depth-head[^"]*"[^>]*>[\s\S]*?<\/span>\s*<span class="depth-name">/g) ?? []) {
    assert.match(head, /depth-status[\s\S]*ngTemplateOutlet="gem; context: \{[^}]*badge: true/, 'the gem a badge on the circle, after the flag');
  }
  assert.equal(gems.filter((g) => /badge: true/.test(g)).length, 2);
  assert.ok(!/depth-name-row/.test(html), 'no gem beside the name');
  // (the text rows: the gem first, then his name)
  for (const cls of ['depth-pop-name', 'depth-coach-name', 'depth-row-name']) {
    const row = html.match(new RegExp(`<span class="${cls}">([^]*?)</span>`));
    assert.ok(row, cls);
    assert.match(row[1], /^<ng-container \*ngTemplateOutlet="gem; context: \{ link: [^}]*\}" \/>@if \(/, `${cls}: the gem leads the name`);
  }
  // (a badge carries the digits alone; a row's gem the "#" too)
  assert.match(html, /@if \(r !== 'ur' && !badge\) \{<i>#<\/i>\}/);
});
