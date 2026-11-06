// The within-season recency challenger (DECISIONS.md D108, the owner, 2026-11-06: "are we leaning too far into history
// and not enough on current?"). Measuring only: REPLAY_RECENCY=1 (the gate's candidate env:REPLAY_RECENCY=1); off,
// nothing the desk prices, fits or stakes moves.
//
//   today    across seasons the fits weigh a season by gate-score.mjs seasonWeight (halving a season back); inside a
//            season every game counts the same. The history's trust walk (gate-history.mjs walkTrust) weighs nothing
//            at all: a 2020 close counts as much as last week's
//   (b) fits a game-date half-life inside each season on top of the season weight: a row's factor
//            (1 - SHRINK) + SHRINK x 0.5^(age / HL), age its days before its own season's newest row in the fit's
//            data (so last season is read from its end, this one from now), HL from HL_GRID, SHRINK the pull toward
//            today's flat weight (half). The factors times the fit's own weights rescaled to the rows' effective
//            count (Kish: (sum w)^2 / sum w^2), so the fit's prior (the trust's 2 nats a unit) weighs against what the
//            weighted rows are really worth, never more. In the history's trust walk the season weight comes with it
//            (it had none). Read by: gate-history.mjs walkTrust (the history's lines and props trust), gate.mjs (the
//            ledger props' trust walk, the game lines' trust on the backtest's closes), confidence.mjs fitWalk
//   (a) form the projections' inputs: the props' projection already weighs recent games, each term fit walk-forward
//            (project.mjs: his last five against the rate (w), the minutes' and role's lean to the last games (sr),
//            the defense tables' recency (od), the fit window's half-life (hl)); the team ratings' update (ratings.mjs
//            k) is itself an exponential recency. Nothing is added to either (no double count). What reads a season
//            flat is the game context's season-to-date numbers in use: the NHL's expected goals (hockey.mjs xgEdge) and
//            MLB's starter's runs a 9 (context.mjs pitcher); the NFL's neutral-script EPA is out of the fit (kept false,
//            its plays not gathered), the NBA has none. Each gets a form term, soft (in at its own ridge toward 0,
//            ratings.mjs lambdaSoft, learned online as the replay goes: a nothing stays near 0): the season's games
//            faded (each before it times 0.5^(1 / FORM_HL)) and rescaled to their count, through the same prior, less
//            the flat number, so it carries only what the recent games say beyond the season's
//
// The half-lives: HL_GRID (days, Infinity the flat today) picked on the earlier seasons only (the seasons before the
// last two, which the gate's recency veto and the report's recent rows read): the history's trust walked by month at
// each, the month-ahead log loss against the flat's; the best kept only past one standard error of the months, else
// the flat (HL_PICK). FORM_GRID (games): the NHL's and MLB's games.json hold the last two seasons only, so nothing
// earlier to choose on: the longer of each grid (the nearer the flat).
export const RECENCY = process.env.REPLAY_RECENCY === '1';
export const HL_GRID = [Infinity, 60, 30, 15];
export const SHRINK = 0.5;
export const FORM_GRID = { nhl: [8, 16], mlb: [3, 6] };
// (the picks on the seasons before the last two (D108's selection runs): HL_PICK by sport and kind, FORM_HL by sport)
export const HL_PICK = { nfl: { lines: 15, props: Infinity }, nba: { lines: 15, props: 15 }, nhl: { lines: 60, props: 15 }, mlb: { lines: Infinity, props: Infinity }, mma: { lines: Infinity, props: Infinity } };
export const FORM_HL = { nhl: 16, mlb: 6, ...(process.env.REPLAY_RECENCY_FORM ? Object.fromEntries(process.env.REPLAY_RECENCY_FORM.split('/').map((kv) => kv.split(':')).map(([k, v]) => [k, Number(v)])) : {}) };
const DAY = 864e5;
const fin = Number.isFinite;

// (a half-life's factor at an age in days)
export const dayFactor = (ageDays, hl, shrink = SHRINK) => (!fin(hl) || !(hl > 0) ? 1 : 1 - shrink + shrink * Math.pow(0.5, Math.max(0, ageDays) / hl));

// Each row's within-season factor: rows with t (ms) and season; anchor each season at its own newest row. [factor]
export function seasonFactors(rows, hl, { tOf = (x) => x.t, seasonOf = (x) => x.season, shrink = SHRINK } = {}) {
  if (!fin(hl)) return rows.map(() => 1);
  const newest = new Map();
  for (const x of rows) {
    const s = seasonOf(x);
    const t = tOf(x);
    if (fin(t) && !(newest.get(s) >= t)) newest.set(s, t);
  }
  return rows.map((x) => {
    const t = tOf(x);
    return fin(t) ? dayFactor((newest.get(seasonOf(x)) - t) / DAY, hl, shrink) : 1;
  });
}

// (weights rescaled to their effective count: (sum w)^2 / sum w^2 in all)
export function kish(ws) {
  let s = 0;
  let s2 = 0;
  for (const w of ws) (s += w), (s2 += w * w);
  if (!(s > 0)) return ws.map(() => 0);
  const k = s / s2;
  return ws.map((w) => w * k);
}

// The recency weights of a fit's rows: the base weight (baseOf: the season weight, or 1) times the within-season
// factor, rescaled (kish). [w]
export function recencyWeights(rows, hl, { baseOf = () => 1, ...opts } = {}) {
  const f = seasonFactors(rows, hl, opts);
  return kish(rows.map((x, i) => baseOf(x) * f[i]));
}

// (the half-life a sport's kind reads: the pick, the flat when the challenger is off)
export const hlOf = (sport, kind, on = RECENCY) => (on ? (HL_PICK[sport]?.[kind] ?? Infinity) : Infinity);

// A fading running sum for the form terms: add(v, n) each game, the old sums times 0.5^(1 / hl) first. { add, mean }
export function fader(hl) {
  const k = fin(hl) && hl > 0 ? Math.pow(0.5, 1 / hl) : 1;
  return { k, sum: 0, n: 0 };
}
export function fadeAdd(f, v, n = 1) {
  f.sum = f.sum * f.k + v;
  f.n = f.n * f.k + n;
  return f;
}
