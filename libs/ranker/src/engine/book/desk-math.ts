// The Algorithm desk's arithmetic, pure (no Angular, no fetching: tests/model-desk.test.mjs runs it under
// Node): its records, a bet's payout, a bet in play settled by the score as the run will grade it, the
// meters and the profit curves
import { Board, CurveLine, CurveSpot, Intent, Meter, ModelBet, Settled, Tally } from './desk-model';

// (mma: the fifth league since 2026-10-16, fights not games: UFC moneylines alone (leagues.mjs, mma-desk.mjs); the
// MMA app is dev-only on the live site, its data ships all the same)
export const SPORTS = ['nfl', 'nba', 'nhl', 'mlb', 'mma'];
export const ESPN_LEAGUES: Record<string, string> = { nfl: 'football/nfl', nba: 'basketball/nba', nhl: 'hockey/nhl', mlb: 'baseball/mlb', mma: 'mma/ufc' };
export const MARKET_NAMES: Record<string, string> = { spread: 'Spread', total: 'Total', ml: 'Moneyline', prop: 'Props' };
// (the stakes it bets: 0.5 at no edge up to 3, by half units: desk.mjs stakeFor)
export const STAKES = [0.5, 1, 1.5, 2, 2.5, 3];
// (play money: 1,000 to start, and 1,000 more whenever the balance would go under 0: desk.mjs BANKROLL)
export const BANKROLL = 1000;
// (each sport's scoring unit, for a context term's size and a total's count)
export const UNIT_WORDS: Record<string, string> = { nfl: 'pts', nba: 'pts', nhl: 'goals', mlb: 'runs', mma: 'log odds' };
// (how far ahead or behind a side has to be for its score's color to run all the way, by sport)
export const EDGE_FULL: Record<string, number> = { nfl: 14, nba: 12, nhl: 2, mlb: 3, mma: 1 };
// (the props a bar measures whatever their line: yards, a goalie's saves, a pitcher's outs; a short count is pips)
export const BAR_STATS = new Set(['passYds', 'rushYds', 'recYds', 'rushRecYds', 'saves', 'outs']);

const mean = (list: number[]): number | null => (list.length ? list.reduce((s, v) => s + v, 0) / list.length : null);

// (an older bet without its intent: an edge if its EV was over 0; postmortem.mjs intentOf)
export const intentOf = (b: ModelBet): Intent => b.intent ?? (b.ev > 0 ? 'edge' : 'action');

// (a market tracked, not bet (desk.mjs TRACK): no edge, or a guard cut it; since TRACKED_FROM. Never in the record,
// the bankroll or the lists of bets: the Tracked panel's alone. The bets before it with no edge, action bets, stay
// as they were)
export const TRACKED_FROM = '2026-10-13';
export const isTracked = (b: ModelBet): boolean => b.intent === 'track';

// (a tracked row as if bet at a unit: what it would have made, its result's (desk.mjs trackedRecord))
export function atUnit(b: ModelBet): ModelBet {
  const won = b.status === 'won' && !b.void;
  return { ...b, units: 1, profit: won ? toWin({ odds: b.odds, units: 1 }) : b.status === 'lost' && !b.void ? -1 : 0 };
}

// (what a bet pays on top of its stake if it wins, at its American odds)
export const toWin = (b: Pick<ModelBet, 'odds' | 'units'>): number => (b.odds > 0 ? (b.units * b.odds) / 100 : (b.units * 100) / -b.odds);

// A record of some bets: the graded ones won, lost and pushed, their units and return; the open ones counted;
// and their closing-line value (the bets with a price CLV, clv.prob: the share of those not tied that beat the
// close, the mean CLV, the bet's own price against the close's no-vig chance at its line; clvEv keeps its old name)
export function tally(label: string, bets: ModelBet[]): Tally {
  const t: Tally = { label, bets: 0, won: 0, lost: 0, push: 0, staked: 0, profit: 0, roi: null, open: 0, clvN: 0, clvBeat: null, clvEv: null };
  const closes = bets.map((b) => b.clv).filter((c): c is NonNullable<ModelBet['clv']> => !!c && c.prob !== null && c.prob !== undefined);
  const decided = closes.filter((c) => c.beat !== null && c.beat !== undefined);
  t.clvN = closes.length;
  t.clvBeat = decided.length ? decided.filter((c) => c.beat).length / decided.length : null;
  t.clvEv = mean(closes.map((c) => c.prob).filter((v): v is number => v !== null && v !== undefined));
  for (const b of bets) {
    if (b.status === 'open') {
      t.open++;
      continue;
    }
    // (a void bet, no action (a player who didn't play, a game called off): not in the record, as desk.mjs record)
    if (b.void) continue;
    t.bets++;
    t[b.status]++;
    t.staked += b.units;
    t.profit += b.profit;
  }
  t.roi = t.staked ? t.profit / t.staked : null;
  return t;
}

// (by how much a game bet is ahead at a score: a spread its side's margin plus its line, a total its side of
// the line, a moneyline its side's margin; desk.mjs settle's edge)
export function gameEdge(b: ModelBet, game: Board): number {
  const margin = (b.side === 'home' ? 1 : -1) * (game.hs - game.as);
  if (b.market === 'spread') return margin + (b.line ?? 0);
  if (b.market === 'total') return (b.side === 'over' ? 1 : -1) * (game.hs + game.as - (b.line ?? 0));
  return margin;
}

// (an edge as a result: won over 0, lost under, a push at 0; what it pays)
export function outcome(b: ModelBet, edge: number): Settled {
  const status = edge > 0 ? 'won' : edge < 0 ? 'lost' : 'push';
  return { status, profit: status === 'won' ? toWin(b) : status === 'lost' ? -b.units : 0 };
}

// An in-play bet's result as soon as it's decided, by the same rules the run grades with (desk.mjs settle,
// props.mjs settleProp): a game bet once its game is final, a total sooner (once the scoring's past its line:
// the over won, the under lost, whatever comes after); a prop once it's past its line (an over won, an under
// lost) or its game's over. Null until then (and for a prop whose player's count isn't in the box score)
export function provisional(b: ModelBet, game: Board | undefined, propNow: number | null | undefined): Settled | null {
  if (b.status !== 'open' || b.line === undefined) return null;
  if (b.market === 'prop') {
    if (propNow === null || propNow === undefined || b.line === null) return null;
    if (!game?.final && propNow <= b.line) return null;
    return outcome(b, (b.side === 'over' ? 1 : -1) * (propNow - b.line));
  }
  if (!game) return null;
  if (!game.final && (b.market !== 'total' || game.hs + game.as <= (b.line ?? 0))) return null;
  return outcome(b, gameEdge(b, game));
}

// The Algorithm's open bets as of now, by their game's board on ESPN: open (not started yet, soonest first; with them
// a game past its start that ESPN hasn't begun or has put off: over without a final), live (under way: In Play), and
// over (final: out of In Play the minute ESPN says so, pending at the top of Recently closed till the run grades it,
// replay-history.ts withPending). Each open bet in exactly one
export function splitOpenOf(bets: ModelBet[], now: number, boardOf: (b: ModelBet) => Board | undefined): { open: ModelBet[]; live: ModelBet[]; over: ModelBet[] } {
  const byStart = (a: ModelBet, b: ModelBet) => a.start.localeCompare(b.start);
  const out = { open: [] as ModelBet[], live: [] as ModelBet[], over: [] as ModelBet[] };
  for (const b of bets) {
    const board = boardOf(b);
    if (Date.parse(b.start) > now || board?.state === 'pre' || (board?.state === 'post' && !board.final)) out.open.push(b);
    else if (board?.final) out.over.push(b);
    else out.live.push(b);
  }
  out.open.sort(byStart);
  out.live.sort(byStart);
  return out;
}

// (a side in play, at the score: by how much it's covering (a spread) or leading (a moneyline); null for a
// total or a prop, or before there's a score)
export function sideEdge(b: ModelBet, game: Board | undefined): number | null {
  if ((b.market !== 'spread' && b.market !== 'ml') || !game) return null;
  return gameEdge(b, game);
}

// (a prop in play, by its count against the line: an over is home once it's past the line; an under is alive
// while it's under, lost once it's past)
export function propState(b: ModelBet, count: number | null): 'won' | 'alive' | 'lost' | null {
  if (count === null || b.line === undefined || b.line === null) return null;
  if (count <= b.line) return 'alive';
  return b.side === 'over' ? 'won' : 'lost';
}

// A prop in play as a meter to cheer along with: a short count (carries, catches, TDs, shots, strikeouts) as a
// row of pips, one a unit up to the one past the line, lit as they come (the last one: the line crossed); a big
// one (yards, saves, a game's total) as a bar with a notch at the line, running to a bit past it
export function meterOf(b: ModelBet, count: number | null): Meter | null {
  if (count === null || b.line === undefined || b.line === null) return null;
  if (b.market === 'prop' && !BAR_STATS.has(b.propType ?? '') && b.line <= 12.5) {
    const pips = Math.ceil(b.line);
    return {
      pips: Array.from({ length: pips + 1 }, (_, i) => ({ on: i < count, past: i === pips })),
      fill: 0,
      mark: 0,
      extra: Math.max(0, count - pips - 1),
    };
  }
  const span = Math.max(b.line * 1.35, count);
  return { pips: null, fill: Math.min(100, (count / span) * 100), mark: (b.line / span) * 100, extra: 0 };
}

// The live column, shared by the Algorithm's In Play and the Book's Open Bets: a bet in play's count,
// and a side's words and color at the score

// (what an in-play bet's meter counts: a prop's stat so far, a total's points so far; null for the rest,
// whose result is the score. A prop whose player isn't in the box score yet, with its game under way, is
// at 0 on the meter: no catch yet is none so far. For the meter alone: grading still reads him as not in it)
export function countNowOf(b: ModelBet, game: Board | undefined, propNow: number | null | undefined): number | null {
  if (b.market === 'prop') return propNow ?? (game?.state === 'in' ? 0 : null);
  if (b.market !== 'total') return null;
  return game ? game.hs + game.as : null;
}

// (a side in play, in words: where it stands at the score, or once the game's over, how it came out)
export function sideTextOf(b: ModelBet, game: Board | undefined): string {
  const decided = provisional(b, game, null);
  if (decided) return decided.status === 'won' ? 'Won' : decided.status === 'lost' ? 'Lost' : 'Push';
  const edge = sideEdge(b, game);
  if (edge === null) return 'Under way';
  if (edge === 0) return 'Level';
  const by = Math.abs(edge);
  if (b.market === 'spread') return edge > 0 ? `Covering by ${by}` : `Short by ${by}`;
  return edge > 0 ? `Leading by ${by}` : `Trailing by ${by}`;
}

// (its hover: the same, the spread's shortfall said in full)
export function sideTitleOf(b: ModelBet, game: Board | undefined): string {
  const edge = sideEdge(b, game);
  if (edge === null) return '';
  if (edge === 0) return 'Level';
  const spread = b.market === 'spread';
  return edge > 0 ? `${spread ? 'Covering' : 'Leading'} by ${edge}` : `${spread ? 'Short of covering' : 'Trailing'} by ${-edge}`;
}

// (its score's color: green covering or leading, red not, deeper the further (about two touchdowns, 12
// points, 2 goals or 3 runs is all the way); white level)
export function edgeColorOf(b: ModelBet, game: Board | undefined): string | null {
  const edge = sideEdge(b, game);
  if (edge === null || edge === 0) return null;
  const share = Math.round(35 + 65 * Math.min(1, Math.abs(edge) / (EDGE_FULL[b.sport] ?? 10)));
  return `color-mix(in srgb, ${edge > 0 ? 'var(--win)' : 'var(--loss)'} ${share}%, #fff)`;
}

// (the bets graded, in grading order)
export const gradedOrder = (bets: ModelBet[]): ModelBet[] =>
  bets.filter((b) => b.status !== 'open').sort((a, b) => (a.gradedAt ?? a.start).localeCompare(b.gradedAt ?? b.start) || a.start.localeCompare(b.start));

// The profit after each graded bet, drawn into a 600 by 120 box (10 of headroom under it): every line in units
// won from 0 on the one scale (the zero line across it), the total's and, when there's more than one sport, each
// sport's own running profit (flat while another's bets are graded: at any bet they add up to the total's). The
// total's values and path, the low and high (0 always in them), each point's hover strip and dot, the last
// point (the profit now), and each sport's line
export const CURVE_W = 600;
export function profitCurves(graded: ModelBet[], start: number, units: (v: number) => string) {
  const sports = SPORTS.filter((s) => graded.some((b) => b.sport === s));
  const running: Record<string, number> = Object.fromEntries(sports.map((s) => [s, 0]));
  let sum = 0;
  const points = [{ total: 0, by: { ...running } }];
  for (const b of graded) {
    sum += b.profit;
    running[b.sport] += b.profit;
    points.push({ total: sum, by: { ...running } });
  }
  const lines = sports.length > 1 ? sports : [];
  const values = points.flatMap((p) => [p.total, ...lines.map((s) => p.by[s])]);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const last = points.length - 1;
  const step = CURVE_W / Math.max(1, last);
  const yOf = (v: number) => 110 - ((v - min) / span) * 100;
  const pathOf = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
  const spots: CurveSpot[] = points.map((p, i) => {
    const b = graded[i - 1];
    const split = lines.length ? ` · ${lines.map((s) => `${s.toUpperCase()} ${units(p.by[s])}`).join(', ')}` : '';
    const title = b
      ? `After bet ${i} of ${last}: ${units(p.total)}, bankroll ${(start + p.total).toFixed(2)}u (${units(b.profit)}, ${b.sport.toUpperCase()} ${b.pick}, ${b.status})${split}`
      : `Start: ${start.toFixed(2)}u`;
    return { x: Math.max(0, i * step - step / 2), w: i === 0 || i === last ? step / 2 : step, px: i * step, y: yOf(p.total), title };
  });
  const totals = points.map((p) => p.total);
  return {
    totals,
    path: pathOf(totals),
    range: { min, max },
    spots,
    zeroY: yOf(0),
    end: spots[last],
    profit: sum,
    lines: lines.map((sport): CurveLine => {
      const values = points.map((p) => p.by[sport]);
      return { sport, values, path: pathOf(values), profit: running[sport] };
    }),
    // (the one sport whose bets these all are, if so: the total is its line)
    solo: sports.length === 1 ? sports[0] : null,
  };
}

// The model's epoch (leagues.mjs MODEL_EPOCH, each sport's state.json epoch: its latest major change, when its
// trust restarted): the desk's record shows the bets since it by default, the full history kept for All Time.
// Each sport's own (bySport), the newest across them (at) and the sports whose state has one (a sport without:
// all its bets). A bet is judged against ITS sport's epoch: the newest one applied to every sport threw out
// every NFL, NHL and MLB bet placed before MMA's league started (2026-10-16, its own stamp), and the owner
// read 0-1 "since this model" over a 7-7 record
export interface DeskEpoch {
  at: string;
  sports?: string[];
  bySport?: Record<string, string>;
}
export function deskEpochOf(states: { sport: string; epoch?: string | null }[]): DeskEpoch | null {
  const dated = states.filter((s) => typeof s.epoch === 'string' && !Number.isNaN(Date.parse(s.epoch)));
  if (!dated.length) return null;
  const at = dated.map((s) => s.epoch as string).sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  return { at, sports: dated.map((s) => s.sport), bySport: Object.fromEntries(dated.map((s) => [s.sport, s.epoch as string])) };
}

// (the model's epoch as the chip names it: the one most sports share (the desk's MODEL_EPOCH; a league that
// started later keeps its own start), the newest on a tie; the owner reads the model's date here, not a
// "per sport" shrug)
export function epochShared(epoch: DeskEpoch | null): string | null {
  if (!epoch) return null;
  const stamps = Object.values(epoch.bySport ?? {});
  if (!stamps.length) return epoch.at;
  const count = new Map<string, number>();
  for (const at of stamps) count.set(at, (count.get(at) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || Date.parse(b[0]) - Date.parse(a[0]))[0][0];
}

// (the epoch a sport's bets are judged by: its own, else the newest; none for a sport without one)
export function epochFor(epoch: DeskEpoch | null, sport: string): string | null {
  if (!epoch) return null;
  if (epoch.bySport) return epoch.bySport[sport] ?? null;
  return !epoch.sports || epoch.sports.includes(sport) ? epoch.at : null;
}

// (a bet placed at or after its sport's epoch, by when it was placed (an older bet without placedAt, its game's
// start), as run.mjs's trust evidence; true with no epoch, or for a sport the epoch doesn't cover)
export function afterEpoch(b: { sport: string; placedAt?: string; start: string }, epoch: DeskEpoch | string | null): boolean {
  if (!epoch) return true;
  const e: DeskEpoch = typeof epoch === 'string' ? { at: epoch } : epoch;
  const since = e.bySport || e.sports ? epochFor(e, b.sport) : e.at;
  if (!since) return true;
  const at = Date.parse(b.placedAt || b.start);
  return !Number.isNaN(at) && at >= Date.parse(since);
}

// The bets placed since the epoch (every one with none)
export const sinceEpoch = <T extends { sport: string; placedAt?: string; start: string }>(bets: T[], epoch: DeskEpoch | string | null): T[] =>
  bets.filter((b) => afterEpoch(b, epoch));

// (the epoch in words for its toggle: "Oct 14, 6:00 AM", this browser's time)
export function epochLabel(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

// (the board's panels, open or shut: By Sport and By Confidence open from the start, Open Bets, In Play and
// Recently closed shut (the owner, 2026-10-19); Findings shut at the foot (2026-10-20))
export type DeskPanel = 'sport' | 'confidence' | 'open' | 'live' | 'closed' | 'findings';
export const DESK_PANELS_OPEN: readonly DeskPanel[] = ['sport', 'confidence'];
export const deskPanelOpen = (panel: DeskPanel, flipped: ReadonlySet<string> = new Set()): boolean => DESK_PANELS_OPEN.includes(panel) !== flipped.has(panel);

// (the research's findings (the owner, 2026-10-20: "update algo page with findings"): one shared file,
// apps/nfl/src/StaticData/model/findings.json, each round appending entries; one line each, dated, grouped Shipped /
// Tested and dropped / Watching, newest first in each group; an entry with a sport shows under that sport's chip and
// All, one without under every chip)
export type FindingGroup = 'shipped' | 'dropped' | 'watching';
export interface Finding {
  date: string;
  group: FindingGroup;
  text: string;
  sport?: string | null;
  ref?: string | null;
}
export interface FindingsFile {
  v?: number;
  entries?: Finding[];
}
export const FINDING_GROUPS: readonly { group: FindingGroup; label: string }[] = [
  { group: 'shipped', label: 'Shipped' },
  { group: 'dropped', label: 'Tested and dropped' },
  { group: 'watching', label: 'Watching' },
];
export function findingsOf(file: FindingsFile | null, sport: string | null): { group: FindingGroup; label: string; entries: Finding[] }[] {
  const all = (file?.entries ?? []).filter((e) => !!e?.text && FINDING_GROUPS.some((g) => g.group === e.group) && (!sport || !e.sport || e.sport === sport));
  return FINDING_GROUPS.map((g) => ({ ...g, entries: all.filter((e) => e.group === g.group).sort((a, b) => String(b.date).localeCompare(String(a.date))) })).filter((g) => g.entries.length);
}
