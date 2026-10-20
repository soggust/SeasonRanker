import { barWidths, signedAmount } from '../../core/breakdown';
import { Confidence, tierLabel, unranked } from './tiers';
// Why a bet ranks where it does on the Book (its rank tile clicked): its score split into what makes it,
// and what separates it from the bets beside it. The score is its Kelly score (picks.mjs scoreParts): how much
// of a bankroll its edge is worth at its price, (b·p − (1 − p)) / b, b what a unit pays and p its trusted
// chance. As p is the book's fair chance plus the model's lean, it splits in two: the price (the book's fair
// chance against the price's break-even, its vig on this side) and the model's lean (the trust times the
// model's chance less the book's), each scaled by what the price pays. In points (times 100), so the parts add
// up to the score the list went by. (The AI analyst's quarter, where the NFL bet desk's sheet made the same call,
// went with the desk: retired 2026-10-14.)

// (the parts picks.mjs writes beside the score: price + lean is the score; picks written before carry an older
// split, fair + lean of the chance, or none)
export interface PickWhy {
  price?: number;
  lean: number;
  b?: number;
  p0?: number;
  fair: number;
  p?: number;
  trust: number | null;
  fitted: boolean;
  from: 'pinnacle' | 'book' | 'even';
}

// A row as the breakdown reads it (the page's BetRow has all of these)
export interface BetWhyRow {
  id: number;
  pick: string;
  player?: string | null;
  market: string;
  confidence: Confidence | null;
  chance?: number;
  // (the order: the Kelly score)
  sureness: number;
  edge?: boolean;
  model?: number;
  fair?: number;
  p?: number;
  ev?: number;
  units?: number;
  price?: number;
  book?: string;
  why?: PickWhy | null;
  // (the analysis beside the parts (whyFacts): a prop's projection and the Book's implied mean, his usage, the terms
  // that moved it most; book-rows.ts BetRow's)
  mean?: number | null;
  implied?: number | null;
  usage?: [number, string] | null;
  terms?: [string, number][] | null;
  // (a practice pick's tag, and the desk's cap on a board side or a pick (board.json and picks.json cap, DECISIONS.md
  // D46 and D52): 'medium' a LIKE at most at every price, its stake the practice one; 'high' a LOVE at most)
  practice?: boolean;
  cap?: BandCap | null;
  // (the reason tier (picks.json tier, D58): the band its proven reasons give it where the Kelly clears the 2% floor;
  // the reasons in words, with their records)
  tier?: Confidence | null;
  reasons?: string[];
}

// One ingredient: what it added to the score, its bar against the largest, its hover
export interface BetWhyPart {
  key: 'price' | 'lean' | 'edge' | 'chance';
  label: string;
  value: string;
  amount: number;
  width: number;
  title: string;
}

// A bet beside it: the gap in score and the parts making it (from this bet's side)
export interface BetWhyVs {
  name: string;
  rank: number;
  place: string;
  above: boolean;
  diff: number;
  drivers: { label: string; amount: number; title: string }[];
  title: string;
}

export interface BetWhy {
  id: number;
  name: string;
  rank: number;
  // (its place as the list shows it: a lock "Lock", above the ranks; the rest "#1" on, under the locks)
  place: string;
  of: number;
  score: number;
  level: Confidence;
  // (no edge on the price: a score of 0 or under)
  noEdge: boolean;
  // (its trusted chance to win, a fact beside the parts)
  chanceText: string | null;
  chanceTitle: string;
  // (its band, said: its chance's, or low for want of an edge)
  levelText: string;
  levelTitle: string;
  // (its price's expected return and its stake, where the file has them)
  edgeText: string | null;
  // (the return itself, apart, in the value colors: an edge green, none red)
  edgeReturn: string | null;
  edgeUp: boolean;
  edgeTitle: string | null;
  parts: BetWhyPart[];
  // (the analysis beside them: whyFacts)
  facts: WhyFact[];
  vs: BetWhyVs[];
  // (only the chance to show: a picks file from before the prices and chances were kept)
  partial: boolean;
}

// (what a unit pays at American odds, the stake not counted: -250 0.4, +150 1.5)
export const payout = (american: number) => (american > 0 ? american / 100 : 100 / -american);

// A pick's Kelly score (picks.mjs kellyOf's math: the page's own for an older file, which carries the chances
// and the price but not the score): the stake's Kelly, (p − p0) × (b + 1) / b held to -110's scale (desk.mjs
// stakeKelly, 2026-10-18: a short price's small lean never reads as a big score), p0 = 1 / (b + 1) the price's
// break-even; null without the chance or the price
const STAKE_SCALE = 1 + 110 / 100;
export function kellyOf(p: number | undefined | null, american: number | undefined | null): number | null {
  if (!Number.isFinite(p) || !Number.isFinite(american) || !american) return null;
  const b = payout(american!);
  return Math.round((p! - 1 / (b + 1)) * Math.min((b + 1) / b, STAKE_SCALE) * 1e4) / 1e4;
}

// A CHECK's cleared Kelly for an older file that doesn't carry it (checks.mjs checkKelly's math): the stake's
// Kelly at the book's fair chance and the model's lean, held to half the market's GAP, at the line's starting
// trust (desk.mjs BUCKET_START: a prop at 1.5 or under 0.25, 2 to 3.5 0.375, else 0.5); null without the numbers
const HALF_GAP: Record<string, number> = { spread: 0.06, total: 0.06, ml: 0.075, prop: 0.075 };
export function clearedKellyOf(model: number | null | undefined, fair: number | null | undefined, american: number | null | undefined, market = 'prop', line: number | null = null): number | null {
  if (!Number.isFinite(model) || !Number.isFinite(fair)) return null;
  const t = market !== 'prop' || !Number.isFinite(line) ? 0.5 : line! <= 1.5 ? 0.25 : line! <= 3.5 ? 0.375 : 0.5;
  const gap = model! - fair!;
  const half = HALF_GAP[market] ?? 0.075;
  return kellyOf(fair! + t * Math.sign(gap) * Math.min(Math.abs(gap), half), american);
}

// A pick's band, its row's color and its chip (picks.mjs BANDS, the same cuts): by its Kelly score, a lock above
// them all at 5% or more with a 55% chance to win (a big edge on a likely result: LOCK), then 2% (LOVE), any edge
// under that (LIKE: every bet the bot places is a LIKE or better), without an edge low (PASS: never bet)
export type { Confidence } from './tiers';
import { heldTo } from './tiers';
import type { BandCap } from './tiers';
// (2026-10-11, the owner's: edges shrink as the model and its trust settle, so the bands sit lower: LIKE from 1%, LOVE
// from 2%, LOCK from 5% with a 55% chance; the Kelly already counts the trust, an untested type's edge at half)
// (2026-10-13, the owner's: LIKE opens to any edge (medium 0: a Kelly over 0); a market with no edge is tracked,
// not bet)
// (an edge bet a LIKE at the least, its score rounded to 0 or a hair under it (EDGE_ROUND, the rounding's reach:
// picks.mjs edgeLevel's); one further under 0, priced again at a fallen trust, has no edge now: PASS)
export const BANDS = { lock: 0.05, lockChance: 0.55, high: 0.02, medium: 0 };
const EDGE_ROUND = 0.0005;
export function confidenceOf(kelly: number, p: number | null | undefined, edge: boolean | undefined): Confidence {
  if (edge === false || !Number.isFinite(kelly)) return 'low';
  if (!(kelly > BANDS.medium)) return edge === true && kelly > -EDGE_ROUND ? 'medium' : 'low';
  if (kelly >= BANDS.lock && (p ?? 0) >= BANDS.lockChance) return 'lock';
  return kelly >= BANDS.high ? 'high' : 'medium';
}

// A score as is, signed ("+3.12", "−1.05"; in points, times 100)
export function betScoreText(score: number): string {
  const text = Math.abs(score).toFixed(2);
  return Number(text) === 0 ? text : `${score < 0 ? '−' : '+'}${text}`;
}

// A part of the score, signed ("+4.63", "−0.08"; to three places when it's under a hundredth): the
// breakdowns' shared signedAmount
export const signedPoints = signedAmount;

const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;
const odds = (a: number) => (a > 0 ? `+${a}` : `${a}`.replace('-', '−'));

// A bet's name in the breakdown: the pick as the row writes it (a prop's player first)
export function betName(r: BetWhyRow): string {
  return r.player && !r.pick.startsWith(r.player) ? `${r.player} ${r.pick}` : r.pick;
}

// Its score's parts, in points: the price and the model's lean (the edge alone where the file has no fair
// chance; the chance alone, from a file with no price)
function partsOf(r: BetWhyRow): { parts: Omit<BetWhyPart, 'width'>[]; partial: boolean } {
  const base = r.sureness * 100;
  const fair = r.why?.fair ?? r.fair;
  const b = r.why?.b ?? (Number.isFinite(r.price) && r.price ? payout(r.price) : NaN);
  const parts: Omit<BetWhyPart, 'width'>[] = [];
  let partial = false;
  if (Number.isFinite(b) && b > 0) {
    const p0 = r.why?.p0 ?? 1 / (b + 1);
    // (held to -110's scale, as the score is (kellyOf, desk.mjs kellyScale): the parts add up to it at any price)
    const scale = Math.min((b + 1) / b, STAKE_SCALE);
    const at = Number.isFinite(r.price) ? ` at ${odds(r.price!)}` : '';
    if (Number.isFinite(fair)) {
      // (the price's part as written, or worked out the same way; the lean the rest: price + lean is the score,
      // to the last digit)
      const price = Number.isFinite(r.why?.price) ? r.why!.price! * 100 : (fair! - p0) * scale * 100;
      const lean = base - price;
      const from = r.why?.from ?? null;
      const source =
        from === 'even'
          ? `an even line (the Book's board had no price: −110 assumed)`
          : from === 'pinnacle'
            ? `a sharp book's line, its two prices with the vig taken out`
            : `the Book's two prices with the vig taken out`;
      parts.push({
        key: 'price',
        label: 'The price',
        value: Number.isFinite(r.price) ? odds(r.price!) : '',
        amount: price,
        title: [
          `The price: the Book's fair chance of this side, ${pct(fair!)} (${source}), against the price's break-even, ${pct(p0)}${at}: its vig on this side (over 0 where the price beats its own fair chance)`,
          `${signedPoints((fair! - p0) * 100)} chance points × ${scale.toFixed(2)} for what it pays = ${signedPoints(price)} to the score`,
        ].join('\n'),
      });
      const model = r.model;
      const leanChance = lean / 100 / scale;
      const trust = r.why?.trust ?? (Number.isFinite(model) && Math.abs(model! - fair!) > 1e-6 ? leanChance / (model! - fair!) : null);
      const fitted = r.why ? (r.why.fitted ? ' (fitted on its graded bets and closing lines)' : ' (the untested start: not enough graded bets yet)') : '';
      const math =
        Number.isFinite(model) && trust !== null
          ? `Trust ${trust.toFixed(2)}${fitted} × the Bot's ${pct(model!)} less the Book's ${pct(fair!)} (${signedPoints((model! - fair!) * 100)}) = ${signedPoints(leanChance * 100)} chance points`
          : null;
      parts.push({
        key: 'lean',
        label: "Bot's lean",
        value: Number.isFinite(model) ? `Bot ${pct(model!)}` : '',
        amount: lean,
        title: [
          "The Bot's lean: how far its own chance pulls the Book's, by the trust it has earned in this market (0 the Book's chance alone, 1 the Bot's alone)",
          math,
          `× ${scale.toFixed(2)} for what it pays = ${signedPoints(lean)} to the score`,
        ]
          .filter(Boolean)
          .join('\n'),
      });
    } else {
      parts.push({
        key: 'edge',
        label: 'Edge on the price',
        value: Number.isFinite(r.p) ? pct(r.p!) : '',
        amount: base,
        title: `Its chance to win against the price's break-even, ${pct(p0)}${at}, scaled by what it pays (× ${scale.toFixed(2)})\n${signedPoints(base)} to the score (this pick's file doesn't split it)`,
      });
    }
  } else {
    partial = true;
    parts.push({
      key: 'chance',
      label: 'Chance to win',
      value: Number.isFinite(r.chance) ? `${r.chance}%` : '',
      amount: base,
      title: `Its chance to win, the Bot's and the Book's together\n${signedPoints(base)} to the score (this pick's file has no price to weigh it by)`,
    });
  }
  return { parts, partial };
}

// The analysis beside the score's parts, a bet's or a suggestion's alike (the owner, 2026-10-19: a suggestion's popover
// says as much as a bet's): a prop's projection against the mean the Book's price implies at its line, his usage
// tonight (usage.mjs, D41), and the terms that moved it most (a game line's in points of its margin or total for this
// side, a prop's in percent of his projection). Only what the row carries
export interface WhyFact {
  label: string;
  value: string;
  title: string;
}
const signed1 = (v: number) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(1)}`;
export function whyFacts(r: Pick<BetWhyRow, 'mean' | 'implied' | 'usage' | 'terms' | 'market' | 'player'>): WhyFact[] {
  const out: WhyFact[] = [];
  const prop = !!r.player && !['Spread', 'Game total', 'Moneyline'].includes(r.market);
  if (Number.isFinite(r.mean) && Number.isFinite(r.implied))
    out.push({ label: 'Bot vs Book mean', value: `${r.mean!.toFixed(2)} vs ${r.implied!.toFixed(2)}`, title: "The Bot's projection against the mean the Book's price implies at this line" });
  else if (Number.isFinite(r.mean)) out.push({ label: 'Projection', value: r.mean!.toFixed(2), title: "The Bot's projection of the stat tonight" });
  if (Array.isArray(r.usage) && Number.isFinite(r.usage[0]))
    out.push({ label: 'Usage', value: `${r.usage[0]}${r.usage[1] ? ` ${r.usage[1]}` : ''}`, title: 'The work the projection reads for him tonight (usage first, rate second: D41)' });
  const terms = (r.terms ?? []).filter(([n, v]) => n && Number.isFinite(v));
  if (terms.length) {
    const unit = prop ? '%' : ' pts';
    out.push({
      label: 'What moved it',
      value: terms.map(([n, v]) => `${n} ${signed1(v)}${unit}`).join(' · '),
      title: prop ? "The steps that took his rate to the projection, each by the effect it had here, the biggest first" : "The game's context terms that moved the Bot's number most, in points of the margin (or the total) for this side",
    });
  }
  return out;
}

export function betWhy(list: BetWhyRow[], index: number): BetWhy {
  // (the LOCKs and CHECKs above the ranks, unnumbered: the first bet under them #1)
  const locks = list.filter((r) => unranked(r.confidence)).length;
  const placeOf = (i: number) => (unranked(list[i].confidence) ? tierLabel(list[i].confidence!) : `#${i + 1 - locks}`);
  const row = list[index];
  const score = row.sureness * 100;
  const { parts: raw, partial } = partsOf(row);
  const parts = barWidths(raw);

  // Its chance to win: the trusted one, the book's fair chance moved toward the model's
  const chance = Number.isFinite(row.p) ? pct(row.p!) : Number.isFinite(row.chance) ? `${row.chance}%` : null;
  const chanceTitle = "Its chance to win: the Book's fair chance moved toward the Bot's by the trust the Bot has earned in that market. The score weighs it against the price";

  // Its band: its Kelly score's with an edge on the price; low without one, whatever its chance
  const level = row.confidence ?? 'low';
  const noEdge = row.edge === false || (!partial && score <= 0);
  const levelText = noEdge ? `${tierLabel(level)}: no edge on the price` : tierLabel(level);
  const levelTitle = noEdge
    ? "Its confidence: low, whatever its chance, without an edge on the price (not one the Bot likes: a favorite at a short price isn't a strong bet; since Oct 13, 2026 the Bot tracks these rather than betting them)"
    : 'Its confidence, by its Kelly score (value and likelihood together, as the picks are ranked): 5 or more with a 55% chance a lock, 2 or more high, any edge under that medium (every bet the Bot places is medium or better), none low';

  // Its price: what a unit's expected to return at its chance, and its stake
  let edgeText: string | null = null;
  let edgeTitle: string | null = null;
  let edgeReturn: string | null = null;
  let edgeUp = false;
  if (Number.isFinite(row.ev)) {
    const ev = row.ev! * 100;
    edgeReturn = `${ev >= 0 ? '+' : '−'}${Math.abs(ev).toFixed(1)}%`;
    edgeUp = ev > 0;
    edgeText = ` a unit${Number.isFinite(row.price) ? ` at ${odds(row.price!)}` : ''}${Number.isFinite(row.units) ? ` · ${row.units} unit${row.units === 1 ? '' : 's'}` : ''}`;
    edgeTitle = "Its expected return: its chance to win times the price's payout, less the stake (over 0 an edge). The Bot's stake, 0.5 to 3 units, grows with it";
  }

  const vs: BetWhyVs[] = [];
  const mine = new Map(raw.map((p) => [p.key, p]));
  // (its neighbors of its own kind: a bet's the nearest bets either side, past any CHECK, since a CHECK
  // is ordered by its gap and isn't a bet; a CHECK's the nearest CHECKs)
  const isCheck = (r: BetWhyRow | undefined) => r?.confidence === 'check';
  const nearest = (step: number) => {
    let at = index + step;
    while (list[at] && isCheck(list[at]) !== isCheck(row)) at += step;
    return at;
  };
  for (const at of [nearest(-1), nearest(1)]) {
    const other = list[at];
    if (!other) continue;
    const theirs = new Map(partsOf(other).parts.map((p) => [p.key, p]));
    const keys = [...new Set([...mine.keys(), ...theirs.keys()])];
    const name = betName(other);
    const drivers = keys
      .map((key) => ({ key, a: mine.get(key), b: theirs.get(key) }))
      .map(({ key, a, b }) => ({ key, label: (a ?? b)!.label, amount: (a?.amount ?? 0) - (b?.amount ?? 0), a, b }))
      .filter((d) => Math.abs(d.amount) >= 0.005)
      .sort((x, y) => Math.abs(y.amount) - Math.abs(x.amount))
      .map(({ label, amount, a, b }) => ({
        label,
        amount,
        title: `${label}: ${a?.value || '-'} vs ${b?.value || '-'}\n${signedPoints(a?.amount ?? 0)} vs ${signedPoints(b?.amount ?? 0)} to the score: ${signedPoints(amount)} for this bet`,
      }));
    const theirScore = other.sureness * 100;
    const diff = score - theirScore;
    vs.push({
      name,
      rank: at + 1,
      place: placeOf(at),
      above: at > index,
      diff,
      drivers,
      title: `Kelly ${betScoreText(score)} vs ${betScoreText(theirScore)}: ${signedPoints(diff)}\nWhat makes the gap (+ in favor of this bet)`,
    });
  }

  return {
    id: row.id,
    name: betName(row),
    rank: index + 1,
    place: placeOf(index),
    of: list.length - locks,
    score,
    level,
    noEdge,
    chanceText: chance,
    chanceTitle,
    levelText,
    levelTitle,
    edgeText,
    edgeReturn,
    edgeUp,
    edgeTitle,
    parts,
    facts: whyFacts(row),
    vs,
    partial,
  };
}

// ---------------------------------------------------------------------------
// The what-if price (the owner, 2026-10-19: "it would be nasty if we could modify the price even slightly to see
// how it affects the score"): the K-score popover's stepper nudges the price and every number is worked again at
// it, the bot's chance held where it is. The bettor's own math (desk.mjs stakeKelly, stakeFor, suspectOf; picks.mjs
// edgeLevel, levelOf's caps), nothing new; nothing saved, no bet changed
// ---------------------------------------------------------------------------
const REF = 100 / 110;
// (desk.mjs: the edge scale every sport's desk stakes on, the sanity bar (an edge past EDGE_SUSPECT points over the
// break-even or Z_SUSPECT SDs of the outcome, D23; a suspect row's ev held to EV_SUSPECT at most), the practice stake)
export const EV_SCALE = 0.08;
export const EV_SUSPECT = 0.15;
export const EDGE_SUSPECT = 0.12;
export const Z_SUSPECT = 0.3;
// (desk.mjs isSuspect: the edge over the break-even from the chance and the return, p / (1 + ev) the break-even)
export function isSuspect(p: number | null | undefined, ev: number | null | undefined): boolean {
  if (!Number.isFinite(p) || !Number.isFinite(ev) || !(p! > 0 && p! < 1) || !(ev! > -1)) return false;
  const be = Math.min(1 - 1e-9, Math.max(1e-9, p! / (1 + ev!)));
  const edge = p! - be;
  return Math.abs(edge) > EDGE_SUSPECT || Math.abs(edge / Math.sqrt(be * (1 - be))) > Z_SUSPECT;
}
export const PRACTICE_UNITS = 0.5;
const decimalOf = (american: number) => 1 + payout(american);

// (desk.mjs stakeFor: 0.5 at no edge up to 3 at the edge scale, by half units, a short price held to -110's)
export function stakeFor(ev: number, american = -110, evScale = EV_SCALE): number {
  const d = decimalOf(Number.isFinite(american) && american ? american : -110);
  const e = Math.max(0, ev);
  const frac = Math.min(e / (d - 1), ((e / d) * (1 + REF)) / REF);
  const raw = 0.5 + (frac / (evScale / REF)) * 2.5;
  return Math.min(3, Math.max(0.5, Math.round(raw * 2) / 2));
}

// The books' ladder of prices: by 5 cents to 200 either side of even, by 10 to 500, by 25 to 1000, by 50 to 10000
// (-100 and +100 the same price: +100 the one kept), in order of what they pay
const LADDER_MAX = 10000;
const LADDER: number[] = (() => {
  const mags: number[] = [];
  for (let m = 100; m <= LADDER_MAX; m += m < 200 ? 5 : m < 500 ? 10 : m < 1000 ? 25 : 50) mags.push(m);
  return [...mags.filter((m) => m > 100).map((m) => -m).reverse(), ...mags];
})();
// (a price as a whole number, -100 said +100, held to the ladder's ends)
const normal = (american: number) => {
  const a = Math.round(american);
  return a > -101 && a < 100 ? 100 : Math.max(-LADDER_MAX, Math.min(LADDER_MAX, a));
};

// The next price on the ladder: up (+1) a price that pays more (−110 → −105 → +100 → +105), down (−1) one that
// pays less; a price off the ladder (−118) to the ladder's next either way (−115 up, −120 down). At an end, itself
export function stepPrice(american: number, dir: 1 | -1): number {
  const d = decimalOf(normal(american));
  if (dir > 0) return LADDER.find((a) => decimalOf(a) > d + 1e-12) ?? normal(american);
  for (let i = LADDER.length - 1; i >= 0; i--) if (decimalOf(LADDER[i]) < d - 1e-12) return LADDER[i];
  return normal(american);
}

// (the next whole price, a cent either way: −101 up is +100, +100 down is −101)
export function nextCent(american: number, dir: 1 | -1): number {
  const a = normal(american);
  if (dir > 0) return a === -101 ? 100 : a + 1;
  return a === 100 ? -101 : a - 1;
}

// What's held while the price moves: the bot's chance (its trusted one, p), whether it's a bet the bot placed (its
// band LIKE at the least with an edge to the rounding's reach: picks.mjs edgeLevel), the band and stake a rule held
// it to at its own price (a practice, role or research pick a LIKE at most: picks.mjs levelOf; a guard's stake cap:
// the bot's units under what its edge would stake), and the share of the return a push leaves (a line that can land
// on the number: ev × (1 − push), its ev against the plain return at its price)
export interface WhatIfBase {
  odds: number;
  p: number;
  bet: boolean;
  // (a LIKE a rule holds it to at every price: picks.mjs levelOf's practice, role and research picks)
  cap: Confidence | null;
  // (a ceiling: the desk's cap on a side it hasn't bet (board.json cap, D46; a practice side): a LIKE at most, a PASS
  // still where the price has no edge; the confidence layer's (picks.json and board.json cap, D52): a LIKE or a LOVE
  // at most at every price, the stake the Kelly's)
  most?: Confidence | null;
  unitsCap: number | null;
  // (the reason tier (D58): at every price the band is the tier where the Kelly clears the 2% floor, else a LIKE)
  tier?: Confidence | null;
  win: number;
  // (the trusted chance's makings, for the caption: the bot's own chance, the book's no-vig, the trust)
  blend: { model: number; fair: number; trust: number } | null;
}

// A price's numbers at the held chance: the break-even, the edge in chance, the expected return a unit, the Kelly
// score (the stake's, rounded as picks.mjs kellyOf), its band, and its stake (none on a PASS: never bet)
export interface PriceAt {
  odds: number;
  breakEven: number;
  edge: number;
  ev: number;
  kelly: number;
  level: Confidence;
  units: number | null;
  suspect: boolean;
}

export function priceAt(base: WhatIfBase, american: number): PriceAt {
  const odds = normal(american);
  const d = decimalOf(odds);
  const ev = base.win * (base.p * d - 1);
  const kelly = kellyOf(base.p, odds) ?? 0;
  const suspect = isSuspect(base.p, ev);
  let level = confidenceOf(kelly, base.p, base.bet ? true : undefined);
  if (base.tier === 'lock' || base.tier === 'high' || base.tier === 'medium') level = level === 'low' ? 'low' : kelly >= BANDS.high ? base.tier : 'medium';
  // (a rule's LIKE, held; the desk's cap and the sanity guard's: a LIKE at most; the confidence layer's LOVE at most)
  if (base.cap === 'medium' || ((suspect || base.most === 'medium') && (level === 'lock' || level === 'high'))) level = 'medium';
  else if (base.most === 'high' && level === 'lock') level = 'high';
  let units: number | null = null;
  if (level !== 'low') {
    units = suspect || base.most === 'medium' ? PRACTICE_UNITS : stakeFor(ev, odds);
    if (base.unitsCap !== null) units = Math.min(units, base.unitsCap);
  }
  return { odds, breakEven: 1 / d, edge: base.p - 1 / d, ev, kelly, level, units, suspect };
}

// Where the band changes, the whole cents walked from the price: the first price up with another band ("LOVE from
// −105 or better"), and the last price down with this one, past which it's another ("PASS past −125"); none
// inside the ladder's ends
export interface PriceFlip {
  dir: 'better' | 'worse';
  level: Confidence;
  odds: number;
  text: string;
}
export function flipsAt(base: WhatIfBase, american: number): { better: PriceFlip | null; worse: PriceFlip | null } {
  const from = normal(american);
  const here = priceAt(base, from).level;
  const walk = (dir: 1 | -1): PriceFlip | null => {
    let last = from;
    while (Math.abs(last) < LADDER_MAX) {
      const a = nextCent(last, dir);
      const level = priceAt(base, a).level;
      if (level !== here) {
        return dir > 0
          ? { dir: 'better', level, odds: a, text: `${tierLabel(level).toUpperCase()} from ${odds(a)}${priceAt(base, a).suspect && !priceAt(base, last).suspect ? ' (the sanity bar: an edge past 12 points or 0.3 SDs)' : ' or better'}` }
          : { dir: 'worse', level, odds: last, text: `${tierLabel(level).toUpperCase()} past ${odds(last)}` };
      }
      last = a;
    }
    return null;
  };
  return { better: walk(1), worse: walk(-1) };
}

// The flips as one line, this band's run first, then either side of it: "LOVE from −107 to +118 · LIKE past −107 ·
// LIKE again from +119"; a band the sanity bar holds marked capped, its why in the hover
export function flipLine(base: WhatIfBase, american: number): { text: string; title: string } {
  const here = priceAt(base, american).level;
  const { better, worse } = flipsAt(base, american);
  const name = (l: Confidence) => tierLabel(l).toUpperCase();
  const top = better ? nextCent(better.odds, -1) : null;
  const run = worse && top !== null ? `from ${odds(worse.odds)} to ${odds(top)}` : worse ? `from ${odds(worse.odds)} or better` : top !== null ? `up to ${odds(top)}` : 'at every price';
  const parts = [`${name(here)} ${run}`];
  if (worse) parts.push(`${name(worse.level)} past ${odds(worse.odds)}`);
  const capped = !!better && priceAt(base, better.odds).suspect && !priceAt(base, top!).suspect;
  if (better) parts.push(`${name(better.level)}${worse && worse.level === better.level ? ' again' : ''} from ${odds(better.odds)}${capped ? ' (capped)' : ''}`);
  const title = [
    "Where the band changes, the Bot's chance held: the whole-cent prices either side",
    capped ? 'Capped: past a 12-point edge over the break-even (or 0.3 SDs of the outcome) the bettor treats a price as suspect, a LIKE at the practice stake at most' : null,
  ]
    .filter(Boolean)
    .join('\n');
  return { text: parts.join(' · '), title };
}

// The held numbers for a row with a chance and a price (none without them), from what the page's row carries;
// placed: a pick the bot bet (a board price it didn't take: false)
export function whatIfOf(r: BetWhyRow, placed = true): WhatIfBase | null {
  const p = Number.isFinite(r.p) ? r.p! : Number.isFinite(r.chance) ? r.chance! / 100 : NaN;
  if (!(p > 0 && p < 1) || !Number.isFinite(r.price) || !r.price) return null;
  const odds = normal(r.price!);
  const bet = placed && r.edge !== false && (r.confidence === 'lock' || r.confidence === 'high' || r.confidence === 'medium');
  const plain = p * decimalOf(odds) - 1;
  const ratio = Number.isFinite(r.ev) && Math.abs(plain) > 1e-3 ? r.ev! / plain : 1;
  const win = ratio > 0.5 && ratio <= 1 + 1e-6 ? Math.min(1, ratio) : 1;
  const base: WhatIfBase = { odds, p, bet, cap: null, unitsCap: null, win, blend: null, ...(bet && (r.tier === 'lock' || r.tier === 'high' || r.tier === 'medium') ? { tier: r.tier } : {}) };
  const at = priceAt(base, odds);
  // (a LIKE the score doesn't make: a practice, role or research pick's, held there at every price)
  // (and a placed bet the desk capped (picks.json cap 'medium': a rule's or the confidence layer's, D52): its band held
  // at every price, its stake the desk's own, never the practice stake a side's ceiling below would set)
  if (bet && ((r.confidence === 'medium' && at.level !== 'medium') || r.cap === 'medium')) base.cap = 'medium';
  if (bet && Number.isFinite(r.units) && at.units !== null && r.units! < at.units) base.unitsCap = r.units!;
  // (the desk's cap on a side, or a practice side, it hasn't bet at this price: a LIKE at most at every price, D46;
  // the confidence layer's cap on a pick or a side: a LIKE or a LOVE at most at every price, D52)
  if (!base.cap && (r.cap === 'medium' || r.practice)) base.most = 'medium';
  else if (!base.cap && r.cap === 'high') base.most = 'high';
  const fair = r.why?.fair ?? r.fair;
  const trust = r.why?.trust;
  if (Number.isFinite(r.model) && Number.isFinite(fair) && Number.isFinite(trust)) base.blend = { model: r.model!, fair: fair!, trust: trust! };
  return base;
}

// The edge in plain words, at a price (the owner, 2026-10-19: so a reader sees why a small edge still clears its
// band): "Edge +1.3 pts: the Bot 55.8% vs 54.5% to break even at −120 · Kelly 2.6% of bankroll", the what-if's own
// numbers (priceAt) at the held chance
export function edgeLine(p: number, at: Pick<PriceAt, 'odds' | 'breakEven' | 'edge' | 'kelly'>): string {
  const one = (v: number) => (Math.round(v * 1000) / 10).toFixed(1);
  const signed = (v: number) => `${v < 0 ? '−' : '+'}${one(Math.abs(v))}`;
  return `Edge ${signed(at.edge)} pts: the Bot ${one(p)}% vs ${one(at.breakEven)}% to break even at ${odds(at.odds)} · Kelly ${at.kelly < 0 ? '−' : ''}${one(Math.abs(at.kelly))}% of bankroll`;
}

// The caption under the what-if: the chance held, and where it comes from when it's a blend
// (one line, the owner's, 2026-10-19: less text; the blend's makings in its hover)
export function whatIfCaption(base: WhatIfBase): { text: string; title: string } {
  const text = `The Bot's chance held at ${pct(base.p)} · what-if only, nothing saved`;
  const title = base.blend
    ? `The Bot's own ${pct(base.blend.model)} blended with the Book's no-vig ${pct(base.blend.fair)} at trust ${base.blend.trust.toFixed(2)}, kept fixed at every price. No bet changes`
    : "The Bot's chance kept fixed at every price. No bet changes";
  return { text, title };
}
