// The error bars clustered by game (DECISIONS.md D94, the testing audit's sixth recommendation (b), 2026-10-26): the
// picks of one game move together (a game's props on its pace and script, a reason's open and close on one result), so
// a bar's standard error read as if every pick stood alone is too narrow. A tally keeps, beside its own sums, each
// game's weight W and weighted value S (games: Map g -> [W, S]) and each pick's w², w² x and w² x² (q0, q1, q2); its
// design effect at a mean m is the cluster-robust variance over the plain one with the same weights:
//   deff = k/(k-1) Σ_games (S - m W)² / Σ_picks w² (x - m)²
// (k the games), and a bar's standard error the plain one times √deff. A pick with no game is its own cluster (deff
// about 1). desk.mjs barStats keeps the same sums in its own fields (a bar file's), clusterDeff reading them.

const fin = Number.isFinite;

export const emptyCluster = () => ({ games: new Map(), q0: 0, q1: 0, q2: 0, own: 0 });
// (one pick: its game g (none: its own), weight w, value x)
export function clusterAdd(c, g, w, x) {
  if (!fin(w) || !fin(x) || !(w > 0)) return c;
  c.q0 += w * w;
  c.q1 += w * w * x;
  c.q2 += w * w * x * x;
  const key = g ?? `#${c.own++}`;
  const e = c.games.get(key) ?? c.games.set(key, [0, 0]).get(key);
  e[0] += w;
  e[1] += w * x;
  return c;
}
// (a less b, game by game: the rest of a market once a reason's picks are out, the same picks in both)
export function clusterLess(a, b) {
  const out = { games: new Map(), q0: a.q0 - b.q0, q1: a.q1 - b.q1, q2: a.q2 - b.q2, own: 0 };
  for (const [g, [W, S]] of a.games) {
    const y = b.games.get(g);
    const w = W - (y?.[0] ?? 0);
    const s = S - (y?.[1] ?? 0);
    if (w > 1e-12) out.games.set(g, [w, s]);
  }
  return out;
}
// (the design effect at mean m: 1 with fewer than two games or no spread)
export function deffOf(c, m) {
  const k = c?.games?.size ?? 0;
  if (k < 2 || !fin(m)) return 1;
  let cl = 0;
  for (const [W, S] of c.games.values()) cl += (S - m * W) ** 2;
  const ind = c.q2 - 2 * m * c.q1 + m * m * c.q0;
  if (!(ind > 1e-12)) return 1;
  return (cl / ind) * (k / (k - 1));
}
