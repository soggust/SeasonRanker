// The NFL's Next Gen Stats as the props read them (libs/ranker/scripts/model/ngs.mjs): no look-ahead. A week's
// NGS rows post after its last game (about Tuesday), so a row informs only games after its week's last kickoff
// plus NGS_PUB_HOURS: never its own week's, always the next week's (a Thursday game included). NGS's week-0 rows
// (a season's totals, its later games in them) are never read. Last season's count at half, older ones not.

import assert from 'node:assert/strict';
import test from 'node:test';
import { NGS_PUB_HOURS, ngsTable, pubTimes } from '../libs/ranker/scripts/model/ngs.mjs';

// (a 2025 schedule: week 5 Thursday 10-02 to Monday night 10-06, week 6 from Thursday 10-09)
const schedule = [
  { season: '2025', week: '5', gameday: '2025-10-02', gametime: '20:15' },
  { season: '2025', week: '5', gameday: '2025-10-05', gametime: '13:00' },
  { season: '2025', week: '5', gameday: '2025-10-06', gametime: '20:15' },
  { season: '2025', week: '6', gameday: '2025-10-09', gametime: '20:15' },
  { season: '2025', week: '6', gameday: '2025-10-12', gametime: '13:00' },
  { season: '2024', week: '3', gameday: '2024-09-22', gametime: '13:00' },
  { season: '2023', week: '3', gameday: '2023-09-24', gametime: '13:00' },
];
const pubOf = pubTimes(schedule);
const at = (s) => Date.parse(s);
const rec = (season, week, pid, sep, targets = 8, opp = null) => ({ kind: 'receiving', season: String(season), week: String(week), pid, pos: 'WR', opp, targets: String(targets), receptions: '5', avg_separation: String(sep), avg_cushion: '6', avg_yac_above_expectation: '0' });
// (a league of other receivers at 3.0 yards in every week, so the level is known)
const league = [5, 6].map((w) => rec(2025, w, 'other', 3, 100));

test('a week publishes at its last kickoff plus NGS_PUB_HOURS (the Monday night game, US Eastern)', () => {
  assert.equal(NGS_PUB_HOURS, 36);
  assert.equal(pubOf(2025, 5), at('2025-10-06T20:15:00-04:00') + 36 * 36e5);
  assert.equal(pubOf(2025, 7), null);
});

test("a week's row never informs its own week's games, and informs the next week's from Thursday on", () => {
  const t = ngsTable([...league, rec(2025, 5, 'me', 5)], pubOf);
  // (week 5's own games: Thursday, Sunday, the Monday night game: none sees his week-5 row)
  for (const kick of ['2025-10-02T20:15:00-04:00', '2025-10-05T13:00:00-04:00', '2025-10-06T20:15:00-04:00']) assert.equal(t.of('me', null, 2025, at(kick)).sep, 0, kick);
  // (published Wednesday 08:15 ET; Tuesday night still before it)
  assert.equal(t.of('me', null, 2025, at('2025-10-07T23:00:00-04:00')).sep, 0);
  const thu = t.of('me', null, 2025, at('2025-10-09T20:15:00-04:00')).sep;
  assert.ok(thu > 0, `week 6 Thursday reads week 5: ${thu}`);
});

test("the league's level is what was published by then, never a later week's", () => {
  // (week 6's others at 3.0 and a later week's at 9.0 that would move the level if read early)
  const t = ngsTable([rec(2025, 5, 'other', 3, 100), rec(2025, 6, 'other', 9, 1000), rec(2025, 5, 'me', 3)], pubOf);
  assert.equal(t.of('me', null, 2025, at('2025-10-09T20:15:00-04:00')).sep, 0);
});

test("NGS's week-0 rows (the season's totals) are never read", () => {
  const t = ngsTable([...league, rec(2025, 0, 'me', 9, 100)], pubOf);
  assert.equal(t.of('me', null, 2025, at('2025-10-12T13:00:00-04:00')).sep, 0);
  assert.equal(t.of('me', null, 2026, at('2026-09-13T13:00:00-04:00')).sep, 0);
});

test('last season counts at half, two seasons back not at all; unread is 0', () => {
  const base = [rec(2024, 3, 'other', 3, 100), rec(2023, 3, 'other', 3, 100), ...league];
  const t1 = ngsTable([...base, rec(2024, 3, 'me', 5, 30)], pubOf);
  const t2 = ngsTable([...base, rec(2023, 3, 'me', 5, 30)], pubOf);
  const now = at('2025-10-09T20:15:00-04:00');
  const v1 = t1.of('me', null, 2025, now).sep;
  // (30 targets at half: 15 at 5 yards against the prior's 30 at the level L, the league's published rows at
  // their weights (2025's week 5 in full, 2024's at half, his own among them; 2023's none))
  const L = (100 * 3 + 50 * 3 + 15 * 5) / 165;
  assert.equal(v1, Math.round(((15 * 5 + 30 * L) / 45 - L) / 0.5 * 1000) / 1000);
  assert.equal(t2.of('me', null, 2025, now).sep, 0);
  assert.equal(t1.of('nobody', null, 2025, now).sep, 0);
});

test("the other side's stacked boxes read only its published weeks", () => {
  const rush = (week, pid, box, opp) => ({ kind: 'rushing', season: '2025', week: String(week), pid, pos: 'RB', opp, rush_attempts: '100', rush_yards_over_expected_per_att: '0', percent_attempts_gte_eight_defenders: String(box) });
  const t = ngsTable([rush(5, 'a', 20, 'X'), rush(5, 'b', 20, 'Y'), rush(6, 'c', 60, 'X')], pubOf);
  assert.equal(t.of('me', 'X', 2025, at('2025-10-12T13:00:00-04:00')).oppBox, 0);
  assert.ok(t.of('me', 'X', 2025, at('2025-10-16T20:15:00-04:00')).oppBox > 0);
});

test('the feeds round on the stats where the held-out games bore them out (INPUTS.md), the rest on none', async () => {
  const { STATS, CTX } = await import('../libs/ranker/scripts/model/props.mjs');
  const { ctxKeys, FEEDS } = await import('../libs/ranker/scripts/model/project.mjs');
  const on = Object.entries(STATS).flatMap(([sport, list]) => list.flatMap((st) => ctxKeys(st).filter((k) => FEEDS.includes(`c_${k}`)).map((k) => `${sport} ${st.key} ${k}`)));
  assert.deepEqual(on, ['nfl passAtt aggr', 'nfl rushAtt ryoeP', 'nfl rec yacoe', 'nba pts zoneEdge', 'nba pts opp3']);
  // (every feed readable as a context term: the row's own value, 0 unread)
  for (const c of FEEDS) {
    const k = c.slice(2);
    assert.equal(CTX[k]({}, true, null, { [k]: 0.5 }), 0.5, k);
    assert.equal(CTX[k]({}, true, null, {}), 0, k);
  }
});

test('ryoeP is ryoe on its good side alone', () => {
  const rush = (week, pid, ryoe) => ({ kind: 'rushing', season: '2025', week: String(week), pid, pos: 'RB', opp: null, rush_attempts: '100', rush_yards_over_expected_per_att: String(ryoe), percent_attempts_gte_eight_defenders: '20' });
  const t = ngsTable([rush(5, 'good', 1), rush(5, 'poor', -1), rush(5, 'x', 0)], pubOf);
  const now = at('2025-10-09T20:15:00-04:00');
  assert.ok(t.of('good', null, 2025, now).ryoeP > 0);
  assert.equal(t.of('good', null, 2025, now).ryoeP, t.of('good', null, 2025, now).ryoe);
  assert.ok(t.of('poor', null, 2025, now).ryoe < 0);
  assert.equal(t.of('poor', null, 2025, now).ryoeP, 0);
});
