// The Bot's history for the Algorithm tab (the owner, 2026-10-19: "since the Bot is agnostic, update the Algorithm
// history with the bets and confidence bands it WOULD have made against the history"): each sport's replayed record
// (apps/<sport>/src/StaticData/model/replay-record.json, written by libs/ranker/scripts/model/gate.mjs --record: today's
// algorithm over the whole priced history before its epoch, at the Bot's own placement, bands and stakes) joined to
// the live ledger's real bets on the games from the epoch on (the same algorithm, so they are the replay going
// forward). No Angular here (tested under Node: tests/book-replay-history.test.mjs)
import { ModelBet, Tally } from './desk-model';
import { isTracked } from './desk-math';
import { compactRecord } from './bet-format';

const fin = Number.isFinite;

// (a tally in the file: the bets graded, won, lost, pushed, the units staked and won, the return, the share that
// beat the fair close of the bets with a close at their line, their count, and their mean expected return at the fair
// close (clv: none in a file from before DECISIONS.md D56))
export interface ReplayTally {
  bets: number;
  won: number;
  lost: number;
  push: number;
  staked: number;
  profit: number;
  roi: number | null;
  beat: number | null;
  beatN: number;
  clv?: number | null;
}
export interface ReplayBet {
  id: string;
  sport: string;
  season: number;
  pick: string;
  matchup: string;
  market: string;
  player: string | null;
  band: 'lock' | 'high' | 'medium';
  practice: boolean;
  units: number;
  odds: number;
  res: 'W' | 'L' | 'P';
  profit: number;
  timing: 'open' | 'close';
  beat: 1 | 0 | null;
  clv?: number | null;
  at: string;
  start: string;
  settled: string;
}
export interface ReplaySeason extends ReplayTally {
  season: number;
  context: 'full' | 'ratings';
  practice: ReplayTally;
  lines: ReplayTally;
  props: ReplayTally;
}
export interface ReplayRecordFile {
  v: number;
  sport: string;
  epoch: string | null;
  commit?: string | null;
  // (what changed in the version, in a line: DECISIONS.md's latest entry when gate.mjs --record wrote the file)
  note?: string | null;
  at: string;
  from: string | null;
  through: string | null;
  n: { rows: number; keys: number; bets: number; practice: number; pass: number };
  overall: ReplayTally;
  practice: ReplayTally;
  pass: ReplayTally;
  byBand: Record<'lock' | 'high' | 'medium', ReplayTally>;
  byMarket: { lines: ReplayTally; props: ReplayTally };
  bySeason: ReplaySeason[];
  byYear: Record<string, { all: ReplayTally; practice: ReplayTally; byBand: Record<string, ReplayTally>; lines: ReplayTally; props: ReplayTally }>;
  last: ReplayBet[];
  // (the newest year's days in buckets by band (replay-record.mjs dailyOf: "won,lost,push,staked,profit,beat,beatN"),
  // from its first day: the time range's sums; none in a file from before them)
  daily?: { cols: string[]; from: string | null; bands: Record<string, Record<string, string>> };
  flags: { timing: { open: number; close: number; openSeen: number; openClean: number; openInWindow: number }; context: { full: number[]; ratingsOnly: number[] }; price: string; placement: string; split: string; notSeen: string };
}

// The band lab's staged records (band-lab.mjs --write, DECISIONS.md D70): a sport's replay under each band rule tried,
// by its name, in the order tried; the Algorithm tab's Live / Staged switch reads one in place of the live replay
export interface StagedReplayFile {
  v: number;
  sport: string;
  at: string;
  order: string[];
  // (each rule's readable name, band-variants.json's label (D72); a file from before it has none: the id shows)
  labels?: Record<string, string>;
  variants: Record<string, ReplayRecordFile & { staged?: { variant: string } }>;
}

// (By Confidence's pyramid (the owner, 2026-10-20): LOCK's, LOVE's and LIKE's share of the bets the three hold; the
// practice picks, PASS and an empty board none)
export function bandSharesOf(rows: { label: string; bets: number }[]): Record<string, number | null> {
  const bands = ['LOCK', 'LOVE', 'LIKE'];
  const total = rows.filter((r) => bands.includes(r.label)).reduce((t, r) => t + r.bets, 0);
  return Object.fromEntries(rows.map((r) => [r.label, total && bands.includes(r.label) ? r.bets / total : null]));
}

// The panel: a tally row (the desk's Tally with its closing-line share), the strip's bets, the seasons
export interface HistoryRow extends Tally {
  // (the replay's part and the live part, so a row can say what each gave)
  replayed: number;
  live: number;
  // (By Sport's rows: the sport, for its league mark)
  sport?: string;
}
export interface HistoryStripBet {
  res: 'W' | 'L' | 'P';
  pick: string;
  game: string;
  // (the matchup alone, "BUF @ KC", and the stake in units)
  matchup: string;
  stake: number;
  sport: string;
  band: string;
  practice: boolean;
  units: string;
  price: string;
  // (replayed: the Bot's would-have-been bet; live: one it placed)
  replayed: boolean;
  timing: 'open' | 'close' | 'live';
  at: string;
}
export interface SportHistory {
  sport: string;
  label: string;
  epoch: string | null;
  through: string | null;
  overall: HistoryRow;
  practice: HistoryRow;
  seasons: (HistoryRow & { season: number; context: 'full' | 'ratings' })[];
  caveat: string;
}
export interface BotHistory {
  // (every sport on show, summed)
  overall: HistoryRow;
  practice: HistoryRow;
  byBand: HistoryRow[];
  bySport: HistoryRow[];
  byMarket: HistoryRow[];
  // (the live desk's own part since the epochs, the secondary line)
  live: HistoryRow;
  sports: SportHistory[];
  last: HistoryStripBet[];
  caveat: string;
  from: string | null;
  // (how many sports have a replay file: none, the panel says so)
  replayed: number;
  // (the time range on show and what each side gave it: the replayed bets (games before the epochs), the live ones,
  // and a file's bets it couldn't date (one from before the daily buckets))
  range: HistoryRange;
  rangeParts: { replayed: number; live: number; undated: number };
}

// ---- the time range (the owner, 2026-10-19): Today to All time, by the Eastern day each bet settled ----

export type HistoryRange = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'all';
export const HISTORY_RANGES: { value: HistoryRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
];
export const isHistoryRange = (v: unknown): v is HistoryRange => HISTORY_RANGES.some((r) => r.value === v);

const ET = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
// (a moment's Eastern day, "2026-10-19": the replay's buckets' key)
export const etDay = (t: string | number | Date): string => ET.format(new Date(t));
const GAME_HOURS = 3;
// (a live bet's settling: its grading, else its game's end)
const settledOf = (b: ModelBet): string => b.gradedAt ?? new Date(Date.parse(b.start) + GAME_HOURS * 36e5).toISOString();

// The range's Eastern days, first and last (null: All time): a week from its Monday, a month and a year from their first
export function rangeDays(range: HistoryRange, now: number | Date = Date.now()): { from: string; to: string } | null {
  if (range === 'all') return null;
  const today = etDay(now);
  const [y, m, d] = today.split('-').map(Number);
  const day = (offset: number) => new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
  if (range === 'today') return { from: today, to: today };
  if (range === 'yesterday') return { from: day(-1), to: day(-1) };
  if (range === 'week') return { from: day(-((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7)), to: today };
  if (range === 'month') return { from: today.slice(0, 8) + '01', to: today };
  return { from: today.slice(0, 5) + '01-01', to: today };
}
const inDays = (day: string, r: { from: string; to: string } | null): boolean => !r || (day >= r.from && day <= r.to);

// (the bands' replayed days in the range, summed into a tally: null without the file's buckets)
export function dailyTally(f: ReplayRecordFile, bands: string[], r: { from: string; to: string }): ReplayTally | null {
  if (!f.daily?.bands) return null;
  const t: ReplayTally = { bets: 0, won: 0, lost: 0, push: 0, staked: 0, profit: 0, roi: null, beat: null, beatN: 0, clv: null };
  let beatWon = 0;
  let clvSum = 0;
  for (const band of bands) {
    for (const [day, d] of Object.entries(f.daily.bands[band] ?? {})) {
      if (!inDays(day, r)) continue;
      const [won = 0, lost = 0, push = 0, staked = 0, profit = 0, beat = 0, beatN = 0, clv = 0] = d.split(',').map(Number);
      t.won += won;
      t.lost += lost;
      t.push += push;
      t.bets += won + lost + push;
      t.staked += staked;
      t.profit += profit;
      beatWon += beat;
      t.beatN += beatN;
      clvSum += clv;
    }
  }
  t.roi = t.staked ? t.profit / t.staked : null;
  t.beat = t.beatN ? beatWon / t.beatN : null;
  t.clv = t.beatN ? clvSum / t.beatN : null;
  return t;
}

const BAND_LABELS: Record<string, string> = { lock: 'LOCK', high: 'LOVE', medium: 'LIKE', low: 'PASS' };
const MARKET_LABELS: Record<string, string> = { lines: 'Game lines', props: 'Props' };

export const emptyRow = (label: string): HistoryRow => ({ label, bets: 0, won: 0, lost: 0, push: 0, staked: 0, profit: 0, roi: null, open: 0, clvN: 0, clvBeat: null, clvEv: null, replayed: 0, live: 0 });

// Beat the fair close (DECISIONS.md D56), one definition for the replayed and the live bets: a bet placed before the
// close beat it when its own price has a positive expected return at the close's no-vig fair chance, a close at the
// bet's own line only (replay-record.mjs fairBeatOf; a live bet's clv.mjs ev, its pts 0 or none: a moved line has no
// close at its line). The panel shows the share only from BEAT_MIN such bets (fewer: "—"), the count and the mean
// expected return on its hover
export const BEAT_MIN = 30;
export function fairCloseOf(b: Pick<ModelBet, 'clv'>): number | null {
  const c = b.clv;
  if (!c || c.ev === null || c.ev === undefined || !fin(c.ev)) return null;
  if (c.pts !== null && c.pts !== undefined && c.pts !== 0) return null;
  return c.ev;
}
// (a row's share as the panel prints it, and its hover)
export function beatText(t: Pick<HistoryRow, 'clvN' | 'clvBeat'>): string {
  return t.clvN >= BEAT_MIN && t.clvBeat !== null ? `${Math.round(t.clvBeat * 100)}%` : '—';
}
export function beatTip(t: Pick<HistoryRow, 'clvN' | 'clvEv'>): string {
  if (!t.clvN) return 'No bets with a close at their line yet';
  const ev = t.clvEv === null || !fin(t.clvEv) ? '' : `; average return at the fair close ${t.clvEv >= 0 ? '+' : '−'}${Math.abs(t.clvEv * 100).toFixed(1)}%`;
  return `${t.clvN.toLocaleString('en-US')} with a close at their line${t.clvN < BEAT_MIN ? ` (the share from ${BEAT_MIN})` : ''}${ev}`;
}

// (a replay tally onto a row; a live bet onto a row: a graded one, never a void or tracked one. A file from before
// D56 (no clv on its tallies) beat the raw close, another measure: its share isn't joined)
function addReplay(row: HistoryRow, t: ReplayTally | null | undefined): HistoryRow {
  if (!t) return row;
  row.bets += t.bets;
  row.won += t.won;
  row.lost += t.lost;
  row.push += t.push;
  row.staked += t.staked;
  row.profit += t.profit;
  row.replayed += t.bets;
  if (t.beatN && t.beat !== null && t.clv !== undefined && t.clv !== null && fin(t.clv)) {
    row.clvBeat = ((row.clvBeat ?? 0) * row.clvN + t.beat * t.beatN) / (row.clvN + t.beatN);
    row.clvEv = ((row.clvEv ?? 0) * row.clvN + t.clv * t.beatN) / (row.clvN + t.beatN);
    row.clvN += t.beatN;
  }
  return row;
}
function addLive(row: HistoryRow, b: ModelBet): HistoryRow {
  if (b.status === 'open') {
    row.open++;
    return row;
  }
  if (b.void || !['won', 'lost', 'push'].includes(b.status)) return row;
  row.bets++;
  row[b.status as 'won' | 'lost' | 'push']++;
  row.staked += b.units;
  row.profit += b.profit;
  row.live++;
  const ev = fairCloseOf(b);
  if (ev !== null) {
    row.clvBeat = ((row.clvBeat ?? 0) * row.clvN + (ev > 0 ? 1 : 0)) / (row.clvN + 1);
    row.clvEv = ((row.clvEv ?? 0) * row.clvN + ev) / (row.clvN + 1);
    row.clvN++;
  }
  return row;
}
const done = (row: HistoryRow): HistoryRow => ({ ...row, staked: Math.round(row.staked * 100) / 100, profit: Math.round(row.profit * 100) / 100, roi: row.staked ? row.profit / row.staked : null, clvBeat: row.clvN ? row.clvBeat : null, clvEv: row.clvN ? row.clvEv : null });

// (a live bet on the live side of the split: its game starts at or after its sport's epoch; with no replay file for
// the sport every bet of its ledger)
export const liveSince = (b: { start: string }, epoch: string | null | undefined): boolean => !epoch || !(Date.parse(b.start) < Date.parse(epoch));
const practiceOf = (b: ModelBet): boolean => !!b.topN;
const bandOf = (b: ModelBet & { publishedLevel?: string }): string => b.publishedLevel ?? 'medium';
const isLineBet = (b: { market: string }): boolean => b.market !== 'prop';

const unitsText = (v: number): string => (v === 0 ? '0.00u' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}u`);
const priceText = (o: number): string => (o > 0 ? `+${o}` : String(o));

// The caveat in one line (the honesty flags: open against close, the context by season, the price convention)
export function caveatOf(files: ReplayRecordFile[]): string {
  if (!files.length) return 'No replayed record yet: the live desk alone.';
  const open = files.reduce((s, f) => s + (f.flags?.timing?.open ?? 0), 0);
  const close = files.reduce((s, f) => s + (f.flags?.timing?.close ?? 0), 0);
  const span = (list: number[]) => (list.length ? `${list[0]}${list.length > 1 ? `–${list[list.length - 1]}` : ''}` : null);
  const ctx = files
    .map((f) => {
      const full = span(f.flags?.context?.full ?? []);
      const ratings = span(f.flags?.context?.ratingsOnly ?? []);
      if (f.sport === 'mma') return `MMA the fights model ${full ?? ''}`.trim();
      return `${f.sport.toUpperCase()} ${full ? `full context ${full}` : 'no props'}${ratings ? `, lines by the ratings alone ${ratings}` : ''}`;
    })
    .join('; ');
  return `Today's Bot replayed on every priced game before its latest version, plus its real bets since: ${open} bets at a clean open where its edge survived the lineup risk, ${close} at the close; ${ctx}. the Book's price nearest the placement, never shopped; the live desk's gates, CHECKs and research can't be replayed. Practice picks apart.`;
}

// The Bot's history on show: the sports' replay files (a sport without one contributes its live ledger alone), the
// ledgers' bets (every sport's; the ones on the live side of each sport's split are counted), the sport chosen
// ('' every sport), the labels by sport
export function botHistoryOf(
  files: (ReplayRecordFile | null | undefined)[],
  bets: ModelBet[],
  sport: string | null,
  labels: Record<string, string> = {},
  { last = 20, range = 'all', now = Date.now() }: { last?: number; range?: HistoryRange; now?: number | Date } = {},
): BotHistory {
  const days = rangeDays(range, now);
  // (a replay tally in the range: the whole file's for All time, else its days' buckets summed (a file without them
  // gives nothing, its bets counted as undated))
  let undated = 0;
  const inRange = (f: ReplayRecordFile | null, whole: ReplayTally | null | undefined, bands: string[]): ReplayTally | null | undefined => {
    if (!f || !days) return whole;
    const t = dailyTally(f, bands, days);
    if (!t) undated += whole?.bets ?? 0;
    return t;
  };
  const replays = new Map<string, ReplayRecordFile>();
  for (const f of files) if (f && f.v === 1 && f.sport && (!sport || f.sport === sport)) replays.set(f.sport, f);
  const sports = [...new Set([...replays.keys(), ...bets.map((b) => b.sport)])].filter((s) => !sport || s === sport).sort();
  const epochOf = (s: string) => replays.get(s)?.epoch ?? null;
  // (in a range, the live bets settled in it: an open one has no settling yet)
  const live = bets.filter((b) => (!sport || b.sport === sport) && !isTracked(b) && liveSince(b, epochOf(b.sport)) && (!days || (b.status !== 'open' && inDays(etDay(settledOf(b)), days))));
  const liveReal = live.filter((b) => !practiceOf(b));
  const livePractice = live.filter(practiceOf);
  const overall = emptyRow('All');
  const practice = emptyRow('Practice');
  const liveRow = emptyRow('Live since this version');
  const bands = Object.fromEntries(['lock', 'high', 'medium', 'low'].map((k) => [k, emptyRow(BAND_LABELS[k])]));
  const markets = { lines: emptyRow(MARKET_LABELS['lines']), props: emptyRow(MARKET_LABELS['props']) };
  const bySport: HistoryRow[] = [];
  const out: SportHistory[] = [];
  for (const s of sports) {
    const f = replays.get(s) ?? null;
    const row = emptyRow(labels[s] ?? s.toUpperCase());
    const pr = emptyRow('Practice');
    const all = inRange(f, f?.overall, ['lock', 'high', 'medium']);
    const prT = inRange(f, f?.practice, ['practice']);
    addReplay(row, all);
    addReplay(pr, prT);
    addReplay(overall, all);
    addReplay(practice, prT);
    if (f) {
      for (const k of ['lock', 'high', 'medium'] as const) addReplay(bands[k], days ? dailyTally(f, [k], days) : f.byBand?.[k]);
      // (the markets aren't in the day buckets: All time's alone)
      if (!days) {
        addReplay(markets.lines, f.byMarket?.lines);
        addReplay(markets.props, f.byMarket?.props);
      }
    }
    for (const b of liveReal.filter((b) => b.sport === s)) {
      addLive(row, b);
      addLive(overall, b);
      addLive(liveRow, b);
      addLive(bands[bandOf(b)] ?? bands['medium'], b);
      addLive(isLineBet(b) ? markets.lines : markets.props, b);
    }
    for (const b of livePractice.filter((b) => b.sport === s)) {
      addLive(pr, b);
      addLive(practice, b);
    }
    bySport.push({ ...done(row), sport: s });
    // (the sport's seasons: the replay's, the live bets on the newest season's row by its year)
    const seasons = (f?.bySeason ?? []).map((se) => {
      const r = emptyRow(String(se.season));
      addReplay(r, se);
      return { ...r, season: se.season, context: se.context };
    });
    if (f && seasons.length) {
      const newest = seasons[seasons.length - 1];
      for (const b of liveReal.filter((b) => b.sport === s)) addLive(newest, b);
    }
    out.push({ sport: s, label: labels[s] ?? s.toUpperCase(), epoch: f?.epoch ?? null, through: f?.through ?? null, overall: done(row), practice: done(pr), seasons: seasons.map((r) => ({ ...done(r), season: r.season, context: r.context })), caveat: f ? caveatOf([f]) : 'No replayed record for this sport yet: its live ledger alone.' });
  }
  // (the strip: the live bets graded since the epochs and the replays' last bets, newest settled first, practice
  // picks among them with their tag)
  const strip: HistoryStripBet[] = [
    ...live
      .filter((b) => !b.void && ['won', 'lost', 'push'].includes(b.status))
      .map((b) => ({ res: (b.status === 'won' ? 'W' : b.status === 'lost' ? 'L' : 'P') as 'W' | 'L' | 'P', pick: b.pick, game: `${b.sport.toUpperCase()} · ${b.matchup}`, matchup: b.matchup, stake: b.units, sport: b.sport, band: BAND_LABELS[bandOf(b)] ?? 'LIKE', practice: practiceOf(b), units: unitsText(b.profit), price: priceText(b.odds), replayed: false, timing: 'live' as const, at: settledOf(b) })),
    ...[...replays.values()].flatMap((f) => (f.last ?? []).filter((b) => !days || inDays(etDay(b.settled), days)).map((b) => ({ res: b.res, pick: b.pick, game: `${b.sport.toUpperCase()} · ${b.matchup}`, matchup: b.matchup, stake: b.units, sport: b.sport, band: BAND_LABELS[b.band] ?? 'LIKE', practice: b.practice, units: unitsText(b.profit), price: priceText(b.odds), replayed: true, timing: b.timing, at: b.settled }))),
  ]
    .sort((a, b) => b.at.localeCompare(a.at) || a.pick.localeCompare(b.pick))
    .slice(0, last);
  const files2 = [...replays.values()];
  return {
    overall: done(overall),
    practice: done(practice),
    byBand: ['lock', 'high', 'medium', 'low'].map((k) => done(bands[k])).filter((r) => r.label !== 'PASS' || r.bets || r.open),
    bySport,
    byMarket: [done(markets.lines), done(markets.props)],
    live: done(liveRow),
    sports: out,
    last: strip,
    caveat: caveatOf(files2),
    from: files2.length ? files2.map((f) => f.from).filter((x): x is string => !!x).sort()[0] ?? null : null,
    replayed: files2.length,
    range,
    rangeParts: { replayed: overall.replayed + practice.replayed, live: overall.live + practice.live, undated },
  };
}

// ("1.8k–1.8k–10": compact from 1,000, bet-format.ts compactRecord; the exact one its hover, recordTip)
export const recordText = (r: { won: number; lost: number; push?: number }): string => compactRecord(r);

// The build at the top of the Algorithm tab: the version's epoch (MODEL_EPOCH as the replay recorded it; the desk's
// state's, at, without a file), the commit the replay was
// written from and what changed, from the sport on show's replay file (every sport's: the newest written); the
// replay's last game. None of it without a file but the epoch
export function buildOf(files: (ReplayRecordFile | null | undefined)[], sport: string | null, at: string | null): { at: string | null; commit: string | null; note: string | null; through: string | null } {
  const list = files.filter((f): f is ReplayRecordFile => !!f && f.v === 1 && (!sport || f.sport === sport)).sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
  const f = list[0] ?? null;
  return { at: f?.epoch ?? at ?? null, commit: f?.commit ? String(f.commit).slice(0, 8) : null, note: f?.note ?? null, through: list.map((x) => x.through).filter((x): x is string => !!x).sort().pop() ?? null };
}

// (the build's time: "Oct 19, 2026, 12:15 PM CDT", the desk's own time zone)
export function buildLabel(at: string | null | undefined): string {
  if (!at || !fin(Date.parse(at))) return 'Unknown';
  return new Date(at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago', timeZoneName: 'short' });
}
