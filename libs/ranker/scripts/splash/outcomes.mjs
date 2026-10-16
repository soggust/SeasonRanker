// How each team's season ended: the splash's shelf reads it (a title's trophy, a pennant, the ticket stub of
// the game it ended in, the boarding pass of a season that missed the playoffs). Plain data in, data out
// (tests/splash-outcomes.test.mjs); each sport's build-splash.mjs gathers the data: the NFL's from nflverse's
// schedule and standings (with apps/nfl/scripts/analysis/season-state.mjs for a season being played), the
// NBA's from ESPN (libs/ranker/scripts/analysis/season-state.mjs), the NHL's from its own API's bracket and
// standings, MLB's from the MLB Stats API's postseason series and standings.
//
// A season's file, outcomes.json: { <team (its logo's name)>: Outcome }
//   result     'champion' | 'finalist' (lost the final) | 'semis' (lost the round before it) | 'playoffs'
//              (out before that) | 'missed' | null (still to be decided). While a team is still playing,
//              the furthest it has got so far (a team in the final: 'finalist') and over false.
//   over       its season is done
//   round      the last playoff round it played (1 the first round of the season's bracket; 0 none)
//   roundName  that round's name: 'Super Bowl', 'AFC Championship', 'NLDS', 'Eastern Conference Finals'...
//   opp, oppTeam  who it last played in the playoffs (the one that ended it, or the champion's beaten
//              finalist): the league's abbreviation, and its logo's name
//   score      that series' wins ("4-2", this team's first) or the NFL game's score ("25-22"); ot: past regulation
//   seed       its playoff seed (null when the league had none: MLB before 2020); seedLabel the league's own
//              ('D1', 'WC2' in the NHL)
//   divChamp, confChamp   won its division; won its conference (reached the final: MLB's pennant)
//   conf, division, divRank   its conference ('AFC', 'East', 'AL'...), division, and place in it
//   record     its regular season ("12-5", the NHL's "W-L-OTL")
//   gamesBack  (missed teams) how far it missed by: games behind the last team in its conference's field (MLB's
//              wild card; the NHL's in points)
//   playIn     the NBA's play-in: played in it (a play-in loser missed the playoffs)
//   playoffs   its playoff rounds in order: [{ round, roundName, opp, oppTeam, won, score, date, home?, ot? }]
//              (date: the series' last game; home: the NFL's games)
//   lastGame   its last game: { date, opp, oppTeam, home, result 'W'|'L'|'T', score (its first), ot? }

// A season's outcomes.
//   teams    [{ key, abbr, conf, division, divRank, seed, seedLabel, record, divChamp, gamesBack }]
//   series   the playoff rounds' series (an NFL game is a series of one): [{ round, roundName (or a function
//            of the team's conference), teams: [keyA, keyB], wins: { key: n }, winner (key, or null while
//            being played), games: [{ date, home (key), score: { key: n }, ot }] }]
//            round: 1 for the season's first round; totalRounds the final
//   totalRounds  the rounds in the season's bracket (the NFL's 4; MLB's 3 before 2012)
//   playIn   the NBA's play-in games: [{ date, home, score, teams }]
//   lastGames  { key: lastGame } for teams whose last game isn't a playoff one (the regular season's last)
//   fieldSet   the playoff field is known (the regular season is over): a team out of it missed
export function buildOutcomes({ teams, series = [], totalRounds, playIn = [], lastGames = {}, fieldSet = true, abbrOf = (k) => k }) {
  if (!totalRounds) throw new Error('buildOutcomes: totalRounds (the rounds in the season bracket) is needed');
  const out = {};
  for (const t of teams) {
    const mine = series.filter((s) => s.teams.includes(t.key)).sort((a, b) => a.round - b.round);
    const rounds = mine.map((s) => {
      const opp = s.teams.find((k) => k !== t.key);
      const last = [...s.games].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
      const single = !!s.single;
      // (a round not begun yet: no games, no score)
      const score = !last ? null : single ? `${last.score[t.key]}-${last.score[opp]}` : `${s.wins[t.key] ?? 0}-${s.wins[opp] ?? 0}`;
      return {
        round: s.round,
        roundName: typeof s.roundName === 'function' ? s.roundName(t.conf) : s.roundName,
        opp: abbrOf(opp),
        oppTeam: opp,
        won: s.winner ? s.winner === t.key : null,
        score,
        date: last?.date ?? null,
        ...(single && last ? { home: last.home === t.key } : {}),
        ...(single && last?.ot ? { ot: true } : {}),
      };
    });
    const last = rounds.at(-1);
    // (the furthest a team still playing has got: the round it's in, or the next one when it has won its last)
    const stage = (r) => (r >= totalRounds ? 'finalist' : r === totalRounds - 1 ? 'semis' : 'playoffs');
    let result = null;
    let over = false;
    if (last?.won === true && last.round === totalRounds) [result, over] = ['champion', true];
    else if (last?.won === false) [result, over] = [stage(last.round), true];
    else if (last) result = stage(last.won ? last.round + 1 : last.round);
    else if (fieldSet) [result, over] = ['missed', true];
    const played = playIn.filter((g) => g.teams.includes(t.key));
    const lastPost = mine.flatMap((s) => s.games).sort((a, b) => a.date.localeCompare(b.date)).at(-1) ?? played.sort((a, b) => a.date.localeCompare(b.date)).at(-1);
    const lastGame = lastPost ? gameFor(lastPost, t.key, abbrOf) : lastGames[t.key] ?? null;
    out[t.key] = {
      result,
      over,
      round: last?.round ?? 0,
      roundName: last?.roundName ?? (played.length ? 'Play-In' : null),
      opp: last?.opp ?? null,
      oppTeam: last?.oppTeam ?? null,
      score: last?.score ?? null,
      ...(last?.ot ? { ot: true } : {}),
      seed: t.seed ?? null,
      ...(t.seedLabel ? { seedLabel: t.seedLabel } : {}),
      divChamp: !!t.divChamp,
      confChamp: rounds.some((r) => r.round === totalRounds - 1 && r.won) || rounds.some((r) => r.round === totalRounds),
      conf: t.conf ?? null,
      division: t.division ?? null,
      divRank: t.divRank ?? null,
      record: t.record ?? null,
      gamesBack: t.gamesBack ?? null,
      ...(played.length ? { playIn: true } : {}),
      playoffs: rounds,
      lastGame,
    };
  }
  return out;
}

// A game as one team saw it
export function gameFor(g, key, abbrOf = (k) => k) {
  const opp = Object.keys(g.score).find((k) => k !== key);
  const [us, them] = [g.score[key], g.score[opp]];
  return {
    date: g.date,
    opp: abbrOf(opp),
    oppTeam: opp,
    home: g.home === key,
    result: us > them ? 'W' : us < them ? 'L' : 'T',
    score: `${us}-${them}`,
    ...(g.ot ? { ot: true } : {}),
  };
}

// The series a list of playoff games makes: one per pair of teams (two teams meet once a postseason),
// its wins counted from the games played, its winner the first to `needed` wins (needed(games) the wins a
// series of these games takes; null: it's decided by the source's own word, `decided`)
export function seriesOf(games, { needed, decided } = {}) {
  const pairs = new Map();
  for (const g of games) {
    const key = [...g.teams].sort().join('/');
    (pairs.get(key) ?? pairs.set(key, []).get(key)).push(g);
  }
  return [...pairs.values()].map((list) => {
    list.sort((a, b) => a.date.localeCompare(b.date));
    const teams = [...list[0].teams];
    const wins = Object.fromEntries(teams.map((k) => [k, 0]));
    for (const g of list.filter((x) => x.final !== false)) {
      const [a, b] = teams;
      if (g.score[a] > g.score[b]) wins[a]++;
      else if (g.score[b] > g.score[a]) wins[b]++;
    }
    const need = needed ? needed(list) : null;
    let winner = decided ? decided(list, wins) : null;
    if (!winner && need) winner = teams.find((k) => wins[k] >= need) ?? null;
    return { teams, wins, winner, games: list.map(({ date, home, score, ot }) => ({ date, home, score, ...(ot ? { ot: true } : {}) })), first: list[0].date };
  });
}

// Rounds by the bracket's chain, when the source doesn't name them (ESPN's older seasons): the final is the
// last series of all, and a series' winner goes on to the next round's; so a series is one round before
// the next one its winner plays. Each series gets round (1 the first)
export function roundsByChain(series) {
  const byTeam = new Map();
  for (const s of series) for (const k of s.teams) (byTeam.get(k) ?? byTeam.set(k, []).get(k)).push(s);
  for (const list of byTeam.values()) list.sort((a, b) => a.first.localeCompare(b.first));
  const level = new Map();
  const levelOf = (s, depth = 0) => {
    if (level.has(s)) return level.get(s);
    if (depth > 10) return 0;
    const next = s.winner ? byTeam.get(s.winner).find((x) => x.first > s.first) : null;
    // (no next: the final, or a series not decided yet; that one is a round before what its
    // teams' other series say)
    const v = next ? levelOf(next, depth + 1) + 1 : s.winner ? 0 : undecidedLevel(s);
    level.set(s, v);
    return v;
  };
  const undecidedLevel = (s) => {
    // (a series being played: as many rounds from the final as the deepest finished chain allows)
    const before = s.teams.map((k) => byTeam.get(k).filter((x) => x.first < s.first).length);
    return Math.max(0, maxRounds - 1 - Math.max(...before));
  };
  const maxRounds = Math.max(...[...byTeam.values()].map((l) => l.length));
  for (const s of series) levelOf(s);
  const top = Math.max(0, ...level.values());
  for (const s of series) s.round = top - level.get(s) + 1;
  return series;
}

// The places in each division by record (best first; a tie by the seed, the better seed first): { key: place }
export function divisionRanks(teams, pct) {
  const out = {};
  const byDiv = new Map();
  for (const t of teams) (byDiv.get(t.division) ?? byDiv.set(t.division, []).get(t.division)).push(t);
  for (const list of byDiv.values()) {
    list.sort((a, b) => pct(b) - pct(a) || (a.seed ?? 99) - (b.seed ?? 99));
    list.forEach((t, i) => (out[t.key] = i + 1));
  }
  return out;
}

// Games behind the last team in the conference's field: ((its W - L) - (this W - L)) / 2 (0 or less: in it)
export function gamesBehind(teams, fieldKeys, wl) {
  const out = {};
  for (const conf of new Set(teams.map((t) => t.conf))) {
    const mine = teams.filter((t) => t.conf === conf);
    const field = mine.filter((t) => fieldKeys.has(t.key));
    if (!field.length) continue;
    const margin = (t) => wl(t).w - wl(t).l;
    const cut = Math.min(...field.map(margin));
    for (const t of mine) if (!fieldKeys.has(t.key)) out[t.key] = Math.max(0, (cut - margin(t)) / 2);
  }
  return out;
}
