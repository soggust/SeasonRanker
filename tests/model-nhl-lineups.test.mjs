// The NHL's game-day news (the injury audit, 2026-10-18): the healthy scratches on ESPN's game roster (espn.mjs
// gameRosterOf, context.mjs freshScratches, timing.mjs putInactives and lineupNow), the injury report filled in
// for a team ESPN's leaves out (context.mjs mergeFallback; 2026-10-18 Columbus), and the probable goalies weighed
// across ESPN and DailyFaceoff (context.mjs goalieOf, the game model's blended goalie term, timing.mjs newsMissing
// and the inputs' g part). No network: the facts are made up, shaped like 2026-10-17's NYR @ CBJ final and
// 2026-10-18's CAR @ CGY and CBJ @ MIN pages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameRosterOf, rosterInjuriesOf, rosterNamesOf } from '../libs/ranker/scripts/model/espn.mjs';
import { DRESSED, GOALIE_WORD, SCRATCH_EARLY, LINEUP_HOURS, freshScratches, goalieOf, mergeFallback, startersOf } from '../libs/ranker/scripts/model/context.mjs';
import { inputChanges, inputsOf, lineupNow, newsMissing, putInactives } from '../libs/ranker/scripts/model/timing.mjs';
import { dfoStrength, lineCombinationsOf, nextData, startingGoaliesOf, teamSlug } from '../libs/ranker/scripts/model/dailyfaceoff.mjs';

const MIN = 60e3;
const game = { id: 'g1', home: '30', away: '29', homeAbbr: 'MIN', awayAbbr: 'CBJ', date: '2026-10-18T22:00Z', season: 2027 };

// (a side's roster: 22 entries, the scratched ones flagged; flags false: none of the flags at all, a coming game's
// before its lineup's in)
const entry = (id, x = {}) => ({ playerId: Number(id), displayName: `P${id}`, ...x });
const nhlBody = (scratched = [], { n = 22, flags = true } = {}) => ({ entries: Array.from({ length: n }, (_, i) => entry(100 + i, flags ? { scratched: scratched.includes(String(100 + i)) } : {})) });

test('gameRosterOf (NHL): posted once its entries carry the scratched flag; a coming game’s full roster with none, not', () => {
  assert.equal(LINEUP_HOURS.nhl, 2.5);
  // (2026-10-18, five hours out: CBJ's 26 listed, no flag on any)
  assert.equal(gameRosterOf(nhlBody([], { n: 26, flags: false }), 'nhl'), null);
  // (the final's shape: 22 listed, two scratched, 20 dressed)
  const r = gameRosterOf(nhlBody(['104', '115']), 'nhl', false);
  assert.deepEqual(r.inactive.map((x) => x.id), ['104', '115']);
  assert.equal(r.dressed, 20);
  assert.equal(r.n, 22);
  assert.equal(r.starters, null);
  // (posted with none scratched: kept, an empty list, so a last game's reads empty, not unread)
  const none = gameRosterOf(nhlBody([], { n: 20 }), 'nhl', false);
  assert.deepEqual(none.inactive, []);
  assert.equal(none.dressed, 20);
  // (a count no lineup could have: capped, not posted)
  assert.deepEqual(gameRosterOf(nhlBody(Array.from({ length: 10 }, (_, i) => String(100 + i))), 'nhl').inactive, []);
  // (cut short)
  assert.equal(gameRosterOf(nhlBody(['101'], { n: 10 }), 'nhl'), null);
});

test('freshScratches: tonight’s lineup read whole; the last game’s list early (or it unread) not posted yet; a list past a lineup only its new names', () => {
  assert.equal(SCRATCH_EARLY, 60 * MIN);
  assert.deepEqual(DRESSED, { min: 19, max: 20 });
  const tonight = gameRosterOf(nhlBody(['104', '115']), 'nhl', false);
  const last = gameRosterOf(nhlBody(['104', '115']), 'nhl', false);
  const lastOther = gameRosterOf(nhlBody(['104', '120']), 'nhl', false);
  // (two hours out, the same two as last game: may be the last game's flags, not posted)
  assert.equal(freshScratches(tonight, last, 120 * MIN), null);
  // (the last game's unread, early: not posted)
  assert.equal(freshScratches(tonight, null, 120 * MIN), null);
  // (unlike the last game's: tonight's, posted early, both names, the one scratched again too)
  assert.deepEqual(freshScratches(tonight, lastOther, 120 * MIN).inactive.map((x) => x.id), ['104', '115']);
  // (inside SCRATCH_EARLY: read as it is, the same two again a real repeat)
  assert.deepEqual(freshScratches(tonight, last, 40 * MIN).inactive.map((x) => x.id), ['104', '115']);
  assert.deepEqual(freshScratches(tonight, null, 40 * MIN).inactive.map((x) => x.id), ['104', '115']);
  // (17 dressed of 22: the last game's flags on top of tonight's, only the new names, at any time)
  const union = gameRosterOf(nhlBody(['104', '110', '115', '120', '121']), 'nhl', false);
  assert.equal(union.dressed, 17);
  assert.deepEqual(freshScratches(union, lastOther, 30 * MIN).inactive.map((x) => x.id), ['110', '115', '121']);
  assert.equal(freshScratches(union, null, 30 * MIN), null);
  assert.equal(freshScratches(null, last, 30 * MIN), null);
});

test('putInactives (NHL): a listed day-to-day skater scratched put out; an unlisted regular scratched too (lineupNow by time on ice); a fourth-liner who never plays not', () => {
  // (the last four games: 101 and 102 regulars (15 and 8 minutes), 103 in one of them only)
  const rows = [];
  for (let g = 0; g < 4; g++) {
    const date = `2026-10-1${g}T23:00Z`;
    rows.push({ pid: '101', team: '29', season: 2027, game: `x${g}`, date, pos: 'C', name: 'Regular One', s: { toi: 15, sog: 2 } });
    rows.push({ pid: '102', team: '29', season: 2027, game: `x${g}`, date, pos: 'D', name: 'Regular Two', s: { toi: 8, sog: 0 } });
    if (g === 3) rows.push({ pid: '103', team: '29', season: 2027, game: `x${g}`, date, pos: 'RW', name: 'Spare Part', s: { toi: 6, sog: 0 } });
  }
  const players = lineupNow(rows, 'nhl');
  assert.equal(players.get('101').regular, true);
  assert.equal(players.get('103').regular, false);
  const report = new Map([['29', [{ id: '102', name: 'Regular Two', pos: 'D', status: 'Day-To-Day', date: '2026-10-17T00:00Z' }]], ['30', []]]);
  const l = { injuries: report, gameRosters: new Map([['29', { inactive: [{ id: '101', name: '' }, { id: '102', name: '' }, { id: '103', name: '' }], starters: null, dressed: 20 }]]) };
  const put = putInactives(l, game, players);
  assert.deepEqual(put.map((x) => [x.id, x.was]), [['101', null], ['102', 'Day-To-Day']]);
  const st = Object.fromEntries(l.injuries.get('29').map((x) => [x.id, x.status]));
  assert.deepEqual(st, { 102: 'Out (inactive)', 101: 'Out (inactive)' });
  // (the report itself untouched; the inputs' ina part for the props: the unlisted regular)
  assert.equal(report.get('29')[0].status, 'Day-To-Day');
  const parts = inputsOf('nhl', game, l, null, {}).parts;
  assert.equal(parts['ina:a'], '101');
  assert.equal(parts['out:a'], '102');
  assert.equal(parts['ina:h'], null);
});

test('mergeFallback: a team the report leaves out listed from its roster’s injuries and DailyFaceoff’s off ice, last season’s stale listing dropped (Columbus, 2026-10-18)', () => {
  // (ESPN's CBJ roster: Provorov on injured reserve since 10-01, Brendan Smith since 2026-01-08; Lundestrom on it, unlisted)
  const body = {
    athletes: [
      { position: 'Defense', items: [{ id: '3899939', displayName: 'Ivan Provorov', position: { abbreviation: 'D' }, injuries: [{ status: 'Injured Reserve', date: '2026-10-01T15:21Z' }] }, { id: '3042198', displayName: 'Brendan Smith', position: { abbreviation: 'D' }, injuries: [{ status: 'Injured Reserve', date: '2026-01-08T16:26Z' }] }] },
      { position: 'Centers', items: [{ id: '4233563', displayName: 'Isac Lundeström', position: { abbreviation: 'C' }, injuries: [] }] },
    ],
  };
  const roster = rosterInjuriesOf(body);
  assert.deepEqual(roster.map((x) => x.name), ['Ivan Provorov', 'Brendan Smith']);
  // (DailyFaceoff's CBJ page that day: Lundestrom, Provorov, Fabbro off ice on injured reserve)
  const dfo = lineCombinationsOf({ combinations: { teamName: 'Columbus Blue Jackets', sourceName: 'Last Game (2026-10-17)', updatedAt: '2026-10-18T16:05:17.327Z', players: [
    { name: 'Matthew Knies', jerseyNumber: 89, positionIdentifier: 'lw', groupIdentifier: 'f1', categoryIdentifier: 'ev', injuryStatus: null, gameTimeDecision: false },
    { name: 'Kent Johnson', jerseyNumber: 91, positionIdentifier: 'rw', groupIdentifier: 'f1', categoryIdentifier: 'ev', injuryStatus: null, gameTimeDecision: true },
    { name: 'Isac Lundestrom', jerseyNumber: 21, positionIdentifier: 'ir1', groupIdentifier: 'ir', categoryIdentifier: 'oi', injuryStatus: 'ir' },
    { name: 'Ivan Provorov', jerseyNumber: 9, positionIdentifier: 'ir2', groupIdentifier: 'ir', categoryIdentifier: 'oi', injuryStatus: 'ir' },
    { name: 'Dante Fabbro', jerseyNumber: 15, positionIdentifier: 'ir3', groupIdentifier: 'ir', categoryIdentifier: 'oi', injuryStatus: 'out' },
    { name: 'Zach Werenski', jerseyNumber: 8, positionIdentifier: 'pp1', groupIdentifier: 'pp1', categoryIdentifier: 'pp', injuryStatus: null },
  ] } });
  assert.deepEqual(dfo.lines.map((x) => x.name), ['Matthew Knies', 'Kent Johnson']);
  const list = mergeFallback(roster, dfo, rosterNamesOf(body), Date.UTC(2026, 7, 1));
  assert.deepEqual(list.map((x) => [x.id, x.name, x.status, x.from]), [
    ['3899939', 'Ivan Provorov', 'Injured Reserve', 'espn roster'],
    [null, 'Kent Johnson', 'Day-To-Day', 'dailyfaceoff'],
    ['4233563', 'Isac Lundeström', 'Injured Reserve', 'dailyfaceoff'],
    [null, 'Dante Fabbro', 'Out', 'dailyfaceoff'],
  ]);
  // (DailyFaceoff unread: the roster's own, all of them kept; both unread: null, the team left unlisted)
  assert.deepEqual(mergeFallback(roster, null, rosterNamesOf(body), Date.UTC(2026, 7, 1)).map((x) => x.name), ['Ivan Provorov', 'Brendan Smith']);
  assert.equal(mergeFallback(null, null, new Map()), null);
  assert.equal(rosterInjuriesOf(null), null);
});

test('goalieOf: a confirmed starter from either source beats an expected one; two unconfirmed that differ kept both, not a coin flip', () => {
  assert.deepEqual(GOALIE_WORD, { espn: { expected: 1 }, dfo: { likely: 1.5, unconfirmed: 1 } });
  const wolf = { id: '4697402', name: 'Dustin Wolf', status: 'expected' };
  const cooley = { id: '4319911', name: 'Devin Cooley' };
  // (CGY 2026-10-18 at 16:27 UTC: ESPN expected Wolf, DailyFaceoff unconfirmed Cooley: either, Wolf named at a half)
  const split = goalieOf(wolf, { ...cooley, strength: 'unconfirmed' });
  assert.deepEqual(split, { id: '4697402', name: 'Dustin Wolf', status: 'expected', from: 'espn', split: true, alt: { id: '4319911', name: 'Devin Cooley' }, share: 0.5 });
  // (16:35: DailyFaceoff's Cooley confirmed: him, over ESPN's expected Wolf)
  assert.deepEqual(goalieOf(wolf, { ...cooley, strength: 'confirmed' }), { id: '4319911', name: 'Devin Cooley', status: 'confirmed', from: 'dailyfaceoff' });
  // (CAR: ESPN expected Bussi, DailyFaceoff confirmed him: confirmed)
  assert.equal(goalieOf({ id: '1', name: 'Brandon Bussi', status: 'expected' }, { id: '1', name: 'Brandon Bussi', strength: 'confirmed' }).status, 'confirmed');
  // (MIN: both say Wallstedt, ESPN confirmed; CBJ: both Talbot, neither: expected, one goalie)
  assert.deepEqual(goalieOf({ id: '2', name: 'Jesper Wallstedt', status: 'confirmed' }, { id: null, name: 'Jesper Wallstedt', strength: 'confirmed' }), { id: '2', name: 'Jesper Wallstedt', status: 'confirmed', from: 'both' });
  assert.equal(goalieOf({ id: '3', name: 'Cam Talbot', status: 'expected' }, { id: '3', name: 'Cam Talbot', strength: 'unconfirmed' }).split, undefined);
  // (ESPN confirmed beats DailyFaceoff's unconfirmed other one)
  assert.equal(goalieOf({ ...wolf, status: 'confirmed' }, { ...cooley, strength: 'unconfirmed' }).id, wolf.id);
  // (DailyFaceoff's Likely over ESPN's expected: Cooley named at 0.6, Wolf the other)
  const likely = goalieOf(wolf, { ...cooley, strength: 'likely' });
  assert.deepEqual([likely.id, likely.share, likely.alt.id, likely.split], [cooley.id, 0.6, wolf.id, true]);
  // (both confirmed, differing: a half each)
  assert.equal(goalieOf({ ...wolf, status: 'confirmed' }, { ...cooley, strength: 'confirmed' }).share, 0.5);
  // (one source alone: its; DailyFaceoff's alone needs his ESPN id; none: null)
  assert.equal(goalieOf(null, { ...cooley, strength: 'likely' }).status, 'expected');
  assert.equal(goalieOf(null, { id: null, name: 'Nobody Known', strength: 'confirmed' }), null);
  assert.equal(goalieOf(wolf, null).id, wolf.id);
  assert.equal(goalieOf(null, null), null);
  // (DailyFaceoff's other goalie not found on the roster: kept by name, his quality an average goalie's)
  assert.deepEqual(goalieOf(wolf, { id: null, name: 'Call Up', strength: 'unconfirmed' }).alt, { id: null, name: 'Call Up' });
});

test('the split goalie: the game model’s term the blend of the two (a soft term), flagged; the bets wait for the news; the inputs see it settle', () => {
  // (three finals: Wolf saving well (2 of 30), Cooley poorly (5 of 30), each starting; the coming game split)
  const facts = { games: { f1: { h: [['W', 30, 2]], a: [['X', 30, 3]] }, f2: { h: [['C', 30, 5]], a: [['X', 30, 3]] }, f3: { h: [['W', 30, 2]], a: [['X', 30, 3]] } } };
  const finals = ['f1', 'f2', 'f3'].map((id, i) => ({ id, home: '3', away: '7', homeAbbr: 'CGY', awayAbbr: 'CAR', final: true, season: 2027, date: `2026-10-1${i}T00:00Z` }));
  const coming = { id: 'g2', home: '3', away: '7', homeAbbr: 'CGY', awayAbbr: 'CAR', final: false, season: 2027, date: '2026-10-19T00:00Z' };
  const read = (home) => {
    const live = new Map([['g2', { injuries: new Map(), home, away: { id: 'X', name: 'Bussi', status: 'confirmed' } }]]);
    const of = startersOf('nhl', {}, facts, live);
    for (const g of finals) of(g).learn();
    return of(coming);
  };
  const wolf = read({ id: 'W', name: 'Wolf', status: 'expected' });
  const cooley = read({ id: 'C', name: 'Cooley', status: 'confirmed' });
  const split = read({ id: 'W', name: 'Wolf', status: 'expected', split: true, alt: { id: 'C', name: 'Cooley' }, share: 0.5 });
  assert.ok(wolf.info.saved[0] > cooley.info.saved[0]);
  assert.equal(split.info.saved[0], Math.round(((wolf.info.saved[0] + cooley.info.saved[0]) / 2) * 1000) / 1000);
  assert.ok(split.terms.goalie < wolf.terms.goalie && split.terms.goalie > cooley.terms.goalie);
  assert.equal(split.info.home, 'Wolf or Cooley');
  assert.deepEqual(split.flags, ['goalie unsettled (CGY): Wolf or Cooley, the sources split']);
  assert.deepEqual(wolf.flags, []);
  // (Cooley out: Wolf alone, no blend)
  const live = new Map([['g2', { injuries: new Map([['3', [{ id: 'C', name: 'Cooley', status: 'Out' }]]]), home: { id: 'W', name: 'Wolf', status: 'expected', split: true, alt: { id: 'C', name: 'Cooley' }, share: 0.5 }, away: { id: 'X', name: 'Bussi', status: 'confirmed' } }]]);
  const of = startersOf('nhl', {}, facts, live);
  for (const g of finals) of(g).learn();
  assert.equal(of(coming).info.saved[0], wolf.info.saved[0]);
  // (the bets wait for it till the last chance; settled, they don't)
  const l = { home: { id: 'W', name: 'Wolf', status: 'expected', split: true, alt: { id: 'C', name: 'Cooley' }, share: 0.5 }, away: { id: 'X', name: 'Bussi', status: 'confirmed' } };
  assert.deepEqual(newsMissing('nhl', l, { kind: 'props', home: false }), ['the starting goalies unsettled (the sources split)']);
  assert.deepEqual(newsMissing('nhl', { ...l, home: { id: 'C', name: 'Cooley', status: 'confirmed' } }, { kind: 'lines' }), []);
  // (the inputs: the split its own value; settled on Cooley, a change the bet's priced again on)
  const g = { ...coming };
  const was = inputsOf('nhl', g, l, null, {});
  assert.equal(was.parts['g:h'], 'W or C');
  const now = inputsOf('nhl', g, { ...l, home: { id: 'C', name: 'Cooley', status: 'confirmed' } }, null, {});
  assert.equal(now.parts['g:h'], 'C confirmed');
  const ch = inputChanges(was.hash, now, { game: g, names: now.names });
  assert.deepEqual(ch.map((x) => x.words), ['CGY goalie (Cooley confirmed)']);
  const back = inputChanges(now.hash, was, { game: g, names: was.names });
  assert.deepEqual(back.map((x) => x.words), ['CGY goalie (Wolf or Cooley)']);
});

test('DailyFaceoff: its page data read, the goalies’ words and the team slugs', () => {
  const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { data: [{ dateGmt: '2026-10-19T00:00:00.000Z', homeTeamName: 'Calgary Flames', homeGoalieName: 'Devin Cooley', homeNewsStrengthName: null, awayTeamName: 'Carolina Hurricanes', awayGoalieName: 'Brandon Bussi', awayNewsStrengthName: 'Confirmed', awayNewsDetails: 'Bussi will start Sunday in Calgary.', awayNewsCreatedAt: '2026-10-18T13:53:43.008Z' }] } } })}</script></html>`;
  const g = startingGoaliesOf(nextData(html));
  assert.deepEqual(g[0].home, { team: 'Calgary Flames', name: 'Devin Cooley', strength: 'unconfirmed', said: null, at: null });
  assert.equal(g[0].away.strength, 'confirmed');
  assert.equal(nextData('<html>moved</html>'), null);
  assert.equal(startingGoaliesOf(null), null);
  assert.deepEqual(['Confirmed', 'Likely', 'Unconfirmed', null].map(dfoStrength), ['confirmed', 'likely', 'unconfirmed', 'unconfirmed']);
  assert.equal(teamSlug('Columbus Blue Jackets'), 'columbus-blue-jackets');
  assert.equal(teamSlug('Montréal Canadiens'), 'montreal-canadiens');
  assert.equal(teamSlug('St. Louis Blues'), 'st-louis-blues');
});
