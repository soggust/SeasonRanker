// The Live tab's games, pure (no Angular: tests/live-tab.test.mjs runs it under Node): today's games off the
// boards the page already holds (ESPN's scoreboards, lines.service), how far along each is from its clock, its
// clock as the card's words, the win-probability sparkline drawn as far as the game has gone, and the bot's read
// on a game from the board's picks

import { espnDay } from '../account/wallet/wallet-math';

export type GameState = 'pre' | 'in' | 'post';

// (a game as the Live tab needs it off a GameBoard: nothing of its lines)
export interface LiveGameIn {
  sport: string;
  event: string;
  matchup: string;
  start: string;
  state: GameState;
  detail: string;
  final: boolean;
}

// (how long each sport's regulation period runs, in seconds, how many there are, and its overtime's length (the
// regular season's); baseball goes by innings instead)
const PERIODS: Record<string, { n: number; length: number; ot: number }> = {
  nba: { n: 4, length: 720, ot: 300 },
  nfl: { n: 4, length: 900, ot: 600 },
  nhl: { n: 3, length: 1200, ot: 300 },
};

// (an ordinal's number: "3rd" 3, "OT" the first overtime, "2OT" the second; null for anything else)
export function periodNumber(word: string, sport: string): number | null {
  const w = word.trim();
  const m = w.match(/^(\d+)(?:st|nd|rd|th)$/i);
  if (m) return Number(m[1]);
  const reg = PERIODS[sport]?.n ?? 4;
  if (/^OT$/i.test(w)) return reg + 1;
  const ot = w.match(/^(\d+)OT$/i);
  if (ot) return reg + Number(ot[1]);
  return null;
}

// (a clock's seconds: "4:12" 252, "0:48.3" 48.3; null for anything else)
export function clockSeconds(clock: string | null | undefined): number | null {
  const m = String(clock ?? '')
    .trim()
    .match(/^(\d+):(\d{2}(?:\.\d+)?)$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// What ESPN's scoreboard says of a game's clock (shortDetail: "4:12 - 3rd", "Halftime", "End of 1st", "Top 5th",
// "Final/OT"), read into its period and the seconds left in it (0 at a period's end or the half), or baseball's
// inning and half. Null where it says nothing the share can use
export interface ClockRead {
  period: number;
  // (seconds left in the period; null for baseball)
  left: number | null;
  // (baseball: which half of the inning)
  half: 'top' | 'mid' | 'bot' | 'end' | null;
}
export function readDetail(sport: string, detail: string): ClockRead | null {
  const d = detail.trim();
  if (sport === 'mlb') {
    const m = d.match(/^(Top|Mid|Bot|Bottom|End)\s+(\d+)(?:st|nd|rd|th)?$/i);
    if (!m) return null;
    const half = m[1].toLowerCase().slice(0, 3) as 'top' | 'mid' | 'bot' | 'end';
    return { period: Number(m[2]), left: null, half };
  }
  const reg = PERIODS[sport]?.n ?? 4;
  if (/^half(time)?$/i.test(d)) return { period: Math.ceil(reg / 2), left: 0, half: null };
  const end = d.match(/^End(?: of)?\s+(\S+)$/i);
  if (end) {
    const p = periodNumber(end[1], sport);
    return p === null ? null : { period: p, left: 0, half: null };
  }
  const m = d.match(/^(\d+:\d{2}(?:\.\d+)?)\s*-\s*(\S+)$/);
  if (m) {
    const p = periodNumber(m[2], sport);
    const left = clockSeconds(m[1]);
    return p === null || left === null ? null : { period: p, left, half: null };
  }
  return null;
}

// How much of a game has been played, 0 to 1: from its period and the seconds left in it (a period past
// regulation an overtime, the regular season's length), or baseball's inning and half over nine (or as many as
// it's gone to). Before the start 0, over 1; null where the clock can't be read
export function gameShare(sport: string, state: GameState, period: number | null, left: number | null, half: ClockRead['half'] = null): number | null {
  if (state === 'pre') return 0;
  if (state === 'post') return 1;
  if (period === null || period < 1) return null;
  if (sport === 'mlb') {
    const innings = Math.max(9, period);
    const inInning = half === 'top' ? 0 : half === 'mid' ? 0.5 : half === 'bot' ? 0.5 : half === 'end' ? 1 : 0;
    return Math.min(1, (period - 1 + inInning) / innings);
  }
  const p = PERIODS[sport];
  if (!p || left === null) return null;
  const regulation = p.n * p.length;
  if (period <= p.n) {
    const played = (period - 1) * p.length + (p.length - Math.min(p.length, Math.max(0, left)));
    return Math.min(1, played / regulation);
  }
  // (overtime: the whole regulation and each extra period count as the game grows)
  const extra = period - p.n;
  const total = regulation + extra * p.ot;
  const played = regulation + (extra - 1) * p.ot + (p.ot - Math.min(p.ot, Math.max(0, left)));
  return Math.min(1, played / total);
}

// (a board game's share, from its scoreboard detail)
export function boardShare(g: Pick<LiveGameIn, 'sport' | 'state' | 'detail'>): number | null {
  if (g.state !== 'in') return gameShare(g.sport, g.state, null, null);
  const read = readDetail(g.sport, g.detail);
  return read ? gameShare(g.sport, 'in', read.period, read.left, read.half) : null;
}

// A game's clock as the card says it, in caps: "3RD 4:12", "HALFTIME", "END 1ST", "TOP 5TH"; a final "FINAL" (or
// "FINAL/OT" as ESPN says it); a game to come, its start ("7:00 PM", the viewer's clock)
export function clockWords(g: Pick<LiveGameIn, 'state' | 'detail' | 'start'>, now = Date.now()): string {
  if (g.state === 'pre') return startWords(g.start, now);
  const d = g.detail.trim();
  if (g.state === 'post') return (d || 'Final').toUpperCase();
  const m = d.match(/^(\d+:\d{2}(?:\.\d+)?)\s*-\s*(\S+)$/);
  if (m) return `${m[2]} ${m[1]}`.toUpperCase();
  const end = d.match(/^End(?: of)?\s+(\S+)$/i);
  if (end) return `END ${end[1]}`.toUpperCase();
  return (d || 'Live').toUpperCase();
}

// (a start as the clock reads it: "7:00 PM"; a start on another day with its weekday, "Sun 7:00 PM")
export function startWords(start: string, now = Date.now()): string {
  const d = new Date(start);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return espnDay(d) === espnDay(now) ? time : `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`;
}

// The LED board's label while a game's on: the period and clock as the modal says them ("3RD QTR · 4:12", a
// hockey "2ND PER · 11:40", an overtime "OT · 4:12", baseball's "TOP 6TH"); a period's end or the half as ESPN
// says it ("HALFTIME", "END OF 1ST"); null before it starts or once it's over
export function boardLabel(sport: string, state: GameState, period: number | null, clock: string | null, detail: string): string | null {
  if (state !== 'in') return null;
  const d = detail.trim();
  if (sport === 'mlb') {
    const read = readDetail(sport, d);
    return read ? d.toUpperCase() : 'LIVE';
  }
  const seconds = clockSeconds(clock);
  if (period === null || period < 1 || seconds === null || seconds === 0 || /^half|^end/i.test(d)) return (d || 'Live').toUpperCase();
  const reg = PERIODS[sport]?.n ?? 4;
  const name = period <= reg ? `${ordinalWord(period)} ${sport === 'nhl' ? 'PER' : 'QTR'}` : period === reg + 1 ? 'OT' : `${period - reg}OT`;
  return `${name} · ${clock}`;
}

const ordinalWord = (n: number): string => `${n}${n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH'}`;

// Today's games off the boards the page holds: every game under way, and the ones on ESPN's day today (US
// Eastern) still to come or over; the bettor's own board's games (a UFC bout, no scoreboard) left out, as any
// game ESPN has no scoreboard for. Under way first, then to come by their start, the finished last
export function todayGames<T extends LiveGameIn>(boards: Iterable<T>, now: number, sports: readonly string[]): T[] {
  const today = espnDay(now);
  const order = { in: 0, pre: 1, post: 2 };
  return [...boards]
    .filter((g) => sports.includes(g.sport) && !/^Started$/i.test(g.detail) && (g.state === 'in' || espnDay(g.start) === today))
    .sort((a, b) => order[a.state] - order[b.state] || a.start.localeCompare(b.start) || a.matchup.localeCompare(b.matchup));
}

// The card's state from today's games: games on now, none on but some to come, or none left at all; and the
// first start still to come (for "First tip-off at")
export function cardState(games: LiveGameIn[]): { state: 'live' | 'upcoming' | 'done'; firstStart: string | null } {
  const live = games.some((g) => g.state === 'in');
  const pre = games.filter((g) => g.state === 'pre').sort((a, b) => a.start.localeCompare(b.start));
  return { state: live ? 'live' : pre.length ? 'upcoming' : 'done', firstStart: pre[0]?.start ?? null };
}

// The win-probability sparkline: the home team's chance after each play (0-1) as a path across a 300 by 26
// box, drawn only as far as the game has gone (share), the middle line at 13, up is home. Empty under two points
export function sparkPath(points: number[], share: number | null): string {
  if (points.length < 2) return '';
  const span = 300 * Math.max(0.02, Math.min(1, share ?? 1));
  const n = points.length - 1;
  return points.map((p, i) => `${i ? 'L' : 'M'}${((i / n) * span).toFixed(1)} ${Math.max(2, Math.min(24, 13 - (p - 0.5) * 22)).toFixed(1)}`).join(' ');
}

// The bot's read on a game, from the board's picks on it: its best bet (the first, the board's order: its band
// then its Kelly score) as "Thunder −5.5 · LIKE"; the bot passing on every market it priced, "pass"; no picks at
// all, null
export function botRead(picks: { pick: string; confidence?: string | null; strength?: string | null }[]): string | null {
  if (!picks.length) return null;
  const bet = picks.find((p) => p.strength !== 'fade' && p.confidence && p.confidence !== 'low' && p.confidence !== 'check');
  if (!bet) return 'pass';
  const band = bet.confidence === 'lock' ? 'LOCK' : bet.confidence === 'high' ? 'LOVE' : 'LIKE';
  return `${bet.pick} · ${band}`;
}

// (a team's short name off its display name: "Boston Celtics" → "Celtics"; a city alone stays)
export function shortTeam(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return name;
  // (a two-word nickname: "Trail Blazers", "Red Sox", "Blue Jays", "Maple Leafs", "Golden Knights", "Red Wings", "White Sox")
  const two = words.slice(-2).join(' ');
  if (/^(Trail Blazers|Red Sox|Blue Jays|Maple Leafs|Golden Knights|Red Wings|White Sox|Blue Jackets)$/i.test(two)) return two;
  return words[words.length - 1];
}
