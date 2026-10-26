// Live against the replay (DECISIONS.md D93): each sport's live graded bets since its epoch against what the replay's
// same rules predict for bets like them (replay-record.json's `expect`, written by gate.mjs --record), with a
// significance check. The same arithmetic as libs/ranker/scripts/model/live-check.mjs (the history audit's nightly
// row reads that one); tests/live-check.test.mjs checks the two agree. No Angular here.

export interface ExpectKey {
  n: number;
  flat: number;
  beatN: number;
  beat: number;
  clv: number;
  pN: number;
  p: number;
  wins: number;
}
export interface ExpectFile {
  v: number;
  k: number;
  keys: Record<string, ExpectKey>;
}
export interface LiveCheckBet {
  units?: number | null;
  intent?: string | null;
  topN?: unknown;
  void?: boolean | null;
  status?: string | null;
  odds?: number | null;
  placedAt?: string | null;
  start?: string | null;
  market?: string | null;
  propType?: string | null;
  stat?: string | null;
  side?: string | null;
  fair?: number | null;
  p?: number | null;
  profit?: number | null;
  clv?: { beat?: boolean | null; ev?: number | null } | null;
}
export interface LiveCheck {
  v: number;
  since: string | null;
  n: number;
  flat?: number | null;
  exp?: number | null;
  book?: number | null;
  se?: number | null;
  z?: number | null;
  p?: number | null;
  zBook?: number | null;
  staked?: number | null;
  profit?: number | null;
  beat?: { n: number; share: number | null; clv: number | null; keyed: number; mine: number | null; exp: number | null; z: number | null } | null;
  cal?: { n: number; wins: number; p: number | null; zP: number | null; f: number | null; zF: number | null } | null;
}

export const LIVE_CHECK_V = 1;
export const LIVE_K = 50;
const fin = Number.isFinite;
const dec = (o: number): number => (o > 0 ? 1 + o / 100 : 1 + 100 / -o);
const r4 = (x: number | null): number | null => (x !== null && fin(x) ? Math.round(x * 1e4) / 1e4 : null);
const r2 = (x: number | null): number | null => (x !== null && fin(x) ? Math.round(x * 100) / 100 : null);
const sideWord = (s: string | null | undefined): string => (s === 'over' || s === 'under' || s === 'home' || s === 'away' ? s : s === 'h' ? 'home' : s === 'a' ? 'away' : String(s ?? ''));

export function liveKeysOf(market: string | null | undefined, stat: string | null | undefined, side: string | null | undefined): string[] {
  const m = market === 'prop' ? `prop:${stat}` : String(market);
  return [`${m}:${sideWord(side)}`, m, market === 'prop' ? 'props' : 'lines', 'all'];
}

export function expectFor(expect: ExpectFile | null | undefined, ks: string[], k = expect?.k ?? LIVE_K): { flat: number | null; beat: number | null; clv: number | null } {
  const T = expect?.keys ?? {};
  let flat: number | null = null;
  let beat: number | null = null;
  let clv: number | null = null;
  for (const key of [...ks].reverse()) {
    const a = T[key];
    if (!a) continue;
    flat = flat === null ? (a.n ? a.flat / a.n : null) : (a.flat + k * flat) / (a.n + k);
    if (a.beatN) {
      beat = beat === null ? a.beat / a.beatN : (a.beat + k * beat) / (a.beatN + k);
      clv = clv === null ? a.clv / a.beatN : (a.clv + k * clv) / (a.beatN + k);
    }
  }
  const own = ks.slice(0, 2).some((key) => !!T[key]?.beatN);
  return { flat, beat: own ? beat : null, clv: own ? clv : null };
}

const resOf = (status: string | null | undefined): 'W' | 'L' | 'P' | null => (status === 'won' ? 'W' : status === 'lost' ? 'L' : status === 'push' ? 'P' : null);
const flatOf = (res: string | null, odds: number): number => (res === 'W' ? dec(odds) - 1 : res === 'L' ? -1 : 0);

export function liveBetsOf<T extends LiveCheckBet>(bets: T[], since: string | null = null): T[] {
  const t0 = since ? Date.parse(since) : -Infinity;
  return bets.filter((b) => !!b && (b.units ?? 0) > 0 && b.intent !== 'track' && b.intent !== 'action' && !b.topN && !b.void && !!resOf(b.status) && fin(b.odds) && Date.parse(b.placedAt ?? b.start ?? '') >= t0);
}

const zOf = (d: number, se: number | null): number | null => (se !== null && se > 0 && fin(d) ? r2(d / se) : null);
export function pTwo(z: number | null): number | null {
  if (z === null || !fin(z)) return null;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return r4(1 - erf);
}

export function liveCheck(ledgerBets: LiveCheckBet[], expect: ExpectFile | null | undefined, { since = null }: { since?: string | null } = {}): LiveCheck {
  const list = liveBetsOf(ledgerBets ?? [], since);
  const out: LiveCheck = { v: LIVE_CHECK_V, since, n: list.length };
  if (!list.length) return out;
  let flat = 0;
  let flat2 = 0;
  let exp = 0;
  let book = 0;
  let staked = 0;
  let profit = 0;
  const beat = { n: 0, beat: 0, clv: 0, expN: 0, exp: 0, expClv: 0, mine: 0, mineClv: 0 };
  const cal = { n: 0, wins: 0, p: 0, pv: 0, f: 0, fv: 0 };
  for (const b of list) {
    const odds = b.odds as number;
    const res = resOf(b.status);
    const f = flatOf(res, odds);
    flat += f;
    flat2 += f * f;
    staked += b.units ?? 0;
    profit += fin(b.profit) ? (b.profit as number) : 0;
    const e = expectFor(expect, liveKeysOf(b.market, b.propType ?? b.stat, b.side));
    exp += e.flat !== null && fin(e.flat) ? e.flat : 0;
    if (fin(b.fair)) book += (b.fair as number) * dec(odds) - 1;
    // (beat the fair close as the replay reads it (D56: a positive expected return at the close's no-vig, clv.ev), not
    // clv.beat (the no-vig chance moved the bet's way))
    const bt = fin(b.clv?.ev) ? (b.clv?.ev as number) > 0 : null;
    if (bt === true || bt === false) {
      const ev = b.clv?.ev;
      beat.n++;
      beat.beat += bt ? 1 : 0;
      if (fin(ev)) beat.clv += ev as number;
      if (e.beat !== null && fin(e.beat)) {
        beat.expN++;
        beat.exp += e.beat;
        beat.expClv += e.clv !== null && fin(e.clv) ? e.clv : 0;
        beat.mine += bt ? 1 : 0;
        beat.mineClv += fin(ev) ? (ev as number) : 0;
      }
    }
    if ((res === 'W' || res === 'L') && fin(b.p)) {
      const p = b.p as number;
      cal.n++;
      cal.wins += res === 'W' ? 1 : 0;
      cal.p += p;
      cal.pv += p * (1 - p);
      if (fin(b.fair)) {
        const fr = b.fair as number;
        cal.f += fr;
        cal.fv += fr * (1 - fr);
      }
    }
  }
  const n = list.length;
  const mean = flat / n;
  const sd = n > 1 ? Math.sqrt(Math.max(0, (flat2 - n * mean * mean) / (n - 1))) : null;
  const se = sd !== null ? sd / Math.sqrt(n) : null;
  out.flat = r4(mean);
  out.exp = r4(exp / n);
  out.book = r4(book / n);
  out.se = r4(se);
  out.z = zOf(mean - exp / n, se);
  out.p = pTwo(out.z);
  out.zBook = zOf(mean - book / n, se);
  out.staked = r2(staked);
  out.profit = r2(profit);
  out.beat = beat.n
    ? {
        n: beat.n,
        share: r4(beat.beat / beat.n),
        clv: r4(beat.clv / beat.n),
        keyed: beat.expN,
        mine: beat.expN ? r4(beat.mine / beat.expN) : null,
        exp: beat.expN ? r4(beat.exp / beat.expN) : null,
        z: beat.expN ? zOf(beat.mine - beat.exp, Math.sqrt(Math.max(1e-9, beat.exp * (1 - beat.exp / beat.expN)))) : null,
      }
    : null;
  out.cal = cal.n ? { n: cal.n, wins: cal.wins, p: r2(cal.p), zP: zOf(cal.wins - cal.p, Math.sqrt(cal.pv)), f: r2(cal.f), zF: zOf(cal.wins - cal.f, Math.sqrt(cal.fv)) } : null;
  return out;
}

// (a row of the tab's table: a sport's check, words for each cell and its hover)
export interface LiveCheckRow {
  sport: string;
  n: number;
  live: string;
  exp: string;
  z: string;
  flag: 'ok' | 'warn' | 'bad' | 'thin';
  beat: string;
  cal: string;
  title: string;
}
const pctText = (x: number | null | undefined): string => (x === null || x === undefined || !fin(x) ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x * 100).toFixed(1)}%`);
const shareText = (x: number | null | undefined): string => (x === null || x === undefined || !fin(x) ? '—' : `${Math.round(x * 100)}%`);
const zText = (z: number | null | undefined): string => (z === null || z === undefined || !fin(z) ? '—' : `${z > 0 ? '+' : z < 0 ? '−' : ''}${Math.abs(z).toFixed(1)}`);
export const LIVE_MIN = 30;
export function liveCheckRow(sport: string, c: LiveCheck, label = 'since its epoch'): LiveCheckRow {
  const thin = c.n < LIVE_MIN;
  const az = Math.abs(c.z ?? 0);
  const flag: LiveCheckRow['flag'] = thin ? 'thin' : az >= 3 ? 'bad' : az >= 2 ? 'warn' : 'ok';
  const beat = c.beat ? `${shareText(c.beat.share)} of ${c.beat.n}${c.beat.exp !== null ? ` (replay ${shareText(c.beat.exp)})` : ''}` : '—';
  const cal = c.cal ? `${c.cal.wins} won / ${c.cal.p?.toFixed(1)} said (z ${zText(c.cal.zP)})` : '—';
  const title = [
    `${sport.toUpperCase()}, ${label}${c.since ? ` (${c.since.slice(0, 10)})` : ''}: ${c.n} staked edge bets graded`,
    `Flat return live ${pctText(c.flat)} against the replay's ${pctText(c.exp)} for bets like them (z ${zText(c.z)}, p ${c.p ?? '—'}); the Book's own price says ${pctText(c.book)} (z ${zText(c.zBook)})`,
    c.beat ? `Beat the fair close ${shareText(c.beat.share)} of ${c.beat.n}, mean return there ${pctText(c.beat.clv)}${c.beat.keyed ? `; on the ${c.beat.keyed} the replay checks, ${shareText(c.beat.mine)} against its ${shareText(c.beat.exp)} (z ${zText(c.beat.z)})` : ''}` : 'No live bet with a fair-close check yet',
    c.cal ? `Calibration: ${c.cal.wins} won of ${c.cal.n}; the Bot's chance said ${c.cal.p} (z ${zText(c.cal.zP)}), the Book's ${c.cal.f} (z ${zText(c.cal.zF)})` : '',
    thin ? `Under ${LIVE_MIN} bets: too few to judge` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return { sport, n: c.n, live: pctText(c.flat), exp: pctText(c.exp), z: thin ? '—' : zText(c.z), flag, beat, cal, title };
}
