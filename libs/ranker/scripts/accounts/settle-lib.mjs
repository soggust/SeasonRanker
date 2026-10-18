// The play-money settler's own logic, pure (no Firestore, no network: tests/wallet.test.mjs runs it on made-up
// games): what a user's bet comes to once its game is final, by the bettor's own rules (desk.mjs settle, voidOf;
// props.mjs settleProp), the check that its price was one on the board, the tallies the leaderboards come from.
//
// The price check (checkPrice): a bet stands only if its market, side, line and price were on DraftKings' board
// for its game. What the settler knows of that board:
//   open    DraftKings' opening line and price for each side (ESPN's core API keeps them after the game)
//   close   its closing line and price (the same; before kickoff, the current one: the board the slip showed)
//   snap    the settler's own snapshots of ESPN's scoreboard (lines/{sport}_{event}), taken each hourly run for
//           the next three days' games whenever a line or price moved
//   bot     the bettor's own bets on the game (its ledger: its side's line and price when it bet, and the last
//           it saw)
//   board   every price the bettor's betting board has shown for the game (board.mjs: its board-seen.json, kept
//           a week past the start), any market's either side, a prop no one bet among them: the page lets a
//           user bet any of them at the board's price
// A bet matches one of these when it's the same market and side, the same line (a moneyline has none), and its
// price is within TOLERANCE cents of that one's (cents: American odds on one scale, -110 is -10, +120 is +20;
// a long price, past 250 either way, a little more room: 4% of it). The open, the close, the bot's and the board's are
// good whenever the bet was placed (before the start: checked first); the board's only while it was on show
// (BOARD_EARLY before its first showing to BOARD_LATE past its last); a snapshot only within WINDOW of its time.
// Limits: between snapshots a line can move and move back unseen, so a bet on a short-lived price can be voided
// ("price didn't match the board"); a bet whose game was never snapshotted is checked against the open, the
// close and the bot's alone; and a tampered slip could still take the open or a price from up to WINDOW away.
// Play money: the check keeps the record honest, it doesn't need to be airtight.

import { outcomeOf, settle as settleGame, voidOf } from '../model/desk.mjs';
import { PROP_WAIT, settleProp } from '../model/props.mjs';
import { boutVoid, nameKey, settleBout } from '../model/mma-desk.mjs';

export const START = 500;
export const DAY = 864e5;
export const TOLERANCE = 10;
export const WINDOW = 3 * 36e5;
// (a board's price good from a little before its first showing to past its last: the bettor runs hourly, the
// board on the page till the next run, and a run can come late)
export const BOARD_EARLY = 5 * 6e4;
export const BOARD_LATE = 90 * 6e4;
// (a prop the box score never counts, or a game ESPN never finishes: void after this long, its stake back; a
// final's count not read yet waits longer, PROP_WAIT, as the bettor's own pick does)
export const GIVE_UP = 3 * DAY;

export const round2 = (v) => Math.round(v * 100) / 100;

// (American odds on one straight scale: -110 is -10, +100 is 0, +120 is +20)
export const cents = (a) => (a > 0 ? a - 100 : a + 100);

// (whether a bet's price is close enough to one seen: TOLERANCE cents, 4% of a long price)
export function priceNear(mine, seen) {
  if (!Number.isFinite(mine) || !Number.isFinite(seen)) return false;
  const room = Math.max(TOLERANCE, Math.abs(seen) > 250 ? Math.abs(seen) * 0.04 : 0);
  return Math.abs(cents(mine) - cents(seen)) <= room + 1e-9;
}

// ---------------------------------------------------------------------------
// What was on the board
// ---------------------------------------------------------------------------

// (ESPN's numbers: "+150", "-110", "EVEN"; a line "-3.5", "o47.5", "PK")
export const priceOf = (v) => {
  const s = String(v ?? '').trim();
  if (/^even$/i.test(s)) return 100;
  const n = Number(s.replace('+', ''));
  return s && Number.isFinite(n) && Math.abs(n) >= 100 ? Math.round(n) : null;
};
export const lineOf = (v) => {
  const s = String(v ?? '').trim();
  if (/^(pk|pick|even)$/i.test(s)) return 0;
  const n = Number(s.replace(/^[ou+]/i, ''));
  return s && Number.isFinite(n) ? n : null;
};

// A board's lines (espn.mjs linesOf's shape: spread.{home,away}.{line,odds}, total.{line,over,under},
// ml.{home,away}) as observations: one a market's side
export function observationsOf(lines, kind, at = null) {
  if (!lines) return [];
  const out = [];
  const add = (market, side, line, odds) => {
    if (Number.isFinite(odds) && (market === 'ml' || Number.isFinite(line))) out.push({ kind, at, market, side, line: market === 'ml' ? null : line, odds });
  };
  for (const side of ['home', 'away']) {
    add('spread', side, lines.spread?.[side]?.line, lines.spread?.[side]?.odds);
    add('ml', side, null, lines.ml?.[side]);
  }
  add('total', 'over', lines.total?.line, lines.total?.over);
  add('total', 'under', lines.total?.line, lines.total?.under);
  return out;
}

// ESPN's core API's DraftKings odds for an event (sports.core.api.espn.com .../odds/100): the opening and the
// closing lines, each as observations
export function coreObservations(body) {
  if (!body) return [];
  const side = (t, when) => ({ line: lineOf(t?.[when]?.pointSpread?.american), odds: priceOf(t?.[when]?.spread?.american), ml: priceOf(t?.[when]?.moneyLine?.american) });
  const out = [];
  for (const when of ['open', 'close']) {
    const h = side(body.homeTeamOdds, when);
    const a = side(body.awayTeamOdds, when);
    const t = body[when];
    out.push(
      ...observationsOf(
        {
          spread: { home: { line: h.line, odds: h.odds }, away: { line: a.line, odds: a.odds } },
          total: { line: lineOf(t?.total?.american), over: priceOf(t?.over?.american), under: priceOf(t?.under?.american) },
          ml: { home: h.ml, away: a.ml },
        },
        when,
      ),
    );
  }
  return out;
}

// The bettor's own bets on the game as observations (its side, its price when it bet, and the last it saw;
// a prop's other side at the price beside it (otherOdds), so a bet against the bot's prop is checked too; a
// CHECK's (checks.mjs, which the page shows too) the same way, and each price it stood at before (earlier), so
// a bet taken at the price the page showed then still matches once the CHECK's been written again)
export function botObservations(ledgerBets) {
  const out = [];
  for (const b of ledgerBets ?? []) {
    const base = { market: b.market, side: b.side, propType: b.propType ?? null, athlete: b.athlete != null ? String(b.athlete) : null };
    out.push({ ...base, kind: 'bot', at: Date.parse(b.placedAt), line: b.market === 'ml' ? null : b.line, odds: b.odds });
    if (b.market === 'prop' && Number.isFinite(b.otherOdds) && (b.side === 'over' || b.side === 'under')) out.push({ ...base, side: b.side === 'over' ? 'under' : 'over', kind: 'bot', at: Date.parse(b.placedAt), line: b.line, odds: b.otherOdds });
    if (b.seen && Number.isFinite(b.seen.odds)) out.push({ ...base, kind: 'bot', at: Date.parse(b.seen.at), line: b.market === 'ml' ? null : (b.seen.line ?? b.line), odds: b.seen.odds });
    for (const e of Array.isArray(b.earlier) ? b.earlier : []) {
      const at = Date.parse(e?.at);
      const line = b.market === 'ml' ? null : (e?.line ?? b.line);
      const side = e?.side ?? b.side;
      if (Number.isFinite(e?.odds)) out.push({ ...base, side, kind: 'bot', at, line, odds: e.odds });
      if (b.market === 'prop' && Number.isFinite(e?.otherOdds) && (side === 'over' || side === 'under')) out.push({ ...base, side: side === 'over' ? 'under' : 'over', kind: 'bot', at, line, odds: e.otherOdds });
    }
  }
  return out;
}

// The betting board's prices seen for the game (board.mjs seenOf's entries, "market|side|line|price|stat|athlete")
// with its [firstAt, lastAt]) as observations, good only while the board showed it (from, to)
export function boardObservations(entries) {
  const out = [];
  for (const [e, seen] of entries && typeof entries === 'object' && !Array.isArray(entries) ? Object.entries(entries) : []) {
    const [market, side, line, odds, propType, athlete] = String(e).split('|');
    const [from, to] = Array.isArray(seen) ? seen : [];
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    const o = Number(odds);
    const l = line === '' ? null : Number(line);
    if (!market || !side || !Number.isFinite(o) || (market !== 'ml' && !Number.isFinite(l))) continue;
    out.push({ kind: 'board', at: null, from, to, market, side, propType: propType || null, athlete: athlete || null, line: market === 'ml' ? null : l, odds: o });
  }
  return out;
}

// The price check: { ok: true, by } or { ok: false, why }
export function checkPrice(bet, observations) {
  const placed = Date.parse(bet.placedAt);
  const mine = observations.filter(
    (o) => o.market === bet.market && o.side === bet.side && (bet.market !== 'prop' || (o.propType === bet.propType && String(o.athlete) === String(bet.athlete))),
  );
  if (!mine.length) return { ok: false, why: 'couldn’t check the price: no board for this market' };
  const timely = (o) =>
    o.kind === 'snap'
      ? Number.isFinite(o.at) && Math.abs(placed - o.at) <= WINDOW
      : o.kind !== 'board' || (placed >= o.from - BOARD_EARLY && placed <= o.to + BOARD_LATE);
  const sameLine = (o) => bet.market === 'ml' || o.line === bet.line;
  const match = mine.find((o) => timely(o) && sameLine(o) && priceNear(bet.odds, o.odds));
  return match ? { ok: true, by: match.kind } : { ok: false, why: 'price didn’t match the board' };
}

// ---------------------------------------------------------------------------
// Preview props: DraftKings' prop lines off ESPN's core API for a game the bot hadn't priced yet (the Book's
// preview-props.ts), bet at an assumed -110 (no price posted) with preview: true, the line as the page showed it.
// No price to check, so the line is: it stands if it's within the lowest and highest main line seen for that
// player's stat (ESPN's open and its current one when the settler looks, the settler's own looks before the start
// (propLines/{sport_event}: settle.mjs snapshotPreviewLines), and any the bot's board or bets had), the line a bet
// at a stale line was placed at still the one it's graded at. Then graded as a straight prop is (settleProp: the
// box score's count, void when he didn't play). Limits: a line ESPN showed only between two looks, outside every
// line seen at them, isn't known (the bet's void, its stake back).
// ---------------------------------------------------------------------------
export const PREVIEW_ODDS = -110;

// (the stats the page offers, as preview-props.ts PREVIEW_STATS has them: the bettor's keys, ESPN's type names;
// the ones the settler grades from ESPN's box score, so not MLB's total bases)
export const PREVIEW_STATS = {
  nfl: [
    ['passYds', /^Total Passing Yards \(/],
    ['passAtt', /^Total Passing Attempts/],
    ['passCmp', /^Total Pass Completions/],
    ['passTd', /^Total Passing Touchdowns/],
    ['passInt', /^Total Passing Interceptions/],
    ['rushYds', /^Total Rushing Yards \(/],
    ['rushAtt', /^Total Carries/],
    ['recYds', /^Total Receiving Yards \(/],
    ['rec', /^Total Receptions/],
    ['rushRecYds', /^Total Rushing Plus Receiving Yards/],
  ],
  nba: [
    ['pts', /^Total Points( \(|$)/],
    ['reb', /^Total Rebounds( \(|$)/],
    ['ast', /^Total Assists( \(|$)/],
    ['fg3', /^Total (3-Point|Three|Made 3)/i],
    ['pra', /Points.*(Rebounds.*Assists|Assists.*Rebounds)/i],
  ],
  nhl: [
    ['sog', /^Total Shots on Goal/],
    ['pts', /^Total Points$/],
    ['saves', /^Total Saves/],
  ],
  mlb: [
    ['k', /^Total Strikeouts$/],
    ['outs', /^Total Outs Recorded/],
    ['hits', /^Total Hits$/],
  ],
};

// (an ESPN prop type's stat key, if it's one offered: never a milestone, a period's or a team's)
export function previewStatOf(sport, typeName) {
  const name = String(typeName ?? '');
  if (/milestone/i.test(name) || /^(1st|2nd|3rd|4th|first|last|team)\b/i.test(name)) return null;
  return (PREVIEW_STATS[sport] ?? []).find(([, re]) => re.test(name))?.[0] ?? null;
}

const athleteIdOf = (ref) => /\/athletes\/([0-9]{1,20})(?:[/?]|$)/.exec(String(ref ?? ''))?.[1] ?? null;

// (the main line among a player's stat's lines: the one listed most, the middle one at a tie)
export function mainLineOf(lines) {
  const counts = new Map();
  for (const l of lines) counts.set(l, (counts.get(l) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const top = ranked.filter((l) => l[1] === ranked[0][1]).map((l) => l[0]);
  return top[Math.floor((top.length - 1) / 2)];
}

// A game's propBets items as "athlete|stat" to its main line and where it opened ({ line, open })
export function previewLinesOf(sport, items) {
  const groups = new Map();
  for (const it of items ?? []) {
    const stat = previewStatOf(sport, it?.type?.name);
    const athlete = athleteIdOf(it?.athlete?.$ref);
    const line = it?.current?.target?.value;
    if (!stat || !athlete || typeof line !== 'number' || !Number.isFinite(line)) continue;
    const key = `${athlete}|${stat}`;
    groups.set(key, [...(groups.get(key) ?? []), it]);
  }
  const out = new Map();
  for (const [key, list] of groups) {
    const line = mainLineOf(list.map((x) => x.current.target.value));
    const open = list.find((x) => x.current.target.value === line)?.open?.target?.value;
    out.set(key, { line, open: Number.isFinite(open) ? open : null });
  }
  return out;
}

// (why a bet marked preview isn't one the page could have placed: a prop of a stat offered, at -110, not the bot's)
export function previewProblem(bet) {
  if (bet.preview !== true || bet.market !== 'prop' || bet.odds !== PREVIEW_ODDS || bet.botPick === true) return 'not a preview price';
  if (PREVIEW_STATS[bet.sport] && !PREVIEW_STATS[bet.sport].some(([k]) => k === bet.propType)) return 'not a preview stat';
  return null;
}

// Every main line seen for a preview bet's player's stat: ESPN's (espn: previewLinesOf's map, its line and open),
// the settler's looks (snap: propLines' seen, "athlete|stat" to [lowest, highest]), and the bot's board's and bets'
// (observations: the price check's, a prop's lines)
export function previewSeen(bet, { espn = null, snap = null, observations = [] } = {}) {
  const key = `${bet.athlete}|${bet.propType}`;
  const out = [];
  const e = espn?.get?.(key);
  if (e) out.push(e.line, e.open);
  const s = snap?.[key];
  if (Array.isArray(s)) out.push(...s);
  for (const o of observations ?? []) if (o.market === 'prop' && o.propType === bet.propType && String(o.athlete) === String(bet.athlete)) out.push(o.line);
  return out.filter((v) => typeof v === 'number' && Number.isFinite(v));
}

// The line check: { ok: true } when the bet's line is within the lowest and highest seen, else { ok: false, why }
// (wait: none seen at all, ESPN not read: the bet waits, then is void)
export function previewLineCheck(bet, seen) {
  const lines = (seen ?? []).filter(Number.isFinite);
  if (!lines.length) return { ok: false, wait: true, why: 'couldn’t check the line: no board for this prop' };
  const lo = Math.min(...lines);
  const hi = Math.max(...lines);
  return bet.line >= lo - 1e-9 && bet.line <= hi + 1e-9 ? { ok: true } : { ok: false, why: 'line wasn’t on the board' };
}

// (the settler's look at a game's preview lines merged into what it kept: each "athlete|stat" its lowest and
// highest main line (and open) seen; null when nothing's new)
export function mergePreviewSeen(kept, lines) {
  const next = { ...(kept ?? {}) };
  let changed = false;
  for (const [key, { line, open }] of lines ?? []) {
    const vals = [line, open, ...(Array.isArray(next[key]) ? next[key] : [])].filter((v) => typeof v === 'number' && Number.isFinite(v));
    if (!vals.length) continue;
    const range = [Math.min(...vals), Math.max(...vals)];
    if (!Array.isArray(next[key]) || next[key][0] !== range[0] || next[key][1] !== range[1]) {
      next[key] = range;
      changed = true;
    }
  }
  return changed ? next : null;
}

// ---------------------------------------------------------------------------
// Settling
// ---------------------------------------------------------------------------

// (what a stake wins on top of itself, to the cent)
export const toWin = (stake, odds) => round2(odds > 0 ? (stake * odds) / 100 : (stake * 100) / -odds);

const voided = (why, final = null) => ({ status: 'void', profit: 0, note: why, ...(final ? { final } : {}) });

// A user's bet against its game (espn.mjs gameOf's shape, or null when ESPN has none), what was on the board,
// and, for a prop, the player's count (the bettor's graded value for the same pick, else the box score's;
// undefined when neither has it yet): its result ({ status: won | lost | push | void, profit, final, note? })
// or null while it waits. A preview prop (preview: true) by its lines seen (previewLines: previewSeen's) in place of
// the price check
export function settlePlayBet(bet, game, { observations = [], propValue, previewLines, now = Date.now() } = {}) {
  // (a UFC bout: by the MMA desk's own grading, settleMmaBet; game is the bout)
  if (bet.sport === 'mma') return settleMmaBet(bet, game, { observations, now });
  const start = Date.parse(bet.start);
  if (!game) return now - start > GIVE_UP ? voided('game not found') : null;
  if (`${game.awayAbbr} @ ${game.homeAbbr}` !== bet.matchup) return voided('not this game');
  // (placed once it had begun: no action)
  if (Date.parse(bet.placedAt) >= Date.parse(game.date) && !game.off) return voided('placed after the start');
  // (called off, by DraftKings' rule: desk.mjs voidOf)
  const off = voidOf({ ...bet, units: bet.stake }, game, now);
  if (off) return voided(off.why.replace(/^Void: /, ''), off.final);
  if (!game.final) return bet.market === 'prop' && now - start > GIVE_UP ? voided('couldn’t settle the prop') : null;
  if (bet.preview !== undefined) {
    // (a preview prop: no price was posted, so none to check; held to the assumed -110, its line to the lines ESPN
    // showed for him, a look that can't be had yet waiting)
    const problem = previewProblem(bet);
    if (problem) return voided(problem);
    const line = previewLineCheck(bet, previewLines);
    if (!line.ok) return line.wait && now - start <= GIVE_UP ? null : voided(line.why);
  } else {
    const price = checkPrice(bet, observations);
    if (!price.ok) return voided(price.why);
  }
  const priced = { ...bet, units: bet.stake };
  if (bet.market === 'prop') {
    // (a count not read yet waits as long as the bettor's own pick does (props.mjs PROP_WAIT), so the two end alike)
    if (propValue === undefined) return now - start > Math.max(GIVE_UP, PROP_WAIT) ? voided('couldn’t read the stat') : null;
    const r = settleProp(priced, propValue);
    if (r.void) return voided(r.final ?? 'did not play');
    return { status: r.status, profit: r.status === 'won' ? toWin(bet.stake, bet.odds) : r.status === 'lost' ? -bet.stake : 0, final: r.final };
  }
  const r = settleGame(priced, game);
  // (a run line or total on an MLB game cut short: void, the bettor's own rule)
  if (r.void) return voided(r.why.replace(/^Void: /, ''), r.final);
  return { status: r.status, profit: r.status === 'won' ? toWin(bet.stake, bet.odds) : r.status === 'lost' ? -bet.stake : 0, final: r.final };
}

// ---------------------------------------------------------------------------
// UFC bouts (sport 'mma'): a bet on a bout (its event the bout's ESPN id, its matchup the fighters' names "away @
// home" as the MMA board writes them, mma-desk.mjs buildMmaBoard), a moneyline or a round total, graded by the
// MMA desk's own rules (mma-desk.mjs boutVoid and settleBout, fights-totals.mjs settleTotal) from the bout in the
// desk's shape (mma-desk.mjs boutsOf and mergeBouts: its winner, its last round and the clock into it, off when
// cancelled or a fighter replaced). A moneyline: the picked fighter won; a draw or a no contest void. A round
// total: Over N.5 wins only past the middle of round N+1 (Over 2.5 past 2:30 of the third; a finish at 2:30 of it
// exactly is Under), a no contest or a draw before the line void. A fighter replaced or the bout cancelled: void.
// Its price checked as any bet's (checkPrice: the bettor's bets on the bout and every price its MMA board showed)
// ---------------------------------------------------------------------------

// (a bet's matchup as its fighters' names' keys, away then home; null when it isn't two names)
const matchupKeys = (matchup) => {
  const parts = String(matchup ?? '').split(' @ ');
  return parts.length === 2 && parts[0] && parts[1] ? parts.map(nameKey) : null;
};
const sameFighters = (bet, bout) => {
  const keys = matchupKeys(bet.matchup);
  return !!keys && keys[0] === nameKey(bout.away?.name) && keys[1] === nameKey(bout.home?.name);
};

// The bout a bet is on, from the bouts known (the desk's kept ones and ESPN's scoreboard, merged: mergeBouts): the
// one with its id and its fighters, else (the bout's fighters changed since) the one with its id alone; null when
// none has its id. Its date the start the board showed (the Odds API's, else ESPN's), as the bet's start was
export function boutFor(bet, bouts) {
  const mine = (bouts ?? []).filter((b) => String(b.id) === String(bet.event));
  const bout = mine.find((b) => sameFighters(bet, b)) ?? mine.find((b) => !b.off) ?? mine[0];
  return bout ? { ...bout, date: bout.start ?? bout.date } : null;
}

// A user's bet on a bout: its result ({ status: won | lost | void, profit, final, note? }) or null while it waits
export function settleMmaBet(bet, bout, { observations = [], now = Date.now() } = {}) {
  const start = Date.parse(bet.start);
  if (!bout) return now - start > GIVE_UP ? voided('bout not found') : null;
  // (the bout's fighters as the bet names them; another pairing on its id: a fighter replaced, boutVoid's rule)
  const fighters = sameFighters(bet, bout) ? { home: bout.home, away: bout.away } : { home: { id: null }, away: { id: null } };
  const off = boutVoid({ ...bet, fighters }, bout, now);
  if (off) return voided(off.why.replace(/^Void: /, ''), off.final);
  if (Date.parse(bet.placedAt) >= Date.parse(bout.date)) return voided('placed after the start');
  if (!bout.final) return now - start > GIVE_UP ? voided('bout not finished') : null;
  const price = checkPrice(bet, observations);
  if (!price.ok) return voided(price.why);
  const r = settleBout({ ...bet, units: bet.stake, fighters }, bout, now);
  // (a total whose bout's length ESPN hasn't given: waits, then void)
  if (!r) return now - start > GIVE_UP ? voided('couldn’t read how long it went') : null;
  if (r.void) return voided(r.why.replace(/^Void: /, ''), r.final);
  return { status: r.status, profit: r.status === 'won' ? toWin(bet.stake, bet.odds) : -bet.stake, final: r.final };
}

// ---------------------------------------------------------------------------
// Parlays: one bet of 2 to 10 legs, each on a game of its own (users/{uid}/bets/{id} with kind 'parlay', its
// legs[] each a straight bet's fields; firestore.rules has the shape). The bot never makes one: they're the
// user's alone. Each leg is graded as a straight bet is (settlePlayBet: its price checked, its game final);
// a leg lost loses the parlay then and there; a pushed or void leg drops out, the odds the product of the rest
// (down to one leg, it pays as that straight bet; none left, its stake back); a leg still open waits.
// ---------------------------------------------------------------------------

// (American odds as decimal, what a unit pays back: -110 is 1.909, +150 is 2.5; and back, rounded to the cent's
// whole number as a book quotes it)
export const decimalOf = (odds) => (odds > 0 ? 1 + odds / 100 : 1 + 100 / -odds);
export const americanOf = (dec) => (dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1)));

// (the legs' combined price: the product of their decimal odds, as American)
export const parlayOdds = (legs) => americanOf(legs.reduce((p, l) => p * decimalOf(l.odds), 1));
// (what a stake wins on the legs together, to the cent: from the product itself, not the rounded American price)
export const parlayToWin = (stake, legs) => round2(stake * (legs.reduce((p, l) => p * decimalOf(l.odds), 1) - 1));

// A parlay's result from its legs' (each { odds, status } with status won | lost | push | void, or open (or
// null) while it waits): { status, profit, final, odds? } (odds: the price it paid at, the legs that dropped
// out gone) or null while a leg's still open and none has lost
export function parlayOutcome(stake, legs) {
  const n = legs.length;
  const of = (s) => legs.filter((l) => l.status === s).length;
  const hit = `${of('won')} of ${n} hit`;
  if (of('lost')) return { status: 'lost', profit: -stake, final: hit };
  if (legs.some((l) => !l.status || l.status === 'open')) return null;
  const won = legs.filter((l) => l.status === 'won');
  const out = [of('push') && `${of('push')} pushed`, of('void') && `${of('void')} void`].filter(Boolean).join(', ');
  const final = out ? `${hit}, ${out}` : hit;
  if (!won.length) return of('push') ? { status: 'push', profit: 0, final } : { status: 'void', profit: 0, final, note: 'every leg void' };
  // (one leg left: that straight bet's price; more, their product)
  const odds = won.length === 1 ? won[0].odds : parlayOdds(won);
  const profit = won.length === 1 ? toWin(stake, odds) : parlayToWin(stake, won);
  return { status: 'won', profit, final, odds };
}

// Why a parlay's leg isn't a bet the page could have placed, if it isn't (firestore.rules checks a straight bet's
// market, side, line and price, but a parlay's ten legs can't all be checked inside the rules' limit, so the
// settler checks them here): its sport, its market and side, its line, an American price, a prop's player and stat
export const SPORTS = ['nfl', 'nba', 'nhl', 'mlb', 'mma'];
export function legProblem(l) {
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  // (a game's id, a string as the page writes it, with no leading zero: ESPN takes a padded id as the game's own)
  if (!SPORTS.includes(l.sport) || typeof l.event !== 'string' || !/^[1-9][0-9]{0,19}$/.test(l.event)) return 'not a game';
  // (a bout's matchup its fighters' names, firestore.rules' shape; a moneyline or a round total only)
  const mma = l.sport === 'mma';
  if (typeof l.matchup !== 'string' || !(mma ? /^[^<>@]{1,48} @ [^<>@]{1,48}$/ : /^[A-Z0-9]{2,5} @ [A-Z0-9]{2,5}$/).test(l.matchup)) return 'not a game';
  if (mma && l.market !== 'ml' && l.market !== 'total') return 'not a market';
  if (!Number.isInteger(l.odds) || Math.abs(l.odds) < 100 || Math.abs(l.odds) > 50000) return 'not a price';
  const sides = l.market === 'spread' || l.market === 'ml' ? ['home', 'away'] : l.market === 'total' || l.market === 'prop' ? ['over', 'under'] : [];
  if (!sides.includes(l.side)) return 'not a market';
  if (l.market === 'ml' ? l.line != null : !num(l.line)) return 'not a line';
  if (l.market === 'prop' && (typeof l.propType !== 'string' || !/^[0-9]{1,20}$/.test(String(l.athlete ?? '')))) return 'not a prop';
  if (l.preview !== undefined) return previewProblem(l);
  return null;
}

// A parlay against its legs' games: each leg's own result (a leg settled on an earlier run kept as it was; one
// whose game hasn't begun waits), and the parlay's ({ ...parlayOutcome, legs } or null while it waits, with the
// legs graded so far, so an open parlay can show them). games: by leg, { game, observations, propValue } as
// settlePlayBet takes them, or null for a game not begun
export function settleParlay(parlay, games, { now = Date.now() } = {}) {
  // (two legs on one game: the rules refuse it, and so does this, the parlay void; a game's id read as a number,
  // so a padded one is the same game)
  const gameKey = (e) => (/^[0-9]{1,20}$/.test(String(e ?? '')) ? BigInt(e).toString() : String(e));
  const keys = parlay.legs.map((l) => `${l.sport}|${gameKey(l.event)}`);
  if (new Set(keys).size < keys.length) return { result: { status: 'void', profit: 0, note: 'two legs on one game' }, legs: parlay.legs };
  const legs = parlay.legs.map((leg, i) => {
    if (leg.status && leg.status !== 'open') return leg;
    // (a leg that isn't a bet as a straight one would be: void, out of it)
    const problem = legProblem(leg);
    if (problem) return { ...leg, status: 'void', note: problem };
    const g = games[i];
    if (!g) return leg;
    const r = settlePlayBet({ ...leg, stake: parlay.stake, placedAt: parlay.placedAt, start: leg.start }, g.game, { observations: g.observations, propValue: g.propValue, previewLines: g.previewLines, now });
    if (!r) return leg;
    // (with its game's own start: the parlay's tally day is its legs' games', not the starts the browser wrote)
    return { ...leg, status: r.status, ...(r.final ? { final: r.final } : {}), ...(r.note ? { note: r.note } : {}), ...(g.game?.date ? { date: g.game.date } : {}) };
  });
  const r = parlayOutcome(parlay.stake, legs);
  return { result: r, legs };
}

// (the day a decided parlay is filed under: its losing leg's game, else its last, by the games' own starts
// (settleParlay's date on each leg graded), not the ones the browser wrote; a leg never graded (void as
// malformed, or from before the dates were kept) only when none has one)
export function parlayDay(legs) {
  const lost = legs.find((l) => l.status === 'lost');
  if (lost) return lost.date ?? lost.start;
  const dated = legs.filter((l) => l.date).map((l) => l.date);
  return (dated.length ? dated : legs.map((l) => l.start)).sort().at(-1);
}

// (the bettor's graded pick a prop is settled by: the same stat of the same player in the same game, the one
// its ref names first, else any (the count doesn't depend on the side or the ref: a bet against the bot, or one
// whose ref isn't the bettor's, is graded by the bettor's count too, its snap counts and all, not the box score
// alone); never one of another player or stat, whose big night would otherwise settle it. ledgerBets: the
// game's own (settle.mjs filters by event); one with an event that isn't the bet's is passed over)
export function gradedPick(bet, ledgerBets) {
  const same = (b) =>
    b.market === 'prop' &&
    b.propType === bet.propType &&
    String(b.athlete) === String(bet.athlete) &&
    (b.event === undefined || bet.event === undefined || String(b.event) === String(bet.event)) &&
    b.status !== 'open' &&
    b.actual !== undefined;
  const list = ledgerBets ?? [];
  return list.find((b) => b.id === bet.ref && same(b)) ?? list.find(same);
}

// (whether a settled bet pays into the wallet as it is now: the same run (a reload starts another) and placed
// after the wallet was made; a wallet deleted and made again is back at run 0, and must not collect the old
// one's bets. Timestamps or anything with toMillis, or ISO strings)
const millisOf = (v) => (typeof v?.toMillis === 'function' ? v.toMillis() : v == null ? null : Date.parse(v));
export function paysInto(bet, wallet) {
  if (!wallet || (wallet.resets ?? 0) !== (bet.run ?? 0)) return false;
  const made = millisOf(wallet.createdAt);
  const placed = millisOf(bet.placedAt);
  return made == null || (Number.isFinite(placed) && placed >= made);
}

// (what goes back in the wallet: the stake and the winnings on a win, the stake on a push or a void)
export const creditOf = (stake, result) => (result.status === 'won' ? round2(stake + result.profit) : result.status === 'lost' ? 0 : stake);

// ---------------------------------------------------------------------------
// Corrections: an NHL skater's shots or points prop settled on a count the league's own box doesn't bear out
// (ESPN's box, read at the final, a shot short: Matthew Knies' Under 1.5 Shots, NYR @ CBJ 2026-10-17, paid on 1,
// the league's 2) settled again on the league's count (the bettor's graded pick's, which it grades again by the
// league's box: run.mjs officialRegrade; else the league's box itself), its payout reversed and the new one paid
// (settle.mjs correctSettled). Only these props; a game's result, a void, any other sport's count stands as
// settled. CORRECT_DAYS: how far back a settled bet is looked at again
// ---------------------------------------------------------------------------
export const CORRECT_DAYS = 14;
export const CORRECTED_PROPS = ['sog', 'pts'];
const DECIDED = ['won', 'lost', 'push'];
export const correctable = (b) => b?.sport === 'nhl' && b.market === 'prop' && CORRECTED_PROPS.includes(b.propType) && b.preview === undefined;

// (a settled prop's result from a count: settlePlayBet's, at the bet's stake and price)
function propResult(bet, value) {
  const r = settleProp({ ...bet, units: bet.stake }, value);
  return { status: r.status, profit: r.status === 'won' ? toWin(bet.stake, bet.odds) : r.status === 'lost' ? -bet.stake : 0, final: r.final };
}

// A settled straight prop again at the count now (a number): its new result, or null when it stands (the same
// status and the same count) or isn't one to correct
export function correctionOf(bet, value) {
  if (!correctable(bet) || bet.kind === 'parlay' || !DECIDED.includes(bet.status) || typeof value !== 'number') return null;
  const r = propResult(bet, value);
  return r.status === bet.status && r.final === bet.final ? null : r;
}

// A settled parlay again with its NHL shots and points legs at the counts now (values: by leg, a number, else
// undefined: that leg stands): { result, legs } when a leg's grade moved, null when none did, or the parlay
// isn't decided again by its legs as they stand now (a leg still open)
export function parlayCorrectionOf(parlay, values) {
  if (parlay?.kind !== 'parlay' || !DECIDED.includes(parlay.status)) return null;
  let moved = false;
  const legs = (parlay.legs ?? []).map((l, i) => {
    if (!correctable(l) || !DECIDED.includes(l.status) || typeof values?.[i] !== 'number') return l;
    const r = propResult({ ...l, stake: parlay.stake }, values[i]);
    if (r.status === l.status && r.final === l.final) return l;
    moved = true;
    return { ...l, status: r.status, final: r.final };
  });
  if (!moved) return null;
  const result = parlayOutcome(parlay.stake, legs);
  return result ? { result, legs } : null;
}

// A tally with a settled bet taken back out (addToTally's inverse: its result's count, stake and profit, on its
// day and its sport's)
export function removeFromTally(tally, bet, result) {
  const all = { won: 0, lost: 0, push: 0, void: 0, staked: 0, profit: 0, ...(tally?.all ?? {}) };
  const days = { ...(tally?.days ?? {}) };
  const sports = { ...(tally?.sports ?? {}) };
  const v = tally ? (tally.v ?? 1) : TALLY_VERSION;
  if (result.status === 'void') {
    all.void = Math.max(0, all.void - 1);
    return { all, days, sports, v };
  }
  all[result.status] = Math.max(0, all[result.status] - 1);
  all.staked = round2(all.staked - bet.stake);
  all.profit = round2(all.profit - result.profit);
  const key = etDate(bet.start);
  if (days[key]) {
    const d = [...days[key]];
    const at = ['won', 'lost', 'push'].indexOf(result.status);
    d[at] = Math.max(0, d[at] - 1);
    d[3] = round2(d[3] - bet.stake);
    d[4] = round2(d[4] - result.profit);
    days[key] = d;
  }
  const sport = sportOf(bet);
  if (sport && sports[key]?.[sport] !== undefined) sports[key] = { ...sports[key], [sport]: round2(sports[key][sport] - result.profit) };
  return { all, days, sports, v };
}

// (outcomeOf kept in reach: the bettor's own rule for a result's profit)
export { outcomeOf };

// ---------------------------------------------------------------------------
// Tallies and leaderboards
// ---------------------------------------------------------------------------

// (the day a game's filed under: its start's day in US Eastern time, "2026-10-11")
export function etDate(t) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(t));
  const get = (k) => parts.find((p) => p.type === k)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// A tally's shape's version: 2 adds `sports` (each day's profit by sport, the wallet's chart's lines). A tally
// begun at 2 has every bet in its sports; an older one is filled in once by the settler (settle.mjs
// upgradeTallies, from the bets' documents) and marked 2
export const TALLY_VERSION = 2;

// (a bet's sport as the tally files it: a parlay's 'parlay')
const sportOf = (bet) => (bet.kind === 'parlay' ? 'parlay' : bet.sport) || null;

// A tally with one more settled bet in it: lifetime (all), its game's day (days: [won, lost, push, staked,
// profit]) and that day's profit by its sport (sports: { day: { nfl: 1.5, parlay: -2 } }); a void counts only
// as a void. (A new tally starts at TALLY_VERSION; an older one keeps its version till it's filled in)
export function addToTally(tally, bet, result) {
  const all = { won: 0, lost: 0, push: 0, void: 0, staked: 0, profit: 0, ...(tally?.all ?? {}) };
  const days = { ...(tally?.days ?? {}) };
  const sports = { ...(tally?.sports ?? {}) };
  const v = tally ? (tally.v ?? 1) : TALLY_VERSION;
  if (result.status === 'void') {
    all.void++;
    return { all, days, sports, v };
  }
  all[result.status]++;
  all.staked = round2(all.staked + bet.stake);
  all.profit = round2(all.profit + result.profit);
  const key = etDate(bet.start);
  const d = [...(days[key] ?? [0, 0, 0, 0, 0])];
  d[['won', 'lost', 'push'].indexOf(result.status)]++;
  d[3] = round2(d[3] + bet.stake);
  d[4] = round2(d[4] + result.profit);
  days[key] = d;
  const sport = sportOf(bet);
  if (sport) sports[key] = { ...(sports[key] ?? {}), [sport]: round2((sports[key]?.[sport] ?? 0) + result.profit) };
  return { all, days, sports, v };
}

// An older tally's sports, from its owner's settled bets' documents (each bet's profit on its game's day, by its
// sport; voids out): the one-time fill (settle.mjs upgradeTallies). A bet cleared from the history is in the
// tally's days but can't be here: the chart's sport lines leave it out, its total line doesn't
export function sportsOfBets(bets) {
  const sports = {};
  for (const bet of bets) {
    if (!['won', 'lost', 'push'].includes(bet.status)) continue;
    const sport = sportOf(bet);
    if (!sport || !bet.start) continue;
    const key = etDate(bet.start);
    sports[key] = { ...(sports[key] ?? {}), [sport]: round2((sports[key]?.[sport] ?? 0) + (Number(bet.profit) || 0)) };
  }
  return sports;
}

// The leaderboards' periods at a moment: this week (Monday to Sunday, US Eastern), the season (August 1 on),
// all time; each its first day and its name
export function periodsAt(now) {
  const today = etDate(now);
  const [y, m, d] = today.split('-').map(Number);
  const noon = Date.UTC(y, m - 1, d, 12);
  const weekday = (new Date(noon).getUTCDay() + 6) % 7;
  const monday = new Date(noon - weekday * DAY).toISOString().slice(0, 10);
  const seasonYear = m >= 8 ? y : y - 1;
  return {
    week: { from: monday, label: `Week of ${new Date(`${monday}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}` },
    season: { from: `${seasonYear}-08-01`, label: `${seasonYear}-${String(seasonYear + 1).slice(2)} season` },
    all: { from: '0000-00-00', label: 'All time' },
  };
}

// (a leaderboard's photo: an address, never an upload's data, which would swell the board past a document's size)
const boardPhoto = (photo) => (photo && typeof photo.url === 'string' && !photo.url.startsWith('data:') ? { kind: photo.kind, url: photo.url } : null);

// A period's leaderboard: the public players (their bet history public) with a settled bet in it, by profit
// (then the return on their stakes), the top 50; each row with its reloads (the wallet's resets: a record
// built over several bankrolls says so beside it)
export function leaderboard(entries, from, limit = 50) {
  const rows = [];
  for (const { uid, profile, tally, wallet } of entries) {
    if (profile?.visibility?.betHistory !== 'public' || !profile.username) continue;
    const t = { won: 0, lost: 0, push: 0, staked: 0, profit: 0 };
    for (const [day, [won, lost, push, staked, profit]] of Object.entries(tally?.days ?? {})) {
      if (day < from) continue;
      t.won += won;
      t.lost += lost;
      t.push += push;
      t.staked += staked;
      t.profit += profit;
    }
    if (!(t.won + t.lost + t.push)) continue;
    rows.push({
      uid,
      username: profile.username,
      displayName: profile.displayName ?? profile.username,
      photo: boardPhoto(profile.photo),
      won: t.won,
      lost: t.lost,
      push: t.push,
      staked: round2(t.staked),
      profit: round2(t.profit),
      roi: t.staked ? Math.round((t.profit / t.staked) * 1e4) / 1e4 : null,
      reloads: Math.max(0, Math.floor(Number(wallet?.resets) || 0)),
    });
  }
  return rows.sort((a, b) => b.profit - a.profit || (b.roi ?? 0) - (a.roi ?? 0) || a.username.localeCompare(b.username)).slice(0, limit);
}

// ---------------------------------------------------------------------------
// You vs the Bot: same game, same bet. Each settled straight bet carries the bot's own call on that market as
// the board showed it when the bet was placed (bot: { side, line, price, units, kelly, forced, status, profit }),
// written here by the Admin SDK, never by the browser (firestore.rules: a bet's update is the settler's alone).
// A parlay carries none: the bot never makes one, and its legs' duels would count one bet many times over.
// ---------------------------------------------------------------------------

// (a placement's look-back: the newest board row from before it, its last showing at most this long before)
export const BOT_LOOKBACK = 6 * 36e5;
// (the desk's stake scale: run.mjs EV_SCALE, desk.mjs stakeFor's)
const BOT_EV_SCALE = 0.08;

// The bot's side at a bet's placement: from the board's rows for the game (board.mjs botSeenUpdate's: key
// "market|stat|athlete" -> [from, to, side, line, price, kelly]), the row showing then, else the newest one
// before it last shown within BOT_LOOKBACK; none, null. Its stake: the bet the bot really had open on that
// market's side by then at its own units (forced: false), else its Kelly-sized units (desk.mjs stakeFor: 0.5 at
// no edge or less, up to 3), at most 1 on a prop type or UFC market its trust hasn't cleared (no tested bet on
// it in the ledger), forced: true. ledgerBets: the bettor's bets on the game
export function botPickAt(bet, rows, ledgerBets = []) {
  if (!bet || bet.kind === 'parlay' || !rows || typeof rows !== 'object') return null;
  const key = bet.market === 'prop' ? `prop|${bet.propType}|${bet.athlete}` : `${bet.market}||`;
  const list = Array.isArray(rows[key]) ? rows[key] : [];
  const placed = Date.parse(bet.placedAt);
  if (!Number.isFinite(placed)) return null;
  const before = list.filter((r) => Array.isArray(r) && r[0] <= placed).sort((a, b) => a[0] - b[0]);
  const row = before[before.length - 1];
  if (!row || placed - row[1] > BOT_LOOKBACK) return null;
  const [, , side, line, price, kelly] = row;
  if (!side || !Number.isFinite(price) || !Number.isFinite(kelly)) return null;
  const sameMarket = (b) => b.market === bet.market && (bet.market !== 'prop' || (b.propType === bet.propType && String(b.athlete) === String(bet.athlete)));
  const real = (ledgerBets ?? []).find((b) => sameMarket(b) && b.side === side && !b.void && b.intent !== 'track' && b.units > 0 && b.status !== 'void' && Date.parse(b.placedAt) <= placed);
  if (real) return { side, line: bet.market === 'ml' ? null : (real.line ?? line), price: Number.isFinite(real.odds) ? real.odds : price, units: real.units, kelly: round4(kelly), forced: false };
  const d = decimalOf(price);
  const ev = Math.max(0, kelly) * (d - 1);
  const frac = Math.min(ev / (d - 1), ((ev / d) * (1 + 100 / 110)) / (100 / 110));
  let units = Math.min(3, Math.max(0.5, Math.round((0.5 + (frac / (BOT_EV_SCALE / (100 / 110))) * 2.5) * 2) / 2));
  const capped = bet.market === 'prop' || bet.sport === 'mma';
  if (capped && !(ledgerBets ?? []).some((b) => sameMarket(b) && b.tested)) units = Math.min(units, 1);
  return { side, line: bet.market === 'ml' ? null : line, price, units, kelly: round4(kelly), forced: true };
}
const round4 = (v) => Math.round(v * 1e4) / 1e4;

// The bot's side graded beside the user's settled bet: the user's own result on the same side and line, the
// other side's mirror at the same line (won for lost, push for push), else its own side and line graded from
// the game (a moved line: desk.mjs settle, props.mjs settleProp; a UFC bout's moved line, not graded: null).
// profit: at the bot's units and price. A void bet, or none of the bot's: null
export function gradeBot(bet, result, bot, { game = null, propValue } = {}) {
  if (!bot || !result || result.status === 'void') return null;
  // (the other side of a spread at the same number is the line's negative: away +3.5 against home -3.5)
  const sameLine = bet.market === 'ml' || (bet.market === 'spread' && bot.side !== bet.side ? bot.line === -bet.line : bot.line === bet.line);
  const mirror = { won: 'lost', lost: 'won', push: 'push' };
  let status = null;
  if (sameLine) status = bot.side === bet.side ? result.status : mirror[result.status] ?? null;
  else if (bet.sport !== 'mma' && game?.final) {
    const mine = { ...bet, side: bot.side, line: bot.line, odds: bot.price, units: bot.units };
    const r = bet.market === 'prop' ? (propValue === undefined || propValue === null ? null : settleProp(mine, propValue)) : settleGame(mine, game);
    status = r && !r.void && ['won', 'lost', 'push'].includes(r.status) ? r.status : null;
  }
  if (!status) return null;
  return { ...bot, status, profit: status === 'won' ? toWin(bot.units, bot.price) : status === 'lost' ? -bot.units : 0 };
}
