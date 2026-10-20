// The news log and the price log (libs/ranker/scripts/model/newslog.mjs, DECISIONS.md D54): logging only.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import {
  lastNews,
  logNews,
  logNewsItems,
  logPrices,
  mmaNewsItems,
  newsFile,
  newsItems,
  postLink,
  priceFile,
  priceRows,
  readPriceLog,
  snapshotOf,
} from "../libs/ranker/scripts/model/newslog.mjs";
import { mmaPriceRows } from "../libs/ranker/scripts/model/mma-desk.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "newslog-"));
const game = {
  id: "401",
  date: "2026-10-25T17:00:00Z",
  home: "25",
  away: "9",
  homeAbbr: "SF",
  awayAbbr: "GB",
};

// A run as the desk holds it at its last step
function runOf(now, report, extra = {}) {
  return {
    sport: "nfl",
    now: new Date(now),
    upcoming: [
      {
        game,
        lines: {
          source: "the odds api",
          spread: { home: { line: -3 } },
          total: { line: 47.5 },
          fair: { spread: 0.51, total: 0.49 },
          fairSource: { spread: "pinnacle", total: "DraftKings" },
        },
      },
    ],
    live: new Map([
      [
        game.id,
        { injuries: new Map([["25", report]]), news: [], newsRead: true },
      ],
    ]),
    inputs: new Map([
      [
        game.id,
        {
          parts: { "qb:h": "Brock Purdy", "qb:a": "Jordan Love", "out:h": "" },
          names: {},
        },
      ],
    ]),
    sleeper: null,
    claims: [],
    fastApplied: [],
    lineRows: [
      { game: "401", key: "spread", line: -3, a: -110, b: -110, src: "o" },
      { game: "401", key: "spread", line: -2.5, a: -115, b: -105, src: "e" },
      {
        game: "401",
        key: "p:receivingYards:111",
        line: 55.5,
        a: -115,
        b: -115,
        src: "o",
      },
    ],
    ...extra,
  };
}

test("the news log keeps an item's first-seen time, writes it again only when it changes (from -> to), and a status cleared off the report", () => {
  const root = tmp();
  const kirk = {
    id: "111",
    name: "Christian Kirk",
    pos: "WR",
    status: "Questionable",
    date: "2026-10-23T20:00:00Z",
  };
  const other = {
    id: "222",
    name: "Someone Else",
    status: "Out",
    date: "2026-10-23T20:00:00Z",
  };
  const a = logNews(runOf("2026-10-23T21:00:00Z", [kirk, other]), { root });
  assert.equal(a.n, 4); // Kirk, the other, both quarterbacks
  const first = a.items.find((x) => x.pid === "111");
  assert.equal(first.t, "2026-10-23T21:00:00.000Z");
  assert.deepEqual(
    [
      first.src,
      first.kind,
      first.ev,
      first.team,
      first.from,
      first.to,
      first.own,
    ],
    [
      "espn",
      "status",
      "401",
      "SF",
      null,
      "Questionable",
      "2026-10-23T20:00:00Z",
    ],
  );
  // (the Book's prices at that moment: the Odds API's spread over ESPN's, Pinnacle's chance, his prop)
  assert.deepEqual(first.px, {
    src: "o",
    spread: [-3, -110, -110],
    pin: { spread: 0.51 },
    props: { receivingYards: [55.5, -115, -115] },
  });
  // (the same seen again: nothing new)
  assert.equal(
    logNews(runOf("2026-10-23T22:00:00Z", [kirk, other]), { root }).n,
    0,
  );
  // (changed: from -> to, at the run that saw it)
  const c = logNews(
    runOf("2026-10-24T15:00:00Z", [{ ...kirk, status: "Out" }, other]),
    { root },
  );
  assert.equal(c.n, 1);
  assert.deepEqual(
    [c.items[0].from, c.items[0].to, c.items[0].t],
    ["Questionable", "Out", "2026-10-24T15:00:00.000Z"],
  );
  // (off the report while the side lists others: cleared; the whole list gone (a partial report): not)
  const d = logNews(runOf("2026-10-24T16:00:00Z", [other]), { root });
  assert.deepEqual(
    d.items.map((x) => [x.pid, x.from, x.to]),
    [["111", "Out", null]],
  );
  assert.equal(logNews(runOf("2026-10-24T17:00:00Z", []), { root }).n, 0);
  // (the file: one JSON object a line, the first sight kept)
  const lines = fs
    .readFileSync(
      newsFile("nfl", Date.parse("2026-10-24T00:00:00Z"), root),
      "utf8",
    )
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  assert.equal(lines.length, 6);
  assert.equal(
    lines.find((x) => x.pid === "111").t,
    "2026-10-23T21:00:00.000Z",
  );
  assert.equal(
    lastNews("nfl", Date.parse("2026-11-02T00:00:00Z"), root).size,
    4,
  ); // (the month before is read too)
});

test("the news log reads Sleeper, the reporters' claims (with their link) and the statuses put in ahead of ESPN", () => {
  const now = Date.parse("2026-10-24T15:00:00Z");
  const sleeper = {
    at: "2026-10-24T14:00:00Z",
    rows: [
      {
        sid: "9",
        espn: "111",
        name: "Christian Kirk",
        key: "christiankirk",
        team: "SF",
        status: "out",
        raw: "Out",
        body: "Calf",
        practice: "DNP",
        news: Date.parse("2026-10-24T13:00:00Z"),
        depth: "WR2",
      },
    ],
  };
  const claims = [
    {
      id: "x",
      post: "at://did:plc:abc/app.bsky.feed.post/3my",
      handle: "insider.bsky.social",
      player: "Christian Kirk",
      team: "SF",
      status: "out",
      kind: "status",
      confidence: 0.9,
      at: "2026-10-24T12:00:00Z",
      seen: "2026-10-24T12:10:00Z",
      text: "Kirk out Sunday",
    },
  ];
  const fastApplied = [
    {
      event: "401",
      team: "25",
      player: "111",
      name: "Christian Kirk",
      status: "out",
      was: "Questionable",
      source: "sleeper",
      at: "2026-10-24T13:00:00.000Z",
      why: "Sleeper: Out (Calf)",
    },
  ];
  const items = newsItems({ ...runOf(now, []), sleeper, claims, fastApplied });
  const by = (k) => items.find((x) => x.kind === k);
  assert.deepEqual(
    [
      by("status").src,
      by("status").to,
      by("status").practice,
      by("status").pid,
    ],
    ["sleeper", "out", "DNP", "111"],
  );
  assert.deepEqual(
    [by("claim").ev, by("claim").conf, by("claim").link],
    ["401", 0.9, "https://bsky.app/profile/did:plc:abc/post/3my"],
  );
  assert.deepEqual(
    [by("applied").src, by("applied").was, by("applied").to],
    ["sleeper", "Questionable", "out"],
  );
  assert.equal(postLink("nope"), null);
});

test("the price log writes a price only when it changed, a header a game and a heartbeat a run; Pinnacle where the run had it", () => {
  const root = tmp();
  const r = runOf("2026-10-23T21:00:00Z", []);
  const games = new Map([["401", { start: game.date, m: "GB @ SF" }]]);
  const rows = priceRows(r.lineRows, r.upcoming);
  assert.deepEqual(
    rows.find((x) => x.key === "pin:spread"),
    { game: "401", key: "pin:spread", line: -3, a: 0.51, b: null, src: "o" },
  );
  assert.equal(
    rows.some((x) => x.key === "pin:total"),
    false,
  );
  const a = logPrices("nfl", rows, { now: r.now, games, root });
  assert.deepEqual([a.n, a.beats], [4, 1]);
  const b = logPrices("nfl", rows, {
    now: Date.parse("2026-10-23T22:00:00Z"),
    games,
    root,
  });
  assert.deepEqual([b.n, b.beats], [0, 1]);
  const moved = rows.map((x) =>
    x.key === "spread" && x.src === "o" ? { ...x, line: -3.5 } : x,
  );
  assert.equal(
    logPrices("nfl", moved, {
      now: Date.parse("2026-10-23T23:00:00Z"),
      games,
      root,
    }).n,
    1,
  );
  const log = readPriceLog("nfl", ["2026-10"], root);
  assert.deepEqual(log[0], [
    "g",
    Math.floor(r.now.getTime() / 1000),
    "401",
    Math.floor(Date.parse(game.date) / 1000),
    "GB @ SF",
  ]);
  assert.equal(log.filter((x) => x[0] === "h").length, 3);
  assert.equal(log.filter((x) => x[0] === "g").length, 1);
  assert.deepEqual(log.at(-2).slice(2), ["spread", -3.5, -110, -110, "o"]);
  // (gzip members appended, read as one file)
  assert.ok(
    gunzipSync(fs.readFileSync(priceFile("nfl", r.now.getTime(), root)))
      .length > 0,
  );
  // (dry: counted, nothing written)
  const root2 = tmp();
  assert.equal(
    logPrices("nfl", rows, { now: r.now, games, root: root2, dry: true }).n,
    4,
  );
  assert.equal(fs.existsSync(priceFile("nfl", r.now.getTime(), root2)), false);
});

test("MMA: its moneyline, round total and Pinnacle's chance into the price log; its bouts' state into the news log", () => {
  const root = tmp();
  const bouts = [
    {
      id: "b1",
      key: "k1",
      date: "2026-11-15T03:00:00Z",
      home: { name: "A" },
      away: { name: "B" },
    },
    {
      id: "b2",
      key: "k2",
      date: "2026-11-15T04:00:00Z",
      off: "cancelled",
      home: { name: "C" },
      away: { name: "D" },
    },
  ];
  const linesNow = new Map([
    [
      "k1",
      {
        lines: {
          odds: { home: -150, away: 130 },
          fair: 0.58,
          fairFrom: "pinnacle",
        },
        src: null,
        total: {
          line: 2.5,
          odds: { over: -120, under: 100 },
          fair: 0.53,
          fairFrom: "its own prices",
        },
      },
    ],
  ]);
  const { rows } = mmaPriceRows(linesNow, bouts);
  assert.deepEqual(
    rows.map((x) => x.key),
    ["ml", "pin:ml", "total"],
  );
  const now = Date.parse("2026-10-20T00:00:00Z");
  const n = logNewsItems("mma", mmaNewsItems(bouts, now), { now, root });
  assert.deepEqual(
    n.items.map((x) => [x.ev, x.to]),
    [
      ["b1", "on"],
      ["b2", "cancelled"],
    ],
  );
});

test("the snapshot prefers the Odds API's price and never a close", () => {
  const s = snapshotOf(
    [
      { game: "1", key: "ml", line: null, a: 100, b: -120, src: "c" },
      { game: "1", key: "total", line: 40, a: -110, b: -110, src: "e" },
    ],
    [],
  );
  assert.deepEqual(
    [s.get("1").ml, s.get("1").total],
    [undefined, [40, -110, -110]],
  );
});
