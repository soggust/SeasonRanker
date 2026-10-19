// The fights model, fights-model.mjs (named apart from apps/mma/scripts/fights.mjs, whose own main guard runs on any script named fights.mjs) (the model desk's MMA league, leagues.mjs mma): a bout's win chance from soft terms over
// point-in-time fighter stats and the MMA app's rating (apps/mma/scripts/rating.mjs: a Glicko-style rating
// over every pro fight ESPN has, replayed oldest first, so each fight's prediction is from before it).
//
// Each bout is a row for its first fighter, A, against B: every term is A's number less B's (antisymmetric: the
// same bout from B's side is the row with its signs flipped, so the fit has no intercept and no side bias; the
// chance for A is the logistic of the terms' weighted sum). A fighter's numbers are as of the bout's date,
// never his career totals: his rating and its deviation going in (rating.mjs rate, onBefore), his record,
// streak and layoff from the bouts before it, and his striking and grappling rates from the stats of the bouts
// before it (ESPN's FightMetric numbers, kept bout by bout in apps/mma/scripts/cache.json: significant
// strikes landed and attempted, knockdowns, takedowns landed and attempted, submission attempts, advances).
// A fighter with under 15 minutes of stats stands at the UFC's averages (AVG) for the rates: the term says
// nothing about him. ESPN's bios carry each fighter's age now (no birth date), his reach and height: his age
// at a bout is his age now less the years since.
//
// TERMS: the rating (the rating's own chance for A, in log odds: the rating-alone model is this one term at a
// weight of 1), age and the years past 34, the layoff (days since the last bout), experience, reach and height,
// striking (landed and absorbed a minute, accuracy, defense), grappling (takedowns a round, their accuracy, the
// defense, submission attempts), the style matchup (a wrestler against a fighter whose takedown defense is
// weak), the finishing rate, durability (knockout and submission losses, and stoppage losses in the last three
// bouts), the win streak, a move up or down in weight, and a five-round bout (the rating counts for more over
// 25 minutes). Short notice (a replacement's days from his announcement) and the market's opening line have no
// history to fit on (ESPN keeps neither; this plan buys no historical odds), so they're kept on each live bet
// (seen.open; the bout's changes) for a later fit and move no price now.
//
// THE VENUE AND FORM ROUND (2026-10-17, the owner: home advantage "matters slightly, like most sports: include it
// and let history set its weight", and whatever else serious MMA modelers weigh). Each bout keeps its venue and
// both fighters' countries now (apps/mma/scripts/fights.mjs; the venue terms' inputs in fights-venue.mjs). Sixteen
// candidates (CANDIDATES) were fit soft and walked forward over 2023-10..2026-10 (1,874 held-out bouts, the base's
// log loss 0.6222), singly and by family; the kept ones are in TERMS (their weights refit every run, soft):
//   home (his own country, a crowd in: -0.0001), homeEmpty (the same with no crowd, the Apex and the closed-door
//   months: 0.0000, kept beside home so the crowd's part is apart), travel (-0.0001; the home family together
//   -0.0002), form (his last three against his career: -0.0009), beatQ (the ratings of the last three men he
//   beat: -0.0005), firstFive (his first five-rounder: -0.0001); together -0.0010. Each at 0 on the full fit
//   today (the halves disagree or are under z 1): the history says home is small (a home fighter with a crowd
//   won 50.8% where the rating said 50.7%, over 3,175 bouts; 52.0% against 50.5% in the decisions, 49.7% against
//   50.9% in the finishes: the judges' part, as the literature finds, too small to hold yet), so it comes in as
//   history earns it.
//   Left out (held out no better, or worse): ageWeight (+0.0022), rust (18 months out, +0.0005), bigDebut
//   (+0.0001), finMom (finishes in the last three, +0.0001), shift (time zones), altHome (at altitude), apexTd
//   (wrestling in the small cage), southpaw, quick (under six weeks), homeJudges (home by the pair's decision
//   share): all 0.0000 or worse. They're still computed on each row (candidatesOf) for the next round's test.
//
// SOFT TERMS (the owner's rule: a term is never on or off, its weight is earned): the full fit's weight for
// each term is shrunk by its held-out evidence, 1 - 1/z^2 where z is the smaller of its two half-fits' z
// scores (the training rows split in two by date), and nothing where the halves disagree on its sign or either
// is under 1 (a pure-noise term comes in at 0). The rating term is a term like the others. Refit every run
// (seconds: a Newton fit over ~15,000 rows and 23 terms), so the weights move as the bouts come in.
//
// Each row also carries the round totals' terms (totalsTerms: both fighters' numbers together), the bout's length
// and its method, for fights-totals.mjs, the desk's second market.
//
// BACKTEST (backtest): held out, walking forward over the last three years by half-year: each half's rows
// scored by a model fit on the rows before it alone, against the rating alone and a coin flip, with the
// calibration by chance bucket. No odds in it (none kept), so it says how the model predicts, not what it
// would have won. Run as a script: node libs/ranker/scripts/model/fights-model.mjs (writes apps/mma/scripts/model/
// backtest.json; node libs/ranker/scripts/model/mma-desk.mjs --seed writes the league's first state.json,
// ledger.json and picks.json, no bets, so the desk shows the league before its first run).
import path from 'node:path';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { keptFights } from '../../../../apps/mma/scripts/fights.mjs';
import { PARAMS, rate, weightOf } from '../../../../apps/mma/scripts/rating.mjs';
import { round } from './ratings.mjs';
import { emptyOn, placeOf, venueSide } from './fights-venue.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
export const MMA_CACHE = path.join(ROOT, 'apps/mma/scripts/cache.json');
const ROUND_SECS = 300;
const YEAR = 365.25 * 864e5;
// (the promotions the fit learns from: the ones the rating's own backtest judges; the regional archive is in the
// ratings but its bouts have no stats and lopsided matchmaking)
export const FIT_LEAGUES = new Set(['ufc', 'bellator', 'pfl', 'strikeforce', 'pride', 'wec', 'rizin']);
// (the UFC's averages a fighter without 15 minutes of stats stands at)
export const AVG = { slpm: 3.6, sapm: 3.4, strAcc: 0.45, strDef: 0.55, td15: 1.3, tdAcc: 0.38, tdDef: 0.6, sub15: 0.5, finish: 0.5, chin: 0.1 };
const MIN_SECS = 15 * 60;
// (the fit: the ridge's strength on standardized terms, and Newton's steps)
const LAMBDA = 1;
const STEPS = 30;
// (a chance never past these: a fight is never sure)
export const CLAMP = [0.03, 0.97];
// RECENCY (the history round, 2026-10-19; the owner's rule: recent seasons count more). The fit's rows are weighted by
// their age, halving every RECENCY_HL years (null: flat, as before), so the terms' weights follow the sport as it is.
// A candidate behind FIGHT_HL (years) for the gate (gate.mjs --candidate env:FIGHT_HL=2); the constant is what ships.
// MEASURED AND HELD (the gate, 2026-10-19, walk-forward 2018 on): a half-life of 2 years made the bouts' log loss
// worse by +0.0277 a row (0.6241 to 0.6518; 4 years +0.0052, a tie; 1 year the coin: 0.6931), because the soft rule
// reads each half-fit's z and the weights cut the halves' effective rows, zeroing terms. So the half-life stays null:
// a recency that doesn't starve the soft fit (weights in the full fit alone, or a longer window) is the next try
const envNum = (k, d) => (process.env[k] === undefined || process.env[k] === '' ? d : Number(process.env[k]) || null);
export const RECENCY_HL = envNum('FIGHT_HL', null);
// (the first-listed term (the loss review's H11): 1 on every row, so the fit learns whether ESPN's first fighter
// wins more or less than his numbers say; a candidate behind FIGHT_CORNER=1. MEASURED AND HELD 2026-10-19: there is
// no first-listed bias in the walk-forward chances (2018 on, 6,078 fit rows: ESPN's first fighter wins 0.4666, the
// model's mean for him 0.4691; where he's the model's dog 0.3562 against 0.3592, the favorite 0.6195 against 0.6212;
// on the history's 1,968 closes 0.450 against 0.455), the term fit at nothing and the gate read a tie (+0.0003): the
// review's +3.9 points was a full fit's read, not the walk-forward's)
export const CORNER = process.env.FIGHT_CORNER === '1';
// (the rating's deviation (the loss review's H21): the gap in how sure the rating is of each (rdGap), and the rating
// term scaled by how unsure it is of both (ratingRd); a candidate behind FIGHT_RD=1. MEASURED AND HELD 2026-10-19:
// the deciding years +0.0030 a row (a tie), the older ones +0.0053 worse beyond noise, the history's closes 0.6231
// against 0.6214: nothing to ship. The rating alone's walk-forward log loss by half-year 2018 to 2026 runs 0.63 to
// 0.70 with no trend (2024H1 0.633, 2026H1 0.656), the model's 0.61 to 0.67)
export const RATING_RD = process.env.FIGHT_RD === '1';
// (each row's weight by its age at the newest row, halving every hl years; 1 with no half-life)
export function recencyWeights(rows, hl = RECENCY_HL) {
  if (!hl || !rows.length) return rows;
  const newest = rows.reduce((a, r) => (a > r.date ? a : r.date), rows[0].date);
  const t0 = Date.parse(newest);
  return rows.map((r) => ({ ...r, w: (r.w ?? 1) * Math.pow(0.5, (t0 - Date.parse(r.date)) / YEAR / hl) }));
}

export const TERMS = [
  ['rating', 'the rating (its own chance, in log odds)'],
  ['age', 'age difference (per 5 years)'],
  ['old', 'years past 34'],
  ['layoff', 'layoff (log days since the last bout)'],
  ['exp', 'experience (log bouts)'],
  ['reach', 'reach difference (inches)'],
  ['height', 'height difference (inches)'],
  ['slpm', 'significant strikes landed a minute'],
  ['sapm', 'significant strikes absorbed a minute'],
  ['strAcc', 'striking accuracy'],
  ['strDef', 'striking defense'],
  ['td15', 'takedowns a 15 minutes'],
  ['tdAcc', 'takedown accuracy'],
  ['tdDef', 'takedown defense'],
  ['sub15', 'submission attempts a 15 minutes'],
  ['style', 'style matchup (a wrestler against weak takedown defense)'],
  ['finish', 'finishing rate (finishes of wins)'],
  ['chin', 'durability (stoppage losses of bouts)'],
  ['recentStop', 'stoppage losses in the last three bouts'],
  ['streak', 'win streak (capped at 5)'],
  ['moveUp', 'moving up in weight'],
  ['moveDown', 'moving down in weight'],
  ['five', 'a five-round bout (the rating over 25 minutes)'],
  // (the venue and form round, 2026-10-17: see the header)
  ['home', 'fighting in his own country (a crowd in)'],
  ['homeEmpty', 'fighting in his own country, no crowd'],
  ['travel', 'the distance travelled (thousand km)'],
  ['form', 'his last three bouts against his career'],
  ['beatQ', 'the ratings of the last three men he beat'],
  ['firstFive', 'his first five-round bout'],
  ...(CORNER ? [['corner', 'listed first by ESPN (the first-listed bias)']] : []),
  ...(RATING_RD ? [['rdGap', "the rating's deviation, his less the other's (per 100)"], ['ratingRd', "the rating where it's unsure of both (its log odds by the deviations' mean over 150)"]] : []),
];
export const TERM_KEYS = TERMS.map(([k]) => k);

const logit = (p) => Math.log(p / (1 - p));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const clamp = (p) => Math.min(CLAMP[1], Math.max(CLAMP[0], p));

// A fighter's running state (everything before the bout at hand)
export function freshFighter() {
  return { n: 0, wins: 0, losses: 0, draws: 0, finishes: 0, koWins: 0, subWins: 0, koLosses: 0, subLosses: 0, decisions: 0, timeShare: 0, last: null, lbs: null, prevLbs: null, streak: 0, recent: [], secs: 0, ssl: 0, ssa: 0, kd: 0, tdl: 0, tda: 0, sm: 0, ad: 0, oppSecs: 0, oppSsl: 0, oppSsa: 0, oppTdl: 0, oppTda: 0, five: 0, big: 0, recentFin: [], beaten: [] };
}

// A bout's length in seconds (its last round and the clock into it; none kept: the distance)
export function boutSeconds(f) {
  const rounds = f.rounds ?? 3;
  if (!Number.isFinite(f.period) || f.period === null || f.period === 0) return rounds * ROUND_SECS;
  const clock = Number.isFinite(f.clock) ? f.clock : ROUND_SECS;
  return Math.min(rounds * ROUND_SECS, (f.period - 1) * ROUND_SECS + clock);
}

// A fighter's rates as of now, from his running state (a side under MIN_SECS at the averages)
export function ratesOf(s) {
  const mins = s.secs / 60;
  const oppMins = s.oppSecs / 60;
  const enough = s.secs >= MIN_SECS;
  const oppEnough = s.oppSecs >= MIN_SECS;
  return {
    slpm: enough ? s.ssl / mins : AVG.slpm,
    sapm: oppEnough ? s.oppSsl / oppMins : AVG.sapm,
    strAcc: s.ssa >= 50 ? s.ssl / s.ssa : AVG.strAcc,
    strDef: s.oppSsa >= 50 ? 1 - s.oppSsl / s.oppSsa : AVG.strDef,
    td15: enough ? (s.tdl / mins) * 15 : AVG.td15,
    tdAcc: s.tda >= 5 ? s.tdl / s.tda : AVG.tdAcc,
    tdDef: s.oppTda >= 5 ? 1 - s.oppTdl / s.oppTda : AVG.tdDef,
    sub15: enough ? (s.sm / mins) * 15 : AVG.sub15,
    finish: s.wins >= 3 ? s.finishes / s.wins : AVG.finish,
    chin: s.n >= 3 ? (s.koLosses + s.subLosses) / s.n : AVG.chin,
  };
}

// A fighter's age on a day from his bio (ESPN's age now, read when the bio was; no birth date), or null
export function ageOn(bio, bioAt, day) {
  if (!Number.isFinite(bio?.age) || !bio.age) return null;
  const at = Number.isFinite(bioAt) ? bioAt : Date.now();
  return bio.age + 0.5 - (at - day) / YEAR;
}

// One side's numbers for a bout on a day: its running state, rating (r, rd) and bio
export function sideNumbers(s, rating, bio, bioAt, day, lbs, { country = null, place = null } = {}) {
  const rates = ratesOf(s);
  const layoffDays = s.last === null ? 365 : Math.max(0, (day - s.last) / 864e5);
  const age = ageOn(bio, bioAt, day);
  const won3 = s.recent.filter((x) => x === 'won').length;
  return {
    ...rates,
    // (the venue: his own country, the distance and the time zones from it (fights-venue.mjs))
    ...venueSide(country ?? bio?.country ?? null, place),
    stance: bio?.stance ?? null,
    // (form: his last three bouts' win share less his career's; finishing momentum: finishes won of his last three)
    form: s.n >= 4 ? won3 / s.recent.length - s.wins / s.n : 0,
    finMom: (s.recentFin ?? []).reduce((a, b) => a + b, 0),
    // (the quality of his last three wins: the ratings going in of the men he beat, against the start)
    beatQ: s.beaten?.length ? s.beaten.reduce((a, b) => a + b, 0) / s.beaten.length - PARAMS.start : null,
    firstFive: s.five === 0 ? 1 : 0,
    bigDebut: (s.big ?? 0) === 0 ? 1 : 0,
    rust: layoffDays > 540 && s.last !== null ? 1 : 0,
    quick: layoffDays < 42 && s.last !== null ? 1 : 0,
    r: rating.r,
    rd: rating.rd,
    age,
    old: age === null ? null : Math.max(0, age - 34),
    layoff: Math.log1p(layoffDays / 30),
    layoffDays,
    exp: Math.log1p(s.n),
    reach: Number.isFinite(bio?.reach) && bio.reach ? bio.reach : null,
    height: Number.isFinite(bio?.height) && bio.height ? bio.height : null,
    recentStop: s.recent.filter((x) => x === 'stopped').length,
    streak: Math.max(-5, Math.min(5, s.streak)),
    moveUp: lbs && s.lbs && lbs > s.lbs ? 1 : 0,
    moveDown: lbs && s.lbs && lbs < s.lbs ? 1 : 0,
    record: `${s.wins}-${s.losses}${s.draws ? `-${s.draws}` : ''}`,
    n: s.n,
    // (the round totals' numbers (totalsTerms): each a share of his bouts, pulled to the UFC's by 3 bouts' worth)
    koWin: (s.koWins + 3 * TAVG.koWin) / (s.n + 3),
    subWin: (s.subWins + 3 * TAVG.subWin) / (s.n + 3),
    koLoss: (s.koLosses + 3 * TAVG.koLoss) / (s.n + 3),
    subLoss: (s.subLosses + 3 * TAVG.subLoss) / (s.n + 3),
    dist: (s.decisions + 3 * TAVG.dist) / (s.n + 3),
    time: (s.timeShare + 3 * TAVG.time) / (s.n + 3),
    kd15: s.secs >= MIN_SECS ? (s.kd / (s.secs / 60)) * 15 : TAVG.kd15,
  };
}

// ROUND TOTALS (fights-totals.mjs: the chance a bout goes past its line of rounds): the terms are both
// fighters' together (a sum, or the pair's gap), never one's less the other's, so the same bout from either side
// is the same row. The UFC's shares a fighter's are pulled to (sideNumbers: by 3 bouts' worth)
export const TAVG = { koWin: 0.2, subWin: 0.1, koLoss: 0.1, subLoss: 0.08, dist: 0.45, time: 0.7, kd15: 0.3 };
export const TOTAL_TERMS = [
  ['tDist', "both fighters' bouts gone the distance"],
  ['tTime', "both fighters' bouts' length (share of the scheduled time)"],
  ['tKoWin', "both fighters' knockout wins"],
  ['tSubWin', "both fighters' submission wins"],
  ['tKoLoss', 'both fighters knocked out (durability)'],
  ['tSubLoss', 'both fighters submitted'],
  ['tFinish', "both fighters' finishes of wins"],
  ['tRecentStop', 'stoppage losses in their last three bouts'],
  ['tKd', 'knockdowns a 15 minutes, both'],
  ['tSlpm', 'significant strikes landed a minute, both'],
  ['tStrDef', 'striking defense, both'],
  ['tTd', 'takedowns a 15 minutes, both'],
  ['tSub', 'submission attempts a 15 minutes, both'],
  ['tGap', 'the rating gap (a mismatch, in log odds)'],
  ['tAge', 'their ages (per 5 years, both)'],
  ['tOld', 'years past 34, both'],
  ['tLayoff', 'layoffs (log days), both'],
  ['tExp', 'experience (log bouts), both'],
  ['tLbs', 'the weight class (per 50 pounds)'],
  ['tHeavy', 'heavyweight'],
  ['tWomen', "a women's bout"],
  // (the venue round, 2026-10-17: walked forward over the same three years (4,194 bouts at each line, the base
  // 0.6290): tHome -0.0001, tFirstFive -0.0001 together; left out: tApex, tAlt, tEmpty (0.0000 as a family),
  // tTravel and tShift (+0.0001), tDebut (0.0000), tFinMom (+0.0001))
  ['tHome', 'one fighter at home, the other not'],
  ['tFirstFive', 'first five-round bouts, both'],
];
export const TOTAL_KEYS = TOTAL_TERMS.map(([k]) => k);
// (the round totals' candidates, 2026-10-17, as the moneyline's CANDIDATES)
export const TOTAL_CANDIDATES = [
  ['tApex', 'the small cage (the Apex)'],
  ['tAlt', 'the venue at altitude (km above 1,000 m)'],
  ['tEmpty', 'no crowd (the Apex, the closed-door months)'],
  ['tTravel', 'the distance travelled, both (thousand km)'],
  ['tShift', 'time zones crossed, both (per 3)'],
  ['tHome', 'one fighter at home, the other not'],
  ['tFirstFive', 'first five-round bouts, both'],
  ['tDebut', 'big-promotion debuts, both'],
  ['tFinMom', 'finishes won of their last three bouts, both'],
];

// A bout's round-totals terms from both sides' numbers (sideNumbers) and its weight (rating.mjs weightOf)
export function totalsTerms(a, b, { lbs = null, women = false, place = null, date = null, rounds = 3 } = {}) {
  const sum = (k, avg = 0) => (a[k] ?? avg) + (b[k] ?? avg);
  return {
    // (the candidates, 2026-10-17: the venue's, and the first five-rounders and big-promotion debuts)
    tApex: place?.apex ? 1 : 0,
    tAlt: place?.alt > 1000 ? (place.alt - 1000) / 1000 : 0,
    tEmpty: place && date && emptyOn(date, place) ? 1 : 0,
    tTravel: sum('travel', 0),
    tShift: sum('shift', 0) / 3,
    tHome: Math.abs((a.home ?? 0) - (b.home ?? 0)),
    tFirstFive: rounds >= 5 ? sum('firstFive') : 0,
    tDebut: sum('bigDebut'),
    tFinMom: sum('finMom'),
    tDist: sum('dist'),
    tTime: sum('time'),
    tKoWin: sum('koWin'),
    tSubWin: sum('subWin'),
    tKoLoss: sum('koLoss'),
    tSubLoss: sum('subLoss'),
    tFinish: sum('finish'),
    tRecentStop: sum('recentStop'),
    tKd: sum('kd15'),
    tSlpm: sum('slpm'),
    tStrDef: sum('strDef'),
    tTd: sum('td15'),
    tSub: sum('sub15'),
    tGap: Math.abs(logit(clamp(ratingChance(a, b)))),
    tAge: sum('age', 30) / 5,
    tOld: sum('old'),
    tLayoff: sum('layoff'),
    tExp: sum('exp'),
    tLbs: Number.isFinite(lbs) && lbs ? (lbs - 170) / 50 : 0,
    tHeavy: lbs && lbs >= 230 ? 1 : 0,
    tWomen: women ? 1 : 0,
  };
}

// The Glicko expectation the rating uses (rating.mjs expected: both deviations counted)
const Q = Math.LN10 / 400;
const g = (rd) => 1 / Math.sqrt(1 + (3 * Q * Q * rd * rd) / (Math.PI * Math.PI));
export const ratingChance = (a, b) => 1 / (1 + 10 ** ((-g(Math.sqrt(a.rd ** 2 + b.rd ** 2)) * (a.r - b.r)) / 400));

// The terms for A against B (each A's less B's; a pair with a side unknown at 0: the term says nothing)
export function featuresOf(a, b, { rounds = 3, place = null, date = null, lbs = null } = {}) {
  const diff = (k) => (a[k] === null || b[k] === null || a[k] === undefined || b[k] === undefined ? 0 : a[k] - b[k]);
  const ratingLogit = logit(clamp(ratingChance(a, b)));
  const wrestler = (x) => Math.max(0, x.td15 - 1.5) / 1.5;
  const weak = (x) => Math.max(0, 0.6 - x.tdDef) / 0.3;
  return {
    rating: ratingLogit,
    age: diff('age') / 5,
    old: diff('old'),
    layoff: diff('layoff'),
    exp: diff('exp'),
    reach: diff('reach'),
    height: diff('height'),
    slpm: diff('slpm'),
    sapm: diff('sapm'),
    strAcc: diff('strAcc'),
    strDef: diff('strDef'),
    td15: diff('td15'),
    tdAcc: diff('tdAcc'),
    tdDef: diff('tdDef'),
    sub15: diff('sub15'),
    style: wrestler(a) * weak(b) - wrestler(b) * weak(a),
    finish: diff('finish'),
    chin: diff('chin'),
    recentStop: diff('recentStop'),
    streak: diff('streak') / 5,
    moveUp: diff('moveUp'),
    moveDown: diff('moveDown'),
    five: rounds >= 5 ? ratingLogit : 0,
    ...(CORNER ? { corner: 1 } : {}),
    ...(RATING_RD ? { rdGap: diff('rd') / 100, ratingRd: (ratingLogit * ((a.rd + b.rd) / 2 - 150)) / 150 } : {}),
    ...candidatesOf(a, b, { rounds, place, date, lbs, diff }),
  };
}

// The candidate terms (2026-10-17, the owner's home-advantage ask and the audit of what MMA's modelers weigh;
// each fit soft and kept only where it held out: CANDIDATES, KEPT). Each is A's less B's, 0 where a side is unknown
export const CANDIDATES = [
  ['home', 'fighting in his own country (a crowd in)'],
  ['homeEmpty', 'fighting in his own country, no crowd (the Apex, the closed-door months)'],
  ['homeJudges', "his own country's crowd before the judges (the home term by the pair's share of bouts gone the distance)"],
  ['travel', 'the distance travelled (thousand km)'],
  ['shift', 'time zones crossed (per 3)'],
  ['altHome', 'his own country at altitude (km above 1,000 m)'],
  ['apexTd', 'takedowns a 15 minutes in the small cage (the Apex)'],
  ['firstFive', 'his first five-round bout'],
  ['bigDebut', 'his first bout in a big promotion'],
  ['form', 'his last three bouts against his career (win share)'],
  ['finMom', 'finishes won of his last three bouts'],
  ['beatQ', 'the ratings of the last three men he beat (per 100)'],
  ['ageWeight', 'age by weight class (the age gap, more at the lighter weights)'],
  ['southpaw', 'a southpaw against an orthodox fighter'],
  ['rust', 'a layoff of 18 months or more'],
  ['quick', 'a quick turnaround (under 6 weeks)'],
];
export const CANDIDATE_KEYS = CANDIDATES.map(([k]) => k);

function candidatesOf(a, b, { rounds, place, date, lbs, diff }) {
  const empty = !!place && !!date && emptyOn(date, place);
  const home = diff('home');
  const altKm = place?.alt > 1000 ? (place.alt - 1000) / 1000 : 0;
  const lefty = (x, y) => (/south/i.test(x.stance ?? '') && /orth/i.test(y.stance ?? '') ? 1 : 0);
  return {
    home: empty ? 0 : home,
    homeEmpty: empty ? home : 0,
    homeJudges: empty ? 0 : (home * (a.dist + b.dist)) / 2,
    travel: diff('travel'),
    shift: diff('shift') / 3,
    altHome: altKm * home,
    apexTd: place?.apex ? diff('td15') : 0,
    firstFive: rounds >= 5 ? diff('firstFive') : 0,
    bigDebut: diff('bigDebut'),
    form: diff('form'),
    finMom: diff('finMom'),
    beatQ: diff('beatQ') / 100,
    ageWeight: Number.isFinite(lbs) && lbs ? ((diff('age') / 5) * (205 - Math.min(lbs, 265))) / 60 : 0,
    southpaw: lefty(a, b) - lefty(b, a),
    rust: diff('rust'),
    quick: diff('quick'),
  };
}

// A bout's result for its first fighter: 1 won, 0 lost, null (a draw, a no contest, no winner)
export function resultOf(f) {
  const [a, b] = f.fighters;
  if (f.method === 'NC' || a.winner === b.winner) return null;
  return a.winner ? 1 : 0;
}

// After a bout: both states moved on (the stats the cache has for each side, [ssl, ssa, kd, tdl, tda, sm, ad, rv])
export function advance(s, o, f, mine, theirs, won, lbs, oppR = null) {
  const secs = boutSeconds(f);
  const result = resultOf(f);
  const finish = f.method === 'KO' || f.method === 'SUB';
  s.n++;
  // (for the round totals: the bouts that went the distance, and the share of the scheduled time each lasted)
  const scheduled = (f.rounds || 3) * ROUND_SECS;
  if (secs >= scheduled || /^(UD|SD|MD|DEC|DRAW)$/.test(f.method ?? '')) s.decisions++;
  s.timeShare += Number.isFinite(secs) ? Math.min(1, secs / scheduled) : 1;
  if (result === null) {
    if (f.method !== 'NC') s.draws++;
    s.streak = 0;
    s.recent.push('draw');
  } else if (won) {
    s.wins++;
    if (finish) s.finishes++;
    if (f.method === 'KO') s.koWins++;
    if (f.method === 'SUB') s.subWins++;
    s.streak = s.streak > 0 ? s.streak + 1 : 1;
    s.recent.push('won');
  } else {
    s.losses++;
    if (f.method === 'KO') s.koLosses++;
    if (f.method === 'SUB') s.subLosses++;
    s.streak = s.streak < 0 ? s.streak - 1 : -1;
    s.recent.push(finish ? 'stopped' : 'lost');
  }
  s.recent = s.recent.slice(-3);
  // (the candidates' running numbers: five-rounders and big-promotion bouts fought, his last three bouts' finishes
  // won, the ratings going in of the last three he beat)
  if ((f.rounds ?? 3) >= 5) s.five++;
  if (FIT_LEAGUES.has(f.league)) s.big++;
  s.recentFin = [...(s.recentFin ?? []), result !== null && won && finish ? 1 : 0].slice(-3);
  if (result !== null && won && Number.isFinite(oppR)) s.beaten = [...(s.beaten ?? []), oppR].slice(-3);
  if (mine) {
    s.secs += secs;
    s.ssl += mine[0];
    s.ssa += mine[1];
    s.kd += mine[2];
    s.tdl += mine[3];
    s.tda += mine[4];
    s.sm += mine[5];
    s.ad += mine[6];
  }
  if (theirs) {
    s.oppSecs += secs;
    s.oppSsl += theirs[0];
    s.oppSsa += theirs[1];
    s.oppTdl += theirs[3];
    s.oppTda += theirs[4];
  }
  s.last = Date.parse(f.date);
  if (lbs) {
    s.prevLbs = s.lbs;
    s.lbs = lbs;
  }
}

// Every bout's row (its terms and result, both sides' numbers going in), oldest first, and each fighter's state
// after his last bout (for the coming bouts). cache: apps/mma/scripts/cache.json's fighters ({ stats: { <bout
// id>: [...] }, bio, bioAt })
export function buildRows(fights, cache) {
  const states = new Map();
  const ratingNow = new Map();
  const rows = [];
  // (each bout's ratings going in, for the quality of a fighter's wins)
  const pre = new Map();
  const stateOf = (id) => states.get(id) ?? states.set(id, freshFighter()).get(id);
  rate(fights, PARAMS, {
    onBefore(f, sa, sb) {
      const [a, b] = f.fighters;
      const day = Date.parse(f.date);
      const { lbs } = weightOf(f);
      const place = placeOf(f.venue);
      const A = sideNumbers(stateOf(a.id), sa, cache[a.id]?.bio, cache[a.id]?.bioAt, day, lbs, { country: a.country, place });
      const B = sideNumbers(stateOf(b.id), sb, cache[b.id]?.bio, cache[b.id]?.bioAt, day, lbs, { country: b.country, place });
      pre.set(f.id, [sa.r, sb.r]);
      // (the round totals' terms beside it, how long it lasted and how it ended: fights-totals.mjs)
      const timed = Number.isFinite(f.period) && f.period > 0 && Number.isFinite(f.clock);
      rows.push({ id: f.id, date: f.date, league: f.league, rounds: f.rounds ?? 3, a: a.id, b: b.id, x: featuresOf(A, B, { rounds: f.rounds ?? 3, place, date: f.date, lbs }), y: resultOf(f), ratingP: clamp(ratingChance(A, B)), experienced: A.n > 0 && B.n > 0, tx: totalsTerms(A, B, { ...weightOf(f), place, date: f.date, rounds: f.rounds ?? 3 }), secs: timed ? boutSeconds(f) : null, method: f.method ?? null, division: f.division ?? '' });
    },
    onAfter(f, sa, sb) {
      const [a, b] = f.fighters;
      const { lbs } = weightOf(f);
      const mine = cache[a.id]?.stats?.[f.id] ?? null;
      const theirs = cache[b.id]?.stats?.[f.id] ?? null;
      const result = resultOf(f);
      const [ra, rb] = pre.get(f.id) ?? [null, null];
      pre.delete(f.id);
      advance(stateOf(a.id), stateOf(b.id), f, mine, theirs, result === 1, lbs, rb);
      advance(stateOf(b.id), stateOf(a.id), f, theirs, mine, result === 0, lbs, ra);
      ratingNow.set(a.id, { r: sa.r, rd: sa.rd, last: sa.last });
      ratingNow.set(b.id, { r: sb.r, rd: sb.rd, last: sb.last });
    },
  });
  return { rows, states, ratingNow };
}

// (the rows the fit learns from: a winner, the fit's promotions, both fighters with a bout before)
export const fitRows = (rows) => rows.filter((r) => r.y !== null && FIT_LEAGUES.has(r.league) && r.experienced);

// ---------------------------------------------------------------------------------------------------------
// The fit: a ridge logistic regression with no intercept over standardized terms, by Newton's method

function solve(H, gvec) {
  const n = gvec.length;
  const M = H.map((row, i) => [...row, gvec[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const k = M[r][c] / d;
      if (!k) continue;
      for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j];
    }
  }
  return M.map((row, i) => row[n] / (row[i] || 1e-12));
}

function inverseDiag(H) {
  const n = H.length;
  return Array.from({ length: n }, (_, i) => {
    const e = Array(n).fill(0);
    e[i] = 1;
    return solve(H, e)[i];
  });
}

// The fit over rows: each term's weight (in standardized units: w) and its scale (the training rows' spread,
// the raw weight being w / scale), each weight's standard error and z
export function fitLogistic(rows, keys = TERM_KEYS, lambda = LAMBDA) {
  const k = keys.length;
  const n = rows.length;
  const scale = keys.map((key) => {
    const v = rows.reduce((s, r) => s + (r.w ?? 1) * r.x[key] ** 2, 0) / Math.max(1, rows.reduce((s, r) => s + (r.w ?? 1), 0));
    return Math.sqrt(v) || 1;
  });
  const X = rows.map((r) => keys.map((key, j) => r.x[key] / scale[j]));
  const y = rows.map((r) => r.y);
  // (a row's weight: 1, or less where one bout gives several rows, fights-totals.mjs)
  const wt = rows.map((r) => r.w ?? 1);
  let w = Array(k).fill(0);
  let H = null;
  for (let step = 0; step < STEPS; step++) {
    const grad = Array(k).fill(0);
    H = Array.from({ length: k }, () => Array(k).fill(0));
    for (let i = 0; i < n; i++) {
      const xi = X[i];
      let z = 0;
      for (let j = 0; j < k; j++) z += w[j] * xi[j];
      const p = sigmoid(z);
      const e = (p - y[i]) * wt[i];
      const v = p * (1 - p) * wt[i];
      for (let j = 0; j < k; j++) {
        grad[j] += e * xi[j];
        const vj = v * xi[j];
        for (let l = j; l < k; l++) H[j][l] += vj * xi[l];
      }
    }
    for (let j = 0; j < k; j++) {
      grad[j] += lambda * w[j];
      H[j][j] += lambda;
      for (let l = 0; l < j; l++) H[j][l] = H[l][j];
    }
    const d = solve(H, grad);
    let move = 0;
    for (let j = 0; j < k; j++) {
      w[j] -= d[j];
      move = Math.max(move, Math.abs(d[j]));
    }
    if (move < 1e-7) break;
  }
  const se = inverseDiag(H).map((v) => Math.sqrt(Math.max(v, 1e-12)));
  return { keys, w, scale, se, z: w.map((v, j) => v / se[j]), n };
}

// The soft fit: the full fit's weights, each shrunk by its halves' evidence (see the header)
export function fitSoft(rows, keys = TERM_KEYS) {
  const sorted = recencyWeights([...rows].sort((a, b) => a.date.localeCompare(b.date)));
  const full = fitLogistic(sorted, keys);
  const mid = Math.floor(sorted.length / 2);
  const h1 = fitLogistic(sorted.slice(0, mid), keys);
  const h2 = fitLogistic(sorted.slice(mid), keys);
  const terms = keys.map((key, j) => {
    const agree = Math.sign(h1.w[j]) === Math.sign(h2.w[j]) && Math.sign(h1.w[j]) === Math.sign(full.w[j]) && full.w[j] !== 0;
    const z = agree ? Math.min(Math.abs(h1.z[j]), Math.abs(h2.z[j])) : 0;
    const soft = z > 1 ? Math.max(0, 1 - 1 / (z * z)) : 0;
    return { key, w: round(full.w[j], 4), se: round(full.se[j], 4), z: round(full.z[j], 2), halves: [round(h1.w[j], 4), round(h2.w[j], 4)], zHalf: round(z, 2), soft: round(soft, 3), weight: round(full.w[j] * soft, 4), scale: round(full.scale[j], 5) };
  });
  return { terms, n: rows.length, from: sorted[0]?.date ?? null, to: sorted.at(-1)?.date ?? null };
}

// A fit's chance for A from its terms
export function predict(fit, x) {
  let z = 0;
  const parts = {};
  for (const t of fit.terms) {
    if (!t.weight) continue;
    const part = (t.weight * (x[t.key] ?? 0)) / t.scale;
    parts[t.key] = round(part, 4);
    z += part;
  }
  return { p: clamp(sigmoid(z)), z: round(z, 4), parts };
}

const logLoss = (p, y) => -Math.log(y ? p : 1 - p);
export function score(rows, pOf) {
  let loss = 0;
  let right = 0;
  let n = 0;
  for (const r of rows) {
    const p = Math.min(0.99, Math.max(0.01, pOf(r)));
    loss += logLoss(p, r.y);
    // (a coin's 0.5 half right whatever happened: read first, or every bout the second-listed won counted right)
    right += p === 0.5 ? 0.5 : (p > 0.5) === (r.y === 1) ? 1 : 0;
    n++;
  }
  return n ? { n, logLoss: round(loss / n, 4), acc: round(right / n, 4) } : { n: 0, logLoss: null, acc: null };
}

// The held-out backtest (see the header): the last three years by half-year, each fit on the rows before it
export function backtest(rows, { now = new Date(), years = 3, keys = TERM_KEYS } = {}) {
  const all = fitRows(rows);
  const halves = [];
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  for (let i = years * 2; i >= 1; i--) {
    const from = new Date(end);
    from.setUTCMonth(from.getUTCMonth() - 6 * i);
    const to = new Date(end);
    to.setUTCMonth(to.getUTCMonth() - 6 * (i - 1));
    halves.push([from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)]);
  }
  const out = [];
  const held = [];
  for (const [from, to] of halves) {
    const train = all.filter((r) => r.date < from);
    const test = all.filter((r) => r.date >= from && r.date < to);
    if (!test.length || train.length < 500) continue;
    const fit = fitSoft(train, keys);
    for (const r of test) held.push({ ...r, p: predict(fit, r.x).p });
    out.push({ from, to, train: train.length, model: score(test, (r) => predict(fit, r.x).p), rating: score(test, (r) => r.ratingP), coin: score(test, () => 0.5), kept: fit.terms.filter((t) => t.weight).length });
  }
  const buckets = [];
  for (let lo = 0; lo < 1; lo += 0.1) {
    const inB = held.filter((r) => r.p >= lo && r.p < lo + 0.1);
    if (!inB.length) continue;
    buckets.push({ from: round(lo, 1), to: round(lo + 0.1, 1), n: inB.length, mean: round(inB.reduce((s, r) => s + r.p, 0) / inB.length, 4), actual: round(inB.reduce((s, r) => s + r.y, 0) / inB.length, 4) });
  }
  const sum = { model: score(held, (r) => r.p), rating: score(held, (r) => r.ratingP), coin: score(held, () => 0.5) };
  return { at: now.toISOString(), halves: out, all: sum, calibration: buckets, note: 'held out: each half fit on the bouts before it alone; no odds (none kept on this plan), so it says how the model predicts, not what it would have won' };
}

// The data as kept (no network): the archive and the fighters' cache
export function loadKept() {
  const cache = existsSync(MMA_CACHE) ? JSON.parse(readFileSync(MMA_CACHE, 'utf8')) : {};
  return { cache };
}

// The whole model from what's kept: the rows, the fit on them, each fighter's state and rating now
export async function buildModel({ now = new Date() } = {}) {
  const fights = (await keptFights()).filter((f) => f.date <= now.toISOString().slice(0, 10));
  const { cache } = loadKept();
  const { rows, states, ratingNow } = buildRows(fights, cache);
  const fit = fitSoft(fitRows(rows));
  // (a coming bout's chance: both sides' numbers as of its day)
  // (venue: ESPN's for the bout (fights.mjs venueOf); countries: each side's flag on the card, else his bio's)
  const chance = (aId, bId, day, { rounds = 3, lbs = null, venue = null, countries = [null, null] } = {}) => {
    const place = placeOf(venue);
    const side = (id, country) => {
      const s = states.get(id) ?? freshFighter();
      const r0 = ratingNow.get(id) ?? { r: PARAMS.start + (PARAMS.leagueLift.ufc ?? 0), rd: PARAMS.rd0, last: null };
      const rd = r0.last === null ? r0.rd : Math.min(PARAMS.rd0, Math.sqrt(r0.rd ** 2 + (PARAMS.rdPerYear ** 2 * Math.max(0, day - r0.last)) / 31557600000));
      return sideNumbers(s, { r: r0.r, rd }, cache[id]?.bio, cache[id]?.bioAt, day, lbs, { country, place });
    };
    const A = side(aId, countries[0]);
    const B = side(bId, countries[1]);
    const x = featuresOf(A, B, { rounds, place, date: new Date(day).toISOString().slice(0, 10), lbs });
    return { ...predict(fit, x), x, a: A, b: B, ratingP: round(clamp(ratingChance(A, B)), 4) };
  };
  return { fit, rows, fights: fights.length, chance, cache };
}

// Run as a script: the backtest written and printed
if (process.argv[1] && path.relative(process.argv[1], fileURLToPath(import.meta.url)) === '') {
  const now = new Date();
  const model = await buildModel({ now });
  const bt = backtest(model.rows, { now });
  const dir = path.join(ROOT, 'apps/mma/scripts/model');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'backtest.json'), JSON.stringify(bt, null, 1));
  console.log(`${model.fights} fights, ${fitRows(model.rows).length} fit rows; terms kept ${model.fit.terms.filter((t) => t.weight).length} of ${TERMS.length}`);
  for (const t of model.fit.terms) console.log(`  ${t.key.padEnd(11)} w ${String(t.w).padStart(8)} z ${String(t.z).padStart(6)} halves ${t.halves.join(' / ')} soft ${t.soft} -> ${t.weight}`);
  for (const h of bt.halves) console.log(`${h.from}..${h.to}: n ${h.model.n} model ${h.model.logLoss} (${h.model.acc}) rating ${h.rating.logLoss} (${h.rating.acc}) coin ${h.coin.logLoss}`);
  console.log(`all held out: model ${bt.all.model.logLoss} rating ${bt.all.rating.logLoss} coin ${bt.all.coin.logLoss} (n ${bt.all.model.n})`);
  console.log(bt.calibration.map((b) => `${b.from}-${b.to}: ${b.n} mean ${b.mean} actual ${b.actual}`).join('\n'));
}
