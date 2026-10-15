// A bet's pick dressed up, the same on the Algorithm desk and the Bets page: its one word that says what the bet
// is (a prop's or a total's over or under, a side's line or ML), in its team's color (team-look.ts accentSafe:
// never a green or a red, they're the meters' won and lost; light enough to read on the rows)
import { teamLook } from '../team-look';

// A pick's color: a prop its player's team's (by his team's ESPN id), a side the team it took's (by its
// abbreviation); a total, no one's (null: the board's light, as with no team known)
export function pickTeamColor(sport: string, pick: { total: boolean; teamId?: string | null; abbr?: string | null }): string | null {
  if (pick.total || (!pick.teamId && !pick.abbr)) return null;
  const look = teamLook(sport, pick.teamId ? { id: pick.teamId } : { abbr: pick.abbr });
  return look.key ? look.accentSafe : null;
}

// A pick split round that word: [before, the word, after]. A prop's text is what follows the player's name
// ("Under 7.5 Carries"); a total's its over or under first; a side's its line or ML last ("MIN +1.5")
export function splitPick(text: string, wordFirst: boolean): [string, string, string] {
  if (wordFirst) {
    const at = text.indexOf(' ');
    return at < 0 ? ['', text, ''] : ['', text.slice(0, at), text.slice(at)];
  }
  const at = text.lastIndexOf(' ');
  return at < 0 ? ['', text, ''] : [text.slice(0, at + 1), text.slice(at + 1), ''];
}
