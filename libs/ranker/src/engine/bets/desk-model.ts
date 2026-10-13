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
  props?: { types: PropType[]; lastRun?: { games: number; priced: number; bet: number }; playChance?: PlayChance } | null;
  // (the book it bets, set in leagues.mjs; where this run's lines came from; The Odds API's credits)
  book?: string;
  lines?: string;
  odds?: OddsUsage | null;
  backtest?: { at: string; snapshots: number; planned: number; markets: Record<string, BacktestMarket> } | null;
  // (the CHECKs' tally and what drives them: checks.mjs checkSummary, check-learn.mjs checkLearning)
  checks?: { n?: number; open?: number; unreadable?: boolean; learning?: CheckLearning | null } | null;
  // (the same-game sizing: desk.mjs sameGameOf)
  sameGame?: SameGame | null;
}

// (the props' correlation within a game, fit on the graded props, and the replay that keeps it: desk.mjs sameGameOf)
export interface SameGame {
  rho: number;
  raw: number | null;
  se: number | null;
  games: number;
  pairs: number;
  fitted: boolean;
  used: number;
  replay: { games: number; resized: number; trimmed: number; asBet: number; joint: number };
}

// (the same-game sizing in plain words, for the About and the Algorithm tab)
export function sameGameText(g: SameGame | null | undefined): string | null {
  if (!g) return null;
  const how = "A game's props win or lose together a little (overs with overs, an over against an under the other way), so its edge props are sized jointly with the rest of its props, as fewer, bigger bets on the game: stakes only cut, never raised, never a bet added or dropped.";
  if (!g.fitted) return `${how} Not used yet: ${g.games} games with two or more graded props, 10 needed.`;
  const read = `Read on ${g.pairs.toLocaleString()} prop pairs in ${g.games} games: ${g.raw ?? '-'} (give or take ${g.se ?? '-'}), pulled toward 0 for the few games to ${g.rho}`;
  const replay = g.replay.resized ? `; replayed on the graded games, it would have cut ${g.replay.resized} stakes by ${g.replay.trimmed}u` : '; replayed on the graded games, it would have changed no stake';
  return `${how} ${read}${replay}. ${g.used ? `Used at ${g.used}.` : 'Not used: the replay grew the bankroll less with it.'}`;
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
    // (the shadows, each passAs its own row: their record for the rule's review, never in the advice)
    for (const [k, t] of Object.entries(l.byPassAs ?? {})) rows.push({ ...none, ...t, sport: s.label, key: `shadow:${k}`, label: labelOf(`shadow:${k}`), stats: '', open: t.open ?? 0 });
    for (const a of l.recommendations ?? []) advice.push({ ...a, sport: s.label });
  }
  const order: Record<string, number> = { 'blind-spot': 0, loosen: 1, watch: 2 };
  rows.sort((a, b) => b.n - a.n || b.open - a.open || a.label.localeCompare(b.label));
  advice.sort((a, b) => order[a.kind] - order[b.kind] || Number(b.confirmed) - Number(a.confirmed) || a.rank - b.rank);
  return { rows, advice };
}

// ---- the weekly self-check (libs/ranker/scripts/model/selfcheck.mjs: each sport's data/model/selfcheck.json) ----

export type SelfCheckStatus = 'flag' | 'watch' | 'partial' | 'ok' | 'thin' | 'info';

// (one check: its status, its headline (every number in it from its rows), what it measured and how, the rows,
// the example bets' ids, the bot fields it needs (partial), how many cells it tested (a many-cell check))
export interface SelfCheck {
  id: string;
  title: string;
  status: SelfCheckStatus;
  headline: string;
  metric: string | null;
  value: number | null;
  threshold: string | null;
  n: number | null;
  rows: Record<string, unknown>[];
  examples: string[];
  how: string;
  needs: string[] | null;
  tested: number | null;
}

export interface SelfCheckFile {
  v?: number;
  sport: string;
  at: string;
  window: { from: string; to: string };
  baseline?: { from: string; to: string };
  summary: Partial<Record<SelfCheckStatus, number>> & { headline?: string };
  checks: SelfCheck[];
  writeups?: { sample?: { id: string; headline?: string | null; reason: string; risk: string }[] } | null;
  notes?: string[];
}

// (a check as the panel shows it: its key for the open/closed state, the rows as a small table)
export interface SelfCheckRow extends SelfCheck {
  key: string;
  columns: string[];
  cells: string[][];
}

// (a sport's self-check as the panel shows it: its week, its counts, the checks to look at (flag, watch,
// partial) and the rest folded under a line of counts)
export interface SelfCheckView {
  sport: string;
  label: string;
  week: string;
  at: string;
  counts: { status: SelfCheckStatus; n: number }[];
  shown: SelfCheckRow[];
  folded: SelfCheckRow[];
  foldedLine: string;
  sample: { id: string; headline?: string | null; reason: string; risk: string }[];
  notes: string[];
}

export const SELF_CHECK_ORDER: SelfCheckStatus[] = ['flag', 'watch', 'partial', 'ok', 'thin', 'info'];

// (a week's dates as the header says them: Oct 5-11, Sep 28-Oct 4)
export function weekLabel(from: string, to: string): string {
  const f = new Date(`${from}T12:00:00Z`);
  const t = new Date(`${to}T12:00:00Z`);
  if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime())) return '';
  const month = (d: Date) => d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  return f.getUTCMonth() === t.getUTCMonth() ? `${month(f)} ${f.getUTCDate()}-${t.getUTCDate()}` : `${month(f)} ${f.getUTCDate()}-${month(t)} ${t.getUTCDate()}`;
}

// (a cell's words: a number to 2 places at most, a share-like key as a percent, a nested record as its parts)
// (overBook: C19's record against the book's chance, won less the chance a bet)
const PCT_KEYS = /^(share|shareBase|dogShare|dogShareBase|moved|beat|roi|hitRate|breakEven|rejectRate|r|overBook)$/;
const PTS_KEYS = /^(clvProb|clvSe)$/;
export function selfCheckCell(key: string, v: unknown): string {
  if (v === null || v === undefined) return '-';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '-';
    if (PCT_KEYS.test(key)) return `${Math.round(v * 1000) / 10}%`;
    // (C19's CLV chance and its standard error: a few tenths of a point, so two decimals)
    if (PTS_KEYS.test(key)) return `${(v * 100).toFixed(2)}%`;
    return String(Math.round(v * 100) / 100);
  }
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' ? selfCheckCell('', x) : selfCheckCell(key, x))).join(', ') || '-';
  if (typeof v === 'object') {
    return Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== null && x !== undefined)
      .map(([k, x]) => `${k} ${selfCheckCell(k, x)}`)
      .join(' · ');
  }
  return String(v);
}

// The Self-check panel's sports: each sport's file, its checks sorted flag, watch, partial first (the file's
// order within each), the rest folded ("9 checks fine · 2 too thin"); labels: a sport's name by its key
export function selfCheckPanelOf(files: (SelfCheckFile | null)[], labels: Record<string, string> = {}): SelfCheckView[] {
  const out: SelfCheckView[] = [];
  for (const f of files) {
    if (!f || !Array.isArray(f.checks)) continue;
    const rank = (s: SelfCheckStatus) => {
      const i = SELF_CHECK_ORDER.indexOf(s);
      return i < 0 ? SELF_CHECK_ORDER.length : i;
    };
    const rows: SelfCheckRow[] = f.checks
      .map((c, i) => ({ c, i }))
      .sort((a, b) => rank(a.c.status) - rank(b.c.status) || a.i - b.i)
      .map(({ c }) => {
        const list = Array.isArray(c.rows) ? c.rows : [];
        const columns = [...new Set(list.flatMap((r) => Object.keys(r)))].filter((k) => k !== 'ids');
        return { ...c, key: `${f.sport}:${c.id}`, columns, cells: list.map((r) => columns.map((k) => selfCheckCell(k, r[k]))) };
      });
    const loud = new Set<SelfCheckStatus>(['flag', 'watch', 'partial']);
    const n = (s: SelfCheckStatus) => f.checks.filter((c) => c.status === s).length;
    const parts = [n('ok') ? `${n('ok')} check${n('ok') === 1 ? '' : 's'} fine` : '', n('thin') ? `${n('thin')} too thin` : '', n('info') ? `${n('info')} for information` : ''].filter(Boolean);
    out.push({
      sport: f.sport,
      label: labels[f.sport] ?? f.sport.toUpperCase(),
      week: weekLabel(f.window?.from ?? '', f.window?.to ?? ''),
      at: f.at,
      counts: SELF_CHECK_ORDER.map((status) => ({ status, n: n(status) })).filter((x) => x.n),
      shown: rows.filter((r) => loud.has(r.status)),
      folded: rows.filter((r) => !loud.has(r.status)),
      foldedLine: parts.join(' · '),
      sample: f.writeups?.sample ?? [],
      notes: f.notes ?? [],
    });
  }
  return out;
}
