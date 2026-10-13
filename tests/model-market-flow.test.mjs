// The props' market game flow (audit #4): the betting lines' implied team points (props.mjs marketPts) in the
// game script where the fit keeps it (project.mjs mk, blended on the log), the lines' spread as a flag
// (mSpread), and none of it read without the lines (libs/ranker/scripts/model/props.mjs, project.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CTX, envFor, marketPts, scriptValue } from '../libs/ranker/scripts/model/props.mjs';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

test("marketPts: the total split by the home side's margin; null without both lines", () => {
  assert.deepEqual(marketPts(47, 3), [25, 22]);
  assert.deepEqual(marketPts(47, -7), [20, 27]);
  assert.equal(marketPts(null, 3), null);
  assert.equal(marketPts(47, null), null);
  assert.equal(marketPts(0, 0), null);
  assert.equal(marketPts(10, 12), null);
});

test("scriptValue: the market's points blended in by mk on the log, each over its own average; without lines or mk, the game model's alone", () => {
  const env = { avg: 22, avgMkt: 22.5 };
  const pts = [24.2, 19.8];
  const mkt = [27, 18];
  close(scriptValue({}, env, null, pts, true), 1.1);
  close(scriptValue({}, env, null, pts, true, 0, mkt), 1.1);
  close(scriptValue({}, env, null, pts, true, 1, mkt), 1.2);
  close(scriptValue({}, env, null, pts, false, 1, mkt), 0.8);
  close(scriptValue({}, env, null, pts, true, 0.5, mkt), Math.sqrt(1.1 * 1.2));
  close(scriptValue({ script: 'opp' }, env, null, pts, true, 1, mkt), 0.8);
  close(scriptValue({}, env, null, pts, true, 1, null), 1.1);
  close(scriptValue({}, { avg: 22, avgMkt: null }, null, pts, true, 1, mkt), 1.1);
});

test("mSpread: his side's margin by the lines per 10 points, a favorite's over 0; 0 without lines", () => {
  close(CTX.mSpread(null, true, null, { mkt: [27, 20] }), 0.7);
  close(CTX.mSpread(null, false, null, { mkt: [27, 20] }), -0.7);
  assert.equal(CTX.mSpread(null, true, null, { mkt: null }), 0);
  assert.equal(CTX.mSpread(null, true, null, null), 0);
});

test("envFor: the market's average and count from the rows with lines; the script reads mk off the params it's given", () => {
  const st = { key: 'x', played: () => true };
  const rows = [
    { game: 'a', home: true, s: { x: 1 }, mkt: [25, 20] },
    { game: 'b', home: false, s: { x: 1 }, mkt: null },
  ];
  const env = envFor('nfl', st, new Map([['a', [22, 22]], ['b', [22, 22]]]), new Map(), rows);
  close(env.avgMkt, 22.5);
  assert.equal(env.mktN, 1);
  close(env.script(rows[0]), 1);
  close(env.script(rows[0], { mk: 1 }), 25 / 22.5);
  close(env.script(rows[1], { mk: 1 }), 1);
});
