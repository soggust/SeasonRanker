// The Book's recent form card: the user's last seven days from the settler's tally the wallet already holds
// (tallies/{uid}: each game day's [won, lost, push, staked, profit], US Eastern days), their streak and their last
// five settled bets from the settled history where the page has it (loaded once the wallet or Cashed asked for it:
// never fetched for this). The bot's (botForm, the card's The Bot side) from the recent block each sport's
// picks.json carries (libs/ranker/scripts/model/picks.mjs recentOf), the files the page already reads, joined
// across the sports. No Angular here (tested under Node: tests/book-recent-form.test.mjs)
import { PlayBet, TallyDoc, etDay } from '../account/wallet/wallet-math';
import { PlayerRef, betPlayer } from '../player-link';

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
  // ("6–3", with pushes "6–3–1")
  record: string;
  // ("+4.2u")
  units: string;
  up: boolean;
  // ("W3", "L2"; "–" without a settled bet on hand to count from)
  streak: string;
  last: FormBet[];
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
  streak: string | null;
  streakAt: string[];
  brokeAt: string | null;
  last: BotRecentBet[];
}

const unitsText = (v: number): string => (v === 0 ? '0.00u' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}u`);

// (the user's form: none without a tally, or with no bet settled in the last seven days and none on hand)
export function recentForm(tally: TallyDoc | null, settled: readonly PlayBet[], now: number | Date = Date.now()): RecentForm | null {
  if (!tally) return null;
  const t = typeof now === 'number' ? now : now.getTime();
  let won = 0;
  let lost = 0;
  let push = 0;
  let profit = 0;
  for (let i = 0; i < 7; i++) {
    const day = tally.days[etDay(t - i * 864e5)];
    if (!day) continue;
    won += day[0];
    lost += day[1];
    push += day[2];
    profit += day[4];
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
      game: b.kind === 'parlay' ? 'Parlay' : `${b.sport.toUpperCase()} · ${b.matchup}`,
      who: b.kind === 'parlay' ? null : betPlayer(b),
      units: unitsText(b.status === 'won' ? (b.profit ?? 0) : b.status === 'lost' ? -b.stake : 0),
    }));
  if (!(won + lost + push) && !last.length) return null;
  return {
    record: `${won}–${lost}${push ? `–${push}` : ''}`,
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
  // (the streak: its result the newest decided bet's; cut at the newest bet of the other result in any sport)
  const runs = list.filter((b) => /^[WL]\d+$/.test(b.streak ?? '') && b.streakAt?.length);
  let streak = '–';
  if (runs.length) {
    const lead = runs.reduce((a, b) => (b.streakAt[0] > a.streakAt[0] ? b : a));
    const res = lead.streak![0];
    let cut = '';
    for (const b of runs) {
      const other = b.streak![0] === res ? b.brokeAt : b.streakAt[0];
      if (other && other > cut) cut = other;
    }
    const n = runs.filter((b) => b.streak![0] === res).reduce((sum, b) => sum + b.streakAt.filter((at) => at > cut).length, 0);
    streak = `${res}${n}`;
  }
  const last: FormBet[] = list
    .flatMap((b) => b.last ?? [])
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 5)
    .map((b) => ({
      res: b.res,
      pick: b.pick,
      game: `${b.sport.toUpperCase()} · ${b.matchup}`,
      who: betPlayer({ sport: b.sport, market: b.market, player: b.player, pick: b.pick }),
      units: unitsText(b.units),
    }));
  if (!(won + lost + push) && !last.length) return null;
  profit = Math.round(profit * 100) / 100;
  return { record: `${won}–${lost}${push ? `–${push}` : ''}`, units: unitsText(profit), up: profit >= 0, streak, last };
}

// Whose form the card shows: the viewer's pick on the switch where they made one, else theirs once they have any,
// else the bot's (a user with nothing settled, or signed out); none with neither side's
export type FormSide = 'you' | 'bot';
export function formSide(chosen: FormSide | null, you: RecentForm | null, bot: RecentForm | null): FormSide | null {
  if (!you && !bot) return null;
  return chosen ?? (you ? 'you' : 'bot');
}
