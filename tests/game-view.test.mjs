// The game view read from ESPN's summary (tests/support/card-entry.ts, its fetch stubbed): a tie and how
// the line came out, two teams in the same color told apart, a game to come with nothing played, a summary
// missing its parts; and the logos and looks it draws (the Rams' own logo, each team's look by ESPN's id).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const ENTRY = path.join(import.meta.dirname, 'support', 'card-entry.ts');
let nfl;
const realFetch = globalThis.fetch;
before(async () => {
  nfl = await loadEngine('nfl', { entry: ENTRY, data: {} });
});
after(() => {
  globalThis.fetch = realFetch;
});

// (ESPN's summary for the next loadGame, or a failed request)
function serve(summary, status = 200) {
  globalThis.fetch = async () => ({ ok: status === 200, status, json: async () => summary });
}

const team = (homeAway, abbreviation, color, extra = {}) => ({
  homeAway,
  team: { id: abbreviation, abbreviation, displayName: `${abbreviation} Team`, color, logos: [{ href: `https://a.espncdn.com/i/teamlogos/nfl/500/${abbreviation.toLowerCase()}.png` }], ...extra.team },
  ...extra,
});

test("a tie: no winner, the line's underdog covered and the total under; overtime named", async () => {
  serve({
    header: {
      week: 6,
      competitions: [
        {
          date: '2026-10-18T17:00Z',
          status: { type: { detail: 'Final/OT', completed: true, state: 'post' } },
          competitors: [
            team('away', 'KC', 'e31837', { score: '20', linescores: [7, 3, 7, 3, 0].map((n) => ({ displayValue: String(n) })) }),
            team('home', 'BUF', '00338d', { score: '20', linescores: [0, 10, 3, 7, 0].map((n) => ({ displayValue: String(n) })) }),
          ],
        },
      ],
    },
    pickcenter: [{ provider: { name: 'DraftKings' }, details: 'KC -3', overUnder: 40.5 }],
  });
  const g = await nfl.loadGame('football/nfl', '1');
  assert.equal(g.away.winner, false);
  assert.equal(g.home.winner, false);
  assert.deepEqual(g.periodLabels, ['1', '2', '3', '4', 'OT']);
  assert.equal(g.label, 'Week 6');
  assert.equal(g.line.spread, 'BUF covered', 'the favorite by 3 tied: the underdog covered');
  assert.equal(g.line.total, 'Under');
  assert.equal(g.preview, false);
  // (nothing else in the summary: empty, not broken)
  assert.deepEqual([g.plays, g.box, g.leaders, g.teamStats, g.fantasy, g.injuries, g.form, g.videos], [[], [], [], [], [], [], [], []]);
  assert.equal(g.chart, null);
  assert.equal(g.venue, null);
  assert.equal(g.winProbability, null);
});

test("two teams in the same color: the home side takes its other color, the away side keeps its own (team-look.ts)", async () => {
  serve({
    header: {
      competitions: [
        {
          status: { type: { completed: true } },
          competitors: [team('away', 'CAR', 'c8102e', { score: '3' }), team('home', 'FLA', 'c8102e', { score: '2' })],
        },
      ],
    },
  });
  const g = await nfl.loadGame('hockey/nhl', '2');
  // (the Hurricanes' and the Panthers' looks, found by their abbreviations)
  assert.equal(g.away.look.key, 'CAR.svg');
  assert.equal(g.home.look.key, 'FLA.svg');
  assert.equal(g.away.color, g.away.look.accent);
  assert.ok(nfl.distance(g.away.color, g.home.color) >= nfl.TOO_CLOSE, `${g.away.color} and ${g.home.color} look alike`);
  assert.equal(g.home.color, g.home.look.other, 'its other color');
  assert.deepEqual(g.periodLabels, []);
});

test('a game to come: its preview, the line without a result, no score', async () => {
  serve({
    header: {
      competitions: [
        {
          date: '2026-10-25T20:25Z',
          status: { type: { detail: 'Sun, October 25th at 4:25 PM EDT', completed: false, state: 'pre' } },
          competitors: [team('away', 'LAR', '003594'), team('home', 'SF', 'aa0000')],
        },
      ],
    },
    pickcenter: [{ details: 'SF -2.5', overUnder: 47.5 }],
    predictor: { homeTeam: { id: 'SF', gameProjection: '55.1' }, awayTeam: { id: 'LAR', gameProjection: '44.9' } },
  });
  const g = await nfl.loadGame('football/nfl', '3');
  assert.equal(g.preview, true);
  assert.equal(g.away.score, '');
  assert.deepEqual(g.line, { book: null, details: 'SF -2.5', overUnder: 47.5, spread: null, total: null });
  assert.deepEqual(g.predictor, { away: 0.449, home: 0.551 });
  // (the Rams' logo: the app's own yellow one, their blue LA vanishing on their blue)
  assert.equal(g.away.logo, 'assets/NFL_Icons/hd/Rams.png');
});

test("a summary without its teams, or ESPN's request failing: an error (the view says it couldn't be found)", async () => {
  serve({ header: { competitions: [{}] } });
  await assert.rejects(nfl.loadGame('football/nfl', '4'), /no teams/);
  serve({}, 404);
  await assert.rejects(nfl.loadGame('football/nfl', '5'), /404/);
});

test("logos: the Rams' ESPN logos swapped for the app's own, everyone else's kept", () => {
  const { ownLogo } = nfl;
  for (const href of ['https://a.espncdn.com/i/teamlogos/nfl/500/lar.png', 'https://a.espncdn.com/i/teamlogos/nfl/500-dark/lar.png', 'https://a.espncdn.com/i/teamlogos/nfl/500/scoreboard/lar.png']) {
    assert.equal(ownLogo(href), 'assets/NFL_Icons/hd/Rams.png', href);
  }
  assert.equal(ownLogo('https://a.espncdn.com/i/teamlogos/nfl/500/lac.png'), 'https://a.espncdn.com/i/teamlogos/nfl/500/lac.png');
  assert.equal(ownLogo('https://a.espncdn.com/i/teamlogos/nhl/500/la.png'), 'https://a.espncdn.com/i/teamlogos/nhl/500/la.png');
  assert.equal(ownLogo(undefined), null);
  assert.equal(ownLogo(''), null);
});

test("each team's look by ESPN's id, that season's era (team-look.ts); a team the site doesn't know, a neutral one", () => {
  const { teamLook } = nfl;
  // (the Rams by their ESPN id, today's and 2010's: that era's own logo)
  assert.equal(teamLook('nfl', { id: '14' }).key, 'Rams.png');
  assert.equal(teamLook('nfl', { id: '14' }, 2010).key, 'eras/Rams-2000.png');
  assert.equal(teamLook('nfl', { abbr: 'LAR' }).key, 'Rams.png');
  // (by its logo, as a row has it, and that row's season)
  assert.equal(teamLook('nfl', 'assets/NFL_Icons/Rams.png', 2010).logo, 'assets/NFL_Icons/eras/Rams-2000.png');
  const unknown = teamLook('nfl', { id: '999' });
  assert.equal(unknown.key, null);
  assert.ok(/^#[0-9a-f]{6}$/.test(unknown.face));
  // (two the site doesn't know: still told apart)
  assert.ok(nfl.distance(...nfl.sideColors(unknown, unknown)) >= nfl.TOO_CLOSE);
});

test("the win probability's game time: each point's play by its id (the NFL's in its drives), the one before's where it's missing, none before the first", async () => {
  const play = (id, period, clock, awayScore, homeScore) => ({ id, text: 'a play', period: { number: period }, clock: { displayValue: clock }, awayScore, homeScore });
  serve({
    header: { competitions: [{ status: { type: { detail: 'Final', completed: true, state: 'post' } }, competitors: [team('away', 'IND', '003b75', { score: '20' }), team('home', 'WAS', '5a1414', { score: '17' })] }] },
    drives: { previous: [{ plays: [play('11', 1, '15:00', 0, 0), play('12', 3, '8:42', 14, 10)] }, { plays: [play('13', 5, '2:05', 20, 17)] }] },
    winprobability: [
      { homeWinPercentage: 0.43, playId: '1' },
      { homeWinPercentage: 0.45, playId: '11' },
      { homeWinPercentage: 0.4, playId: '12' },
      { homeWinPercentage: 0.41, playId: '99' },
      { homeWinPercentage: 0, playId: '13' },
    ],
  });
  const g = await nfl.loadGame('football/nfl', '6');
  assert.equal(g.winMoments.length, g.winProbability.length, 'in step with the points');
  assert.deepEqual(g.winMoments, [
    null,
    { when: 'Q1 15:00', away: 0, home: 0 },
    { when: 'Q3 8:42', away: 14, home: 10 },
    { when: 'Q3 8:42', away: 14, home: 10 },
    { when: 'OT 2:05', away: 20, home: 17 },
  ]);
  // (no play found at all, or no win probability: none)
  assert.equal(nfl.wpMoments('football/nfl', { winprobability: [{ homeWinPercentage: 0.5, playId: '1' }], plays: [] }), null);
  assert.equal(nfl.wpMoments('football/nfl', {}), null);
});

test("a play's moment in each sport: quarters, periods, half innings, overtimes and the shootout", () => {
  const { momentLabel } = nfl;
  const at = (number, clock, extra = {}) => ({ period: { number, ...extra }, clock: clock === undefined ? undefined : { displayValue: clock } });
  assert.equal(momentLabel('basketball/nba', at(2, '43.8')), 'Q2 43.8');
  assert.equal(momentLabel('basketball/nba', at(6, '1:10')), '2OT 1:10');
  assert.equal(momentLabel('football/nfl', at(4, '0:02')), 'Q4 0:02');
  assert.equal(momentLabel('hockey/nhl', at(2, '12:10')), 'P2 12:10');
  assert.equal(momentLabel('hockey/nhl', at(4, '3:05')), 'OT 3:05');
  assert.equal(momentLabel('hockey/nhl', at(5, '0:00')), 'SO', "a regular season's fifth: the shootout");
  assert.equal(momentLabel('hockey/nhl', at(5, '14:30'), true), '2OT 14:30', "the playoffs': a second overtime");
  assert.equal(momentLabel('baseball/mlb', at(6, undefined, { type: 'Top' })), 'Top 6th');
  assert.equal(momentLabel('baseball/mlb', at(11, undefined, { type: 'Bottom' })), 'Bot 11th');
  assert.equal(momentLabel('baseball/mlb', at(3, undefined, { type: 'end' })), 'End 3rd');
  // (no clock: just the period; no period: nothing)
  assert.equal(momentLabel('football/nfl', at(3)), 'Q3');
  assert.equal(momentLabel('football/nfl', { clock: { displayValue: '1:00' } }), null);
});

test("the line's head as it draws: straight across, a play's worth each step, between two plays partway", () => {
  const { lineHead } = nfl;
  const points = [0.5, 0.5, 1];
  assert.deepEqual(lineHead(points, 0), { x: 0, y: 100, i: 0 });
  assert.deepEqual(lineHead(points, 1), { x: 1000, y: 0, i: 2 });
  assert.deepEqual(lineHead(points, 0.2), { x: 200, y: 100, i: 0 });
  assert.deepEqual(lineHead(points, 0.75), { x: 750, y: 50, i: 2 });
  // (past either end: held there)
  assert.deepEqual(lineHead(points, 1.2), lineHead(points, 1));
  assert.deepEqual(lineHead(points, -1), lineHead(points, 0));
  // (one point, or none)
  assert.deepEqual(lineHead([0.7], 0.5).i, 0);
  assert.equal(lineHead([], 0.5).y, 100);
});
