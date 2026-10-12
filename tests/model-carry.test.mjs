// The seasons' carryover (libs/ranker/scripts/model/project.mjs sk, rx, pl): the snaps-based rate's prior weighed
// as K games at his share (a part-timer's season not pulled to the prior harder than a starter's), his last five
// spanning the season boundary while this season has under 3 games, and his own prior leaning to last season's
// last 8 games (a role grown into late last season). Each off, the model exactly as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeModel } from '../libs/ranker/scripts/model/project.mjs';
import { STATS } from '../libs/ranker/scripts/model/props.mjs';

const STAT = { key: 'rec', snaps: true, carry: true };
const BASE = { K: 4, w: 0.4, a: 0, b: 0, roleK: Infinity, vc: 0, sn: 0, sr: 0 };
const SNAPS = { ...BASE, sn: 1, sr: 0 };
const date = (season, g) => `${season}-${g < 10 ? '09' : '10'}-${String((g % 10) + 1).padStart(2, '0')}T17:00Z`;
const row = (pid, season, g, v, share) => ({ pid, pos: 'RB', season, date: date(season, g), opp: 'o', team: '1', game: `${pid}${season}${g}`, s: { rec: v }, share });
// (Ty Johnson's shape: last season 8 games at 0 then 9 at 2, a 30% back; this season 4 and 2 at 30%; and a
// pool of backs at 3 a game, 60% of the snaps)
const pool = Array.from({ length: 30 }, (_, i) => row(`o${i}`, 2025, 0, 3, 0.6));
const lastSeason = Array.from({ length: 17 }, (_, g) => row('ty', 2025, g, g < 8 ? 0 : 2, 0.3));
const thisSeason = [row('ty', 2026, 0, 4, 0.3), row('ty', 2026, 1, 2, 0.3)];
const tonight = { pid: 'ty', pos: 'RB', season: 2026, date: date(2026, 5), opp: 'o', team: '1', game: 'tonight' };
function project(params, rows = [...lastSeason, ...thisSeason]) {
  const m = makeModel(STAT, params, {});
  m.learn(pool);
  for (const r of rows) m.learn([r]);
  return m.project(tonight);
}

test('carryover off (absent or 0): the projection exactly as before', () => {
  for (const p of [BASE, SNAPS]) {
    const plain = project(p);
    assert.deepEqual(project({ ...p, sk: 0, rx: 0, pl: 0 }), plain);
  }
});

test('pl: his own prior leans to last season\'s last 8 games (12 or more last season), the per-snap prior the same', () => {
  const off = project(BASE);
  const on = project({ ...BASE, pl: 1 });
  // (last season's 17: 18 catches, 1.06 a game; its last 8 at 2)
  assert.ok(Math.abs(off.prior - 18 / 17) < 1e-9);
  assert.ok(Math.abs(on.prior - 2) < 1e-9);
  assert.ok(on.rate > off.rate);
  const half = project({ ...BASE, pl: 0.5 });
  assert.ok(Math.abs(half.prior - (0.5 * 18 / 17 + 1)) < 1e-9);
  // (the snaps-based rate's prior by the snaps: 2 a game at 30% is 6.67 a full game's)
  const sOff = project(SNAPS);
  const sOn = project({ ...SNAPS, pl: 1 });
  assert.equal(sOn.mode, 'snaps');
  assert.ok(sOn.rate > sOff.rate);
  // (exactly: his per-snap prior 18 on 5.1 snap units before, the last 8's 16 on 2.4 with it; the rate K 4 of it
  // against this season's 6 on 0.6, times his share)
  assert.ok(Math.abs(sOff.rate - ((6 + (4 * 18) / 5.1) / 4.6) * sOff.share) < 1e-9);
  assert.ok(Math.abs(sOn.rate - ((6 + (4 * 16) / 2.4) / 4.6) * sOn.share) < 1e-9);
  // (the last 8's snap shares unread: the per-snap prior as before, the per-game one still moved)
  const unread = [...lastSeason.map((r, g) => ({ ...r, share: g < 9 ? 0.6 : null })), ...thisSeason];
  const [uOn, uOff] = [project({ ...SNAPS, pl: 1 }, unread), project(SNAPS, unread)];
  assert.equal(uOn.mode, 'snaps');
  assert.equal(uOn.rate, uOff.rate);
  assert.ok(Math.abs(uOn.prior - 2) < 1e-9);
  assert.ok(Math.abs(uOff.prior - 18 / 17) < 1e-9);
  // (last season under 12 games: as before)
  const short = [...lastSeason.slice(6), ...thisSeason];
  assert.deepEqual(project({ ...BASE, pl: 1 }, short), project(BASE, short));
  // (a season skipped: nothing carried over)
  const skipped = [...lastSeason.map((r) => ({ ...r, season: 2024, date: r.date.replace('2025', '2024') })), ...thisSeason];
  assert.deepEqual(project({ ...BASE, pl: 1, rx: 1 }, skipped), project(BASE, skipped));
});

test('rx: under 3 games this season, his last five made up with last season\'s latest at weight rx', () => {
  const off = project(BASE);
  // (2 games this season: the rate as his recent before)
  assert.equal(off.recent, off.rate);
  const on = project({ ...BASE, rx: 1 });
  // (last season's last three at 2 and this season's 4 and 2: 12 / 5)
  assert.ok(Math.abs(on.recent - 12 / 5) < 1e-9);
  const half = project({ ...BASE, rx: 0.5 });
  assert.ok(Math.abs(half.recent - (0.5 * 6 + 6) / (1.5 + 2)) < 1e-9);
  // (3 games this season or more: as before)
  const three = [...lastSeason, ...thisSeason, row('ty', 2026, 2, 1, 0.3)];
  // (his rate and last five as before; the opponent's tables learned from the games before moved with it)
  const [t1, t0] = [project({ ...BASE, rx: 1 }, three), project(BASE, three)];
  assert.equal(t1.recent, t0.recent);
  assert.equal(t1.rate, t0.rate);
  // (the per-snap last five the same: 12 catches on 1.5 full games' snaps, times his 30%)
  const s = project({ ...SNAPS, rx: 1 });
  assert.ok(Math.abs(s.recent - (12 / 1.5) * 0.3) < 1e-9);
  // (no game this season: the rate in as one game at weight 1, so rx weighs last season's last five against it)
  const z0 = project(BASE, lastSeason);
  assert.equal(z0.recent, z0.rate);
  const [z1, zh] = [project({ ...BASE, rx: 1 }, lastSeason), project({ ...BASE, rx: 0.5 }, lastSeason)];
  assert.ok(Math.abs(z1.recent - (10 + z1.rate) / 6) < 1e-9);
  assert.ok(Math.abs(zh.recent - (5 + zh.rate) / 3.5) < 1e-9);
  // (per snap: his last five's 10 on 1.5 snap units and the per-snap rate (his prior, 18 on 5.1) as one full game's)
  const zs = project({ ...SNAPS, rx: 1 }, lastSeason);
  assert.ok(Math.abs(zs.recent - ((10 + 18 / 5.1) / 2.5) * zs.share) < 1e-9);
});

test('sk: the snaps-based prior weighed as K games at his share, a part-timer\'s season not pulled harder than a starter\'s', () => {
  const off = project(SNAPS);
  const on = project({ ...SNAPS, sk: 1 });
  // (K 4 against his 0.6 of snap units: 4 / 4.6 before; 4 x 0.3 against 0.6: 1.2 / 1.8 with it, as 4 games against 2)
  assert.ok(Math.abs(off.priorW - 4 / 4.6) < 1e-9);
  assert.ok(Math.abs(on.priorW - 1.2 / 1.8) < 1e-9);
  assert.ok(on.rate > off.rate);
  // (the per-game base: no snaps, as before)
  assert.deepEqual(project({ ...BASE, sk: 1 }), project(BASE));
});

test('the carryover\'s stats: the NFL backs\' and pass-catchers\'; not the passers\', the NHL\'s (taken on neither), the NBA\'s or MLB\'s', () => {
  const carry = (sport) => STATS[sport].filter((s) => s.carry).map((s) => s.key);
  assert.deepEqual(carry('nfl'), ['rushYds', 'rushAtt', 'recYds', 'rec', 'rushRecYds']);
  assert.deepEqual(carry('nhl'), []);
  assert.deepEqual(carry('nba'), []);
  assert.deepEqual(carry('mlb'), []);
});
