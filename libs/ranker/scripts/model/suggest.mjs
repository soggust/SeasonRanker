// The morning snapshot as a suggestion's price (DECISIONS.md D37, the owner, 2026-10-19): with the windows open a
// day ahead, the board shows every market as a suggestion from then on, every hourly run, and the Bot buys a fresh
// quote only when it is about to bet. Where the Book's free board carries prices (ESPN's NBA, NHL and MLB boards)
// the suggestions are priced off it; where it carries none (the NFL's), the day's morning snapshot (odds-history.mjs
// morning, 10 AM Eastern, D29) stands in for the suggestion alone. A row priced from it is marked (prop.snapshot)
// and is never bet, never tracked and never a CHECK's stored price (D30: a bet's price is the price offered the
// moment it is placed; the snapshot and the history price nothing that is placed). It is read here and nowhere
// else that prices a bet: run.mjs reads this file, never odds-history.mjs.
//
//   morningPrices  today's and yesterday's snapshot files (US Eastern days: a game after midnight sits in the day
//                  before's), the desk's book's props on the game by ESPN's id: Map "stat|name key" -> { line,
//                  over, under, at }; empty with no file, no match or no props
//   withSnapshot   the board's rows with no price of their own priced from the snapshot at the same line, marked
//                  snapshot: { at }; a row whose line has moved since the snapshot stays unpriced (the snapshot's
//                  price is for another line)

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { API_MARKETS } from './props.mjs';
import { nameKey } from './espn.mjs';
import { BOOK } from './leagues.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const ETD = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
// (the snapshot's book keys: the desk's own and Pinnacle's, as odds-history.mjs keeps them)
const BOOK_KEY = { draftkings: 'dk' }[BOOK] ?? 'dk';
export const snapshotFile = (sport, day) => path.join(ROOT, 'apps', sport, 'scripts/model/odds-history/morning', `${day}.jsonl.gz`);

// (the rows of a day's file: [] with none)
function rowsOf(file) {
  try {
    if (!existsSync(file)) return [];
    return gunzipSync(readFileSync(file)).toString('utf8').split('\n').filter(Boolean).map((s) => JSON.parse(s));
  } catch {
    return [];
  }
}

export function morningPrices(sport, game, now = Date.now()) {
  const out = new Map();
  const stats = API_MARKETS[sport] ?? {};
  const days = [ETD.format(new Date(now)), ETD.format(new Date(now - 864e5))];
  for (const day of days) {
    const rows = rowsOf(snapshotFile(sport, day));
    if (!rows.length) continue;
    const oid = rows.find((r) => r[0] === 'E' && String(r[2]) === String(game.id))?.[1];
    if (!oid) continue;
    for (const r of rows) {
      if (r[0] !== 'P' || r[1] !== oid || r[2] !== 'm' || r[4] !== BOOK_KEY) continue;
      const stat = stats[r[5]];
      if (!stat || !Number.isFinite(r[7]) || !Number.isFinite(r[8]) || !Number.isFinite(r[9])) continue;
      const k = `${stat}|${nameKey(r[6])}`;
      // (the main line: the one nearest even where a player has several rungs)
      const fair = Math.abs(1 / (r[8] > 0 ? r[8] / 100 + 1 : 100 / -r[8] + 1) - 0.5);
      const was = out.get(k);
      if (!was || fair < was.fairGap) out.set(k, { line: r[7], over: r[8], under: r[9], at: r[3], fairGap: fair });
    }
    if (out.size) break;
  }
  for (const v of out.values()) delete v.fairGap;
  return out;
}

export function withSnapshot(board_, snap) {
  if (!snap?.size) return board_;
  return board_.map((p) => {
    if (p.prices || p.stored) return p;
    const x = snap.get(`${p.stat.key}|${nameKey(p.athlete.name)}`);
    if (!x || x.line !== p.line) return p;
    return { ...p, prices: { over: x.over, under: x.under }, source: 'morning snapshot', snapshot: { at: x.at } };
  });
}
