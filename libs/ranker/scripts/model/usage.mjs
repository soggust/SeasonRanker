// The usage on a prop's row (DECISIONS.md D36, the owner, 2026-10-19: "usage first, rate second"): one inspectable
// number for how much work the player is expected to get tonight, before the rate that turns it into the stat.
// The Bot's disagreement with the Book is 75-90% noise, concentrated where the Book's close knows roles, injuries,
// lineups and leashes (D33), so the usage is read off the projection as a first-class value on every row, in the
// ledger (projection.usage) and in picks.json (usage), where it can be checked against the posted lineups and
// the depth chart and, later, shown on the page.
//
// It is one object made from the parts the projection already has (project.mjs makeModel, matchups.mjs live): the
// NFL's snap share (the snaps-based base: his season's typical leaning to his last game by sr, the next man up's
// floor, the carried prior) and his targets (the volume base: his target share times his team's targets), a
// quarterback's starts; the NBA's minutes (the minutes-first base: his per-minute rate times the minutes expected
// tonight, his season's typical leaning to his last three, pulled toward last season's early on); the NHL's time on
// ice (the ice-time base on shots) and his power-play time; MLB's plate appearances by lineup slot (the posted order,
// PA_BY_SLOT) and a starter's expected outs (the outs model's own projection, on a strikeouts row too: his leash).
// Nothing here is fit or stepped: the projection's fitted parts are the usage's, so the price and the readout can't
// disagree. Where the base isn't the usage one (the per-game base: the fit kept no snaps or minutes term on the
// stat, or the counts don't cover his season), the kind says so (games) and the share he's known for rides along.
//
//   usageOf   { kind, unit, expected, typical, recent, last, share, source, ... the sport's own parts }: expected is
//             the usage the projection reads (a share for the NFL's snaps, minutes for the NBA and NHL, plate
//             appearances or outs for MLB), null where the base isn't the usage one; the rest what's known

import { PA_BY_SLOT, paAt } from './matchups.mjs';
import { fullMin } from './project.mjs';

const fin = Number.isFinite;
const r2 = (v) => (fin(v) ? Math.round(v * 100) / 100 : null);
const r3 = (v) => (fin(v) ? Math.round(v * 1000) / 1000 : null);
export const USAGE_V = 1;
// (the kinds by sport and base: what the expected number counts)
export const UNITS = { snaps: 'snap share', targets: 'targets', starts: 'starts', minutes: 'minutes', toi: 'minutes on ice', pa: 'plate appearances', outs: 'outs', games: 'games' };

// The usage on a row: sport, the stat (props.mjs STATS), the projection's parts (project.mjs makeModel project), the
// row as matchups.mjs live filled it; extra.outs: a starter's expected outs (the outs model's mean, props.mjs), on a
// strikeouts row the usage behind his strikeouts. null where nothing is known
export function usageOf(sport, stat, p, row, extra = {}) {
  if (!p || !stat) return null;
  const mode = p.mode ?? null;
  const share = fin(p.share) ? p.share : null;
  if (sport === 'nfl') {
    if (mode === 'starts') return { kind: 'starts', unit: UNITS.starts, expected: fin(p.starts) ? p.starts : null, careerStarts: fin(p.careerStarts) ? p.careerStarts : null, qb1: !!row?.qbStart, source: 'his starts: the starting quarterback\'s base' };
    const snap = row?.snap ?? null;
    const out = { kind: mode === 'snaps' ? 'snaps' : 'games', unit: mode === 'snaps' ? UNITS.snaps : UNITS.games, expected: mode === 'snaps' ? r3(share) : null, last: fin(snap?.latest) ? r3(snap.latest) : null, typical: fin(snap?.avg) ? r3(snap.avg) : null, counted: fin(snap?.n) ? snap.n : null, source: mode === 'snaps' ? "snap share: his season's typical leaning to his last game, the next man up's floor" : 'the per-game base: no snaps term kept, or his counts don\'t cover the season' };
    if (p.volume) Object.assign(out, { targets: r2(p.volume.targets), targetShare: r3(p.volume.share), teamTargets: r2(p.volume.team) });
    if (p.roleUp) out.roleUp = p.roleUp;
    return out;
  }
  if (sport === 'nba') {
    const full = fullMin(stat);
    return { kind: 'minutes', unit: UNITS.minutes, expected: mode === 'minutes' && share !== null ? r2(share * full) : null, typical: fin(p.minutes?.season) ? r2(p.minutes.season) : null, recent: fin(p.minutes?.recent) ? r2(p.minutes.recent) : null, startLast: row?.startLast ?? null, role: p.role ?? null, source: mode === 'minutes' ? "minutes: his season's typical leaning to his last three, pulled toward last season's early on" : 'the per-game base: fewer than three games of minutes read' };
  }
  if (sport === 'nhl') {
    const full = fullMin(stat);
    if (stat.goalie) return { kind: 'starts', unit: UNITS.starts, expected: 1, source: 'the probable starter' };
    return { kind: 'toi', unit: UNITS.toi, expected: mode === 'minutes' && share !== null ? r2(share * full) : null, typical: fin(p.minutes?.season) ? r2(p.minutes.season) : null, recent: fin(p.minutes?.recent) ? r2(p.minutes.recent) : null, pp: fin(row?.ppTime) ? r2(row.ppTime) : null, ppLean: fin(row?.ppLean) ? r3(row.ppLean) : null, source: mode === 'minutes' ? "time on ice: his season's typical leaning to his last three" : 'the per-game base: his time on ice rides along, the stat\'s rate is per game' };
  }
  if (sport === 'mlb') {
    if (stat.pitcher) {
      const outs = fin(extra?.outs) ? extra.outs : null;
      return { kind: 'outs', unit: UNITS.outs, expected: outs === null ? null : r2(outs), leash: fin(row?.leash) ? r3(row.leash) : null, pitches: Array.isArray(row?.pitches) && row.pitches.length ? row.pitches : null, rest: fin(row?.restDays) ? row.restDays : null, source: stat.key === 'outs' ? "the outs model's own projection: his leash, rest and the lineup he faces" : 'the outs model\'s projection of his start: the batters faced behind his strikeouts' };
    }
    const slot = fin(row?.slot) && row.slot >= 1 && row.slot <= 9 ? row.slot : null;
    const expected = slot === null ? null : paAt(slot);
    const usual = slot !== null && fin(row?.paX) ? expected / Math.exp(row.paX) : null;
    return { kind: 'pa', unit: UNITS.pa, expected: r2(expected), typical: r2(usual), slot, start: row?.start ?? null, source: slot === null ? 'no posted lineup: his usual plate appearances' : `plate appearances at slot ${slot} of the posted order (the league's ${PA_BY_SLOT[slot - 1]} a start)` };
  }
  return null;
}

// The run log's and the write-up's words for a usage: "27.5 minutes (season 29.1, last three 26.8)"
export function usageText(u) {
  if (!u) return null;
  const parts = [];
  if (u.expected !== null && u.expected !== undefined) parts.push(`${u.expected} ${u.unit}`);
  else parts.push(`${u.unit}: unknown`);
  if (fin(u.typical) && u.kind !== 'snaps') parts.push(`season ${u.typical}`);
  if (fin(u.recent)) parts.push(`last three ${u.recent}`);
  if (u.kind === 'snaps' && fin(u.typical)) parts.push(`season ${u.typical}${fin(u.last) ? `, last ${u.last}` : ''}`);
  if (fin(u.targets)) parts.push(`${u.targets} targets`);
  if (fin(u.pp)) parts.push(`PP ${u.pp}`);
  if (fin(u.slot)) parts.push(`slot ${u.slot}`);
  if (fin(u.leash)) parts.push(`leash ${u.leash}`);
  return parts.join(', ');
}
