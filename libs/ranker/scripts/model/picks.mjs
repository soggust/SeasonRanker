// The public picks: the algorithm's best bets on the games not started yet, for the site's Book
// (apps/<sport>/src/StaticData/model/picks.json, written by every run when they change).
//
//   which    every bet it's placed on a game not started, a game market's or a prop's (a guard's cut one too, D27): the
//            user wants the bot's bets shown, the best first. Since 2026-10-13 every bet is an edge bet (a
//            LIKE or better): a market with no edge is tracked, not bet (desk.mjs TRACK), never a pick, never
//            in the record. Only a showcase: nothing here feeds the bettor's learning
//   score    its Kelly score (scoreParts, below: the order): the share of a bankroll its edge is worth at its
//            price, the stake's Kelly (desk.mjs stakeKelly, 2026-10-18: (p − p0)·(b + 1) / b held to -110's
//            scale, so a short price's small lean can't read as a LOCK), b what a unit pays and p its trusted chance (the book's fair chance
//            pulled toward the model's by the market's trust). Value and likelihood together: a heavy favorite
//            at a price with no edge scores 0 or under and sorts last, whatever its chance. Only the page's
//            order: the bettor's own staking (desk.mjs stakeFor, by the same Kelly fraction) is apart. A big
//            disagreement with the book can't reach the top bands: the bet's trusted chance leans the model's
//            way less past half the market's GAP (desk.mjs leanOf), and past GAP it isn't bet. Its edge score (scoreOf,
//            the tie-break) its expected return per unit at the trusted chance, times how far the trust can be
//            leaned on: 1 once the market's is fitted (the backtest's closing lines and the graded bets), 0.5
//            while it's the untested start (a prop type with fewer than 40 graded)
//   chance   what the page shows beside it: the trusted chance the bet wins, as a whole percent
//   level    its band, the row's color and chip, by its Kelly score (BANDS): lock (5% or more, and a 55%
//            chance), high (2%: LOVE), medium (any edge under that: LIKE), low (PASS: no edge, never a bet)
//   cap      'medium' where a rule holds the band to a LIKE whatever its Kelly (capOf: a practice pick, a practice
//            stake (a gate's, a suspect price's: an edge past desk.mjs suspectOf's bar, D23), a role bet, a research bet
//            not yet earned); none where the band is its Kelly's. The page bands the row as the desk does
//            (book-rows.ts rowOf: its Kelly's band held to the cap), so its what-if reads back its own band (D46)
//   check    besides the bets, the CHECKs (checks.mjs: markets too far from the book to bet, kept to look into
//            and learn from), in their own list (checks, never picks: the Book reads every pick as a bet
//            the bot made, so a CHECK there would be shown, lit and staked as one), level 'check', no units,
//            never shown or published, never in the record: the open ones on games not started whose market
//            wasn't bet after all and whose gap hasn't closed since (closedAt), the shown ones alone (checks.mjs
//            listedCheck: a shadow never, a passed one for PASSED_SHOWN in its passed state), the biggest model
//            Kelly first, CHECK_TOP at most; the rule (checkRule: { kelly }, checks.mjs CHECK_RULE) beside them,
//            the page's words read from it; the Book shows them between LOCK and LOVE in their own band (the
//            admins' alone, with a note to the bot: tiers.ts, desk-note.component.ts). Each with its gap and why it wasn't bet (checkReason, and said in its reason), its
//            chance the model's (past the gap the trusted chance is about the book's, the one it disagrees with),
//            its cause (checkCause: gap, role or news), its model Kelly (modelKelly: the model's chance at its
//            price), the mean the model projects and the one the book's price implies (mean, implied), his record
//            at the line (lineRecord: { over, n }, props.mjs fairOver and its weighted games: context, never a
//            rule), and its last re-evaluation where it was still one (resolved { at, as, by }: checks.mjs
//            resolveChecks; the page's "Noted" till it's after the owner's note); one closed or bet by it is gone
//            from the list, the bet a pick like any other
//   other   a prop's other side's price (otherOdds; null where unknown): the page shows both sides
//   N        every one (D27) by the Kelly score; TOP (40) the page's Best Bets across all the sports. An edge bet's
//            band is its score's, LIKE at the least; one without an edge is low, whatever its score (a favorite
//            at a short price isn't a strong bet: an older action bet's, still open)
//   reason   its plain write-up (writeup.mjs): the pick and what the model sees (a prop's projection against
//            its line, from his blended rate by the drivers that moved it; a game's expected score and what its
//            context saw), the price (our chance, the break-even, the book's no-vig chance, where the edge comes
//            from) and a caveat; a CHECK's says the disagreement and asks its question. Its risk beside it (the
//            page's Devil's Advocate): the likeliest way it loses. Each frozen per bet (writeups.json, extra
//            .writeups) till its material facts change (a re-price) or the text's version is bumped, so the
//            hourly refits never churn it; the analysis Claude wrote for it, where there is one for its facts as
//            they stand, in its place (by 'claude', its headline and read). legacyReasonOf, the old one-liner
//            (kept a release, to diff against)
//   record   the picks' own: each bet the page shows is marked shown (with its chance and Kelly score when
//            first shown, publishedP and publishedKelly), and published once it's locked: REPRICE_BY before its
//            start (timing.mjs), when the news can no longer price it again, or the first run after the start
//            if the runs skipped that. The record is of the published ones only, overall and by band, not of
//            every bet the desk made; since 2026-10-19 (DECISIONS.md D47) it is the Bot's history: the replayed
//            record (replay-record.mjs, today's algorithm over the priced history before the epoch) joined to the
//            live ledger's published bets on the games since (recordBlocks: record, recent). Till then a shown bet is the desk's like any other: the news (or --replace)
//            prices it again, and the page shows the new one; one that falls out of the top before it's locked
//            loses its shown mark. (Published used to be set the run a bet was first shown, which froze the best
//            bets at their first price whatever the news: unlock turns those back into shown ones)

import path from 'node:path';
import { round } from './ratings.mjs';
import { decimal, inPractice, intentOf, isPracticeTop, isTracked, kellyScale, practiceRecord, record, stakeKelly } from './desk.mjs';
import { liveSince, mergeRecent, mergeRecord, readReplay } from './replay-record.mjs';
import { REPRICE_BY } from './timing.mjs';
import { CHECK_RULE, CHECK_TOP, checkKelly, listedCheck, modelKelly } from './checks.mjs';
import { applyWriteups, plainFor, sibOf } from './writeup.mjs';
import { verdictOf } from './research.mjs';

// (a bet locked: its game starts within REPRICE_BY, or has started; nothing prices it again from here)
const locked = (b, now) => Date.parse(b.start) - now.getTime() <= REPRICE_BY;

// The open bets published before they were locked (under the old rule: published the run they were first
// shown), turned back into shown ones, their chance and score when shown kept: so the news and --replace can
// price them again. Returns how many
export function unlock(ledger, now) {
  let n = 0;
  for (const b of ledger.bets) {
    if (!b.published || b.status !== 'open' || locked(b, now)) continue;
    b.shown = true;
    delete b.published;
    delete b.publishedAt;
    n++;
  }
  return n;
}

export const TOP = 40;
// (the confidence bands, by the Kelly score: a bankroll's 2% or more high (the page's LOVE), any edge under that
// medium (LIKE), no edge low (PASS: never bet); a lock above them all: 5% or more and a 55% chance to win, a big
// edge on a likely result. The page reads the same bands: bet-why.ts confidenceOf)
// (2026-10-11, the owner's: edges shrink as the model and its trust settle, so the bands sit lower: LIKE from 1%, LOVE
// from 2%, LOCK from 5% with a 55% chance; the Kelly already counts the trust, an untested type's edge at half)
// (2026-10-13, the owner's: every bet the bot places is a LIKE at the least, so LIKE opens to any edge (medium 0:
// a Kelly over 0) and a market with no edge is tracked, not bet: desk.mjs TRACK)
export const BANDS = { lock: 0.05, lockChance: 0.55, high: 0.02, medium: 0 };
const KIND = { spread: 'spread', total: 'total', ml: 'moneyline', prop: 'player' };
const LABEL = { spread: 'Spread', total: 'Game total', ml: 'Moneyline' };

const pct = (v) => `${Math.round(v * 100)}%`;
const odds = (a) => (a > 0 ? `+${a}` : String(a));
const logo = (sport, abbr) => `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${sport}/500/${abbr.toLowerCase()}.png&w=40&h=40`;
// (a Kelly score's band, with its chance for a lock: value and likelihood together, as the picks are ranked; LIKE
// any score over 0)
export const level = (kelly, p = 0) =>
  kelly >= BANDS.lock && p >= BANDS.lockChance ? 'lock' : kelly >= BANDS.high ? 'high' : kelly > BANDS.medium ? 'medium' : 'low';
// (an edge's band: LIKE at the least, its score rounded to 0 or a hair under it or not: every bet the bot places is
// a LIKE or better. EDGE_ROUND the rounding's reach: its chance kept to 4 places moves a score at a short price by
// up to about 0.0003, so a tiny edge can read -0.0001. One whose score is further under 0 (priced again at a trust
// that's since fallen: selfcheck.mjs C13) has no edge now: PASS. bet-why.ts confidenceOf the same)
export const EDGE_ROUND = 0.0005;
export const edgeLevel = (kelly, p = 0) => (kelly > -EDGE_ROUND && level(kelly, p) === 'low' ? 'medium' : level(kelly, p));
// (a bet's band: its Kelly score's if it has an edge, LIKE at the least; else low: a favorite at a short price
// isn't a strong bet (an older action bet; a tracked row is never a pick))
// (a role bet (props.mjs roleGateOf: a role cause's risky side bet on its graded CHECKs' record, at the untested cap's
// half; its context's roleBet) a LIKE at most, whatever its Kelly: the owner's (round E, 2026-10-17), the score there
// being the model's own number on a role it reads poorly)
// (a role bet a LIKE under 0 too: past the gap its trusted chance is the book's (its Kelly the vig's), the edge it's
// bet on its cause's record, and every bet the bot places is a LIKE or better)
// (and a research bet or a research-adjusted one, research.mjs: a LIKE, the owner's, 2026-10-17; a research bet's a LIKE
// whatever its score, the research's word its reason; till the research earns its level, research.mjs
// researchLevelOf: one placed with it earned (its tag's earned) is banded by its Kelly as any edge, LOVE and LOCK
// possible, a research bet a LIKE at the least)
const earnedBet = (b) => !!b.researchBet?.earned;
// (a slate's practice pick (desk.mjs isPracticeTop: bet for the slate, short of the vig) a LIKE, whatever its score)
// (and a suspect price (desk.mjs suspectOf: an edge past EDGE_SUSPECT points or Z_SUSPECT SDs over its break-even) a LIKE at most, its stake the practice one)
// (and the confidence layer's cap (confidence.mjs capOf, DECISIONS.md D52: a tier not earned on the record): the band
// the bet may reach by its quality q, on the bet as conf.cap ('medium' a LIKE at most, 'high' a LOVE at most); the
// owner's Kelly bands stay as the floors under it (never a LOVE under 2%), and a bet without one (no model file, a
// sport without a fit, MMA) keeps its Kelly's band)
const confCap = (b) => (b?.conf?.cap === 'medium' || b?.conf?.cap === 'high' ? b.conf.cap : null);
// (the reason tier (reasons.mjs, DECISIONS.md D58), where the desk read one: the band in place of the Kelly's and of
// D52's quality cap: LIKE any edge, the tier (LOVE or LOCK) where the Kelly clears the owner's 2% floor, held to the
// rules' caps (a practice pick, a gate, a suspect price, a role or research pick: a LIKE at most))
const TIERED = new Set(['lock', 'high', 'medium']);
const tierOn = (b) => TIERED.has(b?.conf?.tier);
// (the two-band trial (DECISIONS.md D73, trusted.mjs): its LOVE's Kelly range in place of the 2% floor, [from, to),
// to null for none; the owner's "just lowering thresholds" of 2026-10-20)
export const tierKellyOf = (b) => (Array.isArray(b?.conf?.trial?.kelly) && Number.isFinite(b.conf.trial.kelly[0]) ? b.conf.trial.kelly : null);
const tierClears = (b, kelly) => {
  const k = tierKellyOf(b);
  return k ? kelly >= k[0] && (k[1] === null || kelly < k[1]) : kelly >= BANDS.high;
};
export const levelOf = (b, kelly, p = b.p) => {
  const base = ruleLevel(b, kelly, p);
  if (!tierOn(b) || base === 'low') return capBand(base, confCap(b));
  return capBand(tierClears(b, kelly) ? b.conf.tier : 'medium', ruleCap(b));
};
const ruleLevel = (b, kelly, p = b.p) =>
  intentOf(b) !== 'edge' ? 'low'
  : isPracticeTop(b) ? 'medium'
  : earnedBet(b) && !b.practice && !b.suspect ? (edgeLevel(kelly, p) === 'low' ? 'medium' : edgeLevel(kelly, p))
  : b.researchBet || b.context?.roleBet ? 'medium'
  : ((b.researchAdjusted && !b.researchAdjusted.earned) || b.practice || b.suspect) && edgeLevel(kelly, p) !== 'low' ? 'medium'
  : edgeLevel(kelly, p);
// (the cap levelOf puts on an edge bet whatever its Kelly, from the same marks: 'medium' (a LIKE at most) for a
// slate's practice pick, a practice stake (a gate's, a suspect price's), a role bet, and a research bet or a
// research-adjusted one not yet earned; null where its band is its Kelly's. The board carries it per side
// (board.mjs cap), so the Book's suggestions and the what-if never show a band the Bot couldn't give the row:
// DECISIONS.md D46. levelOf(b, k, p) is capBand(edgeLevel(k, p), capOf(b)) for every edge bet with an edge)
// (a pick's place among the bands as the Book lists them: LOCK 0, LOVE 1, LIKE 2, a practice pick 3, a PASS 4)
const SHOWN = { lock: 0, high: 1, medium: 2, low: 4 };
export const displayOrder = (b, kelly) => (isPracticeTop(b) ? 3 : (SHOWN[levelOf(b, kelly)] ?? 4));
export const capOf = (b) => (tierOn(b) ? ruleCap(b) : lower(ruleCap(b), confCap(b)));
const ruleCap = (b) =>
  isPracticeTop(b) ? 'medium'
  : earnedBet(b) && !b.practice && !b.suspect ? null
  : b.researchBet || b.context?.roleBet || (b.researchAdjusted && !b.researchAdjusted.earned) || b.practice || b.suspect ? 'medium'
  : null;
const RANK = { low: 0, medium: 1, high: 2, lock: 3 };
// (a band held to a cap: the lower of the two; a CHECK, or no cap, as it is)
export const capBand = (band, cap) => (cap && band in RANK && cap in RANK && RANK[cap] < RANK[band] ? cap : band);
// (the lower of two caps; one alone as it is)
const lower = (x, y) => (!x ? (y ?? null) : !y ? x : RANK[x] <= RANK[y] ? x : y);

// The bot's recent form, for the Book's Recent form card (recent-form.ts botForm, The Bot side): over its graded
// placed bets (a tracked row never, an open or void one never), each US Eastern day's [won, lost, push, staked,
// profit] for the last RECENT_DAYS days (the user's tally's shape, so the page sums the five sports' days the way
// it sums the user's, against its own clock), the week's record and units, the current streak (the settled times
// of its bets, newest first, and the time of the bet that broke it: so the page can join the sports' streaks), and
// the last RECENT_LAST settled bets, the latest first, a push among them (pick, game, result, units, settled time)
export const RECENT_DAYS = 7;
export const RECENT_LAST = 5;
const STREAK_CAP = 60;
const ET_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const etDayOf = (t) => ET_DAY.format(new Date(t));
const settledAt = (b) => b.gradedAt ?? b.start;
// (a ledger market as the wallet names it, so the page links a prop's player or a fight's fighter: betPlayer)
const WALLET_MARKET = { ml: 'moneyline', prop: 'prop', spread: 'spread', total: 'total' };
export function recentOf(sport, bets, now) {
  const graded = bets
    .filter((b) => !b.void && !isTracked(b) && ['won', 'lost', 'push'].includes(b.status) && Number.isFinite(b.profit))
    .filter((b) => !inPractice(b))
    .sort((x, y) => String(settledAt(y)).localeCompare(String(settledAt(x))) || String(y.start).localeCompare(String(x.start)) || String(y.id).localeCompare(String(x.id)));
  const t = now.getTime();
  const window = new Set(Array.from({ length: RECENT_DAYS }, (_, i) => etDayOf(t - i * 864e5)));
  const days = {};
  const week = { won: 0, lost: 0, push: 0, profit: 0 };
  for (const b of graded) {
    const at = Date.parse(settledAt(b));
    if (!Number.isFinite(at) || at > t) continue;
    const day = etDayOf(at);
    if (!window.has(day)) continue;
    const d = (days[day] ??= [0, 0, 0, 0, 0]);
    d[b.status === 'won' ? 0 : b.status === 'lost' ? 1 : 2]++;
    d[3] = round(d[3] + (b.units ?? 0), 2);
    d[4] = round(d[4] + b.profit, 2);
    week[b.status]++;
    week.profit += b.profit;
  }
  week.profit = round(week.profit, 2);
  const decided = graded.filter((b) => b.status !== 'push');
  let n = 0;
  while (n < decided.length && decided[n].status === decided[0].status) n++;
  const last = graded.slice(0, RECENT_LAST).map((b) => {
    const market = WALLET_MARKET[b.market] ?? b.market;
    const s = b.sport ?? sport;
    return {
      sport: s,
      pick: b.pick,
      matchup: b.matchup,
      market,
      player: market === 'prop' || (s === 'mma' && market === 'moneyline') ? (b.player ?? b.fighters?.[b.side]?.name ?? null) : null,
      res: b.status === 'won' ? 'W' : b.status === 'lost' ? 'L' : 'P',
      units: round(b.profit, 2),
      at: settledAt(b),
    };
  });
  // (the slate's practice picks' week on its own line while desk.mjs PRACTICE_SPLIT: the card's Practice line)
  const practice = { won: 0, lost: 0, push: 0, profit: 0 };
  for (const b of bets) {
    if (!inPractice(b) || b.void || !['won', 'lost', 'push'].includes(b.status) || !Number.isFinite(b.profit)) continue;
    const at = Date.parse(settledAt(b));
    if (!Number.isFinite(at) || at > t || !window.has(etDayOf(at))) continue;
    practice[b.status]++;
    practice.profit = round(practice.profit + b.profit, 2);
  }
  return {
    days,
    week,
    ...(practice.won + practice.lost + practice.push ? { practice } : {}),
    streak: decided.length ? `${decided[0].status === 'won' ? 'W' : 'L'}${n}` : null,
    streakAt: decided.slice(0, Math.min(n, STREAK_CAP)).map(settledAt),
    brokeAt: decided[n] ? settledAt(decided[n]) : null,
    last,
  };
}

// A bet's score (see above): its EV, half for a market whose trust is still the untested start
export function scoreOf(bet, trust) {
  const key = bet.market === 'prop' ? `prop:${bet.propType}` : bet.market;
  return round(bet.ev * (trust?.[key]?.fitted ? 1 : 0.5), 4);
}

// (a price's Kelly score at a trusted chance p: the stake's Kelly (desk.mjs stakeKelly), its edge in chance
// (p less the break-even) times what the price pays, (b + 1) / b, held to -110's scale: the one the stake is
// sized on, so a short price's small lean never reads as a big score (2026-10-18). The picks' order and bands,
// and every side's on the board, board.mjs)
export function kellyOf(odds, p) {
  return round(stakeKelly(odds, p), 4);
}

// A bet's Kelly score (the order), and its parts as the page's rank tile shows them: what a unit pays (b) and
// the price's break-even chance (p0), then the price's part, the book's own fair chance against that
// break-even (its vig on this side: under 0, or over where the price beats its own fair chance), and the
// model's lean, the trust times the model's chance less the book's; each scaled by what the price pays,
// (b + 1) / b held to -110's (desk.mjs kellyScale, the stake's), so they add up to the score. The trust read back
// off the bet's own numbers (the one it was priced at), fitted or the untested start, and where the fair chance
// came from
export function scoreParts(bet, trust) {
  const b = decimal(bet.odds) - 1;
  const p0 = 1 / (b + 1);
  const scale = kellyScale(bet.odds);
  const score = kellyOf(bet.odds, bet.p);
  const price = round((bet.fair - p0) * scale, 4);
  const key = bet.market === 'prop' ? `prop:${bet.propType}` : bet.market;
  const gap = bet.model - bet.fair;
  return {
    score,
    price,
    lean: round(score - price, 4),
    b: round(b, 4),
    p0: round(p0, 4),
    fair: round(bet.fair, 4),
    p: round(bet.p, 4),
    trust: Math.abs(gap) > 1e-6 ? round((bet.p - bet.fair) / gap, 2) + 0 : null,
    fitted: !!trust?.[key]?.fitted,
    from: bet.oddsAssumed ? 'even' : bet.fairFrom === 'pinnacle' ? 'pinnacle' : 'book',
  };
}

// A bet's reasons, in a few short sentences from its own numbers: the old text, before the plain write-ups
// (writeup.mjs); kept a release, for diffing against
export function legacyReasonOf(bet, game) {
  const [away, home] = bet.matchup.split(' @ ');
  const c = bet.context ?? {};
  const out = [];
  const anchor = bet.fairFrom === 'pinnacle' ? "Pinnacle's line" : 'the Book';
  out.push(bet.oddsAssumed ? `Bot ${pct(bet.model)} vs an even line (-110 assumed: the Book's board had no price).` : `Bot ${pct(bet.model)} vs ${anchor} ${pct(bet.fair)} (the Book ${odds(bet.odds)}).`);
  if (bet.market === 'prop' && bet.projection) {
    const p = bet.projection;
    out.push(`Projects ${p.mean} ${bet.statLabel.toLowerCase()} against a line of ${bet.line}${p.games ? ` (${p.rate} a game this season)` : ''}.`);
    // (the defense against his role, and its funnel: said where they stand out; "not weighed" where the
    // projection leaves them out, as it does while they haven't helped on past games)
    // (his team is ESPN's id: the defense is the game's other side)
    const defense = bet.team && game ? (String(bet.team) === String(game.home) ? game.awayAbbr : String(bet.team) === String(game.away) ? game.homeAbbr : null) : null;
    const team = defense ?? 'The defense';
    if (p.role && Number.isFinite(p.roleFactor) && Math.abs(p.roleFactor - 1) >= 0.1 && p.roleRank) {
      const pctOff = Math.round(Math.abs(p.roleFactor - 1) * 100);
      out.push(`${team} ${p.roleFactor < 1 ? 'holds' : 'gives'} ${p.role}s ${pctOff}% ${p.roleFactor < 1 ? 'under' : 'over'} their average (#${p.roleFactor < 1 ? p.roleRank.rank : p.roleRank.of - p.roleRank.rank + 1} in the league${p.roleUsed ? '' : '; not weighed: the role split hasn\'t helped on past games'}).`);
    }
    if (Number.isFinite(p.funnel) && Math.abs(p.funnel) >= 0.03) {
      out.push(`${team} is a ${p.funnel > 0 ? 'pass' : 'run'} funnel: opponents pass ${Math.round(Math.abs(p.funnel) * 100)} points ${p.funnel > 0 ? 'more' : 'less'} often than usual for the situation${p.funnelUsed ? '' : ' (not weighed: it hasn\'t helped on past games)'}.`);
    }
  } else if (Number.isFinite(bet.expMargin) && Number.isFinite(bet.expTotal)) {
    const h = (bet.expTotal + bet.expMargin) / 2;
    const a = (bet.expTotal - bet.expMargin) / 2;
    out.push(`Expects ${away} ${a.toFixed(1)}, ${home} ${h.toFixed(1)}.`);
  }
  // (what the context saw)
  const notes = [];
  const s = c.starters ?? {};
  // (over 0, a worse quarterback than the usual one; under 0, a better one: the starter back from an injury)
  for (const [i, t, qb] of [
    [0, home, s.home],
    [1, away, s.away],
  ]) {
    if (s.backup?.[i] > 0) notes.push(`${t} starts a backup QB${qb ? ` (${qb})` : ''}`);
    else if (s.backup?.[i] < 0) notes.push(`${t} has its better QB back${qb ? ` (${qb})` : ''}`);
  }
  if (s.missing && (s.missing[0] >= 15 || s.missing[1] >= 15)) {
    for (const [i, t] of [home, away].entries()) if (s.missing[i] >= 15) notes.push(`${t} is missing players worth ${Math.round(s.missing[i])} production a game`);
  }
  if (bet.sport === 'nhl' && s.home && s.away && !bet.player) notes.push(`${s.away} vs ${s.home} in net`);
  if (bet.sport === 'mlb' && s.home && s.away && !bet.player) notes.push(`${s.away} vs ${s.home} on the mound`);
  if (c.b2b?.[0]) notes.push(`${home} played last night`);
  if (c.b2b?.[1]) notes.push(`${away} played last night`);
  const w = c.weather ?? {};
  if (Number.isFinite(w.wind) && w.wind >= 12) notes.push(`${w.wind} mph wind`);
  if (Number.isFinite(w.temp) && w.temp <= 35) notes.push(`${w.temp}°`);
  if (Number.isFinite(w.windOut) && Math.abs(w.windOut) >= 8) notes.push(`wind blowing ${w.windOut > 0 ? 'out' : 'in'} at ${Math.abs(w.windOut)} mph`);
  if (Number.isFinite(w.snow) && w.snow >= 0.5) notes.push(`snow in the forecast (${w.snow} in)`);
  else if (Number.isFinite(w.precip) && w.precip >= 0.1) notes.push(`rain in the forecast (${w.precip} in)`);
  if (w.rain === true) notes.push('rain at the park');
  // (the owner's word on a player, put into the injury report it was priced on: notes.mjs; first, so it's said)
  notes.unshift(...(c.ownerNotes ?? []).map((n) => n.replace(/^(Owner note|Research): /, (m) => m.toLowerCase())));
  if (notes.length) out.push(`${notes.slice(0, 3).join('; ').replace(/^./, (x) => x.toUpperCase())}.`);
  // (a line that's moved its way since it was bet: the market agreeing)
  const seen = bet.seen;
  if (seen && seen.line !== null && bet.line !== null && seen.line !== undefined && seen.line !== bet.line) {
    const better = bet.market === 'spread' ? seen.line < bet.line : bet.side === 'over' ? seen.line > bet.line : bet.side === 'under' ? seen.line < bet.line : false;
    if (better) out.push(`The line has moved its way since (${bet.line} to ${seen.line}).`);
  } else if (seen && Number.isFinite(seen.fair) && seen.fair - bet.fair >= 0.015) out.push(`The market has moved its way since (${pct(bet.fair)} to ${pct(seen.fair)}).`);
  // (a CHECK: why it wasn't bet, the guard's words)
  if (bet.intent === 'check' && bet.reason) out.push(`Not bet: ${bet.reason}.`);
  return out.join(' ');
}

// A game's place and weather as the page shows it (its city, the park, the roof, the temperature and wind)
function whereOf(bet, game) {
  const w = bet.context?.weather ?? {};
  const city = game?.venue?.split('|')[0] || null;
  const stadium = bet.context?.lineups?.park ?? null;
  const roof = w.roof === 'outdoors' || w.roof === 'open' ? 'outdoors' : w.roof === 'dome' || w.roof === 'closed' || game?.indoor || bet.sport === 'nba' || bet.sport === 'nhl' ? 'indoors' : w.roof ? 'retractable' : null;
  const tempF = Number.isFinite(w.temp) ? w.temp : null;
  const windMph = Number.isFinite(w.wind) ? w.wind : Number.isFinite(w.windOut) ? Math.abs(w.windOut) : null;
  return { city, stadium, weather: roof || tempF !== null ? { roof: roof ?? 'outdoors', tempF, windMph } : null };
}

// The sport's picks: its bets on games not started, the best Kelly score first, the top TOP; each one marked
// shown on the ledger (its level then), published once it's locked, and the published ones' record. extra:
// { state (the trust, the context's terms and the props' fits the write-ups read), writeups (writeups.json: the
// write-ups kept per bet, written to here (new or changed ones) and pruned to the open bets and CHECKs), keepChecks
// (checks.json unreadable, checks-file.mjs: the ledger's CHECKs aren't the whole list, so no write-up that
// isn't a bet's is pruned) }
export function buildPicks(sport, ledger, trust, games, now, extra = {}) {
  const state = extra.state ?? { trust };
  const writeups = extra.writeups ?? null;
  // (the ones shown before and locked since (their game within REPRICE_BY, or started between runs, graded
  // even): published, at their chance and level when first shown)
  for (const b of ledger.bets) {
    if (!b.shown || b.published || !locked(b, now)) continue;
    Object.assign(b, { published: true, publishedAt: now.toISOString() });
    delete b.shown;
  }
  // (a tracked row (desk.mjs TRACK: no edge, not bet) never: the page reads every pick as a bet the bot made)
  // (every bet it placed, D27: a guard's cut one too (context.guard: a moved line, a questionable player, the
  // line gate's practice stake), bet at 0.5u with its edge since 2026-10-13, no longer the old action bet the
  // guard once hid; a slate's practice pick on the Book as a LIKE with its practice tag)
  const open = ledger.bets.filter((b) => b.status === 'open' && Date.parse(b.start) > now.getTime() && !isTracked(b));
  // (one a bet: a --dry run prices placed bets again in memory)
  const once = [...new Map(open.map((b) => [b.id, b])).values()];
  // (the order: its Kelly score; its edge score kept beside it)
  const scored = once.map((b) => {
    const { score, ...why } = scoreParts(b, trust);
    return { b, score, why, edgeScore: scoreOf(b, trust) };
  });
  scored.sort((x, y) => y.score - x.score || y.edgeScore - x.edgeScore || x.b.start.localeCompare(y.b.start));
  // (all of them, D27: TOP is the Book's count for Best Bets, never a cut here; a sport's 41st bet is still on
  // its game's list, so shown, and published once locked like the rest)
  const top = scored;
  for (const { b, score } of top) {
    // (shown now; published once locked: at REPRICE_BY before the start, here or the next run)
    if (locked(b, now)) {
      if (!b.published) Object.assign(b, { published: true, publishedAt: now.toISOString() });
      delete b.shown;
    } else if (!b.published) b.shown = true;
    // (its chance and its Kelly score when shown, and its band: fixed from then on, so the record by band is
    // what the page said at the time)
    if (!Number.isFinite(b.publishedP)) b.publishedP = b.p;
    if (!Number.isFinite(b.publishedKelly)) b.publishedKelly = score;
    b.publishedLevel = levelOf(b, b.publishedKelly, b.publishedP);
  }
  // (the rank follows the Book's order (the coordinator's, 2026-10-19: "#2 Amanda Nunes" atop LOVE over "#1 Josh Hokit"
  // in LIKE): the band first, LOCK, LOVE, LIKE, then the practice picks, then the Kelly score within a band, so #1 is
  // always the top row)
  scored.sort((x, y) => displayOrder(x.b, x.score) - displayOrder(y.b, y.score) || y.score - x.score || y.edgeScore - x.edgeScore || x.b.start.localeCompare(y.b.start));
  // (the CHECKs: a guard's skip worth a person's look (checks.mjs), on games not started and not bet after all
  // (an open bet on the market: that one shows) and not closed since (closedAt), a shadow never (a passed one for
  // a while, in its passed state: listedCheck); the biggest model Kelly first, CHECK_TOP at most. Their own list,
  // apart from the picks: the ones the owner should look into)
  const betIds = new Set(open.map((b) => b.id));
  // (by its cleared Kelly, the one it's judged and shown by: checks.mjs checkKelly)
  const mk = (c) => checkKelly(c) ?? -Infinity;
  const checks = (ledger.checks ?? [])
    .filter((c) => listedCheck(c, now) && !betIds.has(c.id) && Date.parse(c.start) > now.getTime())
    .sort((x, y) => mk(y) - mk(x) || Math.abs(y.gap ?? 0) - Math.abs(x.gap ?? 0) || x.start.localeCompare(y.start))
    .slice(0, CHECK_TOP)
    .map((b) => {
      const { score, ...why } = scoreParts(b, trust);
      return { b, score, why, check: true };
    });
  const rowOf = ({ b, score, why, check }, i) => {
    const g = games.get(b.event);
    const [away, home] = b.matchup.split(' @ ');
    // (its write-up: kept per bet till its facts change; a prop's game read off its game's own bet. One that
    // fails to write falls back to the old text, never stops the picks)
    let wrote;
    try {
      wrote = plainFor(b, { game: g, sib: sibOf(b, ledger.bets), state, ledger, writeups });
    } catch (err) {
      console.warn(`${sport}: write-up for ${b.id} failed (${err.message}): the old text`);
      wrote = { hash: null, entry: { plain: { reason: legacyReasonOf(b, g), legacy: true } } };
    }
    const { hash, entry } = wrote;
    const row = {
      id: b.id,
      rank: i + 1,
      sport,
      score,
      // (a CHECK's the model's: its trusted chance, past the gap, is about the book's)
      chance: Math.round((check ? b.model : b.p) * 100),
      level: check ? 'check' : levelOf(b, score),
      // (the rule's cap on its band, as the page must band it: a suspect early-band MMA price a LIKE at its Kelly's LOVE)
      ...(!check && capOf(b) ? { cap: capOf(b) } : {}),
      edge: intentOf(b) === 'edge',
      // (a slate's practice pick: bet for the slate at the practice stake, short of the vig; the Book's practice tag)
      ...(isPracticeTop(b) ? { practice: true } : {}),
      // (the band the desk holds it to (capOf: a rule's LIKE, the confidence layer's tier cap, D36 and D52) and the
      // confidence layer's read (confidence.mjs qualityOf: the calibrated chance pc, the quality q, the cap), so the
      // page and its what-if show the band the Bot could give it, at any price)
      ...(!check && capOf(b) ? { cap: capOf(b) } : {}),
      ...(!check && b.conf ? { conf: { pc: b.conf.pc, q: b.conf.q, cap: b.conf.cap ?? null } } : {}),
      // (the reason tier (D58): the band the Bot's proven reasons give it before the Kelly floor and the rules' caps,
      // and those reasons with their records, the popover's list)
      // (the news lag's tag (D66): the star out and when the desk first saw it; the popover's "Star out" line)
      ...(!check && b.newsLag?.player ? { lag: { player: b.newsLag.player, first: b.newsLag.first ?? null, min: b.newsLag.min ?? null } } : {}),
      ...(!check && tierOn(b) ? { tier: b.conf.tier, ...(tierKellyOf(b) ? { tierKelly: tierKellyOf(b), trial: true } : {}), ...(Array.isArray(b.conf.reasons) && b.conf.reasons.length ? { reasons: b.conf.reasons.slice(0, 4) } : {}) } : {}),
      kind: KIND[b.market] ?? 'player',
      market: b.market === 'prop' ? b.statLabel : LABEL[b.market],
      pick: b.pick,
      // (which side it took, and a prop's player and his team, ESPN's ids: the page's circle and its color)
      side: b.side ?? null,
      athlete: b.athlete ?? null,
      team: b.team ?? null,
      player: b.player ?? null,
      line: b.line,
      odds: b.odds,
      // (a prop's usage (usage.mjs, DECISIONS.md D41): the work the projection reads for him tonight, one inspectable
      // number with its parts, as the bet carries it (projection.usage); the popover can show it)
      ...(b.market === 'prop' && b.projection?.usage ? { usage: b.projection.usage } : {}),
      // (the other side's price, a prop's (the page shows both sides); none where it isn't known)
      otherOdds: Number.isFinite(b.otherOdds) ? b.otherOdds : null,
      book: b.book ?? 'DraftKings',
      model: b.model,
      fair: b.fair,
      p: b.p,
      ev: b.ev,
      units: b.units,
      // (its score's parts, for the rank tile's breakdown: price + lean is the score)
      why,
      start: b.start,
      // (when the bet was placed (the Book agent's ask, 2026-10-19): a bet row can say "Bet at -109, 2:05 PM")
      ...(b.placedAt ? { placedAt: b.placedAt } : {}),
      matchup: b.matchup,
      teams: [away, home].map((abbr) => ({ abbr, logo: logo(sport, abbr) })),
      where: whereOf(b, g),
      reason: entry.plain.reason,
      // (a CHECK's: the model's distance from the book, signed for its side, and why it wasn't bet; a role
      // CHECK's cause and sub-reason, a news one's cause and unit: checks.mjs)
      ...(check ? { gap: b.gap, checkReason: b.reason, ...(b.cause === 'role' ? { checkCause: 'role', roleReason: b.roleReason ?? null } : b.cause === 'news' ? { checkCause: 'news', newsUnit: b.newsUnit ?? null } : { checkCause: 'gap' }) } : {}),
      // (a CHECK's numbers the page leads with: its cleared Kelly (checkKelly: the stake's Kelly at the chance it'd
      // be bet at with its doubt answered, the one it's judged by), the model's own Kelly beside it as context
      // (modelKelly), the model's mean and the book's implied one, his record at the line (context, never a rule))
      ...(check ? { checkKelly: checkKelly(b), modelKelly: modelKelly(b.odds, b.model), ...checkNumbers(b) } : {}),
      // (a CHECK's news research, where it has one (research.mjs): its finding for the popover, a label only)
      ...(check && b.research ? { research: researchRow(b.research) } : {}),
      // (a CHECK's last re-evaluation, still one (checks.mjs resolveChecks): the page's note to the bot answered
      // once it's after the note; held, why a noted one couldn't be re-priced)
      ...(check && b.resolved ? { resolved: { at: b.resolved.at, as: b.resolved.as, ...(b.resolved.by ? { by: b.resolved.by } : {}), ...(b.resolved.held ? { held: b.resolved.held } : {}), ...(b.resolved.why ? { why: b.resolved.why } : {}) } } : {}),
    };
    // (its risk, the page's Devil's Advocate, and the AI's analysis in place of the plain text where it has one)
    return applyWriteups(row, entry, hash);
  };
  const picks = top.map(rowOf);
  const checkRows = checks.map(rowOf);
  // (the write-ups kept: the open bets' and the open CHECKs' (as the CHECKs' list: not graded, closed or bet
  // after all), the rest dropped (graded, taken back))
  if (writeups?.items) {
    const live = new Set([...ledger.bets.filter((b) => b.status === 'open').map((b) => b.id), ...(ledger.checks ?? []).filter((c) => listedCheck(c, now)).map((c) => c.id)]);
    const bets = new Set(ledger.bets.map((b) => b.id));
    for (const id of Object.keys(writeups.items)) if (!live.has(id) && !(extra.keepChecks && !bets.has(id))) delete writeups.items[id];
  }
  return { sport, at: now.toISOString(), bands: BANDS, top: TOP, checkRule: CHECK_RULE, ...recordBlocks(sport, ledger, now, extra), picks, checks: checkRows };
}

const ROOT = path.resolve(import.meta.dirname, '../../../..');
// The Bot's history for the page: its record and its recent form (the owner, 2026-10-19: the history is what today's
// Bot would have done). The replayed record (replay-record.mjs: today's algorithm over the priced history before its
// epoch, written by gate.mjs --record) joined to the live ledger's published bets on the games from the epoch on
// (the same algorithm, so they are the replay going forward); with no replay file the live ledger alone, as before.
// record: graded (the live ledger's), overall, byLevel (lock, high, medium; low the live ledger's older action bets),
// practice (its own line, desk.mjs PRACTICE_SPLIT), byMarket, year (this calendar year's: the Book's band headers'
// "This year"), live (the live part alone, from the epoch), replay (the replay's part and its honesty flags), caveat.
// recent: recentOf over the live part, the replay's days, streak and last bets joined (mergeRecent). extra.replay
// a file given (the tests); a tracked row never in either
export function recordBlocks(sport, ledger, now, extra = {}) {
  const replay = extra.replay !== undefined ? extra.replay : readReplay(extra.root ?? ROOT, sport);
  const published = ledger.bets.filter((b) => b.published && !isTracked(b));
  const epoch = replay?.epoch ?? extra.epoch ?? null;
  const live = replay ? ledger.bets.filter((b) => liveSince(b, epoch)) : ledger.bets;
  return {
    record: mergeRecord(replay, published, { epoch, now: now.getTime(), record, levelOf: (b) => b.publishedLevel, practiceOf: practiceRecord }),
    recent: mergeRecent(replay, recentOf(sport, live, now), { now: now.getTime(), days: RECENT_DAYS, last: RECENT_LAST }),
  };
}

// (a prop CHECK's numbers for the page: the model's mean, the book's implied one, his record at the line (his
// over share, smoothed, and the weighted games it's from); none a game market's)
function checkNumbers(c) {
  const p = c.projection;
  if (c.market !== 'prop' || !p) return {};
  return {
    ...(Number.isFinite(p.mean) ? { mean: p.mean } : {}),
    ...(Number.isFinite(p.implied) ? { implied: p.implied } : {}),
    ...(Number.isFinite(p.fairOver) && Number.isFinite(p.record) ? { lineRecord: { over: p.fairOver, n: p.record } } : {}),
  };
}

// (a CHECK's research as the page shows it (research.mjs findingOf's fields, checked again): its status, reason,
// player, summary, its http(s) sources, when it was made and whether it was put into the injury report)
// (what the research moved, in words: the inputs, the projection and the model's chance before and after, now)
export function movedWords(m) {
  const num = (v) => (Number.isFinite(v) ? String(v) : '?');
  const pct = (v) => (Number.isFinite(v) ? `${Math.round(v * 1000) / 10}%` : '?');
  const text = `${m.input}: projection ${num(m.before?.mean)} -> ${num(m.after?.mean)}, model ${m.before?.side ?? '?'} ${pct(m.before?.model)} -> ${m.after?.side ?? '?'} ${pct(m.after?.model)}${m.now ? `; ${m.now}` : ''}`;
  return text.replace(/\s+/g, ' ').trim().slice(0, 400);
}

export function researchRow(rs) {
  const str = (v, n) => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, n) : null);
  return {
    status: ['out', 'doubtful', 'questionable', 'limited', 'active', 'unknown'].includes(rs?.status) ? rs.status : 'unknown',
    reason: str(rs?.reason, 20) ?? 'none',
    player: str(rs?.player, 80),
    summary: str(rs?.summary, 240) ?? '',
    sources: (Array.isArray(rs?.sources) ? rs.sources : []).filter((u) => typeof u === 'string' && /^https?:\/\/\S+$/.test(u) && u.length <= 500).slice(0, 5),
    at: str(rs?.at, 30),
    ...(rs?.applied ? { applied: true } : {}),
    // (the verdict: research.mjs verdictOf, what the run did with it, whether our feeds held the reason)
    ...(typeof rs?.explains === 'boolean' ? { explains: rs.explains } : {}),
    ...(str(rs?.category, 20) ? { category: str(rs.category, 20) } : {}),
    ...(str(rs?.confidence, 10) ? { confidence: str(rs.confidence, 10) } : {}),
    verdict: verdictOf(rs),
    ...(rs?.call?.act ? { act: str(rs.call.act, 10), actWhy: str(rs.call.why, 300) } : {}),
    // (what the research moved in the inputs, its projection and chance before and after: run.mjs recordChecks)
    ...(rs?.moved?.input ? { moved: movedWords(rs.moved) } : {}),
    ...(rs?.feeds ? { inOurFeeds: !!rs.feeds.inOurFeeds, feed: str(rs.feeds.feed, 40) } : {}),
  };
}

// (a record as the page's: wins, losses, pushes, the win share; a void bet, no action, isn't counted. The page's
// blocks come from recordBlocks (replay-record.mjs mergeRecord) in the same shape)
export function tally(bets) {
  const r = record(bets);
  return { wins: r.won, losses: r.lost, pushes: r.push, winPct: r.won + r.lost ? round(r.won / (r.won + r.lost), 4) : null, profit: r.profit };
}
