// A bet on a game under way, as the Live tab's card rows and the game modal's Your Bets panel watch it, pure
// (tests/live-tab.test.mjs): where it stands (its status tag and tone), its meter (the fill to the current value,
// the tick at the line, a prop's dashed projection), and the two captions under it. The grading itself is the
// desk's (desk-math provisional, as the settler grades): this is the sweat between now and then

import { UNIT_WORDS, gameEdge, provisional } from './desk-math';
import type { ModelBet } from './desk-model';
import type { PlayBet } from '../account/wallet/wallet-math';
import { asDeskBet } from '../account/wallet/wallet-math';
import type { GameState } from './live-games';

export type WatchTone = 'good' | 'close' | 'bad' | 'wait';

// (the game as the watch reads it: the score, its state, how far it's gone (null when the clock can't be read),
// each side's letters)
export interface GameRead {
  as: number;
  hs: number;
  state: GameState;
  final: boolean;
  share: number | null;
  away: string;
  home: string;
}

export interface BetWatch {
  status: string;
  tone: WatchTone;
  // (the meter, 0-100 each: the fill to where the bet stands, the tick at its line, a prop's or a total's
  // projected finish (null without a pace))
  fill: number;
  tick: number;
  proj: number | null;
  // (the captions: the left plain, the right in the tone's color)
  left: string;
  right: string;
  // (the bet's count so far (a prop's stat, a total's points), or a side's margin; null before the start)
  value: number | null;
}

// (pace is hidden this early in the game)
export const PACE_FROM = 0.1;
// (within this share of the line a shortfall is "close", gold, not red)
const CLOSE = 0.08;

const round1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number) => Math.max(0, Math.min(100, v));
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

// (a prop's count or a total's points, the line, and a pace, as a meter: the span a bit past the line, or past
// the count or the pace where they run further)
function countMeter(value: number, line: number, proj: number | null): Pick<BetWatch, 'fill' | 'tick' | 'proj'> {
  const span = Math.max(line * 1.35, value * 1.05, (proj ?? 0) * 1.05, 1);
  return { fill: clamp((value / span) * 100), tick: clamp((line / span) * 100), proj: proj === null ? null : clamp((proj / span) * 100) };
}

// (the stake and its payout: the row's sub line, "1.0u to win 0.91u"; the band and whose pick it was stay on the
// Book's own rows, not the sweat's)
export function betSub(b: Pick<PlayBet, 'stake' | 'odds'>): string {
  const win = b.odds > 0 ? (b.stake * b.odds) / 100 : (b.stake * 100) / -b.odds;
  return `${b.stake.toFixed(1)}u to win ${(Math.round(win * 100) / 100).toFixed(2)}u`;
}

// A bet's words, short, for a card row: "Under 221.5", "J. Brown o24.5 pts", "Cavaliers −4.5" (the pick as the
// wallet wrote it, a prop's player to his initial)
export function shortPick(b: Pick<PlayBet, 'pick' | 'market' | 'player' | 'side' | 'line' | 'statLabel'>): string {
  if (b.market === 'prop' && b.player) {
    const [first, ...rest] = b.player.split(' ');
    const name = rest.length ? `${first[0]}. ${rest.join(' ')}` : first;
    return `${name} ${b.side === 'under' ? 'u' : 'o'}${b.line ?? ''}${b.statLabel ? ` ${b.statLabel}` : ''}`;
  }
  return b.pick.replace(/^(.*?) -(\d)/, '$1 −$2');
}

export function betWatch(bet: PlayBet, game: GameRead | null, propNow: number | null | undefined, now = Date.now()): BetWatch {
  const d = asDeskBet(bet);
  const line = bet.line ?? 0;
  // (not started: pending, the meter empty)
  if (!game || game.state === 'pre') {
    const start = new Date(bet.start);
    const when = Number.isNaN(start.getTime()) ? '' : start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return { status: 'PENDING', tone: 'wait', fill: 0, tick: bet.market === 'spread' || bet.market === 'ml' ? 50 : 74, proj: null, left: when ? `Tips off at ${when}` : 'Not started', right: Date.parse(bet.start) > now ? 'Locked in' : '', value: null };
  }
  const board = { hs: game.hs, as: game.as, final: game.final, state: game.state };
  const share = game.share;
  const paced = share !== null && share >= PACE_FROM && share < 1;
  const decided = provisional(d, board, bet.market === 'prop' ? propNow : null);
  if (bet.market === 'spread' || bet.market === 'ml') return sideWatch(d, bet, game, decided);
  if (bet.market === 'total') {
    const pts = game.as + game.hs;
    const unit = UNIT_WORDS[bet.sport] ?? 'pts';
    const proj = paced ? pts / share! : null;
    const m = countMeter(pts, line, proj);
    if (decided) return { ...m, ...finalWords(decided.status), left: `${pts} ${unit}`, right: decided.status === 'won' ? (bet.side === 'over' ? `Over by ${fmt(round1(pts - line))}` : `Under by ${fmt(round1(line - pts))}`) : bet.side === 'over' ? 'Fell short' : `Over by ${fmt(round1(pts - line))}`, value: pts };
    if (proj === null) return { ...m, status: pts > line ? 'OVER' : 'EARLY', tone: 'close', left: `${pts} ${unit} so far`, right: '', value: pts };
    return { ...m, ...paceWords(bet.side === 'over', pts, line, proj, unit), value: pts };
  }
  // (a prop: his count so far (0 once his game's on and he isn't in the box score yet))
  const count = propNow ?? 0;
  const unit = bet.statLabel ?? '';
  const proj = paced ? count / share! : null;
  const m = countMeter(count, line, proj);
  const of = unit ? ` ${unit}` : '';
  if (decided) {
    return { ...m, ...finalWords(decided.status), left: `${fmt(count)}${of}`, right: decided.status === 'won' ? (bet.side === 'over' ? `Over by ${fmt(round1(count - line))}` : `${fmt(round1(line - count))} to spare`) : bet.side === 'over' ? `Needed ${fmt(round1(line - count))} more` : `Over by ${fmt(round1(count - line))}`, value: count };
  }
  if (proj === null) return { ...m, status: 'EARLY', tone: 'close', left: `${fmt(count)}${of} so far`, right: '', value: count };
  return { ...m, ...paceWords(bet.side === 'over', count, line, proj, unit), value: count };
}

// (a side at the score: covering or leading, level, or down; the meter a margin scale with the needed margin
// ticked (a spread's line, a moneyline's 0), the fill from the scale's low end to the margin)
function sideWatch(d: ModelBet, bet: PlayBet, game: GameRead, decided: ReturnType<typeof provisional>): BetWatch {
  const edge = gameEdge(d, { hs: game.hs, as: game.as, final: game.final, state: game.state });
  const margin = (bet.side === 'home' ? 1 : -1) * (game.hs - game.as);
  const need = bet.market === 'spread' ? -(bet.line ?? 0) : 0;
  const reach = Math.max(15, Math.abs(margin) + 2, Math.abs(need) + 2);
  const meter = { fill: clamp(((margin + reach) / (2 * reach)) * 100), tick: clamp(((need + reach) / (2 * reach)) * 100), proj: null };
  const team = bet.side === 'home' ? game.home : game.away;
  const standing = margin > 0 ? `${team} up ${fmt(margin)}` : margin < 0 ? `${team} down ${fmt(-margin)}` : `${team} level`;
  if (decided) return { ...meter, ...finalWords(decided.status), left: standing, right: edge > 0 ? (bet.market === 'spread' ? `Covered by ${fmt(edge)}` : `Won by ${fmt(edge)}`) : edge < 0 ? (bet.market === 'spread' ? `Short by ${fmt(-edge)}` : `Lost by ${fmt(-edge)}`) : 'Push', value: margin };
  if (edge > 0) return { ...meter, status: 'WINNING', tone: 'good', left: standing, right: bet.market === 'spread' ? `Covering by ${fmt(edge)}` : `Leading by ${fmt(edge)}`, value: margin };
  if (edge < 0) return { ...meter, status: `DOWN ${fmt(-edge)}`, tone: Math.abs(edge) <= (bet.sport === 'nhl' || bet.sport === 'mlb' ? 1 : 3) ? 'close' : 'bad', left: standing, right: `Needs a ${fmt(Math.ceil(-edge))}-${bet.sport === 'nhl' ? 'goal' : bet.sport === 'mlb' ? 'run' : 'pt'} swing`, value: margin };
  return { ...meter, status: 'LEVEL', tone: 'close', left: standing, right: bet.market === 'spread' ? 'On the number' : 'Tied', value: margin };
}

// (a count against its line with a pace, each fact said once: the status the verdict (WINNING, or BEHIND, gold
// when close), the left caption where it stands (the count and what it needs, or what it has to spare), the right
// the pace, the one place it's named)
function paceWords(over: boolean, count: number, line: number, proj: number, unit: string): Pick<BetWatch, 'status' | 'tone' | 'left' | 'right'> {
  const of = unit ? ` ${unit}` : '';
  const right = `On pace for ${Math.round(proj)}`;
  if (over) {
    // (what it needs, whole: points, shots and yards come in ones)
    const left = `${fmt(count)}${of} · needs ${Math.ceil(round1(line - count))} more`;
    if (proj >= line) return { status: 'WINNING', tone: 'good', left, right };
    return { status: 'BEHIND', tone: line - proj <= line * CLOSE ? 'close' : 'bad', left, right };
  }
  const left = `${fmt(count)}${of} · ${fmt(round1(line - count))} to spare`;
  if (proj <= line) return { status: 'WINNING', tone: 'good', left, right };
  return { status: 'BEHIND', tone: proj - line <= line * CLOSE ? 'close' : 'bad', left, right };
}

function finalWords(status: 'won' | 'lost' | 'push'): Pick<BetWatch, 'status' | 'tone'> {
  return status === 'won' ? { status: 'WON', tone: 'good' } : status === 'lost' ? { status: 'LOST', tone: 'bad' } : { status: 'PUSH', tone: 'close' };
}

// The sweat summary over the user's bets on the games under way: how many are winning (good), close (close or
// waiting on a clock), and losing (bad)
export function sweatOf(watches: BetWatch[]): { winning: number; close: number; losing: number } {
  const out = { winning: 0, close: 0, losing: 0 };
  for (const w of watches) {
    if (w.tone === 'good') out.winning++;
    else if (w.tone === 'bad') out.losing++;
    else out.close++;
  }
  return out;
}

// ("N of M on track": the Your Bets panel's header)
export const onTrackWords = (watches: BetWatch[]): string => (watches.length ? `${watches.filter((w) => w.tone === 'good').length} of ${watches.length} on track` : 'None');
