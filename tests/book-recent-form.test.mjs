// The Book's recent form (recent-form.ts recentForm): the user's last seven days from the settler's tally (the
// days in US Eastern), the streak and the last five settled bets from the history on hand; none without a tally
// or anything settled.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const bets = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'book-entry.ts'), data: {} });

// (Saturday Oct 17, 2026, 3pm Eastern)
const NOW = Date.parse('2026-10-17T19:00:00Z');
const day = (won, lost, push, staked, profit) => [won, lost, push, staked, profit];
const tally = {
  all: { won: 40, lost: 30, push: 2, void: 0, staked: 90, profit: 12 },
  days: {
    '2026-10-17': day(1, 0, 0, 1, 0.91),
    '2026-10-15': day(2, 1, 0, 3, 1.2),
    '2026-10-11': day(1, 2, 1, 4, -1.1),
    // (eight days back: out of the window)
    '2026-10-09': day(5, 0, 0, 5, 5),
  },
};
const bet = (id, status, over = {}) => ({
  id,
  sport: 'nhl',
  event: '1',
  matchup: 'NYR @ BOS',
  start: '2026-10-16T23:00:00Z',
  market: 'total',
  side: 'over',
  line: 6.5,
  odds: -110,
  stake: 1,
  pick: 'Over 6.5',
  run: 0,
  placedAt: '2026-10-16T20:00:00Z',
  status,
  settledAt: `2026-10-${id}T03:00:00Z`,
  profit: status === 'won' ? 0.91 : status === 'lost' ? -1 : 0,
  ...over,
});

test('recentForm: the last seven days summed from the tally, the units signed, nothing older counted', () => {
  const f = bets.recentForm(tally, [], NOW);
  assert.equal(f.record, '4–3–1');
  assert.equal(f.units, '+1.01u');
  assert.equal(f.up, true);
  assert.equal(f.streak, '–');
  assert.deepEqual(f.last, []);
});

test('recentForm: the streak and the last five from the settled bets on hand, the latest first, a void left out', () => {
  const settled = [bet('17', 'won'), bet('16', 'won'), bet('15', 'push'), bet('14', 'won'), bet('13', 'lost'), bet('12', 'void'), bet('11', 'won'), bet('10', 'lost')];
  const f = bets.recentForm(tally, settled, NOW);
  assert.equal(f.streak, 'W3');
  assert.deepEqual(
    f.last.map((b) => `${b.res} ${b.pick} ${b.units}`),
    ['W Over 6.5 +0.91u', 'W Over 6.5 +0.91u', 'P Over 6.5 0.00u', 'W Over 6.5 +0.91u', 'L Over 6.5 −1.00u'],
  );
  assert.equal(f.last[0].game, 'NHL · NYR @ BOS');
});

test('recentForm: a losing streak, a parlay named by its legs, and a quiet week with history still shown', () => {
  const settled = [bet('17', 'lost', { kind: 'parlay', legs: [{}, {}], sport: 'parlay', matchup: '' }), bet('16', 'lost'), bet('15', 'won')];
  const f = bets.recentForm({ all: tally.all, days: {} }, settled, NOW);
  assert.equal(f.record, '0–0');
  assert.equal(f.units, '0.00u');
  assert.equal(f.streak, 'L2');
  assert.equal(f.last[0].pick, '2-leg parlay');
  assert.equal(f.last[0].game, 'Parlay');
});

test('recentForm: none without a tally, or with nothing settled this week and nothing on hand', () => {
  assert.equal(bets.recentForm(null, [bet('17', 'won')], NOW), null);
  assert.equal(bets.recentForm({ all: tally.all, days: {} }, [], NOW), null);
});

// The You side as the Book has it (recent-form.ts yourForm over the wallet's state): the Book never pages the
// history in, so its last five and streak come from the newest few the wallet reads for it (recentSettled)
const walletState = (over = {}) => ({ signedIn: true, loaded: true, tally, settled: [], recent: [], ...over });

test('yourForm: on the Book (no history paged in) the week from the tally, the streak and last five from the newest few', () => {
  const recent = [bet('17', 'won'), bet('16', 'won'), bet('15', 'lost'), bet('14', 'push'), bet('13', 'won')];
  const f = bets.yourForm(walletState({ recent }), NOW);
  assert.equal(f.record, '4–3–1');
  assert.equal(f.units, '+1.01u');
  assert.equal(f.streak, 'W2');
  assert.deepEqual(f.last.map((b) => b.res), ['W', 'W', 'L', 'P', 'W']);
});

test('yourForm: a page of the history and the newest few together, each bet once, the latest first', () => {
  const settled = [bet('16', 'lost'), bet('15', 'lost'), bet('14', 'won')];
  const recent = [bet('17', 'lost'), bet('16', 'lost'), bet('15', 'lost')];
  const f = bets.yourForm(walletState({ settled, recent }), NOW);
  assert.equal(f.streak, 'L3');
  assert.equal(f.last.length, 4);
  assert.deepEqual(f.last.map((b) => b.res), ['L', 'L', 'L', 'W']);
});

test('yourForm: older history still shown on a quiet week; none signed out, before the wallet loads, or with nothing', () => {
  const quiet = bets.yourForm(walletState({ tally: { all: tally.all, days: {} }, recent: [bet('03', 'won')] }), NOW);
  assert.equal(quiet.record, '0–0');
  assert.equal(quiet.last.length, 1);
  assert.equal(bets.yourForm(walletState({ signedIn: false, recent: [bet('17', 'won')] }), NOW), null);
  assert.equal(bets.yourForm(walletState({ loaded: false, recent: [bet('17', 'won')] }), NOW), null);
  assert.equal(bets.yourForm(walletState({ tally: { all: tally.all, days: {} } }), NOW), null);
});

test('the Book asks the wallet for the newest few (one query of five), the old every-page probe gone', async () => {
  const fs = await import('node:fs');
  const root = path.join(import.meta.dirname, '..', 'libs', 'ranker', 'src', 'engine');
  const service = fs.readFileSync(path.join(root, 'account', 'wallet', 'wallet.service.ts'), 'utf8');
  const book = fs.readFileSync(path.join(root, 'book', 'book-page.component.ts'), 'utf8');
  assert.match(service, /const RECENT_N = 5;/);
  assert.match(service, /loadRecent\(uid: string\)[\s\S]*?f\.limit\(RECENT_N\)[\s\S]*?this\.recentSettled\.set/);
  assert.doesNotMatch(service, /f\.limit\(1\)/, 'no one-document probe on every page the wallet is on');
  assert.match(book, /this\.wallet\.wantRecent\(\);/);
  assert.match(book, /recent: this\.wallet\.recentSettled\(\)/);
});

// The bot's side (recent-form.ts botForm): the five sports' recent blocks from their picks.json (picks.mjs recentOf)
// joined: the days summed over the page's own seven Eastern days, the streaks joined across the sports, the newest
// five settled; and whose side the card opens on (formSide)
const block = (over = {}) => ({ days: {}, streak: null, streakAt: [], brokeAt: null, last: [], ...over });
const settledBet = (sport, res, at, over = {}) => ({ sport, pick: 'Over 6.5', matchup: 'NYR @ BOS', market: 'total', player: null, res, units: res === 'W' ? 0.91 : res === 'L' ? -1 : 0, at, ...over });

test('botForm: the sports\' days summed over this week (an older day left out), the newest five across the sports', () => {
  const nhl = block({
    days: { '2026-10-17': [2, 0, 0, 2, 1.82], '2026-10-09': [9, 0, 0, 9, 8] },
    streak: 'W2',
    streakAt: ['2026-10-17T03:00:00Z', '2026-10-16T03:00:00Z'],
    brokeAt: '2026-10-15T03:00:00Z',
    last: [settledBet('nhl', 'W', '2026-10-17T03:00:00Z'), settledBet('nhl', 'W', '2026-10-16T03:00:00Z'), settledBet('nhl', 'L', '2026-10-15T03:00:00Z')],
  });
  const nfl = block({
    days: { '2026-10-16': [1, 2, 1, 4, -1.1] },
    streak: 'W1',
    streakAt: ['2026-10-16T05:00:00Z'],
    brokeAt: '2026-10-14T05:00:00Z',
    last: [settledBet('nfl', 'W', '2026-10-16T05:00:00Z', { market: 'prop', player: 'Garrett Wilson', pick: 'Garrett Wilson Over 4.5 Receptions', matchup: 'NYJ @ NE' }), settledBet('nfl', 'P', '2026-10-15T05:00:00Z'), settledBet('nfl', 'L', '2026-10-14T05:00:00Z')],
  });
  const f = bets.botForm([nhl, null, nfl, undefined], NOW);
  assert.equal(f.record, '3–2–1');
  assert.equal(f.units, '+0.72u');
  assert.equal(f.up, true);
  // (the newest decided bet a win: the NHL's two and the NFL's one, all after the latest loss in either)
  assert.equal(f.streak, 'W3');
  assert.deepEqual(
    f.last.map((b) => `${b.res} ${b.game} ${b.units}`),
    ['W NHL · NYR @ BOS +0.91u', 'W NFL · NYJ @ NE +0.91u', 'W NHL · NYR @ BOS +0.91u', 'P NFL · NYR @ BOS 0.00u', 'L NHL · NYR @ BOS −1.00u'],
  );
  assert.deepEqual(f.last[1].who, { sport: 'nfl', name: 'Garrett Wilson' });
  assert.equal(f.last[0].who, null);
});

test('botForm: a streak cut at the other result in another sport, a losing week, none with nothing', () => {
  const mlb = block({ days: { '2026-10-15': [0, 3, 0, 3, -3] }, streak: 'L3', streakAt: ['2026-10-17T02:00:00Z', '2026-10-16T02:00:00Z', '2026-10-15T02:00:00Z'], brokeAt: '2026-10-10T02:00:00Z', last: [settledBet('mlb', 'L', '2026-10-17T02:00:00Z')] });
  // (the NBA's win on the 16th, 03:00: it ends the run of losses there, so only the MLB's loss since counts)
  const nba = block({ streak: 'W1', streakAt: ['2026-10-16T03:00:00Z'], brokeAt: null, last: [settledBet('nba', 'W', '2026-10-16T03:00:00Z')] });
  const f = bets.botForm([mlb, nba], NOW);
  assert.equal(f.streak, 'L1');
  assert.equal(f.record, '0–3');
  assert.equal(f.units, '−3.00u');
  assert.equal(f.up, false);
  assert.equal(bets.botForm([block(), null], NOW), null);
  assert.equal(bets.botForm([], NOW), null);
});

test('botForm: the practice picks week on its own line (picks.mjs recentOf practice, desk.mjs PRACTICE_SPLIT), out of the record', () => {
  const nhl = block({ days: { '2026-10-17': [1, 0, 0, 1, 0.91] }, practice: { won: 1, lost: 2, push: 0, profit: -0.55 }, last: [settledBet('nhl', 'W', '2026-10-17T03:00:00Z')] });
  const mlb = block({ practice: { won: 1, lost: 0, push: 1, profit: 0.45 } });
  const f = bets.botForm([nhl, mlb], NOW);
  assert.equal(f.record, '1–0');
  assert.equal(f.practice, '2–2–1 · −0.10u');
  // (practice alone still shows the card, its record 0–0)
  assert.equal(bets.botForm([mlb], NOW).practice, '1–0–1 · +0.45u');
  assert.equal(bets.botForm([block({ days: { '2026-10-17': [1, 0, 0, 1, 0.91] }, last: [settledBet('nhl', 'W', '2026-10-17T03:00:00Z')] })], NOW).practice, undefined);
});

test('formSide: the viewer\'s pick, else theirs once they have any, else the bot\'s; none with neither', () => {
  const some = { record: '1–0', units: '+0.91u', up: true, streak: 'W1', last: [] };
  assert.equal(bets.formSide(null, null, some), 'bot');
  assert.equal(bets.formSide(null, some, some), 'you');
  assert.equal(bets.formSide('bot', some, null), 'bot');
  assert.equal(bets.formSide('you', null, some), 'you');
  assert.equal(bets.formSide(null, null, null), null);
});
