// The win patterns (DECISIONS.md D84, 2026-10-23, the owner: "you've been crushing NBA; take the season to date and
// see if there are any patterns between wins we expected and wins that overperformed, for confidence band ideas").
// A bet's pattern ids, each a segment of what the Bot knew at placement (its chance, its edge, the price, the stat and
// side, the piece of the projection that drove it, his minutes and their trend, his rest, home or away, his seasons
// played), and the walk that earns a segment a band: month by month, from the bets settled before the month alone,
// a segment whose bets made money and led the rest of their class (props or lines) by Z standard errors in flat
// return, on N of them, in most seasons. A bet in an earned segment is a would-be LOVE; in two of different families
// (or one past Z_LOCK) a would-be LOCK. The band lab's mode 'pattern' (band-lab.mjs) stages it; research only.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const fin = Number.isFinite;
const dec = (o) => (o > 0 ? 1 + o / 100 : 1 + 100 / -o);
export const flatOf = (b) => (b.res === 'W' ? dec(b.odds) - 1 : b.res === 'L' ? -1 : 0);

// (the families: two earned segments of one family never make a LOCK)
export const FAMILIES = ['stat', 'chance', 'edge', 'price', 'piece', 'minutes', 'role', 'rest', 'venue', 'young', 'month', 'timing'];

// A bet's pattern ids from what was known at its placement (ctx: his games before it, players-<sport>.json)
export function patternIds(b, ctx = {}) {
  const ids = [];
  const prop = b.market === 'prop';
  ids.push(`stat:${prop ? b.stat : b.market}:${b.side}`);
  if (fin(b.p)) ids.push(`chance:${b.p >= 0.6 ? '60+' : b.p >= 0.55 ? '55-60' : b.p >= 0.5 ? '50-55' : 'u50'}`);
  if (fin(b.p) && fin(b.odds)) {
    const e = b.p - 1 / dec(b.odds);
    ids.push(`edge:${e >= 0.07 ? '7+' : e >= 0.04 ? '4-7' : e >= 0.02 ? '2-4' : 'u2'}`);
  }
  if (fin(b.odds)) ids.push(`price:${b.odds <= -150 ? 'fav150' : b.odds < -110 ? 'fav' : b.odds <= 110 ? 'even' : b.odds <= 150 ? 'dog' : 'dog150'}`);
  if (prop && b.attr) {
    const e = Object.entries(b.attr).filter(([k, v]) => k !== 'cal' && k !== 'base' && fin(v));
    if (e.length) {
      e.sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
      ids.push(`piece:${e[0][0]}${e[0][1] > 0 ? '+' : '-'}`);
    }
    if ((b.attr.vacated ?? 0) > 0.005) ids.push('role:vacated');
  }
  if (prop && fin(ctx.min5)) ids.push(`minutes:${ctx.min5 < 20 ? 'u20' : ctx.min5 < 28 ? '20-28' : ctx.min5 < 34 ? '28-34' : '34+'}`);
  if (prop && fin(ctx.min5) && fin(ctx.min20) && ctx.gp >= 8) {
    const d = ctx.min5 - ctx.min20;
    if (d > 3) ids.push('role:up');
    else if (d < -3) ids.push('role:down');
  }
  if (prop && fin(ctx.rest)) ids.push(`rest:${ctx.rest <= 1 ? 'b2b' : ctx.rest === 2 ? '1day' : ctx.rest <= 4 ? '2-3' : '4+'}`);
  if (prop && (ctx.home === true || ctx.home === false)) ids.push(`venue:${ctx.home ? 'home' : 'away'}`);
  if (prop && fin(ctx.yrs)) ids.push(`young:${ctx.yrs <= 0 ? 'rookie' : ctx.yrs === 1 ? '2nd' : ctx.yrs === 2 ? '3rd' : 'vet'}`);
  if (fin(b.t)) {
    const m = new Date(b.t).getUTCMonth();
    ids.push(`month:${m >= 9 || m === 0 ? 'oct-jan' : m <= 2 ? 'feb-mar' : 'apr+'}`);
  }
  if (!prop && b.timing) ids.push(`timing:${b.timing}`);
  return ids;
}
export const familyOf = (id) => String(id).split(':')[0];

// Each prop bet's context from the players' games before it (players-<sport>.json: { <event>: { h, a: [[id, name,
// pos, min, ...]] } }), the events' times from the bets and the priced closes, his seasons played from the closes'
// yrs (D82). Map bet id -> { home, rest (days), min5, min20, gp, yrs }
export function contextOf(dir, sport, bets, root = path.resolve(import.meta.dirname, '../../../..')) {
  const out = new Map();
  const pf = path.join(root, `.cache/model/players-${sport}.json`);
  if (!existsSync(pf)) return out;
  const games = JSON.parse(readFileSync(pf, 'utf8'));
  const cf = path.join(dir, `${sport}-propclose.json`);
  const pc = existsSync(cf) ? JSON.parse(readFileSync(cf, 'utf8')) : [];
  const evT = new Map();
  for (const r of pc) if (!evT.has(String(r[0]))) evT.set(String(r[0]), r[8]);
  for (const b of bets) if (!evT.has(String(b.event))) evT.set(String(b.event), b.t);
  const yrs = new Map(pc.map((r) => [`${r[0]}|${r[1]}|${r[2]}`, r[13] ?? null]));
  const seq = new Map();
  for (const [ev, g] of Object.entries(games)) {
    const t = evT.get(ev);
    if (!fin(t)) continue;
    for (const side of ['h', 'a']) for (const row of g[side] ?? []) {
      const id = String(row[0]);
      (seq.get(id) ?? seq.set(id, []).get(id)).push({ t, min: row[3], home: side === 'h', ev });
    }
  }
  for (const s of seq.values()) s.sort((a, b) => a.t - b.t);
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  for (const b of bets) {
    if (b.market !== 'prop') continue;
    const pid = String(b.id).split(':')[2];
    const s = seq.get(pid);
    const y = yrs.get(`${b.event}|${b.stat}|${b.player}`) ?? null;
    if (!s) {
      out.set(b.id, { yrs: y });
      continue;
    }
    const i = s.findIndex((x) => x.ev === String(b.event));
    const prior = (i >= 0 ? s.slice(0, i) : s.filter((x) => x.t < b.t)).filter((x) => b.t - x.t < 200 * 864e5);
    const last = prior.at(-1);
    out.set(b.id, { home: i >= 0 ? s[i].home : null, rest: last ? Math.round((b.t - last.t) / 864e5) : null, min5: avg(prior.slice(-5).map((x) => x.min)), min20: avg(prior.slice(-20).map((x) => x.min)), gp: prior.length, yrs: y });
  }
  return out;
}

// The walk (month by month; a bet's month its placement's): each segment of a class judged on the class's bets
// settled before the month: n >= nMin, its flat return over 0, its lead over the rest by z >= zLove standard errors,
// leading in seasonShare of the seasons where it has seasonMin bets (two at least); strong past zLock.
// list: [{ t (start), at (placed), season, cls, ids, flat }]. { at(t, cls) -> Map id -> 'love'|'lock' }
export const PATTERN_OPTS = { nMin: 60, zLove: 1.645, zLock: 3, seasonShare: 0.6, seasonMin: 10, seasonsMin: 2, settleH: 3 };
export function patternWalk(list, opts = {}) {
  const o = { ...PATTERN_OPTS, ...opts };
  const monthOf = (t) => {
    const d = new Date(t);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  };
  const months = [...new Set(list.map((b) => monthOf(b.at ?? b.t)))].sort((a, b) => a - b);
  const byMonth = new Map();
  const settled = [...list].sort((a, b) => a.t - b.t);
  for (const m of months) {
    const before = settled.filter((b) => b.t + o.settleH * 36e5 < m);
    const verdict = new Map();
    for (const cls of new Set(before.map((b) => b.cls))) {
      const mine = before.filter((b) => b.cls === cls);
      const ids = new Set(mine.flatMap((b) => b.ids));
      for (const id of ids) {
        const ins = [];
        const outs = [];
        for (const b of mine) (b.ids.includes(id) ? ins : outs).push(b);
        if (ins.length < o.nMin || outs.length < o.nMin) continue;
        const st = (a) => {
          const m0 = a.reduce((s, b) => s + b.flat, 0) / a.length;
          const v = a.reduce((s, b) => s + (b.flat - m0) ** 2, 0) / Math.max(1, a.length - 1);
          return { m: m0, se: Math.sqrt(v / a.length) };
        };
        const a = st(ins);
        const r = st(outs);
        if (!(a.m > 0)) continue;
        const z = (a.m - r.m) / Math.sqrt(a.se ** 2 + r.se ** 2 || 1);
        if (z < o.zLove) continue;
        const seasons = [...new Set(ins.map((b) => b.season))].filter((s) => ins.filter((b) => b.season === s).length >= o.seasonMin && outs.some((b) => b.season === s));
        if (seasons.length < o.seasonsMin) continue;
        const led = seasons.filter((s) => st(ins.filter((b) => b.season === s)).m > st(outs.filter((b) => b.season === s)).m).length;
        if (led / seasons.length < o.seasonShare) continue;
        verdict.set(`${cls}|${id}`, z >= o.zLock ? 'lock' : 'love');
      }
    }
    byMonth.set(m, verdict);
  }
  return {
    at: (t, cls) => {
      const v = byMonth.get(monthOf(t)) ?? new Map();
      return new Map([...v].filter(([k]) => k.startsWith(`${cls}|`)).map(([k, x]) => [k.slice(cls.length + 1), x]));
    },
    months: byMonth,
  };
}

// A bet's band by the walk: LOCK where one earned id is strong or two of different families are earned, LOVE one
export function patternBand(ids, earned) {
  const mine = ids.filter((id) => earned.has(id));
  if (!mine.length) return { band: 'medium', ids: [] };
  const strong = mine.some((id) => earned.get(id) === 'lock');
  const fams = new Set(mine.map(familyOf));
  return { band: strong || fams.size >= 2 ? 'lock' : 'high', ids: mine };
}
