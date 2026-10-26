// The fight view and the ticker's bouts (fight-view.ts; the owner, 2026-10-26): a finished fight on the ticker reads
// its winner and how ("You def. Chovancek · SUB R3 4:19"), never "started", and "A vs. B", never "@"; a bout turned
// to the ledger's own fighters; the betting board's lines kept with ESPN's state; the fight view's sides, result,
// facts and the Bot's rows (its price, the open, the close, the other side's, bet or tracked); and where a ticket's
// game opens. ESPN's card is support/espn-mma-scoreboard.json; the ledger rows are made up. No network
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const f = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'fight-entry.ts'), data: {} });
const CARD = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'support', 'espn-mma-scoreboard.json'), 'utf8'));
const NOW = Date.parse('2026-10-17T23:00:00Z');
const [sub, ko, dec, on, next] = f.mmaBouts(CARD);

test('a finished bout in words: the winner over the loser, then how and when', () => {
  assert.equal(f.fightResult(sub), 'You def. Chovancek · SUB R3 4:19');
  assert.equal(f.fightResult(ko), 'Home def. Away · TKO R1 2:05');
  assert.equal(f.fightResult(dec), 'Away def. Home · SPLIT DEC');
  assert.equal(f.fightResult(on), null);
  assert.equal(f.fightResult(next), null);
});

test('the ticker’s bout: "vs." the first-listed first, a final its winner first with "def.", never "started"', () => {
  assert.deepEqual(f.tickerFight(sub, NOW), { first: 'away', sep: 'def.', text: 'SUB R3 4:19' });
  assert.deepEqual(f.tickerFight(ko, NOW), { first: 'home', sep: 'def.', text: 'TKO R1 2:05' });
  assert.deepEqual(f.tickerFight(on, NOW), { first: 'home', sep: 'vs.', text: 'R2 3:14' });
  assert.deepEqual(f.tickerFight(next, NOW), { first: 'home', sep: 'vs.', text: null });
  // (the betting board's bout alone, ESPN's card not read: under way "LIVE", never its "Started")
  const bare = { sport: 'mma', state: 'in', start: '2026-10-17T22:00:00Z', detail: 'Started' };
  assert.deepEqual(f.tickerFight(bare, NOW), { first: 'home', sep: 'vs.', text: 'LIVE' });
  assert.equal(f.tickerFight({ ...bare, state: 'post' }, NOW).text, 'FINAL');
  // (a team sport's game: not a fight)
  assert.equal(f.tickerFight({ sport: 'nfl', state: 'post', start: '', detail: 'Final' }, NOW), null);
});

test('a bout turned to the ledger’s fighters, and the betting board’s lines kept with ESPN’s state', () => {
  // (ESPN's home is Chovancek; a ledger whose home is You (ESPN's away) turns it round)
  const turned = f.orientBout(sub, '5044361');
  assert.equal(turned.home.name, 'SuYoung You');
  assert.equal(turned.away.name, 'Cody Chovancek');
  assert.equal(turned.fight.winner, 'home');
  assert.deepEqual(turned.fight.records, [sub.fight.records[1], sub.fight.records[0]]);
  assert.deepEqual(turned.fight.ids, [sub.fight.ids[1], sub.fight.ids[0]]);
  assert.equal(f.orientBout(sub, '5282412'), sub);
  assert.equal(f.orientBout(sub, null), sub);
  // (the betting board's game: its lines and matchup kept, ESPN's state, clock and result on it)
  const ml = { away: { market: 'ml', side: 'away', line: null, odds: 140 }, home: { market: 'ml', side: 'home', line: null, odds: -170 } };
  const lined = { sport: 'mma', event: sub.event, matchup: 'SuYoung You @ Cody Chovancek', start: sub.start, state: 'in', detail: 'Started', final: false, away: sub.away, home: sub.home, book: 'DraftKings', spread: null, total: null, ml };
  const b = f.boutOnBoard(lined, sub, '5282412');
  assert.equal(b.state, 'post');
  assert.equal(b.final, true);
  assert.equal(b.ml, ml);
  assert.equal(b.matchup, 'SuYoung You @ Cody Chovancek');
  assert.equal(b.fight.method, 'SUB');
  // (no betting board: ESPN's bout as it is)
  assert.equal(f.boutOnBoard(null, sub, null), sub);
});

// (the Bot's two rows on the submission: a staked moneyline on You that won, a tracked round total)
const row = (over) => ({
  id: `${sub.event}:ml:5044361-5282412`,
  event: sub.event,
  start: '2026-10-17T22:00:00Z',
  placedAt: '2026-10-16T14:00:00Z',
  matchup: 'Cody Chovancek @ SuYoung You',
  fighters: { home: { id: '5044361', name: 'SuYoung You', country: 'South Korea' }, away: { id: '5282412', name: 'Cody Chovancek' } },
  market: 'ml',
  side: 'home',
  line: null,
  odds: 150,
  otherOdds: -180,
  p: 0.44,
  intent: 'bet',
  units: 1,
  book: 'DraftKings',
  pick: 'SuYoung You',
  context: { division: 'Bantamweight', rounds: 3, cardName: 'UFC Fight Night: A vs. B', why: 'an edge at the trusted chance' },
  seen: { at: '2026-10-16T14:00:00Z', odds: 150, open: { at: '2026-10-14T10:00:00Z', odds: { home: 140, away: -165 } } },
  close: { odds: 160, line: null, source: 'close (DraftKings)' },
  clv: { beat: false },
  status: 'won',
  profit: 1.5,
  gradedAt: '2026-10-18T04:00:00Z',
  ...over,
});
const ROWS = [
  row({ id: `${sub.event}:total:5044361-5282412`, market: 'total', side: 'over', line: 2.5, odds: -120, otherOdds: 100, intent: 'track', units: 0, trackUnits: 0.5, pick: 'Over 2.5 rounds', seen: { at: '2026-10-16T14:00:00Z', odds: -120 }, close: null, clv: null, profit: 0 }),
  row(),
];

test('the fight view: the ledger’s fighters first, the winner, the facts, the Bot’s rows moneyline first', () => {
  const v = f.fightViewOf(sub, ROWS, NOW);
  assert.equal(v.state, 'post');
  assert.equal(v.result, 'You def. Chovancek · SUB R3 4:19');
  assert.deepEqual(v.sides.map((s) => [s.name, s.won, s.lost]), [['SuYoung You', true, false], ['Cody Chovancek', false, true]]);
  assert.equal(v.sides[0].country, 'South Korea');
  assert.equal(v.sides[0].record, sub.fight.records[0]);
  assert.equal(v.card, sub.fight.card);
  assert.equal(v.rounds, 3);
  const [ml, total] = v.bets;
  assert.deepEqual([ml.market, ml.kind, ml.units, ml.price, ml.open, ml.close, ml.other, ml.chance, ml.result, ml.beat, ml.book], ['Moneyline', 'Bet', 1, '+150', '+140', '+160', '-180', 44, '+1.5u', false, 'DraftKings']);
  assert.equal(ml.placedAt, '2026-10-16T14:00:00Z');
  assert.equal(ml.gradedAt, '2026-10-18T04:00:00Z');
  assert.deepEqual([total.market, total.kind, total.units, total.open, total.close, total.result], ['Rounds', 'Tracked', 0.5, null, null, 'Would have +0.42u']);
});

test('the fight view without ESPN’s card: the ledger’s words; an open row to come; nothing at all, none', () => {
  const graded = f.fightViewOf(null, [row({ final: 'SuYoung You vs Cody Chovancek: SuYoung You won' })], NOW);
  assert.equal(graded.state, 'post');
  assert.equal(graded.result, 'SuYoung You vs Cody Chovancek: SuYoung You won');
  assert.equal(graded.sides[0].face, 'https://a.espncdn.com/i/headshots/mma/players/full/5044361.png');
  assert.equal(graded.division, 'Bantamweight');
  const ahead = f.fightViewOf(null, [row({ status: 'open', start: '2026-10-25T02:00:00Z', profit: 0, gradedAt: undefined })], NOW);
  assert.equal(ahead.state, 'pre');
  assert.equal(ahead.bets[0].result, 'Open');
  assert.equal(f.fightViewOf(null, [], NOW), null);
});

test('a ticket’s game: a bout its fight view, a team sport’s game the game view by its league', () => {
  assert.deepEqual(f.gameRefOf({ sport: 'mma', event: '401919643', start: '2026-10-17T22:00:00Z', matchup: 'A @ B' }), { kind: 'fight', event: '401919643', start: '2026-10-17T22:00:00Z', matchup: 'A @ B' });
  assert.deepEqual(f.gameRefOf({ sport: 'nfl', event: '401873007' }), { kind: 'game', event: '401873007', league: 'football/nfl' });
  assert.deepEqual(f.gameRefOf({ sport: 'nhl', event: 401559001 }), { kind: 'game', event: '401559001', league: 'hockey/nhl' });
  assert.equal(f.gameRefOf({ sport: 'nfl', event: null }), null);
  assert.equal(f.gameRefOf({ sport: 'parlay', event: '1' }), null);
});

test('the ticker draws its word between the sides, and the Book, the tickets and the desk open a game', () => {
  const read = (p) => fs.readFileSync(path.join(import.meta.dirname, '..', p), 'utf8');
  const page = read('libs/ranker/src/engine/book/book-page.component.html');
  assert.ok(page.includes('{{ t.sep }}'));
  assert.ok(!page.includes('aria-hidden="true">@</span>'));
  assert.ok(page.includes('<fight-view></fight-view>'));
  assert.ok(read('libs/ranker/src/engine/account/wallet/wallet-page.component.html').includes('(click)="openGame(l)"'));
  assert.ok(read('libs/ranker/src/engine/book/model-desk.component.html').includes('(click)="openGame(b)"'));
});
