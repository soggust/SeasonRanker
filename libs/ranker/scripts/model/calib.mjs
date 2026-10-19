// The live calibration: a small self-correcting shift on the props' model chance, by spot (a stat, a side, a
// line class), fit every run on the graded props since MODEL_EPOCH (the tracked rows among them: graded and
// learned from like a bet, never staked) and applied on top of the projection fit's own recalibration
// (project.mjs recal) before the trust (desk.mjs chanceAt). The owner's ask (2026-10-13): "lightly SLIGHTLY lower
// the value of a player getting 0 ... until the model feels it matches, self correcting", the data accumulating so
// one day's results don't move it much.
//
//   spot      sport (the run's) x stat x side (the over, the under) x line class (0.5, 1.5, 2.5, over 2.5)
//   shift     on the log-odds of that side's model chance (calAt): on a 0.5 line the over's chance is 1 less
//             the chance of a 0, so its shift is the zero mass's; the over's and the under's each their own
//             spot, and the two never add to more than 1 (calSides: the excess taken out of both alike), so
//             it can't make both sides look good
//   rows      every graded prop (won or lost: pushes and voids out) placed since MODEL_EPOCH, by its raw model
//             chance (modelRaw where a shift was applied, else model: the shift never fits on itself), and
//             whether it won (calRows)
//   fit       the shift that best fits a spot's rows (fitShift: the log loss, Newton's), pulled toward 0 by its
//             evidence (shrinkOf: 0 under CAL_MIN rows, then (n - CAL_MIN) / (n - CAL_MIN + CAL_K)), held to
//             CAL_CAP either way
//   gate      time-split: fit (shrunk the same way) on the older CAL_SPLIT of the rows, judged on the newest
//             (CAL_HOLD_MIN of them or more); kept only where their log loss is lower with it. Not kept, too few
//             rows, or none: 0 (fail safe, no evidence no change)
//   step      a spot moves at most CAL_STEP a UTC day from the shift it began the day at (state.calib's anchor and
//             day: the hourly runs share the day's step, so one day's results can't swing it), toward its target
//             when kept, toward 0 when it loses the gate or its rows (symmetric: a gain flipping on a +-0.0001 no
//             longer drops a spot to 0 at once and back, the oscillation the loss review's B12 found)
//
// 2026-10-18 (the audit: out of sample since 10-08 the raw model said .538 on lines of 1.5 or under for .481, .579 on
// 2 to 3.5 for .493, and no spot had ever been shifted: each sat under CAL_MIN rows since the epoch). Made active:
//   rows      every graded prop with a raw chance, across epochs (calibration only: the gates and the trust still
//             count from MODEL_EPOCH); a run's from (fitCalib from: null, every one)
//   pooled    a sparse spot borrows from the ones around it, in three rungs each fit on what the rungs above
//             left (an offset on every row's log-odds: no double counting): every sport's props at the line
//             class (pool, line-pool.mjs: the other sports' ledgers), the sport's at the class (sport), the spot's
//             own (spots). Each rung gated, shrunk and stepped as a spot is; a spot's shift the three's sum held
//             to CAL_CAP, kept where it's not 0; a spot with no rows of its own the two above it
//   min       CAL_MIN 200 and CAL_HOLD_MIN 60, so a rung with a few hundred rows can speak
//
// It moves the model's chance alone: the trust, the guards, the bands and the stakes read the chance as before
// (a tracked row is never staked, an edge bet stays LIKE or better, a flagged one at the minimum).

export const CAL_MIN = 200;
export const CAL_K = 600;
export const CAL_CAP = 0.25;
// (the most a rung moves in a UTC day, toward its target or toward 0: B12, 2026-10-18; it was a run's, and the desk
// runs hourly, so -0.03 to -0.129 in three hours)
export const CAL_STEP = 0.03;
export const CAL_SPLIT = 0.7;
export const CAL_HOLD_MIN = 60;

// (a line's class: 0.5, 1.5, 2.5 or over 2.5; a whole-number line with the class it sits in)
export const lineClass = (line) => (line <= 0.5 ? '0.5' : line <= 1.5 ? '1.5' : line <= 2.5 ? '2.5' : '>2.5');
export const spotKey = (stat, side, line) => `${stat}|${side}|${lineClass(line)}`;

const clip = (p) => Math.min(0.995, Math.max(0.005, p));
const logit = (p) => Math.log(clip(p) / (1 - clip(p)));
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const r4 = (v) => Math.round(v * 10000) / 10000;

// A chance moved by a shift on its log-odds (none: as it is)
export const calAt = (p, shift) => (shift ? sigmoid(logit(p) + shift) : p);

// The graded props a spot fits on: since from (placedAt, else the start; null: every one), won or lost, not void,
// with a model chance; each { key, cls (its line class), p (its raw chance), y (1 won), t (when its game started) }
export function calRows(bets, from = null) {
  const since = from == null ? -Infinity : Date.parse(from);
  const out = [];
  for (const b of bets ?? []) {
    if (!b || b.market !== 'prop' || b.void || (b.status !== 'won' && b.status !== 'lost')) continue;
    const at = Date.parse(b.placedAt ?? b.start);
    if (!(at >= since)) continue;
    const p = Number.isFinite(b.modelRaw) ? b.modelRaw : b.model;
    if (!Number.isFinite(p) || !Number.isFinite(b.line) || (b.side !== 'over' && b.side !== 'under') || !b.propType) continue;
    out.push({ key: spotKey(b.propType, b.side, b.line), cls: lineClass(b.line), p, y: b.status === 'won' ? 1 : 0, t: Date.parse(b.start) || at, id: String(b.id ?? '') });
  }
  return out;
}

// (a list's mean log loss at a shift)
export function logLoss(rows, shift = 0) {
  if (!rows.length) return null;
  let ll = 0;
  for (const x of rows) {
    const q = clip(calAt(x.p, shift + (x.o ?? 0)));
    ll -= Math.log(x.y ? q : 1 - q);
  }
  return ll / rows.length;
}

// The shift that best fits rows (the log loss's minimum on the log-odds, Newton's from 0), held to 1 either way
export function fitShift(rows) {
  if (!rows.length) return 0;
  let s = 0;
  for (let i = 0; i < 30; i++) {
    let g = 0;
    let h = 0;
    for (const x of rows) {
      const q = sigmoid(logit(x.p) + s + (x.o ?? 0));
      g += q - x.y;
      h += q * (1 - q);
    }
    if (!(h > 0)) break;
    const step = g / h;
    s = Math.max(-1, Math.min(1, s - step));
    if (Math.abs(step) < 1e-7) break;
  }
  return s;
}

// (the share of a fit kept at n rows: 0 under CAL_MIN, growing toward 1 as they come)
export const shrinkOf = (n) => (n < CAL_MIN ? 0 : (n - CAL_MIN) / (n - CAL_MIN + CAL_K));
// (a fit shrunk by its evidence and held to the cap)
export const shrunk = (raw, n) => Math.max(-CAL_CAP, Math.min(CAL_CAP, raw * shrinkOf(n))) || 0;

// (the UTC day a run is in, and where a rung steps from that day: the shift it began the day at (anchor), so every
// run of the day moves it CAL_STEP in all; a new day (or a state from before the anchors) the last run's shift.
// prev: the rung's last state ({ shift, anchor, day }, or the spots' { own, ownAnchor, day }), or a number)
export const calDay = (now) => new Date(now ?? Date.now()).toISOString().slice(0, 10);
export function anchorOf(prev, day, key = 'shift', anchorKey = 'anchor') {
  if (prev === null || prev === undefined) return 0;
  if (typeof prev !== 'object') return Number.isFinite(prev) ? prev : 0;
  const last = Number.isFinite(prev[key]) ? prev[key] : 0;
  return prev.day === day && Number.isFinite(prev[anchorKey]) ? prev[anchorKey] : last;
}
// (a step from a shift toward another, at most CAL_STEP)
const stepFrom = (from, to) => from + Math.max(-CAL_STEP, Math.min(CAL_STEP, to - from));

// One spot's shift from its rows and where it steps from today (anchorOf): { n, shift, target, raw, gain, held,
// passed (its gate: enough rows and a held-out gain), kept (its shift not 0: passed, or fading to 0), why }
export function fitSpot(rows, prev = 0) {
  const n = rows.length;
  const sorted = [...rows].sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  const cut = Math.floor(n * CAL_SPLIT);
  const old = sorted.slice(0, cut);
  const held = sorted.slice(cut);
  const raw = fitShift(sorted);
  const p0 = Number.isFinite(prev) ? prev : 0;
  const base = { n, raw: r4(raw), held: held.length, prev: r4(p0) };
  // (its gate not passed: 0 is the target, reached a step a day from where it stands, never at once)
  const fade = (why, target, gain) => {
    const shift = r4(stepFrom(p0, 0)) || 0;
    return { ...base, shift, target, gain, passed: false, kept: shift !== 0, why: shift ? `${why}: fading to 0 by ${CAL_STEP} a day` : why };
  };
  if (n < CAL_MIN) return fade(`too few rows (${CAL_MIN} needed)`, 0, null);
  if (old.length < CAL_MIN || held.length < CAL_HOLD_MIN) return fade(`too few to hold out (${CAL_MIN} to fit, ${CAL_HOLD_MIN} held out)`, 0, null);
  const sOld = shrunk(fitShift(old), old.length);
  const gain = r4(logLoss(held, 0) - logLoss(held, sOld));
  const target = shrunk(raw, n);
  if (!(gain > 0) || !sOld) return fade(!sOld ? 'its older rows fit no shift' : 'no held-out gain', r4(target), gain);
  const shift = r4(stepFrom(p0, target)) || 0;
  return { ...base, shift, target: r4(target), gain, passed: true, kept: shift !== 0, why: null };
}

const capped = (s) => Math.max(-CAL_CAP, Math.min(CAL_CAP, s)) || 0;
const keptShift = (f) => (f?.kept && Number.isFinite(f.shift) ? f.shift : 0);
const groupBy = (rows, keyOf) => {
  const by = new Map();
  for (const x of rows) by.set(keyOf(x), [...(by.get(keyOf(x)) ?? []), x]);
  return [...by].sort((a, b) => a[0].localeCompare(b[0]));
};

// Every spot's from the ledger's bets, pooled (see the header): { from, rows, poolRows, min, cap, step, pool: { cls:
// fitSpot's }, sport: { cls: fitSpot's }, spots: { key: fitSpot's, own (its rung's), shift (the three's sum, held to
// CAL_CAP), kept (not 0), why (its own rung's; pooled only where the rungs above carry it) } }. from: the rows'
// (null every one); prev: the last run's state.calib (each rung steps from where it began the UTC day, anchorOf,
// across epochs as the rows are); pool: the other sports' bets (line-pool.mjs); now: the run's time (its UTC day)
export function fitCalib(bets, from = null, prev = null, pool = [], now = new Date()) {
  const day = calDay(now);
  const rows = calRows(bets, from);
  const others = calRows(pool, from);
  const rung = (list, last) => {
    const anchor = r4(anchorOf(last, day));
    return { ...fitSpot(list, anchor), anchor, day };
  };
  const pools = {};
  for (const [cls, list] of groupBy([...others, ...rows], (x) => x.cls)) pools[cls] = rung(list, prev?.pool?.[cls]);
  const sport = {};
  for (const [cls, list] of groupBy(rows, (x) => x.cls)) sport[cls] = rung(list.map((x) => ({ ...x, o: keptShift(pools[cls]) })), prev?.sport?.[cls]);
  const spots = {};
  for (const [key, list] of groupBy(rows, (x) => x.key)) {
    const cls = list[0].cls;
    const above = keptShift(pools[cls]) + keptShift(sport[cls]);
    const ownAnchor = r4(anchorOf(prev?.spots?.[key], day, 'own', 'ownAnchor'));
    const f = fitSpot(list.map((x) => ({ ...x, o: above })), ownAnchor);
    const total = r4(capped(above + keptShift(f)));
    // (its words its own rung's; a spot shifted by the rungs above alone says so, never "too few rows" beside kept)
    const why = f.passed ? null : total !== 0 && !f.kept ? `pooled only (its own rung: ${f.why})` : f.why;
    spots[key] = { ...f, own: keptShift(f), shift: total, kept: total !== 0, ownKept: f.kept, ownPassed: f.passed, why, ownAnchor, day };
  }
  return { from, rows: rows.length, poolRows: others.length, min: CAL_MIN, cap: CAL_CAP, step: CAL_STEP, day, pool: pools, sport, spots };
}

// (a spot's shift as priced: its sum (fitCalib), 0 where it isn't kept; a spot with no rows of its own the pool's
// and the sport's at its line class)
export const shiftOf = (calib, stat, side, line) => {
  const s = calib?.spots?.[spotKey(stat, side, line)];
  if (s) return s.kept && Number.isFinite(s.shift) ? s.shift : 0;
  const cls = lineClass(line);
  return r4(capped(keptShift(calib?.pool?.[cls]) + keptShift(calib?.sport?.[cls])));
};

// A prop's two sides' model chances with their spots' shifts: { over, under, so, su }; the two never add to more
// than 1 - push (the excess taken out of both alike, so a shift can't make both sides look good)
export function calSides(calib, stat, line, pOver, push = 0) {
  const so = shiftOf(calib, stat, 'over', line);
  const su = shiftOf(calib, stat, 'under', line);
  let over = calAt(pOver, so);
  let under = calAt(1 - pOver, su);
  const room = 1 - (push || 0);
  if (over + under > room) {
    const d = (over + under - room) / 2;
    (over -= d), (under -= d);
  }
  return { over, under, so, su };
}

// The run log's line: each spot with rows, its n, shift, held-out gain and why it's 0
export function calibText(c) {
  const spots = Object.entries(c?.spots ?? {});
  if (!spots.length) return 'no graded props yet';
  const kept = spots.filter(([, s]) => s.kept);
  const rung = (k, s) => `${k} n ${s.n} shift ${s.shift}${s.kept ? ` (target ${s.target}, held-out gain +${s.gain})` : ` (${s.why}${s.gain !== null ? `, gain ${s.gain}` : ''})`}`;
  const each = spots.map(([k, s]) => `${k} n ${s.n} shift ${s.shift} (own ${s.own ?? s.shift}${(s.ownKept ?? s.kept) ? `, target ${s.target}, held-out gain +${s.gain}` : `: ${s.why}${s.gain !== null ? `, gain ${s.gain}` : ''}`})`);
  const pooled = [...Object.entries(c?.pool ?? {}).map(([k, s]) => rung(`all sports ${k}`, s)), ...Object.entries(c?.sport ?? {}).map(([k, s]) => rung(`sport ${k}`, s))];
  return `${c.rows} graded rows (${c.poolRows ?? 0} more from the other sports), ${kept.length} of ${spots.length} spots shifted; pooled: ${pooled.join('; ') || 'none'}; spots: ${each.join('; ')}`;
}
