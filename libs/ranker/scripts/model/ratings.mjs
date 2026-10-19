// The model's view of every team, built by replaying every game in order: a rating (how much better than an
// average team, in the sport's scoring unit) and scoring and allowing rates. Each game is predicted before
// it's learned from, so the replay is its own honest test: the settings (leagues.mjs) are fit by trying a grid
// of them and keeping the ones whose predictions of the games they hadn't seen yet were best.

// The normal distribution's CDF (Abramowitz-Stegun), for turning an expected margin into a chance
export function phi(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

// A fresh replay's state: no team known yet
function start(params) {
  return { r: new Map(), o: new Map(), d: new Map(), season: new Map(), avg: params.avg };
}

// A team's numbers going into a game, carried into a new season by revert (the rest of the way to average)
function team(state, id, season, params) {
  if (!state.r.has(id)) {
    state.r.set(id, 0);
    state.o.set(id, 0);
    state.d.set(id, 0);
    state.season.set(id, season);
  }
  if (season && state.season.get(id) !== season) {
    state.r.set(id, state.r.get(id) * params.revert);
    state.o.set(id, state.o.get(id) * params.revert);
    state.d.set(id, state.d.get(id) * params.revert);
    state.season.set(id, season);
  }
  return { r: state.r.get(id), o: state.o.get(id), d: state.d.get(id) };
}

// A game's expectation: the home margin, each team's score and the total (the ratings' alone; context.mjs's
// terms are added on by adjust)
export function expect(state, game, params) {
  const h = team(state, game.home, game.season, params);
  const a = team(state, game.away, game.season, params);
  const edge = game.neutral ? 0 : params.hfa;
  const margin = h.r - a.r + edge;
  const homePts = state.avg + h.o - a.d + edge / 2;
  const awayPts = state.avg + a.o - h.d - edge / 2;
  return { margin, total: homePts + awayPts, homePts, awayPts };
}

// An expectation with the context's adjustments: adjM to the home margin, adjT to the total (each side's score
// takes half of each)
export function adjust(exp, adjM, adjT) {
  return {
    margin: exp.margin + adjM,
    total: exp.total + adjT,
    homePts: exp.homePts + adjM / 2 + adjT / 2,
    awayPts: exp.awayPts - adjM / 2 + adjT / 2,
  };
}

// Learn from a final: the ratings move by k of the surprise (capped, so a blowout counts as a big win, not
// a bigger one), the scoring rates by kO of each side's
function learn(state, game, exp, params) {
  const cap = 3 * params.sigma;
  const miss = Math.max(-cap, Math.min(cap, game.hs - game.as - exp.margin));
  state.r.set(game.home, state.r.get(game.home) + params.k * miss);
  state.r.set(game.away, state.r.get(game.away) - params.k * miss);
  const hMiss = game.hs - exp.homePts;
  const aMiss = game.as - exp.awayPts;
  state.o.set(game.home, state.o.get(game.home) + params.kO * hMiss);
  state.d.set(game.away, state.d.get(game.away) - params.kO * hMiss);
  state.o.set(game.away, state.o.get(game.away) + params.kO * aMiss);
  state.d.set(game.home, state.d.get(game.home) - params.kO * aMiss);
  state.avg += 0.002 * ((game.hs + game.as) / 2 - state.avg);
}

// Replay the finals in order: the state after them, and how well each was predicted before it was played
// (after a burn-in: the first part of the history only teaches).
//
// With a context (ctx: each game's terms, context.mjs), the terms' sizes are learned as the replay goes, the
// way the ratings are: before each game, the sizes that best explain every earlier game's miss from the
// ratings' expectation (least squares), each pulled toward 0 by lambda made-up games where it did nothing
// (ridge). So a game is only ever predicted with sizes learned from games before it, and a term that explains
// nothing stays near 0. ctx.off: terms left out.
// onGame: told each final's expectation before it's learned from (the props' game script)
export function replay(games, params, burnIn = 0.3, ctx = null, onGame = null) {
  const state = start(params);
  const fitM = ctx ? online(ctx, 'm') : null;
  const fitT = ctx ? online(ctx, 't') : null;
  const finals = games.filter((g) => g.final && g.hs !== null && g.as !== null).sort((a, b) => a.date.localeCompare(b.date));
  const from = Math.floor(finals.length * burnIn);
  let n = 0;
  let marginSq = 0;
  let totalSq = 0;
  let marginAbs = 0;
  let totalAbs = 0;
  let winLoss = 0;
  let winHits = 0;
  const dyn = ctx ? dynamicTerms(ctx.terms) : [];
  const namedT = ctx ? namedIdx(ctx.terms, 't') : [];
  finals.forEach((g, i) => {
    const base = expect(state, g, params);
    const f = ctx?.feats.get(g.id);
    if (f && dyn.length) setDynamic(dyn, f, base);
    const exp = f ? adjust(base, fitM.predict(f.m), fitT.predict(f.t)) : base;
    // (the named terms' part of the total's shift (D44): what a totals bet is earned by; 0 with no context)
    if (f && namedT.length) exp.namedT = fitT.part(f.t, namedT);
    else if (ctx) exp.namedT = 0;
    onGame?.(g, exp);
    if (i >= from) {
      const m = g.hs - g.as - exp.margin;
      const t = g.hs + g.as - exp.total;
      marginSq += m * m;
      totalSq += t * t;
      marginAbs += Math.abs(m);
      totalAbs += Math.abs(t);
      if (g.hs !== g.as) {
        const p = Math.min(0.99, Math.max(0.01, phi(exp.margin / params.sigma)));
        winLoss -= Math.log(g.hs > g.as ? p : 1 - p);
        winHits += (p > 0.5) === g.hs > g.as ? 1 : 0;
      }
      n++;
    }
    learn(state, g, exp, params);
    if (f) {
      fitM.add(f.m, g.hs - g.as - base.margin);
      fitT.add(f.t, g.hs + g.as - base.total);
    }
  });
  if (ctx) state.weights = { m: fitM.weights(), t: fitT.weights() };
  return {
    state,
    n,
    sigma: n ? Math.sqrt(marginSq / n) : params.sigma,
    sigmaT: n ? Math.sqrt(totalSq / n) : params.sigmaT,
    maeMargin: n ? marginAbs / n : null,
    maeTotal: n ? totalAbs / n : null,
    winLogLoss: n ? winLoss / n : null,
    winHit: n ? winHits / n : null,
  };
}

// A term's gate: what's kept or left out together (a park's terms come and go as one; any other term alone)
export const gateOf = (t) => t.gate ?? t.key;

// A dynamic term (context.mjs lopsidedT, D34): its value is the ratings' own expectation of the game, set the moment
// the game is predicted, before the context's terms are added on. dyn: { of: 'absMargin', center }: how far the
// expected margin, either way, sits over the sport's usual. The same for a final in the replay and for a coming
// game (run.mjs expectFor), so there's no look-ahead: the expectation is from the games before it
export const dynamicTerms = (terms) => ['m', 't'].flatMap((on) => terms[on].map((t, i) => (t.dyn ? { on, i, t } : null)).filter(Boolean));
export function setDynamic(dyn, f, base) {
  for (const { on, i, t } of dyn) f[on][i] = t.dyn.of === 'absMargin' ? Math.abs(base.margin) - t.dyn.center : 0;
}

// One side's terms (m or t) learned online: the running sums of least squares, solved when asked, each term's
// row starting with lambda made-up games of its typical size and no effect (scale: its typical square). With
// many terms (MLB's parks) it's solved again every few games rather than every one: still only ever from
// games already played.
function online(ctx, on) {
  const k = ctx.terms[on].length;
  const off = ctx.terms[on].map((t) => ctx.off.has(gateOf(t)));
  // (a soft term's ridge is its own, lambdaSoft (fitContext): never under the fit's, so a soft term is shrunk at least
  // as hard as a gated one and can only earn its way up from near 0)
  const lambda = ctx.terms[on].map((t) => (t.soft && ctx.lambdaSoft ? ctx.lambdaSoft : t.gate && ctx.lambdaSet ? ctx.lambdaSet : ctx.lambda));
  const A = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (i === j ? lambda[i] * (ctx.scale[on][i] || 1) + 1e-9 : 0)));
  const b = new Array(k).fill(0);
  const every = k > 16 ? Math.ceil(k / 10) : 1;
  let w = new Array(k).fill(0);
  let pending = 0;
  const live = (x) => {
    const nz = [];
    for (let i = 0; i < k; i++) if (x[i] && !off[i]) nz.push(i);
    return nz;
  };
  return {
    predict(x) {
      if (pending >= every) (w = solve(A, b)), (pending = 0);
      let s = 0;
      for (const i of live(x)) s += x[i] * w[i];
      return s;
    },
    add(x, y) {
      const nz = live(x);
      if (!nz.length) return;
      for (const i of nz) {
        b[i] += x[i] * y;
        for (const j of nz) A[i][j] += x[i] * x[j];
      }
      pending++;
    },
    weights() {
      if (pending) (w = solve(A, b)), (pending = 0);
      return w.map((v, i) => (off[i] ? 0 : v));
    },
    // (the part of a prediction the terms in idx carry, at the weights predict last used: no solve, so it reads
    // exactly what predict read for the same game)
    part(x, idx) {
      let s = 0;
      const nz = new Set(live(x));
      for (const i of idx) if (nz.has(i)) s += x[i] * w[i];
      return s;
    },
  };
}

// (the named terms on the total (DECISIONS.md D44): the soft schedule terms (context.mjs SCHEDULE_TERMS, D34), the ones
// that earn a totals bet; their indexes among a side's terms)
export const namedIdx = (terms, on = 't') => (terms?.[on] ?? []).map((t, i) => (t.soft ? i : -1)).filter((i) => i >= 0);

// (a small linear system, by elimination)
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) continue;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((row, i) => (Math.abs(row[i]) < 1e-12 ? 0 : row[n] / row[i]));
}

// The context terms that pay for themselves (fitContext's): each in (not in off) left out where the held-out games
// do as well within 1 nat without it, again until none leaves (one leaving can make another not worth its place);
// then each one out taken back where the held-out games do better by more than 1 nat with it (the loss review's
// B7, 2026-10-18: a term dropped while a correlated one was in was never asked again once that one left, so the
// NHL's goalie edge sat out at +1.19 nats over 1,070 games, past the bar it was dropped by), the best taken first,
// and the leaving asked again after. gates: every gate; off: the Set of gates out (changed in place); best: the
// current fit ({ score, ... }, lower better); runOf(off): a fit with those out; n: the games a score is per.
// The best fit, its gates in by off
export function selectTerms(gates, off, best, runOf, n) {
  for (let round = 0; round < 4; round++) {
    for (let changed = true, passes = 0; changed && passes < 4; passes++) {
      changed = false;
      for (const gate of gates) {
        if (off.has(gate)) continue;
        const without = runOf(new Set([...off, gate]));
        // (one nat each: a park's set is already held back by its own lambda, fit on the same held-out games)
        if ((without.score - best.score) * n <= 1) {
          off.add(gate);
          best = { ...best, ...without };
          changed = true;
        }
      }
    }
    let add = null;
    for (const gate of gates) {
      if (!off.has(gate)) continue;
      const tried = runOf(new Set([...off].filter((g) => g !== gate)));
      if ((best.score - tried.score) * n > 1 && (!add || tried.score < add.tried.score)) add = { gate, tried };
    }
    if (!add) break;
    off.delete(add.gate);
    best = { ...best, ...add.tried };
  }
  return best;
}

// The context's fit, on top of the ratings' settings: how hard to pull the terms' sizes toward 0 (lambda, the
// one whose held-out predictions were best), then which terms earn their place (each left out in turn, and
// kept only if the held-out games were predicted better with it by more than 1 nat in all: the cost of one
// more setting). A set of terms that come as one (MLB's parks) gets its own lambda, fit the same way., then how much each kept term helped. Its test numbers next to the ratings' alone.
export function fitContext(games, params, feats, terms) {
  const finals = games.filter((g) => g.final && g.hs !== null && g.as !== null);
  const scale = { m: terms.m.map(() => 0), t: terms.t.map(() => 0) };
  const seen = { m: terms.m.map(() => 0), t: terms.t.map(() => 0) };
  for (const g of finals) {
    const f = feats.get(g.id);
    if (!f) continue;
    for (const on of ['m', 't'])
      f[on].forEach((v, i) => {
        scale[on][i] += v * v;
        if (v) seen[on][i]++;
      });
  }
  for (const on of ['m', 't']) scale[on] = scale[on].map((s, i) => (seen[on][i] ? s / seen[on][i] : 1));
  // (a dynamic term's values are set as the replay predicts (setDynamic): seen on every final with features, its
  // typical square about half its center's)
  const withFeats = finals.filter((g) => feats.has(g.id)).length;
  for (const { on, i, t } of dynamicTerms(terms)) {
    seen[on][i] = withFeats;
    scale[on][i] = (t.dyn.center ** 2) / 2 || 1;
  }
  const all = [...terms.m, ...terms.t];
  const gates = [...new Set(all.map(gateOf))];
  // (the soft terms (context.mjs SCHEDULE_TERMS, D34): in at their own ridge, never gated one by one)
  const softGates = new Set(all.filter((t) => t.soft).map(gateOf));
  const score = (r) => Math.log(r.sigma) + Math.log(r.sigmaT);
  let lambdaSet = null;
  let lambdaSoft = null;
  const run = (lambda, off) => {
    const r = replay(games, params, 0.3, { feats, terms, scale, lambda, lambdaSet, lambdaSoft, off });
    return { r, score: score(r) };
  };
  const before = replay(games, params);
  const n = before.n || 1;
  // (terms never seen at all are left out from the start)
  const seenGate = (gate) => all.some((t) => gateOf(t) === gate && (t.on === 'm' ? seen.m[terms.m.indexOf(t)] : seen.t[terms.t.indexOf(t)]));
  const off = new Set(gates.filter((g) => !seenGate(g)));
  // (the main lambda is fit with the soft terms out, so they can't tilt it)
  for (const g of softGates) off.add(g);
  let best = null;
  for (const lambda of [4, 16, 64, 256, 1024]) {
    const tried = run(lambda, off);
    if (!best || tried.score < best.score) best = { lambda, ...tried };
  }
  if (all.some((t) => t.gate)) {
    let set = { lambdaSet: null, ...best };
    for (const ls of [16, 64, 256, 1024, 4096]) {
      lambdaSet = ls;
      const tried = run(best.lambda, off);
      if (tried.score < set.score) set = { ...best, ...tried, lambdaSet: ls };
    }
    lambdaSet = set.lambdaSet;
    best = set;
  }
  // (each term must pay for itself on the held-out games, or it's left out: selectTerms; the soft ones aren't asked)
  best = selectTerms(gates.filter((g) => seenGate(g) && !softGates.has(g)), off, best, (o) => run(best.lambda, o), n);
  // (the soft terms: all in together at one ridge of their own, the one whose held-out games were best, from the
  // fit's own lambda up to 1024 times it (at the top a term is all but 0: the shrink is the dial, not a switch). The
  // only switch is the safety fallback (D8): the whole set stays out when every ridge is worse than none by more
  // than 1 nat over the held-out games)
  const softSeen = [...softGates].filter(seenGate);
  const softOff = new Set([...off].filter((g) => !softGates.has(g) || !seenGate(g)));
  if (softSeen.length) {
    let pick = null;
    for (const mult of [1, 4, 16, 64, 256, 1024]) {
      lambdaSoft = best.lambda * mult;
      const tried = run(best.lambda, softOff);
      if (!pick || tried.score < pick.score) pick = { lambdaSoft, ...tried };
    }
    if ((pick.score - best.score) * n <= 1) {
      lambdaSoft = pick.lambdaSoft;
      for (const g of softSeen) off.delete(g);
      best = { ...best, ...pick };
    } else lambdaSoft = null;
  }
  // (each term's worth: how much worse the held-out games were without it, or better with it, per game; a soft
  // term's read the same way, at its ridge)
  const gain = {};
  for (const gate of gates) {
    if (!seenGate(gate)) continue;
    const flipped = new Set(off);
    if (off.has(gate)) flipped.delete(gate);
    else flipped.add(gate);
    const other = run(best.lambda, flipped);
    gain[gate] = off.has(gate) ? best.score - other.score : other.score - best.score;
  }
  const ctx = { feats, terms, scale, lambda: best.lambda, lambdaSet, lambdaSoft, off };
  const final = replay(games, params, 0, ctx).state.weights;
  return { ctx, before, after: best.r, gain, seen, weights: final };
}

// The grid's best settings: the ones whose margins and totals were closest to what happened (the normal
// log-likelihood of both, each at the spread the replay found), with their test numbers
export function fit(games, base, startGrid) {
  const grid = Object.fromEntries(Object.entries(startGrid).map(([key, values]) => [key, [...values]]));
  const tried = new Map();
  let best = null;
  // (a best setting at the end of its range: the range grows that way and the search runs again, a few
  // times at most, so the fit isn't held to where the ranges were first guessed)
  for (let round = 0; round < 4; round++) {
    for (const k of grid.k)
      for (const hfa of grid.hfa)
        for (const revert of grid.revert)
          for (const kO of grid.kO) {
            const key = `${k}|${hfa}|${revert}|${kO}`;
            if (tried.has(key)) continue;
            const params = { ...base, k, hfa, revert, kO };
            const r = replay(games, params);
            tried.set(key, true);
            if (!r.n) continue;
            // (the normal log-likelihood per game, margins and totals: lower spread around the truth is better)
            const score = Math.log(r.sigma) + Math.log(r.sigmaT);
            if (!best || score < best.score) best = { score, params: { ...params, sigma: round2(r.sigma, 3), sigmaT: round2(r.sigmaT, 3) }, test: r };
          }
    if (!best) return null;
    let grew = false;
    for (const key of ['k', 'hfa', 'revert', 'kO']) {
      const values = grid[key];
      const at = values.indexOf(best.params[key]);
      if (at === values.length - 1) {
        const next = key === 'revert' ? Math.min(0.98, values[at] + 0.1) : round2(values[at] * 1.4, 4);
        if (next !== values[at]) values.push(next), (grew = true);
      } else if (at === 0 && values[0] > 0) {
        values.unshift(key === 'revert' ? Math.max(0, round2(values[0] - 0.15, 2)) : round2(values[0] * 0.6, 4));
        grew = true;
      }
    }
    if (!grew) break;
  }
  return best;
}

const round2 = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

export const round = (v, d = 2) => (v === null || v === undefined ? null : Math.round(v * 10 ** d) / 10 ** d);
