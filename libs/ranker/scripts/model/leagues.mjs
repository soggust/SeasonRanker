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
// 2026-10-15 skeptic's review of the soft terms: a weight over 0.25 only where each held-out half shows the term on
// its own (z 1.5 or more in both; a shuffled-outcome refit let a pure-noise term in at 0.25x with a 0.89x target),
// and never the flags whose history reads the game's own box score or snap counts (olOut, rb1Out, aheadOut,
// oppOut, oppD, oppDB, oppFront). Set to the push time.
// 2026-10-15, the red zone (the owner's ask): each final's red-zone work read from the play-by-play's field position
// (football.mjs redZoneOf); a new tracked market, the NFL's anytime touchdown (anytime.mjs: a back's, receiver's or
// tight end's red-zone looks times their worth, his finishing, his long ones and the game's implied points; held out
// 0.4018 to 0.3974 against the same model without the red zone), priced and graded, never staked, its market asked
// with the NFL's props while the month's projected credits stay under 85% (oddsapi.mjs anytimeOn: 1 credit an ask,
// about 280 a month). The red zone on passing TDs (rzPass) on the gate, left out (held out -0.0013). Set to the push
// time.
// 2026-10-15 audit: the late terms' floor (MIN_GAIN, DRAFT_GAIN: 0.0003) and the draft prior's, the recency
// weight's and the recalibration by side's judged on the unrounded held-out gain (project.mjs fitStat). Rounded to 4
// places first, a gain of 0.00025 read 0.0003 and passed (NFL receiving yards' nt at z 0.57). Set to the push time.
// 2026-10-17 round D: every number a fit's gate compares read unrounded (project.mjs llOf, biasRawOf, gainOf: the
// gains, the biases, the splits, the sides, the low lines', the rookies', the dispersion growth's and the optional
// terms' keep; the check's log loss was still rounded to 4 places under the gain, and a bias tie passed): replayed,
// NFL carries' pl in (0.0003 on the nose), passing TDs' and MLB strikeouts' rk in (gains that rounded to 0), NHL
// points' c_teamShots (soft 0.25) out and shots' tr in. The NHL's low-usage prior (lp: a skater under the eligible
// pool's prior leaning to the pool's floor; shots 0.75, points 0.5, their rows' held-out log loss 0.5743 to 0.5706
// and 0.5095 to 0.5027). The same absence (ab) back in the search, soft (left out so far: carries +0.0014 held out
// but its own rows' bias -0.59 to -0.61). Measured and left out: the lead back out on the quarterback's volume
// (rbOutPass), the weeks 5-8 (midSeason), the backup's rushing (backupRun, on carries' ctx at weight 0), the MLB
// starter's home or away (homeBat, a half lost). The game lines gated by their CLV (desk.mjs lineGate): the NHL's
// tracked only at -0.0345 over 185. Set to the push time.
// 2026-10-17 later, the owner's tolerance on a term's own rows (project.mjs ownBias): a late term judged on the rows
// it's on may run their bias further by at most OWN_TOL (0.05) of the stat's unit where its held-out gain is OWN_TOL_GAIN
// (4) floors or more, and within it comes in soft, never hard. Replayed on the day's history, one term flips: the same
// absence (ab) on NFL carries, +0.0014 held out, its own 925 rows -0.587 to -0.612 carries a game, in at its soft
// weight (z 2.46, a half under 1.5: held to 0.25x of 0.25; Emanuel Wilson's carries read his games in the lead's
// absence). Every other own-rows fail stands: the NFL's run past the tolerance or under the gain (rushing yards' ab
// -2.62 to -2.82, ij 0.29 to -4.62; receiving yards' c_qb1Out 1.45 to -1.87; the NBA's rebounds' c_b2bB 0.09 to 0.39,
// assists' -0.03 to 0.06 under the floor), and the NHL's and MLB's late terms are judged on the whole stat. Set to the
// push time. 2026-10-17 evening, round E (the CHECK audit's drops, the owner's "fix every logic you can"): the QB-out
// headline deduped from the injury report (props.mjs: no news CHECK where the lead quarterback is already Out on the
// report, the projection and the role guard's qb1-out carry it); the CHECK bar by cause (ROLE_BET, roleGateOf: a role
// cause's risky side bet at the untested cap's half and a LIKE at most once 40 graded CHECKs of it pay on the model's
// side; snap-jump 28-15 +0.232u and group-out 35-29 +0.036u on, part-time 19-7 a CHECK till 40, the rest CHECKs); the
// props' CLV gate by stat (desk.mjs propGate: tracked while a stat's last 200 graded run negative, none at 40 yet); the
// backup quarterback's base (project.mjs bq: his team's attempts times his own rate per attempt) measured held out from
// 2016 and left at 0 (passing yards -0.0023, attempts +0.0004, completions +0.0003, TDs -0.0006: the gate took it
// nowhere, judged again each fit); the snap-jump reaction (sr 1 against the fit's 0.5 / 0.75, --state --set, the
// backtest's snap-jump bucket held out: receptions' log loss 2.128 to 2.118 but rushing yards' 4.4405 to 4.4473 and
// carries' 2.7894 to 2.7905 worse, the whole stats' within 0.0006 either way) kept as fit; the depth chart not a fit
// input (the history's charts before 2025 unstamped, 2025 on past the fit window); the news signals 6 matched rows
// since 10-14, logged only. Set to the push time. 2026-10-18, the small-count fixes (the audit: out of sample since
// 10-08 the raw model said .538 on lines of 1.5 or under for .481 against the book's .495, .579 on 2 to 3.5 for .493;
// the owner's "make sure small numbers aren't influencing K rating by % or anything crazy"): the props' trust by
// the line's size in every sport and the MMA's round totals (desk.mjs fitBuckets: low from 0.25, mid from 0.375,
// each rung pulled toward its sport's and every sport's pooled by its own evidence); the live calibration active
// (calib.mjs: every graded prop across epochs, sparse spots pooled by line class); the bands and every Kelly shown
// on the stake's Kelly (desk.mjs stakeKelly: held to -110's scale); a CHECK judged and shown by its cleared Kelly
// (checks.mjs checkKelly, the bar +1). Set to the push time. 2026-10-18, history sharpens the choice, not the volume (the
// owner: "it should be using history to make BETTER picks, not stop playing the game altogether"): the props priced at
// the learned correction (correct.mjs: where the model beats the book's no-vig and where it doesn't, by sport, stat,
// line bucket, lean, gap, price, home and timing, self-tuned on a time split) in place of the trust's blanket shrink,
// the trust sizing the stake; each slate plays its best few by edge before the vig at the practice stake (desk.mjs
// PRACTICE_N), tallied apart (PRACTICE_SPLIT). Set to the push time.
export const MODEL_EPOCH = '2026-10-18T22:40:00Z';

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
  // (MMA: a bout's lines open 72 hours before it (the weigh-in is the day before: a fighter pulled or replaced
  // voids the bet rather than moving it, mma-desk.mjs), the last chance 4; no props on this plan)
  mma: { lines: 72, props: 72, lastChance: 4 },
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
  // MMA (joined 2026-10-16: the fifth league, fights not games; MODEL_EPOCH not bumped for it, its trust starts at
  // the untested start with no bets by construction): UFC bouts' moneylines, priced by fights-model.mjs (a
  // logistic model over point-in-time fighter stats and the MMA app's rating, soft terms refit every run) and
  // run by mma-desk.mjs (run.mjs hands a league with fights: true there: no team ratings, context, margins or
  // props, so no priors or grid). The Odds API's key mma_mixed_martial_arts, h2h and (from 2026-10-17) the round
  // totals, fights-totals.mjs, tracked only till 40 are graded with a close (its board carries every promotion's
  // bouts; ESPN's UFC cards are matched to it by both fighters' names, never guessed).
  //   edge   the model's vig-free chance has to beat the book's fair chance by this to be bet (else tracked)
  //   guard  the moneyline's as elsewhere: the market moving this far against the side since its first price
  //          cuts the bet to the minimum
  mma: {
    league: 'mma/ufc',
    label: 'MMA',
    fights: true,
    edge: 0.03,
    guard: { spread: null, total: null, ml: 0.06 },
  },
};
