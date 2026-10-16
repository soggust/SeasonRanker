// The card splash's scenes (libs/ranker/src/engine/player-card/splash): which props a season gets, by how it
// ended and its awards; the hand-set seasons; the most meaningful prop in the middle; the locker for a season
// still being played and the shelf for a finished one; props left out until the data has their words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'libs/ranker/src/engine/player-card/splash');
const out = path.join(os.tmpdir(), `splash-${process.pid}.mjs`);
await build({ entryPoints: [path.join(DIR, 'splash.scene.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
const { buildScene, fill, roman } = await import(pathToFileURL(out).href);
fs.rmSync(out, { force: true });
const { pickProps, centered, SCENE_OVERRIDES, PROPS } = await (async () => {
  const o = path.join(os.tmpdir(), `splash-props-${process.pid}.mjs`);
  await build({ entryPoints: [path.join(DIR, 'splash.props.ts')], bundle: true, format: 'esm', platform: 'node', outfile: o, logLevel: 'silent' });
  const m = await import(pathToFileURL(o).href);
  fs.rmSync(o, { force: true });
  return m;
})();

const base = { sport: 'nfl', tab: 'TM', id: 'TM-Chiefs', season: 2023, current: false, team: true, awards: [] };
const scene = (over) =>
  buildScene({ sport: 'nfl', tab: 'TM', id: 'TM-Chiefs', season: 2023, seasonLabel: '2023', current: false, team: true, name: 'Kansas City Chiefs', teamName: 'Kansas City Chiefs', abbr: 'KC', awards: [], ...over });

test('a champion leads with its title trophy, then its conference trophy', () => {
  assert.deepEqual(pickProps({ ...base, awards: ['sb', 'conf'], conf: 'nfl-afc-trophy' }).slice(0, 2), ['nfl-lombardi', 'nfl-afc-trophy']);
  assert.equal(pickProps({ ...base, sport: 'nhl', awards: ['cup', 'conf'], conf: 'nhl-wales-trophy' })[0], 'nhl-stanley-cup');
  assert.equal(pickProps({ ...base, sport: 'nba', awards: ['champ'] })[0], 'nba-obrien');
  assert.equal(pickProps({ ...base, sport: 'mlb', awards: ['ws', 'pennant'], conf: 'mlb-pennant' })[0], 'mlb-commissioners-trophy');
});

test('a finalist leads with its conference trophy; no title trophy', () => {
  const ids = pickProps({ ...base, awards: ['conf'], conf: 'nfl-nfc-trophy', lostGame: true });
  assert.equal(ids[0], 'nfl-nfc-trophy');
  assert.ok(!ids.includes('nfl-lombardi'));
  assert.ok(ids.includes('ticket-stub'));
});

test('a playoff exit shows the ticket stub; a division title leads', () => {
  assert.deepEqual(pickProps({ ...base, tier: 'playoffs', lostGame: true }).slice(0, 1), ['ticket-stub']);
  const ids = pickProps({ ...base, tier: 'playoffs', lostGame: true, division: true, roundWon: true });
  assert.deepEqual(ids, ['division-banner', 'ticket-stub', 'round-plaque']);
});

test('a missed season goes to Cancún, the boarding pass in the middle; a near miss to the golf course', () => {
  assert.equal(pickProps({ ...base, tier: 'missed' })[0], 'boarding-pass');
  const s = scene({ outcome: { result: 'missed', record: '4-13' } });
  assert.equal(s.stage, 'shelf');
  assert.equal(s.items[s.lead].t, 'pass');
  assert.equal(pickProps({ ...base, tier: 'bubble' })[0], 'scorecard');
});

test('the lead stands in the middle of three', () => {
  assert.deepEqual(centered(['a', 'b', 'c']), ['b', 'a', 'c']);
  assert.deepEqual(centered(['a', 'b']), ['a', 'b']);
  const s = scene({ awards: [{ id: 'sb', title: '2023 Super Bowl Champion' }, { id: 'conf', title: '2023 AFC Champion (Lamar Hunt Trophy)' }] });
  assert.equal(s.items[s.lead].t, 'lombardi');
  assert.equal(s.lead, 1);
});

test('a hand-set season wins over the rules (Deflategate)', () => {
  assert.ok(SCENE_OVERRIDES['nfl:QB:QB-2330:2015']);
  assert.equal(pickProps({ ...base, tab: 'QB', id: 'QB-2330', season: 2015, team: false, awards: ['pb'] })[0], 'deflated-football');
  // (its ticket needs the game it ended in: until the data has it, a filler takes its place)
  const s = scene({ tab: 'QB', id: 'QB-2330', season: 2015, team: false, name: 'Tom Brady', teamName: 'New England Patriots', awards: [{ id: 'pb', title: '2015 Pro Bowl' }] });
  assert.equal(s.items[s.lead].t, 'deflated');
  assert.ok(!s.items.some((i) => i.t === 'stub'));
});

test('a season still being played is the locker; a finished one the shelf', () => {
  assert.equal(scene({ current: true, season: 2026, roster: [{ name: 'Trevor Lawrence', pos: 'QB', num: '16' }, { name: 'Travis Etienne', pos: 'RB' }] }).stage, 'locker');
  assert.equal(scene({ current: true, season: 2026 }), null, 'no roster yet: no locker');
  const me = scene({ current: true, season: 2026, team: false, tab: 'WR', name: 'Parker Washington', number: '11' });
  assert.equal(me.stage, 'locker');
  assert.ok(me.stalls.some((st) => st.mine && st.jersey?.num === '11'));
  assert.ok(!me.stalls.some((st) => ['lombardi', 'honors'].includes(st.item?.t)), 'no trophies in a season still being played');
  assert.equal(scene({ awards: [{ id: 'sb', title: '2023 Super Bowl Champion' }] }).stage, 'shelf');
});

test("a team locker's key player in the middle", () => {
  const s = scene({ current: true, season: 2026, roster: ['QB', 'RB', 'WR', 'WR', 'TE'].map((pos, i) => ({ name: `P ${i}`, pos })) });
  const mid = s.stalls.findIndex((st) => st.star);
  assert.equal(s.stalls[mid].plate, 'QB');
  assert.equal(mid, Math.floor(s.stalls.length / 2));
});

test("a player's finished season: his top award leads", () => {
  assert.equal(pickProps({ ...base, tab: 'QB', team: false, awards: ['mvp', 'ap1', 'pb'], plaques: true })[0], 'nfl-honors');
  assert.equal(pickProps({ ...base, sport: 'nba', tab: 'PG', team: false, awards: ['champ', 'mvp'] })[0], 'nba-jordan-mvp');
  assert.equal(pickProps({ ...base, sport: 'mlb', tab: 'OF', team: false, awards: ['mvp', 'ss'] }).slice(0, 2).join(), 'mlb-mvp,mlb-silver-slugger');
});

test('a fighter: the belt when a champion, and his gloves', () => {
  assert.deepEqual(pickProps({ ...base, sport: 'mma', tab: 'WW', team: false, awards: ['champ'] }), ['title-belt', 'fight-gloves']);
  assert.deepEqual(pickProps({ ...base, sport: 'mma', tab: 'WW', team: false, awards: [] }), ['fight-gloves']);
});

test('every prop is drawn by a piece, sized by a real height', () => {
  for (const [id, p] of Object.entries(PROPS)) {
    assert.ok(p.piece, id);
    assert.ok(p.inches > 0 && p.inches < 60, id);
  }
});

test('templates drop the parts their data lacks', () => {
  assert.equal(fill('Stanley Cup champions · {final}', {}), 'Stanley Cup champions');
  assert.equal(fill('{a} · {b}', { a: 'x', b: 'y' }), 'x · y');
  assert.equal(roman(58), 'LVIII');
});
