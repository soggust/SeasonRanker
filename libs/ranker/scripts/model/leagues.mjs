// The model desk's leagues: ESPN's path for each, and where its ratings start before the history fits them.
// Ratings are in the sport's own scoring unit (points, goals, runs): a team rated 3 better than another is
// expected to win by 3 on a neutral field.
//
//   k       how far one game's surprise moves a rating (share of the miss)
//   hfa     home advantage, in the unit
//   revert  how much of a rating carries into the next season (the rest drifts back to average)
//   kO      how far one game moves a team's scoring and allowing rates
//   sigma   spread of a game's margin around its expected margin (fit as the history's own)
//   sigmaT  spread of a game's total around its expected total
//   avg     a team's average score a game (the history keeps it current)
//
// context (context.mjs: the terms beyond the ratings, their sizes fit by the replay, not set here):
//   restCap  days of rest past which more counts no more (a season's first game counts as this)
// guard (the desk's caution, not fit yet: the ledger keeps what each bet saw so it can be): a line that's
// moved this far against the bet's side since it opened (spread or total in points, moneyline in the home
// side's fair chance: the market's money on the other side) cuts the bet to the 0.5-unit minimum, twice as far
// skips it; a move toward its side (the market agreeing) isn't held against it
// deepen   the season the history reaches back to (the NFL's older ones from nflverse)
//
// PROP_CAPS (props.mjs, run.mjs): how much the props may stake. untested: a prop type whose trust isn't fit
// yet (fewer than 40 graded): at most maxUnits a prop, perGame of them a game, perDay units of them a day in
// the sport, perPlayer of them a player a game (his best return: a player's props rise and fall together).
// tested: once its trust is fit (perDay null: no daily cap)
// GAME_CAP (run.mjs placeBets, desk.mjs capGame): the most units open on one game, its markets and props
// together (they rise and fall with the same game: a few bets on it are one big one); over it, the new bets
// scaled down alike, the least worth having dropped. Before it, a game's edge props sized jointly with its other
// props by their measured correlations in a game, a player's own props' and the rest's (desk.mjs sameGameOf,
// sizeJointly, placeGame: stakes only cut, never raised; a tracked row stakes nothing, so it's no exposure)
// BOOK: the one sportsbook the desk bets, for every market and prop: its lines and prices are the ones
// priced and placed (The Odds API's key for it; ESPN's free board, the fallback, is DraftKings' too)
export const BOOK = 'draftkings';

// (no count caps a game or a day: the user wants all the exposure the data can give, the money's play money;
// but one prop a player a game, and an untested type still stakes at most 1 unit a prop)
export const PROP_CAPS = {
  untested: { maxUnits: 1, perGame: null, perDay: null, perPlayer: 1 },
  tested: { maxUnits: 3, perGame: null, perDay: null, perPlayer: 1 },
};
export const GAME_CAP = 5;

// MODEL_EPOCH (run.mjs refitTrust): the model's latest major change. The trust is fit only on the live bets placed
// since (and the backtest's, which replays history with the model as it is now): a bet placed under an older
// model judges that model, not this one, so it stays on the record and in every tally but never moves the trust.
// Bump it (an ISO time) with every major change to the projections or the pricing; the trust starts over at its
// starting value until 40 of the new model's bets are graded. History: 2026-10-11, the leak fixes, the
// role-aware projections, the directional role guard and the lower bands. 2026-10-12, the receiving stats'
// opponent by position group (a_<group>), receiving yards' volume base (targets expected times yards a target),
// receptions' volume base off, the teams' news (a change of play-caller, coordinator or head coach, a benching:
// the unit's props CHECKs, the game's lines at the minimum) and the owner's notes on a team the same way, a
// late flag judged on its own rows; measured and left out: RB1 out, QB1 out, the draft's prior, a new head
// coach's first games, the weeks 5-8, the NHL's power-play share. 2026-10-12 later, the next man up (rp, nu:
// projected in the role he steps into, kept on receptions and rush+rec yards) and a promoted back's receiving
// CHECKed either side; measured and left out: the injury return (ij: its eligible returners pushed the other way).
// 2026-10-12 evening, the seasons' carryover (project.mjs pl: rushing yards' prior leaning to last season's last 8
// games, kept); measured and left out: sk (a part-timer's snaps prior), rx (the last five across seasons), pl
// elsewhere. 2026-10-12 night, the round's final pass: pl's lean on the work missing too (the prior leaning to last
// season's last 8 games leans vacHist's prior the same, so a late role a hurt starter left isn't counted twice;
// rushing yards' pl kept), on top of the CHECK rule (the gap's a PASS, a role's a CHECK only at a model Kelly of
// +10 or more, the rest graded shadows, the stored CHECKs judged by it too). 2026-10-13, audit round A's final
// pass: the pull toward the middle (sl: NFL passing TDs, MLB hits), the next man up's target floor (nt: receiving
// yards), the lines' spread on interceptions (c_mSpread), the back-to-backs (NBA points b2bB, pts+reb+ast b2bAll,
// NHL saves b2b), a questionable player's play chance (the NFL's table, a quarterback at half), the backup
// quarterback by the receiver's depth (c_qbDeep: receptions, rush+rec yards; a questionable starter flagged where it
// reads him), the depth chart as a role CHECK, and the line alarm outside the NFL (a label) with every line logged.
// 2026-10-13 noon, what's bet (the owner's): every bet a LIKE or better (LIKE opens to any edge, a Kelly over 0:
// picks.mjs BANDS), and a market with no edge (or one a guard cut), the old 0.5u action bet, tracked, not bet
// (desk.mjs TRACK: graded and learned from the same, never staked or in the record); a LOCK at a 55% chance (was
// 60%). Set to the push time, after the run that bet tonight's NHL under the old rules.
// 2026-10-14, audit round B (replayed onto the tracked rows, the flagged edge bets at the minimum and the other
// books' consensus), its terms kept together: the NBA's minutes first and its pace; the NHL's ice time first, its
// power-play lean and the team's expected shots; the NFL's expected plays (ep: passing attempts); the team's game
// first (tr: NFL carries, NBA assists; rushing yards off since its review); the start-of-season prior (sp: NFL
// rushing, receiving and rush+rec yards); the early exit (ex: receiving yards); same-game sizing (a game's edge
// props staked jointly, a player's own props' and the rest's correlations, each used only where held-out days
// bore it out; a tracked row in the fit as evidence, never as exposure); confirmed inactives and starting fives;
// the opponent's key defenders out; who absorbs the work missing (measured, off where not kept). Held out against
// round A's code on the same games: NBA points 0.6521 to 0.6466, rebounds 0.6338 to 0.6263, assists 0.6176 to
// 0.608; NHL shots 0.5885 to 0.5869; NFL passing attempts 0.6219 to 0.6208, carries 0.6305 to 0.6295, receiving
// yards 0.6497 to 0.6468; MLB as before.
// 2026-10-14 morning, the props' live calibration (calib.mjs: a small shift on the model chance by sport, stat,
// side and line class, fit every run on the graded props since the epoch, tracked rows among them; 0 under 300 rows
// a spot, shrunk, capped, moved a little a run, kept only where the newest rows bear it out) and the projection
// fits' recency weight (hl: kept on NFL passing yards and attempts).
// 2026-10-14, audit round C (each candidate a late term, kept only on a held-out gain of 0.0003 or more with the
// biases no larger: project.mjs ROUND_C): kept, the other side's posted lineup's strikeout rate on MLB strikeouts
// (lineupK 0.75, held out 0.6129 to 0.6042, +0.0087; a starter's props now wait for that lineup: timing.mjs) and the
// last regular-season game on NFL passing yards (lastGame -0.05, 0.6528 to 0.6521, +0.0007; its 106 rows 17.6 to 8.3
// yards over) and attempts (-0.05, 0.6208 to 0.6203, +0.0005). Measured and left out: the lineup against its usual
// and its on-base rate, the ballpark, plate appearances by slot and home, the temperature, the wind, home or away, the
// pull toward the middle on strikeouts and total bases; the NFL's own line changed, its pass rate over expected, a
// back's late load, a passing-down back by the script, week 18 elsewhere. The red-zone share not built (no field
// position in the kept play-by-play). Set to the push time.
// 2026-10-14, the park and air re-checked: the batter's environment as one term on MLB total bases (hitEnv, his
// ballpark against the parks his own rate was made in, plus the temperature and the wind out; 0.025, held out
// 0.632 to 0.6317, +0.0003, bias -0.0198 to -0.012). Left out on hits (+0.0002) and every term alone. Set to the
// push time.
// 2026-10-15, re-check of A/B/C terms (every family looked at again with the park re-check's lens: double counting,
// related terms one at a time, a real effect too small for the floor; each keep checked on other held-out stretches,
// the gate unchanged): the NBA's team allocation kept on points, rebounds, threes and pts+reb+ast (its every-player
// bias read in two parts, the eligible players' and the rest's, which had cancelled pooled: +0.0024 to +0.0052);
// NFL rush+rec yards' team allocation kept mean-preserving (0.1/3, +0.0012); the NFL history's lead QB out read from
// the injury reports and reserve list, as live play reads it (qbDeep refit on it: rush+rec yards -0.4, receptions
// -0.2; next man up off receptions as a knock-on). Removed as floor-level keeps that didn't hold on other
// stretches: NBA points' bench back-to-back, NBA rebounds' defense-table recency. The recency weight's floor now
// 0.0003 like every late term. Set to the push time.
// 2026-10-15 later, the soft terms (project.mjs softWeight): a late term the gate leaves out on its gain or the
// whole stat's bias alone now comes in at a weight from its held-out evidence (1 - 1/z^2, none unless both halves
// gained), moving at most 0.25 a day from the last run's (params.soft), kept only while the held-out log loss is
// lower with the set and the eligible players' and every player's bias no larger. Live on its first night: NFL
// receiving yards' and rush+rec yards' carryover (pl 0.25) at 0.25x (targets 0.73x and 0.95x); none elsewhere.
// Set to the push time.
export const MODEL_EPOCH = '2026-10-15T08:10:00Z';

// TIMING (run.mjs, timing.mjs): when a coming game is bet, in hours before its start, so its bets wait for the
// news rather than being locked in days ahead on a guess at who plays.
//   lines, props  the window: before it, the game's markets (or props) aren't priced or bet at all; inside it
//                 they're bet once the news each waits for is in (timing.mjs newsMissing: the NHL's probable
//                 goalies, MLB's probable starters and posted lineups; the NFL's and NBA's wait for the window
//                 alone, which opens after the injury report that counts: the NFL's final one, Friday's, by a
//                 Sunday game's Saturday afternoon; the NBA's game-day one)
//   lastChance    inside it, anything not bet yet is bet with whatever's known, the news it still lacks a
//                 flag that cuts it to the 0.5-unit minimum (the hourly runs come late or not at all at times:
//                 the window gives several runs to catch a game, the last chance at least two; and when the
//                 runs come further apart than it, the last chance stretches to 1.5 times their recent gap,
//                 12 hours at most: timing.mjs cadenceOf, lastChanceOf)
// A bet placed is priced again whenever what it was priced on changes before the start (timing.mjs inputsOf:
// the injury report's out and questionable lists, the starters, the goalies, the lineups, the NFL's and NBA's
// posted inactives, the NBA's starting five): taken back and placed again by the model as it is then, till
// REPRICE_BY (20 minutes) before the start. The NFL's inactives post about 90 minutes before a kickoff and a run
// prices again only after its fits (about 15 minutes in), so they count only when a run starts between about 90
// and 35 minutes before the kickoff (context.mjs LINEUP_HOURS: the windows in EDT and EST); GitHub runs the
// hourly schedule about five times a day, so that's when one happens to land there (the Sunday and night-game
// triggers in .github/workflows/model-desk.yml add tries). The NBA's starters, about 30 minutes before a tip,
// are almost never in time for a re-price
export const TIMING = {
  nfl: { lines: 26, props: 26, lastChance: 3 },
  nba: { lines: 6, props: 6, lastChance: 3 },
  nhl: { lines: 10, props: 10, lastChance: 3 },
  mlb: { lines: 6, props: 6, lastChance: 2.5 },
};

export const LEAGUES = {
  nfl: {
    league: 'football/nfl',
    label: 'NFL',
    deepen: 2016,
    context: { restCap: 10 },
    guard: { spread: 1.5, total: 2, ml: 0.06 },
    priors: { k: 0.08, hfa: 1.8, revert: 0.65, kO: 0.06, sigma: 13.5, sigmaT: 13.5, avg: 22.5 },
    grid: { k: [0.04, 0.06, 0.08, 0.11, 0.14], hfa: [0.8, 1.4, 2, 2.6], revert: [0.5, 0.65, 0.8], kO: [0.03, 0.05, 0.08, 0.12] },
  },
  nba: {
    league: 'basketball/nba',
    label: 'NBA',
    context: { restCap: 3 },
    guard: { spread: 2, total: 3, ml: 0.06 },
    priors: { k: 0.05, hfa: 2.4, revert: 0.7, kO: 0.03, sigma: 12.5, sigmaT: 18, avg: 113 },
    grid: { k: [0.02, 0.035, 0.05, 0.07, 0.1], hfa: [1.2, 1.9, 2.6, 3.3], revert: [0.5, 0.7, 0.85], kO: [0.01, 0.02, 0.035, 0.05] },
  },
  nhl: {
    league: 'hockey/nhl',
    label: 'NHL',
    context: { restCap: 3 },
    // (the puck line stays at 1.5, a side flipping it is the moneyline moving: no spread guard)
    guard: { spread: null, total: 1, ml: 0.06 },
    priors: { k: 0.04, hfa: 0.2, revert: 0.7, kO: 0.03, sigma: 2.3, sigmaT: 2.3, avg: 3.1 },
    grid: { k: [0.015, 0.025, 0.04, 0.06, 0.09], hfa: [0.05, 0.15, 0.25, 0.35], revert: [0.5, 0.7, 0.85], kO: [0.01, 0.02, 0.035, 0.05] },
  },
  mlb: {
    league: 'baseball/mlb',
    label: 'MLB',
    context: { restCap: 2 },
    guard: { spread: null, total: 1, ml: 0.06 },
    priors: { k: 0.025, hfa: 0.15, revert: 0.7, kO: 0.02, sigma: 4.2, sigmaT: 4.4, avg: 4.5 },
    grid: { k: [0.01, 0.018, 0.025, 0.035, 0.05], hfa: [0.05, 0.15, 0.25, 0.35], revert: [0.5, 0.7, 0.85], kO: [0.008, 0.015, 0.025, 0.04] },
  },
};
