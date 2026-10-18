// The NHL's own box score as the grader's count for a skater's shots and points (libs/ranker/scripts/model/
// nhl-official.mjs): the game found by its day's scoreboard, a skater matched by side, number and name, the
// play-by-play when the box lists no one, waiting till the league calls it official; statInFinal by it; the
// desk grading again by it (run.mjs officialRegrade: Matthew Knies' Under 1.5 Shots, NYR @ CBJ 2026-10-17,
// graded on ESPN's 1, the league's 2); and the settler's corrections (settle-lib.mjs correctionOf,
// parlayCorrectionOf, removeFromTally).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_OFFICIAL, OFFICIAL_WAIT, boxOf, nhlAbbr, officialLine, officialLookup, pbpBoxOf } from '../libs/ranker/scripts/model/nhl-official.mjs';
import { statInFinal } from '../libs/ranker/scripts/model/props.mjs';
import { officialRegrade } from '../libs/ranker/scripts/model/run.mjs';
import { addToTally, correctionOf, parlayCorrectionOf, removeFromTally } from '../libs/ranker/scripts/accounts/settle-lib.mjs';

const START = '2026-10-17T23:00Z';
const LABELS = ['TOI', 'G', 'A', 'S', 'SM', 'SOG'];
// (ESPN's summary, made up: NYR @ CBJ, Knies 1 shot by ESPN's S, its SOG column 0)
const espn = (s = '1') => ({
  header: {
    id: '401892527',
    competitions: [
      {
        date: START,
        status: { type: { completed: true } },
        competitors: [
          { homeAway: 'home', team: { id: '29', abbreviation: 'CBJ' } },
          { homeAway: 'away', team: { id: '13', abbreviation: 'NYR' } },
        ],
      },
    ],
  },
  boxscore: {
    players: [
      {
        team: { id: '29', abbreviation: 'CBJ' },
        statistics: [
          {
            name: 'forwards',
            labels: LABELS,
            athletes: [
              { athlete: { id: '4874919', displayName: 'Matthew Knies', jersey: '89' }, stats: ['21:11', '0', '0', s, '0', '0'] },
              { athlete: { id: '7', displayName: 'Kent Johnson', jersey: '91' }, stats: ['18:00', '1', '0', '3', '1', '0'] },
            ],
          },
        ],
      },
      { team: { id: '13', abbreviation: 'NYR' }, statistics: [{ name: 'forwards', labels: LABELS, athletes: [{ athlete: { id: '8', displayName: 'Mika Zibanejad', jersey: '93' }, stats: ['20:00', '0', '0', '4', '0', '0'] }] }] },
    ],
  },
});
// (the league's box: Knies 2, Johnson 3 and the OT winner, Zibanejad 4)
const skater = (playerId, sweaterNumber, name, sog, goals = 0, assists = 0) => ({ playerId, sweaterNumber, name: { default: name }, sog, goals, assists });
const nhlBox = (state, empty = false) => ({
  id: 2026020129,
  gameState: state,
  playerByGameStats: {
    homeTeam: { forwards: empty ? [] : [skater(1, 89, 'M. Knies', 2), skater(2, 91, 'K. Johnson', 3, 1)], defense: [], goalies: [] },
    awayTeam: { forwards: empty ? [] : [skater(3, 93, 'M. Zibanejad', 4)], defense: [], goalies: [] },
  },
});
const pbp = {
  id: 2026020129,
  gameState: 'OFF',
  homeTeam: { id: 29 },
  awayTeam: { id: 3 },
  rosterSpots: [
    { teamId: 29, playerId: 1, sweaterNumber: 89, firstName: { default: 'Matthew' }, lastName: { default: 'Knies' }, positionCode: 'L' },
    { teamId: 29, playerId: 2, sweaterNumber: 91, firstName: { default: 'Kent' }, lastName: { default: 'Johnson' }, positionCode: 'C' },
    { teamId: 29, playerId: 9, sweaterNumber: 33, firstName: { default: 'Cam' }, lastName: { default: 'Talbot' }, positionCode: 'G' },
    { teamId: 3, playerId: 3, sweaterNumber: 93, firstName: { default: 'Mika' }, lastName: { default: 'Zibanejad' }, positionCode: 'C' },
  ],
  plays: [
    { typeDescKey: 'shot-on-goal', periodDescriptor: { periodType: 'REG' }, details: { shootingPlayerId: 1 } },
    { typeDescKey: 'missed-shot', periodDescriptor: { periodType: 'REG' }, details: { shootingPlayerId: 1 } },
    { typeDescKey: 'shot-on-goal', periodDescriptor: { periodType: 'REG' }, details: { shootingPlayerId: 1 } },
    { typeDescKey: 'goal', periodDescriptor: { periodType: 'OT' }, details: { scoringPlayerId: 2, assist1PlayerId: 1 } },
    { typeDescKey: 'goal', periodDescriptor: { periodType: 'SO' }, details: { scoringPlayerId: 3 } },
  ],
};
const fetcher = (box, { calls = [], game = true, play = pbp } = {}) => async (url) => {
  calls.push(url);
  if (url.endsWith('/score/2026-10-17')) return { games: game ? [{ id: 2026020129, homeTeam: { abbrev: 'CBJ' }, awayTeam: { abbrev: 'NYR' } }] : [] };
  if (url.endsWith('/gamecenter/2026020129/boxscore')) return box;
  if (url.endsWith('/gamecenter/2026020129/play-by-play')) return play;
  return null;
};
const at = (ms) => Date.parse(START) + ms;

test("officialLine: a skater by his side and number, his last name agreeing (accents aside); else his last name and first initial, one alone; else none", () => {
  const box = boxOf(nhlBox('OFF'));
  assert.equal(officialLine(box, 'h', { displayName: 'Matthew Knies', jersey: '89' }).sog, 2);
  assert.equal(officialLine(box, 'h', { displayName: 'Matthew Knies', jersey: '' }).sog, 2, 'no number: by name');
  assert.equal(officialLine(box, 'a', { displayName: 'Mika Zibanéjad', jersey: '93' }).sog, 4);
  assert.equal(officialLine(box, 'a', { displayName: 'Matthew Knies', jersey: '89' }), null, 'not on that side');
  assert.equal(officialLine(box, 'h', { displayName: 'Someone Else', jersey: '89' }), null, 'a number that is someone else');
  assert.equal(officialLine({ a: [{ number: '5', name: 'D.Jiricek', sog: 3 }] }, 'a', { displayName: 'David Jiříček', jersey: '5' }).sog, 3, 'an initial with no space after it');
  assert.equal(boxOf(nhlBox('OFF', true)), null, 'a box listing no one');
  assert.equal(nhlAbbr('LA'), 'LAK');
  assert.equal(nhlAbbr('UTAH'), 'UTA');
  assert.equal(nhlAbbr('CBJ'), 'CBJ');
});

test('pbpBoxOf: shots on goal with goals among them, assists, the shootout and the goalies left out', () => {
  const box = pbpBoxOf(pbp);
  assert.deepEqual(
    box.h.map((p) => [p.name, p.sog, p.goals, p.assists]),
    [
      ['Matthew Knies', 2, 0, 1],
      ['Kent Johnson', 1, 1, 0],
    ],
  );
  assert.deepEqual(box.a.map((p) => [p.sog, p.goals]), [[0, 0]]);
});

test("officialLookup: the box once it's OFF, or FINAL past OFFICIAL_WAIT; waiting before; the play-by-play when the box lists no one; none past NO_OFFICIAL", async () => {
  assert.ok((await officialLookup({ fetchJson: fetcher(nhlBox('OFF')), now: at(3 * 36e5) })(espn())).box);
  assert.deepEqual(await officialLookup({ fetchJson: fetcher(nhlBox('FINAL')), now: at(3 * 36e5) })(espn()), { wait: true });
  assert.ok((await officialLookup({ fetchJson: fetcher(nhlBox('FINAL')), now: at(OFFICIAL_WAIT) })(espn())).box);
  assert.deepEqual(await officialLookup({ fetchJson: fetcher(nhlBox('LIVE')), now: at(2 * 36e5) })(espn()), { wait: true });
  const fromPbp = await officialLookup({ fetchJson: fetcher(nhlBox('OFF', true)), now: at(3 * 36e5) })(espn());
  assert.equal(fromPbp.box.h[0].sog, 2);
  assert.deepEqual(await officialLookup({ fetchJson: fetcher(null, { game: false }), now: at(3 * 36e5) })(espn()), { wait: true });
  assert.equal(await officialLookup({ fetchJson: fetcher(null, { game: false }), now: at(NO_OFFICIAL) })(espn()), null);
  // (each game's box read once a look-up)
  const calls = [];
  const look = officialLookup({ fetchJson: fetcher(nhlBox('OFF'), { calls }), now: at(3 * 36e5) });
  await look(espn());
  await look(espn());
  assert.equal(calls.length, 2);
});

test("statInFinal: an NHL skater's shots and points by the league's box, waiting till it's official, ESPN's S without one; officialOnly, none", async () => {
  const knies = { athlete: '4874919', propType: 'sog' };
  const off = { official: officialLookup({ fetchJson: fetcher(nhlBox('OFF')), now: at(3 * 36e5) }) };
  assert.equal(await statInFinal('nhl', knies, espn(), null), 1, "ESPN's S alone");
  assert.equal(await statInFinal('nhl', knies, espn(), null, off), 2, "the league's");
  assert.equal(await statInFinal('nhl', { athlete: '7', propType: 'pts' }, espn(), null, off), 1, "the league's points");
  assert.equal(await statInFinal('nhl', { athlete: '8', propType: 'sog' }, espn(), null, off), 4, 'the away side');
  assert.equal(await statInFinal('nhl', knies, espn(), null, { official: officialLookup({ fetchJson: fetcher(nhlBox('FINAL')), now: at(36e5) }) }), undefined, 'waits');
  const none = officialLookup({ fetchJson: fetcher(null, { game: false }), now: at(NO_OFFICIAL) });
  assert.equal(await statInFinal('nhl', knies, espn(), null, { official: none }), 1, "past NO_OFFICIAL, ESPN's");
  assert.equal(await statInFinal('nhl', knies, espn(), null, { official: none, officialOnly: true }), undefined, 'officialOnly: none');
  assert.equal(await statInFinal('nhl', { athlete: '404', propType: 'sog' }, espn(), null, off), null, 'not in the box: no action');
});

// (the desk's ledger row, as graded on ESPN's count)
const graded = (over = {}) => ({
  id: '401892527:prop:sog:4874919',
  event: '401892527',
  sport: 'nhl',
  start: START,
  market: 'prop',
  propType: 'sog',
  statLabel: 'Shots',
  player: 'Matthew Knies',
  athlete: '4874919',
  side: 'under',
  line: 1.5,
  odds: 115,
  units: 0.5,
  status: 'won',
  profit: 0.575,
  actual: 1,
  final: 'Matthew Knies 1 Shots',
  gradedAt: '2026-10-18T01:59:54.480Z',
  ...over,
});
const deskRun = (bets, state, now, box = nhlBox('OFF')) => ({
  sport: 'nhl',
  cfg: { league: 'hockey/nhl' },
  games: new Map([['401892527', { id: '401892527', final: true, hs: 1, as: 0, home: '29', away: '13', homeAbbr: 'CBJ', awayAbbr: 'NYR', date: START }]]),
  at: new Date(now).toISOString(),
  now: new Date(now),
  state,
  ledger: { bets },
  rows: [],
  facts: {},
  history: [],
  official: officialLookup({ fetchJson: fetcher(box), now }),
});

test("officialRegrade: every shots and points prop once, then the last CORRECT_WINDOW's, graded again by the league's count (Knies' Under 1.5: 1 was a win, 2 a loss)", async () => {
  const summaryOf = async () => espn('1');
  const state = {};
  const knies = graded();
  const old = graded({ id: 'old', athlete: '8', player: 'Mika Zibanejad', side: 'over', line: 3.5, odds: -110, actual: 4, status: 'won', profit: 0.455, final: 'Mika Zibanejad 4 Shots', gradedAt: '2026-10-10T01:00:00Z' });
  const saves = graded({ id: 'saves', propType: 'saves', actual: 20 });
  const log = console.log;
  console.log = () => undefined;
  try {
    await officialRegrade(deskRun([knies, old, saves], state, at(30 * 36e5)), { summaryOf });
  } finally {
    console.log = log;
  }
  assert.equal(knies.actual, 2);
  assert.equal(knies.status, 'lost');
  assert.equal(knies.profit, -0.5);
  assert.equal(knies.final, 'Matthew Knies 2 Shots');
  assert.deepEqual({ ...knies.regraded }, { actual: 1, status: 'won', profit: 0.575, gradedAt: '2026-10-18T01:59:54.480Z', why: "the league's official count" });
  assert.equal(old.regraded, undefined, 'its count stands');
  assert.equal(saves.actual, 20, 'a saves prop untouched');
  assert.equal(state.officialRule, 1, 'the sweep done');
  // (after the sweep: one graded more than CORRECT_WINDOW ago isn't read again; one graded in it is)
  const late = graded({ gradedAt: new Date(at(10 * 36e5)).toISOString() });
  const fresh = graded({ id: 'fresh', gradedAt: new Date(at(29 * 36e5)).toISOString() });
  console.log = () => undefined;
  try {
    await officialRegrade(deskRun([late, fresh], state, at(30 * 36e5)), { summaryOf });
  } finally {
    console.log = log;
  }
  assert.equal(late.actual, 1);
  assert.equal(fresh.actual, 2);
  // (the league's box not official yet: nothing graded again, the sweep not marked done)
  const s2 = {};
  const waiting = graded();
  console.log = () => undefined;
  try {
    await officialRegrade(deskRun([waiting], s2, at(36e5), nhlBox('FINAL')), { summaryOf });
  } finally {
    console.log = log;
  }
  assert.equal(waiting.actual, 1);
  assert.equal(s2.officialRule, undefined);
});

const userBet = (over = {}) => ({ sport: 'nhl', event: '401892527', matchup: 'NYR @ CBJ', market: 'prop', propType: 'sog', athlete: '4874919', player: 'Matthew Knies', statLabel: 'Shots', side: 'under', line: 1.5, odds: 115, stake: 100, pick: 'Matthew Knies Under 1.5 Shots', start: START, status: 'won', profit: 115, final: 'Matthew Knies 1 Shots', ...over });

test('correctionOf: a settled NHL shots or points prop at the count now; the same count, another sport, a game bet or a void stands', () => {
  assert.deepEqual(correctionOf(userBet(), 2), { status: 'lost', profit: -100, final: 'Matthew Knies 2 Shots' });
  assert.deepEqual(correctionOf(userBet({ side: 'over', status: 'lost', profit: -100 }), 2), { status: 'won', profit: 115, final: 'Matthew Knies 2 Shots' });
  assert.deepEqual(correctionOf(userBet({ line: 3.5 }), 2), { status: 'won', profit: 115, final: 'Matthew Knies 2 Shots' }, 'the count moved, the result not: its final');
  assert.equal(correctionOf(userBet(), 1), null);
  assert.equal(correctionOf(userBet({ sport: 'nba', propType: 'pts' }), 2), null);
  assert.equal(correctionOf(userBet({ propType: 'saves' }), 2), null);
  assert.equal(correctionOf(userBet({ market: 'spread' }), 2), null);
  assert.equal(correctionOf(userBet({ status: 'void', profit: 0 }), 2), null);
  assert.equal(correctionOf(userBet(), undefined), null);
});

test("parlayCorrectionOf: a parlay's NHL shots leg graded again, the parlay with it; one still open after, or with no leg moved, stands", () => {
  const legs = [
    { ...userBet(), status: 'won', odds: 115 },
    { sport: 'nfl', event: '1', market: 'spread', side: 'home', line: -3.5, odds: -110, status: 'won' },
  ];
  const parlay = { kind: 'parlay', stake: 10, status: 'won', profit: 35.17, final: '2 of 2 hit', legs };
  const c = parlayCorrectionOf(parlay, [2, undefined]);
  assert.equal(c.result.status, 'lost');
  assert.equal(c.result.profit, -10);
  assert.equal(c.legs[0].status, 'lost');
  assert.equal(c.legs[0].final, 'Matthew Knies 2 Shots');
  assert.equal(c.legs[1], legs[1]);
  assert.equal(parlayCorrectionOf(parlay, [1, undefined]), null);
  // (lost on Knies' 2 with the other leg open; at 1 his leg's won, the other still open: it stands)
  const lostEarly = { ...parlay, status: 'lost', profit: -10, final: '0 of 2 hit', legs: [{ ...legs[0], status: 'lost', final: 'Matthew Knies 2 Shots' }, { ...legs[1], status: 'open' }] };
  assert.equal(parlayCorrectionOf(lostEarly, [1, undefined]), null, 'still open: stands');
});

test('removeFromTally undoes addToTally: the swap leaves the tally as if settled right', () => {
  const bet = { sport: 'nhl', stake: 100, start: START };
  const base = addToTally(null, { sport: 'nfl', stake: 50, start: START }, { status: 'lost', profit: -50 });
  const wrong = addToTally(base, bet, { status: 'won', profit: 115 });
  const fixed = addToTally(removeFromTally(wrong, bet, { status: 'won', profit: 115 }), bet, { status: 'lost', profit: -100 });
  assert.deepEqual(fixed, addToTally(base, bet, { status: 'lost', profit: -100 }));
});
