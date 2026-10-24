// The weekly self-tune (DECISIONS.md D88, the owner, 2026-10-23: "the audit should adjust the algorithm based on the
// data, not only re-record"). After the weekly re-record, each sport's menu of knobs (tuned.mjs KNOBS: a fixed grid
// around each, documented bounds) is tried one knob at a time through the replay:
//   staking knobs   re-staked on the one replay (gate.mjs TUNE_GRID: the same priced rows, each candidate's replay run
//                   again in-process with its knob overridden); the chances don't move, so D22's layers tie by
//                   construction and the record decides
//   pricing knobs   a full scoring each (TUNE_OVERRIDE in its own process) and D22's verdict against the champion
//                   (gate.mjs compareScores: the projections, the priced rows, D60's guard, D86's recency veto)
// A candidate ships only when it beats the current settings on units over the whole replay; was the best on the
// months before the last 8 weeks (HOLDOUT_DAYS), past CHOOSE_Z standard errors there (the grid fixed in advance, the
// choice made there alone); then wins the held-out last 8 weeks too; isn't worse on the last complete season, nor
// beyond noise on the current one once it holds RECENT_BETS bets; and passes D60's guard (the bets' beat-the-close
// share and return, plain and stake-weighted, not down while the units are up). At most one change a sport a week
// (none within WEEK_DAYS of the last), a knob changed within COOLDOWN_DAYS not tried, never a value out of its bounds.
// A shipped change is data: apps/<sport>/src/StaticData/model/tuned.json (its knobs, a dated change log, the week's
// summary), MODEL_EPOCH bumped only for a pricing knob (D4), a Findings line a change and one a held sport.
//
//   node libs/ranker/scripts/model/self-tune.mjs [sports] [--dry] [--date YYYY-MM-DD] [--json <file>] [--knobs a,b (those alone)]
// Free: no API calls, no AI, never the live bettor. history-audit.mjs --mode weekly runs it after the re-record and
// re-records a sport it changed.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KNOBS, TUNED_V, inBounds, onMenu, tunedFile } from './tuned.mjs';
import { etDay } from './sources.mjs';
import { replayGuard, GUARD_EV_TOL, GUARD_MIN, GUARD_TOL } from './gate-score.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const MODEL = path.join(ROOT, 'libs/ranker/scripts/model');
export const SPORTS = ['nfl', 'nba', 'nhl', 'mlb', 'mma'];
export const TUNE_V = 1;
export const REF = 'D88';
// (the held-out window: the last 8 weeks of play (holdoutCut: an off-season gap counted at most a week))
export const HOLDOUT_DAYS = 56;
// (the choice's margin on the months before them: the gain past this many standard errors, by day)
export const CHOOSE_Z = 1;
// (a knob changed this recently isn't tried again)
export const COOLDOWN_DAYS = 28;
// (one change a sport a week: none tried within this many days of the last)
export const WEEK_DAYS = 6;
// (the current season judged once it holds this many bets; beyond noise at NOISE_Z)
export const RECENT_BETS = 100;
export const NOISE_Z = 1.96;
// (a sport's tuned.json keeps this many changes)
export const CHANGES_MAX = 60;

const fin = Number.isFinite;
const r2 = (x) => Math.round(x * 100) / 100;
const r4 = (x) => Math.round(x * 1e4) / 1e4;
const dayMs = (d) => Date.parse(`${d}T12:00:00Z`);
export const daysBetween = (a, b) => Math.round((dayMs(b) - dayMs(a)) / 864e5);
const addDays = (d, n) => new Date(dayMs(d) + n * 864e5).toISOString().slice(0, 10);

// ---- the replay's day series ----

// A replay's bets by ET day: [day, season, profit, staked, bets, checked, beat, clv sum, units checked, units beat,
// units x clv] (checked: a fair-close check, D56), and its overall
export function seriesOf(replay) {
  const by = new Map();
  for (const b of replay?.bets ?? []) {
    if (!fin(b.t)) continue;
    const day = etDay(b.t);
    const e = by.get(day) ?? [day, b.season ?? null, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    e[2] += b.profit ?? 0;
    e[3] += b.units ?? 0;
    e[4]++;
    if (b.beat === 1 || b.beat === 0) {
      const clv = fin(b.clv) ? b.clv : 0;
      e[5]++;
      e[6] += b.beat;
      e[7] += clv;
      e[8] += b.units ?? 0;
      e[9] += (b.units ?? 0) * b.beat;
      e[10] += (b.units ?? 0) * clv;
    }
    by.set(day, e);
  }
  const days = [...by.values()].sort((a, b) => a[0].localeCompare(b[0])).map((e) => [e[0], e[1], r2(e[2]), r2(e[3]), e[4], e[5], e[6], r4(e[7]), r2(e[8]), r2(e[9]), r4(e[10])]);
  const o = replay?.overall ?? {};
  return { overall: { bets: o.bets ?? 0, profit: o.profit ?? 0, staked: o.staked ?? 0, beat: o.beat ?? null, beatN: o.beatN ?? 0, clv: o.clv ?? null }, days, ...(replay?.flags?.margin ? { margin: replay.flags.margin } : {}) };
}

// The gate's hook (gate.mjs, gate-mma.mjs scoreVersion, TUNE_GRID=<file of [{ id, knob, value }]>, TUNE_OUT=<file>):
// the same replay run again under each candidate (its knob set in-process, tuned.mjs setOverride), each one's series
export function tuneReplays(V, sport, base, rerun, { grid = null, out = process.env.TUNE_OUT, current = null } = {}) {
  const list = grid ?? JSON.parse(readFileSync(process.env.TUNE_GRID, 'utf8'));
  const res = { v: TUNE_V, sport, current, base: seriesOf(base), cands: {}, secs: {} };
  for (const c of list) {
    if (!V.tuned?.setOverride) break;
    const t0 = Date.now();
    V.tuned.setOverride(sport, { [c.knob]: c.value });
    try {
      res.cands[c.id] = seriesOf(rerun());
    } finally {
      V.tuned.setOverride(sport, null);
    }
    res.secs[c.id] = Math.round((Date.now() - t0) / 100) / 10;
  }
  if (out) writeFileSync(out, JSON.stringify(res));
  return res;
}

// ---- the candidates ----

// The sport's tuned file as it stands (a fresh one where none)
export function readTunedFile(sport, root = ROOT) {
  try {
    const f = JSON.parse(readFileSync(tunedFile(sport, root), 'utf8'));
    if (f && typeof f === 'object' && f.knobs && typeof f.knobs === 'object') return { changes: [], ...f };
  } catch {
    // (none, or unreadable: a fresh one)
  }
  return { v: TUNED_V, sport, knobs: {}, changes: [] };
}
export const valueOf = (file, name) => (inBounds(name, file?.knobs?.[name]) ? file.knobs[name] : KNOBS[name].def);

// This week's candidates for a sport: each knob on its menu at each grid value but its own, in bounds, unless a change
// shipped within WEEK_DAYS (none at all: one a week) or the knob changed within COOLDOWN_DAYS. { cands, blocked }
export function candidatesOf(sport, file, date, only = null) {
  const changes = file?.changes ?? [];
  const blocked = [];
  const recent = changes.filter((c) => fin(daysBetween(c.date, date)) && daysBetween(c.date, date) < WEEK_DAYS);
  if (recent.length) return { cands: [], blocked: [`a change shipped ${recent.at(-1).date} (${recent.at(-1).knob}): one a week`] };
  const cands = [];
  for (const [name, k] of Object.entries(KNOBS)) {
    if (!onMenu(sport, name) || (only && !only.includes(name))) continue;
    const last = changes.filter((c) => c.knob === name).at(-1);
    if (last && daysBetween(last.date, date) < COOLDOWN_DAYS) {
      blocked.push(`${name} changed ${last.date}: cooling down till ${addDays(last.date, COOLDOWN_DAYS)}`);
      continue;
    }
    const from = valueOf(file, name);
    for (const value of k.grid) if (inBounds(name, value) && Math.abs(value - from) > 1e-12) cands.push({ id: `${name}=${value}`, knob: name, value, from, kind: k.kind, ref: k.ref });
  }
  return { cands, blocked };
}

// ---- the verdict ----

// The held-out window's first day: the last holdoutDays of play, walked back from the newest bet day with each gap
// between bet days counted at most GAP_CAP days, so an off-season (the NHL's summer, the NFL's spring) isn't the window
export const GAP_CAP = 7;
export function holdoutCut(days, holdoutDays = HOLDOUT_DAYS) {
  if (!days.length) return null;
  let acc = 0;
  for (let i = days.length - 1; i > 0; i--) {
    acc += Math.min(GAP_CAP, daysBetween(days[i - 1], days[i]));
    if (acc >= holdoutDays) return days[i];
  }
  return days[0];
}
// (a set of day differences: the gain summed, its standard error (by day), the days)
function sumOf(rows) {
  const n = rows.length;
  if (!n) return { gain: 0, se: 0, days: 0 };
  const g = rows.reduce((t, r) => t + r.d, 0);
  const m = g / n;
  const v = n > 1 ? rows.reduce((t, r) => t + (r.d - m) ** 2, 0) / (n - 1) : 0;
  return { gain: r2(g), se: r2(Math.sqrt(n * v)), days: n };
}
// (D60's guard on the stake: the bets' beat-the-close share and return weighted by their units, not down while the
// units are up)
export function stakeGuard(base, cand) {
  const tot = (s) => s.days.reduce((t, d) => ({ u: t.u + d[8], b: t.b + d[9], c: t.c + d[10], n: t.n + d[5] }), { u: 0, b: 0, c: 0, n: 0 });
  const a = tot(base);
  const b = tot(cand);
  if (!(a.n >= GUARD_MIN && b.n >= GUARD_MIN && a.u > 0 && b.u > 0) || !(cand.overall.profit > base.overall.profit)) return { pass: true, why: null };
  const shareDown = b.b / b.u < a.b / a.u - GUARD_TOL;
  const evDown = b.c / b.u < a.c / a.u - GUARD_EV_TOL;
  if (!shareDown && !evDown) return { pass: true, why: null };
  return { pass: false, why: `the units up while the stake-weighted bets beat the fair close ${shareDown ? `less often (${r2((100 * a.b) / a.u)}% to ${r2((100 * b.b) / b.u)}%)` : `at a lower return (${r4(a.c / a.u)} to ${r4(b.c / b.u)})`}` };
}

// A candidate's series against the current settings'. { pass, checks, why[], all, choose, hold, last, current, units }
export function judge(base, cand, { holdoutDays = HOLDOUT_DAYS, chooseZ = CHOOSE_Z, recentBets = RECENT_BETS, current: now = null } = {}) {
  const A = new Map(base.days.map((d) => [d[0], d]));
  const B = new Map(cand.days.map((d) => [d[0], d]));
  const days = [...new Set([...A.keys(), ...B.keys()])].sort();
  const rows = days.map((day) => ({ day, season: (A.get(day) ?? B.get(day))[1], d: (B.get(day)?.[2] ?? 0) - (A.get(day)?.[2] ?? 0), n: A.get(day)?.[4] ?? 0 }));
  const cut = holdoutCut(days, holdoutDays);
  const all = sumOf(rows);
  const choose = sumOf(rows.filter((r) => r.day < cut));
  const hold = sumOf(rows.filter((r) => r.day >= cut));
  const seasons = [...new Set(rows.map((r) => r.season).filter(fin))].sort((a, b) => a - b);
  // (the current season: the sport's (the gate's newest season with finals), else the replay's newest; the last complete one before it)
  const current = fin(now) ? now : (seasons.at(-1) ?? null);
  const lastS = seasons.includes(current - 1) ? current - 1 : null;
  const cur = { season: current, bets: rows.filter((r) => r.season === current).reduce((t, r) => t + r.n, 0), ...sumOf(rows.filter((r) => r.season === current)) };
  const last = { season: lastS, ...sumOf(rows.filter((r) => r.season === lastS)) };
  const g1 = replayGuard(base.overall, cand.overall);
  const g2 = stakeGuard(base, cand);
  const checks = {
    units: all.gain > 0,
    choose: choose.gain > 0 && choose.gain > chooseZ * choose.se,
    holdout: hold.gain > 0,
    lastSeason: lastS === null || last.gain >= 0,
    currentSeason: cur.bets < recentBets || cur.gain + NOISE_Z * cur.se >= 0,
    guard: !g1 || g1.pass,
    stakeGuard: g2.pass,
  };
  const why = [];
  if (!checks.units) why.push(`no more units over the whole replay (${all.gain >= 0 ? '+' : ''}${all.gain}u)`);
  if (!checks.choose) why.push(`not past ${chooseZ} SE before the last ${holdoutDays / 7} weeks (${choose.gain >= 0 ? '+' : ''}${choose.gain}u, SE ${choose.se})`);
  if (!checks.holdout) why.push(`no win in the held-out last ${holdoutDays / 7} weeks (${hold.gain >= 0 ? '+' : ''}${hold.gain}u)`);
  if (!checks.lastSeason) why.push(`worse in the last complete season ${lastS} (${last.gain}u)`);
  if (!checks.currentSeason) why.push(`worse beyond noise in the current season ${current} (${cur.gain}u, SE ${cur.se})`);
  if (!checks.guard) why.push(g1.why);
  if (!checks.stakeGuard) why.push(g2.why);
  return { pass: Object.values(checks).every(Boolean), checks, why, all, choose, hold, last, current: cur, cut, units: { base: base.overall.profit, cand: cand.overall.profit } };
}

// The week's decision for a sport from its judged candidates ([{ ...cand, j, gate? }], gate: a pricing knob's D22
// verdict { pass, why }): the one with the most units on the months before the held-out weeks (the choice made there
// alone, past CHOOSE_Z SE), shipped only if it passes every other check. { ship, top, ranked }
export function decide(judged) {
  const ranked = [...judged].filter((c) => c.j?.checks.choose).sort((a, b) => b.j.choose.gain - a.j.choose.gain);
  const top = ranked[0] ?? null;
  const pass = !!top && top.j.pass && (top.kind !== 'pricing' || !!top.gate?.pass);
  return { ship: pass ? top : null, top, ranked };
}

// ---- the writing ----

const PCT = new Set(['beatBar', 'ownThr']);
export const fmtValue = (name, v) => (PCT.has(name) ? `${r2(v * 100)}%` : `${v}`);
const sgn = (x) => `${x >= 0 ? '+' : ''}${r2(x)}u`;
export const knobLabel = (name) => `${KNOBS[name]?.ref ?? ''} ${name}`.trim();

// The sport's file with the change applied and the week's summary
export function applyShip(file, sport, ship, date) {
  const knobs = { ...(file?.knobs ?? {}), [ship.knob]: ship.value };
  const change = { date, knob: ship.knob, ref: ship.ref, kind: ship.kind, from: ship.from, to: ship.value, units: ship.j.units, gain: ship.j.all.gain, choose: ship.j.choose.gain, hold: ship.j.hold.gain, last: { season: ship.j.last.season, gain: ship.j.last.gain }, current: { season: ship.j.current.season, gain: ship.j.current.gain } };
  return { ...file, v: TUNED_V, sport, knobs, changes: [...(file?.changes ?? []), change].slice(-CHANGES_MAX) };
}
export function summaryOf(sport, date, res) {
  const brief = (c) => ({ id: c.id, gain: c.j.all.gain, choose: c.j.choose.gain, hold: c.j.hold.gain, last: c.j.last.gain, pass: c.j.pass && (c.kind !== 'pricing' || !!c.gate?.pass), why: [...c.j.why, ...(c.kind === 'pricing' && c.gate && !c.gate.pass ? c.gate.why : [])].slice(0, 3) });
  return { date, tried: res.judged.length, blocked: res.blocked, shipped: res.decision.ship ? res.decision.ship.id : null, top: res.decision.ranked.slice(0, 5).map(brief), secs: res.secs ?? null };
}
// The Findings line for a change, or for a held sport
export function findingText(sport, res) {
  const S = sport.toUpperCase();
  const s = res.decision.ship;
  if (s) return `Self-tune: ${S} ${knobLabel(s.knob)} ${fmtValue(s.knob, s.from)} → ${fmtValue(s.knob, s.value)}: ${sgn(s.j.all.gain)} (${sgn(s.j.units.base)} → ${sgn(s.j.units.cand)}), last 8 weeks ${sgn(s.j.hold.gain)}, newest season ${sgn(s.j.last.season === null ? s.j.current.gain : s.j.last.gain)}`;
  const t = res.decision.top;
  if (!res.judged.length) return `Self-tune: ${S} held, nothing tried (${res.blocked[0] ?? 'no knob on the menu'})`;
  if (!t) return `Self-tune: ${S} held: none of ${res.judged.length} settings beat the current before the last 8 weeks past ${CHOOSE_Z} SE`;
  const why = [...t.j.why, ...(t.kind === 'pricing' && t.gate && !t.gate.pass ? t.gate.why : [])][0] ?? 'held';
  return `Self-tune: ${S} held: best ${knobLabel(t.knob)} ${fmtValue(t.knob, t.from)} → ${fmtValue(t.knob, t.value)} ${sgn(t.j.choose.gain)} before the last 8 weeks, but ${why}`;
}
// (the Findings file with the sport's week written: a change is a shipped line kept; the held line replaces the
// sport's last self-tune watching line)
export function setFindings(file, sport, res, date) {
  const f = file && Array.isArray(file.entries) ? file : { v: 1, entries: [] };
  const mine = (e) => e.ref === REF && e.group === 'watching' && e.sport === sport && /^Self-tune:/.test(e.text ?? '');
  const entries = f.entries.filter((e) => !mine(e));
  entries.push({ date, group: res.decision.ship ? 'shipped' : 'watching', sport, ref: REF, text: findingText(sport, res).slice(0, 240) });
  return { ...f, entries };
}
// (MODEL_EPOCH in leagues.mjs set to the time given: a pricing knob's change, D4)
export function bumpEpoch(text, iso) {
  const re = /export const MODEL_EPOCH = '[^']*';/;
  if (!re.test(text)) throw new Error('MODEL_EPOCH not found');
  return text.replace(re, `export const MODEL_EPOCH = '${iso}';`);
}

// ---- the run ----

function score(sport, { env = {}, out, log }) {
  const t0 = Date.now();
  const args = ['--max-old-space-size=8192', path.join(MODEL, 'gate.mjs'), '--score', MODEL, '--sport', sport, '--out', out];
  const r = spawnSync(process.execPath, args, { cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (log) writeFileSync(log, `${r.stdout ?? ''}${r.stderr ?? ''}`);
  if (r.status !== 0) throw new Error(`${sport}: the scoring failed (exit ${r.status}): ${String(r.stderr ?? '').trim().split('\n').slice(-3).join(' / ').slice(0, 300)}`);
  return Math.round((Date.now() - t0) / 1000);
}

export async function tuneSport(sport, { date, dir, dry = false, only = null, log = console.log } = {}) {
  const t0 = Date.now();
  const file = readTunedFile(sport);
  const { cands, blocked } = candidatesOf(sport, file, date, only);
  const secs = {};
  const judged = [];
  if (cands.length) {
    mkdirSync(dir, { recursive: true });
    const staking = cands.filter((c) => c.kind === 'staking');
    const pricing = cands.filter((c) => c.kind === 'pricing');
    const gridFile = path.join(dir, `${sport}-grid.json`);
    const outFile = path.join(dir, `${sport}-tune.json`);
    const champFile = path.join(dir, `${sport}-champion.json`);
    writeFileSync(gridFile, JSON.stringify(staking.map(({ id, knob, value }) => ({ id, knob, value }))));
    log(`${sport}: ${staking.length} staking and ${pricing.length} pricing settings to try${blocked.length ? `; ${blocked.join('; ')}` : ''}`);
    secs.champion = score(sport, { env: { TUNE_GRID: gridFile, TUNE_OUT: outFile }, out: champFile, log: path.join(dir, `${sport}-champion.log`) });
    const res = JSON.parse(readFileSync(outFile, 'utf8'));
    secs.restake = r2(Object.values(res.secs ?? {}).reduce((t, x) => t + x, 0));
    for (const c of staking) if (res.cands[c.id]) judged.push({ ...c, j: judge(res.base, res.cands[c.id], { current: res.current }) });
    if (pricing.length) {
      const G = await import('./gate.mjs');
      const champ = JSON.parse(readFileSync(champFile, 'utf8'));
      const empty = path.join(dir, `${sport}-empty.json`);
      writeFileSync(empty, '[]');
      for (const c of pricing) {
        const cf = path.join(dir, `${sport}-${c.id}.json`);
        const of = path.join(dir, `${sport}-${c.id}-tune.json`);
        secs[c.id] = score(sport, { env: { TUNE_GRID: empty, TUNE_OUT: of, TUNE_OVERRIDE: JSON.stringify({ [sport]: { [c.knob]: c.value } }) }, out: cf, log: path.join(dir, `${sport}-${c.id}.log`) });
        const cmp = G.compareScores(sport, champ, JSON.parse(readFileSync(cf, 'utf8')));
        judged.push({ ...c, j: judge(res.base, JSON.parse(readFileSync(of, 'utf8')).base, { current: res.current }), gate: { pass: !!cmp.verdict?.pass, why: cmp.verdict?.why ?? [] } });
      }
    }
  } else log(`${sport}: nothing to try (${blocked.join('; ') || 'no knob on the menu'})`);
  const decision = decide(judged);
  const out = { sport, judged, blocked, decision, secs };
  out.secs.total = Math.round((Date.now() - t0) / 1000);
  let next = decision.ship ? applyShip(file, sport, decision.ship, date) : { v: TUNED_V, sport, knobs: {}, changes: [], ...file };
  next = { ...next, last: summaryOf(sport, date, out) };
  if (!dry && (cands.length || existsSync(tunedFile(sport)))) writeFileSync(tunedFile(sport), `${JSON.stringify(next, null, 1)}\n`);
  out.file = next;
  log(`${sport}: ${findingText(sport, out)} (${out.secs.total}s)`);
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const val = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
  const sports = args.filter((a) => SPORTS.includes(a));
  const date = val('--date') ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
  const dry = args.includes('--dry');
  const dir = path.join(ROOT, '.cache/self-tune', date);
  const results = [];
  for (const sport of sports.length ? sports : SPORTS) {
    // (a sport with no knob on its menu (MMA: its live desk reads no bar) has nothing to tune)
    if (!Object.keys(KNOBS).some((n) => onMenu(sport, n))) continue;
    try {
      results.push(await tuneSport(sport, { date, dir, dry, only: val('--knobs')?.split(',') ?? null }));
    } catch (err) {
      console.log(`${sport}: the self-tune failed: ${String(err?.message ?? err).slice(0, 300)}`);
      results.push({ sport, error: String(err?.message ?? err).slice(0, 300) });
    }
  }
  // (the Findings and, for a pricing knob shipped, the epoch)
  if (!dry) {
    const ff = path.join(ROOT, 'apps/nfl/src/StaticData/model/findings.json');
    let f = JSON.parse(readFileSync(ff, 'utf8'));
    for (const r of results) if (!r.error) f = setFindings(f, r.sport, r, date);
    writeFileSync(ff, `${JSON.stringify(f, null, 1)}\n`);
    if (results.some((r) => r.decision?.ship?.kind === 'pricing')) {
      const lf = path.join(MODEL, 'leagues.mjs');
      writeFileSync(lf, bumpEpoch(readFileSync(lf, 'utf8'), new Date().toISOString().replace(/\.\d+Z$/, 'Z')));
    }
  }
  const brief = results.map((r) => ({ sport: r.sport, error: r.error ?? null, shipped: r.decision?.ship ? { id: r.decision.ship.id, kind: r.decision.ship.kind, from: r.decision.ship.from, to: r.decision.ship.value, j: r.decision.ship.j } : null, text: r.error ? null : findingText(r.sport, r), tried: r.judged?.length ?? 0, top: r.file?.last?.top ?? [], secs: r.secs ?? null }));
  if (val('--json')) writeFileSync(val('--json'), JSON.stringify(brief, null, 1));
  console.log(`SELF-TUNE ${JSON.stringify(brief.map((b) => ({ sport: b.sport, shipped: b.shipped?.id ?? null, kind: b.shipped?.kind ?? null, error: b.error })))}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
