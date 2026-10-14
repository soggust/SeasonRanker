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
//   step      a kept spot moves at most CAL_STEP from the shift the last run left (state.calib), so one night's
//             results can't swing it; one that loses the gate goes to 0 at once
//
// It moves the model's chance alone: the trust, the guards, the bands and the stakes read the chance as before
// (a tracked row is never staked, an edge bet stays LIKE or better, a flagged one at the minimum).

export const CAL_MIN = 300;
export const CAL_K = 600;
export const CAL_CAP = 0.25;
export const CAL_STEP = 0.03;
export const CAL_SPLIT = 0.7;
export const CAL_HOLD_MIN = 100;

// (a line's class: 0.5, 1.5, 2.5 or over 2.5; a whole-number line with the class it sits in)
export const lineClass = (line) => (line <= 0.5 ? '0.5' : line <= 1.5 ? '1.5' : line <= 2.5 ? '2.5' : '>2.5');
export const spotKey = (stat, side, line) => `${stat}|${side}|${lineClass(line)}`;

const clip = (p) => Math.min(0.995, Math.max(0.005, p));
const logit = (p) => Math.log(clip(p) / (1 - clip(p)));
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const r4 = (v) => Math.round(v * 10000) / 10000;

// A chance moved by a shift on its log-odds (none: as it is)
export const calAt = (p, shift) => (shift ? sigmoid(logit(p) + shift) : p);

// The graded props a spot fits on: since the epoch (placedAt, else the start), won or lost, not void, with a
// model chance; each { key, p (its raw chance), y (1 won), t (when its game started) }
export function calRows(bets, epoch) {
  const from = Date.parse(epoch);
  const out = [];
  for (const b of bets ?? []) {
    if (!b || b.market !== 'prop' || b.void || (b.status !== 'won' && b.status !== 'lost')) continue;
    const at = Date.parse(b.placedAt ?? b.start);
    if (!(at >= from)) continue;
    const p = Number.isFinite(b.modelRaw) ? b.modelRaw : b.model;
    if (!Number.isFinite(p) || !Number.isFinite(b.line) || (b.side !== 'over' && b.side !== 'under') || !b.propType) continue;
    out.push({ key: spotKey(b.propType, b.side, b.line), p, y: b.status === 'won' ? 1 : 0, t: Date.parse(b.start) || at, id: String(b.id ?? '') });
  }
  return out;
}

// (a list's mean log loss at a shift)
export function logLoss(rows, shift = 0) {
  if (!rows.length) return null;
  let ll = 0;
  for (const x of rows) {
    const q = clip(calAt(x.p, shift));
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
      const q = sigmoid(logit(x.p) + s);
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

// One spot's shift from its rows and the last run's: { n, shift, target, raw, gain, held, kept, why }
export function fitSpot(rows, prev = 0) {
  const n = rows.length;
  const sorted = [...rows].sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  const cut = Math.floor(n * CAL_SPLIT);
  const old = sorted.slice(0, cut);
  const held = sorted.slice(cut);
  const raw = fitShift(sorted);
  const base = { n, raw: r4(raw), held: held.length, prev: r4(prev || 0) };
  if (n < CAL_MIN) return { ...base, shift: 0, target: 0, gain: null, kept: false, why: `too few rows (${CAL_MIN} needed)` };
  if (old.length < CAL_MIN || held.length < CAL_HOLD_MIN) return { ...base, shift: 0, target: 0, gain: null, kept: false, why: `too few to hold out (${CAL_MIN} to fit, ${CAL_HOLD_MIN} held out)` };
  const sOld = shrunk(fitShift(old), old.length);
  const gain = r4(logLoss(held, 0) - logLoss(held, sOld));
  const target = shrunk(raw, n);
  if (!(gain > 0) || !sOld) return { ...base, shift: 0, target: r4(target), gain, kept: false, why: !sOld ? 'its older rows fit no shift' : 'no held-out gain' };
  const p0 = Number.isFinite(prev) ? prev : 0;
  const shift = p0 + Math.max(-CAL_STEP, Math.min(CAL_STEP, target - p0));
  return { ...base, shift: r4(shift), target: r4(target), gain, kept: true, why: null };
}

// Every spot's from the ledger's bets: { epoch, rows, min, cap, step, spots: { key: fitSpot's } } (prev: the last run's state.calib)
export function fitCalib(bets, epoch, prev = null) {
  const rows = calRows(bets, epoch);
  const by = new Map();
  for (const x of rows) by.set(x.key, [...(by.get(x.key) ?? []), x]);
  // (a last run's shift from another epoch starts over: the rows it was fit on judged another model)
  const was = prev?.epoch === epoch ? (prev?.spots ?? {}) : {};
  const spots = {};
  for (const [key, list] of [...by].sort((a, b) => a[0].localeCompare(b[0]))) spots[key] = fitSpot(list, was[key]?.shift ?? 0);
  return { epoch, rows: rows.length, min: CAL_MIN, cap: CAL_CAP, step: CAL_STEP, spots };
}

// (a spot's shift as priced: 0 where it isn't kept, or none)
export const shiftOf = (calib, stat, side, line) => {
  const s = calib?.spots?.[spotKey(stat, side, line)];
  return s?.kept && Number.isFinite(s.shift) ? s.shift : 0;
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
  if (!spots.length) return 'no graded props since the epoch';
  const kept = spots.filter(([, s]) => s.kept);
  const each = spots.map(([k, s]) => `${k} n ${s.n} shift ${s.shift}${s.kept ? ` (target ${s.target}, held-out gain +${s.gain})` : ` (${s.why}${s.gain !== null ? `, gain ${s.gain}` : ''})`}`);
  return `${c.rows} graded rows since the epoch, ${kept.length} of ${spots.length} spots shifted: ${each.join('; ')}`;
}
