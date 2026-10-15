// The NHL's Heat Maps (apps/nhl/scripts/build-heat-maps.mjs, apps/nhl/src/sport/heat-maps.ts, the rink surface):
// the zone binning on hand-made spots, MoneyPuck's ids and team codes as the site's, the strength and shot type,
// the tally on hand-made shots (empty nets left out, a goalie's faced, a team's for and against), the packing,
// the zip reader, every committed file against its contract, its keys and its size, the rink's cells, and the
// maps read from real seasons: a sniper's, a defenseman's, a goalie's (his penalty kill, his shot types), a
// team's two sides, the AI preview's matchups, and last season behind the season being played's thin zones.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { loadEngine, readJson, staticDir } from './support/engine.mjs';
import { CELL, FIRST_SEASON, GROUPS, RINK, TYPES, ZONE_IDS, packCell, packRows, parseShots, section, siteId, strengthOf, tally, teamCode, typeOf, unzipFirst, zoneOf } from '../apps/nhl/scripts/build-heat-maps.mjs';

const ROOT = staticDir('nhl');
let h;
before(async () => {
  h = await loadEngine('nhl', { entry: path.join(import.meta.dirname, 'support', 'nhl-heat-entry.ts'), data: {} });
});
const zone = (x, y) => ZONE_IDS[zoneOf(x, y)];

// ---- the binning

test('zones: a shot by where it came from (feet; the net at x 89, y positive on the shooter’s left)', () => {
  assert.equal(zone(85, 0), 'crease', 'the doorstep');
  assert.equal(zone(80.5, -8.9), 'crease');
  assert.equal(zone(75, 3), 'slot');
  assert.equal(zone(80, 0), 'slot', 'the crease starts past 80');
  assert.equal(zone(60, 5), 'high-slot');
  assert.equal(zone(60, 15), 'circle-left', "the left circle, inside the dot: Ovechkin's office");
  assert.equal(zone(60, -15), 'circle-right');
  assert.equal(zone(60, 30), 'wing-left');
  assert.equal(zone(75, 15), 'low-left');
  assert.equal(zone(75, -30), 'corner-right');
  assert.equal(zone(95, 30), 'corner-left', 'behind the goal line and wide: the corner');
  assert.equal(zone(95, 0), 'behind');
  assert.equal(zone(40, 0), 'point-middle');
  assert.equal(zone(30, 20), 'point-left');
  assert.equal(zone(30, -9.5), 'point-right');
  assert.equal(zone(10, 0), 'long', 'beyond the blue line');
  assert.equal(zone(RINK.blue, 0), 'point-middle', 'on the blue line: in the zone');
  assert.deepEqual([zoneOf('', '3'), zoneOf('5', ''), zoneOf('x', '0'), zoneOf(undefined, 1)], [-1, -1, -1, -1], 'no spot');
  assert.equal(ZONE_IDS.length, 16);
  // (every zone reachable)
  const hit = new Set();
  for (let x = 0; x <= 100; x += 0.5) for (let y = -42; y <= 42; y += 0.5) hit.add(zoneOf(x, y));
  assert.deepEqual([...hit].sort((a, b) => a - b), ZONE_IDS.map((_, i) => i));
});

test("MoneyPuck's ids and codes as the site's: players, teams, strength, shot types", () => {
  assert.equal(siteId('8478402.0'), '8478402', "an older file's float id");
  assert.equal(siteId('8479318'), '8479318');
  assert.deepEqual([siteId('0'), siteId(''), siteId('0.0'), siteId(undefined)], [null, null, null, null]);
  assert.equal(teamCode('L.A'), 'LAK');
  assert.equal(teamCode('N.J', new Set(['NJD'])), 'NJD');
  assert.equal(teamCode('S.J'), 'SJS');
  assert.equal(teamCode('T.B'), 'TBL');
  assert.equal(teamCode('ARI', new Set(['PHX', 'BOS'])), 'PHX', "the Coyotes before 2014-15: the site's PHX");
  assert.equal(teamCode('ARI', new Set(['ARI'])), 'ARI');
  assert.equal(teamCode('XYZ', new Set(['BOS'])), null);
  const shot = (o) => ({ isHomeTeam: '1', homeSkatersOnIce: '5', awaySkatersOnIce: '5', homeEmptyNet: '0', awayEmptyNet: '0', ...o });
  assert.equal(strengthOf(shot({})), 'ev');
  assert.equal(strengthOf(shot({ awaySkatersOnIce: '4' })), 'pp');
  assert.equal(strengthOf(shot({ isHomeTeam: '0', homeSkatersOnIce: '4' })), 'pp', 'the away side on the power play');
  assert.equal(strengthOf(shot({ homeSkatersOnIce: '4' })), 'ot', 'shorthanded');
  assert.equal(strengthOf(shot({ homeSkatersOnIce: '6', homeEmptyNet: '1' })), 'ot', 'an extra attacker: not a power play');
  assert.equal(strengthOf(shot({ homeSkatersOnIce: '4', awaySkatersOnIce: '4' })), 'ot');
  assert.deepEqual(['WRIST', 'SNAP', 'SLAP', 'TIP', 'DEFL', 'BACK', 'WRAP', ''].map(typeOf), ['ws', 'ws', 'slap', 'tip', 'tip', 'back', 'back', null]);
});

const SHOT = {
  game_id: '1', isPlayoffGame: '0', event: 'SHOT', goal: '0', shotWasOnGoal: '1', xGoal: '0.1', xCordAdjusted: '75', yCordAdjusted: '0', shooterPlayerId: '100', goalieIdForShot: '900',
  teamCode: 'BOS', homeTeamCode: 'BOS', awayTeamCode: 'L.A', isHomeTeam: '1', homeSkatersOnIce: '5', awaySkatersOnIce: '5', homeEmptyNet: '0', awayEmptyNet: '0',
  shotOnEmptyNet: '0', shotType: 'WRIST', shotRebound: '0',
};

test('the tally: a skater’s shots, a goalie’s faced, a team’s for and against, the league’s; empty nets left out', () => {
  const s = (o) => ({ ...SHOT, ...o });
  const shots = [
    s({}),
    s({ goal: '1', event: 'GOAL', xGoal: '0.3', shotRebound: '1' }),
    s({ shotWasOnGoal: '0', event: 'MISS', xCordAdjusted: '60', yCordAdjusted: '15', shotType: 'SLAP' }),
    s({ awaySkatersOnIce: '4', game_id: '2' }),
    s({ shotOnEmptyNet: '1', goal: '1', goalieIdForShot: '0' }),
    s({ xCordAdjusted: '' }),
    s({ shooterPlayerId: '200', teamCode: 'L.A', isHomeTeam: '0', goalieIdForShot: '800', yCordAdjusted: '-12', xCordAdjusted: '72' }),
  ];
  const keys = { skaters: new Set(['100', '200']), goalies: new Set(['900', '800']), teams: new Set(['BOS', 'LAK']) };
  const t = tally(shots, keys);
  const slot = ZONE_IDS.indexOf('slot');
  const circle = ZONE_IDS.indexOf('circle-left');
  const me = t.skaters.get('100');
  // [att, sog, g, xg, rebAtt, rebG, rebXg]
  assert.deepEqual(me.ev[slot].map((v) => Math.round(v * 100) / 100), [2, 2, 1, 0.4, 1, 1, 0.3], 'two in the slot at 5-on-5, the goal a rebound');
  assert.deepEqual(me.ev[circle].slice(0, 3), [1, 0, 0], 'a miss: an attempt, not on goal');
  assert.equal(me.pp[slot][0], 1, 'the power play its own');
  assert.equal(me.games.size, 2);
  assert.equal(t.goalies.get('900').ty.ws[slot][0], 3, 'his wrist shots faced');
  assert.equal(t.goalies.get('900').ty.slap[circle][0], 1);
  assert.equal(t.offense.get('BOS').ev[slot][0], 2);
  assert.equal(t.defense.get('LAK').ev[slot][0], 2, "L.A's defense: what it allowed");
  assert.equal(t.offense.get('LAK').ev[ZONE_IDS.indexOf('low-right')][0], 1, "L.A's offense, as the site's LAK");
  assert.equal(t.league.ev.reduce((a, c) => a + c[0], 0) + t.league.pp.reduce((a, c) => a + c[0], 0), 5, 'the empty-net shot and the unplaced one left out');
  assert.equal(t.teamGames, 4, "the teams' games added up: BOS's two, LAK's two (shot at in the second)");
  // (keys: a skater the site hasn't, no row)
  assert.equal(tally(shots, { ...keys, skaters: new Set(['200']) }).skaters.has('100'), false);
});

test('packing: hundredths, trailing zeros dropped, all-zero cells and rows a plain 0; the files split by group', () => {
  assert.deepEqual(packCell([3, 2, 1, 0.456, 0, 0, 0]), [3, 2, 1, 46]);
  assert.deepEqual(packCell([3, 2, 0, 0.1, 1, 0, 0.051]), [3, 2, 0, 10, 1, 0, 5]);
  assert.equal(packCell([0, 0, 0, 0, 0, 0, 0]), 0);
  assert.equal(packRows(ZONE_IDS.map(() => [0, 0, 0, 0, 0, 0, 0])), 0);
  const out = section([{ ...SHOT }, { ...SHOT, shooterPlayerId: '300' }], { skaters: new Set(['100', '300']), groups: new Map([['100', 'F'], ['300', 'D']]), goalies: new Set(['900']), teams: new Set(['BOS', 'LAK']) });
  assert.deepEqual(Object.keys(out.forwards), ['100']);
  assert.deepEqual(Object.keys(out.defense), ['300']);
  assert.equal(out.main.goalies['900'].gp, 1);
  assert.equal(out.main.league.gp, 2, "the league's team games");
  assert.equal(section([], {}), null, 'no shots: no part');
});

test("the zip reader and the CSV: MoneyPuck's one file, only the columns read", () => {
  const csv = Buffer.from(['shotID,xCordAdjusted,yCordAdjusted,other', '0,75,0,a', '1,60,-15,b', ''].join('\n'));
  const data = deflateRawSync(csv);
  const name = Buffer.from('shots.csv');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(csv.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(csv.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);
  const at = local.length + name.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(at, 16);
  const zip = Buffer.concat([local, name, data, central, name, end]);
  assert.equal(unzipFirst(zip).toString(), csv.toString());
  assert.deepEqual(parseShots(unzipFirst(zip).toString(), ['xCordAdjusted', 'yCordAdjusted']), [
    { xCordAdjusted: '75', yCordAdjusted: '0' },
    { xCordAdjusted: '60', yCordAdjusted: '-15' },
  ]);
  assert.throws(() => parseShots('a,b\n1,2', ['xCordAdjusted']), /no xCordAdjusted/);
  assert.throws(() => unzipFirst(Buffer.from('not a zip at all, not at all, not at all')), /not a zip/);
});

// ---- the committed files

const seasonDirs = [ROOT, ...fs.readdirSync(path.join(ROOT, 'seasons')).filter((d) => /^\d{4}$/.test(d) && Number(d) >= FIRST_SEASON).map((d) => path.join(ROOT, 'seasons', d))].filter((dir) =>
  fs.existsSync(path.join(dir, 'skill-players.json')),
);
const names = ['heat-maps.json', ...Object.values(GROUPS).map((g) => `heat-maps.${g}.json`)];
const isCell = (c) => c === 0 || (Array.isArray(c) && c.length >= 1 && c.length <= CELL.length && c.every((v) => Number.isInteger(v) && v >= 0));
const isRows = (r) => r === 0 || (Array.isArray(r) && r.length === ZONE_IDS.length && r.every(isCell));
const isEntry = (e) => ['ev', 'pp', 'ot'].every((k) => isRows(e[k])) && (!e.ty || Object.entries(e.ty).every(([t, r]) => TYPES.includes(t) && isRows(r)));
const attOf = (e) => ['ev', 'pp', 'ot'].reduce((a, k) => a + (e[k] ? e[k].reduce((b, c) => b + (c ? c[0] : 0), 0) : 0), 0);

for (const dir of seasonDirs) {
  const name = dir === ROOT ? 'current' : path.basename(dir);
  test(`heat-maps files (${name}): the contract, the site's keys, the league the teams added up, under 320 KB each`, () => {
    for (const f of names) {
      const file = path.join(dir, f);
      if (dir === ROOT && !fs.existsSync(file)) continue;
      assert.ok(fs.existsSync(file), `${f} written`);
      assert.ok(fs.statSync(file).size < 320 * 1024, `${f}: ${Math.round(fs.statSync(file).size / 1024)} KB`);
      const heat = readJson(file);
      assert.deepEqual(heat.fields.cell, CELL);
      assert.deepEqual(heat.fields.zones, ZONE_IDS);
      assert.ok(heat.regular, 'a regular season');
    }
    const main = readJson(path.join(dir, 'heat-maps.json'));
    const rows = {};
    for (const suffix of ['', '.post', '.all']) {
      const p = path.join(dir, `skill-players${suffix}.json`);
      if (!fs.existsSync(p)) continue;
      for (const [tab, list] of Object.entries(readJson(p))) for (const r of Array.isArray(list) ? list : []) (rows[tab] ??= new Set()).add(String(r.gsisId));
    }
    for (const part of [main.regular, main.post].filter(Boolean)) {
      assert.ok(isEntry(part.league));
      for (const [id, e] of Object.entries(part.goalies)) assert.ok(rows.G?.has(id) && isEntry(e), `goalie ${id}`);
      const teams = Object.keys(part.offense);
      assert.ok(teams.length >= 16 && teams.every((t) => main.teams[t]), 'every team named');
      for (const e of [...Object.values(part.offense), ...Object.values(part.defense)]) assert.ok(isEntry(e) && e.gp > 0);
      const league = attOf(part.league);
      assert.equal(Object.values(part.offense).reduce((a, e) => a + attOf(e), 0), league, "the offenses' shots, the league's");
      assert.equal(Object.values(part.defense).reduce((a, e) => a + attOf(e), 0), league, "the defenses' allowed, the league's");
    }
    for (const g of Object.values(GROUPS)) {
      const file = path.join(dir, `heat-maps.${g}.json`);
      if (!fs.existsSync(file)) continue;
      const sk = readJson(file);
      for (const part of [sk.regular, sk.post].filter(Boolean))
        for (const [id, e] of Object.entries(part)) {
          assert.ok(g === 'defense' ? rows.D?.has(id) : ['C', 'LW', 'RW'].some((t) => rows[t]?.has(id)) || rows.D?.has(id), `${g} ${id} a site row`);
          assert.ok(isEntry(e));
        }
    }
  });
}

test('all seasons under 14 MB; the rink drawn with the same sixteen zones', () => {
  const total = seasonDirs.reduce((n, dir) => n + names.reduce((m, f) => m + (fs.existsSync(path.join(dir, f)) ? fs.statSync(path.join(dir, f)).size : 0), 0), 0);
  assert.ok(total < 14 * 1024 * 1024, `${(total / 1048576).toFixed(1)} MB`);
  const rink = h.heatSurface('rink');
  assert.deepEqual(rink.cells.map((c) => c.id), ZONE_IDS, "the surface's cells, the script's zones");
  assert.deepEqual(h.RINK_ZONE_IDS, ZONE_IDS);
  for (const c of rink.cells) {
    assert.ok(c.points && c.name && Number.isFinite(c.cx) && Number.isFinite(c.cy), c.id);
    const xs = c.points.split(' ').map((p) => p.split(',').map(Number));
    assert.ok(xs.length >= 3 && xs.every(([x, y]) => x >= 0 && x <= 300 && y >= 0 && y <= 330), `${c.id} on the ice`);
  }
  assert.ok(rink.backdrop.length && rink.overlay.length && rink.aria);
  assert.ok(rink.cells.find((c) => c.id === 'corner-left').points.split(' ').length > 4, 'a corner rounded by the boards');
});

// ---- the maps from real seasons

function withFiles(fn) {
  return async () => {
    const real = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const file = path.join(ROOT, String(url).replace(/^data\//, ''));
      return fs.existsSync(file) ? { ok: true, json: async () => readJson(file) } : { ok: false, json: async () => null };
    };
    try {
      await fn();
    } finally {
      globalThis.fetch = real;
    }
  };
}
const q = (player, position, extra = {}) => ({ player, position, season: 2026, split: 'all', stat: null, side: null, ...extra });
const matthews = { id: 8479318, gsisId: '8479318', name: 'Auston Matthews', teamLogo: 'assets/NHL_Icons/TOR.svg' };
const makar = { id: 8480069, gsisId: '8480069', name: 'Cale Makar', teamLogo: 'assets/NHL_Icons/COL.svg' };
const hellebuyck = { id: 8476945, gsisId: '8476945', name: 'Connor Hellebuyck', teamLogo: 'assets/NHL_Icons/WPG.svg' };
const bruins = { id: null, gsisId: 'TM-BOS', name: 'Boston Bruins', teamLogo: 'assets/NHL_Icons/BOS.svg' };

test(
  "NHL maps from 2025-26's files: a sniper's shots and mix, a defenseman's, a goalie's saves and types, a team's two sides",
  withFiles(async () => {
    const defs = h.nhlHeatMaps({ current: () => false });
    const by = (id) => defs.find((d) => d.id === id);
    const shots = await by('shots').load(q(matthews, 'C'));
    assert.equal(shots.surface, 'rink');
    assert.deepEqual(shots.cells.map((c) => c.id), h.ZONE_IDS);
    assert.equal(shots.stat.key, 'gax', 'goals against expected first: the xG-based efficiency');
    assert.ok(shots.cells.reduce((n, c) => n + c.n, 0) > 250, "a season's shots");
    assert.ok(shots.chips.some((c) => c.label === 'Goals vs xG') && shots.chipsTitle === 'His Shots');
    const slot = shots.cells.find((c) => c.id === 'slot');
    assert.ok(slot.sd > 0 && slot.detail[0].includes('expected'), "a cell's luck, and its goals on expected in the hover");
    assert.equal(shots.stat.vs, 'average');
    const sh = await by('shots').load(q(matthews, 'C', { stat: 'shpct' }));
    assert.equal(sh.stat.vs, 'expected');
    assert.ok(sh.cells.every((c) => c.made === undefined || c.made <= c.n));
    const pp = await by('shots').load(q(matthews, 'C', { split: 'pp' }));
    assert.ok(pp.cells.reduce((n, c) => n + c.n, 0) < shots.cells.reduce((n, c) => n + c.n, 0), 'the power play a part of it');
    const reb = await by('shots').load(q(matthews, 'C', { split: 'reb', stat: 'shpct' }));
    assert.ok(!reb.stats.some((s) => s.key === 'shpct') && reb.stat.key === 'gax', 'no shots on goal kept for rebounds');
    const mix = await by('mix').load(q(matthews, 'C'));
    assert.ok(Math.abs(mix.cells.reduce((a, c) => a + (c.value ?? 0), 0) - 1) < 1e-9, 'shares add up to all of his shots');
    assert.equal(mix.stat.scale, 'lean');
    const d = await by('shots').load(q(makar, 'D'));
    assert.ok(d && d.cells.find((c) => c.id === 'point-middle').n + d.cells.find((c) => c.id === 'point-left').n + d.cells.find((c) => c.id === 'point-right').n > 40, "a defenseman's shots from the points");
    // the goalie: his own defs, his penalty kill, his types
    const splits = by('saves').splits(2026, null);
    assert.equal(splits.find((s) => s.id === 'pp').label, 'PK');
    assert.equal(by('shots').splits(2026, 'offense').find((s) => s.id === 'pp').label, 'PP');
    assert.equal(by('shots').splits(2026, 'defense').find((s) => s.id === 'pp').label, 'PK', "a team's Defense side: its penalty kill");
    const saves = await by('saves').load(q(hellebuyck, 'G'));
    assert.equal(saves.stat.key, 'gsax');
    assert.ok(saves.cells.reduce((n, c) => n + c.n, 0) > 1500);
    const types = await by('types').load(q(hellebuyck, 'G', { stat: 'slap' }));
    assert.equal(types.stat.key, 'slap');
    assert.ok(types.cells.reduce((n, c) => n + c.n, 0) < saves.cells.reduce((n, c) => n + c.n, 0));
    assert.equal(await by('types').load(q(hellebuyck, 'G', { split: 'ev' })), null, 'his types: every situation only');
    assert.ok(await by('faced').load(q(hellebuyck, 'G', { split: 'ev' })), "in its place, the mix he faced");
    assert.equal(await by('faced').load(q(hellebuyck, 'G')), null);
    // the team
    const off = await by('shots').load(q(bruins, 'TM', { side: 'offense' }));
    const def = await by('shots').load(q(bruins, 'TM', { side: 'defense' }));
    assert.equal(off.stat.key, 'xgpg');
    assert.equal(off.chips[0].label, 'xG share', "a team's headline first");
    assert.equal(off.defense, false);
    assert.equal(def.defense, true);
    assert.equal(def.title, 'Shots Against by Zone');
    const coach = await by('shots').load(q({ ...bruins, gsisId: 'marco-sturm' }, 'HC', { side: 'offense' }));
    assert.deepEqual(coach.cells, off.cells, "a coach's card reads as his team");
    // (the league's xG a game: the offenses' average)
    const lg = off.cells.find((c) => c.id === 'slot').league;
    assert.ok(lg > 0.1 && lg < 1, `a slot's xG a game ${lg}`);
  }),
);

test(
  "the AI preview's matchups, ESPN's codes as the site's, and the season being played's fallback",
  withFiles(async () => {
    const maps = await h.heatMatchups(bruins, 'TM', 2026, 'LA', false);
    assert.equal(maps.length, 2);
    assert.equal(maps[0].title, 'Bruins chances vs Kings D');
    assert.equal(maps[1].defense, true);
    assert.equal(maps[0].surface, 'rink');
    assert.deepEqual(await h.heatMatchups(matthews, 'C', 2026, 'LA', false), [], 'teams only');
    assert.equal(h.siteTeam('NJ', { NJD: 'New Jersey Devils' }), 'NJD');
    assert.equal(h.siteTeam('UTAH', { UTA: 'Utah Mammoth' }), 'UTA');
    assert.equal(h.siteTeam('ARI', { PHX: 'Phoenix Coyotes' }), 'PHX');
    assert.equal(h.nickname('Toronto Maple Leafs', 'TOR'), 'Maple Leafs');
    assert.equal(h.nickname('Utah Hockey Club', 'UTA'), 'Utah');
    assert.equal(h.logoAbbr('assets/NHL_Icons/WSH_secondary.svg'), 'WSH');
    assert.equal(h.logoAbbr('assets/NHL_Icons/PHX_20032004-20132014.svg'), 'PHX');
    assert.equal(h.signed1(-0.04), '0.0');
    assert.equal(h.thou(0.9154), '.915');
    // the week's next game
    const week = [{ date: '2026-10-16', opp: 'ANA' }, { date: '2026-10-18', opp: 'LA' }];
    assert.equal(h.nextWeekGame(week, new Date(2026, 9, 16, 22)).opp, 'ANA', 'today’s still to come');
    assert.equal(h.nextWeekGame(week, new Date(2026, 9, 17)).opp, 'LA');
    assert.equal(h.nextWeekGame(week, new Date(2026, 9, 19)), null);
    // the season being played: last season's behind its thin zones
    const now = readJson(path.join(ROOT, 'heat-maps.json')).season;
    const defs = h.nhlHeatMaps({ current: (s) => s === now });
    const m = await defs.find((d) => d.id === 'shots').load({ ...q(matthews, 'C'), season: now });
    assert.ok(m, 'a map early in the season');
    assert.equal(m.fallbackLabel, `${now - 2}-${String((now - 1) % 100).padStart(2, '0')}`);
    assert.ok(m.fallback.length === 16);
    const team = await h.heatMatchups(bruins, 'TM', now, 'ANA', true);
    assert.ok(team.length >= 1 && team.every((x) => x.fallbackLabel), 'the AI minis from the first weeks, last season behind them');
  }),
);
