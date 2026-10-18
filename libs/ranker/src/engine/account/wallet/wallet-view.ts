import { ModelBet } from '../../book/desk-model';
import { PlayBet, START, TallyDoc, americanOf, decimalOf, etDay, runBeganAt } from './wallet-math';

// The wallet page's own pictures and figures (docs/wallet-redesign/README.md), every one a client-side reading of
// what the wallet already holds: the balance as stacks of chips, the runs (each bet's run), You vs the Bot, same
// game, same bet (the settler's bot call on each settled bet), the bets tailing, fading or apart from the bot, the
// trophy case, the two tickets on the wall, the tells. Nothing here reads Firestore or changes wallet-math.ts; a
// figure the loaded history can't settle honestly says so (`partial`) or isn't drawn.
const round2 = (v: number): number => Math.round(v * 100) / 100;
const DAY = 86400e3;

// ---------------------------------------------------------------------------
// The chip rack: the balance broken into 100s, 25s, 5s, 1s and halves, greedily, at most six chips a stack
// ---------------------------------------------------------------------------
export interface ChipStack {
  denom: string;
  // (the stack's class: its clay in wallet-page.scss)
  key: string;
  count: number;
  chips: number[];
}
export interface ChipLegend {
  denom: string;
  key: string;
  count: number;
}
const DENOMS: { value: number; denom: string; key: string }[] = [
  { value: 100, denom: '100', key: 'd100' },
  { value: 25, denom: '25', key: 'd25' },
  { value: 5, denom: '5', key: 'd5' },
  { value: 1, denom: '1', key: 'd1' },
  { value: 0.5, denom: '½', key: 'dhalf' },
];
export const STACK_MAX = 6;
// (the rail holds so many stacks; the legend carries every chip)
export const RACK_MAX = 8;

export function chipStacks(balance: number): { stacks: ChipStack[]; legend: ChipLegend[] } {
  let left = Math.max(0, balance);
  const stacks: ChipStack[] = [];
  const legend: ChipLegend[] = [];
  for (const d of DENOMS) {
    let n = Math.floor(left / d.value + 1e-9);
    left = round2(left - n * d.value);
    if (!n) continue;
    legend.push({ denom: d.denom, key: d.key, count: n });
    while (n > 0) {
      const take = Math.min(n, STACK_MAX);
      stacks.push({ denom: d.denom, key: d.key, count: take, chips: Array.from({ length: take }, (_, i) => i) });
      n -= take;
    }
  }
  return { stacks: stacks.slice(0, RACK_MAX), legend };
}

// ---------------------------------------------------------------------------
// The runs: each bet's run, the balance across it as its start (the wallet's start for the current run; an
// older one 1,000 if its first bet came before 2026-10-17, else 500) plus the run's settled profit, bet by bet in the order
// settled (the dip while a stake's out isn't drawn). Every run only once the whole history's loaded; till then the
// current one, and its peak only once its bets are all here (an older run's bet among the loaded ones says so)
// ---------------------------------------------------------------------------
export interface RunCard {
  n: number;
  from: string | null;
  to: string | null;
  current: boolean;
  // (what the run began at)
  start: number;
  // (null: the run's history isn't all loaded)
  peak: number | null;
  end: number;
  bust: boolean;
  // (the sparkline's path in a 100 × 30 box)
  spark: string | null;
}

export function sparkPath(values: number[]): string {
  if (values.length < 2) return 'M0 15 L100 15';
  const mx = Math.max(...values);
  const mn = Math.min(...values);
  const span = mx - mn || 1;
  return values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * 100).toFixed(1)} ${(28 - ((v - mn) / span) * 26).toFixed(1)}`).join(' ');
}

export function runCards(settled: PlayBet[], current: number, balance: number, full: boolean, currentStart = START): RunCard[] {
  const byRun = new Map<number, PlayBet[]>();
  for (const b of settled) {
    if (b.status === 'open') continue;
    const list = byRun.get(b.run) ?? [];
    list.push(b);
    byRun.set(b.run, list);
  }
  // (the current run's bets are all here once an older run's bet is: every settled bet of a run settles after the
  // one before it was bought back)
  const currentComplete = full || settled.some((b) => b.run < current);
  const runs = full ? [...new Set([...byRun.keys(), current])].sort((a, b) => a - b) : [current];
  return runs.map((n) => {
    const list = (byRun.get(n) ?? []).slice().sort((a, b) => (a.settledAt ?? a.start).localeCompare(b.settledAt ?? b.start));
    const isCurrent = n === current;
    const placed = list.map((b) => b.placedAt).sort();
    const start = isCurrent ? currentStart : runBeganAt(placed[0]);
    const values = [start];
    let sum = start;
    for (const b of list) {
      sum = round2(sum + (b.profit ?? 0));
      values.push(sum);
    }
    const complete = isCurrent ? currentComplete : true;
    const end = isCurrent ? balance : sum;
    return {
      n: n + 1,
      from: placed[0] ?? null,
      to: isCurrent ? null : (list.map((b) => b.settledAt ?? b.start).sort().pop() ?? null),
      current: isCurrent,
      start,
      peak: complete ? Math.max(...values, isCurrent ? balance : -Infinity) : null,
      end,
      bust: !isCurrent && end <= 0,
      spark: complete ? sparkPath(isCurrent ? [...values, balance] : values) : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Heads up: you against the bot, same game, same bet, this week, over 30 days, or since your first bet. Each of
// your settled straight bets against the bot's own call on that market when you placed it (the settler's bot:
// its side with the higher Kelly score, forced where it had no bet). Opposite sides: a duel, the point to the
// side that won (a push a tie), both scored at your stake. The same side: agreed, a tie (half a point each),
// its units kept apart, yours at your stake against the bot's at its own. A parlay, a void bet, or one the
// bot's board can't say: not counted. The bot's own record stays on the Algorithm tab
// ---------------------------------------------------------------------------
export type HeadsPeriod = 'week' | 'month' | 'all';
export interface HeadsSide {
  // (duels won, and the points: a duel won 1, a tie (pushed duel or agreed bet) half)
  won: number;
  points: number;
  // (the duels' units, at your stake both)
  profit: number;
}
export interface HeadsUp {
  period: HeadsPeriod;
  from: string | null;
  you: HeadsSide;
  bot: HeadsSide;
  // (the ties: pushed duels and agreed bets)
  ties: number;
  duels: number;
  agreed: { n: number; you: number; bot: number };
  // (the last ten bets counted, oldest first: who took each)
  dots: ('you' | 'bot' | 'none')[];
}
export type BotTag = 'other' | 'same' | null;

// (a settled bet's against the bot: the other side, the same, or not counted)
export function botTag(b: Pick<PlayBet, 'kind' | 'status' | 'bot' | 'side'>): BotTag {
  if (b.kind === 'parlay' || !b.bot || b.status === 'void' || b.status === 'open') return null;
  return b.bot.side === b.side ? 'same' : 'other';
}

const toWinAt = (stake: number, odds: number): number => round2(odds > 0 ? (stake * odds) / 100 : (stake * 100) / -odds);
const dayOffset = (day: string, n: number): string => etDay(Date.parse(`${day}T12:00:00Z`) + n * DAY);

export function headsUp(settled: PlayBet[], period: HeadsPeriod, today = etDay(Date.now())): HeadsUp {
  const start = period === 'week' ? dayOffset(today, -6) : period === 'month' ? dayOffset(today, -29) : null;
  const bets = settled
    .filter((b) => botTag(b) && (!start || etDay(b.start) >= start))
    .sort((x, y) => (x.settledAt ?? x.start).localeCompare(y.settledAt ?? y.start));
  const you = { won: 0, points: 0, profit: 0 };
  const bot = { won: 0, points: 0, profit: 0 };
  const agreed = { n: 0, you: 0, bot: 0 };
  let ties = 0;
  let duels = 0;
  const dots: ('you' | 'bot' | 'none')[] = [];
  for (const b of bets) {
    const call = b.bot!;
    const mine = b.profit ?? 0;
    if (botTag(b) === 'same') {
      agreed.n++;
      agreed.you += mine;
      agreed.bot += call.profit;
      ties++;
      you.points += 0.5;
      bot.points += 0.5;
      dots.push('none');
      continue;
    }
    duels++;
    you.profit += mine;
    bot.profit += call.status === 'won' ? toWinAt(b.stake, call.price) : call.status === 'lost' ? -b.stake : 0;
    const winner = b.status === 'won' && call.status !== 'won' ? 'you' : call.status === 'won' && b.status !== 'won' ? 'bot' : null;
    if (winner === 'you') (you.won++, (you.points += 1));
    else if (winner === 'bot') (bot.won++, (bot.points += 1));
    else (ties++, (you.points += 0.5), (bot.points += 0.5));
    dots.push(winner ?? 'none');
  }
  const last = dots.slice(-10);
  const side = (t: typeof you): HeadsSide => ({ won: t.won, points: t.points, profit: round2(t.profit) });
  return {
    period,
    from: start ? `${start}T12:00:00Z` : bets[0] ? bets[0].start : null,
    you: side(you),
    bot: side(bot),
    ties,
    duels,
    agreed: { n: agreed.n, you: round2(agreed.you), bot: round2(agreed.bot) },
    dots: [...Array.from({ length: 10 - last.length }, () => 'none' as const), ...last],
  };
}

// ---------------------------------------------------------------------------
// Tailing, your own calls, fading: the settled straight bets the bot picked too, the ones it didn't, and the ones
// on the other side of a pick it published (its ledgers' bets on the same game and market)
// ---------------------------------------------------------------------------
export interface SplitRecord {
  won: number;
  lost: number;
  push: number;
  profit: number;
  bets: number;
}
export interface BotSplit {
  tail: SplitRecord;
  own: SplitRecord;
  fade: SplitRecord;
}
type FadeBet = Pick<ModelBet, 'sport' | 'event' | 'market' | 'side' | 'propType' | 'athlete'> & { published?: boolean };

const fadeKey = (b: { sport: string; event?: string; market: string; propType?: string | null; athlete?: string | number | null }): string =>
  `${b.sport}|${b.event ?? ''}|${b.market}|${b.market === 'prop' ? `${b.propType ?? ''}|${b.athlete ?? ''}` : ''}`;

export function botSplit(settled: PlayBet[], ledger: FadeBet[]): BotSplit {
  const sides = new Map<string, Set<string>>();
  for (const b of ledger) {
    if (!b.published || !b.event || !b.side) continue;
    const key = fadeKey(b);
    sides.set(key, (sides.get(key) ?? new Set()).add(b.side));
  }
  const empty = (): SplitRecord => ({ won: 0, lost: 0, push: 0, profit: 0, bets: 0 });
  const out: BotSplit = { tail: empty(), own: empty(), fade: empty() };
  for (const b of settled) {
    if (b.status === 'open' || b.status === 'void' || b.kind === 'parlay') continue;
    const bots = sides.get(fadeKey(b));
    const which = b.botPick ? out.tail : bots && !bots.has(b.side) ? out.fade : out.own;
    which[b.status]++;
    which.bets++;
    which.profit = round2(which.profit + (b.profit ?? 0));
  }
  return out;
}

// ---------------------------------------------------------------------------
// The trophy case: chips earned from the settled bets and the tally. Sharp (beating the close) isn't here: the
// bets carry no closing line
// ---------------------------------------------------------------------------
export interface Trophy {
  key: string;
  name: string;
  how: string;
  have: number;
  need: number;
  earned: boolean;
  // (the day it was earned, when the loaded history shows it)
  when: string | null;
  // (its white stroke icon: a 24 × 24 path)
  icon: string;
}
const ICONS: Record<string, string> = {
  first: 'M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z',
  heater: 'M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-6 1 1 2 2 3 2 0-2 0-4 0-6z',
  longshot: 'M3 21l7-7M14 4h6v6M20 4L10 14',
  tail: 'M4 12h12M12 6l6 6-6 6M4 6v12',
  parlay: 'M5 8h14M5 12h14M5 16h14',
  phoenix: 'M12 21c-4-3-7-6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4-3 7-7 10z',
  iron: 'M12 3v18M5 8l7-5 7 5M5 16l7 5 7-5',
};

const settledOrder = (bets: PlayBet[]): PlayBet[] => bets.filter((b) => b.status !== 'open').sort((a, b) => (a.settledAt ?? a.start).localeCompare(b.settledAt ?? b.start));
// (the week a bet was placed in: its Monday, local time)
const weekOf = (iso: string): string => {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

export function trophies(bets: PlayBet[], tally: TallyDoc | null, runs: RunCard[] | null, full: boolean): Trophy[] {
  const settled = settledOrder(bets);
  const won = settled.filter((b) => b.status === 'won');
  const make = (key: string, name: string, how: string, have: number, need: number, when: string | null = null): Trophy => ({
    key,
    name,
    how,
    have: Math.min(have, need),
    need,
    earned: have >= need,
    when: have >= need ? when : null,
    icon: ICONS[key],
  });
  // (the first ticket cashed: the tally knows there's one; the day only once the history's all here)
  const firstWon = tally ? (tally.all.won > 0 ? 1 : 0) : won.length ? 1 : 0;
  // (a heater: five wins in a row, pushes and voids between them not counted; the current streak as the progress)
  let streak = 0;
  let best = 0;
  let heaterWhen: string | null = null;
  for (const b of settled) {
    if (b.status === 'won') {
      streak++;
      if (streak >= 5 && !heaterWhen) heaterWhen = b.settledAt ?? b.start;
    } else if (b.status === 'lost') streak = 0;
    best = Math.max(best, streak);
  }
  const longshots = won.filter((b) => (b.kind === 'parlay' ? (b.paidOdds ?? b.odds) : b.odds) >= 300);
  const tails = won.filter((b) => b.botPick && b.kind !== 'parlay');
  const parlays = won.filter((b) => b.kind === 'parlay' && (b.legs ?? []).filter((l) => l.status === 'won').length >= 3);
  // (a phoenix: a run busted, the one after it finished above where it began)
  let phoenix = 0;
  let phoenixWhen: string | null = null;
  if (runs) {
    for (let i = 0; i < runs.length; i++) {
      if (!runs[i].bust) continue;
      phoenix = Math.max(phoenix, 1);
      const next = runs[i + 1];
      if (next && !next.current && next.end > next.start) {
        phoenix = 2;
        phoenixWhen = next.to;
        break;
      }
    }
  }
  const weeks = new Map<string, number>();
  for (const b of bets) weeks.set(weekOf(b.placedAt), (weeks.get(weekOf(b.placedAt)) ?? 0) + 1);
  const busiest = [...weeks.entries()].sort((a, b) => b[1] - a[1])[0];
  return [
    make('first', 'First Blood', 'Cash your first ticket.', firstWon, 1, full ? (won[0]?.settledAt ?? null) : null),
    make('heater', 'Heater', 'Win 5 tickets in a row.', best >= 5 ? 5 : streak, 5, heaterWhen),
    make('longshot', 'Longshot', 'Cash a ticket at +300 or longer.', longshots.length, 1, longshots[0]?.settledAt ?? null),
    make('tail', 'Tailgater', 'Win 20 bets the bot picked.', tails.length, 20, tails[19]?.settledAt ?? null),
    make('parlay', 'Parlay Prince', 'Cash a parlay of 3 legs or more.', parlays.length, 1, parlays[0]?.settledAt ?? null),
    make('phoenix', 'Phoenix', 'Bust a run, then finish the next one up.', phoenix, 2, phoenixWhen),
    make('iron', 'Iron Stomach', 'Place 50 bets in a single week.', busiest?.[1] ?? 0, 50, busiest && busiest[1] >= 50 ? busiest[0] : null),
  ];
}

// ---------------------------------------------------------------------------
// On the wall: the biggest cash, and the worst beat (the lost parlay with the most legs hit, else the largest
// stake lost)
// ---------------------------------------------------------------------------
export interface WallPick {
  bet: PlayBet;
  // (a lost parlay: how many legs had hit)
  hits: number | null;
}
export function wallPicks(bets: PlayBet[]): { biggest: WallPick | null; worst: WallPick | null } {
  const won = bets.filter((b) => b.status === 'won' && (b.profit ?? 0) > 0).sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0));
  const lost = bets.filter((b) => b.status === 'lost');
  const hitsOf = (b: PlayBet) => (b.legs ?? []).filter((l) => l.status === 'won').length;
  const parlays = lost.filter((b) => b.kind === 'parlay' && hitsOf(b) > 0).sort((a, b) => hitsOf(b) - hitsOf(a) || b.stake - a.stake);
  const worst = parlays[0] ? { bet: parlays[0], hits: hitsOf(parlays[0]) } : lost.length ? { bet: lost.slice().sort((a, b) => b.stake - a.stake)[0], hits: null } : null;
  return { biggest: won[0] ? { bet: won[0], hits: null } : null, worst };
}

// ---------------------------------------------------------------------------
// Your tells: habits read off the loaded bets
// ---------------------------------------------------------------------------
export interface Tell {
  key: string;
  value: string;
  tone: 'plain' | 'good' | 'bad';
}
const MARKETS: Record<string, string> = { spread: 'Spreads', total: 'Totals', ml: 'Moneylines', prop: 'Props', parlay: 'Parlays' };
const unitsText = (v: number): string => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}u`;
const stakeText = (v: number): string => `${v.toFixed(1)}u`;

export function tells(bets: PlayBet[]): Tell[] {
  if (!bets.length) return [];
  const out: Tell[] = [];
  // (the favourite sport: a parlay's legs each count for theirs)
  const sports = new Map<string, number>();
  let legs = 0;
  for (const b of bets) {
    for (const l of b.kind === 'parlay' ? (b.legs ?? []) : [b]) {
      sports.set(l.sport, (sports.get(l.sport) ?? 0) + 1);
      legs++;
    }
  }
  const fav = [...sports.entries()].sort((a, b) => b[1] - a[1])[0];
  if (fav && legs) out.push({ key: 'Favourite sport', value: `${fav[0].toUpperCase()} · ${Math.round((100 * fav[1]) / legs)}% of your bets`, tone: 'plain' });
  // (the markets by units, the settled bets')
  const markets = new Map<string, number>();
  for (const b of bets) {
    if (b.status === 'open' || b.status === 'void') continue;
    markets.set(b.market, round2((markets.get(b.market) ?? 0) + (b.profit ?? 0)));
  }
  const ranked = [...markets.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length) {
    const [bm, bu] = ranked[0];
    out.push({ key: 'Best market', value: `${MARKETS[bm] ?? bm} · ${unitsText(bu)}`, tone: bu > 0 ? 'good' : bu < 0 ? 'bad' : 'plain' });
    if (ranked.length > 1) {
      const [wm, wu] = ranked[ranked.length - 1];
      out.push({ key: 'Worst market', value: `${MARKETS[wm] ?? wm} · ${unitsText(wu)}`, tone: wu < 0 ? 'bad' : wu > 0 ? 'good' : 'plain' });
    }
  }
  // (the typical stake: the one most often placed)
  const stakes = new Map<number, number>();
  for (const b of bets) stakes.set(b.stake, (stakes.get(b.stake) ?? 0) + 1);
  const mode = [...stakes.entries()].sort((a, b) => b[1] - a[1])[0];
  if (mode) out.push({ key: 'Typical stake', value: `${stakeText(mode[0])} · ${Math.round((100 * mode[1]) / bets.length)}% of bets`, tone: 'plain' });
  // (the average price: the mean of the decimal odds, said in American)
  const dec = bets.reduce((t, b) => t + decimalOf(b.kind === 'parlay' ? (b.paidOdds ?? b.odds) : b.odds), 0) / bets.length;
  const avg = americanOf(dec);
  out.push({ key: 'Average price', value: avg > 0 ? `+${avg}` : String(avg), tone: 'plain' });
  // (the late ones: placed from 10 PM to 4 AM, your clock)
  const late = bets.filter((b) => {
    const h = new Date(b.placedAt).getHours();
    return (h >= 22 || h < 4) && b.status !== 'open' && b.status !== 'void';
  });
  if (late.length) {
    const won = late.filter((b) => b.status === 'won').length;
    const lost = late.filter((b) => b.status === 'lost').length;
    const profit = round2(late.reduce((t, b) => t + (b.profit ?? 0), 0));
    out.push({ key: 'Bets placed after 10 PM', value: `${won}–${lost} · ${unitsText(profit)}`, tone: profit > 0 ? 'good' : profit < 0 ? 'bad' : 'plain' });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The wallet's panels, open or shut: three open from the start (your chips, the rebuy and its runs, the profit
// curve), every other one shut until opened (the owner's note, 2026-10-17). A tap turns one the other way; the
// choice isn't kept past the page, as the site's other panels don't keep theirs
// ---------------------------------------------------------------------------
export type WalletPanel = 'chips' | 'rebuy' | 'curve' | 'heads' | 'rollers' | 'trophies' | 'tells' | 'open' | 'settled';
export const WALLET_PANELS: readonly WalletPanel[] = ['chips', 'rebuy', 'curve', 'heads', 'rollers', 'trophies', 'tells', 'open', 'settled'];
export const WALLET_OPEN: readonly WalletPanel[] = ['chips', 'rebuy', 'curve'];
// (open: open from the start, unless turned shut; shut from the start, unless turned open)
export const panelOpen = (panel: WalletPanel, flipped: ReadonlySet<string> = new Set()): boolean =>
  WALLET_OPEN.includes(panel) !== flipped.has(panel);
