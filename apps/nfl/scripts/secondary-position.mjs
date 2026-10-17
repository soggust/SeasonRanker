// A defensive back listed only as "DB" (the player list's position for many of the 2000s' secondaries, Pro
// Football Focus having no position for them): a corner or a safety? update-data.mjs's defensePlayers asks
// secondaryTab, which takes the first of these that knows:
//   1. the season's own label: nflverse's roster for that season (its depth chart position, then its position)
//      or the snap counts' position (2012 on): FS, SS, S or SAF a safety, CB or NB a corner;
//   2. Pro Football Reference's position in its defensive charting (its season totals, 2018 on; LCB and RCB
//      corners too);
//   3. his career: his label in the other seasons' rosters and the player list (listed a safety in any season,
//      a safety; otherwise a corner anywhere, a corner);
//   4. his tackles per pass defended: a safety makes far more of them than a corner does. The cut is fitted
//      on 2000-2025's corners and safeties whose roster label is known (tackles per passes defended + 1,
//      7.5 or more a safety: 74% right on those with 10 or more of the two, where a coin is 56%).
export const SAFETY_LABELS = new Set(['S', 'FS', 'SS', 'SAF']);
export const CORNER_LABELS = new Set(['CB', 'NB', 'LCB', 'RCB']);
export const SAFETY_TACKLES_PER_PD = 7.5;

// 'S', 'CB' or null (a "DB", a blank, anything else)
export function secondaryLabel(position) {
  const pos = String(position ?? '').trim().toUpperCase();
  return SAFETY_LABELS.has(pos) ? 'S' : CORNER_LABELS.has(pos) ? 'CB' : null;
}

// The first label of a list that says which
const firstLabel = (positions) => (positions ?? []).map(secondaryLabel).find(Boolean) ?? null;

// season: the season's labels, in order (roster depth chart, roster position, snap counts); pfr: PFR's
// position; career: every other label he's had; tackles and passesDefended: his line in the part
export function secondaryTab({ season = [], pfr = null, career = [], tackles = 0, passesDefended = 0 }) {
  const own = firstLabel(season) ?? secondaryLabel(pfr);
  if (own) return own;
  const labels = (career ?? []).map(secondaryLabel);
  if (labels.includes('S')) return 'S';
  if (labels.includes('CB')) return 'CB';
  return tackles / ((passesDefended ?? 0) + 1) >= SAFETY_TACKLES_PER_PD ? 'S' : 'CB';
}
