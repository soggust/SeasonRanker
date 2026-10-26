// The grading audit's fixes (2026-10-24): the props' book names matched to the box score's players (names.mjs,
// gate-history.mjs propIndexByPlayer), MLB's 2020-21 seven-inning doubleheader games complete (espn.mjs), and the
// live ledger's lines graded again when a final's score changes after grading (run.mjs regradeLines). No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchNames, nameMatcher, nameParts } from '../libs/ranker/scripts/model/names.mjs';
import { historyPropIndex, propIndexByPlayer } from '../libs/ranker/scripts/model/gate-history.mjs';
import { sevenInningDoubleheaders } from '../libs/ranker/scripts/model/espn.mjs';
import { settle } from '../libs/ranker/scripts/model/desk.mjs';
import { regradeLines } from '../libs/ranker/scripts/model/run.mjs';

const of = (list) => list.map((n) => (typeof n === 'string' ? { name: n } : n));

test('names: the book\'s spellings reach the box score\'s player by nickname and surname', () => {
  const m = nameMatcher(of(['Nic Claxton', 'Bub Carrington', 'Herbert Jones', 'Tre Jones', 'Ronald Holland II', 'Cam Thomas', 'Vince Williams Jr.', 'Moritz Wagner', 'Franz Wagner', 'Mo Bamba']));
  assert.equal(m('Nicolas Claxton')?.name, 'Nic Claxton');
  assert.equal(m('Carlton Carrington')?.name, 'Bub Carrington');
  assert.equal(m('Herb Jones')?.name, 'Herbert Jones');
  assert.equal(m('Ron Holland')?.name, 'Ronald Holland II');
  assert.equal(m('Cameron Thomas')?.name, 'Cam Thomas');
  assert.equal(m('Vincent Williams Jr')?.name, 'Vince Williams Jr.');
  assert.equal(m('Moe Wagner')?.name, 'Moritz Wagner');
  assert.equal(m('Mohamed Bamba')?.name, 'Mo Bamba');
  // (a surname alone with two players of it: no one)
  assert.equal(m('Wagner'), null);
  const h = nameMatcher(of(['Nick Paul', 'Alexander Wennberg', 'Egor Chinakhov', 'Mitch Marner', 'Matt Boldy', 'JJ Peterka', 'Cal Petersen', 'Dmitri Simashev']));
  for (const [book, box] of [['Nicholas Paul', 'Nick Paul'], ['Alex Wennberg', 'Alexander Wennberg'], ['Yegor Chinakhov', 'Egor Chinakhov'], ['Mitchell Marner', 'Mitch Marner'], ['Matthew Boldy', 'Matt Boldy'], ['John-Jason Peterka', 'JJ Peterka'], ['Calvin Petersen', 'Cal Petersen'], ['Dmitry Simashev', 'Dmitri Simashev']]) assert.equal(h(book)?.name, box, book);
  const b = nameMatcher(of([{ name: 'Enrique Hernández', abbr: 'LAD' }, { name: 'Joshua Palacios', abbr: 'CHW' }, { name: 'Luis García Jr.', abbr: 'WSH' }, { name: 'Kenny Gainwell' }, { name: 'Cam Ward' }, { name: 'Josh Palmer' }]));
  assert.equal(b(' Kiké Hernandez')?.name, 'Enrique Hernández');
  assert.equal(b('Josh Palacios')?.name, 'Joshua Palacios');
  assert.equal(b('Luis Garcia (WAS)')?.name, 'Luis García Jr.');
  assert.equal(b('Kenneth Gainwell')?.name, 'Kenny Gainwell');
  assert.equal(b('Cameron Ward')?.name, 'Cam Ward');
  assert.equal(b('Joshua Palmer')?.name, 'Josh Palmer');
});

test('names: never a guess (two Ahos, the 2004 Pettersson, a team note on another team, a known name)', () => {
  const m = nameMatcher(of([{ name: 'Sebastian Aho', abbr: 'CAR' }, { name: 'Sebastian Aho', abbr: 'NYI' }, 'Elias Pettersson', 'Elias N. Pettersson']));
  assert.equal(m('Sebastian Aho'), null);
  assert.equal(m('Sebastian Aho (CAR)')?.abbr, 'CAR');
  assert.equal(m('Elias Pettersson (2004)'), null);
  assert.equal(m('Elias Pettersson')?.name, 'Elias Pettersson');
  const t = nameMatcher(of([{ name: 'Lamar Jackson', abbr: 'BAL' }]));
  assert.equal(t('Lamar Jackson (BAL)')?.name, 'Lamar Jackson');
  assert.equal(t('Lamar Jackson (CLE)'), null);
  // (Markieff out: his name is a player of the sport's, so never his twin's by the surname)
  const k = nameMatcher(of(['Marcus Morris Sr.']), { known: new Set(['markieffmorris', 'marcusmorris']) });
  assert.equal(k('Markieff Morris'), null);
  assert.equal(k('Marcus Morris')?.name, 'Marcus Morris Sr.');
  assert.deepEqual(nameParts('Sebastian Aho (CAR)'), { key: 'sebastianaho', first: 'sebastian', initials: 's', last: 'aho', note: 'CAR', team: 'CAR' });
  // (one player, one book name: the exact one kept)
  const one = matchNames(['Nick Paul', 'Nicholas Paul'], of(['Nick Paul']));
  assert.deepEqual([...one.keys()], ['Nick Paul']);
});

test('props history: the index matched by player id; a noted name kept apart; rows read by pid', () => {
  const events = new Map([['o1', { id: '9', t: '2025-01-01T00:00:00Z', season: 2025 }]]);
  const P = (player, line, over = -110, under = -110, kind = 'c') => ({ oid: 'o1', kind, ts: '2024-12-31T23:00:00Z', book: 'dk', market: 'player_shots_on_goal', player, line, over, under });
  const index = historyPropIndex(events, [P('Elias Pettersson', 2.5), P('Elias Pettersson (2004)', 0.5), P('Nicholas Paul', 1.5)], { player_shots_on_goal: 'sog' });
  assert.equal(index.size, 3);
  const rows = [
    { pid: '10', name: 'Elias Pettersson', game: '9', team: '1' },
    { pid: '11', name: 'Elias N. Pettersson', game: '9', team: '1' },
    { pid: '12', name: 'Nick Paul', game: '9', team: '2' },
  ];
  const by = propIndexByPlayer(index, rows, [{ id: '9', home: '1', away: '2', homeAbbr: 'VAN', awayAbbr: 'TB' }]);
  assert.equal(by.get('sog|10|9').c.line, 2.5);
  assert.equal(by.has('sog|11|9'), false);
  assert.equal(by.get('sog|12|9').c.line, 1.5);
  assert.deepEqual(by.report, { names: 3, matched: 2, byKey: 1, fuzzy: 1, unmatched: 1 });
  // (two Ahos in one game, the book's plain name: neither; its "(CAR)": the Hurricane)
  const ev2 = new Map([['o2', { id: '8', t: '2025-01-02T00:00:00Z', season: 2025 }]]);
  const P2 = (player, line) => ({ ...P(player, line), oid: 'o2', ts: '2025-01-01T23:00:00Z' });
  const i2 = historyPropIndex(ev2, [P2('Sebastian Aho', 2.5), P2('Sebastian Aho (CAR)', 3.5)], { player_shots_on_goal: 'sog' });
  const rows2 = [
    { pid: '20', name: 'Sebastian Aho', game: '8', team: '1' },
    { pid: '21', name: 'Sebastian Aho', game: '8', team: '2' },
  ];
  const by2 = propIndexByPlayer(i2, rows2, [{ id: '8', home: '1', away: '2', homeAbbr: 'NYI', awayAbbr: 'CAR' }]);
  assert.deepEqual([...by2.keys()], ['sog|21|8']);
  assert.equal(by2.get('sog|21|8').c.line, 3.5);
});

test('MLB: a 2020-21 seven-inning doubleheader game is complete, its run line and total graded', () => {
  const g = (id, date, extra) => ({ id, date, season: 2021, type: 2, home: '1', away: '2', homeAbbr: 'A', awayAbbr: 'B', final: true, hs: 3, as: 2, ...extra });
  const games = sevenInningDoubleheaders([
    g('1', '2021-07-10T17:05Z', { short: 7 }),
    g('2', '2021-07-10T21:00Z', { short: 6.5 }),
    // (a single game cut short by rain: still short)
    g('3', '2021-07-11T17:05Z', { short: 6 }),
    // (a doubleheader's game rained out after 5: short)
    g('4', '2021-07-12T17:05Z', { short: 5 }),
    g('5', '2021-07-12T21:00Z', { short: 8 }),
    // (2022 on: nine-inning doubleheaders, a 7-inning game short)
    { ...g('6', '2022-07-12T17:05Z', { short: 7 }), season: 2022 },
    { ...g('7', '2022-07-12T21:00Z', {}), season: 2022 },
  ]);
  const by = Object.fromEntries(games.map((x) => [x.id, x]));
  assert.equal(by['1'].short, undefined);
  assert.equal(by['2'].short, undefined);
  assert.equal(by['3'].short, 6);
  assert.equal(by['4'].short, 5);
  assert.equal(by['5'].short, undefined);
  assert.equal(by['6'].short, 7);
  const total = { market: 'total', side: 'over', line: 4.5, units: 1, odds: -110 };
  assert.equal(settle(total, by['1']).status, 'won');
  assert.equal(settle(total, by['3']).void, true);
});

test('live lines: a final whose score changed after grading is graded again, within the window', () => {
  const now = Date.parse('2026-10-15T12:00:00Z');
  const bet = { id: 'x:spread', event: '7', market: 'spread', side: 'away', line: 1.5, odds: -238, units: 0.5, status: 'lost', profit: -0.5, final: 'MTL 3 @ WSH 5', gradedAt: '2026-10-15T02:33:01Z', why: 'Lost: ...', start: '2026-10-14T23:30Z' };
  const old = { ...bet, id: 'y:total', market: 'total', side: 'over', line: 8.5, status: 'won', final: 'MTL 3 @ WSH 5', gradedAt: '2026-10-10T02:00:00Z' };
  const game = { id: '7', final: true, hs: 5, as: 4, homeAbbr: 'WSH', awayAbbr: 'MTL' };
  const n = regradeLines([bet, old], new Map([['7', game]]), now, '2026-10-15T12:00:00Z');
  assert.equal(n, 1);
  assert.equal(bet.status, 'won');
  assert.equal(bet.final, 'MTL 4 @ WSH 5');
  assert.equal(bet.regraded.status, 'lost');
  assert.equal(bet.why, undefined);
  // (past the window: as graded)
  assert.equal(old.status, 'won');
  // (a score that hasn't changed: nothing)
  assert.equal(regradeLines([bet], new Map([['7', game]]), now, 'z'), 0);
});
