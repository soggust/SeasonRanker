// The Heat Maps (libs/ranker/src/engine/heat-map, apps/nfl/src/sport/heat-maps.ts, build-field-maps.mjs's
// heat-maps.json): the binning on hand-made plays (the red zone, end-zone throws and the inside-10 and -5
// shares, the field-position bands, the down & distance grid), every committed file against its contract, the
// colors (the diverging scale against the league's, capped and never past 0.85; a defense's flipped; small
// samples greyed; the volume's one hue; a matchup's two together), the surfaces' cells, the NFL's maps read
// from a real season.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, readJson, staticDir } from './support/engine.mjs';
import { BAND_NAMES, DOWN_NAMES, HEAT_FIELDS, bandIndex, downIndex, heatSection, inRedZone, intoEndZone } from '../apps/nfl/scripts/build-field-maps.mjs';

const ENTRY = path.join(import.meta.dirname, 'support', 'heat-entry.ts');
let h;
before(async () => {
  h = await loadEngine('nfl', { entry: ENTRY, data: {} });
});

// ---- the binning

test('bands, the grid and the red zone: where a snap lands', () => {
  // (yards to go to score: 100 his own goal line, 1 their 1)
  assert.deepEqual([100, 91, 90, 51, 50, 41, 21, 20, 11, 10, 1].map(bandIndex), [0, 0, 1, 4, 5, 5, 7, 8, 8, 9, 9]);
  assert.deepEqual(['0', '101', 'NA', ''].map(bandIndex), [-1, -1, -1, -1]);
  assert.equal(BAND_NAMES.length, 10);
  assert.equal(BAND_NAMES[0], 'own 0-10');
  assert.equal(BAND_NAMES[9], 'opp 10-0');
  // (1st & 10 is long; 3rd & 3 short; 2nd & 7 medium; 4th & 1 short)
  assert.equal(downIndex('1', '10'), 2);
  assert.equal(downIndex('3', '3'), 6);
  assert.equal(downIndex('2', '7'), 4);
  assert.equal(downIndex('4', '1'), 9);
  assert.equal(downIndex('4', '15'), 11);
  assert.deepEqual([downIndex('NA', '10'), downIndex('5', '3'), downIndex('1', '0')], [-1, -1, -1]);
  assert.equal(DOWN_NAMES[6], '3-short');
  assert.deepEqual([21, 20, 5, 1, 0, 'NA'].map(inRedZone), [false, true, true, true, false, false]);
  assert.equal(intoEndZone('12', '12'), true, 'as far in the air as the goal line: into the end zone');
  assert.equal(intoEndZone('11', '12'), false);
  assert.equal(intoEndZone('NA', '5'), false);
});

const play = (fields) => ({ season_type: 'REG', game_id: 'G1', posteam: 'KC', defteam: 'OAK', two_point_attempt: '0', sack: '0', qb_kneel: '0', qb_spike: '0', qb_scramble: '0', down: '1', ydstogo: '10', ...fields });
const PLAYS = [
  // the red zone: a throw from the 15 into the end zone (a touchdown) to WR1, one from the 8 short to WR2, a
  // run from the 4 by RB1 (a touchdown), a run from the 18 by RB1
  play({ play_type: 'pass', pass: '1', pass_attempt: '1', pass_location: 'left', air_yards: '15', yardline_100: '15', complete_pass: '1', pass_touchdown: '1', epa: '2', cpoe: '10', yards_after_catch: '0', passer_player_id: 'QB1', receiver_player_id: 'WR1' }),
  play({ play_type: 'pass', pass: '1', pass_attempt: '1', pass_location: 'middle', air_yards: '3', yardline_100: '8', complete_pass: '0', epa: '-0.5', cpoe: '-20', passer_player_id: 'QB1', receiver_player_id: 'WR2', down: '3', ydstogo: '2' }),
  play({ play_type: 'run', rush_attempt: '1', run_location: 'middle', run_gap: 'NA', yardline_100: '4', rushing_yards: '4', rush_touchdown: '1', epa: '1.5', rusher_player_id: 'RB1', down: '2', ydstogo: '4' }),
  play({ play_type: 'run', rush_attempt: '1', run_location: 'left', run_gap: 'end', yardline_100: '18', rushing_yards: '3', epa: '0.2', rusher_player_id: 'RB1' }),
  // outside it: a deep throw from his own 30 (70 to go) to WR1 for 25 (12 after the catch), a sack from the 50, a
  // scramble from the 40 (60 to go), a kneel and a two-point try (left out)
  play({ play_type: 'pass', pass: '1', pass_attempt: '1', pass_location: 'right', air_yards: '25', yardline_100: '70', complete_pass: '1', receiving_yards: '37', epa: '3', cpoe: '30', yards_after_catch: '12', passer_player_id: 'QB1', receiver_player_id: 'WR1', down: '3', ydstogo: '9' }),
  play({ play_type: 'pass', pass: '1', pass_attempt: '1', sack: '1', yardline_100: '50', epa: '-1.8', passer_player_id: 'QB1', down: '2', ydstogo: '6' }),
  play({ play_type: 'run', pass: '1', qb_scramble: '1', run_location: 'right', run_gap: 'end', yardline_100: '60', rushing_yards: '9', epa: '0.6', rusher_player_id: 'QB1' }),
  play({ play_type: 'run', qb_kneel: '1', yardline_100: '30', epa: '-0.2', rusher_player_id: 'QB1' }),
  play({ play_type: 'pass', two_point_attempt: '1', pass_attempt: '1', pass_location: 'left', air_yards: '2', yardline_100: '2', epa: '0', passer_player_id: 'QB1', receiver_player_id: 'WR1' }),
  // another game WR1 sat out: the team's targets there aren't in his shares
  play({ game_id: 'G2', play_type: 'pass', pass: '1', pass_attempt: '1', pass_location: 'left', air_yards: '5', yardline_100: '5', complete_pass: '0', epa: '-0.4', passer_player_id: 'QB1', receiver_player_id: 'WR2' }),
];
const row = (names, t) => Object.fromEntries(names.map((n, i) => [n, t ? (t[i] ?? 0) : 0]));

test('a Heat Maps section tallies hand-made plays: the red zone, the bands, the grid, the shares', () => {
  const s = heatSection(PLAYS, { qbs: new Map([['QB1', '123']]), nicknames: new Map([['KC', 'Chiefs'], ['LV', 'Raiders']]) });
  const qb = s.players['123'];
  assert.deepEqual(s.players.QB1, qb, 'the QB under his ESPN id and his gsis id (no keys: everyone kept)');
  // (his throws by zone: the whole field's, every layer; the red zone's two throws in it)
  const zone = (t) => row(HEAT_FIELDS.zone, t);
  const deepRight = zone(qb.pass[11]);
  assert.deepEqual([deepRight.att, deepRight.comp, deepRight.epa, deepRight.success, deepRight.cpoe, deepRight.yac], [1, 1, 3, 1, 30, 12]);
  assert.equal(qb.pass.reduce((n, z) => n + zone(z).att, 0), 4, 'four charted throws: the sack, the kneel and the two-point try left out');
  const rz = qb.rz.pass.map((t) => row(HEAT_FIELDS.rzZone, t));
  assert.equal(rz.reduce((n, z) => n + z.att, 0), 3, 'his three red-zone throws');
  assert.deepEqual([rz[6].att, rz[6].td, rz[6].endZone], [1, 1, 1], 'the 15-yard throw from the 15: mid left, into the end zone, a touchdown');
  assert.deepEqual([rz[4].att, rz[4].endZone], [1, 0], 'short middle from the 8: not into the end zone');
  // (the strip: his dropbacks and his scramble by where the snap was; a touchdown counted where it started)
  const band = qb.band.map((t) => row(HEAT_FIELDS.band, t));
  assert.equal(band[8].plays, 1);
  assert.equal(band[8].td, 1);
  assert.equal(band[9].plays, 2, 'the 8 and the 5: inside the 10');
  assert.equal(band[3].plays, 1, 'the deep throw from his own 30');
  assert.equal(band[5].plays, 1, 'the sack at midfield');
  assert.equal(band[4].plays, 1, 'the scramble from his own 40');
  // (the grid: 3rd & short and 3rd & long)
  const down = (e, i) => row(HEAT_FIELDS.down, e.down[i]);
  assert.deepEqual([down(qb, 6).plays, down(qb, 6).pass, down(qb, 8).plays, down(qb, 8).success], [1, 1, 1, 1]);
  // a receiver's red-zone shares against his team's in his games (G1 only): 2 team targets inside the 20, 1
  // inside the 10, none inside the 5 in G1 (the 5-yard look was in G2)
  const wr1 = row(HEAT_FIELDS.share, s.players.WR1.rz.share);
  assert.deepEqual([wr1.targets, wr1.endZone, wr1.targets10, wr1.td, wr1.teamTargets, wr1.teamTargets10, wr1.teamTargets5], [1, 1, 0, 1, 2, 1, 0]);
  const wr2 = row(HEAT_FIELDS.share, s.players.WR2.rz.share);
  assert.deepEqual([wr2.targets, wr2.targets5, wr2.teamTargets, wr2.teamTargets5], [2, 1, 3, 1], 'WR2 played both games: both games\' looks');
  // a back's carries inside the 20, the 10 and the 5, his red-zone runs by lane
  const rb = row(HEAT_FIELDS.share, s.players.RB1.rz.share);
  assert.deepEqual([rb.carries, rb.carries10, rb.carries5, rb.td, rb.teamCarries, rb.teamCarries5], [2, 1, 1, 1, 2, 1]);
  const lanes = s.players.RB1.rz.runs.map((t) => row(HEAT_FIELDS.lane, t));
  assert.deepEqual([lanes[3].att, lanes[3].td, lanes[0].att], [1, 1, 1]);
  // (a target share in the grid: his targets beside the team's in that spot, in his games)
  const wr1Down = s.players.WR1.down.map((t) => row(HEAT_FIELDS.down, t));
  assert.deepEqual([wr1Down[2].pass, wr1Down[2].teamTargets], [1, 1], '1st & 10: his one of the team\'s one in G1 (G2\'s left out)');
  // the units: the defense under today's abbreviation (OAK is LV), the offense under its Teams-tab row
  assert.deepEqual(Object.keys(s.defenses), ['DEF-LV']);
  assert.deepEqual(Object.keys(s.offenses), ['TM-Chiefs']);
  const def = s.defenses['DEF-LV'];
  assert.equal(def.band.reduce((n, t) => n + row(HEAT_FIELDS.band, t).plays, 0), 8, 'every play but the kneel and the two-point try');
  assert.equal(def.rz.pass.reduce((n, t) => n + row(HEAT_FIELDS.rzZone, t).td, 0), 1, 'the red-zone touchdown it allowed through the air');
  assert.deepEqual(s.league.band, def.band, "one defense: the league's is its");
  // (a tuple of nothing but zeros packed as a plain 0)
  assert.ok(qb.pass.includes(0));
});

// ---- the committed files

const ROOT = staticDir('nfl');
const seasonDirs = [ROOT, ...fs.readdirSync(path.join(ROOT, 'seasons')).filter((d) => /^\d{4}$/.test(d)).map((d) => path.join(ROOT, 'seasons', d))].filter((dir) => fs.existsSync(path.join(dir, 'skill-players.json')));
const isCount = (v) => Number.isInteger(v) && v >= 0;

for (const dir of seasonDirs) {
  const name = dir === ROOT ? 'current' : path.basename(dir);
  test(`NFL heat maps ${name}: the contract, the sizes, the league's sums`, () => {
    const file = path.join(dir, 'heat-maps.json');
    assert.ok(fs.existsSync(file), `${name}: no heat-maps.json`);
    assert.ok(fs.statSync(file).size < 500_000, `${name}: heat-maps.json over 500 KB`);
    const heat = readJson(file);
    assert.deepEqual(heat.fields, HEAT_FIELDS);
    assert.ok(Object.keys(heat.teams).length >= 31, `${name}: every team's name`);
    assert.ok(heat.regular, `${name}: no regular season`);
    for (const part of ['regular', 'post']) {
      const s = heat[part];
      if (!s) continue;
      const width = (list, n, w, what) => {
        assert.equal(list.length, n, what);
        for (const t of list) assert.ok(t === 0 || (t.length === w && isCount(t[0])), `${what}: ${t}`);
      };
      for (const [kind, rows] of [['players', s.players], ['defenses', s.defenses], ['offenses', s.offenses], ['league', { league: s.league }]]) {
        for (const [id, e] of Object.entries(rows)) {
          const what = `${name} ${part} ${kind} ${id}`;
          if (e.pass) width(e.pass, 12, HEAT_FIELDS.zone.length, `${what} pass`);
          if (e.targets) width(e.targets, 12, HEAT_FIELDS.zone.length, `${what} targets`);
          if (e.band) width(e.band, 10, HEAT_FIELDS.band.length, `${what} band`);
          if (e.down) width(e.down, 12, kind === 'players' ? HEAT_FIELDS.down.length : 4, `${what} down`);
          if (e.rz?.pass) width(e.rz.pass, 12, HEAT_FIELDS.rzZone.length, `${what} rz pass`);
          if (e.rz?.runs) width(e.rz.runs, 7, HEAT_FIELDS.lane.length, `${what} rz runs`);
          if (e.rz?.share) {
            const sh = row(HEAT_FIELDS.share, e.rz.share);
            assert.ok(sh.targets <= sh.teamTargets && sh.carries <= sh.teamCarries && sh.targets5 <= sh.targets10 && sh.targets10 <= sh.targets, `${what} shares: ${e.rz.share}`);
          }
        }
      }
      // (every play is some defense's: the league's bands and grid are the defenses' added up, and the offenses')
      const plays = (list) => (list ?? []).reduce((n, t) => n + (t ? t[0] : 0), 0);
      const leaguePlays = plays(s.league.band);
      assert.equal(Object.values(s.defenses).reduce((n, d) => n + plays(d.band), 0), leaguePlays, `${name} ${part}: the defenses' plays`);
      assert.equal(Object.values(s.offenses).reduce((n, d) => n + plays(d.band), 0), leaguePlays, `${name} ${part}: the offenses' plays`);
      if (part === 'regular' && name !== 'current') assert.ok(leaguePlays > 25_000, `${name}: ${leaguePlays} plays`);
      // (the zones from 2006 on, as the Field Map's; the red zone a part of the whole)
      if (heat.season >= 2006) {
        const att = plays(s.league.pass);
        const rzAtt = plays(s.league.rz?.pass);
        assert.ok(att > 0 && rzAtt > 0 && rzAtt < att / 4, `${name} ${part}: ${rzAtt} red-zone throws of ${att}`);
      }
    }
  });
}

// ---- the colors

const STAT = { key: 'epa', label: 'EPA', format: (v) => v.toFixed(2), sd: 0.2, minN: 10, noun: 'throws' };
const cell = (value, n = 40, league = 0.1) => ({ id: 'x', n, value, league });

test('colors: diverging against the league, capped 2 spreads out, a defense flipped, never past 0.85', () => {
  const { cellTone, divergingFill, heatPaint, HEAT_ALPHA_MAX, tintStrength, tintFrom } = h;
  assert.equal(cellTone(cell(0.1), STAT), 0, "the league's own: no leaning");
  assert.equal(cellTone(cell(0.3), STAT), 0.5, 'one spread up: halfway');
  assert.equal(cellTone(cell(0.9), STAT), 1, 'capped at 2 spreads');
  assert.equal(cellTone(cell(-0.9), STAT), -1);
  assert.equal(cellTone(cell(0.3), STAT, true), -0.5, "a defense: more allowed is worse");
  assert.equal(cellTone(cell(0.3), { ...STAT, lowerIsBetter: true }), -0.5);
  assert.equal(cellTone({ ...cell(0.3), sd: 0.1 }, STAT), 1, "a cell's own spread before the stat's");
  assert.equal(cellTone(cell(null), STAT), 0);
  // (the grid's tint reads the same strength: value-tint.ts)
  assert.ok(Math.abs(tintStrength(0.3, { mean: 0.1, sd: 0.2 }) - 0.5) < 1e-9);
  assert.equal(tintFrom(0.3, { mean: 0.1, sd: 0.2 }), 'color-mix(in srgb, var(--tint-good, #3ee07a) 42%, var(--tint-base, #fff))', 'as it always read');
  const alpha = (fill) => Number(/,\s*([\d.]+)\)$/.exec(fill)?.[1]);
  for (const t of [-1, -0.6, 0.2, 0.7, 1]) {
    const a = alpha(divergingFill(t));
    assert.ok(a > 0 && a <= HEAT_ALPHA_MAX, `tone ${t}: alpha ${a}`);
  }
  assert.ok(alpha(divergingFill(1)) > alpha(divergingFill(0.3)), 'stronger the further it leans');
  assert.match(divergingFill(0.8), /^rgba\(62, 224, 122/);
  assert.match(divergingFill(-0.8), /^rgba\(255, 90, 79/);
  assert.equal(heatPaint(cell(0.3), { stat: STAT, mode: 'efficiency' }).tone, 0.5);
});

test('colors: small samples greyed (hatched), an empty cell plain, volume one hue, a matchup the two together', () => {
  const { heatPaint, isThin, edgeTone, sequentialFill, HEAT_NEUTRAL, leanFill } = h;
  assert.equal(isThin(cell(0.5, 9), STAT), true);
  assert.equal(isThin(cell(0.5, 10), STAT), false);
  const thin = heatPaint(cell(0.9, 4), { stat: STAT, mode: 'efficiency' });
  assert.deepEqual(thin, { fill: 'var(--hm-thin)', tone: 0, thin: true }, 'greyed, however far it leans');
  assert.deepEqual(heatPaint(cell(null, 0), { stat: STAT, mode: 'efficiency' }), { fill: HEAT_NEUTRAL, tone: 0, thin: false });
  // (volume: never greyed, its strength its share of the busiest cell's sample)
  const vol = heatPaint(cell(0.9, 4), { stat: STAT, mode: 'volume', most: 16 });
  assert.equal(vol.thin, false);
  assert.equal(vol.fill, sequentialFill(0.25));
  assert.match(vol.fill, /^rgba\(95, 168, 255/);
  // (a share stat: one hue in efficiency too, against the biggest cell's)
  const share = heatPaint(cell(0.2, 40), { stat: { ...STAT, scale: 'sequential' }, mode: 'efficiency', top: 0.4 });
  assert.equal(share.fill, sequentialFill(0.5));
  // (a lean: neither side good, two neutral hues)
  assert.equal(heatPaint(cell(0.3), { stat: { ...STAT, scale: 'lean' }, mode: 'efficiency' }).fill, leanFill(0.5));
  // a matchup: his strength over their soft spot leans hard to him; a strength into a stingy zone evens out
  const soft = { ...cell(0.5), id: 'x' };
  const stingy = { ...cell(-0.3), id: 'x' };
  assert.equal(edgeTone(cell(0.5), soft, STAT), 1);
  assert.equal(edgeTone(cell(0.5), stingy, STAT), 0);
  assert.equal(edgeTone(cell(0.5), { ...soft, n: 3 }, STAT), 0, 'the other side short of its sample: none');
  assert.equal(heatPaint(cell(0.5), { stat: STAT, mode: 'efficiency', opponent: { ...soft, n: 3 } }).thin, true);
  // (a defense's row: stingy where it allowed little and their offense is weak there)
  assert.equal(edgeTone(cell(-0.3), { ...cell(-0.3), id: 'x' }, STAT, true), 1);
});

// ---- the surfaces

test("surfaces: the field's 12 zones, the strip's 10 bands, the grid's 12 cells, each with an outline and a name", () => {
  const { heatSurface, ZONE_IDS } = h;
  const field = heatSurface('field');
  assert.deepEqual(field.cells.map((c) => c.id), ZONE_IDS);
  assert.equal(field.cells[0].id, 'behind-left');
  const strip = heatSurface('field-strip');
  assert.deepEqual(strip.cells.map((c) => c.id), Array.from({ length: 10 }, (_, k) => `b${k}`));
  assert.ok(strip.cells.every((c, k) => k === 0 || c.cx > strip.cells[k - 1].cx), 'own goal line on the left to theirs on the right');
  const grid = heatSurface('down-distance');
  assert.deepEqual(grid.cells.map((c) => c.id).slice(0, 4), ['1-short', '1-medium', '1-long', '2-short']);
  for (const s of [field, strip, grid]) {
    assert.equal(new Set(s.cells.map((c) => c.id)).size, s.cells.length);
    for (const c of s.cells) assert.ok((c.points || c.d) && c.name && Number.isFinite(c.cx) && Number.isFinite(c.cy), `${s.id} ${c.id}`);
    assert.ok(s.backdrop.length && s.aria);
  }
  assert.equal(heatSurface('rink'), null, 'not built yet');
  assert.equal(heatSurface('field'), field, 'built once');
});

// ---- the NFL's maps read from a real season

test("NFL maps from 2025's file: a QB's zones and red zone, a receiver's shares, a defense flipped, the overlay, the whole season the two parts added up", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const file = path.join(ROOT, String(url).replace(/^data\//, ''));
    return fs.existsSync(file) ? { ok: true, json: async () => readJson(file) } : { ok: false, json: async () => null };
  };
  try {
    const { nflHeatMaps, heatMatchups, expandHeat, heatPart, ZONE_IDS } = h;
    const [zones, strip, downs] = nflHeatMaps({ current: () => false });
    const q = (player, position, extra = {}) => ({ player, position, season: 2025, split: 'regular', stat: null, side: null, opponent: null, ...extra });
    const allen = { id: 3918298, gsisId: 'QB-3918298', name: 'Josh Allen', teamLogo: 'assets/NFL_Icons/Bills.png' };
    const z = await zones.load(q(allen, 'QB'));
    assert.equal(z.surface, 'field');
    assert.deepEqual(z.cells.map((c) => c.id), ZONE_IDS);
    assert.ok(z.cells.reduce((n, c) => n + c.n, 0) > 300, 'a full season of throws');
    assert.ok(z.stats.some((s) => s.key === 'cpoe') && !z.stats.some((s) => s.key === 'yac'), "a QB's layers");
    assert.equal(z.defense, false);
    const rz = await zones.load(q(allen, 'QB', { split: 'redzone' }));
    assert.equal(rz.stat.key, 'td', "the red zone's TD rate first");
    assert.ok(rz.cells.reduce((n, c) => n + c.n, 0) < z.cells.reduce((n, c) => n + c.n, 0) / 3);
    assert.ok(rz.chips.some((c) => c.label === 'TD rate'));
    // (a receiver's red zone: his shares of the team's looks)
    const chase = { id: 4362628, gsisId: '00-0036900', name: "Ja'Marr Chase", teamLogo: 'assets/NFL_Icons/Bengals.png' };
    const wr = await zones.load(q(chase, 'WR', { split: 'redzone' }));
    const share = wr.chips.find((c) => c.label === 'Target share');
    assert.ok(share && /^\d+%$/.test(share.value), JSON.stringify(wr.chips));
    // (the whole season: the regular season and the playoffs added up)
    const file = expandHeat(readJson(path.join(ROOT, 'seasons/2025/heat-maps.json')));
    const sumAtt = (p) => p.players['3918298'].pass.reduce((n, r) => n + r.att, 0);
    assert.equal(sumAtt(heatPart(file, 'all')), sumAtt(file.regular) + (file.post?.players['3918298'] ? sumAtt(file.post) : 0));
    // (a defense: what it allowed, flipped; its opponent's offense over it)
    const ravensD = { id: null, gsisId: 'DEF-BAL', name: 'Baltimore Ravens', teamLogo: 'assets/NFL_Icons/Ravens.png' };
    const d = await zones.load(q(ravensD, 'DEF', { opponent: 'KC' }));
    assert.equal(d.defense, true);
    assert.equal(d.overlay.length, 12);
    assert.equal(d.overlayLabel, "KC's offense");
    // (a team: its offense, or its defense on that side)
    const ravens = { id: null, gsisId: 'TM-Ravens', name: 'Baltimore Ravens', teamLogo: 'assets/NFL_Icons/Ravens.png' };
    assert.equal((await zones.load(q(ravens, 'TM'))).defense, false);
    assert.equal((await zones.load(q(ravens, 'TM', { side: 'defense' }))).defense, true);
    const o = await zones.load(q(allen, 'QB', { opponent: 'KC' }));
    assert.equal(o.overlayLabel, "KC's D");
    // (the strip and the grid; the grid's shares one hue)
    const s = await strip.load(q(allen, 'QB'));
    assert.equal(s.cells.length, 10);
    assert.equal(await strip.load(q(allen, 'QB', { split: 'redzone' })), null, 'no strip in the red zone');
    const g = await downs.load(q(chase, 'WR'));
    assert.equal(g.stat.key, 'targets');
    assert.equal(g.stat.scale, 'sequential');
    assert.ok(g.cells.every((c) => c.value === null || (c.value >= 0 && c.value <= 1)));
    const tg = await downs.load(q(ravens, 'TM'));
    assert.equal(tg.stat.scale, 'lean', "a team's pass rate: neither side good");
    // (the AI preview's matchups: a team's two, a QB's one)
    const team = await heatMatchups(ravens, 'TM', 2025, 'PIT', false);
    assert.equal(team.length, 2);
    assert.equal(team[1].defense, true);
    assert.equal((await heatMatchups(allen, 'QB', 2025, 'MIA', false)).length, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});
