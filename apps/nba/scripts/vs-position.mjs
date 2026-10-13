// Defense vs position, the NBA's: what each team allowed to opposing point guards, shooting guards, small
// forwards, power forwards and centers a game (points first, then rebounds, assists, threes and PRA), and
// against those players' own averages in their other games, so holding a star to his usual reads as average
// and holding him under it as good defense; and the share of the points against it each position scored
// beside the league's. Built from the season's box scores (box-scores.mjs: every player line of every final).
//
// Five positions, not ESPN's three: each player's is the site's (Basketball-Reference's listed position, the
// tab he's on: "SG-PG" is a shooting guard), the same all season; the box scores' own are only G, F and C.
// A player the site doesn't list (a name its ESPN match missed: about 0.3% of the points) takes ESPN's (G a
// shooting guard, F a small forward).
//
// update-data.mjs adds it to each head coach row (vsPos: a team's coaches carry the same), the Teams tab's
// rows take it from them and the team card shows it (src/sport/vs-position.ts). Run on its own, this file
// brings the box scores up to date and adds it to the seasons already written:
//
//   node apps/nba/scripts/vs-position.mjs            (2025-26, the last finished season)
//   node apps/nba/scripts/vs-position.mjs 2025 2026  (just those)
//
// Display only: nothing in the ranking reads it.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { updateBoxes } from './box-scores.mjs';

export const NBA_ROLES = ['PG', 'SG', 'SF', 'PF', 'C'];
export const NBA_STATS = ['pts', 'reb', 'ast', 'fg3', 'pra'];
// (a player the site doesn't list: ESPN's position)
const FALLBACK = { PG: 'PG', SG: 'SG', SF: 'SF', PF: 'PF', C: 'C', G: 'SG', F: 'SF', 'G-F': 'SG', 'F-G': 'SF', 'F-C': 'PF', 'C-F': 'C' };
// (a box line: [id, position, minutes, points, rebounds, assists, threes])
const statsOf = (line) => ({ pts: line[3], reb: line[4], ast: line[5], fg3: line[6], pra: line[3] + line[4] + line[5] });
const r2 = (v) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
const r3 = (v) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 1000) / 1000);
const zero = () => Object.fromEntries(NBA_STATS.map((k) => [k, 0]));

// A row's team: its logo's file name ("assets/NBA_Icons/BOS.svg")
export const rowTeam = (row) => row.teamLogo?.split('/').pop().replace(/\.\w+$/, '') ?? null;

// Ranks: the least first (equal values share a rank)
export function rankOf(values) {
  const list = values.filter((v) => v !== null);
  return values.map((v) => (v === null ? null : 1 + list.filter((w) => w < v).length));
}

// The season's games (box-scores.mjs's: { d, t, h, a, p: { h, a } }), each listed player's position (ESPN id
// -> PG...C) and the part: team -> its vsPos
//   { games, PG: { pts: { g, vs, r, rv }, reb..., pra }, ..., share: { PG: { s, lg }, ... } }
// g: allowed a game; vs: a game over what those players averaged in their other games; r: g's rank, rv: vs's
// (1 the least allowed, the stingiest)
export function nbaVsPosition({ games, positionOf, part = 'regular' }) {
  const inPart = (t) => (part === 'all' ? t === 2 || t === 3 : t === (part === 'post' ? 3 : 2));
  // (a player's average: the regular season's own games, or the whole season's)
  const inBase = (t) => (part === 'regular' ? t === 2 : t === 2 || t === 3);
  const lines = [];
  for (const [id, g] of Object.entries(games)) {
    for (const [side, opp] of [['h', g.a], ['a', g.h]]) {
      for (const line of g.p?.[side] ?? []) {
        const role = positionOf.get(String(line[0])) ?? FALLBACK[line[1]];
        if (!role) continue;
        lines.push({ pid: String(line[0]), role, opp, game: id, t: g.t, s: statsOf(line) });
      }
    }
  }
  // (each player's games and totals in the base)
  const own = new Map();
  for (const l of lines) {
    if (!inBase(l.t)) continue;
    const o = own.get(l.pid) ?? { games: 0, ...zero() };
    o.games++;
    for (const k of NBA_STATS) o[k] += l.s[k];
    own.set(l.pid, o);
  }
  // (the league's average a game for each position: the stand-in for a player with no other game)
  const leagueAvg = {};
  for (const role of NBA_ROLES) {
    const list = lines.filter((l) => l.role === role && inPart(l.t));
    leagueAvg[role] = Object.fromEntries(NBA_STATS.map((k) => [k, list.length ? list.reduce((a, l) => a + l.s[k], 0) / list.length : 0]));
  }
  const teams = new Map();
  for (const l of lines) {
    if (!inPart(l.t)) continue;
    let t = teams.get(l.opp);
    if (!t) teams.set(l.opp, (t = { games: new Set(), ...Object.fromEntries(NBA_ROLES.map((r) => [r, { got: zero(), exp: zero() }])) }));
    t.games.add(l.game);
    const o = own.get(l.pid);
    // (his average without this game: a game in the base leaves itself out)
    const self = inBase(l.t) ? 1 : 0;
    const others = o ? o.games - self : 0;
    for (const k of NBA_STATS) {
      t[l.role].got[k] += l.s[k];
      t[l.role].exp[k] += others > 0 ? (o[k] - self * l.s[k]) / others : leagueAvg[l.role][k];
    }
  }
  const leaguePts = Object.fromEntries(NBA_ROLES.map((r) => [r, 0]));
  for (const t of teams.values()) for (const r of NBA_ROLES) leaguePts[r] += t[r].got.pts;
  const leagueTotal = NBA_ROLES.reduce((a, r) => a + leaguePts[r], 0);
  const out = new Map();
  for (const [team, t] of teams) {
    const games = t.games.size;
    const total = NBA_ROLES.reduce((a, r) => a + t[r].got.pts, 0);
    const block = { games, share: {} };
    for (const role of NBA_ROLES) {
      block[role] = Object.fromEntries(
        NBA_STATS.map((k) => [k, { g: r2(t[role].got[k] / games), vs: r2((t[role].got[k] - t[role].exp[k]) / games), r: null, rv: null }]),
      );
      block.share[role] = { s: total ? r3(t[role].got.pts / total) : null, lg: leagueTotal ? r3(leaguePts[role] / leagueTotal) : null };
    }
    out.set(team, block);
  }
  // (ranked among the teams in the part: 30, or the playoffs' 16)
  const blocks = [...out.values()];
  for (const role of NBA_ROLES) {
    for (const k of NBA_STATS) {
      const r = rankOf(blocks.map((b) => b[role][k].g));
      const rv = rankOf(blocks.map((b) => b[role][k].vs));
      blocks.forEach((b, i) => Object.assign(b[role][k], { r: r[i], rv: rv[i] }));
    }
  }
  return out;
}

// Each listed player's position (ESPN id -> his tab), from a part's rows
export function positionsOf(rows) {
  const positions = new Map();
  for (const tab of NBA_ROLES) for (const row of rows[tab] ?? []) if (row.id) positions.set(String(row.id), tab);
  return positions;
}

// A part's rows (as update-data.mjs builds them, or read from its file) given their vsPos on every head coach
// row, from the season's box scores; the teams it was added for
export function addVsPosition(rows, boxes, part, extraPositions = new Map()) {
  if (!Object.keys(boxes?.games ?? {}).length) return 0;
  const vs = nbaVsPosition({ games: boxes.games, positionOf: new Map([...extraPositions, ...positionsOf(rows)]), part });
  let n = 0;
  for (const row of rows.HC ?? []) {
    row.vsPos = vs.get(rowTeam(row)) ?? null;
    if (row.vsPos) n++;
  }
  return n;
}

const FILE = { regular: 'skill-players.json', post: 'skill-players.post.json', all: 'skill-players.all.json' };

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const STATIC = path.resolve(import.meta.dirname, '../src/StaticData');
  const args = process.argv.slice(2).map(Number).filter(Boolean);
  for (const season of args.length ? args : [2026]) {
    const boxes = await updateBoxes(season);
    // (a finished season's files are under seasons/; the current one's at the top)
    const archived = path.join(STATIC, 'seasons', String(season));
    const dir = existsSync(path.join(archived, FILE.regular)) ? archived : STATIC;
    const regularFile = path.join(dir, FILE.regular);
    if (!existsSync(regularFile)) {
      console.log(`${season}: no rows written`);
      continue;
    }
    const regular = positionsOf(JSON.parse(readFileSync(regularFile, 'utf8')));
    for (const part of ['regular', 'post', 'all']) {
      const file = path.join(dir, FILE[part]);
      if (!existsSync(file)) continue;
      const data = JSON.parse(readFileSync(file, 'utf8'));
      const n = addVsPosition(data, boxes, part, regular);
      writeFileSync(file, JSON.stringify(data));
      console.log(`${season} ${part}: vsPos on ${n} coach rows`);
    }
  }
}
