// The history's lead quarterback out as live play reads it (re-check of 2026-10-14, libs/ranker/scripts/model):
// nflMatchups' listed (props.mjs nflListed: the game's injury report's Out and Doubtful, its team's reserve list
// for one not in the game) in place of the logs alone, where a benching or an unlisted inactive read as out too;
// a game with no report read (listed null) from its logs, as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nflMatchups } from '../libs/ranker/scripts/model/matchups.mjs';

const game = (id, date, list) =>
  list.map(([pid, pos, passAtt = 0, targets = 0]) => ({ pid, name: pid, pos, date, season: 2026, team: '1', opp: '2', game: id, home: true, s: { passAtt, targets, rushAtt: 0, snaps: 0 } }));
const day = (d) => new Date(Date.UTC(2026, 8, 1 + d)).toISOString().replace('.000', '');
// (eight games with the starter q, then the last one, z, without him: k throws)
const rows = () => {
  const out = [];
  for (let d = 0; d < 8; d++) out.push(...game(`a${d}`, day(d * 7), [['q', 'QB', 34], ['w', 'WR', 0, 8]]));
  out.push(...game('z', day(60), [['k', 'QB', 30], ['w', 'WR', 0, 8]]));
  return out;
};
const at = (list, pid, g) => list.find((r) => r.pid === pid && r.game === g);

test('qb1Out: not in the logs, read out with no listings (as before)', () => {
  const list = rows();
  nflMatchups(list);
  assert.ok(at(list, 'w', 'z').qb1Out > 0);
  assert.equal(at(list, 'w', 'a7').qb1Out, 0);
});

test('qb1Out: listed out on the report, read out', () => {
  const list = rows();
  nflMatchups(list, null, { listed: (g) => (g === 'z' ? new Map([['q', 'report']]) : new Map()) });
  assert.ok(at(list, 'w', 'z').qb1Out > 0);
});

test('qb1Out: not in the game but not listed (a benching), not read out', () => {
  const list = rows();
  nflMatchups(list, null, { listed: () => new Map() });
  assert.equal(at(list, 'w', 'z').qb1Out, 0);
});

test('qb1Out: on reserve and not in the game, read out; a game with no report read (null), from its logs', () => {
  const list = rows();
  nflMatchups(list, null, { listed: (g) => (g === 'z' ? new Map([['q', 'reserve']]) : new Map()) });
  assert.ok(at(list, 'w', 'z').qb1Out > 0);
  const bare = rows();
  nflMatchups(bare, null, { listed: () => null });
  assert.ok(at(bare, 'w', 'z').qb1Out > 0);
});

test('qb1Out: listed Doubtful and played anyway, read out (the report is what live play sees)', () => {
  const list = rows();
  list.push(...game('y', day(67), [['q', 'QB', 30], ['w', 'WR', 0, 8]]));
  nflMatchups(list, null, { listed: (g) => (g === 'y' ? new Map([['q', 'report']]) : new Map()) });
  assert.ok(at(list, 'w', 'y').qb1Out > 0);
  assert.equal(at(list, 'w', 'z').qb1Out, 0);
});
