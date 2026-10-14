// Where each NFL team's season stands, from the schedule the analysis already reads (nflverse's games.csv:
// each game's type, teams and score), as libs/ranker/scripts/analysis/season-state.mjs does for MLB, NBA
// and NHL from ESPN. A team's season is over when it has no games left:
//   - it missed the playoffs: the regular season is done, its conference's field is set and it isn't in it
//   - it lost a playoff game (Wild Card, Divisional, conference championship or the Super Bowl)
//   - it won the Super Bowl (once it's played: both Super Bowl teams get their recap after it)
// The field: the teams in the conference's playoff games. Until the Divisional round is on the schedule,
// that's its three Wild Card games and the bye: the 1 seed, the best record in the conference, which no
// team outside the field can match (a team that did would be a division winner or a wild card).
//
// Also the recap sheet's season blocks (results by month, the streaks, the totals), so a report quotes
// them instead of adding them up. Plain data in, data out: tests/nfl-recap.test.mjs.

export const DIVISIONS = {
  'AFC East': ['BUF', 'MIA', 'NE', 'NYJ'], 'AFC North': ['BAL', 'CIN', 'CLE', 'PIT'], 'AFC South': ['HOU', 'IND', 'JAX', 'TEN'], 'AFC West': ['DEN', 'KC', 'LAC', 'LV'],
  'NFC East': ['DAL', 'NYG', 'PHI', 'WAS'], 'NFC North': ['CHI', 'DET', 'GB', 'MIN'], 'NFC South': ['ATL', 'CAR', 'NO', 'TB'], 'NFC West': ['ARI', 'LA', 'SEA', 'SF'],
};
export const conferenceOf = (t) => Object.entries(DIVISIONS).find(([, ts]) => ts.includes(t))?.[0].slice(0, 3) ?? null;
// The playoff rounds, by nflverse's game_type
export const ROUNDS = { WC: 'Wild Card round', DIV: 'Divisional round', CON: 'conference championship', SB: 'Super Bowl' };
export const roundName = (type, conference) => (type === 'CON' && conference ? `${conference} Championship` : ROUNDS[type] ?? null);

const r = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(d)));
const played = (g) => g.homeScore !== null && g.homeScore !== undefined && g.awayScore !== null && g.awayScore !== undefined;

// Each team's status: { over, why, champion, by, score } by abbreviation.
//   games  the season's games: { type ('REG', 'WC', 'DIV', 'CON', 'SB'), home, away, homeScore, awayScore }
//          (a score null until it's played)
// by: the team that ended it (or, for the champion, the one it beat); score: that game's, this team's first.
export function teamStatus(games) {
  const teams = Object.values(DIVISIONS).flat();
  const out = new Map(teams.map((t) => [t, { over: false, why: null, champion: false, by: null, score: null }]));
  const regular = games.filter((g) => g.type === 'REG');
  // (nothing until the regular season is done)
  if (!regular.length || !regular.every(played)) return out;
  const post = games.filter((g) => g.type !== 'REG' && ROUNDS[g.type]);
  const done = (t, why, by, score, champion = false) => out.has(t) && !out.get(t).over && out.set(t, { over: true, why, champion, by, score });

  // a playoff game lost, and the Super Bowl won
  for (const g of post.filter(played)) {
    if (g.homeScore === g.awayScore) continue;
    const [win, lose] = g.homeScore > g.awayScore ? [g.home, g.away] : [g.away, g.home];
    const [ws, ls] = [Math.max(g.homeScore, g.awayScore), Math.min(g.homeScore, g.awayScore)];
    done(lose, `lost in the ${roundName(g.type, conferenceOf(lose))}`, win, `${ls}-${ws}`);
    if (g.type === 'SB') done(win, 'won the Super Bowl', lose, `${ws}-${ls}`, true);
  }

  // out of the field, once a conference's is set
  const pct = (t) => {
    let w = 0;
    let n = 0;
    for (const g of regular.filter((x) => x.home === t || x.away === t)) {
      const [us, them] = g.home === t ? [g.homeScore, g.awayScore] : [g.awayScore, g.homeScore];
      w += us > them ? 1 : us === them ? 0.5 : 0;
      n++;
    }
    return n ? w / n : 0;
  };
  for (const conf of ['AFC', 'NFC']) {
    const mine = post.filter((g) => g.type !== 'SB' && conferenceOf(g.home) === conf);
    const field = new Set(mine.flatMap((g) => [g.home, g.away]));
    const rest = teams.filter((t) => conferenceOf(t) === conf && !field.has(t));
    if (mine.some((g) => g.type !== 'WC')) {
      // (the Divisional round on: the bye team is in its games)
    } else if (mine.filter((g) => g.type === 'WC').length >= 3) {
      // (the bye: the best record left, alone; a tie means the field can't be read yet)
      const best = Math.max(...rest.map(pct));
      const top = rest.filter((t) => pct(t) === best);
      if (top.length !== 1) continue;
      field.add(top[0]);
    } else continue;
    for (const t of rest) if (!field.has(t)) done(t, 'missed the playoffs', null, null);
  }
  return out;
}

// How a team's season ended, as the sheet says it: "Missed the playoffs", "Lost in the Wild Card round to
// BUF, 24-27", "Won the Super Bowl over SEA, 31-20"
export function endedText(st) {
  if (!st?.over) return null;
  const why = `${st.why[0].toUpperCase()}${st.why.slice(1)}`;
  if (!st.by) return why;
  return `${why} ${st.champion ? 'over' : 'to'} ${st.by}${st.score ? `, ${st.score}` : ''}`;
}

// The regular season by month (record, points for and against, a game, the record at the month's end) and
// the longest streaks. played: the game log's regular-season games in order ({ date, score "us-them", result })
export function resultsOf(played) {
  const months = new Map();
  for (const g of played) {
    const m = g.date.slice(0, 7);
    const row = months.get(m) ?? { month: m, w: 0, l: 0, t: 0, scored: 0, allowed: 0 };
    const [us, them] = g.score.split('-').map(Number);
    row[g.result === 'W' ? 'w' : g.result === 'L' ? 'l' : 't']++;
    row.scored += us;
    row.allowed += them;
    months.set(m, row);
  }
  const best = { W: 0, L: 0 };
  let run = { result: null, n: 0 };
  for (const g of played) {
    run = g.result === run.result ? { result: g.result, n: run.n + 1 } : { result: g.result, n: 1 };
    if (run.n > (best[g.result] ?? 0)) best[g.result] = run.n;
  }
  const text = (w, l, t) => `${w}-${l}${t ? `-${t}` : ''}`;
  const so = { w: 0, l: 0, t: 0 };
  return {
    byMonth: [...months.values()].map(({ month, w, l, t, scored, allowed }) => {
      so.w += w;
      so.l += l;
      so.t += t;
      const n = w + l + t;
      return { month, record: text(w, l, t), scored, allowed, scoredPerGame: r(scored / n, 1), allowedPerGame: r(allowed / n, 1), recordThrough: text(so.w, so.l, so.t) };
    }),
    longestWinStreak: best.W,
    longestLosingStreak: best.L,
  };
}

// A team's totals block: the plain season totals of its game log (the scores and each game's box score),
// regular season and playoffs apart, so a report quotes them instead of adding them up.
//   log      the game log: { score "us-them", result, round (playoff games only), box: { passYds, rushYds,
//            turnovers, sacksAllowed, defSacks, takeaways, penaltyYds, oppPassYds, oppRushYds } | null }
//   record   { wins, ties, winsOverExpected } (the site's Teams row) for the wins the margin implies
export function totalsOf(log, { wins = null, ties = 0, winsOverExpected = null } = {}) {
  const block = (games) => {
    const n = games.length;
    let scored = 0;
    let allowed = 0;
    for (const g of games) {
      const [us, them] = g.score.split('-').map(Number);
      scored += us;
      allowed += them;
    }
    const boxed = games.map((g) => g.box).filter(Boolean);
    const add = (k) => boxed.reduce((s, b) => s + (b[k] ?? 0), 0);
    const b = boxed.length;
    const [passYds, rushYds, oppPassYds, oppRushYds] = ['passYds', 'rushYds', 'oppPassYds', 'oppRushYds'].map(add);
    const [turnovers, takeaways] = [add('turnovers'), add('takeaways')];
    return {
      games: n,
      pointsScored: scored,
      pointsAllowed: allowed,
      differential: scored - allowed,
      scoredPerGame: n ? r(scored / n, 1) : null,
      allowedPerGame: n ? r(allowed / n, 1) : null,
      differentialPerGame: n ? r((scored - allowed) / n, 1) : null,
      ...(b
        ? {
            // (from the box scores: every game's unless gamesWithBox says fewer)
            ...(b < n ? { gamesWithBox: b } : {}),
            offense: { passYds, rushYds, totalYds: passYds + rushYds, yardsPerGame: r((passYds + rushYds) / b, 1), turnovers, sacksAllowed: add('sacksAllowed'), penaltyYds: add('penaltyYds') },
            defense: { passYdsAllowed: oppPassYds, rushYdsAllowed: oppRushYds, yardsAllowed: oppPassYds + oppRushYds, yardsAllowedPerGame: r((oppPassYds + oppRushYds) / b, 1), takeaways, sacks: add('defSacks') },
            turnoverDiff: takeaways - turnovers,
          }
        : {}),
    };
  };
  const regular = block(log.filter((g) => !g.round && g.score));
  if (Number.isFinite(wins) && Number.isFinite(winsOverExpected)) regular.winsByDifferential = r(wins + 0.5 * (ties ?? 0) - winsOverExpected, 1);
  const post = log.filter((g) => g.round && g.score);
  return { regularSeason: regular, ...(post.length ? { playoffs: block(post) } : {}) };
}

// What the totals block holds, for the sheet's glossary
export const TOTALS_GLOSSARY = {
  totals: "Season totals added up from the sheet's own game log, to quote as they are: regularSeason, and playoffs when it played in them",
  pointsScored: 'Points scored over those games (the game log\'s scores)',
  pointsAllowed: 'Points allowed over those games',
  differential: 'Points scored minus allowed',
  winsByDifferential: 'The wins its point differential implies (its wins, a tie a half, minus Wins Over Expected)',
  offense: "The offense's box-score totals: passing and rushing yards, turnovers, sacks taken, penalty yards",
  defense: "The defense's box-score totals: passing and rushing yards allowed, takeaways, sacks made",
  turnoverDiff: 'Takeaways minus turnovers',
};

// Whether a row's report this season is already its recap (the site's file, or the kept report): weekly
// runs skip it then. kept: the parsed site file or kept report, or null.
export const isRecapOf = (kept, season) => !!kept && kept.mode === 'recap' && String(kept.season) === String(season);
