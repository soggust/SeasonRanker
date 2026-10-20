// The band lab (the owner's staging sandbox, 2026-10-20; DECISIONS.md D70): a confidence-band rule tried on the whole
// replayed history before it ships. Reads the replay's bets once (the dump gate.mjs writes with REPLAY_DUMP=<dir>:
// <sport>-lab.json, every bet before the bands with its reasons, timing, price, fair close, EV_CLV and result),
// applies a variant from band-variants.json, and prints per sport the LOCK / LOVE / LIKE table walk-forward (bets,
// record, units, ROI, beat the fair close, the Book's own expectation) and the monotonic check (each band's realized
// flat return and beat share against the band below). No refits, no API calls; seconds to rerun.
//
//   node libs/ranker/scripts/model/band-lab.mjs <sport|all> [--variant <name|all>] [--dump <dir>] [--write]
//
// --write puts each sport's staged record (replay-record.mjs summarize's shape, the variant named in it) at
// apps/<sport>/src/StaticData/model/replay-record.staged.json, which the Algorithm tab's Live / Staged switch reads
// (admin only). The live rule is what gate.mjs --record writes; the lab never touches replay-record.json.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { beatBar, summarize } from './replay-record.mjs';
import { placeTiers, placed, tierOf, tierUnits, walkReasons } from './reasons.mjs';
import { CLV_RULE, GAME_HOURS, bandBets } from './clv-bands.mjs';
import { trustBands, walkTrust } from './trusted.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const SPORTS = ['nfl', 'nba', 'nhl', 'mlb', 'mma'];
const fin = Number.isFinite;
const dec = (o) => (o > 0 ? 1 + o / 100 : 1 + 100 / -o);
const r1 = (v) => (fin(v) ? Math.round(v * 10) / 10 : null);
const r2 = (v) => (fin(v) ? Math.round(v * 100) / 100 : null);
const flat = (b) => (b.res === 'W' ? dec(b.odds) - 1 : b.res === 'L' ? -1 : 0);
export const VARIANTS_FILE = path.join(import.meta.dirname, 'band-variants.json');
export const stagedFile = (sport, root = ROOT) => path.join(root, 'apps', sport, 'src/StaticData/model/replay-record.staged.json');

export function readVariants(file = VARIANTS_FILE) {
  const v = JSON.parse(readFileSync(file, 'utf8'));
  return v.variants ?? v;
}
export const ruleOf = (v) => ({ ...CLV_RULE, ...v, love: { ...CLV_RULE.love, ...(v.love ?? {}) }, lock: { ...CLV_RULE.lock, ...(v.lock ?? {}) }, units: { ...CLV_RULE.units, ...(v.units ?? {}) } });

// (MMA's bets carry no reasons in the replay (D58 isn't MMA's): its segment (favorite or dog, early or late) and the
// Kelly size, the same ids the team sports' lines carry)
function mmaIds(b) {
  const cls = b.market === 'total' ? (b.side === 'under' ? 'under' : 'over') : fin(b.fair) && b.fair < 0.5 ? 'dog' : 'fav';
  const ids = [`seg:${b.market}:${cls}:${b.timing === 'open' ? 'early' : 'late'}`];
  if (b.timing === 'open') ids.push('cleanOpen');
  if (fin(b.kelly) && b.kelly >= 0.02) ids.push('kelly2');
  if (fin(b.kelly) && b.kelly >= 0.05 && fin(b.p) && b.p >= 0.55) ids.push('kelly5');
  return ids;
}

// The bets under a variant: a copy of the dump's, reset to their stakes before the bands, banded, then D60's
// beat-the-close bar as the replay applies it
// (D72: the reliability walk on a sport's close rows, once per its options)
const walks = new Map();
export function trustWalk(dump, opts = {}) {
  const k = `${dump.sport}|${JSON.stringify(opts ?? {})}`;
  if (!walks.has(k)) walks.set(k, walkTrust(dump.attrRows, opts ?? {}));
  return walks.get(k);
}
export function applyVariant(dump, variant) {
  const bets = dump.bets.map((b) => ({ ...b, lab: b.lab ? { ...b.lab } : null }));
  for (const b of bets) {
    if (!b.lab?.before) continue;
    Object.assign(b, { band: b.lab.before.band, units: b.lab.before.units, profit: b.lab.before.profit });
    delete b.beatHeld;
    if (dump.sport === 'mma' && !b.lab.ids?.length) b.lab.ids = mmaIds(b);
  }
  const mine = bets.filter((b) => b.lab?.before && !b.practice);
  let counts = null;
  if (variant.mode === 'trusted' && dump.sport !== 'mma' && dump.attrRows) {
    // (D72's trusted edge: each bet's pieces times their reliability walk-forward, the bars on it and the Kelly score;
    // the caps (a suspect price, a barred line or stat: a LIKE at most) as every rule's, unless the variant's caps is
    // false (a diagnostic: does the trusted edge order the results at all))
    const walk = trustWalk(dump, variant.trust);
    const caps = variant.caps !== false;
    const out = trustBands(mine.map((b) => ({ t: b.t, at: b.at, market: b.market, kelly: b.kelly, attr: b.attr, suspect: caps && b.lab.suspect, barred: caps && b.lab.barred })), walk, variant);
    mine.forEach((b, i) => {
      const band = out[i].band;
      // (a suspect or barred bet keeps its stake (D60, D64) whatever its band reads)
      const units = b.lab.suspect || b.lab.barred ? b.units : tierUnits(b.units, band);
      b.profit = b.units > 0 ? r2((b.profit * units) / b.units) : 0;
      Object.assign(b, { units, band, te: out[i].te, trusted: out[i].pieces.map(([k, v]) => [k, Math.round(v * 1e4) / 1e4]) });
    });
    counts = { lock: mine.filter((b) => b.band === 'lock').length, high: mine.filter((b) => b.band === 'high').length, medium: mine.filter((b) => b.band === 'medium').length };
  } else if (variant.mode === 'd58' || variant.mode === 'trusted') {
    // (the current rule: D58's results walk and place for the team sports; D65's Kelly bands with their place for MMA)
    if (dump.sport === 'mma') {
      const place = placeTiers(mine.map((b) => ({ t: b.t + GAME_HOURS * 36e5, tier: b.band, profit: flat(b), beat: b.beat })));
      for (const b of mine) {
        const band = placed(b.band, place.at(b.at));
        const units = tierUnits(b.units, band);
        b.profit = b.units > 0 ? r2((b.profit * units) / b.units) : 0;
        Object.assign(b, { units, band });
      }
    } else {
      const walk = walkReasons(mine.map((b) => ({ t: b.t + GAME_HOURS * 36e5, season: b.season, market: b.market, reasons: b.lab.ids, profit: flat(b), beat: b.beat })));
      const would = mine.map((b) => tierOf(b.lab.ids, walk.at(b.at, b.market), b.kelly).tier);
      const place = placeTiers(mine.map((b, i) => ({ t: b.t + GAME_HOURS * 36e5, tier: would[i], profit: flat(b), beat: b.beat })));
      mine.forEach((b, i) => {
        let band = placed(would[i], place.at(b.at));
        if ((b.lab.suspect || b.lab.barred) && band !== 'medium') band = 'medium';
        const units = b.lab.suspect || b.lab.barred ? b.units : tierUnits(b.units, band);
        b.profit = b.units > 0 ? r2((b.profit * units) / b.units) : 0;
        Object.assign(b, { units, band, would: would[i] });
      });
    }
  } else counts = bandBets(bets, ruleOf(variant)).counts;
  const flags = { ...(dump.args.flags ?? {}) };
  if (dump.beatBar) beatBar(bets, { ...dump.beatBar, practiceUnits: dump.practiceUnits ?? 0.5, flags });
  return { bets, counts, flags };
}

// (a band's tally: bets, record, units staked and won, ROI, flat ROI, beat the fair close, the Book's expectation)
export function tally(list) {
  const t = { bets: 0, w: 0, l: 0, p: 0, staked: 0, profit: 0, flat: 0, beat: 0, beatN: 0, clv: 0, book: 0 };
  for (const b of list) {
    t.bets++;
    if (b.res === 'W') t.w++;
    else if (b.res === 'L') t.l++;
    else t.p++;
    t.staked += b.units;
    t.profit += b.profit;
    t.flat += flat(b);
    if (b.beat === 0 || b.beat === 1) {
      t.beatN++;
      t.beat += b.beat;
      if (fin(b.clv)) t.clv += b.clv;
    }
    // (the Book's own expectation: the side's no-vig chance at placement times the price)
    if (fin(b.fair) && fin(b.odds)) t.book += b.units * (b.fair * dec(b.odds) - 1);
  }
  return { ...t, staked: r2(t.staked), profit: r2(t.profit), roi: t.staked ? t.profit / t.staked : null, flatRoi: t.bets ? t.flat / t.bets : null, beatShare: t.beatN ? t.beat / t.beatN : null, evClv: t.beatN ? t.clv / t.beatN : null, book: r2(t.book) };
}
// The monotonic check: each band against the one below, by flat return and beat share (where both have 20 checks)
export function monotonic(by) {
  const pairs = [
    ['lock', 'high'],
    ['high', 'medium'],
  ];
  const out = [];
  for (const [a, b] of pairs) {
    const x = by[a];
    const y = by[b];
    if (!x?.bets || !y?.bets) {
      out.push({ pair: `${a}>${b}`, ok: null, why: 'empty band' });
      continue;
    }
    const roi = x.flatRoi > y.flatRoi;
    const beat = !(x.beatN >= 20 && y.beatN >= 20) || x.beatShare >= y.beatShare;
    out.push({ pair: `${a}>${b}`, ok: roi && beat, roi: [r1(x.flatRoi * 100), r1(y.flatRoi * 100)], beat: [x.beatShare === null ? null : r1(x.beatShare * 100), y.beatShare === null ? null : r1(y.beatShare * 100)] });
  }
  return out;
}

export function labOf(dump, name, variant) {
  const { bets, counts, flags } = applyVariant(dump, variant);
  const real = bets.filter((b) => !b.practice);
  const by = { lock: tally(real.filter((b) => b.band === 'lock')), high: tally(real.filter((b) => b.band === 'high')), medium: tally(real.filter((b) => b.band === 'medium')), all: tally(real) };
  return { name, variant, bets, flags, counts, by, mono: monotonic(by) };
}

const SHARE = (lab, k) => (lab.by.all.bets ? `${r1((lab.by[k].bets / lab.by.all.bets) * 100)}%` : '-');
const NAME = { lock: 'LOCK', high: 'LOVE', medium: 'LIKE', all: 'All' };
export function tableOf(sport, lab) {
  const rows = [`${sport.toUpperCase()} — ${lab.name}`, '| Band | Bets | Share | Record | Units | ROI | Flat ROI | Beat fair close | Book expects |', '|---|---|---|---|---|---|---|---|---|'];
  for (const k of ['lock', 'high', 'medium', 'all']) {
    const t = lab.by[k];
    rows.push(`| ${NAME[k]} | ${t.bets} | ${SHARE(lab, k)} | ${t.w}-${t.l}-${t.p} | ${t.profit >= 0 ? '+' : ''}${t.profit}u | ${t.roi === null ? '-' : `${r1(t.roi * 100)}%`} | ${t.flatRoi === null ? '-' : `${r1(t.flatRoi * 100)}%`} | ${t.beatN ? `${r1(t.beatShare * 100)}% of ${t.beatN}` : '-'} | ${t.book >= 0 ? '+' : ''}${t.book}u |`);
  }
  if (lab.seasons) {
    const real = lab.bets.filter((b) => !b.practice);
    const seasons = [...new Set(real.map((b) => b.season))].sort();
    const cell = (s, k) => {
      const t = tally(real.filter((b) => b.season === s && b.band === k));
      return `${NAME[k]} ${t.bets}${t.bets ? ` ${r1(t.flatRoi * 100)}%` : ''}`;
    };
    rows.push(`by season (bets, flat ROI): ${seasons.map((s) => `${s} ${['lock', 'high', 'medium'].map((k) => cell(s, k)).join(' / ')}`).join('; ')}`);
  }
  rows.push(`monotonic: ${lab.mono.map((m) => `${m.pair} ${m.ok === null ? 'n/a' : m.ok ? 'yes' : 'NO'}${m.roi ? ` (flat ${m.roi[0]}% vs ${m.roi[1]}%${m.beat[0] !== null && m.beat[1] !== null ? `, beat ${m.beat[0]}% vs ${m.beat[1]}%` : ''})` : ''}`).join('; ')}`);
  return rows.join('\n');
}

// The staged record: summarize's shape over the variant's bets, the variant named
export function stagedOf(dump, lab) {
  const passed = dump.passed.map(([y, over, odds]) => ({ x: { y }, sd: { over: !!over, odds } }));
  const flags = { ...lab.flags, tiers: { ...(lab.counts ?? {}), variant: lab.name } };
  const out = summarize(dump.sport, lab.bets, passed, { ...dump.args, now: Date.parse(dump.at), flags, seasonsWithProps: new Set(dump.args.seasonsWithProps), seasonsAll: new Set(dump.args.seasonsAll) });
  return { ...out, staged: { variant: lab.name, rule: lab.variant, at: new Date().toISOString(), mono: lab.mono } };
}

async function main() {
  const args = process.argv.slice(2);
  const val = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
  const named = args.filter((a, i) => !a.startsWith('--') && !['--variant', '--dump'].includes(args[i - 1]));
  const sports = named.includes('all') || !named.length ? SPORTS : named.filter((s) => SPORTS.includes(s));
  const dir = val('--dump') ?? path.join(ROOT, '.cache/band-lab');
  const variants = readVariants();
  const want = val('--variant') ?? 'all';
  const names = want === 'all' ? Object.keys(variants) : want.split(',');
  for (const sport of sports) {
    const file = path.join(dir, `${sport}-lab.json`);
    if (!existsSync(file)) {
      console.log(`${sport}: no dump at ${file} (REPLAY_DUMP=${dir} node libs/ranker/scripts/model/gate.mjs --score-only worktree ${sport})`);
      continue;
    }
    const dump = JSON.parse(readFileSync(file, 'utf8'));
    // (D72: the close rows' pieces (REPLAY_ATTR=1 on the replay), what the trusted variants' reliability walks on)
    const attrFile = path.join(dir, `${sport}-attr.json`);
    if (existsSync(attrFile)) dump.attrRows = JSON.parse(readFileSync(attrFile, 'utf8'));
    const staged = { v: 1, sport, at: new Date().toISOString(), order: [], labels: {}, variants: {} };
    for (const name of names) {
      if (!variants[name]) throw new Error(`no variant ${name} in ${VARIANTS_FILE}`);
      // (a trusted variant (D72) needs the replay's pieces (<sport>-attr.json); MMA's replay has none: not staged there)
      if (variants[name].mode === 'trusted' && !dump.attrRows) continue;
      const lab = labOf(dump, name, variants[name]);
      lab.seasons = args.includes('--seasons');
      console.log(`${tableOf(sport, lab)}\n`);
      // (--reasons: each reason's closing-line evidence on the whole history, the groups with 30 checks or more)
      if (args.includes('--reasons') && variants[name].mode !== 'd58') {
        const picks = lab.bets.filter((b) => b.lab?.before && !b.practice);
        const by = new Map();
        for (const b of picks) for (const id of b.lab.ids ?? []) {
          const k = `${b.market}|${id}`;
          const g = by.get(k) ?? by.set(k, { n: 0, s: 0, beat: 0, rn: 0, rs: 0 }).get(k);
          g.rn++;
          g.rs += flat(b);
          if (fin(b.clv)) {
            g.n++;
            g.s += b.clv;
            if (b.clv > 0) g.beat++;
          }
        }
        const k = typeof variants[name].k === 'number' ? variants[name].k : 100;
        const rows = [...by].filter(([, g]) => g.n >= 30).sort((a, b) => b[1].s / b[1].n - a[1].s / a[1].n);
        for (const [key, g] of rows) console.log(`  ${key}: ${g.n} checks, EV ${r1((g.s / g.n) * 100)}% (shrunk ${r1(((g.s / g.n) * g.n * 100) / (g.n + k))}%), beat ${r1((g.beat / g.n) * 100)}%; ${g.rn} graded, flat ${r1((g.rs / g.rn) * 100)}%`);
      }
      staged.order.push(name);
      // (the switch's readable name, band-variants.json's label (D72))
      staged.labels[name] = variants[name].label ?? name;
      staged.variants[name] = stagedOf(dump, lab);
    }
    if (args.includes('--write')) writeFileSync(stagedFile(sport), JSON.stringify(staged));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main();
