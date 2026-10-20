// The CLV decay curve (DECISIONS.md D61): from the intraday history (intraday.mjs) and the archive's closes, the
// expected return at the fair close (D56's: Pinnacle's no-vig at the close where DraftKings' close snapshot saw it,
// else DraftKings' own) of DraftKings' price taken N hours before the start, by sport, market and side; for every
// side ("all": the Book's price itself) and for the sides the Bot's trust-0 lines bet ("gap": DraftKings' price
// past Pinnacle's no-vig at that same snapshot, D48), with the gap sides' results. Read only; it prices nothing.
import { readHistory } from './odds-history.mjs';
import { OFFSETS, readIntraday } from './intraday.mjs';

const HOUR = 36e5;
const TOL = 0.75 * HOUR;
const fin = Number.isFinite;
const dec = (o) => (o > 0 ? 1 + o / 100 : 1 + 100 / -o);
const imp = (o) => 1 / dec(o);
const nv = (a, b) => imp(a) / (imp(a) + imp(b));
const MK = { h2h: 'ml', spreads: 'spread', totals: 'total' };

// (the last row of a book and market at or before t)
function at(list, book, market, t) {
  let r = null;
  for (const x of list) {
    if (x.ts > t) break;
    if (x.book === book && x.market === market) r = x;
  }
  return r;
}

// The curve's cells for one sport: { [market]: { [h]: { all: tally, gap: tally, gapBy: { fav|dog|over|under: tally } } } }
export function curveOf(sport, { hist = readHistory(sport, { props: false }), intra = readIntraday(sport) } = {}) {
  const snaps = [...new Set(intra.snaps)].map((s) => Date.parse(s)).sort((a, b) => a - b);
  const nearest = (t) => {
    let lo = 0;
    let hi = snaps.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (snaps[m] < t) lo = m + 1;
      else hi = m;
    }
    const c = [snaps[lo - 1], snaps[lo]].filter(fin).sort((a, b) => Math.abs(a - t) - Math.abs(b - t))[0];
    return fin(c) && Math.abs(c - t) <= TOL ? c : null;
  };
  // (the closes: the archive's last kind 'c' rows a book and market)
  const closes = new Map();
  for (const l of hist.lines) if (l.kind === 'c') closes.set(`${l.oid}|${l.book}|${l.market}`, l);
  const cells = {};
  const tally = () => ({ n: 0, ev: 0, beat: 0, res: 0, won: 0, profit: 0, m: 0, pts: 0 });
  // (ev null: a moved line, no fair close at its own line; pts: the side's points better than the close's line)
  const add = (t, ev, y, odds, pts = null) => {
    if (fin(pts)) {
      t.m++;
      t.pts += pts;
    }
    if (fin(ev)) {
      t.n++;
      t.ev += ev;
      if (ev > 0) t.beat++;
    }
    if (y === 0 || y === 1) {
      t.res++;
      t.won += y;
      t.profit += y ? dec(odds) - 1 : -1;
    }
  };
  for (const [oid, list] of intra.rows) {
    const e = hist.events.get(oid);
    if (!e) continue;
    const start = Date.parse(e.t);
    const scored = fin(e.hs) && fin(e.as);
    for (const market of ['h2h', 'spreads', 'totals']) {
      const dkC = closes.get(`${oid}|dk|${market}`);
      if (!dkC) continue;
      const pinC = closes.get(`${oid}|pin|${market}`);
      const fairC = pinC && pinC.line === dkC.line && Date.parse(pinC.ts) <= Date.parse(dkC.ts) ? nv(pinC.a, pinC.b) : nv(dkC.a, dkC.b);
      for (const h of OFFSETS[sport]) {
        const snap = nearest(start - h * HOUR);
        if (!snap) continue;
        const dk = at(list, 'dk', market, snap);
        if (!dk || !fin(dk.a) || !fin(dk.b)) continue;
        // (a moved line has no close at its own: its expected return not read, as D56; its points against the close are)
        const same = market === 'h2h' || dk.line === dkC.line;
        const pin = at(list, 'pin', market, snap);
        const fairThen = pin && fin(pin.a) && fin(pin.b) && (market === 'h2h' || pin.line === dk.line) ? nv(pin.a, pin.b) : null;
        const cell = ((cells[MK[market]] ??= {})[h] ??= { all: tally(), gap: tally(), gapBy: {} });
        for (const first of [true, false]) {
          const odds = first ? dk.a : dk.b;
          const q = first ? fairC : 1 - fairC;
          const ev = same ? q * dec(odds) - 1 : null;
          const pts = market === 'h2h' ? null : market === 'spreads' ? (first ? 1 : -1) * (dk.line - dkC.line) : (first ? -1 : 1) * (dk.line - dkC.line);
          let y = null;
          if (scored) {
            const v = market === 'h2h' ? e.hs - e.as : market === 'spreads' ? e.hs + dk.line - e.as : e.hs + e.as - dk.line;
            y = v === 0 ? null : (v > 0) === first ? 1 : 0;
          }
          add(cell.all, ev, y, odds, fin(pts) ? Math.abs(pts) : null);
          // (a spread or total where the two books' lines differ: the side the Book's line gives the better number)
          const lineGap = market !== 'h2h' && pin && fin(pin.line) && pin.line !== dk.line ? (market === 'spreads' ? dk.line > pin.line : dk.line < pin.line) === first : false;
          if (lineGap) {
            add(cell.gap, ev, y, odds, pts);
            const cls = market === 'totals' ? (first ? 'over' : 'under') : market === 'spreads' ? ((first ? dk.line : -dk.line) < 0 ? 'fav' : 'dog') : imp(odds) >= 0.5 ? 'fav' : 'dog';
            add((cell.gapBy[`line-${cls}`] ??= tally()), ev, y, odds, pts);
          }
          if (fin(fairThen)) {
            const p = first ? fairThen : 1 - fairThen;
            if (p * dec(odds) - 1 > 0) {
              add(cell.gap, ev, y, odds, pts);
              const cls = market === 'totals' ? (first ? 'over' : 'under') : market === 'spreads' ? ((first ? dk.line : -dk.line) < 0 ? 'fav' : 'dog') : imp(odds) >= 0.5 ? 'fav' : 'dog';
              add((cell.gapBy[cls] ??= tally()), ev, y, odds, pts);
            }
          }
        }
      }
    }
  }
  return cells;
}

const pct = (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
const show = (t) => (t?.n || t?.m ? `${String(Math.max(t.n, t.m)).padStart(5)}${t.n ? ` ev ${pct(t.ev / t.n).padStart(6)} beat ${((t.beat / t.n) * 100).toFixed(0).padStart(3)}%` : ''}${t.m ? ` pts ${(t.pts / t.m >= 0 ? '+' : '') + (t.pts / t.m).toFixed(2)}` : ''}${t.res ? ` roi ${pct(t.profit / t.res).padStart(6)} (${t.res})` : ''}` : '    -');

export async function main(sports) {
  for (const sport of sports) {
    const cells = curveOf(sport);
    console.log(`\n${sport.toUpperCase()}: the expected return at the fair close of the Book's price N hours out (all sides, pts the mean size of the line's move to the close | the gap sides: past the sharp no-vig then, or the better number where the lines differ, pts their gain against the close)`);
    for (const [m, byH] of Object.entries(cells)) {
      for (const h of Object.keys(byH).map(Number).sort((a, b) => b - a)) {
        const c = byH[h];
        console.log(`  ${m.padEnd(6)} ${String(h).padStart(3)}h  all ${show(c.all)} | gap ${show(c.gap)} | ${Object.entries(c.gapBy).map(([k, t]) => `${k} ${show(t)}`).join(' | ')}`);
      }
    }
  }
}
