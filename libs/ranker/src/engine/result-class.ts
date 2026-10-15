// The class a game's result wears in the styles, the same three everywhere (.won, .lost, .tied: the card's recent
// squares and History, the game log's bars and chips, the game view's last five, the rank grid's last five)

// (from a result read as W, L or T, a win, a loss or a tie: its first word, as "W OT" reads; anything else none)
const RESULT_CLASS: Record<string, string> = { W: 'won', L: 'lost', T: 'tied' };

export function resultClass(result: string | null | undefined): string {
  return RESULT_CLASS[(result ?? '').trim().split(/\s+/)[0]] ?? '';
}

// (from a recent game's score: 1 a win, 0.5 a tie, anything else a loss)
export function scoreClass(score: number | null | undefined): string {
  return score === 1 ? 'won' : score === 0.5 ? 'tied' : 'lost';
}
