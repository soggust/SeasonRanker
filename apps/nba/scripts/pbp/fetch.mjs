// The NBA's play-by-play, fetched once a final from ESPN's free summary and kept slim in the cache (never committed):
// .cache/pbp/nba/<espn id>.json.gz, { id, home, away, plays: [[period, clock seconds left, team id, type, text,
// participants, scoring (points or 0), shooting (1/0), home score, away score, x, y]] }. build.mjs reads them.
//
//   node apps/nba/scripts/pbp/fetch.mjs [--seasons 2023,2024,2025,2026]
// Free (ESPN's public site API); a final already kept is not asked again.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { summary } from '../../../../libs/ranker/scripts/model/espn.mjs';
import { pool } from '../../../../libs/ranker/scripts/model/sources.mjs';
import { readHistory } from '../../../../libs/ranker/scripts/model/odds-history.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
export const PBP_DIR = path.join(ROOT, '.cache/pbp/nba');
const clockSec = (c) => {
  const m = String(c ?? '').match(/^(\d+):(\d+(?:\.\d+)?)$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.isFinite(Number(c)) ? Number(c) : null;
};
export function slimPlays(body) {
  return (Array.isArray(body?.plays) ? body.plays : []).map((p) => [
    p.period?.number ?? null,
    clockSec(p.clock?.displayValue),
    p.team?.id ? String(p.team.id) : null,
    String(p.type?.text ?? ''),
    String(p.text ?? ''),
    (p.participants ?? []).map((q) => (q?.athlete?.id ? String(q.athlete.id) : null)).filter(Boolean),
    p.scoringPlay ? Number(p.scoreValue ?? 0) : 0,
    p.shootingPlay ? 1 : 0,
    p.homeScore ?? null,
    p.awayScore ?? null,
    Number.isFinite(Number(p.coordinate?.x)) && Math.abs(Number(p.coordinate.x)) < 1000 ? Number(p.coordinate.x) : null,
    Number.isFinite(Number(p.coordinate?.y)) && Math.abs(Number(p.coordinate.y)) < 1000 ? Number(p.coordinate.y) : null,
  ]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const arg = process.argv.indexOf('--seasons');
  const seasons = (arg > 0 ? process.argv[arg + 1] : '2023,2024,2025,2026').split(',').map(Number);
  mkdirSync(PBP_DIR, { recursive: true });
  const { events } = readHistory('nba', { seasons, props: false });
  const todo = [...events.values()].filter((e) => e.hs !== null && Date.parse(e.t) < Date.now() - 6 * 36e5 && !existsSync(path.join(PBP_DIR, `${e.id}.json.gz`)));
  console.log(`nba pbp: ${todo.length} finals to fetch (${events.size} in seasons ${seasons.join(', ')})`);
  let n = 0, miss = 0;
  const t0 = Date.now();
  await pool(todo, 6, async (e) => {
    let body = null;
    try {
      body = await summary('basketball/nba', e.id);
    } catch {}
    const plays = slimPlays(body);
    if (!plays.length) return void miss++;
    const home = body?.header?.competitions?.[0]?.competitors?.find((c) => c.homeAway === 'home')?.team?.id;
    const away = body?.header?.competitions?.[0]?.competitors?.find((c) => c.homeAway === 'away')?.team?.id;
    const starters = {};
    for (const side of body?.boxscore?.players ?? []) for (const a of side.statistics?.[0]?.athletes ?? []) if (a.starter) (starters[String(side.team?.id)] ??= []).push(String(a.athlete?.id));
    writeFileSync(path.join(PBP_DIR, `${e.id}.json.gz`), gzipSync(JSON.stringify({ id: String(e.id), season: e.season, t: e.t, home: String(home ?? ''), away: String(away ?? ''), starters, plays })));
    if (++n % 250 === 0) console.log(`nba pbp: ${n} of ${todo.length} (${Math.round((Date.now() - t0) / 1000)}s)`);
  });
  console.log(`nba pbp: ${n} kept, ${miss} without plays, ${Math.round((Date.now() - t0) / 1000)}s`);
}
