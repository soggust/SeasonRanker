// The NBA's play-by-play aggregates (README.md here lists every field): ESPN's play-by-play (fetch.mjs's slim copies
// in .cache/pbp/nba, never committed) read into small per-player-season and per-team-season files,
// apps/nba/scripts/pbp/data/<season>.json, and a per-player-game file the bettor's research reads
// (.cache/pbp/nba/games-<season>.json, not committed).
//
//   node apps/nba/scripts/pbp/build.mjs [--seasons 2023,2024,2025,2026]
// Free; no network.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { PBP_DIR } from './fetch.mjs';

export const OUT = path.join(import.meta.dirname, 'data');
export const RIM_FT = 5; // plays.mjs's rim: 5 feet or closer
export const THREE_FT = 24;
export const CLUTCH_SEC = 300; // the last five minutes of the fourth quarter or overtime
export const CLUTCH_MARGIN = 5; // within five points
const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);
const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
const div = (a, b, d = r3) => (b > 0 ? d(a / b) : null);
const periodLen = (p) => (p <= 4 ? 720 : 300);
const elapsed = (p, clock) => (p <= 4 ? (p - 1) * 720 : 2880 + (p - 5) * 300) + (periodLen(p) - (clock ?? 0));

// A shot's zone: 0 the rim, 1 the other twos (mid-range and the paint off the rim), 2 a three; null not a shot
export function zoneOf(type, text, x, y) {
  const ok = Number.isFinite(x) && Number.isFinite(y);
  const three = /three point/i.test(text) || (ok && Math.hypot(x - 25, y) >= THREE_FT);
  if (three) return 2;
  if (ok) return Math.hypot(x - 25, y) <= RIM_FT ? 0 : 1;
  return /layup|dunk|tip/i.test(type) ? 0 : 1;
}

// One game's facts: per player { team, z: [rimA, rimM, midA, midM, thrA, thrM], ast (made field goals assisted),
// fta, ftm, clutch: [pts, fga, fgm], on (seconds on the court), pf, pa (his team's points for and against while
// on) }, per team { z, ast, fgm, fta, pts, opp } and the lineups' seconds known (secKnown: the share of the game
// a team's five was read)
export function gameFacts(g) {
  const P = new Map();
  const T = new Map();
  const teams = [g.home, g.away];
  const pl = (id, team) => P.get(id) ?? P.set(id, { team, z: [0, 0, 0, 0, 0, 0], ast: 0, fgm: 0, fta: 0, ftm: 0, clutch: [0, 0, 0], on: 0, pf: 0, pa: 0 }).get(id);
  const tm = (id) => T.get(id) ?? T.set(id, { z: [0, 0, 0, 0, 0, 0], ast: 0, fgm: 0, fta: 0, pts: 0, opp: 0, secKnown: 0 }).get(id);
  teams.forEach(tm);
  // (the five on the court: each period's from the players seen in it before they were subbed in; the first
  // period's the box's starters where the period's reading has fewer than five)
  const on = new Map(teams.map((t) => [t, new Set()]));
  let period = 0;
  let last = 0;
  const plays = g.plays;
  const fiveOf = (p0) => {
    const seen = new Map(teams.map((t) => [t, new Set()]));
    const entered = new Set();
    for (let i = p0; i < plays.length && plays[i][0] === plays[p0][0]; i++) {
      const [, , team, type, , parts] = plays[i];
      if (!teams.includes(team)) continue;
      if (/substitution/i.test(type) && parts.length >= 2) {
        const [inn, out] = parts;
        if (!entered.has(out) && !seen.get(team).has(out)) seen.get(team).add(out);
        entered.add(inn);
        continue;
      }
      // (the play's first participant is its team's; the second (an assister, a blocker, a fouler) may be either)
      const who = parts[0];
      if (who && !entered.has(who)) seen.get(team).add(who);
    }
    return seen;
  };
  for (let i = 0; i < plays.length; i++) {
    const [p, clock, team, type, text, parts, score, shooting, hs, as, x, y] = plays[i];
    if (!Number.isFinite(p)) continue;
    const t = elapsed(p, clock);
    if (p !== period) {
      period = p;
      last = elapsed(p, periodLen(p));
      const seen = fiveOf(i);
      for (const tt of teams) {
        let s = [...seen.get(tt)].slice(0, 5);
        if (s.length < 5 && p === 1 && g.starters?.[tt]?.length === 5) s = g.starters[tt];
        on.set(tt, new Set(s));
      }
    }
    // (the seconds since the last play to every player on the court)
    const dt = Math.max(0, t - last);
    if (dt) for (const tt of teams) {
      if (on.get(tt).size === 5) tm(tt).secKnown += dt;
      for (const id of on.get(tt)) pl(id, tt).on += dt;
    }
    last = t;
    if (score && teams.includes(team)) {
      const opp = team === g.home ? g.away : g.home;
      tm(team).pts += score;
      tm(opp).opp += score;
      for (const id of on.get(team)) pl(id, team).pf += score;
      for (const id of on.get(opp)) pl(id, opp).pa += score;
    }
    if (/substitution/i.test(type) && parts.length >= 2 && teams.includes(team)) {
      const s = on.get(team);
      s.delete(parts[1]);
      s.add(parts[0]);
      continue;
    }
    const who = parts[0];
    if (!who || !teams.includes(team)) continue;
    const me = pl(who, team);
    const clutch = p >= 4 && (clock ?? 999) <= CLUTCH_SEC && Number.isFinite(hs) && Number.isFinite(as) && Math.abs(hs - as - (team === g.home ? score : -score)) <= CLUTCH_MARGIN;
    if (/free throw/i.test(type) || /free throw/i.test(text)) {
      me.fta++;
      tm(team).fta++;
      if (score) me.ftm++;
      if (clutch) me.clutch[0] += score;
      continue;
    }
    if (!shooting) continue;
    const z = zoneOf(type, text, x, y);
    me.z[z * 2]++;
    tm(team).z[z * 2]++;
    if (clutch) me.clutch[1]++;
    if (score) {
      me.z[z * 2 + 1]++;
      tm(team).z[z * 2 + 1]++;
      me.fgm++;
      tm(team).fgm++;
      if (clutch) (me.clutch[0] += score), me.clutch[2]++;
      if (/assists\)/i.test(text)) (me.ast++, tm(team).ast++);
    }
  }
  return { P, T };
}

const zoneBlock = (z, fta) => {
  const fga = z[0] + z[2] + z[4];
  return { fga, rimShare: div(z[0], fga), midShare: div(z[2], fga), threeShare: div(z[4], fga), rimPct: div(z[1], z[0]), midPct: div(z[3], z[2]), threePct: div(z[5], z[4]), ftRate: div(fta, fga) };
};

// (the players' names: the desk's box-score cache, playerlogs.mjs)
const NAMES = new Map();
try {
  const box = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../../../.cache/model/players-nba.json'), 'utf8'));
  for (const k of Object.values(box)) for (const w of ['h', 'a']) for (const r of k[w] ?? []) NAMES.set(String(r[0]), r[1]);
} catch {}

export function buildSeason(season, files) {
  const players = new Map();
  const teams = new Map();
  const games = [];
  for (const f of files) {
    const g = JSON.parse(gunzipSync(readFileSync(f)).toString('utf8'));
    if (g.season !== season) continue;
    const { P, T } = gameFacts(g);
    for (const [id, x] of P) {
      const s = players.get(id) ?? players.set(id, { team: new Map(), g: 0, z: [0, 0, 0, 0, 0, 0], ast: 0, fgm: 0, fta: 0, ftm: 0, clutch: [0, 0, 0], on: 0, pf: 0, pa: 0, offF: 0, offA: 0, offSec: 0 }).get(id);
      s.g++;
      s.team.set(x.team, (s.team.get(x.team) ?? 0) + 1);
      for (let i = 0; i < 6; i++) s.z[i] += x.z[i];
      for (let i = 0; i < 3; i++) s.clutch[i] += x.clutch[i];
      for (const k of ['ast', 'fgm', 'fta', 'ftm', 'on', 'pf', 'pa']) s[k] += x[k];
      const tt = T.get(x.team);
      const known = tt?.secKnown ?? 0;
      // (his team's points for and against with him off the court, in the stretches its five was read)
      if (tt && known > 0) {
        s.offF += tt.pts - x.pf;
        s.offA += tt.opp - x.pa;
        s.offSec += Math.max(0, known - x.on);
      }
      games.push([g.id, g.t, id, x.team, ...x.z, x.ast, x.fta, x.ftm, Math.round(x.on), x.pf, x.pa]);
    }
    for (const [id, x] of T) {
      const opp = id === g.home ? g.away : g.home;
      const o = T.get(opp);
      const s = teams.get(id) ?? teams.set(id, { g: 0, z: [0, 0, 0, 0, 0, 0], ast: 0, fgm: 0, fta: 0, oz: [0, 0, 0, 0, 0, 0], oast: 0, ofgm: 0, ofta: 0, known: 0, secs: 0 }).get(id);
      s.g++;
      for (let i = 0; i < 6; i++) (s.z[i] += x.z[i]), (s.oz[i] += o.z[i]);
      s.ast += x.ast;
      s.fgm += x.fgm;
      s.fta += x.fta;
      s.oast += o.ast;
      s.ofgm += o.fgm;
      s.ofta += o.fta;
      s.known += x.secKnown;
      s.secs += elapsed(g.plays.at(-1)?.[0] ?? 4, 0);
    }
  }
  const out = {
    players: [...players].map(([id, s]) => {
      const min = s.on / 60;
      const offMin = s.offSec / 60;
      return {
        id, name: NAMES.get(id) ?? null, team: [...s.team].sort((a, b) => b[1] - a[1])[0][0], games: s.g, minutesOnCourt: r1(min),
        shots: zoneBlock(s.z, s.fta), assistedPct: div(s.ast, s.fgm), ftm: s.ftm, fta: s.fta,
        clutch: { points: s.clutch[0], fga: s.clutch[1], fgm: s.clutch[2], fgPct: div(s.clutch[2], s.clutch[1]) },
        onOff: min >= 100 && offMin >= 100 ? { onNetPer48: r1(((s.pf - s.pa) / min) * 48), offNetPer48: r1(((s.offF - s.offA) / offMin) * 48), diffPer48: r1(((s.pf - s.pa) / min - (s.offF - s.offA) / offMin) * 48), onMinutes: r1(min), offMinutes: r1(offMin) } : null,
      };
    }).sort((a, b) => a.team.localeCompare(b.team) || a.id.localeCompare(b.id)),
    teams: [...teams].map(([id, s]) => ({ team: id, games: s.g, offense: { ...zoneBlock(s.z, s.fta), assistedPct: div(s.ast, s.fgm) }, defense: { ...zoneBlock(s.oz, s.ofta), assistedPct: div(s.oast, s.ofgm) }, lineupsRead: div(s.known, s.secs) })).sort((a, b) => a.team.localeCompare(b.team)),
  };
  return { out, games };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const arg = process.argv.indexOf('--seasons');
  const seasons = (arg > 0 ? process.argv[arg + 1] : '2023,2024,2025,2026').split(',').map(Number);
  mkdirSync(OUT, { recursive: true });
  const files = existsSync(PBP_DIR) ? readdirSync(PBP_DIR).filter((f) => /^\d+\.json\.gz$/.test(f)).map((f) => path.join(PBP_DIR, f)) : [];
  for (const season of seasons) {
    const t0 = Date.now();
    const { out, games } = buildSeason(season, files);
    writeFileSync(path.join(OUT, `${season}.json`), JSON.stringify({ v: 1, sport: 'nba', season, source: 'ESPN play-by-play', ...out }));
    writeFileSync(path.join(PBP_DIR, `games-${season}.json`), JSON.stringify({ cols: ['game', 't', 'id', 'team', 'rimA', 'rimM', 'midA', 'midM', 'thrA', 'thrM', 'ast', 'fta', 'ftm', 'onSec', 'pf', 'pa'], rows: games }));
    console.log(`nba pbp ${season}: ${out.players.length} players, ${out.teams.length} teams, ${games.length} player games (${Math.round((Date.now() - t0) / 1000)}s)`);
  }
}
