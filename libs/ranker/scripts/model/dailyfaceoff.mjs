// DailyFaceoff (dailyfaceoff.com, public pages, no key): the NHL's starting goalies for a day and each team's line
// combinations with its players off ice (injured reserve, out, day-to-day). Read from each page's own data (the
// Next.js page's __NEXT_DATA__ JSON), so a change to the page's look doesn't change what's read; a page that
// can't be had, or whose data moved, gives null and the desk goes on with ESPN's alone.
//
//   starting goalies  each game's two goalies, by team name, with DailyFaceoff's word on each: Confirmed (a beat
//                     writer or the team said so), Likely, or unconfirmed (its projection: often the usual
//                     starter, or the backup on a back-to-back), and when it was said. context.mjs goalieOf weighs
//                     it against ESPN's probable
//   off ice           a team's players off ice on its line combinations page (DailyFaceoff's injured group:
//                     injured reserve, out, day-to-day), for a team ESPN's injury report leaves out (2026-10-18:
//                     Columbus, absent from it entirely): context.mjs fallbackInjuries

import { get } from './sources.mjs';

export const DFO = 'https://www.dailyfaceoff.com';

// (a page's Next.js data: its pageProps, or null)
export function nextData(html) {
  const m = String(html ?? '').match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1])?.props?.pageProps ?? null;
  } catch {
    return null;
  }
}

// (DailyFaceoff's word on a goalie: 'confirmed', 'likely' or 'unconfirmed')
export const dfoStrength = (s) => (/confirm/i.test(s ?? '') && !/unconfirm/i.test(s ?? '') ? 'confirmed' : /likely|probable/i.test(s ?? '') ? 'likely' : 'unconfirmed');

// A day's starting goalies page as [{ start, home: { team, name, strength, said, at }, away: {...} }], or null
export function startingGoaliesOf(props) {
  const list = props?.data;
  if (!Array.isArray(list)) return null;
  return list.map((g) => {
    const side = (s) => ({ team: g[`${s}TeamName`] ?? '', name: g[`${s}GoalieName`] ?? null, strength: dfoStrength(g[`${s}NewsStrengthName`]), said: g[`${s}NewsDetails`] ?? null, at: g[`${s}NewsCreatedAt`] ?? null });
    return { start: g.dateGmt ?? null, home: side('home'), away: side('away') };
  });
}
export async function startingGoalies(day) {
  const html = await get(`${DFO}/starting-goalies/${day}`, { text: true });
  return html ? startingGoaliesOf(nextData(html)) : null;
}

// (DailyFaceoff's off-ice status as the injury report's words)
const OFF_ICE = { ir: 'Injured Reserve', ltir: 'Injured Reserve', out: 'Out', dtd: 'Day-To-Day', 'day-to-day': 'Day-To-Day', gtd: 'Day-To-Day' };

// A team's line combinations page: { team, source, updated, lines: [{ name, number, pos, group }], off: [{ name,
// number, pos, status }] }, or null. off: its off-ice group (status by DailyFaceoff's injury status, an unknown one
// read as Out: it's in the injured group) and anyone in the lines marked a game-time decision (Day-To-Day)
export function lineCombinationsOf(props) {
  const c = props?.combinations;
  if (!c || !Array.isArray(c.players)) return null;
  const lines = [];
  const off = [];
  for (const p of c.players) {
    const one = { name: p.name ?? '', number: p.jerseyNumber ?? null, pos: String(p.positionIdentifier ?? '').replace(/\d+$/, '').toUpperCase() };
    if (p.categoryIdentifier === 'oi') off.push({ ...one, pos: '', status: OFF_ICE[String(p.injuryStatus ?? '').toLowerCase()] ?? 'Out' });
    else if (p.categoryIdentifier === 'ev') {
      lines.push({ ...one, group: p.groupIdentifier ?? null });
      if (p.gameTimeDecision === true || /dtd|day-to-day|gtd/i.test(p.injuryStatus ?? '')) off.push({ ...one, status: 'Day-To-Day' });
    }
  }
  return { team: c.teamName ?? '', source: c.sourceName ?? null, updated: c.updatedAt ?? null, lines, off };
}
// (a team's page by its full name: "Columbus Blue Jackets" -> columbus-blue-jackets)
export const teamSlug = (name) =>
  String(name ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
export async function lineCombinations(teamName) {
  const html = await get(`${DFO}/teams/${teamSlug(teamName)}/line-combinations`, { text: true });
  return html ? lineCombinationsOf(nextData(html)) : null;
}
