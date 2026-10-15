// Which published analyses are stale: every sport's publish step (apps/nfl/scripts/analysis/analyze.mjs,
// libs/ranker/scripts/analysis/analyze.mjs) takes them down, their files and their index rows. Decided only
// from the published files' own metadata (when each was written, its mode, its season, the games it looks
// at, its file name), never from what a checkout's cache holds, so a publish from a machine with no
// reports keeps every current preview.
//
// A season-end recap is never stale: it's the season's last word, and stays (into the next season too)
// until a newer report for the same row replaces it (the publish step's merge, not this).
//
// A preview (mode 'preview', or a file from before the mode was written down) is stale when:
//   1. its subject isn't one the pipeline writes (its file name: the NFL's teams and QBs, the other sports'
//      teams), e.g. an old experiment's running backs;
//   2. it's another season's (when it says its season);
//   3. or it isn't from the latest run (written within RUN_WINDOW of the newest file out) and every game it
//      looks at has been played (dated before today, Central time). A QB benched or cut by the starts cap,
//      left out of the latest run, goes once his last previewed game is played.
// A file that can't be read is left alone.

// A run's reports are written within minutes of each other (a batch's results come back together); a day
// covers a resumed batch
export const RUN_WINDOW_MS = 24 * 3600 * 1000;

// Today as YYYY-MM-DD in Central time: a game on today's date isn't played yet
export const todayOf = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

export const isRecap = (kept) => !!kept && kept.mode === 'recap';

// The dates of the games a preview looks at: the NFL's one game, the other sports' week
export const gamesOf = (kept) => [kept?.game?.date, ...(Array.isArray(kept?.week) ? kept.week.map((g) => g?.date) : [])].filter((d) => typeof d === 'string' && d);

const atOf = (kept) => {
  const t = Date.parse(kept?.at ?? '');
  return Number.isNaN(t) ? null : t;
};

// The newest write among the files out (recaps too: a run that writes only recaps is still the latest run)
export function latestRun(records) {
  let latest = null;
  for (const kept of records) {
    const t = atOf(kept);
    if (t !== null && (latest === null || t > latest)) latest = t;
  }
  return latest;
}

// Why a published file is stale, or null to keep it. file: its name without .json; covers(file): whether
// the pipeline writes that subject
export function staleReason(file, kept, { season, today, latest, covers }) {
  if (!kept || typeof kept !== 'object') return null;
  if (isRecap(kept)) return null;
  if (!covers(file)) return 'not a subject the pipeline writes';
  if (kept.season !== undefined && kept.season !== null && season !== undefined && String(kept.season) !== String(season)) return `a preview of the ${kept.season} season`;
  const t = atOf(kept);
  if (t !== null && latest !== null && t >= latest - RUN_WINDOW_MS) return null;
  if (gamesOf(kept).some((d) => d >= today)) return null;
  return 'its games are played and the latest run didn\'t replace it';
}

// The stale ones of a folder's files ({ file -> record }): [{ file, reason, at, mode, game }]
export function staleOf(records, { season, now = new Date(), covers }) {
  const today = todayOf(now);
  const latest = latestRun(records.values());
  const out = [];
  for (const [file, kept] of records) {
    const reason = staleReason(file, kept, { season, today, latest, covers });
    if (reason) out.push({ file, reason, at: kept.at ?? null, mode: kept.mode ?? 'preview', games: gamesOf(kept) });
  }
  return out;
}

export const describe = (s) => `${s.file} (${s.mode}, written ${s.at ?? '?'}${s.games.length ? `, games ${s.games[0]}${s.games.length > 1 ? `..${s.games.at(-1)}` : ''}` : ''}): ${s.reason}`;
