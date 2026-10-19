// The grid's Score column (the owner's spec, 2026-10-19): a row's score to one place over a bar. The score is the
// list's own (TabRanker.scores: each stat's standard score times its slider, summed), so it isn't on a 0-100
// scale: it runs from below 0 to the top row's, around 20 for the NFL's QBs. The bar is the score over the best
// in the list (score / maxScore), a score at or under 0 an empty track. The meter's value is the bar's share,
// 0 to 100 as its aria-valuemin / aria-valuemax say (a raw score can be negative, under the meter's 0); its
// label reads the score itself.

export interface ScoreBar {
  // (the score as the cell shows it: one place, a true minus)
  text: string;
  // (the fill's width, a percentage of the track, 0-100)
  pct: number;
  // (aria-valuenow: the bar's share, to one place)
  now: number;
  // (aria-label)
  label: string;
}

// (one place, −0.0 read as 0.0)
export function scoreOneDecimal(score: number): string {
  return (Number(score.toFixed(1)) + 0).toFixed(1).replace('-', '−');
}

// The bar's width: score / maxScore as a percentage, held to the track (0 when the best isn't above 0)
export function scoreBarPct(score: number, maxScore: number): number {
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) return 0;
  return Math.min(100, Math.max(0, (score / maxScore) * 100));
}

export function scoreBar(score: number, maxScore: number): ScoreBar {
  const pct = scoreBarPct(score, maxScore);
  const text = scoreOneDecimal(score);
  return { text, pct, now: Number(pct.toFixed(1)), label: `Score ${text}` };
}

// The best score in the list (the bar's 100%)
export function maxScoreOf(totals: Iterable<number>): number {
  let max = -Infinity;
  for (const t of totals) if (Number.isFinite(t) && t > max) max = t;
  return max;
}
