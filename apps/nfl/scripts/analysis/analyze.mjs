// The AI player analysis: each dossier (dossier.mjs) through Claude, a long-form structured report back,
// checked against the dossier (every evidence path must resolve; numbers in the prose are looked up) and
// kept in .cache/analysis/reports/<gsisId>.json with its token usage. --publish writes the reports the
// site reads (apps/nfl/src/StaticData/analysis/<row id>.json and its index).
//
//   node apps/nfl/scripts/analysis/analyze.mjs <names...> --qbs --teams --team=BAL   (live calls, 4 at a time)
//   node apps/nfl/scripts/analysis/analyze.mjs --batch <the same choices>          (through the Batch API: half price)
//   ... --skip-done                                                               (not the ones written today)
//   node apps/nfl/scripts/analysis/analyze.mjs --resume                           (the last batch's results)
//   node apps/nfl/scripts/analysis/analyze.mjs --publish          (no calls: the kept reports to the site)
//   ... --dry                     (no calls: the jobs, recaps and previews, and about what they'd cost)
//   ... --season=2025             (a finished season's sheets (dossier.mjs --season=2025): its reports kept
//                                  apart in .cache/analysis/season-2025/reports, never published)
//
// Two kinds of report, as MLB, NBA and NHL's (libs/ranker/scripts/analysis/analyze.mjs):
//   preview  while the team's season is on: who it is, what drives it, the coming game, the rest of the season
//   recap    once its season is over (out of the playoffs, or the Super Bowl played; season-state.mjs): the
//            year in one section, for the team and its QBs (those with 4+ regular-season starts; a QB with
//            fewer gets none, and no more previews: qb-sheet.mjs). That's its last report of the season: the
//            weekly runs skip a row whose recap is out (recapDone).
//
// Needs ANTHROPIC_API_KEY (not for --publish or --dry).

// (the key from the repo's .env on this machine, as the other sports' runner reads it; a key already set wins)
import '../../../../libs/ranker/scripts/env.mjs';
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { currentSeason } from '../../../../libs/ranker/scripts/wiki-staff.mjs';
import { isRecapOf } from './season-state.mjs';
import { describe, staleOf } from '../../../../libs/ranker/scripts/analysis/prune.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
// (the season the reports are for: the data's, or --season's finished one, kept apart and never published)
const CURRENT = currentSeason(path.join(ROOT, 'apps/nfl'));
const SEASON = Number(process.argv.find((a) => a.startsWith('--season='))?.slice(9) ?? CURRENT);
const PAST = SEASON !== CURRENT;
const BASE = path.join(ROOT, '.cache/analysis', PAST ? `season-${SEASON}` : '');
const DOSSIERS = path.join(BASE, 'dossiers');
const TEAM_DOSSIERS = path.join(BASE, 'teams');
const REPORTS = path.join(BASE, 'reports');
const SITE = path.join(ROOT, 'apps/nfl/src/StaticData/analysis');
const MODEL = 'claude-opus-5-5';
const EFFORT = process.env.EFFORT ?? 'high';
// $ per million tokens (Opus 5.5); the Batch API halves both
const PRICE = { input: 4, output: 20 };

// A QB's sheet works the arithmetic out for him (qb-sheet.mjs), so his reports follow the same rule: what
// they compute is in the sheet; what they think isn't arithmetic and stays theirs
const QB_WORKED = "season.perGame, season.pace17, season.recent, season.vsLastSeason, season.vsLeague, season.asStarter and the splits' epaTotal";
export const QB_NUMBERS_RULE = `Cite only numbers in the dossier: don't add up, subtract, average or round dossier numbers yourself (no totals summed from games, no combined EPA over a few games or plays, no per-game rates, differences, shares or paces you work out). The dossier has done that arithmetic for you: ${QB_WORKED}. If a number you want isn't in it, say it in words ("most of his yards", "worse since the bye") rather than with a number.`;
const SHARP = `That rule is about arithmetic, not about thinking: be as sharp as ever. Set numbers side by side (his last few games against his season, this year against last, him against the league, one split against another), say what produces them, follow the trend, and take a clear position; just quote the dossier's numbers for it.`;
const QB_WORKED_OUT = `- Worked out for you (quote these instead of computing): season.starts (his regular-season starts); season.perGame (a game's averages; passYards, passTds, rushYards and passEpa as [value, rank, of] among the qualifiers); season.pace17 (his per-game rate over a 17-game season); season.recent.last3 and last5 (his last 3 and 5 games: the weeks, his team's record in them, cmpAtt and totals, the rates, perGame, and vsSeason = the stretch minus the whole season, so positive means higher lately; for sackPct and intPct higher is worse); season.vsLastSeason (lastSeason: last year's rates and a game's averages; change: this season minus last); season.vsLeague (leagueAverage: the qualifiers' average; overAverage: his minus it); season.asStarter (his line in the games he started, when he also played in some he didn't); season.totals.passEpa (his passing EPA added up). In splits, epaTotal is the EPA those plays added up to (and dropbackEpaTotal all his dropbacks'); depthGroups puts the depths in two (under10, tenPlus air yards) and chartedAtt counts the attempts with an air-yards figure; topTargets each carry epaTotal.`;

const SYSTEM = `You are the analyst behind a football rankings site's player cards. The reader has opened a player's Analysis tab to understand him properly: what kind of player he is, what's really driving his numbers, what's real and what's noise, how the coming game sets up, and what to expect the rest of the season. Write like a sharp film-and-numbers analyst talking to a smart fan: in depth, in context, with a point of view. Not a stat table read aloud, not a hype piece, not a list of disconnected bullet points.

You get one player's dossier as JSON. It is your only source. Use no outside knowledge of players, teams, injuries, trades or contracts beyond what the dossier says. ${QB_NUMBERS_RULE} The one exception is your own forecast: restOfSeason.projections, the ranges you project, which the restOfSeason body may quote. If something you'd want to know isn't there, don't guess.

${SHARP}

How to read the dossier:
- [value, rank, of]: the value, its rank among the position's qualifiers this season (1 = best; for "bad" stats like ints, sackPct, fumblesLost, rank 1 is the fewest), and how many qualify. Career lines rank within that season's site list.
- EPA = expected points added per play (0 is average; +0.2/play is very good for a QB, -0.1 bad). Success = share of plays with positive EPA. CPOE = completion % over expected, in points. anyPerDropback = adjusted net yards per dropback. passRateOverExp = how much more (or less) a team passes than situation predicts, in neutral game states.
- gameLog: each game from the player's team's side: favoredBy (Vegas; negative = underdog), covered (against the spread), overUnder vs the total, oppDefRankNow (that opponent's defensive EPA rank today, 1 = best defense). line holds his stats that game (pressuredPct, blitzed and badThrowPct from PFR charting; separation, cushion, yacAboveExp, ryoe, eightManBoxPct from Next Gen Stats; snapPct offensive snaps).
- splits: play-by-play cuts — byDepth (air yards), byDirection, third down, red zone, byScore (game state), shotgun vs under center, scrambles and designed runs; for receivers share of team red-zone and third-down targets, end-zone targets, YAC over expected; for runners by run direction/gap, goal line, short yardage.
- team: his offense and defense, ranked (defense ranks: 1 = stingiest); qbStarts: who started at QB each week; injuries: his offensive teammates on the injury report, most-used first (snapPct = their share of snaps this season: 90+ is a starter, under 30 a backup). nextGame: the coming opponent, the Book's line (line like "BAL -2.5" names the favorite and the spread; overUnder; his team's moneyline; call the sportsbook the Book, never by its name), the opponent's injury report, its defense profile and what it allows to his position (pprPerGame etc.: rank 1 = allows the least). oppVsPosition: that defense by role: pprOverAvg.WR1 (WR2, WR3, TE1 the top tight end, RB1 the lead back) = [PPR points a game those players scored against it over their own averages elsewhere, rank, of] (rank 1 = held them furthest under: an elite WR1 held to his average reads as good defense; his role is his place in his team's target or carry share); epaPerPlay.WR1 (and the other roles) = [EPA a play the defense allowed to that role (a target; the lead back's targets and carries), rank, of] (rank 1 = the stingiest); passRateOverNorm = [how many points more often offenses pass on it than they usually do in neutral situations, given the down, distance and field position (pass rate over expected), (negative: they run more, a run funnel), rank (1 = the strongest pass funnel), of]; targetShare = [share of the targets against it to WRs / TEs / RBs, the league's share]. Treat these as context to weigh with everything else, not a verdict on their own: they rest on few games early in a season, and a role's rank can come from who the defense happened to face.
- career: past seasons, each stat ranked within that season. Use it to separate a real change from a blip, and to see what he has always been.
${QB_WORKED_OUT}
- Injuries: player.injury is his own status, with ESPN's news note and an expected return date (an estimate, not a promise). Notes are reports as of their "reported" date: news, not certainty. When availability matters — his own, his QB's, his blockers', his key targets', or a starter on the other side who bears on his matchup — say what it changes and why, concretely. Don't list injuries that don't touch him.
- Weather: nextGame.weather is the kickoff forecast at the stadium (roof: outdoors; retractable, likely closed in bad weather; or indoors, where weather doesn't matter). early: true means it's more than 3 days out and rough, especially wind: mention a big system, hedged, but don't build a case on it. What moves games: sustained wind of 15+ mph (or gusts of 25+) hurts passing, the deep game and kicking, and leans totals and passing numbers down; heavy rain or snow (a high precipChance with real precipIn) hurts passing and ball security somewhat; cold alone matters little. When it's mild, say nothing about it.
- Early in a season samples are small: weigh them honestly (a 15-attempt split is a hint, not a fact) and say so when it matters, without hedging everything.

Think like a football analyst, not a spreadsheet. Before you call any number a strength or a weakness, ask what produces it, and judge the cause, not the number:
- A stat is often the price of a strength, or a product of his role, scheme, teammates, opponents or game script. A scrambling QB's high pressure-to-sack rate and long time to throw usually come from extending plays to create with his legs: judge that trade (do the extended plays and scrambles pay for the sacks?), don't call it poor pocket presence. Likewise a deep threat's low catch rate, a goal-line back's low yards per carry, a slot receiver's low aDOT, a low target share in a run-first offense, gaudy numbers piled up in garbage time, or a dip that lines up with a backup QB, a missing tackle or a run of top defenses.
- Check the career before calling anything new: a trait he has had for years is who he is; a sudden change needs a cause (injury, new coach or QB, role change, opponents) or is likely noise.
- Separate what is sustainable (role, volume, skills that held up across seasons) from what is likely to regress (TD rate on small volume, a hot or cold split on a handful of plays, fumble luck).

The archetype: the established football name for the kind of player he is, the way analysts and fans would say it — not an invented label. Pick the best fit from these (or an equally standard term if none fits), optionally with a short qualifier in parentheses ("Dual-Threat (scramble-first)"):
- QB: Dual-Threat, Pocket Passer, Gunslinger, Game Manager, Point Guard (quick, spread-it-around distributor), Improviser, Field General, Rookie Developmental
- RB: Bell Cow, Workhorse, Power Back, Home-Run Hitter, Receiving Back, Change-of-Pace, Goal-Line Back, Committee Back
- WR: Alpha X, Deep Threat, Slot Separator, Possession Receiver, YAC Weapon, Contested-Catch, Field Stretcher, Gadget Weapon, Volume Possession
- TE: Move Tight End, Inline Blocker, Complete Tight End, Seam Stretcher, Red-Zone Target, Big Slot
Define it in one sentence for this player.

Evidence: every strength, concern and key matchup cites 1-3 numbers from the dossier by JSON path (dot notation from the dossier root, array indexes as numbers: "splits.byDepth.short0to9.epa", "season.ranked.ypa", "gameLog.2.line.passYds", "nextGame.oppDefense.defRushEpa"). The site shows the real value from that path, so the path must exist exactly. The label is a 1-4 word name for the number.

Style: plain sentences, numbers woven in only where they make the point, no clichés ("he's a gamer", "elite", "weapon"), no filler, never restate the totals table.`;

// The rule on numbers (MLB, NBA and NHL's since 1bf50a88): a team report, and every recap, quotes the
// sheet's numbers as they are and adds nothing up itself; the totals block has the sums worth quoting
const numbersRule = (totals) =>
  `Every number in it is one the site shows its readers or a plain season total of them, and you may only state numbers that are in it. Cite only numbers in the dossier: don't add up, subtract, average or round dossier numbers yourself (no season totals summed from games, no records over a stretch of games, no combined yards or touchdowns of a few players, no differentials or per-game rates you work out). ${totals} already has the totals worth quoting; if a total or a comparison you want isn't in the dossier, describe it in words ("most of the yards", "a losing record after October") rather than with a number.`;
export const NUMBERS_RULE = numbersRule('The totals block');
const TOTALS_NOTE = `- totals: season totals added up from the game log, to quote as they are: totals.regularSeason (games; points scored and allowed, from the game log's scores; the differential, scored minus allowed; scored, allowed and the differential per game; offense: passing, rushing and total yards, yards per game, turnovers, sacks taken, penalty yards; defense: passing, rushing and total yards allowed, per game, takeaways, sacks made; turnoverDiff, takeaways minus turnovers; winsByDifferential, the wins the point differential implies), and totals.playoffs the same for its playoff games when it played some. glossary: what each means.`;

// Teams: the same report, about a team (its Team, Defense, O-line and Coach cards all show it)
const TEAM_SYSTEM = `You are the analyst behind a football rankings site's team cards. The reader has opened a team's Analysis tab to understand it properly: what kind of team this is, what is really driving its record, what is real and what is noise, how the coming game sets up, and where the season is heading. Write like a sharp film-and-numbers analyst talking to a smart fan: in depth, in context, with a point of view. Not a stat table read aloud, not a hype piece, not disconnected bullet points.

You get one team's dossier as JSON. It is your only source. Use no outside knowledge of players, teams, injuries, trades or coaches beyond what the dossier says. ${NUMBERS_RULE} The one exception is restOfSeason.projections, which are your own estimates. If something you'd want to know isn't there, don't guess.

How to read the dossier:
- [value, rank, of]: the value and its rank among the 32 teams this season (1 = best; for stats where less is better — points allowed, EPA allowed, sacks allowed, penalties — rank 1 is the fewest). History lines rank within that season.
- team: record, points for and against, division standings, the coach (newCoach: first year).
- season.team: results and efficiency (winsOverExpected: wins beyond what the point differential predicts, so luck; atsPct: share of games covered; netEpa; offEpa; defEpaAllowed; oneScoreWinPct; turnoverDiffPerGame; fourthDownGoPct; topPerGame). season.defense: EPA allowed by pass and rush, pressure rate made, takeaways, third-down and red-zone rates allowed, missed tackles. season.offensiveLine: pressure and sack rates allowed, stuff rate, yards before contact, run EPA. season.playByPlay: offense and defense EPA splits by pass and rush, success rates, pass rate over expected, explosive plays allowed, deep and short passing defense. season.defenseVsPosition (and nextGame.oppVsPosition, the opponent's): the defense by role: pprOverAvg.WR1 (WR2, WR3, TE1, RB1) = [PPR points a game the offense's WR1 (by target share; the lead back by carries) scored against it over his own average elsewhere, rank, of] (rank 1 = held them furthest under); epaPerPlay.WR1 (and the other roles) = [EPA a play the defense allowed to that role (a target; the lead back's targets and carries), rank, of] (rank 1 = the stingiest); passRateOverNorm = [how many points more often offenses pass on it than usual in neutral situations, given the down, distance and field position (pass rate over expected) (negative: a run funnel), rank (1 = the strongest pass funnel), of]; targetShare = [share of the targets against it to WRs / TEs / RBs, the league's share]. Treat these as context to weigh with everything else, not a verdict on their own: they rest on few games early in a season, and a role's rank can come from who the defense happened to face.
- qbStarts: who started at QB each week. usage: who carries the offense (top passers, rushers by carries, receivers by targets).
- gameLog: each game: the score, Vegas (favoredBy: negative = underdog; covered; overUnder), the QB, the opponent's offense and defense EPA ranks today, and the box score (yards, EPA, turnovers, sacks both ways, takeaways, penalties).
- injuries: the team's injury report, most-used first (snapPct: 90+ is a starter, under 30 a backup), with ESPN's news notes and return estimates (estimates, not promises).
- Weather: nextGame.weather is the kickoff forecast at the stadium (roof: outdoors; retractable, likely closed in bad weather; or indoors, where weather doesn't matter). early: true means it's more than 3 days out and rough, especially wind: mention a big system, hedged, but don't build a case on it. What moves games: sustained wind of 15+ mph (or gusts of 25+) hurts passing, the deep game and kicking, and leans totals and passing numbers down; heavy rain or snow (a high precipChance with real precipIn) hurts passing and ball security somewhat; cold alone matters little. When it's mild, say nothing about it.
- nextGame: the coming opponent, the Book's line (line like "BAL -2.5" names the favorite and the spread; overUnder; this team's moneyline; call the sportsbook the Book, never by its name), the opponent's record, its season profile, its QB starts and its injury report. restOfSchedule: each remaining opponent's record and offense/defense EPA ranks today (division games marked).
- history: the team's recent seasons, ranked within each season.
${TOTALS_NOTE}
- Early in a season samples are small: weigh them honestly and say so when it matters, without hedging everything.

Think like a football analyst, not a spreadsheet. Before calling anything a strength or a weakness, ask what produces it and judge the cause: a record built on close wins and turnovers (luck that tends to regress) versus one built on efficiency; a defense whose numbers came against bad offenses; points allowed driven by short fields from turnovers; a run game that looks bad because of the line or good because of game script; a quarterback change or key injuries that split the season in two. Check history before calling anything new.

The archetype: the established way fans and analysts describe this kind of team, optionally with a short qualifier in parentheses for its style ("Playoff Team (defense-first)"). Pick from: Super Bowl Contender, Playoff Team, Fringe Contender, Pretender (record ahead of its play), Better Than Its Record, Retooling, Rebuilding — or an equally standard term if none fits. Define it in one sentence for this team.

The coming game: its preview's two lists are the ways this team wins it (nextGame.waysToWin) and the ways it loses it (nextGame.waysToLose). Each way is one concrete path to that result against this opponent: a matchup or an edge it can lean on, a weakness the opponent can hit, a game script, the availability that swings it. Most likely first; the two lists are about this game, not a restatement of the season's strengths and concerns, and the same rule on numbers holds.

Evidence: every strength, concern and way to win or lose cites 1-3 numbers from the dossier by JSON path (dot notation from the dossier root, array indexes as numbers: "season.team.netEpa", "season.defense.pressureRate", "gameLog.2.box.rushYds", "nextGame.oppSeason.playByPlay.defRushEpa"). The site shows the real value from that path, so the path must exist exactly. The label is a 1-4 word name for the number.

Projections: per-game or season ranges for the rest of the season (e.g. "Final wins", "Points scored / game", "Points allowed / game").

Style: plain sentences, numbers woven in only where they make the point, no clichés, no filler, never restate the stats table.`;

// Recaps: a season that's over (season-state.mjs), the year in one section, the team's and its QBs'
const SEASON_KINDS = 'Champion, Conference Champion, Contender That Fell Short, Early Playoff Exit, Overachiever, Underachiever, Near Miss, Lost Season, Rebuilding Year, Retooling Year';
const RECAP_STYLE = `Style: plain sentences, numbers woven in only where they make the point, no clichés, no filler, never restate the stats table. Looking back, not ahead: no projections, no previews.`;

const TEAM_RECAP_SYSTEM = `You are the analyst behind a football rankings site's team cards. This team's season is over (status.ended says how it ended), and the reader has opened its Analysis tab for the recap of its year: what kind of team it was, how the season unfolded, what drove it, how it ended, and what the year's numbers leave for next season. Write like a sharp film-and-numbers analyst looking back with a point of view, in depth and in context: not a stat table read aloud, not a eulogy or a hype piece.

You get one team's dossier as JSON. It is your only source. Use no outside knowledge of players, teams, injuries, trades, coaches or results beyond what the dossier says. ${NUMBERS_RULE} If something you'd want to know isn't there, don't guess.

How to read the dossier:
- [value, rank, of]: the value and its rank among the 32 teams this season (1 = best; for stats where less is better — points allowed, EPA allowed, sacks allowed, penalties — rank 1 is the fewest). History lines rank within that season.
- status.ended: how the season ended: it missed the playoffs, the playoff game it lost (to whom, the score: this team's first), or the Super Bowl it won.
- team: the regular season's record, points for and against, the final division standings, the coach (newCoach: first year).
- season.team: results and efficiency (winsOverExpected: wins beyond what the point differential predicts, so luck; atsPct: share of games covered; netEpa; offEpa; defEpaAllowed; oneScoreWinPct; turnoverDiffPerGame; fourthDownGoPct; topPerGame). season.defense: EPA allowed by pass and rush, pressure rate made, takeaways, third-down and red-zone rates allowed, missed tackles. season.offensiveLine: pressure and sack rates allowed, stuff rate, yards before contact, run EPA. season.playByPlay: offense and defense EPA splits by pass and rush, success rates, pass rate over expected, explosive plays allowed, deep and short passing defense. season.defenseVsPosition: the defense by role (pprOverAvg, epaPerPlay: rank 1 = the stingiest; passRateOverNorm: rank 1 = the strongest pass funnel; targetShare beside the league's).
- qbStarts: who started at QB each week. usage: who carried the offense in the regular season (top passers, rushers by carries, receivers by targets), with their season totals.
- gameLog: every game in order, its playoff games last (round: the playoff round): the score (this team's first), Vegas (favoredBy: negative = underdog; covered; overUnder), the QB, the opponent's offense and defense EPA ranks, and the box score (yards, EPA, turnovers, sacks both ways, takeaways, penalties).
- results: the regular season by month (record, points scored and allowed, scored and allowed a game, recordThrough = the record at the month's end), the longest winning and losing streaks.
${TOTALS_NOTE}
- history: the team's recent seasons, ranked within each season.

Think like a football analyst, not a spreadsheet. Before calling anything a strength or a weakness, ask what produced it and judge the cause: a record built on close wins and turnovers (luck, the winsOverExpected stat and winsByDifferential) versus one built on efficiency; a defense whose numbers came against bad offenses; points allowed driven by short fields from turnovers; a run game that looked bad because of the line or good because of game script; a quarterback change or key injuries that split the season in two. Check history before calling anything new.

The recap: tell the arc of the season (the months, the streaks, a change at quarterback), what made the team what it was (its efficiency and ranks, its units, the players who carried it or let it down), and how it ended (each playoff game when it played in them; the margin it missed by when it didn't). Its look ahead rests only on what the numbers show (who carried it, which units ranked well or badly, what was luck), never on offseason news the dossier doesn't have.

The archetype: the kind of season it was, as fans and analysts would put it, optionally with a short qualifier in parentheses ("Contender That Fell Short (defense-first)"). Pick from: ${SEASON_KINDS} — or an equally standard term if none fits. Define it in one sentence for this team's year.

Evidence: every highlight and lowlight cites 1-3 numbers from the dossier by JSON path (dot notation from the dossier root, array indexes as numbers: "totals.regularSeason.differential", "season.team.netEpa", "results.byMonth.2.record", "gameLog.17.score"). The site shows the real value from that path, so the path must exist exactly and lead to a number, a [value, rank, of] or a short text. The label is a 1-4 word name for the number.

${RECAP_STYLE}`;

const QB_RECAP_SYSTEM = `You are the analyst behind a football rankings site's player cards. This quarterback's season is over: his team's is (status.ended says how it ended, status.teamRecord its regular-season record). The reader has opened his Analysis tab for the recap of his year: what kind of quarterback he was, how his season unfolded, what drove his numbers, what was real and what was noise, and what the year leaves for next season. Write like a sharp film-and-numbers analyst looking back with a point of view, in depth and in context: not a stat table read aloud, not a eulogy or a hype piece.

You get one player's dossier as JSON. It is your only source. Use no outside knowledge of players, teams, injuries, trades or contracts beyond what the dossier says. ${numbersRule(`season.totals (the regular season), season.playoffs (his playoff games, when he played some), and ${QB_WORKED}`)} If something you'd want to know isn't there, don't guess.

How to read the dossier:
- [value, rank, of]: the value, its rank among the position's qualifiers this season (1 = best; for "bad" stats like ints, sackPct, fumblesLost, rank 1 is the fewest), and how many qualify. Career lines rank within that season's site list.
- EPA = expected points added per play (0 is average; +0.2/play is very good for a QB, -0.1 bad). Success = share of plays with positive EPA. CPOE = completion % over expected, in points. anyPerDropback = adjusted net yards per dropback. passRateOverExp = how much more (or less) a team passes than situation predicts, in neutral game states.
- status.ended: how his team's season ended (missed the playoffs, the playoff game it lost and the score, his team's first, or the Super Bowl won).
- season: totals (the regular season's), ranked (those ranked among the position), tracking (Next Gen Stats), pressure (PFR charting), record (his as a starter), playoffs (his playoff games' totals).
- gameLog: each of his games from his team's side, its playoff games last (round: the playoff round): favoredBy (Vegas; negative = underdog), covered, overUnder, oppDefRankNow (that defense's EPA rank, 1 = best). line holds his stats that game (pressuredPct, blitzed and badThrowPct from PFR charting; time to throw and aggressiveness from Next Gen Stats; snapPct).
- splits: play-by-play cuts: byDepth (air yards), byDirection, third down, red zone, byScore (game state), shotgun vs under center, scrambles and designed runs.
- team: his offense and defense, ranked (defense ranks: 1 = stingiest); qbStarts: who started at QB each week.
${QB_WORKED_OUT}
- career: past seasons, each stat ranked within that season. Use it to separate a real change from a blip, and to see what he has always been.

Think like a football analyst, not a spreadsheet. Before you call any number a strength or a weakness, ask what produced it, and judge the cause, not the number: a stat is often the price of a strength, or a product of his role, scheme, teammates, opponents or game script (a scrambler's sacks and long time to throw, numbers piled up in garbage time, a dip that lines up with a missing tackle or a run of top defenses). Check the career before calling anything new, and separate what held up all year from what rested on a handful of plays (TD rate on small volume, fumble luck).

The recap: tell the arc of his season (the stretches, the games that defined it, any time he missed), what made him the quarterback he was this year, and how it ended for him and his team. Its look ahead rests only on what the numbers show (what held up, what was luck, what the career says), never on offseason news the dossier doesn't have.

The archetype: the established football name for the kind of quarterback he was this season, the way analysts and fans would say it, not an invented label. Pick the best fit (or an equally standard term), optionally with a short qualifier in parentheses ("Dual-Threat (scramble-first)"): Dual-Threat, Pocket Passer, Gunslinger, Game Manager, Point Guard (quick, spread-it-around distributor), Improviser, Field General, Rookie Developmental. Define it in one sentence for his year.

Evidence: every highlight and lowlight cites 1-3 numbers from the dossier by JSON path (dot notation from the dossier root, array indexes as numbers: "season.ranked.anyPerDropback", "season.totals.passTds", "splits.byDepth.deep20plus.epa", "gameLog.16.line.passYds"). The site shows the real value from that path, so the path must exist exactly. The label is a 1-4 word name for the number.

${RECAP_STYLE}`;

// The prompt a dossier gets: a recap's (a team's or its QB's) once the season is over, else the weekly one
export const systemPrompt = (dossier) => (dossier.mode === 'recap' ? (dossier.kind === 'team' ? TEAM_RECAP_SYSTEM : QB_RECAP_SYSTEM) : dossier.kind === 'team' ? TEAM_SYSTEM : SYSTEM);

const evidence = {
  type: 'array',
  description: '1-3 dossier numbers backing this, by exact JSON path',
  items: {
    type: 'object',
    properties: {
      label: { type: 'string', description: '1-4 words, e.g. "Deep-ball EPA"' },
      path: { type: 'string', description: 'dot path into the dossier, e.g. splits.byDepth.deep20plus.epa' },
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
const SCHEMA = {
  type: 'object',
  properties: {
    archetype: {
      type: 'object',
      properties: { name: { type: 'string', description: 'an established archetype name, optional short qualifier in parentheses' }, definition: { type: 'string', description: 'one sentence, for this player' } },
      required: ['name', 'definition'],
      additionalProperties: false,
    },
    headline: { type: 'string', description: 'one line, at most 14 words: the take on his season' },
    take: { type: 'string', description: 'the in-depth take: 3-4 paragraphs separated by blank lines — who he is, what is driving the season, what the numbers hide, where it is heading' },
    strengths: { type: 'array', description: '2-3, most important first', items: point },
    concerns: { type: 'array', description: '1-3, most important first; each judged in context (a cost of a strength, his role, or a real flaw?)', items: point },
    trend: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['rising', 'falling', 'steady', 'volatile'] },
        note: { type: 'string', description: 'one or two sentences on the game-by-game path' },
      },
      required: ['direction', 'note'],
      additionalProperties: false,
    },
    nextGame: {
      type: 'object',
      description: 'the coming game (when the dossier has one)',
      properties: {
        outlook: { type: 'string', enum: ['favorable', 'tough', 'neutral'] },
        headline: { type: 'string', description: 'at most 12 words' },
        body: { type: 'string', description: '2 paragraphs, separated by a blank line: how this opponent meets his profile, and the availability that matters on both sides' },
        keyMatchups: { type: 'array', description: '1-3 specific matchups or game-script factors', items: point },
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
          description: '2-4 per-game ranges you project for the rest of the season, for his key stats (your estimates)',
          items: {
            type: 'object',
            properties: { stat: { type: 'string', description: 'e.g. "Passing yards / game"' }, low: { type: 'number' }, high: { type: 'number' } },
            required: ['stat', 'low', 'high'],
            additionalProperties: false,
          },
        },
        swingFactors: { type: 'array', description: '1-3 short phrases: what moves the outlook most', items: { type: 'string' } },
      },
      required: ['body', 'projections', 'swingFactors'],
      additionalProperties: false,
    },
    confidence: {
      type: 'object',
      properties: { level: { type: 'string', enum: ['low', 'medium', 'high'] }, note: { type: 'string', description: 'why, in a few words (sample size, role change...)' } },
      required: ['level', 'note'],
      additionalProperties: false,
    },
  },
  required: ['archetype', 'headline', 'take', 'strengths', 'concerns', 'trend', 'nextGame', 'restOfSeason', 'confidence'],
  additionalProperties: false,
};


// A recap: the year in one section (the shape MLB, NBA and NHL's recaps have, which the site's Analysis tab
// shows as its one Recap section)
const archetype = {
  type: 'object',
  properties: { name: { type: 'string', description: 'an established name, optional short qualifier in parentheses' }, definition: { type: 'string', description: 'one sentence, for this year' } },
  required: ['name', 'definition'],
  additionalProperties: false,
};
export const RECAP_SCHEMA = {
  type: 'object',
  properties: {
    archetype,
    headline: { type: 'string', description: 'one line, at most 14 words: the take on the year' },
    recap: {
      type: 'object',
      properties: {
        finish: { type: 'string', description: 'one line: the record and how it ended, e.g. "11-6; lost in the Wild Card round to BUF, 24-27"' },
        body: { type: 'string', description: 'the recap: 4-6 paragraphs separated by blank lines — what kind of team (or quarterback) it was, the arc of the season, what drove it, how it ended, what it leaves for next year' },
        highlights: { type: 'array', description: '2-3 things that went right, most important first', items: point },
        lowlights: { type: 'array', description: '1-3 things that went wrong or held it back, most important first', items: point },
        arc: {
          type: 'object',
          properties: {
            direction: { type: 'string', enum: ['rising', 'falling', 'steady', 'volatile'] },
            note: { type: 'string', description: 'one or two sentences on the path through the season' },
          },
          required: ['direction', 'note'],
          additionalProperties: false,
        },
        nextYear: { type: 'string', description: 'one paragraph: what the numbers say carries into next season (who carried it, what needs work, what was luck)' },
      },
      required: ['finish', 'body', 'highlights', 'lowlights', 'arc', 'nextYear'],
      additionalProperties: false,
    },
    confidence: {
      type: 'object',
      properties: { level: { type: 'string', enum: ['low', 'medium', 'high'] }, note: { type: 'string', description: 'why, in a few words' } },
      required: ['level', 'note'],
      additionalProperties: false,
    },
  },
  required: ['archetype', 'headline', 'recap', 'confidence'],
  additionalProperties: false,
};
export const PREVIEW_SCHEMA = SCHEMA;

// A team's preview: the same, its coming game's key matchups as two lists, the ways it wins and the ways it
// loses (the site heads them "Ways the Ravens win" / "Ways the Ravens lose"; a report from before them still
// shows its key matchups)
export const TEAM_PREVIEW_SCHEMA = {
  ...SCHEMA,
  properties: {
    ...SCHEMA.properties,
    nextGame: {
      type: 'object',
      description: 'the coming game (when the dossier has one)',
      properties: {
        outlook: SCHEMA.properties.nextGame.properties.outlook,
        headline: SCHEMA.properties.nextGame.properties.headline,
        body: { type: 'string', description: '2 paragraphs, separated by a blank line: how the two teams meet, and the availability that matters on both sides' },
        waysToWin: { type: 'array', description: '2-3 ways this team wins this game, most likely first: each one concrete path (a matchup or edge it can lean on, a game script)', items: point },
        waysToLose: { type: 'array', description: '2-3 ways this team loses this game, most likely first: each one concrete path (an edge the opponent has, a weakness of its own this opponent can hit, a game script gone wrong)', items: point },
        watch: SCHEMA.properties.nextGame.properties.watch,
      },
      required: ['outlook', 'headline', 'body', 'waysToWin', 'waysToLose', 'watch'],
      additionalProperties: false,
    },
  },
};

// The schema a dossier's report takes: a recap's, a team preview's, or a player's preview
export const schemaFor = (dossier) => (dossier.mode === 'recap' ? RECAP_SCHEMA : dossier.kind === 'team' ? TEAM_PREVIEW_SCHEMA : SCHEMA);

const MAX_TOKENS = 20000;
export const params = (dossier) => ({
  model: MODEL,
  max_tokens: MAX_TOKENS,
  output_config: { effort: EFFORT, format: { type: 'json_schema', schema: schemaFor(dossier) } },
  // (cached: every team's or QB's call of a run sends the same system, 2026-10-27; the dossier after it is each one's own)
  system: [{ type: 'text', text: systemPrompt(dossier), cache_control: { type: 'ephemeral' } }],
  messages: [{ role: 'user', content: `Dossier:\n${JSON.stringify(dossier)}` }],
});

// ---- checking a report against its dossier

const at = (obj, p) => p.split('.').reduce((o, k) => (o === null || o === undefined ? undefined : o[/^\d+$/.test(k) ? Number(k) : k]), obj);
// The value an evidence path shows: a ranked [value, rank, of] reads as its value and its rank; a short
// text (a record, a score) as itself
// (a path cited without its "season." — pressure.badThrowPct for season.pressure.badThrowPct — read as that)
export function resolve(dossier, p) {
  const v = at(dossier, p) ?? (p.startsWith('season.') ? undefined : at(dossier, `season.${p}`));
  if (v === undefined || v === null || (typeof v === 'object' && !Array.isArray(v))) return null;
  // (a share beside the league's, [share, league share], reads as the share)
  if (Array.isArray(v)) return !v.every((x) => typeof x === 'number') ? null : v.length === 3 ? { value: v[0], rank: v[1], of: v[2] } : v.length === 2 ? { value: v[0] } : null;
  if (typeof v === 'string' && v.length > 40) return null;
  return { value: v };
}
// Every number a dossier holds (in its numbers and inside its texts: "11-6", "24-27"), as it might be
// written: rounded, and a fraction as a percent
export function numbersIn(obj, out = new Set()) {
  const add = (n) => {
    for (const x of [n, Math.round(n * 10) / 10, Math.round(n * 100) / 100, Math.round(n)]) out.add(Math.abs(x));
    if (Math.abs(n) < 1) out.add(Math.abs(Math.round(n * 1000) / 10)).add(Math.abs(Math.round(n * 100))); // .363 -> 36.3%, 36%
  };
  if (typeof obj === 'number') add(obj);
  else if (typeof obj === 'string') for (const m of obj.matchAll(/\d+(?:\.\d+)?/g)) add(Number(m[0]));
  else if (obj && typeof obj === 'object') for (const v of Object.values(obj)) numbersIn(v, out);
  return out;
}
// (a preview's points: its season's, then its coming game's: a player's key matchups, a team's ways to win and
// to lose, an older team report's key matchups)
export const points = (r) =>
  r.recap
    ? [...r.recap.highlights, ...r.recap.lowlights]
    : [...r.strengths, ...r.concerns, ...(r.nextGame?.keyMatchups ?? []), ...(r.nextGame?.waysToWin ?? []), ...(r.nextGame?.waysToLose ?? [])];
const proseOf = (r) =>
  r.recap
    ? [r.headline, r.recap.finish, r.recap.body, r.recap.arc.note, r.recap.nextYear, ...points(r).map((p) => p.body)]
    : [r.headline, r.take, ...points(r).map((p) => p.body), r.trend.note, r.nextGame?.body, r.nextGame?.watch, r.restOfSeason.body];
export function check(report, dossier) {
  const problems = [];
  for (const e of points(report).flatMap((p) => p.evidence)) if (!resolve(dossier, e.path)) problems.push(`bad path: ${e.path}`);
  // numbers in the prose that aren't in the dossier (small counts aren't checked; the report's own
  // projections, its forecast, are its to quote)
  const known = numbersIn(dossier);
  for (const p of report.restOfSeason?.projections ?? []) numbersIn([p.low, p.high], known);
  for (const m of proseOf(report).join(' ').matchAll(/-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d*\.?\d+/g)) {
    const n = Math.abs(Number(m[0].replace(/,/g, '')));
    if (Number.isInteger(n) && n <= 20) continue;
    if (!known.has(n)) problems.push(`unmatched number: ${m[0]}`);
  }
  return problems;
}

function costOf(usage, batch) {
  const k = batch ? 0.5 : 1;
  return (k * ((usage.input_tokens + 1.25 * (usage.cache_creation_input_tokens ?? 0) + 0.1 * (usage.cache_read_input_tokens ?? 0)) * PRICE.input + usage.output_tokens * PRICE.output)) / 1e6;
}

// A report as the site shows it: each evidence with its real value (bad paths dropped), no betting angles
// (an older report's bets left out)
function forSite(report, dossier) {
  const { bets: _bets, ...r } = structuredClone(report);
  for (const p of points(r)) p.evidence = p.evidence.map((e) => ({ label: e.label, ...(resolve(dossier, e.path) ?? {}) })).filter((e) => e.value !== undefined);
  return r;
}

function save(id, dossier, message, batch) {
  const text = message.content.find((b) => b.type === 'text')?.text;
  const report = JSON.parse(text);
  const problems = check(report, dossier);
  const name = dossier.kind === 'team' ? dossier.team.name : dossier.player.name;
  const mode = dossier.mode ?? 'preview';
  const out = {
    id,
    name,
    mode,
    season: String(SEASON),
    ...(mode === 'recap' ? { ended: dossier.status?.ended ?? null } : {}),
    model: MODEL,
    effort: EFFORT,
    at: new Date().toISOString(),
    usage: message.usage,
    cost: costOf(message.usage, batch),
    problems,
    report,
    site: forSite(report, dossier),
  };
  mkdirSync(REPORTS, { recursive: true });
  writeFileSync(path.join(REPORTS, `${id}.json`), JSON.stringify(out, null, 2));
  return out;
}

// A job's dossier: a player's by gsis id, a team's as "team-BAL"
const dossierFile = (id) => (id.startsWith('team-') ? path.join(TEAM_DOSSIERS, `${id.slice(5)}.json`) : path.join(DOSSIERS, `${id}.json`));
const load = (id) => JSON.parse(readFileSync(dossierFile(id), 'utf8'));
const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

// ---- the site's copies: what the tab shows, each evidence with its real value (bad paths dropped), the
// game it previews (none for a recap), keyed by the row ids the site uses (a QB's "QB-<ESPN id>"; a team's
// report under its Team, Defense, O-line and Coach rows). A recap says so (mode, season, how it ended):
// the tab shows it as its one Recap section.

// A job's site file name: a team's "team-BAL", a QB's his row id ("QB-12483")
const siteFileOf = (id, siteId) => (id.startsWith('team-') ? id : siteId.replace(/[^\w-]/g, '_'));

// Whether a row's recap this season is out (the site's file, or the kept report): weekly runs skip it
export function recapDone({ siteDir = SITE, reportsDir = REPORTS, id, file, season = SEASON }) {
  return isRecapOf(readJson(path.join(siteDir, `${file}.json`)), season) || isRecapOf(readJson(path.join(reportsDir, `${id}.json`)), season);
}

// Publishing merges this checkout's reports into what's out, never the other way round: a published file
// newer than the kept report stays (another checkout wrote it), this season's recap stays over any preview,
// and a file this checkout has no report for stays as it was. Then the stale ones are taken down, by the
// published files' own metadata (libs/ranker/scripts/analysis/prune.mjs): a preview of a subject the
// pipeline doesn't write (only teams and QBs), another season's, or one whose game is played and that the
// latest run didn't replace. Recaps are never taken down: last season's stays until this season's first
// report for the row replaces it. Returns the stale files taken down.
export const NFL_COVERS = (file) => /^(team-|QB-)/.test(file);

export function publish({ siteDir = SITE, reportsDir = REPORTS, base = BASE, season = SEASON, now = new Date(), log = console.log } = {}) {
  const players = readJson(path.join(base, 'index.json')) ?? [];
  const teams = readJson(path.join(base, 'team-index.json')) ?? [];
  const siteIds = new Map([...players.map((p) => [p.gsis, [p.siteId]]), ...teams.map((t) => [`team-${t.team}`, t.siteIds])]);
  const byFile = new Map([...players.map((p) => [siteFileOf(p.gsis, p.siteId), [p.siteId]]), ...teams.map((t) => [`team-${t.team}`, t.siteIds])]);
  mkdirSync(siteDir, { recursive: true });
  // what's out: each file, and the rows its index lists it under
  const out = new Map();
  const rows = new Map();
  for (const f of readdirSync(siteDir)) if (f.endsWith('.json') && f !== 'index.json') out.set(f.slice(0, -5), readJson(path.join(siteDir, f)));
  for (const [id, file] of Object.entries(readJson(path.join(siteDir, 'index.json')) ?? {})) rows.set(file, [...(rows.get(file) ?? []), id]);
  const written = new Set();
  for (const f of existsSync(reportsDir) ? readdirSync(reportsDir) : []) {
    const kept = readJson(path.join(reportsDir, f));
    const ids = kept && siteIds.get(kept.id);
    if (!ids || !(kept.report.take || kept.report.recap)) continue;
    // (another season's reports aren't this one's: last season's recaps out stay as they are)
    if (String(kept.season ?? season) !== String(season)) continue;
    // (a recap's evidence as it was resolved when written; an older report's against its dossier now)
    if (!kept.site && !existsSync(dossierFile(kept.id))) continue;
    const file = siteFileOf(kept.id, ids[0]);
    const cur = out.get(file);
    // (this season's recap out stays over any preview; a newer file out stays)
    if (isRecapOf(cur, season) && kept.mode !== 'recap') continue;
    if (cur?.at && cur.at > kept.at) continue;
    const dossier = kept.site ? null : load(kept.id);
    const r = kept.site ?? forSite(kept.report, dossier);
    const next = kept.mode === 'recap' ? null : (dossier ?? (existsSync(dossierFile(kept.id)) ? load(kept.id) : null))?.nextGame;
    out.set(file, {
      at: kept.at,
      model: kept.model,
      ...(kept.mode === 'recap' ? { mode: 'recap', season: kept.season, ended: kept.ended ?? null } : { mode: 'preview', season: kept.season ?? String(season) }),
      game: next ? { week: next.week, date: next.date, opp: next.opp, at: next.at, line: next.line ?? null } : null,
      report: r,
    });
    rows.set(file, ids);
    written.add(file);
  }
  // (the stale ones taken down, files and index rows)
  const stale = staleOf(out, { season, now, covers: NFL_COVERS });
  for (const s of stale) {
    out.delete(s.file);
    rmSync(path.join(siteDir, `${s.file}.json`), { force: true });
    log(`took down ${describe(s)}`);
  }
  for (const file of written) if (out.has(file)) writeFileSync(path.join(siteDir, `${file}.json`), JSON.stringify(out.get(file)));
  const listed = {};
  for (const [file, kept] of out) for (const id of rows.get(file) ?? byFile.get(file) ?? kept?.siteIds ?? []) listed[id] = file;
  writeFileSync(path.join(siteDir, 'index.json'), JSON.stringify(listed));
  log(`published ${new Set(Object.values(listed)).size} analyses (${Object.keys(listed).length} rows)`);
  return stale;
}

// The jobs the command line asks for: --qbs (every QB), --teams (every team), --team=BAL, and names; a row
// whose recap is out this season is done for the year (its last report), and skipped
export function jobs(args = process.argv.slice(2), { base = BASE, reportsDir = REPORTS } = {}) {
  const players = JSON.parse(readFileSync(path.join(base, 'index.json'), 'utf8'));
  const teams = JSON.parse(readFileSync(path.join(base, 'team-index.json'), 'utf8'));
  const names = args.filter((a) => !a.startsWith('--')).map((x) => x.toLowerCase());
  const ids = new Set();
  // (a QB whose team's season is over with under 4 starts gets no recap, and no more previews: mode 'none')
  const due = (p) => p.mode !== 'none';
  if (args.includes('--qbs')) for (const p of players) if (p.pos === 'QB' && due(p)) ids.add(p.gsis);
  if (args.includes('--teams')) for (const t of teams) ids.add(`team-${t.team}`);
  for (const a of args) if (a.startsWith('--team=')) ids.add(`team-${a.slice(7).toUpperCase()}`);
  for (const p of players) if (due(p) && names.some((n) => p.name.toLowerCase().includes(n))) ids.add(p.gsis);
  // (--skip-done: not the ones already written today)
  const today = new Date().toISOString().slice(0, 10);
  const done = (id) => existsSync(path.join(reportsDir, `${id}.json`)) && JSON.parse(readFileSync(path.join(reportsDir, `${id}.json`), 'utf8')).at.startsWith(today);
  const siteId = new Map(players.map((p) => [p.gsis, p.siteId]));
  const skipped = [];
  const out = [...ids].filter((id) => {
    if (args.includes('--skip-done') && done(id)) return false;
    if (recapDone({ id, file: siteFileOf(id, siteId.get(id) ?? id), reportsDir })) {
      skipped.push(id);
      return false;
    }
    return true;
  });
  if (skipped.length) console.log(`${skipped.length} with this season's recap out, skipped: ${skipped.join(', ')}`);
  return out;
}

// About what jobs cost, without a call: the dossier's and the system prompt's characters over 1.7 a token
// (the measured rate: compact JSON is dense; the 2025 Rams' recap, 23,783 characters, read as 13,816
// tokens) in, and the measured output of the kind (Oct 2026: a team preview ~8,300 tokens, a QB ~7,300;
// the Rams' recap 4,601, MLB's ~4,900); batched at half price
const OUTPUT_GUESS = { teamPreview: 8300, qbPreview: 7300, recap: 4800 };
export function estimate(dossier, batch = true) {
  const input = (JSON.stringify(dossier).length + systemPrompt(dossier).length) / 1.7;
  const output = dossier.mode === 'recap' ? OUTPUT_GUESS.recap : dossier.kind === 'team' ? OUTPUT_GUESS.teamPreview : OUTPUT_GUESS.qbPreview;
  return { input: Math.round(input), output, cost: ((batch ? 0.5 : 1) * (input * PRICE.input + output * PRICE.output)) / 1e6 };
}

async function main() {
  // (a finished season's reports are for trying the recaps: never on the site)
  if (process.argv.includes('--publish')) return PAST ? console.log(`--season=${SEASON}: a past season's reports aren't published`) : publish();
  const resume = process.argv.includes('--resume');
  const ids = resume ? [] : jobs();
  if (!ids.length && !resume) {
    console.log('nothing to analyze (names, --qbs, --teams, --team=BAL; a recap out is done for the year)');
    return PAST ? undefined : publish();
  }
  if (process.argv.includes('--dry')) {
    let total = 0;
    for (const id of ids) {
      const d = load(id);
      const e = estimate(d, process.argv.includes('--batch'));
      total += e.cost;
      console.log(`${id} (${d.mode ?? 'preview'}): ~${e.input} in / ~${e.output} out, ~$${e.cost.toFixed(3)}`);
    }
    console.log(`${ids.length} reports (${ids.filter((id) => load(id).mode === 'recap').length} recaps), about $${total.toFixed(2)} ${process.argv.includes('--batch') ? 'batched' : 'live'}; no calls`);
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
  mkdirSync(REPORTS, { recursive: true });
  const client = new Anthropic();
  const finish = () => (PAST ? undefined : publish());

  if (process.argv.includes('--batch') || resume) {
    const batch = resume
      ? JSON.parse(readFileSync(path.join(BASE, 'batch.json'), 'utf8'))
      : await client.messages.batches.create({ requests: ids.map((id) => ({ custom_id: id, params: params(load(id)) })) });
    if (!resume) {
      console.log(`batch ${batch.id}: ${ids.length} requests`);
      writeFileSync(path.join(BASE, 'batch.json'), JSON.stringify({ id: batch.id, ids, at: new Date().toISOString() }));
    }
    for (;;) {
      const b = await client.messages.batches.retrieve(batch.id);
      if (b.processing_status === 'ended') break;
      console.log(`  ${b.request_counts.processing} processing, ${b.request_counts.succeeded} done...`);
      await new Promise((res) => setTimeout(res, 60_000));
    }
    let total = 0;
    for await (const result of await client.messages.batches.results(batch.id)) {
      if (result.result.type !== 'succeeded') {
        console.log(`${result.custom_id}: ${result.result.type}`);
        continue;
      }
      const out = save(result.custom_id, load(result.custom_id), result.result.message, true);
      total += out.cost;
      if (out.problems.length) console.log(`${out.name}: ${out.problems.join('; ')}`);
    }
    console.log(`total $${total.toFixed(2)}`);
    return finish();
  }

  let total = 0;
  const one = async (id) => {
    const dossier = load(id);
    const message = await client.messages.stream(params(dossier)).finalMessage();
    const out = save(id, dossier, message, false);
    total += out.cost;
    console.log(`${out.name} (${out.mode}): ${message.usage.input_tokens} in / ${message.usage.output_tokens} out, $${out.cost.toFixed(3)} (batched $${(out.cost / 2).toFixed(3)})${out.problems.length ? `\n  ${out.problems.join('\n  ')}` : ''}`);
  };
  for (let i = 0; i < ids.length; i += 4) await Promise.all(ids.slice(i, i + 4).map(one));
  console.log(`total $${total.toFixed(2)} live (batched about $${(total / 2).toFixed(2)})`);
  return finish();
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
