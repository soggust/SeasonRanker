// Stops on the NFL's defensive tabs (the owner, 2026-11-24: PFF has Fred Warner its top linebacker while the
// box score has him 15th; its grade is film, but the run fits it rewards show up as stops). A stop is a tackle
// on a run or pass the offense lost (the play-by-play's success flag), a sack never (the rusher's, though
// nflverse puts him in a tackle column too). On the Edge, DL, LB and S tabs, in the Run Stopper, Tackler and
// Enforcer presets and the Run Stopping skill; built from 2000 on (the tackle columns are filled from 1999).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');

test('a stop is a tackle on a lost run or pass, never a sack, each tackler once a play', () => {
  const src = read('apps/nfl/scripts/update-data.mjs');
  const fn = src.slice(src.indexOf('function stopsBy('), src.indexOf('\n}\n', src.indexOf('function stopsBy(')));
  assert.match(fn, /play\.play_type !== 'run' && play\.play_type !== 'pass'/);
  assert.match(fn, /play\.success !== '0'/);
  assert.match(fn, /play\.sack === '1'\) continue;/);
  assert.match(fn, /new Set\(STOP_TACKLERS\.map/);
  for (const c of ['solo_tackle_1_player_id', 'assist_tackle_1_player_id', 'tackle_with_assist_1_player_id', 'tackle_for_loss_1_player_id']) assert.ok(src.includes(`'${c}'`), c);
  // (the hourly update's and the defense-only backfill's: both read the play-by-play)
  assert.match(src, /stops: season\.seasonPbp \? stopsBy\(season\.seasonPbp, part\) : null/);
  assert.match(src, /const season = \{\n    seasonPbp: pbp,\n    playerStatsByPart/);
});

test('Stops on the Edge, DL, LB and S tabs, and in the presets and skill that are about tackling the run', () => {
  const pos = read('apps/nfl/src/sport/positions.ts');
  assert.match(pos, /TACKLES_STAT,\n  STOPS_STAT,\n  QB_HITS_STAT,/, 'Edge and DL');
  assert.match(pos, /SOLO_TACKLES_STAT,\n    STOPS_STAT,\n    TFL_STAT,/, 'LB');
  assert.match(pos, /SOLO_TACKLES_STAT, STOPS_STAT, DEF_SACKS_STAT, \.\.\.SECONDARY_STATS\.slice\(6\)\]/, 'S');
  const presets = read('apps/nfl/src/sport/skill-presets.ts');
  assert.match(presets, /weights: \{ stops: 100, tackles: 100, tfl: 100, missedTacklePct: 75, snapPct: 50 \}/);
  assert.match(presets, /weights: \{ tackles: 100, stops: 90, tfl: 80, soloTackles: 60, missedTacklePct: 75 \}/);
  assert.match(presets, /weights: \{ tackles: 100, stops: 80, tfl: 80, forcedFumbles: 70, missedTacklePct: 75 \}/);
  assert.equal(read('apps/nfl/src/sport/skills.ts').split("parts: [['stops', 1], ['tfl', 1], ['tackles', 1]] }").length - 1, 2);
});

test("every season's front seven and safeties carry stops, never more than their tackles", () => {
  const dir = path.join(root, 'apps/nfl/src/StaticData/seasons');
  for (const year of fs.readdirSync(dir)) {
    const file = path.join(dir, year, 'skill-players.json');
    if (!fs.existsSync(file)) continue;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const tab of ['EDGE', 'DL', 'LB', 'S']) {
      for (const p of data[tab] ?? []) {
        assert.ok(Number.isInteger(p.stats.stops), `${year} ${tab} ${p.name}`);
        assert.ok(p.stats.stops <= p.stats.tackles, `${year} ${tab} ${p.name}: ${p.stats.stops} stops, ${p.stats.tackles} tackles`);
      }
    }
  }
});
