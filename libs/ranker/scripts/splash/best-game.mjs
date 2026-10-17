// Each player's best game of a season: the splash's game ball ("Wk 7 vs DET · 357 yds · 3 TD"). Plain data in,
// data out (tests/splash-best-game.test.mjs). Each sport's game is scored by its own measure, the best one
// picked (a tie: the later game, a playoff one over the regular season's):
//   NFL   PPR fantasy points (QB, RB, WR, TE: nflverse's fantasy_points_ppr); a kicker's points (3 a field goal,
//         1 an extra point); a punter's net yards a punt (3 punts or more)
//   NBA   John Hollinger's Game Score (PTS + 0.4 FG - 0.7 FGA - 0.4 (FTA - FT) + 0.7 AST + STL + 0.7 BLK - 0.4 PF
//         - TOV, ESPN's logs' rebounds at 0.35 each: they don't split offensive from defensive)
//   NHL   Dom Luszczyszyn's Game Score as far as the site's logs go (0.75 G + 0.7 A + 0.075 SOG + 0.15 +/-);
//         a goalie's 0.1 a save - 0.75 a goal against
//   MLB   a hitter's bases produced (TB + R + RBI + BB + HBP + SB - CS); a pitcher's Game Score 2.0 (Tom
//         Tango: 40 + 2 an out + K - 2 BB - 2 H - 3 R - 6 HR)
//
// A best-games.<TAB>.json file: { <card id>: BestGame }
//   date    'YYYY-MM-DD'
//   opp     the opponent's abbreviation (oppTeam: its logo's name, where known)
//   home    played at home
//   result  'W' | 'L' | 'T' (none when the source doesn't say); score: the final, his team's first
//   title   the game's name: "Wk 7 vs DET", "Super Bowl LVIII", "Apr 12 at BOS"
//   line    his line: "357 yds · 3 TD", "41 pts · 12 reb · 8 ast", "8 IP · 2 H · 0 ER · 12 K"
//   tip     the game, for its hover: "W 38-6 vs DET · Oct 22, 2023" (files.mjs tipOf)
//   value   the measure's value (above), to compare
//   week    (NFL) the week; round (playoff games) the round's name; post: a playoff game
//   games   the games his log had (a nightly run asks again only when it changes)

const r1 = (v) => Math.round(v * 10) / 10;
const n = (v) => (v === undefined || v === null || v === '' || v === 'NA' ? 0 : Number(v) || 0);

// The best of a player's scored games: [{ value, ...game }] -> the game, or null (no game scored above nothing)
export function bestOf(games) {
  let best = null;
  for (const g of games) {
    if (g.value === null || g.value === undefined || !Number.isFinite(g.value)) continue;
    if (!best || g.value > best.value || (g.value === best.value && (g.post ? 1 : 0) >= (best.post ? 1 : 0) && g.date >= best.date)) best = g;
  }
  return best;
}

const plural = (k, one, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const parts = (...xs) => xs.filter(Boolean).join(' · ');

// ---- NFL: a week's row of nflverse's weekly player stats, scored for the site's tab
export function nflGame(row, tab) {
  const s = (k) => n(row[k]);
  if (tab === 'K') {
    const fga = s('fg_att');
    if (!fga && !s('pat_att')) return null;
    return { value: 3 * s('fg_made') + s('pat_made'), line: parts(`${s('fg_made')}/${fga} FG`, s('fg_long') ? `long ${s('fg_long')}` : '', s('pat_made') ? `${s('pat_made')} XP` : '') };
  }
  if (tab === 'P') {
    const att = s('pt_att');
    if (att < 3) return null;
    const net = s('pt_net_yards') / att;
    return { value: r1(net), line: parts(plural(att, 'punt'), `${r1(net)} net avg`, s('pt_inside_20') ? `${s('pt_inside_20')} inside 20` : '') };
  }
  // A defender's game by the lockers' measure (build-splash.mjs: 6 a sack, 8 an interception, 4 a forced fumble,
  // 1.5 a TFL, 1 a pass defended, 0.5 a solo tackle, 6 a TD): his tackles, then what else he did
  if (['EDGE', 'DL', 'LB', 'CB', 'S'].includes(tab)) {
    const [solo, ast, tfl, sk, int, pd, ff, td] = ['def_tackles_solo', 'def_tackle_assists', 'def_tackles_for_loss', 'def_sacks', 'def_interceptions', 'def_pass_defended', 'def_fumbles_forced', 'def_tds'].map(s);
    const tackles = solo + s('def_tackles_with_assist') + ast;
    const value = r1(6 * sk + 8 * int + 4 * ff + 1.5 * tfl + pd + 0.5 * solo + 6 * td);
    if (!value) return null;
    return {
      value,
      line: parts(tackles ? `${tackles} tkl` : '', sk ? `${sk} sack${sk === 1 ? '' : 's'}` : '', tfl ? `${tfl} TFL` : '', int ? `${int} INT` : '', pd ? `${pd} PD` : '', ff ? `${ff} FF` : '', td ? `${td} TD` : ''),
    };
  }
  const value = row.fantasy_points_ppr === '' || row.fantasy_points_ppr === 'NA' ? null : r1(n(row.fantasy_points_ppr));
  const [py, ptd, ry, rtd, rec, recy, rectd] = ['passing_yards', 'passing_tds', 'rushing_yards', 'rushing_tds', 'receptions', 'receiving_yards', 'receiving_tds'].map(s);
  let line;
  if (tab === 'QB' || (s('attempts') >= 10 && !['RB', 'WR', 'TE'].includes(tab))) {
    line = parts(`${py} yds`, `${ptd} TD`, ry >= 40 ? `${ry} rush yds` : '', rtd ? plural(rtd, 'rush TD', 'rush TD') : '');
  } else if (tab === 'RB') {
    line = parts(`${ry} rush yds`, recy >= 20 ? `${recy} rec yds` : '', rtd + rectd ? `${rtd + rectd} TD` : '');
  } else {
    line = parts(`${rec} rec`, `${recy} yds`, rectd + rtd ? `${rectd + rtd} TD` : '');
  }
  return value === null ? null : { value, line };
}

// The NFL's playoff rounds by nflverse's game_type, and the Super Bowl's number
const NFL_ROUNDS = { WC: 'Wild Card', DIV: 'Divisional', CON: 'Championship', SB: 'Super Bowl' };
export function roman(k) {
  const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of map) while (k >= v) [out, k] = [out + s, k - v];
  return out;
}
export const superBowl = (season) => `Super Bowl ${roman(season - 1965)}`;
// A game's name: "Wk 7 vs DET", "AFC Wild Card at BUF", "AFC Championship vs BAL", "Super Bowl LVIII"
export function nflTitle({ season, week, type, opp, home, conf }) {
  if (type === 'SB') return superBowl(season);
  const where = `${home ? 'vs' : 'at'} ${opp}`;
  if (type === 'CON') return `${conf ? `${conf} ` : ''}Championship ${where}`;
  if (NFL_ROUNDS[type]) return `${conf ? `${conf} ` : ''}${NFL_ROUNDS[type]} ${where}`;
  return `Wk ${week} ${where}`;
}
export const nflRoundName = (type, conf) => (type === 'SB' ? 'Super Bowl' : type === 'CON' ? `${conf} Championship` : NFL_ROUNDS[type] ? `${NFL_ROUNDS[type]} round` : null);

// ---- NBA: a game from ESPN's player game log (its labels: MIN, FG "10-20", 3PT, FT, REB, AST, BLK, STL, PF, TO, PTS)
export function nbaGame(stats) {
  const get = (label) => stats[label];
  const [fgm, fga] = String(get('FG') ?? '0-0').split('-').map(Number);
  const [ftm, fta] = String(get('FT') ?? '0-0').split('-').map(Number);
  const [pts, reb, ast, stl, blk, pf, tov] = ['PTS', 'REB', 'AST', 'STL', 'BLK', 'PF', 'TO'].map((k) => n(get(k)));
  if (!n(get('MIN')) && !pts && !reb && !ast) return null;
  const value = r1(pts + 0.4 * fgm - 0.7 * fga - 0.4 * (fta - ftm) + 0.35 * reb + 0.7 * ast + stl + 0.7 * blk - 0.4 * pf - tov);
  // (the line: points, then the two biggest of the rest that are worth saying)
  const extra = [
    [reb, 'reb'],
    [ast, 'ast'],
    [stl, 'stl'],
    [blk, 'blk'],
  ]
    .filter(([v, k]) => v >= (k === 'reb' || k === 'ast' ? 5 : 3))
    .sort((a, b) => b[0] - a[0])
    .slice(0, 2)
    .map(([v, k]) => `${v} ${k}`);
  return { value, line: parts(`${pts} pts`, ...extra, extra.length < 2 ? `${fgm}-${fga} FG` : '') };
}

// ---- NHL: a row of the site's own game logs (skater: G A P +/- SOG PIM TOI; goalie: SA GA SV% TOI)
export function nhlSkaterGame([g, a, , pm, sog]) {
  const plusMinus = Number(String(pm ?? 0).replace('+', '')) || 0;
  const value = r1(0.75 * n(g) + 0.7 * n(a) + 0.075 * n(sog) + 0.15 * plusMinus);
  return { value, line: parts(g ? plural(n(g), 'G', 'G') : '', a ? plural(n(a), 'A', 'A') : '', !g && !a ? '0 pts' : '', `${n(sog)} SOG`, plusMinus ? `${plusMinus > 0 ? '+' : ''}${plusMinus}` : '') };
}
export function nhlGoalieGame([sa, ga]) {
  if (!n(sa)) return null;
  const saves = n(sa) - n(ga);
  return { value: r1(0.1 * saves - 0.75 * n(ga)), line: parts(plural(saves, 'save'), `${n(ga)} GA`, !n(ga) ? 'shutout' : '') };
}

// ---- MLB: a game from the MLB Stats API's game log (hitting or pitching)
export function mlbHittingGame(s) {
  if (!n(s.plateAppearances)) return null;
  const value = n(s.totalBases) + n(s.runs) + n(s.rbi) + n(s.baseOnBalls) + n(s.hitByPitch) + n(s.stolenBases) - n(s.caughtStealing);
  return {
    value,
    line: parts(
      `${n(s.hits)}-${n(s.atBats)}`,
      s.homeRuns ? plural(n(s.homeRuns), 'HR', 'HR') : '',
      s.triples ? `${n(s.triples)} 3B` : '',
      s.doubles ? `${n(s.doubles)} 2B` : '',
      s.rbi ? `${n(s.rbi)} RBI` : '',
      s.stolenBases ? `${n(s.stolenBases)} SB` : '',
    ),
  };
}
export function mlbPitchingGame(s) {
  const outs = n(s.outs);
  if (!outs && !n(s.battersFaced)) return null;
  const value = 40 + 2 * outs + n(s.strikeOuts) - 2 * n(s.baseOnBalls) - 2 * n(s.hits) - 3 * n(s.runs) - 6 * n(s.homeRuns);
  return { value, line: parts(`${s.inningsPitched ?? `${Math.floor(outs / 3)}.${outs % 3}`} IP`, `${n(s.hits)} H`, `${n(s.earnedRuns)} ER`, `${n(s.strikeOuts)} K`, n(s.saves) ? 'save' : '') };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// A day's name: "2024-04-12" -> "Apr 12"; a game's: "Apr 12 vs BOS"
export const dayName = (date) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;
export const dayTitle = (date, opp, home) => `${dayName(date)} ${home ? 'vs' : 'at'} ${opp}`;
