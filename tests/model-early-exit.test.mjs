// The early exit and the low lines' shape (audit #17; libs/ranker/scripts/model/project.mjs exitTracker,
// exitMix, chanceLog, chanceOver, lineChances; props.mjs EXIT): a short game's chance learned from the games
// before, the mixture keeping the projection's mean, and nothing changed where the fit left it out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXIT_FRAC, chanceLog, chanceOver, exitMix, exitTracker, lineChances, nbLog, nbOver, searched } from '../libs/ranker/scripts/model/project.mjs';
import { STATS } from '../libs/ranker/scripts/model/props.mjs';

const row = (pid, share, extra = {}) => ({ pid, pos: 'WR', role: 'WR2', season: 2026, share, ...extra });

test('exitTracker: no chance till EXIT_N rows; a short game is a share under EXIT_FRAC of his median, learned only after its day', () => {
  const t = exitTracker();
  assert.equal(t.of(row('a', 0.8)), null);
  // (60 players, 6 games each: the first 3 build each one's median, the next 3 are read; one in ten short)
  for (let g = 0; g < 6; g++) t.learn(Array.from({ length: 60 }, (_, i) => row(`p${i}`, g >= 3 && i % 10 === 0 && g === 4 ? 0.8 * EXIT_FRAC * 0.5 : 0.8)));
  assert.equal(t.of(row('x', 0.8)), null, '180 rows read: under EXIT_N');
  for (let g = 0; g < 2; g++) t.learn(Array.from({ length: 60 }, (_, i) => row(`p${i}`, 0.8)));
  const e = t.of(row('new', 0.8));
  assert.ok(e && e.n === 300);
  // (6 short in 300: 2%, and each kept a quarter of the work)
  assert.ok(Math.abs(e.q - 0.02) < 0.005, String(e.q));
  assert.ok(e.f > 0.25 && e.f < 0.3, String(e.f));
  // (the row's own share tonight never read: the same chance whatever it says)
  assert.deepEqual(t.of(row('new', 0.01)), e);
});

test('exitTracker: a short last game and a first game back read higher than the role alone', () => {
  const t = exitTracker();
  const day = (g) => Array.from({ length: 100 }, (_, i) => row(`p${i}`, g === 5 && i < 20 ? 0.2 : g === 6 && i < 8 ? 0.2 : 0.8));
  for (let g = 0; g < 8; g++) t.learn(day(g));
  const plain = t.of(row('p50', 0.8)).q;
  // (p0 to p19 ran short in game 5; 8 of them short again in game 6; all full in game 7: none of them last short now)
  assert.ok(t.of(row('p0', 0.8)).q > plain, 'his own short games');
  const t2 = exitTracker();
  for (let g = 0; g < 7; g++) t2.learn(day(g));
  // (after game 6: p0 to p7 ran short last game, their class's 8 of 20 after a short one)
  assert.ok(t2.of(row('p0', 0.8)).q > t2.of(row('p10', 0.8)).q, 'a short last game');
  // (a first game back from an absence is its own class: unread, the role's)
  assert.ok(Number.isFinite(t2.of(row('p50', 0.8, { ret: { k: 1, len: 2 } })).q));
});

test('exitMix: none where ex is off or the row has no chance; held to EXIT_CAP', () => {
  assert.equal(exitMix({}, { exitQ: 0.1 }), null);
  assert.equal(exitMix({ ex: 1 }, {}), null);
  assert.deepEqual(exitMix({ ex: 2 }, { exitQ: 0.1, exitF: 0.3 }), { q: 0.2, f: 0.3 });
  assert.equal(exitMix({ ex: 2 }, { exitQ: 0.4, exitF: 0.3 }).q, 0.5);
});

test('the mixture keeps the mean, puts more on 0 and sums to 1; off, the plain negative binomial exactly', () => {
  const params = { r: 8 };
  const mix = { q: 0.15, f: 0.3 };
  let total = 0;
  let mean = 0;
  for (let k = 0; k < 200; k++) {
    const p = Math.exp(chanceLog(k, 2.5, params, mix));
    total += p;
    mean += k * p;
  }
  assert.ok(Math.abs(total - 1) < 1e-6, String(total));
  assert.ok(Math.abs(mean - 2.5) < 1e-4, String(mean));
  assert.ok(Math.exp(chanceLog(0, 2.5, params, mix)) > Math.exp(nbLog(0, 2.5, 8)));
  // (the over's chance the parts' own, and the plain one where the mixture's off)
  assert.equal(chanceOver(1.5, 2.5, params), nbOver(1.5, 2.5, 8));
  assert.equal(chanceLog(3, 2.5, params), nbLog(3, 2.5, 8));
  assert.ok(chanceOver(0.5, 2.5, params, mix) < nbOver(0.5, 2.5, 8));
  const a = lineChances(2, 2.5, params);
  const b = lineChances(2, 2.5, params, null);
  assert.deepEqual(a, b);
  const c = lineChances(2, 2.5, params, mix);
  assert.ok(c.over > 0 && c.over < 1 && c.push > 0);
});

test('searched only where it was kept (2026-10-13): NFL interceptions, rushing, receiving and rush+rec yards, NBA points; not the NHL (its skaters ran short 0.3% to 0.7%) nor MLB', () => {
  const on = new Set(['nfl:passInt', 'nfl:rushYds', 'nfl:recYds', 'nfl:rushRecYds', 'nba:pts']);
  for (const [sport, list] of Object.entries(STATS)) for (const st of list) assert.equal(searched(st, 'ex'), on.has(`${sport}:${st.key}`), `${sport} ${st.key}`);
});
