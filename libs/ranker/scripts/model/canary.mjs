// Leakage canaries and null tests on the gate's own replay rows (DECISIONS.md D93; research only: gate.mjs and
// gate-mma.mjs run them with GATE_CANARY=<dir>, never a record, never the desk).
//
//   time travel  the replay run again with everything after a cut scrambled: the results of every game not settled by
//                the cut (start plus GAME_HOURS) drawn at random, every snapshot taken after the cut (its chance, the
//                Book's no-vig, both prices, the shopped price) jittered. Every bet placed before the cut must come out
//                the same (its placement, price, chance, stake and band): a walk, a fit or a bar that read a later
//                result or price moves one. Cuts at three quantiles of the bets' placements
//   null tests   the replay run on outcomes with no edge in them, so its units are what the rules make of noise:
//                fair  each game's result drawn from the Book's own no-vig chance at the close (the market's null: every
//                      bettor expects minus the vig), N draws
//                shuffle  the results permuted among the keys of the same season, market (a prop's stat) and Book's
//                      chance (in twentieths at the close): the base rates and the Book's calibration kept, N draws
//                each draw also run with each staking rule off (D79's own losers, D60's beat bar, D51/D64's history
//                bars, D73's trial), so a rule's gain under the null (what it makes of noise) sits beside its real gain
//   the planted leak  the result copied into each open's chance (p = y): the real replay's walk must hold it to what the
//                rules allow; reported, not asserted (a leak planted in the data is the data's, not the code's: the
//                canary shows how much such a leak would be worth, the size of what the stamps guard against)
// Output: <dir>/<sport>-canary.json and a line per test in the gate's log.

import { writeFileSync } from 'node:fs';
import path from 'node:path';

const fin = Number.isFinite;
export const GAME_HOURS = 3;
const H = 36e5;

// (a seeded generator: mulberry32)
export function rngOf(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const keyOf = (x) => x.key ?? String(x.id).replace(/:(o|c|i\d+)$/, '');
const atOf = (x) => (fin(x.at) ? x.at : x.kind === 'c' ? x.t - H : x.t - 24 * H);
const clip = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const jitterOdds = (o, r) => {
  if (!fin(o)) return o;
  const d = o > 0 ? 1 + o / 100 : 1 + 100 / -o;
  const d2 = Math.max(1.02, d * (1 + (r() - 0.5) * 0.2));
  return d2 >= 2 ? Math.round((d2 - 1) * 100) : Math.round(-100 / (d2 - 1));
};

// (every row copied, shallow; the three lists' rows grouped by key)
function copyRows(rows) {
  const out = { open: (rows.open ?? []).map((x) => ({ ...x })), close: (rows.close ?? []).map((x) => ({ ...x })), intra: (rows.intra ?? []).map((x) => ({ ...x })) };
  const byKey = new Map();
  for (const list of [out.open, out.close, out.intra]) for (const x of list) (byKey.get(keyOf(x)) ?? byKey.set(keyOf(x), []).get(keyOf(x))).push(x);
  return { rows: out, byKey };
}

// The time-travel mutation: results not settled by cut drawn at random, snapshots after it jittered
export function scrambleAfter(rows, cut, r) {
  const { rows: out, byKey } = copyRows(rows);
  let ys = 0;
  let snaps = 0;
  for (const list of byKey.values()) {
    const t = list[0].t;
    if (fin(t) && t + GAME_HOURS * H >= cut) {
      const y = r() < 0.5 ? 1 : 0;
      for (const x of list) if (x.y === 0 || x.y === 1) x.y = y;
      ys++;
    }
    for (const x of list) {
      if (!(atOf(x) > cut)) continue;
      if (fin(x.p)) x.p = clip(x.p + (r() - 0.5) * 0.2, 0.01, 0.99);
      if (fin(x.raw)) x.raw = clip(x.raw + (r() - 0.5) * 0.2, 0.01, 0.99);
      if (fin(x.f)) x.f = clip(x.f + (r() - 0.5) * 0.1, 0.02, 0.98);
      x.overOdds = jitterOdds(x.overOdds, r);
      x.underOdds = jitterOdds(x.underOdds, r);
      delete x.shop;
      snaps++;
    }
  }
  return { rows: out, ys, snaps };
}

// (the null draws: each key's result from the close's no-vig (fair), or permuted within its season and market (shuffle))
export function nullRows(rows, mode, r) {
  const { rows: out, byKey } = copyRows(rows);
  const decided = [...byKey.entries()].filter(([, list]) => list.some((x) => x.y === 0 || x.y === 1));
  if (mode === 'fair') {
    for (const [, list] of decided) {
      const c = list.find((x) => x.kind === 'c') ?? list[list.length - 1];
      const y = fin(c.f) && r() < c.f ? 1 : 0;
      for (const x of list) if (x.y === 0 || x.y === 1) x.y = y;
    }
  } else {
    const strata = new Map();
    for (const [k, list] of decided) {
      const x0 = list[0];
      // (and the Book's own chance in twentieths: a shuffle across prices would hand a long dog a coin's results)
      const c = list.find((x) => x.kind === 'c') ?? x0;
      const s = `${x0.season}|${x0.market}|${x0.stat ?? ''}|${fin(c.f) ? Math.round(c.f * 20) : '-'}`;
      (strata.get(s) ?? strata.set(s, []).get(s)).push(k);
    }
    for (const keys of strata.values()) {
      const ys = keys.map((k) => byKey.get(k).find((x) => x.y === 0 || x.y === 1).y);
      for (let i = ys.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [ys[i], ys[j]] = [ys[j], ys[i]];
      }
      keys.forEach((k, i) => {
        for (const x of byKey.get(k)) if (x.y === 0 || x.y === 1) x.y = ys[i];
      });
    }
  }
  return out;
}

// The planted leak: each open's (and intraday snapshot's) chance set to the result (the future in the price)
export function plantLeak(rows) {
  const { rows: out } = copyRows(rows);
  for (const x of [...out.open, ...out.intra]) if (x.y === 0 || x.y === 1) x.p = x.y === 1 ? 0.75 : 0.25;
  return out;
}

// (the staking rules switched off one at a time: a copy of the version's modules)
export const RULES = {
  ownBar: (V) => ({ ...V, desk: { ...V.desk, ownBarOn: () => false } }),
  beatBar: (V) => ({ ...V, desk: { ...V.desk, BEAT_BAR: null } }),
  bars: (V) => ({ ...V, desk: { ...V.desk, walkBar: undefined } }),
  trial: (V) => ({ ...V, trusted: V.trusted ? { ...V.trusted, trialOn: () => false } : V.trusted }),
  // (the rules the replay switches by its own measuring flags)
  lag: (V) => ({ ...V, __env: { REPLAY_LAG: '0' } }),
  windows: (V) => ({ ...V, __env: { REPLAY_WINDOWS: '0' } }),
  shopGuard: (V) => ({ ...V, __env: { REPLAY_SHOP_GUARD: '0' } }),
  lean: (V) => ({ ...V, __env: { REPLAY_LEAN: '0' } }),
};
// (the rules the null draws switch off too; the rest are measured on the real results alone)
export const NULL_RULES = ['ownBar', 'beatBar', 'bars', 'trial'];
// (a call with the environment's flags set for it, as they were after)
export function withEnv(env, f) {
  if (!env) return f();
  const was = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  Object.assign(process.env, env);
  try {
    return f();
  } finally {
    for (const [k, v] of Object.entries(was)) if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

const unitsOf = (rep) => rep?.overall?.profit ?? 0;
const flatOf = (bets) => {
  let n = 0;
  let s = 0;
  for (const b of bets) {
    if (b.practice || (b.res !== 'W' && b.res !== 'L')) continue;
    n++;
    s += b.res === 'W' ? (b.odds > 0 ? b.odds / 100 : 100 / -b.odds) : -1;
  }
  return n ? s / n : null;
};
const r4 = (x) => (fin(x) ? Math.round(x * 1e4) / 1e4 : null);
const r2 = (x) => (fin(x) ? Math.round(x * 100) / 100 : null);
const stats = (xs) => {
  const v = xs.filter(fin);
  const m = v.reduce((a, b) => a + b, 0) / (v.length || 1);
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, v.length - 1));
  return { n: v.length, mean: r2(m), sd: r2(sd) };
};

// (a bet as the time-travel test compares it: its placement, price, chance, stake and band)
const sig = (b) => `${b.timing}|${b.at}|${b.odds}|${b.p}|${b.units}|${b.band}|${b.side}`;

export function timeTravel(run, rows, base, { cuts = [0.3, 0.6, 0.85], seed = 7 } = {}) {
  const placed = (base.bets ?? []).filter((b) => !b.practice).map((b) => b.at).sort((a, b) => a - b);
  const out = [];
  for (const q of cuts) {
    const cut = placed[Math.floor(placed.length * q)];
    if (!fin(cut)) continue;
    const m = scrambleAfter(rows, cut, rngOf(seed + Math.round(q * 100)));
    const rep = run(m.rows);
    const before = new Map((base.bets ?? []).filter((b) => !b.practice && b.at < cut).map((b) => [b.id, b]));
    const after = new Map((rep.bets ?? []).filter((b) => !b.practice && b.at < cut).map((b) => [b.id, b]));
    const diffs = [];
    for (const [id, b] of before) {
      const a = after.get(id);
      if (!a) diffs.push({ id, why: 'gone', was: sig(b) });
      else if (sig(a) !== sig(b)) diffs.push({ id, why: 'moved', was: sig(b), now: sig(a) });
    }
    for (const [id, a] of after) if (!before.has(id)) diffs.push({ id, why: 'new', now: sig(a) });
    out.push({ cut: new Date(cut).toISOString(), quantile: q, compared: before.size, scrambledResults: m.ys, scrambledSnaps: m.snaps, diffs: diffs.length, examples: diffs.slice(0, 8) });
  }
  return out;
}

export function nullTests(V, run, rows, base, { draws = 20, seed = 11, rules = NULL_RULES } = {}) {
  const actual = { units: unitsOf(base), bets: base.n?.bets ?? null, flat: r4(flatOf(base.bets ?? [])), gains: {} };
  for (const k of Object.keys(RULES)) actual.gains[k] = r2(unitsOf(base) - unitsOf(run(rows, RULES[k](V))));
  const out = { actual };
  for (const mode of ['fair', 'shuffle']) {
    const units = [];
    const flat = [];
    const gains = Object.fromEntries(rules.map((k) => [k, []]));
    for (let i = 0; i < draws; i++) {
      const nr = nullRows(rows, mode, rngOf(seed + i * 101 + (mode === 'fair' ? 0 : 50000)));
      const rep = run(nr);
      units.push(unitsOf(rep));
      flat.push(flatOf(rep.bets ?? []));
      for (const k of rules) gains[k].push(unitsOf(rep) - unitsOf(run(nr, RULES[k](V))));
    }
    const u = stats(units);
    out[mode] = {
      units: u,
      z: u.sd > 0 ? r2((actual.units - u.mean) / u.sd) : null,
      above: units.filter((x) => x >= actual.units).length,
      flat: { ...stats(flat.map((x) => x * 100)), unit: '%' },
      gains: Object.fromEntries(rules.map((k) => {
        const g = stats(gains[k]);
        return [k, { ...g, actual: actual.gains[k], z: g.sd > 0 ? r2((actual.gains[k] - g.mean) / g.sd) : null, above: gains[k].filter((x) => x >= actual.gains[k]).length }];
      })),
    };
  }
  return out;
}

// The whole set for one sport: run(rowsCopy, V?) replays with the gate's own arguments
export function canaries(V, sport, args, base, { dir, draws = Number(process.env.GATE_CANARY_DRAWS ?? 20), log = console.log } = {}) {
  const [, , rows, opts] = args;
  // (REPLAY_DUMP off inside: a canary's replay (the planted leak's results in the chance) never overwrites the real
  // replay's scratch dump: 2026-10-26's luck.mjs read the leak's 83-98% winners as the record's bets)
  const run = (r, v = V) => {
    const dump = process.env.REPLAY_DUMP;
    delete process.env.REPLAY_DUMP;
    try {
      return withEnv(v.__env, () => v.replay.replayRecord(v, sport, r, opts));
    } finally {
      if (dump !== undefined) process.env.REPLAY_DUMP = dump;
    }
  };
  const t0 = Date.now();
  const res = { sport, at: new Date().toISOString(), draws };
  res.timeTravel = timeTravel(run, rows, base);
  log(`${sport}: canary time travel: ${res.timeTravel.map((c) => `${c.cut.slice(0, 10)} ${c.diffs} of ${c.compared} moved`).join(', ')}`);
  const leak = run(plantLeak(rows));
  res.planted = { units: unitsOf(leak), bets: leak.n?.bets ?? null, open: leak.flags?.timing?.open ?? null, base: unitsOf(base) };
  log(`${sport}: canary planted leak (the result in each open's chance): ${r2(res.planted.units)}u on ${res.planted.bets} bets (${res.planted.open} at the open) against ${r2(res.planted.base)}u`);
  if (draws > 0) {
    res.nulls = nullTests(V, run, rows, base, { draws });
    for (const mode of ['fair', 'shuffle']) log(`${sport}: null ${mode} (${draws} draws): units ${res.nulls[mode].units.mean} ± ${res.nulls[mode].units.sd} against ${r2(res.nulls.actual.units)} (z ${res.nulls[mode].z}); rule gains ${Object.entries(res.nulls[mode].gains).map(([k, g]) => `${k} ${g.actual} vs null ${g.mean} ± ${g.sd}`).join(', ')}`);
  }
  res.seconds = Math.round((Date.now() - t0) / 1000);
  if (dir) writeFileSync(path.join(dir, `${sport}-canary.json`), JSON.stringify(res, null, 1));
  return res;
}

// ---- The future scrambled at the source (GATE_CANARY_FUTURE=<ISO time>, gate.mjs scoreVersion) ----
// Every outcome and price after the cut replaced before anything is fit or priced: each final's score from another
// final after the cut (the same season), each player game's stat line from another player game after the cut, each
// archived snapshot after the cut jittered. A replayed bet placed before the cut whose price, chance, stake or band
// moves read something from after it: the gate's fits on the whole history (the ratings' settings, the context's
// term selection, a league mean over the season) show up here, where the replay's own walk can't see them.
export function scrambleGames(games, cut, r) {
  const after = games.filter((g) => g.final && g.hs !== null && g.as !== null && Date.parse(g.date) >= cut);
  const bySeason = new Map();
  for (const g of after) (bySeason.get(g.season) ?? bySeason.set(g.season, []).get(g.season)).push([g.hs, g.as]);
  for (const g of after) {
    const pool = bySeason.get(g.season);
    const [hs, as] = pool[Math.floor(r() * pool.length)];
    Object.assign(g, { hs, as });
  }
  return after.length;
}
export function scramblePlayerRows(rows, cut, r) {
  const after = rows.filter((x) => Date.parse(x.date) >= cut);
  const lines = after.map((x) => [x.s, x.sh]);
  for (let i = lines.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [lines[i], lines[j]] = [lines[j], lines[i]];
  }
  after.forEach((x, i) => {
    x.s = lines[i][0];
    if (lines[i][1] === undefined) delete x.sh;
    else x.sh = lines[i][1];
  });
  return after.length;
}
export function scrambleArchive(hist, cut, r) {
  let n = 0;
  for (const l of hist.lines ?? []) {
    if (!(Date.parse(l.ts) >= cut)) continue;
    l.a = jitterOdds(l.a, r);
    l.b = jitterOdds(l.b, r);
    n++;
  }
  for (const p of hist.props ?? []) {
    if (!(Date.parse(p.ts) >= cut)) continue;
    p.over = jitterOdds(p.over, r);
    p.under = jitterOdds(p.under, r);
    n++;
  }
  return n;
}

// (the canaries' reading kept on the record (D93): the bets the time travel moved of those it compared, the planted
// leak's units, the null tests' units and z where drawn)
export function canarySlim(res) {
  if (!res) return null;
  const tt = res.timeTravel ?? [];
  return { moved: tt.reduce((s, c) => s + c.diffs, 0), compared: tt.reduce((s, c) => s + c.compared, 0), cuts: tt.map((c) => c.cut.slice(0, 10)), planted: res.planted?.units ?? null, ...(res.nulls ? { nulls: Object.fromEntries(['fair', 'shuffle'].map((m) => [m, { mean: res.nulls[m].units.mean, sd: res.nulls[m].units.sd, z: res.nulls[m].z }])), actual: res.nulls.actual.units } : {}) };
}
