// The desk's game-window kick (round D, 2026-10-17; apps/nfl/scripts/kick-window.mjs): a kick runs the bettor only
// when some sport has a game starting within 3 hours by ESPN's boards, else nothing (no run, no credits).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRACE_MIN, KICK_LEAGUES, WINDOW_HOURS, gamesSoon, soonOf } from '../apps/nfl/scripts/kick-window.mjs';

const NOW = Date.UTC(2026, 9, 18, 22, 0);
const ev = (id, minutes, state = 'pre') => ({ id, shortName: id, date: new Date(NOW + minutes * 60e3).toISOString(), status: { type: { state } } });

test('soonOf: games not started yet from a few minutes ago to 3 hours ahead, nearest first; started or far ones not', () => {
  const soon = soonOf([ev('far', 4 * 60), ev('late', 170), ev('live', 30, 'in'), ev('over', -60, 'post'), ev('soon', 25), ev('justStarted', -GRACE_MIN + 1), ev('tooLongAgo', -GRACE_MIN - 1), { id: 'noDate' }], NOW, WINDOW_HOURS, 'nba');
  assert.deepEqual(soon.map((x) => x.name), ['justStarted', 'soon', 'late']);
  assert.equal(soon[1].minutes, 25);
  assert.equal(soon[0].league, 'nba');
  assert.deepEqual(soonOf([], NOW), []);
  assert.deepEqual(soonOf(null, NOW), []);
});

test('gamesSoon: every league asked (today and tomorrow), a board that fails counts as no game there and is said', async () => {
  const asked = [];
  const fetchFn = async (url) => {
    asked.push(url);
    if (url.includes('hockey/nhl')) return { ok: false, status: 500 };
    const events = url.includes('basketball/nba') ? [ev('BOS @ NYK', 40), ev('LAL @ GSW', 160)] : url.includes('mma/ufc') ? [ev('UFC 330', 100)] : [];
    return { ok: true, status: 200, json: async () => ({ events }) };
  };
  const { soon, failed } = await gamesSoon(WINDOW_HOURS, NOW, fetchFn);
  // (two days a league; the league whose first board failed isn't asked for its second)
  assert.equal(asked.length, Object.keys(KICK_LEAGUES).length * 2 - 1);
  assert.ok(asked.some((u) => u.includes('dates=20261018')) && asked.some((u) => u.includes('dates=20261019')));
  // (the same event on both days' boards counted once)
  assert.deepEqual(soon.map((x) => `${x.league} ${x.name} ${x.minutes}`), ['nba BOS @ NYK 40', 'ufc UFC 330 100', 'nba LAL @ GSW 160']);
  assert.deepEqual(failed, ['nhl: ESPN hockey/nhl: HTTP 500']);
});
