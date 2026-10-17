// MLB's files for the Overview's splash (libs/ranker/scripts/splash/files.mjs says what each holds), for a
// season the site has, from the MLB Stats API (statsapi.mlb.com, free, no key):
//   outcomes.json         each team's season: the postseason's series (wild card, division, championship, World
//                         Series), the standings (record, division, its title, the wild card); a game away
//                         from its home team's park that season at a neutral site
//   numbers.json          each player's number (each team's full-season roster: jerseyNumber)
//   best-games.<TAB>.json each player's best regular-season game (his game log: best-game.mjs's measures)
//   milestones.json       the season's notable marks: { <card id>: [{ mark, big, small, tip, date?, opp? }] },
//                         the rarest first: a perfect game, a no-hitter, a cycle, three homers in a game, 15
//                         strikeouts; then the season's 50 or 40 homers, 200 hits, 40 steals, a .340 average,
//                         20 wins, 200 or 300 strikeouts, 40 saves, an ERA under 2.00
//
// Usage: node apps/mlb/scripts/build-splash.mjs            the current season (ONLY=outcomes: just outcomes.json;
//                                                        ONLY=numbers: the rosters alone, no game logs)
//        node apps/mlb/scripts/build-splash.mjs 2022       a past one ("2000-2025", "2019,2021", or all)
import path from 'node:path';
import { fetchRetry, pacer } from '../../../libs/ranker/scripts/fetch.mjs';
import { cacheRoster, currentSeason, seasonDir, seasonsAsked, siteRows, sortKeys, writeBestGames, writeIfChanged } from '../../../libs/ranker/scripts/splash/files.mjs';
import { buildOutcomes, gameFor } from '../../../libs/ranker/scripts/splash/outcomes.mjs';
import { bestOf, dayTitle, mlbHittingGame, mlbPitchingGame } from '../../../libs/ranker/scripts/splash/best-game.mjs';
import { milestonesOf } from '../../../libs/ranker/scripts/splash/milestones.mjs';

const API = 'https://statsapi.mlb.com/api/v1';
const CURRENT = currentSeason('mlb');
const pace = pacer(250);
const get = (url) => fetchRetry(url, { as: 'json', attempts: 3, backoff: 2000, before: pace, notFound: null });
const LEAGUE = { 103: 'AL', 104: 'NL' };
const DIVISION = { 200: 'AL West', 201: 'AL East', 202: 'AL Central', 203: 'NL West', 204: 'NL East', 205: 'NL Central' };

// ---- outcomes
async function outcomes(season) {
  const standings = await get(`${API}/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason&hydrate=team`);
  const info = (await get(`${API}/seasons/${season}?sportId=1`))?.seasons?.[0] ?? {};
  const regDone = season < CURRENT || (info.regularSeasonEndDate && Date.now() > Date.parse(info.regularSeasonEndDate) + 864e5);
  const teams = [];
  for (const rec of standings?.records ?? []) {
    for (const t of rec.teamRecords) {
      teams.push({
        key: String(t.team.id),
        abbr: t.team.abbreviation,
        venue: t.team.venue?.id ?? null,
        conf: LEAGUE[rec.league?.id ?? t.team.league?.id],
        division: DIVISION[rec.division?.id] ?? null,
        divRank: Number(t.divisionRank) || null,
        record: `${t.wins}-${t.losses}`,
        divChamp: regDone && !!t.divisionChamp,
        wildCard: regDone && !t.divisionChamp && ['w', 'x'].includes(t.clinchIndicator) ? Number(t.wildCardRank) || true : false,
        pct: t.wins / Math.max(1, t.wins + t.losses),
        leagueRank: Number(t.leagueRank) || 99,
        wcBack: t.wildCardGamesBack,
      });
    }
  }
  const abbr = Object.fromEntries(teams.map((t) => [t.key, t.abbr]));
  // (a game away from its home team's park that season was at a neutral site: 2020's postseason bubble, a
  // London or Tokyo series; the API has no flag for it)
  const park = Object.fromEntries(teams.map((t) => [t.key, t.venue]));
  const neutral = (g) => {
    const home = park[String(g.teams.home.team.id)];
    return home && g.venue?.id && g.venue.id !== home ? { neutral: true } : {};
  };
  const confOf = Object.fromEntries(teams.map((t) => [t.key, t.conf]));
  // the postseason's series (the tiebreaker games, R, aren't)
  const post = regDone ? await get(`${API}/schedule/postseason/series?season=${season}&sportId=1`) : null;
  const ROUND = season < 2012 ? { D: 1, L: 2, W: 3 } : { F: 1, D: 2, L: 3, W: 4 };
  const totalRounds = season < 2012 ? 3 : 4;
  const series = [];
  for (const s of post?.series ?? []) {
    const type = s.series?.gameType;
    if (!ROUND[type]) continue;
    const games = s.games ?? [];
    const teamsIn = [String(games[0].teams.home.team.id), String(games[0].teams.away.team.id)];
    // (a suspended game is listed twice, where it stopped and where it finished: once, its last listing)
    const byPk = new Map();
    for (const g of games.filter((x) => x.status?.abstractGameState === 'Final' && x.teams.home.score !== undefined)) byPk.set(g.gamePk, g);
    const done = [...byPk.values()].filter((g) => !/suspend/i.test(g.status?.detailedState ?? ''));
    const wins = Object.fromEntries(teamsIn.map((k) => [k, 0]));
    for (const g of done) {
      const [h, a] = [String(g.teams.home.team.id), String(g.teams.away.team.id)];
      if (g.teams.home.score > g.teams.away.score) wins[h]++;
      else if (g.teams.away.score > g.teams.home.score) wins[a]++;
    }
    const length = Math.max(...games.map((g) => g.gamesInSeries ?? 1));
    const need = Math.floor(length / 2) + 1;
    const winner = teamsIn.find((k) => wins[k] >= need) ?? null;
    const lg = confOf[teamsIn[0]];
    const name = type === 'W' ? 'World Series' : type === 'L' ? `${lg}CS` : type === 'D' ? `${lg}DS` : `${lg} Wild Card ${length === 1 ? 'Game' : 'Series'}`;
    series.push({
      round: ROUND[type],
      roundName: name,
      teams: teamsIn,
      wins,
      winner,
      // (a one-game wild card is a game: its score, like the NFL's)
      single: length === 1,
      games: done.map((g) => ({ date: g.officialDate, home: String(g.teams.home.team.id), score: { [String(g.teams.home.team.id)]: g.teams.home.score, [String(g.teams.away.team.id)]: g.teams.away.score }, ...neutral(g) })),
    });
  }
  // the seeds: 2022 on (and 2020's eight a league), the division winners first, by record; earlier seasons had
  // none, only the wild cards (seedLabel)
  if (regDone) {
    for (const lg of ['AL', 'NL']) {
      const mine = teams.filter((t) => t.conf === lg).sort((a, b) => b.pct - a.pct || a.leagueRank - b.leagueRank);
      const winners = mine.filter((t) => t.divChamp);
      if (season >= 2022) {
        winners.forEach((t, i) => (t.seed = i + 1));
        mine.filter((t) => !t.divChamp && t.wildCard).forEach((t, i) => (t.seed = winners.length + i + 1));
      } else if (season === 2020) {
        const field = new Set(series.filter((s) => s.round === 1).flatMap((s) => s.teams));
        const seconds = mine.filter((t) => !t.divChamp && t.divRank === 2 && field.has(t.key));
        const rest = mine.filter((t) => !t.divChamp && t.divRank !== 2 && field.has(t.key));
        [...winners, ...seconds, ...rest].forEach((t, i) => (t.seed = i + 1));
      } else {
        for (const t of mine) if (t.wildCard) t.seedLabel = season >= 2012 ? `WC${t.wildCard === true ? '' : t.wildCard}` : 'WC';
      }
    }
    const field = new Set(series.flatMap((s) => s.teams));
    for (const t of teams) if (!field.has(t.key)) t.gamesBack = Math.max(0, Number(String(t.wcBack).replace('+', '-')) || 0);
  }
  // each team's last game: its last postseason game, else the regular season's last (its final week)
  const lastGames = {};
  if (info.regularSeasonEndDate) {
    const end = info.regularSeasonEndDate;
    const start = new Date(Date.parse(end) - 7 * 864e5).toISOString().slice(0, 10);
    const sched = await get(`${API}/schedule?sportId=1&gameType=R&startDate=${start}&endDate=${end}`);
    for (const d of sched?.dates ?? []) {
      for (const g of d.games ?? []) {
        if (g.status?.abstractGameState !== 'Final' || g.teams.home.score === undefined) continue;
        const [h, a] = [String(g.teams.home.team.id), String(g.teams.away.team.id)];
        const game = { date: g.officialDate, home: h, score: { [h]: g.teams.home.score, [a]: g.teams.away.score }, ...neutral(g) };
        for (const k of [h, a]) if (!lastGames[k] || lastGames[k].date <= game.date) lastGames[k] = gameFor(game, k, (x) => abbr[x] ?? x);
      }
    }
  }
  return { out: buildOutcomes({ teams, series, totalRounds, lastGames, fieldSet: regDone && series.length > 0, abbrOf: (k) => abbr[k] ?? k }), abbr };
}

// ---- the players: jerseys, best games, milestones
const chunks = (xs, size) => Array.from({ length: Math.ceil(xs.length / size) }, (_, i) => xs.slice(i * size, i * size + size));

async function players(season, rows, teamKeys, abbr) {
  // (his number with the team the site shows him on; else any team's that season)
  const numbers = new Map();
  for (const team of teamKeys) {
    const roster = await get(`${API}/teams/${team}/roster?season=${season}&rosterType=fullSeason`);
    for (const p of roster?.roster ?? []) if (/^\d{1,2}$/.test(p.jerseyNumber ?? '')) (numbers.get(String(p.person.id)) ?? numbers.set(String(p.person.id), []).get(String(p.person.id))).push({ team, num: String(p.jerseyNumber) });
  }
  cacheRoster('mlb', season, numbers);
  // (ONLY=numbers: the rosters alone, no game logs)
  const numbersOnly = process.env.ONLY === 'numbers';
  // every player's game log, fifty to a request
  const ids = new Map();
  for (const [tab, list] of Object.entries(rows)) {
    if (['TM', 'HC'].includes(tab)) continue;
    for (const row of list) {
      const [kind, id] = String(row.cardId).split('-');
      if (!id) continue;
      ids.set(row.cardId, { tab, kind, id, row });
    }
  }
  const logs = new Map();
  for (const group of numbersOnly ? [] : ['hitting', 'pitching']) {
    const want = [...new Set([...ids.values()].filter((x) => (x.kind === 'P') === (group === 'pitching')).map((x) => x.id))];
    for (const part of chunks(want, 50)) {
      const res = await get(`${API}/people?personIds=${part.join(',')}&hydrate=stats(group=[${group}],type=[gameLog],season=${season})`);
      for (const p of res?.people ?? []) logs.set(`${group === 'pitching' ? 'P' : 'H'}-${p.id}`, (p.stats ?? []).flatMap((s) => s.splits ?? []));
    }
  }
  const jerseys = {};
  const best = {};
  const milestones = {};
  for (const [cardId, { tab, kind, id, row }] of ids) {
    const nums = numbers.get(id);
    if (nums?.length) jerseys[cardId] = (nums.find((x) => x.team === row.team) ?? nums.at(-1)).num;
    if (numbersOnly) continue;
    const splits = logs.get(cardId) ?? [];
    const scored = splits.flatMap((sp) => {
      const s = (kind === 'P' ? mlbPitchingGame : mlbHittingGame)(sp.stat ?? {});
      if (!s) return [];
      const opp = abbr[String(sp.opponent?.id)] ?? sp.opponent?.name ?? '';
      return [{ value: s.value, date: sp.date, opp, oppTeam: String(sp.opponent?.id ?? ''), home: !!sp.isHome, ...(sp.isWin !== undefined ? { result: sp.isWin ? 'W' : 'L' } : {}), title: dayTitle(sp.date, opp, sp.isHome), line: s.line, stat: sp.stat }];
    });
    const top = bestOf(scored);
    if (top) {
      const { stat, ...game } = top;
      (best[tab] ??= {})[cardId] = { ...game, games: scored.length };
    }
    const marks = milestonesOf(kind, row.stats ?? {}, scored);
    if (marks.length) milestones[cardId] = marks;
  }
  return { jerseys, best, milestones };
}

async function main() {
  for (const season of seasonsAsked('mlb')) {
    const dir = seasonDir('mlb', season);
    if (!dir) {
      console.log(`MLB ${season}: not a season the site has`);
      continue;
    }
    const { out: o, abbr } = await outcomes(season);
    const written = [writeIfChanged(path.join(dir, 'outcomes.json'), sortKeys(o))];
    // (ONLY=outcomes: the outcomes alone, the players' files left as they are)
    if (process.env.ONLY === 'outcomes') {
      console.log(`MLB ${season}: outcomes (champion ${Object.entries(o).find(([, v]) => v.result === 'champion')?.[0] ?? 'none yet'})`);
      continue;
    }
    const p = await players(season, siteRows(dir), Object.keys(o), abbr);
    if (Object.keys(p.jerseys).length) written.push(writeIfChanged(path.join(dir, 'numbers.json'), sortKeys(p.jerseys)));
    if (process.env.ONLY === 'numbers') {
      console.log(`MLB ${season}: ${Object.keys(p.jerseys).length} numbers; ` + written.map((w) => `${path.basename(w.file)} ${(w.size / 1024).toFixed(1)} KB${w.same ? ' (same)' : ''}`).join(', '));
      continue;
    }
    written.push(...writeBestGames(dir, p.best));
    written.push(writeIfChanged(path.join(dir, 'milestones.json'), sortKeys(p.milestones)));
    const champ = Object.entries(o).find(([, v]) => v.result === 'champion')?.[0] ?? 'none yet';
    console.log(
      `MLB ${season}: ${Object.keys(o).length} teams (champion ${champ}), ${Object.keys(p.jerseys).length} numbers, ` +
        `${Object.values(p.best).reduce((s, x) => s + Object.keys(x).length, 0)} best games, ${Object.keys(p.milestones).length} with milestones; ` +
        written.map((w) => `${path.basename(w.file)} ${(w.size / 1024).toFixed(1)} KB${w.same ? ' (same)' : ''}`).join(', '),
    );
  }
}

await main();
