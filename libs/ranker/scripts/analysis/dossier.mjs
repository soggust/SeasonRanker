// Team fact sheets for the AI analysis of MLB, NBA and NHL teams (the NFL's are apps/nfl/scripts/analysis):
// one compact JSON per team, every number one the site shows, precomputed (the model explains numbers, it
// doesn't add them up). Built from the sport's own site data as published (origin/master's StaticData,
// this checkout's when that can't be read):
//   - the Teams tab's row: each stat as [value, rank, of] across the league (1 = best), the default
//     ranking's place, and the roster grades (Hitters, Rotation...) at the default sliders
//   - vs Position (NBA, NHL): what the defense allowed to each position
//   - the players who carry each roster group, with their default rank on their tab and headline stats
//   - the postseason's table (its own row and players) once the team has played in it
//   - results (the Game Log tab's: ESPN's schedule), the division's standings by the site's records
//   - the coming week's games (a preview) or how the season ended (a recap)
//   - recent seasons (the Seasons tab: each year's row and default rank)
//   - totals: the plain season totals of those numbers that reports want and the site's rows don't hold
//     (runs / points / goals for and against from the Game Log's scores, the differential, the wins its
//     margin implies; each listed roster group's combined innings, WAR, points...), so the model quotes
//     them instead of adding sheet numbers up itself; and worked out the same way: scored, allowed and the
//     differential a game ranked across the league, the league's average a game and the gap to it, the
//     games left and the pace over a full season, the last 5 and 10 games against the season
//   - each team stat's league average and the gap to it (season.vsLeague); the NHL's finishing (shooting %,
//     save %, PDO, all situations, and shots a game, from the players' rows: season.finishing), its goalies'
//     save % together and each past season's standings points; the NBA's ORtg and DRtg (season.ratings)
// The engine is bundled with esbuild (site-engine.ts, through the sport's tsconfig) so labels, ranks and
// grades come out exactly as the site computes them.
//
//   buildDossiers(sport, { season, status, standings, games }) -> Map(team key -> dossier)

import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { POSTSEASON, REGULAR, teamSchedule } from './season-state.mjs';

export const ROOT = path.resolve(import.meta.dirname, '../../../..');

// Each sport: ESPN's path, its season's name ("2026", "2025-26"), how many of each roster group's
// players the sheet lists (by playing time), the columns it gives each (a hitter's, a pitcher's...; each
// one its tab shows), the final's name, and the record's shape (the NHL's overtime losses)
export const SPORTS = {
  mlb: {
    name: 'MLB', espn: 'baseball/mlb', game: 'baseball', label: (y) => String(y), keep: { hitters: 9, rotation: 5, bullpen: 5 }, final: 'World Series', scoring: 'runs', seasonGames: 162, periods: 9,
    groupTotals: { hitters: ['war', 'pa', 'homeRuns', 'rbi', 'stolenBases'], rotation: ['war', 'ip', 'strikeOuts'], bullpen: ['war', 'ip', 'saves', 'holds'] },
    stats: { SP: ['war', 'ip', 'era', 'fip', 'whip', 'kPct', 'bbPct', 'strikeOuts'], RP: ['war', 'ip', 'era', 'fip', 'saves', 'holds', 'kPct', 'bbPct'], hitter: ['war', 'pa', 'avg', 'obp', 'slg', 'homeRuns', 'rbi', 'stolenBases', 'wrcPlus', 'defRuns'] },
  },
  nba: {
    name: 'NBA', espn: 'basketball/nba', game: 'basketball', label: (y) => `${y - 1}-${String(y).slice(2)}`, keep: { backcourt: 4, wings: 3, frontcourt: 5 }, final: 'NBA Finals', scoring: 'points', seasonGames: 82, periods: 4,
    // (the ratings behind the Teams tab's Net Rtg, ranked and set against the league in the sheet)
    ratings: [
      { key: 'ortg', label: 'ORtg', name: 'Offensive Rating', description: 'points scored per 100 possessions' },
      { key: 'drtg', label: 'DRtg', name: 'Defensive Rating', description: 'points allowed per 100 possessions', negative: true },
    ],
    groupTotals: { any: ['minutes', 'points', 'rebounds', 'assists', 'threes', 'ws'] },
    stats: { any: ['minutes', 'points', 'rebounds', 'assists', 'threes', 'tsPct', 'usgPct', 'bpm', 'ws', 'onOff'] },
  },
  nhl: {
    name: 'NHL', espn: 'hockey/nhl', game: 'hockey', label: (y) => `${y - 1}-${String(y).slice(2)}`, keep: { forwards: 9, blueline: 6, goaltending: 2 }, final: 'Stanley Cup Final', ties: true, scoring: 'goals', seasonGames: 82, periods: 3, finishing: true,
    groupTotals: { goaltending: ['gamesStarted', 'shutouts', 'saves'], any: ['goals', 'assists', 'points', 'ppPoints', 'shots'] },
    stats: { G: ['gamesStarted', 'savePct', 'gaa', 'gsax', 'shutouts'], any: ['toi', 'goals', 'assists', 'points', 'plusMinus', 'ppPoints', 'shots', 'xgfPct', 'gameScore'] },
  },
};

const GRADES = ['F', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+'];
const r = (v, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(d)));
// Innings as the site shows them (libs/ranker/src/core/format.ts innings): 175.333 -> "175.1", a third an out
export function innings(value) {
  const outs = Math.round(value * 3);
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}
// A stat's value in the sheet: innings in the site's notation, the rest rounded
const shown = (key, v) => (key === 'ip' ? innings(v) : r(v));

// A site file as published: origin/master's copy (what the live site shows; the data bots commit there),
// else this checkout's. null when neither has it. (ANALYSIS_REF reads another commit's instead: a past
// run's sheets rebuilt from the data it had, to measure a change against its reports)
const SITE_REF = process.env.ANALYSIS_REF || 'origin/master';
export function siteFile(sport, rel) {
  const repoPath = `apps/${sport}/src/StaticData/${rel}`;
  try {
    return JSON.parse(execFileSync('git', ['show', `${SITE_REF}:${repoPath}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 29, stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    const file = path.join(ROOT, repoPath);
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  }
}

// The season in the sport's data (update-data.mjs's, the one scripts/rollover.mjs bumps)
export function dataSeason(sport) {
  const text = readFileSync(path.join(ROOT, 'apps', sport, 'scripts/update-data.mjs'), 'utf8');
  return Number(text.match(/^const CURRENT_SEASON = (\d+);/m)?.[1]);
}

// The sport's engine (site-engine.ts), bundled once a run
const engines = new Map();
export async function engineFor(sport, data) {
  globalThis.__DATA = data;
  if (!engines.has(sport)) {
    const bundle = path.join(os.tmpdir(), `${sport}-ranker-analysis-${process.pid}.mjs`);
    await build({
      entryPoints: [path.join(import.meta.dirname, 'site-engine.ts')],
      bundle: true,
      format: 'esm',
      logLevel: 'warning',
      outfile: bundle,
      platform: 'node',
      tsconfig: path.join(ROOT, 'apps', sport, 'tsconfig.json'),
    });
    engines.set(sport, await import(pathToFileURL(bundle).href));
    rmSync(bundle);
  }
  return engines.get(sport);
}

// A team's key: its logo's file name ("109", "CHI", "UTA"), the Teams tab's row id is TM-<key>
export const keyOf = (logo) => logo.split('/').pop().replace(/\.\w+$/, '');

// Each value's rank across the teams (1 = best; low: less is better), as [value, rank, of]
function ranker(values, low) {
  const sorted = values.filter((v) => v !== null && v !== undefined && Number.isFinite(v)).sort((a, b) => (low ? a - b : b - a));
  return (v) => (v === null || v === undefined || !Number.isFinite(v) ? null : [r(v), sorted.indexOf(v) + 1, sorted.length]);
}

// Goalies' saves and the shots they faced (each one's saves over his save %, to the shot): { saves, shots }
export function savesOf(goalies) {
  let saves = 0;
  let shots = 0;
  for (const g of goalies) {
    const sv = g.stats?.saves;
    const pct = g.stats?.savePct;
    if (!Number.isFinite(sv) || !Number.isFinite(pct) || pct <= 0) continue;
    saves += sv;
    shots += Math.round(sv / pct);
  }
  return { saves, shots };
}

// The league's average of a stat (the teams' mean); null for none, or for a stat centered on 0 (a
// differential, a luck stat: its gap to the league is its value)
export function leagueAverage(values) {
  const vals = values.filter((v) => v !== null && v !== undefined && Number.isFinite(v));
  if (!vals.length) return null;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.abs(avg) < 0.5 && vals.some((v) => v < 0) ? null : avg;
}
// A team's value against the league's average: { league, gap } (gap = team minus league), to a tenth for
// a stat in the tens or more (a rating, a PDO), else to the thousandth (a fraction, a rate)
export function gapTo(value, avg) {
  if (value === null || value === undefined || !Number.isFinite(value) || !Number.isFinite(avg)) return null;
  const d = Math.abs(avg) >= 10 ? 1 : 3;
  return { league: r(avg, d), gap: r(value - avg, d) };
}

// A stat's line in the sheet's glossary: its column label, its long name, what it means
const glossaryLine = (stat) => `${stat.label}${stat.name && stat.name !== stat.label ? ` (${stat.name})` : ''}: ${stat.description}${stat.negative ? ' [lower is better]' : ''}`;

// Matching the site's teams to ESPN's: the full name, else the nickname at the end of it
function espnTeamOf(name, espnTeams) {
  const exact = espnTeams.find((t) => t.name === name);
  if (exact) return exact;
  const ends = espnTeams.filter((t) => t.nickname && name.endsWith(` ${t.nickname}`));
  return ends.length === 1 ? ends[0] : null;
}

// A game's day in the US (Eastern): ESPN's times are UTC, so a night game is the next day's there
export const dayOf = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

// A game from one team's side: { date, opp, at, score, result, ot } (score: ours-theirs; ot: past
// regulation, the periods or innings the sport plays, when ESPN says)
function sideOf(g, id, abbrOf, periods = null) {
  const opp = g.teams.find((t) => t !== id);
  const us = g.score[id];
  const them = g.score[opp];
  return {
    date: dayOf(g.date),
    opp: abbrOf(opp),
    at: g.home === id ? 'home' : 'away',
    ...(g.completed ? { score: `${us}-${them}`, result: us > them ? 'W' : us < them ? 'L' : 'T', ...(periods && g.periods > periods ? { ot: true } : {}) } : {}),
    ...(g.round && g.type === POSTSEASON ? { round: g.round } : {}),
  };
}

// The season by month (W-L, scored and allowed), the longest streaks, the last games
function results(played) {
  const months = new Map();
  for (const g of played) {
    const m = g.date.slice(0, 7);
    const row = months.get(m) ?? { month: m, w: 0, l: 0, scored: 0, allowed: 0 };
    const [us, them] = g.score.split('-').map(Number);
    row[g.result === 'W' ? 'w' : 'l']++;
    row.scored += us;
    row.allowed += them;
    months.set(m, row);
  }
  let best = { W: 0, L: 0 };
  let run = { result: null, n: 0 };
  for (const g of played) {
    run = g.result === run.result ? { result: g.result, n: run.n + 1 } : { result: g.result, n: 1 };
    if (run.n > (best[g.result] ?? 0)) best[g.result] = run.n;
  }
  let wins = 0;
  let losses = 0;
  return {
    byMonth: [...months.values()].map(({ month, w, l, scored, allowed }) => {
      wins += w;
      losses += l;
      // (per game and the record at the month's end, so a report quotes them rather than working them out)
      return { month, record: `${w}-${l}`, scored, allowed, scoredPerGame: r(scored / (w + l), 2), allowedPerGame: r(allowed / (w + l), 2), recordThrough: `${wins}-${losses}` };
    }),
    longestWinStreak: best.W,
    longestLosingStreak: best.L,
  };
}

// Every team's sheet, by key.
//   season     the season in the data (dataSeason)
//   status     ESPN id -> { over, why, champion, by } (season-state.mjs teamStatus)
//   standings  ESPN's teams (their ids, abbreviations, divisions)
//   games      the postseason games so far (postseasonGames)
//   only       team keys to build (all when left out)
//   asOf       a time (ms): the sheets as they were then, the games played by it (a past run's, rebuilt)
export async function buildDossiers(sport, { season, status, standings, games, only = null, asOf = null, log = () => {} }) {
  const cfg = SPORTS[sport];
  const regular = siteFile(sport, 'skill-players.json');
  if (!regular) throw new Error(`${sport}: no skill-players.json`);
  const post = siteFile(sport, 'skill-players.post.json');
  const unranked = siteFile(sport, 'skill-players.ur.json') ?? {};
  const E = await engineFor(sport, { skillPlayers: regular, unrankedRows: unranked });

  // ---- the regular season as the site shows it at its default sliders
  const units = E.unitsFor({ skillPlayers: regular, unrankedRows: unranked });
  const grid = E.gridRankings();
  const teamStats = E.SKILL_STATS.TM.filter((s) => !['recent', 'games'].includes(s.key));
  const gradeDefs = E.SPORT.rosterGrades ?? [];
  const teams = units.TM ?? [];
  const tabRank = (pos, unit) => {
    const list = grid[pos] ?? [];
    const at = list.indexOf(unit);
    return at < 0 ? null : [at + 1, list.length];
  };
  // (each stat ranked across the teams; a rank stat is its own rank; the record as text)
  const rankers = Object.fromEntries(
    teamStats.filter((s) => s.format !== 'grade' && s.format !== 'rank').map((s) => [s.key, ranker(teams.map((t) => E.unitStat(t, s.key)), !!s.negative)]),
  );
  // the roster grades as the Teams tab shows them: each player by his place on his tab's default ranking
  // (#1 = 12, last = 0), averaged per team by playing time, the teams curved (best A+, worst F)
  const grades = new Map();
  for (const def of gradeDefs) {
    const totals = new Map();
    for (const pos of def.positions) {
      const list = grid[pos] ?? [];
      const last = Math.max(list.length - 1, 1);
      list.forEach((p, rank) => {
        const w = def.usage(p);
        if (!w) return;
        const t = totals.get(p.teamLogo) ?? { sum: 0, usage: 0 };
        totals.set(p.teamLogo, { sum: t.sum + 12 * (1 - rank / last) * w, usage: t.usage + w });
      });
    }
    const ranked = [...totals].map(([logo, t]) => [logo, t.sum / t.usage]).sort((a, b) => b[1] - a[1]);
    const last = Math.max(ranked.length - 1, 1);
    grades.set(def.key, new Map(ranked.map(([logo], i) => [logo, GRADES[Math.round(12 * (1 - i / last))]])));
  }
  const recordOf = (st) => (st ? `${st.wins ?? 0}-${st.losses ?? 0}${cfg.ties ? `-${st.ties ?? 0}` : ''}` : null);
  const teamLine = (t) => {
    const out = { record: recordOf(t.stats) };
    for (const s of teamStats) {
      if (s.format === 'grade') {
        const g = grades.get(s.key)?.get(t.teamLogo);
        if (g) out[s.key] = g;
        continue;
      }
      const v = E.unitStat(t, s.key);
      if (v === null || v === undefined || Number.isNaN(v)) continue;
      if (s.format === 'record') continue;
      // (a stat only for context, the park: as it is, unranked)
      out[s.key] = s.format === 'rank' || s.infoOnly ? r(v) : (rankers[s.key]?.(v) ?? r(v));
    }
    return out;
  };
  const glossary = Object.fromEntries(teamStats.map((s) => [s.key, glossaryLine(s)]));
  const playerLine = (pos, unit, withRank = true) => {
    const stats = {};
    const keys = cfg.stats[pos] ?? cfg.stats.hitter ?? cfg.stats.any;
    for (const s of keys.map((k) => E.SKILL_STATS[pos].find((x) => x.key === k)).filter(Boolean)) {
      const v = E.unitStat(unit, s.key);
      if (v === null || v === undefined || Number.isNaN(v)) continue;
      stats[s.key] = shown(s.key, v);
      glossary[s.key] ??= glossaryLine(s);
    }
    const rank = withRank ? tabRank(pos, unit) : null;
    return {
      name: unit.name,
      pos,
      games: unit.games,
      ...(rank ? { tabRank: rank } : {}),
      stats,
      ...(unit.injured || unit.injuryStatus ? { injury: unit.injuryStatus ?? 'injured' } : {}),
      ...(unit.awards?.length ? { awards: unit.awards.map((a) => E.AWARD_INFO[a]?.name ?? a) } : {}),
    };
  };
  // each roster group's listed players (most playing time first)
  const groupsOf = (logo, unitsBy) =>
    gradeDefs.map((def) => [
      def.key,
      def.positions
        .flatMap((pos) => (unitsBy[pos] ?? []).filter((u) => u.teamLogo === logo).map((u) => ({ pos, u })))
        .sort((a, b) => def.usage(b.u) - def.usage(a.u))
        .slice(0, cfg.keep[def.key] ?? 5),
    ]);
  const rosterOf = (logo, unitsBy, withRank) => Object.fromEntries(groupsOf(logo, unitsBy).map(([key, list]) => [key, list.map(({ pos, u }) => playerLine(pos, u, withRank))]));
  // the listed players' season totals added up, by group: { players, war, ip... } (innings in the site's notation)
  const groupTotalsOf = (logo, unitsBy) =>
    Object.fromEntries(
      groupsOf(logo, unitsBy)
        .filter(([, list]) => list.length)
        .map(([key, list]) => {
          const out = { players: list.length };
          for (const k of cfg.groupTotals[key] ?? cfg.groupTotals.any ?? []) {
            const vals = list.map(({ u }) => E.unitStat(u, k)).filter((v) => v !== null && v !== undefined && Number.isFinite(v));
            if (!vals.length) continue;
            const sum = vals.reduce((a, b) => a + b, 0);
            out[k] = k === 'ip' ? innings(sum) : r(sum, 1);
          }
          // (the goalies' save % together: their saves over the shots they faced)
          if (key === 'goaltending' && cfg.finishing) {
            const sv = savesOf(list.map(({ u }) => u));
            if (sv.shots) out.savePct = r(sv.saves / sv.shots);
          }
          return [key, out];
        }),
    );
  const regularRosters = new Map(teams.map((t) => [t.teamLogo, rosterOf(t.teamLogo, units, true)]));
  // (here, before the postseason's units are made: making them empties these)
  const regularGroupTotals = new Map(teams.map((t) => [t.teamLogo, groupTotalsOf(t.teamLogo, units)]));
  const siteRank = new Map((grid.TM ?? []).map((t, i, all) => [t.teamLogo, [i + 1, all.length]]));
  const vsPos = new Map(teams.map((t) => [t.teamLogo, t.vsPos ?? (regular.HC ?? []).find((c) => c.teamLogo === t.teamLogo && c.vsPos)?.vsPos ?? null]));
  const lineOf = new Map(teams.map((t) => [t.teamLogo, teamLine(t)]));

  // ---- worked out across the league, so a report quotes them rather than computing them
  // the NHL's finishing and goaltending, all situations, from the players' rows: the skaters' goals over
  // their shots, the goalies' saves over the shots they faced, the two added up (PDO, 100 x), and the shots
  // a game for and against
  const extraStats = [];
  const extraOf = new Map(teams.map((t) => [t.teamLogo, {}]));
  if (cfg.finishing) {
    const skaterPositions = gradeDefs.flatMap((d) => d.positions).filter((p) => p !== 'G');
    for (const t of teams) {
      const skaters = skaterPositions.flatMap((pos) => (units[pos] ?? []).filter((u) => u.teamLogo === t.teamLogo));
      const goals = skaters.reduce((a, u) => a + (E.unitStat(u, 'goals') ?? 0), 0);
      const shots = skaters.reduce((a, u) => a + (E.unitStat(u, 'shots') ?? 0), 0);
      const sv = savesOf((units.G ?? []).filter((u) => u.teamLogo === t.teamLogo));
      const sh = shots ? goals / shots : null;
      const svPct = sv.shots ? sv.saves / sv.shots : null;
      Object.assign(extraOf.get(t.teamLogo), {
        shPct: r(sh),
        svPct: r(svPct),
        pdoAll: sh !== null && svPct !== null ? r(100 * (sh + svPct), 1) : null,
        shotsForPerGame: t.games ? r(shots / t.games, 1) : null,
        shotsAgainstPerGame: t.games && sv.shots ? r(sv.shots / t.games, 1) : null,
      });
    }
    extraStats.push(
      { key: 'shPct', label: 'Shooting %', description: "goals over shots on goal, all situations (the skaters' rows added up; a fraction: .105 is 10.5%)" },
      { key: 'svPct', label: 'Save %', description: "saves over shots faced, all situations (the goalies' rows added up)" },
      { key: 'pdoAll', label: 'PDO (all situations)', description: "shooting % plus save %, all situations, x 100 (empty-net goals lift the league's a little over 100: its average is in season.vsLeague; well above tends to fade; the Teams tab's PDO is 5-on-5)" },
      { key: 'shotsForPerGame', label: 'Shots / GP', description: 'shots on goal a game' },
      { key: 'shotsAgainstPerGame', label: 'Shots Against / GP', description: 'shots on goal allowed a game', negative: true },
    );
  }
  // the NBA's offensive and defensive ratings behind its Net Rtg
  for (const s of cfg.ratings ?? []) {
    for (const t of teams) extraOf.get(t.teamLogo)[s.key] = r(E.unitStat(t, s.key) ?? t.stats?.[s.key] ?? null, 1);
    extraStats.push(s);
  }
  const extraRank = Object.fromEntries(extraStats.map((s) => [s.key, ranker(teams.map((t) => extraOf.get(t.teamLogo)[s.key]), !!s.negative)]));
  const extraLine = (logo) => {
    const out = {};
    for (const s of extraStats) {
      const v = extraOf.get(logo)[s.key];
      if (v !== null && v !== undefined) out[s.key] = extraRank[s.key](v);
    }
    return out;
  };
  for (const s of extraStats) glossary[s.key] ??= glossaryLine(s);
  // the league's average of each of the team's ranked stats (the teams' mean) and the team's gap to it
  // (team minus league: positive is more, whichever way is better)
  const averaged = [...teamStats.filter((s) => !['grade', 'rank', 'record'].includes(s.format) && s.key !== 'playoffWins'), ...extraStats];
  const valueOf = (t, key) => (key in (extraOf.get(t.teamLogo) ?? {}) ? extraOf.get(t.teamLogo)[key] : E.unitStat(t, key));
  const leagueAvg = Object.fromEntries(averaged.map((s) => [s.key, leagueAverage(teams.map((t) => valueOf(t, s.key)))]).filter(([, v]) => v !== null));
  const vsLeagueOf = (t) => {
    const out = {};
    for (const [key, avg] of Object.entries(leagueAvg)) {
      const line = gapTo(valueOf(t, key), avg);
      if (line) out[key] = line;
    }
    return out;
  };

  // ---- the postseason's table (its own rows), once it has any
  let postTeams = new Map();
  let postRosters = new Map();
  let postGroupTotals = new Map();
  if (post && (post.TM?.length || post.HC?.length)) {
    const pu = E.unitsFor({ skillPlayers: post, unrankedRows: {} });
    const pteams = pu.TM ?? [];
    const pr = Object.fromEntries(teamStats.filter((s) => s.format !== 'grade' && s.format !== 'rank' && s.format !== 'record').map((s) => [s.key, ranker(pteams.map((t) => E.unitStat(t, s.key)), !!s.negative)]));
    postTeams = new Map(
      pteams.map((t) => {
        const out = { record: recordOf(t.stats), games: t.games };
        for (const s of teamStats) {
          if (['grade', 'record', 'rank'].includes(s.format)) continue;
          const v = E.unitStat(t, s.key);
          if (v !== null && v !== undefined && !Number.isNaN(v)) out[s.key] = s.infoOnly ? r(v) : (pr[s.key]?.(v) ?? r(v));
        }
        return [t.teamLogo, out];
      }),
    );
    postRosters = new Map(pteams.map((t) => [t.teamLogo, rosterOf(t.teamLogo, pu, false)]));
    postGroupTotals = new Map(pteams.map((t) => [t.teamLogo, groupTotalsOf(t.teamLogo, pu)]));
  }

  // ---- recent seasons (the Seasons tab's): each year's row and the default ranking's place
  const careers = siteFile(sport, 'careers/TM.json') ?? {};
  const seasonsDir = path.join(ROOT, 'apps', sport, 'src/StaticData/seasons');
  const pastYears = existsSync(seasonsDir) ? readdirSync(seasonsDir).filter((d) => /^\d{4}$/.test(d) && Number(d) < season).sort().slice(-5) : [];
  const pastUnits = new Map(pastYears.map((y) => [y, siteFile(sport, `seasons/${y}/units/TM.json`) ?? []]));
  const historyOf = (gsisId) =>
    pastYears
      .map((y) => {
        const u = pastUnits.get(y).find((x) => x.gsisId === gsisId);
        if (!u) return null;
        const c = (careers[gsisId] ?? []).find((e) => e[0] === Number(y));
        const keep = Object.fromEntries(Object.entries(u.stats).filter(([k, v]) => v !== null && !['wins', 'losses', 'ties', 'winPct'].includes(k) && glossary[k]));
        // (the NHL's standings points that season, 2 a win and 1 an overtime loss)
        const points = cfg.ties ? { standingsPoints: 2 * (u.stats.wins ?? 0) + (u.stats.ties ?? 0) } : {};
        return { season: cfg.label(Number(y)), record: recordOf(u.stats), ...points, ...(c && c[3] ? { siteRank: [c[3], c[4]] } : {}), ...keep };
      })
      .filter(Boolean);

  // ---- ESPN's side: each site team's ESPN team, the divisions, the schedules
  const abbrOf = (id) => standings.find((t) => t.id === id)?.abbr ?? id;
  const byLogo = new Map();
  for (const t of teams) {
    const espn = espnTeamOf(t.teamName ?? t.name, standings);
    if (!espn) log(`${sport}: no ESPN team for ${t.teamName ?? t.name}`);
    else byLogo.set(t.teamLogo, espn);
  }
  const logoOfEspn = new Map([...byLogo].map(([logo, e]) => [e.id, logo]));
  const coaches = siteFile(sport, 'coaches.json');
  const coachOf = (t) => {
    const rows = (regular.HC ?? []).filter((c) => c.teamLogo === t.teamLogo);
    if (rows.length) return rows.map((c) => c.name).join(', ');
    return coaches?.teams?.[t.teamName]?.head?.[0]?.name ?? null;
  };
  const coachIds = (t) => (regular.HC ?? []).filter((c) => c.teamLogo === t.teamLogo).map((c) => c.gsisId);

  // every team's regular season from ESPN (the league's per-game ranks and average need them all), the
  // games played by asOf when a past run's sheets are rebuilt (a game counts once it would have ended)
  const now = asOf ?? Date.now();
  const done = (g) => g.completed && (!asOf || Date.parse(g.date) + 4 * 3600e3 < asOf);
  const schedules = new Map(
    await Promise.all(teams.filter((t) => byLogo.has(t.teamLogo)).map(async (t) => [t.teamLogo, await teamSchedule(cfg.espn, byLogo.get(t.teamLogo).id, season, REGULAR)])),
  );
  const playedOf = new Map([...schedules].map(([logo, s]) => [logo, s.filter(done).map((g) => sideOf(g, byLogo.get(logo).id, abbrOf, cfg.periods))]));
  const perGame = { scored: new Map(), allowed: new Map(), differential: new Map() };
  let leagueScored = 0;
  let leagueGames = 0;
  for (const [logo, played] of playedOf) {
    if (!played.length) continue;
    const s = stretchOf(played, cfg);
    perGame.scored.set(logo, s.scoredPerGame);
    perGame.allowed.set(logo, s.allowedPerGame);
    perGame.differential.set(logo, s.differentialPerGame);
    leagueScored += s[`${cfg.scoring}Scored`];
    leagueGames += played.length;
  }
  const leaguePerGame = {
    rank: {
      scoredPerGame: ranker([...perGame.scored.values()], false),
      allowedPerGame: ranker([...perGame.allowed.values()], true),
      differentialPerGame: ranker([...perGame.differential.values()], false),
    },
    average: leagueGames ? r(leagueScored / leagueGames, 2) : null,
  };

  const out = new Map();
  for (const t of teams) {
    const key = keyOf(t.teamLogo);
    if (only && !only.includes(key)) continue;
    const espn = byLogo.get(t.teamLogo);
    if (!espn) continue;
    const st = status.get(espn.id) ?? { over: false };
    const mode = st.over ? 'recap' : 'preview';
    const schedule = schedules.get(t.teamLogo);
    // (the postseason's games from the scoreboards, which name the round; the ones to come from its schedule)
    const postSchedule = !st.over && games.some((g) => g.teams.includes(espn.id)) ? await teamSchedule(cfg.espn, espn.id, season, POSTSEASON).catch(() => []) : [];
    const played = playedOf.get(t.teamLogo);
    const postPlayed = games.filter((g) => g.type === POSTSEASON && done(g) && g.teams.includes(espn.id)).map((g) => sideOf(g, espn.id, abbrOf, cfg.periods));
    const division = standings.filter((x) => x.division === espn.division);
    const standingsRows = division
      .map((x) => {
        const logo = logoOfEspn.get(x.id);
        const row = teams.find((u) => u.teamLogo === logo);
        return row ? { team: x.abbr, record: recordOf(row.stats), pct: row.stats.winPct ?? 0 } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.pct - a.pct)
      .map(({ team, record }) => `${team} ${record}`);
    // the series played (each round once: its games, the result)
    const series = [];
    for (const g of postPlayed) {
      const s = series.find((x) => x.round === g.round && x.opp === g.opp);
      if (s) s.games.push(g);
      else series.push({ round: g.round ?? 'Postseason', opp: g.opp, games: [g] });
    }
    for (const s of series) {
      const w = s.games.filter((g) => g.result === 'W').length;
      s.result = `${w}-${s.games.length - w}`;
    }
    const upcoming = [...schedule, ...postSchedule]
      .filter((g) => !done(g) && Date.parse(g.date) >= now - 6 * 3600e3 && Date.parse(g.date) < now + 8 * 864e5)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((g) => sideOf(g, espn.id, abbrOf));
    // (each opponent of the week once: its record, place and season line, what its defense allows)
    const opponents = {};
    for (const g of upcoming) {
      const oppId = standings.find((x) => x.abbr === g.opp)?.id;
      const oppLogo = logoOfEspn.get(oppId);
      const oppRow = teams.find((u) => u.teamLogo === oppLogo);
      if (!oppRow || opponents[g.opp]) continue;
      opponents[g.opp] = { name: oppRow.teamName ?? oppRow.name, record: recordOf(oppRow.stats), siteRank: siteRank.get(oppLogo) ?? null, season: { ...lineOf.get(oppLogo), ...extraLine(oppLogo) }, ...(vsPos.get(oppLogo) ? { vsPosition: vsPos.get(oppLogo) } : {}) };
    }
    const ended = st.over
      ? st.champion
        ? `Won the ${cfg.final}${st.by ? ` over ${abbrOf(st.by)}` : ''}`
        : `${st.why[0].toUpperCase()}${st.why.slice(1)}${st.by ? ` to ${abbrOf(st.by)}` : ''}`
      : null;
    const regularResults = results(played);
    const totals = totalsOf({ played, postPlayed, stats: t.stats, groups: regularGroupTotals.get(t.teamLogo), postGroups: postGroupTotals.get(t.teamLogo) ?? null, cfg, league: leaguePerGame, over: st.over });
    const dossier = {
      kind: 'team',
      sport: cfg.name,
      mode,
      team: {
        name: t.teamName ?? t.name,
        abbr: espn.abbr,
        coach: coachOf(t),
        division: espn.division,
        record: recordOf(t.stats),
        divisionStandings: standingsRows,
        siteRank: siteRank.get(t.teamLogo) ?? null,
        ...(t.awards?.length ? { badges: t.awards.map((a) => E.AWARD_INFO[a]?.name ?? a) } : {}),
      },
      status: st.over ? { over: true, ended } : { over: false, inPostseason: postPlayed.length > 0 || !!espn.clincher && espn.clincher !== 'e' },
      season: {
        label: cfg.label(season),
        team: lineOf.get(t.teamLogo),
        ...(cfg.finishing ? { finishing: extraLine(t.teamLogo) } : {}),
        ...(cfg.ratings ? { ratings: extraLine(t.teamLogo) } : {}),
        vsLeague: vsLeagueOf(t),
        ...(vsPos.get(t.teamLogo) ? { vsPosition: vsPos.get(t.teamLogo) } : {}),
      },
      roster: regularRosters.get(t.teamLogo),
      results: {
        ...regularResults,
        last10: played.slice(-10),
      },
      ...(postTeams.get(t.teamLogo) || series.length
        ? { postseason: { team: postTeams.get(t.teamLogo) ?? null, series, roster: postRosters.get(t.teamLogo) ?? null } }
        : {}),
      ...(mode === 'preview' ? { weekAhead: { games: upcoming, opponents } } : {}),
      history: historyOf(t.gsisId),
      totals,
      glossary: { ...glossary, ...totalsGlossary(cfg) },
    };
    // (and for the runner: the row ids the site shows it under, the days of the games ESPN has played, the
    // site's own games, the week's schedule)
    out.set(key, {
      dossier,
      siteIds: [t.gsisId, ...coachIds(t)],
      logo: t.teamLogo,
      espnId: espn.id,
      name: t.teamName ?? t.name,
      mode,
      siteGames: t.games,
      playedDays: played.map((g) => g.date),
      postPlayedDays: postPlayed.map((g) => g.date),
      week: upcoming.map(({ date, opp, at }) => ({ date, opp, at })),
    });
  }
  return out;
}

// What a sheet's totals block holds, for its glossary
const upper = (s) => s[0].toUpperCase() + s.slice(1);
const totalsGlossary = (cfg) => ({
  totals: `Season totals added up from the site's numbers, to quote as they are: ${cfg.scoring} scored and allowed (the Game Log's scores), the differential, per game, ${cfg.ties ? 'the standings points' : 'the wins the margin implies'}, and each roster group's listed players combined`,
  [`${cfg.scoring}Scored`]: `${upper(cfg.scoring)} scored: the season's total over its games (the Game Log's scores)`,
  [`${cfg.scoring}Allowed`]: `${upper(cfg.scoring)} allowed: the season's total over its games`,
  differential: `Differential: ${cfg.scoring} scored minus allowed over the season`,
  ...(cfg.ties
    ? { standingsPoints: 'Standings points: 2 a win, 1 an overtime or shootout loss' }
    : { winsByDifferential: `Wins by differential: the wins its ${cfg.scoring} differential implies (its wins minus W vs ${cfg.name === 'MLB' ? 'Run' : 'Pt'} Diff)` }),
  groups: "Each roster group's listed players (roster.<group>) combined: the sum of their season totals",
  scoredPerGame: `${upper(cfg.scoring)} scored a game, ranked across the league (in totals.regularSeason)`,
  allowedPerGame: `${upper(cfg.scoring)} allowed a game, ranked across the league (1 = fewest) [lower is better]`,
  differentialPerGame: `${upper(cfg.scoring)} scored minus allowed a game, ranked across the league`,
  seasonGames: 'Games in a regular season',
  gamesLeft: 'Regular-season games still to play',
  pace: `The season's rates carried over ${cfg.seasonGames} games, rounded: wins${cfg.ties ? ', standings points' : ''} and the ${cfg.scoring} differential (while the regular season is on)`,
  vsLeague: `The team against the league: in totals.regularSeason, leaguePerGame = the league's ${cfg.scoring} a game (for and against alike) and the gaps (team minus league; for allowed, positive is worse); in season.vsLeague, each stat's league average (the teams' mean) and the gap (team minus league: positive is more, whichever way is better)`,
  recent: `totals.recent.last5 and last10: the last 5 and 10 games (once more than that are played): from and to (dates), the record${cfg.ties ? ' (W-L-OTL) and standings points (pointsPct = points over the most possible)' : ' and winPct'}, ${cfg.scoring} scored and allowed, the differential, a game's averages, and vsSeason = the stretch minus the whole season (positive: more lately; for allowedPerGame, worse)`,
  ...(cfg.periods ? { ot: cfg.name === 'MLB' ? 'ot: went to extra innings' : 'ot: went to overtime (or a shootout)' } : {}),
});

// A stretch of games' line: the record (the NHL's W-L-OTL, an overtime loss by its ot), scored and
// allowed, the differential, a game's averages, the win % (the NHL's points %)
export function stretchOf(games, cfg) {
  let w = 0;
  let l = 0;
  let otl = 0;
  let t = 0;
  let scored = 0;
  let allowed = 0;
  for (const g of games) {
    const [us, them] = g.score.split('-').map(Number);
    scored += us;
    allowed += them;
    if (g.result === 'W') w++;
    else if (g.result === 'T') t++;
    else if (cfg.ties && g.ot) otl++;
    else l++;
  }
  const n = games.length;
  const points = 2 * w + otl + t;
  return {
    games: n,
    from: games[0]?.date ?? null,
    to: games.at(-1)?.date ?? null,
    record: cfg.ties ? `${w}-${l}-${otl}` : `${w}-${l}${t ? `-${t}` : ''}`,
    ...(cfg.ties ? { standingsPoints: points, pointsPct: n ? r(points / (2 * n)) : null } : { winPct: n ? r((w + t / 2) / n) : null }),
    [`${cfg.scoring}Scored`]: scored,
    [`${cfg.scoring}Allowed`]: allowed,
    differential: scored - allowed,
    scoredPerGame: n ? r(scored / n, 2) : null,
    allowedPerGame: n ? r(allowed / n, 2) : null,
    differentialPerGame: n ? r((scored - allowed) / n, 2) : null,
  };
}

// The last 5 and 10 games against the season: each stretch's line and vsSeason, the stretch minus the
// whole season (its per-game averages, its win % or points %), once more games than that are played
export function recentOf(played, cfg, sizes = [5, 10]) {
  const season = stretchOf(played, cfg);
  const out = {};
  for (const n of sizes) {
    if (played.length <= n) continue;
    const s = stretchOf(played.slice(-n), cfg);
    const pct = cfg.ties ? 'pointsPct' : 'winPct';
    out[`last${n}`] = {
      ...s,
      vsSeason: {
        [pct]: r(s[pct] - season[pct]),
        scoredPerGame: r(s.scoredPerGame - season.scoredPerGame, 2),
        allowedPerGame: r(s.allowedPerGame - season.allowedPerGame, 2),
        differentialPerGame: r(s.differentialPerGame - season.differentialPerGame, 2),
      },
    };
  }
  return out;
}

// A team's totals block: the plain season totals of the sheet's own numbers (results, the record, the
// roster groups), so a report quotes them instead of adding them up
//   league   the league's per-game ranks ({ rank: { scoredPerGame... } }) and average (a game's scoring)
//   over     the regular season done for it: no games left, no pace
export function totalsOf({ played, postPlayed = [], stats = {}, groups = {}, postGroups = null, cfg, league = null, over = false }) {
  const sum = (games) => {
    let scored = 0;
    let allowed = 0;
    for (const g of games) {
      const [us, them] = g.score.split('-').map(Number);
      scored += us;
      allowed += them;
    }
    const n = games.length;
    return {
      games: n,
      [`${cfg.scoring}Scored`]: scored,
      [`${cfg.scoring}Allowed`]: allowed,
      differential: scored - allowed,
      scoredPerGame: n ? r(scored / n, 2) : null,
      allowedPerGame: n ? r(allowed / n, 2) : null,
    };
  };
  const regular = sum(played);
  const n = played.length;
  regular.differentialPerGame = n ? r(regular.differential / n, 2) : null;
  // (each a game, ranked across the league; the league's average and the gap to it)
  if (n && Number.isFinite(league?.average)) {
    regular.vsLeague = {
      leaguePerGame: league.average,
      scoredPerGame: r(regular.scoredPerGame - league.average, 2),
      allowedPerGame: r(regular.allowedPerGame - league.average, 2),
    };
  }
  for (const k of ['scoredPerGame', 'allowedPerGame', 'differentialPerGame']) if (league?.rank?.[k] && regular[k] !== null) regular[k] = league.rank[k](regular[k]) ?? regular[k];
  if (cfg.ties) regular.standingsPoints = 2 * (stats.wins ?? 0) + (stats.ties ?? 0);
  else if (Number.isFinite(stats.pythDiff) && Number.isFinite(stats.wins)) regular.winsByDifferential = r(stats.wins - stats.pythDiff, 1);
  // (the season's length, the games left and the pace over a full season, while it's on)
  if (cfg.seasonGames) {
    regular.seasonGames = cfg.seasonGames;
    const gp = (stats.wins ?? 0) + (stats.losses ?? 0) + (stats.ties ?? 0) || n;
    if (!over && gp && gp < cfg.seasonGames) {
      regular.gamesLeft = cfg.seasonGames - gp;
      const per = (v, games) => Math.round((v / games) * cfg.seasonGames);
      regular.pace = {
        wins: per(stats.wins ?? 0, gp),
        ...(cfg.ties ? { standingsPoints: per(regular.standingsPoints, gp) } : {}),
        ...(n ? { differential: per(regular.differential, n) } : {}),
      };
    }
  }
  const recent = recentOf(played, cfg);
  return {
    regularSeason: regular,
    ...(Object.keys(recent).length ? { recent } : {}),
    groups,
    ...(postPlayed.length ? { postseason: { ...sum(postPlayed), ...(postGroups ? { groups: postGroups } : {}) } } : {}),
  };
}
