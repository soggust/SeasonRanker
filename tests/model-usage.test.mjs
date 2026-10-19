// The usage on a prop's row (libs/ranker/scripts/model/usage.mjs, DECISIONS.md D36: usage first, rate second): one
// inspectable object per row made from the projection's own parts, on the projection, the ledger's bet and
// picks.json. Nothing is fit or stepped here: the fitted base's usage is the usage shown, so the price and the
// readout can't disagree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { UNITS, USAGE_V, usageOf, usageText } from '../libs/ranker/scripts/model/usage.mjs';
import { PA_BY_SLOT, paAt } from '../libs/ranker/scripts/model/matchups.mjs';

const src = (f) => fs.readFileSync(path.resolve('libs/ranker/scripts/model', f), 'utf8');

test('D36 the NFL: the snap share the base reads is the usage, his targets beside it; a quarterback his starts; the per-game base says so', () => {
  const u = usageOf('nfl', { snaps: true }, { mode: 'snaps', share: 0.72, volume: { targets: 7.1, share: 0.22, team: 32 }, roleUp: 'RB1' }, { snap: { latest: 0.8, avg: 0.7, n: 5 } });
  assert.equal(u.kind, 'snaps');
  assert.equal(u.unit, UNITS.snaps);
  assert.equal(u.expected, 0.72);
  assert.equal(u.last, 0.8);
  assert.equal(u.typical, 0.7);
  assert.equal(u.targets, 7.1);
  assert.equal(u.targetShare, 0.22);
  assert.equal(u.roleUp, 'RB1');
  const qb = usageOf('nfl', { starts: true }, { mode: 'starts', starts: 5, careerStarts: 40 }, { qbStart: true });
  assert.equal(qb.kind, 'starts');
  assert.equal(qb.expected, 5);
  assert.equal(qb.qb1, true);
  // (the per-game base: no usage number, the share he's known for rides along)
  const g = usageOf('nfl', { snaps: true }, { mode: null, share: null }, { snap: { latest: 0.5, avg: 0.55, n: 3 } });
  assert.equal(g.kind, 'games');
  assert.equal(g.expected, null);
  assert.equal(g.typical, 0.55);
});

test('D36 the NBA and NHL: minutes and time on ice from the minutes-first base, the power play beside the ice time', () => {
  const nba = usageOf('nba', { minutes: 48 }, { mode: 'minutes', share: 0.6, minutes: { season: 30, recent: 27 }, role: 'S' }, { startLast: 1 });
  assert.equal(nba.kind, 'minutes');
  assert.equal(nba.expected, 28.8);
  assert.equal(nba.typical, 30);
  assert.equal(nba.recent, 27);
  assert.equal(nba.startLast, 1);
  assert.equal(usageText(nba), '28.8 minutes, season 30, last three 27');
  const nhl = usageOf('nhl', { minutes: 60 }, { mode: 'minutes', share: 0.3, minutes: { season: 18, recent: 19.5 } }, { ppTime: 2.4, ppLean: 0.1 });
  assert.equal(nhl.kind, 'toi');
  assert.equal(nhl.expected, 18);
  assert.equal(nhl.pp, 2.4);
  // (points, no minutes base: the time on ice unknown, the power play still shown)
  const pts = usageOf('nhl', {}, { mode: null, share: null }, { ppTime: 1.1 });
  assert.equal(pts.expected, null);
  assert.equal(pts.pp, 1.1);
  const g = usageOf('nhl', { goalie: true }, { mode: null }, {});
  assert.equal(g.kind, 'starts');
});

test('D36 MLB: a batter at his lineup slot gets the slot\'s plate appearances, a starter his expected outs on a strikeouts row too', () => {
  const b = usageOf('mlb', { key: 'hits' }, {}, { slot: 3, paX: 0.05, start: true });
  assert.equal(b.kind, 'pa');
  assert.equal(b.expected, paAt(3));
  assert.equal(b.expected, PA_BY_SLOT[2]);
  assert.ok(b.typical < b.expected, 'his usual under the slot\'s where paX is over 0');
  assert.equal(b.slot, 3);
  const none = usageOf('mlb', { key: 'hits' }, {}, { slot: null });
  assert.equal(none.expected, null);
  const k = usageOf('mlb', { pitcher: true, key: 'k' }, { mode: null }, { leash: -0.1, restDays: 5, pitches: [88, 95] }, { outs: 16.2 });
  assert.equal(k.kind, 'outs');
  assert.equal(k.expected, 16.2);
  assert.equal(k.leash, -0.1);
  assert.deepEqual(k.pitches, [88, 95]);
  assert.equal(usageOf('mlb', { pitcher: true, key: 'outs' }, { mode: null }, {}, { outs: null }).expected, null);
  assert.equal(usageOf('mlb', {}, null, {}), null);
  assert.equal(USAGE_V, 1);
});

test('D36 the usage rides on the projection, the ledger\'s bet and picks.json; a strikeouts row reads the outs model', () => {
  const props = src('props.mjs');
  assert.ok(/const usage = usageOf\(sport, f\.stat, p, row, \{ outs: sport === 'mlb' && prop\.stat\.pitcher \? \(prop\.stat\.key === 'outs' \? mu : pitcherOuts\(fitted\.outs, row, info, pts, home\)\) : null \}\)/.test(props));
  assert.ok(/\.\.\.\(usage \? \{ usage \} : \{\}\), pOver: round\(pOver, 4\)/.test(props), 'the projection carries it');
  assert.ok(/projection: x\.projection/.test(src('run.mjs')), "the bet carries the projection");
  assert.ok(/b\.market === 'prop' && b\.projection\?\.usage \? \{ usage: b\.projection\.usage \}/.test(src('picks.mjs')), 'picks.json carries it');
  const decisions = fs.readFileSync(path.resolve('libs/ranker/scripts/model/DECISIONS.md'), 'utf8');
  assert.ok(decisions.includes('### D36.'));
});
