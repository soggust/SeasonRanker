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
// beat the close of the bets with one)
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
  flags: { timing: { open: number; close: number; openSeen: number; openClean: number; openInWindow: number }; context: { full: number[]; ratingsOnly: number[] }; price: string; placement: string; split: string; notSeen: string };
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
}

const BAND_LABELS: Record<string, string> = { lock: 'LOCK', high: 'LOVE', medium: 'LIKE', low: 'PASS' };
const MARKET_LABELS: Record<string, string> = { lines: 'Game lines', props: 'Props' };

export const emptyRow = (label: string): HistoryRow => ({ label, bets: 0, won: 0, lost: 0, push: 0, staked: 0, profit: 0, roi: null, open: 0, clvN: 0, clvBeat: null, clvEv: null, replayed: 0, live: 0 });

// (a replay tally onto a row; a live bet onto a row: a graded one, never a void or tracked one)
function addReplay(row: HistoryRow, t: ReplayTally | null | undefined): HistoryRow {
  if (!t) return row;
  row.bets += t.bets;
  row.won += t.won;
  row.lost += t.lost;
  row.push += t.push;
  row.staked += t.staked;
  row.profit += t.profit;
  row.replayed += t.bets;
  if (t.beatN && t.beat !== null) {
    row.clvBeat = ((row.clvBeat ?? 0) * row.clvN + t.beat * t.beatN) / (row.clvN + t.beatN);
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
  if (b.clv && b.clv.beat !== null && b.clv.beat !== undefined) {
    row.clvBeat = ((row.clvBeat ?? 0) * row.clvN + (b.clv.beat ? 1 : 0)) / (row.clvN + 1);
    row.clvN++;
  }
  return row;
}
const done = (row: HistoryRow): HistoryRow => ({ ...row, staked: Math.round(row.staked * 100) / 100, profit: Math.round(row.profit * 100) / 100, roi: row.staked ? row.profit / row.staked : null, clvBeat: row.clvN ? row.clvBeat : null });

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
export function botHistoryOf(files: (ReplayRecordFile | null | undefined)[], bets: ModelBet[], sport: string | null, labels: Record<string, string> = {}, { last = 20 } = {}): BotHistory {
  const replays = new Map<string, ReplayRecordFile>();
  for (const f of files) if (f && f.v === 1 && f.sport && (!sport || f.sport === sport)) replays.set(f.sport, f);
  const sports = [...new Set([...replays.keys(), ...bets.map((b) => b.sport)])].filter((s) => !sport || s === sport).sort();
  const epochOf = (s: string) => replays.get(s)?.epoch ?? null;
  const live = bets.filter((b) => (!sport || b.sport === sport) && !isTracked(b) && liveSince(b, epochOf(b.sport)));
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
    addReplay(row, f?.overall);
    addReplay(pr, f?.practice);
    addReplay(overall, f?.overall);
    addReplay(practice, f?.practice);
    if (f) {
      for (const k of ['lock', 'high', 'medium'] as const) addReplay(bands[k], f.byBand?.[k]);
      addReplay(markets.lines, f.byMarket?.lines);
      addReplay(markets.props, f.byMarket?.props);
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
      .map((b) => ({ res: (b.status === 'won' ? 'W' : b.status === 'lost' ? 'L' : 'P') as 'W' | 'L' | 'P', pick: b.pick, game: `${b.sport.toUpperCase()} · ${b.matchup}`, matchup: b.matchup, stake: b.units, sport: b.sport, band: BAND_LABELS[bandOf(b)] ?? 'LIKE', practice: practiceOf(b), units: unitsText(b.profit), price: priceText(b.odds), replayed: false, timing: 'live' as const, at: b.gradedAt ?? b.start })),
    ...[...replays.values()].flatMap((f) => (f.last ?? []).map((b) => ({ res: b.res, pick: b.pick, game: `${b.sport.toUpperCase()} · ${b.matchup}`, matchup: b.matchup, stake: b.units, sport: b.sport, band: BAND_LABELS[b.band] ?? 'LIKE', practice: b.practice, units: unitsText(b.profit), price: priceText(b.odds), replayed: true, timing: b.timing, at: b.settled }))),
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
