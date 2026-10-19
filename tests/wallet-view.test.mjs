// The wallet page's pictures and figures (wallet-view.ts): the chip rack, the runs, Heads Up's periods against
// the wallet's own versus, the tailing/own/fading split, the trophy case, the wall and the tells. Made-up bets;
// no network, no Firestore.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const w = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support/wallet-view-entry.ts'), data: {} });

let n = 0;
const bet = (o = {}) => ({
  id: `b${++n}`,
  sport: 'nfl',
  event: `e${n}`,
  matchup: 'BUF @ NE',
  start: '2026-10-11T17:00:00Z',
  market: 'spread',
  side: 'away',
  line: -3.5,
  odds: -110,
  stake: 1,
  pick: 'BUF -3.5',
  botPick: false,
  run: 0,
  placedAt: '2026-10-11T14:00:00Z',
  status: 'won',
  profit: 0.91,
  settledAt: '2026-10-11T21:00:00Z',
  ...o,
});

test('the chip rack breaks the balance greedily, six chips a stack, the legend every chip', () => {
  const { stacks, legend } = w.chipStacks(1147.5);
  assert.deepEqual(legend.map((l) => [l.denom, l.count]), [['100', 11], ['25', 1], ['5', 4], ['1', 2], ['½', 1]]);
  assert.deepEqual(stacks.map((s) => [s.denom, s.count]), [['100', 6], ['100', 5], ['25', 1], ['5', 4], ['1', 2], ['½', 1]]);
  assert.deepEqual(w.chipStacks(0), { stacks: [], legend: [] });
  // (a tall balance: the rail shows its first stacks, the legend still counts all)
  const big = w.chipStacks(5000);
  assert.equal(big.stacks.length, w.RACK_MAX);
  assert.equal(big.legend[0].count, 50);
});

test('the runs: each bet’s run, its start plus its settled profit, a bust stamped, the current run NOW', () => {
  const bets = [
    bet({ run: 0, profit: -600, status: 'lost', stake: 600, settledAt: '2026-09-05T00:00:00Z', placedAt: '2026-09-02T00:00:00Z' }),
    bet({ run: 0, profit: -400, status: 'lost', stake: 400, settledAt: '2026-09-09T00:00:00Z' }),
    bet({ run: 1, profit: 90, settledAt: '2026-09-20T00:00:00Z', placedAt: '2026-09-19T00:00:00Z' }),
    bet({ run: 2, profit: 40, settledAt: '2026-10-05T00:00:00Z', placedAt: '2026-10-04T00:00:00Z' }),
    bet({ run: 2, profit: -20, status: 'lost', stake: 20, settledAt: '2026-10-08T00:00:00Z' }),
  ];
  // (a wallet from before 2026-10-17: every run began at 1,000, the current one by the wallet's start)
  const runs = w.runCards(bets, 2, 1015, true, 1000);
  assert.deepEqual(runs.map((r) => [r.n, r.peak, r.end, r.bust, r.current]), [
    [1, 1000, 0, true, false],
    [2, 1090, 1090, false, false],
    [3, 1040, 1015, false, true],
  ]);
  assert.equal(runs[0].from, '2026-09-02T00:00:00Z');
  assert.equal(runs[0].to, '2026-09-09T00:00:00Z');
  assert.equal(runs[2].to, null);
  assert.match(runs[2].spark, /^M0\.0 .* L100\.0 /);
  // (history still paging, an older run's bet among the loaded: the current run alone, its peak known)
  const partial = w.runCards(bets.slice(2), 2, 1015, false, 1000);
  assert.equal(partial.length, 1);
  assert.equal(partial[0].peak, 1040);
  // (only the current run's bets loaded so far: no peak, no curve)
  const unknown = w.runCards(bets.slice(3), 2, 1015, false, 1000);
  assert.equal(unknown[0].peak, null);
  assert.equal(unknown[0].spark, null);
  assert.deepEqual(runs.map((r) => r.start), [1000, 1000, 1000]);
  // (a fresh wallet: run 1, flat at 500)
  assert.equal(w.START, 500);
  assert.deepEqual(w.runCards([], 0, 500, true).map((r) => [r.n, r.start, r.peak, r.end]), [[1, 500, 500, 500]]);
  // (an old wallet reloaded after the change: its old run began at 1,000, the runs since at 500)
  const mixed = [
    bet({ run: 0, profit: -1000, status: 'lost', stake: 1000, settledAt: '2026-10-12T00:00:00Z', placedAt: '2026-10-11T00:00:00Z' }),
    bet({ run: 1, profit: 120, settledAt: '2026-10-20T00:00:00Z', placedAt: '2026-10-19T00:00:00Z' }),
  ];
  assert.deepEqual(w.runCards(mixed, 2, 500, true).map((r) => [r.n, r.start, r.peak, r.end, r.bust]), [
    [1, 1000, 1000, 0, true],
    [2, 500, 620, 620, false],
    [3, 500, 500, 500, false],
  ]);
});

test('Heads Up is same game, same bet: duels to the side that won at your stake, agreed bets a tie with their units apart', () => {
  const call = (side, status, units = 1, price = -110) => ({ side, line: null, price, units, kelly: 0.01, forced: true, status, profit: status === 'won' ? Math.round(((units * 100) / 110) * 100) / 100 : status === 'lost' ? -units : 0 });
  const bets = [
    // (a duel won: you home, the bot away, home covers; at your 2u stake both)
    bet({ side: 'home', stake: 2, odds: -110, status: 'won', profit: 1.82, start: '2026-10-16T17:00:00Z', settledAt: '2026-10-16T21:00:00Z', bot: call('away', 'lost', 1) }),
    // (a duel lost: the bot's +150 side won, scored at your 1u)
    bet({ side: 'home', stake: 1, odds: -170, status: 'lost', profit: -1, start: '2026-10-15T17:00:00Z', settledAt: '2026-10-15T21:00:00Z', bot: call('away', 'won', 0.5, 150) }),
    // (a pushed duel: a tie)
    bet({ side: 'home', stake: 1, status: 'push', profit: 0, start: '2026-10-14T17:00:00Z', settledAt: '2026-10-14T21:00:00Z', bot: call('away', 'push') }),
    // (agreed: a tie, your 1u against the bot's 3u)
    bet({ side: 'away', stake: 1, status: 'won', profit: 0.91, start: '2026-10-01T17:00:00Z', settledAt: '2026-10-01T21:00:00Z', bot: call('away', 'won', 3) }),
    // (not counted: no board then, a void, a parlay)
    bet({ status: 'won', profit: 1, bot: null }),
    bet({ status: 'void', profit: 0, bot: call('home', 'won') }),
    bet({ kind: 'parlay', status: 'won', profit: 2, bot: call('home', 'won') }),
  ];
  const all = w.headsUp(bets, 'all', '2026-10-17');
  assert.deepEqual([all.you.won, all.bot.won, all.ties, all.duels], [1, 1, 2, 3]);
  assert.deepEqual([all.you.points, all.bot.points], [2, 2]);
  assert.deepEqual([all.you.profit, all.bot.profit], [0.82, -0.5]);
  assert.deepEqual(all.agreed, { n: 1, you: 0.91, bot: 2.73 });
  assert.equal(all.from, '2026-10-01T17:00:00Z');
  assert.deepEqual(all.dots.slice(-4), ['none', 'none', 'bot', 'you']);
  const week = w.headsUp(bets, 'week', '2026-10-17');
  assert.deepEqual([week.duels, week.agreed.n, week.you.points, week.bot.points], [3, 0, 1.5, 1.5]);
  assert.deepEqual([w.botTag(bets[0]), w.botTag(bets[3]), w.botTag(bets[4]), w.botTag(bets[5]), w.botTag(bets[6])], ['other', 'same', null, null, null]);
  assert.equal(w.headsUp([], 'all').from, null);
});

test('tailing, own calls and fading the bot', () => {
  const ledger = [{ sport: 'nfl', event: 'g1', market: 'spread', side: 'home', published: true }, { sport: 'nfl', event: 'g2', market: 'prop', propType: 'passYds', athlete: '1', side: 'over', published: true }];
  const bets = [
    bet({ botPick: true, status: 'won', profit: 0.91 }),
    bet({ botPick: true, status: 'lost', profit: -1 }),
    bet({ event: 'g1', side: 'away', status: 'won', profit: 0.91 }),
    bet({ event: 'g2', market: 'prop', propType: 'passYds', athlete: '1', side: 'under', status: 'lost', profit: -1 }),
    bet({ event: 'g9', status: 'push', profit: 0 }),
    bet({ event: 'g1', side: 'home', status: 'won', profit: 0.91 }),
    bet({ kind: 'parlay', market: 'parlay', status: 'won', profit: 5 }),
  ];
  const s = w.botSplit(bets, ledger);
  assert.deepEqual([s.tail.won, s.tail.lost, s.tail.profit], [1, 1, -0.09]);
  assert.deepEqual([s.fade.won, s.fade.lost, s.fade.profit], [1, 1, -0.09]);
  assert.deepEqual([s.own.won, s.own.lost, s.own.push, s.own.bets], [1, 0, 1, 2]);
});

test('the trophy case: earned from the bets and the tally, locked with how far along', () => {
  const won = (o) => bet({ status: 'won', profit: 0.91, ...o });
  const bets = [
    won({ settledAt: '2026-10-01T00:00:00Z' }),
    won({ settledAt: '2026-10-02T00:00:00Z', odds: 320, profit: 3.2 }),
    won({ settledAt: '2026-10-03T00:00:00Z', botPick: true }),
    bet({ status: 'lost', profit: -1, settledAt: '2026-10-04T00:00:00Z' }),
    won({ settledAt: '2026-10-05T00:00:00Z' }),
    won({ settledAt: '2026-10-06T00:00:00Z' }),
    won({ settledAt: '2026-10-07T00:00:00Z', kind: 'parlay', market: 'parlay', legs: [{ status: 'won' }, { status: 'won' }, { status: 'won' }] }),
  ];
  const tally = { all: { won: 6, lost: 1, push: 0, void: 0, staked: 7, profit: 6 }, days: {} };
  const runs = [{ n: 1, start: 1000, bust: true, end: 0, current: false, to: '2026-09-19T00:00:00Z' }, { n: 2, start: 1000, bust: false, end: 1090, current: false, to: '2026-10-03T00:00:00Z' }];
  const t = Object.fromEntries(w.trophies(bets, tally, runs, true).map((x) => [x.key, x]));
  assert.ok(!('sharp' in t));
  assert.deepEqual([t.first.earned, t.first.when], [true, '2026-10-01T00:00:00Z']);
  assert.deepEqual([t.heater.earned, t.heater.have], [false, 3]);
  assert.deepEqual([t.longshot.earned, t.longshot.when], [true, '2026-10-02T00:00:00Z']);
  assert.deepEqual([t.tail.earned, t.tail.have], [false, 1]);
  assert.equal(t.parlay.earned, true);
  assert.deepEqual([t.phoenix.earned, t.phoenix.when], [true, '2026-10-03T00:00:00Z']);
  assert.deepEqual([t.iron.earned, t.iron.have], [false, 7]);
  // (the history paging: no first-blood day; no runs, no phoenix)
  const p = Object.fromEntries(w.trophies(bets, tally, null, false).map((x) => [x.key, x]));
  assert.deepEqual([p.first.earned, p.first.when, p.phoenix.have], [true, null, 0]);
});

test('on the wall: the biggest cash, the worst beat; the tells', () => {
  const bets = [
    bet({ status: 'won', profit: 0.91 }),
    bet({ status: 'won', profit: 3.1, odds: 310, placedAt: '2026-10-11T23:30:00' }),
    bet({ status: 'lost', profit: -5, stake: 5, placedAt: '2026-10-11T22:30:00' }),
    bet({ status: 'lost', profit: -1, kind: 'parlay', market: 'parlay', odds: 596, legs: [{ status: 'won', sport: 'nfl' }, { status: 'won', sport: 'nba' }, { status: 'lost', sport: 'nfl' }] }),
    bet({ status: 'lost', profit: -1, market: 'total', sport: 'nba' }),
  ];
  const wall = w.wallPicks(bets);
  assert.equal(wall.biggest.bet.profit, 3.1);
  assert.deepEqual([wall.worst.bet.kind, wall.worst.hits], ['parlay', 2]);
  const straight = w.wallPicks(bets.slice(0, 3));
  assert.deepEqual([straight.worst.bet.stake, straight.worst.hits], [5, null]);
  const tells = Object.fromEntries(w.tells(bets).map((t) => [t.key, t.value]));
  assert.equal(tells['Favourite sport'], 'NFL · 71% of your bets');
  assert.equal(tells['Best market'], 'Spreads · −1.0u');
  assert.equal(tells['Worst market'], 'Totals · −1.0u');
  assert.equal(tells['Typical stake'], '1.0u · 80% of bets');
  assert.match(tells['Average price'], /^[+-]\d+$/);
  assert.equal(tells['Bets placed after 10 PM'], '1–1 · −1.9u');
  assert.deepEqual(w.tells([]), []);
});

// The owner (2026-10-17): the wallet's buttons are the settings sheet's standard ones, not chips; the trophy
// chips and the rack stay as pictures
test('the wallet: Rebuy and the periods are the standard buttons, not chips', async () => {
  const fs = await import('node:fs');
  const root = path.join(import.meta.dirname, '..', 'libs/ranker/src');
  const html = fs.readFileSync(path.join(root, 'engine/account/wallet/wallet-page.component.html'), 'utf8');
  const scss = fs.readFileSync(path.join(root, 'styles/components/wallet-page.scss'), 'utf8');
  const rebuy = html.match(/<button[^>]*class="rebuy-btn"[^>]*>/)?.[0] ?? '';
  assert.match(rebuy, /\[class\.app-btn-primary\]="!sure"/);
  assert.match(rebuy, /\[class\.app-btn-danger\]="sure"/);
  assert.match(html, /sure \? 'Sure\?' : 'Buy back in'/);
  assert.doesNotMatch(html + scss, /rebuy-chip/);
  for (const m of html.matchAll(/<div class="wp-seg"[\s\S]*?<\/div>/g)) assert.match(m[0], /<button type="button" class="app-pill"/);
  assert.match(html, /class="tcase-btn"/);
  assert.match(html, /class="chip-rack"/);
});

// The owner (2026-10-17): the Book's Open tickets and Cashed, and the wallet's open and settled bets, are panels whose
// body is the corkboard, the tickets pinned to it (a push-pin each, a steady slight tilt); no table is left
test('the boards: open and settled tickets pinned to a corkboard panel, on the Book and in the wallet', async () => {
  const fs = await import('node:fs');
  const root = path.join(import.meta.dirname, '..', 'libs/ranker/src');
  const html = fs.readFileSync(path.join(root, 'engine/account/wallet/wallet-page.component.html'), 'utf8');
  const board = (name) => html.match(new RegExp(`<ng-template #${name}[\\s\\S]*?</ng-template>`))?.[0] ?? '';
  for (const name of ['openBoard', 'cashedBoard']) {
    const b = board(name);
    assert.match(b, /<section class="wp-panel book-board"/, name);
    // (a plain title alone on the Book; the wallet's folds)
    assert.match(b, /<div class="wp-bar" \[class\.wp-bar-fold\]="!only" \(click\)="barClick\(\$event, '(open|settled)'\)">\s*@if \(only\) \{\s*<h3>[\s\S]*?\} @else \{\s*<h3><button type="button" class="wp-toggle"/, name);
    // (empty: the corkboard still, a post-it pinned to it saying so)
    assert.match(b, /<div class="cork cork-board board-empty">\s*<div class="postit-pinned">\s*<span class="pin" aria-hidden="true"><\/span>\s*<p class="postit" role="status">No (open|settled) bets/, name);
    assert.match(b, /<div class="cork cork-board">/, name);
    assert.match(b, /<div class="board-pinned" \[style\.rotate\.deg\]="tilt\(b\)">\s*<span class="pin" aria-hidden="true" \[style\.--pin\]="pinColor\(b\)"><\/span>\s*<article class="ticket"/, name);
    assert.match(b, /<pick-text \[pick\]="l\.pick" \[player\]="betPlayer\(l\)">/, name);
  }
  assert.match(board('openBoard'), /ticket-status live[\s\S]*leg-meter[\s\S]*pending settlement/);
  // (the Cashed board a page of tickets at a time, a window of them drawn, Newer over and Show more under: the
  // owner, 2026-10-19, thousands of tickets at once could crash a phone)
  assert.match(board('cashedBoard'), /\(click\)="newerTickets\(\$event\)"[\s\S]*@for \(b of ticketsDrawn\(\); track b\.id\)[\s\S]*class="ticket-stamp" \[ngClass\]="res\.tone"[\s\S]*@if \(ticketsMore\(\)\)[\s\S]*\(click\)="moreTickets\(\$event\)"/);
  assert.doesNotMatch(board('cashedBoard'), /settledTickets\(\); track/);
  assert.match(html, /only === 'closed'\) \{[\s\S]*?ngTemplateOutlet="cashedBoard; context: \{ title: 'Cashed' \}"/);
  assert.match(html, /only === 'open'\) \{[\s\S]*?ngTemplateOutlet="openBoard"/);
  assert.match(html, /ngTemplateOutlet="cashedBoard; context: \{ title: 'Settled' \}"/);
  assert.equal((html.match(/ngTemplateOutlet="openBoard"/g) ?? []).length, 2);
  assert.doesNotMatch(html, /<table|openPanel|settledPanel/);
  assert.match(html, /class="desk-curve"/, 'the profit curve stays');
  assert.match(board('cashedBoard'), /No settled bets \{\{ rangeWords\(range\(\)\) \}\}/);
});

// The owner (2026-10-17): the wallet's header is the title alone (no username, no play money); the wall sits inside
// the trophy case; the folding panels' titles toggle them, your chips, the rebuy and the curve never folding
test('the wallet: a plain header, the wall in the trophy case, the panels folding', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync(path.join(import.meta.dirname, '..', 'libs/ranker/src/engine/account/wallet/wallet-page.component.html'), 'utf8');
  const hero = html.match(/<header class="wallet-hero">[\s\S]*?<\/header>/)[0];
  assert.doesNotMatch(hero, /play money|hero-user|\{\{ me\?\.username/);
  assert.doesNotMatch(html, /aria-label="On the wall"/);
  const trophy = html.match(/aria-label="Trophy case"[\s\S]*?<\/section>/)[0];
  assert.match(trophy, /class="trophies"[\s\S]*On the wall[\s\S]*<div class="cork">/);
  for (const p of ['heads', 'rollers', 'trophies', 'tells', 'open', 'settled']) {
    assert.ok(html.includes(`(click)="togglePanel('${p}')"`), p);
    assert.ok(html.includes(`panelShown('${p}')) {`), p);
  }
  assert.doesNotMatch(html, /togglePanel\('(chips|rebuy|curve)'\)/);
});

test('tilt: steady per ticket, within a few degrees', async () => {
  const src = (await import('node:fs')).readFileSync(path.join(import.meta.dirname, '..', 'libs/ranker/src/engine/account/wallet/wallet-page.component.ts'), 'utf8');
  const body = src.match(/tilt\(b: \{ id: string \}\): number \{([\s\S]*?)\n  \}/)[1];
  // (the tilt and the pin colour read the ticket id's hash, pinHash, a module function beside the component)
  const pinHash = new Function('id', src.match(/function pinHash\(id: string\): number \{([\s\S]*?)\n\}/)[1]);
  const tilt = new Function('pinHash', 'b', body).bind(null, pinHash);
  const ids = Array.from({ length: 200 }, (_, i) => 'bet' + i);
  for (const id of ids) {
    const t = tilt({ id });
    assert.equal(t, tilt({ id }));
    assert.ok(Math.abs(t) <= 2.4, `${id}: ${t}`);
  }
  assert.ok(new Set(ids.map((id) => tilt({ id }))).size > 10, 'the tickets lean different ways');
  // (the pins: a colour each from the set, steady per ticket, several colours across the board)
  const colors = JSON.parse(src.match(/const PIN_COLORS = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
  const pinBody = src.match(/pinColor\(b: \{ id: string \}\): string \{([\s\S]*?)\n  \}/)[1];
  const pinColor = new Function('pinHash', 'PIN_COLORS', 'b', pinBody).bind(null, pinHash, colors);
  for (const id of ids) assert.ok(colors.includes(pinColor({ id })), id);
  assert.ok(new Set(ids.map((id) => pinColor({ id }))).size >= 5, 'pins of several colours');
});

test('the wallet opens with your chips, the rebuy and the profit curve, every other panel shut', () => {
  assert.deepEqual(w.WALLET_PANELS.filter((p) => w.panelOpen(p)), ['chips', 'rebuy', 'curve']);
  for (const p of ['heads', 'rollers', 'trophies', 'tells', 'open', 'settled']) assert.equal(w.panelOpen(p), false, p);
  // (a tap turns one the other way)
  assert.equal(w.panelOpen('heads', new Set(['heads'])), true);
  assert.equal(w.panelOpen('chips', new Set(['chips'])), false);
});
