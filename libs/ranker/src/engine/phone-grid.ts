import { shortTeam } from './book/live-games';

// The ranking grid on a phone (the owner's notes, 2026-10-19): at the grid's phone width (the styles' $bp-phone,
// 575px) its stat groups start collapsed (open on a desktop or tablet; a group opened or collapsed by hand stays
// as it was put), and its pinned name column reads short names so the pinned columns keep their room.
export const PHONE_GRID_QUERY = '(max-width: 575px)';

let query: MediaQueryList | null | undefined;

// Is the grid at its phone width now (false where there's no window: a test, a prerender)
export function isPhoneGrid(): boolean {
  if (query === undefined) query = typeof matchMedia === 'function' ? matchMedia(PHONE_GRID_QUERY) : null;
  return !!query?.matches;
}

// (a test swapping the width: the query read again)
export function resetPhoneGrid(): void {
  query = undefined;
}

// A group no one has touched: collapsed on a phone, open wider
export function groupsStartCollapsed(): boolean {
  return isPhoneGrid();
}

// A team's nickname for the phone's name column: "Kansas City Chiefs" -> "Chiefs", "Boston Red Sox" -> "Red Sox"
// (the Book's shortTeam); a name whose last words aren't a nickname keeps its city ("Washington Football Team"
// -> "Washington", "Utah Hockey Club" -> "Utah"), and a city alone stays
export function shortTeamName(name: string): string {
  const generic = name.trim().match(/^(.+?)\s+(Football Team|Hockey Club)$/i);
  if (generic) return generic[1];
  return shortTeam(name);
}

// (last-name particles: "Amon-Ra St. Brown" -> "A. St. Brown", "Jose De Leon" -> "J. De Leon")
const PARTICLES = new Set(['van', 'von', 'de', 'del', 'della', 'der', 'den', 'di', 'da', 'dos', 'das', 'du', 'la', 'le', 'st.', 'st', 'ter', 'ten', 'mac', 'al', 'el', 'bin', 'ibn', 'vander', 'san', 'santa']);
// (suffixes kept after the last name: "Gardner Minshew II" -> "G. Minshew II")
const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv|v|vi)$/i;
// (a first name that's already initials: "A.J. Brown", "T.J. Watt", "J.T. Miller" kept as they are)
const INITIALS = /^(\p{Lu}\.)+$/u;

// A player's short name for the phone's name column: his first initial and last name ("Tom Brady" -> "T. Brady",
// "Patrick Mahomes II" -> "P. Mahomes II", "Shai Gilgeous-Alexander" -> "S. Gilgeous-Alexander"). The last name
// runs from its first particle ("Amon-Ra St. Brown" -> "A. St. Brown"); middle names drop. One word, or nothing
// shorter, stays whole.
export function shortPlayerName(name: string): string {
  const words = name.trim().split(/\s+/);
  const suffix: string[] = [];
  while (words.length > 2 && SUFFIX.test(words[words.length - 1])) suffix.unshift(words.pop()!);
  if (words.length < 2) return name.trim();
  // (the last name: from the first particle after the first name, with a name still after it; else the last word)
  let start = words.length - 1;
  for (let i = 1; i < words.length - 1; i++) {
    if (PARTICLES.has(words[i].toLowerCase())) {
      start = i;
      break;
    }
  }
  const first = words[0];
  const initial = INITIALS.test(first) ? first : `${[...first][0]!.toUpperCase()}.`;
  const short = [initial, ...words.slice(start), ...suffix].join(' ');
  return short.length < name.trim().length ? short : name.trim();
}
