// The NHL's own box score (api-web.nhle.com's gamecenter, free, no key): the official count a skater's shots
// and points props are graded on. ESPN's summary box can trail the league's at the final: its S column (shots on
// goal; its SOG column is something else, mostly 0) can be a shot short when it's first read (Matthew Knies,
// NYR @ CBJ 2026-10-17: ESPN's 1 twenty minutes after the final, 2 since, the league's 2; his Under 1.5 was
// graded a win). DraftKings grades on the league's count, so the desk does: once the
// league calls the game official (gameState OFF), or it's been FINAL OFFICIAL_WAIT past the start; till then the
// prop waits. When the league's box can't be had or doesn't list him (a source down, a name it can't match),
// ESPN's count, but only once NO_OFFICIAL has passed since the start.
//
// The game is found by its US Eastern day's NHL scoreboard and the two teams (ESPN's abbreviations, four of them
// not the league's); a skater by his side and his sweater number, his last name to confirm it (else his last
// name and first initial, when one skater on the side has them).

import { etDay, get } from './sources.mjs';

export const NHL_WEB = 'https://api-web.nhle.com/v1';
// (a game's FINAL box taken as the league's after this long past the start, if it never says OFF)
export const OFFICIAL_WAIT = 5 * 36e5;
// (no league box by this long past the start: ESPN's count)
export const NO_OFFICIAL = 8 * 36e5;
// (a count graded on the league's box read again for this long after: its box settles in the hours after the
// final; run.mjs officialRegrade, settle.mjs correctSettled)
export const CORRECT_WINDOW = 6 * 36e5;
// (when the grader and the settler began going by the league's box: a bet settled before, on ESPN's, read again)
export const OFFICIAL_SINCE = Date.parse('2026-10-18T06:00:00Z');

const ABBR = { LA: 'LAK', NJ: 'NJD', SJ: 'SJS', TB: 'TBL', UTAH: 'UTA', WAS: 'WSH' };
export const nhlAbbr = (a) => ABBR[String(a ?? '').toUpperCase()] ?? String(a ?? '').toUpperCase();

const lastName = (name) =>
  String(name ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\b(jr|sr|ii|iii|iv)\.?$/i, '')
    .trim()
    .split(/[\s.]+/)
    .filter(Boolean)
    .at(-1)
    ?.toLowerCase()
    .replace(/[^a-z-]/g, '') ?? '';
const initial = (name) => String(name ?? '').trim()[0]?.toLowerCase() ?? '';

// (the league's box as the grader reads it: its state, each side's skaters { number, name, sog, goals, assists };
// null when it lists no one: a box just made official can come back with its players' lists empty for a while)
export function boxOf(box) {
  if (!box?.playerByGameStats) return null;
  const side = (t) => [...(t?.forwards ?? []), ...(t?.defense ?? [])].map((p) => ({ id: p.playerId, number: String(p.sweaterNumber ?? ''), name: p.name?.default ?? '', sog: Number(p.sog) || 0, goals: Number(p.goals) || 0, assists: Number(p.assists) || 0 }));
  const out = { id: box.id, state: box.gameState ?? null, h: side(box.playerByGameStats.homeTeam), a: side(box.playerByGameStats.awayTeam) };
  return out.h.length || out.a.length ? out : null;
}

// (the same from the league's play-by-play, when its box lists no one: each skater's shots on goal (a goal one)
// and goals and assists, its shootout left out; null without its roster or its plays)
export function pbpBoxOf(pbp) {
  if (!pbp?.rosterSpots?.length || !Array.isArray(pbp.plays)) return null;
  const by = new Map();
  for (const r of pbp.rosterSpots) {
    if (r.positionCode === 'G') continue;
    by.set(r.playerId, { team: r.teamId, id: r.playerId, number: String(r.sweaterNumber ?? ''), name: `${r.firstName?.default ?? ''} ${r.lastName?.default ?? ''}`.trim(), sog: 0, goals: 0, assists: 0 });
  }
  for (const e of pbp.plays) {
    if (e.periodDescriptor?.periodType === 'SO') continue;
    const d = e.details ?? {};
    if (e.typeDescKey === 'shot-on-goal' && by.has(d.shootingPlayerId)) by.get(d.shootingPlayerId).sog++;
    if (e.typeDescKey === 'goal') {
      if (by.has(d.scoringPlayerId)) (by.get(d.scoringPlayerId).sog++, by.get(d.scoringPlayerId).goals++);
      for (const k of ['assist1PlayerId', 'assist2PlayerId']) if (by.has(d[k])) by.get(d[k]).assists++;
    }
  }
  const side = (team) => [...by.values()].filter((p) => p.team === team).map(({ team: _, ...p }) => p);
  return { id: pbp.id, state: pbp.gameState ?? null, h: side(pbp.homeTeam?.id), a: side(pbp.awayTeam?.id) };
}

// (an ESPN skater's line in the league's box: by number on his side, his last name agreeing; else his last name
// and first initial, one skater alone having them; null when neither finds him)
export function officialLine(box, side, athlete) {
  const list = box?.[side] ?? [];
  const last = lastName(athlete?.displayName);
  const byNumber = list.find((p) => p.number && p.number === String(athlete?.jersey ?? '') && lastName(p.name) === last);
  if (byNumber) return byNumber;
  const byName = list.filter((p) => lastName(p.name) === last && initial(p.name) === initial(athlete?.displayName));
  return byName.length === 1 ? byName[0] : null;
}

// The league's box for an ESPN summary's game: boxOf's (its play-by-play's when the box lists no one), or null when
// neither can be had
export async function officialBox(body, { fetchJson = get } = {}) {
  const c = body?.header?.competitions?.[0];
  const side = (w) => c?.competitors?.find((t) => t.homeAway === w)?.team?.abbreviation;
  if (!c?.date || !side('home') || !side('away')) return null;
  const score = await fetchJson(`${NHL_WEB}/score/${etDay(c.date)}`);
  const game = (score?.games ?? []).find((g) => g.homeTeam?.abbrev === nhlAbbr(side('home')) && g.awayTeam?.abbrev === nhlAbbr(side('away')));
  if (!game?.id) return null;
  return boxOf(await fetchJson(`${NHL_WEB}/gamecenter/${game.id}/boxscore`)) ?? pbpBoxOf(await fetchJson(`${NHL_WEB}/gamecenter/${game.id}/play-by-play`));
}

// The grader's look-up (props.mjs statInFinal opts.official): for an ESPN summary, the league's box once it's
// official ({ box }), { wait: true } while it isn't yet (or can't be had yet), null past NO_OFFICIAL with none
// (ESPN's count then). Each game's box read once per look-up made (a run makes one)
export function officialLookup({ fetchJson = get, now = Date.now() } = {}) {
  const kept = new Map();
  return async (body) => {
    const id = String(body?.header?.id ?? '');
    if (!kept.has(id)) kept.set(id, officialBox(body, { fetchJson }).catch(() => null));
    const box = await kept.get(id);
    const start = Date.parse(body?.header?.competitions?.[0]?.date ?? '');
    const since = Number.isFinite(start) ? now - start : Infinity;
    if (box && (box.state === 'OFF' || (box.state === 'FINAL' && since >= OFFICIAL_WAIT))) return { box };
    return since < NO_OFFICIAL ? { wait: true } : null;
  };
}
