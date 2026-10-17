// A UFC card on the Live tab, pure (tests/live-tab.test.mjs): ESPN's MMA scoreboard is one EVENT per card with
// each bout a COMPETITION of it (its fighters athletes, not teams, ordered 1 and 2 with no home or away; its
// status a round and the clock gone in it: "R2, 3:14"), so the boards' boardOf (one game per event, two teams)
// can't read it. Here each bout becomes a board of its own, keyed by the competition's id (the id the bettor's
// board.json and the user's bets carry), the fighter ordered 1 the home as board.json has it; the bettor's board
// lends a bout its matchup words and its start (ESPN gives a whole segment of the card one start, the board each
// bout its own). Its clock words ("R2 3:14", a finish "KO R1 2:05"), and a bet on it watched (the winner for a
// moneyline, the rounds gone against a round total)

import type { GameBoard, PlayBet } from '../account/wallet/wallet-math';
import { espnDay } from '../account/wallet/wallet-math';
import type { BetWatch } from './live-bets';
import { betWatch } from './live-bets';
import { startWords } from './live-games';

// (ESPN's MMA scoreboard, the parts read here)
export interface EspnMmaCompetitor {
  id: string;
  order?: number;
  winner?: boolean;
  athlete?: { displayName?: string; fullName?: string; shortName?: string; headshot?: { href?: string } };
  records?: { type?: string; summary?: string }[];
}
export interface EspnMmaCompetition {
  id: string;
  date?: string;
  startDate?: string;
  type?: { abbreviation?: string };
  competitors?: EspnMmaCompetitor[];
  status?: { clock?: number; displayClock?: string; period?: number; type?: { state?: string; name?: string; completed?: boolean; shortDetail?: string; detail?: string } };
  details?: { type?: { text?: string } }[];
  format?: { regulation?: { periods?: number } };
}
export interface EspnMmaScoreboard {
  events?: { id: string; name?: string; shortName?: string; competitions?: EspnMmaCompetition[] }[];
}

// (what a bout carries past a board: its card, weight class, round and clock gone, how it ended, who won, the
// fighters' records, and how many rounds it's scheduled for)
export interface FightInfo {
  card: string;
  cardId: string;
  weight: string | null;
  period: number | null;
  clock: string | null;
  method: string | null;
  winner: 'home' | 'away' | null;
  records: [string | null, string | null];
  rounds: number;
}
export type LiveBout = GameBoard & { fight: FightInfo };

export const ROUND_SECONDS = 300;
const HEADSHOT = (id: string) => `https://a.espncdn.com/i/headshots/mma/players/full/${id}.png`;

// (how a bout ended, from ESPN's details ("Unofficial Winner Submission", "Winner KO/TKO", "Unofficial Winner
// Decision - Split"), short: KO, TKO, SUB, DEC, SPLIT DEC, MAJ DEC, DQ, NC, DRAW; null when none says)
export function fightMethod(details: EspnMmaCompetition['details']): string | null {
  const t = (details ?? []).map((d) => d.type?.text ?? '').find((x) => /winner|draw|no contest|disqualif/i.test(x));
  if (!t) return null;
  if (/no contest/i.test(t)) return 'NC';
  if (/draw/i.test(t)) return 'DRAW';
  if (/disqualif|\bdq\b/i.test(t)) return 'DQ';
  if (/sub/i.test(t)) return 'SUB';
  if (/dec/i.test(t)) return /split/i.test(t) ? 'SPLIT DEC' : /majority/i.test(t) ? 'MAJ DEC' : 'DEC';
  if (/tko|technical/i.test(t)) return 'TKO';
  if (/ko|knock/i.test(t)) return /tko/i.test(t) ? 'TKO' : 'KO';
  return null;
}

// Every bout on the card(s) as a board: the fighters (ordered 1 the home), headshots, state, the clock's words
// in detail, and the fight's own facts. The bettor's boards by bout id lend the matchup and the start
export function mmaBouts(body: EspnMmaScoreboard | null | undefined, boards: ReadonlyMap<string, Pick<GameBoard, 'matchup' | 'start' | 'away' | 'home'>> = new Map()): LiveBout[] {
  const out: LiveBout[] = [];
  for (const e of body?.events ?? []) {
    for (const c of e.competitions ?? []) {
      const cs = c.competitors ?? [];
      if (cs.length !== 2) continue;
      const home = cs.find((x) => x.order === 1) ?? cs[0];
      const away = cs.find((x) => x !== home)!;
      const st = c.status?.type ?? {};
      const off = /postponed|cancel/i.test(st.name ?? '');
      // (ESPN's walkouts or a break between rounds read as under way even if a status says pre)
      const active = st.state === 'in' || (st.state !== 'post' && /walk|end of round|between rounds/i.test(`${st.name ?? ''} ${st.detail ?? ''} ${st.shortDetail ?? ''}`));
      const state: GameBoard['state'] = active && !off ? 'in' : st.state === 'post' || off ? 'post' : 'pre';
      const model = boards.get(String(c.id));
      const side = (x: EspnMmaCompetitor, m: GameBoard['away'] | undefined) => {
        const name = x.athlete?.displayName ?? x.athlete?.fullName ?? m?.name ?? '';
        return { abbr: m?.abbr ?? name, name, logo: m?.logo ?? x.athlete?.headshot?.href ?? (x.id ? HEADSHOT(x.id) : null), score: null };
      };
      const a = side(away, model?.away);
      const h = side(home, model?.home);
      const winner = home.winner ? 'home' : away.winner ? 'away' : null;
      const rec = (x: EspnMmaCompetitor) => x.records?.find((r) => r.type === 'total')?.summary ?? x.records?.[0]?.summary ?? null;
      const period = Number(c.status?.period);
      const clock = c.status?.displayClock && c.status.displayClock !== '-' ? c.status.displayClock : null;
      out.push({
        sport: 'mma',
        event: String(c.id),
        matchup: model?.matchup ?? `${a.name} @ ${h.name}`,
        start: model?.start ?? c.startDate ?? c.date ?? '',
        state,
        detail: st.shortDetail ?? st.detail ?? '',
        final: !!st.completed && !off,
        away: a,
        home: h,
        book: null,
        spread: null,
        total: null,
        ml: null,
        fight: {
          card: e.shortName ?? e.name ?? '',
          cardId: String(e.id),
          weight: c.type?.abbreviation ?? null,
          period: Number.isFinite(period) && period > 0 ? period : null,
          clock,
          method: state === 'post' ? fightMethod(c.details) : null,
          winner,
          records: [rec(away), rec(home)],
          rounds: c.format?.regulation?.periods ?? 3,
        },
      });
    }
  }
  return out;
}

// (a clock "3:14" in seconds; null for anything else)
const secs = (clock: string | null): number | null => {
  const m = String(clock ?? '').match(/^(\d+):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// How many rounds a bout has gone: the rounds before this one and the share of this one gone (ESPN's clock is
// the time gone in the round); a decision the full distance; null when the clock can't be read
export function fightRounds(b: Pick<LiveBout, 'state' | 'fight'>): number | null {
  const f = b.fight;
  if (b.state === 'pre') return 0;
  if (b.state === 'post' && /DEC|DRAW/.test(f.method ?? '')) return f.rounds;
  if (f.period === null) return null;
  const s = secs(f.clock);
  if (s === null) return b.state === 'post' ? null : f.period - 1;
  return f.period - 1 + Math.min(ROUND_SECONDS, s) / ROUND_SECONDS;
}

// A bout's clock as the card says it: to come, its start ("9:45 PM"); under way, "R2 3:14" (ESPN's "R2, 3:14";
// between rounds as ESPN words it); over, how it ended and when, "KO R1 2:05", a decision "DEC", no method
// "FINAL R3 4:19"
export function fightWords(b: Pick<LiveBout, 'state' | 'start' | 'detail' | 'fight'>, now = Date.now()): string {
  if (b.state === 'pre') return startWords(b.start, now);
  const f = b.fight;
  const at = f.period ? `R${f.period}${f.clock ? ` ${f.clock}` : ''}` : '';
  if (b.state === 'in') {
    const d = b.detail.trim().replace(/,\s*/g, ' ');
    return (/^R\d/i.test(d) ? d : d && !/^in progress$/i.test(d) ? d : at || 'Live').toUpperCase();
  }
  if (f.method && /DEC|DRAW|NC/.test(f.method)) return f.method;
  return `${f.method ?? 'FINAL'}${at ? ` ${at}` : ''}`;
}

const pct = (v: number) => Math.max(0, Math.min(100, v));
const r1 = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

// A bet on a bout, watched: before it, pending (as any game's); a moneyline under way LIVE (no score to lean
// on), over WON or LOST by the winner (a draw or no contest a PUSH); a round total by the rounds gone against its
// line, decided the moment the fight passes it (an over won, an under lost) or once it ends short of it
export function fightWatch(bet: PlayBet, b: LiveBout, now = Date.now()): BetWatch {
  if (b.state === 'pre') return betWatch(bet, null, null, now);
  const f = b.fight;
  const name = (side: string | undefined) => (side === 'home' ? b.home.name : b.away.name).split(/\s+/).pop() ?? '';
  const where = fightWords(b, now);
  if (bet.market === 'total') {
    const line = bet.line ?? 2.5;
    const gone = fightRounds(b);
    const span = Math.max(f.rounds, line + 0.5);
    const meter = { fill: pct(((gone ?? 0) / span) * 100), tick: pct((line / span) * 100), proj: null };
    const over = bet.side === 'over';
    const value = gone === null ? null : Math.round(gone * 10) / 10;
    if (gone !== null && gone > line) return { ...meter, status: over ? 'WON' : 'LOST', tone: over ? 'good' : 'bad', left: `${r1(value!)} rounds`, right: over ? 'Past the line' : 'Went the distance', value };
    if (b.state === 'post') {
      if (gone === null) return { ...meter, status: 'FINAL', tone: 'wait', left: where, right: '', value };
      return { ...meter, status: over ? 'LOST' : 'WON', tone: over ? 'bad' : 'good', left: `Ended ${where}`, right: over ? 'Fell short' : 'Under the line', value };
    }
    return { ...meter, status: over ? 'NEEDS TIME' : 'HOLDING', tone: over ? 'close' : 'good', left: where, right: `Line ${line} rounds`, value };
  }
  if (bet.market === 'ml') {
    const meter = { fill: 50, tick: 50, proj: null };
    if (b.state === 'post') {
      if (!f.winner) return { ...meter, status: /DRAW|NC/.test(f.method ?? '') ? 'PUSH' : 'FINAL', tone: 'close', left: where, right: '', value: null };
      const won = f.winner === bet.side;
      return { ...meter, fill: won ? 100 : 0, status: won ? 'WON' : 'LOST', tone: won ? 'good' : 'bad', left: where, right: `${name(f.winner)} wins`, value: null };
    }
    return { ...meter, status: 'LIVE', tone: 'close', left: where, right: `${name(bet.side)} fighting`, value: null };
  }
  return { fill: 0, tick: 50, proj: null, status: b.state === 'post' ? 'FINAL' : 'LIVE', tone: 'wait', left: where, right: '', value: null };
}

// Tonight's bouts: every bout of a card with a bout on, or a bout on ESPN's day today, or a bout begun in the last
// eight hours (a main event run past midnight Eastern keeps its card, the earlier bouts with it)
export function tonightBouts<T extends Pick<LiveBout, 'state' | 'start' | 'fight'>>(bouts: T[], now: number): T[] {
  const today = espnDay(now);
  const on = new Set<string>();
  for (const b of bouts) {
    const t = Date.parse(b.start);
    if (b.state === 'in' || espnDay(b.start) === today || (b.state !== 'pre' && now - t < 8 * 3600e3)) on.add(b.fight.cardId);
  }
  return bouts.filter((b) => on.has(b.fight.cardId));
}
