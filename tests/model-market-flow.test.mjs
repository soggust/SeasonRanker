// The props' market game flow (audit #4): the betting lines' implied team points (props.mjs marketPts) in the
// game script where the fit keeps it (project.mjs mk, blended on the log), the lines' spread as a flag
// (mSpread), and none of it read without the lines (libs/ranker/scripts/model/props.mjs, project.mjs): the
// history's lines (marketOf: blanks skipped, swapped sides), the live spread alone (spreadOf), the fit's terms
// (fitCtxs), ESPN's blank lines (espn.mjs linesOf) and the write-up's words (writeup.mjs ctxWhat).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CTX, STATS, envFor, marketOf, marketPts, scriptValue, spreadOf } from '../libs/ranker/scripts/model/props.mjs';
import { fitCtxs } from '../libs/ranker/scripts/model/project.mjs';
import { linesOf } from '../libs/ranker/scripts/model/espn.mjs';
import { ctxWhat } from '../libs/ranker/scripts/model/writeup.mjs';

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

test("marketOf: nflverse's lines by ESPN's id; a blank spread or total skipped (not a pick'em), a game with its sides the other way round read swapped", () => {
  const history = [
    { id: 1, final: true, hs: 24 },
    { id: 2, final: true, hs: 17 },
    { id: 3, final: true, hs: 30 },
    { id: 4, final: true, hs: 10 },
  ];
  const games = [
    { espn: '1', spread_line: '3', total_line: '47', home_score: '24', away_score: '20' },
    { espn: '2', spread_line: '3', total_line: '47', home_score: '20', away_score: '17' },
    { espn: '3', spread_line: '', total_line: '47', home_score: '30', away_score: '3' },
    { espn: '4', spread_line: '-2', total_line: '', home_score: '10', away_score: '7' },
    { espn: '99', spread_line: '3', total_line: '47', home_score: '', away_score: '' },
  ];
  const m = marketOf(history, games);
  assert.deepEqual([...m.keys()], ['1', '2']);
  assert.deepEqual(m.get('1'), [25, 22]);
  assert.deepEqual(m.get('2'), [22, 25]);
  assert.equal(marketOf(history, []), null);
  assert.equal(marketOf(history, [games[2], games[3]]), null);
});

test("the lines' spread from the spread alone where the row has it (live, no total needed), else the implied points'; none, null", () => {
  assert.equal(spreadOf({ mktSpread: 7, mkt: null }), 7);
  assert.equal(spreadOf({ mktSpread: 7, mkt: [20, 27] }), 7);
  assert.equal(spreadOf({ mktSpread: null, mkt: [27, 20] }), 7);
  assert.equal(spreadOf({ mktSpread: null, mkt: null }), null);
  close(CTX.mSpread(null, false, null, { mktSpread: 7, mkt: null }), -0.7);
});

test("fitCtxs: the lines' spread (c_mSpread) fit only where the history has the lines (mktN)", () => {
  const st = STATS.nfl.find((s) => s.key === 'passInt');
  assert.ok(fitCtxs(st, { mktN: 500 }).includes('c_mSpread'));
  assert.ok(!fitCtxs(st, { mktN: 0 }).includes('c_mSpread'));
  assert.ok(!fitCtxs(st, {}).includes('c_mSpread'));
  assert.ok(fitCtxs(st, { mktN: 0 }).includes('c_wind'));
});

test("ESPN's board: a blank or missing line is none, not 0 (a pick'em), so the total falls back to overUnder", () => {
  const e = { competitions: [{ odds: [{ provider: { name: 'DraftKings' }, overUnder: 44.5, pointSpread: { home: { close: { line: '', odds: '-110' } }, away: { close: { line: '', odds: '-110' } } }, total: { over: { close: { line: '', odds: '-110' } }, under: { close: { line: '', odds: '-110' } } } }] }] };
  const l = linesOf(e);
  assert.equal(l.spread.home.line, null);
  assert.equal(l.total.line, 44.5);
  const ok = { competitions: [{ odds: [{ provider: { name: 'DraftKings' }, pointSpread: { home: { close: { line: '-3.5', odds: '-110' } } }, total: { over: { close: { line: 'o47.5', odds: '-110' } } } }] }] };
  assert.equal(linesOf(ok).spread.home.line, -3.5);
  assert.equal(linesOf(ok).total.line, 47.5);
});

test("the write-up names the lines' spread when it's the context that moved the projection most", () => {
  const bet = (v) => ({ projection: { ctx: { wind: 0, mSpread: v }, applied: { c_mSpread: -0.1 } } });
  assert.equal(ctxWhat(bet(0.7), { bet: { team: 'KC' } }), 'KC favored by 7 by the betting lines');
  assert.equal(ctxWhat(bet(-0.35), { bet: { team: 'NYJ' } }), 'NYJ a 3.5-point underdog by the betting lines');
});
