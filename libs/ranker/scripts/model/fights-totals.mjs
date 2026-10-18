// Round totals, fights-totals.mjs (the MMA desk's second market, the owner, 2026-10-17: "add whatever MMA bets we
// can get"): the chance a bout goes past its line of rounds, The Odds API's `totals` on mma_mixed_martial_arts
// (O/U 2.5 rounds mostly; 1.5, 3.5 or 4.5 on some bouts). A line of L rounds is passed when the bout lasts more
// than L x 5 minutes: Over 2.5 wins once it passes 2:30 of the third round (the books' rule), a finish at that
// second or before is Under. A no contest or a draw before the line is void (a draw is always at the distance, so
// it only voids where the line is the whole bout, which no book posts).
//
// The model: a logistic over terms both fighters' together (fights-model.mjs totalsTerms: their bouts gone the
// distance and their length, knockout and submission wins, knockout and submission losses (durability), finishing
// rate, recent stoppage losses, knockdowns, strike volume and defense, takedowns, submission attempts, the rating
// gap (a mismatch finishes), ages, layoffs, experience, the weight class (pounds, heavyweight, women)), each a
// point-in-time number from the bouts before (sideNumbers), centred on the training rows' mean. The line and the
// scheduled rounds are the intercepts (one a line and rounds: 1.5 or 2.5 of three, 1.5 to 4.5 of five; five rounds
// is the intercepts' term), every bout a row at each line its rounds can carry, the rows of one bout weighing 1 in
// all (w: 1 / its lines), so the fit is a proportional-odds survival: one finishing tendency, a line's own base.
// Soft terms as the moneyline's (fights-model.mjs fitSoft: each weight shrunk by 1 - 1/z^2 of its weaker half,
// nothing where the halves disagree); the intercepts are refit with the soft weights in place, so the base rates
// stay the training rows' own. Refit every run (seconds).
//
// The backtest walks forward over the last three years by half-year, each half scored by a fit on the bouts before
// it alone, against two base rates fit on the same rows: the line's (its rounds' share past it) and the weight
// class's (the line's share in that division, pulled to the line's by 30 bouts' worth); by division too.
//
// Pricing (mma-desk.mjs): the book's line (BOOK's main pair: the point both sides are posted at, the one nearest
// even if it lists more) against the fair chance of Over at that point: Pinnacle's pair, the vig out, where it
// posts the same point; else the listed book with the smallest vig at that point (TOTAL_BOOKS); else the book's
// own. TRACKED ONLY until TOTAL_LIVE bets are graded with a close (desk.mjs fitTrust's evidence), then the trust
// path, as the moneyline's.
import { FIT_LEAGUES, TOTAL_KEYS, TOTAL_TERMS, fitLogistic, score } from './fights-model.mjs';
import { chanceAt, decimal, fairPair, gapGuard, placement, stakeFor } from './desk.mjs';
import { BOOK, LEAGUES } from './leagues.mjs';
import { SHARP, american } from './oddsapi.mjs';
import { round } from './ratings.mjs';

const ROUND_SECS = 300;
// (the lines a bout of its rounds carries, and the intercept's key for each)
export const TOTAL_LINES = { 3: [1.5, 2.5], 5: [1.5, 2.5, 3.5, 4.5] };
export const baseKey = (line, rounds) => `l${rounds}_${Math.round(line * 10)}`;
const BASE_KEYS = Object.entries(TOTAL_LINES).flatMap(([r, lines]) => lines.map((l) => baseKey(l, Number(r))));
// (the books the ask names (one region's 10 at most, so one region's cost): the book and Pinnacle, and the others
// that post MMA totals (probed 2026-10-17), any one of them the fair anchor where Pinnacle doesn't post the point)
export const TOTAL_BOOKS = [BOOK, SHARP, 'williamhill_us', 'betonlineag', 'betus', 'coolbet', 'betanysports'];
// (tracked only until this many total bets are graded with a close; the edge, the moneyline's)
export const TOTAL_LIVE = 40;
const EV_SCALE = 0.08;
const UNTESTED_MAX = 1;
const CLAMP = [0.03, 0.97];
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const logit = (p) => Math.log(p / (1 - p));
const clamp = (p) => Math.min(CLAMP[1], Math.max(CLAMP[0], p));

// Whether a bout of secs seconds went past a line
export const pastLine = (secs, line) => secs > line * ROUND_SECS;

// (a division's group, for the base rate by weight class: the catchweights together, men's and women's apart)
export const classOf = (division) => {
  const d = String(division ?? '').trim();
  if (!d || /catch/i.test(d)) return /^W\b/.test(d) ? 'W Catch Weight' : 'Catch Weight';
  return d;
};

// The rows the totals learn from: the moneyline's promotions, both fighters with a bout before, a known length, no
// no contest; each bout once at every line its rounds carry, its rows weighing 1 in all
export function totalRows(rows) {
  const out = [];
  for (const r of rows) {
    if (!FIT_LEAGUES.has(r.league) || !r.experienced || r.secs === null || r.secs === undefined || r.method === 'NC' || !r.tx) continue;
    const lines = TOTAL_LINES[r.rounds];
    if (!lines) continue;
    for (const line of lines) out.push({ id: r.id, date: r.date, rounds: r.rounds, line, division: classOf(r.division), tx: r.tx, y: pastLine(r.secs, line) ? 1 : 0, w: 1 / lines.length });
  }
  return out;
}

// (a row's terms for the fit: its intercept's dummy, the totals' terms centred on the training rows' means)
const design = (r, means, tkeys = TOTAL_KEYS) => {
  const x = Object.fromEntries(BASE_KEYS.map((k) => [k, 0]));
  x[baseKey(r.line, r.rounds)] = 1;
  for (const k of tkeys) x[k] = (r.tx[k] ?? 0) - means[k];
  return x;
};

// The soft fit (see the header) over totalRows
export function fitTotals(trows, tkeys = TOTAL_KEYS) {
  const sorted = [...trows].sort((a, b) => a.date.localeCompare(b.date));
  const wsum = sorted.reduce((s, r) => s + r.w, 0) || 1;
  const means = Object.fromEntries(tkeys.map((k) => [k, round(sorted.reduce((s, r) => s + r.w * (r.tx[k] ?? 0), 0) / wsum, 5)]));
  const rows = sorted.map((r) => ({ ...r, x: design(r, means, tkeys) }));
  const keys = [...BASE_KEYS, ...tkeys];
  const full = fitLogistic(rows, keys);
  // (the halves by bout, not by row: a bout's lines in one half)
  const ids = [...new Set(rows.map((r) => r.id))];
  const cut = new Set(ids.slice(0, Math.floor(ids.length / 2)));
  const h1 = fitLogistic(rows.filter((r) => cut.has(r.id)), keys);
  const h2 = fitLogistic(rows.filter((r) => !cut.has(r.id)), keys);
  const terms = tkeys.map((key) => {
    const j = keys.indexOf(key);
    const agree = Math.sign(h1.w[j]) === Math.sign(h2.w[j]) && Math.sign(h1.w[j]) === Math.sign(full.w[j]) && full.w[j] !== 0;
    const z = agree ? Math.min(Math.abs(h1.z[j]), Math.abs(h2.z[j])) : 0;
    const soft = z > 1 ? Math.max(0, 1 - 1 / (z * z)) : 0;
    return { key, w: round(full.w[j], 4), se: round(full.se[j], 4), z: round(full.z[j], 2), halves: [round(h1.w[j], 4), round(h2.w[j], 4)], zHalf: round(z, 2), soft: round(soft, 3), weight: round(full.w[j] * soft, 4), scale: round(full.scale[j], 5) };
  });
  // (the intercepts refit with the soft weights in place: a line's base rate its rows' own)
  const offset = (r) => terms.reduce((s, t) => s + (t.weight ? (t.weight * r.x[t.key]) / t.scale : 0), 0);
  const base = {};
  for (const bk of BASE_KEYS) {
    const inB = rows.filter((r) => r.x[bk] === 1).map((r) => [offset(r), r.y]);
    if (inB.length < 20) continue;
    const share = inB.reduce((s, [, y]) => s + y, 0) / inB.length;
    let b = logit(Math.min(0.99, Math.max(0.01, share)));
    for (let i = 0; i < 25; i++) {
      let g = 0;
      let h = 0;
      for (const [o, y] of inB) {
        const p = sigmoid(b + o);
        g += y - p;
        h += p * (1 - p);
      }
      const step = g / (h || 1);
      b += step;
      if (Math.abs(step) < 1e-8) break;
    }
    base[bk] = round(b, 5);
  }
  return { terms, means, base, n: ids.length, rows: rows.length, from: sorted[0]?.date ?? null, to: sorted.at(-1)?.date ?? null };
}

// The fit's chance a bout goes past a line (null where the line isn't one its rounds carry), and each term's part
export function predictTotal(fit, tx, line, rounds) {
  const b = fit.base[baseKey(line, rounds)];
  if (!Number.isFinite(b)) return null;
  let z = b;
  const parts = {};
  for (const t of fit.terms) {
    if (!t.weight) continue;
    const part = (t.weight * ((tx[t.key] ?? 0) - fit.means[t.key])) / t.scale;
    parts[t.key] = round(part, 4);
    z += part;
  }
  return { p: clamp(sigmoid(z)), base: round(sigmoid(b), 4), parts };
}

// The held-out backtest (see the header): the last three years by half-year
export function backtestTotals(rows, { now = new Date(), years = 3, keys = TOTAL_KEYS } = {}) {
  const all = totalRows(rows);
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const halves = [];
  const held = [];
  for (let i = years * 2; i >= 1; i--) {
    const from = new Date(end);
    from.setUTCMonth(from.getUTCMonth() - 6 * i);
    const to = new Date(end);
    to.setUTCMonth(to.getUTCMonth() - 6 * (i - 1));
    const [f, t] = [from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)];
    const train = all.filter((r) => r.date < f);
    const test = all.filter((r) => r.date >= f && r.date < t);
    if (!test.length || train.length < 1000) continue;
    const fit = fitTotals(train, keys);
    // (the base rates on the same rows: the line's, and the line's in the division pulled to it by 30 bouts)
    const lineRate = new Map();
    const classRate = new Map();
    for (const r of train) {
      const k = baseKey(r.line, r.rounds);
      const a = lineRate.get(k) ?? [0, 0];
      lineRate.set(k, [a[0] + r.y, a[1] + 1]);
      const c = `${k}|${r.division}`;
      const b = classRate.get(c) ?? [0, 0];
      classRate.set(c, [b[0] + r.y, b[1] + 1]);
    }
    const lineP = (r) => {
      const [y, n] = lineRate.get(baseKey(r.line, r.rounds)) ?? [1, 2];
      return y / n;
    };
    const classP = (r) => {
      const [y, n] = classRate.get(`${baseKey(r.line, r.rounds)}|${r.division}`) ?? [0, 0];
      return (y + 30 * lineP(r)) / (n + 30);
    };
    const scored = test.map((r) => ({ ...r, p: predictTotal(fit, r.tx, r.line, r.rounds)?.p ?? lineP(r), lineP: lineP(r), classP: classP(r) }));
    held.push(...scored);
    const at25 = scored.filter((r) => r.line === 2.5 && r.rounds === 3);
    halves.push({ from: f, to: t, train: fit.n, bouts: new Set(test.map((r) => r.id)).size, kept: fit.terms.filter((x) => x.weight).length, line25: { model: score(at25, (r) => r.p), byClass: score(at25, (r) => r.classP), base: score(at25, (r) => r.lineP) } });
  }
  const sum = (list) => ({ model: score(list, (r) => r.p), byClass: score(list, (r) => r.classP), base: score(list, (r) => r.lineP) });
  const at25 = held.filter((r) => r.line === 2.5 && r.rounds === 3);
  const byDivision = {};
  for (const d of [...new Set(at25.map((r) => r.division))].sort()) {
    const list = at25.filter((r) => r.division === d);
    if (list.length >= 30) byDivision[d] = sum(list);
  }
  const calibration = [];
  for (let lo = 0; lo < 1; lo += 0.1) {
    const inB = at25.filter((r) => r.p >= lo && r.p < lo + 0.1);
    if (inB.length) calibration.push({ from: round(lo, 1), to: round(lo + 0.1, 1), n: inB.length, mean: round(inB.reduce((s, r) => s + r.p, 0) / inB.length, 4), actual: round(inB.reduce((s, r) => s + r.y, 0) / inB.length, 4) });
  }
  return { at: now.toISOString(), halves, all: sum(held), line25: sum(at25), byDivision, calibration, note: "held out: each half fit on the bouts before it alone; every bout at each line its rounds carry (score's rows, unweighted); line25 the three-round bouts at 2.5, the market's usual line; base: the line's share past it, byClass: the line's share in the weight class" };
}

// ---------------------------------------------------------------------------------------------------------
// Pricing

// A book's totals at an event: { point: { over, under } } (American prices), the pairs both sides posted
export function totalPairs(ev, bookKey) {
  const book = (ev?.bookmakers ?? []).find((b) => b.key === bookKey);
  const market = book?.markets?.find((m) => m.key === 'totals');
  const out = {};
  for (const o of market?.outcomes ?? []) {
    if (!Number.isFinite(o.point) || !o.price) continue;
    const side = /^over$/i.test(o.name) ? 'over' : /^under$/i.test(o.name) ? 'under' : null;
    if (!side) continue;
    (out[o.point] ??= {})[side] = american(o.price);
  }
  for (const k of Object.keys(out)) if (!out[k].over || !out[k].under) delete out[k];
  return out;
}

// A matched event's round total: the book's line and prices, and the fair chance of Over there (see the header);
// null where the book posts none
export function totalLinesOf(ev) {
  const mine = totalPairs(ev, BOOK);
  const points = Object.keys(mine).map(Number);
  if (!points.length) return null;
  const line = points.sort((a, b) => Math.abs(fairPair(mine[a].over, mine[a].under) - 0.5) - Math.abs(fairPair(mine[b].over, mine[b].under) - 0.5) || a - b)[0];
  const odds = mine[line];
  const vig = (p) => 1 / decimal(p.over) + 1 / decimal(p.under) - 1;
  let anchor = null;
  const sharp = totalPairs(ev, SHARP)[line];
  if (sharp) anchor = { fair: fairPair(sharp.over, sharp.under), from: SHARP };
  else {
    const others = TOTAL_BOOKS.filter((k) => k !== BOOK && k !== SHARP)
      .map((k) => [k, totalPairs(ev, k)[line]])
      .filter(([, p]) => p)
      .sort((a, b) => vig(a[1]) - vig(b[1]));
    if (others.length) anchor = { fair: fairPair(others[0][1].over, others[0][1].under), from: others[0][0] };
  }
  return { line, odds: { over: odds.over, under: odds.under }, fair: anchor?.fair ?? fairPair(odds.over, odds.under), fairFrom: anchor?.from ?? 'its own prices' };
}

// The pick for a bout's total: the better side at the trusted chance. over: the model's chance of Over; lines:
// totalLinesOf's; live: past TOTAL_LIVE graded with a close (else every row tracked, whatever its edge)
export function totalPickFor(over, lines, trust, { live = false, untested = true, edge = LEAGUES.mma.edge } = {}) {
  const sides = ['over', 'under'].map((side) => {
    const fair = side === 'over' ? lines.fair : 1 - lines.fair;
    const m = side === 'over' ? over : 1 - over;
    const odds = lines.odds[side];
    const p = chanceAt('total', fair, m, trust);
    const ev = p * decimal(odds) - 1;
    return { side, odds, fair, model: m, p, ev, units: stakeFor(ev, EV_SCALE, odds) };
  });
  const pick = sides[0].ev >= sides[1].ev ? sides[0] : sides[1];
  const other = pick === sides[0] ? sides[1] : sides[0];
  const gap = gapGuard('total', pick.model, pick.fair);
  if (gap) return { skip: gap.why, pick, other };
  const hasEdge = live && pick.ev > 0 && pick.model - pick.fair >= edge;
  const units = untested ? Math.min(UNTESTED_MAX, pick.units) : pick.units;
  const why = !live ? `round totals tracked only till ${TOTAL_LIVE} are graded with a close` : pick.ev <= 0 ? 'no edge at the trusted chance' : pick.model - pick.fair < edge ? `the model's lean (${round((pick.model - pick.fair) * 100, 1)} points) under the league's edge (${edge * 100})` : null;
  return { pick, other, placed: placement(hasEdge, units), flags: [], why };
}

// (the totals' evidence count toward going live: graded, won or lost, with a close)
export const liveCount = (bets) => bets.filter((b) => b.market === 'total' && (b.status === 'won' || b.status === 'lost') && b.clv).length;

// A total bet against its bout (its voids as the moneyline's: voidOf, mma-desk.mjs boutVoid): won or lost by
// how long it lasted (ESPN's last round and the clock into it), void on a no contest before the line
export function settleTotal(bet, bout, secsOf) {
  if (!bout?.final) return null;
  const secs = secsOf(bout);
  if (!Number.isFinite(secs)) return null;
  const at = `R${Math.ceil(secs / ROUND_SECS) || 1} ${Math.floor((secs % ROUND_SECS || ROUND_SECS) / 60)}:${String((secs % ROUND_SECS || ROUND_SECS) % 60).padStart(2, '0')}`;
  const final = `${bout.home.name} vs ${bout.away.name}: ${bout.winner === null ? 'no winner' : `${bout[bout.winner].name} won`}, ${at}`;
  if (bout.winner === null && !pastLine(secs, bet.line)) return { status: 'push', profit: 0, void: true, final, why: 'Void: a no contest or a draw before the line' };
  const over = pastLine(secs, bet.line);
  const won = (bet.side === 'over') === over;
  const units = bet.intent === 'track' ? 0 : bet.units;
  return { status: won ? 'won' : 'lost', profit: round(won ? units * (decimal(bet.odds) - 1) : -units, 3), final };
}

// A total bet's plain write-up from its own numbers
export function totalReasonOf(bet) {
  const pct = (v) => `${Math.round(v * 100)}%`;
  const label = Object.fromEntries(TOTAL_TERMS);
  const sign = bet.side === 'over' ? 1 : -1;
  const parts = Object.entries(bet.context?.parts ?? {})
    .map(([k, v]) => [k, sign * v])
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 3);
  const carried = parts.filter(([, v]) => v > 0).map(([k, v]) => `${label[k] ?? k} (+${round(v, 2)})`);
  const against = parts.filter(([, v]) => v < 0).map(([k, v]) => `${label[k] ?? k} (${round(v, 2)})`);
  const from = bet.fairFrom === 'its own prices' ? "the book's own prices, the vig out" : `${bet.fairFrom === SHARP ? 'a sharp book' : 'another book'}'s line, the vig out`;
  const pieces = [`The model gives ${bet.pick} a ${pct(bet.model)} chance against the market's ${pct(bet.fair)} (${from}); a bout like it goes past ${bet.line} ${pct(bet.side === 'over' ? bet.context.base : 1 - bet.context.base)} of the time.`];
  if (carried.length) pieces.push(`For it: ${carried.join(', ')}.`);
  if (against.length) pieces.push(`Against it: ${against.join(', ')}.`);
  pieces.push(`The desk prices it at ${pct(bet.p)} (trust ${round(bet.context?.trust ?? 0, 2)}); the price needs ${pct(1 / decimal(bet.odds))} to break even.`);
  return pieces.join(' ');
}
