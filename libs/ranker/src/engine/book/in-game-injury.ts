// A bet's player hurt during the game, read off the live summary the game view already holds, pure
// (tests/live-tab.test.mjs): the play-by-play's words ("DAL-K.Turpin was injured during the play.", "is
// questionable to return", "has been ruled out", "has returned to the game") and ESPN's injuries list, whose
// entries dated after the kickoff are the in-game rulings (Questionable, Out). The Your Bets row and the Live
// tab's card show the tag in place of WINNING or BEHIND, orange; a later play that names him again (he's back)
// clears it. The model's postmortem reads recaps with its own patterns (scripts/model/postmortem.mjs HURT,
// EXIT); these are the play-by-play's, kept apart from the script

export type HurtStatus = 'INJURED' | 'QUESTIONABLE' | 'OUT';

// (a play as the reader needs it: its words, its participants' ESPN ids where the sport carries them, its wall
// clock (ESPN's wallclock) to order it against a ruling)
export interface HurtPlay {
  text: string;
  athletes: string[];
  at: string | null;
}

// (an injuries-list entry: ESPN's status words and the time it was posted)
export interface HurtRuling {
  athlete: string | null;
  name: string;
  status: string;
  date: string | null;
}

// (the words, strongest first: a statement's own status is the first of these it matches)
const OUT = /ruled out|will not return|won't return|did not return|is out for the (?:game|night|remainder)|out for the rest of the game/i;
const QUESTIONABLE = /questionable to return|doubtful to return|questionable for the rest/i;
const INJURED = /was injured|is injured|injured (?:on|during) the play|evaluated for (?:a )?concussion|concussion protocol|helped off|carted off|shaken up/i;
const RETURNED = /has returned|returned to the game|is back in the game|back in the game/i;
const ANY = new RegExp([OUT, QUESTIONABLE, INJURED, RETURNED].map((r) => r.source).join('|'), 'gi');

const SENTENCE_END = /(?<!(?:^|[\s(-])[A-Z])\.\s|\*\*|;\s/g;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// (the ways a play's words name him: his full name, and his first initial with his last name as the NFL's
// play-by-play writes it, "K.Turpin" or "K. Turpin" (a suffix left off: "Luther Burden III" is "L.Burden"))
export function nameForms(name: string): RegExp | null {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const core = words.length > 2 && /^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(words[words.length - 1]) ? words.slice(0, -1) : words;
  const forms = [escape(words.join(' '))];
  if (core.length > 1) forms.push(`${escape(core[0][0])}\\.\\s?${escape(core.slice(1).join(' '))}`);
  return new RegExp(`(?<![\\w.])(?:${forms.join('|')})(?![\\w])`, 'i');
}

// (each injury statement in a play's words: the status it says, and the stretch of words before it back to the
// last sentence's end, where the player it's about is named; a "returned" statement is null)
function statements(text: string): { status: HurtStatus | null; about: string }[] {
  const out: { status: HurtStatus | null; about: string }[] = [];
  for (const m of text.matchAll(ANY)) {
    const before = text.slice(0, m.index);
    // (back to the sentence's start: a period with a space after it (not an initial's, "K. Turpin"), a
    // semicolon, or ESPN's "**" notes)
    const start = Math.max(-1, ...[...before.matchAll(SENTENCE_END)].map((b) => b.index ?? -1));
    const word = m[0];
    const status: HurtStatus | null = RETURNED.test(word) ? null : OUT.test(word) ? 'OUT' : QUESTIONABLE.test(word) ? 'QUESTIONABLE' : 'INJURED';
    out.push({ status, about: text.slice(start < 0 ? 0 : start, m.index) });
  }
  return out;
}

// (a ruling's words as a status: Out, Questionable or Doubtful; anything else (Active, Probable) none)
function rulingStatus(status: string): HurtStatus | null {
  if (/^out/i.test(status)) return 'OUT';
  if (/questionable|doubtful/i.test(status)) return 'QUESTIONABLE';
  return null;
}

// His tag at this read of the game, or null (not hurt, or back). The plays in order; the rulings the injuries
// list's, those posted at or after the kickoff (an earlier one is the week's report, not the game's)
export function inGameInjury(player: { id: string | null; name: string }, plays: HurtPlay[], rulings: HurtRuling[], start: string | null): HurtStatus | null {
  const forms = nameForms(player.name);
  if (!forms && !player.id) return null;
  const kickoff = start ? Date.parse(start) : NaN;
  const key = player.name.trim().toLowerCase();
  const ruling = rulings
    .filter((r) => (player.id && r.athlete ? r.athlete === player.id : r.name.trim().toLowerCase() === key))
    .filter((r) => !Number.isNaN(kickoff) && r.date !== null && Date.parse(r.date) >= kickoff)
    .map((r) => ({ status: rulingStatus(r.status), at: Date.parse(r.date!) }))
    .filter((r): r is { status: HurtStatus; at: number } => r.status !== null)
    .sort((a, b) => a.at - b.at)
    .pop();
  let hurt: HurtStatus | null = null;
  let ruled = false;
  const names = (s: string) => !!forms && forms.test(s);
  for (const p of plays) {
    const at = p.at ? Date.parse(p.at) : NaN;
    // (the ruling, once the plays reach the time it was posted)
    if (ruling && !ruled && !Number.isNaN(at) && at >= ruling.at) {
      hurt = ruling.status;
      ruled = true;
    }
    const said = statements(p.text).filter((s) => names(s.about));
    if (said.length) {
      // (the play's last word on him: "returned" clears it, else the strongest said)
      const last = said[said.length - 1];
      hurt = last.status === null ? null : said.some((s) => s.status === 'OUT') ? 'OUT' : said.some((s) => s.status === 'QUESTIONABLE') ? 'QUESTIONABLE' : hurt === 'OUT' || hurt === 'QUESTIONABLE' ? hurt : 'INJURED';
      continue;
    }
    // (named in a later play, or among its participants: he's back)
    if (hurt !== null && (names(p.text) || (!!player.id && p.athletes.includes(player.id)))) hurt = null;
  }
  // (a ruling posted after the last play read, or with plays that carry no wall clock)
  if (ruling && !ruled) hurt = ruling.status;
  return hurt;
}
