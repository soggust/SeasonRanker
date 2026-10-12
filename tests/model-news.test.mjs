// The teams' news (libs/ranker/scripts/model/news.mjs): a story on a change of play-caller, coordinator or head
// coach (or a benching) flags its team's unit for its next 2 games: the unit's props CHECKs either side (cause
// 'news', props.mjs), the game's lines at the minimum stake (run.mjs), an open bet priced again (timing.mjs
// inputsOf); an owner's note with no player on a team the same (notes.mjs teamNotes). And a new head coach's
// first games as context (football.mjs newCoach, coachMid; props.mjs CTX newCoach).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NEWS_GAMES, flagsFor, newsFlags, newsOn, newsWords, readNews, storyOf, unitOf } from '../libs/ranker/scripts/model/news.mjs';
import { teamNotes } from '../libs/ranker/scripts/model/notes.mjs';
import { inputChanges, inputsOf } from '../libs/ranker/scripts/model/timing.mjs';
import { CHECK_KINDS, checkOf, checkSummary } from '../libs/ranker/scripts/model/checks.mjs';
import { diagnose } from '../libs/ranker/scripts/model/check-learn.mjs';
import { COACH_GAMES, footballOf } from '../libs/ranker/scripts/model/football.mjs';
import { CTX } from '../libs/ranker/scripts/model/props.mjs';

const DEN = { id: '7', nick: 'Broncos', name: 'Denver Broncos' };

test('unitOf: play-calling, coordinators, a head coach fired or interim, benchings; talk of a change and the rest not', () => {
  assert.equal(unitOf('nfl', "Sean Payton says he's taking over playcalling for Broncos' offense"), 'offense');
  assert.equal(unitOf('nfl', "Broncos OC Davis Webb says 'not ideal' to lose playcalling duties"), 'offense');
  assert.equal(unitOf('nfl', "Texans' DeMeco Ryans taking over defensive playcalling duties"), 'defense');
  assert.equal(unitOf('nfl', 'Jets fire offensive coordinator after 1-4 start'), 'offense');
  assert.equal(unitOf('nfl', 'Raiders name Antonio Pierce interim head coach'), 'team');
  assert.equal(unitOf('nfl', 'Panthers fire head coach Frank Reich'), 'team');
  assert.equal(unitOf('nfl', 'Giants bench Daniel Jones; Tommy DeVito to start'), null);
  assert.equal(unitOf('nfl', 'Steelers: Kenny Pickett benched for Mitch Trubisky'), 'offense');
  assert.equal(unitOf('nfl', 'Cornerback benched after penalties, defense reshuffled'), 'defense');
  assert.equal(unitOf('nfl', 'Mason Rudolph takes over as starting quarterback'), 'offense');
  // (talk, not a change; a takeover with no role; none at all)
  assert.equal(unitOf('nfl', "Chargers OC McDaniel: Calls for firing come 'with the territory'"), null);
  assert.equal(unitOf('nfl', 'Should the Jets fire their head coach?'), null);
  assert.equal(unitOf('nfl', 'Bills take over first place in the AFC East'), null);
  assert.equal(unitOf('nfl', 'Broncos get good news on Pat Surtain II ankle'), null);
  // (another sport: a head coach's or manager's change alone)
  assert.equal(unitOf('mlb', 'Manager Dan Wilson fired as Seattle Mariners finish 76-86'), 'team');
  assert.equal(unitOf('nba', 'Lakers take over playcalling duties'), null);
});

test("storyOf: the team's own story (two teams tagged at most, its name in it), news or a story, not a recap or a video", () => {
  const a = { id: 1, type: 'HeadlineNews', published: '2026-10-08T23:08:17Z', headline: "Sean Payton says he's taking over playcalling for Broncos' offense", categories: [{ type: 'team', teamId: 7 }] };
  assert.deepEqual(storyOf('nfl', a, DEN), { id: '1', unit: 'offense', headline: a.headline, at: '2026-10-08T23:08:17.000Z' });
  assert.equal(storyOf('nfl', { ...a, type: 'Media' }, DEN), null);
  assert.equal(storyOf('nfl', { ...a, type: 'Recap' }, DEN), null);
  assert.equal(storyOf('nfl', { ...a, categories: [7, 1, 2].map((teamId) => ({ type: 'team', teamId })) }, DEN), null);
  assert.equal(storyOf('nfl', a, { id: '1', nick: 'Falcons', name: 'Atlanta Falcons' }), null);
  assert.equal(storyOf('nfl', { ...a, headline: 'Payton takes over playcalling', description: 'Denver changes course' }, DEN), null);
});

const day = (d, h = 17) => Date.parse(`2026-10-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00Z`);
const iso = (t) => new Date(t).toISOString();

test("flagsFor: a unit's next NEWS_GAMES games, counted from the episode's first story; a later story the same news till that many games pass", () => {
  assert.equal(NEWS_GAMES, 2);
  const starts = [day(4), day(11), day(19), day(26)];
  const stories = [
    { id: 'a', unit: 'offense', headline: 'Payton taking over playcalling', at: iso(day(8)) },
    { id: 'b', unit: 'offense', headline: "Broncos beat Chargers in Payton's return to playcalling", at: iso(day(12, 2)) },
  ];
  // (the game on the 11th its first, the 19th its second (the story after the 11th's game the same news), the
  // 26th past it)
  assert.deepEqual(flagsFor(stories, starts, day(11)).map((x) => [x.unit, x.id]), [['offense', 'a']]);
  const second = flagsFor(stories, starts, day(19));
  assert.deepEqual(second.map((x) => [x.unit, x.id, x.since]), [['offense', 'b', iso(day(8))]]);
  assert.deepEqual(flagsFor(stories, starts, day(26)), []);
  // (a story after its game alone: the next game the first)
  assert.equal(flagsFor([stories[1]], starts, day(26)).length, 1);
  // (a story too old, by NEWS_DAYS, none; one after the game, none for it)
  assert.deepEqual(flagsFor([{ ...stories[0], at: '2026-09-01T00:00:00Z' }], [], day(11)), []);
  assert.deepEqual(flagsFor([{ ...stories[0], at: iso(day(12)) }], starts, day(11)), []);
});

test("newsFlags and newsOn: a coming game's flags on its live facts; the offense's players flagged, a defender not; the team's every player; its inputs and their change", () => {
  const game = { id: 'g', date: iso(day(19)), home: '7', away: '24', homeAbbr: 'DEN', awayAbbr: 'LAC' };
  const live = new Map([['g', { newsRead: true }]]);
  const news = new Map([
    ['7', [{ id: 'a', unit: 'offense', headline: 'Payton taking over playcalling', at: iso(day(8)) }]],
    ['24', []],
  ]);
  const history = [{ id: 'h1', date: iso(day(11)), home: '7', away: '24' }];
  assert.equal(newsFlags(news, live, history, [{ game }]), 1);
  const l = live.get('g');
  assert.equal(newsOn('nfl', l, '7', 'WR').headline, 'Payton taking over playcalling');
  assert.equal(newsOn('nfl', l, '7', 'CB'), null);
  assert.equal(newsOn('nfl', l, '24', 'QB'), null);
  assert.deepEqual(newsWords(l, (t) => (t === '7' ? 'DEN' : 'LAC')), ['news (DEN offense): Payton taking over playcalling']);
  // (none read: no flags, the desk as it was)
  assert.equal(newsFlags(null, new Map([['g', {}]]), history, [{ game }]), 0);
  // (inputs: the flag a side's part; a story landing a change, the news unread then and none now not)
  const before = inputsOf('nfl', game, { newsRead: true }, null, { nflverse: false });
  const after = inputsOf('nfl', game, l, null, { nflverse: false });
  assert.equal(before.parts['news:h'], '');
  assert.equal(after.parts['news:h'], 'offense:a');
  assert.deepEqual(inputChanges(before.hash, after, { game }).map((x) => x.words), ['DEN news flags (offense)']);
  const unread = inputsOf('nfl', game, {}, null, { nflverse: false });
  assert.equal(unread.parts['news:h'], null);
  assert.deepEqual(inputChanges(unread.hash, before, { game }), []);
  // (a bet from before the part was: not a change)
  const { 'news:h': _h, 'news:a': _a, ...old } = before.hash;
  assert.deepEqual(inputChanges(old, after, { game }), []);
});

test("teamNotes: a note with no player, news or other, flags its team for the game; a player's note, another reason or no team, none; the note's words never in", () => {
  const game = { id: '401', date: iso(day(19)), home: '7', away: '24' };
  const live = new Map([['401', {}]]);
  const notes = new Map([
    ['401:spread', { id: '401:spread', reason: 'news', player: null, team: '7', note: 'secret words', at: '2026-10-12T00:00:00Z' }],
    ['401:total', { id: '401:total', reason: 'weather', player: null, team: '24' }],
    ['401:prop:recYds:9', { id: '401:prop:recYds:9', reason: 'other', player: null, team: null }],
    ['401:prop:rushYds:5', { id: '401:prop:rushYds:5', reason: 'news', player: '5', status: 'out', team: '24' }],
    ['999:spread', { id: '999:spread', reason: 'news', player: null, team: '7' }],
  ]);
  const checks = [{ id: '401:prop:recYds:9', team: '24' }];
  const applied = teamNotes('nfl', live, [{ game }], notes, { checks });
  assert.deepEqual(applied.map((x) => [x.id, x.team]), [['401:spread', '7'], ['401:prop:recYds:9', '24']]);
  const l = live.get('401');
  assert.equal(newsOn('nfl', l, '7', 'QB').from, 'owner note');
  assert.equal(newsOn('nfl', l, '24', 'CB').unit, 'team');
  assert.ok(!JSON.stringify(l.news).includes('secret'));
});

test("a news CHECK: its cause and unit kept, tallied apart, diagnosed as the news's", () => {
  const bet = { id: 'g:prop:recYds:1', start: '2030-01-01T18:00Z', placedAt: '2029-12-31T12:00Z', market: 'prop', propType: 'recYds', side: 'over', line: 50.5, odds: -110, model: 0.62, fair: 0.5, units: 1, intent: 'action' };
  const c = checkOf(bet, { skip: true, kind: 'news', news: 'offense', why: 'news (offense): Payton taking over playcalling' });
  assert.ok(CHECK_KINDS.has('news'));
  assert.equal(c.cause, 'news');
  assert.equal(c.newsUnit, 'offense');
  assert.equal(c.units, 0);
  assert.equal(c.reason, 'news (offense): Payton taking over playcalling');
  assert.equal(checkSummary([c]).byCause.news.n, 1);
  assert.equal(diagnose(c)?.cause, 'news');
});

test('priceProps: a flagged unit\'s player a CHECK either side (cause news), ahead of the role and the gap; a defender\'s flag leaves the offense; no flag as before', async () => {
  const { priceProps, STATS } = await import('../libs/ranker/scripts/model/props.mjs');
  const st = STATS.nfl.find((s) => s.key === 'rushYds');
  const matchups = { live: () => ({ vacs: [0, 0, 0], vac: 0, snap: { latest: 0.7, avg: 0.7, n: 3 } }), qb1: () => ({ id: 'q', v: 30 }), absent: () => new Map(), regulars: () => [] };
  const project = () => ({ mu: 50, rate: 50, recent: 50, base: 50, opp: 1, posOpp: 1, roleOpp: null, role: null, funnel: null, funnelF: 1, paceF: 1, tgtF: 1, vac: 0, vacHist: 0, vacF: 1, games: 4, prevGames: 16 });
  const usual = [[2026, 40], [2026, 45], [2026, 55], [2026, 60]];
  const fitted = { rushYds: { stat: st, env: { mean: 50, avg: 1 }, model: { project, roleTable: () => [] }, values: new Map(['a'].map((id) => [id, usual])), matchups, params: { r: 6, a: 1, b: 0, scale: 1 }, snapGap: null } };
  const idx = { pid: (a) => a.id, pos: () => 'RB', name: (id) => `N${id}` };
  const gameRow = { id: 'g', date: '2026-10-19T17:00Z', season: 2026, home: '1', away: '2', homeAbbr: 'H', awayAbbr: 'A' };
  const rosterSet = new Set(['a', 'q']);
  rosterSet.out = new Map();
  const base = { injuries: new Map([['1', []]]), rosters: new Map([['1', rosterSet]]) };
  const prop = (line) => ({ athlete: { id: 'a', name: 'A', team: '1' }, stat: st, line, open: null, prices: { over: -110, under: -110 } });
  const price = (live, line = 50.5) => priceProps('nfl', gameRow, [prop(line)], fitted, idx, { homePts: 24, awayPts: 21 }, null, live, {}, 0.1).priced[0];
  assert.equal(price(base).guard?.kind, undefined);
  const flagged = { ...base, news: [{ team: '1', unit: 'offense', headline: 'Coach takes over playcalling', id: 'x', from: 'espn' }] };
  for (const line of [45.5, 50.5, 55.5]) {
    const x = price(flagged, line);
    assert.equal(x.guard.kind, 'news');
    assert.equal(x.guard.news, 'offense');
    assert.equal(x.guard.why, 'news (offense): Coach takes over playcalling');
    // (the CHECK's side the model's)
    assert.equal(x.side, x.projection.pOver >= 0.5 ? 'over' : 'under');
  }
  assert.equal(price({ ...base, news: [{ team: '1', unit: 'defense', headline: 'DC fired', id: 'y' }] }).guard?.kind, undefined);
  assert.equal(price({ ...base, news: [{ team: '2', unit: 'team', headline: 'interim', id: 'z' }] }).guard?.kind, undefined);
});

test('readNews: each team read once a UTC day, its flagged stories kept by id; a failed feed keeps what was read; none ever read, null', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'news-'));
  const file = path.join(dir, 'news-nfl.json');
  let asks = 0;
  const body = { articles: [{ id: 1, type: 'HeadlineNews', published: '2026-10-08T23:08:17Z', headline: "Sean Payton says he's taking over playcalling for Broncos' offense", categories: [{ type: 'team', teamId: 7 }] }, { id: 2, type: 'Story', published: '2026-10-09T00:00:00Z', headline: 'Broncos power rankings', categories: [{ type: 'team', teamId: 7 }] }] };
  const fetchJson = async () => (asks++, body);
  const now = new Date('2026-10-12T12:00:00Z');
  const quiet = { warn() {} };
  const news = await readNews('nfl', { league: 'football/nfl' }, { now, teams: [DEN], file, fetchJson, log: quiet });
  assert.equal(asks, 1);
  assert.deepEqual(news.get('7').map((s) => s.id), ['1']);
  await readNews('nfl', { league: 'football/nfl' }, { now, teams: [DEN], file, fetchJson, log: quiet });
  assert.equal(asks, 1);
  // (the next day, the feed failing: what was read kept)
  const next = await readNews('nfl', { league: 'football/nfl' }, { now: new Date('2026-10-13T12:00:00Z'), teams: [DEN], file, fetchJson: async () => null, log: quiet });
  assert.deepEqual(next.get('7').map((s) => s.id), ['1']);
  assert.equal(await readNews('nfl', { league: 'football/nfl' }, { now, teams: [DEN], file: path.join(dir, 'none.json'), fetchJson: async () => null, log: quiet }), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("football.mjs: a new head coach's first COACH_GAMES games (newCoach), and apart one who took over during a season (coachMid); the props' CTX newCoach the same games", () => {
  assert.equal(COACH_GAMES, 3);
  const games = [];
  const rows = new Map();
  const add = (id, season, date, homeCoach) => {
    const g = { id, season, date, home: '1', away: '2', final: true };
    games.push(g);
    rows.set(id, { home_team: 'AAA', away_team: 'BBB', home_coach: homeCoach, away_coach: 'B Coach', div_game: '0', location: 'Home', surface: '', roof: 'dome', wind: '' });
  };
  // (2024: A1 all season; 2025: A1 two games, then an interim A2 for four; 2026: a hire, A3)
  add('a1', 2024, '2024-09-08T17:00Z', 'A1');
  add('a2', 2024, '2024-09-15T17:00Z', 'A1');
  add('b1', 2025, '2025-09-07T17:00Z', 'A1');
  add('b2', 2025, '2025-09-14T17:00Z', 'A1');
  ['2025-09-21', '2025-09-28', '2025-10-05', '2025-10-12'].forEach((d, i) => add(`b${i + 3}`, 2025, `${d}T17:00Z`, 'A2'));
  add('c1', 2026, '2026-09-13T17:00Z', 'A3');
  const of = footballOf({ nfl: rows, plays: {} }, new Map());
  const out = {};
  for (const g of games) {
    const x = of(g);
    out[g.id] = { n: x.info.newCoach[0], mid: x.info.coachMid[0], newCoach: x.terms.newCoach, coachMid: x.terms.coachMid, ctx: CTX.newCoach({ more: x.info }, true) };
    x.learn();
  }
  // (a team's first season in the history isn't a new coach's)
  assert.deepEqual(out.a1, { n: 0, mid: 0, newCoach: 0, coachMid: 0, ctx: 0 });
  assert.equal(out.b2.n, 0);
  // (the interim's first three: the home side's, so against the home edge; the fourth not)
  assert.deepEqual([3, 4, 5, 6].map((i) => [out[`b${i}`].n, out[`b${i}`].mid, out[`b${i}`].newCoach, out[`b${i}`].coachMid, out[`b${i}`].ctx]), [
    [1, 1, -1, -1, 1],
    [2, 1, -1, -1, 1],
    [3, 1, -1, -1, 1],
    [4, 1, 0, 0, 0],
  ]);
  // (a hire between seasons: a new coach's, not a midseason one's)
  assert.deepEqual([out.c1.n, out.c1.mid, out.c1.newCoach, out.c1.coachMid, out.c1.ctx], [1, 0, -1, 0, 1]);
});
