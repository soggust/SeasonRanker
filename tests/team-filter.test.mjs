// The settings menu's Teams Included (team-filter.ts): one team's rows shown after the list is ranked
// league-wide, so each keeps its league rank (and the copy, which reads the rows shown, their ranks too);
// the UR rows follow it; the teams A to Z by name; the pick kept for one sport at a time, back to All for
// another, or for a season or tab without that team. On real data for every team sport: the default
// list ranked as the grid ranks it, then one team's rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const entry = path.join(import.meta.dirname, 'support/team-filter-entry.ts');
const row = (name, team) => ({ gsisId: name, name, teamLogo: `assets/X/${team}.png` });

test('teamRows: one team after ranking, league ranks kept, UR rows follow, All is everyone', async () => {
  const { teamRows, teamPlaceText, ordinal } = await loadEngine('nfl', { entry });
  const ranked = [row('a', 'BUF'), row('b', 'MIA'), row('c', 'BUF'), row('d', 'NYJ'), row('e', 'BUF')];
  const ur = [row('u1', 'MIA'), row('u2', 'BUF')];

  const all = teamRows(ranked, ur, null);
  assert.deepEqual(all.rows.map((r) => r.name), ['a', 'b', 'c', 'd', 'e', 'u1', 'u2']);
  assert.equal(all.ranked, 5);

  const bills = teamRows(ranked, ur, 'assets/X/BUF.png');
  assert.deepEqual(bills.rows.map((r) => r.name), ['a', 'c', 'e', 'u2']);
  assert.equal(bills.ranked, 3, "the UR rows start after the team's ranked ones");
  // (the copy: the ranked rows shown, each at its league rank, the row's data-rank)
  const copied = bills.rows.slice(0, bills.ranked).map((r) => [bills.leagueIndex.get(r) + 1, r.name]);
  assert.deepEqual(copied, [[1, 'a'], [3, 'c'], [5, 'e']]);
  // (the list itself untouched)
  assert.deepEqual(ranked.map((r) => r.name), ['a', 'b', 'c', 'd', 'e']);

  // (a team with no rows: nothing shown, the grid's No Players Found)
  const none = teamRows(ranked, [], 'assets/X/DAL.png');
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
    { logo: 'assets/X/BUF.png', name: 'Buffalo Bills' },
    { logo: 'assets/X/MIA.png', name: 'MIA' },
    { logo: 'assets/X/NYJ.png', name: 'New York Jets' },
  ]);
});

test('TeamPick: in memory for one sport; another sport, or a list without the team, is All', async () => {
  const { TeamPick } = await loadEngine('nfl', { entry });
  const pick = new TeamPick();
  assert.equal(pick.team('nfl'), null);
  pick.pick('nfl', 'assets/X/BUF.png');
  assert.equal(pick.team('nfl'), 'assets/X/BUF.png');
  // (another sport: All there, and All back here once it has its own pick)
  assert.equal(pick.team('nba'), null);
  pick.pick('nba', 'assets/X/BOS.svg');
  assert.equal(pick.team('nfl'), null);
  assert.equal(pick.team('nba'), 'assets/X/BOS.svg');
  // (another season or tab: kept while the team's in it)
  assert.equal(pick.keep('nba', [{ logo: 'assets/X/BOS.svg', name: 'Boston Celtics' }]), false);
  assert.equal(pick.team('nba'), 'assets/X/BOS.svg');
  assert.equal(pick.keep('nba', [{ logo: 'assets/X/LAL.svg', name: 'Los Angeles Lakers' }]), true);
  assert.equal(pick.team('nba'), null);
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
  return ranker.ranked(reader, listed, position, SKILL_UNITS);
}

for (const [sport, position] of [['nfl', 'QB'], ['nfl', 'DEF'], ['nba', 'PG'], ['nhl', 'C'], ['mlb', 'SP']]) {
  test(`${sport} ${position}: a team's rows at their league ranks, every team named`, async () => {
    const engine = await loadEngine(sport, { entry });
    const { SPORT, SKILL_UNITS, teamOptions, teamRows, rowTeamName } = engine;
    const list = rankedList(engine, position);
    assert.ok(list.length > 5, 'a list to check');
    // (as the grid names them: a team tab's row is its team)
    const nameOf = (r) => rowTeamName(r, SKILL_UNITS) ?? (SPORT.teamTabs?.includes(position) ? r.name : null);
    const options = teamOptions(list, nameOf);
    assert.ok(options.length > 1);
    // (a team's name, not its logo file: the NFL's from its Defenses rows)
    for (const option of options) assert.ok(/\s/.test(option.name) || option.name === 'Athletics', `${sport}: ${option.logo} named ${option.name}`);
    const names = options.map((o) => o.name);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
    assert.equal(new Set(options.map((o) => o.logo)).size, options.length);
    const team = options[0].logo;
    const shown = teamRows(list, [], team);
    assert.ok(shown.rows.length > 0);
    assert.deepEqual(shown.rows, list.filter((r) => r.teamLogo === team));
    for (const r of shown.rows) assert.equal(shown.leagueIndex.get(r), list.indexOf(r));
    // (the ranking is the same with or without a pick: the filter comes after it)
    assert.deepEqual(rankedList(engine, position).map((r) => r.gsisId), list.map((r) => r.gsisId));
  });
}

test('MMA has no Teams Included; every team sport does', async () => {
  for (const sport of ['nfl', 'nba', 'nhl', 'mlb', 'mma']) {
    const { SPORT } = await loadEngine(sport, { entry });
    assert.equal(!SPORT.noTeams, sport !== 'mma', sport);
  }
});
