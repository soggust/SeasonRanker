// The NBA's Heat Maps (apps/nba/scripts/shot-zones.mjs, apps/nba/src/sport/heat-maps.ts, the half-court
// surface): a shot's zone (the restricted area and the lane, mid-range by its angle, a corner three against one
// above the break, two or three by ESPN's word and never the spot's), the clock, the clutch and the rim's fit,
// a hand-made game's shots and the season built from them, every committed file against its contract and its
// size, the surface's cells, and the loaders on real seasons (a shooter, a big, a passer, a team both ways, the
// splits, last season behind a thin zone, the AI preview's matchup maps).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, readJson, staticDir } from './support/engine.mjs';
import { ZONES, FIRST_SEASON, buildHeat, clockSeconds, gameOf, gameShots, isClutch, isThree, rimFit, shotZone } from '../apps/nba/scripts/shot-zones.mjs';

const ENTRY = path.join(import.meta.dirname, 'support', 'nba-heat-entry.ts');
const STATIC = staticDir('nba');
let h;
before(async () => {
  h = await loadEngine('nba', { entry: ENTRY, data: {} });
});

// ---- the binning

test('a shot\'s zone: the rim, the lane, mid-range by angle', () => {
  assert.equal(shotZone(0, 1, false), 'ra', 'a layup');
  assert.equal(shotZone(0, 4, false), 'ra', '4 feet: still the restricted area');
  assert.equal(shotZone(0, 5, false), 'paint', '5 feet straight on: the lane');
  assert.equal(shotZone(3, 2, false, 6), 'paint', "ESPN's own 6 feet over the spot's 3.6");
  assert.equal(shotZone(8, 10, false), 'paint', 'on the lane line: in it');
  assert.equal(shotZone(9, 10, false), 'mid-rw', 'a foot outside it: the right elbow');
  assert.equal(shotZone(-9, 10, false), 'mid-lw');
  assert.equal(shotZone(0, 17, false), 'mid-c', 'the top of the key, inside the arc');
  assert.equal(shotZone(0, 15, false), 'mid-c', 'past the free-throw line');
  assert.equal(shotZone(15, 3, false), 'mid-rb', 'the right baseline');
  assert.equal(shotZone(-15, 3, false), 'mid-lb');
  assert.equal(shotZone(-12, -3, false), 'mid-lb', 'behind the rim: a baseline shot');
  assert.equal(shotZone(12, -3, false), 'mid-rb');
});

test('a three: the corner against above the break, and the arc never overruling the scorer', () => {
  // (the corner's straight line runs 9 feet out from the rim; past it the arc)
  assert.equal(shotZone(-22, 0, true), 'c3-l');
  assert.equal(shotZone(23, 9, true), 'c3-r', '9 feet out: still the corner');
  assert.equal(shotZone(23, 10, true), 'atb-r', '10 feet out: above the break');
  assert.equal(shotZone(-23, 10, true), 'atb-l');
  assert.equal(shotZone(0, 25, true), 'atb-c');
  assert.equal(shotZone(7, 24, true), 'atb-c', 'within 18 degrees of straight on: the top');
  assert.equal(shotZone(12, 22, true), 'atb-r', 'past it: the wing');
  // (two or three by ESPN's word: a three a foot inside the arc by the rounding is a three, a long two on the
  // line a two)
  assert.equal(shotZone(0, 23, true), 'atb-c', 'a three at 23 feet by the spot: a three');
  assert.equal(shotZone(21, 4, true), 'c3-r', 'a corner three a foot in: the corner');
  assert.equal(shotZone(0, 24, false), 'mid-c', 'a two at 24 feet: mid-range');
  assert.equal(shotZone(22, 3, false), 'mid-rb', 'a two with a foot on the corner line');
  // (no word from ESPN: its distance, else the spot)
  assert.equal(shotZone(0, 26, null, 26), 'atb-c');
  assert.equal(shotZone(0, 22, null, 22), 'mid-c');
  assert.equal(shotZone(-22, 2, null), 'c3-l', 'unsaid, in the corner past the line: a three');
  assert.equal(shotZone(0, 25, null), 'atb-c', 'unsaid, past the arc: a three');
  assert.equal(shotZone(0, 23, null), 'mid-c', 'unsaid, inside it: a two');
  assert.equal(shotZone(0, 60, true), null, 'a heave from the backcourt: left out');
});

test("ESPN's word on a three, the clock, the clutch and the rim's place", () => {
  assert.equal(isThree({ pointsAttempted: 3 }), true);
  assert.equal(isThree({ pointsAttempted: 2, text: 'makes 27-foot three point jumper' }), false, 'the points tried first');
  assert.equal(isThree({ text: 'Paul George misses 25-foot 3 point shot' }), true);
  assert.equal(isThree({ text: 'Tony Parker made 26 ft Three Point Jumper.' }), true);
  assert.equal(isThree({ text: 'Antoine Walker made Two Point Jumper.' }), false);
  assert.equal(isThree({ text: 'makes 25-foot running pullup jump shot', scoringPlay: true, scoreValue: 3 }), true, "a make's points");
  assert.equal(isThree({ text: 'misses running pullup jump shot', scoringPlay: false, scoreValue: 0 }), null, 'nothing says');
  assert.deepEqual(['11:45', '0:34', '34.5', '0.0', ''].map(clockSeconds), [705, 34, 34.5, 0, 720]);
  assert.equal(isClutch(4, 300, -5), true, 'the last five minutes of the fourth, within 5');
  assert.equal(isClutch(5, 120, 3), true, 'overtime');
  assert.equal(isClutch(4, 301, 0), false);
  assert.equal(isClutch(3, 30, 0), false);
  assert.equal(isClutch(4, 60, 6), false);
  // (the rim at y 0 or 1 in ESPN's grid, by which fits the "N-foot" distances)
  const at = (ry) => Array.from({ length: 20 }, (_, i) => [0, 1, 0, 25 + (i % 7) - 3, ry + 10 + i, 1, 0, 1, 600, 0, Math.round(Math.hypot((i % 7) - 3, 10 + i))]);
  assert.equal(rimFit(at(0)), 0);
  assert.equal(rimFit(at(1)), 1);
  assert.equal(rimFit(at(1).slice(0, 5)), null, 'too few to say');
});

// A hand-made game: two teams, their players in the box score, a few shots
function summary() {
  const p = (id, text, x, y, made, extra = {}) => ({
    shootingPlay: true,
    text,
    type: { text: 'Jump Shot' },
    coordinate: { x, y },
    scoringPlay: made,
    scoreValue: made ? (extra.three ? 3 : 2) : 0,
    pointsAttempted: extra.three ? 3 : 2,
    participants: [{ athlete: { id: String(id) } }, ...(extra.by ? [{ athlete: { id: String(extra.by) } }] : [])],
    period: { number: extra.period ?? 1 },
    clock: { displayValue: extra.clock ?? '10:00' },
    homeScore: extra.home ?? 0,
    awayScore: extra.away ?? 0,
    team: { id: '1' },
  });
  return {
    header: { competitions: [{ competitors: [{ homeAway: 'home', team: { id: '1' } }, { homeAway: 'away', team: { id: '2' } }] }] },
    boxscore: {
      players: [
        { team: { id: '1' }, statistics: [{ athletes: [{ athlete: { id: '10' } }, { athlete: { id: '11' } }] }] },
        { team: { id: '2' }, statistics: [{ athletes: [{ athlete: { id: '20' } }] }] },
      ],
    },
    plays: [
      p(10, 'A makes layup (B assists)', 25, 1, true, { by: 11, home: 2 }),
      p(10, 'A makes 23-foot three point jumper (B assists)', 2, 3, true, { three: true, by: 11, home: 5 }),
      p(10, 'A misses 26-foot three point jumper', 25, 26, false, { three: true, period: 4, clock: '2:00', home: 100, away: 98 }),
      // (a block: the second named is the blocker, not an assist)
      p(20, "C blocks D's layup", 25, 2, false, { by: 10 }),
      // (ESPN's dummy spot for a free throw, and a free throw at all: left out)
      { ...p(20, 'C makes free throw 1 of 2', -214748340, -214748365, true), type: { text: 'Free Throw - 1 of 2' } },
      p(20, 'C makes 13-foot two point shot', 35, 9, true, { home: 5, away: 2 }),
    ],
  };
}

test("a game's shots and the season built from them: each in its zone, by its shooter, assister, team and the team it was against", () => {
  const g = gameShots(summary(), { d: '20251022', t: 2, h: 'BOS', a: 'NYK' });
  assert.equal(g.s.length, 5, 'four field goals and a block, no free throw');
  assert.deepEqual(
    g.s.map((s) => s[2]),
    [11, 11, 0, 0, 0],
    'the assister only on a make',
  );
  assert.equal(g.s[3][0], 1, "the blocked shot the away side's, by the box score");
  assert.equal(g.s[2][9], 2, 'the margin before the shot');
  // (a final box-scores.mjs left out, its box score empty: its day, part and teams from the summary)
  const s = summary();
  s.header.season = { type: 3 };
  s.header.competitions[0].date = '2014-05-02T23:30Z';
  s.header.competitions[0].competitors[0].team.abbreviation = 'NO';
  s.header.competitions[0].competitors[1].team.abbreviation = 'GS';
  assert.deepEqual(gameOf(s), { d: '20140502', t: 3, h: 'NOP', a: 'GSW' });
  const heat = buildHeat({ season: 2026, games: { 1: g, 2: { ...g, d: '20251024' } } });
  assert.deepEqual(heat.fields.zone, ZONES);
  const zone = (t, id) => (t ? [t[ZONES.indexOf(id) * 2], t[ZONES.indexOf(id) * 2 + 1]] : [0, 0]);
  const a = heat.regular.players['10'];
  assert.deepEqual(zone(a.s, 'ra'), [2, 2]);
  assert.deepEqual(zone(a.s, 'c3-l'), [2, 2]);
  assert.deepEqual(zone(a.s, 'atb-c'), [2, 0]);
  assert.deepEqual(zone(a.c, 'atb-c'), [2, 0], 'the late, close miss: clutch');
  assert.equal(a.am, 4, 'his assisted makes');
  assert.equal(a.g, 2);
  assert.equal(heat.regular.players['11'].a[ZONES.indexOf('c3-l')], 2, "the passer's assists where they became shots");
  assert.deepEqual(zone(heat.regular.offenses.NYK.s, 'mid-rw'), [2, 2], "the away side's shot under its team");
  assert.deepEqual(zone(heat.regular.defenses.BOS.s, 'mid-rw'), [2, 2], '...and against the home side');
  assert.equal(heat.post, null, 'no playoff games');
  assert.deepEqual(zone(heat.l10.players['10'], 'ra'), [2, 2], 'the last 10: both games');
  const sum = (rows) => Object.values(rows).reduce((n, r) => n + (r.s ? r.s.filter((_, i) => i % 2 === 0).reduce((x, y) => x + y, 0) : 0), 0);
  assert.equal(sum(heat.regular.offenses), sum(heat.regular.defenses));
  assert.equal(sum(heat.regular.offenses), sum({ league: heat.regular.league }));
});

// ---- the committed files

const files = () => {
  const out = [];
  const top = path.join(STATIC, 'heat-maps.json');
  if (fs.existsSync(top)) out.push(top);
  for (const y of fs.readdirSync(path.join(STATIC, 'seasons'))) {
    const f = path.join(STATIC, 'seasons', y, 'heat-maps.json');
    if (fs.existsSync(f)) out.push(f);
  }
  return out;
};

test('every heat-maps.json: its contract, its sums and under 300 KB', () => {
  const list = files();
  assert.ok(list.length >= 2, 'the season being played and last season at least');
  for (const f of list) {
    const size = fs.statSync(f).size;
    assert.ok(size < 300 * 1024, `${path.relative(STATIC, f)} is ${Math.round(size / 1024)} KB`);
    const d = readJson(f);
    assert.ok(d.season >= FIRST_SEASON, `${f}: from ${FIRST_SEASON} on`);
    if (!f.endsWith(path.join(STATIC, 'heat-maps.json'))) assert.equal(String(d.season), path.basename(path.dirname(f)));
    assert.deepEqual(d.fields.zone, ZONES);
    assert.ok(d.games > 1050, `${d.season}: a season of games (${d.games})`);
    for (const part of [d.regular, d.post].filter(Boolean)) {
      const tried = (rows) => Object.values(rows).reduce((n, r) => n + (r.s ? r.s.reduce((x, v, i) => x + (i % 2 ? 0 : v), 0) : 0), 0);
      const league = tried({ league: part.league });
      assert.equal(tried(part.offenses), league, `${d.season}: the offenses' shots the league's`);
      assert.equal(tried(part.defenses), league, `${d.season}: the defenses' too`);
      assert.equal(tried(part.players), league, `${d.season}: the players' too`);
      for (const r of Object.values(part.players)) {
        assert.ok(r.s === 0 || r.s.length === ZONES.length * 2);
        if (r.s) r.s.forEach((v, i) => i % 2 && assert.ok(v <= r.s[i - 1], 'made never past tried'));
      }
      // (the share at the rim and from three in an NBA season's range)
      const at = (id) => part.league.s[ZONES.indexOf(id) * 2];
      const rim = at('ra') / league;
      const threes = ZONES.filter((z) => /^(c3|atb)/.test(z)).reduce((n, z) => n + at(z), 0) / league;
      assert.ok(rim > 0.2 && rim < 0.45, `${d.season}: ${Math.round(rim * 100)}% at the rim`);
      assert.ok(threes > 0.12 && threes < 0.5, `${d.season}: ${Math.round(threes * 100)}% threes`);
    }
    assert.ok(Object.keys(d.l10.offenses).length >= (d.season < 2005 ? 29 : 30), `${d.season}: every team`);
  }
});

// ---- the surface

test('the half court: its twelve cells the zones, each drawn', () => {
  const s = h.heatSurface('half-court');
  assert.deepEqual(s.cells.map((c) => c.id), ZONES);
  assert.deepEqual([...h.COURT_ZONES], ZONES);
  for (const c of s.cells) {
    assert.ok(c.points || c.d, c.id);
    assert.ok(c.cx > s.viewBox.x && c.cx < s.viewBox.x + s.viewBox.w && c.cy > s.viewBox.y && c.cy < s.viewBox.y + s.viewBox.h, `${c.id}'s numbers on the court`);
    if (c.points) assert.ok(c.points.split(' ').length >= 3, `${c.id}: a shape`);
  }
  assert.match(s.cells.find((c) => c.id === 'paint').d, /Z.*M.*Z/, 'the paint less the restricted area');
});

// ---- the maps from real seasons

function withFiles(run) {
  return async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const file = path.join(STATIC, String(url).replace(/^data\//, ''));
      return fs.existsSync(file) ? { ok: true, json: async () => readJson(file) } : { ok: false, json: async () => null };
    };
    try {
      await run();
    } finally {
      globalThis.fetch = realFetch;
    }
  };
}

const CURRENT = readJson(path.join(STATIC, 'heat-maps.json')).season;
const curry = { id: 3975, gsisId: 'curryst01', name: 'Stephen Curry', teamLogo: 'assets/NBA_Icons/GSW.svg' };
const gobert = { id: 3032976, gsisId: 'goberru01', name: 'Rudy Gobert', teamLogo: 'assets/NBA_Icons/MIN.svg' };
const okc = { gsisId: 'TM-OKC', name: 'Oklahoma City Thunder', teamLogo: 'assets/NBA_Icons/OKC.svg' };
const q = (player, position, extra = {}) => ({ player, position, season: CURRENT, split: 'regular', stat: null, side: null, ...extra });

test("the NBA's maps from the season's file: a shooter, a big, a passer, a team both ways, the splits", withFiles(async () => {
  const [shots, assists] = h.nbaHeatMaps({ current: (s) => s === CURRENT, live: () => false });
  const c = await shots.load(q(curry, 'PG'));
  assert.equal(c.surface, 'half-court');
  assert.deepEqual(c.cells.map((x) => x.id), h.ZONE_IDS);
  assert.equal(c.stat.key, 'fg', 'FG% first');
  const att = c.cells.reduce((n, x) => n + x.n, 0);
  assert.ok(att > 400, `a season of shots (${att})`);
  const threes = c.cells.filter((x) => /^(c3|atb)/.test(x.id)).reduce((n, x) => n + x.n, 0);
  assert.ok(threes / att > 0.5, "Curry's shots mostly threes");
  assert.ok(c.cells.every((x) => x.league > 0 && x.league < 1), "each zone has the league's FG%");
  assert.equal(c.chips.length, 8, 'the profile: eight numbers');
  assert.equal(c.chipsTitle, 'Shot Profile');
  const freq = await shots.load(q(curry, 'PG', { stat: 'freq' }));
  assert.equal(freq.stat.scale, 'lean');
  assert.ok(Math.abs(freq.cells.reduce((n, x) => n + (x.value ?? 0), 0) - 1) < 1e-9, 'the shares add up to all his shots');
  const pass = await assists.load(q(curry, 'PG'));
  assert.equal(pass.title, 'Assist Map');
  assert.ok(pass.cells.reduce((n, x) => n + x.n, 0) >= 25);
  // (a big: his shots at the rim; few assists, no assist map)
  const big = await shots.load(q(gobert, 'C'));
  const rim = big.cells.find((x) => x.id === 'ra');
  assert.ok(rim.n / big.cells.reduce((n, x) => n + x.n, 0) > 0.5, 'a big at the rim');
  // (Last 10: at most ten games' shots; Clutch: a few)
  const l10 = await shots.load(q(curry, 'PG', { split: 'l10' }));
  assert.ok(l10.cells.reduce((n, x) => n + x.n, 0) < att / 2);
  assert.equal(await assists.load(q(curry, 'PG', { split: 'l10' })), null, 'no assist map for Last 10');
  const clutch = await shots.load(q(curry, 'PG', { split: 'clutch' }));
  assert.ok(clutch.cells.reduce((n, x) => n + x.n, 0) < att / 4);
  // (a team: its offense, and what its defense allowed, flipped)
  const off = await shots.load(q(okc, 'TM', { side: 'offense' }));
  const def = await shots.load(q(okc, 'TM', { side: 'defense' }));
  assert.equal(off.defense, false);
  assert.equal(def.defense, true);
  assert.equal(def.title, 'Shots Allowed by Zone');
  assert.ok(off.cells.reduce((n, x) => n + x.n, 0) > 5000 && def.cells.reduce((n, x) => n + x.n, 0) > 5000);
  assert.equal(await assists.load(q(okc, 'TM', { side: 'defense' })), null);
  // (a coach reads as his team)
  const coach = await shots.load(q({ ...okc, gsisId: 'daignma99c' }, 'HC', { side: 'offense' }));
  assert.deepEqual(coach.cells.map((x) => x.n), off.cells.map((x) => x.n));
  // (the whole season: the regular season and the playoffs added up)
  const whole = await shots.load(q(curry, 'PG', { split: 'all' }));
  assert.ok(whole.cells.reduce((n, x) => n + x.n, 0) >= att);
}));

test('last season behind a thin zone, while the season is under way; the matchup maps', withFiles(async () => {
  const [shots] = h.nbaHeatMaps({ current: (s) => s === CURRENT, live: (s) => s === CURRENT });
  const c = await shots.load(q(gobert, 'C'));
  assert.ok(c.fallback?.length === 12, "last season's zones behind his");
  assert.equal(c.fallbackLabel, `${CURRENT - 2}-${String(CURRENT - 1).slice(2)}`);
  const [quiet] = h.nbaHeatMaps({ current: (s) => s === CURRENT, live: () => false });
  assert.equal((await quiet.load(q(gobert, 'C'))).fallback, undefined, 'a finished season: none');
  // (ESPN's abbreviations, the analysis's, to the site's codes)
  assert.equal(h.siteCode('GS'), 'GSW');
  assert.equal(h.siteCode('BOS'), 'BOS');
  assert.equal(h.teamCodeOf(okc), 'OKC');
  const team = await h.nbaHeatMatchups(okc, 'TM', CURRENT, 'GS', true, false);
  assert.equal(team.length, 2, "its shots against Golden State's D, and theirs against its own");
  assert.equal(team[0].surface, 'half-court');
  assert.equal(team[0].overlayLabel, "GSW's D");
  assert.equal(team[1].defense, true);
  const player = await h.nbaHeatMatchups(curry, 'PG', CURRENT, 'BOS', true, false);
  assert.equal(player.length, 1);
}));
