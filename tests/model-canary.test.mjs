// The leakage canaries and the null tests (DECISIONS.md D93; libs/ranker/scripts/model/canary.mjs), and the live
// against the replay check (live-check.mjs, the Algorithm tab's live-check.ts). Pinned:
//   - time travel: the replayed record run again with every result not settled by a cut drawn at random and every
//     snapshot after it jittered places every bet before the cut the same (its price, chance, stake and band). The
//     replay's walks (the history bars, the beat bar, the own losers, the reason tiers, the shopped-price guard, the
//     lineup risk) read only what was settled before each bet's moment
//   - the canary catches a leak: a replay that reads one number from the whole history (the future included) moves
//     bets placed before the cut
//   - the null draws keep each key's rows on one result, the shuffle keeps each season and market's base rate
//   - the source scramblers touch only what's after the cut
//   - the live check: its two copies (the history audit's .mjs, the tab's .ts) agree; it reads beat-the-fair-close as
//     the replay does (a positive expected return at the close's no-vig), never clv.beat
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import * as desk from "../libs/ranker/scripts/model/desk.mjs";
import * as picks from "../libs/ranker/scripts/model/picks.mjs";
import * as leagues from "../libs/ranker/scripts/model/leagues.mjs";
import * as lineupRisk from "../libs/ranker/scripts/model/lineup-risk.mjs";
import * as reasons from "../libs/ranker/scripts/model/reasons.mjs";
import * as clvBands from "../libs/ranker/scripts/model/clv-bands.mjs";
import * as tuned from "../libs/ranker/scripts/model/tuned.mjs";
import * as replay from "../libs/ranker/scripts/model/replay-record.mjs";
import {
  keyOf,
  nullRows,
  plantLeak,
  rngOf,
  scrambleAfter,
  scrambleArchive,
  scrambleGames,
  scramblePlayerRows,
  timeTravel,
} from "../libs/ranker/scripts/model/canary.mjs";
import {
  expectOf,
  liveCheck,
  pTwo,
} from "../libs/ranker/scripts/model/live-check.mjs";
import { loadEngine } from "./support/engine.mjs";

const H = 36e5;
const DAY = 864e5;
const T0 = Date.parse("2024-10-20T23:00:00Z");
const V = {
  desk,
  picks,
  leagues,
  lineupRisk,
  reasons,
  clvBands,
  tuned,
  replay,
};
const names = () => ({ home: "HOME", away: "AWAY", matchup: "AWAY @ HOME" });
const american = (p) =>
  p >= 0.5 ? Math.round((-100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p);

// (two seasons of daily games: a spread and two props a game, each at an open (10 hours out) and the close; the Bot's
// chance a noisy read of the truth, the Book's no-vig nearer it, the prices with the vig)
function history(seed = 3, days = 420) {
  const r = rngOf(seed);
  const open = [];
  const close = [];
  for (let i = 0; i < days; i++) {
    const t = T0 + i * DAY;
    const season = t < Date.parse("2025-08-01T00:00:00Z") ? 2025 : 2026;
    const markets = [
      ["spread", "spread", `h:g${i}:spread`],
      ["prop", "pts", `p:g${i}:a:pts`],
      ["prop", "reb", `p:g${i}:b:reb`],
    ];
    for (const [market, stat, key] of markets) {
      const truth = 0.35 + 0.3 * r();
      const y = r() < truth ? 1 : 0;
      for (const [kind, at] of [
        ["o", t - 10 * H],
        ["c", t - 60e3],
      ]) {
        const f = Math.min(
          0.9,
          Math.max(0.1, truth + (r() - 0.5) * (kind === "o" ? 0.08 : 0.04)),
        );
        const p = Math.min(0.95, Math.max(0.05, truth + (r() - 0.5) * 0.12));
        const row = {
          id: `${key}:${kind}`,
          key,
          event: `g${i}`,
          sport: "nba",
          market,
          stat,
          kind,
          line: market === "spread" ? -3.5 : 10.5,
          t,
          at,
          factsAt: null,
          season,
          f,
          p,
          raw: p,
          y,
          overOdds: american(Math.min(0.95, f + 0.024)),
          underOdds: american(Math.min(0.95, 1 - f + 0.024)),
        };
        (kind === "o" ? open : close).push(row);
      }
    }
  }
  return { open, close, intra: [] };
}
const opts = { names, epoch: "2026-10-19T00:00:00Z", now: T0 + 500 * DAY };
const run = (rows, v = V) => replay.replayRecord(v, "nba", rows, opts);
// (the lineup risk left whole, so an open is bet wherever it clears: the opens' fair-close checks feed the beat bar)
const W = { ...V, lineupRisk: { ...lineupRisk, survivalAt: () => 1 } };
const runW = (rows, v = W) => replay.replayRecord(v, "nba", rows, opts);

test("time travel: scrambling every result and price after a cut leaves every bet placed before it as it was", () => {
  const rows = history();
  for (const r of [run, runW]) {
    const base = r(rows);
    assert.ok(
      base.n.bets > 200,
      `enough bets to mean something (${base.n.bets})`,
    );
    if (r === runW) assert.ok(base.flags.timing.open > 50, "opens bet");
    const out = timeTravel(r, rows, base, { cuts: [0.25, 0.5, 0.75] });
    assert.equal(out.length, 3);
    for (const c of out) {
      assert.ok(
        c.compared > 30,
        `${c.cut}: bets before the cut compared (${c.compared})`,
      );
      assert.ok(c.scrambledResults > 0 && c.scrambledSnaps > 0);
      assert.equal(c.diffs, 0, `${c.cut}: ${JSON.stringify(c.examples)}`);
    }
  }
});

test("the canary catches a leak: a replay that reads one number off the whole history moves bets before the cut", () => {
  const rows = history(5);
  // (the planted bug: every chance shifted by the whole history's over rate, the future's results among it)
  const leaky = (rs, v = V) => {
    const all = [...rs.close];
    const rate = all.reduce((s, x) => s + (x.y ?? 0), 0) / all.length;
    const shift = (x) => ({
      ...x,
      p: Math.min(0.95, Math.max(0.05, x.p + (rate - 0.5) * 2)),
    });
    return replay.replayRecord(
      v,
      "nba",
      { open: rs.open.map(shift), close: rs.close.map(shift), intra: [] },
      opts,
    );
  };
  const base = leaky(rows);
  const out = timeTravel(leaky, rows, base, { cuts: [0.5] });
  assert.ok(out[0].diffs > 0, "the harness sees the leak");
});

test("the planted leak: the result in each open is worth a fortune, which is the size of what the stamps guard", () => {
  const rows = history(7);
  const base = run(rows, W);
  const leak = run(plantLeak(rows), W);
  assert.ok(
    leak.overall.profit > base.overall.profit + 50,
    `${leak.overall.profit} against ${base.overall.profit}`,
  );
});

test("the null draws: a key's rows share one result; the shuffle keeps each season and market's results", () => {
  const rows = history(9, 120);
  const fair = nullRows(rows, "fair", rngOf(1));
  const byKey = new Map();
  for (const x of [...fair.open, ...fair.close])
    (byKey.get(keyOf(x)) ?? byKey.set(keyOf(x), new Set()).get(keyOf(x))).add(
      x.y,
    );
  for (const [k, ys] of byKey) assert.equal(ys.size, 1, k);
  const sh = nullRows(rows, "shuffle", rngOf(2));
  const rate = (list, m) =>
    list.filter((x) => x.market === m).reduce((s, x) => s + x.y, 0);
  for (const m of ["spread", "prop"])
    assert.equal(rate(sh.close, m), rate(rows.close, m), m);
  assert.notDeepEqual(
    sh.close.map((x) => x.y),
    rows.close.map((x) => x.y),
  );
  // (the originals untouched)
  assert.ok(rows.close.every((x) => x.y === 0 || x.y === 1));
});

test("scrambleAfter: results not settled by the cut and snapshots after it, nothing before", () => {
  const rows = history(11, 60);
  const cut = T0 + 30 * DAY;
  const m = scrambleAfter(rows, cut, rngOf(4));
  const was = new Map([...rows.open, ...rows.close].map((x) => [x.id, x]));
  for (const x of [...m.rows.open, ...m.rows.close]) {
    const w = was.get(x.id);
    if (x.t + 3 * H < cut) assert.equal(x.y, w.y, x.id);
    if (x.at <= cut)
      assert.deepEqual(
        [x.p, x.f, x.overOdds, x.underOdds],
        [w.p, w.f, w.overOdds, w.underOdds],
        x.id,
      );
  }
});

test("the source scramblers: only the finals, player games and snapshots after the cut", () => {
  const cut = Date.parse("2025-01-15T00:00:00Z");
  const games = Array.from({ length: 40 }, (_, i) => ({
    id: `g${i}`,
    season: 2025,
    final: true,
    date: new Date(cut + (i - 20) * DAY).toISOString(),
    hs: 100 + i,
    as: 90,
  }));
  const before = games.map((g) => ({ ...g }));
  assert.equal(scrambleGames(games, cut, rngOf(1)), 20);
  games.forEach((g, i) =>
    Date.parse(g.date) < cut
      ? assert.deepEqual(g, before[i])
      : assert.ok(g.hs >= 120),
  );
  const rows = Array.from({ length: 40 }, (_, i) => ({
    pid: `p${i}`,
    date: new Date(cut + (i - 20) * DAY).toISOString(),
    s: { pts: i },
  }));
  assert.equal(scramblePlayerRows(rows, cut, rngOf(2)), 20);
  rows.forEach((x, i) =>
    i < 20 ? assert.equal(x.s.pts, i) : assert.ok(x.s.pts >= 20),
  );
  const hist = {
    lines: [
      { ts: new Date(cut - DAY).toISOString(), a: -110, b: -110 },
      { ts: new Date(cut + DAY).toISOString(), a: -110, b: -110 },
    ],
    props: [],
  };
  assert.equal(scrambleArchive(hist, cut, rngOf(3)), 1);
  assert.deepEqual([hist.lines[0].a, hist.lines[0].b], [-110, -110]);
});

// (a replay's bets and a ledger: the live check's inputs)
const replayBets = [
  ...Array.from({ length: 60 }, (_, i) => ({
    market: "prop",
    stat: "pts",
    side: "under",
    odds: -110,
    res: i % 2 ? "W" : "L",
    p: 0.55,
    beat: null,
    clv: null,
  })),
  ...Array.from({ length: 40 }, (_, i) => ({
    market: "ml",
    stat: "ml",
    side: "home",
    odds: 120,
    res: i % 3 ? "L" : "W",
    p: 0.47,
    beat: i % 2,
    clv: i % 2 ? 0.02 : -0.03,
  })),
  { market: "ml", side: "home", odds: 120, res: "W", p: 0.5, practice: true },
];
const ledger = [
  ...Array.from({ length: 40 }, (_, i) => ({
    sport: "nba",
    market: "prop",
    propType: "pts",
    side: "under",
    odds: -110,
    units: 1,
    intent: "edge",
    status: i % 3 ? "lost" : "won",
    profit: i % 3 ? -1 : 0.91,
    p: 0.55,
    fair: 0.5,
    placedAt: "2026-10-24T00:00:00Z",
    clv: { v: 2, ev: i % 4 ? -0.05 : 0.01, prob: 0.01, beat: true },
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    sport: "nba",
    market: "ml",
    side: "home",
    odds: 120,
    units: 1,
    intent: "edge",
    // (a gate's practice stake on a real bet: its why, still a bet)
    practice: "a gate held it to the practice stake",
    status: i % 2 ? "lost" : "won",
    profit: i % 2 ? -1 : 1.2,
    p: 0.48,
    fair: 0.45,
    placedAt: "2026-10-24T00:00:00Z",
    clv: { v: 2, ev: 0.01, prob: -0.01, beat: false },
  })),
  // (the slate's practice pick: not a bet of the record)
  { sport: "nba", market: "ml", side: "home", odds: 120, units: 0.5, intent: "edge", topN: true, status: "won", placedAt: "2026-10-24T00:00:00Z" },
  {
    sport: "nba",
    market: "ml",
    side: "home",
    odds: 120,
    units: 0,
    intent: "track",
    status: "won",
    placedAt: "2026-10-24T00:00:00Z",
  },
  {
    sport: "nba",
    market: "ml",
    side: "home",
    odds: 120,
    units: 0.5,
    intent: "action",
    status: "won",
    placedAt: "2026-10-24T00:00:00Z",
  },
  {
    sport: "nba",
    market: "ml",
    side: "home",
    odds: 120,
    units: 1,
    intent: "edge",
    status: "won",
    placedAt: "2026-10-20T00:00:00Z",
  },
];

test("the live check: staked edge bets since the epoch, beat the fair close by the expected return, the calibration", () => {
  const ex = expectOf(replayBets);
  assert.equal(ex.keys.all.n, 100, "the practice pick left out");
  assert.equal(ex.keys["prop:pts:under"].n, 60);
  const c = liveCheck(ledger, ex, { since: "2026-10-23T05:30:00Z" });
  assert.equal(
    c.n,
    50,
    "the tracked row, the practice pick and the bet before the epoch left out",
  );
  // (beat: the props' clv.beat is true on all 40, but their expected return at the close is positive on 10 only)
  assert.equal(c.beat.n, 50);
  assert.equal(c.beat.share, (10 + 10) / 50);
  assert.equal(
    c.beat.keyed,
    10,
    "only the moneylines' key has a replayed fair-close check",
  );
  assert.equal(c.beat.exp, 0.5);
  assert.equal(c.cal.n, 50);
  assert.equal(c.cal.wins, 14 + 5);
  assert.ok(Math.abs(c.cal.p - (40 * 0.55 + 10 * 0.48)) < 0.01);
  assert.ok(c.cal.zP < -2, "won far fewer than the Bot said");
  assert.ok(Number.isFinite(c.z) && Number.isFinite(c.exp));
  assert.equal(liveCheck(ledger, ex, { since: "2027-01-01T00:00:00Z" }).n, 0);
  assert.ok(Math.abs(pTwo(1.96) - 0.05) < 0.001);
  assert.equal(pTwo(0), 1);
});

test("the live check's two copies agree (the history audit's and the Algorithm tab's)", async () => {
  const book = await loadEngine("nfl", {
    entry: path.join(import.meta.dirname, "support", "book-entry.ts"),
    data: {},
  });
  const ex = expectOf(replayBets);
  for (const since of [null, "2026-10-23T05:30:00Z"])
    assert.deepEqual(
      book.liveCheck(ledger, ex, { since }),
      liveCheck(ledger, ex, { since }),
    );
  const row = book.liveCheckRow(
    "nba",
    liveCheck(ledger, ex, { since: "2026-10-23T05:30:00Z" }),
  );
  assert.equal(row.n, 50);
  assert.ok(["ok", "warn", "bad"].includes(row.flag));
  assert.equal(
    book.liveCheckRow("nba", { v: 1, since: null, n: 3 }).flag,
    "thin",
  );
});
