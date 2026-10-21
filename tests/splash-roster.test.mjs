// Roster truth for the Overview splash's lockers: every man a team's locker room can show was on that team that
// season, wearing that season's number, by the roster source the builds read (nflverse's season rosters, kept
// in .cache/nflverse; the NHL's and MLB's league rosters, kept by the builds in .cache/<sport>/rosters). Every
// team, the current season and the five before it. No network: a season whose source isn't cached is passed
// over with a note (run the sport's build-splash.mjs to cache it); the files' own consistency is checked either
// way: every ranked row's number, the depth charts' starters on the rosters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parseCsv } from '../libs/ranker/scripts/csv.mjs';
import { ROOT, cachedRoster, currentSeason, seasonDir, siteRows, siteSeasons } from '../libs/ranker/scripts/splash/files.mjs';
import { NFL_LOGO } from '../libs/ranker/scripts/splash/nfl-teams.mjs';
import { earlyCurrent } from './support/early-season.mjs';

const read = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);
// (the current season and the five before it that the site has)
const recent = (sport) => {
  const all = siteSeasons(sport);
  const cur = currentSeason(sport);
  return all.filter((s) => s <= cur).slice(-6);
};

// ---- the NFL: nflverse's season roster (gsis id -> team, number, ESPN id)
function nflRoster(season) {
  const file = path.join(ROOT, '.cache', 'nflverse', `roster_${season}.csv`);
  if (!existsSync(file)) return null;
  const byGsis = new Map();
  const byEspn = new Map();
  for (const r of parseCsv(readFileSync(file, 'utf8'))) {
    if (!r.gsis_id || !NFL_LOGO[r.team]) continue;
    const row = { team: NFL_LOGO[r.team], num: r.jersey_number === '' || r.jersey_number === 'NA' ? null : String(Number(r.jersey_number)), name: r.full_name };
    (byGsis.get(r.gsis_id) ?? byGsis.set(r.gsis_id, []).get(r.gsis_id)).push(row);
    if (r.espn_id && r.espn_id !== 'NA') (byEspn.get(String(r.espn_id)) ?? byEspn.set(String(r.espn_id), []).get(String(r.espn_id))).push(row);
  }
  return { byGsis, byEspn };
}

test('NFL lockers.json: every team, every man on its roster that season with that season\'s number (nflverse)', () => {
  let checked = 0;
  const skipped = [];
  for (const season of recent('nfl')) {
    const dir = seasonDir('nfl', season);
    const lockers = read(path.join(dir, 'lockers.json'));
    assert.ok(lockers, `nfl ${season}: lockers.json`);
    assert.ok(Object.keys(lockers).length >= 31, `nfl ${season}: ${Object.keys(lockers).length} teams`);
    for (const [team, men] of Object.entries(lockers)) {
      assert.ok(Object.keys(men).length >= 20, `nfl ${season} ${team}: ${Object.keys(men).length} men`);
      for (const [id, v] of Object.entries(men)) {
        assert.ok(Array.isArray(v) && /^\d{1,2}$/.test(v[0]) && Number.isFinite(v[1]), `nfl ${season} ${team} ${id}: ${JSON.stringify(v)}`);
      }
    }
    const roster = nflRoster(season);
    if (!roster) {
      skipped.push(season);
      continue;
    }
    for (const [team, men] of Object.entries(lockers)) {
      for (const [id, [num]] of Object.entries(men)) {
        const rows = roster.byGsis.get(id) ?? [];
        const mine = rows.find((r) => r.team === team);
        assert.ok(mine, `nfl ${season} ${team} ${id}: not on its roster (${rows.map((r) => r.team).join(', ') || 'no row'})`);
        assert.equal(num, mine.num, `nfl ${season} ${team} ${mine.name}: wore ${mine.num}, lockers say ${num}`);
        checked++;
      }
    }
  }
  if (skipped.length) console.log(`  (nflverse rosters not cached for ${skipped.join(', ')}: membership not checked; ${checked} men checked)`);
  else console.log(`  (${checked} men checked against nflverse)`);
});

test('NFL numbers.json: every ranked player\'s number is the one nflverse has him in (his team\'s when he had two)', () => {
  let checked = 0;
  for (const season of recent('nfl')) {
    const roster = nflRoster(season);
    if (!roster) continue;
    const dir = seasonDir('nfl', season);
    const numbers = read(path.join(dir, 'numbers.json'));
    for (const [tab, rows] of Object.entries(siteRows(dir))) {
      if (['DEF', 'OL', 'HC', 'TM'].includes(tab)) continue;
      for (const row of rows) {
        const got = numbers[row.cardId];
        if (!got) continue;
        const list = row.cardId.startsWith('QB-') ? roster.byEspn.get(String(row.id)) : roster.byGsis.get(row.cardId);
        if (!list?.length) continue;
        const r = list.find((x) => x.team === row.team) ?? list.at(-1);
        if (r.num === null) continue;
        assert.equal(got, r.num, `nfl ${season} ${tab} ${row.name} (${row.team}): numbers say ${got}, nflverse ${r.num}`);
        checked++;
      }
    }
  }
  console.log(`  (${checked} numbers checked)`);
});

test('NFL depth charts: the starters a team locker hangs are on its roster (lockers.json), its own number on each', () => {
  const problems = [];
  for (const season of recent('nfl')) {
    const dir = seasonDir('nfl', season);
    const depthDir = path.join(dir, 'depth');
    if (!existsSync(depthDir)) continue;
    const lockers = read(path.join(dir, 'lockers.json'));
    for (const file of readdirSync(depthDir).filter((f) => f.endsWith('.json'))) {
      const chart = read(path.join(depthDir, file));
      // (the folder's coaches.json is the staff, not a chart)
      if (!Array.isArray(chart?.slots)) continue;
      const men = lockers[chart.logo];
      assert.ok(men, `nfl ${season}: lockers.json has no ${chart.logo}`);
      const starters = chart.slots.map((s) => s.depth[0]).filter(Boolean);
      const on = starters.filter((id) => men[id]);
      // (a chart drawn before a trade, or a man the roster lists elsewhere: a few; the scene passes him over)
      if (on.length < starters.length * 0.8) problems.push(`${season} ${chart.logo}: ${starters.length - on.length} of ${starters.length} starters not on its roster: ${starters.filter((id) => !men[id]).map((id) => chart.players[id]?.name ?? id).join(', ')}`);
      // (the quarterback's spot and the line's five each have a man on the roster to hang)
      for (const s of chart.slots.filter((s) => s.side === 'offense' && /^(QB|LT|LG|C|RG|RT)$/.test(s.abb))) {
        if (!s.depth.some((id) => men[id])) problems.push(`${season} ${chart.logo} ${s.abb}: no one at the spot is on the roster (${s.depth.map((id) => chart.players[id]?.name ?? id).join(', ')})`);
      }
    }
  }
  assert.deepEqual(problems, [], `\n  ${problems.join('\n  ')}`);
});

// ---- the NHL and MLB: the league rosters the builds read, by the team's logo name
test('NHL and MLB numbers.json: every ranked player\'s number is his team\'s roster\'s that season', () => {
  for (const sport of ['nhl', 'mlb']) {
    let checked = 0;
    const skipped = [];
    for (const season of recent(sport)) {
      const dir = seasonDir(sport, season);
      const numbers = read(path.join(dir, 'numbers.json'));
      const rows = siteRows(dir);
      // (consistency, source or no source: every ranked row has a number, nearly every one)
      const ranked = Object.entries(rows).filter(([tab]) => !['HC', 'TM'].includes(tab)).flatMap(([, list]) => list);
      const missing = ranked.filter((r) => !numbers[r.cardId]);
      assert.ok(missing.length <= Math.max(3, ranked.length * 0.02), `${sport} ${season}: ${missing.length} of ${ranked.length} ranked players without a number: ${missing.slice(0, 5).map((r) => r.name).join(', ')}`);
      const source = cachedRoster(sport, season);
      if (!source) {
        skipped.push(season);
        continue;
      }
      const teams = new Set();
      for (const row of ranked) {
        const id = String(row.cardId).replace(/^[HP]-/, '');
        const list = source[id];
        const got = numbers[row.cardId];
        if (!list?.length || !got) continue;
        teams.add(row.team);
        const mine = list.find(([team]) => team === row.team) ?? list.at(-1);
        assert.equal(got, mine[1], `${sport} ${season} ${row.name} (${row.team}): numbers say ${got}, the roster ${mine[1]}`);
        checked++;
      }
      assert.ok(teams.size >= 28, `${sport} ${season}: only ${teams.size} teams had men to check`);
    }
    console.log(`  (${sport}: ${checked} numbers checked${skipped.length ? `; rosters not cached for ${skipped.join(', ')}` : ''})`);
  }
});

// ---- the NBA: its lockers hang the site's own rows; every ranked row has his number
test('NBA numbers.json: every ranked player has his number, every team', () => {
  for (const season of recent('nba')) {
    const dir = seasonDir('nba', season);
    const numbers = read(path.join(dir, 'numbers.json'));
    const ranked = Object.entries(siteRows(dir)).filter(([tab]) => !['HC', 'TM'].includes(tab)).flatMap(([, list]) => list);
    const missing = ranked.filter((r) => !numbers[r.cardId]);
    // (the season being played its first days in: a few teams a game in, its rookies' numbers still to come
    // on the night's runs; every number there a number)
    if (season === currentSeason('nba') && earlyCurrent('nba')) {
      assert.ok(Object.values(numbers).every((n) => /^\d{1,2}$/.test(n)), `nba ${season}: numbers`);
      continue;
    }
    assert.ok(missing.length <= Math.max(3, ranked.length * 0.02), `nba ${season}: ${missing.length} without a number: ${missing.slice(0, 5).map((r) => r.name).join(', ')}`);
    assert.ok(new Set(ranked.map((r) => r.team)).size >= 29, `nba ${season}: teams`);
  }
});
