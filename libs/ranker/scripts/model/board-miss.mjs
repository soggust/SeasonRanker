// The missing-prop signal (DECISIONS.md D45, the forum round's idea 4, 2026-10-19): a regular whose props aren't on the
// board while his teammates' at the position are is an injury or role signal the report hasn't caught up with. Measured
// on the NFL's priced history (the 48-hour opens, 2023 on, against nflverse's snap counts): a regular with props in 3 of
// his team's last 4 games in a market and none at the open while 2 or more teammates had one was out, or under a
// quarter of the offensive snaps, 44.8% of the time against 9.1% listed (1,310 against 8,504 cases); with no report
// status at all 28.6% against 8.4%, Questionable 47.1% against 26.0%, Out and Doubtful 100% either way.
//
//   nflBoardMiss  the rates from the history, by report status group (none: not on the report; q: questionable) and
//                 whether he was missing from the board or listed, each pulled toward its group's pooled rate by
//                 BOARD_K cases: { none: { missing, listed, n }, q: { ... }, from, to, cases }. Read once a run
//                 (run.mjs) and handed to the price as live.boardMiss; the chance a missing regular misses the game
//                 is playchance.mjs boardMissChance's read of it (props.mjs priceProps missOf)
//
// It reads the odds history as training data for the play chance, the way the play table reads nflverse's past
// reports; nothing here is a price, and no bet reads a stored price through it (D30).

import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { existsSync, readFileSync } from 'node:fs';
import { readHistory } from './odds-history.mjs';
import { API_MARKETS } from './props.mjs';
import { nameKey } from './espn.mjs';
import { CACHE, nflverseGames, nflverseRows } from './sources.mjs';

export const BOARD_K = 25;
// (the snap share under which a listed player counts as missing the game's work)
export const BOARD_OUT_PCT = 0.25;
// (teammates listed at the position a regular's missing prop needs to count; props.mjs)
export const PLAY_MISSING_MIN = 2;

// (nflverse's gzipped CSV in the cache, as rows; [] with none)
function gzRows(file, cols) {
  const f = path.join(CACHE, file);
  if (!existsSync(f)) return [];
  const lines = gunzipSync(readFileSync(f)).toString('utf8').split('\n').filter(Boolean);
  const head = lines[0].split(',');
  const at = cols.map((c) => head.indexOf(c));
  const out = [];
  for (const l of lines.slice(1)) {
    const cells = [];
    let cur = '';
    let q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) (cells.push(cur), (cur = ''));
      else cur += ch;
    }
    cells.push(cur);
    out.push(Object.fromEntries(cols.map((c, i) => [c, cells[at[i]]])));
  }
  return out;
}

// The rates by status group from the history's opens (from..current - 1 and the current season's finals)
export async function nflBoardMiss(from = 2023, current = null, { history = null, games = null } = {}) {
  const hist = history ?? readHistory('nfl');
  const sched = games ?? (await nflverseGames());
  const byEspn = new Map();
  for (const g of sched) if (g.espn) byEspn.set(String(g.espn), { season: Number(g.season), week: Number(g.week), home: g.home_team, away: g.away_team });
  const seasons = [...new Set([...byEspn.values()].map((g) => g.season))].filter((s) => s >= from && (current === null || s <= current));
  const snaps = new Map();
  const report = new Map();
  for (const season of seasons) {
    for (const r of gzRows(`snap_counts_${season}.csv.gz`, ['game_type', 'week', 'player', 'team', 'offense_pct'])) if (r.game_type === 'REG' || r.game_type === 'POST') snaps.set(`${season}|${r.week}|${nameKey(r.player)}`, { pct: Number(r.offense_pct), team: r.team });
    for (const r of gzRows(`injuries_${season}.csv.gz`, ['week', 'full_name', 'report_status'])) report.set(`${season}|${r.week}|${nameKey(r.full_name)}`, r.report_status || 'none');
  }
  const stats = API_MARKETS.nfl;
  const opens = new Map();
  for (const p of hist.props) {
    if (p.book !== 'dk' || p.kind !== 'o' || !stats[p.market]) continue;
    const e = hist.events.get(p.oid);
    if (!e?.id) continue;
    const k = `${e.id}|${stats[p.market]}`;
    (opens.get(k) ?? opens.set(k, new Set()).get(k)).add(nameKey(p.player));
  }
  const gameList = [...hist.events.values()].filter((e) => e.id && byEspn.has(String(e.id)) && seasons.includes(byEspn.get(String(e.id)).season)).sort((a, b) => a.t.localeCompare(b.t));
  const byPlayer = new Map();
  const teamGames = new Map();
  for (const e of gameList) {
    const g = byEspn.get(String(e.id));
    for (const t of [g.home, g.away]) (teamGames.get(t) ?? teamGames.set(t, []).get(t)).push({ id: String(e.id), t: e.t });
    for (const stat of Object.values(stats)) {
      const listed = opens.get(`${e.id}|${stat}`);
      if (!listed) continue;
      for (const name of listed) {
        const k = `${name}|${stat}`;
        (byPlayer.get(k) ?? byPlayer.set(k, []).get(k)).push({ id: String(e.id), team: snaps.get(`${g.season}|${g.week}|${name}`)?.team ?? null });
      }
    }
  }
  const tally = { none: { missing: [0, 0], listed: [0, 0] }, q: { missing: [0, 0], listed: [0, 0] } };
  let cases = 0;
  for (const e of gameList) {
    const g = byEspn.get(String(e.id));
    for (const stat of Object.values(stats)) {
      const listed = opens.get(`${e.id}|${stat}`);
      if (!listed || listed.size < 2) continue;
      for (const team of [g.home, g.away]) {
        const last4 = (teamGames.get(team) ?? []).filter((x) => x.t < e.t).slice(-4);
        if (last4.length < 4) continue;
        const ids = new Set(last4.map((x) => x.id));
        const regs = new Set();
        for (const [k, list] of byPlayer) {
          if (!k.endsWith(`|${stat}`)) continue;
          if (list.filter((x) => ids.has(x.id) && x.team === team).length >= 3) regs.add(k.split('|')[0]);
        }
        const mates = [...listed].filter((n) => snaps.get(`${g.season}|${g.week}|${n}`)?.team === team || regs.has(n)).length;
        if (mates < PLAY_MISSING_MIN) continue;
        for (const name of regs) {
          const st = report.get(`${g.season}|${g.week}|${name}`) ?? 'none';
          if (!/^(none|questionable)$/i.test(st)) continue;
          const group = /^questionable$/i.test(st) ? 'q' : 'none';
          const s = snaps.get(`${g.season}|${g.week}|${name}`);
          const out = !s || !(s.pct >= BOARD_OUT_PCT) ? 1 : 0;
          const cell = tally[group][listed.has(name) ? 'listed' : 'missing'];
          cell[0]++;
          cell[1] += out;
          cases++;
        }
      }
    }
  }
  const r4 = (v) => Math.round(v * 1e4) / 1e4;
  const groupOf = (g) => {
    const n = g.missing[0] + g.listed[0];
    const base = n ? (g.missing[1] + g.listed[1]) / n : 0.5;
    const shrunk = (c) => r4((c[1] + BOARD_K * base) / (c[0] + BOARD_K));
    return { missing: shrunk(g.missing), listed: shrunk(g.listed), n: { missing: g.missing[0], listed: g.listed[0] }, base: r4(base) };
  };
  return { none: groupOf(tally.none), q: groupOf(tally.q), from, to: seasons.length ? Math.max(...seasons) : null, cases, k: BOARD_K };
}

export const boardMissText = (b) => (b ? `a regular with no prop while teammates have one misses ${Math.round(b.none.missing * 100)}% (listed ${Math.round(b.none.listed * 100)}%) with no report status, ${Math.round(b.q.missing * 100)}% (listed ${Math.round(b.q.listed * 100)}%) questionable, on ${b.cases} cases ${b.from}-${b.to}` : 'none');
