// The settings menu's Teams Included (team-filter.ts): one team's rows shown after the list is ranked
// league-wide, so each keeps its league rank (and the copy, which reads the rows shown, their ranks too);
// the UR rows follow it; the teams A to Z by name; the pick kept for one sport at a time, back to All for
// another, or for a season or tab without that team (a team the same from season to season, its logo's
// era aside). On real data for every team sport: the default list ranked as the grid ranks it, then one
// team's rows, the ranking and its scores the same after.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, seasonData, seasonDir } from './support/engine.mjs';

const entry = path.join(import.meta.dirname, 'support/team-filter-entry.ts');
const row = (name, team) => ({ gsisId: name, name, teamLogo: `assets/X/${team}.png` });

test('teamRows: one team after ranking, league ranks kept, UR rows follow, All is everyone', async () => {
  const { teamRows, teamPlaceText, ordinal } = await loadEngine('nfl', { entry });
  const ranked = [row('a', 'BUF'), row('b', 'MIA'), row('c', 'BUF'), row('d', 'NYJ'), row('e', 'BUF')];
  const ur = [row('u1', 'MIA'), row('u2', 'BUF')];

  const all = teamRows(ranked, ur, null);
  assert.deepEqual(all.rows.map((r) => r.name), ['a', 'b', 'c', 'd', 'e', 'u1', 'u2']);
  assert.equal(all.ranked, 5);

  const bills = teamRows(ranked, ur, 'BUF');
  assert.deepEqual(bills.rows.map((r) => r.name), ['a', 'c', 'e', 'u2']);
  assert.equal(bills.ranked, 3, "the UR rows start after the team's ranked ones");
  // (the copy: the ranked rows shown, each at its league rank, the row's data-rank)
  const copied = bills.rows.slice(0, bills.ranked).map((r) => [bills.leagueIndex.get(r) + 1, r.name]);
  assert.deepEqual(copied, [[1, 'a'], [3, 'c'], [5, 'e']]);
  // (the list itself untouched)
  assert.deepEqual(ranked.map((r) => r.name), ['a', 'b', 'c', 'd', 'e']);

  // (a team with no rows: nothing shown, the grid's No Players Found)
  const none = teamRows(ranked, [], 'DAL');
  assert.deepEqual([none.rows, none.ranked], [[], 0]);

  assert.equal(teamPlaceText(2, 14, 'Buffalo Bills'), '2nd on the Buffalo Bills · #14 in the league');
  assert.deepEqual(
    [1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal),
    ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st', '111th'],
  );
});

test('teamOptions: each team once, by name A to Z, a name from any of its rows else the logo file', async () => {
  const { teamOptions } = await loadEngine('nfl', { entry });
  const names = { a: 'Buffalo Bills', c: 'Buffalo Bills', d: 'New York Jets' };
  const rows = [row('b', 'MIA'), row('a', 'BUF'), row('d', 'NYJ'), row('c', 'BUF')];
  assert.deepEqual(teamOptions(rows, (r) => names[r.name]), [
    { key: 'BUF', logo: 'assets/X/BUF.png', name: 'Buffalo Bills' },
    { key: 'MIA', logo: 'assets/X/MIA.png', name: 'MIA' },
    { key: 'NYJ', logo: 'assets/X/NYJ.png', name: 'New York Jets' },
  ]);
});

test('teamKey: the same team in every era of its logo', async () => {
  const { teamKey, teamOptions, teamRows } = await loadEngine('nhl', { entry });
  for (const logo of ['assets/NHL_Icons/BOS.svg', 'assets/NHL_Icons/BOS_20232024.svg', 'assets/NHL_Icons/BOS_20082009-20222023.svg']) {
    assert.equal(teamKey(logo), 'BOS', logo);
  }
  assert.equal(teamKey('assets/NHL_Icons/WSH_secondary.svg'), 'WSH');
  assert.equal(teamKey('assets/NFL_Icons/49ers.png'), '49ers');
  assert.equal(teamKey('assets/MLB_Icons/147.svg'), '147');
  assert.equal(teamKey(undefined), null);
  // (two eras in one list: one team, its rows all shown)
  const rows = [row('a', 'BOS_20232024'), row('b', 'BOS'), row('c', 'TOR')];
  assert.deepEqual(teamOptions(rows, () => null).map((o) => o.key), ['BOS', 'TOR']);
  assert.deepEqual(teamRows(rows, [], 'BOS').rows.map((r) => r.name), ['a', 'b']);
});

test('TeamPick: in memory for one sport; another sport, or a list without the team, is All', async () => {
  const { TeamPick } = await loadEngine('nfl', { entry });
  const pick = new TeamPick();
  assert.equal(pick.team('nfl'), null);
  pick.pick('nfl', 'BUF');
  assert.equal(pick.team('nfl'), 'BUF');
  // (another sport: All there, and All back here once it has its own pick)
  assert.equal(pick.team('nba'), null);
  pick.pick('nba', 'BOS');
  assert.equal(pick.team('nfl'), null);
  assert.equal(pick.team('nba'), 'BOS');
  // (another season or tab: kept while the team's in it)
  assert.equal(pick.keep('nba', [{ key: 'BOS', logo: 'assets/X/BOS.svg', name: 'Boston Celtics' }]), false);
  assert.equal(pick.team('nba'), 'BOS');
  assert.equal(pick.keep('nba', [{ key: 'LAL', logo: 'assets/X/LAL.svg', name: 'Los Angeles Lakers' }]), true);
  assert.equal(pick.team('nba'), null);
});

test('NHL: the Bruins picked in the current season, still picked in 2024 (another logo there)', async () => {
  const engine = await loadEngine('nhl', { entry });
  const { TeamPick, teamOptions, teamRows, rowTeamName, unitsForSeason, SKILL_UNITS, CURRENT_SEASON, SPORT } = engine;
  const nameOf = (rows) => (r) => rowTeamName(r, rows);
  const pick = new TeamPick();
  const now = teamOptions(SKILL_UNITS.C, nameOf(SKILL_UNITS)).find((o) => o.key === 'BOS');
  assert.ok(now, 'the Bruins this season');
  pick.pick('nhl', now.key);
  const units2024 = unitsForSeason(seasonData(seasonDir('nhl', 2024, CURRENT_SEASON), SPORT.dataFiles), 2024);
  const then = teamOptions(units2024.C, nameOf(units2024));
  const bruins = then.find((o) => o.key === 'BOS');
  assert.ok(bruins && bruins.logo !== now.logo, `2024's logo is its own era's (${bruins?.logo}, now ${now.logo}; ${CURRENT_SEASON})`);
  assert.equal(pick.keep('nhl', then), false);
  assert.equal(pick.team('nhl'), 'BOS');
  const shown = teamRows(units2024.C, [], pick.team('nhl'));
  assert.ok(shown.rows.length > 0 && shown.rows.every((r) => r.teamLogo === bruins.logo));
});

// A tab's default list as the grid ranks it
function rankedList(engine, position) {
  const { TabRanker, StatReader, SKILL_STATS, SKILL_UNITS, skillGroups, presetWeights, emptyIn, CURRENT_SEASON, DEFAULT_SETTINGS } = engine;
  const settings = { ...DEFAULT_SETTINGS };
  const table = { position, stats: SKILL_STATS[position], groups: skillGroups(position), hidden: {}, weights: presetWeights(position, 'default') };
  const positions = { settings, statHiddenState: {}, skillHiddenGroups: () => ({}), getWeights: (p) => presetWeights(p, 'default'), isStatHidden: () => false };
  const ranker = new TabRanker(positions, { firstSeasons: async () => ({}) }, () => table, () => {});
  const listed = ranker.listed(SKILL_UNITS, CURRENT_SEASON, position);
  const reader = new StatReader({
    position,
    settings,
    rows: SKILL_UNITS,
    list: listed,
    tableSeason: true,
    season: CURRENT_SEASON,
    empty: (key) => emptyIn(SKILL_UNITS[position] ?? [], key),
    weights: ranker.mixWeights(position),
  });
  return ranker.rankedTotals(reader, listed, position, SKILL_UNITS);
}

for (const [sport, position] of [['nfl', 'QB'], ['nfl', 'DEF'], ['nba', 'PG'], ['nhl', 'C'], ['mlb', 'SP']]) {
  test(`${sport} ${position}: a team's rows at their league ranks, every team named`, async () => {
    const engine = await loadEngine(sport, { entry });
    const { SPORT, SKILL_UNITS, teamOptions, teamRows, teamKey, rowTeamName } = engine;
    const { ranked: list, totals } = rankedList(engine, position);
    assert.ok(list.length > 5, 'a list to check');
    // (as the grid names them: a team tab's row is its team)
    const nameOf = (r) => rowTeamName(r, SKILL_UNITS) ?? (SPORT.teamTabs?.includes(position) ? r.name : null);
    const options = teamOptions(list, nameOf);
    assert.ok(options.length > 1);
    // (a team's name, not its logo file: the NFL's from its Defenses rows)
    for (const option of options) assert.ok(/\s/.test(option.name) || option.name === 'Athletics', `${sport}: ${option.logo} named ${option.name}`);
    const names = options.map((o) => o.name);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
    assert.equal(new Set(options.map((o) => o.key)).size, options.length);
    const order = list.map((r) => r.gsisId);
    const scores = list.map((r) => totals.get(r));
    const team = options[0];
    const shown = teamRows(list, [], team.key);
    assert.ok(shown.rows.length > 0);
    assert.deepEqual(shown.rows, list.filter((r) => teamKey(r.teamLogo) === team.key));
    // (each shown row at its league rank: its place in the whole list, the tile's number and color)
    for (const r of shown.rows) assert.equal(shown.leagueIndex.get(r), list.indexOf(r));
    // (the filter leaves the list alone, and the list ranked again after it is the same: order and scores)
    assert.deepEqual(list.map((r) => r.gsisId), order);
    const again = rankedList(engine, position);
    assert.deepEqual(again.ranked.map((r) => r.gsisId), order);
    assert.deepEqual(again.ranked.map((r) => again.totals.get(r)), scores);
  });
}

test('MMA has no Teams Included; every team sport does', async () => {
  for (const sport of ['nfl', 'nba', 'nhl', 'mlb', 'mma']) {
    const { SPORT } = await loadEngine(sport, { entry });
    assert.equal(!SPORT.noTeams, sport !== 'mma', sport);
  }
});

// (Material draws the dropdown's list as a popover right after the dropdown, inside the row: a click on an
// option or outside the list, which shuts it, went on to the row, which opened it again, so it never shut.
// The slot around the dropdown keeps its clicks and keys, and Escape, which Material listens for on the page,
// shuts the list there)
test('Teams Included: the list shuts (the slot keeps its clicks and keys, Escape shuts it)', () => {
  const dir = path.join(import.meta.dirname, '../libs/ranker/src/engine/skill-rankings');
  const html = fs.readFileSync(path.join(dir, 'settings-menu.component.html'), 'utf8');
  const ts = fs.readFileSync(path.join(dir, 'settings-menu.component.ts'), 'utf8');
  const item = html.match(/#teamItem[\s\S]*?<\/mat-select>/)?.[0];
  assert.ok(item, 'the Teams Included row');
  // (the row opens the list; the slot, holding the dropdown and its popover, keeps the clicks from it)
  assert.match(item, /\(click\)="\$event\.stopPropagation\(\); openTeams\(teamSelect\)"/);
  const slot = item.match(/<span class="menu-slot"([^>]*)>\s*<mat-select\b/)?.[1];
  assert.ok(slot !== undefined, 'the dropdown sits right in the slot');
  assert.match(slot, /\(click\)="\$event\.stopPropagation\(\)"/);
  assert.match(slot, /\(keydown\)="teamKeydown\(\$event, teamSelect\)"/);
  assert.match(item, /\(openedChange\)="\$event \|\| refocus\(teamItem\)"/);
  const keydown = ts.match(/teamKeydown\(event: KeyboardEvent, select: MatSelect\): void \{([\s\S]*?)\n {2}\}/)?.[1];
  assert.ok(keydown, 'teamKeydown');
  assert.match(keydown, /event\.stopPropagation\(\)/);
  assert.match(keydown, /event\.key === 'Escape' && select\.panelOpen/);
  assert.match(keydown, /select\.close\(\)/);
});
