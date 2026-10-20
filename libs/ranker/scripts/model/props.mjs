// Player props: DraftKings' board from ESPN's core API (every coming game's props, a page of up to 1,000 at a
// time), the main line only (one line a player a stat; no milestone ladders, no first or last scorer, no
// quarter or half lines, no longest-play lines, no anytime touchdown on the board: it has no line; the NFL's comes
// from The Odds API, its own model, tracked only: anytime.mjs), each priced against
// its projection (project.mjs) and bet like the game markets: with an edge at its Kelly stake, without one
// tracked, not bet (desk.mjs TRACK, since 2026-10-13: once the 0.5-unit minimum as an action bet; graded for the
// data all the same: its trust and CLV), unless a guard skips it.
//
// The board gives each prop's line and where it opened, and for the NBA, NHL and MLB each side's price (a
// pair of items at the same line: the over first, then the under; their prices are DraftKings', vig and
// all). The NFL's board has lines but no prices: there each side is taken at -110 (the book's fair chance
// 50%), which only holds where the line is near the player's usual, so one far from it (he's gone over it in
// under 40% or over 60% of his games this season, last season's at half weight) carries a juiced price the
// desk can't know and isn't bet. The trust in the projection is the prop type's own (start 0.5, refit on its
// graded bets once there are 40, as the markets'), against the book's fair chance where it has prices.
//
//   a bet: every main line not skipped, 0.5 to 3 units by its expected return at the trusted chance as a game
//   market's (desk.mjs stakeFor), its lean tapered past half of GAP.prop (15 points) as a game market's (desk.mjs
//   chanceAt: the further from the book, the less of it counts, so the stake shrinks as the gap grows); one a
//   player a game (leagues.mjs PROP_CAPS). A whole-number line's push is out of both sides' chances and its stake
//   comes back in the return (project.mjs lineChances; with the early exit's mixture where the fit kept it, exitMix:
//   his chance of a short game by his role, a short last game and a first game back, the mean as projected). Cut to
//   0.5 when the line has moved a lot since it opened,
//   the player's questionable, a questionable teammate's being in or out moves his share of his group's work
//   (each questionable regular at his position's swing times the spread of his chance of playing, added up:
//   playchance.mjs), his team's starting quarterback questionable where a kept term reads him (qb1Out, qbDeep:
//   the swing him in or out times the spread of his chance, QB_Q_SWING or more),
//   an outdoor game's forecast failed (or a retractable roof isn't yet said open or closed) where his
//   projection weighs the weather (wind, cold, rain), the forecast moves his projection 10% or more, the other
//   side's starter his projection weighs isn't listed yet (an NHL goalie, an MLB pitcher), an MLB starter's
//   first start in LONG_REST days or more or his first of the season from LATE_DEBUT, his team's roster
//   can't be read (the NFL, NBA, NHL) or (the NFL) the snap counts are missing for some games of the
//   history; skipped at twice the move (one his projection followed, moveFollowed: priced, flagged, D31) or when he's out (or not in a posted lineup, or not the probable
//   starting pitcher or goalie), an MLB starter's first start in LAYOFF days or more (or his first of the
//   season from May on: back from injury, his pitch count held down), when the work his group is missing now
//   differs from what it was in the games his numbers come from and the projection can't size it (teammates
//   out: his role up; teammates back from an absence that fed his numbers: his role down), or when its
//   chance is more than GAP.prop from the book's (the market knowing something it doesn't); also when his
//   team's roster can't be read and his numbers were made with teammates missing (whether they're back or
//   gone can't be told), or (the NFL) the snap counts are missing for a season's quarter or more of the
//   history's games. One skipped for the gap alone (kind 'gap') is kept as a CHECK on the model's own side
//   (checks.mjs, run.mjs betProps): not bet, graded as if it were. Ahead of the gap, an NFL player whose role
//   is changing (roleChangeOf: a backup quarterback starting, his team's starter out, a change at quarterback,
//   a regular at his position out and a big cut of his work, a jump in his snaps, a part-timer with a regular out, a line far
//   from his projection at the book's own price, the depth chart against his role) is a CHECK too (kind 'role', its sub-reason role), whichever
//   side the model takes, when it's the role alone (one the long-shot, moved or unpriced skips take too, skipped):
//   the book reprices a role on the news, the model on the logs. Outside the NFL a line at the book's price far
//   from his projection with something known before the game, and unsized by the fit, that explains it that way
//   (lineAlarmOf: questionable, an unconfirmed goalie, an unposted lineup, an NBA starter's back-to-back, an MLB
//   starter's pitch count) is only a label (projection.lineAlarm) on the side against the market's reading, bet
//   or not by the other guards, till selfcheck.mjs C20 says its rows do worse than the book; a far line alone
//   nothing (measured: no worse than the rest). Ahead of the role, a player whose unit (his
//   team's offense or defense, or the whole team) the news flags (news.mjs: a change of play-caller,
//   coordinator or head coach, a benching, in the team's next games) is a CHECK either side (kind 'news', the
//   headline its reason), on the same terms; and a line with no price that -110 can't be
//   (unpricedWhy: far from his usual, or 0.5) is skipped as unpriced, not called a gap. A side against its own
//   projection (an under with the mean above the line, an over below it; lines from SKEW_MIN_LINE: skewOnly) is
//   skipped as skew: its edge only the spread's assumed skew, which leans the props to the unders. Teammates on injured
//   reserve, PUP, NFI or suspended (the roster's, espn.mjs) and an NFL regular who's missed his team's last two
//   games or more and isn't on the report or the game's board count as missing, as the history counts them. Each priced prop keeps the other side's
//   price beside its own (otherOdds, the book's; none at an assumed -110), for the page's both sides
//
//   when: inside the game's props window (leagues.mjs TIMING; run.mjs betProps), each once the news it waits
//   for is in (timing.mjs newsMissing: an MLB batter's lineup and the other side's starter, a pitcher's own
//   start, the NHL's goalies) or at the last chance, flagged at the minimum; priced again, taken back and
//   placed anew, when the game's inputs change before the start (timing.mjs inputsOf, run.mjs repriceOpen)
//
// The history it's fit on (fitProps): every game a player took the field at the stat's positions, whatever he
// did in it, as DraftKings grades him (STATS played), and of those the ones a book would have posted his prop
// for by what was known before the game (markEligible: his usage in his games before it), never by the
// game's own box score; the NFL's passer among them its starter (qbStart), whose projection the fit may take
// from his starts alone (project.mjs's role-aware base; at bet time a quarterback with a prop on the board).
// An MLB batter's are his starts (his place in the posted lineup: the book only posts a starter's, and the
// desk bets only one in the lineup), not a pinch hitter's one trip

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { calSides } from './calib.mjs';
import { anchorEntry, anchoredChances } from './anchor.mjs';
import { bucketTrustOf, heldEv, chanceAt, decimal, fairPair, gapGuard, outcomeOf, stakeFor, suspectOf, trustedUnits } from './desk.mjs';
import { residOn } from './residual.mjs';
import { correctSides } from './correct.mjs';
import { FEEDS, SKEW_MIN_LINE, TRY_VL, ctxFactor, ctxKeys, exitMix, factorProduct, fitStat, fullMin, impliedMean, lineChances, makeModel, middleF, rAt, squadF, squadIn, squadMkt, squadRead, squadSum, trOpenFit, trOpenOf } from './project.mjs';
import { mlbMatchups, nbaMatchups, nflMatchups, nhlMatchups } from './matchups.mjs';
import { CACHE, get, nflverseGames, nflverseRows, pool } from './sources.mjs';
import { ANYTIME_TD, PROP_BOOKS, SPORT_KEYS, american, anytimeOn, call, canSpend, consensusOf, hasKey, propAsks } from './oddsapi.mjs';
import { round } from './ratings.mjs';
import { ESPN_PROVIDER, ROSTER_MIN, goaliesInOrder } from './espn.mjs';
import { officialLine } from './nhl-official.mjs';
import { BOOK } from './leagues.mjs';
import { OUT_STATUS, Q_STATUS, usualStarters } from './timing.mjs';
import { usageOf } from './usage.mjs';
import { kindOf, newsOn } from './news.mjs';
import { COACH_GAMES } from './football.mjs';
import { boardMissChance, missChance } from './playchance.mjs';
import { PLAY_MISSING_MIN } from './board-miss.mjs';
import { ANY_KEY, anytimeModel, anytimeRows, fitAnytime } from './anytime.mjs';

const CORE = 'https://sports.core.api.espn.com/v2/sports';
// (no cap a game: every main-line prop that isn't skipped gets a bet, 0.5u at no edge, like the game markets:
// the user wants every bet the data can give; null keeps the name for the state)
export const PER_GAME = null;
export const PROP_ODDS = -110;
// (a prop whose count can't be read yet (the NFL's snap counts not posted, StatsAPI down) waits this long after
// its start, then is no action: the bettor's (run.mjs) and the play-money settler's (settle-lib.mjs) alike, so
// the same pick never ends one way on the desk and another on a user's account)
export const PROP_WAIT = 4 * 864e5;
// (an MLB starter's days since he last pitched at which his start is skipped: a layoff, an injury most likely.
// A 15-day IL stint, backdated, brings him back 13 to 19 days on; a normal turn, the All-Star break or a
// skipped start, 10 or 11 at most. In 2025-26's starts, 12 to 19 days off threw 0.92 of his usual pitches, a
// third of them under 0.85, against 1.01 and 12% on normal rest. LONG_REST: from it, flagged (0.5u): 11 and
// 12 days held a little lower, 0.95 to 0.97)
export const LAYOFF = 13;
export const LONG_REST = 11;
// (his first start of the season from this day on (month-day; opening day's in late March) flagged as late:
// back from injury maybe; from May on, skipped)
export const LATE_DEBUT = '04-08';
// (whether an MLB starter's start is a layoff's or a debut from May on (skip), a long rest's or a late debut's
// (flag), or none (null): restDays his days since he last pitched this season (null: none yet), debut his first
// start of it, date the game's)
export function restGuard(restDays, debut, date) {
  const md = String(date ?? '').slice(5, 10);
  if ((restDays ?? 0) >= LAYOFF) return 'layoff';
  if (debut && md >= '05-01') return 'debut';
  if ((restDays ?? 0) >= LONG_REST) return 'long';
  if (debut && md >= LATE_DEBUT) return 'late';
  return null;
}

// An NFL player's role changing, by what's known before the game (null: none seen). The book reprices a role on
// the news; the model's numbers are his old role's till the logs catch up, so a prop on him is kept as a CHECK
// whichever side the model takes (props.mjs priceProps, kind 'role'), till the CHECKs show it can read one:
//   backup-qb   a quarterback who isn't his team's usual starter (qb1: the most passes a game, recent games
//               counting most: matchups.mjs), or his team's usual starter not known (priced as its starter all
//               the same: qbStart); a backup starting for a starter who's out, on his rushing props alone (his
//               passing is read from his starts; few-starts still CHECKs a passer with few)
//   qb-change  his team's usual starter neither missing nor on the game's board, and another of its
//               quarterbacks on it (boardQbs: the team's quarterbacks with a prop on the board): a change at
//               quarterback (one back from injury taking the job back, or the one who had it benched), the
//               quarterback's own prop and every other player's on the team
//   few-starts  a quarterback with fewer than ROLE.fewStarts starts before tonight (his team's passer: project.mjs),
//               or ROLE.fewStartsRush on a rushing prop: the role backtest (2026-10-11) had the few-start ones'
//               passing 3% to 6% high and their rushing 15% to 30% low (a rookie's legs), the base's prior made up
//               with other starters' numbers
//   qb1-out    any other player whose team's starting quarterback is missing: a backup throwing to him
//   group-out   a regular at his position missing (out, doubtful, IR, off the roster, absent two games or
//               more), his cut of the work they leave (vacOut: matchups.mjs vacated, a questionable one not
//               counted) ROLE.vac of his own or more; and a back projected in the role he steps into (project.mjs
//               rp) on a receiving prop, with no safe side (promoted backs' receiving ran high, not low). Not
//               where the absence is already in his recent games (settled: settledAbsenceOf below), nor
//               the promoted back's receiving
//   snap-jump   his last game's share of his team's offensive snaps ROLE.snapJump over his season's; not where
//               his game before was at the new level too (snapSettledOf below)
//   part-time   a part-timer (his season's snap share under ROLE.partTime) with a regular at his position missing;
//               not where the absence is settled
//   line        the line's projection (impliedMean: the mean its price implies) ROLE.zHi or more of his count's
//               spreads over the model's, or ROLE.zLo under it (lineZ: in SDs of the count distribution, never a
//               ratio; DECISIONS.md D24): the market reading a role the model hasn't seen
//   depth       (none of the above) the depth chart's starter at his spot the model's role has lower, or the
//               model's top man the chart has behind (depthRoleOf below: a tight end's receiving, a back's
//               rushing; live only), its safe side the chart's
//   lineup-start, lineup-bench  the NBA's: tonight's posted starting five against his team's usual one by
//               starts (lineupRoleOf below), one not usually starting in it or a usual starter not in it
//   ice-jump    the NHL's: his last three games' time on ice MIN_BACK.jump times his season's or more on the
//               ice-time base (iceJumpOf below), the over a CHECK
// qb1: { id, name, missing (0 to 1) }; boardQbs: a Set of ids (null: unknown); snap: { latest, avg, n }; starts:
// a quarterback's starts before tonight (null: unknown), rushing: a rushing prop
// (matchups.mjs); mu: the projection; implied: the line's (null where the book gave no price: an assumed -110
// says nothing of his role)
// (zHi, zLo: the line's gap in SDs, lineZ; the ratios 1.6 and 0.6 they replaced (2026-10-18, the owner: "a guy
// projected for .6 but the book thinks ~1 is huge %-wise but clearly not as different as projected 8 catches vs
// 14") read the same at the middle counts, a 4-catch receiver's or a 60-yard back's (1.6x is about +1.1 to +1.2
// SDs there, 0.6x about -0.75), and no longer flag the small counts a ratio blows up)
export const ROLE = { vac: 0.3, snapJump: 0.1, partTime: 0.5, zHi: 1.15, zLo: -0.75, fewStarts: 6, fewStartsRush: 16 };
// The book's implied mean against the model's in SDs of the model's count distribution (the negative binomial at its
// dispersion r: var = mu + mu^2 / r; Poisson without one): scale-aware, so 0.6 against 1.0 is +0.5 and 8 against 14
// about +1.8 (r 20), where both ratios read about 1.7. Null where either is missing
export function lineZ(implied, mu, r = null) {
  if (!Number.isFinite(implied) || !(mu > 0)) return null;
  const v = mu + (Number.isFinite(r) && r > 0 ? (mu * mu) / r : 0);
  return (implied - mu) / Math.sqrt(v);
}
// A line's move the projection already followed (DECISIONS.md D31, 2026-10-18: Rachaad White's rush yards, opened at
// 20.5 with the two backs ahead of him healthy, 47.5 with both out on the report, his projection 47.2 with them out):
// the line now within MOVE_FOLLOWED of the open's distance from the model's mean, both in SDs of his count (lineZ, as
// D24 reads every gap). Such a move is the inputs' own reason (a teammate out, a quarterback changed), already in the
// price, so the line-move guard doesn't skip it (D5: a reason in the inputs is priced, never an automatic pass); it's
// flagged, at the guard's half stake. A move the projection didn't follow still skips. False where it can't be read
export const MOVE_FOLLOWED = 0.5;
export function moveFollowed({ open, line, mu, r = null }) {
  const zNow = lineZ(line, mu, r);
  const zOpen = lineZ(open, mu, r);
  if (zNow === null || zOpen === null || open === line) return false;
  return Math.abs(zNow) <= MOVE_FOLLOWED * Math.abs(zOpen);
}
// (each reason's safe side: the one the model's known error there makes conservative, by the role backtest
// (2026-10-11): a role growing (group-out, snap-jump, part-time, a backup's or a new starter's rushing) the
// model projects low, so an over it still takes is safe and its under is the risk; a backup throwing to him
// (qb1-out) or a few-start passer's passing it projects high, so the under is safe; the line's read, the side
// the market's reading points away from; a change at quarterback, either way: neither. The safe side bets as
// any prop; only the other is a CHECK (priceProps))
export const ROLE_SAFE = { 'group-out': 'over', 'snap-jump': 'over', 'part-time': 'over', 'qb1-out': 'under', 'backup-qb': 'over', 'qb-change': null, 'minutes-back': 'under', 'lineup-start': 'over', 'lineup-bench': 'under', 'ice-jump': 'under' };
// The CHECK bar by cause (round E, 2026-10-17, the owner's: "fix every logic you can"): a role cause's risky side is
// bet, not CHECKed, once the graded CHECKs of that cause (check-learn.mjs checkLearning, byRole: the model's side as
// if bet) say the model's side pays: ROLE_BET_N graded or more (never under 40 a cause, the owner's rule), their
// profit a unit over 0 and their hit rate over their break-even. Only the causes whose error is a role growing the
// model projects low (ROLE_BET: snap-jump, group-out, part-time; graded 2026-10-11 to 10-16: snap-jump 62% / +0.18u
// a unit, group-out 56% / +0.04u, part-time 58%); the rest stay CHECKs whatever their record (qb1-out 41% / -0.23u
// and a backup's or few-start passer's rows the model's blind spots, qb-change and the line's read neither side's,
// the depth chart's unfit). A bet so made stakes at most ROLE_BET_UNITS (the untested cap's half: a LIKE), its
// context naming the cause and the record it was bet on (run.mjs propBet roleBet). roleGateOf(learning): the gate by
// cause from the state's checks.learning (byRole), { on, n, hitRate, breakEven, perUnit, why }; none, every cause a
// CHECK as before. The gate is read again every run, so a cause whose record turns goes back to CHECKs by itself
export const ROLE_BET = new Set(['snap-jump', 'group-out', 'part-time']);
export const ROLE_BET_N = 40;
export const ROLE_BET_UNITS = 0.5;
export function roleGateOf(learning) {
  const out = {};
  for (const key of ROLE_BET) {
    const t = learning?.byRole?.[key] ?? null;
    const n = t?.decided ?? 0;
    const pays = n >= ROLE_BET_N && Number.isFinite(t?.perUnit) && t.perUnit > 0 && Number.isFinite(t?.hitRate) && Number.isFinite(t?.breakEven) && t.hitRate > t.breakEven;
    const rec = t ? `${t.won}-${t.lost} (${Math.round((t.hitRate ?? 0) * 100)}%, ${t.perUnit >= 0 ? '+' : ''}${t.perUnit}u a unit, break-even ${Math.round((t.breakEven ?? 0) * 100)}%)` : 'none graded';
    out[key] = { on: pays, n, hitRate: t?.hitRate ?? null, breakEven: t?.breakEven ?? null, perUnit: t?.perUnit ?? null, why: pays ? `${key} bet on the Bot's side at the untested cap: ${n} graded CHECKs ${rec}` : n < ROLE_BET_N ? `${key} a CHECK: ${n} graded, under ${ROLE_BET_N}` : `${key} a CHECK: ${n} graded ${rec}, the Bot's side not paying` };
  }
  return out;
}

// The NBA's minutes base (project.mjs sn, mode 'minutes') with teammates back (null: none): his last three
// games' minutes MIN_BACK.jump times his season's or more, and the work his team was missing in the games his
// numbers come from (vacHist) MIN_BACK.vac or more over tonight's (vac). A fill-in's minutes jump made with a
// starter out leans his expected minutes up, and the vacated term (vc) was fit before the minutes base and only
// takes back its share of the lean (project.mjs minLean, 2026-10-13: before it, those rows ran 2% to 16% under
// their projections held out, worse with the minutes base than without). Kept a role CHECK on the over (the
// under its safe side) till the CHECKs show the projection reads it: the fail-safe the unsized vacancy's skip
// was before vc was kept
export const MIN_BACK = { vac: 0.15, jump: 1.2 };
export function minutesBackOf({ name = null, mode, minutes, vac, vacHist }) {
  if (mode !== 'minutes' || !minutes || !(minutes.season > 0) || !Number.isFinite(vac) || !Number.isFinite(vacHist)) return null;
  if (!(vacHist - vac >= MIN_BACK.vac && minutes.recent >= MIN_BACK.jump * minutes.season)) return null;
  return { key: 'minutes-back', safe: 'under', why: `${name || 'he'} at ${round(minutes.recent, 1)} minutes over his last three against ${round(minutes.season, 1)} this season, with teammates back from the absence that gave him them: a smaller role tonight` };
}
// The NHL's ice-time base (project.mjs sn on shots, mode 'minutes') after a jump (null: none): his last three
// games' time on ice MIN_BACK.jump times his season's or more, teammates back or not. A role CHECK on the over
// (the under its safe side) till the CHECKs show the projection reads it: those rows ran 14.9% under their
// projections held out with the base (n 173 of 7189, the eligible; -6.5% without it; review of 2026-10-13), and
// most weren't a teammate's return (minutesBackOf's work back, MIN_BACK.vac, is never reached on the NHL's time
// on ice: the held-out jumps' work missing then over now at most 0.07; with 0.02 or more back, n 49, -6.5%; the
// rest, n 124, -17.9%), so the jump alone is the CHECK
export function iceJumpOf({ name = null, mode, minutes }) {
  if (mode !== 'minutes' || !minutes || !(minutes.season > 0) || !(minutes.recent >= MIN_BACK.jump * minutes.season)) return null;
  return { key: 'ice-jump', safe: 'under', why: `${name || 'he'} at ${round(minutes.recent, 1)} minutes on ice over his last three against ${round(minutes.season, 1)} this season: the Bot leans to the jump and has run high there` };
}
// The NBA's posted starting five (context.mjs gather: espn.mjs gameRoster, about 30 minutes before the tip) against
// his team's usual one by starts (timing.mjs usualStarters: started half its last four games or more, the five
// with the most at most, read from this season's games; the same rule as the inputs' st part, lineupSurprise):
// one in it who isn't a usual starter (lineup-start) or a usual starter not in it (lineup-bench; he's priced, so
// not out) is a role CHECK on the side his role's change makes the projection's risk. A bench player who started
// his team's last game ran 11% over his projection held out on points (2026-10-13, CTX newStart, 706 rows, not
// taken on the fit window), so the starting one's under is the risk and his over safe; a starter benched isn't
// measured, the under taken as safe by the same reading the other way (the CHECKs measure it). Not fit: the five
// posts too near the tip for the history's lines (the box's flag is after the game), so it's a CHECK till the
// CHECKs show the projection reads it. Null with no five posted, or the usual one not known
export function lineupRoleOf({ name = null, pid, usual = null, starters = null }) {
  if (!Array.isArray(starters) || starters.length !== 5 || !(usual instanceof Set) || !usual.size) return null;
  const inFive = starters.includes(String(pid));
  const isUsual = usual.has(String(pid));
  if (!isUsual && inFive) return { key: 'lineup-start', safe: 'over', why: `${name || 'he'} in tonight's posted starting five, not one of his team's usual starters: a bigger role` };
  if (isUsual && !inFive) return { key: 'lineup-bench', safe: 'under', why: `${name || 'he'} not in tonight's posted starting five, one of his team's usual starters: a smaller role` };
  return null;
}
// The group-out CHECK's absence already seen (null: new to him, or not known). It's for a role the model hasn't
// seen yet; one he's already played through in the role it gives him is in his recent numbers and the
// next-man-up terms (project.mjs nu, rp, ab), and its CHECK caught nothing new (Emanuel Wilson, GB, 2026-10-18:
// every prop a CHECK with the lead back out two games and 20-plus carries in each). Settled: of his last
// SETTLED.recent games for his team, one or more with every regular at his position missing tonight missing it
// too (without: matchups.mjs absenceGames), and his work in those (their average: touches, a back's carries and
// targets, a receiver's or tight end's targets) at least his work in his games with none of them missing (pre:
// their average, 0 with none) plus SETTLED.share of the work tonight's cut gives him (vacOut times his recent
// work, 1 at least: the cut's own measure). A new absence (no such recent game), a second regular newly out,
// or a fill-in who didn't take the work, still a CHECK. ab: matchups.mjs absenceGames' { own, games }
export const SETTLED = { recent: 2, share: 0.7, snap: 0.85 };
export function settledAbsenceOf({ vacOut = 0, ab = null } = {}) {
  if (!(vacOut > 0) || !ab || !Array.isArray(ab.games) || !ab.games.length) return null;
  const recent = ab.games.slice(-SETTLED.recent).filter((g) => g.without);
  if (!recent.length) return null;
  const mean = (a) => a.reduce((t, g) => t + (g.work ?? 0), 0) / a.length;
  const before = ab.games.filter((g) => g.none);
  const pre = before.length ? mean(before) : 0;
  const work = mean(recent);
  const need = pre + SETTLED.share * vacOut * Math.max(ab.own ?? 0, 1);
  if (!(work >= need)) return null;
  return { n: recent.length, work: round(work, 1), pre: round(pre, 1), need: round(need, 1) };
}
// The snap-jump CHECK's jump already seen: his game before the last at SETTLED.snap of his last game's share or
// more (snap.prev: matchups.mjs snapOf), two games at the new level, so his recent form has it (Wilson again: 59%
// of the snaps his last game, his game before it in the new role too). A jump in his last game alone, a CHECK
export function snapSettledOf(snap) {
  return !!snap && Number.isFinite(snap.prev) && snap.latest > 0 && snap.prev >= SETTLED.snap * snap.latest;
}
export function roleChangeOf({ name = null, pos, pid, qb1 = null, boardQbs = null, vacOut = 0, settled = null, skips = null, snap = null, mu = null, r = null, implied = null, starts = null, rushing = false, role: R = ROLE }) {
  const who = name || 'he';
  const pct = (x) => Math.round(x * 100);
  // (no usual starter known for his team (no quarterback's passes in its games): any quarterback with a prop is
  // priced as its starter (qbStart), a backup or a gadget passer included, so he's a CHECK)
  if (!qb1 && pos === 'QB') return { key: 'backup-qb', why: `${who} on a team whose usual starting quarterback isn't known: taken as its starter, maybe a backup` };
  if (qb1 && String(qb1.id) !== String(pid)) {
    const usual = qb1.name || 'the usual starter';
    const change = !(qb1.missing >= 1) && !!boardQbs?.size && !boardQbs.has(String(qb1.id));
    if (pos === 'QB' && change) return { key: 'qb-change', why: `${who} on the board and his team's starter of late (${usual}) not: a change at quarterback` };
    // (a backup starting for a starter who's out (out, doubtful, IR: known before the game): his passing read
    // from his own starts (project.mjs qs, the role backtest's backup-QB passing within about 5%), so only his
    // rushing (still 6% to 12% high there) and a few-starts passer stay CHECKs; any other backup, a CHECK)
    if (pos === 'QB' && !(qb1.missing >= 1 && !rushing)) return { key: 'backup-qb', why: `${who} not his team's usual starting quarterback (${usual}${qb1.missing >= 1 ? ', out' : ''}): a backup's role` };
    if (qb1.missing >= 1 && pos !== 'QB') return { key: 'qb1-out', why: `his team's starting quarterback (${usual}) out: a backup throwing to him` };
    if (change) return { key: 'qb-change', why: `his team's starter of late (${usual}) not on the board and another quarterback on it: a change at quarterback` };
  }
  if (pos === 'QB' && Number.isFinite(starts) && starts < (rushing ? R.fewStartsRush : R.fewStarts)) return { key: 'few-starts', safe: rushing ? 'over' : 'under', why: `${who} with ${starts} start${starts === 1 ? '' : 's'} before tonight: a new starter's ${rushing ? 'rushing' : 'passing'} the Bot reads poorly` };
  // (group-out only for an absence new to him: one he's already played through in the role it gives him
  // (settled: settledAbsenceOf) is in his recent numbers and the next-man-up terms, so it's not a CHECK)
  // (each cause it would have been, skipped as not new, pushed on skips ({ key, why }): the caller's log)
  if (vacOut >= R.vac) {
    if (!settled) return { key: 'group-out', why: `a regular at his position out, his cut of the work missing ${pct(vacOut)}% of his own: a bigger role` };
    skips?.push({ key: 'group-out', why: `absence not new: ${settled.n} game${settled.n === 1 ? '' : 's'} already without ${settled.names || 'the regular'} (his work ${settled.work} a game there, ${settled.pre} before, ${settled.need} needed)` });
  }
  // (snap-jump only for a jump new to him: his game before the last at SETTLED.snap of the last's share or more
  // (snapSettledOf) is two games at the new level, in his recent form already)
  if (snap && snap.n >= 2 && snap.latest > snap.avg + R.snapJump) {
    if (!snapSettledOf(snap)) return { key: 'snap-jump', why: `${pct(snap.latest)}% of the snaps in his last game against ${pct(snap.avg)}% this season: a bigger role` };
    skips?.push({ key: 'snap-jump', why: `jump not new: 2 games at the new level already (${pct(snap.prev)}% then ${pct(snap.latest)}% of the snaps, ${pct(snap.avg)}% this season)` });
  }
  // (part-time only where the absence is new to him: settled, he's played through it and took the work)
  if (snap && snap.n >= 1 && snap.avg < R.partTime && vacOut > 0) {
    if (!settled) return { key: 'part-time', why: `a part-timer (${pct(snap.avg)}% of the snaps this season) with a regular at his position out` };
    skips?.push({ key: 'part-time', why: `absence not new: ${settled.n} game${settled.n === 1 ? '' : 's'} already without ${settled.names || 'the regular'} (his work ${settled.work} a game there, ${settled.pre} before, ${settled.need} needed)` });
  }
  if (Number.isFinite(implied) && mu > 0) {
    const z = lineZ(implied, mu, r);
    if (z > R.zHi || z < R.zLo) return { key: 'line', safe: z > R.zHi ? 'over' : 'under', why: `the line's price puts him at ${round(implied, 1)} against the Bot's ${round(mu, 1)}: the market reading a role the Bot hasn't seen` };
  }
  return null;
}

// The book's line as a news alarm outside the NFL (the NBA, NHL, MLB; null: none). A line whose price puts him
// past ROLE.zHi or under ROLE.zLo times the model's projection (impliedMean, at the book's own price) is
// labeled (projection.lineAlarm: its cause's key and words) on the side against the market's reading only where
// something known before the game, and not sized by the fit, explains that reading, the late news the logs can't
// show yet:
//   low line (under ROLE.zLo)
//     line-questionable  he's questionable, day-to-day or a game-time call (statusOf): a minutes cap, an early exit
//     line-goalie        an NHL goalie expected, not confirmed: the other one may start
//     line-lineup        an MLB batter whose lineup isn't posted: a rest day, a lower spot
//     line-rest          an NBA starter's (roleKnown 'S') second night of a back-to-back, where b2bS isn't kept: a
//                        rest night, a cap. Not a bench player's (the fit's b2bB: his rows ran high on the second
//                        night, the other way) nor the NHL's (a confirmed goalie isn't resting, an unconfirmed one is
//                        line-goalie's; saves on his own side's back-to-back measured +3.8%, CTX b2b kept there)
//     line-pitch-count   an MLB starter's pitch count: his last two starts both under OPENER_PITCHES (an opener, a
//                        bullpen game) or their pitches under SHORT_LEASH of his usual, where the fit's leash isn't
//                        kept (c_leash sizes it); a long rest where restSp isn't kept; a late debut (restGuard)
//   high line (over ROLE.zHi): none. Teammates out (or back, a low line) aren't a cause: where the fit sizes
//   the work missing (vc kept on a vacated stat) the projection has it, and where it doesn't the unsized
//   vacancy's skip (priceProps) takes the prop first (the line-teammates and line-back of 2026-10-13, dropped)
// Only a label, never a cut (the review of 2026-10-13): with the model's side always the one against the market's
// reading, the alarm as a CHECK took every far line with its cause off the bets, and the caused rows were never
// measured (old bets keep no status, rest or leash; the far group as a whole ran no worse than the near). The
// labeled side is bet or not by the other guards as before, and selfcheck.mjs C20 reads the labeled rows apart:
// a watch past z 2.5 with 60 graded says promote it to a role CHECK. Its safe side (safe) the market's reading's
// (a low line's under); a pick on it carries no label.
// Low counts (outside the NFL a 0.5 line most of all, the NHL's points: at a mean of 0.3 a ratio of 1.6 is only
// 26% to 38% over) aren't read: the line ALARM_MIN or more and the larger of the two means ALARM_MIN or more
// (farOf, C20's band too). A far line with no cause seen is left as it was, bet or not by the other guards (the
// gap's PASS where the chances are past GAP.prop): measured 2026-10-13 on every graded prop bet at the book's
// price (its implied mean from the bet's line, fair chance and dispersion: C20's), the NHL's lines far over the
// model with the model's side against them went 31 bets 4.8 points over the book's fair chance (58.1% won against
// 53.3%, z 0.55), far under 12 bets 5.7 under (z -0.41), the near ones 654 bets 3.9 under (z -2.02): no worse than
// the rest, so the line alone isn't the news (MLB's 43 all near, the NBA's none yet; the NFL's far line alone is
// already a role CHECK, roleChangeOf's line). With the floor (2026-10-13, origin/master's ledgers, C20): the NHL's
// far over with the model against 16 bets 7.7 points over the book's chance (z 0.62), far under 3 (+22.9), the
// near 697 3.9 under; MLB's 43 and the NFL's 72 of 73 near. None of the far ones can be split by cause (the
// ledgers keep no status, rest or leash): the label starts that count.
// Every priced prop's ratio is kept (projection.lineRatio) and selfcheck.mjs C20 keeps measuring it. Inputs
// missing (no price: no implied mean; no status, role, rest or leash read) give no cause: no label
export const SHORT_LEASH = Math.log(0.85);
export const OPENER_PITCHES = 60;
export const ALARM_MIN = 1.5;
// (a far line's band ('hi', 'lo' or null): the implied mean past ROLE's zHi or zLo in SDs of the count (lineZ), every
// sport the same. ALARM_MIN's floor on the line and the means went with the ratio it was for (2026-10-18, D24): the
// SDs read a 0.5 line's small count as the small gap it is)
export function farOf(implied, mu, r = null) {
  const z = lineZ(implied, mu, r);
  if (z === null) return null;
  return z > ROLE.zHi ? 'hi' : z < ROLE.zLo ? 'lo' : null;
}
export function lineAlarmOf({ sport, name = null, mu = null, r = null, implied = null, line = null, status = null, b2b = 0, roleKnown = null, b2bSized = false, pitcher = false, leash = null, leashSized = false, rest = null, restSized = false, pitches = null }) {
  if (sport === 'nfl' || !Number.isFinite(implied) || !(mu > 0)) return null;
  if (!Number.isFinite(line) || farOf(implied, mu, r) !== 'lo') return null;
  const who = name || 'he';
  const st = String(status?.why ?? '');
  let cause = null;
  if (Q_STATUS.test(st)) cause = { key: 'line-questionable', fact: st || `${who} questionable`, reads: 'a minutes cap or an early exit' };
  else if (sport === 'nhl' && /expected, not confirmed/.test(st)) cause = { key: 'line-goalie', fact: `${who} expected, not confirmed`, reads: 'the other goalie starting' };
  else if (sport === 'mlb' && !pitcher && /lineup not posted/.test(st)) cause = { key: 'line-lineup', fact: 'his lineup not posted', reads: 'a rest day or a lower spot' };
  else if (sport === 'nba' && b2b > 0 && roleKnown === 'S' && !b2bSized) cause = { key: 'line-rest', fact: "a starter on his team's second night of a back-to-back", reads: 'a rest night or a minutes cap' };
  else if (sport === 'mlb' && pitcher) {
    // (his last two starts, both read: one cut short alone (rain, a comebacker, an early hook) isn't an opener)
    const last = Array.isArray(pitches) ? pitches.slice(-2) : [];
    const opener = !leashSized && last.length >= 2 && last.every((x) => Number.isFinite(x) && x < OPENER_PITCHES);
    const short = !leashSized && Number.isFinite(leash) && leash <= SHORT_LEASH;
    const long = rest === 'long' && !restSized;
    if (opener) cause = { key: 'line-pitch-count', fact: `his last two starts under ${OPENER_PITCHES} pitches`, reads: 'an opener or a bullpen game' };
    else if (short) cause = { key: 'line-pitch-count', fact: 'his last two starts short of his usual pitches', reads: 'a pitch count' };
    else if (long || rest === 'late') cause = { key: 'line-pitch-count', fact: long ? `${who} back from a long rest` : `${who}'s first start of the season, late`, reads: 'a pitch count' };
  }
  if (!cause) return null;
  return { key: cause.key, safe: 'under', ratio: round(implied / mu, 3), z: round(lineZ(implied, mu, r), 3), why: `${cause.fact}, and the line's price puts him at ${round(implied, 1)} against the Bot's ${round(mu, 1)}: the market reading ${cause.reads}, which the projection doesn't size` };
}

// The NFL's depth chart as a pre-game role input, live only: each team's chart now (the site's StaticData/depth,
// built nightly by apps/nfl/scripts/build-depth.mjs from nflverse's daily depth charts, ESPN's snapshots twice a
// day, each stamped (at)). A player the chart has first at his spot among the ones not out (out, doubtful, IR,
// off the roster: missOf) where the model's role (project.mjs: his place by the work, the next man up's where rp
// is kept) has him under it, or the model's first where the chart has someone not out ahead of him, is a role
// CHECK (kind 'role', role 'depth') on the side the chart says is the risk: the chart's starter the model ranks
// lower runs over his projection (its safe side the over), the model's top man the chart has behind runs under
// (the under). Only the single-starter spots where it read: a tight end's receiving (receptions, receiving
// yards, both yards) and a back's rushing (carries, rushing yards). Measured 2026-10-12 on the 2025 and 2026
// seasons' eligible rows, each against the latest snapshot before the kickoff (the ones not in the game's logs
// out of the order): tight ends the chart's starter the model had lower ran 11.4% over the projection on
// receiving yards (n 150; the two agreeing, 2.0%), receptions 6.3% (2.2%); the model's TE1 the chart had
// behind -7.3% and -15.7% (n 28); backs the chart's starter the model had lower +9.5% rushing yards and +12.1%
// carries (n 221; agreeing +4.8%, +4.9%), the model's RB1 the chart had behind -19% and -25% (n 48). The
// wide receivers' three starting spots against the model's WR1-3 said nothing (+0.2% to +6.9%, either sign by
// stat), nor a back's receiving (the chart's starter the model had lower ran under there, -12% to -17%): not
// read. Not a projection term: the history's charts before 2025 are weekly, unstamped (not known to be
// pre-game), and 2025 on is all past the fit window, so nothing can be fit on them yet; it only takes bets away
// (a CHECK, or the safe side alone), never makes one. A chart older than DEPTH.fresh, stamped after the
// kickoff, without him, or another team's (a player on two charts, traded since one was built: read only on
// his team's tonight, the game's abbreviation; none known, none read): no reason, as before. The order read is
// nflverse's own, as measured: build-depth.mjs moves a backup whose typical game is half the snaps or more, a
// quarter over the listed starter's, to the top of the site's chart (a snap-heavy blocking tight end over a
// receiving one), and keeps the chart's own order beside it (slot.listed, the file's listedKept); a chart built
// before that (no listedKept) isn't read at all, as the order it holds may not be the one measured
export const DEPTH = { fresh: 3 * 864e5, slots: { TE10: 'TE', RB11: 'RB', QB9: 'QB' }, stats: { TE: ['rec', 'recYds', 'rushRecYds'], RB: ['rushYds', 'rushAtt'] } };
// (nflverse's team codes where ESPN's differ: the depth charts' against the games' abbreviations)
const DEPTH_TEAM = { LA: 'LAR', WAS: 'WSH' };
// (the charts by player: his ESPN id to each chart he's on: his spot's group, its order (ESPN ids, first the
// starter: nflverse's), the chart's team (ESPN's abbreviation) and stamp, the latest first; an empty map where
// the folder can't be read)
export function readDepth(dir) {
  const out = new Map();
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return out;
  }
  for (const f of files) {
    let j;
    try {
      j = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
    } catch {
      continue;
    }
    if (!j?.listedKept || !j.team) continue;
    const team = DEPTH_TEAM[j.team] ?? String(j.team);
    const espn = (id) => (String(id).startsWith('espn:') ? String(id).slice(5) : (j.players?.[id]?.espnId ?? null));
    for (const s of j.slots ?? []) {
      const group = DEPTH.slots[s.key];
      if (!group) continue;
      const order = (s.listed ?? s.depth ?? []).map(espn).filter(Boolean).map(String);
      for (const id of order) out.set(id, [...(out.get(id) ?? []), { group, order, at: j.at ?? null, team }]);
    }
  }
  for (const list of out.values()) list.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return out;
}
// (his reason, or null: depth the charts (readDepth), team his team's abbreviation tonight (ESPN's), missOf a
// teammate's being out (0 to 1, out at 1), role the model's role for him tonight, at the kickoff, now the run's
// time)
export function depthRoleOf({ pos, pid, team, stat, depth, missOf, role, at, now = Date.now() }) {
  const c = team ? (depth?.get?.(String(pid)) ?? []).find((x) => x.team === String(team)) : null;
  if (!c || c.group !== pos || !DEPTH.stats[pos]?.includes(stat) || !role) return null;
  const t = Date.parse(c.at);
  if (!Number.isFinite(t) || now - t > DEPTH.fresh || (Number.isFinite(Date.parse(at)) && t >= Date.parse(at))) return null;
  const first = c.order.find((id) => id === String(pid) || !(Number(missOf?.(id)) >= 1));
  const chartTop = first === String(pid);
  const modelTop = role === `${pos}1`;
  if (chartTop && !modelTop) return { key: 'depth', safe: 'over', why: `the depth chart's ${pos}1 tonight, the Bot's ${role}: a bigger role than his numbers say` };
  if (!chartTop && modelTop) return { key: 'depth', safe: 'under', why: `the Bot's ${pos}1, behind another ${pos === 'TE' ? 'tight end' : 'back'} on the depth chart tonight: a smaller role than his numbers say` };
  return null;
}

// The NFL's quarterback change the depth chart already carries (2026-10-18: the research's "missing from our feeds"
// reasons, the most of them a change at quarterback, "Cooper Rush not starting, Michael Penix Jr. starts", which the
// site's own chart (readDepth, QB9) listed that morning): the chart's first quarterback not out on the report is
// another than his team's starter of late (matchups.mjs qb1), and the starter of late on the chart behind him and not
// on the report at all (the report's word wins: listed, questionable or out, it's the report's). The chart fresh
// (DEPTH.fresh) and made before the kickoff. { usual, starter, at, why } or null; run.mjs depthQbs puts the starter of
// late Out (not starting) into the game's report copy, as the research's starter input does (research.mjs
// researchInputs), so the projection's quarterback flags (qb1Out, qbDeep), the backup's own starts and the role
// guard read it before a CHECK is made. report: the game's injury report (a Map of team id -> [{ id, status }])
export function depthQbChangeOf({ depth, team, teamId = null, qb1, report = null, at = null, now = Date.now() }) {
  if (!qb1 || !team) return null;
  const c = (depth?.get?.(String(qb1)) ?? []).find((x) => x.team === String(team) && x.group === 'QB');
  if (!c) return null;
  const t = Date.parse(c.at);
  if (!Number.isFinite(t) || now - t > DEPTH.fresh || (Number.isFinite(Date.parse(at)) && t >= Date.parse(at))) return null;
  const listed = (id) => [...(report instanceof Map ? report : [])].filter(([k]) => !teamId || String(k) === String(teamId)).flatMap(([, l]) => l ?? []).find((p) => String(p.id) === String(id)) ?? null;
  if (listed(qb1)) return null;
  const starter = c.order.find((id) => !OUT.test(String(listed(id)?.status ?? '')));
  if (!starter || starter === String(qb1) || !c.order.includes(String(qb1))) return null;
  return { usual: String(qb1), starter, at: c.at, why: `the depth chart (${String(c.at).slice(0, 10)}) lists another quarterback first, his team's starter of late behind him` };
}
const OUT = /^out|doubtful|injured reserve|suspension/i;

// (the team games the midseason flag covers (CTX midSeason))
export const MID_SEASON = [5, 8];
// (the smallest line the skew guard reads: below it a count's own skew is real; project.mjs's, whose held-out
// check counts the same rows)
export { SKEW_MIN_LINE };
// Whether a side's edge can only be the spread's skew: an under with the projection above the line, an over with
// it below (lines from SKEW_MIN_LINE)
export const skewOnly = (side, mu, line) => Number.isFinite(mu) && Number.isFinite(line) && line >= SKEW_MIN_LINE && (side === 'under' ? mu > line : side === 'over' ? mu < line : false);

// Why a prop without the book's prices can't be taken at an assumed -110 (null: it can): his line far from his
// usual (fairOver: his own over-rate at it, this season and half of last), or a 0.5 line
export function unpricedWhy(line, fairOver) {
  if (fairOver < 0.4 || fairOver > 0.6) return `no price, and his line far from his usual (over it in ${Math.round(fairOver * 100)}% of his games): a juiced price the desk can't know`;
  if (line === 0.5) return "no price, and a 0.5 line (priced long one way or the other): a juiced price the desk can't know";
  return null;
}

const stat = (key, label, match, extra = {}) => ({ key, label, match, ...extra });
// (which rows count as a game he played the prop in: every game he took the field at the stat's positions,
// whatever he did in it, as DraftKings grades it (a receiver never targeted has action and 0 catches, a starter
// hurt in the first quarter has action): never by the game's own numbers, which would keep only his good games.
// Which of these a book would have posted a prop for is markEligible's, from before the game)
const QB = (r) => r.pos === 'QB';
const RUSH = (r) => r.pos === 'RB' || r.pos === 'FB' || r.pos === 'QB';
const CATCH = (r) => r.pos === 'WR' || r.pos === 'TE' || r.pos === 'RB' || r.pos === 'FB';
const MIN = (r) => r.s.min > 0;
const SKATER = (r) => r.pos !== 'G' && r.s.toi > 0;

// Each sport's props: the stat (its key in the player rows), its words, the board's name for it, which rows
// count as having played it, which side's expected score is its game script (opp: the other side's), its
// context terms (ctxValue; each fit on its own and kept only if the held-out games are better with it:
// project.mjs; an NHL goalie's saves also by the other side's expected shots on goal, hockey.mjs)
// (his team's lead quarterback missing (qb1Out, matchups.mjs: a back's or pass-catcher's, the starter's whole
// absence till his backup's had the job five games or so; backupQb only its first games, till the backup is the
// usual starter in the context's last four), on the carrying and receiving stats: kept only past its floor
// (project.mjs MIN_GAIN, a flag on a few hundred team-games), as the new head coach's. Measured 2026-10-12 (the
// role backtest's qb1-out: receiving yards 11% under the projection, receptions 6%, both yards 8%): as a plain
// flag, held out -0.0001 to +0.0003; times the share of his games the starter played in, receiving yards -0.15
// (+0.0003), both yards -0.05 (+0.0006), receptions -0.075 (+0.0002). Judged then on the whole stat's bias,
// which a term lowering any rows can't pass (bias = projection less actual: the held-out receiving yards already
// over their projections, -0.65 a game, so lowering any rows makes it larger); since judged on its own rows'
// (project.mjs SUBGROUP, review of 94fddea5): the flag's held-out rows (2122, every player's) were already
// right on before it (receiving yards' actual -0.04% under the projection; receptions +0.5%) and the term put
// them 12% (6%) over: left out on its own bias, every stat. Why: the role backtest's qb1Out table, the fit's
// flagged rows by the reports, has the listed absences (out, doubtful, on reserve: 725 rows from 2021) 11.9%
// under the projection on receiving yards (held out 12.1%), receptions 6.7%, both yards 8.5%, but the unlisted
// ones (892: a benching, an unlisted inactive) +0.5% (held out +3.6%): the history's flag (not in the logs) is
// more than half benchings live play never flags, so its one size fits neither. Kept off till the history reads
// the injury reports too (the backlog). The role guard's qb1-out (ROLE_SAFE, read from the reports: the listed
// rows) CHECKs the over and bets the under, as before: the side the listed rows' 12% says. Revisited with the
// depth term on (role-backtest.mjs --from 2016, eligible players, 2026-10-13): the report's qb1-out rows
// (live's) still under their projections by depth: the deep ones (dep over 1) receptions -4.3% (held out -5.5%),
// rush+rec yards -5.9% (-8.9%), receiving yards -11.4% (-14.2%); the short ones -4.2% (+2.5%), -5.6% (-1.8%),
// -5.3% (-1.7%); the backs -7.3% (-7.7%), -2.4% (-2.0%), -15.9% (-18.2%). The flagged rows over their
// projections are the unlisted ones (a benching: live never flags them), so the under stays the safe side)
// (Re-checked 2026-10-14 with the history's flag from the injury reports (nflListed, below: the game's Out and
// Doubtful, its team's reserve list for one not in the game; matchups.mjs nflMatchups' listed), the flag live
// play reads, in place of the logs' (half its rows benchings). The flagged rows 2122 to 1047 held out. Against
// the committed model the listed rows still ran under held out (receiving yards -3.4%, the eligible's -7.5%;
// receptions +0.8%, -0.2%; rush+rec yards -1.7%, -1.0%), the logs-only ones over (+4.1%, +4.7%). Kept on rush+rec
// yards (-0.075: held out 0.6527 to 0.6512 with qbDeep refit on the same flag; its rows +1.70 to -0.12, the
// eligible's +2.26 to -0.43; cuts [0.4, 0.8] (the last 20% held out) -0.1 kept, +0.0008; cuts [0.2, 0.55]
// (the last 45% held out) +0.0004 with its eligible rows overshot); receiving yards +0.0011 (+0.0014, +0.0006 on the other
// stretches) but -0.2 overshoots its rows every time (+0.90 to -2.33): left out; receptions, rushing yards and
// carries no gain. Rush+rec yards' keep then failed a second re-check on held-out windows apart from those: the
// 2024 season alone (fit 2018-2023) +0.0008 at -0.1 but its rows overshot (+0.64 to -1.79), the 2022 and 2023
// seasons (fit 2017-2021) -0.0002 (its rows already at par, +0.03): kept on 2 of 5 windows, the two sharing most
// of their held-out games, so taken off rush+rec yards' ctx (RUSH_REC) as not a steady effect)
// (his team in its first COACH_GAMES games under a new head coach (newCoach, football.mjs: the schedule's
// coaches, a hire or an interim), on every stat: kept only where the held-out games are better by
// project.mjs MIN_GAIN with the bias no worse, a 0-or-1 flag on a few hundred team-games)
// (his side's margin by the betting lines (mSpread: the game's spread, per 10 points, a favorite's over 0; 0
// without the lines): the game flow the market sees, a favorite protecting a lead and an underdog forcing
// throws. A late flag (project.mjs MIN_GAIN) on the whole stat's gate. The history's lines are nflverse's
// closing ones (nflMarket, below: a mild look-ahead; the live one is the book's when the bet goes out, days or
// hours before the close by the bet's window, leagues.mjs TIMING, so it may not have the late news yet: a
// starter ruled out. At -0.1 per 10 points, about 1% a 3-point move). Live, the spread alone (row.mktSpread,
// run.mjs), the total not needed; no spread at all where the fit kept it, a CHECK, not a pick'em's projection.
// Judged on each sign's rows' bias too (project.mjs SIGNED: the favorites' and the underdogs').
// Measured 2026-10-12 (audit #4) on every passing, carrying and receiving stat: kept on interceptions alone
// (-0.1: a 7-point favorite's 7% fewer; held out +0.0011, 0.5521 to 0.551, the bias 0.0068 to 0.006); left
// out on the bias (passing TDs 0.05 +0.0009, receiving yards 0.05 +0.0005, rush+rec yards 0.05 +0.001: each
// one's bias larger) or the gain (attempts -0.0007, completions -0.0002, receptions 0), not taken on passing
// yards, rushing yards and carries. On interceptions' ctx alone (CTX.mSpread kept for a measure on demand))
const PASSING = ['wind', 'cold', 'precip', 'newCoach'];
// (round D, 2026-10-17, the owner's backlog (memory desk-backlog), each a late flag on its own rows, soft where the
// hard gate leaves it out (project.mjs SUBGROUP, softable), measured on the day's history and kept only on held-out
// evidence. The lead back out on his quarterback's volume (CTX rbOutPass, 0 to 1 on the quarterback's rows; the owner's
// Hurts under 31.5 attempts with the Eagles' back out): not taken on the fit window on passing yards or attempts;
// on completions 0.025, -0.0001 held out with its 157 rows' bias 0.72 to 1.17 over: off every stat's ctx, kept for
// later work. The starters' weeks 5-8 (CTX midSeason): not taken on the fit window on receiving yards or receptions:
// off their ctx as before. A backup quarterback's own rushing (CTX backupRun, matchups.mjs qbBackup): below, RUSHING)
const INT_CTX = [...PASSING, 'mSpread'];
// (a regular above him at his position out tonight (aheadOut, matchups.mjs: one with more recent healthy work
// than his, out, doubtful, on IR or off the roster; in the history not in the game's logs): the next man up's
// lift on top of rp and the vacated work, the injury-driven share change explicit (the owner's steer: playing
// time moves far more with an absence, his own or the one ahead of him, than organically). Measured 2026-10-12
// (eligible players 2021 on, before it): with one out his receiving yards ran 11.7% over the projection held
// out (n 677; without, 2.0%), receptions 9.4%, carries 20%, rushing yards 15%. A late flag on its own rows'
// gate (project.mjs SUBGROUP), tried after rp. Fit on every stat it was on (2026-10-12) it took the other way on
// the fit window (-0.05 to -0.1: the absences' rows there ran at their projections, 2021 and 2022 -6% to 0% on
// receiving yards, the lift a 2023-on one), held out worse on every stat (-0.0003 to -0.0009) and its own rows'
// bias larger: left out, and off every stat's ctx (its late search an hourly cost for nothing kept). CTX.aheadOut
// kept for a measure on demand (add it back to a ctx))
const CARRYING = ['backupQb', 'wind', 'precip', 'newCoach', 'qb1Out'];
// (the backup quarterback by the receiver's depth (qbDeep, audit #14: qb1Out times how far his air yards a
// target run over the league's, matchups.mjs dep, a wide receiver's or tight end's; a back's 0), on the receiving
// stats, a late flag on its own rows' gate (project.mjs MIN_GAIN, SUBGROUP), tried after the flat one. Measured
// 2026-10-12: with his team's lead quarterback out the deep ones (two in five of the flagged pass-catchers) ran
// under their projections held out (receptions 4.9%, rush+rec yards 7.3%, receiving yards 3.6%, every player's
// 913 rows; the eligible's 519 3.1%, 5.0%, 4.0%), the flagged rows as a whole about at them (the flat flag's
// failing). Kept on receptions (-0.15: held out 0.6165 to 0.6161, +0.0004; its rows -4.9% to -0.8%, the
// eligible's -3.1% to +1.1%) and rush+rec yards (-0.3: 0.6544 to 0.654, +0.0005; -7.3% to +1.5%, the
// eligible's -5.0% to +4.1%); left out on receiving yards (-0.4, +0.0005, its rows put 8% over: its own bias),
// and off its ctx (its late search an hourly cost for nothing kept).
// Tried first and left out: the flag times his whole depth (every flagged pass-catcher lowered: +0.0004 to
// +0.0007, its rows put 4% to 9% over, the flat flag's way) and times his depth less the league's, signed (the
// short side 33 rows held out, not measured; the whole stat's bias larger). The kept form was so chosen with
// the held-out games in view, its gains just over the floor, and the whole stat's held-out bias larger with it
// (receptions -0.0508 to -0.0527, rush+rec yards -1.0936 to -1.1475: it lowers rows on stats already under
// their actuals; its own rows' gate is the one judged). Re-checked season by season (role-backtest.mjs --from
// 2016, against --set c_qbDeep=0, eligible players, 2026-10-13): log loss a game better in every season 2016 to
// 2025 on rush+rec yards (+0.0001 to +0.0017; 2016-2018, before the fit window, the form's choice never saw
// them: +0.001 to +0.0016) and in 9 of 10 on receptions (2016-2018 +0.0004 to +0.0007; 2019 -0.0002, 2021 0);
// 2026 so far worse (its 28 deep rows 24% over the projection without it, 29% with). Fit on the logs' flag
// (qb1Out: the starter not in the game's logs, a benching or an unlisted inactive too), while live it reads
// the injury report alone: by the reports (the role backtest's qb1Out table, eligible 2016 on), the listed
// absences' deep ones still run under with it (receptions -7.4% to -3.4%, held out -9.2% to -5.1%; rush+rec
// yards -13.3% to -5.3%, held out -16.7% to -8.7%), the unlisted ones' put over (held out +0.8%, +10.9%): a
// blend that under-sizes the listed absence, the conservative way for the unders, till the history reads the
// injury reports (the backlog))
// (Refit 2026-10-14 on the reports' flag (nflListed): receptions -0.2 (+0.0004; the other stretches +0.0005
// each, [0.2, 0.55] kept at -0.3, [0.4, 0.8] its rows just overshot), rush+rec yards -0.3 (+0.0004). On
// receiving yards' ctx again it took -0.4, +0.0008, but +0.0005 overshooting its rows on [0.4, 0.8] and +0.0003
// on [0.2, 0.55]: not steady past the floor, kept off it)
const CATCHING = [...CARRYING, 'qbDeep'];
// (carries: the carrying flags and a backup quarterback's own rushing (backupRun, round D): on carries +0.1 (his 300
// rows' bias -0.34 to -0.01 carries a game: the backups ran MORE than projected, not less as the CHECK had it), held out
// +0.0003 but under the floor unrounded, soft z 1.11 with a half lost: weight 0 for now, judged again each fit as the
// season's backups come in. On rushing yards +0.1 -0.0001 (its rows -2.8 to -1.4 yards): off that ctx)
const RUSHING = [...CARRYING, 'backupRun'];
// (rush+rec yards' own: qb1Out off (re-checked 2026-10-15, above: its keep not steady across held-out windows),
// qbDeep on)
const RUSH_REC = CATCHING.filter((k) => k !== 'qb1Out');
// (the team's lead back out (rb1Out, matchups.mjs leadBack; a back's own 0, his group's work the vacated
// term's) measured and left off every stat (2026-10-12). Receptions fit +0.025 (2.5% more catches) but held out
// only +0.0001, the rounding's floor (0.6168 to 0.6167), with the bias worse (eligible -0.051 to -0.054, all
// players' -0.014 to -0.016) and receiving yards fit the other way (-0.025) on the same flag: noise, not an
// effect, and enough to tip a thin over into a bet. Receiving yards: held-out gain +0.0009 but the stat's
// held-out log loss 0.6501 to 0.6502, the games with him out +6.7% to +9.4% over projected. The passing volume:
// attempts and completions took 0 on the fit window, passing yards a size left out held out (-0.0006); the lead
// back out, his team's passes ran as projected (held out -1.6% against -1.9% with him in), team-games 2012 on as
// their season's own (a bell cow's out, 1% to 3% fewer: the work goes to the next back, not the pass). Not read
// where he's been out since before the season (leadBack: a back who's played for the team this season), so
// this doesn't cover a bell cow lost before the opener. The flag stays on the rows for later work; adding it
// back takes a held-out gain well over the floor (0.0003 or more) with the bias no worse)
// (the NBA's back-to-backs (audit #6), late flags each on its own rows' gate (project.mjs MIN_GAIN, SUBGROUP): a
// bench player's own (b2bB) in place of one size for every player (b2b, searched with the rest: CTX b2bS says
// why). Measured 2026-10-12: b2bB kept on points (0.1: held out +0.0007, its own 663 rows 6.3% over their
// projections to 3.4% under, the eligible's 368 19.4% to 8.5% over) and threes (0.07: +0.0005, 10.6% to 3.5%);
// left out on rebounds (-0.0002), assists (-0.0001) and pts+reb+ast (0.05, +0.0002 under the floor, its own
// rows' bias larger). The starters' own (b2bS) was kept on none (pts+reb+ast 0.03 +0.0002, assists +0.0001, the
// rest 0 or less), nor the other side's (oppB2b: rebounds and threes +0.0001 to +0.0002, under the floor): both
// off the ctx (their late search an hourly cost for nothing kept; CTX keeps them for a measure on demand). The
// old b2b out of the search moved its other settings: held out points 0.6535 to 0.6521 (roleK 32 taken),
// assists 0.6197 to 0.6176 (blowout 0.07), threes 0.5647 to 0.5642, rebounds 0.6338 as before, pts+reb+ast
// 0.6489 to 0.6505 (the opponent's power a 0 and the script b 0.5 on the fit window, the committed state's 0.5
// and 0). Searched with the rest instead (the old b2b's way, no floor or rows' gate), b2bS and b2bB both taken
// on points, assists and pts+reb+ast (held out 0.6516, 0.6178, 0.6488): not the late flags' standard, so not
// used)
// (pts+reb+ast keeps the old one size in the search (b2bAll, the old b2b's place in the order): taking it out
// cost that stat's held-out games (0.6489 to 0.6505) with nothing gating its removal, and b2bB isn't kept there.
// A kept term comes out only on the same standard it went in on. Refit 2026-10-12, b2bB by the role known
// before the game (CTX b2bB; the figures above are by the box score's role): pts+reb+ast c_b2bAll 0.07 as
// before, held out 0.6489 again; points b2bB 0.07 (+0.0007, held out 0.6521, its own 738 rows 6.6% over their
// projections to 0%, the eligible's 451 15.4% to 8%); threes now left out (+0.0007 but the eligible rest's bias
// larger: held out 0.5647, the old b2b's); rebounds, assists as before)
// (the NBA's minutes first (audit #3): his per-minute rate times the minutes he's expected tonight (project.mjs's
// snaps-based base with a full game's 48 minutes for the snaps: matchups.mjs nbaMatchups share, his minutes over
// 48), his season's typical minutes leaning to his last three games' by sr; a late term on the whole stat's
// gate (sn with sr: project.mjs MIN_GAIN, WHOLE_TOL), kept on all five (2026-10-13: held out +0.0035 to +0.0073,
// project.mjs's header). The factors below multiply the product, so they act on the minutes. The betting lines'
// blowout by his role (CTX blowS a starter's, blowB a bench player's) and a bench player who started his last
// game (CTX newStart), late flags each on its own rows' gate, were measured on top of it and kept on none: off
// the ctx (their late search an hourly cost for nothing kept), CTX keeping them for a measure on demand. A
// minutes jump with teammates back is a role CHECK on the over (minutesBackOf, the review of 2026-10-13); the
// work missing's size fit again on the base (project.mjs vcM) left out on every stat)
const NBA_MINUTES = { minutes: 48 };
// (the NHL's ice time first (audit #13; project.mjs's minutes base, a full game's 60): a skater's per-minute rate
// times the time on ice he's expected tonight (his season's typical, leaning to his last three by sr), on the
// whole stat's gate with WHOLE_TOL's tolerance as the NBA's. Measured 2026-10-13 (2025-26 and 2026-27's first
// games, held out the last 30%): kept on shots (sn 0.5/sr 0.5, held out +0.0009); points not taken on the fit
// window, so its mark is off points (its search ten replays an hourly run for nothing). On shots the work missing
// tonight was searched and not taken (vc 0) and the back-to-back isn't in its ctx, so nothing sits on the base
// for a teammate's return: a jump in his ice time is a role CHECK on the over (iceJumpOf, the review of 2026-10-13))
const NHL_MINUTES = { minutes: 60 };
// (the NBA's positions and pace (audit #10; project.mjs ps, po, late terms on the whole stat's gate after the
// minutes base): ESPN's position (G, F, C; a PG or SG a guard, an SF or PF a forward, one unknown a forward) for
// the opponent's table, the priors and, ps 2, the role's table, each one pool before (posGroup 'all', still the
// one where ps is left out); and the other side's possessions a game over the league's, or the game's expected
// over its average in his games, or the other side's over its average in his games (matchups.mjs nbaMatchups
// pace, paceG; project.mjs pg). The eligible pool (each team's top few by usage) and the work missing stay the
// whole team's. Measured 2026-10-13 (its review: the tables learned past the pace, his own team's pace counted
// once): the pace kept on points, threes and pts+reb+ast (pg 2; held out +0.001, +0.0005, +0.0007), the positions
// on none (off the search: project.mjs TRY_PS))
export const nbaPos = (pos) => (/^(PG|SG|G)$/.test(pos ?? '') ? 'G' : pos === 'C' ? 'C' : 'F');
const NBA_POS_PACE = { positions: nbaPos, pace: true };
// (the defense tables' recency (audit #15; project.mjs od, a late term on the whole stat's strict gate): searched
// only on a stat marked recency, the one it was kept on. Measured 2026-10-13 on every NFL, NBA and NHL stat (held
// out the last 30%): kept on NBA rebounds (od 0.05, held out 0.6267 to 0.6263, +0.0004; the eligible players'
// bias 0.0268 to 0.0138, every player's 0.1533 to 0.1419). Left out on NBA points (0.05, +0.0009), threes
// (0.05, +0.0003) and pts+reb+ast (0.1, +0.0012), every player's bias larger on each (points 0.0598 to 0.1183,
// pts+reb+ast 0.3643 to 0.3961: the lean refit on the eligible players lifts the rest, already over-projected),
// assists (+0); NHL shots (0.1 with the opponent's power a 0.5 where it was 0: +0.0002, the bias larger), points
// and every NFL stat not taken on the fit window. The mark back on a stat to try it again. Rebounds' gain is a hair
// over the floor (DRAFT_GAIN 0.0003) and picked from about 20 stats tried, so the hourly fit dropping it (od 0)
// is to be expected, not a fault. Re-checked 2026-10-14 on other stretches (the same gate, held out elsewhere): it
// didn't hold. Held out the last 45% (fit 20-55%): od 0.2 with a 0.5, +0.0003, the eligible players' bias -0.0074
// to -0.0231 (left out); the last 20% (fit 40-80%): not taken on the fit window; the middle (fit 15-45%, held out
// 45-70%): 0.1, -0.0001. A one-stretch pick from many, so the mark's off rebounds too (on no stat now; held out the
// last 30% without it 0.6267, with it 0.6263). Points' +0.0009 (0.05) reproduced, left out on every player's bias
// (0.0598 to 0.1183), threes' +0.0003 the same (0.0105 to 0.0115), assists +0)
const RECENCY = { recency: true };
// (the early exit searched (project.mjs ex, a late term on the whole stat's gate, the low lines' log loss no worse too):
// the stats whose rows read his share of the work (the NFL's snaps, the NBA's minutes). Not the NHL's skaters: their
// short games (time on ice under half his typical) 0.3% to 0.7%, shots and points measured 2026-10-13 with no held-out
// gain (shots ex 1 +0, points not taken), off the search; MLB reads no share yet. Marked only where it was kept
// (2026-10-13, measured again after the review of 6c51e015 with its high rows' point: NFL receiving yards alone;
// project.mjs EXIT_FRAC's notes): left out on interceptions (its high rows too few), rushing yards (their log loss
// worse), rush+rec yards (their over said further from what happened), receptions, carries, the other passing
// stats and the NBA's, its search off them. The marks read the held-out window (the same last 30% the hourly gate
// judges on), so a kept stat's held-out gain isn't clean, as RECENCY's: NBA points' +0.0003, at the DRAFT_GAIN
// floor, picked from about 17 stats, its own 38 low lines worse (0.4006 to 0.4049), taken off as noise)
const EXIT = { exit: true };
// (the other side's key defenders out tonight (audit #15; CTX oppOut, oppD, oppDB, oppFront: late terms, the
// NBA's on the whole stat's strict gate (a centred value on every row), the rest on the rows with one out
// (project.mjs SUBGROUP)), measured 2026-10-13 and on no stat's ctx (their late search an hourly cost for nothing
// kept; CTX keeps them for a measure on demand). The NBA's production missing on the other side (oppOut, about its
// average): points 0.005 +0.0006, assists +0.0005, threes +0.0005, pts+reb+ast +0.0007, each left out on every
// player's bias (points 0.0595 to 0.0774; assists' eligible too), rebounds not taken; held out, the eligible
// players' points ran -1.3% (none out on the other side) to +6.0% (6 or more per 10) actual over projected without
// it. The NHL's top-four defensemen out (oppD, their time on ice over 60): shots not taken, points -0.1 -0.0001;
// held out shots +3.5% against -3.0% (one out, n 855; counted only in his first game out, +8.5%, n 431, though the
// fit window's +2.2%). The NFL's starting secondary (oppDB) and front seven (oppFront) out, from the snap counts:
// passing TDs oppDB 0.03 +0.0005 (its own 728 rows 7.0% to 5.1% over their projections, the eligible rest's bias
// larger), carries oppFront +0.0001 (its eligible rows 8.9% to 6.7% over), interceptions, rush+rec yards under the
// floor, passing yards, attempts, completions, rushing and receiving yards and receptions not taken: the games with
// one out run over, a few percent, too few and too noisy to clear the floor with the lean held. Measured again
// after the review (matchups.mjs defenseOut counting only who the live side can see: a defender who's played for
// the team this season, on no other team since, with an ESPN id; each in his first OUT_MAX games out, not his
// fourth): passing TDs oppDB 0.06 +0.0006 (its own rows 638, 6.7% to 2.8% over projected) left out on the rest's
// and the eligible rest's bias, oppFront +0.0001; interceptions +0.0001 each; carries oppFront +0.0002 (n 1432);
// the NHL's oppD on shots not taken, points -0.0001 (n 1900): none taken, as before)
const NBA_CTX = ['usage', 'blowout', 'b2bB'];
// (points without b2bB: kept at 0.05 by a hair (+0.0005, held out the last 30%), re-checked 2026-10-14 on other
// windows: held out the last 20% +0.0002 (the floor not met), fit 20-55% the size picked the other way (-0.07,
// -0.001). Noise at the floor, as the early exit's points; raw, a bench player's minutes on the second night ran
// 5% to 7% over expected on both windows, but his points' miss after the term moved from window to window)
const PTS_CTX = ['usage', 'blowout'];
const PRA_CTX = ['usage', 'b2bAll', 'blowout'];
// (the NHL's back-to-backs (audit #6): his side's (b2b) and the other side's (oppB2b), late flags each on its own
// rows' gate (project.mjs MIN_GAIN, SUBGROUP). Before them (2026-10-12; the eligible players, actual over
// projected, against the rows with neither side on one): his own, shots -3.6% on the fit window (+0.1%
// neither), points -4% (+0.6%), held out points -16.1% (-4.5%); the other side's, shots +3.9% (+0.1%), held out
// +11.7% (-3.2%); a goalie's saves on his own side's +3.8% (n 153), held out +9.8% (n 71). Fit: saves kept b2b
// (0.03: held out 0.634 to 0.6335, +0.0007; its own 113 rows 5.8% over their projections to 3.2%), the second
// night most often the backup's start with a tired team in front of him; the other side's left out on the rest's
// bias (+0.0008). The skaters' too small on the fit window: shots b2b -0.03 +0.0002 (the rest's bias larger),
// oppB2b 0.03 0; points b2b -0.03 0, oppB2b not taken. Off the skaters' ctx and saves' oppB2b (nothing kept;
// CTX keeps them). A saves prop is priced only for the probable goalie named (outOf), so a back-to-back's start
// is never assumed for one; the game model's goalie (context.mjs) assumes the backup on a back-to-back with none
// named. Travel (context.mjs miles since his last game, alone or on a back-to-back) showed no steady sign
// between the windows: not a term)
const SAVES_CTX = ['oppShots', 'b2b'];
// (the NBA's and NHL's work missing in two measures (matchups.mjs: minutes or usage; time on ice or power-play
// time), three splits each; the NBA's learned split of each after them (vacLearned: matchups.mjs teamWork absorb,
// by position and starter or bench; project.mjs vl, late on its own rows' gate; off the search: TRY_VL))
const NHL_VAC = { vacated: true, vacSplits: 6 };
// (the NHL skaters' late terms (audit #13; project.mjs MIN_GAIN, each on the whole stat's gate with WHOLE_TOL's
// tolerance: a factor on every skater, the lean refit with it): his power-play time's lean (ppLean: his recent
// share of his team's power play over his season's, matchups.mjs), his side's expected shots on goal tonight over the
// league's (teamShots: hockey.mjs's, his side's shots a game against the other's allowed; the saves' oppShots the
// other way round) and the betting total (mTotal: the finals' closes, playerlogs.mjs boxTotals; live the book's).
// Measured 2026-10-13 (held out the last 30%), each on the stat as fit before it: shots ppLean 0.1 (+0.0004,
// kept; from his power-play minutes, before the review, 0.05 +0.0003), teamShots 0 (0.5 no better held out),
// mTotal not taken; points teamShots 0.25 (+0.0005, kept), ppLean and mTotal not taken. The eligible held-out rows, actual over projected without the new terms and with them (all:
// shots -2.0% to -2.3%, points -5.3% to -5.3%): shots after an ice-time jump (his last three over 1.2 times his
// season's, n 390) +4.4% to -5.3%; his power-play time down (ppLean -0.3 or less, n 916) -4.5% to -0.9%, up (0.3
// or more, n 912) +3.9% to -1.9%; points with his side's expected shots low (teamShots -0.08 or less, n 1438)
// -15.5% to -12.8%, high (0.08 or more, n 1045) +2.1% to -1.3% (the ice-time jump's overshoot: sr 0.5 the fit's
// choice on the log loss: a role CHECK on the over, iceJumpOf). Each stat's ctx holds only what it kept (a dead term's late search
// five to seven replays an hourly run): CTX keeps the rest for a measure on demand. The power play by the other
// side's penalties (pp) off shots too: not taken, before or after (its main search 14 replays a stat). Kept in
// points' search though never taken there: off it, the main search's path moved and points held out 0.5471
// against 0.5469 with it (review of 2026-10-13: the work missing taken, vc 0.25 +0.0003, on a start 0.0005
// worse), so its replays buy back 0.0002)
// (re-checked 2026-10-14, the round C re-check's lens; held out the last 30%, eligible players, actual over
// projected): points with his power-play share down (ppLean -0.3 or less, n 551) -17.3% against -5.2% in the
// middle, up (0.3 or more, n 662) +6.7%, the same sign on the fit window (-15.7%, +4.5%): the lean on points,
// 0.1 +0.0004 on the gate as it stands (bias 0.0354 to 0.0359, every player's 0.0723 to 0.0706), points held
// out 0.5529 to 0.5525, but LEFT OUT on the skeptic's other windows (2026-10-14): held out from 45% (warm-up
// to 45%, held out from 75%) 0 (0.2 tried); the regular season alone (to 2026-04-18, 30%/70%, playoffs and
// 2026-27 out) +0.0002 with the bias 0.0113 to 0.0122; Nov-Jan alone (to 2026-01-25, 30%/65%) 0. It clears the
// floor only on windows running to the end of the history (playoffs and the new season held out); on other splits (warm-up, held out from) 25%/60% 0.1 +0.0004, 35%/85% 0.2 +0.0011,
// 40%/80% 0.1 +0.0005, 20%/55% +0.0002 (under the floor). teamShots on the edge of every player's bias held
// strict (its gain +0.0004 to +0.0013 on every split, the bias rising 0.0001 to 0.0003 on all but 20%/55%): left
// out at 0.0723 to 0.0724, kept two finals later (0.25 +0.0006, points held out 0.5514); the review's rule
// (project.mjs, the minutes' fix (4)) kept, so the hourly refit decides it run by run. Left out still: the power-play share (ppShare 0.25 after the
// lean +0.0001, bias larger), the minutes base on points (sn not taken), a rest edge (the other side on a
// back-to-back less his own: shots 0.03 +0.0002, points 0; raw held out, shots +11.5% / -4.4% against -3.0%
// with neither), the other side's top-four out (oppD: held out shots +5.6% against -3.0%, on the fit window
// +0.8% against -0.1%, so no size is picked there), the team allocation on shots (tr 0.25 +0.0006 on the
// tolerance, the 20-55% split's bias past it, 40-80% 0) and on points (-0.0002)
const NHL_SOG_CTX = ['ppLean'];
const NHL_PTS_CTX = ['pp', 'oppGoalie', 'teamShots'];
// (the NBA's other side's production missing a game, per 10, about its average (2025-26: 3.3; props.mjs CTX
// oppOut is centred on it, so a size moves the games with more of it out up and the ones with fewer down, the
// level the lean's))
const OPP_OUT_AVG = 3.3;
// (a typical NHL game's betting total, the market total's even point)
const MTOTAL_AVG = 6;
const NBA_VAC = { ...NHL_VAC, vacLearned: [6, 7] };
// (the NFL's work missing (the backs' and pass-catchers'): three even splits in the search (vs 0 to 2), and the
// split learned from the history (matchups.mjs absorbTable: who absorbs it, by position and place in its order,
// across positions too, some of it lost) at index 3, tried late on its own rows' gate (project.mjs vl; measured
// 2026-10-13, worse than the even split on every stat, off the search: TRY_VL))
const NFL_VAC = { vacated: true, vacLearned: [3] };
// (whether a stat's vs is a learned split's index (vacLearned); the split in proportion (0) in its place where
// his position's work alone is wanted (the role guard's vacOut))
export const learnedVs = (stat, vs) => (stat?.vacLearned ?? []).includes(vs);
export const plainVs = (stat, vs) => (learnedVs(stat, vs) ? 0 : (vs ?? 0));
// (the NHL skaters' power-play share (ppShare: his share of his team's power play against his position's prop
// players', matchups.mjs) measured 2026-10-12 as a late term (project.mjs MIN_GAIN, floor 0.0001): shots not
// taken on the fit window, points 0.25 taken there and held out -0.0001, left out; searched with the rest it
// moved the vacated and goalie terms and the stat's held-out log loss went 0.5467 to 0.5470. Taken off both
// stats' ctx (review of 94fddea5): its late search ran every hour for nothing kept, the NHL's props fit 88s to
// about 118s; CTX.ppShare and matchups.mjs's share kept for a measure on demand (add it back to a ctx). Also
// tried then: a
// skater's own longer run pulled toward the position's by 5 to 40 games, for a second-pair defenseman's points
// (David Jiricek, 2026-10-11: projected 0.05 a game, the under 0.5 at 95% against the book's 65%, -233): not
// taken on the fit window, whose eligible players (each team's top six forwards and top two defensemen) are the
// ones with long runs of their own. So a low-usage defenseman's points can't be learned by this fit at all, and
// his far line rests on the gap guard's CHECK alone (fail safe: not bet); a backlog item, a prior for the
// players under the eligible pool)
// (an MLB batter's start: his place in the game's lineup (matchups.mjs mlbMatchups: start), DraftKings' book
// only posts a starter's, and a pinch hitter's one trip would drag a starter's rate down; a game without its
// lineup, two plate appearances or more)
const BATTED = (r) => r.pos === 'B' && (r.start === true || ((r.start === null || r.start === undefined) && r.s.pa >= 2));
const BATTER_CTX = ['slot', 'platoon', 'oppSp'];
// (the NFL's role-aware base (project.mjs, each fit and kept only where the held-out games are better with it):
// a starting quarterback's numbers from his starts alone (starts, his rows' qbStart: the team's passer), a back's
// or pass-catcher's a full game's snaps times the share he's expected tonight (snaps), and the prior's weight
// shrinking through the season (early); and the draft's prior for a player in his first two seasons (draft: his
// slot's rookies against the position's prior, project.mjs dp)); and the seasons' carryover on the backs' and
// pass-catchers' stats (carry: project.mjs pl searched, sk and rx by --set; late terms each kept only where the
// held-out games are better and the bias no larger)
const ROLE_BASE_QB = { starts: true, early: true, draft: true };
const ROLE_BASE = { snaps: true, early: true, draft: true, carry: true };
// (the NFL's opponent by position group: the defense's power fit for each group on its own (project.mjs
// a_<group>, kept only where the held-out games are better with it), a tight end against a defense that gives
// tight ends yards weighed apart from a wide receiver; and receiving yards' volume-based base (perTarget: his
// expected targets tonight times what he makes of one, project.mjs vol). Not receptions': fit there (vol 0.25,
// yk 200, held out +0.0018 on the same games that chose it), it ran the established starters' weeks 5-8 further
// under (held out +5.6% before it to +8.2% actual over projected, role-backtest.mjs on 2026-10-12) and the
// eligible players' bias further low (-0.029 to -0.066 a game): the bucket it was meant to shrink)
const CATCH_OPP = { oppPos: ['WR', 'TE', 'RB'] };
const RUSH_OPP = { oppPos: ['RB', 'QB'] };
const PER_TARGET = { perTarget: true };
// (the pull toward the middle searched (project.mjs sl, a late term on the whole stat's gate): only on the stats
// it was kept on (2026-10-12: NFL passing TDs, MLB hits), as its search and gate cost a replay to three on every
// stat each hourly run; left out on passing yards, interceptions, receptions, receiving and rush+rec yards, NBA
// points and threes, MLB outs and total bases, nothing kept on the NHL's. The mark back on a stat to try it again)
const MIDDLE = { middle: true };
// (the start-of-season prior searched (project.mjs sp, audit #11: a veteran's prior by his position, age and new team,
// learned; a late term judged on his first 4 games of a season, held out): searched only on the stats it was kept on.
// Measured 2026-10-13 (held out the last 30%: the 2024, 2025 and 2026 openers), its early games' log loss at their
// lines (the median of his last 16) without it to with it: rushing yards sp 1 (0.6538 to 0.6522, +0.0016; their
// actual over projected -5.5% to -3.3%, n 1259), receiving yards 0.5 (0.6612 to 0.6573, +0.0039; -2.4% to -2.2%,
// n 1617), rush+rec yards 1 (0.6573 to 0.6492, +0.0081; -3.5% to -2.5%, n 2154), the whole stat's no worse on each.
// Left out: passing yards (-0.0003), attempts (+0.0021) and completions (+0.0015) each with the whole stat's log loss
// worse, passing TDs and interceptions not taken on the fit window, carries (+0.0021: the whole stat's worse, its own
// eligible rows' bias larger), receptions (+0.0044: its own rows' bias larger, they ran over). The NBA's marked: its
// history one season, no prior of his own on any row, so not searched (project.mjs spHeld, spFit) till one season's
// openers are in its fit window (its size picked there) and the next's held out: 2026-27's go to the held-out window
// first, so 2027-28 at the soonest. The mark back on a stat to try it again)
const START = { start: true };
// (expected plays tonight (audit #19b; project.mjs ep, eg, a late term on the whole stat's gate, in place of the
// defense's pace pc): his team's expected plays (its own plays a game times the other side's pace, or the game's
// expected total times its share of it: the time of possession's measure) over their average in his games, or
// over his team's actual plays in them (matchups.mjs playsX, playsS, playsA). Marked only where it was kept:
// measured 2026-10-13 on the eight volume stats (passing yards, attempts, completions, rushing yards, carries,
// receiving yards, receptions, rush+rec yards), kept on passing attempts alone (ep 0.5, eg 3: the game's total
// times his team's share; held out 0.6219 to 0.6208, +0.0011, in place of pc 0.5; the eligible players' bias 0.4952
// to 0.4694 attempts a game, every player's 0.7758 to 0.7468). Left out: passing yards (0.5/3, -0.0008), completions
// (1/3, -0.0022), rushing yards (0.5/2, +0.0003, both biases larger: -0.5578 to -0.6345, every player's -0.9654 to
// -1.0309), receiving yards (0.5/3, -0.0002), rush+rec yards (0.5/2, 0), carries and receptions not taken on the fit
// window. Their search (about 65s a run, 3.6s to 26.5s a stat) off; the mark back on a stat to try it again.
// The mark and the forms searched were picked on the held-out window (the best of eight stats' tries), so its
// gain there isn't wholly an independent check: the gate judges it again on every hourly refit, and the mark
// comes off should ep be left out or its gain fall under the floor (selfcheck watches ep dropped))
const PLAYS = { plays: true };
// (the team's game first, then its players' (audit #19c; project.mjs tr, tf, a late term on the whole stat's
// gate): each player's projection shrunk toward his share of his team's expected total of the stat (its projected
// players' a game, by the other side's allowed, by the lines' implied points), the team's players summed against
// it. Only on the stats a team splits among several players (a quarterback's passing is his team's alone, nothing
// to allocate, a goalie's and a pitcher's too). Measured 2026-10-14 with a starter back from an absence in his
// teammates' sum and the team's own total as a form (tf 4) (held out log loss, the eligible players' bias): kept on
// NFL carries (tr 0.25/tf 4, 0.6305 to 0.6295, +0.001; -0.0681 to -0.051, every player's -0.2007 to -0.1851) and NBA
// assists (0.25/4, 0.6108 to 0.608, +0.0028; 0.0396 to 0.0379, every player's 0.132 to 0.1279). Left out: NFL
// rushing yards on the gain (0.25/4 taken on the fit window, held out -0.0002; 2026-10-13, 0.1/1 kept at +0.0005,
// before tf 4 was searched), NBA points on the bias (0.25/2, +0.005; every player's 0.0595 to 0.0707), rebounds
// (+0.0033; 0.0138 to 0.0219), threes (0.25/3, +0.0024; every player's 0.0105 to 0.0116), pts+reb+ast (+0.0052;
// every player's 0.3643 to 0.3857), NHL shots (0.25/1, +0.0006; 0.0399 to 0.0442): marked still (2.5s to 5s a
// stat), the gate judging them again each refit; NFL receiving yards (0.25/3, +0.0025; -0.7693
// to -1.2745), receptions (0.25/2, +0.001; -0.053 to -0.0748) and rush+rec yards (0.1/3, +0.001; -1.2037 to -1.4028)
// and NHL points (0.1/1, -0.0002): unmarked, their search off (the NFL's three about 15s a run); the mark back on a
// stat to try it again. Re-checked 2026-10-15: the NBA four kept on a gate that reads every player's bias in its
// two parts (NBA_TEAM, below); rush+rec yards kept in a mean-preserving form (TEAM_NORM, below))
const TEAM = { team: true };
// (the team allocation mean-preserving (project.mjs TR_NORM, trn): its factor over the running mean of the ones
// before the day, so the lines' implied points and the team's expected total move the receivers' projections
// between players and games without moving the stat's level. The re-check of the market's terms (2026-10-14): the
// market's team total over the game model's, past the live projection, held out, receiving yards -5.0% (the lines
// 8% or more under the model) to +7.1% (8% or more over), rush+rec yards -2.1% to +6.0%; the plain allocation's
// gain there (receiving yards +0.0025 on 2026-10-13) was left out on the bias, its mean moving the held-out level.
// Mean-preserving, on the same gate (held out the last 30%): kept on receiving yards (tr 0.25/tf 3, +0.0016; the
// eligible players' bias -0.7389 to -0.6186, every player's -0.1574 to -0.0928; since left out, below) and rush+rec yards (0.1/3,
// +0.0012; -1.0954 to -1.0473, every player's -0.7296 to -0.699); left out on receptions (0.25/2, +0.0009, every
// player's bias 0.035 to 0.0413), unmarked. The full dry run (2026-10-15): receiving yards +0.0032 (0.25/3, bias
// -0.7693 to -0.6443), rush+rec yards +0.0012 (0.1/3, -1.2037 to -1.1554). Other stretches: held out the last 20%
// (cuts 0.4/0.8) kept on both (+0.0018, +0.0014); held out the middle (0.45-0.7) receiving yards +0.0004 (every
// player's bias -0.0368 to -0.1199) and rush+rec yards +0.0001, under the floor there. The skeptic's re-check
// (2026-10-15, the same gate): receiving yards' gain one season's, 2025's (held out the last 30%, by season: 2023
// -0.0002, 2024 +0.0006, 2025 +0.0041, 2026 -0.0031); held out the 2024 season alone -0.0004, the 2025 season
// alone +0.0037 with both biases larger (0.644 to 0.6554, every player's 0.2391 to 0.251), 55-80% +0.0002: left
// out, unmarked. Rush+rec yards' gain every season of the last 30% (2023 +0.0003, 2024 +0.0009, 2025 +0.0021, 2026
// +0.0007); held out the 2024 season alone kept (+0.001, -1.7909 to -1.682, every player's -0.923 to -0.8497), the
// 2025 season alone +0.0022 (every player's bias 0.1967 to 0.1974), 55-80% -0.0001: kept, the hourly refit's gate
// judging it each run)
const TEAM_NORM = { team: true, trNorm: true };
// (the NBA's: its gate (project.mjs fitStat, tr on a stat marked teamWhole) a factor on every row's, as the minutes
// base's and the pace's (WHOLE_TOL: the eligible players' bias within SUBGROUP_TOL of the budget's), and every
// player's bias read in its two parts, the eligible players' and the rest's (the rest's no larger), not pooled.
// Re-checked 2026-10-14 (2025-26, held out March to the Finals): the held-out eligible players ran under their
// projections (points -0.2658 a game) and the rest over (+0.9938), so the pooled bias (+0.0595) was each part's
// cancelling the other's; tr 0.25/2 shrank both (-0.2423, +0.9694) and the pooled one grew (0.0707) only as the
// eligible players' under stopped cancelling the rest's over. Points' raw read (eligible, held out, actual over
// projected without it): the team's own expected total over the players' sum (T0 / S) under 0.85 -13.8%, 0.93 to
// 0.97 -2.5%, 1.15 and over +8.8% (with it -6.6%, +1.7%, +4.0%); by month March +2.9% to +2.3%, April +3.0% to
// +2.2%, May -4.2% to -1.2%. Kept (dry run, held out the last 30%): points 0.6471 to 0.642 (+0.0051, b2bB off: PTS_CTX), rebounds
// 0.6263 to 0.623 (+0.0033; the eligible players' bias 0.0138 to 0.0219, inside the budget), threes 0.5608 to
// 0.5584 (+0.0024), pts+reb+ast 0.644 to 0.6388 (+0.0052); assists as before (+0.0028). On other windows (held
// out the last 20%; the fit 20-55%, held out 55-100%) the gain held on every stat (+0.0018 to +0.0082); on the
// second the rest's bias grew by about 1% on points, assists and threes (assists' tr the same, kept since round B))
// (opener: the season start's allocation and work missing read as usual, not as 1 and 0 (project.mjs OPEN_TR, OPEN_VAC, D50))
const NBA_TEAM = { ...TEAM, teamWhole: true, opener: true };
const PITCHER_CTX = ['leash', 'restSp', 'ump'];
// (audit round C, measured 2026-10-14 with every candidate on the stats it could move (held out the last 30%), each a
// late term on project.mjs's gate (ROUND_C): kept, the last regular-season game on NFL passing yards (lastGame
// -0.05: held out 0.6528 to 0.6521, +0.0007; its own 106 rows 17.6 to 8.3 yards projected over actual, the
// eligible's 91 14.0 to 4.2) and attempts (-0.05: 0.6208 to 0.6203, +0.0005; its rows 2.42 to 1.06), and the
// other side's lineup's strikeout rate on MLB strikeouts (lineupK 0.75: 0.6129 to 0.6042, +0.0087; bias 0.0327 to
// 0.0101). Left out: lastGame on completions (-0.1, worse, the rest's bias), rushing yards, carries, receiving and
// rush+rec yards (under the floor), receptions (not taken); lineupKd (+0.0002, bias larger), lineupOb (not taken
// on strikeouts or outs), lineupK on outs (not taken); parkH (0), parkTB (not taken), paX (+0.0002 hits and total
// bases), airTemp (+0.0001, +0.0002), windOutB (0, +0.0001), homeBat (-0.0001, 0; the home side's bias larger);
// the pull toward the middle (sl) on strikeouts (-0.0013) and total bases (0); olOut (not taken but carries:
// 0.02, -0.001), proe (not taken anywhere), rbLoad (rushing yards +0.0001, carries +0.0003 with the rest's bias
// larger, rush+rec yards -0.0003), rbPass (receptions and receiving yards -0.0001, rush+rec yards not taken).
// Each off the stats' ctx (CTX keeps them for a measure on demand): the props' fit 1349s to 913s for the NFL
// locally, 276s to 95s for MLB)
const RC_PASS = [...PASSING, 'lastGame'];
// (the red zone on passing TDs (the owner's ask, 2026-10-15: matchups.mjs nflRedZone, from the play-by-play's field
// position, football.mjs redZoneOf), measured with fitStat as fitProps runs it (held out the last 30%): rzPass (his
// team's red-zone dropbacks a game, trips times pass rate there, over the league's) was taken at -0.02 on the fit
// window (more red-zone passing, fewer TDs than his own rate says: the rate already holds the volume, and the
// volume's high ones regress) and lost held out (0.5912 to 0.5925, -0.0013; the favorites' and the underdogs'
// bias both larger: SIGNED); on earlier stretches it gained at -0.01 (held out to 2024-10-20: 0.5915 to 0.5898,
// +0.0017; to 2023-01-08: 0.5678 to 0.5657, +0.0021) but failed the underdogs' bias there (and every player's on
// the first): not kept, left on the stat's ctx so the gate judges it again each fit (soft if its gain comes back over
// 0 and the joint check holds). With the other side's defense averaged in (rzPassM): 0, +0.0013, +0.0015, the same
// fails. The mean-preserving form against the double count (rzGap: his team's passing TDs a game against what its
// red-zone passes make at the league's rate) cleared the floor on the main stretch at its smallest size (0.005:
// +0.0004, bias -0.0452 to -0.044) but not on the others (+0.0001; -0.0004 at 0.02): a floor-level keep that didn't
// hold, off the ctx. CTX keeps rzPassM and rzGap for a measure on demand)
const RZ_PASS = [...PASSING, 'rzPass'];
// (round D, 2026-10-17: the starter's home or away (homeBat: 1 at home, -1 away) on his strikeouts and outs. Home
// starters beat their projection by about 0.2 strikeouts and away ones fall short by the same (2026-10-14: +0.0013 on
// strikeouts, +0.0004 on outs, both sides' bias halved, the whole stat's larger: left out by the hard gate). Under
// the soft terms it would come in at a shrunk weight on that evidence where it holds; MLB is off-season, so it's fit on
// 2025's history (round D, 2026-10-17): strikeouts 0.02 +0.0013 held out, bias 0.0101 to 0.0114, soft z 1.66 but the
// first half of its lines -0.0007 against the second's +0.0032 (a half lost): weight 0; outs 0.01 +0.0004, z 0.58: 0.
// Left on their ctx (the MLB fit is seconds) to be judged again when spring's games come in)
const RC_K = [...PITCHER_CTX, 'lineupK', 'homeBat'];
const RC_OUTS = [...PITCHER_CTX, 'homeBat'];
// (the park and air re-checked, 2026-10-14 (the owner's doubt of round C): the round's park terms were sound in
// their data (Coors +13%, Petco -9%; the wind toward center from StatsAPI's report, so out and in by the park's
// own orientation; a closed roof none) but measured each alone against a projection that already carries part of
// them: the hitter's own rate (half his games at his home park) and the game script (the game model's own runs
// with the wind out and the thin air, Coors's altitude among it, at b 0.5). Raw, 2026's hitters at Coors 0.427
// total bases a plate appearance against 0.356 at neutral parks (+20%), under 55°F 0.306 against 0.381 at 85°F
// and up (2025-26); past the live model's projection, held out, Coors still +8% total bases, 85°F and up +4%,
// wind in -3%. A park against the parks his rate was made in (parkRel, matchups.mjs) and the three as one term
// (hitEnv: its weights 4% a 10°F and 4% a 10 mph out from the fit window alone) on the same gate: kept, hitEnv on
// total bases (0.025: held out 0.632 to 0.6317, +0.0003; bias -0.0198 to -0.012, every player's -0.0187 to
// -0.011; the warm-and-hitter-park side -0.0583 to -0.0275, the cold-and-pitcher-park side 0.0234 to 0.0006).
// Left out: hitEnv on hits (+0.0002), parkRel alone (hits +0.0001, total bases +0.0002), the round's own again
// (parkH 0 and +0.0002 with the bias larger, parkTB not taken, airTemp +0.0001 and +0.0002, windOutB 0 and
// +0.0001, homeBat -0.0001 and 0); on the starters, airTemp (0, the bias larger) and windOutB (not taken) on
// strikeouts and outs, homeBat on strikeouts (+0.0013) and outs (+0.0004) with both sides' bias halved but the
// whole stat's larger (0.0101 to 0.0114, 0.0355 to 0.0373): left out by the gate's rule, a candidate)
const RC_TB = [...BATTER_CTX, 'hitEnv'];
// (the feeds round, 2026-10-18 (the owner: "the bettor should ABSOLUTELY be knowing about any stats we have
// including NGS"; INPUTS.md has the whole inventory): every new input measured with fitStat as fitProps runs it
// (held out the last 30%), its candidates on each stat together, each a late term on the gate (project.mjs FEEDS).
// Kept: a passer's aggressiveness on attempts (aggr -0.015: held out 0.6236 to 0.6231, +0.0005; bias 0.4295 to
// 0.4115), a rusher's yards over expected on its good side on carries (ryoeP 0.06: +0.0017, 0.6312 to 0.6295; an
// efficient back's carries 11% over projected to 7%; its two-sided form ryoe +0.0018 but the poor backs' side
// overshot, -0.0082 to +0.038), a pass-catcher's yards after the catch over expected on receptions (yacoe: +0.0006,
// the whole stat's bias larger, so soft at 0.25 of 0.03). Left on the ctx for the gate to judge again: the NBA's
// zone edge (+0.0004, the bias larger) and threes allowed (+0.0003, the bias larger) on points. Left out (off the
// ctx, CTX keeps each for a measure on demand): cpoe (completions -0.0013, passing yards -0.0009, attempts +0.0001),
// ttt (completions +0.0008, the under side's bias larger; attempts -0.0012; yards not taken), aggr on completions
// (+0.0001) and yards (not taken), sep (receiving yards -0.0001, receptions -0.0001, rush+rec -0.0002), cush (0,
// +0.0001), yacoe on receiving yards (0) and rush+rec (-0.0001), ryoe on rushing yards (-0.0003) and rush+rec
// (-0.0007), ryoeP on rushing yards (not taken) and rush+rec (-0.0006), box8 (0, +0.0001), oppBox (not taken;
// rush+rec -0.0001); the NHL's rink zones on shots (shOn +0.0002, shSlot -0.0003, shDist and oppBlk not taken) and
// points (0 each); the NBA's zone3 and the zone edge on rebounds, assists, threes and pts+reb+ast (-0.0007 to
// +0.0002), opp3 on assists (+0.0003, a side's bias larger), rebounds (-0.0004))
const FEED_PASS_ATT = [...RC_PASS, 'aggr'];
const FEED_RUSH_ATT = [...RUSHING, 'ryoeP'];
const FEED_CATCH = [...CATCHING, 'yacoe'];
const FEED_NBA_PTS = [...PTS_CTX, 'zoneEdge', 'opp3'];
// (and MLB's contact (Statcast's balls in play: savant.mjs, matchups.mjs contactTable), on 2025-26's history: kept, a
// batter's expected hits on contact over his hits on hits (xHit 0.06: held out 0.5401 to 0.5392, +0.0009; the
// over-0 side's bias -0.0622 to -0.0187, the under-0 side's 0.0374 to 0.0032) and total bases (xHit 0.06: 0.6315
// to 0.631, +0.0005; -0.0803 to -0.0066, 0.0567 to 0.0007). Left out: xTb (0, +0.0002 with the bias larger),
// hardHit (not taken), pullAir (+0.0002 each, a side's bias larger))
// Held by the replay gate (gate.mjs, D22: 2026-10-18): its projections better beyond noise (props -0.0008, 95%
// -0.0013 to -0.0003) but against the book worse on the 154 saved MLB props (the close's log loss +0.0025, 95% +0.0002
// to +0.0058; the top picks' CLV -0.0129), so off the ctx and Statcast not read (savant.mjs CONTACT_ON) till a
// re-check with more priced rows (spring) passes the gate
export const STATS = {
  nfl: [
    stat('passYds', 'Pass Yds', /^Total Passing Yards \(/, { played: QB, ctx: RC_PASS, volume: 'pass', ...ROLE_BASE_QB }),
    stat('passAtt', 'Pass Att', /^Total Passing Attempts/, { played: QB, ctx: FEED_PASS_ATT, volume: 'pass', ...ROLE_BASE_QB, ...PLAYS }),
    stat('passCmp', 'Completions', /^Total Pass Completions/, { played: QB, ctx: PASSING, volume: 'pass', ...ROLE_BASE_QB }),
    stat('passTd', 'Pass TDs', /^Total Passing Touchdowns/, { played: QB, ctx: RZ_PASS, ...ROLE_BASE_QB, ...MIDDLE }),
    stat('passInt', 'INTs', /^Total Passing Interceptions/, { played: QB, ctx: INT_CTX, ...ROLE_BASE_QB }),
    stat('rushYds', 'Rush Yds', /^Total Rushing Yards \(/, { played: RUSH, ctx: CARRYING, roles: true, volume: 'rush', ...NFL_VAC, ...ROLE_BASE_QB, ...ROLE_BASE, ...RUSH_OPP, ...START, ...TEAM }),
    stat('rushAtt', 'Carries', /^Total Carries/, { played: RUSH, ctx: FEED_RUSH_ATT, roles: true, volume: 'rush', ...NFL_VAC, ...ROLE_BASE_QB, ...ROLE_BASE, ...RUSH_OPP, ...TEAM }),
    stat('recYds', 'Rec Yds', /^Total Receiving Yards \(/, { played: CATCH, ctx: CARRYING, roles: true, volume: 'pass', targets: true, ...NFL_VAC, ...ROLE_BASE, ...CATCH_OPP, ...PER_TARGET, ...EXIT, ...START }),
    stat('rec', 'Receptions', /^Total Receptions/, { played: CATCH, ctx: FEED_CATCH, roles: true, volume: 'pass', targets: true, ...NFL_VAC, ...ROLE_BASE, ...CATCH_OPP }),
    stat('rushRecYds', 'Rush+Rec Yds', /^Total Rushing Plus Receiving Yards/, { played: (r) => (RUSH(r) && r.pos !== 'QB') || CATCH(r), ctx: RUSH_REC, roles: true, targets: true, ...NFL_VAC, ...ROLE_BASE, ...CATCH_OPP, ...START, ...TEAM_NORM }),
  ],
  nba: [
    stat('pts', 'Points', /^Total Points( \(|$)/, { played: MIN, ctx: FEED_NBA_PTS, posGroup: () => 'all', roles: true, ...NBA_VAC, ...NBA_MINUTES, ...NBA_POS_PACE, ...START, ...NBA_TEAM }),
    stat('reb', 'Rebounds', /^Total Rebounds( \(|$)/, { played: MIN, ctx: NBA_CTX, posGroup: () => 'all', roles: true, ...NBA_VAC, ...NBA_MINUTES, ...NBA_POS_PACE, ...START, ...NBA_TEAM }),
    // (assists alone: ESPN's board also posts "Total Assists and Rebounds", which /^Total Assists/ read as assists, its
    // line (Jalen Duren 12.5, Cade Cunningham 14.5) priced against his assists, under at 99%: D50; the site's
    // preview-props.ts reads it the same way)
    stat('ast', 'Assists', /^Total Assists( \(|$)/, { played: MIN, ctx: NBA_CTX, posGroup: () => 'all', roles: true, ...NBA_VAC, ...NBA_MINUTES, ...NBA_POS_PACE, ...START, ...NBA_TEAM }),
    stat('fg3', 'Threes', /^Total (3-Point|Three|Made 3)/i, { played: MIN, ctx: NBA_CTX, posGroup: () => 'all', roles: true, ...NBA_VAC, ...NBA_MINUTES, ...NBA_POS_PACE, ...START, ...NBA_TEAM }),
    stat('pra', 'Pts+Reb+Ast', /Points.*Rebounds.*Assists/i, { played: MIN, ctx: PRA_CTX, posGroup: () => 'all', roles: true, ...NBA_VAC, ...NBA_MINUTES, ...NBA_POS_PACE, ...START, ...NBA_TEAM }),
  ],
  nhl: [
    stat('sog', 'Shots', /^Total Shots on Goal/, { played: SKATER, ctx: NHL_SOG_CTX, lowPool: true, ...NHL_VAC, ...NHL_MINUTES, ...TEAM }),
    // (lowPool: the low-usage prior (project.mjs lp) for skaters under the eligible pool (a third-pair defenseman's
// points): his prior leaning to the pool's floor, judged on those rows alone)
    stat('pts', 'Points', /^Total Points$/, { played: SKATER, ctx: NHL_PTS_CTX, lowPool: true, ...NHL_VAC }),
    stat('saves', 'Saves', /^Total Saves/, { played: (r) => r.pos === 'G' && r.started, script: 'opp', ctx: SAVES_CTX, goalie: true }),
  ],
  mlb: [
    stat('k', 'Strikeouts', /^Total Strikeouts$/, { played: (r) => r.pos === 'SP', script: 'opp', ctx: RC_K, pitcher: true }),
    // (flip: the reflected count's caps the fit tries (project.mjs chanceLog, D43): a start's outs are left-skewed (a hook
    // ends it early, a long start sits near the cap), so M - outs is shaped; strikeouts stay plain (their count's shape is
    // right, measured 2026-10-19: the plain log loss on the counts 2.187 against 2.28 to 2.49 reflected))
    stat('outs', 'Outs', /^Total Outs Recorded/, { played: (r) => r.pos === 'SP', script: 'opp', ctx: RC_OUTS, pitcher: true, flip: [21, 24, 27] }),
    stat('hits', 'Hits', /^Total Hits$/, { played: BATTED, ctx: BATTER_CTX, ...MIDDLE }),
    stat('tb', 'Total Bases', /^Total Bases$/, { played: BATTED, ctx: RC_TB }),
  ],
};

// The settings that let a stat's model see the game: its side's expected score over the average (script),
// and its context terms, from each game's expectation and terms (expPts: game id to [home, away], each made
// before the game; info: game id to the context's info, from what was known before it). The same functions
// price a coming game (priceProps: its expectation and its info), so the history and the bet see one thing.
// The betting lines' implied points (row.mkt: [home, away], marketPts) beside them: their average over the
// rows that have them (avgMkt) and how many do (mktN: none, and the market's terms aren't fit)
export function envFor(sport, st, expPts, info, rows) {
  const all = [...expPts.values()].flat().filter(Number.isFinite);
  const avg = all.length ? all.reduce((s, x) => s + x, 0) / all.length : 1;
  const vals = rows.filter(st.played).map((r) => r.s[st.key]);
  const mean = vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : 1;
  const mk = rows.filter((r) => r.mkt).flatMap((r) => r.mkt);
  // (sport: the recency fit's rule era, project.mjs ERAS)
  const env = { sport, mean, avg, avgMkt: mk.length ? mk.reduce((s, x) => s + x, 0) / mk.length : null, mktN: mk.length / 2, totN: rows.filter((r) => r.mTotal > 0).length };
  const keys = ctxKeys(st);
  env.script = (row, params = null) => scriptValue(st, env, info.get(row.game), expPts.get(row.game), row.home, params?.mk ?? 0, row.mkt);
  env.ctx = keys.length ? (row) => ctxValues(keys, info.get(row.game), row.home, expPts.get(row.game), row) : null;
  return env;
}

// A stat's game script for a game: its side's expected score (opp: the other side's) over the league's
// average; 1 where the game model has none. pts: the game's expected [home, away] points. With the market's
// game flow (mk, project.mjs: kept only where the held-out games are better with it) the betting lines'
// implied points (mkt: [home, away], over their own average) blended in that far on the log; a game without
// lines, the game model's alone (fail safe: as before)
export function scriptValue(st, env, info, pts, home, mk = 0, mkt = null) {
  const side = (home === (st.script !== 'opp')) ? 0 : 1;
  const v = pts?.[side];
  const model = Number.isFinite(v) && v > 0 && env.avg ? v / env.avg : 1;
  const m = mkt?.[side];
  if (!(mk > 0) || !(Number.isFinite(m) && m > 0) || !(env.avgMkt > 0)) return model;
  return Math.pow(model, 1 - mk) * Math.pow(m / env.avgMkt, mk);
}

// A game's points implied by its betting lines, [home, away]: the total split by the home side's margin (a
// favorite's spread, -3 home, a margin of 3); null without both lines
export function marketPts(total, homeMargin) {
  if (!Number.isFinite(total) || !Number.isFinite(homeMargin) || total <= 0) return null;
  const h = (total + homeMargin) / 2;
  const a = (total - homeMargin) / 2;
  return h > 0 && a > 0 ? [h, a] : null;
}

// A row's home side's margin by the betting lines: the spread alone where it has it (mktSpread, live), else
// its implied points' (mkt, the history's); null without either
export function spreadOf(row) {
  if (Number.isFinite(row?.mktSpread)) return row.mktSpread;
  return row?.mkt && Number.isFinite(row.mkt[0]) && Number.isFinite(row.mkt[1]) ? row.mkt[0] - row.mkt[1] : null;
}

// The NFL history's betting lines as implied points (props.mjs marketPts), by ESPN's game id: nflverse's
// schedule (spread_line: the home side's margin; total_line), the props' market game flow (project.mjs mk,
// mSpread). These are the closing lines, a mild look-ahead against the line a bet is priced on (the book's
// when the bet goes out, days or hours before the close by its window; nflverse keeps no opening line): the
// fit sees a little more news than live does. Any failure: none (the market's terms not fit, the props as before)
export async function nflMarket(history) {
  try {
    return marketOf(history, await nflverseGames());
  } catch (err) {
    console.warn(`nfl: the betting lines' history not read (${err.message})`);
    return null;
  }
}

// The NFL history's injury listings as live play reads them (matchups.mjs nflMatchups' listed: the lead
// quarterback out, qb1Out and qbDeep): each game and team's players listed Out or Doubtful on nflverse's weekly
// injury report ('report'), and on its weekly roster's reserve list ('reserve': IR, PUP, NFI, suspended; read
// out only where he isn't in the game), by ESPN's ids (nflverse's players file maps the report's). listed(game,
// team): a Map of pid to its kind, empty with none listed; null for a game nflverse's schedule doesn't have or a
// season with no report read (that game's flag from its logs, as before). Any failure: null (every game from its
// logs, as before 2026-10-14)
export async function nflListed(history, facts, seasons) {
  try {
    const games = new Map(history.map((g) => [String(g.id), g]));
    const codeOf = new Map();
    for (const x of facts?.nfl?.values() ?? []) {
      const g = games.get(String(x.espn));
      if (!g) continue;
      codeOf.set(`${x.season}|${g.home}`, x.home_team);
      codeOf.set(`${x.season}|${g.away}`, x.away_team);
    }
    if (!codeOf.size || !seasons.length) return null;
    const players = await nflverseRows('players', 'players.csv.gz', ['gsis_id', 'espn_id'], 24 * 7);
    const espnOf = new Map((players ?? []).filter((p) => p.espn_id && p.espn_id !== 'NA').map((p) => [p.gsis_id, String(Number(p.espn_id))]));
    if (!espnOf.size) return null;
    const file = async (release, base, cols, hours) => {
      for (const f of [`${base}.csv.gz`, `${base}.csv`]) {
        const rows = await nflverseRows(release, f, cols, hours).catch(() => null);
        if (rows?.length) return rows;
      }
      return [];
    };
    const out = new Map();
    const put = (season, week, code, pid, kind) => {
      const key = `${season}|${Number(week)}|${code}`;
      if (!out.has(key)) out.set(key, new Map());
      const m = out.get(key);
      if (m.get(pid) !== 'report') m.set(pid, kind);
    };
    const read = new Set();
    const now = Math.max(...seasons);
    for (const season of seasons) {
      // (a past season's files kept a year; this one's read again twice a day)
      const hours = season === now ? 12 : 24 * 365;
      const inj = await file('injuries', `injuries_${season}`, ['team', 'week', 'gsis_id', 'report_status'], hours);
      if (!inj.length) continue;
      read.add(Number(season));
      for (const x of inj) {
        const pid = espnOf.get(x.gsis_id);
        if (pid && (x.report_status === 'Out' || x.report_status === 'Doubtful')) put(season, x.week, x.team, pid, 'report');
      }
      const ros = await file('weekly_rosters', `roster_weekly_${season}`, ['team', 'week', 'status', 'gsis_id', 'espn_id'], hours);
      for (const x of ros) {
        if (x.status !== 'RES') continue;
        const pid = x.espn_id && x.espn_id !== 'NA' ? String(Number(x.espn_id)) : espnOf.get(x.gsis_id);
        if (pid) put(season, x.week, x.team, pid, 'reserve');
      }
    }
    const missed = seasons.filter((s) => !read.has(Number(s)));
    console.log(`nfl: the history's injury listings read for ${read.size} of ${seasons.length} seasons${missed.length ? ` (none for ${missed.join(', ')}: their quarterback out from the logs)` : ''}`);
    return (game, team) => {
      const x = facts.nfl.get(game);
      if (!x || !read.has(Number(x.season))) return null;
      const code = codeOf.get(`${x.season}|${team}`);
      return code ? (out.get(`${x.season}|${Number(x.week)}|${code}`) ?? new Map()) : null;
    };
  } catch (err) {
    console.warn(`nfl: the history's injury listings not read (${err.message}): the quarterback out from the logs`);
    return null;
  }
}

// nflverse's schedule rows to the history's games' implied points (nflMarket), by ESPN's id: a game with a
// blank line skipped (Number('') is 0: a blank spread would read as a pick'em), and a game whose sides nflverse
// has the other way round (its final's score against ESPN's) read swapped; none matched, null
export function marketOf(history, games) {
  const byId = new Map(history.map((g) => [String(g.id), g]));
  const out = new Map();
  const blank = (v) => v === undefined || v === null || String(v).trim() === '';
  for (const x of games ?? []) {
    const g = byId.get(String(x.espn));
    if (!g || blank(x.spread_line) || blank(x.total_line)) continue;
    const pts = marketPts(Number(x.total_line), Number(x.spread_line));
    if (!pts) continue;
    const swapped = g.final && Number.isFinite(g.hs) && !blank(x.home_score) && Number(x.home_score) !== g.hs && Number(x.away_score) === g.hs;
    out.set(String(g.id), swapped ? [pts[1], pts[0]] : pts);
  }
  return out.size ? out : null;
}

// A context term's value for a game, from its info (context.mjs featurize: the weather, starters, schedule),
// its expected [home, away] points and the player's row (its matchups, matchups.mjs: each from before the game,
// a coming game's from its live facts); 0 where it's unknown (no effect)
export const CTX = {
  // (wind over 10 mph, per 10 mph, outdoors)
  wind: (info) => (Number.isFinite(info?.weather?.wind) ? Math.max(0, info.weather.wind - 10) / 10 : 0),
  // (cold under 50°F, per 10°F, outdoors)
  cold: (info) => (Number.isFinite(info?.weather?.temp) ? Math.max(0, 50 - info.weather.temp) / 10 : 0),
  // (rain and melted snow over the game's window, per 0.1 inch, to half an inch: outdoors)
  precip: (info) => (Number.isFinite(info?.weather?.precip) ? Math.min(0.5, info.weather.precip) * 10 : 0),
  // (his own side starting a backup quarterback, by how much worse he is: a receiver's and a back's numbers)
  backupQb: (info, home) => info?.starters?.backup?.[home ? 0 : 1] ?? 0,
  // (his team's lead back out (matchups.mjs leadBack: out, doubtful or on IR, or not in the game's logs in the
  // history; a questionable one by his chance of missing it, playchance.mjs): a pass-catcher's receptions, a
  // back's own 0)
  rb1Out: (info, home, pts, row) => (Number.isFinite(row?.rb1Out) ? row.rb1Out : 0),
  // (the same for his quarterback's own passing volume (round D): the quarterback's rows alone, 0 to 1)
  rbOutPass: (info, home, pts, row) => (row?.pos === 'QB' && Number.isFinite(row?.rb1Out) ? row.rb1Out : 0),
  // (a backup quarterback's own rushing (round D): he's his team's passer and not its lead quarterback by the work
  // (matchups.mjs qbBackup: the history's by the game's passes, live by the lead's absence); 0 or 1)
  backupRun: (info, home, pts, row) => (row?.pos === 'QB' && row?.qbBackup ? 1 : 0),
  // (his team's lead quarterback out (matchups.mjs qb1Out: out, doubtful or on IR, gone from the roster, or not in
  // the game's logs in the history; a questionable one by his chance of missing it), times the share of his
  // games this season the starter played in: a back's and a pass-catcher's, a quarterback's 0)
  qb1Out: (info, home, pts, row) => (Number.isFinite(row?.qb1Out) ? row.qb1Out : 0),
  // (the same times how far his depth runs over the league's (matchups.mjs qbDeep: qb1Out times dep - 1 where
  // over 0, dep his air yards a target over the league's, known before the game): a deep threat's about 0.6, a
  // typical wide receiver's 0.3, most tight ends' 0; a wide receiver's and a tight end's, a back's 0; 0 without
  // the air yards)
  qbDeep: (info, home, pts, row) => (Number.isFinite(row?.qbDeep) ? row.qbDeep : 0),
  // (a regular above him at his position out (matchups.mjs aheadOut, 0 or 1; a questionable one not))
  aheadOut: (info, home, pts, row) => (Number.isFinite(row?.aheadOut) ? row.aheadOut : 0),
  // (his side's margin by the betting lines, per 10 points: a favorite's over 0. From the spread alone where the
  // row has it (row.mktSpread: the home side's margin, live), else the implied points' (row.mkt, marketPts: the
  // history's); 0 without (live, priceProps CHECKs that where the fit kept it: spreadBlind))
  mSpread: (info, home, pts, row) => {
    const m = spreadOf(row);
    return m === null ? 0 : ((home ? 1 : -1) * m) / 10;
  },
  // (his team's 5th to 8th game of the season (matchups.mjs teamGame). The role backtest (2026-10-12, the week
  // table) had the established starters' receiving 3% to 13% over the projection there (held out 7% to 19%),
  // every eligible player's 2% to 4%, their actual over their own season so far (+3% receiving yards) and at
  // their prior (-1%): not the prior's weight (kd, the prior shrinking, leans on the early weeks, lower still).
  // As a flag (project.mjs MIN_GAIN, 0.0003) on receiving yards, receptions and both yards it was not taken or
  // taken the other way on the fit window (-0.025, held out -0.0002). Not the lean either (review of 94fddea5:
  // the role backtest by season and by the team's game): the held-out seasons' receiving yards ran +1.9%, +4.1%,
  // -1.1%, +1.2% over the projection (2023 to 2026, no trend for a refit lean to take), and the factors' pull
  // (the projection over the blended base: the lean, the opponent, the script) -3% to -5% in every game group
  // alike; the starters' 5-8 lift (+5.4%, held out +8.5%, by the team's game) is their actual over the base
  // (+0.9% there, -4.6% in 1-4, -6.5% from 9: over their own and their prior alike), the season's shape of
  // their output, the tight ends' most (+12.8%). On no stat's ctx; kept for later work)
  midSeason: (info, home, pts, row) => (Number.isFinite(row?.teamGame) && row.teamGame >= MID_SEASON[0] && row.teamGame <= MID_SEASON[1] ? 1 : 0),
  // (his team in its first COACH_GAMES games under a new head coach (football.mjs: the game's number under him,
  // known before it by the schedule's coaches))
  newCoach: (info, home) => {
    const n = info?.more?.newCoach?.[home ? 0 : 1];
    return Number.isFinite(n) && n >= 1 && n <= COACH_GAMES ? 1 : 0;
  },
  // (his teammates' production missing, per 10: an NBA player's usage)
  usage: (info, home) => (info?.starters?.missing?.[home ? 0 : 1] ?? 0) / 10,
  // (the other side's key defenders out tonight (audit #15): the NBA's its production missing, per 10 (context.mjs:
  // its regulars not in the box score in the history, out on the injury report live, a questionable one at half);
  // the NHL's its top-four defensemen's time on ice missing over a game's 60 (matchups.mjs nhlMatchups oppD); the
  // NFL's its regulars' defensive snap shares missing, its secondary's (oppDB) and its front seven's (oppFront:
  // matchups.mjs defenseOut, nflverse's snap counts). Each from before the game; 0 unknown (the stat as without it))
  oppOut: (info, home) => (Number.isFinite(info?.starters?.missing?.[home ? 1 : 0]) ? info.starters.missing[home ? 1 : 0] / 10 - OPP_OUT_AVG : 0),
  oppD: (info, home, pts, row) => (Number.isFinite(row?.oppD) ? row.oppD : 0),
  oppDB: (info, home, pts, row) => (Number.isFinite(row?.oppDB) ? row.oppDB : 0),
  oppFront: (info, home, pts, row) => (Number.isFinite(row?.oppFront) ? row.oppFront : 0),
  // (his side on the second night of a back-to-back; the other side's (oppB2b): context.mjs's schedule, known
  // before the game, a season's first game neither)
  b2b: (info, home) => info?.b2b?.[home ? 0 : 1] ?? 0,
  oppB2b: (info, home) => info?.b2b?.[home ? 1 : 0] ?? 0,
  // (the same as b2b under its own name, one size for every NBA player in the main search: pts+reb+ast's, where
  // it was kept before the by-role ones and they aren't (props.mjs PRA_CTX); b2b itself is a late flag now)
  b2bAll: (info, home) => info?.b2b?.[home ? 0 : 1] ?? 0,
  // (an NBA player's own back-to-back by his role, read only from what's known before the game (matchups.mjs
  // nbaMatchups roleKnown: S, his team's five with the most minutes a game, the ones out counted out in the
  // history only when they'd missed the game before too, live the injury report's; B, the rest; no role, 0: a
  // player under three games for his team (its first games, a trade) or fewer than five ranked). Not role,
  // which ranks the history without everyone who sat (a starter resting the second night, often unannounced at
  // bet time, would make his fill-in a starter there and a bench player live) and calls an unranked player B
  // (a star's first games on a new team lifted as a bench player's): a starter's
  // (b2bS) and a bench player's (b2bB), each its own size. The audit (2026-10-12) read the one size for both (b2b,
  // kept at +0.07 on points and pts+reb+ast) as pointing the wrong way: its replay had back-to-backs about 4%
  // under the projection. The side read is right (his own); that 4% is the residual with +0.07 on, and the two
  // roles pull apart under it. Points without it (the eligible players, fit window): the bench's back-to-backs
  // 11.7% over their projections (n 374; the bench otherwise -2%), the starters' 2.8% (n 607; otherwise 1.4%),
  // held out 14.4% and 5.2%. So the sign is right for both, the size the bench's (likely the minutes the rested
  // and tired starters give up), and one size lifted the starters too far: with it on, theirs ran 4.2% under.
  // b2bS on no stat's ctx (props.mjs NBA_CTX: kept nowhere))
  b2bS: (info, home, pts, row) => (row?.roleKnown === 'S' ? (info?.b2b?.[home ? 0 : 1] ?? 0) : 0),
  b2bB: (info, home, pts, row) => (row?.roleKnown === 'B' ? (info?.b2b?.[home ? 0 : 1] ?? 0) : 0),
  // (the blowout the game model expects, either way: its margin, per 10 points; a starter sits the end of it)
  // (the shots on goal the other side is expected to take over the league's, as a log: a goalie's saves, its
  // size the power of the ratio; hockey.mjs's from the games before)
  oppShots: (info, home) => {
    const v = info?.more?.shots?.[home ? 1 : 0];
    const avg = info?.more?.shotsAvg;
    return Number.isFinite(v) && v > 0 && avg > 0 ? Math.log(v / avg) : 0;
  },
  blowout: (info, home, pts) => (pts && Number.isFinite(pts[0]) && Number.isFinite(pts[1]) ? Math.abs(pts[0] - pts[1]) / 10 : 0),
  // (the blowout the betting lines expect, by his role known before the game (matchups.mjs nbaMatchups
  // roleKnown): the spread either way, per 10 points (spreadOf: the book's now live, the history's final's line,
  // playerlogs.mjs boxMarket), a starter's (blowS: his minutes cut in a lopsided game's fourth quarter) and a
  // bench player's (blowB: the garbage time his), each its own size; 0 without the lines or a role known (the
  // projection as without it)
  blowS: (info, home, pts, row) => (row?.roleKnown === 'S' ? blowOf(row) : 0),
  blowB: (info, home, pts, row) => (row?.roleKnown === 'B' ? blowOf(row) : 0),
  // (a bench player by his minutes (roleKnown B) who started his team's last game (matchups.mjs startLast, the
  // box's starter flag): a starter's minutes and touches his for now; 0 or 1)
  newStart: (info, home, pts, row) => (row?.roleKnown === 'B' && row?.startLast === 1 ? 1 : 0),
  // (an NHL skater's power play: his power-play minutes a game (recent games counting most) by the power plays
  // his team can expect over the league's per team (the other side's penalties, and half the referees' lean:
  // officials.mjs, power plays a game both sides), as a share of the league's)
  pp: (info, home, pts, row) => {
    const t = row?.ppTime;
    if (!Number.isFinite(t) || t <= 0 || !(row.ppAvg > 0)) return 0;
    const refs = Number.isFinite(info?.officials?.whistle) ? info.officials.whistle / 2 : 0;
    return (t * ((row.ppOpp ?? 0) + refs)) / row.ppAvg;
  },
  // (an NHL skater's share of his team's power play against his position's prop players' (matchups.mjs ppShare:
  // a top unit's man over 0, a second-pair defenseman under it): his role on it, which the position's prior
  // (project.mjs) doesn't know; 0 with none read)
  ppShare: (info, home, pts, row) => (Number.isFinite(row?.ppShare) ? row.ppShare : 0),
  // (an NHL skater's power-play time's lean: his share of his team's power play, this season's recent games
  // counting most, over his season's average share, as a log (matchups.mjs ppLean, from the games before); a top
  // unit's job won or lost since the games his rate comes from; 0 with too few games this season)
  ppLean: (info, home, pts, row) => (Number.isFinite(row?.ppLean) ? row.ppLean : 0),
  // (the betting total's goals over a typical NHL game's (MTOTAL_AVG), as a log (row.mTotal: the history's close,
  // playerlogs.mjs boxTotals; live the book's now): the market's read of the game's scoring past the game model's;
  // 0 without a total (the stat as without it)
  mTotal: (info, home, pts, row) => (row?.mTotal > 0 ? Math.log(row.mTotal / MTOTAL_AVG) : 0),
  // (the shots on goal his own side is expected to take over the league's, as a log (hockey.mjs: its shots a game
  // against the other side's allowed, from the games before); 0 where the game model has none)
  teamShots: (info, home) => {
    const v = info?.more?.shots?.[home ? 0 : 1];
    const avg = info?.more?.shotsAvg;
    return Number.isFinite(v) && v > 0 && avg > 0 ? Math.log(v / avg) : 0;
  },
  // (the other side's starting goalie (NHL) or pitcher (MLB): goals or runs a game he saves over average,
  // context.mjs's starters, from before the game)
  oppGoalie: (info, home) => (Number.isFinite(info?.starters?.saved?.[home ? 1 : 0]) ? info.starters.saved[home ? 1 : 0] : 0),
  oppSp: (info, home) => (Number.isFinite(info?.starters?.saved?.[home ? 1 : 0]) ? info.starters.saved[home ? 1 : 0] : 0),
  // (an MLB batter's place in the order against his usual, as the log of their plate appearances; his platoon
  // edge on the other side's starter against how often he's had it: matchups.mjs mlbMatchups)
  slot: (info, home, pts, row) => (Number.isFinite(row?.slotShift) ? row.slotShift : 0),
  platoon: (info, home, pts, row) => (Number.isFinite(row?.platoonShift) ? row.platoonShift : 0),
  // (an MLB starter's leash (his last two starts' pitches over his usual, a log), his rest ((days - 5) / 5), and
  // the plate umpire's zone (strikeouts a 9 innings his zone has given starters over their rates: officials.mjs;
  // 0 with no umpire posted))
  leash: (info, home, pts, row) => (Number.isFinite(row?.leash) ? row.leash : 0),
  restSp: (info, home, pts, row) => (Number.isFinite(row?.rest) ? row.rest : 0),
  ump: (info) => (Number.isFinite(info?.officials?.whistle) ? info.officials.whistle : 0),
  // (audit round C, MLB (matchups.mjs batterTables, each from before the game; 0 unread): a starter's other side's
  // posted lineup, its strikeout rate a plate appearance over the league's (lineupK), over its own usual
  // (lineupKd), its on-base rate over the league's (lineupOb: more batters faced an out), each a log; a batter's
  // ballpark (parkH, parkTB: its hits or total bases over what its batters hit elsewhere, a log), his plate
  // appearances expected at his slot tonight, home or away, over his own a game (paX, a log), the air at first
  // pitch outdoors (airTemp: per 10°F over 70; windOutB: per 10 mph out toward center, in negative: context.mjs
  // weatherOf, the posted report or the forecast; a closed roof or none, 0) and home or away (homeBat: 1 home, -1
  // away: the home side's ninth often not batted)
  lineupK: (info, home, pts, row) => (Number.isFinite(row?.lineupK) ? row.lineupK : 0),
  lineupKd: (info, home, pts, row) => (Number.isFinite(row?.lineupKd) ? row.lineupKd : 0),
  lineupOb: (info, home, pts, row) => (Number.isFinite(row?.lineupOb) ? row.lineupOb : 0),
  parkH: (info, home, pts, row) => (Number.isFinite(row?.parkH) ? row.parkH : 0),
  parkTB: (info, home, pts, row) => (Number.isFinite(row?.parkTB) ? row.parkTB : 0),
  paX: (info, home, pts, row) => (Number.isFinite(row?.paX) ? row.paX : 0),
  airTemp: (info) => (Number.isFinite(info?.weather?.temp) && Number.isFinite(info?.weather?.windOut) ? (info.weather.temp - 70) / 10 : 0),
  windOutB: (info) => (Number.isFinite(info?.weather?.windOut) ? info.weather.windOut / 10 : 0),
  homeBat: (info, home) => (home ? 1 : -1),
  // (the park and air re-checked, 2026-10-14: tonight's ballpark against the parks his own rate was made in
  // (parkRel, matchups.mjs batterTables: a log; 0 unread), and the batter's whole environment as one term (hitEnv:
  // parkRel plus 4% a 10°F over 70 and 4% a 10 mph out toward center, outdoors (airTemp, windOutB's), per 10%: the
  // three's weights from the fit window alone (2025-07-19 to 2026-06-07), each alone under the floor)
  parkRel: (info, home, pts, row) => (Number.isFinite(row?.parkRel) ? row.parkRel : 0),
  hitEnv: (info, home, pts, row) => 10 * ((Number.isFinite(row?.parkRel) ? row.parkRel : 0) + 0.04 * CTX.airTemp(info) + 0.04 * CTX.windOutB(info)),
  // (audit round C, NFL: his own line's starters changed since its last game (olOut: football.mjs olChanged, the
  // game's snap counts in the history, the injury report's last five out for a coming game; 0 unread), his team's
  // own pass rate over expected so far, per 10 points (proe: matchups.mjs nflRoundC), a back's late-season load
  // (rbLoad), a passing-down back's role by the game's script (rbPass: his share of touches that are targets less
  // the league's backs', per 10 points, times his side's margin by the lines the other way, per 10: a passing
  // back on an underdog over 0; 0 without the lines), and his team's last regular-season game (lastGame: week
  // 18's rest))
  olOut: (info, home) => (Number.isFinite(info?.more?.olChanged?.[home ? 0 : 1]) ? info.more.olChanged[home ? 0 : 1] : 0),
  proe: (info, home, pts, row) => (Number.isFinite(row?.proe) ? row.proe * 10 : 0),
  rbLoad: (info, home, pts, row) => (Number.isFinite(row?.rbLoad) ? row.rbLoad : 0),
  rbPass: (info, home, pts, row) => {
    const m = spreadOf(row);
    return m === null || !Number.isFinite(row?.rbRole) || !row.rbRole ? 0 : row.rbRole * 10 * ((-(home ? 1 : -1) * m) / 10);
  },
  lastGame: (info, home, pts, row) => (row?.lastGame === 1 ? 1 : 0),
  // (the red zone, NFL (matchups.mjs nflRedZone, from the play-by-play's field position, the games before): his
  // team's red-zone dropbacks a game against the league's (its trips a game and its pass rate there, each over the
  // league's, as a log), per 10%; rzPassM the same with the other side's defense averaged in; 0 unread)
  rzPass: (info, home, pts, row) => (Number.isFinite(row?.rzPass) ? row.rzPass * 10 : 0),
  rzPassM: (info, home, pts, row) => (Number.isFinite(row?.rzPassM) ? row.rzPassM * 10 : 0),
  rzGap: (info, home, pts, row) => (Number.isFinite(row?.rzGap) ? row.rzGap * 10 : 0),
  // (the feeds round (project.mjs FEEDS; INPUTS.md): each the row's own value, 0 at the league's level and per its
  // unit either way, from what was published before the game; 0 unread. The NFL's Next Gen Stats (ngs.mjs: cpoe,
  // ttt, aggr a passer's; sep, cush, yacoe a pass-catcher's; ryoe, box8 a rusher's; oppBox the other side's
  // defense's stacked boxes))
  ...Object.fromEntries(FEEDS.map((c) => c.slice(2)).map((k) => [k, (info, home, pts, row) => (Number.isFinite(row?.[k]) ? row[k] : 0)])),
};
// (a game's blowout by its betting lines: the spread either way, per 10 points; 0 without)
export function blowOf(row) {
  const m = spreadOf(row);
  return m === null ? 0 : Math.abs(m) / 10;
}
export function ctxValues(keys, info, home, pts, row = null) {
  return keys.map((k) => CTX[k]?.(info, home, pts, row) ?? 0);
}
// (the terms that read the weather: a coming game whose forecast failed has them unseen)
const WEATHER_CTX = new Set(['wind', 'cold', 'precip']);
// (the terms that read his team's lead quarterback missing, and the swing between him in and out, on the log
// times his chance's spread, that flags a questionable one (priceProps qbSwing))
export const QB_OUT_CTX = new Set(['qb1Out', 'qbDeep']);
export const QB_Q_SWING = 0.05;

// Which of a game's players a book would have posted this prop for (eligible), from what was known before the
// game: each team's top few among the players who took the field, ranked by their usage in their games before
// it (each one's, recent games counting most: USE_RATE a game; carried across seasons and teams), never by the
// game's own box score (a receiver picked for his targets in the game itself is picked for his good games: the
// fit leaned over). NFL: its passer (most attempts); rushing, its top two backs by carries (and its passer);
// receiving, its top four by targets. NBA: its top eight by minutes. NHL: its top six forwards and top two
// defensemen by time on ice; the goalie who started (named before the game). MLB: every starting pitcher (the
// probable's); the batters who've been starting (USE_RATE's plate appearances a game 3 or more). A player
// with no games before it isn't one (the book's line on him would be a guess the history can't check)
export const USE_RATE = 0.35;
export function markEligible(sport, st, rows) {
  const use = (r) =>
    sport === 'nfl' ? { pass: r.s.passAtt ?? 0, rush: r.s.rushAtt ?? 0, tgt: r.s.targets ?? 0 }
    : sport === 'nba' ? { min: r.s.min ?? 0 }
    : sport === 'nhl' ? { toi: r.s.toi ?? 0 }
    : { pa: r.s.pa ?? 0 };
  const usage = new Map();
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const top = (list, by, n, filter = () => true) => new Set(list.filter((r) => filter(r) && by(r) > 0).sort((a, b) => by(b) - by(a)).slice(0, n));
  let i = 0;
  while (i < sorted.length) {
    const day = sorted[i].date.slice(0, 10);
    let j = i;
    while (j < sorted.length && sorted[j].date.slice(0, 10) === day) j++;
    const batch = sorted.slice(i, j);
    // (the day's games, each side's eligible from the usage before the day)
    const games = new Map();
    for (const r of batch) {
      const key = `${r.game}|${r.team}`;
      games.set(key, [...(games.get(key) ?? []), r]);
    }
    for (const list of games.values()) {
      const u = (k) => (r) => usage.get(r.pid)?.[k] ?? 0;
      let ok;
      if (sport === 'nfl') {
        const passer = top(list, u('pass'), 1, (r) => r.pos === 'QB');
        const runners = top(list, u('rush'), 2, (r) => r.pos === 'RB' || r.pos === 'FB');
        const catchers = top(list, u('tgt'), 4, (r) => r.pos !== 'QB');
        ok = /^pass/.test(st.key) ? passer : /^rush(Yds|Att)$/.test(st.key) ? new Set([...runners, ...passer]) : st.key === 'rushRecYds' ? new Set([...runners, ...catchers]) : catchers;
        // (the quarterback starting, as known before the game: his team's passer (the props' starter; at bet time a
        // quarterback with a prop on the board), whose numbers the role-aware base takes from his starts)
        for (const r of list) if (r.pos === 'QB') r.qbStart = passer.has(r);
      } else if (sport === 'nba') ok = top(list, u('min'), 8);
      else if (sport === 'nhl') ok = st.goalie ? new Set(list.filter((r) => r.started)) : new Set([...top(list, u('toi'), 6, (r) => r.pos === 'F'), ...top(list, u('toi'), 2, (r) => r.pos === 'D')]);
      else ok = new Set(list.filter((r) => r.pos === 'SP' || (usage.get(r.pid)?.pa ?? 0) >= 3));
      for (const r of list) r.eligible = ok.has(r);
    }
    // (then the day learned: each one's usage, recent games counting most)
    for (const r of batch) {
      const now = use(r);
      const was = usage.get(r.pid);
      usage.set(r.pid, was ? Object.fromEntries(Object.entries(now).map(([k, v]) => [k, (was[k] ?? v) + (v - (was[k] ?? v)) * USE_RATE])) : now);
    }
    i = j;
  }
  return rows;
}

// (an NHL goalie's row: whether he started (row.started), DraftKings' rule for a saves prop (a starter pulled
// has action, a reliever none): the context's goalies in the order they went in (context.mjs, gs: the starter
// first), else, a side with one goalie in its box score, him; a side with two and no order, neither)
export function markStarters(rows, facts) {
  const goalies = new Map();
  for (const r of rows) if (r.pos === 'G') goalies.set(`${r.game}|${r.team}`, [...(goalies.get(`${r.game}|${r.team}`) ?? []), r]);
  for (const list of goalies.values()) {
    for (const r of list) {
      const f = facts?.games?.[r.game];
      const order = f?.gs ? f[r.home ? 'h' : 'a'] : null;
      r.started = Array.isArray(order) && order.length ? String(order[0]?.[0]) === String(r.pid) : list.length === 1;
    }
  }
  return rows;
}

// (a stat's history rows, as its fit reads them: the games it was played in, each with its game's betting line and
// total, the eligible marked)
export const statRows = (sport, st, rows, market = null, totals = null) =>
  markEligible(
    sport,
    st,
    rows.filter((r) => r.team && r.opp && st.played(r)).map((r) => ({ ...r, mkt: market?.get(r.game) ?? null, mTotal: totals?.get(String(r.game)) ?? null })),
  );

// Every prop type's projection model fit and checked on the history (the check on the eligible players);
// the state shows them (facts: the context's, whose play-by-play (facts.plays) gives the NFL's funnel)
// (market: game id to its betting lines' implied [home, away] points (marketPts), each row's put on it (mkt);
// the NFL's from nflverse's closing lines, none elsewhere yet; totals: game id to its betting total, the NHL's
// (playerlogs.mjs boxTotals), each row's put on it (mTotal); listed: the NFL history's injury listings (nflListed:
// the lead quarterback out as live play reads it), null: from the game logs; soft: the soft terms' last run, each
// stat's params.soft by its key (prev), and this run's time in ms (now): project.mjs softStep; reuse: a saved fit's
// fitStat results by stat key (fitcache.mjs; a null where the stat wasn't fit), searched again only for a stat it
// lacks: the model made from its params and taught the history as it is now, as a fresh fit's is. What each
// stat's fitStat gave, fresh or reused, is out.fits (not enumerated), for saving). The NFL's anytime touchdown too
// (anytime.mjs: its own model on the red zone's looks, tracked only), out.anytime (not enumerated: { params, check,
// model, rows, reused, seconds }), its fit beside the stats' in out.fits (ANY_KEY), reused the same way
export function fitProps(sport, rows, expPts, info, facts = null, market = null, totals = null, listed = null, soft = null, reuse = null) {
  const out = {};
  const fits = {};
  Object.defineProperty(out, 'fits', { value: fits, enumerable: false });
  // (each row's role and its defense's funnel, pace and target split, from the games before it: matchups.mjs;
  // the learned split of the work missing read only where it's searched: project.mjs TRY_VL)
  // (MLB's: each batter's start, slot and platoon edge, each starter's leash and rest, the batters' history's
  // start (STATS played) among them, so they're marked before the rows are picked)
  const matchups = sport === 'nfl' ? nflMatchups(rows, facts?.plays, { learned: TRY_VL, listed, rz: facts?.rz ?? null, ngs: facts?.ngs ?? null }) : sport === 'nba' ? nbaMatchups(rows, { learned: TRY_VL }) : sport === 'nhl' ? nhlMatchups(rows, facts) : sport === 'mlb' ? mlbMatchups(rows, facts) : null;
  if (sport === 'nhl') markStarters(rows, facts);
  for (const st of STATS[sport]) {
    const mine = statRows(sport, st, rows, market, totals);
    const env = envFor(sport, st, expPts, info, mine);
    env.soft = { prev: soft?.prev?.[st.key] ?? null, now: soft?.now ?? null };
    const t0 = Date.now();
    const reused = !!reuse && Object.hasOwn(reuse, st.key);
    let fitted = reused ? reuse[st.key] : fitStat(st, mine, env);
    // (D50: a saved fit from before the season start's allocation (no trOpen) given it from one replay under its own
    // settings, so a reused fit prices a team's first games as a fresh one would)
    if (fitted && reused && st.opener && fitted.params?.tr && !fitted.params.trn && !Number.isFinite(fitted.params.trOpen)) fitted = { ...fitted, params: { ...fitted.params, trOpen: trOpenFit(st, mine, fitted.params, env) } };
    fits[st.key] = fitted ?? null;
    if (!fitted) continue;
    // (the model through every final, for the coming games)
    const sorted = [...mine].sort((a, b) => a.date.localeCompare(b.date));
    const model = makeModel(st, fitted.params, env);
    let i = 0;
    while (i < sorted.length) {
      const day = sorted[i].date.slice(0, 10);
      let j = i;
      while (j < sorted.length && sorted[j].date.slice(0, 10) === day) j++;
      model.learn(sorted.slice(i, j));
      i = j;
    }
    // (each player's values, by season: his record at a line)
    const values = new Map();
    for (const r of sorted) values.set(r.pid, [...(values.get(r.pid) ?? []), [r.season, Math.max(0, Math.round(r.s[st.key]))]]);
    out[st.key] = { stat: st, env, model, values, matchups, params: fitted.params, gains: fitted.gains, floors: fitted.floors ?? null, rookie: fitted.rookie ?? null, start: fitted.start ?? null, base: fitted.base, check: fitted.check, checkAll: fitted.checkAll, snapGap: rows.snapGap ?? null, rows: mine.length, eligible: mine.filter((r) => r.eligible).length, seconds: Math.round((Date.now() - t0) / 100) / 10, reused };
  }
  // (the anytime touchdown, NFL: fit on the red zone's looks (anytime.mjs fitAnytime), or the saved fit's params,
  // the model taught every final either way; none without the red zone read)
  if (sport === 'nfl' && facts?.rz) {
    const t0 = Date.now();
    const list = anytimeRows(rows, facts.rz, market, expPts);
    const reused = !!reuse && Object.hasOwn(reuse, ANY_KEY);
    const any = reused ? reuse[ANY_KEY] : fitAnytime(list);
    fits[ANY_KEY] = any ?? null;
    if (any?.params) Object.defineProperty(out, 'anytime', { value: { ...any, model: anytimeModel(list, any.params), rows: list.length, reused, seconds: Math.round((Date.now() - t0) / 100) / 10 }, enumerable: false });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

const athletesFile = path.join(CACHE, 'athletes.json');
let athletes = null;
// (a player cached: read again when his team is neither of the game's (traded, signed elsewhere: otherwise he'd
// be skipped, or priced on the wrong side's work, script and opponent), at most once a day; at: when read)
const athlete = async (ref, teams = null) => {
  athletes ??= existsSync(athletesFile) ? JSON.parse(readFileSync(athletesFile, 'utf8')) : {};
  const id = ref.match(/athletes\/(\d+)/)?.[1];
  if (!id) return null;
  const key = `${ref.match(/sports\/(\w+)\/leagues\/(\w+)/)?.slice(1).join('/')}:${id}`;
  const was = athletes[key];
  const moved = was && teams && !teams.includes(String(was.team)) && !(Date.now() - Date.parse(was.at ?? 0) < 864e5);
  if (!was || moved) {
    const body = await get(ref.replace('http://', 'https://'));
    if (!body) return was ?? null;
    athletes[key] = { id, name: body.displayName, pos: body.position?.abbreviation ?? '', team: body.team?.$ref?.match(/teams\/(\d+)/)?.[1] ?? null, at: new Date().toISOString() };
  }
  return athletes[key];
};
const saveAthletes = () => {
  if (!athletes) return;
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(athletesFile, JSON.stringify(athletes));
};

// (a main line's prices: its pair's American odds, the over first, then the under; null without both)
function pricesOf(pair) {
  const odds = (it) => Number(String(it?.odds?.american?.value ?? '').replace('+', ''));
  const [over, under] = pair.map(odds);
  return pair.length === 2 && Number.isFinite(over) && Number.isFinite(under) && over && under ? { over, under } : null;
}

// The Odds API's market for each prop the desk models
export const API_MARKETS = {
  nfl: { player_pass_yds: 'passYds', player_pass_attempts: 'passAtt', player_pass_completions: 'passCmp', player_pass_tds: 'passTd', player_pass_interceptions: 'passInt', player_rush_yds: 'rushYds', player_rush_attempts: 'rushAtt', player_reception_yds: 'recYds', player_receptions: 'rec', player_rush_reception_yds: 'rushRecYds' },
  nba: { player_points: 'pts', player_rebounds: 'reb', player_assists: 'ast', player_threes: 'fg3', player_points_rebounds_assists: 'pra' },
  nhl: { player_shots_on_goal: 'sog', player_points: 'pts', player_total_saves: 'saves' },
  mlb: { pitcher_strikeouts: 'k', pitcher_outs: 'outs', batter_hits: 'hits', batter_total_bases: 'tb' },
};

// A game's props from The Odds API (cost: the markets it returns): by player and stat, the desk's book's line
// and each side's price, and the other books' consensus at that line (oddsapi.mjs consensusOf: consensus, null
// without enough books). known: the markets the desk's book returned on the game's last ask (none: the first),
// which alone the other books are asked for (oddsapi.mjs propAsks: they add no market of their own); the
// markets it returned this time on the result (dkMarkets), the next ask's known. null when it can't be had (its
// calls failed; one of two failing, the other's, partial). ask and afford: the call and the allowance's word
// on its most cost (a test's recorded response). anytime: the NFL's anytime touchdown market asked too (oddsapi.mjs
// ANYTIME_TD: 1 credit more an ask; by default while anytimeOn says the month can pay for it), its Yes and No
// prices by player on the result (anytime: propsFromBodies)
export async function apiProps(sport, oddsEvent, { known = null, ask = call, afford = (n) => hasKey() && canSpend('props', n), anytime = null } = {}) {
  if (!oddsEvent) return null;
  const any = anytime ?? (sport === 'nfl' && hasKey() && anytimeOn().on);
  const markets = [...Object.keys(API_MARKETS[sport]), ...(sport === 'nfl' && any ? [ANYTIME_TD.market] : [])];
  if (!afford(markets.length)) return null;
  // (one of the two calls failing keeps what the other paid for: its prices, and the markets the book returned
  // there; the failed wide call's markets kept as known, so the other books are asked for them again on the
  // next ask and no market is added, the failed own call's left unknown, the book alone asked for them again)
  const bodies = [];
  const carried = [];
  const plans = propAsks(markets, known);
  for (const plan of plans) {
    const body = await ask('props', `/sports/${SPORT_KEYS[sport]}/events/${oddsEvent}/odds`, { markets: plan.markets.join(','), bookmakers: plan.bookmakers.join(',') });
    if (body) bodies.push(body);
    else if (plan.bookmakers !== PROP_BOOKS) carried.push(...plan.markets);
  }
  if (!bodies.length) return null;
  const out = propsFromBodies(sport, bodies);
  out.dkMarkets = [...new Set([...out.dkMarkets, ...carried])];
  if (bodies.length < plans.length) out.partial = true;
  return out;
}

// (The Odds API's event bodies read: the desk's book's main lines, each with the other books' consensus at its
// line; dkMarkets, the markets the desk's book returned; anytime, the anytime touchdown's (ANYTIME_TD): by
// player's name, the desk's book's Yes price and its No where it posts one, and the other books' consensus where
// two or more post both)
export function propsFromBodies(sport, bodies) {
  // (each book's sides: book -> "player|stat|line" -> { over, under })
  const books = new Map();
  const dkMarkets = new Set();
  // (each book's anytime touchdown: book -> player -> { yes, no })
  const anyBooks = new Map();
  for (const body of bodies) {
    for (const b of body?.bookmakers ?? []) {
      const lines = books.get(b.key) ?? new Map();
      books.set(b.key, lines);
      for (const m of b.markets ?? []) {
        if (m.key === ANYTIME_TD.market) {
          if (b.key === BOOK) dkMarkets.add(m.key);
          const mine = anyBooks.get(b.key) ?? new Map();
          anyBooks.set(b.key, mine);
          for (const o of m.outcomes ?? []) {
            const side = String(o.name).toLowerCase();
            if (!o.description || (side !== 'yes' && side !== 'no') || !Number.isFinite(o.price)) continue;
            const x = mine.get(o.description) ?? { name: o.description };
            x[side] = american(o.price);
            mine.set(o.description, x);
          }
          continue;
        }
        const stat = API_MARKETS[sport][m.key];
        if (!stat) continue;
        if (b.key === BOOK) dkMarkets.add(m.key);
        for (const o of m.outcomes ?? []) {
          const key = `${o.description}|${stat}|${o.point}`;
          const x = lines.get(key) ?? { name: o.description, stat, line: o.point };
          x[String(o.name).toLowerCase()] = american(o.price);
          lines.set(key, x);
        }
      }
    }
  }
  // (a player's main line: of those with both sides, the one nearest even (mainRung's rule; the first such took alt
  // rungs where the book lists several))
  const main = new Map();
  const even = (x) => Math.abs(fairPair(x.over, x.under) - 0.5);
  const best = new Map();
  for (const [key, x] of books.get(BOOK) ?? []) {
    const k = `${x.name}|${x.stat}`;
    if (x.over && x.under && (!best.has(k) || even(x) < even(best.get(k)[1]))) best.set(k, [key, x]);
  }
  for (const [key, x] of best.values()) {
    const pairs = [...books].filter(([k]) => k !== BOOK).map(([, lines]) => lines.get(key)).filter((y) => y?.over && y?.under).map((y) => [y.over, y.under]);
    main.set(`${x.name}|${x.stat}`, { ...x, consensus: consensusOf(pairs, [x.over, x.under], ['over', 'under']) });
  }
  main.dkMarkets = [...dkMarkets];
  main.anytime = new Map();
  for (const [name, x] of anyBooks.get(BOOK) ?? []) {
    if (!x.yes) continue;
    const pairs = [...anyBooks].filter(([k]) => k !== BOOK).map(([, m]) => m.get(name)).filter((y) => y?.yes && y?.no).map((y) => [y.yes, y.no]);
    main.anytime.set(name, { ...x, consensus: consensusOf(pairs, x.no ? [x.yes, x.no] : null, ['over', 'under']) });
  }
  return main;
}

// ESPN's board with The Odds API's lines and prices on it, where the API has the player: its line and both
// prices replace the board's (the same book's, fresher, and the NFL's with prices at all); the other books'
// consensus at its line kept beside them, the data's (none without enough books)
export function withApiPrices(board_, api) {
  if (!api) return board_;
  return board_.map((p) => {
    const x = api.get(`${p.athlete.name}|${p.stat.key}`);
    return x ? { ...p, line: x.line, prices: { over: x.over, under: x.under }, source: 'the odds api', ...(x.consensus ? { consensus: x.consensus } : {}) } : p;
  });
}

// A player's main line for a stat from his board items (ESPN's: each { current: { target: { value } }, odds }): of
// the rungs priced both ways, the one nearest even (its over's fair chance nearest 0.5; the loss review's B3: the
// most-listed rule took alt rungs, Marner's points under 1.5 at -208 and Connor's over 1.5 at +165 where 0.5 was
// the main); none priced (the NFL's board), the one listed most, the middle one at a tie.
// { line, ladder: [{ line, prices }] }, every rung he's listed at
export function mainRung(list) {
  const counts = new Map();
  for (const it of list) counts.set(it.current.target.value, (counts.get(it.current.target.value) ?? 0) + 1);
  const ladder = [...counts.keys()].sort((a, b) => a - b).map((l) => ({ line: l, prices: pricesOf(list.filter((x) => x.current.target.value === l)) }));
  const priced = ladder.filter((x) => x.prices).map((x) => ({ x, d: Math.abs(fairPair(x.prices.over, x.prices.under) - 0.5) }));
  if (priced.length) return { line: priced.sort((a, b) => a.d - b.d || a.x.line - b.x.line)[0].x.line, ladder };
  const lines = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const top = lines.filter((l) => l[1] === lines[0][1]).map((l) => l[0]);
  return { line: top[Math.floor((top.length - 1) / 2)], ladder };
}

// A game's main-line player props: [{ athlete, stat, line, open, prices, ladder }] (every page of the board)
export async function board(sport, league, game) {
  if (!ESPN_PROVIDER[BOOK]) return [];
  const [kind, lg] = league.split('/');
  const items = [];
  for (let page = 1; page <= 5; page++) {
    const body = await get(`${CORE}/${kind}/leagues/${lg}/events/${game.id}/competitions/${game.id}/odds/${ESPN_PROVIDER[BOOK]}/propBets?lang=en&region=us&limit=1000&page=${page}`);
    if (!body?.items) break;
    items.push(...body.items);
    if (page >= (body.pageCount ?? 1)) break;
  }
  const groups = new Map();
  for (const it of items) {
    const st = STATS[sport].find((s) => s.match.test(it.type?.name ?? ''));
    const ref = it.athlete?.$ref;
    const line = it.current?.target?.value;
    if (!st || !ref || !Number.isFinite(line)) continue;
    const key = `${ref}|${st.key}`;
    groups.set(key, [...(groups.get(key) ?? []), it]);
  }
  const out = [];
  await pool([...groups.entries()], 4, async ([key, list]) => {
    // (the main line, mainRung's; the ladder's rungs kept for the close (clv.mjs propCloseOf))
    const { line, ladder } = mainRung(list);
    const at = list.filter((x) => x.current.target.value === line);
    const it = at[0];
    const who = await athlete(key.split('|')[0], [String(game.home), String(game.away)]);
    if (!who) return;
    // (the open price, where the line hasn't moved from its open: each side's odds.american.open, the over's fair
    // chance with the vig out (openFair); a line that moved, or a board without prices (the NFL's), none)
    const openP = at.every((x) => x.open?.target?.value === line) ? pricesOf(at.map((x) => ({ odds: { american: { value: x.odds?.american?.open } } }))) : null;
    out.push({ athlete: who, stat: STATS[sport].find((s) => s.key === key.split('|')[1]), line, open: it.open?.target?.value ?? null, prices: pricesOf(at), ladder, ...(openP ? { openFair: fairPair(openP.over, openP.under) } : {}) });
  });
  saveAthletes();
  return out;
}

// ---------------------------------------------------------------------------
// Pricing and betting a game's props
// ---------------------------------------------------------------------------

// A player's id in the rows (ESPN's for the NFL, NBA and NHL; StatsAPI's for MLB, by his name and team)
export function rowsIndex(sport, rows) {
  // (MLB by name key and team, then the name key alone where it's one player's: an accent or a suffix ESPN
  // writes and StatsAPI doesn't, or the other way, doesn't lose him)
  const byName = new Map();
  const one = (k, pid) => byName.set(k, byName.get(k) === undefined || byName.get(k) === pid ? pid : null);
  if (sport === 'mlb') for (const r of rows) byName.set(`${nameKey(r.name)}|${r.team}`, r.pid), one(nameKey(r.name), r.pid);
  const pos = new Map(rows.map((r) => [r.pid, r.pos]));
  const names = new Map(rows.map((r) => [String(r.pid), r.name]));
  return {
    pid: (a) => (sport === 'mlb' ? (byName.get(`${nameKey(a.name)}|${a.team}`) ?? byName.get(nameKey(a.name)) ?? null) : a.id),
    pos: (pid) => pos.get(pid) ?? null,
    name: (pid) => names.get(String(pid)) ?? null,
  };
}

// The prop bets for a coming game: each main line projected and priced, the ones with an edge, best first, at
// most PER_GAME. exp: the game model's expectation (its homePts and awayPts); info: the context's info for the
// game; live: the game's live facts (injury report, probables, lineups); trust: prop type to trust; play: the
// NFL's questionable players' chance of playing (playchance.mjs: a table fit on the seasons before), null for
// every questionable one at half (run.mjs passes none before the final injury report: playchance.mjs playAt)
// (an MLB starter's expected outs from the outs model on the same row (its matchups' live fields are the pitcher's
// own: his leash, rest, the lineup he faces), as priceProps makes a mean before the team allocation (MLB has none):
// the usage behind a strikeouts row (usage.mjs, D41); null with no outs fit or no projection)
function pitcherOuts(f, row, info, pts, home) {
  if (!f?.model || !row) return null;
  const p = f.model.project(row);
  if (!p) return null;
  const scriptV = scriptValue(f.stat, f.env, info, pts, home, f.params.mk ?? 0, row.mkt);
  const ctxF = ctxFactor(f.stat, f.params, ctxValues(ctxKeys(f.stat), info, home, pts, row));
  const raw = factorProduct(f.params, { ...p, script: scriptV, ctxF });
  return Math.max(0.05, (f.params.scale ?? 1) * raw * middleF(f.params, raw));
}

export function priceProps(sport, game, props, fitted, idx, exp, info, live, trust, evScale, play = null, players = null, calib = null, roleGate = null, roleLimits = null, correction = null, anchor = null) {
  const priced = [];
  // (the role guard's settled absences logged, by game and player: once each)
  const settledLogged = new Set();
  // (the players with a prop on this game's board, by id, and each team's quarterbacks among them (the NFL's
  // role guard: a change at quarterback))
  const onBoard = new Set();
  // (each listed player's team, for the missing-prop read below (D45): a regular at the position with no prop while
  // PLAY_MISSING_MIN teammates there have one)
  const boardTeam = new Map();
  const boardQbs = new Map();
  // (a CHECK's prop the board doesn't show, priced from its stored prices (checks.mjs withStoredPrices): not
  // the board's, so it changes no one's role)
  for (const x of props) {
    if (x.stored?.offBoard) continue;
    const id = idx.pid(x.athlete);
    if (!id) continue;
    onBoard.add(String(id));
    boardTeam.set(String(id), String(x.athlete.team));
    if (sport === 'nfl' && (idx.pos(id) ?? x.athlete.pos) === 'QB') {
      const t = String(x.athlete.team);
      if (!boardQbs.has(t)) boardQbs.set(t, new Set());
      boardQbs.get(t).add(String(id));
    }
  }
  for (const prop of props) {
    const f = fitted[prop.stat.key];
    if (!f) continue;
    const a = prop.athlete;
    const pid = idx.pid(a);
    if (!pid) continue;
    const home = String(a.team) === String(game.home) ? true : String(a.team) === String(game.away) ? false : null;
    if (home === null) continue;
    // (MLB: his position by the prop, a two-way player's rows being both a batter's and a starter's)
    const pos = sport === 'mlb' ? (prop.stat.pitcher ? 'SP' : 'B') : (idx.pos(pid) ?? a.pos);
    // (a quarterback with a prop on the board taken as his team's starter (qbStart: the history's passer), his
    // projection from his starts where the fit kept it; one who isn't is the role guard's backup-qb CHECK)
    const row = { pid, name: a.name, pos, date: game.date, season: game.season, team: home ? game.home : game.away, opp: home ? game.away : game.home, game: game.id, home, s: {}, mkt: exp.market ?? null, mTotal: Number.isFinite(exp.marketTotal) ? exp.marketTotal : null, mktSpread: Number.isFinite(exp.marketSpread) ? exp.marketSpread : null, ...(sport === 'nfl' && pos === 'QB' ? { qbStart: true } : {}) };
    // (his role and the defense's funnel, pace and target split, as of now; and the work his position group's
    // regulars missing this game leave: out, doubtful or on IR on the injury report, or no longer on the team's
    // roster (traded, released: the history counts them missing from its games, so the price does too), a
    // questionable one by his chance of missing it (the NFL's play chance table where it was fit, by his
    // position and his team's games he's missed in a row: playchance.mjs; else half); MLB's, his place in the
    // posted lineup and the probable starters (extra))
    // (and on the roster but not playing: its injured reserve, PUP, NFI or suspended (espn.mjs roster's out: the
    // weekly report drops a player once he's on IR), and, the NFL's, a regular who's missed his team's last two
    // games or more and isn't on the injury report at all (matchups.mjs absent): missing, as the history counts a
    // player not in a game's logs, so the price and the fit see one thing)
    const out = outOf(sport, live, row.team, row.pos);
    const roster = live?.rosters?.get?.(String(row.team)) ?? null;
    const rosterOut = roster?.out instanceof Map ? roster.out : new Map();
    const listed = new Set((live?.injuries?.get(String(row.team)) ?? []).map((x) => String(x.id)));
    // (an absent regular with a prop of his own on this game's board isn't missing: the book expects him to
    // play, a starter activated off IR with no designation most often. And where the injury report lists a
    // player, its status is his (one questionable on the roster's IR, designated to return, at half), the
    // roster's out group only for the ones it doesn't)
    const absent = sport === 'nfl' ? (f.matchups?.absent?.(row.team, game.season) ?? new Map()) : new Map();
    const unlisted = new Map([...absent].filter(([id]) => !listed.has(id) && !rosterOut.has(id) && !onBoard.has(id)));
    const gone = (id) => (rosterOut.has(String(id)) && !listed.has(String(id))) || unlisted.has(String(id));
    // (missOf(q): q a number, every questionable one at it (0 or 1: the guards' either way), or each one's own
    // (qMiss: his chance of missing it; the table's for a regular at his position (matchups.mjs regulars: the
    // work the vacated term counts, the lead back among them), as it's fit on the regulars' reports; half for
    // the rest, a quarterback too (the table's side for them is at half))
    const qPos = new Map((live?.injuries?.get(String(row.team)) ?? []).filter((x) => x.id).map((x) => [String(x.id), x.pos]));
    const regsAt = new Map();
    const isReg = (id, p) => {
      if (!regsAt.has(p)) regsAt.set(p, new Set((f.matchups?.regulars?.(row.team, game.season, p) ?? []).map((x) => String(x.id))));
      return regsAt.get(p).has(String(id));
    };
    const qMiss = (id) => {
      if (!play || sport !== 'nfl') return 0.5;
      const p = idx.pos(id) ?? idx.pos(String(id)) ?? qPos.get(String(id));
      // (his practice status this week where the live read has it (playchance.mjs nflPractice, D45): the table's
      // practice level)
      return missChance(play, { pos: p, gone: f.matchups?.goneOf?.(row.team, game.season, id) ?? null, regular: isReg(id, p), practice: live?.practice?.get?.(String(id)) ?? null });
    };
    // (the missing-prop signal (D45, board-miss.mjs): a regular at the position with no prop on this game's board while
    // PLAY_MISSING_MIN teammates at his position group have one, the NFL's, with the rates read: his chance of missing
    // the game by his report status (none, questionable) in place of 0 or the table's; a guard's fixed view (q a
    // number) as it was. Logged once a game and player)
    const listedMates = (team, p) => [...onBoard].filter((id) => boardTeam.get(id) === String(team) && groupOf(sport, idx.pos(id) ?? '') === groupOf(sport, p)).length;
    const boardMissing = (id, p) => sport === 'nfl' && !!live?.boardMiss && !!p && !onBoard.has(String(id)) && isReg(id, p) && listedMates(row.team, p) >= PLAY_MISSING_MIN;
    const missOf = (q) => (id) => {
      const sid = String(id);
      if (out.ids.has(sid) || gone(id) || (roster && !roster.has(sid))) return 1;
      const p = idx.pos(id) ?? idx.pos(sid) ?? qPos.get(sid);
      const missing = boardMissing(id, p);
      const bm = missing ? boardMissChance(live.boardMiss, out.questionable.has(sid) ? 'q' : 'none', true) : null;
      if (bm !== null && !settledLogged.has(`${game.id}:${sid}:board`)) {
        settledLogged.add(`${game.id}:${sid}:board`);
        console.log(`${sport}: ${idx.name?.(id) ?? sid} (${p}) has no prop on the board while ${listedMates(row.team, p)} teammates at the position do: ${Math.round(bm * 100)}% to miss ${game.awayAbbr} @ ${game.homeAbbr} (${out.questionable.has(sid) ? 'questionable' : 'not on the report'}; D45)`);
      }
      if (out.questionable.has(sid)) return typeof q === 'function' ? (bm ?? q(id)) : q;
      if (bm !== null) return typeof q === 'function' ? bm : q;
      return 0;
    };
    // (their names among the ones out at his position whose work counts (its regulars): the write-up's and the
    // CHECK's words)
    const atPos = (p) => !p || groupOf(sport, p) === groupOf(sport, row.pos);
    const regs = new Set((f.matchups?.regulars?.(row.team, game.season, row.pos) ?? []).map((x) => x.id));
    // (an absent one named only while he's on the roster: one who's left isn't 'out', his work counted
    // missing all the same)
    for (const [id, x] of rosterOut) if (!listed.has(String(id)) && regs.has(String(id)) && atPos(x.pos) && x.name && !out.names.includes(x.name) && String(id) !== String(pid)) out.names.push(x.name);
    for (const [id, x] of unlisted) {
      const nm = idx.name?.(id);
      if (nm && (!roster || roster.has(id)) && atPos(x.pos) && !out.names.includes(nm) && String(id) !== String(pid)) out.names.push(nm);
    }
    // (and the other side's players missing it (the opponent's key defenders out, audit #15: oppMissOf)
    const oppMiss = oppMissOf(sport, live, row.opp);
    // (and his team's roster by position, with the game's board: the newcomers in the work's pool (matchups.mjs
    // vacated's present, D35: a regular gone since last season netted against the ones brought in); no roster
    // read, none)
    const present = roster?.info instanceof Map ? new Map([...roster.info].map(([id, x]) => [id, x.pos])) : null;
    const extra = { live, game, home, pitcher: !!prop.stat.pitcher, oppMiss, present, board: onBoard };
    if (f.matchups) Object.assign(row, f.matchups.live(pid, row.team, row.opp, row.pos, game.season, missOf(qMiss), extra));
    const p = f.model.project(row);
    if (!p) continue;
    // (the game script and the context: this game's, from the game model's expectation and its terms, and the
    // book's lines now (exp.market, marketPts: run.mjs) where the fit kept the market's (mk, mSpread))
    // (the same functions the history was fit with: envFor's)
    const pts = [exp.homePts, exp.awayPts];
    const scriptV = scriptValue(f.stat, f.env, info, pts, home, f.params.mk ?? 0, row.mkt);
    const ctxKeysOf = ctxKeys(f.stat);
    const ctxV = ctxValues(ctxKeysOf, info, home, pts, row);
    const ctxF = ctxFactor(f.stat, f.params, ctxV);
    // (and the pull toward the stat's typical projection where the fit kept it (project.mjs middleF, sl): on the
    // factors' product, before the lean, as the history's)
    const raw = factorProduct(f.params, { ...p, script: scriptV, ctxF });
    const slF = middleF(f.params, raw);
    const mu0 = Math.max(0.05, (f.params.scale ?? 1) * raw * slF);
    // (the team allocation where the fit kept it (tr): his team's sum, his teammates' latest projections by their
    // share of its last games, by project.mjs squadIn's rule as the history's: a regular at his chance of playing
    // tonight (missing, none; questionable, his chance); one under SQUAD_REG of its last games who played in its
    // latest in full, the injury report not read for him (the history can't tell his absences known before the game
    // from the coach's choice; the price kept the fit's); one back from an absence (a regular by his season's share)
    // at his season's share and his chance of playing, only with a prop of his own on this game's board (the book
    // expects him), else none as before; the rest none. His own at his projection tonight in full; its expected total
    // and the lines' implied points for his side, as the history's (project.mjs squadUp, squadSum). None of its games
    // this season learned: 1, the stat as without it. Left over: a regular resting or scratched off the injury report
    // counted live, the history knowing he sat)
    const missNow = missOf(qMiss);
    const S = f.params.tr && f.stat.team ? squadSum(f.model.squadMates?.(row.team, game.season) ?? null, pid, mu0 / (f.params.scale ?? 1), squadIn((x) => 1 - missNow(x.pid), (x) => (onBoard.has(String(x.pid)) ? 1 - missNow(x.pid) : 0))) : null;
    const sq = S ? { S, T: f.model.squad(row), T0: f.model.squad(row, true), m: squadMkt(row, f.env) } : null;
    const sqF0 = squadF(f.params, sq);
    // (mean-preserving where the fit is (project.mjs trn): over the history's latest mean of the factor, trNow)
    // (D50: a team whose allocation can't be read yet (its first games of a season) at the history's running mean of
    // the factor (trOpen), as the replay prices it; 1 where the stat isn't marked opener or the fit is from before it)
    const sqF = sqF0 !== 1 && f.params.trn ? sqF0 / (f.params.trNow ?? 1) : f.params.tr && !squadRead(f.params, sq) ? trOpenOf(f.params, null, true, f.stat) : sqF0;
    const mu = Math.max(0.05, mu0 * sqF);
    // (the usage on the row (usage.mjs, DECISIONS.md D41: usage first, rate second): the work the projection reads
    // for him tonight as one inspectable number, from the parts it was made with (the snap share, the targets, the
    // minutes, the time on ice, the lineup slot's plate appearances); an MLB starter's expected outs from the outs
    // model on the same row (a strikeouts row's usage is his start's length). On the projection, the ledger's bet
    // and picks.json (picks.mjs); nothing is priced off it that isn't priced already)
    const usage = usageOf(sport, f.stat, p, row, { outs: sport === 'mlb' && prop.stat.pitcher ? (prop.stat.key === 'outs' ? mu : pitcherOuts(fitted.outs, row, info, pts, home)) : null });
    // (a weather term the fit kept, at an outdoor game whose forecast failed: the projection can't see it)
    const weatherBlind = !!info?.weather?.missing && ctxKeysOf.some((k) => WEATHER_CTX.has(k) && f.params[`c_${k}`]);
    // (the lines' spread a term the fit kept (c_mSpread) at a game with no spread on the board: it'd read 0, a
    // pick'em's projection the history never had (every one of its games has its lines))
    const spreadBlind = !!f.params.c_mSpread && ctxKeysOf.includes('mSpread') && spreadOf(row) === null;
    // (the weather moving his projection 10% or more either way: a forecast's error grows with it, rain's
    // most of all, and the fit's sizes are from what fell, not what was forecast)
    const weatherF = ctxFactor(f.stat, f.params, ctxV.map((v, i) => (WEATHER_CTX.has(ctxKeysOf[i]) ? v : 0)));
    const weatherBig = Math.abs(Math.log(weatherF)) >= 0.1;
    // (the defense against his role this season, whether or not the projection weighs it: its allowed over
    // those players' usual, and its rank in the league, 1 the stingiest)
    let roleRank = null;
    let roleFactor = null;
    if (p.role) {
      const table = f.model.roleTable(p.roleKey ?? p.role, game.season);
      const at = table.findIndex((x) => String(x.opp) === String(row.opp));
      if (at >= 0) (roleRank = { rank: at + 1, of: table.length }), (roleFactor = table[at].factor);
    }
    // (the model's chances: over and under with a whole-number line's push out of both, and the push's own)
    // (with the early exit's mixture where the fit kept it (project.mjs exitMix: his short game's chance by his
    // position and role, a short last game, a first game back and his own, learned through the finals))
    const mix = exitMix(f.params, p);
    const chances = lineChances(prop.line, mu, f.params, mix);
    const pOver = chances.over;
    // (the fair chance: his own record at this line, this season and half of last; a game on the line, a push,
    // neither side's)
    let overs = 0;
    let n = 0;
    for (const [season, v] of f.values.get(pid) ?? []) {
      const w = season === game.season ? 1 : season === game.season - 1 ? 0.5 : 0;
      if (v === prop.line) continue;
      n += w;
      if (v > prop.line) overs += w;
    }
    const fairOver = (overs + 1) / (n + 2);
    // (its trust at its line's size: the stat's bucket's, held to the stat's own (desk.mjs bucketTrustOf: a low
    // line's own record against the book, 2026-10-18))
    const t = bucketTrustOf(trust, `prop:${prop.stat.key}`, prop.line);
    // (the book's prices where it gave them, its fair chance their vig taken out; else -110 a side, even)
    const book = prop.prices ? { over: prop.prices.over, under: prop.prices.under, fairOver: fairPair(prop.prices.over, prop.prices.under) } : { over: PROP_ODDS, under: PROP_ODDS, fairOver: 0.5 };
    // (the anchored projection (anchor.mjs, DECISIONS.md D33): the bot's mean pulled toward the mean the book's
    // line and price imply, by the stat's pull from the priced history (anchor.json, fit walk-forward by the gate;
    // 0 the bot's own number, where the evidence says its number beats the book's), the chance at the line the
    // stat's own shape at that mean. Everything below (the calibration, the trust, the guards, the pick) reads it
    // as the model's chance; the bot's own stays beside it (modelPure, projection.anchored). None where the
    // book's implied mean can't be had: the bot's own chance as before)
    const anch = anchoredChances(prop.line, mu, f.params, mix, book.fairOver, anchorEntry(anchor, prop.stat.key));
    const pA = anch ? anch.over : pOver;
    const pushA = anch ? anch.push : chances.push;
    // (each side at the trusted chance, the lean tapered past half of the prop's GAP as a game market's is
    // (desk.mjs chanceAt): the further the model is from the book, the less of it counts, so the stake shrinks
    // as the gap grows; its return with a push's stake back)
    // (each side's model chance with its spot's live calibration (calib.mjs: a small shift fit on the graded
    // props since the epoch, 0 till a spot's rows and its held-out gain bear it out); raw, the projection's)
    const cal = calSides(calib, prop.stat.key, prop.line, pA, pushA);
    const sides = [
      { side: 'over', model: cal.over, raw: pA, pure: pOver, cal: cal.so, fair: book.fairOver, odds: book.over },
      { side: 'under', model: cal.under, raw: 1 - pA, pure: 1 - pOver, cal: cal.su, fair: 1 - book.fairOver, odds: book.under },
    ];
    // (the learned correction where it's fit (correct.mjs, 2026-10-18): each side's chance the fit's, from the raw
    // model and the book's no-vig, the calibration inside it (its rows are the raw chances), the lean kept, cut,
    // or turned over by where the model has beaten the book; the trust no longer shrinks the chance, it sizes the
    // stake (trustedUnits). None (too few rows): the trusted chance as before)
    const corr = correctSides(correction, { sport, stat: prop.stat.key, line: prop.line, pOver: pA, fairOver: book.fairOver, overOdds: book.over, underOdds: book.under, home, hours: (Date.parse(game.date) - Date.now()) / 36e5 });
    // (the row as the residual model's ctx (residual.mjs hookChance; DECISIONS.md D32, on since the owner's O3 of
    // 2026-10-19): the side's own fair chance and its raw, the anchored chance pA, the one the model was fit on in
    // the priced history and the one the gate's replay hands it (the calibration and the trust stay outside the
    // lean it reads; the blend sits on the trusted chance, once), the Book's two prices, the start and the bet's
    // moment now. Only where the Book priced it: an assumed -110 is no price of the Book's to correct)
    const rctx = prop.prices && residOn() ? { sport, market: 'prop', stat: prop.stat.key, line: prop.line, overOdds: book.over, underOdds: book.under, t: Date.parse(game.date), at: Date.now(), home, hours: (Date.parse(game.date) - Date.now()) / 36e5 } : null;
    for (const x of sides) {
      x.p = corr ? corr[x.side] : chanceAt('prop', x.fair, x.model, t, rctx && { ...rctx, side: x.side, f: x.fair, raw: x.raw });
      // (the trusted chance before the residual blend, kept beside it: the board and the report read the move)
      x.pTrust = corr || !rctx ? null : chanceAt('prop', x.fair, x.model, t);
      x.ev = (1 - pushA) * (x.p * decimal(x.odds) - 1);
      x.edge = x.p - x.fair;
    }
    // (the mean the book's price implies at its line (impliedMean; none at an assumed -110: it says nothing of
    // his role, only that the price is unknown): the role guards' line reasons, a CHECK's, and every priced
    // prop's ratio to the model's (projection.lineRatio: selfcheck.mjs C20)). On the plain shape, never the early
    // exit's mixture (exitMix): a high chance of a short game sets the mixture's median under its mean, so the
    // book's line read through it implies a larger mean (about 25% at a chance of 0.5) and the role guard's 0.6
    // slips to about 0.48 for the very players it's for: questionable, back from injury, short last game (review
    // of 6c51e015). The mixture prices the line (lineChances) and nothing else)
    const impliedNow = prop.prices ? impliedMean(prop.line, book.fairOver, f.params) : null;
    // (the guard's first reading: his status (statusOf); the line alarm reads it too)
    const status = statusOf(sport, prop, live, home, game);
    // (the NFL: his role changing (roleChangeOf): kept as a CHECK on the model's side, never bet either way)
    let roleChange = null;
    // (how surely his team's lead quarterback is missing tonight (0 to 1): the news dedupe below)
    let qb1Missing = 0;
    if (sport === 'nfl' && f.matchups) {
      const qb1 = f.matchups.qb1?.(row.team, game.season) ?? null;
      qb1Missing = qb1 ? Number(missOf(0)(qb1.id)) || 0 : 0;
      // (his position's work alone, the guard's words: the learned split (project.mjs vl, across positions) read
      // as the split in proportion here)
      const vs0 = plainVs(prop.stat, f.params.vs);
      const vacOut = f.matchups.live(pid, row.team, row.opp, row.pos, game.season, missOf(0), extra).vacs?.[vs0] ?? 0;
      // (the absence already in his recent games (settledAbsenceOf): no group-out, part-time or promoted back's
      // receiving CHECK; a snap jump already two games old (snapSettledOf): no snap-jump. Each skip logged once a
      // player, game and cause, so the CHECKs it clears can be counted)
      const ab = vacOut > 0 ? (f.matchups.absenceGames?.(pid, row.team, game.season, row.pos, missOf(0)) ?? null) : null;
      const settled0 = settledAbsenceOf({ vacOut, ab });
      const settled = settled0 ? { ...settled0, names: ab.ids.map((id) => idx.name?.(id) ?? id).join(', ') } : null;
      const skips = [];
      roleChange = roleChangeOf({
        name: a.name,
        pos: row.pos,
        pid,
        qb1: qb1 ? { ...qb1, name: idx.name?.(qb1.id) ?? null, missing: missOf(0)(qb1.id) } : null,
        boardQbs: boardQbs.get(String(row.team)) ?? null,
        vacOut,
        settled,
        skips,
        snap: row.snap ?? null,
        mu,
        r: rAt(f.params, mu),
        // (a quarterback's starts before tonight, all his seasons': a few-start one's a CHECK)
        starts: row.pos === 'QB' ? (p.careerStarts ?? null) : null,
        rushing: /^rush/.test(prop.stat.key),
        // (the line's read only at the book's own price: an assumed -110 says nothing of his role, only that the
        // price is unknown)
        implied: impliedNow,
        // (the role guard's thresholds with check-learn's loosenings applied softly (check-learn.mjs loosenings))
        role: roleLimits ?? ROLE,
      });
      // (a back projected in the role he steps into (project.mjs rp kept, p.role over his own): his receiving
      // ran high there in the role backtest (2026-10-12, promoted backs' receptions -7.2%, held out -9.3% on
      // 39 rows), the other way from group-out's safe over, so neither side is safe: both CHECKs till the rows
      // say otherwise)
      // (not where the absence is settled: he's played through it in the role he steps into, his receiving there
      // in his recent numbers)
      const promoted = /^RB/.test(p.role ?? '') && row.role && p.role !== row.role && /^rec|^rushRec/.test(prop.stat.key);
      if (promoted && settled) skips.push({ key: 'promoted', why: `absence not new: ${settled.n} game${settled.n === 1 ? '' : 's'} already without ${settled.names} (his work ${settled.work} a game there, ${settled.pre} before, ${settled.need} needed)` });
      for (const k of skips) {
        if (settledLogged.has(`${game.id}:${pid}:${k.key}`)) continue;
        settledLogged.add(`${game.id}:${pid}:${k.key}`);
        console.log(`${sport}: role CHECK (${k.key}) skipped for ${a.name} (${game.id}): ${k.why}`);
      }
      if (promoted && !settled) {
        roleChange = { ...(roleChange ?? { key: 'group-out', why: `${a.name || 'he'} stepping up to ${p.role} with the back above him out: a promoted back's receiving` }), safe: null };
      }
      // (the depth chart against the model's role (depthRoleOf, live only: the site's charts, live.depth), where
      // nothing above said his role's changing)
      roleChange ??= depthRoleOf({ pos: row.pos, pid, team: row.home ? game.homeAbbr : row.home === false ? game.awayAbbr : null, stat: prop.stat.key, depth: live?.depth, missOf: missOf(0), role: p.role, at: game.date });
    }
    // (the NBA's minutes base with teammates back from an absence that fed his minutes jump (minutesBackOf): a
    // role CHECK on the over, the under bet as any prop)
    if (sport === 'nba') roleChange ??= minutesBackOf({ name: a.name, mode: p.mode, minutes: p.minutes, vac: p.vac, vacHist: p.vacHist });
    // (the NHL's ice-time base after a jump in his time on ice, teammates back or not (iceJumpOf): a role CHECK on
    // the over, the under bet as any prop)
    if (sport === 'nhl') roleChange ??= iceJumpOf({ name: a.name, mode: p.mode, minutes: p.minutes });
    // (the NBA's posted starting five against his team's usual one by starts (lineupRoleOf; players: run.mjs
    // inactivesNow's, timing.mjs lineupNow): a role CHECK on the side its change makes the risk)
    if (sport === 'nba') roleChange ??= lineupRoleOf({ name: a.name, pid, usual: usualStarters(players, row.team, game.season), starters: live?.gameRosters instanceof Map ? (live.gameRosters.get(String(row.team))?.starters ?? null) : null });
    // (the NBA, NHL, MLB: the book's line far from the projection with a cause known before the game, unsized by
    // the fit, that explains it (lineAlarmOf): a label on the side against the market's reading, never a cut
    // (selfcheck.mjs C20 measures the labeled rows))
    const keptCtx = (k) => ctxKeysOf.includes(k) && !!f.params[`c_${k}`];
    const alarm =
      sport === 'nfl'
        ? null
        : lineAlarmOf({
            sport,
            name: a.name,
            mu,
            r: rAt(f.params, mu),
            implied: impliedNow,
            line: prop.line,
            status,
            b2b: info?.b2b?.[home ? 0 : 1] ?? 0,
            roleKnown: row.roleKnown ?? null,
            b2bSized: keptCtx('b2bS'),
            pitcher: !!prop.stat.pitcher,
            leash: row.leash ?? null,
            leashSized: keptCtx('leash'),
            rest: sport === 'mlb' && prop.stat.pitcher ? restGuard(row.restDays, row.debut, game.date) : null,
            restSized: keptCtx('restSp'),
            pitches: row.pitches ?? null,
          });
    // (the model too far from the book (the gap guard below, the same either side), or his role changing: the
    // model's own side, the one a CHECK keeps (checks.mjs; past the gap the lean is tapered to nothing, so the
    // better return is only the cheaper vig); else the better return)
    // (and his unit flagged by the news (news.mjs newsOn): a CHECK either side, the same way)
    // (round E, 2026-10-17: an injury headline (news.mjs kind 'injury': the QB ruled out) whose quarterback the official
    // report already has out (qb1Missing 1) is nothing the model hasn't read: the projection carries it (matchups.mjs
    // qb1Out, project.mjs c_qb1Out / c_qbDeep, the backup's starts base) and the role guard's qb1-out and backup-qb
    // hold the risky side; the headline alone made every offense prop a news CHECK on top of them (the Pierce rows
    // of the 10-17 audit). Not a news flag then; logged once a player and game)
    const newsFlag0 = newsOn(sport, live, row.team, row.pos);
    const newsDup = !!newsFlag0 && kindOf(sport, newsFlag0) === 'injury' && qb1Missing >= 1;
    if (newsDup && !settledLogged.has(`${game.id}:${pid}:news`)) {
      settledLogged.add(`${game.id}:${pid}:news`);
      console.log(`${sport}: news CHECK skipped for ${a.name} (${game.id}): the QB out is on the official report already (the projection and the role guard carry it): ${newsFlag0.headline}`);
    }
    const newsFlag = newsDup ? null : newsFlag0;
    const gapSide = gapGuard('prop', sides[0].model, sides[0].fair) || roleChange || newsFlag ? (sides[0].model - sides[0].fair >= 0 ? sides[0] : sides[1]) : null;
    const pick = gapSide ?? (sides[0].ev >= sides[1].ev ? sides[0] : sides[1]);
    // (the side the correction turned the pick to, against the raw model's: the skew guard reads the model's side,
    // not one the record chose)
    const turned = !!corr && !gapSide && pick.model - pick.fair < 0;
    const { side, model, ev: ev0, odds, fair, raw: modelRaw, pure: modelPure, cal: calShift } = pick;
    // (the other side's price, the book's (none at an assumed -110): the page shows both sides)
    const otherOdds = prop.prices ? (side === 'over' ? prop.prices.under : prop.prices.over) : null;
    // (the sanity guard, DECISIONS.md D23: no sane prop has an edge past the bar (desk.mjs suspectOf: points and SDs over its break-even). One that does is logged loudly,
    // its ev held to the bar (its rank with it) and its stake to the practice stake, a LIKE at most: never bet at size)
    const suspect = suspectOf(ev0, `${a.name} ${side} ${prop.line} ${prop.stat.key} (${game.id}): p ${round(pick.p, 4)}, the Book's no-vig ${round(fair, 4)}, the model ${round(model, 4)}${corr ? ', corrected' : ''}`, pick.p);
    if (suspect) console.warn(`${sport}: SUSPECT PRICE ${suspect.why}`);
    const ev = suspect ? heldEv(ev0) : ev0;
    const pTrusted = pick.p;
    // (the guard: his status (above), his line's move)
    const moved = prop.open !== null ? prop.line - prop.open : 0;
    const limit = Math.max(1, 0.12 * prop.line);
    // (the guard's words say the move's way: against the side (the market's money on the other one) or its way.
    // Both are cut: unlike the game lines' (desk.mjs guardOf, against alone), a prop moved its way is cut too.
    // Measured 2026-10-13 on every graded bet and CHECK (selfcheck.mjs C19, the record against the book's own
    // fair chance): neither way differs from the rest past noise (the NFL's prop bets moved against 23, 11 points
    // under the book's chance, their CHECKs moved against 87, 7 over; moved its way 15 bets 10 over, 55 CHECKs 3
    // over; the NHL's 10 and 15), so the guard stays both ways till C19 says otherwise. That measured the line's
    // move alone: the NHL's props sit at 0.5 and 1.5 and the market moves them by the price, so its 691
    // 'unmoved' bets hold every price-only move, and the NHL's figures don't test the question. The open price
    // is kept from 2026-10-13 (move.openFair, nowFair) for C19 to read; this guard still reads the line alone)
    // (a move the projection followed (moveFollowed, D31): the inputs' reason, priced, flagged and never a skip; the
    // rest twice the limit, a skip)
    const followed = Math.abs(moved) >= limit && moveFollowed({ open: prop.open, line: prop.line, mu, r: rAt(f.params, mu) });
    const movedSkip = Math.abs(moved) >= 2 * limit && !followed;
    const movedWhy = `line moved ${moved > 0 ? '+' : ''}${round(moved, 1)} since it opened${moved && (moved > 0) !== (side === 'over') ? ', against it' : moved ? ', its way' : ''}${followed ? `, his projection (${round(mu, 1)}) with it: the inputs' reason, priced` : ''}`;
    let guard = null;
    // (his group's missing work now against what it was in the games his numbers come from, where the
    // projection can't size it (the stat's fit left the term out, or has none): teammates out shift his role
    // up, and teammates back from an absence that fed his recent numbers shift it down)
    const vacNow = p.vac ?? 0;
    const vacThen = p.vacHist ?? 0;
    const sized = !!(prop.stat.vacated && f.params.vc);
    const vacUnsized = !sized && Math.abs(vacNow - vacThen) >= 0.25;
    // (a questionable teammate whose being in or out moves his share: the price takes him at his chance of
    // missing it, flagged where the share's swings, each questionable regular at his position's own (him in or
    // out, the rest at their chances) times his chance's spread (2 sqrt(m (1 - m)): 1 at half, as before), add
    // to 0.15 or more. Only the regulars at his position (the work the vacated term counts: one at another
    // position, a linebacker, a lineman, moves none of it); none of them questionable, no flag. With the learned
    // split kept (project.mjs vl: across positions), the regulars at the backs' and pass-catchers' positions)
    const vs = f.params.vs ?? 0;
    const qRegs = sport === 'nfl' && learnedVs(prop.stat, vs) ? new Set(['WR', 'TE', 'RB'].flatMap((q) => (f.matchups?.regulars?.(row.team, game.season, q) ?? []).map((x) => x.id))) : regs;
    const shareAt = (q) => f.matchups.live(pid, row.team, row.opp, row.pos, game.season, missOf(q), extra).vacs?.[vs] ?? 0;
    const qSwing = (id) => {
      const at = (v) => shareAt((x) => (String(x) === String(id) ? v : qMiss(x)));
      const m = qMiss(id);
      return Math.abs(at(1) - at(0)) * 2 * Math.sqrt(m * (1 - m));
    };
    const qShift = f.matchups && prop.stat.vacated && out.questionable.size ? [...out.questionable].filter((id) => qRegs.has(String(id)) && String(id) !== String(pid)).reduce((t, id) => t + qSwing(id), 0) : 0;
    // (his team's lead quarterback questionable (qb1Miss under 1), where a kept term reads him (c_qb1Out,
    // c_qbDeep: the backup's throws, a deep receiver's most): the price takes the backup at his chance of
    // missing it, a swing the role guard's qb1-out (out alone) never sees. Its swing on the log, him in or out
    // (the terms' values are linear in his chance), times his chance's spread (2 sqrt(m (1 - m)), as qSwing's),
    // 5% or more: flagged)
    const qbM = row.qb1Miss ?? 0;
    const qbF = qbM > 0 && qbM < 1 ? ctxFactor(f.stat, f.params, ctxV.map((v, i) => (QB_OUT_CTX.has(ctxKeysOf[i]) ? v : 0))) : 1;
    const qbSwing = qbF !== 1 ? (Math.abs(Math.log(qbF)) / qbM) * 2 * Math.sqrt(qbM * (1 - qbM)) : 0;
    // (his team's roster (the NFL's, the NBA's, the NHL's: espn.mjs ROSTER_MIN): without it a teammate who's
    // left counts as here, the work he leaves unseen)
    // A roster unread can only hide a teammate who's gone, so the work missing now reads low: where his
    // numbers were made with work missing (the cut then over the cut now by 0.1 or more), the term (or the
    // guard below) would take him down for a teammate who may never be back; skipped, flagged where it can't
    // move him
    const noRoster = !!ROSTER_MIN[sport] && !!prop.stat.vacated && !roster;
    const rosterBlind = noRoster && vacThen - vacNow >= 0.1;
    // (the NFL's snap counts missing for games of the history (playerlogs.mjs snapGap): those games hold only
    // the players who got the ball, the fit leaning over; a season's quarter or more of them, skipped)
    const snapGap = sport === 'nfl' ? f.snapGap : null;
    const gapped = gapGuard('prop', model, fair);
    const unpriced = prop.prices ? null : unpricedWhy(prop.line, fairOver);
    // (an MLB starter back from a layoff (his first start in LAYOFF days or more this season, or his first of
    // the season from May on): off the injured list most likely, his pitch count held down in a way his
    // numbers can't show; skipped. A long rest (LONG_REST days) or a first start of the season from LATE_DEBUT,
    // flagged)
    const rest = sport === 'mlb' && prop.stat.pitcher ? restGuard(row.restDays, row.debut, game.date) : null;
    const layoff = rest === 'layoff' || rest === 'debut';
    // (the other side's starter the projection weighs (the fit kept the term), not named yet: the NHL's goalie
    // (one expected counts: ESPN's usual word till the morning skate), MLB's pitcher; the context assumes one)
    const oppUnknown =
      (sport === 'nhl' && !!f.params.c_oppGoalie && !live?.[home ? 'away' : 'home']?.id) ||
      (sport === 'mlb' && !!f.params.c_oppSp && !live?.[home ? 'ap' : 'hp']);
    // (the role's risky side with its cause's gate on (roleGateOf): bet, not CHECKed (roleBet, below). The gap guard
    // doesn't hold it either: the role CHECKs the gate was graded on were made ahead of the gap guard, so they hold
    // the gapped rows (most of them: a role the book has read and the model hasn't is a gap), and the gap there is
    // the record's own case. Before, the gate let the role guard by and the gap guard took the row next, a PASS: no
    // gated cause was ever bet (the 10-17 slate's snap-jump and group-out rows). The guards after the gap's still read)
    const roleRisky = roleChange ? (roleChange.safe !== undefined ? roleChange.safe : ROLE_SAFE[roleChange.key] ?? null) !== side : false;
    const roleOn = !!roleChange && roleRisky && !!roleGate?.[roleChange.key]?.on;
    if (status.skip) guard = { skip: true, why: status.why };
    else if (layoff) guard = { skip: true, why: row.restDays >= LAYOFF ? `${a.name}'s first start in ${row.restDays} days: back from a layoff, his pitch count likely held down` : `${a.name}'s first start of the season: back from injury most likely, his pitch count likely held down` };
    else if (snapGap?.share >= 0.25) guard = { skip: true, why: `the snap counts missing for ${snapGap.games} games: the history holds only the players who got the ball` };
    else if (rosterBlind) guard = { skip: true, why: "his team's roster not read, and his numbers were made with teammates missing: whether they're back or gone can't be told" };
    // (his unit flagged by the news (news.mjs: a play-caller, a coordinator or the head coach changed, a
    // benching; the team's next NEWS_GAMES games): the book reprices that on the news and the model only on the
    // logs, either way, so neither side is bet; kind 'news', a CHECK on the model's side, the headline its
    // reason. As the role's, only when it's the news alone: one the skips below would take too (no price -110
    // can be, a long shot, a line moved twice the limit), skipped with both their words, no CHECK)
    else if (newsFlag) {
      const why = `news (${newsFlag.unit}): ${newsFlag.headline}`;
      const also = unpriced ?? (prop.prices && fair < 0.25 ? 'a long shot' : movedSkip ? movedWhy : null);
      guard = also ? { skip: true, why: `${why}; ${also}` } : { skip: true, kind: 'news', news: newsFlag.unit, why };
    }
    // (his role changing (the NFL's, roleChangeOf): the book reprices a role on the news and the model only on
    // the logs, so neither side is bet till the CHECKs show the model can read one; kind 'role', a CHECK. As
    // the gap's, only when it's the role alone: one the skips below would take too (no price -110 can be, a
    // long shot, a line moved twice the limit) is skipped with both their words, no CHECK, so the role
    // CHECKs are graded only at prices that can be known)
    // (only the risky side: the one the model's known error there could be making (ROLE_SAFE); its safe side
    // bets as any prop would)
    // (a cause the graded CHECKs say pays on the model's side (roleGateOf: ROLE_BET, 40 graded or more): not a CHECK,
    // bet at the untested cap's half (roleBet, below), the other guards still read)
    else if (roleChange && roleRisky && !roleOn) {
      const also = unpriced ?? (prop.prices && fair < 0.25 ? 'a long shot' : movedSkip ? movedWhy : null);
      guard = also ? { skip: true, why: `${roleChange.why}; ${also}` } : { skip: true, kind: 'role', role: roleChange.key, why: roleChange.why };
    }
    else if (vacUnsized && vacNow > vacThen) guard = { skip: true, why: `teammates out (${out.names.join(', ') || 'off the roster'}): a role change the Bot can't size` };
    else if (vacUnsized) guard = { skip: true, why: "teammates back from an absence that fed his recent numbers: a smaller role the Bot can't size" };
    // (no price from the book (the NFL's board without The Odds API's) where -110 can't be its price: his line
    // far from his usual (over it in under 40% or over 60% of his games), or a 0.5 line (one he clears most
    // games, or a touchdown's: priced long either way). Ahead of the gap guard, so the gap's CHECKs are only
    // the lines at an even price: kind 'unpriced', no CHECK)
    else if (unpriced) guard = { skip: true, kind: 'unpriced', why: unpriced };
    // (the model's chance far from the book's (desk.mjs GAP.prop): a gap that size is the market knowing
    // something the model doesn't, an injury, a role, a lineup, far more often than an edge)
    // A CHECK (kind 'gap') only when it's the gap alone: one the skips below would take too (a long shot, a
    // line moved twice the limit; a juiced price it can't know is the unpriced skip's, above) is skipped with
    // both their words, no CHECK, so the CHECKs' hit rate is the gap's
    else if (gapped && !roleOn) {
      const also = prop.prices && fair < 0.25 ? 'a long shot' : movedSkip ? movedWhy : null;
      guard = also ? { skip: true, why: `${gapped.why}; ${also}` } : { ...gapped, kind: 'gap' };
    }
    // (the side against its own projection: an under with the mean above the line, an over with it below. Its
    // edge comes only from the spread's assumed skew (lineChances' dispersion), not from anything the model
    // knows about him, and the held-out games show that skew leaning the props to the unders; skipped. pOver
    // calibrated by side (project.mjs cs) was tried on every stat (2026-10-12) and kept on none, and the held-out
    // sides taken against their own projection still won less than the model said with it (NFL rush+rec yards
    // 999 at lines from 5: said 53.8%, won 47.3%; by side 51.8%, 48.2%; NBA rebounds 52.9%, 46.8%), so the guard
    // stays. Those are the held-out check's lines (each player's median so far, project.mjs linePairs), not the
    // books': a book's line sits where the book puts it, nearer the projection or farther, so before the guard
    // is ever loosened it's confirmed on the desk's own graded props at the books' lines. Lines under SKEW_MIN_LINE left alone: a small count's skew is real (a 0.5
    // line's under can be the likelier side with the mean above it))
    else if (!turned && skewOnly(side, mu, prop.line)) guard = { skip: true, kind: 'skew', why: `the projection (${round(mu, 1)}) on the other side of the line from the ${side}: its edge only the spread's assumed skew` };
    // (a long shot at the book's own price: where a projection's errors are biggest and the book is most
    // likely right)
    else if (prop.prices && fair < 0.25) guard = { skip: true, why: `a long shot (the Book's fair chance ${Math.round(fair * 100)}%)` };
    else if (movedSkip) guard = { skip: true, kind: 'moved', why: movedWhy };
    else if (Math.abs(moved) >= limit) guard = { why: movedWhy };
    else if (status.why) guard = { why: status.why };
    else if (weatherBlind) guard = { why: 'no forecast for an outdoor game: the weather its projection weighs unseen' };
    else if (spreadBlind) guard = { why: "no spread on the board for the game: the betting lines' margin its projection weighs unseen" };
    else if (weatherBig) guard = { why: `the forecast moves his projection ${weatherF > 1 ? '+' : ''}${Math.round((weatherF - 1) * 100)}%: priced off a forecast` };
    else if (qShift >= 0.15) guard = { why: `teammate questionable (${out.qNames.join(', ') || 'at his position'}): his share depends on it` };
    else if (qbSwing >= QB_Q_SWING) guard = { why: `his starting quarterback questionable: the backup's throws in his projection at ${Math.round(qbM * 100)}%, his chance of missing it` };
    else if (oppUnknown) guard = { why: sport === 'nhl' ? "no probable goalie listed for the other side: his projection weighs one assumed" : "the other side's starting pitcher not named: his projection weighs him" };
    else if (snapGap?.games) guard = { why: `the snap counts missing for ${snapGap.games} games: the history holds only the players who got the ball there` };
    else if (rest === 'long') guard = { why: `${a.name}'s first start in ${row.restDays} days: his pitch count may be held down` };
    else if (rest === 'late') guard = { why: `${a.name}'s first start of the season, late: back from injury maybe, his pitch count may be held down` };
    else if (noRoster) guard = { why: "his team's roster not read: a teammate who's left can't be told from one who's here" };
    // (its projection with the fit's powers it was made with (applied: the scale, the weight on recent form,
    // the opponent's and the game script's, its context terms' sizes), so its write-up names each driver by
    // the effect it had: writeup.mjs)
    // (a CHECK's (the gap's, a role's, the news's, shown or a shadow: checks.mjs): the mean the book's price
    // implies at its line (impliedMean), beside the model's on the page and in its write-up; at an assumed -110
    // none)
    const implied = (guard?.kind === 'gap' || guard?.kind === 'role' || guard?.kind === 'news') && prop.prices ? impliedNow : null;
    // (a role bet (the CHECK bar by cause, roleGateOf): the risky side of a cause whose graded CHECKs pay, bet at most
    // ROLE_BET_UNITS; its cause and the record it rests on ride on the bet (run.mjs propBet context.roleBet). Its edge
    // is the gate's record, not its trusted chance: past the gap that is the book's, its return only the vig, so
    // run.mjs places a role bet as an edge whatever its ev)
    const roleBet = roleOn && !guard?.skip ? { key: roleChange.key, why: roleChange.why, gate: roleGate[roleChange.key].why } : null;
    priced.push({
      prop,
      pid,
      side,
      model,
      // (the model's chance before the live calibration, and its spot's shift, where it moved it: calib.mjs fits
      // on the raw one, never on itself)
      ...(Math.abs(model - modelRaw) > 1e-9 ? { modelRaw, cal: calShift } : {}),
      // (the bot's own chance beside the anchored one (D33): the raw above is the anchored chance the price reads;
      // its pull toward the book's implied mean, 0 the bot's own number)
      ...(anch ? { modelPure: round(modelPure, 4), anchor: { pull: anch.pull, mean: anch.mean, implied: anch.im } } : {}),
      fair,
      odds,
      otherOdds,
      priced: !!prop.prices,
      // (the trust it was priced at: a CHECK's cleared Kelly reads it, checks.mjs checkKelly)
      trust: t,
      p: pTrusted,
      ev,
      units: guard || suspect ? 0.5 : roleBet ? Math.min(ROLE_BET_UNITS, stakeFor(ev, evScale, odds)) : corr ? trustedUnits(stakeFor(ev, evScale, odds), t) : stakeFor(ev, evScale, odds),
      ...(suspect ? { suspect } : {}),
      // (its edge before the vig, the chance over the book's no-vig: the slate's practice picks rank by it (desk.mjs
      // practiceTop); whether the correction priced it, and turned its side; his side of the game, home or away)
      edge: pick.edge,
      ...(corr ? { corrected: true, ...(turned ? { turned: true } : {}), pTrust: chanceAt('prop', fair, model, t) } : {}),
      // (the residual model priced it (D32): the trusted chance it blended from, so the move it made is read)
      ...(!corr && Number.isFinite(pick.pTrust) && Math.abs(pick.pTrust - pick.p) > 1e-9 ? { resid: true, pTrust: round(pick.pTrust, 4) } : {}),
      home,
      guard,
      ...(roleBet ? { roleBet } : {}),
      // (both sides at their trusted chance, each its return: the board's (board.mjs), every side bettable)
      sides: sides.map((x) => ({ side: x.side, odds: x.odds, p: x.p, ev: x.ev })),
      projection: { mean: round(mu, 2), r: round(rAt(f.params, mu), 3), rate: round(p.rate, 2), recent: round(p.recent, 2), opp: round(p.opp, 3), posOpp: round(p.posOpp, 3), role: p.role, roleOpp: p.roleOpp === null ? null : round(p.roleOpp, 3), ...(p.role && row.role && p.role !== row.role ? { roleWas: row.role } : {}), ...(p.back ? { back: { game: p.back.k, missed: p.back.len, ramp: round(p.ramp, 3) } } : {}), roleFactor: roleFactor === null ? null : round(roleFactor, 3), roleRank, roleUsed: Number.isFinite(f.params.roleK), funnel: p.funnel === null ? null : round(p.funnel, 3), funnelUsed: !!f.params.fun, funnelF: round(p.funnelF, 3), paceF: round(p.paceF, 3), tgtF: round(p.tgtF, 3), vac: round(vacNow, 3), vacHist: round(vacThen, 3), vacF: round(p.vacF ?? 1, 3), ...(slF !== 1 ? { slF: round(slF, 3), sl: f.params.sl } : {}), ...(row.snap ? { snap: { last: row.snap.latest, avg: row.snap.avg } } : {}), ...(p.volume ? { volume: { targets: round(p.volume.targets, 2), share: round(p.volume.share, 3), teamTargets: round(p.volume.team, 1), perTarget: round(p.volume.perTarget, 3), weight: f.params.vol } } : {}), ...(p.mode ? { baseBy: p.mode, ...(p.share !== null ? { share: round(p.share, 3), ...(p.mode === 'minutes' ? { minutes: round(p.share * fullMin(f.stat), 1) } : {}) } : { starts: p.starts }) } : {}), ...(sqF !== 1 ? { squad: sq ? { sum: round(sq.S * (f.params.scale ?? 1), 2), team: round(f.params.tf === 4 ? sq.T0 : sq.T, 2), factor: round(sqF, 3), tr: f.params.tr, tf: f.params.tf } : { open: true, factor: round(sqF, 3), tr: f.params.tr, tf: f.params.tf } } : {}), out: out.names.length ? out.names : undefined, questionable: out.qNames.length ? out.qNames : undefined, qPlay: play && sport === 'nfl' && out.qNames.length ? Object.fromEntries((live?.injuries?.get(String(row.team)) ?? []).filter((x) => x.id && out.questionable.has(String(x.id)) && out.qNames.includes(x.name)).map((x) => [x.name, round(1 - qMiss(x.id), 2)])) : undefined, script: round(scriptV, 3), ...(f.params.mk && row.mkt ? { mk: f.params.mk, market: (home ? row.mkt : [...row.mkt].reverse()).map((x) => round(x, 1)) } : {}), ctx: Object.fromEntries(ctxKeysOf.map((k, i) => [k, round(ctxV[i], 2)])), ctxF: round(ctxF, 3), applied: { scale: f.params.scale ?? 1, w: f.params.w, a: p.oppA ?? f.params.a, b: f.params.b, ...Object.fromEntries(ctxKeysOf.map((k, i) => [`c_${k}`, f.params[`c_${k}`] ?? (i === 0 ? f.params.c : 0) ?? 0])) }, games: p.games, lastSeason: p.prevGames, ...(p.draft ? { draft: { pick: p.draft.pick, factor: round(p.draft.factor, 3), ...(p.draft.perTarget ? { perTarget: round(p.draft.perTarget, 3) } : {}) } } : {}), ...(Number.isFinite(p.priorW) ? { priorW: round(p.priorW, 3) } : Number.isFinite(p.K) && Number.isFinite(p.games) && p.K + p.games > 0 ? { priorW: round(p.K / (p.K + p.games), 3) } : {}), ...(sport === 'mlb' ? (prop.stat.pitcher ? { restDays: row.restDays ?? null, pitches: row.pitches?.length ? row.pitches : undefined } : { slot: row.slot ?? null }) : {}), ...(sport === 'nhl' && Number.isFinite(row.ppTime) ? { ppTime: round(row.ppTime, 2) } : {}), ...(row.qb1Miss > 0 ? { qb1Miss: round(row.qb1Miss, 2) } : {}), ...(mix ? { exit: { q: round(mix.q, 3), f: round(mix.f, 2) } } : {}), ...(usage ? { usage } : {}), pOver: round(pOver, 4), push: chances.push ? round(chances.push, 4) : undefined, ...(anch ? { anchored: { pOver: round(anch.over, 4), mean: anch.mean, pull: anch.pull, implied: anch.im } } : {}), ...(Number.isFinite(impliedNow) && mu > 0 ? { lineRatio: round(impliedNow / mu, 3), lineZ: round(lineZ(impliedNow, mu, rAt(f.params, mu)), 3) } : {}), ...(alarm && side !== alarm.safe ? { lineAlarm: { key: alarm.key, ratio: alarm.ratio, why: alarm.why } } : {}), fairOver: round(fairOver, 4), record: round(n, 1), ...(Number.isFinite(implied) ? { implied: round(implied, 2) } : {}) },
      // (the line's open and now; where the line hasn't moved and the open price was read (board), the over's
      // fair chance at the open and at the price bet (selfcheck.mjs C19: a price-only move, the NHL's at 0.5 and
      // 1.5 most of all, which the line alone doesn't see))
      move: prop.open !== null ? { open: prop.open, now: prop.line, ...(Number.isFinite(prop.openFair) && prop.open === prop.line && prop.prices ? { openFair: round(prop.openFair, 4), nowFair: round(book.fairOver, 4) } : {}) } : null,
    });
  }
  const bets = priced.filter((x) => !x.guard?.skip).sort((a, b) => b.ev - a.ev);
  return { priced, bets };
}

// (a team's players out for a coming game, by the injury report: out, doubtful, on IR or suspended; and the
// questionable ones, counted at half in the work his group is missing)
// (timing.mjs's patterns, the context's too: ESPN's NBA and NHL reports say Day-To-Day for questionable)
// (names: the ones in his group: the NFL's his position, the NHL's forwards or defensemen, the NBA's anyone)
const groupOf = (sport, pos) => (sport === 'nba' ? 'all' : sport === 'nhl' ? (/^(C|LW|RW|F|W)$/.test(pos) ? 'F' : pos) : pos);
// (the other side's players missing a coming game (the opponent's key defenders out, audit #15: matchups.mjs
// oppD, oppDB, oppFront), id to 0 to 1: the own side's precedence (priceProps gone): where its injury report lists
// a player, its status is his (out, doubtful or on IR 1, questionable half, any other 0), the roster's out group
// (injured reserve, PUP, NFI, suspended) 1 only for the ones it doesn't list; none read, none missing (the stat as
// without it). Known and unmeasured: no unlisted-absent rule for the other side, as the own side has (matchups.mjs
// defenseOut's note))
export function oppMissOf(sport, live, opp) {
  const out = outOf(sport, live, opp, null);
  const listed = new Set((live?.injuries?.get(String(opp)) ?? []).filter((p) => p.id).map((p) => String(p.id)));
  const rosterOut = live?.rosters?.get?.(String(opp))?.out;
  return (id) => {
    const k = String(id);
    if (out.ids.has(k)) return 1;
    if (out.questionable.has(k)) return 0.5;
    if (listed.has(k)) return 0;
    return rosterOut instanceof Map && rosterOut.has(k) ? 1 : 0;
  };
}

export function outOf(sport, live, team, pos) {
  const report = (live?.injuries?.get(String(team)) ?? []).filter((p) => p.id);
  const list = report.filter((p) => OUT_STATUS.test(p.status));
  const q = report.filter((p) => !OUT_STATUS.test(p.status) && Q_STATUS.test(p.status));
  const at = (p) => !pos || !p.pos || groupOf(sport, p.pos) === groupOf(sport, pos);
  return { ids: new Set(list.map((p) => String(p.id))), names: list.filter(at).map((p) => p.name), questionable: new Set(q.map((p) => String(p.id))), qNames: q.filter(at).map((p) => p.name) };
}

// (a player's status for a coming game: out, questionable, not in a posted lineup, not the probable starter)
function statusOf(sport, prop, live, home, game) {
  const a = prop.athlete;
  const report = live?.injuries?.get(String(a.team)) ?? [];
  const hurt = report.find((p) => p.id === a.id || p.name === a.name);
  if (hurt && /^out|doubtful|injured reserve|il$|-il|suspension/i.test(hurt.status)) return { skip: true, why: `${a.name} ${hurt.status.toLowerCase()}` };
  if (sport === 'nhl' && prop.stat.goalie) {
    const g = live?.[home ? 'home' : 'away'];
    if (!g) return { skip: true, why: 'no probable goalie' };
    // (the sources split on the side's goalie (context.mjs goalieOf): either one's saves priced, flagged (the
    // minimum stake: a guard's cut), his chance of starting by the sources' words; the book voids a saves prop
    // for one who doesn't start)
    if (g.split && (g.id === a.id || g.alt?.id === a.id)) {
      const share = g.id === a.id ? g.share : 1 - g.share;
      return { why: `${a.name} expected, not confirmed: the sources split (${g.name} or ${g.alt.name}), ${a.name} about ${Math.round(share * 100)}% to start` };
    }
    if (g.id !== a.id) return { skip: true, why: `${a.name} not the probable goalie` };
    if (!/confirmed/i.test(g.status ?? '')) return { why: `${a.name} expected, not confirmed` };
  }
  if (sport === 'mlb') {
    const names = live?.names ?? [];
    // (by name keys, ESPN's against StatsAPI's: an accent or a suffix doesn't make him someone else)
    if (prop.stat.pitcher && names[home ? 0 : 1] && nameKey(names[home ? 0 : 1]) !== nameKey(a.name)) return { skip: true, why: `${a.name} not the probable starter` };
    const lineup = live?.lineupNames?.[home ? 0 : 1];
    if (!prop.stat.pitcher && lineup?.length && !lineup.some((n) => nameKey(n) === nameKey(a.name))) return { skip: true, why: `${a.name} not in the posted lineup` };
    if (!prop.stat.pitcher && !lineup?.length) return { why: `lineup not posted (${home ? game.homeAbbr : game.awayAbbr})` };
  }
  if (hurt && Q_STATUS.test(hurt.status)) return { why: `${a.name} ${hurt.status.toLowerCase()}` };
  return {};
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

// A player's stat in a final, from its summary (and for MLB total bases, StatsAPI's box score): the number;
// null when he didn't play (no action); undefined when it can't be told yet (StatsAPI down, the NFL's snap
// counts not posted): the bet waits rather than being voided or graded on a guess. One who played but isn't in
// the stat's own table counts 0, not void (an NFL receiver with no targets, a back with no carries: listed in
// the box score's other tables, or on the field by nflverse's snap counts; only one who never took the field
// is no action, DraftKings' rule). opts.played(bet): for an NFL player in none of the box score's tables,
// whether he took a snap (true, false, or null: not known yet). opts.official: an NHL skater's shots and points
// by the league's own box (nhl-official.mjs officialLookup); opts.officialOnly: by it alone, undefined without it
export async function statInFinal(sport, bet, body, pk, opts = {}) {
  const id = String(bet.athlete);
  // (whether the box score lists him anywhere as having played; and in a batting table, for MLB)
  let listed = false;
  let batted = false;
  for (const p of body?.boxscore?.players ?? []) {
    for (const s of p.statistics ?? []) {
      const a = (s.athletes ?? []).find((x) => String(x.athlete?.id) === id);
      if (!a || !a.stats?.length || a.didNotPlay) continue;
      listed = true;
      if (s.type === 'batting' || s.name === 'batting') batted = true;
      const at = (k) => (s.labels ?? []).indexOf(k);
      const num = (k, part = 0) => Number(String(a.stats[at(k)] ?? '').split(/[-/]/)[part]) || 0;
      const k = bet.propType;
      if (sport === 'nfl') {
        if (s.name === 'passing' && ['passYds', 'passAtt', 'passCmp', 'passTd', 'passInt'].includes(k)) return { passYds: num('YDS'), passAtt: num('C/ATT', 1), passCmp: num('C/ATT', 0), passTd: num('TD'), passInt: num('INT') }[k];
        if (s.name === 'rushing' && (k === 'rushYds' || k === 'rushAtt')) return k === 'rushYds' ? num('YDS') : num('CAR');
        if (s.name === 'receiving' && (k === 'recYds' || k === 'rec')) return k === 'recYds' ? num('YDS') : num('REC');
        // (the anytime touchdown's parts: his rushing and his receiving touchdowns)
        if (s.name === 'rushing' && k === 'rushTd') return num('TD');
        if (s.name === 'receiving' && k === 'recTd') return num('TD');
        continue;
      }
      if (sport === 'nba') return { pts: num('PTS'), reb: num('REB'), ast: num('AST'), fg3: num('3PT'), pra: num('PTS') + num('REB') + num('AST') }[k];
      if (sport === 'nhl') {
        // (a saves prop has action only for the goalie who started, pulled or not: a reliever's is no action,
        // DraftKings' rule; the starter by the order they went in, espn.mjs goaliesInOrder)
        if (k === 'saves') return String(goaliesInOrder(s.athletes, body?.article?.story)[0]?.athlete?.id) === id ? num('SV') : null;
        // (shots and points: the league's own count once its box is official (nhl-official.mjs; opts.official,
        // its look-up), waiting while it isn't; ESPN's (its S, shots on goal) when the league's can't be had)
        if (opts.official) {
          const got = await opts.official(body);
          if (got?.wait) return undefined;
          const c = body?.header?.competitions?.[0]?.competitors ?? [];
          const side = c.find((t) => (p.team?.id != null && String(t.team?.id) === String(p.team.id)) || (p.team?.abbreviation && t.team?.abbreviation === p.team.abbreviation))?.homeAway;
          const line = got?.box && side ? officialLine(got.box, side === 'home' ? 'h' : 'a', a.athlete) : null;
          if (line) return k === 'sog' ? line.sog : line.goals + line.assists;
          // (the league's count or none: a regrade (run.mjs officialRegrade) never goes by ESPN's)
          if (opts.officialOnly) return undefined;
        }
        return k === 'sog' ? num('S') : num('G') + num('A');
      }
      if (sport === 'mlb') {
        if ((k === 'k' || k === 'outs') && (s.type === 'pitching' || s.name === 'pitching')) {
          const [w, part] = String(a.stats[at('IP')] ?? '0').split('.').map(Number);
          return k === 'k' ? num('K') : w * 3 + (part || 0);
        }
        if (k === 'hits' && (s.type === 'batting' || s.name === 'batting')) return num('H');
      }
    }
  }
  // (NFL rushing plus receiving: both tables, either one waiting holding the bet)
  if (sport === 'nfl' && bet.propType === 'rushRecYds') {
    const one = (k) => statInFinal(sport, { ...bet, propType: k }, body, pk, opts);
    const [r, c] = [await one('rushYds'), await one('recYds')];
    if (r === undefined || c === undefined) return undefined;
    return r === null && c === null ? null : (r ?? 0) + (c ?? 0);
  }
  // (the NFL's anytime touchdown (anytime.mjs): his rushing and receiving touchdowns, both tables, either one waiting
  // holding the bet; graded on its 0.5 line, over: 1 or more wins)
  if (sport === 'nfl' && bet.propType === ANY_KEY) {
    const one = (k) => statInFinal(sport, { ...bet, propType: k }, body, pk, opts);
    const [r, c] = [await one('rushTd'), await one('recTd')];
    if (r === undefined || c === undefined) return undefined;
    return r === null && c === null ? null : (r ?? 0) + (c ?? 0);
  }
  // (MLB total bases: StatsAPI's box score; one ESPN shows batting whom StatsAPI's can't be matched to waits)
  if (sport === 'mlb' && bet.propType === 'tb') {
    const tb = await mlbTotalBases(bet, pk);
    return tb === null && batted ? undefined : tb;
  }
  // (an NFL player in the box score's other tables played: 0 of this stat; in none, his snaps decide)
  if (sport === 'nfl') {
    if (listed) return 0;
    const played = opts.played ? await opts.played(bet) : null;
    return played === true ? 0 : played === false ? null : undefined;
  }
  return null;
}

// (a name as a key: accents, punctuation and suffixes off, "José Ramírez Jr." and "Jose Ramirez" the same)
export const nameKey = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '')
    .replace(/[^a-z]/g, '');

// (a batter's total bases from StatsAPI's box score: by his MLB id where the bet kept it (mlbId), else by his
// name, which must be one player's; null when he didn't bat, undefined when the box score can't be had)
async function mlbTotalBases(bet, pk) {
  if (!pk) return undefined;
  const box = await get(`https://statsapi.mlb.com/api/v1/game/${pk}/boxscore`);
  if (!box?.teams) return undefined;
  const all = ['home', 'away'].flatMap((side) => Object.values(box.teams[side]?.players ?? {}));
  let me = bet.mlbId ? all.find((pl) => String(pl.person?.id) === String(bet.mlbId)) : null;
  if (!me) {
    const named = all.filter((pl) => nameKey(pl.person?.fullName) === nameKey(bet.player));
    if (named.length > 1) return undefined;
    me = named[0] ?? null;
  }
  if (!me) return null;
  return me.stats?.batting?.plateAppearances ? (me.stats.batting.totalBases ?? 0) : null;
}

// Whether an NFL player took a snap in a game, by nflverse's snap counts (offense, defense or special teams):
// true or false once the game's counts are posted (a day or so after it), null before then or without the
// game's nflverse row (facts.nfl: ESPN game id to it). He's found by his ids (ESPN's, the bet's athlete, to
// Pro Football Reference's, the counts' own, by nflverse's player list): one the list maps and who isn't in
// the game's counts took no snap (false). One the list doesn't map is found by name, and not found that way is
// unknown (null: the bet waits, then is void), never false: a nickname (Gabe for Gabriel) isn't a player who
// sat, and a 0 he'd have been graded at only ever wins the under. Each season's counts, and the list, read once
// a run
const snapCounts = new Map();
let pfrOfEspn = null;
export async function nflTookSnap(facts, gameId, player, athleteId = null) {
  const row = facts?.nfl?.get?.(gameId);
  if (!row?.game_id || !row.season) return null;
  if (!snapCounts.has(row.season)) snapCounts.set(row.season, nflverseRows('snap_counts', `snap_counts_${row.season}.csv.gz`, ['game_id', 'player', 'pfr_player_id', 'offense_snaps', 'defense_snaps', 'st_snaps'], 6).catch(() => null));
  const rows = ((await snapCounts.get(row.season)) ?? []).filter((s) => s.game_id === row.game_id);
  if (!rows.length) return null;
  pfrOfEspn ??= nflverseRows('players', 'players.csv.gz', ['espn_id', 'pfr_id'], 24 * 7)
    .then((list) => new Map((list ?? []).filter((p) => p.espn_id && p.espn_id !== 'NA' && p.pfr_id && p.pfr_id !== 'NA').map((p) => [String(Number(p.espn_id)), p.pfr_id])))
    .catch(() => new Map());
  const pfr = athleteId === null || athleteId === undefined ? null : ((await pfrOfEspn).get(String(athleteId)) ?? null);
  const snapped = (s) => (Number(s.offense_snaps) || 0) + (Number(s.defense_snaps) || 0) + (Number(s.st_snaps) || 0) > 0;
  if (pfr) return rows.filter((s) => s.pfr_player_id === pfr).some(snapped);
  const me = rows.filter((s) => nameKey(s.player) === nameKey(player));
  return me.length ? me.some(snapped) : null;
}

// A prop bet graded: won, lost, pushed (on the line), or void (he didn't play: no action)
export function settleProp(bet, value) {
  if (value === null || value === undefined) return { status: 'push', profit: 0, void: true, actual: null, final: 'did not play' };
  const edge = (bet.side === 'over' ? 1 : -1) * (value - bet.line);
  return { ...outcomeOf(bet, edge), actual: value, final: `${bet.player} ${value} ${bet.statLabel}` };
}
