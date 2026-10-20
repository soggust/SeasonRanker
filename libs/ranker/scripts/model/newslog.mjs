// The news log and the price log (DECISIONS.md D54): what the desk knew and when, kept so a later replay can set
// "when did we know" against "when did the line move". Logging only: nothing here is read by the bettor, nothing
// it gets is changed (the run's step comes after the bets are placed and saved: run.mjs logTheNews), and no source
// is asked for anything: every row is what the run already had in hand.
//
//   news     apps/<sport>/scripts/model/news-log/<YYYY-MM>.jsonl (the month of the run, UTC), a JSON object a line,
//            append-only. Every news item the run read for a coming game, written once: the first run that saw it
//            (t), then again only when what it says changes (from -> to), so a status seen run after run keeps its
//            first time. The items:
//              status  the injury report's entries (src 'espn'; an entry put in by the owner's note, the research
//                      or the game-day roster: its own src), Sleeper's statuses inside the game's window ('sleeper',
//                      its raw word, body part and practice day), and an entry cleared off ESPN's report (to null;
//                      not when the team's whole list is gone: a partial report)
//              applied a Sleeper or Bluesky status the run put into the report ahead of ESPN's (fastnews.mjs fastNotes)
//              claim   each reporter's post the classifier read into a claim (news-fast.json: any status, any
//                      confidence; its game where its team plays inside the window, else none), with its link
//              qb, goalie, sp, lineup, five, inactives  the starters and lineups the run priced with
//                      (timing.mjs inputsOf: the NFL's quarterback, the NHL's goalie, MLB's starting pitcher and
//                      batting order, the NBA's starting five where it isn't the usual one, the posted inactives)
//              flag    the teams' news stories flagged on a unit (news.mjs: l.news), with the headline
//            Each: { t, src, sport, ev, start, team, tid, pid, name, kind, from, to, own (the source's own time),
//            text, link, px }. px: the Book's prices the run had for the game's markets at that moment (this run's
//            lines and the player's props: src 'o' The Odds API, 'e' ESPN's board; else the last board's game
//            lines, with their time), with Pinnacle's no-vig chance where the run had it (pin)
//   prices   apps/<sport>/scripts/model/price-log/<YYYY-MM>.jsonl.gz, a gzip member a run appended (gunzipSync reads
//            the members as one), a JSON array a line:
//              ['g', t, game, start, matchup]          a game's header: the month's first sight, or its start moved
//              [t, game, key, line, a, b, src]         a market's price, written only when it changed since the last
//                                                      row of its key (the line log's shape, linelog.mjs: key spread,
//                                                      total, ml, p:<stat>:<athlete>; src e, o, c (the close))
//              [t, game, 'pin:<market>', line, p, null, 'o']   Pinnacle's no-vig chance (the home or over side's) at
//                                                      the Book's line, where the run had it
//              ['h', t, game, n]                       the heartbeat: the run saw n of the game's prices (the ones not
//                                                      written are as last written)
//            t in Unix seconds. MMA's bouts by mma-desk.mjs: its moneyline and round total, the same rows.
//   index    neither log keeps a state file: what's new is judged against the rows already in the month's file
//            and the month before's (read at each run)
//   dry      --dry counts and says, writes nothing
//   fails    a log that can't be read or written is warned of and skipped, never the run

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { nameKey } from "./espn.mjs";
import { candidatesFor, espnAbbr } from "./fastnews.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../../..");
export const newsDir = (sport, root = ROOT) =>
  path.join(root, "apps", sport, "scripts/model/news-log");
export const priceDir = (sport, root = ROOT) =>
  path.join(root, "apps", sport, "scripts/model/price-log");
const month = (t) => new Date(t).toISOString().slice(0, 7);
const prevMonth = (t) => {
  const d = new Date(t);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 7);
};
export const newsFile = (sport, t, root = ROOT) =>
  path.join(newsDir(sport, root), `${month(t)}.jsonl`);
export const priceFile = (sport, t, root = ROOT) =>
  path.join(priceDir(sport, root), `${month(t)}.jsonl.gz`);
const fin = Number.isFinite;
const num = (v) => (fin(v) ? v : null);
const iso = (t) => (fin(t) ? new Date(t).toISOString() : null);
const short = (s, n = 160) =>
  s ? String(s).replace(/\s+/g, " ").trim().slice(0, n) : null;
// (a Bluesky post's at:// uri as its web link)
export const postLink = (uri) => {
  const m = String(uri ?? "").match(
    /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/,
  );
  return m ? `https://bsky.app/profile/${m[1]}/post/${m[2]}` : null;
};

// (the identity an item is deduped on: the same subject seen again is the same item; its value is what it says)
const LINEUP_KINDS = new Set([
  "qb",
  "goalie",
  "sp",
  "lineup",
  "five",
  "inactives",
]);
export const subjectOf = (x) =>
  [
    x.ev ?? "",
    x.kind,
    LINEUP_KINDS.has(x.kind) ? "" : x.src,
    x.tid ?? x.team ?? "",
    x.pid ?? nameKey(x.name ?? ""),
    x.post ?? "",
  ].join("|");
const valueOf = (x) =>
  JSON.stringify([x.to ?? null, x.raw ?? null, x.practice ?? null]);

// (a file's lines, read: [] with none; one unreadable warned of)
function readNewsLines(file) {
  if (!existsSync(file)) return [];
  try {
    return readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch (err) {
    console.warn(
      `the news log's ${path.basename(file)} not read (${err.message})`,
    );
    return [];
  }
}
function readPriceRows(file) {
  if (!existsSync(file)) return [];
  try {
    return gunzipSync(readFileSync(file))
      .toString("utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch (err) {
    console.warn(
      `the price log's ${path.basename(file)} not read (${err.message})`,
    );
    return [];
  }
}

// The run's price snapshot for each game: game id -> { src, spread, total, ml, pin, props: Map key -> [line, a, b] }
// from the run's rows (the line log's: linelog.mjs gameRows / propRows; The Odds API's over ESPN's, a close never)
// and Pinnacle's no-vig chance off the run's lines (u.lines.fair where its source was Pinnacle)
export function snapshotOf(lineRows = [], upcoming = []) {
  const out = new Map();
  const rank = { o: 2, e: 1 };
  for (const r of lineRows ?? []) {
    if (!rank[r.src]) continue;
    const g = out.get(String(r.game)) ?? {
      src: null,
      rank: {},
      props: new Map(),
    };
    out.set(String(r.game), g);
    if ((g.rank[r.key] ?? 0) > rank[r.src]) continue;
    g.rank[r.key] = rank[r.src];
    if (r.key.startsWith("p:")) g.props.set(r.key, [r.line, r.a, r.b]);
    else {
      g[r.key] = r.key === "ml" ? [r.a, r.b] : [r.line, r.a, r.b];
      if (!g.src || rank[r.src] > rank[g.src]) g.src = r.src;
    }
  }
  for (const u of upcoming ?? []) {
    const fair = u?.lines?.fair;
    const from = u?.lines?.fairSource ?? {};
    const pin = Object.fromEntries(
      Object.entries(fair ?? {})
        .filter(([k, v]) => from[k] === "pinnacle" && fin(v))
        .map(([k, v]) => [k, Math.round(v * 1e4) / 1e4]),
    );
    if (!Object.keys(pin).length) continue;
    const g = out.get(String(u.game.id)) ?? {
      src: null,
      rank: {},
      props: new Map(),
    };
    g.pin = pin;
    out.set(String(u.game.id), g);
  }
  return out;
}

// (the last board's game lines for a game, as a snapshot: board.json's k, its time)
function boardSnap(board, id) {
  const g = (board?.games ?? []).find((x) => String(x.id) === String(id));
  if (!g?.k) return null;
  const side = (m, s) => g.k[m]?.find((x) => x.s === s);
  const px = { t: g.at ?? board.at ?? null, src: "board" };
  if (side("spread", "home"))
    px.spread = [
      num(side("spread", "home").l),
      num(side("spread", "home").o),
      num(side("spread", "away")?.o),
    ];
  if (side("total", "over"))
    px.total = [
      num(side("total", "over").l),
      num(side("total", "over").o),
      num(side("total", "under")?.o),
    ];
  if (side("ml", "home"))
    px.ml = [num(side("ml", "home").o), num(side("ml", "away")?.o)];
  return px.spread || px.total || px.ml ? px : null;
}

// (an item's prices: the game's lines and, for a player, his props; none on hand: null)
export function pxFor(snap, board, ev, pid) {
  const g = snap?.get(String(ev));
  if (g && (g.spread || g.total || g.ml || g.pin || g.props.size)) {
    const px = { src: g.src };
    for (const k of ["spread", "total", "ml", "pin"]) if (g[k]) px[k] = g[k];
    if (pid) {
      const props = {};
      for (const [k, v] of g.props) {
        const [, stat, who] = k.split(":");
        if (who === String(pid)) props[stat] = v;
      }
      if (Object.keys(props).length) px.props = props;
    }
    return px;
  }
  return boardSnap(board, ev);
}

// The run's news items, every one it read for a coming game (see above), before any dedupe: [{ ...item }]. r: the
// run's { sport, now, upcoming, live, inputs, sleeper, claims, fastApplied }
export function newsItems({
  sport,
  now,
  upcoming = [],
  live = null,
  inputs = null,
  sleeper = null,
  claims = [],
  fastApplied = [],
}) {
  const t = now instanceof Date ? now.getTime() : now;
  const items = [];
  // (each side's report as read: how many ESPN lists on it, for the cleared entries)
  items.sides = new Map();
  const base = (game, side) => ({
    ev: String(game.id),
    start: game.date,
    team: side === "home" ? game.homeAbbr : game.awayAbbr,
    tid: String(side === "home" ? game.home : game.away),
  });
  const games = new Map();
  for (const { game } of upcoming ?? []) {
    if (!(Date.parse(game.date) > t)) continue;
    games.set(String(game.id), game);
    const l = live?.get?.(game.id) ?? live?.get?.(String(game.id)) ?? null;
    for (const side of ["home", "away"]) {
      const b = base(game, side);
      // (the report: ESPN's own and the entries put in, each by its source)
      const list =
        !l || l.injuriesFailed || !(l.injuries instanceof Map)
          ? null
          : (l.injuries.get(b.tid) ?? []);
      for (const p of list ?? []) {
        if (p.from === "sleeper" || p.from === "bluesky") continue;
        items.push({
          ...b,
          src:
            p.from ?? (p.inactive && p.was === undefined ? "gameday" : "espn"),
          kind: "status",
          pid: p.id ? String(p.id) : null,
          name: p.name ?? null,
          to: p.status ?? null,
          own: p.date ?? null,
          text: p.tag ? `ESPN tag: ${p.tag}` : null,
        });
      }
      if (list)
        items.sides.set(`${b.ev}|${b.tid}`, list.filter((p) => !p.from).length);
      // (Sleeper's statuses inside the window, before now)
      if (sleeper) {
        for (const c of candidatesFor(sport, game, side, {
          sleeper,
          claims: [],
          now: t,
        })) {
          const row = sleeper.rows?.find(
            (x) => x.key === c.key && x.team === espnAbbr(sport, b.team),
          );
          items.push({
            ...b,
            src: "sleeper",
            kind: "status",
            pid: c.espn ?? null,
            sid: row?.sid ?? null,
            name: c.name,
            to: c.status,
            raw: row?.raw ?? null,
            body: row?.body ?? null,
            practice: row?.practice ?? null,
            depth: row?.depth ?? null,
            own: iso(c.at),
            text: short(c.why),
          });
        }
      }
      // (the team's news flags)
      for (const f of l?.news ?? []) {
        if (String(f.team) !== b.tid) continue;
        items.push({
          ...b,
          src: f.from ?? "espn",
          kind: "flag",
          pid: null,
          name: null,
          post: String(f.id ?? ""),
          to: `${f.unit}:${f.kind ?? ""}`,
          own: f.at ?? null,
          text: short(f.headline ?? f.why),
        });
      }
    }
    // (the starters and lineups the run priced with)
    const inp =
      inputs?.get?.(game.id) ?? inputs?.get?.(String(game.id)) ?? null;
    const KIND = {
      qb: "qb",
      g: "goalie",
      sp: "sp",
      lu: "lineup",
      st: "five",
      ina: "inactives",
    };
    for (const [key, v] of Object.entries(inp?.parts ?? {})) {
      const [k, s] = key.split(":");
      if (!KIND[k] || v === null || v === undefined) continue;
      const side = s === "h" ? "home" : "away";
      const b = base(game, side);
      const src =
        k === "qb"
          ? "nflverse"
          : k === "g"
            ? (l?.[side]?.from ?? "espn")
            : k === "sp" || k === "lu"
              ? "statsapi"
              : "espn";
      const id =
        k === "g" ? String(v).split(" ")[0] : k === "sp" ? String(v) : null;
      const pid = id && id !== "-" ? id : null;
      items.push({
        ...b,
        src,
        kind: KIND[k],
        pid: null,
        who: pid,
        name: null,
        to: v,
        text: pid
          ? (inp.names?.[pid] ?? null)
          : v && k !== "lu" && k !== "qb"
            ? short(
                String(v)
                  .split(",")
                  .map((x) => inp.names?.[x] ?? x)
                  .join(", "),
              )
            : null,
      });
    }
  }
  // (the statuses put into the report ahead of ESPN's)
  for (const a of fastApplied ?? []) {
    const game = games.get(String(a.event));
    if (!game) continue;
    const side = String(game.home) === String(a.team) ? "home" : "away";
    items.push({
      ...base(game, side),
      src: a.source,
      kind: "applied",
      pid: String(a.player),
      name: a.name,
      to: a.status,
      was: a.was ?? null,
      own: a.at,
      text: short(a.why),
    });
  }
  // (the reporters' claims: each post's, its game where its team plays one inside the window)
  for (const c of claims ?? []) {
    if (!c?.player) continue;
    const at = Date.parse(c.at ?? "");
    let game = null;
    let side = null;
    if (c.team && fin(at)) {
      const abbr = espnAbbr(sport, c.team);
      for (const g of games.values()) {
        const s =
          espnAbbr(sport, g.homeAbbr) === abbr
            ? "home"
            : espnAbbr(sport, g.awayAbbr) === abbr
              ? "away"
              : null;
        if (
          s &&
          at <= Date.parse(g.date) &&
          (!game || Date.parse(g.date) < Date.parse(game.date))
        )
          [game, side] = [g, s];
      }
    }
    const b = game
      ? base(game, side)
      : {
          ev: null,
          start: null,
          team: c.team ? espnAbbr(sport, c.team) : null,
          tid: null,
        };
    items.push({
      ...b,
      src: "bluesky",
      kind: "claim",
      pid: null,
      name: c.player,
      post: c.post ?? c.id ?? "",
      to: c.status ?? null,
      claim: c.kind ?? null,
      conf: num(c.confidence),
      handle: c.handle ?? null,
      own: c.at ?? null,
      seenAt: c.seen ?? null,
      text: short(c.text, 200),
      link: postLink(c.post),
    });
  }
  return items;
}

// The items new against the log (last: subject -> { value, item }, changed in place): each written with its from
// (what the subject said last) and the run's time. And ESPN's entries gone off a side's report since (cleared:
// to null), where the side still lists someone
export function newItems(
  items,
  last,
  t,
  { px = () => null, sport = null } = {},
) {
  const out = [];
  const at = iso(t);
  const listedNow = new Set(
    items.filter((x) => x.kind === "status" && x.src === "espn").map(subjectOf),
  );
  const sides = items.sides ?? new Map();
  for (const x of items) {
    const key = subjectOf(x);
    const v = valueOf(x);
    const was = last.get(key);
    if (was && was.value === v) continue;
    const row = {
      t: at,
      sport,
      ...x,
      from: was ? (was.item.to ?? null) : null,
      px: px(x.ev, x.pid ?? x.who ?? null),
    };
    out.push(row);
    last.set(key, { value: v, item: row });
  }
  // (cleared off ESPN's report: a side read, still listing others)
  for (const [key, was] of last) {
    const w = was.item;
    if (
      w.kind !== "status" ||
      w.src !== "espn" ||
      w.to === null ||
      listedNow.has(key)
    )
      continue;
    if (!(sides.get(`${w.ev}|${w.tid}`) > 0)) continue;
    const row = {
      t: at,
      sport,
      ev: w.ev,
      start: w.start,
      team: w.team,
      tid: w.tid,
      src: "espn",
      kind: "status",
      pid: w.pid,
      name: w.name,
      from: w.to,
      to: null,
      own: null,
      text: "off ESPN's report",
      px: px(w.ev, w.pid),
    };
    out.push(row);
    last.set(key, { value: valueOf(row), item: row });
  }
  return out;
}

// (the log's last word on each subject: the month's file and the one before's)
export function lastNews(sport, t, root = ROOT) {
  const last = new Map();
  for (const m of [prevMonth(t), month(t)])
    for (const x of readNewsLines(
      path.join(newsDir(sport, root), `${m}.jsonl`),
    ))
      last.set(subjectOf(x), { value: valueOf(x), item: x });
  return last;
}

// A run's news logged: the new items appended to the month's file. Returns { n, items } (n null where it failed:
// warned, never thrown); dry: counted, nothing written
export function logNews(r, { dry = false, root = ROOT, board = null } = {}) {
  try {
    const snap = snapshotOf(r.lineRows ?? [], r.upcoming ?? []);
    return logNewsItems(r.sport, newsItems(r), {
      now: r.now,
      dry,
      root,
      px: (ev, pid) => (ev ? pxFor(snap, board, ev, pid) : null),
    });
  } catch (err) {
    console.warn(`${r.sport}: the news log not written (${err.message})`);
    return { n: null, seen: 0, items: [] };
  }
}

// Items logged (any sport's, already built): the new ones appended to the month's file; px(ev, pid): their prices
export function logNewsItems(
  sport,
  items,
  { now = Date.now(), dry = false, root = ROOT, px = () => null } = {},
) {
  try {
    const t = now instanceof Date ? now.getTime() : now;
    const fresh = newItems(items, lastNews(sport, t, root), t, { sport, px });
    if (!dry && fresh.length) {
      mkdirSync(newsDir(sport, root), { recursive: true });
      appendFileSync(
        newsFile(sport, t, root),
        fresh.map((x) => JSON.stringify(x)).join("\n") + "\n",
      );
    }
    return { n: fresh.length, seen: items.length, items: fresh };
  } catch (err) {
    console.warn(`${sport}: the news log not written (${err.message})`);
    return { n: null, seen: 0, items: [] };
  }
}

// MMA's news items: each coming bout's state off ESPN's card (off: cancelled, postponed, a fighter replaced; on:
// as scheduled), so a scratch's first sight is kept against the price curve
export function mmaNewsItems(bouts, now) {
  const t = now instanceof Date ? now.getTime() : now;
  return (bouts ?? [])
    .filter((b) => Date.parse(b.start ?? b.date) > t)
    .map((b) => ({
      ev: String(b.id),
      start: b.start ?? b.date,
      team: null,
      tid: null,
      src: "espn",
      kind: "bout",
      pid: null,
      name: null,
      to: b.off ?? "on",
      text: short(
        `${b.away?.name ?? "?"} vs ${b.home?.name ?? "?"}${b.cardName ? ` (${b.cardName})` : ""}`,
      ),
    }));
}

// The run's price rows (the line log's rows, the run's: linelog.mjs gameRows / propRows) with Pinnacle's no-vig
// chance off the run's lines: [{ game, key, line, a, b, src }]
export function priceRows(lineRows = [], upcoming = []) {
  const out = [...(lineRows ?? [])].map((x) => ({
    game: String(x.game),
    key: x.key,
    line: num(x.line),
    a: num(x.a),
    b: num(x.b),
    src: x.src,
  }));
  for (const u of upcoming ?? []) {
    const l = u?.lines;
    if (!l?.fair || l.source !== "the odds api") continue;
    const lineOf = {
      spread: num(l.spread?.home?.line),
      total: num(l.total?.line),
      ml: null,
    };
    for (const [k, v] of Object.entries(l.fair))
      if (l.fairSource?.[k] === "pinnacle" && fin(v))
        out.push({
          game: String(u.game.id),
          key: `pin:${k}`,
          line: lineOf[k] ?? null,
          a: Math.round(v * 1e4) / 1e4,
          b: null,
          src: "o",
        });
  }
  return out;
}

// (the price log's last row of each key and each game's header, the month's file and the one before's)
export function lastPrices(sport, t, root = ROOT) {
  const last = new Map();
  const heads = new Map();
  for (const m of [prevMonth(t), month(t)]) {
    for (const x of readPriceRows(
      path.join(priceDir(sport, root), `${m}.jsonl.gz`),
    )) {
      if (x[0] === "g") heads.set(String(x[2]), { start: x[3], month: m });
      else if (x[0] !== "h")
        last.set(`${x[1]}|${x[2]}|${x[6]}`, [x[3], x[4], x[5]]);
    }
  }
  return { last, heads };
}

// The rows new against the log (changed in place): the headers, the changed prices, a heartbeat for each game seen.
// games: game id -> { start (ISO or ms), m (matchup) }
export function newPriceRows(rows, { last, heads }, t, games = new Map()) {
  const sec = Math.floor(t / 1000);
  const m = month(t);
  const out = [];
  const seen = new Map();
  const head = (game) => {
    const g = games.get(game);
    const start = g
      ? Math.floor(
          (typeof g.start === "number" ? g.start : Date.parse(g.start)) / 1000,
        )
      : null;
    const h = heads.get(game);
    if (h && h.month === m && h.start === start) return;
    out.push(["g", sec, game, fin(start) ? start : null, g?.m ?? null]);
    heads.set(game, { start, month: m });
  };
  // (a key seen twice in a run: the later one)
  const byKey = new Map();
  for (const r of rows) byKey.set(`${r.game}|${r.key}|${r.src}`, r);
  for (const [id, r] of byKey) {
    seen.set(r.game, (seen.get(r.game) ?? 0) + 1);
    const was = last.get(id);
    if (was && was[0] === r.line && was[1] === r.a && was[2] === r.b) continue;
    head(r.game);
    out.push([sec, r.game, r.key, r.line, r.a, r.b, r.src]);
    last.set(id, [r.line, r.a, r.b]);
  }
  for (const [game, n] of seen) {
    head(game);
    out.push(["h", sec, game, n]);
  }
  return out;
}

// A run's prices logged: one gzip member appended to the month's file. Returns { n (rows written, heartbeats
// counted apart), beats, bytes } (n null where it failed); dry: counted, nothing written
export function logPrices(
  sport,
  rows,
  { now = Date.now(), games = new Map(), dry = false, root = ROOT } = {},
) {
  try {
    const t = now instanceof Date ? now.getTime() : now;
    const fresh = newPriceRows(rows, lastPrices(sport, t, root), t, games);
    const body = fresh.length
      ? gzipSync(fresh.map((x) => JSON.stringify(x)).join("\n") + "\n")
      : null;
    if (!dry && body) {
      mkdirSync(priceDir(sport, root), { recursive: true });
      appendFileSync(priceFile(sport, t, root), body);
    }
    const beats = fresh.filter((x) => x[0] === "h").length;
    return {
      n: fresh.filter((x) => x[0] !== "h" && x[0] !== "g").length,
      beats,
      bytes: body?.length ?? 0,
      seen: rows.length,
    };
  } catch (err) {
    console.warn(`${sport}: the price log not written (${err.message})`);
    return { n: null, beats: 0, bytes: 0, seen: 0 };
  }
}

// (a sport's logged price rows, every month in order: a fit's reader)
export function readPriceLog(sport, months, root = ROOT) {
  return months.flatMap((m) =>
    readPriceRows(path.join(priceDir(sport, root), `${m}.jsonl.gz`)),
  );
}
