// The Teams tab's shooting, rebounding and ball security, Basketball-Reference's way, from a team's box
// score totals and its opponents' (the season pages' totals-team and totals-opponent tables, every season
// since 2000-01; a single game's box works the same). update-data.mjs keeps each part's totals on its
// teams (teamBox), adds the regular season's and the playoffs' together for both (addBoxes: every rate is
// worked out again from the summed counts, never averaged) and puts teamShooting's stats on the coach rows,
// which the app's team rows carry (apps/nba/src/sport/sport.ts teamRows).
//
// - eFG %: (FG + 0.5 x 3PM) / FGA, a made 3 counting half again
// - TS %: points / (2 x (FGA + 0.44 x FTA)), points per shooting possession
// - 3P %, 3PA Rate (3PA / FGA) and FT Rate (FTA / FGA, Basketball-Reference's FTr)
// - Opp eFG % and Opp 3P %: the same, the opponents' shots (the defense)
// - ORB %: its offensive rebounds over its own plus the opponents' defensive ones (the misses there were);
//   DRB % the other way round; REB % every rebound over both teams'
// - RPG: rebounds a game
// - TOV % and Opp TOV %: turnovers per 100 plays, TOV / (FGA + 0.44 x FTA + TOV)
// All in percentage points (47.3), RPG to one decimal.

// The counts kept, the team's (fg...) and its opponents' (opp_fg...)
export const BOX_KEYS = ['g', 'fg', 'fga', 'fg3', 'fg3a', 'ft', 'fta', 'orb', 'drb', 'trb', 'tov', 'pts'];
const OPP_KEYS = BOX_KEYS.filter((k) => k !== 'g').map((k) => `opp_${k}`);

const count = (v) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// A team's counts from its totals row and its opponents' (Basketball-Reference's data-stat names); null
// when either row is missing or a count is
export function teamBox(totals, opponents) {
  if (!totals || !opponents) return null;
  const box = {};
  for (const k of BOX_KEYS) box[k] = count(totals[k]);
  for (const k of OPP_KEYS) box[k] = count(opponents[k]);
  return Object.values(box).every((v) => v !== null) ? box : null;
}

// Two parts' counts added up (null if either is unknown)
export function addBoxes(a, b) {
  if (!a || !b) return null;
  return Object.fromEntries(Object.keys(a).map((k) => [k, a[k] + b[k]]));
}

const pts = (v, d = 1) => (Number.isFinite(v) ? Math.round(v * 100 * 10 ** d) / 10 ** d : null);
const over = (a, b) => (b > 0 ? a / b : NaN);

// The stats from a team's counts (all null without them)
export function teamShooting(box) {
  const keys = ['efgPct', 'tsPct', 'fg3Pct', 'fg3aRate', 'ftRate', 'oppEfgPct', 'oppFg3Pct', 'orbPct', 'drbPct', 'trbPct', 'rebPerGame', 'tovPct', 'oppTovPct'];
  if (!box) return Object.fromEntries(keys.map((k) => [k, null]));
  const b = box;
  const rpg = over(b.trb, b.g);
  return {
    efgPct: pts(over(b.fg + 0.5 * b.fg3, b.fga)),
    tsPct: pts(over(b.pts, 2 * (b.fga + 0.44 * b.fta))),
    fg3Pct: pts(over(b.fg3, b.fg3a)),
    fg3aRate: pts(over(b.fg3a, b.fga)),
    ftRate: pts(over(b.fta, b.fga)),
    oppEfgPct: pts(over(b.opp_fg + 0.5 * b.opp_fg3, b.opp_fga)),
    oppFg3Pct: pts(over(b.opp_fg3, b.opp_fg3a)),
    orbPct: pts(over(b.orb, b.orb + b.opp_drb)),
    drbPct: pts(over(b.drb, b.drb + b.opp_orb)),
    trbPct: pts(over(b.trb, b.trb + b.opp_trb)),
    rebPerGame: Number.isFinite(rpg) ? Math.round(rpg * 10) / 10 : null,
    tovPct: pts(over(b.tov, b.fga + 0.44 * b.fta + b.tov)),
    oppTovPct: pts(over(b.opp_tov, b.opp_fga + 0.44 * b.opp_fta + b.opp_tov)),
  };
}
