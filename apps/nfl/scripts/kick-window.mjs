// Whether some sport has a game starting soon, for the desk's game-window kicks (kick-update.mjs --desk-games, the
// scheduled task "QBRanker desk kick games"): a kick that finds no game within WINDOW_HOURS does nothing, so it
// costs no run and no Odds API credits. Read from ESPN's public scoreboards (free, no key: the same site API the
// desk's espn.mjs reads), today's and tomorrow's UTC dates, every league the desk bets (leagues.mjs: the NFL, NBA,
// NHL, MLB and UFC). A board that can't be read counts as no game in that league (and says so), never as one.
//
//   soonOf(events, now, hours)  the events not started yet (ESPN's status state 'pre', or none given) whose start is
//                               from GRACE_MIN minutes ago to hours ahead: { league, name, start, minutes }
//   gamesSoon(hours, now)       the same over every league's board, fetched; { soon, failed }

export const KICK_LEAGUES = { nfl: 'football/nfl', nba: 'basketball/nba', nhl: 'hockey/nhl', mlb: 'baseball/mlb', ufc: 'mma/ufc' };
export const WINDOW_HOURS = 3;
// (a game that started minutes ago still counts: the run that reads it grades nothing yet, but its lineups and the
// close are worth the read, and the kick that aimed at it may have fired a little late)
export const GRACE_MIN = 5;
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';

export function soonOf(events, now = Date.now(), hours = WINDOW_HOURS, league = null) {
  const out = [];
  for (const e of Array.isArray(events) ? events : []) {
    const start = Date.parse(e?.date);
    if (!Number.isFinite(start)) continue;
    const state = e?.status?.type?.state ?? 'pre';
    if (state !== 'pre') continue;
    const minutes = Math.round((start - now) / 60e3);
    if (minutes < -GRACE_MIN || minutes > hours * 60) continue;
    out.push({ league, name: e.shortName ?? e.name ?? e.id ?? '?', start: new Date(start).toISOString(), minutes });
  }
  return out.sort((a, b) => a.minutes - b.minutes);
}

// (ESPN's date key, UTC: YYYYMMDD)
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');

// (today's and tomorrow's boards, a call each: ESPN's scoreboard takes one date (a range answers 400))
export async function boardOf(path, now = Date.now(), fetchFn = fetch) {
  const days = [dayKey(now), dayKey(now + 864e5)];
  const events = [];
  for (const day of days) {
    const res = await fetchFn(`${ESPN}/${path}/scoreboard?dates=${day}&limit=200`, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`ESPN ${path}: HTTP ${res.status}`);
    for (const e of (await res.json())?.events ?? []) if (!events.some((x) => x.id === e.id)) events.push(e);
  }
  return events;
}

export async function gamesSoon(hours = WINDOW_HOURS, now = Date.now(), fetchFn = fetch) {
  const soon = [];
  const failed = [];
  await Promise.all(
    Object.entries(KICK_LEAGUES).map(async ([league, path]) => {
      try {
        soon.push(...soonOf(await boardOf(path, now, fetchFn), now, hours, league));
      } catch (err) {
        failed.push(`${league}: ${err.message}`);
      }
    }),
  );
  return { soon: soon.sort((a, b) => a.minutes - b.minutes), failed };
}
