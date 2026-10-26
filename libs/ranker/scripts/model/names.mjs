// A book's player name matched to one of a game's players (the props' history, gate.mjs; the live board's prices,
// props.mjs withApiPrices). The books and the box scores spell names their own ways: "Nicolas Claxton" for ESPN's
// "Nic Claxton", "Mitchell Marner" for "Mitch Marner", "Kiké Hernandez" for StatsAPI's "Enrique Hernández", a
// team or a year after the name where two players share it ("Lamar Jackson (BAL)", "Elias Pettersson (2004)").
// Matched by one game's players only (both sides), in order, the first step with one candidate winning:
//   1. the name's key (espn.mjs nameKey: accents, punctuation and suffixes off), a "(TEAM)" note stripped
//   2. the first name as its nickname group (NICK below: Nic, Nick, Nicolas and Nicholas one) with the surname's key
//   3. the surname's key with the first names alike: one the start of the other, three letters at least ("Cal" and
//      "Calvin"), or one the other's initials ("JJ" and "John-Jason")
// Never a guess: a step with two candidates (the two Sebastian Ahos in one game, Moritz and Franz Wagner by the
// surname) matches no one; a name with a note that isn't a team ("(2004)": the book telling two players of one
// name apart) is never matched by its key to the plain name it was told apart from; a name some other player of
// the sport has exactly (known: every player's key) is that player, never a teammate's nickname (Markieff Morris
// out, never Marcus); and each player takes one book name (matchNames: the exact one first, a second dropped).
import { nameKey } from './espn.mjs';

// (first names' nickname groups: a name may sit in more than one ("mo": Mohamed and Moritz))
const GROUPS = [
  ['nicholas', 'nicolas', 'nic', 'nick', 'nicky', 'nico'],
  ['carlton', 'bub'],
  ['herbert', 'herb'],
  ['ronald', 'ron', 'ronnie'],
  ['cameron', 'cam'],
  ['vincent', 'vince', 'vinny'],
  ['moritz', 'moe', 'mo'],
  ['mohamed', 'mohammed', 'mo'],
  ['alexander', 'alexandre', 'alexandr', 'aleksander', 'alexandar', 'alex'],
  ['yegor', 'egor'],
  ['mitchell', 'mitch'],
  ['matthew', 'mathew', 'matt', 'matty'],
  ['kenneth', 'kenny', 'ken'],
  ['joshua', 'josh'],
  ['enrique', 'kike'],
  ['michael', 'mike', 'mikey'],
  ['christopher', 'chris'],
  ['thomas', 'tom', 'tommy'],
  ['william', 'will', 'bill', 'billy', 'willy'],
  ['robert', 'rob', 'robbie', 'bob', 'bobby'],
  ['joseph', 'joe', 'joey'],
  ['daniel', 'dan', 'danny'],
  ['anthony', 'tony'],
  ['benjamin', 'ben'],
  ['zachary', 'zach', 'zack', 'zac'],
  ['jacob', 'jake'],
  ['samuel', 'sam', 'sammy'],
  ['jonathan', 'jon'],
  ['nathaniel', 'nathan', 'nate'],
  ['gregory', 'greg', 'gg'],
  ['jeffrey', 'jeff'],
  ['patrick', 'pat'],
  ['timothy', 'tim'],
  ['andrew', 'andy', 'drew'],
  ['edward', 'ed', 'eddie'],
  ['richard', 'rich', 'rick', 'ricky'],
  ['james', 'jim', 'jimmy'],
  ['david', 'dave'],
  ['steven', 'stephen', 'steve'],
  ['frederick', 'fred', 'freddy'],
  ['leonardo', 'leo'],
  ['dmitry', 'dmitri'],
];
const NICK = new Map();
GROUPS.forEach((g, i) => g.forEach((n) => NICK.set(n, [...(NICK.get(n) ?? []), i])));

// (a team code's other spellings, the books' against ESPN's)
const TEAM_ALIAS = { WAS: 'WSH', WSH: 'WAS', CWS: 'CHW', CHW: 'CWS', SF: 'SFG', SFG: 'SF', SD: 'SDP', SDP: 'SD', TB: 'TBR', TBR: 'TB', KC: 'KCR', KCR: 'KC', LA: 'LAR', LAR: 'LA', ATH: 'OAK', OAK: 'ATH', UTA: 'UTAH', UTAH: 'UTA', NO: 'NOR', JAX: 'JAC', JAC: 'JAX', NJ: 'NJD', NJD: 'NJ', LV: 'VGK', VGK: 'LV', MON: 'MTL', MTL: 'MON' };

// A name's parts: { key (the whole name's), first, last (keys), note: the trailing "(...)" if any, team: the note
// when it's a team's code }
export function nameParts(raw) {
  let s = String(raw ?? '').trim();
  const m = s.match(/\s*\(([^)]*)\)\s*$/);
  const note = m ? m[1].trim() : null;
  if (m) s = s.slice(0, m.index).trim();
  const team = note && /^[A-Za-z]{2,4}$/.test(note) ? note.toUpperCase() : null;
  const words = s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .split(/\s+/)
    .filter((w) => w && !/^(jr|sr|ii|iii|iv|v)\.?$/i.test(w));
  const first = nameKey(words[0] ?? '');
  // (the first name's own parts, for initials: "John-Jason" j and j)
  const initials = (words[0] ?? '').split(/[-.]/).filter(Boolean).map((w) => w[0].toLowerCase()).join('');
  const last = nameKey(words.slice(1).join(' '));
  return { key: nameKey(s), first, initials, last, note, team };
}

const groupsOf = (first) => NICK.get(first) ?? [];
const nicknames = (a, b) => a === b || groupsOf(a).some((g) => groupsOf(b).includes(g));
// (first names alike: one the start of the other, three letters at least, or one the other's initials ("jj",
// "john-jason"))
const prefix = (a, b) => a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a));
const alike = (a, b) => prefix(a.first, b.first) || (a.first.length <= 2 && a.first === b.initials && b.initials.length >= 2) || (b.first.length <= 2 && b.first === a.initials && a.initials.length >= 2);

// A matcher over one game's players (each { name, abbr? (his team's code) }): book name -> the player, or null.
// known: the sport's players' name keys (a Set), a book name among them matched by its key alone
export function nameMatcher(players, { known = null } = {}) {
  const list = players.map((p) => ({ p, ...nameParts(p.name) }));
  // (a player on the note's team, where both are known; true where either isn't)
  const onTeam = (x, team) => !team || !x.p.abbr || String(x.p.abbr).toUpperCase() === team || String(x.p.abbr).toUpperCase() === TEAM_ALIAS[team];
  // (the step's one player; null with none; undefined with two or more: ambiguous)
  const one = (found, book) => {
    if (book.team) {
      const mine = found.filter((x) => x.p.abbr && onTeam(x, book.team));
      if (mine.length === 1) return mine[0].p;
      found = found.filter((x) => onTeam(x, book.team));
    }
    if (found.length === 1) return found[0].p;
    return found.length ? undefined : null;
  };
  return (raw) => {
    const book = nameParts(raw);
    if (!book.key) return null;
    // (a note that isn't a team: told apart from a player of the same name, never the plain one's match)
    const other = book.note && !book.team;
    const steps = [
      (x) => !other && x.key === book.key,
      (x) => book.last && x.last === book.last && nicknames(x.first, book.first) && x.first !== book.first,
      (x) => book.last && x.last === book.last && alike(x, book),
    ];
    for (const [i, step] of steps.entries()) {
      // (a name the sport has exactly: that player or no one)
      if (i > 0 && !other && known?.has(book.key)) return null;
      const got = one(list.filter((x) => step(x) && !(other && x.key === book.key)), book);
      // (two candidates at a step: ambiguous, no match at all)
      if (got === undefined) return null;
      if (got) return got;
    }
    return null;
  };
}

// One game's book names matched to its players, one to one: Map book name -> player. A player two names reach
// keeps the exact one (his key's) alone, else neither
export function matchNames(bookNames, players, opts = {}) {
  const match = nameMatcher(players, opts);
  const by = new Map();
  for (const n of new Set(bookNames)) {
    const p = match(n);
    if (p) (by.get(p) ?? by.set(p, []).get(p)).push(n);
  }
  const out = new Map();
  for (const [p, names] of by) {
    const exact = names.filter((n) => nameParts(n).key === nameParts(p.name).key && !nameParts(n).note);
    const keep = names.length === 1 ? names : exact.length === 1 ? exact : [];
    for (const n of keep) out.set(n, p);
  }
  return out;
}
