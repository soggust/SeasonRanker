// The Book's recent form card: the user's last seven days from the settler's tally the wallet already holds
// (tallies/{uid}: each game day's [won, lost, push, staked, profit], US Eastern days), their streak and their last
// five settled bets from the settled history where the page has it (loaded once the wallet or Cashed asked for it:
// never fetched for this). The bot's (botForm, the card's The Bot side) from the recent block each sport's
// picks.json carries (libs/ranker/scripts/model/picks.mjs recentOf), the files the page already reads, joined
// across the sports. No Angular here (tested under Node: tests/book-recent-form.test.mjs)
import { PlayBet, TallyDoc, etDay } from '../account/wallet/wallet-math';
import { PlayerRef, betPlayer } from '../player-link';
import { compactRecord, recordTip } from './bet-format';
import { DateRange, inRange } from './date-range';
import { matchupName } from './game-menu';

export interface FormBet {
  // (W, L or P: a win, a loss, a push; a void bet is left out)
  res: 'W' | 'L' | 'P';
  pick: string;
  game: string;
  // (a prop's player, a fight's fighter: his name links his card, player-link.ts; else none)
  who: PlayerRef | null;
  // ("+0.91u", "−1.00u", "0.00u")
  units: string;
}

export interface RecentForm {
  // ("6–3", with pushes "6–3–1"; compact from 1,000: "6.2k–2.2k", bet-format.ts compactRecord)
  record: string;
  // (the exact record on hover, where the compact one shortened it)
  recordFull?: string;
  // ("+4.2u")
  units: string;
  up: boolean;
  // ("W3", "L2"; "–" without a settled bet on hand to count from)
  streak: string;
  last: FormBet[];
  // (the bot's practice picks' week apart from its record ("3–2 · +0.45u"), where it has any: picks.mjs recentOf)
  practice?: string;
}

// One sport's recent block in its picks.json (picks.mjs recentOf): its graded placed bets' last seven US Eastern
// days ([won, lost, push, staked, profit] a day, the tally's shape), the week as written, the streak with the
// settled times of its bets (newest first) and of the bet that broke it, and its last five settled bets
export interface BotRecentBet {
  sport: string;
  pick: string;
  matchup: string;
  market: string;
  player: string | null;
  res: 'W' | 'L' | 'P';
  units: number;
  at: string;
}
export interface BotRecent {
  days: Record<string, number[]>;
  week?: { won: number; lost: number; push: number; profit: number };
  // (its practice picks' week, apart from the record (desk.mjs PRACTICE_SPLIT), where it has any)
  practice?: { won: number; lost: number; push: number; profit: number };
  streak: string | null;
  streakAt: string[];
  brokeAt: string | null;
  last: BotRecentBet[];
}

// (the bot's settled bets' one order, the list's and the streak's: newest first, a tie by pick)
const formOrder = (a: BotRecentBet, b: BotRecentBet): number => b.at.localeCompare(a.at) || a.pick.localeCompare(b.pick);

// (the exact record, only where the compact one shortened it)
const fullOf = (r: { won: number; lost: number; push: number }): { recordFull?: string } => {
  const tip = recordTip(r);
  return tip ? { recordFull: tip } : {};
};

const unitsText = (v: number): string => (v === 0 ? '0.00u' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}u`);

// (the user's form: none without a tally, or with no bet settled in the window and none on hand. The window: the
// last seven days (the Book's form card), or a date range (the Cashed bar's, its dropdown's: All Time the
// tally's lifetime record, the same one the wallet's tiles read; a range's days by the tally's game days, each
// day's date read on the local calendar as the range is))
export function recentForm(tally: TallyDoc | null, settled: readonly PlayBet[], now: number | Date = Date.now(), range: DateRange | 'week' = 'week'): RecentForm | null {
  if (!tally) return null;
  const t = typeof now === 'number' ? now : now.getTime();
  let won = 0;
  let lost = 0;
  let push = 0;
  let profit = 0;
  const add = (day: readonly number[] | undefined) => {
    if (!day) return;
    won += day[0] ?? 0;
    lost += day[1] ?? 0;
    push += day[2] ?? 0;
    profit += day[4] ?? 0;
  };
  if (range === 'all') add([tally.all.won, tally.all.lost, tally.all.push, tally.all.staked, tally.all.profit]);
  else if (range === 'week') for (let i = 0; i < 7; i++) add(tally.days[etDay(t - i * 864e5)]);
  else
    for (const [key, day] of Object.entries(tally.days)) {
      const [y, m, d] = key.split('-').map(Number);
      if (inRange(range, new Date(y, m - 1, d, 12), new Date(t))) add(day);
    }
  // (the settled bets, the latest settled first, pushes and voids aside for the streak)
  const graded = [...settled].filter((b) => b.status !== 'open').sort((a, b) => (b.settledAt ?? b.start).localeCompare(a.settledAt ?? a.start));
  let streak = '–';
  const decided = graded.filter((b) => b.status === 'won' || b.status === 'lost');
  if (decided.length) {
    let n = 0;
    while (n < decided.length && decided[n].status === decided[0].status) n++;
    streak = `${decided[0].status === 'won' ? 'W' : 'L'}${n}`;
  }
  const last: FormBet[] = graded
    .filter((b) => b.status !== 'void')
    .slice(0, 5)
    .map((b) => ({
      res: b.status === 'won' ? 'W' : b.status === 'lost' ? 'L' : 'P',
      pick: b.kind === 'parlay' ? `${b.legs?.length ?? 0}-leg parlay` : b.pick,
      game: b.kind === 'parlay' ? 'Parlay' : `${b.sport.toUpperCase()} · ${matchupName(b.sport, b.matchup)}`,
      who: b.kind === 'parlay' ? null : betPlayer(b),
      units: unitsText(b.status === 'won' ? (b.profit ?? 0) : b.status === 'lost' ? -b.stake : 0),
    }));
  if (!(won + lost + push) && !last.length) return null;
  return {
    record: compactRecord({ won, lost, push }),
    ...fullOf({ won, lost, push }),
    units: unitsText(Math.round(profit * 100) / 100),
    up: profit >= 0,
    streak,
    last,
  };
}

// The You side from the wallet's state as the Book has it: none signed out or before the wallet's looked for; the
// tally's week, and the newest settled from whichever the wallet holds, a page of the history or the newest few
// (wallet.service recentSettled, read for the Book), the two together where both are on hand, each bet once
export interface WalletForm {
  signedIn: boolean;
  loaded: boolean;
  tally: TallyDoc | null;
  settled: readonly PlayBet[];
  recent: readonly PlayBet[];
}
export function yourForm(w: WalletForm, now: number | Date = Date.now()): RecentForm | null {
  if (!w.signedIn || !w.loaded) return null;
  const seen = new Set<string>();
  const bets = [...w.settled, ...w.recent].filter((b) => !seen.has(b.id) && !!seen.add(b.id));
  return recentForm(w.tally, bets, now);
}

// The bot's form across the sports (the card's The Bot side): each sport's recent block summed over the same
// seven Eastern days as the user's (against the page's clock, so an hour-old file's week is still this week), the
// streaks joined (the newest decided bet's result, counted back through every sport's run of it to the newest bet
// of the other result anywhere), the newest five settled across the sports; none with nothing on hand
export function botForm(blocks: readonly (BotRecent | null | undefined)[], now: number | Date = Date.now()): RecentForm | null {
  const t = typeof now === 'number' ? now : now.getTime();
  const list = blocks.filter((b): b is BotRecent => !!b && typeof b === 'object');
  let won = 0;
  let lost = 0;
  let push = 0;
  let profit = 0;
  const week = new Set(Array.from({ length: 7 }, (_, i) => etDay(t - i * 864e5)));
  for (const b of list)
    for (const [key, day] of Object.entries(b.days ?? {})) {
      if (!week.has(key) || !Array.isArray(day)) continue;
      won += day[0] ?? 0;
      lost += day[1] ?? 0;
      push += day[2] ?? 0;
      profit += day[4] ?? 0;
    }
  // (the newest settled across the sports, in the one order the list and the streak share: newest first, bets
  // settled at the same moment by pick, so the streak always starts at the list's first bet: the owner's note,
  // 2026-10-19, an "L0" over a list led by a loss when a win and a loss settled together)
  const merged = list.flatMap((b) => b.last ?? []).sort(formOrder);
  // (the streak: the run from the list's first decided bet, pushes skipped; a run that reaches past the bets on
  // hand is counted on from the sports' own runs (cut at the newest bet of the other result in any sport), never
  // under the run the list shows)
  let streak = '–';
  const shown = merged.filter((b) => b.res !== 'P');
  if (shown.length) {
    const res = shown[0].res;
    let seen = 0;
    while (seen < shown.length && shown[seen].res === res) seen++;
    let n = seen;
    if (seen === shown.length) {
      const runs = list.filter((b) => /^[WL]\d+$/.test(b.streak ?? '') && b.streakAt?.length);
      let cut = '';
      for (const b of runs) {
        const other = b.streak![0] === res ? b.brokeAt : b.streakAt[0];
        if (other && other > cut) cut = other;
      }
      n = Math.max(seen, runs.filter((b) => b.streak![0] === res).reduce((sum, b) => sum + b.streakAt.filter((at) => at > cut).length, 0));
    }
    streak = `${res}${n}`;
  } else {
    const runs = list.filter((b) => /^[WL]\d+$/.test(b.streak ?? '') && b.streakAt?.length);
    if (runs.length) {
      const lead = runs.reduce((a, b) => (b.streakAt[0] > a.streakAt[0] ? b : a));
      streak = `${lead.streak![0]}${Math.max(1, lead.streakAt.length)}`;
    }
  }
  const last: FormBet[] = merged
    .slice(0, 5)
    .map((b) => ({
      res: b.res,
      pick: b.pick,
      game: `${b.sport.toUpperCase()} · ${matchupName(b.sport, b.matchup)}`,
      who: betPlayer({ sport: b.sport, market: b.market, player: b.player, pick: b.pick }),
      units: unitsText(b.units),
    }));
  // (the practice picks' week, summed the same way: a line of its own)
  const pr = { won: 0, lost: 0, push: 0, profit: 0 };
  for (const b of list) for (const k of ['won', 'lost', 'push', 'profit'] as const) pr[k] += b.practice?.[k] ?? 0;
  const practice = pr.won + pr.lost + pr.push ? `${compactRecord(pr)} · ${unitsText(Math.round(pr.profit * 100) / 100)}` : null;
  if (!(won + lost + push) && !last.length && !practice) return null;
  profit = Math.round(profit * 100) / 100;
  return { record: compactRecord({ won, lost, push }), ...fullOf({ won, lost, push }), units: unitsText(profit), up: profit >= 0, streak, last, ...(practice ? { practice } : {}) };
}

// Whose form the card shows: the viewer's pick on the switch where they made one, else theirs once they have any,
// else the bot's (a user with nothing settled, or signed out); none with neither side's
export type FormSide = 'you' | 'bot';
export function formSide(chosen: FormSide | null, you: RecentForm | null, bot: RecentForm | null): FormSide | null {
  if (!you && !bot) return null;
  return chosen ?? (you ? 'you' : 'bot');
}
