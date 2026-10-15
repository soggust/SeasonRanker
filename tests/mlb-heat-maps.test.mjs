// MLB's Heat Maps (apps/mlb/scripts/statcast.mjs and build-heat-maps.mjs, apps/mlb/src/sport/heat-maps.ts, the
// strike zone, spray fan and diamond surfaces): the zone grid's binning by the batter's own zone, a ball in
// play's direction by the hitter's side (pull and opposite field swap for a lefty), its type and cell, what a
// plate appearance was worth, the tally on hand-made pitches, the packing and the pitch types folded, Savant's
// CSV read, the Outs Above Average boards mapped to teams and fielders, the files spread under the cap, every
// committed file against its contract and size, the surfaces' cells the script's, and the maps read from the
// real files: a slugger's spray chart and hot zones, an ace's location by pitch type and his damage zones, a
// shortstop's fielding, a team's defense; and the old Zones tab's links opening the Heat Maps.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, readJson, staticDir } from './support/engine.mjs';
import {
  DEF_FIELDS,
  DEF_POSITIONS,
  MAX_BYTES,
  PITCHER_FIELDS,
  PITCH_TYPES,
  SPRAY_FIELDS,
  SPRAY_IDS,
  ZONE_FIELDS,
  ZONE_IDS,
  bucketize,
  buildFiles,
  defRow,
  defenseOf,
  homeRun,
  isSwing,
  isWhiff,
  packCell,
  packPitcher,
  packRows,
  paValue,
  parseBoard,
  sprayAngle,
  sprayCell,
  sprayDir,
  tally,
  typeOf,
  zoneCell,
} from '../apps/mlb/scripts/build-heat-maps.mjs';
import { COLUMNS, parseSearch, splitCsvLine } from '../apps/mlb/scripts/statcast.mjs';

const ROOT = staticDir('mlb');
let h;
before(async () => {
  h = await loadEngine('mlb', { entry: path.join(import.meta.dirname, 'support', 'mlb-heat-entry.ts'), data: {} });
});
const zone = (x, z, top = '3.5', bot = '1.5') => ZONE_IDS[zoneCell(x, z, top, bot)];

// ---- the binning

test("the strike zone: 5 x 5 from the catcher's view, the zone the batter's own, everything further out in the ring", () => {
  assert.equal(zone('0', '2.5'), 'z22', 'down the middle: the heart');
  assert.equal(zone('-0.5', '3.2'), 'z11', "high, the catcher's left");
  assert.equal(zone('0.5', '1.7'), 'z33', "low, the catcher's right");
  assert.equal(zone('-1.2', '2.5'), 'z20', 'off the plate left: the chase ring');
  assert.equal(zone('3', '6'), 'z04', 'way up and away: clamped into the corner');
  assert.equal(zone('0', '0.4'), 'z42', 'in the dirt: below');
  // (the zone follows the batter: his own top and bottom, a ball's width past each)
  assert.equal(zone('0', '3.3', '3.2', '1.4'), 'z12', "a ball's width over his top still clips the zone");
  assert.equal(zone('0', '3.4', '3.2', '1.4'), 'z02', 'over it: above the zone');
  assert.equal(zone('0', '3.4', '3.9', '1.9'), 'z12', "the same pitch high in a tall hitter's");
  assert.equal(zone('0', '2.0', 'x', ''), 'z32', 'no zone given: a standard one, 1.6 to 3.4');
  assert.deepEqual([zoneCell('', '2'), zoneCell('0', ''), zoneCell('a', '2'), zoneCell(undefined, '2')], [-1, -1, -1, -1]);
  // (the plate's edge and a ball's width: 0.83 feet either side)
  assert.equal(zone('0.82', '2.5'), 'z23');
  assert.equal(zone('0.84', '2.5'), 'z24');
  // (every cell reachable)
  const hit = new Set();
  for (let x = -3; x <= 3; x += 0.05) for (let z = 0; z <= 5; z += 0.05) hit.add(zoneCell(String(x), String(z), '3.5', '1.5'));
  assert.equal(hit.size, 25);
});

test("the spray: a ball's direction off center, pull and opposite field by the hitter's side", () => {
  // (Gameday's hit coordinates: home plate at 125.42, 198.27, left field to the smaller x)
  assert.ok(Math.abs(sprayAngle('125.42', '98.27')) < 0.01, 'straightaway center');
  assert.ok(sprayAngle('60', '130') < -40, 'down the left-field line');
  assert.ok(sprayAngle('190', '130') > 40, 'down the right-field line');
  assert.equal(sprayAngle('', '100'), null);
  assert.equal(sprayDir(-30, 'R'), 'pull', "a right-handed hitter's ball to left: pulled");
  assert.equal(sprayDir(-30, 'L'), 'oppo', "a left-handed hitter's ball to left: the opposite field");
  assert.equal(sprayDir(30, 'L'), 'pull', "a lefty's ball to right: pulled");
  assert.equal(sprayDir(30, 'R'), 'oppo');
  assert.equal(sprayDir(10, 'L'), 'center', '15 degrees either side of center');
  assert.equal(sprayDir(-15, 'R'), 'center');
  assert.equal(sprayDir(null, 'R'), null);
  const ball = (hc_x, stand, bb_type) => ({ hc_x, hc_y: '120', stand, bb_type });
  assert.equal(SPRAY_IDS[sprayCell(ball('70', 'R', 'fly_ball'))], 'pull-fb');
  assert.equal(SPRAY_IDS[sprayCell(ball('70', 'L', 'fly_ball'))], 'oppo-fb', 'the same ball, a lefty: the other way');
  assert.equal(SPRAY_IDS[sprayCell(ball('180', 'L', 'ground_ball'))], 'pull-gb');
  assert.equal(SPRAY_IDS[sprayCell(ball('125', 'R', 'popup'))], 'center-pu');
  assert.equal(SPRAY_IDS[sprayCell(ball('125', 'R', 'line_drive'))], 'center-ld');
  assert.equal(sprayCell(ball('125', 'R', '')), -1, 'no type: not a ball in play');
  assert.equal(sprayCell(ball('', 'R', 'fly_ball')), -1, 'no spot');
  assert.equal(SPRAY_IDS.length, 12);
  assert.deepEqual(homeRun({ hc_x: '60', hc_y: '60', hit_distance_sc: '421', launch_speed: '108.4', p_throws: 'L' }).slice(1), [421, 108, 1]);
  assert.equal(homeRun({ hc_x: '', hc_y: '60', hit_distance_sc: '421' }), null);
});

test("a pitch's parts: its type, a swing and a whiff, what the plate appearance it ended was worth", () => {
  assert.deepEqual(['FF', 'FT', 'KC', 'SV', 'FO', 'EP', 'XX'].map(typeOf), ['FF', 'SI', 'CU', 'ST', 'FS', 'OT', 'OT']);
  assert.deepEqual(['PO', 'IN', 'AB'].map(typeOf), [null, null, null], 'pitchouts, intentional and automatic balls left out');
  assert.ok(isSwing('foul') && isSwing('hit_into_play') && isSwing('swinging_strike_blocked') && !isSwing('ball') && !isSwing('called_strike') && !isSwing('foul_bunt'));
  assert.ok(isWhiff('swinging_strike') && !isWhiff('foul_tip'));
  assert.equal(paValue({ woba_denom: '', woba_value: '' }), null, 'the plate appearance went on');
  assert.equal(paValue({ woba_denom: '1', bb_type: 'fly_ball', estimated_woba_using_speedangle: '1.2', woba_value: '2' }), 1.2, 'in play: its expected');
  assert.equal(paValue({ woba_denom: '1', bb_type: '', estimated_woba_using_speedangle: '', woba_value: '0.7' }), 0.7, 'a walk: its wOBA');
  assert.equal(paValue({ woba_denom: '1', bb_type: '', estimated_woba_using_speedangle: '0', woba_value: '0' }), 0, 'a strikeout');
});

const pitch = (o = {}) => ({
  pitcher: '1',
  batter: '9',
  stand: 'R',
  p_throws: 'L',
  pitch_type: 'FF',
  release_speed: '95.0',
  plate_x: '0',
  plate_z: '2.5',
  sz_top: '3.5',
  sz_bot: '1.5',
  description: 'ball',
  events: '',
  bb_type: '',
  hc_x: '',
  hc_y: '',
  launch_speed: '',
  estimated_woba_using_speedangle: '',
  woba_value: '',
  woba_denom: '',
  hit_distance_sc: '',
  ...o,
});

test("the tally on hand-made pitches: the league's by side and hand, a pitcher's by type and side, a hitter's by hand", () => {
  const pitches = [
    pitch(),
    pitch({ description: 'swinging_strike', events: 'strikeout', woba_denom: '1', woba_value: '0', estimated_woba_using_speedangle: '0' }),
    pitch({ pitch_type: 'SL', release_speed: '86.0', plate_x: '-1.5', description: 'foul' }),
    pitch({ description: 'hit_into_play', events: 'home_run', bb_type: 'fly_ball', hc_x: '60', hc_y: '70', launch_speed: '110', hit_distance_sc: '430', estimated_woba_using_speedangle: '1.9', woba_value: '2', woba_denom: '1' }),
    pitch({ stand: 'L', p_throws: 'R', pitcher: '2', description: 'hit_into_play', events: 'single', bb_type: 'ground_ball', hc_x: '60', hc_y: '150', launch_speed: '95', estimated_woba_using_speedangle: '0.4', woba_value: '0.9', woba_denom: '1' }),
    pitch({ pitch_type: 'PO' }),
    pitch({ plate_x: '' }),
  ];
  const t = tally(pitches, { pitchers: new Set(['1', '2']), hitters: new Set(['9']) });
  const z22 = ZONE_IDS.indexOf('z22');
  // (the league's: right-handed batters against left-handed pitchers, the four-seamers)
  const ff = t.league.zone.RL.FF;
  assert.deepEqual(ff[z22].slice(0, 5), [3, 2, 1, 2, 1900], 'three pitches, two swings, a whiff, two plate appearances ended worth 1.9');
  assert.deepEqual(ff[z22].slice(5), [1, 1100, 1, 1900], 'a ball in play at 110 mph, its xwOBA 1.9');
  assert.equal(t.league.zone.RL.SL[ZONE_IDS.indexOf('z20')][0], 1, 'the slider off the plate: the chase ring');
  assert.equal(t.league.zone.LR.FF[z22][0], 1, "a lefty batter's against a righty");
  const p1 = t.pitchers.get('1');
  assert.equal(p1.t.FF.R[z22][0], 3, 'his four-seamers to right-handed hitters');
  assert.deepEqual(p1.v.FF, [4, 3800], 'their speed in tenths (the unspotted one timed too)');
  assert.deepEqual(p1.h, { L: 5, R: 0 }, 'the hand his pitches came from (no pitchout)');
  const hit = t.hitters.get('9');
  assert.equal(hit.z.L[z22][0], 3, "his pitches seen from the left-hander");
  assert.equal(hit.s.L[SPRAY_IDS.indexOf('pull-fb')][0], 1, 'his home run: a pulled fly ball');
  assert.equal(hit.s.L[SPRAY_IDS.indexOf('pull-fb')][5], 1);
  assert.equal(hit.s.R[SPRAY_IDS.indexOf('oppo-gb')][0], 1, "batting left against the righty: the same spot's the opposite field");
  assert.deepEqual(hit.b, { L: [0, 1], R: [1, 0] }, 'his side by hand: right against the lefty, left against the righty');
  assert.equal(hit.hr.length, 1);
  assert.equal(hit.hr[0][1], 430);
  // (the league's spray by the pitcher's hand)
  assert.equal(t.league.spray.L[SPRAY_IDS.indexOf('pull-fb')][0], 1);
});

test("packing: trailing zeros dropped, empty rows a plain 0, a pitcher's rare pitches folded into Other", () => {
  assert.deepEqual(packCell([3, 1, 0, 0]), [3, 1]);
  assert.equal(packCell([0, 0]), 0);
  assert.equal(packRows([[0], [0, 0]]), 0);
  assert.deepEqual(packRows([[0], [2, 0]]), [0, [2]]);
  const rows = (n) => Array.from({ length: 25 }, (_, i) => [i === 12 ? n : 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const e = { t: { FF: { L: rows(500), R: rows(500) }, KN: { L: rows(3), R: rows(0) }, SL: { L: rows(200), R: rows(0) } }, v: { FF: [1000, 950000], KN: [3, 2400], SL: [200, 170000] }, h: { L: 2, R: 1700 } };
  const p = packPitcher(e);
  assert.deepEqual(Object.keys(p.t).sort(), ['FF', 'OT', 'SL'], 'three knuckleballs of 1,203: his Other');
  assert.deepEqual(p.v.OT, [3, 2400]);
  assert.equal(p.h, 'R');
  assert.equal(p.t.FF.L[12].length, 1, "a pitcher's cell: five fields at most, its zeros dropped");
  assert.deepEqual(PITCHER_FIELDS, ZONE_FIELDS.slice(0, 5));
});

test("Savant's CSVs: quoted fields with commas, an error page refused; the columns kept", () => {
  assert.deepEqual(splitCsvLine('"a, b",1,"say ""hi"""'), ['a, b', '1', 'say "hi"']);
  const csv = '﻿"pitch_type","game_date","des","plate_x","pitcher"\n"FF","2025-06-01","Judge homers, his 20th",0.12,592450\n';
  const rows = parseSearch(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][COLUMNS.indexOf('pitch_type')], 'FF');
  assert.equal(rows[0][COLUMNS.indexOf('plate_x')], '0.12');
  assert.equal(rows[0][COLUMNS.indexOf('pitcher')], '592450');
  assert.equal(rows[0][COLUMNS.indexOf('hc_x')], '', 'a column it lacks: blank');
  assert.equal(parseSearch('<html>busy</html>'), null);
  assert.equal(parseBoard('<html>'), null);
});

test("Outs Above Average: a team's rows by its id, who played each spot most first, each fielder's positions", () => {
  const team = (id, name, oaa) => ({ team_id: id, team_name: name, outs_above_average: String(oaa), outs_above_average_infront: '2', actual_success_rate_formatted: '80%', adj_estimated_success_rate_formatted: '78%' });
  const fielder = (id, name, teamName, oaa, outs) => ({
    player_id: id,
    'last_name, first_name': name,
    display_team_name: teamName,
    outs_above_average: String(oaa),
    fielding_runs_prevented: String(Math.round(oaa * 0.8)),
    frv: { outs_total: String(outs), range_runs: '3.25', arm_runs: '-1' },
  });
  const def = { teams: {}, players: {} };
  for (const pos of DEF_POSITIONS) {
    def.teams[pos] = [team(118, 'Royals', pos === 'SS' ? 20 : 1), team(147, 'Yankees', -3)];
    def.players[pos] = pos === 'SS' ? [fielder(1, 'Garcia, Maikel', 'Royals', -2, 300), fielder(677951, 'Witt Jr., Bobby', 'Royals', 24, 4000)] : [];
  }
  const d = defenseOf(def);
  assert.deepEqual(d.teams['118'].rows.SS.slice(0, 3), [20, 0, 2]);
  assert.deepEqual(d.teams['118'].who.SS, [['B. Witt Jr.', 24], ['M. Garcia', -2]], 'who played it most first');
  assert.equal(d.fielders.get('677951').SS[DEF_FIELDS.indexOf('outs')], 4000);
  assert.equal(d.fielders.get('677951').SS[DEF_FIELDS.indexOf('range')], 33, 'range runs in tenths');
  assert.equal(d.sd.team.SS, Math.round(Math.sqrt((20 - 8.5) ** 2 + (-3 - 8.5) ** 2) * 100) / 100);
  assert.deepEqual(defRow({ actual_success_rate_formatted: '75%', adj_estimated_success_rate_formatted: '' }, null).slice(6, 8), [750, 0]);
});

test('the files: rows spread by id over the fewest files under the cap; a season built on hand-made pitches', () => {
  const rows = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [String(1000 + i), { x: 'y'.repeat(200) }]));
  const files = bucketize(rows, { season: 2025 }, 3000);
  assert.ok(files.length > 1 && files.every((f) => JSON.stringify(f).length <= 3000));
  for (const f of files) for (const id of Object.keys(f.rows)) assert.equal(Number(id) % files.length, f.bucket);
  assert.equal(bucketize(rows, {}, 1e6).length, 1);
  const b = buildFiles(2025, [pitch(), pitch({ stand: 'L' })], { keys: { pitchers: new Set(['1']), hitters: new Set(['9']) }, parks: { 147: 'Yankee Stadium' } });
  assert.deepEqual(b.main.buckets, { p: 1, h: 1 });
  assert.deepEqual(b.main.fields.zones, ZONE_IDS);
  assert.ok(b.pitchers[0].rows['1'].t.FF && b.hitters[0].rows['9'].z);
  assert.equal(buildFiles(2025, []), null);
});

// ---- the committed files

const seasonDirs = () => {
  const dirs = [ROOT, ...fs.readdirSync(path.join(ROOT, 'seasons')).map((y) => path.join(ROOT, 'seasons', y))];
  return dirs.filter((d) => fs.existsSync(path.join(d, 'heat-maps.json')));
};

test('heat-maps files: the contract, every bucket there and its ids its own, each under 300 KB', () => {
  const dirs = seasonDirs();
  assert.ok(dirs.length >= 1, 'a season built');
  let all = 0;
  for (const dir of dirs) {
    const main = readJson(path.join(dir, 'heat-maps.json'));
    const where = path.relative(ROOT, dir) || 'current';
    assert.ok(main.season >= 2015, where);
    assert.deepEqual(main.fields.zones, ZONE_IDS);
    assert.deepEqual(main.fields.sprays, SPRAY_IDS);
    assert.deepEqual(main.fields.zone, ZONE_FIELDS);
    assert.deepEqual(main.fields.spray, SPRAY_FIELDS);
    assert.deepEqual(main.fields.types, PITCH_TYPES);
    assert.ok(main.pitches > 100000, `${where}: a whole season's pitches`);
    for (const [k, rows] of Object.entries(main.league.zone)) {
      assert.match(k, /^[LR][LR]$/);
      for (const [type, r] of Object.entries(rows)) assert.ok(PITCH_TYPES.includes(type) && (r === 0 || r.length === 25));
    }
    assert.ok(Object.keys(main.parks).length >= 30, `${where}: every team's park`);
    if (main.season >= 2016) assert.equal(Object.keys(main.defense.teams).length, 30, `${where}: every team's defense`);
    for (const kind of ['p', 'h']) {
      for (let k = 0; k < main.buckets[kind]; k++) {
        const file = path.join(dir, `heat-maps.${kind}${k}.json`);
        const size = fs.statSync(file).size;
        all += size;
        assert.ok(size <= 300 * 1024, `${where}/${path.basename(file)}: ${Math.round(size / 1024)} KB`);
        const f = readJson(file);
        assert.equal(f.season, main.season);
        for (const id of Object.keys(f.rows)) assert.equal(Number(id) % main.buckets[kind], k);
      }
      assert.ok(!fs.existsSync(path.join(dir, `heat-maps.${kind}${main.buckets[kind]}.json`)), 'no stale file past the count');
    }
    all += fs.statSync(path.join(dir, 'heat-maps.json')).size;
    assert.ok(fs.statSync(path.join(dir, 'heat-maps.json')).size <= MAX_BYTES);
  }
  assert.ok(all < 45 * 1024 * 1024, `all seasons: ${Math.round(all / 1024 / 1024)} MB`);
});

// ---- the surfaces

test("the surfaces: their cells the script's, each named; the spray fan's two hands mirrored; the diamond's infield roomy", () => {
  assert.deepEqual(
    h.heatSurface('strike-zone').cells.map((c) => c.id),
    ZONE_IDS,
  );
  assert.deepEqual(h.ZONE_CELL_IDS, ZONE_IDS);
  assert.deepEqual(h.SPRAY_CELL_IDS, SPRAY_IDS);
  assert.deepEqual([...h.DIAMOND_POSITIONS], DEF_POSITIONS);
  assert.equal(h.zoneCellName(2, 2), 'Heart of the zone');
  assert.equal(h.zoneCellName(0, 0), 'Chase: above the zone, left');
  assert.equal(h.zoneCellName(1, 3), 'High right');
  assert.equal(h.ZONE_CELL_IDS.filter(h.IN_ZONE).length, 9);
  const r = h.heatSurface('spray-fan');
  const l = h.heatSurface('spray-fan-l');
  assert.deepEqual(new Set(r.cells.map((c) => c.id)), new Set(SPRAY_IDS));
  const cx = (s, id) => s.cells.find((c) => c.id === id).cx;
  assert.ok(cx(r, 'pull-fb') < cx(r, 'center-fb') && cx(r, 'center-fb') < cx(r, 'oppo-fb'), "a righty's pull side to left field");
  assert.ok(cx(l, 'pull-fb') > cx(l, 'oppo-fb'), "a lefty's to right");
  const d = h.heatSurface('diamond-field');
  assert.deepEqual(
    d.cells.map((c) => c.id),
    DEF_POSITIONS,
  );
  assert.ok(h.WARP(400) === 400 && h.WARP(90) > 150, 'the diamond: the infield drawn larger, center field where it is');
  for (const s of [r, l, d, h.heatSurface('strike-zone')]) assert.ok(s.overlay.length && s.aria && s.cells.every((c) => c.name));
});

// ---- the maps from the real files

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
const CURRENT = readJson(path.join(ROOT, 'heat-maps.json')).season;
const q = (player, position, extra = {}) => ({ player, position, season: CURRENT, split: 'all', stat: null, side: null, option: null, ...extra });
const rowOf = (tab, name) => readJson(path.join(ROOT, 'skill-players.json'))[tab].find((r) => r.name.includes(name));
const defs = () => {
  const list = h.mlbHeatMaps({ current: (s) => s === CURRENT });
  return (id) => list.find((d) => d.id === id);
};
const counted = (m) => m.cells.reduce((a, c) => a + (c.count ?? 0), 0);

test(
  "a slugger's maps: his spray chart (pulled, his home runs over his park's wall), his hot zones, his fielding",
  withFiles(async () => {
    const by = defs();
    const judge = rowOf('OF', 'Aaron Judge');
    const s = await by('spray').load(q(judge, 'OF'));
    assert.equal(s.surface, 'spray-fan', 'a right-handed hitter');
    assert.equal(s.stat.key, 'xwoba', 'xwOBA first: the efficiency');
    assert.deepEqual(
      s.cells.map((c) => c.id),
      SPRAY_IDS,
    );
    assert.ok(s.cells.every((c) => c.league > 0), "the league's in every cell");
    const pullFb = s.cells.find((c) => c.id === 'pull-fb');
    assert.ok(pullFb.value > pullFb.league, 'his pulled fly balls: damage');
    assert.ok(s.marks.length >= 10 && s.marks.every((m) => /^Home run: \d+ ft/.test(m.title)), 'his home runs');
    assert.ok(s.layers.some((p) => p.cls === 'hm-wall park'), "his park's wall");
    assert.ok(s.chips.some((c) => c.label === 'Pulled in the air'));
    const vl = await by('spray').load(q(judge, 'OF', { split: 'vl' }));
    assert.ok(counted(vl) < counted(s), 'against lefties: fewer');
    assert.ok(vl.marks.length < s.marks.length);
    const share = await by('spray').load(q(judge, 'OF', { stat: 'share' }));
    assert.equal(share.stat.scale, 'lean');
    assert.ok(Math.abs(share.cells.reduce((a, c) => a + (c.value ?? 0), 0) - 1) < 1e-9, 'the shares add up');
    const z = await by('zones').load(q(judge, 'OF'));
    assert.equal(z.surface, 'strike-zone');
    assert.deepEqual(
      z.cells.map((c) => c.id),
      ZONE_IDS,
    );
    assert.equal(z.stat.per, 'xwOBA on contact', "a hitter's damage: his contact, not a chase pitch's walks");
    assert.ok(z.chips.some((c) => c.label === 'Chase rate'));
    const f = await by('fielding').load(q(judge, 'OF'));
    assert.ok(f === null || f.cells.some((c) => c.n > 0), 'his positions, when he played the field');
  }),
);

test(
  "an ace's maps: location by pitch type, his arsenal, a side's damage zones",
  withFiles(async () => {
    const by = defs();
    const skubal = rowOf('SP', 'Tarik Skubal');
    const loc = await by('location').load(q(skubal, 'SP'));
    assert.equal(loc.stat.key, 'xwoba');
    assert.equal(loc.options.value, 'all');
    assert.ok(loc.options.items.length >= 4 && loc.options.items.slice(1).every((it) => it.color), 'his pitches, each in its color');
    assert.ok(loc.chips.length >= 4 && loc.chipsTitle === 'Arsenal');
    const type = loc.options.items[1].key;
    const one = await by('location').load(q(skubal, 'SP', { option: type, stat: 'whiff' }));
    assert.equal(one.options.value, type);
    assert.equal(one.stat.key, 'whiff');
    assert.ok(counted(one) < counted(loc), 'one pitch: fewer pitches');
    const freq = await by('location').load(q(skubal, 'SP', { stat: 'freq', split: 'vr' }));
    assert.ok(Math.abs(freq.cells.reduce((a, c) => a + (c.value ?? 0), 0) - 1) < 1e-9);
    const dmg = await by('damage').load(q(skubal, 'SP', { split: 'vr' }));
    assert.equal(dmg.title, 'RHH Damage Zones');
    assert.equal(dmg.stats.length, 0, 'the split picks the side');
    assert.ok(dmg.cells.every((c) => /%$/.test(c.label)));
    assert.ok(dmg.chips.some((c) => c.label === 'Damage by location'));
    const lefties = await by('damage').load(q(skubal, 'SP', { stat: 'L' }));
    assert.equal(lefties.title, 'LHH Damage Zones');
  }),
);

test(
  "a shortstop's fielding and a team's defense: Outs Above Average by position",
  withFiles(async () => {
    const by = defs();
    const witt = rowOf('SS', 'Bobby Witt');
    const f = await by('fielding').load(q(witt, 'SS'));
    const ss = f.cells.find((c) => c.id === 'SS');
    assert.ok(ss.n > 1000 && ss.value !== null && ss.sd > 0, 'his shortstop: his outs there, his OAA');
    assert.ok(f.cells.filter((c) => c.n === 0).every((c) => c.value === null), 'the rest: none');
    assert.ok(f.chips.some((c) => c.label === 'Coming in'));
    const royals = rowOf('TM', 'Kansas City');
    assert.equal(h.teamIdOf(royals), '118');
    const t = await by('team-defense').load(q(royals, 'TM'));
    assert.equal(by('team-defense').volume, false, 'nothing for Volume to change');
    assert.deepEqual(
      t.cells.map((c) => c.id),
      DEF_POSITIONS,
    );
    assert.ok(t.cells.every((c) => c.n === 1 && c.value !== null));
    assert.ok(t.cells.find((c) => c.id === 'SS').detail.some((d) => /Witt/.test(d)));
    assert.match(t.chips[0].sub, /^#\d+ of 30 teams$/);
    const sr = await by('team-defense').load(q(royals, 'TM', { stat: 'sr' }));
    assert.equal(sr.stat.key, 'sr');
  }),
);

test("the old Zones tab's links open the Heat Maps", () => {
  assert.equal(h.cardTabOf('zones'), 'heatmaps');
  assert.equal(h.cardTabOf('heatmaps'), 'heatmaps');
});
