// The Algorithm desk's data, as the bettor writes it (libs/ranker/scripts/model/run.mjs): each sport's
// data/model/ledger.json (its bets) and state.json (its settings, its trust, its context, its props, its
// backtest), and the shapes the desk builds from them

export type Market = 'spread' | 'total' | 'ml' | 'prop';
export type Status = 'open' | 'won' | 'lost' | 'push';
export type Intent = 'edge' | 'action' | 'track';

export interface ModelBet {
  id: string;
  // (its game's ESPN id: the live score)
  event?: string;
  sport: string;
  start: string;
  placedAt: string;
  gradedAt?: string;
  matchup: string;
  // (a fight's: its two fighters by ESPN id, the home the first-listed (mma-desk.mjs))
  fighters?: { home?: { id?: string; name?: string }; away?: { id?: string; name?: string } };
  market: Market;
  // (a prop's: its type, the player, his projection; its price the desk's estimate)
  propType?: string;
  statLabel?: string;
  player?: string;
  // (a prop's: the player's ESPN id, its line and side, for the count in play)
  athlete?: string | number;
  // (a prop's: his team, ESPN's id; older props lack it)
  team?: string | null;
  // (a moneyline's is null)
  line?: number | null;
  side?: string;
  projection?: { mean: number; pOver: number; fairOver: number };
  pick: string;
  odds: number;
  model: number;
  fair: number;
  p: number;
  ev: number;
  units: number;
  // (edge: it saw value; action: no edge, bet for the data (till Oct 13, 2026); track: no edge, tracked, not bet
  // (units 0; trackUnits, what it would have staked). Older bets go by their EV)
  intent?: Intent;
  trackUnits?: number;
  // (a slate's practice pick (desk.mjs isPracticeTop): bet at the practice stake for the slate, short of the vig;
  // its rank and its game's quota, and its edge before the vig)
  topN?: { rank: number; quota: number; slate: number; edge: number };
  // (the confidence layer's read of it when placed (confidence.mjs, D52): the calibrated chance, the quality, the band
  // it could reach (the cap picks.mjs levelOf held it to), the blend's weight on its stake)
  conf?: { pc: number; q: number; pb?: number; cap: 'medium' | 'high' | null; w?: number; cutoff?: string };
  status: Status;
  // (a prop whose player didn't play: no action, graded a push, out of the record)
  void?: boolean;
  profit: number;
  final?: string;
  // (its post-mortem, once graded: the story, what broke its premise, the line saying why; weight under 1
  // when the premise broke in the game)
  why?: string;
  recap?: { headline: string | null; lede: string | null; link: string | null };
  disrupted?: { severe: boolean; kind: string; text: string }[];
  weight?: number;
  // (the book it's priced and placed at, and where its fair chance came from: Pinnacle's or the book's own)
  book?: string;
  fairFrom?: string;
  // (its closing-line value once its game has started: clv.mjs)
  clv?: { pts: number | null; prob: number | null; ev: number | null; beat: boolean | null } | null;
}

export type TestNumbers = { maeMargin: number; maeTotal: number; winHit: number; winLogLoss: number };

export interface ContextTerm {
  key: string;
  label: string;
  group: string;
  on: 'margin' | 'total';
  unit: string;
  size: number;
  kept: boolean;
  games: number;
  gain: number | null;
}

export type Trust = { trust: number; n: number; fitted: boolean };

// (the NFL's anytime touchdown, tracked only (libs/ranker/scripts/model/anytime.mjs): its fit's params, its held-out
// check (log loss of the red zone's model, the plain one and the base rate; calibration by band) and whether its
// market's asked this month (oddsapi.mjs anytimeOn))
export interface AnytimeFit {
  key: string;
  label: string;
  tracked: boolean;
  rows: number;
  params: { kind: 'rz' | 'plain'; D: number; K: number; F: number; L: number; beta: number; a: number; b: number; rho: number[] };
  check: { cutDay: string; rows: number; scored: number; logLoss: number; rz: number; plain: number; base: number; gain: number; calibration: { band: number; n: number; said: number; was: number }[] };
  market?: { market: string; on: boolean; projected: number | null; limit: number; why: string | null } | null;
}

export interface ModelState {
  sport: string;
  label: string;
  // (desk.mjs PRACTICE_SPLIT: the slate's practice picks tallied on their own Practice line, out of the record)
  practiceSplit?: boolean;
  updated: string;
  params: Record<string, number>;
  test: ({ games: number } & TestNumbers) | null;
  trust: Record<string, Trust>;
  history: { games: number; finals: number };
  changelog: Change[];
  teams: { abbr: string; rating: number }[];
  context?: { lambda: number; terms: ContextTerm[]; test: { games: number; before: TestNumbers; after: TestNumbers } } | null;
  postmortem?: { graded: number; disrupted: number; weight: number; fitted: boolean };
  props?: { types: PropType[]; lastRun?: { games: number; priced: number; bet: number }; playChance?: PlayChance; anytime?: AnytimeFit | null } | null;
  // (the book it bets, set in leagues.mjs; where this run's lines came from; The Odds API's credits)
  book?: string;
  lines?: string;
  odds?: OddsUsage | null;
  backtest?: { at: string; snapshots: number; planned: number; markets: Record<string, BacktestMarket> } | null;
  // (the CHECKs' tally and what drives them: checks.mjs checkSummary, check-learn.mjs checkLearning)
  checks?: { n?: number; open?: number; unreadable?: boolean; learning?: CheckLearning | null; research?: ResearchCard | null } | null;
  // (the same-game sizing: desk.mjs sameGameOf)
  sameGame?: SameGame | null;
  // (the props' live calibration: calib.mjs fitCalib)
  calib?: LiveCalib | null;
  // (the model's latest major change, leagues.mjs MODEL_EPOCH: the trust fit only on bets since; the desk's record since it by default)
  epoch?: string | null;
  // (the game lines gated by their CLV, desk.mjs lineGate: on, the sport's spreads, moneylines and totals are bet;
  // off, bet at the practice stake (0.5u) till its CLV over its last `window` graded line bets since the epoch is
  // positive again)
  lineGate?: LineGate | null;
}

export interface LineGate {
  on: boolean;
  n: number;
  ev: number | null;
  prob: number | null;
  beat: number | null;
  min: number;
  window: number;
  why: string;
}

// (one spot's live calibration (a stat, a side, a line class): its graded rows since the epoch, its shift on the
// model's chance (log-odds), its target, its held-out gain, kept or why not: calib.mjs fitSpot)
export interface LiveCalibSpot {
  n: number;
  shift: number;
  target: number;
  gain: number | null;
  kept: boolean;
  why: string | null;
}
export interface LiveCalib {
  epoch: string;
  rows: number;
  min: number;
  cap: number;
  step: number;
  spots: Record<string, LiveCalibSpot>;
}

// (a spot's key in words: 'points|over|0.5' to 'points over 0.5'; '>2.5' as 'lines over 2.5')
const spotWords = (key: string): string => {
  const [stat, side, cls] = key.split('|');
  return `${stat} ${side}s at ${cls === '>2.5' ? 'lines over 2.5' : cls}`;
};
// (a log-odds shift as the points it moves a 50% chance: 0.1 about 2.5 points)
const shiftPts = (s: number): string => {
  const p = 1 / (1 + Math.exp(-s)) - 0.5;
  return `${p >= 0 ? '+' : '−'}${Math.abs(p * 100).toFixed(1)} pts`;
};

// (the live calibration in plain words, for the About and the Algorithm tab; null where the state predates it)
export function calibText(c: LiveCalib | null | undefined): string | null {
  if (!c?.spots) return null;
  const how = `The Bot nudges its own chance on a prop where its graded props show it running hot or cold, one spot at a time (a stat, over or under, the line's size). A spot with few graded props borrows from the ones around it: every sport's props at the same line size, then this sport's, then the spot's own, each nudge 0 till ${c.min} props are graded there and the newest of them come out better with it; then it grows slowly with the evidence, at most ${shiftPts(c.cap).slice(1)} of a coin flip in all, and moves only a little each run.`;
  const spots = Object.entries(c.spots);
  const kept = spots.filter(([, s]) => s.kept);
  if (!spots.length) return `${how} No props graded yet: no nudges.`;
  if (!kept.length) {
    const top = [...spots].sort((a, b) => b[1].n - a[1].n)[0];
    return `${how} ${c.rows.toLocaleString()} props graded, none nudged yet (the busiest spot, ${spotWords(top[0])}, has ${top[1].n}).`;
  }
  return `${how} Nudged now: ${kept.map(([k, s]) => `${spotWords(k)} ${shiftPts(s.shift)} at even (${s.n.toLocaleString()} graded)`).join('; ')}.`;
}

// (one kind of pair's correlation within a game, fit on the graded props, and its held-out score: desk.mjs fitSameGame, sameGameOf)
export interface SameGameKind {
  rho: number;
  raw: number | null;
  se: number | null;
  games: number;
  pairs: number;
  fitted: boolean;
  held: { games: number; pairs: number; gain: number };
}
export interface SameGameReplay {
  resized: number;
  trimmed: number;
  asBet: number;
  joint: number;
  worse: boolean;
}
// (the props' correlations within a game, a player's own props' and the rest's, and what's used: desk.mjs sameGameOf)
export interface SameGame {
  player: SameGameKind;
  game: SameGameKind;
  used: { player: number; game: number };
  floor: boolean;
  replay: { games: number; asOf: SameGameReplay; inSample: SameGameReplay };
}

// (the same-game sizing in plain words, for the About and the Algorithm tab; null where the state predates the two kinds)
export function sameGameText(g: SameGame | null | undefined): string | null {
  if (!g?.player || !g.game || !g.used || !g.replay?.inSample) return null;
  const how = "A game's props win or lose together a little (overs with overs, an over against an under the other way), one player's two props (his points and his shots) more so, so its edge props are sized jointly with the rest of its props, as fewer, bigger bets on the game: stakes only cut, never raised, never a bet added or dropped.";
  const kind = (k: SameGameKind, name: string, used: number) => {
    if (!k.fitted) return `${name}: not read yet (${k.games} games with such a pair, 10 needed)`;
    const read = `${name}: ${k.raw ?? '-'} (give or take ${k.se ?? '-'}) on ${k.pairs.toLocaleString()} pairs in ${k.games} games, pulled toward 0 for the few games to ${k.rho}`;
    if (used) return `${read}, used (on the days after each read, it was nearer what happened than none, ${k.held.games} games)`;
    if (g.floor) return `${read}, not used (the bankroll replay did worse with it)`;
    if (k.held.games < 5) return `${read}, not used yet (scored on ${k.held.games} later games, 5 needed)`;
    return `${read}, not used (on the days after each read, it was no nearer what happened than none)`;
  };
  const r = g.replay.inSample;
  const replay = r.resized ? `Replayed on the graded games at the values used, it would have cut ${r.resized} stakes by ${r.trimmed}u.` : 'Replayed on the graded games at the values used, it would have changed no stake.';
  return `${how} ${kind(g.player, "A player's own two props", g.used.player)}. ${kind(g.game, 'Any other two in the game', g.used.game)}. ${replay}`;
}

// (a group of graded CHECKs: their record at a unit each, the hit rate and its 95% interval, the break-even of
// their prices, the profit and the profit a CHECK)
export interface CheckTally {
  n: number;
  won: number;
  lost: number;
  push: number;
  hitRate: number | null;
  ci: [number, number] | null;
  breakEven: number | null;
  profit: number;
  perUnit: number | null;
}

// (a ranked recommendation from the graded CHECKs: a blind spot to fix, a lean to watch, a guard that can loosen
// with the threshold change it supports, never applied by the desk)
export interface CheckAdvice {
  rank: number;
  kind: 'blind-spot' | 'watch' | 'loosen';
  cause: string;
  label: string;
  confirmed: boolean;
  text: string;
  evidence: CheckTally;
  change?: { guard: string; from: number | string; to: number | string; ready: boolean; applied: boolean };
}

export interface CheckLearning {
  v: number;
  graded: number;
  open: number;
  byCause: Record<string, CheckTally>;
  byRole: Record<string, CheckTally>;
  byCauseStat: Record<string, Record<string, CheckTally>>;
  // (the open ones by cause, a role's as role:<sub-reason>)
  openByCause?: Record<string, number>;
  // (the shadows (checks.mjs shadowOf: the gap's and the small role's PASSes, graded, never shown) by passAs,
  // apart from the causes and the advice)
  byPassAs?: Record<string, CheckTally & { open?: number }>;
  recommendations: CheckAdvice[];
}

// (the CHECKs' news research's own scorecard, state.json's checks.research: research.mjs researchCard)
export interface ResearchBetTally {
  n: number;
  won: number;
  lost: number;
  push: number;
  units: number;
  withClose: number;
  clv: number | null;
  beat: number | null;
  open: number;
  byCategory?: Record<string, ResearchBetTally>;
}
export interface ResearchCard {
  gate?: Record<string, { on: boolean; n: number; units: number; why: string }> | null;
  bets: ResearchBetTally;
  adjusted: ResearchBetTally;
  // (the same games' other markets priced with a finding: held and tagged the same, tallied apart)
  sameGame?: ResearchBetTally;
  researched: number;
  verdicts: Record<'adjust' | 'bet' | 'check', { n: number; graded: number; won: number; lost: number; units: number }>;
  byCategory?: Record<string, { n: number; graded: number; won: number; lost: number; units: number }>;
  feeds?: { inOurFeeds: Record<string, number>; missing: Record<string, number>; byFeed: Record<string, number> };
}

export type Change = { at: string; what: string; from: number; to: number; why: string; sport?: string };

export interface OddsUsage {
  monthly: number;
  reserve: number;
  historyBudget: number;
  cycleStart: string | null;
  cycleEnd: string | null;
  daysLeft: number;
  remaining: number;
  used: number | null;
  spent: Partial<Record<string, number>>;
  today: Partial<Record<string, number>>;
  allowance: Record<string, number>;
  historyLeft: number;
}

export type Returns = { n: number; staked: number; profit: number; roi: number | null };

export interface BacktestMarket {
  trust: Trust;
  bets: number;
  close: { every: Returns; edge: Returns; logLoss: { model: number | null; market: number | null; trusted: number | null } };
  early: { every: Returns; clv: { n: number; beat: number | null; ev: number | null } };
  sharpShare: number;
  anchors: { pinnacle: number | null; own: number | null };
}

export interface PropType {
  key: string;
  label: string;
  rows: number;
  params: { K: number; w: number; a: number; b: number; c: number; r: number; cal?: number[]; roleK?: number | null; fun?: number; pc?: number; tg?: number };
  // (the matchup terms' held-out gains: the line log loss without each less with it; null where the fit
  // never took it up)
  gains?: Record<string, number | null>;
  check: { n: number; mae: number; maeBase: number | null; logLoss: number | null; logLossBase: number | null; brier: number | null; brierBase: number | null; sideHit: number | null } | null;
  trust: Trust | null;
}

// (a prop type's fitted terms by their keys: its params carry every term the fit kept, past the ones named
// above, and its soft terms' weights (project.mjs softWeight))
export const propTerms = (t: PropType) => t.params as unknown as Record<string, number | null | undefined>;
export const softTerms = (t: PropType): Record<string, { w: number }> => (t.params as unknown as { soft?: Record<string, { w: number }> }).soft ?? {};

// (the NFL's questionable players' chance of playing (the bettor's playchance.mjs): the share of past seasons'
// questionable regulars who played, the levels its held-out seasons kept, the check (as read live) against the
// flat half it replaced, each side's (a side that doesn't beat it read at half: half), and the chance as read
// live by a quarterback or not and his team's games missed in a row)
export interface PlayChance {
  n: number;
  rate: number;
  levels: string[];
  half?: string[];
  check: { held: number[]; n: number; loss: number; flat: number; sides?: Record<string, { n: number; loss: number; half?: boolean }>; tried: { level: string; gain: number; kept: boolean; unread?: boolean; worse?: string[] }[] };
  cells: Record<string, number>;
}

// (the play chance in plain words, for the About and the Algorithm tab)
const PLAY_LEVEL_WORDS: Record<string, string> = { gone: 'his games missed in a row', qb: 'a quarterback or not', practice: 'his last practice' };
export function playChanceText(p: PlayChance | null | undefined): string | null {
  if (!p) return null;
  const c = p.cells ?? {};
  const pc = (v: number | undefined): string => (v === undefined || !Number.isFinite(v) ? '-' : `${Math.round(v * 100)}%`);
  const who = (k: string): string => {
    if ((p.half ?? []).includes(k)) return 'at half (the table doesn\'t beat it on the held-out seasons)';
    const v = ['0', '1', '2+', 'new'].map((g) => c[`${k} ${g}`]);
    return v.every((x) => x === v[0]) ? pc(v[0]) : `${pc(v[0])} (missed his last game ${pc(v[1])}, two or more ${pc(v[2])}, none played yet this season ${pc(v[3])})`;
  };
  const held = p.check?.held?.length ? `${p.check.held[0]}${p.check.held.length > 1 ? `-${p.check.held[p.check.held.length - 1]}` : ''}` : '';
  const unread = (p.check?.tried ?? []).filter((x) => x.unread).map((x) => `${PLAY_LEVEL_WORDS[x.level] ?? x.level} would save ${x.gain}, not read live (the report ESPN gives carries none)`);
  return (
    `A questionable regular teammate counts as missing by his chance of playing once the final injury report is out (the day before the game; before it, at half), from ${p.n.toLocaleString()} past questionable regulars' reports (${pc(p.rate)} played), not a flat half: ` +
    `a quarterback ${who('QB')}; anyone else ${who('other')}. By ${p.levels.length ? p.levels.map((l) => PLAY_LEVEL_WORDS[l] ?? l).join(', ') : 'nothing more'}. ` +
    `Held out (${held}), as read live: log loss ${p.check.loss} against the flat half's ${p.check.flat}${unread.length ? `; ${unread.join('; ')}` : ''}.`
  );
}

// A breakdown's row: a record, its units, its return and its closing-line value
export interface Tally {
  label: string;
  bets: number;
  won: number;
  lost: number;
  push: number;
  staked: number;
  profit: number;
  roi: number | null;
  open: number;
  // (closing-line value: bets with a close, the share that beat it (of those that didn't tie), the mean
  // expected return at the close)
  clvN: number;
  clvBeat: number | null;
  clvEv: number | null;
}

// (a game in play as the scoreboard has it: home and away scores, whether it's over, and ESPN's state: not
// begun, under way, or over (a final, or put off))
export type Board = { hs: number; as: number; final: boolean; state?: 'pre' | 'in' | 'post' };

// (a bet decided: by the run's grading, or in play by the score)
export type Settled = { status: 'won' | 'lost' | 'push'; profit: number };

// (a point on the profit curve's hover: a strip across the chart, its dot, and what it was)
export type CurveSpot = { x: number; w: number; px: number; y: number; title: string };

// (a sport's own line on the profit curve: its running profit at each point, its path, its profit now)
export type CurveLine = { sport: string; values: number[]; path: string; profit: number };

// (a prop or total in play as a meter: pips for a short count, a bar with the line notched for a big one)
export type Meter = { pips: { on: boolean; past: boolean }[] | null; fill: number; mark: number; extra: number };

// (a CHECK cause's words: check-learn.mjs CAUSE_LABELS)
export const CHECK_CAUSE_LABELS: Record<string, string> = {
  role: 'Role change',
  news: 'News on his unit',
  'shadow:gap': 'PASS: the gap (shadow)',
  'shadow:small': 'PASS: role under the CHECK bar (shadow)',
  unpriced: 'Unpriced (assumed -110)',
  'missing-starter-not-seen': 'Missing player not seen',
  'vacated-fade': 'Vacated work',
  'early-season-prior': 'Early-season prior',
  matchup: 'Opponent / matchup',
  'game-script': 'Game script',
  'context-term': 'Context term',
  dispersion: 'Dispersion / skew',
  unknown: 'Unknown',
};
