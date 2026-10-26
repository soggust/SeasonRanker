// The Live tab's pure parts: the clock read off ESPN's scoreboard words and the share of the game played
// (live-games.ts), today's games off the boards and the card's state, the sparkline, the bot's read; and a bet
// watched on a live game (live-bets.ts): its status and tone, its meter, its captions, and the sweat summary
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const live = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'live-entry.ts'), data: {} });
const { readDetail, gameShare, boardShare, clockWords, boardLabel, todayGames, cardState, sparkPath, botRead, shortTeam, betWatch, sweatOf, onTrackWords, shortPick, shortPickParts, betSub, withHurt, inGameInjury, nameForms, periodNumber, clockSeconds } = live;

// (Saturday Oct 17, 2026, 7pm Eastern)
const NOW = Date.parse('2026-10-17T23:00:00Z');

test('ESPN’s clock words, read: period and seconds left, the half, a period’s end, baseball’s innings', () => {
  assert.deepEqual(readDetail('nba', '4:12 - 3rd'), { period: 3, left: 252, half: null });
  assert.deepEqual(readDetail('nhl', '11:40 - 2nd'), { period: 2, left: 700, half: null });
  assert.deepEqual(readDetail('nba', 'Halftime'), { period: 2, left: 0, half: null });
  assert.deepEqual(readDetail('nba', 'End of 1st'), { period: 1, left: 0, half: null });
  assert.deepEqual(readDetail('nba', '2:05 - OT'), { period: 5, left: 125, half: null });
  assert.deepEqual(readDetail('nhl', '3:05 - OT'), { period: 4, left: 185, half: null });
  assert.deepEqual(readDetail('mlb', 'Top 5th'), { period: 5, left: null, half: 'top' });
  assert.deepEqual(readDetail('mlb', 'Bot 9th'), { period: 9, left: null, half: 'bot' });
  assert.equal(readDetail('nba', 'Final'), null);
  assert.equal(periodNumber('2OT', 'nba'), 6);
  assert.equal(clockSeconds('0:48.3'), 48.3);
});

test('how far a game has gone', () => {
  assert.equal(gameShare('nba', 'pre', null, null), 0);
  assert.equal(gameShare('nba', 'post', 3, 100), 1);
  // (3rd quarter, 4:12 left: 2 quarters and 7:48 of the third, of 48 minutes)
  assert.ok(Math.abs(gameShare('nba', 'in', 3, 252) - (1440 + 468) / 2880) < 1e-9);
  assert.equal(gameShare('nba', 'in', 2, 0), 0.5);
  assert.ok(Math.abs(gameShare('nhl', 'in', 2, 700) - (1200 + 500) / 3600) < 1e-9);
  // (overtime: the regulation plus the extra period's length)
  assert.ok(Math.abs(gameShare('nba', 'in', 5, 150) - (2880 + 150) / 3180) < 1e-9);
  assert.equal(gameShare('nfl', 'in', 1, 900), 0);
  assert.equal(gameShare('mlb', 'in', 5, null, 'top'), 4 / 9);
  assert.equal(gameShare('mlb', 'in', 5, null, 'bot'), 4.5 / 9);
  assert.equal(gameShare('mlb', 'in', 11, null, 'top'), 10 / 11);
  assert.equal(gameShare('nba', 'in', null, null), null);
  assert.ok(Math.abs(boardShare({ sport: 'nba', state: 'in', detail: '4:12 - 3rd' }) - 0.6625) < 1e-9);
  assert.equal(boardShare({ sport: 'nba', state: 'in', detail: 'Delayed' }), null);
});

test('the card’s clock and the LED board’s label', () => {
  assert.equal(clockWords({ state: 'in', detail: '4:12 - 3rd', start: '' }), '3RD 4:12');
  assert.equal(clockWords({ state: 'in', detail: 'End of 1st', start: '' }), 'END 1ST');
  assert.equal(clockWords({ state: 'in', detail: 'Halftime', start: '' }), 'HALFTIME');
  assert.equal(clockWords({ state: 'in', detail: 'Top 5th', start: '' }), 'TOP 5TH');
  assert.equal(clockWords({ state: 'post', detail: 'Final/OT', start: '' }), 'FINAL/OT');
  assert.equal(clockWords({ state: 'post', detail: '', start: '' }), 'FINAL');
  assert.match(clockWords({ state: 'pre', detail: '', start: '2026-10-17T23:00:00Z' }, NOW), /^\d{1,2}:\d{2} [AP]M$/);
  assert.match(clockWords({ state: 'pre', detail: '', start: '2026-10-18T23:00:00Z' }, NOW), /^Sun \d{1,2}:\d{2} [AP]M$/);
  assert.equal(boardLabel('nba', 'in', 3, '4:12', '4:12 - 3rd Quarter'), '3RD QTR · 4:12');
  assert.equal(boardLabel('nhl', 'in', 2, '11:40', '11:40 - 2nd Period'), '2ND PER · 11:40');
  assert.equal(boardLabel('nba', 'in', 5, '2:05', '2:05 - OT'), 'OT · 2:05');
  assert.equal(boardLabel('nba', 'in', 2, '0:00', 'Halftime'), 'HALFTIME');
  assert.equal(boardLabel('mlb', 'in', 6, null, 'Top 6th'), 'TOP 6TH');
  assert.equal(boardLabel('nba', 'post', 4, '0:00', 'Final'), null);
});

test('today’s games off the boards: under way first, then today’s to come, the finished last; no UFC bouts', () => {
  const g = (sport, event, state, start, detail = '') => ({ sport, event, matchup: `${event}A @ ${event}B`, start, state, detail, final: state === 'post' });
  const boards = [
    g('nba', '1', 'pre', '2026-10-18T01:00:00Z'),
    g('nhl', '2', 'in', '2026-10-17T23:00:00Z', '11:40 - 2nd'),
    g('nba', '3', 'post', '2026-10-17T17:00:00Z', 'Final'),
    // (tomorrow's: not today)
    g('nba', '4', 'pre', '2026-10-18T23:00:00Z'),
    // (a fight off the bettor's own board: no scoreboard)
    g('mma', '5', 'pre', '2026-10-18T01:00:00Z'),
    // (a board game that's started, no scoreboard behind it)
    g('nhl', '6', 'in', '2026-10-17T22:00:00Z', 'Started'),
    g('nba', '7', 'pre', '2026-10-17T23:30:00Z'),
  ];
  const sports = ['nfl', 'nba', 'nhl', 'mlb'];
  const today = todayGames(boards, NOW, sports);
  assert.deepEqual(
    today.map((x) => x.event),
    ['2', '7', '1', '3'],
  );
  assert.deepEqual(cardState(today), { state: 'live', firstStart: '2026-10-17T23:30:00Z' });
  assert.deepEqual(cardState(today.filter((x) => x.state !== 'in')), { state: 'upcoming', firstStart: '2026-10-17T23:30:00Z' });
  assert.deepEqual(cardState(today.filter((x) => x.state === 'post')), { state: 'done', firstStart: null });
  assert.deepEqual(cardState([]), { state: 'done', firstStart: null });
});

test('the sparkline, the bot’s read, a team’s short name', () => {
  assert.equal(sparkPath([0.5], 0.5), '');
  // (two points over half the game: the line runs to 150, the middle at 13, up is home)
  assert.equal(sparkPath([0.5, 0.75], 0.5), 'M0.0 13.0 L150.0 7.5');
  assert.equal(sparkPath([0.5, 0.0], null), 'M0.0 13.0 L300.0 24.0');
  assert.equal(botRead([]), null);
  assert.equal(botRead([{ pick: 'Thunder -5.5', confidence: 'medium' }]), 'Thunder -5.5 · LIKE');
  assert.equal(botRead([{ pick: 'Under 233.5', confidence: 'high' }, { pick: 'Thunder -5.5', confidence: 'medium' }]), 'Under 233.5 · LOVE');
  assert.equal(botRead([{ pick: 'Suns -2.5', confidence: 'low' }]), 'pass');
  assert.equal(botRead([{ pick: 'Suns -2.5', confidence: 'high', strength: 'fade' }]), 'pass');
  assert.equal(shortTeam('Boston Celtics'), 'Celtics');
  assert.equal(shortTeam('Portland Trail Blazers'), 'Trail Blazers');
  assert.equal(shortTeam('Toronto Maple Leafs'), 'Maple Leafs');
  assert.equal(shortTeam('Celtics'), 'Celtics');
});

const bet = (over = {}) => ({ id: 'b1', sport: 'nba', event: '1', matchup: 'BOS @ NYK', start: '2026-10-17T23:30:00Z', market: 'total', side: 'under', line: 221.5, odds: -108, stake: 1, pick: 'Under 221.5', botPick: true, tier: 'love', run: 0, placedAt: '2026-10-17T12:00:00Z', status: 'open', ...over });
const game = (over = {}) => ({ as: 73, hs: 69, state: 'in', final: false, share: 0.6625, away: 'BOS', home: 'NYK', ...over });

test('a bet watched: a total under on pace, an over needing more, pending before the start, won at the final', () => {
  // (142 points at 66%: a pace of 214.3, under by 7.2)
  const w = betWatch(bet(), game(), null, NOW);
  assert.equal(w.status, 'WINNING');
  assert.equal(w.tone, 'good');
  // (the count alone: what's to spare is the meter's to show)
  assert.equal(w.left, '142 pts');
  assert.equal(w.right, 'On pace for 214');
  assert.equal(w.value, 142);
  assert.ok(w.fill > 0 && w.fill < w.tick && w.proj !== null && w.proj < w.tick);
  // (the over: on a pace short of the line; its caption the count alone, as the under's)
  const over = betWatch(bet({ side: 'over', pick: 'Over 221.5' }), game(), null, NOW);
  assert.equal(over.status, 'BEHIND');
  assert.equal(over.tone, 'close');
  assert.equal(over.left, '142 pts');
  assert.equal(over.right, 'On pace for 214');
  // (a pace well short: red)
  assert.equal(betWatch(bet({ side: 'over' }), game({ as: 50, hs: 50, share: 0.6 }), null, NOW).tone, 'bad');
  // (too early for a pace)
  const early = betWatch(bet(), game({ as: 6, hs: 4, share: 0.05 }), null, NOW);
  assert.equal(early.status, 'EARLY');
  assert.equal(early.tone, 'close');
  assert.equal(early.left, '10 pts so far');
  // (not started)
  const pending = betWatch(bet(), game({ state: 'pre', as: 0, hs: 0, share: 0 }), null, NOW);
  assert.equal(pending.status, 'PENDING');
  assert.equal(pending.tone, 'wait');
  assert.equal(pending.fill, 0);
  assert.equal(pending.right, 'Locked in');
  assert.match(pending.left, /^Tips off at \d/);
  assert.equal(betWatch(bet(), null, null, NOW).status, 'PENDING');
  // (over at the final: the under lost; the over's pushed past the line, won before the final)
  assert.deepEqual([betWatch(bet(), game({ as: 115, hs: 110, final: true, state: 'post', share: 1 }), null, NOW).status, betWatch(bet(), game({ as: 115, hs: 110, final: true, state: 'post', share: 1 }), null, NOW).tone], ['LOST', 'bad']);
  const won = betWatch(bet({ side: 'over' }), game({ as: 115, hs: 110, share: 0.95 }), null, NOW);
  assert.equal(won.status, 'WON');
  assert.equal(won.right, 'Over by 3.5');
});

test('a prop watched: on pace, needing more, the count from the box score; no count yet is none so far', () => {
  const prop = bet({ market: 'prop', side: 'over', line: 24.5, pick: 'Jaylen Brown Over 24.5 Points', propType: 'pts', athlete: '1', player: 'Jaylen Brown', statLabel: 'pts', botPick: false, odds: -115 });
  const w = betWatch(prop, game(), 20, NOW);
  assert.equal(w.status, 'WINNING');
  assert.equal(w.tone, 'good');
  assert.equal(w.left, '20 pts');
  assert.equal(w.right, 'On pace for 30');
  assert.ok(w.proj > w.tick);
  const short = betWatch(prop, game(), 12, NOW);
  assert.equal(short.status, 'BEHIND');
  assert.equal(short.tone, 'bad');
  // (just short of the pace: close, gold)
  const close = betWatch(prop, game({ share: 0.5 }), 12, NOW);
  assert.equal(close.status, 'BEHIND');
  assert.equal(close.tone, 'close');
  assert.equal(betWatch(prop, game(), null, NOW).left, '0 pts');
  // (past the line: won)
  assert.equal(betWatch(prop, game(), 25, NOW).status, 'WON');
  // (an under, past its line: lost; under the line on pace: winning)
  assert.equal(betWatch({ ...prop, side: 'under' }, game(), 25, NOW).status, 'LOST');
  const under = betWatch({ ...prop, side: 'under' }, game(), 12, NOW);
  assert.equal(under.status, 'WINNING');
  assert.equal(under.left, '12 pts');
  // (neither side says what's needed or to spare)
  for (const x of [w, short, close, under]) assert.doesNotMatch(x.left, /spare|needs/);
  assert.equal(under.right, 'On pace for 18');
  // (an under past its pace: behind, the pace named once)
  const hot = betWatch({ ...prop, side: 'under' }, game({ share: 0.5 }), 20, NOW);
  assert.deepEqual([hot.status, hot.tone, hot.right], ['BEHIND', 'bad', 'On pace for 40']);
  for (const x of [w, short, under, hot]) assert.equal(`${x.status} ${x.left} ${x.right}`.match(/pace/gi).length, 1);
  assert.equal(shortPick(prop), 'J. Brown o24.5 pts');
  assert.equal(shortPick(bet()), 'Under 221.5');
  assert.equal(shortPick(bet({ market: 'spread', pick: 'CLE -4.5' })), 'CLE −4.5');
  assert.equal(betSub(prop), '1.0u at -115 to win 0.87u');
  assert.equal(betSub(bet()), '1.0u at -108 to win 0.93u');
  assert.equal(betSub(bet({ odds: 112 })), '1.0u at +112 to win 1.12u');
  // (the pick's one word: a prop's over or under with its line, a total's first word, a side's line)
  assert.deepEqual(shortPickParts(prop), ['J. Brown ', 'o24.5', ' pts']);
  assert.deepEqual(shortPickParts(bet()), ['', 'Under', ' 221.5']);
  assert.deepEqual(shortPickParts(bet({ market: 'spread', pick: 'CLE -4.5' })), ['CLE ', '−4.5', '']);
});

// (a play as the injury reader takes it)
const play = (text, at = null, athletes = []) => ({ text, at, athletes });
const TURPIN = { id: '3676833', name: 'KaVontae Turpin' };

test('a bet’s player hurt in the game: the plays’ words and the in-game rulings, back when he plays again', () => {
  assert.ok(nameForms('KaVontae Turpin').test('DAL-K.Turpin was injured'));
  assert.ok(nameForms('Luther Burden III').test('to L.Burden for 9 yards'));
  assert.ok(!nameForms('KaVontae Turpin').test('J.Turpin was injured'));
  const kick = play('T.Smack kicks 56 yards from GB 35 to DAL 9. K.Turpin to DAL 34 for 25 yards (T.Hopper). DAL-K.Turpin was injured during the play.', '2026-10-19T00:22:29Z');
  const other = play('(Shotgun) D.Prescott pass short right to C.Lamb to DAL 40 for 6 yards (X.McKinney).', '2026-10-19T00:30:00Z');
  // (hurt, no ruling yet: INJURED)
  assert.equal(inGameInjury(TURPIN, [kick, other], [], '2026-10-19T00:20Z'), 'INJURED');
  // (the words name another player hurt on a play he was in: not him)
  assert.equal(inGameInjury(TURPIN, [play('K.Turpin to DAL 30 for 12 yards (T.Hopper). GB-T.Hopper was injured during the play.')], [], null), null);
  // (questionable to return, ruled out, in the words)
  assert.equal(inGameInjury(TURPIN, [kick, play('** Injury Update: DAL-K.Turpin is questionable to return with a rib injury.')], [], null), 'QUESTIONABLE');
  assert.equal(inGameInjury(TURPIN, [kick, play('** Injury Update: DAL-K.Turpin has been ruled out.')], [], null), 'OUT');
  assert.equal(inGameInjury({ id: '1', name: 'Jaylen Brown' }, [play('Jaylen Brown is being evaluated for a concussion.')], [], null), 'INJURED');
  // (a ruling posted after the kickoff, once the plays reach it; one posted before it is the week's report)
  const ruled = [{ athlete: '3676833', name: 'KaVontae Turpin', status: 'Questionable', date: '2026-10-19T00:52Z' }];
  assert.equal(inGameInjury(TURPIN, [kick, other], ruled, '2026-10-19T00:20Z'), 'QUESTIONABLE');
  assert.equal(inGameInjury(TURPIN, [kick, other], [{ ...ruled[0], status: 'Out' }], '2026-10-19T00:20Z'), 'OUT');
  assert.equal(inGameInjury(TURPIN, [other], [{ ...ruled[0], status: 'Out', date: '2026-10-18T22:00Z' }], '2026-10-19T00:20Z'), null);
  // (back: the words say so, or a later play names him, or carries him among its participants)
  assert.equal(inGameInjury(TURPIN, [kick, play('** Injury Update: DAL-K.Turpin has returned to the game.')], [], null), null);
  assert.equal(inGameInjury(TURPIN, [kick, play('D.Prescott pass short left to K.Turpin to DAL 45 for 8 yards.')], [], null), null);
  assert.equal(inGameInjury(TURPIN, [kick, play('A catch.', null, ['3676833'])], [], null), null);
  assert.equal(inGameInjury(TURPIN, [kick, other, play('D.Prescott pass short left to K.Turpin for 8 yards.', '2026-10-19T01:00:00Z')], ruled, '2026-10-19T00:20Z'), null);
  // (the watch: the tag in WINNING's or BEHIND's place, the meter as it was; a final keeps its grade)
  const prop = bet({ market: 'prop', side: 'over', line: 2.5, pick: 'KaVontae Turpin Over 2.5 Receptions', propType: 'rec', athlete: '3676833', player: 'KaVontae Turpin', statLabel: 'rec' });
  const live = betWatch(prop, game(), 1, NOW);
  const hurt = withHurt(live, 'QUESTIONABLE');
  assert.deepEqual([hurt.status, hurt.hurt, hurt.fill, hurt.right], ['QUESTIONABLE', 'QUESTIONABLE', live.fill, live.right]);
  assert.equal(withHurt(live, null), live);
  assert.equal(withHurt(betWatch(prop, game(), 3, NOW), 'OUT').status, 'WON');
});

test('a bet’s player hurt, read off the real DAL @ GB summary: Turpin questionable, Lloyd back, Winters questionable', () => {
  const s = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'support', 'espn-nfl-dal-gb-injury.json'), 'utf8'));
  const plays = s.plays.map((p) => play(p.text, p.wallclock));
  const kickoff = Date.parse(s.date);
  const rulings = s.injuries.flatMap((t) => t.injuries.filter((i) => Date.parse(i.date) >= kickoff).map((i) => ({ athlete: i.athlete.id, name: i.athlete.displayName, status: i.status, date: i.date })));
  assert.equal(inGameInjury(TURPIN, plays, rulings, s.date), 'QUESTIONABLE');
  // (before his ruling was posted: hurt, no ruling yet)
  const early = (at) => Date.parse(at) < Date.parse('2026-10-19T00:52Z');
  assert.equal(inGameInjury(TURPIN, plays.filter((p) => early(p.at)), rulings.filter((r) => early(r.date)), s.date), 'INJURED');
  // (Lloyd hurt on the interception, back three plays on: nothing)
  assert.equal(inGameInjury({ id: null, name: 'MarShawn Lloyd' }, plays, rulings, s.date), null);
  assert.equal(inGameInjury({ id: '4428914', name: 'Dee Winters' }, plays, rulings, s.date), 'QUESTIONABLE');
  assert.equal(inGameInjury({ id: null, name: 'Dak Prescott' }, plays, rulings, s.date), null);
});

test('a side watched: covering, down, level; the sweat summary and the panel’s header', () => {
  const spread = bet({ market: 'spread', side: 'home', line: -4.5, pick: 'CLE -4.5', matchup: 'MIL @ CLE' });
  const down = betWatch(spread, game({ as: 31, hs: 26, share: 0.25, away: 'MIL', home: 'CLE' }), null, NOW);
  assert.equal(down.status, 'DOWN 9.5');
  assert.equal(down.tone, 'bad');
  assert.equal(down.left, 'CLE down 5');
  assert.equal(down.right, 'Needs a 10-pt swing');
  assert.ok(down.fill < down.tick);
  const up = betWatch(spread, game({ as: 20, hs: 30, share: 0.4, away: 'MIL', home: 'CLE' }), null, NOW);
  assert.equal(up.status, 'WINNING');
  assert.equal(up.right, 'Covering by 5.5');
  const level = betWatch(spread, game({ as: 20, hs: 24.5, share: 0.4, away: 'MIL', home: 'CLE' }), null, NOW);
  assert.equal(level.status, 'LEVEL');
  assert.equal(level.tone, 'close');
  const ml = betWatch(bet({ market: 'ml', side: 'away', line: null, pick: 'MIL ML', matchup: 'MIL @ CLE' }), game({ as: 31, hs: 26, share: 0.25, away: 'MIL', home: 'CLE' }), null, NOW);
  assert.equal(ml.status, 'WINNING');
  assert.equal(ml.right, 'Leading by 5');
  // (a one-goal deficit in hockey is close)
  assert.equal(betWatch(bet({ sport: 'nhl', market: 'ml', side: 'home', line: null, pick: 'MTL ML', matchup: 'TOR @ MTL' }), game({ as: 2, hs: 1, share: 0.47, away: 'TOR', home: 'MTL' }), null, NOW).tone, 'close');
  // (at the final)
  const fin = betWatch(spread, game({ as: 100, hs: 110, state: 'post', final: true, share: 1, away: 'MIL', home: 'CLE' }), null, NOW);
  assert.equal(fin.status, 'WON');
  assert.equal(fin.right, 'Covered by 5.5');
  const watches = [down, up, level, ml];
  assert.deepEqual(sweatOf(watches), { winning: 2, close: 1, losing: 1 });
  assert.equal(onTrackWords(watches), '2 of 4 on track');
  assert.equal(onTrackWords([]), 'None');
});

// A UFC card: ESPN's MMA scoreboard is one event with the bouts as its competitions (live-mma.ts), each bout a
// board of its own by the competition's id, in mixed states (support/espn-mma-scoreboard.json)
const { mmaBouts, fightWords, fightWatch, fightRounds, fightMethod, tonightBouts, livePool, boutResult } = live;
const CARD = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'support', 'espn-mma-scoreboard.json'), 'utf8'));

test('a UFC card read into its bouts: fighters, headshots, states, the board lending matchup and start', () => {
  const face = (id) => `https://a.espncdn.com/i/headshots/mma/players/full/${id}.png`;
  const model = new Map([['401914039', { matchup: 'Steven Koslow @ Chad Anheliger', start: '2026-10-17T22:00:00Z', away: { abbr: 'Steven Koslow', name: 'Steven Koslow', logo: face('5119740'), score: null }, home: { abbr: 'Chad Anheliger', name: 'Chad Anheliger', logo: face('4816062'), score: null } }]]);
  const bouts = mmaBouts(CARD, model);
  assert.equal(bouts.length, 5);
  const [sub, ko, dec, on, next] = bouts;
  assert.deepEqual([sub.event, on.event, next.event], ['401919643', '401908373', '401914039']);
  assert.deepEqual(bouts.map((b) => b.state), ['post', 'post', 'post', 'in', 'pre']);
  // (ordered 1 the home, as the bettor's board has it; the headshot by the fighter's id)
  assert.equal(on.matchup, 'Chelsea Chandler @ Melissa Croden');
  assert.equal(on.home.logo, face('4947922'));
  assert.equal(next.start, '2026-10-17T22:00:00Z');
  assert.equal(next.away.logo, face('5119740'));
  assert.equal(sub.fight.winner, 'away');
  assert.deepEqual(sub.fight.records, ['17-4-0', '9-2-0']);
  assert.equal(on.fight.weight, 'W Bantamweight');
  // (the clock's words: live, the finishes, a decision, a bout to come by its start)
  assert.equal(fightWords(on, NOW), 'R2 3:14');
  assert.equal(fightWords(sub, NOW), 'SUB R3 4:19');
  assert.equal(fightWords(ko, NOW), 'TKO R1 2:05');
  assert.equal(fightWords(dec, NOW), 'SPLIT DEC');
  assert.match(fightWords(next, NOW), /^\d{1,2}:00\s[AP]M$/);
  assert.equal(fightMethod([{ type: { text: 'Winner KO' } }]), 'KO');
  assert.equal(fightMethod([{ type: { text: 'Round Start' } }]), null);
  // (rounds gone: R2 3:14 is 1.65; a decision the distance)
  assert.ok(Math.abs(fightRounds(on) - (1 + 194 / 300)) < 1e-9);
  assert.equal(fightRounds(dec), 3);
  // (the Live board: only a bout under way is a card; the finished ones go as finished games do, the one to come
  // is no card; between bouts nothing's on, the bout to come counting only for the bar's first start)
  assert.deepEqual(livePool(bouts).map((b) => b.event), [on.event]);
  const between = bouts.filter((b) => b.state !== 'in');
  assert.deepEqual(cardState(between), { state: 'upcoming', firstStart: next.start });
  assert.deepEqual(livePool(between), []);
  const game = { sport: 'nfl', event: '1', state: 'pre', start: '2026-10-18T17:00:00Z' };
  assert.deepEqual(livePool([...between, game]), [game]);
  assert.deepEqual(livePool([...bouts, game]).map((b) => b.event), [on.event]);
  // (walkouts or a break between rounds read as under way though ESPN's state says pre)
  const walk = structuredClone(CARD);
  const comp = walk.events[0].competitions.find((c) => String(c.id) === '401914039');
  comp.status.type = { name: 'STATUS_WALKOUTS', state: 'pre', completed: false, detail: 'Walkouts', shortDetail: 'Walkouts' };
  assert.equal(mmaBouts(walk).find((b) => b.event === '401914039').state, 'in');
  assert.equal(livePool(mmaBouts(walk)).length, 2);
  assert.equal(tonightBouts(bouts, NOW).length, 5);
  // (a card days old, nothing of it on, is gone)
  assert.equal(tonightBouts(bouts.filter((b) => b.state !== 'in'), Date.parse('2026-10-20T23:00:00Z')).length, 0);
});

test('a bet on a bout watched: moneyline live and final, round totals decided as the rounds go', () => {
  const [sub, ko, dec, on, next] = mmaBouts(CARD);
  const fbet = (over) => bet({ sport: 'mma', market: 'ml', line: null, side: 'home', pick: 'Melissa Croden ML', matchup: 'Chelsea Chandler @ Melissa Croden', ...over });
  const watch = fightWatch(fbet(), on, NOW);
  assert.equal(watch.status, 'LIVE');
  assert.equal(watch.left, 'R2 3:14');
  assert.equal(watch.right, 'Croden fighting');
  assert.equal(fightWatch(fbet({ side: 'away' }), sub, NOW).status, 'WON');
  assert.equal(fightWatch(fbet({ side: 'home' }), sub, NOW).status, 'LOST');
  assert.equal(fightWatch(fbet({ side: 'home' }), sub, NOW).right, 'You wins');
  assert.equal(fightWatch(fbet({ start: '2026-10-18T02:00:00Z' }), next, NOW).status, 'PENDING');
  const total = (side, line = 2.5) => bet({ sport: 'mma', market: 'total', side, line, pick: `${side === 'over' ? 'Over' : 'Under'} ${line}` });
  // (R2 3:14: under 2.5 holding, over needing time; under 1.5 already lost, over 1.5 won)
  assert.equal(fightWatch(total('under'), on, NOW).status, 'HOLDING');
  assert.equal(fightWatch(total('over'), on, NOW).status, 'NEEDS TIME');
  assert.equal(fightWatch(total('under', 1.5), on, NOW).status, 'LOST');
  assert.equal(fightWatch(total('over', 1.5), on, NOW).status, 'WON');
  // (a first-round TKO: the under won; a submission at R3 4:19 and a decision: the over 2.5 won)
  assert.equal(fightWatch(total('under'), ko, NOW).status, 'WON');
  assert.equal(fightWatch(total('over'), ko, NOW).status, 'LOST');
  assert.equal(fightWatch(total('over'), sub, NOW).status, 'WON');
  assert.equal(fightWatch(total('over'), dec, NOW).status, 'WON');
});

// A bet's result off its bout before the desk grades it (live-mma.ts boutResult, the owner 2026-10-26: the card's
// Practice and PASS rows empty until the run graded it): the winner for a moneyline, the rounds gone for a total, the
// bout turned round to the bet's own fighters by their ids
test('boutResult: a moneyline by the winner, a total by the rounds gone, oriented by the fighters', () => {
  const [sub, ko, dec, on, next] = mmaBouts(CARD);
  const [awayId, homeId] = sub.fight.ids;
  assert.equal(boutResult({ market: 'ml', side: 'away' }, sub), 'won');
  assert.equal(boutResult({ market: 'ml', side: 'home' }, sub), 'lost');
  // (the bet's fighters the other way round: its home is ESPN's away)
  assert.equal(boutResult({ market: 'ml', side: 'home', fighters: { home: { id: awayId }, away: { id: homeId } } }, sub), 'won');
  assert.equal(boutResult({ market: 'ml', side: 'home' }, on), null);
  assert.equal(boutResult({ market: 'ml', side: 'home' }, next), null);
  assert.equal(boutResult({ market: 'total', side: 'under', line: 2.5 }, ko), 'won');
  assert.equal(boutResult({ market: 'total', side: 'over', line: 2.5 }, dec), 'won');
  assert.equal(boutResult({ market: 'total', side: 'over', line: 1.5 }, on), 'won');
  assert.equal(boutResult({ market: 'total', side: 'over', line: 2.5 }, on), null);
});
