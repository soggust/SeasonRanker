// The self-tune's knobs (DECISIONS.md D88, the owner, 2026-10-23: "the audit should adjust the algorithm based on the
// data, not only re-record"). A fixed menu of values the code already parameterizes, each with its decision, its
// default (the shipped constant), a small grid around it and hard bounds. The weekly self-tune (self-tune.mjs) tries
// the grid one knob at a time through the replay and writes a winner as data, never code:
// apps/<sport>/src/StaticData/model/tuned.json { v, sport, knobs: { <name>: value }, changes: [...], last: {...} }.
// The desk and the replay read a knob through knob(sport, name): an in-process override (the self-tune's re-staking,
// TUNE_OVERRIDE for a pricing candidate's own process), else the sport's tuned.json, else the default. A value
// outside its bounds, a knob the sport isn't on the menu for, or an unreadable file reads the default.
//
// kind: 'staking' changes stakes on top of unchanged chances (re-staked from one replay, no MODEL_EPOCH bump);
// 'pricing' changes the chances (a full gate a candidate; a shipped change bumps MODEL_EPOCH, D4)
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
export const TUNED_V = 1;
const LINES = ['nfl', 'nba', 'nhl', 'mlb'];


export const KNOBS = {
  beatBar: { ref: 'D60', kind: 'staking', def: 0.525, grid: [0.5, 0.5125, 0.525, 0.5375, 0.55], bounds: [0.5, 0.56], sports: LINES, what: "the beat-the-close bar: a market's share of bets beating the fair close needed for more than the practice stake" },
  beatMin: { ref: 'D60', kind: 'staking', def: 40, grid: [30, 40, 60], bounds: [30, 100], sports: LINES, what: "the beat-the-close bar's minimum checked bets before it judges a market" },
  barZ: { ref: 'D51/D64', kind: 'staking', def: 1, grid: [0.5, 0.75, 1, 1.25, 1.5], bounds: [0.5, 2], sports: LINES, what: "the history bar's standard errors past 0 a segment's (a line's, a prop stat and side's) return needs for full stakes" },
  barMin: { ref: 'D51/D64', kind: 'staking', def: 40, grid: [30, 40, 60], bounds: [20, 100], sports: LINES, what: "the history bar's minimum picks' worth before a segment can earn full stakes" },
  ownThr: { ref: 'D79', kind: 'staking', def: -0.1, grid: [-0.15, -0.125, -0.1, -0.075, -0.05], bounds: [-0.2, -0.03], sports: LINES, what: "the Bot's own losers: the shrunk flat return a stat and side (or line market and side) at or under which it takes the practice stake" },
  ownMin: { ref: 'D79', kind: 'staking', def: 10, grid: [5, 10, 15, 20], bounds: [5, 40], sports: LINES, what: "the Bot's own losers: the minimum own bets before a key can be held" },
  windowZ: { ref: 'D63', kind: 'staking', def: 1.645, grid: [1.282, 1.645, 1.96], bounds: [1, 2.576], sports: LINES, what: "the betting windows: the standard errors an hour's gain over the old placement needs to be learned" },
  windowMin: { ref: 'D63', kind: 'staking', def: 60, grid: [40, 60, 90], bounds: [30, 150], sports: LINES, what: "the betting windows: the minimum paired games before an hour can be learned" },
  trialKelly: { ref: 'D73', kind: 'staking', def: 0.01, grid: [0.005, 0.01, 0.015, 0.02], bounds: [0.005, 0.03], sports: ['nba', 'nhl'], what: "the two-band trial's Kelly floor: a prop's Kelly score needed for a LOVE" },
  loveUnits: { ref: 'D73', kind: 'staking', def: 2, grid: [1.5, 2, 2.5], bounds: [1, 3], sports: ['nhl'], what: "the two-band trial's LOVE stake cap (units)" },
  leanLambdaLines: { ref: 'D88', kind: 'staking', def: 0, grid: [0, 0.5, 1, 2], bounds: [0, 3], sports: LINES, what: "the margin rule on the game lines: a side the Bot's own model puts d under the fair price is bet only with a price edge of lambda x d + m or more, else tracked (D90)" },
  leanMLines: { ref: 'D88', kind: 'staking', def: 0, grid: [0, 0.005, 0.01, 0.02], bounds: [0, 0.03], sports: LINES, what: "the margin rule on the game lines: the edge m (chance points) a disagreeing side needs beyond lambda x d" },
  leanLambdaProps: { ref: 'D88', kind: 'staking', def: 0, grid: [0, 0.5, 1, 2], bounds: [0, 3], sports: LINES, what: "the margin rule on the props: lambda" },
  leanMProps: { ref: 'D88', kind: 'staking', def: 0, grid: [0, 0.005, 0.01, 0.02], bounds: [0, 0.03], sports: LINES, what: "the margin rule on the props: m" },
  mmaOpenFav: { ref: 'D88', kind: 'staking', def: 0, grid: [0, 1, 2], bounds: [0, 2], sports: ['mma'], what: "MMA's favorites bet at the open (the early lead band): 0 the rules as they are, 1 the full Kelly stake (the bands' place cap aside), 2 the minimum (the practice stake)" },
  youngShrink: { ref: 'D82', kind: 'pricing', def: 1, grid: [0.5, 0.75, 1], bounds: [0, 1], sports: ['nba'], what: "the young players' weights (young.json) taken this share of the way from the model as it was (0) to the walk-forward pick (1)" },
};

export const tunedFile = (sport, root = ROOT) => path.join(root, 'apps', sport, 'src/StaticData/model/tuned.json');
export const onMenu = (sport, name) => !!KNOBS[name] && KNOBS[name].sports.includes(sport);
export function inBounds(name, v) {
  const k = KNOBS[name];
  return !!k && Number.isFinite(v) && v >= k.bounds[0] - 1e-12 && v <= k.bounds[1] + 1e-12;
}

const files = new Map();
// (two layers over the file: the self-tune's in-process re-staking (setOverride) over a pricing candidate's own process (TUNE_OVERRIDE))
const overrides = new Map();
const envOverrides = new Map();
// (a pricing candidate's process: TUNE_OVERRIDE='{"nba":{"youngShrink":0.5}}', read once at load)
try {
  const env = typeof process !== 'undefined' ? process.env?.TUNE_OVERRIDE : null;
  if (env) for (const [sport, o] of Object.entries(JSON.parse(env))) if (o && typeof o === 'object') envOverrides.set(sport, { ...o });
} catch {
  // (an unreadable override: none)
}

// A sport's tuned file as read (null: none or unreadable); cached for the process (clearTuned to read again)
export function readTuned(sport, root = ROOT) {
  const key = `${root}|${sport}`;
  if (files.has(key)) return files.get(key);
  let f = null;
  try {
    const file = tunedFile(sport, root);
    if (existsSync(file)) {
      const j = JSON.parse(readFileSync(file, 'utf8'));
      f = j && typeof j === 'object' && j.knobs && typeof j.knobs === 'object' ? j : null;
    }
  } catch {
    f = null;
  }
  files.set(key, f);
  return f;
}
export const clearTuned = () => files.clear();

// The knob's value for the sport: the override, else the file's, else the default (each only in bounds, on the menu)
export function knob(sport, name, root = ROOT) {
  const k = KNOBS[name];
  if (!k) throw new Error(`no such knob: ${name}`);
  if (!k.sports.includes(sport)) return k.def;
  const o = overrides.get(sport)?.[name];
  if (inBounds(name, o)) return o;
  const e = envOverrides.get(sport)?.[name];
  if (inBounds(name, e)) return e;
  const v = readTuned(sport, root)?.knobs?.[name];
  return inBounds(name, v) ? v : k.def;
}
// (the self-tune's re-staking in one process: a sport's override set, or cleared with null)
export function setOverride(sport, o) {
  if (o && typeof o === 'object') overrides.set(sport, { ...o });
  else overrides.delete(sport);
}
// Every knob on the sport's menu at its value now: what a record's code fingerprint carries (gate.mjs modelCode)
export const knobsOf = (sport, root = ROOT) => Object.fromEntries(Object.keys(KNOBS).filter((n) => onMenu(sport, n)).map((n) => [n, knob(sport, n, root)]));
