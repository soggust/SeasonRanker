// The play-money settler (libs/ranker/scripts/accounts/settle.mjs) against the Firestore emulator, with the
// Admin SDK as the Actions job runs it and ESPN stubbed with made-up games: bets settled from the finals and
// paid into their wallets, a price not on the board voided with its stake back, a run twice paying nothing
// twice, a bet from before a reload counted but not paid, the leaderboards (public players only), the lines'
// snapshots, a deleted account's tally dropped, an older tally filled in. `npm run test:rules`; without the
// emulator these skip, and with a host that isn't this machine's they refuse to run (never the live project).
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { boardsDue, run } from '../../libs/ranker/scripts/accounts/settle.mjs';
import { TALLY_VERSION } from '../../libs/ranker/scripts/accounts/settle-lib.mjs';

const host = process.env.FIRESTORE_EMULATOR_HOST;
const skip = host ? false : 'no Firestore emulator (npm run test:rules)';
const PROJECT = 'demo-season-ranker-settle';
if (host && !/^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(host)) throw new Error(`FIRESTORE_EMULATOR_HOST is ${host}: these run against a local emulator only`);

let app;
let db;
before(() => {
  if (skip) return;
  app = initializeApp({ projectId: PROJECT }, 'settle-test');
  db = getFirestore(app);
});
after(async () => app && deleteApp(app));
beforeEach(async () => {
  if (skip) return;
  await fetch(`http://${host}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
});

const NOW = Date.parse('2026-10-12T03:00:00Z');
const at = (iso) => Timestamp.fromDate(new Date(iso));

// ESPN, made up: two finals (LV @ NE 20-24, SEA @ DET 3-2 in the NHL), one not over (CLE @ NYJ), DraftKings'
// core odds for the NFL final, and tomorrow's scoreboard with one game to snapshot
const header = (id, date, home, away, hs, as, done) => ({
  header: {
    id,
    season: { year: 2026, type: 2 },
    competitions: [
      {
        date,
        status: { type: { completed: done, state: done ? 'post' : 'in', name: done ? 'STATUS_FINAL' : 'STATUS_IN_PROGRESS' } },
        competitors: [
          { homeAway: 'home', score: String(hs), team: { id: '1', abbreviation: home } },
          { homeAway: 'away', score: String(as), team: { id: '2', abbreviation: away } },
        ],
      },
    ],
  },
  boxscore: {
    players: [
      {
        team: { abbreviation: 'DET' },
        statistics: [{ name: 'goaltending', labels: ['SA', 'GA', 'SV'], athletes: [{ athlete: { id: '2590824' }, stats: ['26', '2', '24'] }] }],
      },
    ],
  },
});
const core = {
  homeTeamOdds: {
    open: { pointSpread: { american: '-3' }, spread: { american: '-110' }, moneyLine: { american: '-160' } },
    close: { pointSpread: { american: '-3.5' }, spread: { american: '-108' }, moneyLine: { american: '-180' } },
  },
  awayTeamOdds: {
    open: { pointSpread: { american: '+3' }, spread: { american: '-110' }, moneyLine: { american: '+135' } },
    close: { pointSpread: { american: '+3.5' }, spread: { american: '-112' }, moneyLine: { american: '+150' } },
  },
  open: { total: { american: '44.5' }, over: { american: '-110' }, under: { american: '-110' } },
  close: { total: { american: '45.5' }, over: { american: '-105' }, under: { american: '-115' } },
};
let tomorrowSpread = '-6.5';
const fetched = [];
async function fetchJson(url) {
  fetched.push(url);
  if (url.includes('summary?event=401')) return header('401', '2026-10-11T17:00Z', 'NE', 'LV', 24, 20, true);
  if (url.includes('summary?event=402')) return header('402', '2026-10-11T20:00Z', 'NYJ', 'CLE', 7, 3, false);
  if (url.includes('summary?event=501')) return header('501', '2026-10-11T23:00Z', 'DET', 'SEA', 3, 2, true);
  if (url.includes('/events/401/competitions/401/odds/100')) return core;
  if (url.includes('football/nfl/scoreboard') && url.includes('dates=20261012')) {
    return {
      events: [
        {
          id: '403',
          date: '2026-10-12T23:15Z',
          competitions: [
            {
              status: { type: { state: 'pre' } },
              odds: [
                {
                  provider: { name: 'DraftKings' },
                  moneyline: { home: { close: { odds: '-250' } }, away: { close: { odds: '+205' } } },
                  pointSpread: { home: { close: { line: tomorrowSpread, odds: '-110' } }, away: { close: { line: '+6.5', odds: '-110' } } },
                  total: { over: { close: { line: 'o48.5', odds: '-110' } }, under: { close: { line: 'u48.5', odds: '-110' } } },
                },
              ],
            },
          ],
        },
      ],
    };
  }
  return { events: [] };
}

// The bettor's ledger: its own pick on the NHL prop (graded: he made 24 saves)
const ledgers = {
  nfl: [],
  nba: [],
  mlb: [],
  nhl: [
    { id: '501:prop:saves:2590824', event: '501', market: 'prop', side: 'under', propType: 'saves', athlete: '2590824', line: 24.5, odds: -110, placedAt: '2026-10-11T12:00Z', status: 'won', actual: 24 },
  ],
};

const bet = (over = {}) => ({
  sport: 'nfl',
  event: '401',
  matchup: 'LV @ NE',
  start: at('2026-10-11T17:00Z'),
  market: 'spread',
  side: 'home',
  line: -3.5,
  odds: -108,
  stake: 100,
  pick: 'NE -3.5',
  run: 0,
  placedAt: at('2026-10-10T15:00Z'),
  status: 'open',
  ...over,
});

async function seed(uid, { betHistory = 'public', balance = 800, resets = 0, bets = {}, photo = null } = {}) {
  await db.doc(`users/${uid}`).set({ username: uid, usernameLower: uid, displayName: uid.toUpperCase(), photo, visibility: { lists: 'public', presets: 'public', openBets: 'friends', betHistory, tracker: 'friends' } });
  await db.doc(`users/${uid}/wallet/main`).set({ balance, start: 1000, resets });
  for (const [id, b] of Object.entries(bets)) await db.doc(`users/${uid}/bets/${id}`).set(b);
}

const quiet = () => undefined;

describe('the settler', { skip }, () => {
  test('settles the finals, pays the wallets, voids what must be, and pays nothing twice', async () => {
    await seed('ann', {
      balance: 699,
      bets: {
        // (won: 100 at -108 pays 192.59 back)
        won: bet(),
        // (lost)
        lost: bet({ market: 'ml', side: 'away', line: null, odds: 150, pick: 'LV ML', stake: 50 }),
        // (a price never on the board: void, its stake back)
        void: bet({ market: 'total', side: 'over', line: 45.5, odds: 140, pick: 'Over 45.5', stake: 25 }),
        // (not over yet: waits)
        waiting: bet({ event: '402', matchup: 'CLE @ NYJ', start: at('2026-10-11T20:00Z'), side: 'away', line: 2.5, stake: 10 }),
        // (the bot's prop at its price: under 24.5 saves, he made 24)
        prop: bet({ sport: 'nhl', event: '501', matchup: 'SEA @ DET', start: at('2026-10-11T23:00Z'), market: 'prop', side: 'under', line: 24.5, odds: -110, propType: 'saves', athlete: '2590824', player: 'John Gibson', statLabel: 'Saves', ref: '501:prop:saves:2590824', pick: 'John Gibson Under 24.5 Saves', stake: 11 }),
        // (a game not begun: not looked at)
        future: bet({ event: '403', matchup: 'KC @ DEN', start: at('2026-10-12T23:15Z') }),
      },
    });
    // (bob: friends-only history, a bet from before his reload: settled and counted, not paid)
    await seed('bob', { betHistory: 'friends', balance: 1000, resets: 1, bets: { old: bet({ stake: 40, run: 0 }) } });
    // (a tally whose account is gone)
    await db.doc('tallies/ghost').set({ all: { won: 5 }, days: { '2026-10-11': [5, 0, 0, 50, 45] } });

    const first = await run({ db, fetchJson, now: NOW, ledgers, log: quiet });
    assert.equal(first.failed, false);
    assert.deepEqual(first.counts, { settled: 4, void: 1, waiting: 1 });

    const get = async (p) => (await db.doc(p).get()).data();
    const won = await get('users/ann/bets/won');
    assert.equal(won.status, 'won');
    assert.equal(won.profit, 92.59);
    assert.equal(won.final, 'LV 20 @ NE 24');
    assert.ok(won.settledAt);
    assert.equal((await get('users/ann/bets/lost')).status, 'lost');
    const v = await get('users/ann/bets/void');
    assert.deepEqual([v.status, v.profit, v.note], ['void', 0, 'price didn’t match the board']);
    assert.equal((await get('users/ann/bets/waiting')).status, 'open');
    assert.equal((await get('users/ann/bets/future')).status, 'open');
    const prop = await get('users/ann/bets/prop');
    assert.deepEqual([prop.status, prop.profit, prop.final], ['won', 10, 'John Gibson 24 Saves']);
    // (699 + 192.59 + 25 + 21 = 937.59)
    assert.equal((await get('users/ann/wallet/main')).balance, 937.59);
    // (bob's bet from run 1 settled and counted; his run-2 wallet untouched)
    assert.equal((await get('users/bob/bets/old')).status, 'won');
    assert.equal((await get('users/bob/wallet/main')).balance, 1000);
    const tally = await get('tallies/ann');
    assert.deepEqual(tally.all, { won: 2, lost: 1, push: 0, void: 1, staked: 161, profit: 52.59 });
    assert.deepEqual(tally.days['2026-10-11'], [2, 1, 0, 161, 52.59]);
    // (each day's profit by sport, for the wallet's chart; the void out; a new tally at the current version)
    assert.deepEqual(tally.sports, { '2026-10-11': { nfl: 42.59, nhl: 10 } });
    assert.equal(tally.v, TALLY_VERSION);

    // (the boards: ann public, bob not; the ghost's tally gone)
    const week = await get('leaderboards/week');
    assert.equal(week.label, 'Week of Oct 5');
    assert.equal(week.tallyVersion, TALLY_VERSION);
    assert.deepEqual(
      week.rows.map((r) => [r.username, r.won, r.lost, r.profit]),
      [['ann', 2, 1, 52.59]],
    );
    // (her reloads beside her row, read from her wallet's resets)
    assert.equal(week.rows[0].reloads, 0);
    assert.equal((await get('leaderboards/all')).rows.length, 1);
    assert.equal((await db.doc('tallies/ghost').get()).exists, false);

    // (the lines: tomorrow's game snapshotted once; again only when a price moves)
    const lines = await get('lines/nfl_403');
    assert.equal(lines.snaps.length, 1);
    assert.equal(lines.snaps[0].spread.home.line, -6.5);

    // (run again: nothing paid twice, the snapshot unchanged)
    const second = await run({ db, fetchJson, now: NOW + 36e5, ledgers, log: quiet });
    assert.deepEqual(second.counts, { settled: 0, void: 0, waiting: 1 });
    assert.equal((await get('users/ann/wallet/main')).balance, 937.59);
    assert.equal((await get('lines/nfl_403')).snaps.length, 1);
    tomorrowSpread = '-7';
    await run({ db, fetchJson, now: NOW + 2 * 36e5, ledgers, log: quiet });
    assert.equal((await get('lines/nfl_403')).snaps.length, 2);
  });

  test('parlays: each leg graded as a straight bet, paid at the legs’ product, lost at a leg’s loss, waiting on a game not over with its graded legs kept', async () => {
    const leg = (over = {}) => {
      const { stake: _s, run: _r, placedAt: _p, status: _st, ...l } = bet(over);
      return l;
    };
    const ne = leg();
    const gibson = leg({ sport: 'nhl', event: '501', matchup: 'SEA @ DET', start: at('2026-10-11T23:00Z'), market: 'prop', side: 'under', line: 24.5, odds: -110, propType: 'saves', athlete: '2590824', player: 'John Gibson', statLabel: 'Saves', ref: '501:prop:saves:2590824', pick: 'John Gibson Under 24.5 Saves' });
    const cle = leg({ event: '402', matchup: 'CLE @ NYJ', start: at('2026-10-11T20:00Z'), side: 'away', line: 2.5, odds: -110, pick: 'CLE +2.5' });
    const lv = leg({ market: 'ml', side: 'away', line: null, odds: 150, pick: 'LV ML' });
    const parlay = (legs, over = {}) => ({ kind: 'parlay', legs, games: legs.map((l) => `${l.sport}_${l.event}`), start: legs[0].start, odds: 999, stake: 10, pick: `${legs.length}-leg parlay`, run: 0, placedAt: at('2026-10-10T15:00Z'), status: 'open', ...over });
    await seed('dee', { balance: 500, bets: { won: parlay([ne, gibson]), lost: parlay([lv, cle]), waiting: parlay([ne, cle]) } });
    const first = await run({ db, fetchJson, now: NOW, ledgers, log: quiet });
    assert.deepEqual(first.counts, { settled: 2, void: 0, waiting: 1 });
    const get = async (p) => (await db.doc(`users/dee/${p}`).get()).data();
    // (both hit: -108 and -110 as +268, the browser's own 999 never read)
    const won = await get('bets/won');
    assert.deepEqual([won.status, won.profit, won.final, won.paidOdds], ['won', 26.77, '2 of 2 hit', 268]);
    assert.deepEqual(won.legs.map((l) => [l.status, l.final]), [['won', 'LV 20 @ NE 24'], ['won', 'John Gibson 24 Saves']]);
    // (LV lost: the parlay lost though CLE's game isn't over, that leg left ungraded)
    const lost = await get('bets/lost');
    assert.deepEqual([lost.status, lost.profit, lost.final], ['lost', -10, '0 of 2 hit']);
    assert.deepEqual(lost.legs.map((l) => l.status ?? null), ['lost', null]);
    // (one hit, the other's game not over: open, the hit written on it for the page)
    const waiting = await get('bets/waiting');
    assert.equal(waiting.status, 'open');
    assert.deepEqual(waiting.legs.map((l) => l.status ?? null), ['won', null]);
    assert.equal(waiting.legs[0].pick, 'NE -3.5');
    // (paid: 500 + 36.77; one bet each in the record)
    assert.equal((await db.doc('users/dee/wallet/main').get()).get('balance'), 536.77);
    const tally = (await db.doc('tallies/dee').get()).data();
    assert.deepEqual(tally.all, { won: 1, lost: 1, push: 0, void: 0, staked: 20, profit: 16.77 });
    // (run again: nothing paid twice, the graded leg kept)
    const second = await run({ db, fetchJson, now: NOW + 36e5, ledgers, log: quiet });
    assert.deepEqual(second.counts, { settled: 0, void: 0, waiting: 1 });
    assert.equal((await db.doc('users/dee/wallet/main').get()).get('balance'), 536.77);
    assert.equal((await get('bets/waiting')).legs[0].status, 'won');
  });

  test('a parlay leg that isn’t a game is void without a read; one parlay that fails is logged and the rest still settle', async () => {
    const leg = (over = {}) => {
      const { stake: _s, run: _r, placedAt: _p, status: _st, ...l } = bet(over);
      return l;
    };
    const parlay = (legs, over = {}) => ({ kind: 'parlay', legs, games: legs.map((l) => `${l.sport}_${l.event}`), start: legs[0].start, odds: 999, stake: 10, pick: `${legs.length}-leg parlay`, run: 0, placedAt: at('2026-10-10T15:00Z'), status: 'open', ...over });
    const ne = leg();
    const lines = [];
    const failing = async (url) => {
      if (url.includes('summary?event=777')) throw new Error('ESPN down');
      return fetchJson(url);
    };
    // (written past the rules: a query string on one leg's event, a padded id on another; a leg whose game read fails)
    const query = leg({ event: '402&x=/a', matchup: 'CLE @ NYJ', pick: 'CLE +2.5', side: 'away', line: 2.5, odds: -110 });
    const padded = leg({ event: '0401', market: 'total', side: 'over', line: 44.5, odds: -110, pick: 'Over 44.5' });
    const boom = leg({ event: '777', matchup: 'KC @ DEN', pick: 'KC ML', market: 'ml', side: 'away', line: null, odds: 120 });
    // (the boom parlay first in the loop: the others after it settled all the same)
    await seed('eve', { balance: 500, bets: { a: parlay([boom, ne]), b: parlay([query, ne]), c: parlay([ne, padded]) } });
    fetched.length = 0;
    const first = await run({ db, fetchJson: failing, now: NOW, ledgers, log: (s) => lines.push(s) });
    assert.equal(first.counts.failed, 1);
    assert.ok(lines.some((s) => /users\/eve\/bets\/a: not settled \(ESPN down\)/.test(s)));
    const get = async (p) => (await db.doc(`users/eve/${p}`).get()).data();
    assert.equal((await get('bets/a')).status, 'open');
    // (the query-string leg void, never read; NE paid as a straight bet)
    const b = await get('bets/b');
    assert.deepEqual([b.status, b.legs[0].status, b.legs[0].note, b.paidOdds], ['won', 'void', 'not a game', -108]);
    assert.ok(!fetched.some((u) => u.includes('&x=')));
    // (the padded id is the same game as NE's: void, two legs on one game)
    const c = await get('bets/c');
    assert.deepEqual([c.status, c.note], ['void', 'two legs on one game']);
  });

  test('a bet placed from a snapshot’s price within its window stands; a dry run writes nothing', async () => {
    await db.doc('lines/nfl_401').set({ sport: 'nfl', event: '401', snaps: [{ at: '2026-10-10T14:00:00Z', spread: { home: { line: -2.5, odds: -105 }, away: { line: 2.5, odds: -115 } }, total: { line: 46, over: -110, under: -110 }, ml: { home: -190, away: 160 } }] });
    await seed('cy', { bets: { snap: bet({ line: -2.5, odds: -105 }), late: bet({ line: -2.5, odds: -105, placedAt: at('2026-10-11T10:00Z') }) } });
    const dry = await run({ db, fetchJson, now: NOW, ledgers, dry: true, log: quiet });
    assert.deepEqual(dry.counts, { settled: 1, void: 1, waiting: 0 });
    assert.equal((await db.doc('users/cy/bets/snap').get()).get('status'), 'open');
    assert.equal((await db.doc('leaderboards/week').get()).exists, false);
    await run({ db, fetchJson, now: NOW, ledgers, log: quiet });
    assert.equal((await db.doc('users/cy/bets/snap').get()).get('status'), 'won');
    assert.equal((await db.doc('users/cy/bets/late').get()).get('note'), 'price didn’t match the board');
  });

  test('an older tally (no sports) filled in once from the bets on the next run, its record untouched; the boards due till it is', async () => {
    // (dee: two settled bets from before the tally kept sports, a void, an open one; her tally as it was then)
    await seed('dee', {
      bets: {
        a: bet({ status: 'won', profit: 92.59, settledAt: at('2026-10-11T21:00Z') }),
        b: bet({ sport: 'nba', event: '601', matchup: 'BOS @ NYK', start: at('2026-10-10T23:30Z'), status: 'lost', profit: -20, stake: 20, settledAt: at('2026-10-11T03:00Z') }),
        c: bet({ status: 'void', profit: 0, settledAt: at('2026-10-11T21:00Z') }),
        d: bet({ event: '403', matchup: 'KC @ DEN', start: at('2026-10-12T23:15Z') }),
      },
    });
    const old = { all: { won: 1, lost: 1, push: 0, void: 1, staked: 120, profit: 72.59 }, days: { '2026-10-11': [1, 0, 0, 100, 92.59], '2026-10-10': [0, 1, 0, 20, -20] } };
    await db.doc('tallies/dee').set(old);
    // (boards written before the tallies had a version: due)
    await db.doc('leaderboards/week').set({ from: '2026-10-05', updatedAt: at('2026-10-12T02:30Z') });
    assert.equal(await boardsDue(db, { settled: 0, void: 0 }, NOW), true);
    const logged = [];
    await run({ db, fetchJson, now: NOW, ledgers, log: (m) => logged.push(m) });
    const tally = (await db.doc('tallies/dee').get()).data();
    assert.deepEqual(tally.all, old.all);
    assert.deepEqual(tally.days, old.days);
    assert.deepEqual(tally.sports, { '2026-10-11': { nfl: 92.59 }, '2026-10-10': { nba: -20 } });
    assert.equal(tally.v, TALLY_VERSION);
    assert.ok(logged.includes(`tallies: 1 filled in to version ${TALLY_VERSION}`));
    // (once filled in, not again; the boards stand till something settles or a day passes: written, as far as
    // this test's clock goes, at NOW)
    await db.doc('leaderboards/week').update({ updatedAt: at(new Date(NOW).toISOString()) });
    assert.equal(await boardsDue(db, { settled: 0, void: 0 }, NOW + 18e5), false);
    const again = [];
    await run({ db, fetchJson, now: NOW + 18e5, ledgers, log: (m) => again.push(m) });
    assert.equal(again.some((m) => m.startsWith('tallies:')), false);
  });

  test('UFC bouts: a moneyline and a round total settled from ESPN’s UFC scoreboard as the MMA desk grades, a replaced fighter void, a parlay with a bout’s leg; a dry run writes nothing', async () => {
    // (ESPN's UFC scoreboard, made up: bout 901 Jourdain over Cuamba at 2:30 of the third (exactly the Over 2.5's
    // line: Under), bout 902 a no contest in the first, bout 903 now Smith vs Diaz (the desk kept it as Smith vs
    // Lee, the pairing the bet is on: a fighter replaced))
    const comp = (id, date, home, away, { winner = 'home', period = 3, clock = 150 } = {}) => ({
      id,
      date,
      type: { abbreviation: 'Bantamweight' },
      format: { regulation: { periods: 3 } },
      status: { type: { name: 'STATUS_FINAL', completed: true }, period, clock },
      competitors: [
        { id: home[0], order: 1, winner: winner === 'home', athlete: { displayName: home[1] } },
        { id: away[0], order: 2, winner: winner === 'away', athlete: { displayName: away[1] } },
      ],
    });
    const ufc = {
      events: [
        {
          id: '600',
          name: 'UFC Fight Night',
          competitions: [
            comp('901', '2026-10-11T23:30Z', ['11', 'Louis Jourdain'], ['12', 'Timmy Cuamba']),
            comp('902', '2026-10-11T23:00Z', ['21', 'Ana Silva'], ['22', 'Bea Croft'], { winner: null, period: 1, clock: 60 }),
            comp('903', '2026-10-11T22:30Z', ['31', 'Sam Smith'], ['33', 'Dan Diaz']),
          ],
        },
      ],
    };
    const asked = [];
    const mmaFetch = async (url) => {
      if (url.includes('mma/ufc/scoreboard')) {
        asked.push(url);
        return ufc;
      }
      return fetchJson(url);
    };
    const kept = [{ id: '903', card: '600', date: '2026-10-11T22:30Z', rounds: 3, home: { id: '31', name: 'Sam Smith' }, away: { id: '32', name: 'Lee Lee' }, final: false, winner: null, off: null, key: '903:31-32' }];
    // (the MMA board's prices seen, the day before)
    const shown = [Date.parse('2026-10-10T12:00Z'), Date.parse('2026-10-11T22:00Z')];
    const seen = {
      mma: {
        901: { 'ml|home||-150||': shown, 'ml|away||125||': shown, 'total|over|2.5|-145||': shown, 'total|under|2.5|114||': shown },
        902: { 'ml|home||-200||': shown, 'ml|away||165||': shown },
        903: { 'ml|home||-120||': shown, 'ml|away||100||': shown },
      },
    };
    const fight = (over = {}) => bet({ sport: 'mma', event: '901', matchup: 'Timmy Cuamba @ Louis Jourdain', start: at('2026-10-11T23:30Z'), market: 'ml', side: 'home', line: null, odds: -150, pick: 'Louis Jourdain ML', stake: 30, ...over });
    const under = fight({ market: 'total', side: 'under', line: 2.5, odds: 114, pick: 'Under 2.5 rounds', stake: 10 });
    const nc = fight({ event: '902', matchup: 'Bea Croft @ Ana Silva', start: at('2026-10-11T23:00Z'), odds: -200, pick: 'Ana Silva ML', stake: 20 });
    const swapped = fight({ event: '903', matchup: 'Lee Lee @ Sam Smith', start: at('2026-10-11T22:30Z'), odds: -120, pick: 'Sam Smith ML', stake: 15 });
    const leg = (over = {}) => {
      const { stake: _s, run: _r, placedAt: _p, status: _st, ...l } = bet(over);
      return l;
    };
    const { stake: _s, run: _r, placedAt: _p, status: _st, ...boutLeg } = fight();
    const parlay = { kind: 'parlay', legs: [leg(), boutLeg], games: ['nfl_401', 'mma_901'], start: at('2026-10-11T17:00Z'), odds: 999, stake: 10, pick: '2-leg parlay', run: 0, placedAt: at('2026-10-10T15:00Z'), status: 'open' };
    await seed('eve', { balance: 500, bets: { ml: fight(), under, nc, swapped, parlay } });
    const opts = { db, fetchJson: mmaFetch, now: NOW, ledgers: { ...ledgers, mma: [] }, seen, mmaKept: kept, log: quiet };
    // (a dry run: read and reported, nothing written)
    const dry = await run({ ...opts, dry: true });
    assert.deepEqual(dry.counts, { settled: 3, void: 2, waiting: 0 });
    assert.equal((await db.doc('users/eve/bets/ml').get()).get('status'), 'open');
    assert.equal((await db.doc('users/eve/wallet/main').get()).get('balance'), 500);
    const first = await run(opts);
    assert.deepEqual(first.counts, { settled: 3, void: 2, waiting: 0 });
    // (the UFC scoreboard asked once a run, over the bouts' days)
    assert.equal(asked.length, 2);
    assert.match(asked[1], /dates=20261010-20261012/);
    const get = async (p) => (await db.doc(`users/eve/bets/${p}`).get()).data();
    const ml = await get('ml');
    assert.deepEqual([ml.status, ml.profit, ml.final], ['won', 20, 'Louis Jourdain vs Timmy Cuamba: Louis Jourdain won']);
    const u = await get('under');
    assert.deepEqual([u.status, u.profit, u.final], ['won', 11.4, 'Louis Jourdain vs Timmy Cuamba: Louis Jourdain won, R3 2:30']);
    assert.deepEqual([(await get('nc')).status, (await get('nc')).note], ['void', 'a draw or a no contest']);
    assert.deepEqual([(await get('swapped')).status, (await get('swapped')).note], ['void', 'a fighter was replaced']);
    // (the parlay: NE -3.5 at -108 and Jourdain at -150, +221)
    const p = await get('parlay');
    assert.deepEqual([p.status, p.profit, p.paidOdds, p.final], ['won', 22.1, 221, '2 of 2 hit']);
    assert.deepEqual(p.legs.map((l) => l.status), ['won', 'won']);
    // (500 + 50 + 21.4 + 20 + 15 + 32.1)
    assert.equal((await db.doc('users/eve/wallet/main').get()).get('balance'), 638.5);
    const tally = (await db.doc('tallies/eve').get()).data();
    assert.deepEqual(tally.sports['2026-10-11'], { mma: 31.4, parlay: 22.1 });
    // (again: nothing paid twice)
    const second = await run({ ...opts, now: NOW + 36e5 });
    assert.deepEqual(second.counts, { settled: 0, void: 0, waiting: 0 });
    assert.equal((await db.doc('users/eve/wallet/main').get()).get('balance'), 638.5);
  });
});
