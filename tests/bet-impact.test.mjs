// Which plays moved a bet (bet-impact.ts): a prop's stat added to by a play (good for an over, bad for an under),
// the player's turnovers and blocked shots, a total moved by a point of pace or a six-point run (every goal in
// hockey), a side's covering flipping or a lead change, the final play; and the tags under them
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const live = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'live-entry.ts'), data: {} });
const { betImpact, afterPlay, statDelta, impactTag, walkPlays, importantPlays, nameKeys, yardsIn, START_STATE } = live;

const play = (over = {}) => ({ text: '', scoring: false, kind: null, athletes: [], side: null, awayScore: null, homeScore: null, share: 0.5, ...over });
const state = (over = {}) => ({ ...START_STATE, ...over });

test('names as the plays write them', () => {
  assert.deepEqual(nameKeys('Travis Kelce'), ['traviskelce', 'tkelce']);
  assert.deepEqual(nameKeys("De'Aaron Fox"), ['deaaronfox', 'dfox']);
  assert.deepEqual(nameKeys('Kenneth Walker III'), ['kennethwalker', 'kwalker']);
  assert.equal(yardsIn('T.Kelce for 12 yards'), 12);
  assert.equal(yardsIn('for a loss of 3 yards'), -3);
  assert.equal(yardsIn('up the middle for no gain'), 0);
});

test('an NBA points prop: his made shots add, by their worth; a teammate’s do nothing', () => {
  const bet = { sport: 'nba', market: 'prop', side: 'over', line: 24.5, pick: 'Jaylen Brown Over 24.5 Points', propType: 'pts', athlete: '3917376', player: 'Jaylen Brown', statLabel: 'pts' };
  const three = play({ text: 'Jaylen Brown makes 27-foot step-back three point jumper', scoring: true, athletes: ['3917376'], awayScore: 68, homeScore: 60 });
  assert.equal(statDelta(bet, three).add, 3);
  const before = state({ away: 65, home: 60, stat: 14 });
  const after = afterPlay(bet, three, before);
  assert.equal(after.stat, 17);
  assert.equal(betImpact(three, bet, before, after), 'good');
  assert.equal(impactTag(bet, three, after), 'J. BROWN O24.5 · 17 pts, needs 8');
  // (an under: the same shot hurts)
  assert.equal(betImpact(three, { ...bet, side: 'under' }, before, after), 'bad');
  // (a teammate's basket: nothing; by name when the play has no participants)
  const other = play({ text: 'Derrick White makes 25-foot three', scoring: true, awayScore: 63, homeScore: 56 });
  assert.equal(betImpact(other, bet, before, afterPlay(bet, other, before)), null);
  const named = play({ text: 'Jaylen Brown makes free throw 1 of 2', scoring: true });
  assert.equal(statDelta(bet, named).add, 1);
  // (his turnover: bad for the over, nothing for the under)
  const to = play({ text: 'Jaylen Brown bad pass (Josh Hart steals)', kind: 'Turnover', athletes: ['3917376'] });
  assert.equal(betImpact(to, bet, before, afterPlay(bet, to, before)), 'bad');
  assert.equal(betImpact(to, { ...bet, side: 'under' }, before, afterPlay(bet, to, before)), null);
  assert.equal(impactTag(bet, to, before), 'J. BROWN O24.5 · turnover');
  // (rebounds and assists)
  const reb = { ...bet, propType: 'reb', line: 7.5 };
  assert.equal(statDelta(reb, play({ text: 'Jaylen Brown defensive rebound', kind: 'Defensive Rebound', athletes: ['3917376'] })).add, 1);
  const ast = { ...bet, propType: 'ast', line: 4.5 };
  assert.equal(statDelta(ast, play({ text: 'Derrick White makes layup (Jaylen Brown assists)', scoring: true, athletes: ['1', '3917376'] })).add, 1);
  assert.equal(statDelta(ast, play({ text: 'Derrick White makes layup (Jaylen Brown assists)', scoring: true })).add, 1);
});

test('an NHL shots prop: a shot on goal counts, a blocked one is tagged bad and doesn’t count; a goalie’s saves', () => {
  const bet = { sport: 'nhl', market: 'prop', side: 'over', line: 3.5, pick: 'Auston Matthews Over 3.5 Shots', propType: 'sog', athlete: '4024123', player: 'Auston Matthews', statLabel: 'shots' };
  const shot = play({ text: 'Auston Matthews Wrist Shot saved by Sam Montembeault', kind: 'Shot', athletes: ['4024123'], side: 'away' });
  const s1 = afterPlay(bet, shot, state({ stat: 1 }));
  assert.equal(s1.stat, 2);
  assert.equal(betImpact(shot, bet, state({ stat: 1 }), s1), 'good');
  assert.equal(impactTag(bet, shot, s1), 'A. MATTHEWS O3.5 · 2 shots, needs 2');
  const blocked = play({ text: 'Auston Matthews shot blocked by Kaiden Guhle', kind: 'Blocked Shot', athletes: ['4024123'], side: 'away' });
  assert.equal(betImpact(blocked, bet, s1, afterPlay(bet, blocked, s1)), 'bad');
  assert.equal(impactTag(bet, blocked, s1), 'A. MATTHEWS O3.5 · blocked, doesn’t count');
  const goal = play({ text: 'Auston Matthews Goal', kind: 'Goal', scoring: true, athletes: ['4024123'], side: 'away', awayScore: 1, homeScore: 0 });
  assert.equal(statDelta(bet, goal).add, 1);
  // (the goalie: the other side's shots that aren't goals)
  const saves = { sport: 'nhl', market: 'prop', side: 'over', line: 27.5, pick: 'Sam Montembeault Over 27.5 Saves', propType: 'saves', athlete: '9', player: 'Sam Montembeault', statLabel: 'saves', team: 'home' };
  assert.equal(statDelta(saves, shot).add, 1);
  assert.equal(statDelta(saves, goal).add, 0);
  assert.equal(statDelta(saves, play({ text: 'Nick Suzuki Wrist Shot saved', kind: 'Shot', athletes: ['7'], side: 'home' })).add, 0);
  // (points: a goal he scored or assisted on)
  const pts = { ...bet, propType: 'pts', line: 0.5, statLabel: 'pts' };
  assert.equal(statDelta(pts, play({ text: 'William Nylander Goal (Auston Matthews assists)', kind: 'Goal', scoring: true, athletes: ['5', '4024123'] })).add, 1);
});

test('NFL props read the play text: the passer, the receiver, the rusher, yards and touchdowns, a fumble', () => {
  const text = '(4:12) P.Mahomes pass short right to T.Kelce for 12 yards (tackle by D.James)';
  const qb = { sport: 'nfl', market: 'prop', side: 'over', line: 274.5, pick: 'Patrick Mahomes Over 274.5 Passing Yards', propType: 'passYds', athlete: null, player: 'Patrick Mahomes', statLabel: 'pass yds' };
  const te = { sport: 'nfl', market: 'prop', side: 'over', line: 5.5, pick: 'Travis Kelce Over 5.5 Receptions', propType: 'rec', athlete: null, player: 'Travis Kelce', statLabel: 'rec' };
  const p = play({ text });
  assert.equal(statDelta(qb, p).add, 12);
  assert.equal(statDelta(te, p).add, 1);
  assert.equal(statDelta({ ...te, propType: 'recYds' }, p).add, 12);
  assert.equal(statDelta({ ...qb, propType: 'rec' }, p).add, 0);
  assert.equal(statDelta({ ...te, propType: 'passYds' }, p).add, 0);
  const inc = play({ text: '(3:50) P.Mahomes pass incomplete deep left to T.Kelce' });
  assert.equal(statDelta(qb, inc).add, 0);
  assert.equal(statDelta({ ...qb, propType: 'passAtt' }, inc).add, 1);
  assert.equal(statDelta(te, inc).add, 0);
  const run = play({ text: '(2:10) I.Pacheco left end for 7 yards (tackle by A.Hamilton)' });
  const rb = { ...te, player: 'Isiah Pacheco', propType: 'rushYds', line: 60.5 };
  assert.equal(statDelta(rb, run).add, 7);
  assert.equal(statDelta({ ...rb, propType: 'rushAtt' }, run).add, 1);
  const td = play({ text: '(1:02) P.Mahomes pass short middle to T.Kelce for 4 yards, TOUCHDOWN', scoring: true });
  assert.equal(statDelta({ ...te, propType: 'anyTd', line: 0.5 }, td).add, 1);
  assert.equal(statDelta({ ...qb, propType: 'passTd', line: 1.5 }, td).add, 1);
  const fumble = play({ text: '(0:40) I.Pacheco up the middle for 3 yards. I.Pacheco FUMBLES, RECOVERED by BAL-K.Hamilton' });
  assert.equal(betImpact(fumble, rb, state({ stat: 40 }), afterPlay(rb, fumble, state({ stat: 40 }))), 'bad');
  // (an interception is good for an interceptions prop, a turnover for the passer's yards)
  const int = play({ text: '(9:12) P.Mahomes pass deep right intended for T.Kelce INTERCEPTED by K.Hamilton' });
  assert.equal(statDelta({ ...qb, propType: 'passInt', line: 0.5 }, int).add, 1);
  assert.equal(statDelta(qb, int).turnover, true);
});

test('a basketball total moves on a point of pace or a six-point run; a hockey total on every goal', () => {
  const under = { sport: 'nba', market: 'total', side: 'under', line: 221.5, pick: 'Under 221.5' };
  // (pace 212 at 65% played: 138 points; a three at 66% lifts the pace to 213.6, over a point)
  const before = state({ away: 70, home: 68, share: 0.65 });
  const three = play({ text: 'Jalen Brunson makes 26-foot three', scoring: true, awayScore: 70, homeScore: 71, share: 0.66 });
  const after = afterPlay(under, three, before);
  assert.equal(betImpact(three, under, before, after), 'bad');
  assert.equal(impactTag(under, three, after), 'UNDER 221.5 · pace down to 214');
  assert.equal(betImpact(three, { ...under, side: 'over' }, before, after), 'good');
  // (two points over a minute of clock: the pace falls (good for the under), a point and more)
  const two = play({ text: 'Payton Pritchard makes floater', scoring: true, awayScore: 72, homeScore: 71, share: 0.69 });
  assert.equal(betImpact(two, under, after, afterPlay(under, two, after)), 'good');
  // (a basket that barely moves the pace: nothing; unless it extends a 6-0 run)
  const b2 = state({ away: 100, home: 100, share: 0.9, run: { side: 'home', pts: 4 } });
  const lay = play({ text: 'OG Anunoby makes layup', scoring: true, awayScore: 100, homeScore: 102, share: 0.905 });
  const a2 = afterPlay(under, lay, b2);
  assert.deepEqual(a2.run, { side: 'home', pts: 6 });
  assert.equal(betImpact(lay, under, b2, a2), 'bad');
  assert.match(impactTag(under, lay, a2), /^UNDER 221\.5 · 6–0 run, pace/);
  // (no score: nothing)
  const nothing = play({ text: 'Celtics timeout', share: 0.7 });
  assert.equal(betImpact(nothing, under, after, afterPlay(under, nothing, after)), null);
  // (hockey: every goal)
  const over = { sport: 'nhl', market: 'total', side: 'over', line: 6.5, pick: 'Over 6.5' };
  const goal = play({ text: 'Jack Eichel Goal', scoring: true, kind: 'Goal', awayScore: 1, homeScore: 1, share: 0.13 });
  const b3 = state({ away: 1, home: 0, share: 0.1 });
  assert.equal(betImpact(goal, over, b3, afterPlay(over, goal, b3)), 'good');
  assert.equal(impactTag(over, goal, afterPlay(over, goal, b3)), 'OVER 6.5 · pace up to 15');
});

test('a spread or moneyline moves only when its winning flips, or on the final play', () => {
  const spread = { sport: 'nba', market: 'spread', side: 'home', line: -4.5, pick: 'CLE -4.5' };
  // (covering by 5.5 (home up 10); a basket for the visitors leaves it covering: nothing)
  const b = state({ away: 20, home: 30, share: 0.3 });
  const quiet = play({ text: 'Giannis Antetokounmpo makes layup', scoring: true, awayScore: 22, homeScore: 30, share: 0.31 });
  assert.equal(betImpact(quiet, spread, b, afterPlay(spread, quiet, b)), null);
  // (home up 5: covering by 0.5; a free throw for the visitors: no longer covering)
  const b2 = state({ away: 25, home: 30, share: 0.4 });
  const ft = play({ text: 'Giannis Antetokounmpo makes free throw', scoring: true, awayScore: 26, homeScore: 30, share: 0.41 });
  const a2 = afterPlay(spread, ft, b2);
  assert.equal(betImpact(ft, spread, b2, a2), 'bad');
  assert.equal(impactTag(spread, ft, a2), 'CLE −4.5 · short by 0.5');
  // (a lead change moves a moneyline)
  const ml = { sport: 'nba', market: 'ml', side: 'away', line: null, pick: 'MIL ML' };
  const b3 = state({ away: 30, home: 31, share: 0.5 });
  const lead = play({ text: 'Giannis Antetokounmpo makes dunk', scoring: true, awayScore: 32, homeScore: 31, share: 0.51 });
  const a3 = afterPlay(ml, lead, b3);
  assert.equal(betImpact(lead, ml, b3, a3), 'good');
  assert.equal(impactTag(ml, lead, a3), 'MIL ML · leading by 1');
  // (a tie: bad for the side that led)
  const tie = play({ text: 'Donovan Mitchell makes free throw', scoring: true, awayScore: 32, homeScore: 32, share: 0.52 });
  assert.equal(betImpact(tie, ml, a3, afterPlay(ml, tie, a3)), 'bad');
  // (the final play carries the result)
  const fin = play({ text: 'End of game', final: true, share: 1 });
  assert.equal(betImpact(fin, ml, a3, afterPlay(ml, fin, a3)), 'good');
});

test('the walk and the important plays: newest first, scoring or bet-moving, six at most, the box score count on the latest', () => {
  const pts = { sport: 'nba', market: 'prop', side: 'over', line: 24.5, pick: 'Jaylen Brown Over 24.5 Points', propType: 'pts', athlete: '1', player: 'Jaylen Brown', statLabel: 'pts' };
  const plays = [
    play({ text: 'Jaylen Brown makes 16-foot jumper', scoring: true, athletes: ['1'], awayScore: 2, homeScore: 0, share: 0.02 }),
    play({ text: 'Josh Hart defensive rebound', kind: 'Defensive Rebound', athletes: ['2'], share: 0.03 }),
    play({ text: 'Jaylen Brown makes two free throws', scoring: true, athletes: ['1'], awayScore: 4, homeScore: 0, share: 0.04 }),
    play({ text: 'Karl-Anthony Towns makes layup', scoring: true, athletes: ['3'], awayScore: 4, homeScore: 2, share: 0.05 }),
    play({ text: 'Celtics timeout', share: 0.06 }),
  ];
  const walked = walkPlays(plays, [pts], () => 20);
  assert.equal(walked.length, 5);
  assert.equal(walked[0].impacts.length, 1);
  // (the plays' own sum on an earlier play; the box score's 20 on the latest that moved it)
  assert.equal(walked[0].impacts[0].tag, 'J. BROWN O24.5 · 2 pts, needs 23');
  assert.equal(walked[2].impacts[0].tag, 'J. BROWN O24.5 · 20 pts, needs 5');
  assert.equal(walked[1].impacts.length, 0);
  assert.equal(walked[3].impacts.length, 0);
  const important = importantPlays(walked);
  assert.deepEqual(
    important.map((w) => w.play.text),
    ['Karl-Anthony Towns makes layup', 'Jaylen Brown makes two free throws', 'Jaylen Brown makes 16-foot jumper'],
  );
  // (six at most)
  const many = walkPlays(Array.from({ length: 10 }, (_, i) => play({ text: `shot ${i}`, scoring: true, awayScore: i + 1, homeScore: 0, share: (i + 1) / 20 })), []);
  assert.equal(importantPlays(many).length, 6);
  assert.equal(importantPlays(many)[0].play.text, 'shot 9');
});
