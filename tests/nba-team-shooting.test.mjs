// The NBA Teams tab's shooting, rebounding and ball security (apps/nba/scripts/team-shooting.mjs, on every
// season's coach rows by update-data.mjs, back to 2000-01): the formulas on a known game's box, both parts
// added up from the counts, every team of every season and part carrying all of them in a sane range (the
// same on each of a team's coach rows), the TM tab listing them with the right direction, DEFAULT at 50 and
// the themed presets leaving them at 0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { addBoxes, teamBox, teamShooting } from '../apps/nba/scripts/team-shooting.mjs';
import { loadEngine, readJson, staticDir } from './support/engine.mjs';

const KEYS = ['efgPct', 'tsPct', 'fg3Pct', 'fg3aRate', 'ftRate', 'oppEfgPct', 'oppFg3Pct', 'orbPct', 'drbPct', 'trbPct', 'rebPerGame', 'tovPct', 'oppTovPct'];
// (lower is better)
const AGAINST = ['oppEfgPct', 'oppFg3Pct', 'tovPct'];

// The 2016 Finals' Game 7 (Cleveland 93, Golden State 89): Cleveland 33-82, 6-25 from 3, 21-30 at the line;
// Golden State 32-83, 15-41, 10-16 (the rebounds and turnovers made up: the game's shooting is what's checked)
const CLE = { g: 1, fg: 33, fga: 82, fg3: 6, fg3a: 25, ft: 21, fta: 30, orb: 10, drb: 38, trb: 48, tov: 10, pts: 93 };
const GSW = { g: 1, fg: 32, fga: 83, fg3: 15, fg3a: 41, ft: 10, fta: 16, orb: 8, drb: 31, trb: 39, tov: 15, pts: 89 };
const opp = (box) => Object.fromEntries(Object.entries(box).filter(([k]) => k !== 'g').map(([k, v]) => [`opp_${k}`, v]));
// (Basketball-Reference's rows hold text)
const text = (box) => Object.fromEntries(Object.entries(box).map(([k, v]) => [k, String(v)]));

test('nba team shooting: a known game box', () => {
  for (const box of [CLE, GSW]) assert.equal(2 * box.fg + box.fg3 + box.ft, box.pts, 'the box adds up');
  const cle = teamShooting(teamBox(text(CLE), text(opp(GSW))));
  // eFG: (33 + 3) / 82 = .439; TS: 93 / (2 x (82 + 0.44 x 30)) = .488; 3P: 6 / 25
  assert.equal(cle.efgPct, 43.9);
  assert.equal(cle.tsPct, 48.8);
  assert.equal(cle.fg3Pct, 24);
  assert.equal(cle.fg3aRate, 30.5);
  assert.equal(cle.ftRate, 36.6);
  // Golden State's (32 + 7.5) / 83 = .476 and 15 / 41, its defense's numbers
  assert.equal(cle.oppEfgPct, 47.6);
  assert.equal(cle.oppFg3Pct, 36.6);
  // 10 / (10 + 31); 38 / (38 + 8); 48 / 87
  assert.equal(cle.orbPct, 24.4);
  assert.equal(cle.drbPct, 82.6);
  assert.equal(cle.trbPct, 55.2);
  assert.equal(cle.rebPerGame, 48);
  // 10 / (82 + 13.2 + 10); 15 / (83 + 7.04 + 15)
  assert.equal(cle.tovPct, 9.5);
  assert.equal(cle.oppTovPct, 14.3);
  const gsw = teamShooting(teamBox(text(GSW), text(opp(CLE))));
  assert.equal(gsw.efgPct, 47.6);
  assert.equal(gsw.oppEfgPct, 43.9);
  // (each side's ORB % and the other's DRB % share the misses: they add to 100)
  assert.ok(Math.abs(cle.orbPct + gsw.drbPct - 100) < 0.11 && Math.abs(gsw.orbPct + cle.drbPct - 100) < 0.11);
});

test('nba team shooting: both parts from the summed counts, never an average; unknown is null', () => {
  const regular = { ...CLE, ...opp(GSW) };
  const post = { ...GSW, ...opp(CLE) };
  const both = teamShooting(addBoxes(regular, post));
  assert.equal(both.efgPct, Math.round(((65 + 10.5) / 165) * 1000) / 10);
  assert.equal(both.rebPerGame, 43.5);
  assert.equal(addBoxes(regular, null), null);
  assert.equal(teamBox({ ...text(CLE), fga: '' }, text(opp(GSW))), null);
  assert.deepEqual(Object.keys(teamShooting(null)).sort(), [...KEYS].sort());
  assert.ok(Object.values(teamShooting(null)).every((v) => v === null));
});

// [range, playoffs' range (a four-game sweep is a small sample)]
const RANGE = {
  efgPct: [42, 60], tsPct: [46, 63], fg3Pct: [26, 43], fg3aRate: [5, 56], ftRate: [15, 42], oppEfgPct: [42, 60], oppFg3Pct: [28, 43],
  orbPct: [17, 38], drbPct: [62, 83], trbPct: [44, 56], rebPerGame: [36, 52], tovPct: [9, 18], oppTovPct: [9, 18],
};
const WIDEN = { regular: 0, post: 9, all: 2 };

test('nba team shooting: every team of every season and part has every stat, in range, the same on each coach row', () => {
  const dir = staticDir('nba');
  const seasons = [[2026, dir], ...fs.readdirSync(path.join(dir, 'seasons')).filter((d) => /^\d{4}$/.test(d)).map((d) => [Number(d), path.join(dir, 'seasons', d)])];
  assert.ok(seasons.some(([s]) => s === 2001), 'back to 2000-01');
  let rows = 0;
  for (const [season, folder] of seasons) {
    for (const [part, file] of [['regular', 'skill-players.json'], ['post', 'skill-players.post.json'], ['all', 'skill-players.all.json']]) {
      const f = path.join(folder, file);
      if (!fs.existsSync(f)) continue;
      const byTeam = new Map();
      for (const coach of readJson(f).HC) {
        rows++;
        for (const key of KEYS) {
          const v = coach.stats[key];
          const [lo, hi] = RANGE[key];
          const w = WIDEN[part];
          assert.ok(typeof v === 'number' && v >= lo - w && v <= hi + w, `${season} ${part} ${coach.teamLogo} ${key}: ${v}`);
        }
        const same = JSON.stringify(KEYS.map((k) => coach.stats[k]));
        assert.equal(byTeam.get(coach.teamLogo) ?? same, same, `${season} ${part} ${coach.teamLogo}: its coaches agree`);
        byTeam.set(coach.teamLogo, same);
      }
    }
  }
  assert.ok(rows > 2000, `${rows} coach rows`);
});

test('nba team shooting: the TM tab lists them, lower-is-better against, DEFAULT 50, themed presets 0', async () => {
  const { SKILL_STATS, SKILL_PRESETS, presetWeights, statGroup } = await loadEngine('nba');
  const stats = SKILL_STATS.TM;
  for (const key of KEYS) {
    const stat = stats.find((s) => s.key === key);
    assert.ok(stat && stat.label && stat.description && !stat.infoOnly, `${key}: on the tab`);
    assert.equal(Boolean(stat.negative), AGAINST.includes(key), `${key}: direction`);
    assert.ok(['box', 'advanced'].includes(statGroup(stat)), `${key}: in Basic or Advanced`);
    assert.equal(presetWeights('TM', 'default')[key], 50, `${key}: DEFAULT 50`);
    for (const preset of SKILL_PRESETS.TM) if (!(key in preset.weights)) assert.equal(presetWeights('TM', preset.key)[key], 0, `${preset.key} ${key}: 0`);
  }
  // (the team's headline stats on the card stay the ratings and ranks)
  assert.equal(new Set(stats.map((s) => s.key)).size, stats.length, 'no stat twice');
});
