// The Algorithm desk's data, as the bettor writes it (libs/ranker/scripts/model/run.mjs): each sport's
// data/model/ledger.json (its bets) and state.json (its settings, its trust, its context, its props, its
// backtest), and the shapes the desk builds from them

export type Market = 'spread' | 'total' | 'ml' | 'prop';
export type Status = 'open' | 'won' | 'lost' | 'push';
export type Intent = 'edge' | 'action';

export interface ModelBet {
  id: string;
  // (its game's ESPN id: the live score)
  event?: string;
  sport: string;
  start: string;
  placedAt: string;
  gradedAt?: string;
  matchup: string;
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
  // (edge: it saw value; action: no edge, bet for the data. Older bets go by their EV)
  intent?: Intent;
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

export interface ModelState {
  sport: string;
  label: string;
  updated: string;
  params: Record<string, number>;
  test: ({ games: number } & TestNumbers) | null;
  trust: Record<string, Trust>;
  history: { games: number; finals: number };
  changelog: Change[];
  teams: { abbr: string; rating: number }[];
  context?: { lambda: number; terms: ContextTerm[]; test: { games: number; before: TestNumbers; after: TestNumbers } } | null;
  postmortem?: { graded: number; disrupted: number; weight: number; fitted: boolean };
  props?: { types: PropType[]; lastRun?: { games: number; priced: number; bet: number } } | null;
  // (the book it bets, set in leagues.mjs; where this run's lines came from; The Odds API's credits)
  book?: string;
  lines?: string;
  odds?: OddsUsage | null;
  backtest?: { at: string; snapshots: number; planned: number; markets: Record<string, BacktestMarket> } | null;
  // (the CHECKs' tally and what drives them: checks.mjs checkSummary, check-learn.mjs checkLearning)
  checks?: { n?: number; open?: number; unreadable?: boolean; learning?: CheckLearning | null } | null;
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
  recommendations: CheckAdvice[];
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

export type BacktestRow = BacktestMarket & { sport: string; market: string };
export type PropRow = PropType & { sport: string };
export type ContextRow = ContextTerm & { sport: string; unitWord: string };

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

export type SportTally = Tally & { state: ModelState | null };

// (a game in play as the scoreboard has it: home and away scores, whether it's over, and ESPN's state: not
// begun, under way, or over (a final, or put off))
export type Board = { hs: number; as: number; final: boolean; state?: 'pre' | 'in' | 'post' };

// (a bet decided: by the run's grading, or in play by the score)
export type Settled = { status: 'won' | 'lost' | 'push'; profit: number };

export type CalibrationRow = { label: string; n: number; said: number; was: number };

// (a point on the profit curve's hover: a strip across the chart, its dot, and what it was)
export type CurveSpot = { x: number; w: number; px: number; y: number; title: string };

// (a sport's own line on the profit curve: its running profit at each point, its path, its profit now)
export type CurveLine = { sport: string; values: number[]; path: string; profit: number };

// (a prop or total in play as a meter: pips for a short count, a bar with the line notched for a big one)
export type Meter = { pips: { on: boolean; past: boolean }[] | null; fill: number; mark: number; extra: number };

export type GameDay = { day: string; games: { event: string; label: string; count: number }[] };

// (a CHECK cause's words: check-learn.mjs CAUSE_LABELS)
export const CHECK_CAUSE_LABELS: Record<string, string> = {
  role: 'Role change',
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

// (a row of the CHECKs panel: a sport's cause, or a role's sub-reason, with its tally and its stats)
export type CheckCauseRow = CheckTally & { sport: string; key: string; label: string; stats: string; open: number };

// The CHECKs panel's rows and its ranked advice from each sport's state (check-learn.mjs checkLearning): a cause
// a row (the role's sub-reasons as their own rows), the most graded first; the advice blind spots first, then
// the guards that can loosen, then the leans to watch, each sport's in its own rank order
export function checkPanelOf(states: ModelState[]): { rows: CheckCauseRow[]; advice: (CheckAdvice & { sport: string })[] } {
  const rows: CheckCauseRow[] = [];
  const advice: (CheckAdvice & { sport: string })[] = [];
  for (const s of states) {
    const l = s.checks?.learning;
    if (!l) continue;
    const statsOf = (cause: string) =>
      Object.entries(l.byCauseStat?.[cause] ?? {})
        .sort((a, b) => b[1].n - a[1].n)
        .slice(0, 3)
        .map(([k, t]) => `${k.replace(/^prop:/, '')} ${t.won}-${t.lost}`)
        .join(', ');
    const open = l.openByCause ?? {};
    const none: CheckTally = { n: 0, won: 0, lost: 0, push: 0, hitRate: null, ci: null, breakEven: null, profit: 0, perUnit: null };
    const labelOf = (key: string) => (key.startsWith('role:') ? `${CHECK_CAUSE_LABELS['role']} (${key.slice(5)})` : (CHECK_CAUSE_LABELS[key] ?? key));
    const keys = new Set<string>([...Object.keys(l.byCause ?? {}).filter((k) => k !== 'role'), ...Object.keys(l.byRole ?? {}).map((k) => `role:${k}`), ...Object.keys(open)]);
    for (const key of keys) {
      const t = key.startsWith('role:') ? l.byRole?.[key.slice(5)] : l.byCause?.[key];
      rows.push({ ...(t ?? none), sport: s.label, key, label: labelOf(key), stats: key.startsWith('role:') ? '' : statsOf(key), open: open[key] ?? 0 });
    }
    for (const a of l.recommendations ?? []) advice.push({ ...a, sport: s.label });
  }
  const order: Record<string, number> = { 'blind-spot': 0, loosen: 1, watch: 2 };
  rows.sort((a, b) => b.n - a.n || b.open - a.open || a.label.localeCompare(b.label));
  advice.sort((a, b) => order[a.kind] - order[b.kind] || Number(b.confirmed) - Number(a.confirmed) || a.rank - b.rank);
  return { rows, advice };
}
