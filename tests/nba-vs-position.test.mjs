// The NBA's defense vs position (apps/nba/scripts/vs-position.mjs, each head coach row's vsPos, the Teams tab's
// card): on a few made-up games, what each team allowed to each position a game adds up, each player's line is
// read against his own average in his other games (and the position's league average when he has none), the
// playoffs are their own part, ranks are a ranking and the point shares add up; then the 2025-26 file: every
// team has its numbers, ranked 1-30, adding up to the league's points.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { readJson, staticDir } from './support/engine.mjs';
import { NBA_ROLES, NBA_STATS, addVsPosition, nbaVsPosition, rankOf } from '../apps/nba/scripts/vs-position.mjs';
import { boxLines, siteCode } from '../apps/nba/scripts/box-scores.mjs';

// (a line: [id, ESPN position, minutes, points, rebounds, assists, threes]; player 3 isn't listed: ESPN's G, a
// shooting guard)
const GAMES = {
  g1: { d: '20251021', t: 2, h: 'AAA', a: 'BBB', p: { h: [['1', 'G', 30, 20, 5, 5, 2]], a: [['2', 'C', 30, 10, 10, 1, 0]] } },
  g2: { d: '20251023', t: 2, h: 'BBB', a: 'CCC', p: { h: [['2', 'C', 30, 14, 8, 2, 0]], a: [['3', 'G', 20, 8, 2, 6, 1]] } },
  g3: { d: '20251025', t: 2, h: 'CCC', a: 'AAA', p: { h: [['3', 'G', 20, 12, 4, 4, 2]], a: [['1', 'G', 30, 30, 3, 7, 4]] } },
  g4: { d: '20260420', t: 3, h: 'AAA', a: 'BBB', p: { h: [['1', 'G', 30, 25, 5, 5, 3]], a: [['2', 'C', 30, 6, 12, 0, 0]] } },
};
const POSITIONS = new Map([
  ['1', 'PG'],
  ['2', 'C'],
]);

test('NBA vs position: each team allowed, a game, against the players\' own averages in their other games', () => {
  const vs = nbaVsPosition({ games: GAMES, positionOf: POSITIONS, part: 'regular' });
  assert.deepEqual([...vs.keys()].sort(), ['AAA', 'BBB', 'CCC']);
  const bbb = vs.get('BBB');
  // (BBB: player 1's 20 in g1 (his other game 30) and player 3's 8 in g2 (his other 12), over 2 games)
  assert.equal(bbb.games, 2);
  assert.equal(bbb.PG.pts.g, 10);
  assert.equal(bbb.PG.pts.vs, -5);
  assert.equal(bbb.SG.pts.g, 4, 'an unlisted G counted a shooting guard');
  assert.equal(bbb.SG.pts.vs, -2);
  assert.equal(bbb.C.pts.g, 0);
  // (PRA: 20 + 5 + 5 against 30 + 3 + 7)
  assert.equal(bbb.PG.pra.g, 15);
  assert.equal(bbb.PG.pra.vs, -5);
  assert.equal(bbb.PG.fg3.g, 1);
  assert.equal(bbb.PG.fg3.vs, -1);
  // (AAA: player 2's 10 (his other 14), player 3's 12 (his other 8); CCC: player 2's 14 (10), player 1's 30 (20))
  assert.equal(vs.get('AAA').C.pts.vs, -2);
  assert.equal(vs.get('AAA').SG.pts.vs, 2);
  assert.equal(vs.get('CCC').C.pts.vs, 2);
  assert.equal(vs.get('CCC').PG.pts.vs, 5);
  assert.equal(vs.get('CCC').PG.reb.g, 1.5);
  // Ranks: the least first, per position and stat (AAA allowed no PG: 0)
  assert.deepEqual(['BBB', 'AAA', 'CCC'].map((t) => vs.get(t).PG.pts.rv), [1, 2, 3]);
  assert.deepEqual(['AAA', 'BBB', 'CCC'].map((t) => vs.get(t).PG.pts.r), [1, 2, 3]);
  // Shares: AAA's 22 points against it, 10 to centers and 12 to shooting guards; the league's 94: 24 to centers
  const share = vs.get('AAA').share;
  assert.equal(share.C.s, 0.455);
  assert.equal(share.SG.s, 0.545);
  assert.equal(share.C.lg, 0.255);
  for (const team of vs.values()) {
    const sum = NBA_ROLES.reduce((a, r) => a + team.share[r].s, 0);
    assert.ok(Math.abs(sum - 1) < 0.003, `shares add up to ${sum}`);
  }
  // Every allowed total is the box scores' (a game's points against a team: the other side's)
  const allowed = [...vs.values()].reduce((a, t) => a + NBA_ROLES.reduce((s, r) => s + t[r].pts.g * t.games, 0), 0);
  assert.equal(allowed, 20 + 10 + 14 + 8 + 12 + 30);
});

test('NBA vs position: the playoffs their own part, a player\'s average his whole season\'s', () => {
  const post = nbaVsPosition({ games: GAMES, positionOf: POSITIONS, part: 'post' });
  // (g4 alone: player 1's 25 against his other two games' 25; player 2's 6 against his other games' 12, his
  // 12 rebounds against 9)
  assert.deepEqual([...post.keys()].sort(), ['AAA', 'BBB']);
  assert.equal(post.get('BBB').games, 1);
  assert.equal(post.get('BBB').PG.pts.g, 25);
  assert.equal(post.get('BBB').PG.pts.vs, 0);
  // (centered on the part's league: the centers' -6 over its 2 team-games, -3 a team-game, taken off; BBB
  // allowed no center, so +3)
  assert.equal(post.get('AAA').C.pts.vs, -6 + 3);
  assert.equal(post.get('BBB').C.pts.vs, 3);
  assert.equal(post.get('AAA').C.reb.vs, 12 - 9 - 1.5);
  // (each part's vs adds up to nothing over its team-games, but for its rounding)
  for (const part of ['regular', 'post', 'all']) {
    const vs = nbaVsPosition({ games: GAMES, positionOf: POSITIONS, part });
    for (const role of NBA_ROLES) {
      for (const stat of NBA_STATS) {
        const sum = [...vs.values()].reduce((a, t) => a + t[role][stat].vs * t.games, 0);
        assert.ok(Math.abs(sum) < 0.005 * 8, `${part} ${role} ${stat}: ${sum}`);
      }
    }
  }
  const all = nbaVsPosition({ games: GAMES, positionOf: POSITIONS, part: 'all' });
  assert.equal(all.get('BBB').games, 3);
  // (both parts: player 1's 20 and 25 against BBB, each against his other two games: 27.5 and 25)
  assert.equal(all.get('BBB').PG.pts.g, 15);
  assert.equal(all.get('BBB').PG.pts.vs, Math.round(((45 - 52.5) / 3) * 100) / 100);
});

test("NBA vs position: a player with no other game is read against his position's league average", () => {
  const games = {
    x1: { d: '20251021', t: 2, h: 'AAA', a: 'BBB', p: { h: [['1', 'C', 30, 20, 10, 2, 0]], a: [['9', 'C', 5, 2, 1, 0, 0]] } },
    x2: { d: '20251022', t: 2, h: 'AAA', a: 'BBB', p: { h: [['1', 'C', 30, 10, 10, 2, 0]], a: [] } },
  };
  const vs = nbaVsPosition({ games, positionOf: new Map([['1', 'C'], ['9', 'C']]), part: 'regular' });
  // (player 9's lone game: against the centers' league average, (20 + 2 + 10) / 3; player 1: each game against
  // the other, 0; then the league's, over its 3 team-games, taken off)
  const center = (2 - 32 / 3) / 3;
  assert.equal(vs.get('AAA').C.pts.vs, Math.round((2 - 32 / 3 - center) * 100) / 100);
  assert.equal(vs.get('BBB').C.pts.vs, Math.round(-center * 100) / 100);
});

test('NBA vs position: ranks share ties and skip nulls; coach rows take their team\'s', () => {
  assert.deepEqual(rankOf([3, 1, 3, null, 2]), [3, 1, 3, null, 2]);
  const rows = { PG: [{ id: 1 }], C: [{ id: 2 }], HC: [{ teamLogo: 'assets/NBA_Icons/BBB.svg' }, { teamLogo: 'assets/NBA_Icons/ZZZ.svg' }] };
  assert.equal(addVsPosition(rows, { games: GAMES }, 'regular'), 1);
  assert.equal(rows.HC[0].vsPos.PG.pts.g, 10);
  assert.equal(rows.HC[1].vsPos, null);
  assert.equal(addVsPosition(rows, { games: {} }, 'regular'), 0, 'no box scores: nothing added');
});

test("NBA box scores: a side's lines from ESPN's summary, teams by the site's codes", () => {
  const side = {
    statistics: [
      {
        labels: ['MIN', 'PTS', 'FG', '3PT', 'FT', 'REB', 'AST'],
        athletes: [
          { athlete: { id: 7, position: { abbreviation: 'F' } }, stats: ['31', '22', '8-15', '3-7', '3-4', '9', '4'] },
          { athlete: { id: 8, position: { abbreviation: 'G' } }, didNotPlay: true, stats: [] },
          { athlete: { id: 9, position: { abbreviation: 'C' } }, stats: ['0', '0', '0-0', '0-0', '0-0', '0', '0'] },
        ],
      },
    ],
  };
  assert.deepEqual(boxLines(side), [['7', 'F', 31, 22, 9, 4, 3]]);
  assert.deepEqual(['GS', 'NY', 'UTAH', 'WSH', 'PHX', 'BOS'].map(siteCode), ['GSW', 'NYK', 'UTA', 'WAS', 'PHO', 'BOS']);
});

// 2025-26: the season's file (archived since the 2026-27 season began: seasons/2026)
const FILE = path.join(staticDir('nba'), 'seasons', '2026', 'skill-players.json');
const data = existsSync(FILE) ? readJson(FILE) : null;
const has = data?.HC?.some((c) => c.vsPos);

test('NBA 2025-26: every team has its vs-position numbers, ranked 1-30, adding up to the league', { skip: !has && 'no vsPos in the file' }, () => {
  const teams = new Map(data.HC.filter((c) => c.vsPos).map((c) => [c.teamLogo, c.vsPos]));
  assert.equal(teams.size, 30);
  const blocks = [...teams.values()];
  for (const b of blocks) assert.ok(b.games >= 80 && b.games <= 83, `${b.games} games`);
  for (const role of NBA_ROLES) {
    for (const stat of NBA_STATS) {
      const lines = blocks.map((b) => b[role][stat]);
      assert.deepEqual(lines.map((l) => l.r), rankOf(lines.map((l) => l.g)), `${role} ${stat} ranks`);
      assert.deepEqual(lines.map((l) => l.rv), rankOf(lines.map((l) => l.vs)), `${role} ${stat} vs ranks`);
      assert.ok(lines.some((l) => l.rv === 1) && Math.max(...lines.map((l) => l.rv)) <= 30);
    }
    // (a position's points a game: a plausible number, and against the usual within reason, cancelling out)
    for (const b of blocks) assert.ok(b[role].pts.g > 10 && b[role].pts.g < 45 && Math.abs(b[role].pts.vs) < 8, `${role}: ${b[role].pts.g}, ${b[role].pts.vs}`);
    const mean = blocks.reduce((a, b) => a + b[role].pts.vs, 0) / blocks.length;
    assert.ok(Math.abs(mean) < 0.6, `${role}: the league's points over the usual average ${mean}`);
  }
  // (the points allowed a game add up to a team's points a game: 100-130)
  for (const b of blocks) {
    const total = NBA_ROLES.reduce((a, r) => a + b[r].pts.g, 0);
    assert.ok(total > 100 && total < 130, `${total} points a game allowed`);
  }
  // (and the season's points allowed to the listed players' points in all, within 1%)
  const allowed = blocks.reduce((a, b) => a + NBA_ROLES.reduce((s, r) => s + b[r].pts.g * b.games, 0), 0);
  const scored = NBA_ROLES.reduce((a, tab) => a + data[tab].reduce((s, p) => s + (p.stats.points ?? 0), 0), 0);
  assert.ok(Math.abs(allowed - scored) / scored < 0.01, `${allowed} allowed against ${scored} scored`);
  // (the Teams tab's rows read it from the coaches')
  assert.ok(data.HC.every((c) => !c.vsPos || c.vsPos === teams.get(c.teamLogo) || c.vsPos.games === teams.get(c.teamLogo).games));
});

// The playoffs: each player against his whole season's average, which nearly everyone scores under there;
// centered, it's even across the playoff teams, not every one of them holding every position under its usual
const POST = path.join(staticDir('nba'), 'seasons', '2026', 'skill-players.post.json');
const post = existsSync(POST) ? readJson(POST) : null;

test('NBA 2025-26 playoffs: vs Position centered on the playoff teams', { skip: !post?.HC?.some((c) => c.vsPos) && 'no vsPos in the file' }, () => {
  const blocks = [...new Map(post.HC.filter((c) => c.vsPos).map((c) => [c.teamLogo, c.vsPos])).values()];
  assert.equal(blocks.length, 16);
  for (const role of NBA_ROLES) {
    for (const stat of NBA_STATS) {
      const games = blocks.reduce((a, b) => a + b.games, 0);
      const mean = blocks.reduce((a, b) => a + b[role][stat].vs * b.games, 0) / games;
      assert.ok(Math.abs(mean) < 0.01, `${role} ${stat}: ${mean} a team-game over the usual`);
    }
  }
  const net = blocks.map((b) => NBA_ROLES.reduce((a, r) => a + b[r].pts.vs, 0));
  assert.ok(net.filter((v) => v < 0).length < 12 && net.filter((v) => v > 0).length > 4, `${net.join(', ')}`);
});

test('NBA box scores: kept between runs, only new days and finals asked for; postponed, All-Star and missing games handled', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { updateBoxes } = await import('../apps/nba/scripts/box-scores.mjs');
  const dir = mkdtempSync(path.join(tmpdir(), 'nba-box-'));
  const team = (id, abbr, homeAway) => ({ homeAway, team: { id, abbreviation: abbr } });
  const event = (id, type, comp, status, completed) => ({
    id,
    season: { type },
    status: { type: { name: status, completed } },
    competitions: [{ type: { abbreviation: comp }, competitors: [team('1', 'GS', 'home'), team('2', 'NY', 'away')] }],
  });
  const final = (id, type = 2, comp = 'STD') => event(id, type, comp, 'STATUS_FINAL', true);
  const side = (id, pts) => ({ team: { id }, statistics: [{ labels: ['MIN', 'PTS', '3PT', 'REB', 'AST'], athletes: [{ athlete: { id: `p${id}`, position: { abbreviation: 'G' } }, stats: ['30', String(pts), '2-5', '4', '6'] }] }] });
  let days = {
    20251021: [final('a1'), event('pp', 2, 'STD', 'STATUS_POSTPONED', false)],
    20251022: [final('as', 2, 'ALLSTAR'), final('cc', 2, 'CC'), event('pre', 1, 'STD', 'STATUS_FINAL', true)],
    20251023: [final('gone'), event('later', 2, 'STD', 'STATUS_SCHEDULED', false)],
  };
  const asked = [];
  const fetch = async (url) => {
    asked.push(url.replace(/^.*nba\//, ''));
    const date = url.match(/dates=(\d+)/)?.[1];
    const id = url.match(/event=(\w+)/)?.[1];
    const ok = (body) => ({ ok: true, status: 200, json: async () => body });
    if (date === '20260201') return ok({ leagues: [{ season: { year: 2026 }, calendar: Object.keys(days).map((d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}T07:00Z`) }] });
    if (date) return ok({ events: days[date] ?? [] });
    if (id === 'gone') return { ok: false, status: 404, statusText: 'Not Found' };
    return ok({ boxscore: { players: [side('1', 20), side('2', 11)] } });
  };
  const run = (today) => updateBoxes(2026, { dir, fetch, today, pace: 0, desk: null, log: () => {} });
  try {
    let kept = await run('20251024');
    assert.deepEqual(Object.keys(kept.games), ['a1']);
    assert.deepEqual(kept.games.a1, { d: '20251021', t: 2, h: 'GSW', a: 'NYK', p: { h: [['p1', 'G', 30, 20, 4, 6, 2]], a: [['p2', 'G', 30, 11, 4, 6, 2]] } });
    assert.deepEqual(kept.missing, ['gone']);
    // (a game still to come holds the day; a postponed one doesn't)
    assert.equal(kept.through, '20251022');
    assert.ok(!asked.some((u) => /event=(as|cc|pre|pp)/.test(u)), 'the All-Star, Cup final, preseason and postponed games not asked for');
    // The next run: the held day only, its new final; nothing asked again
    days['20251023'][1] = final('later');
    asked.length = 0;
    kept = await run('20251024');
    assert.deepEqual(asked, ['scoreboard?dates=20260201', 'scoreboard?dates=20251023', 'summary?event=later']);
    assert.equal(kept.through, '20251023');
    assert.equal(readJson(path.join(dir, '2026.json')).games.later.d, '20251023');
    // A finished season, past July: nothing asked at all
    asked.length = 0;
    await run('20260801');
    assert.deepEqual(asked, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
