// Players' game-by-game lines, for the props (props.mjs): every game each player played in the history, with
// his team, the opponent, the date and the stats the props are on. Kept under .cache/model (rebuilt from the
// sources when it's lost: a first run asks for everything, later ones only for the finals new since):
//
//   NFL  nflverse's weekly player stats (stats_player_week_<season>; a pass-catcher's receiving air yards too,
//        s.airYds: his depth, matchups.mjs; NA or blank unread, airYdsOf; his rushing and receiving touchdowns,
//        s.rushTd and s.recTd: the anytime touchdown's, anytime.mjs), ESPN ids from nflverse's players file; and
//        nflverse's snap counts (snap_counts_<season>): each row's offensive snaps (s.snaps), and a row of 0s for
//        an offensive player who took snaps with no stats (never targeted, never handed the ball: he played),
//        for the games the weekly stats have (a game only the snap counts have yet isn't in the history: its
//        players' stats would read as 0s). A game the stats have and the snap counts don't (they lag, or the
//        season's file couldn't be read) holds only the players who got the ball: the rows' snapGap says how
//        many (props.mjs flags the NFL's props, or skips them when it's a season's quarter or more). And each side's
//        defenders in a game, from the same snap counts (rows.defense: `<game>|<team>` to [id, position, defensive
//        snaps]; matchups.mjs defenseOut, the other side's key defenders out)
//   NBA  ESPN's box scores: minutes, points, rebounds, assists, threes, field goals and free throws tried (the
//        usage the work a teammate leaves is shared by: matchups.mjs), whether he started, threes tried,
//        offensive and defensive rebounds, turnovers and fouls; and each final's betting lines (boxMarket)
//   NHL  ESPN's box scores: skaters' time on ice, power-play time on ice, shots on goal, goals and assists;
//        goalies' saves
//   MLB  StatsAPI: the probable starters' game logs (strikeouts, outs: kept in the context's facts already) and the
//        lineups' batters' game logs (hits, total bases, home runs, plate appearances)
//
// (an NBA or NHL final's lines kept before the sport's latest fields were (LINES_V: the usage and the power-play
// time, then the NBA's starter flag and the rest) are asked again once; one whose summary can't be had keeps
// its old lines, those fields missing: matchups.mjs reads them as unknown)
//
// A row: { pid, name, pos, date, season, team (ESPN id), opp (ESPN id), game (ESPN id or null), home, s: {stat: value} }
// (the NFL's also his draft: { year: his first NFL season, pick: overall, 0 undrafted }, or null: nflverse's players
// file; and his birth date, born: 'YYYY-MM-DD' or null, the same file's, the start-of-season prior's age (project.mjs
// sp); college production (CollegeFootballData) not read: it needs a key, CFBD_API_KEY, not set up)
// Every row is a game he played in (took the field: a snap, a minute, a shift, a plate appearance), whatever he
// did in it: the props' history (props.mjs) is every game a bet on him would have had action in

import path from 'node:path';
import { summary } from './espn.mjs';
import { CACHE, etDay, mlbPeople, nflverseRows, pool, readJson, writeJson } from './sources.mjs';

// (a row's receiving air yards: unread (undefined) where nflverse left them NA or blank, or the column's missing,
// so matchups.mjs learnAir skips the row, not a 0-yard target pulling his depth and the league's down)
export const airYdsOf = (v) => (/^-?\d+(\.\d+)?$/.test(String(v ?? '').trim()) ? Number(v) : undefined);

const fileOf = (sport) => path.join(CACHE, `players-${sport}.json`);
// (each sport's kept lines, read once a run; dirty: changed since)
const kept = new Map();
const load = (sport) => {
  if (!kept.has(sport)) kept.set(sport, { data: readJson(fileOf(sport), {}), dirty: false });
  return kept.get(sport).data;
};
const save = (sport) => {
  writeJson(fileOf(sport), load(sport));
  kept.get(sport).dirty = false;
};

// (the kept lines' version, a sport's own: 2, the NBA's with field goals and free throws tried, the NHL's with
// power-play time; 3, the NBA's with the starter flag, threes tried, offensive and defensive rebounds, turnovers
// and fouls, and the game's betting lines (m) where the summary has them; the NHL's with the game's total (t: the
// betting lines' goals, where the summary has them; audit #13, props.mjs CTX mTotal))
const LINES_V = { nba: 3, nhl: 3 };

// An NBA or NHL final's player lines from its summary, kept: context.mjs reads each new final's summary for
// its own facts and hands it here too, so a final's summary is asked for once. An NBA final's betting lines
// too (m: [the home side's margin, the total], the summary's pickcenter, DraftKings' where it's there: ESPN's
// line at the tip, a close; none on 2025-26's first weeks' finals): the props' blowout by role (props.mjs
// blowS, blowB) reads the history's spread from them (boxMarket). An NHL final's total alone (t: its puck line's
// 1.5 isn't a margin), the same close: the skaters' market total (boxTotals)
export function recordBox(sport, g, body) {
  const box = body?.boxscore?.players;
  if (!box?.length || (sport !== 'nba' && sport !== 'nhl')) return;
  const sides = {};
  for (const p of box) {
    const where = String(p.team?.id) === String(g.home) ? 'h' : String(p.team?.id) === String(g.away) ? 'a' : null;
    if (where) sides[where] = sport === 'nba' ? nbaLines(p) : nhlLines(p);
  }
  if (sides.h && sides.a) {
    const m = pickLines(body);
    const lines = sport === 'nba' ? (m ? { m } : {}) : m?.[1] > 0 ? { t: m[1] } : {};
    load(sport)[g.id] = { ...sides, ...lines, v: LINES_V[sport] };
    kept.get(sport).dirty = true;
  }
}

// (a summary's betting lines: [the home side's margin, the total] from its pickcenter (the spread is the home
// side's: -5.5 a 5.5-point home favorite), DraftKings' first; null without both)
export function pickLines(body) {
  const list = Array.isArray(body?.pickcenter) ? body.pickcenter : [];
  const pc = list.find((x) => /draftkings/i.test(x?.provider?.name ?? '')) ?? list[0];
  const spread = Number(pc?.spread);
  const total = Number(pc?.overUnder);
  return pc && pc.spread !== null && pc.spread !== undefined && Number.isFinite(spread) && Number.isFinite(total) && total > 0 ? [-spread, total] : null;
}

// The NBA history's betting lines as implied points by ESPN's game id ([home, away]: the total split by the
// home side's margin, as props.mjs marketPts), from the kept finals' (recordBox m); null with none (the
// blowout by role reads the game model's margin then, as live without a line)
export function boxMarket(sport) {
  const out = new Map();
  for (const [id, k] of Object.entries(load(sport))) {
    const [margin, total] = Array.isArray(k?.m) ? k.m : [];
    if (!Number.isFinite(margin) || !(total > 0)) continue;
    const h = (total + margin) / 2;
    const a = (total - margin) / 2;
    if (h > 0 && a > 0) out.set(String(id), [h, a]);
  }
  return out.size ? out : null;
}

// The NHL history's betting totals by ESPN's game id (the kept finals' t, recordBox: the close, a mild look-ahead
// as the NBA's lines); null with none (the market total's term reads 0 then: the stat as without it)
export function boxTotals(sport) {
  const out = new Map();
  for (const [id, k] of Object.entries(load(sport))) if (k?.t > 0) out.set(String(id), k.t);
  return out.size ? out : null;
}

// Every player row for a sport, the kept ones brought up to date
export async function playerRows(sport, cfg, history, facts) {
  if (sport === 'nfl') return nflRows(cfg, history, facts);
  if (sport === 'mlb') return mlbRows(history, facts);
  return boxRows(sport, cfg, history);
}

// ---------------------------------------------------------------------------
// NFL: nflverse's weekly stats
// ---------------------------------------------------------------------------
async function nflRows(cfg, history, facts) {
  const rows = facts.nfl;
  if (!rows?.size) return [];
  const byGameId = new Map([...rows.values()].map((r) => [r.game_id, r]));
  const games = new Map(history.map((g) => [g.id, g]));
  // (nflverse's team codes as ESPN's team ids, from the games they share)
  const team = new Map();
  for (const r of rows.values()) {
    const g = games.get(r.espn);
    if (!g) continue;
    team.set(`${r.season}|${r.home_team}`, g.home);
    team.set(`${r.season}|${r.away_team}`, g.away);
  }
  const players = await nflverseRows('players', 'players.csv.gz', ['gsis_id', 'espn_id', 'pfr_id', 'rookie_season', 'draft_year', 'draft_pick', 'birth_date'], 24 * 7);
  const known = (players ?? []).filter((p) => p.espn_id && p.espn_id !== 'NA');
  const espnOf = new Map(known.map((p) => [p.gsis_id, String(Number(p.espn_id))]));
  // (each player's draft: his first NFL season (nflverse's rookie season, else his draft's year) and his pick
  // overall, 0 undrafted; null where neither is known (his rows keep the position's prior: project.mjs dp).
  // Known before his first game: no look-ahead)
  const draftOf = new Map();
  for (const p of known) {
    const year = Number(p.rookie_season) || Number(p.draft_year) || 0;
    const pick = Number(p.draft_pick) || 0;
    if (year >= 1990) draftOf.set(String(Number(p.espn_id)), { year, pick: pick > 0 ? pick : 0 });
  }
  // (his birth date: the start-of-season prior's age (project.mjs sp), known before any game of his)
  const bornOf = new Map(known.filter((p) => /^\d{4}-\d\d-\d\d$/.test(p.birth_date ?? '')).map((p) => [String(Number(p.espn_id)), p.birth_date]));
  const espnOfPfr = new Map(known.filter((p) => p.pfr_id && p.pfr_id !== 'NA').map((p) => [p.pfr_id, String(Number(p.espn_id))]));
  const current = Math.max(...history.map((g) => g.season));
  const out = [];
  // (the games the weekly stats have and the snap counts don't, by season: { season: [missing, of] })
  const gap = {};
  // (each game's defenders by side, `<game>|<team>` (ESPN's ids): the other side's key defenders out (audit #15,
  // matchups.mjs defenseOut); a game whose snap counts weren't read has none)
  const defense = new Map();
  const cols = ['player_id', 'player_display_name', 'position', 'season', 'week', 'game_id', 'team', 'opponent_team', 'completions', 'attempts', 'passing_yards', 'passing_tds', 'passing_interceptions', 'carries', 'rushing_yards', 'receptions', 'targets', 'receiving_yards', 'receiving_air_yards', 'rushing_tds', 'receiving_tds'];
  for (let season = cfg.deepen ?? current - 1; season <= current; season++) {
    const stats = await nflverseRows('stats_player', `stats_player_week_${season}.csv.gz`, cols, season === current ? 12 : 24 * 365);
    // (each game's offensive snaps by player, nflverse's snap counts: who took the field, a stat or not)
    const snaps = await nflverseRows('snap_counts', `snap_counts_${season}.csv.gz`, ['game_id', 'pfr_player_id', 'player', 'position', 'team', 'offense_snaps', 'defense_snaps'], season === current ? 12 : 24 * 365).catch(() => null);
    const snapOf = new Map();
    for (const x of snaps ?? []) {
      const pid = espnOfPfr.get(x.pfr_player_id);
      if (pid && Number(x.offense_snaps) > 0) snapOf.set(`${x.game_id}|${pid}`, x);
    }
    const seen = new Set();
    // (the games each file has: a snap row's 0s only for a game the stats have, and the stats' games the snap
    // counts lack, counted)
    const statGames = new Set((stats ?? []).filter((s) => byGameId.has(s.game_id)).map((s) => s.game_id));
    const snapGames = new Set((snaps ?? []).map((x) => x.game_id));
    const missing = [...statGames].filter((id) => !snapGames.has(id)).length;
    const ahead = [...snapGames].filter((id) => byGameId.has(id) && !statGames.has(id)).length;
    if (statGames.size) gap[season] = [missing, statGames.size];
    if (missing) console.warn(`nfl: the snap counts ${snaps ? `lack ${missing} of ${statGames.size} games` : 'not read'} in ${season}: those games' players without a stat aren't in the history (the props flagged)`);
    if (ahead) console.log(`nfl: ${ahead} games in ${season}'s snap counts not in its weekly stats yet: left out`);
    // (each side's defenders in a game the stats have: [id (ESPN's, else pfr:<id>), position, defensive snaps])
    for (const x of snaps ?? []) {
      const r = byGameId.get(x.game_id);
      const n = Number(x.defense_snaps) || 0;
      const side = r && statGames.has(x.game_id) ? team.get(`${season}|${x.team}`) : null;
      if (!side || !(n > 0) || !x.pfr_player_id) continue;
      const key = `${r.espn}|${side}`;
      defense.set(key, [...(defense.get(key) ?? []), [espnOfPfr.get(x.pfr_player_id) ?? `pfr:${x.pfr_player_id}`, x.position, n]]);
    }
    for (const s of stats ?? []) {
      const r = byGameId.get(s.game_id);
      const pid = espnOf.get(s.player_id);
      if (!r || !pid) continue;
      const n = (k) => Number(s[k]) || 0;
      seen.add(`${s.game_id}|${pid}`);
      out.push({
        pid,
        name: s.player_display_name,
        pos: s.position,
        date: games.get(r.espn)?.date ?? `${r.gameday}T17:00Z`,
        season,
        team: team.get(`${season}|${s.team}`) ?? null,
        opp: team.get(`${season}|${s.opponent_team}`) ?? null,
        game: r.espn,
        home: r.home_team === s.team,
        draft: draftOf.get(pid) ?? null,
        born: bornOf.get(pid) ?? null,
        s: {
          passYds: n('passing_yards'),
          passAtt: n('attempts'),
          passCmp: n('completions'),
          passTd: n('passing_tds'),
          passInt: n('passing_interceptions'),
          rushYds: n('rushing_yards'),
          rushAtt: n('carries'),
          recYds: n('receiving_yards'),
          rec: n('receptions'),
          rushRecYds: n('rushing_yards') + n('receiving_yards'),
          targets: n('targets'),
          airYds: airYdsOf(s.receiving_air_yards),
          snaps: Number(snapOf.get(`${s.game_id}|${pid}`)?.offense_snaps) || 0,
          // (his rushing and receiving touchdowns: the anytime touchdown's (anytime.mjs))
          rushTd: n('rushing_tds'),
          recTd: n('receiving_tds'),
        },
      });
    }
    // (an offensive player who took snaps but has no stats row (a receiver never targeted, a back never handed
    // the ball): he played, his line all 0s, as DraftKings grades him (props.mjs statInFinal: he took the field,
    // so 0, not no action). Without these the props' history would only hold the games he got the ball in)
    for (const [key, x] of snapOf) {
      if (seen.has(key) || !['QB', 'RB', 'FB', 'WR', 'TE'].includes(x.position)) continue;
      const r = byGameId.get(x.game_id);
      if (!r || !statGames.has(x.game_id)) continue;
      const home = x.team === r.home_team ? true : x.team === r.away_team ? false : null;
      if (home === null) continue;
      const [own, other] = home ? [r.home_team, r.away_team] : [r.away_team, r.home_team];
      out.push({
        pid: key.split('|')[1],
        name: x.player,
        pos: x.position,
        date: games.get(r.espn)?.date ?? `${r.gameday}T17:00Z`,
        season,
        team: team.get(`${season}|${own}`) ?? null,
        opp: team.get(`${season}|${other}`) ?? null,
        game: r.espn,
        home,
        draft: draftOf.get(key.split('|')[1]) ?? null,
        born: bornOf.get(key.split('|')[1]) ?? null,
        s: { passYds: 0, passAtt: 0, passCmp: 0, passTd: 0, passInt: 0, rushYds: 0, rushAtt: 0, recYds: 0, rec: 0, rushRecYds: 0, targets: 0, airYds: 0, snaps: Number(x.offense_snaps) || 0, rushTd: 0, recTd: 0 },
      });
    }
  }
  // (the gap: the games missing their snap counts, all told and the worst season's share)
  const seasons = Object.values(gap);
  out.defense = defense;
  out.snapGap = { games: seasons.reduce((t, [m]) => t + m, 0), share: seasons.reduce((t, [m, of]) => Math.max(t, m / of), 0), seasons: gap };
  return out;
}

// ---------------------------------------------------------------------------
// NBA and NHL: ESPN's box scores, one summary a final (kept: only the new ones asked)
// ---------------------------------------------------------------------------
async function boxRows(sport, cfg, history) {
  const lines = load(sport);
  // (finals still without lines: the summaries context.mjs didn't read this run, all of them on a cold cache;
  // and the ones kept before LINES_V, asked again once: one whose summary can't be had keeps its old lines)
  const V = LINES_V[sport];
  const todo = history.filter((g) => g.final && g.hs !== null && (!(g.id in lines) || (lines[g.id]?.v ?? 1) < V));
  if (todo.length) {
    const t0 = Date.now();
    await pool(todo, 6, async (g) => recordBox(sport, g, await summary(cfg.league, g.id)));
    for (const g of todo) if (lines[g.id] && (lines[g.id].v ?? 1) < V) (lines[g.id].v = V), (kept.get(sport).dirty = true);
    console.log(`${sport}: player lines for ${todo.length} finals new or kept before (${Math.round((Date.now() - t0) / 1000)}s)`);
  }
  if (kept.get(sport).dirty) save(sport);
  const out = [];
  for (const g of history) {
    const k = lines[g.id];
    if (!k) continue;
    for (const [where, team, opp] of [
      ['h', g.home, g.away],
      ['a', g.away, g.home],
    ]) {
      for (const line of k[where] ?? []) {
        const [pid, name, pos, ...v] = line;
        // (a field a line kept before it was, undefined: unknown)
        const s =
          sport === 'nba'
            ? { min: v[0], pts: v[1], reb: v[2], ast: v[3], fg3: v[4], pra: v[1] + v[2] + v[3], fga: v[5] ?? undefined, fta: v[6] ?? undefined, start: v[7] ?? undefined, fg3a: v[8] ?? undefined, oreb: v[9] ?? undefined, dreb: v[10] ?? undefined, tov: v[11] ?? undefined, pf: v[12] ?? undefined }
            : pos === 'G'
              ? { toi: v[0], saves: v[1] }
              : { toi: v[0], sog: v[1], pts: v[2] + v[3], goals: v[2], pptoi: v[4] ?? undefined };
        out.push({ pid, name, pos, date: g.date, season: g.season, team, opp, game: g.id, home: where === 'h', s });
      }
    }
  }
  return out;
}

// (an NBA side's players who played: [id, name, position, minutes, points, rebounds, assists, threes, field
// goals tried, free throws tried, started (1 or 0), threes tried, offensive rebounds, defensive rebounds,
// turnovers, fouls]; a column the box doesn't have, null)
export function nbaLines(p) {
  const s = p.statistics?.[0];
  const at = (k) => (s?.labels ?? []).indexOf(k);
  return (s?.athletes ?? [])
    .filter((a) => !a.didNotPlay && a.stats?.length && Number(a.stats[at('MIN')]) > 0)
    .map((a) => {
      const n = (k, part = 0) => Number(String(a.stats[at(k)]).split('-')[part]) || 0;
      const opt = (k, part = 0) => (at(k) >= 0 ? n(k, part) : null);
      return [String(a.athlete.id), a.athlete.displayName, a.athlete.position?.abbreviation ?? '', n('MIN'), n('PTS'), n('REB'), n('AST'), n('3PT'), n('FG', 1), n('FT', 1), typeof a.starter === 'boolean' ? (a.starter ? 1 : 0) : null, opt('3PT', 1), opt('OREB'), opt('DREB'), opt('TO'), opt('PF')];
    });
}

// (an NHL side's skaters and goalies: [id, name, position, minutes, shots on goal (ESPN's S: its SOG is
// shootout goals), goals, assists, power-play minutes] or
// [id, name, 'G', minutes, saves])
export function nhlLines(p) {
  const out = [];
  const minutes = (v) => {
    const [m, s] = String(v ?? '0:0').split(':').map(Number);
    return Math.round(((m || 0) + (s || 0) / 60) * 10) / 10;
  };
  for (const s of p.statistics ?? []) {
    const at = (k) => (s.labels ?? []).indexOf(k);
    for (const a of s.athletes ?? []) {
      if (!a.stats?.length) continue;
      if (s.name === 'goalies') out.push([String(a.athlete.id), a.athlete.displayName, 'G', minutes(a.stats[at('TOI')]), Number(a.stats[at('SV')]) || 0]);
      else if (s.name === 'forwards' || s.name === 'defenses') {
        const toi = minutes(a.stats[at('TOI')]);
        if (toi > 0) out.push([String(a.athlete.id), a.athlete.displayName, s.name === 'forwards' ? 'F' : 'D', toi, Number(a.stats[at('S')]) || 0, Number(a.stats[at('G')]) || 0, Number(a.stats[at('A')]) || 0, at('PPTOI') >= 0 ? minutes(a.stats[at('PPTOI')]) : null]);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// MLB: the starters' lines from the context's game logs, the batters' from StatsAPI's
// ---------------------------------------------------------------------------
async function mlbRows(history, facts) {
  const out = [];
  const espnOfTeam = new Map();
  for (const g of history) {
    espnOfTeam.set(g.homeAbbr, g.home);
    espnOfTeam.set(g.awayAbbr, g.away);
  }
  const byPk = new Map();
  // (the probable starters: each one's line on the day, from his game log)
  for (const g of history) {
    const f = facts.games?.[g.id];
    if (!g.final || !f?.pk) continue;
    byPk.set(f.pk, g);
    // (the game's own day as StatsAPI dates it, the US Eastern one: a night game out west is the next day by
    // ESPN's UTC time, and its line would be missed)
    const day = Number(etDay(Date.parse(g.date)).replace(/-/g, ''));
    for (const [id, team, opp, home] of [
      [f.hp, g.home, g.away, true],
      [f.ap, g.away, g.home, false],
    ]) {
      const p = id && facts.pitchers?.[id];
      const line = p?.logs?.[g.season]?.find((r) => r[0] === day);
      if (!line) continue;
      out.push({ pid: `mlb:${id}`, name: p.n, pos: 'SP', date: g.date, season: g.season, team, opp, game: g.id, home, s: { k: line[4], outs: line[1] } });
    }
  }
  // (the batters: every lineup's, their game logs by season; this season's asked again once a day)
  const mine = load('mlb');
  mine.at ??= {};
  mine.logs ??= {};
  const today = new Date().toISOString().slice(0, 10);
  const seasons = [...new Set(history.map((g) => g.season))];
  const current = Math.max(...seasons);
  const batters = Object.keys(facts.hands ?? {});
  // (a season kept before its rows carried strikeouts and walks (BAT_COLS: the starters' props' lineup terms,
  // matchups.mjs batterTables) asked again once, a past one too)
  const stale = (logs) => Object.values(logs ?? {}).some((x) => (x.rows?.[0]?.length ?? BAT_COLS) < BAT_COLS);
  for (const season of seasons) {
    if (mine.logs[season] && !stale(mine.logs[season]) && (season < current || mine.at[season] >= today)) continue;
    const got = await mlbHitting(batters, season);
    if (!got) continue;
    mine.logs[season] = got;
    mine.at[season] = today;
    save('mlb');
    console.log(`mlb: batters' game logs for ${season} (${Object.keys(got).length})`);
  }
  const team = (id) => espnOfTeam.get(facts.mlbTeams?.[id]) ?? null;
  for (const [season, logs] of Object.entries(mine.logs)) {
    for (const [id, { n, rows }] of Object.entries(logs)) {
      for (const [ymd, pk, teamId, oppId, home, pa, h, tb, hr, so, bb] of rows) {
        const g = byPk.get(pk);
        const date = g?.date ?? `${String(ymd).slice(0, 4)}-${String(ymd).slice(4, 6)}-${String(ymd).slice(6, 8)}T23:00Z`;
        out.push({ pid: `mlb:${id}`, name: n, pos: 'B', date, season: Number(season), team: team(teamId), opp: team(oppId), game: g?.id ?? null, home: !!home, s: { pa, hits: h, tb, hr, ...(Number.isFinite(so) ? { so, bb: Number.isFinite(bb) ? bb : 0 } : {}) } });
      }
    }
  }
  return out;
}

// (batters' hitting game logs for a season, 40 to a call: { id: { n: name, rows: [[yyyymmdd, gamePk, team,
// opponent, home, PA, hits, total bases, home runs, strikeouts, walks]] } }; null when StatsAPI fails)
const BAT_COLS = 11;
async function mlbHitting(ids, season) {
  const { people, failed, calls } = await mlbPeople(ids, 40, `stats(group=[hitting],type=[gameLog],season=${season})`);
  if (failed > calls / 2) return null;
  const out = {};
  for (const p of people) {
    const rows = (p.stats?.[0]?.splits ?? [])
      .filter((s) => s.date && (s.stat.plateAppearances ?? 0) > 0)
      .map((s) => [Number(s.date.replace(/-/g, '')), s.game?.gamePk, s.team?.id, s.opponent?.id, s.isHome ? 1 : 0, s.stat.plateAppearances, s.stat.hits, s.stat.totalBases, s.stat.homeRuns, s.stat.strikeOuts ?? 0, (s.stat.baseOnBalls ?? 0) + (s.stat.hitByPitch ?? 0)]);
    if (rows.length) out[p.id] = { n: p.fullName, rows };
  }
  return out;
}
