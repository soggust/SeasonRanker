// The AI team analysis for MLB, NBA and NHL (the NFL's is apps/nfl/scripts/analysis/analyze.mjs, whose
// prompt, checks and costs this follows): each team's sheet (dossier.mjs) through Claude, a structured
// report back, checked against the sheet (every evidence path must resolve; numbers in the prose are
// looked up), kept in .cache/analysis/<sport>/reports/team-<key>.json with its token usage, and published
// for the site (apps/<sport>/src/StaticData/analysis/team-<key>.json and its index).
//
// Two kinds of report:
//   preview  while the team's season is on (weekly): who it is, what drives its record, the week ahead,
//            where the season is heading. No betting angles, as in every sport's
//            analysis (the NFL's too since 2026-10-14): the Book has the bets, at live prices.
//   recap    once its season is over (eliminated, or the final done): the year in one section. That's
//            its last report of the season (weekly.mjs runs no more for it).
//
// Spending: Opus 5.5 through the Batch API (half price). Before a batch is sent, each request is priced at
// its worst (its input counted, the whole max_tokens as output) and requests are left out once the run's
// cap ($10 unless --cap) would be passed: a run can't spend more than the cap.
//
// Used by weekly.mjs; on its own:
//   node libs/ranker/scripts/analysis/analyze.mjs --publish=mlb     (no calls: the kept reports to the site)

import Anthropic from '@anthropic-ai/sdk';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { describe, staleOf } from './prune.mjs';
import path from 'node:path';
import { ROOT, SPORTS } from './dossier.mjs';

export const MODEL = 'claude-opus-5-5';
const EFFORT = process.env.EFFORT ?? 'high';
export const MAX_TOKENS = 16000;
// $ per million tokens (Opus 5.5); the Batch API halves both
export const PRICE = { input: 4, output: 20 };
export const DEFAULT_CAP = 10;

export const cacheDir = (sport) => path.join(ROOT, '.cache/analysis', sport);
export const siteDir = (sport) => path.join(ROOT, 'apps', sport, 'src/StaticData/analysis');

// ---- the prompts

const ARCHETYPES = {
  mlb: 'World Series Contender, Playoff Team, Wild Card Hopeful, Fringe Contender, Pretender (record ahead of its play), Better Than Its Record, Retooling, Rebuilding',
  nba: 'Title Contender, Playoff Team, Play-In Team, Fringe Contender, Pretender (record ahead of its play), Better Than Its Record, Retooling, Rebuilding, Tanking',
  nhl: 'Cup Contender, Playoff Team, Bubble Team, Pretender (record ahead of its play), Better Than Its Record, Retooling, Rebuilding',
};
const SEASON_KINDS = {
  mlb: 'Champion, Pennant Winner, Contender That Fell Short, Early Playoff Exit, Overachiever, Underachiever, Near Miss, Lost Season, Rebuilding Year, Retooling Year',
  nba: 'Champion, Conference Champion, Contender That Fell Short, Early Playoff Exit, Play-In Exit, Overachiever, Underachiever, Near Miss, Lost Season, Rebuilding Year, Retooling Year',
  nhl: 'Champion, Conference Champion, Contender That Fell Short, Early Playoff Exit, Overachiever, Underachiever, Near Miss, Lost Season, Rebuilding Year, Retooling Year',
};
// What each sport scores
const SCORING = { mlb: 'runs', nba: 'points', nhl: 'goals' };
// What each sport's sheet holds beyond the common parts
const SPORT_NOTES = {
  mlb: `- Scoring is runs. season.team: runDiff (Run Diff / G), offRank and defRank (league ranks by runs scored and allowed per game: 1 = best, plain numbers), team OPS and ERA, Fielding Runs, W vs Run Diff (pythDiff: wins beyond what the run differential implies, mostly luck in close games), Park (100 average, context only). Grades: hitters, rotation, bullpen.
- roster groups: hitters (by plate appearances), rotation (starters, by innings), bullpen (relievers, by innings). WAR, PA, IP, HR, RBI, SB, strikeouts, saves and holds are season totals; the rest are rates (kPct and bbPct are fractions: .218 is 21.8%). IP is in baseball notation as the site shows it ("162.2" is 162 and two thirds innings): quote it as written.`,
  nba: `- Scoring is points. season.team: Net Rtg (points per 100 possessions scored minus allowed), offRank and defRank (league ranks by offensive and defensive rating: 1 = best, plain numbers), W vs Pt Diff (pythDiff: luck in close games), Pace (context only). Grades: backcourt, wings, frontcourt.
- roster: by minutes; minutes, points, rebounds, assists and threes are season totals, as the site shows them (no per-game figures of your own); TS %, USG % are percentages; BPM, Win Shares, On-Off as the site shows them.
- season.vsPosition (and weekAhead.opponents.*.vsPosition): what the defense allowed to each position (PG, SG, SF, PF, C): for pts, reb, ast, fg3 (threes) and pra: g = a game, vs = over those players' own averages in their other games, r = the rank of g and rv the rank of vs (1 = the least allowed); share = the share of the points against it by position (s) against the league's (lg). Context to weigh, not a verdict.`,
  nhl: `- Scoring is goals; the record is wins-losses-overtime losses. season.team: Goal Diff / GP, offRank and defRank (league ranks by goals for and against per game: 1 = best, plain numbers), PP % and PK %, xGF % and CF % (5-on-5 shares of expected goals and shot attempts), Goalies GSAx (goals saved above expected), Pts vs Goal Diff (ptsOver: luck in close games, overtime and shootouts), PDO (5-on-5 shooting % plus save %, 100 average; well above tends to fade; context only). Grades: forwards, blueline (defensemen), goaltending.
- roster: forwards and defensemen by ice time, goalies by starts; goals, assists, points, shots, +/- and PP points are season totals; TOI is minutes a game; xGF % a fraction.
- season.vsPosition (and the opponents'): what the defense allowed a game to centers (C), wingers (W), defensemen (D) and all forwards (F): goals, pts, shots; exp = those players' expected points from their own averages; vs = pts minus exp; rank (1 = held furthest under); share = the share of the points against it by role (s) against the league's (lg).`,
};

// The arithmetic the sheet has done (dossier.mjs), for the prompt to point at
const WORKED = (sport) => {
  const cfg = SPORTS[sport];
  return `- Worked out for you (quote these instead of computing): totals.regularSeason (scoredPerGame, allowedPerGame and differentialPerGame as [value, rank, of] across the league; vsLeague: leaguePerGame, the league's ${SCORING[sport]} a game, and the team's gap to it, team minus league; seasonGames, gamesLeft, and pace: its wins${cfg.ties ? ', standings points' : ''} and ${SCORING[sport]} differential carried over a full ${cfg.seasonGames}-game season, while the regular season is on); totals.recent.last5 and last10 (its last 5 and 10 games, once it has played more: the dates, the record${cfg.ties ? ' (W-L-OTL), standings points and points %' : ' and win %'}, ${SCORING[sport]} scored and allowed, the differential, a game's averages, and vsSeason = the stretch minus the whole season, so positive means more lately); season.vsLeague (each team stat's league average, the teams' mean, and the gap, team minus league: positive is more, whichever way is better)${
    sport === 'nhl'
      ? "; season.finishing (all situations, from the players' rows, each [value, rank, of]: shPct, the skaters' shooting %; svPct, the goalies' save %; pdoAll, the two added up x 100; shotsForPerGame and shotsAgainstPerGame), totals.groups.goaltending.savePct (the listed goalies' save % together) and history.N.standingsPoints (each past season's points)"
      : sport === 'nba'
        ? '; season.ratings (ortg and drtg, the offensive and defensive ratings behind Net Rtg, each [value, rank, of])'
        : ''
  }. A game in results.last10 past regulation carries ot.`;
};
const SHARP = `That rule is about arithmetic, not about thinking: be as sharp as ever. Set numbers side by side (the last few games against the season, this year against last, the team against the league, one group against another), say what produces them, follow the trend, and take a clear position; just quote the sheet's numbers for it.`;

const common = (sport) => `You get one team's sheet as JSON. It is your only source. Every number in it is one the site shows its readers or one worked out from them, and you may only state numbers that are in it. Cite only numbers in the sheet: don't add up, subtract, average or round sheet numbers yourself (no season totals summed from months, no combined innings, WAR or plate appearances of a few players, no records over a stretch of months, no differentials, gaps, per-game rates or paces you work out, no thresholds of your own like "everyone above 60%"). The totals block and the worked-out blocks below have the totals and comparisons worth quoting; if one you want isn't in the sheet, describe it in words ("most of the innings", "a losing record after May", "well below the league") rather than with a number. The one exception is a preview's restOfSeason.projections, your own estimates, which its restOfSeason body may quote. ${SHARP} Use no outside knowledge of players, teams, injuries, trades, contracts, coaches or results beyond what the sheet says. If something you'd want to know isn't there, don't guess.

How to read the sheet:
- [value, rank, of]: the value and its rank among the league's teams this season (1 = best; for stats where less is better, ERA or goals against, rank 1 is the fewest). A plain number is shown as it is.
- glossary: each stat key's column label on the site and what it means. Call stats by those labels.
- team: the record, coach, division standings (by record), siteRank = [its place on the site's Teams tab at the default settings, of], badges (titles, pennants).
- grades (in season.team): letter grades for each roster group: its players by the site's default rankings of their positions, weighted by playing time, curved across the league (A+ the best group, F the worst).
- roster: the players who carry each group, most playing time first: tabRank = [his place on his position's tab at the default settings, of], his stats, awards, injury.
${SPORT_NOTES[sport]}
- results: the regular season by month (record, scored, allowed, scored and allowed per game, recordThrough = the record at the month's end), the longest winning and losing streaks, the last 10 games (score: this team's first).
- postseason (when it played in it): the postseason table's line (ranked among the postseason teams), each series and its games, and its players' postseason lines.
- history: its recent seasons, each with the record, its site rank that season and its stats.
- totals: season totals added up from the site's numbers, for you to quote as they are: totals.regularSeason (games; the season's ${SCORING[sport]} scored and allowed, from the Game Log's scores; the differential, scored minus allowed; ${sport === 'nhl' ? 'standingsPoints' : 'winsByDifferential, the wins the margin implies (wins minus the W vs differential stat)'}), totals.groups (each roster group's listed players combined: players = how many are listed, and the sum of their season totals${sport === 'mlb' ? ', innings in the same notation' : ''}), and totals.postseason the same for its postseason games when it played some.
${WORKED(sport)}
Early in a season samples are small: weigh them honestly and say so when it matters, without hedging everything.

Think like an analyst, not a spreadsheet. Before calling anything a strength or a weakness, ask what produces it and judge the cause: a record built on close wins (luck that tends to regress, the W vs differential stat) versus one built on the margin; a stretch that lines up with who was playing; a group grade carried by one player; numbers against a soft or hard run of opponents. Check history before calling anything new.

Evidence: every point cites 1-3 numbers from the sheet by JSON path (dot notation from the sheet's root, array indexes as numbers, a player's stats under .stats: "season.team.runDiff", "roster.rotation.0.stats.era", "results.byMonth.3.record", "postseason.series.1.result", "totals.regularSeason.differential"). The site shows the real value from that path, so the path must exist exactly and lead to a number, a [value, rank, of] or a short text. The label is a 1-4 word name for the number.

Style: plain sentences, numbers woven in only where they make the point, no clichés, no filler, never restate the stats table.`;

export function systemPrompt(sport, mode) {
  const cfg = SPORTS[sport];
  if (mode === 'recap')
    return `You are the analyst behind a ${cfg.game} rankings site's team cards. This team's season is over (status.ended says how it ended), and the reader has opened its Analysis tab for the recap of its year: what kind of team it was, how the season unfolded, what drove it, how it ended, and what the year's numbers leave for next season. Write like a sharp analyst looking back with a point of view, in depth and in context: not a stat table read aloud, not a eulogy or a hype piece.

${common(sport)}

The recap: tell the arc of the season (the months, the streaks), what made the team what it was (its stats and grades, the players who carried it or let it down), and how it ended (each postseason series when it played in one; the margin it missed by when it didn't). Its look ahead rests only on what the numbers show (who carried it, which groups graded well or badly, what was luck), never on offseason news the sheet doesn't have.

The archetype: the kind of season it was, as fans and analysts would put it, optionally with a short qualifier in parentheses ("Contender That Fell Short (pitching-first)"). Pick from: ${SEASON_KINDS[sport]} — or an equally standard term if none fits. Define it in one sentence for this team's year.`;
  return `You are the analyst behind a ${cfg.game} rankings site's team cards. The reader has opened a team's Analysis tab to understand it properly: what kind of team this is, what is really driving its record, what is real and what is noise, how the coming week sets up, and where the season is heading. Write like a sharp analyst talking to a smart fan: in depth, in context, with a point of view. Not a stat table read aloud, not a hype piece, not disconnected bullet points.

${common(sport)}
- weekAhead: the games in the coming week (games: each day's opponent, home or away) and each opponent once (its record, site rank, season line, and what its defense allows by position when the sport has it). The report is written once a week, so preview the week as a stretch of games, not one game; in the postseason, the series.

The archetype: the established way fans and analysts describe this kind of team, optionally with a short qualifier in parentheses for its style ("Playoff Team (pitching-first)"). Pick from: ${ARCHETYPES[sport]} — or an equally standard term if none fits. Define it in one sentence for this team.

Projections: ranges you project for the rest of the season (e.g. "Final wins", "Runs scored / game"); in the postseason, its run (e.g. "Series wins").`;
}

// ---- the report's shapes

const evidence = {
  type: 'array',
  description: '1-3 sheet numbers backing this, by exact JSON path',
  items: {
    type: 'object',
    properties: {
      label: { type: 'string', description: '1-4 words, e.g. "Rotation ERA"' },
      path: { type: 'string', description: 'dot path into the sheet, e.g. season.team.era' },
    },
    required: ['label', 'path'],
    additionalProperties: false,
  },
};
const point = {
  type: 'object',
  properties: {
    title: { type: 'string', description: '3-7 words' },
    body: { type: 'string', description: '2-4 sentences: what it is, what causes it, whether it lasts' },
    evidence,
  },
  required: ['title', 'body', 'evidence'],
  additionalProperties: false,
};
const archetype = {
  type: 'object',
  properties: { name: { type: 'string', description: 'an established name, optional short qualifier in parentheses' }, definition: { type: 'string', description: 'one sentence, for this team' } },
  required: ['name', 'definition'],
  additionalProperties: false,
};
const trend = {
  type: 'object',
  properties: {
    direction: { type: 'string', enum: ['rising', 'falling', 'steady', 'volatile'] },
    note: { type: 'string', description: 'one or two sentences on the path through the season' },
  },
  required: ['direction', 'note'],
  additionalProperties: false,
};
const confidence = {
  type: 'object',
  properties: { level: { type: 'string', enum: ['low', 'medium', 'high'] }, note: { type: 'string', description: 'why, in a few words (sample size...)' } },
  required: ['level', 'note'],
  additionalProperties: false,
};

export const PREVIEW_SCHEMA = {
  type: 'object',
  properties: {
    archetype,
    headline: { type: 'string', description: 'one line, at most 14 words: the take on its season' },
    take: { type: 'string', description: 'the in-depth take: 3-4 paragraphs separated by blank lines — who it is, what is driving the season, what the numbers hide, where it is heading' },
    strengths: { type: 'array', description: '2-3, most important first', items: point },
    concerns: { type: 'array', description: '1-3, most important first; each judged in context', items: point },
    trend,
    weekAhead: {
      type: 'object',
      description: 'the coming week of games (or the series)',
      properties: {
        outlook: { type: 'string', enum: ['favorable', 'tough', 'neutral'] },
        headline: { type: 'string', description: 'at most 12 words' },
        body: { type: 'string', description: '1-2 paragraphs, separated by a blank line: how the week sets up against these opponents' },
        keyMatchups: { type: 'array', description: '1-3 specific matchups or factors', items: point },
        watch: { type: 'string', description: 'the one thing to watch' },
      },
      required: ['outlook', 'headline', 'body', 'keyMatchups', 'watch'],
      additionalProperties: false,
    },
    restOfSeason: {
      type: 'object',
      properties: {
        body: { type: 'string', description: '1-2 paragraphs: what to expect from here and why, what is sustainable and what will regress' },
        projections: {
          type: 'array',
          description: '2-4 ranges you project (your estimates)',
          items: {
            type: 'object',
            properties: { stat: { type: 'string', description: 'e.g. "Final wins"' }, low: { type: 'number' }, high: { type: 'number' } },
            required: ['stat', 'low', 'high'],
            additionalProperties: false,
          },
        },
        swingFactors: { type: 'array', description: '1-3 short phrases: what moves the outlook most', items: { type: 'string' } },
      },
      required: ['body', 'projections', 'swingFactors'],
      additionalProperties: false,
    },
    confidence,
  },
  required: ['archetype', 'headline', 'take', 'strengths', 'concerns', 'trend', 'weekAhead', 'restOfSeason', 'confidence'],
  additionalProperties: false,
};

export const RECAP_SCHEMA = {
  type: 'object',
  properties: {
    archetype,
    headline: { type: 'string', description: 'one line, at most 14 words: the take on its year' },
    recap: {
      type: 'object',
      properties: {
        finish: { type: 'string', description: 'one line: the record and how it ended, e.g. "87-75; lost the Wild Card Series 0-2 to NYY"' },
        body: { type: 'string', description: 'the recap: 4-6 paragraphs separated by blank lines — what kind of team it was, the arc of the season, what drove it, how it ended, what it leaves for next year' },
        highlights: { type: 'array', description: '2-3 things that went right, most important first', items: point },
        lowlights: { type: 'array', description: '1-3 things that went wrong or held it back, most important first', items: point },
        arc: trend,
        nextYear: { type: 'string', description: 'one paragraph: what the numbers say carries into next season (who carried it, which groups need work, what was luck)' },
      },
      required: ['finish', 'body', 'highlights', 'lowlights', 'arc', 'nextYear'],
      additionalProperties: false,
    },
    confidence,
  },
  required: ['archetype', 'headline', 'recap', 'confidence'],
  additionalProperties: false,
};

export const params = (sport, dossier) => ({
  model: MODEL,
  max_tokens: MAX_TOKENS,
  output_config: { effort: EFFORT, format: { type: 'json_schema', schema: dossier.mode === 'recap' ? RECAP_SCHEMA : PREVIEW_SCHEMA } },
  // (cached: every team's call of a sport's run sends the same system, 2026-10-27; the dossier after it is each team's own)
  system: [{ type: 'text', text: systemPrompt(sport, dossier.mode), cache_control: { type: 'ephemeral' } }],
  messages: [{ role: 'user', content: `Team sheet:\n${JSON.stringify(dossier)}` }],
});

// ---- checking a report against its sheet

const walk = (obj, p) => p.split('.').reduce((o, k) => (o === null || o === undefined ? undefined : o[/^\d+$/.test(k) ? Number(k) : k]), obj);
// (a player's stat cited without its .stats, "roster.rotation.4.fip", read as roster.rotation.4.stats.fip;
// a team stat without its block, "season.pdo", from season.team, season.finishing or season.ratings)
const at = (obj, p) =>
  walk(obj, p) ??
  walk(obj, p.replace(/^((?:postseason\.)?roster\.\w+\.\d+)\.(?!stats$)(\w+)$/, '$1.stats.$2')) ??
  (/^season\.\w+$/.test(p) ? ['team', 'finishing', 'ratings'].map((b) => walk(obj, p.replace(/^season\./, `season.${b}.`))).find((v) => v !== undefined) : undefined);
// The value an evidence path shows: a ranked [value, rank, of] reads as its value and its rank; a short
// text (a record, a grade) as itself
export function resolve(dossier, p) {
  const v = at(dossier, p);
  if (v === undefined || v === null || (typeof v === 'object' && !Array.isArray(v))) return null;
  if (Array.isArray(v)) {
    if (v.length === 3 && v.every((x) => typeof x === 'number')) return { value: v[0], rank: v[1], of: v[2] };
    // (a place on a tab: [rank, of])
    if (v.length === 2 && v.every((x) => typeof x === 'number')) return { value: `#${v[0]} of ${v[1]}` };
    return null;
  }
  if (typeof v === 'string' && v.length > 40) return null;
  return { value: v };
}
// Every number a sheet holds (in its numbers and inside its texts: "87-75", "2026-27"), as it might be
// written: rounded, and a fraction as a percent
export function numbersIn(obj, out = new Set()) {
  const add = (n) => {
    for (const x of [n, Math.round(n * 10) / 10, Math.round(n * 100) / 100, Math.round(n)]) out.add(Math.abs(x));
    if (Math.abs(n) < 1) {
      out.add(Math.abs(Math.round(n * 1000) / 10)); // .363 -> 36.3%
      out.add(Math.abs(Math.round(n * 100))); // .363 -> 36%
    }
  };
  if (typeof obj === 'number') add(obj);
  else if (typeof obj === 'string') for (const m of obj.matchAll(/\d+(?:\.\d+)?/g)) add(Number(m[0]));
  else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      numbersIn(v, out);
      if (/^\d+$/.test(k)) add(Number(k));
    }
  }
  return out;
}
export const pointsOf = (r) => (r.recap ? [...r.recap.highlights, ...r.recap.lowlights] : [...r.strengths, ...r.concerns, ...(r.weekAhead?.keyMatchups ?? [])]);
const proseOf = (r) =>
  r.recap
    ? [r.headline, r.recap.finish, r.recap.body, r.recap.arc.note, r.recap.nextYear, ...pointsOf(r).map((p) => p.body)]
    : [r.headline, r.take, r.trend.note, r.weekAhead.body, r.weekAhead.watch, r.restOfSeason.body, ...pointsOf(r).map((p) => p.body)];
export function check(report, dossier) {
  const problems = [];
  for (const e of pointsOf(report).flatMap((p) => p.evidence)) if (!resolve(dossier, e.path)) problems.push(`bad path: ${e.path}`);
  // numbers in the prose that aren't in the sheet (small counts aren't checked; the report's own
  // projections, its forecast, are its to quote; a decade or a band, "the 2020s", "the mid-70s", isn't a
  // figure of the sheet's)
  const known = numbersIn(dossier);
  for (const p of report.restOfSeason?.projections ?? []) numbersIn([p.low, p.high], known);
  for (const m of proseOf(report).join(' ').matchAll(/-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d*\.?\d+/g)) {
    if (/^s\b/.test(m.input.slice(m.index + m[0].length))) continue;
    const n = Math.abs(Number(m[0].replace(/,/g, '')));
    if (Number.isInteger(n) && n <= 20) continue;
    if (!known.has(n)) problems.push(`unmatched number: ${m[0]}`);
  }
  return problems;
}

export function costOf(usage, batch) {
  const k = batch ? 0.5 : 1;
  // (cache writes at the input price, reads at a tenth: these requests don't cache, so both are 0)
  return (k * ((usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + 0.1 * (usage.cache_read_input_tokens ?? 0)) * PRICE.input + usage.output_tokens * PRICE.output)) / 1e6;
}
// A request's most it can cost: its input, and all of max_tokens as output
export const worstCost = (inputTokens, batch = true) => ((batch ? 0.5 : 1) * (inputTokens * PRICE.input + MAX_TOKENS * PRICE.output)) / 1e6;

// The jobs that fit under the cap, in order (recaps first: a season's last word), and the ones left out
export function underCap(jobs, cap) {
  const ordered = [...jobs].sort((a, b) => (a.mode === b.mode ? 0 : a.mode === 'recap' ? -1 : 1));
  const kept = [];
  const left = [];
  let total = 0;
  for (const j of ordered) {
    if (total + j.worst <= cap) {
      kept.push(j);
      total += j.worst;
    } else left.push(j);
  }
  return { kept, left, worst: total };
}

// ---- keeping and publishing

// A report as the site shows it: each evidence with its real value (bad paths dropped)
function forSite(report, dossier) {
  const r = structuredClone(report);
  for (const p of pointsOf(r)) p.evidence = p.evidence.map((e) => ({ label: e.label, ...(resolve(dossier, e.path) ?? {}) })).filter((e) => e.value !== undefined);
  return r;
}

function save(sport, job, message, batch) {
  const text = message.content.find((b) => b.type === 'text')?.text;
  const report = JSON.parse(text);
  const problems = check(report, job.dossier);
  const out = {
    id: `team-${job.key}`,
    sport,
    key: job.key,
    name: job.name,
    mode: job.dossier.mode,
    season: job.dossier.season.label,
    siteIds: job.siteIds,
    week: job.week ?? [],
    ended: job.dossier.status.ended ?? null,
    model: MODEL,
    effort: EFFORT,
    at: new Date().toISOString(),
    usage: message.usage,
    cost: costOf(message.usage, batch),
    problems,
    report,
    site: forSite(report, job.dossier),
  };
  const dir = path.join(cacheDir(sport), 'reports');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `team-${job.key}.json`), JSON.stringify(out, null, 2));
  return out;
}

// The site's copies for a season: one file a team (its latest report), and the index of row ids -> file
// (the Teams tab's row and its coaches'). This checkout's reports merge into what's out: a newer file out
// stays (another checkout wrote it), and this season's recap stays over any preview. Then the stale ones
// are taken down by the published files' own metadata (prune.mjs): another season's previews, and a
// preview whose week is played that the latest run didn't replace. A recap is never taken down: last
// season's stays until this season's first report for the team replaces it. Returns the stale files.
const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};
export const TEAM_COVERS = (file) => file.startsWith('team-');

export function publish(sport, seasonLabel, { site = siteDir(sport), dir = path.join(cacheDir(sport), 'reports'), now = new Date(), log = console.log } = {}) {
  mkdirSync(site, { recursive: true });
  for (const f of existsSync(dir) ? readdirSync(dir) : []) {
    const kept = readJson(path.join(dir, f));
    if (!kept || kept.season !== seasonLabel || !kept.site) continue;
    const file = path.join(site, `team-${kept.key}.json`);
    const cur = readJson(file);
    // (a published report newer than the kept one stays: another checkout wrote it; this season's recap
    // stays over a preview)
    if (cur?.at && cur.at > kept.at) continue;
    if (cur?.mode === 'recap' && cur.season === seasonLabel && kept.mode !== 'recap') continue;
    writeFileSync(
      file,
      JSON.stringify({ at: kept.at, model: kept.model, mode: kept.mode, season: kept.season, siteIds: kept.siteIds, game: null, ...(kept.mode === 'recap' ? { ended: kept.ended } : { week: kept.week }), report: kept.site }),
    );
  }
  const out = new Map();
  for (const f of readdirSync(site)) if (f.endsWith('.json') && f !== 'index.json') out.set(f.slice(0, -5), readJson(path.join(site, f)));
  const stale = staleOf(out, { season: seasonLabel, now, covers: TEAM_COVERS });
  for (const s of stale) {
    out.delete(s.file);
    rmSync(path.join(site, `${s.file}.json`), { force: true });
    log(`${SPORTS[sport]?.name ?? sport}: took down ${describe(s)}`);
  }
  const index = {};
  for (const [file, kept] of out) for (const id of kept?.siteIds ?? []) index[id] = file;
  writeFileSync(path.join(site, 'index.json'), JSON.stringify(index));
  log(`${SPORTS[sport]?.name ?? sport}: published ${new Set(Object.values(index)).size} analyses (${Object.keys(index).length} rows)`);
  return stale;
}

// A team's published report this season: { mode, at } or null
export function published(sport, key, seasonLabel) {
  const file = path.join(siteDir(sport), `team-${key}.json`);
  if (!existsSync(file)) return null;
  const kept = JSON.parse(readFileSync(file, 'utf8'));
  return kept.season === seasonLabel ? { mode: kept.mode, at: kept.at } : null;
}

// ---- running a sport's jobs ({ key, name, dossier, siteIds, week }) through the Batch API, under the cap.
// Returns { cost, written, left }.
export async function analyze(sport, jobs, { cap = DEFAULT_CAP, batch = true, log = console.log } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
  const client = new Anthropic();
  const name = SPORTS[sport].name;
  // each request priced at its worst before anything is spent (counting tokens is free)
  for (const j of jobs) {
    const p = params(sport, j.dossier);
    const counted = await client.messages.countTokens({ model: p.model, system: p.system, messages: p.messages });
    j.inputTokens = counted.input_tokens;
    j.worst = worstCost(counted.input_tokens, batch);
  }
  const { kept, left, worst } = underCap(jobs, cap);
  log(`${name}: ${kept.length} reports, at most $${worst.toFixed(2)} (cap $${cap})${left.length ? `; left out over the cap: ${left.map((j) => j.name).join(', ')}` : ''}`);
  if (!kept.length) return { cost: 0, written: [], left };
  const byKey = new Map(kept.map((j) => [`team-${j.key}`, j]));
  let total = 0;
  const written = [];
  const usage = { input: 0, output: 0 };
  const keep = (j, message) => {
    const out = save(sport, j, message, batch);
    total += out.cost;
    usage.input += message.usage.input_tokens;
    usage.output += message.usage.output_tokens;
    written.push(out);
    log(`  ${out.name} (${out.mode}): ${message.usage.input_tokens} in / ${message.usage.output_tokens} out, $${out.cost.toFixed(3)}${out.problems.length ? `\n    ${out.problems.join('\n    ')}` : ''}`);
  };
  if (batch) {
    // (a batch sent for these same reports and never collected (2026-10-26: NBA's wait timed out after its 30 reports
    // were paid for): collected now, not sent and paid for again; Anthropic keeps a batch's results 29 days)
    const file = path.join(cacheDir(sport), 'batch.json');
    const sent = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
    const same = sent && !sent.collected && Date.now() - Date.parse(sent.at) < 28 * 864e5 && [...sent.keys].sort().join() === kept.map((j) => j.key).sort().join();
    const b = same ? { id: sent.id } : await client.messages.batches.create({ requests: kept.map((j) => ({ custom_id: `team-${j.key}`, params: params(sport, j.dossier) })) });
    log(same ? `${name}: batch ${b.id} sent ${sent.at.slice(0, 10)} and never collected: collecting it` : `${name}: batch ${b.id}, ${kept.length} requests`);
    mkdirSync(cacheDir(sport), { recursive: true });
    if (!same) writeFileSync(file, JSON.stringify({ id: b.id, keys: kept.map((j) => j.key), at: new Date().toISOString() }));
    // (a failed look (a timeout, the API briefly down) waited out and tried again, for a day at most: the batch runs on)
    const until = Date.now() + 26 * 36e5;
    for (;;) {
      let s = null;
      try {
        s = await client.messages.batches.retrieve(b.id);
      } catch (err) {
        if (Date.now() > until) throw err;
        log(`  couldn't check the batch (${err.message}): trying again in a minute`);
      }
      if (s?.processing_status === 'ended') break;
      if (s) log(`  ${s.request_counts.processing} processing, ${s.request_counts.succeeded} done...`);
      await new Promise((res) => setTimeout(res, 60_000));
    }
    for await (const result of await client.messages.batches.results(b.id)) {
      if (result.result.type !== 'succeeded') {
        log(`  ${result.custom_id}: ${result.result.type}`);
        continue;
      }
      keep(byKey.get(result.custom_id), result.result.message);
    }
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), collected: new Date().toISOString() }));
  } else {
    for (const j of kept) keep(j, await client.messages.stream(params(sport, j.dossier)).finalMessage());
  }
  log(`${name}: ${written.length} reports, ${usage.input} in / ${usage.output} out, total $${total.toFixed(2)}${written.length ? ` ($${(total / written.length).toFixed(3)} a team)` : ''}`);
  // (the run's measured spend, kept: .cache/analysis/spend.jsonl)
  mkdirSync(path.join(ROOT, '.cache/analysis'), { recursive: true });
  appendFileSync(
    path.join(ROOT, '.cache/analysis/spend.jsonl'),
    `${JSON.stringify({ at: new Date().toISOString(), sport, reports: written.length, modes: written.map((w) => w.mode), inputTokens: usage.input, outputTokens: usage.output, cost: Number(total.toFixed(4)), batch })}\n`,
  );
  return { cost: total, written, left };
}

if (import.meta.main) {
  const arg = process.argv.find((a) => a.startsWith('--publish='));
  if (arg) {
    const { dataSeason } = await import('./dossier.mjs');
    const sport = arg.slice(10);
    publish(sport, SPORTS[sport].label(dataSeason(sport)));
  } else console.log('usage: node libs/ranker/scripts/analysis/analyze.mjs --publish=mlb (the runner is weekly.mjs)');
}
