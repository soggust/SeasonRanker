// The Book's recent form card: the user's last seven days from the settler's tally the wallet already holds
// (tallies/{uid}: each game day's [won, lost, push, staked, profit], US Eastern days), their streak and their last
// five settled bets from the settled history where the page has it (loaded once the wallet or Cashed asked for it:
// never fetched for this). The bot's recent form isn't on the page (picks.json carries its season by band alone),
// so the card is the user's. No Angular here (tested under Node: tests/bets-recent-form.test.mjs)
import { PlayBet, TallyDoc, etDay } from '../account/wallet/wallet-math';

export interface FormBet {
  // (W, L or P: a win, a loss, a push; a void bet is left out)
  res: 'W' | 'L' | 'P';
  pick: string;
  game: string;
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
