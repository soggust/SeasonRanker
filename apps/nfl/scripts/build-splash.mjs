// The NFL's files for the Overview's splash (libs/ranker/scripts/splash/files.mjs says what each holds), for a
// season the site has, from nflverse (free, no key):
//   outcomes.json         each team's season: its schedule's playoff games (nfldata's games.csv; its location
//                         'Neutral': a Super Bowl, an international game, a game moved), its seed,
//                         record and division place (nfldata's standings.csv, 2002 on; 2000 and 2001 below by
//                         hand); a season being played reads who's out as season-state.mjs's teamStatus does
//   numbers.json          each player's number (nflverse's season roster, jersey_number)
//   lockers.json          each team's roster that season, numbers and popularity, for the team lockers (lockersOf)
//   best-games.<TAB>.json each player's best game (nflverse's weekly player stats, PPR points: best-game.mjs)
//
// Usage: node apps/nfl/scripts/build-splash.mjs            the current season (ONLY=outcomes: just outcomes.json)
//        node apps/nfl/scripts/build-splash.mjs 2023       a past one ("2000-2025", "2019,2021", or all)
// nflverse's downloads are kept in .cache/nflverse (shared with update-data.mjs): a finished season's for good.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { cachedDownload, fetchRetry } from '../../../libs/ranker/scripts/fetch.mjs';
import { parseCsv } from '../../../libs/ranker/scripts/csv.mjs';
import { ROOT, currentSeason, seasonDir, seasonsAsked, siteRows, sortKeys, writeBestGames, writeIfChanged } from '../../../libs/ranker/scripts/splash/files.mjs';
import { buildOutcomes, gameFor } from '../../../libs/ranker/scripts/splash/outcomes.mjs';
import { NFL_LOGO, NFL_NOW } from '../../../libs/ranker/scripts/splash/nfl-teams.mjs';
import { bestOf, nflGame, nflRoundName, nflTitle } from '../../../libs/ranker/scripts/splash/best-game.mjs';
import { teamStatus } from './analysis/season-state.mjs';

const NFLVERSE = 'https://github.com/nflverse/nflverse-data/releases/download';
const NFLDATA = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data';
const CACHE = path.join(ROOT, '.cache', 'nflverse');
const CURRENT = currentSeason('nfl');

async function csv(url, season, { optional = false } = {}) {
  const file = path.join(CACHE, url.split('/').pop());
  // (the all-seasons files and the season being played: fresh for six hours; a finished season's own: kept)
  const own = season < CURRENT && url.includes(`_${season}.`);
  try {
    const body = await cachedDownload(file, () => fetchRetry(url, { as: 'buffer', attempts: 3, timeout: 300000 }), { current: !own });
    return parseCsv((url.endsWith('.gz') ? gunzipSync(body) : body).toString());
  } catch (err) {
    if (optional) {
      console.warn(`  skipped ${url.split('/').pop()}: ${err.message}`);
      return [];
    }
    throw err;
  }
}

// nflverse's abbreviations, every era's, -> the team's logo name; today's abbreviation for season-state.mjs's
// divisions (nfl-teams.mjs: the roster tests read the same table)
const LOGO = NFL_LOGO;
const NOW = NFL_NOW;

// 2000 and 2001, before nfldata's standings begin (and before the 2002 realignment): the divisions and the
// playoff seeds (Pro Football Reference's 2000 and 2001 standings; three division winners seeded 1-3 a
// conference, then three wild cards)
const OLD_DIVISIONS = {
  'AFC East': ['BUF', 'IND', 'MIA', 'NE', 'NYJ'], 'AFC Central': ['BAL', 'CIN', 'CLE', 'JAX', 'PIT', 'TEN'], 'AFC West': ['DEN', 'KC', 'OAK', 'SD', 'SEA'],
  'NFC East': ['ARI', 'DAL', 'NYG', 'PHI', 'WAS'], 'NFC Central': ['CHI', 'DET', 'GB', 'MIN', 'TB'], 'NFC West': ['ATL', 'CAR', 'NO', 'SF', 'STL'],
};
const OLD_SEEDS = {
  2000: { TEN: 1, OAK: 2, MIA: 3, BAL: 4, DEN: 5, IND: 6, NYG: 1, MIN: 2, NO: 3, PHI: 4, TB: 5, STL: 6 },
  2001: { PIT: 1, NE: 2, OAK: 3, MIA: 4, BAL: 5, NYJ: 6, STL: 1, CHI: 2, PHI: 3, GB: 4, SF: 5, TB: 6 },
};

const num = (v) => (v === undefined || v === '' || v === 'NA' ? null : Number(v));
const recordText = (w, l, t) => `${w}-${l}${t ? `-${t}` : ''}`;

// ---- outcomes
function outcomes(season, schedule, standings) {
  const games = schedule.filter((g) => Number(g.season) === season);
  const played = (g) => num(g.home_score) !== null && num(g.away_score) !== null;
  const asGame = (g) => ({ date: g.gameday, home: g.home_team, score: { [g.home_team]: num(g.home_score), [g.away_team]: num(g.away_score) }, ot: g.overtime === '1', ...(g.location === 'Neutral' ? { neutral: true } : {}) });
  const reg = games.filter((g) => g.game_type === 'REG');
  // the teams: nfldata's standings (2002 on), else worked out from the games
  let rows = standings.filter((r) => Number(r.season) === season);
  if (!rows.length) {
    const tally = new Map();
    for (const g of reg.filter(played)) {
      for (const [t, us, them] of [[g.home_team, num(g.home_score), num(g.away_score)], [g.away_team, num(g.away_score), num(g.home_score)]]) {
        const x = tally.get(t) ?? tally.set(t, { w: 0, l: 0, t: 0 }).get(t);
        x[us > them ? 'w' : us < them ? 'l' : 't']++;
      }
    }
    rows = Object.entries(OLD_DIVISIONS).flatMap(([division, ts]) => {
      const list = ts.map((team) => ({ team, division, conf: division.slice(0, 3), ...tally.get(team) }));
      list.sort((a, b) => (b.w + b.t / 2) / (b.w + b.l + b.t) - (a.w + a.t / 2) / (a.w + a.l + a.t) || (OLD_SEEDS[season]?.[a.team] ?? 99) - (OLD_SEEDS[season]?.[b.team] ?? 99));
      return list.map((r, i) => ({ season, team: r.team, conf: r.conf, division, wins: r.w, losses: r.l, ties: r.t, div_rank: i + 1, seed: OLD_SEEDS[season]?.[r.team] ?? '' }));
    });
  }
  const regDone = reg.length > 0 && reg.every(played);
  const teams = rows.map((r) => ({
    key: LOGO[r.team],
    abbr: r.team,
    conf: r.conf,
    division: r.division,
    divRank: num(r.div_rank),
    // (seeds only once the regular season is over: nfldata's are provisional before)
    seed: regDone ? num(r.seed) : null,
    record: recordText(num(r.wins), num(r.losses), num(r.ties)),
    divChamp: regDone && num(r.div_rank) === 1,
    w: num(r.wins),
    l: num(r.losses),
  }));
  const abbrOfKey = Object.fromEntries(teams.map((t) => [t.key, t.abbr]));
  // the field and how far each team missed it by
  if (regDone) {
    for (const conf of ['AFC', 'NFC']) {
      const mine = teams.filter((t) => t.conf === conf);
      const field = mine.filter((t) => t.seed);
      if (!field.length) continue;
      const cut = Math.min(...field.map((t) => t.w - t.l));
      for (const t of mine) if (!t.seed) t.gamesBack = Math.max(0, (cut - (t.w - t.l)) / 2);
    }
  }
  const confOf = Object.fromEntries(teams.map((t) => [t.key, t.conf]));
  const ROUND = { WC: 1, DIV: 2, CON: 3, SB: 4 };
  const series = games
    .filter((g) => ROUND[g.game_type])
    .map((g) => {
      const [home, away] = [LOGO[g.home_team], LOGO[g.away_team]];
      const game = { ...asGame(g), home, score: { [home]: num(g.home_score), [away]: num(g.away_score) } };
      const done = played(g);
      const winner = done ? (game.score[home] > game.score[away] ? home : away) : null;
      return {
        round: ROUND[g.game_type],
        roundName: (conf) => nflRoundName(g.game_type, conf ?? confOf[home]),
        teams: [home, away],
        wins: done ? { [home]: winner === home ? 1 : 0, [away]: winner === away ? 1 : 0 } : { [home]: 0, [away]: 0 },
        winner,
        single: true,
        // (a game not played yet: no score, nothing to read but its date)
        games: done ? [game] : [],
      };
    });
  const lastGames = {};
  for (const t of teams) {
    const last = reg.filter(played).filter((g) => LOGO[g.home_team] === t.key || LOGO[g.away_team] === t.key).sort((a, b) => a.gameday.localeCompare(b.gameday)).at(-1);
    if (last) lastGames[t.key] = gameFor({ ...asGame(last), home: LOGO[last.home_team], score: { [LOGO[last.home_team]]: num(last.home_score), [LOGO[last.away_team]]: num(last.away_score) } }, t.key, (k) => abbrOfKey[k]);
  }
  // (a season being played: the field is known once season-state says the teams outside it are done)
  let fieldSet = regDone;
  if (season === CURRENT && regDone) {
    const status = teamStatus(games.map((g) => ({ type: g.game_type, home: NOW[g.home_team] ?? g.home_team, away: NOW[g.away_team] ?? g.away_team, homeScore: num(g.home_score), awayScore: num(g.away_score) })));
    fieldSet = [...status.values()].some((s) => s.over && s.why === 'missed the playoffs');
  }
  return buildOutcomes({ teams, series, totalRounds: 4, lastGames, fieldSet, abbrOf: (k) => abbrOfKey[k] ?? k });
}

// ---- the team lockers' players (lockers.json): who a team's locker room may show, with his number and how
// popular he is. The Team, Defense and O-Line cards' lockers hang the jerseys of the depth chart's starters
// (data/depth: build-depth.mjs), and the chart knows no numbers and has no stat lines; this file, by the
// team's logo name, gives every man on its roster that season (nflverse's season roster: a player is on the
// team it lists him with, so a traded man is his new team's alone and the chart's old entry for him is passed
// over) his number and his POPULARITY, by which the scene picks the few it hangs (splash.component.ts rosterOf):
//   {"Chiefs": {"00-0033873": ["15", 312], ...}}
// Popularity is the season's stat line (nflverse's weekly rows, regular season and playoffs together), scored
// about like fantasy points so a 4,000-yard passer, a 1,200-yard receiver and a 12-sack edge rusher land in
// the same range, with the season's honors on top:
//   passing                 yards / 25 + 4 a TD - 2 an interception
//   rushing and receiving   yards / 10 + 6 a TD + 0.5 a catch
//   defense                 6 a sack + 8 an interception + 4 a forced fumble + 1.5 a tackle for loss
//                           + 1 a pass defended + 0.5 a solo tackle + 6 a TD
//   kicking                 3 a field goal + 1 a PAT; punting 0.5 a punt
//   honors                  AP first-team All-Pro +60, second team +40, Pro Bowl +25 (the site's tables, by
//                           name: all-pro.json, pro-bowl.json); Defensive Player or Rookie of the Year +60
//                           (awards.ts)
// Linemen have no stat line (0): the O-line locker takes the chart's five in their order. The file holds every
// man on the team that season (its active roster and reserve lists, and anyone who played for it and was cut or
// moved on since), so a chart's starter who isn't in it was never the team's that season.
const SKILL = new Set(['QB', 'RB', 'WR', 'TE', 'FB', 'HB']);
const LINE = new Set(['OL', 'T', 'G', 'C', 'OT', 'OG', 'LT', 'RT', 'LG', 'RG']);
const DEFENSE = new Set(['DE', 'DT', 'NT', 'DL', 'EDGE', 'LB', 'ILB', 'OLB', 'MLB', 'CB', 'S', 'SS', 'FS', 'DB', 'SAF']);
const KICKERS = new Set(['K', 'P', 'PK', 'LS']);
const nameKey = (name) => String(name ?? '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z]/g, '');

// The season's honors by name: the All-Pro teams and Pro Bowls the site's tables have, the defensive awards
function honors(season) {
  const sportDir = path.join(ROOT, 'apps', 'nfl', 'src', 'sport');
  const bonus = new Map();
  const add = (name, pts) => bonus.set(nameKey(name), Math.max(bonus.get(nameKey(name)) ?? 0, pts));
  const allPro = JSON.parse(readFileSync(path.join(sportDir, 'all-pro.json'), 'utf8'))[season] ?? {};
  for (const byName of Object.values(allPro)) for (const [name, team] of Object.entries(byName)) add(name, team === 1 ? 60 : 40);
  const proBowl = JSON.parse(readFileSync(path.join(sportDir, 'pro-bowl.json'), 'utf8'))[season] ?? {};
  for (const names of Object.values(proBowl)) for (const name of names) if (!bonus.has(nameKey(name))) add(name, 25);
  // (awards.ts: the season's block, its dpoy: ['Name', 'Team'] and droy)
  const text = readFileSync(path.join(sportDir, 'awards.ts'), 'utf8');
  const block = text.match(new RegExp(`^  ${season}: \\{[\\s\\S]*?^  \\},`, 'm'))?.[0] ?? '';
  for (const m of block.matchAll(/d(?:p|r)oy: \['([^']+)'/g)) add(m[1], 60);
  return bonus;
}

function lockersOf(season, roster, weeks) {
  const n = (v) => Number(v) || 0;
  const bonus = honors(season);
  const pop = new Map();
  for (const [id, list] of weeks) {
    let s = 0;
    for (const w of list) {
      s += n(w.passing_yards) / 25 + 4 * n(w.passing_tds) - 2 * n(w.passing_interceptions);
      s += (n(w.rushing_yards) + n(w.receiving_yards)) / 10 + 6 * (n(w.rushing_tds) + n(w.receiving_tds)) + 0.5 * n(w.receptions);
      s += 6 * n(w.def_sacks) + 8 * n(w.def_interceptions) + 4 * n(w.def_fumbles_forced) + 1.5 * n(w.def_tackles_for_loss) + n(w.def_pass_defended) + 0.5 * n(w.def_tackles_solo) + 6 * n(w.def_tds);
      s += 3 * n(w.fg_made) + n(w.pat_made) + 0.5 * n(w.pt_att);
    }
    pop.set(id, s);
  }
  const byTeam = {};
  for (const r of roster) {
    const team = LOGO[r.team];
    if (!team || !r.gsis_id || r.jersey_number === '' || r.jersey_number === 'NA') continue;
    const pos = r.position;
    const group = SKILL.has(pos) ? 'skill' : LINE.has(pos) ? 'line' : DEFENSE.has(pos) ? 'defense' : KICKERS.has(pos) ? 'kickers' : null;
    if (!group) continue;
    const score = Math.round((pop.get(r.gsis_id) ?? 0) + (bonus.get(nameKey(r.full_name)) ?? 0));
    // (the team's men: its active roster, its reserve lists and its inactives; not the practice squad, the cut
    // and the retired, unless the man played for it)
    ((byTeam[team] ??= {})[group] ??= []).push({ id: r.gsis_id, num: String(Number(r.jersey_number)), score, active: ['ACT', 'RES', 'INA'].includes(r.status) });
  }
  const out = {};
  for (const [team, groups] of Object.entries(byTeam)) {
    const kept = {};
    for (const list of Object.values(groups)) for (const p of list) if (p.active || p.score > 0) kept[p.id] = [p.num, p.score];
    out[team] = sortKeys(kept);
  }
  return out;
}

// ---- jerseys and best games
async function players(season, rows, gamesById, playersCsv) {
  const roster = await csv(`${NFLVERSE}/rosters/roster_${season}.csv`, season, { optional: true });
  const weekly = await csv(`${NFLVERSE}/stats_player/stats_player_week_${season}.csv.gz`, season, { optional: true });
  const gsisOfEspn = new Map(playersCsv.filter((p) => p.espn_id && p.espn_id !== 'NA').map((p) => [String(p.espn_id), p.gsis_id]));
  for (const r of roster) if (r.espn_id && r.espn_id !== 'NA' && !gsisOfEspn.has(String(r.espn_id))) gsisOfEspn.set(String(r.espn_id), r.gsis_id);
  const gsisOf = (row) => (row.cardId.startsWith('QB-') ? gsisOfEspn.get(String(row.id)) : row.cardId);
  // (a player's number: his season roster's row, the one with his team's when he has two)
  const numbers = new Map();
  for (const r of roster) {
    if (!r.gsis_id || r.jersey_number === '' || r.jersey_number === 'NA') continue;
    (numbers.get(r.gsis_id) ?? numbers.set(r.gsis_id, []).get(r.gsis_id)).push({ team: LOGO[r.team], num: String(Number(r.jersey_number)) });
  }
  const weeks = new Map();
  for (const w of weekly) (weeks.get(w.player_id) ?? weeks.set(w.player_id, []).get(w.player_id)).push(w);
  const lockers = roster.length ? lockersOf(season, roster, weeks) : {};

  const jerseys = {};
  const best = {};
  for (const [tab, list] of Object.entries(rows)) {
    if (['DEF', 'OL', 'HC', 'OFF', 'ST'].includes(tab)) continue;
    for (const row of list) {
      const gsis = gsisOf(row);
      if (!gsis) continue;
      const nums = numbers.get(gsis);
      if (nums?.length) jerseys[row.cardId] ??= (nums.find((x) => x.team === row.team) ?? nums.at(-1)).num;
      const scored = (weeks.get(gsis) ?? []).flatMap((w) => {
        const game = gamesById.get(w.game_id);
        const s = nflGame(w, tab);
        if (!s || !game) return [];
        const team = w.team;
        const home = game.home_team === team || (NOW[game.home_team] ?? game.home_team) === (NOW[team] ?? team);
        const [us, them] = home ? [num(game.home_score), num(game.away_score)] : [num(game.away_score), num(game.home_score)];
        const type = game.game_type;
        const conf = Object.entries(CONF_OF).find(([, ts]) => ts.includes(NOW[team] ?? team))?.[0];
        return [{
          value: s.value,
          date: game.gameday,
          opp: w.opponent_team,
          oppTeam: LOGO[w.opponent_team] ?? null,
          home,
          ...(us !== null ? { result: us > them ? 'W' : us < them ? 'L' : 'T', score: `${us}-${them}` } : {}),
          title: nflTitle({ season, week: Number(game.week), type, opp: w.opponent_team, home, conf }),
          line: s.line,
          week: Number(game.week),
          ...(type !== 'REG' ? { round: nflRoundName(type, conf), post: true } : {}),
        }];
      });
      const top = bestOf(scored);
      if (top) (best[tab] ??= {})[row.cardId] = { ...top, games: scored.length };
    }
  }
  return { jerseys, best, lockers, roster: roster.length, weekly: weekly.length };
}
const CONF_OF = { AFC: ['BAL', 'BUF', 'CIN', 'CLE', 'DEN', 'HOU', 'IND', 'JAX', 'KC', 'LAC', 'LV', 'MIA', 'NE', 'NYJ', 'PIT', 'TEN'], NFC: ['ARI', 'ATL', 'CAR', 'CHI', 'DAL', 'DET', 'GB', 'LA', 'MIN', 'NO', 'NYG', 'PHI', 'SEA', 'SF', 'TB', 'WAS'] };

async function main() {
  const seasons = seasonsAsked('nfl');
  const [schedule, standings, playersCsv] = await Promise.all([
    csv(`${NFLDATA}/games.csv`, 0),
    csv(`${NFLDATA}/standings.csv`, 0),
    csv(`${NFLVERSE}/players/players.csv.gz`, 0),
  ]);
  const gamesById = new Map(schedule.map((g) => [g.game_id, g]));
  for (const season of seasons) {
    const dir = seasonDir('nfl', season);
    if (!dir) {
      console.log(`NFL ${season}: not a season the site has`);
      continue;
    }
    const o = outcomes(season, schedule, standings);
    const written = [writeIfChanged(path.join(dir, 'outcomes.json'), sortKeys(o))];
    // (ONLY=outcomes: the outcomes alone, the players' files left as they are)
    if (process.env.ONLY === 'outcomes') {
      console.log(`NFL ${season}: outcomes (champion ${Object.entries(o).find(([, v]) => v.result === 'champion')?.[0] ?? 'none yet'})`);
      continue;
    }
    const p = await players(season, siteRows(dir), gamesById, playersCsv);
    if (Object.keys(p.jerseys).length) written.push(writeIfChanged(path.join(dir, 'numbers.json'), sortKeys(p.jerseys)));
    if (Object.keys(p.lockers).length) written.push(writeIfChanged(path.join(dir, 'lockers.json'), sortKeys(p.lockers)));
    written.push(...writeBestGames(dir, p.best));
    const champ = Object.entries(o).find(([, v]) => v.result === 'champion')?.[0] ?? 'none yet';
    console.log(
      `NFL ${season}: ${Object.keys(o).length} teams (champion ${champ}), ${Object.keys(p.jerseys).length} numbers, ${Object.keys(p.lockers).length} lockers, ` +
        `${Object.values(p.best).reduce((s, x) => s + Object.keys(x).length, 0)} best games; ` +
        written.map((w) => `${path.basename(w.file)} ${(w.size / 1024).toFixed(1)} KB${w.same ? ' (same)' : ''}`).join(', '),
    );
  }
}

await main();
