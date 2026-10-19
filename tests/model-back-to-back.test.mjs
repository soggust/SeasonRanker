// The back-to-backs on the props (audit #6): the other side's (oppB2b), the NBA's own by role (b2bS, b2bB), the
// stats that carry them (an NHL goalie's saves his side's; an NBA bench player's own in place of one size for
// every player, pts+reb+ast's one size kept), the role read only from what's known before the game (matchups.mjs
// roleKnown) and the write-up's words and rest-talk check (props.mjs CTX, STATS; writeup.mjs ctxWhat, validate).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ctxKeys } from '../libs/ranker/scripts/model/project.mjs';
import { CTX, STATS, ctxValues } from '../libs/ranker/scripts/model/props.mjs';
import { nbaMatchups } from '../libs/ranker/scripts/model/matchups.mjs';
import { ctxWhat, validate } from '../libs/ranker/scripts/model/writeup.mjs';

test("the back-to-backs by side: his own, the other side's, and none known (no effect)", () => {
  const info = { b2b: [1, 0] };
  assert.deepEqual(ctxValues(['b2b', 'oppB2b'], info, true, null), [1, 0]);
  assert.deepEqual(ctxValues(['b2b', 'oppB2b'], info, false, null), [0, 1]);
  assert.deepEqual(ctxValues(['b2b', 'oppB2b'], {}, true, null), [0, 0]);
  assert.deepEqual(ctxValues(['b2b', 'oppB2b'], null, false, null), [0, 0]);
});

test("an NBA player's own back-to-back by his role: a starter's or a bench player's, none without a role", () => {
  const info = { b2b: [1, 1] };
  assert.equal(CTX.b2bS(info, true, null, { roleKnown: 'S' }), 1);
  assert.equal(CTX.b2bB(info, true, null, { roleKnown: 'S' }), 0);
  assert.equal(CTX.b2bB(info, false, null, { roleKnown: 'B' }), 1);
  assert.equal(CTX.b2bS(info, false, null, { roleKnown: 'B' }), 0);
  // (no role known (under three games): neither, the old projection; the roleK role (B for one unranked) not read)
  assert.equal(CTX.b2bB(info, true, null, { roleKnown: null, role: 'B' }), 0);
  assert.equal(CTX.b2bB(info, true, null, null), 0);
  // (his side not on one: 0 whatever his role)
  assert.equal(CTX.b2bB({ b2b: [0, 1] }, true, null, { roleKnown: 'B' }), 0);
  // (pts+reb+ast's one size: his side's, whatever his role)
  assert.equal(CTX.b2bAll(info, true, null, null), 1);
  assert.equal(CTX.b2bAll({ b2b: [0, 1] }, true, null, null), 0);
});

test("the stats' back-to-backs: the NBA's bench one in place of the one size, the NHL's on a goalie's saves", () => {
  for (const st of STATS.nba) {
    if (st.key === 'pra') continue;
    // (points without it: its keep at the floor didn't hold on other windows (props.mjs PTS_CTX, 2026-10-14))
    assert.equal(ctxKeys(st).includes('b2bB'), st.key !== 'pts', st.key);
    assert.ok(!ctxKeys(st).includes('b2b') && !ctxKeys(st).includes('b2bAll') && !ctxKeys(st).includes('b2bS') && !ctxKeys(st).includes('oppB2b'), st.key);
  }
  // (pts+reb+ast keeps the one size in the main search, its old place in the order: b2bB isn't kept there)
  assert.deepEqual(ctxKeys(STATS.nba.find((s) => s.key === 'pra')), ['usage', 'b2bAll', 'blowout']);
  assert.deepEqual(ctxKeys(STATS.nhl.find((s) => s.key === 'saves')), ['oppShots', 'b2b']);
  // (the skaters' as audit #13 left them: shots the power-play lean, points the goalie and the side's expected shots, the power play by the other side's penalties kept in its
  // search: the review of 2026-10-13)
  assert.deepEqual(ctxKeys(STATS.nhl.find((s) => s.key === 'sog')), ['ppLean']);
  assert.deepEqual(ctxKeys(STATS.nhl.find((s) => s.key === 'pts')), ['pp', 'oppGoalie', 'teamShots']);
});

test("the write-up names a back-to-back when it moved the projection most", () => {
  const bet = (ctx, applied) => ({ projection: { ctx, applied } });
  assert.equal(ctxWhat(bet({ usage: 0, b2bB: 1 }, { c_b2bB: 0.1 }), { bet: { team: 'BOS' } }), 'a back-to-back (more bench minutes)');
  assert.equal(ctxWhat(bet({ oppShots: 0, b2b: 1 }, { c_b2b: 0.03 }), { bet: { team: 'BOS', opponent: 'TOR' } }), 'a back-to-back');
  assert.equal(ctxWhat(bet({ oppB2b: 1 }, { c_oppB2b: 0.05 }), { bet: { team: 'BOS', opponent: 'TOR' } }), 'TOR on a back-to-back');
});

test("the NBA's known role: none for a player not ranked himself, the history's rest the night of not counted out", () => {
  const mins = { a: 36, b: 34, c: 32, d: 30, e: 28, f: 20, g: 12 };
  const row = (pid, d, min = mins[pid]) => ({ pid, name: pid, pos: 'G', date: `2025-11-0${d}T00:00Z`, season: 2026, team: '1', opp: '2', game: `g${d}`, home: true, s: { min, pts: min / 2, ast: 2, reb: 3, fga: min / 3, fta: 2 } });
  // (after one game: no one ranked, so no role known, and roleK's none either (DECISIONS.md D50: it read every
  // player B, the stars priced against the bench's table))
  const one = Object.keys(mins).map((pid) => row(pid, 1));
  const m1 = nbaMatchups(one);
  const star = m1.live('a', '1', '2', 'G', 2026, () => 0);
  assert.equal(star.role, null);
  assert.equal(star.roleKnown, null);
  assert.equal(CTX.b2bB({ b2b: [1, 0] }, true, null, star), 0);
  // (games 2 and 3 in the history: no row's role, none known (D50))
  const rows = [];
  for (let d = 1; d <= 4; d++) for (const pid of Object.keys(mins)) rows.push(row(pid, d));
  // (game 5: a rests and c is out, both played game 4: f starts by the box score, the bench by what's known;
  // game 6: c out again, known out by then)
  for (const pid of ['b', 'd', 'e', 'f', 'g']) rows.push(row(pid, 5));
  for (const pid of ['a', 'b', 'd', 'e', 'f', 'g']) rows.push(row(pid, 6));
  nbaMatchups(rows);
  const at = (pid, d) => rows.find((r) => r.pid === pid && r.game === `g${d}`);
  assert.equal(at('a', 3).role, null);
  assert.equal(at('a', 3).roleKnown, null);
  assert.equal(at('a', 4).roleKnown, 'S');
  // (game 5: a and c out, neither out the game before: f a starter by the box score, the bench by what's known)
  assert.equal(at('f', 5).role, 'S');
  assert.equal(at('f', 5).roleKnown, 'B');
  // (game 6: c out his second game in a row, known; f the fifth)
  assert.equal(at('f', 6).roleKnown, 'S');
  // (live: the injury report's out counted out; a player just traded in, no role known)
  const m = nbaMatchups(rows);
  assert.equal(m.live('f', '1', '2', 'G', 2026, new Set(['a'])).roleKnown, 'S');
  assert.equal(m.live('new', '1', '2', 'G', 2026, () => 0).roleKnown, null);
  assert.equal(m.live('new', '1', '2', 'G', 2026, () => 0).role, 'B');
});

test("the rest-talk check reads a back-to-back flag by its value, not its being there", () => {
  const sheet = (ctx) => ({ bet: {}, projection: { ctx }, game: {} });
  const text = 'he plays on a back-to-back tonight.';
  assert.deepEqual(validate(text, sheet({ usage: 0, b2bB: 0 })), ['rest talk without rest on the sheet']);
  assert.deepEqual(validate(text, sheet({ oppShots: 0.1, b2b: 0 })), ['rest talk without rest on the sheet']);
  assert.deepEqual(validate(text, sheet({ usage: 0, b2bB: 1 })), []);
  assert.deepEqual(validate(text, sheet({ usage: 0, b2bAll: 1 })), []);
});
