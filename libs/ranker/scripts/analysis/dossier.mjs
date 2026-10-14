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
    name: 'MLB', espn: 'baseball/mlb', game: 'baseball', label: (y) => String(y), keep: { hitters: 9, rotation: 5, bullpen: 5 }, final: 'World Series',
    stats: { SP: ['war', 'ip', 'era', 'fip', 'whip', 'kPct', 'bbPct', 'strikeOuts'], RP: ['war', 'ip', 'era', 'fip', 'saves', 'holds', 'kPct', 'bbPct'], hitter: ['war', 'pa', 'avg', 'obp', 'slg', 'homeRuns', 'rbi', 'stolenBases', 'wrcPlus', 'defRuns'] },
  },
  nba: {
    name: 'NBA', espn: 'basketball/nba', game: 'basketball', label: (y) => `${y - 1}-${String(y).slice(2)}`, keep: { backcourt: 4, wings: 3, frontcourt: 5 }, final: 'NBA Finals',
    stats: { any: ['minutes', 'points', 'rebounds', 'assists', 'threes', 'tsPct', 'usgPct', 'bpm', 'ws', 'onOff'] },
  },
  nhl: {
    name: 'NHL', espn: 'hockey/nhl', game: 'hockey', label: (y) => `${y - 1}-${String(y).slice(2)}`, keep: { forwards: 9, blueline: 6, goaltending: 2 }, final: 'Stanley Cup Final', ties: true,
    stats: { G: ['gamesStarted', 'savePct', 'gaa', 'gsax', 'shutouts'], any: ['toi', 'goals', 'assists', 'points', 'plusMinus', 'ppPoints', 'shots', 'xgfPct', 'gameScore'] },
  },
};

const GRADES = ['F', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+'];
const r = (v, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(d)));

// A site file as published: origin/master's copy (what the live site shows; the data bots commit there),
// else this checkout's. null when neither has it.
export function siteFile(sport, rel) {
  const repoPath = `apps/${sport}/src/StaticData/${rel}`;
  try {
    return JSON.parse(execFileSync('git', ['show', `origin/master:${repoPath}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 29, stdio: ['ignore', 'pipe', 'ignore'] }));
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

// A game from one team's side: { date, opp, at, score, result } (score: ours-theirs)
function sideOf(g, id, abbrOf) {
  const opp = g.teams.find((t) => t !== id);
  const us = g.score[id];
  const them = g.score[opp];
  return {
    date: dayOf(g.date),
    opp: abbrOf(opp),
    at: g.home === id ? 'home' : 'away',
    ...(g.completed ? { score: `${us}-${them}`, result: us > them ? 'W' : us < them ? 'L' : 'T' } : {}),
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
  return {
    byMonth: [...months.values()].map(({ month, w, l, scored, allowed }) => ({ month, record: `${w}-${l}`, scored, allowed })),
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
export async function buildDossiers(sport, { season, status, standings, games, only = null, log = () => {} }) {
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
      stats[s.key] = r(v);
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
  const rosterOf = (logo, unitsBy, withRank) =>
    Object.fromEntries(
      gradeDefs.map((def) => [
        def.key,
        def.positions
          .flatMap((pos) => (unitsBy[pos] ?? []).filter((u) => u.teamLogo === logo).map((u) => ({ pos, u })))
          .sort((a, b) => def.usage(b.u) - def.usage(a.u))
          .slice(0, cfg.keep[def.key] ?? 5)
          .map(({ pos, u }) => playerLine(pos, u, withRank)),
      ]),
    );
  const regularRosters = new Map(teams.map((t) => [t.teamLogo, rosterOf(t.teamLogo, units, true)]));
  const siteRank = new Map((grid.TM ?? []).map((t, i, all) => [t.teamLogo, [i + 1, all.length]]));
  const vsPos = new Map(teams.map((t) => [t.teamLogo, t.vsPos ?? (regular.HC ?? []).find((c) => c.teamLogo === t.teamLogo && c.vsPos)?.vsPos ?? null]));
  const lineOf = new Map(teams.map((t) => [t.teamLogo, teamLine(t)]));

  // ---- the postseason's table (its own rows), once it has any
  let postTeams = new Map();
  let postRosters = new Map();
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
        return { season: cfg.label(Number(y)), record: recordOf(u.stats), ...(c && c[3] ? { siteRank: [c[3], c[4]] } : {}), ...keep };
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

  const out = new Map();
  const now = Date.now();
  for (const t of teams) {
    const key = keyOf(t.teamLogo);
    if (only && !only.includes(key)) continue;
    const espn = byLogo.get(t.teamLogo);
    if (!espn) continue;
    const st = status.get(espn.id) ?? { over: false };
    const mode = st.over ? 'recap' : 'preview';
    const schedule = await teamSchedule(cfg.espn, espn.id, season, REGULAR);
    // (the postseason's games from the scoreboards, which name the round; the ones to come from its schedule)
    const postSchedule = !st.over && games.some((g) => g.teams.includes(espn.id)) ? await teamSchedule(cfg.espn, espn.id, season, POSTSEASON).catch(() => []) : [];
    const played = schedule.filter((g) => g.completed).map((g) => sideOf(g, espn.id, abbrOf));
    const postPlayed = games.filter((g) => g.type === POSTSEASON && g.completed && g.teams.includes(espn.id)).map((g) => sideOf(g, espn.id, abbrOf));
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
      .filter((g) => !g.completed && Date.parse(g.date) >= now - 6 * 3600e3 && Date.parse(g.date) < now + 8 * 864e5)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((g) => sideOf(g, espn.id, abbrOf));
    // (each opponent of the week once: its record, place and season line, what its defense allows)
    const opponents = {};
    for (const g of upcoming) {
      const oppId = standings.find((x) => x.abbr === g.opp)?.id;
      const oppLogo = logoOfEspn.get(oppId);
      const oppRow = teams.find((u) => u.teamLogo === oppLogo);
      if (!oppRow || opponents[g.opp]) continue;
      opponents[g.opp] = { name: oppRow.teamName ?? oppRow.name, record: recordOf(oppRow.stats), siteRank: siteRank.get(oppLogo) ?? null, season: lineOf.get(oppLogo), ...(vsPos.get(oppLogo) ? { vsPosition: vsPos.get(oppLogo) } : {}) };
    }
    const ended = st.over
      ? st.champion
        ? `Won the ${cfg.final}${st.by ? ` over ${abbrOf(st.by)}` : ''}`
        : `${st.why[0].toUpperCase()}${st.why.slice(1)}${st.by ? ` to ${abbrOf(st.by)}` : ''}`
      : null;
    const regularResults = results(played);
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
      glossary,
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
