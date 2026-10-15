// The props' fits kept between runs (run.mjs fitTheProps). Each prop type's fit (project.mjs fitStat: the terms
// and sizes searched, the gates, the soft terms' weights, the recalibration) is the slow part of a run, about 50
// minutes of every sport's on GitHub, and what it picks moves little from one hour to the next. So it's searched
// once a sport a day, or sooner when the history has grown by a slate, and the runs between rebuild the
// projections from the saved choice (props.mjs fitProps' reuse: the model made from the saved params and taught
// every final in the history as it is now, the matchup tables built again: seconds, not the search). The same
// day, on the same history, a rebuilt fit's projections are the fresh fit's exactly (tests/model-fit-cache;
// run.mjs --fit-check on the real history).
//
// Kept in .cache/model/fits/<sport>.json (MODEL_FITS: elsewhere), in the desk's own Actions cache (model-desk.yml:
// restored at the start of every run from the last one's, saved after it even when it failed), not committed:
// 15-70 KB a sport (the gates' numbers ride along for the logs and the state), new every day, so in git a steady
// churn for what a refit can always make again, and a dry run can write it. Lost or unreadable, the next run
// refits (a fresh cache, or one GitHub evicted). The committed fingerprint is state.json's props.fit: when the
// fit that priced the run was searched, its fit day and its code's hash.
//
// Refit (refitWhy) when:
//   - no saved fit, or it can't be read (fail safe)
//   - the fit's code changed (FIT_FILES' text, FIT_VERSION) or MODEL_EPOCH moved
//   - a new fit day (fitDay: the Central date from REFIT_HOUR on: the night's late games graded first)
//   - REFIT_FINALS more finals in the history than the fit saw (a slate's worth)
// The first two must refit; the last two are staleness. A run's first refit always goes ahead; a later one that
// would take its refitting past FIT_BUDGET waits for the next run (fitPlan): a stale fit reused once more, an
// unusable one with no props that run. So a run refits the NFL's alone or the other three's, inside the job's
// timeout. The soft terms' daily step (project.mjs softStep) goes by the time since the last fit, so a fit a day
// moves them as the hourly fits did.

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { CACHE } from "./sources.mjs";
import { MODEL_EPOCH } from "./leagues.mjs";

// (bumped by hand when what a saved fit means changes and the files below don't show it)
export const FIT_VERSION = 1;
// (the fit's code: the stats and their terms, the search, the model, the matchup tables, the player rows)
export const FIT_FILES = [
  "project.mjs",
  "props.mjs",
  "matchups.mjs",
  "playerlogs.mjs",
];
// (the fit day starts at 6 AM Central: the West Coast's late games are in by then)
export const REFIT_HOUR = 6;
// (new finals since the fit that make it stale: about a full slate)
export const REFIT_FINALS = { nfl: 12, nba: 10, nhl: 12, mlb: 15 };
// (a run's refitting time past which a later refit waits for the next run (fitPlan): GitHub's NBA, NHL and MLB fits
// together, or the NFL's alone)
export const FIT_BUDGET = 20 * 60e3;

// (where the fits are kept: MODEL_FITS, a directory, for a check that mustn't touch the desk's own)
export const FITS_DIR = process.env.MODEL_FITS || path.join(CACHE, "fits");
export const fitFile = (sport, dir = FITS_DIR) =>
  path.join(dir, `${sport}.json`);

let codeCache = null;
// (the fit's code, as a hash: its files' text, the version and the epoch)
export function fitCode(
  dir = import.meta.dirname,
  files = FIT_FILES,
  epoch = MODEL_EPOCH,
) {
  if (
    dir === import.meta.dirname &&
    files === FIT_FILES &&
    epoch === MODEL_EPOCH &&
    codeCache
  )
    return codeCache;
  const h = createHash("sha256");
  h.update(`v${FIT_VERSION}|${epoch}`);
  for (const f of files)
    h.update(`|${f}|`).update(readFileSync(path.join(dir, f)));
  const out = h.digest("hex").slice(0, 16);
  if (
    dir === import.meta.dirname &&
    files === FIT_FILES &&
    epoch === MODEL_EPOCH
  )
    codeCache = out;
  return out;
}

const CT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});
// (the fit day a time falls in: its Central date, a time before REFIT_HOUR the day before's)
export function fitDay(t, hour = REFIT_HOUR) {
  const p = Object.fromEntries(
    CT.formatToParts(new Date(t)).map((x) => [x.type, x.value]),
  );
  const day = `${p.year}-${p.month}-${p.day}`;
  if (Number(p.hour) >= hour) return day;
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// What a fit holds, written as JSON exactly: the numbers JSON can't carry (NaN, the infinities, -0), undefined
// where a key holds it, Maps and Sets tagged; a Map keyed by objects (a row) isn't kept (none is read after the
// fit); a function can't be
const TAG = "$fit";
export function encodeFit(x) {
  if (x === undefined) return { [TAG]: "u" };
  if (typeof x === "number")
    return Number.isNaN(x)
      ? { [TAG]: "nan" }
      : x === Infinity
        ? { [TAG]: "inf" }
        : x === -Infinity
          ? { [TAG]: "-inf" }
          : Object.is(x, -0)
            ? { [TAG]: "-0" }
            : x;
  if (x === null || typeof x !== "object") {
    if (
      typeof x === "function" ||
      typeof x === "symbol" ||
      typeof x === "bigint"
    )
      throw new Error(`a fit can't keep a ${typeof x}`);
    return x;
  }
  if (Array.isArray(x)) return x.map(encodeFit);
  if (x instanceof Map) {
    if ([...x.keys()].some((k) => k !== null && typeof k === "object"))
      return { [TAG]: "map", v: [] };
    return {
      [TAG]: "map",
      v: [...x].map(([k, v]) => [encodeFit(k), encodeFit(v)]),
    };
  }
  if (x instanceof Set) return { [TAG]: "set", v: [...x].map(encodeFit) };
  if (x instanceof Date) return { [TAG]: "date", v: x.toISOString() };
  const proto = Object.getPrototypeOf(x);
  if (proto !== Object.prototype && proto !== null)
    throw new Error(
      `a fit can't keep a ${proto?.constructor?.name ?? "object"}`,
    );
  const out = {};
  for (const [k, v] of Object.entries(x)) out[k] = encodeFit(v);
  return out;
}
export function decodeFit(x) {
  if (Array.isArray(x)) return x.map(decodeFit);
  if (x === null || typeof x !== "object") return x;
  const tag = x[TAG];
  if (tag !== undefined) {
    if (tag === "u") return undefined;
    if (tag === "nan") return NaN;
    if (tag === "inf") return Infinity;
    if (tag === "-inf") return -Infinity;
    if (tag === "-0") return -0;
    if (tag === "map")
      return new Map(x.v.map(([k, v]) => [decodeFit(k), decodeFit(v)]));
    if (tag === "set") return new Set(x.v.map(decodeFit));
    if (tag === "date") return new Date(x.v);
    throw new Error(`unknown tag ${tag}`);
  }
  const out = {};
  for (const [k, v] of Object.entries(x)) out[k] = decodeFit(v);
  return out;
}

// (a sport's saved fit: { fit, why } (why: what's wrong with it, the fit null))
export function readFit(sport, dir = FITS_DIR) {
  const file = fitFile(sport, dir);
  if (!existsSync(file)) return { fit: null, why: "no saved fit" };
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    if (
      raw?.sport !== sport ||
      typeof raw.code !== "string" ||
      typeof raw.day !== "string" ||
      !Number.isFinite(raw.finals) ||
      !raw.fits ||
      typeof raw.fits !== "object" ||
      !Object.keys(raw.fits).length
    )
      return { fit: null, why: "the saved fit unreadable (its fields)" };
    return { fit: { ...raw, fits: decodeFit(raw.fits) }, why: null };
  } catch (err) {
    return {
      fit: null,
      why: `the saved fit unreadable (${String(err?.message ?? err).slice(0, 80)})`,
    };
  }
}

// (a sport's fit saved: written to a temporary file and moved, so a run cut off mid-write leaves the old one)
export function saveFit(
  sport,
  { fits, at, finals, rows = null, seconds = null },
  dir = FITS_DIR,
) {
  const file = fitFile(sport, dir);
  const out = {
    sport,
    code: fitCode(),
    day: fitDay(at),
    at: new Date(at).toISOString(),
    finals,
    rows,
    seconds,
    fits: encodeFit(fits),
  };
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(out));
  renameSync(`${file}.tmp`, file);
  return out;
}

// Whether a sport refits: { refit, why, must } (must: no fit to reuse; else a stale one, which the budget may
// leave for the next run); the saved fit (as readFit returns it), this run's time, the history's finals
export function refitWhy(
  saved,
  { sport, now, finals, code = fitCode(), force = false },
) {
  if (force) return { refit: true, must: true, why: "asked (--refit)" };
  if (!saved?.fit)
    return { refit: true, must: true, why: saved?.why ?? "no saved fit" };
  const f = saved.fit;
  if (f.code !== code)
    return {
      refit: true,
      must: true,
      why: "the fit's code or MODEL_EPOCH changed",
    };
  if (f.day !== fitDay(now))
    return {
      refit: true,
      must: false,
      why: `a new day (the saved fit's ${f.day})`,
    };
  const fresh = finals - f.finals;
  if (fresh >= (REFIT_FINALS[sport] ?? 12))
    return { refit: true, must: false, why: `${fresh} new finals since it` };
  if (fresh < 0)
    return {
      refit: true,
      must: true,
      why: "the history has fewer finals than the saved fit saw",
    };
  return { refit: false, must: false, why: null };
}

// (a value as text for comparing, whatever it holds: a function by its name, a class's instance by its fields; a
// step's time taken (seconds) left out)
function sameText(x, seen = new Set()) {
  if (typeof x === "number")
    return Number.isNaN(x) ? "NaN" : Object.is(x, -0) ? "-0" : String(x);
  if (x === undefined) return "undefined";
  if (typeof x === "function") return `fn ${x.name}`;
  if (x === null || typeof x !== "object") return JSON.stringify(x);
  if (seen.has(x)) return "[seen]";
  seen.add(x);
  let out;
  if (Array.isArray(x)) out = `[${x.map((v) => sameText(v, seen)).join(",")}]`;
  else if (x instanceof Map)
    out = `Map{${[...x].map(([k, v]) => `${typeof k === "object" && k ? "#" : sameText(k, seen)}:${sameText(v, seen)}`).join(",")}}`;
  else if (x instanceof Set)
    out = `Set{${[...x].map((v) => (typeof v === "object" && v ? "#" : sameText(v, seen))).join(",")}}`;
  else
    out = `{${Object.keys(x)
      .filter((k) => k !== "seconds")
      .map((k) => `${k}:${sameText(x[k], seen)}`)
      .join(",")}}`;
  seen.delete(x);
  return out;
}

// Whether two fitProps results price alike (a fresh fit's and one rebuilt from its saved fit): every stat's
// choices and numbers, its players' values, and each history row's projection under each model; the differences
// (the first few), none when they're the same. statRowsOf(st): the stat's rows as the fit read them (props.mjs
// statRows)
export function fitDiffs(a, b, stats, statRowsOf, max = 10) {
  const diffs = [];
  const add = (d) => diffs.length < max && diffs.push(d);
  const keys = (o) =>
    Object.keys(o ?? {})
      .sort()
      .join(",");
  if (keys(a) !== keys(b)) add(`the stats: ${keys(a)} against ${keys(b)}`);
  const FIELDS = [
    "params",
    "gains",
    "floors",
    "rookie",
    "start",
    "base",
    "check",
    "checkAll",
    "values",
    "snapGap",
    "rows",
    "eligible",
  ];
  for (const st of stats) {
    const [x, y] = [a?.[st.key], b?.[st.key]];
    if (!x || !y) continue;
    for (const f of FIELDS)
      if (sameText(x[f]) !== sameText(y[f])) add(`${st.key}: ${f} differs`);
    let n = 0;
    for (const row of statRowsOf(st)) {
      const [p, q] = [
        sameText(x.model.project(row)),
        sameText(y.model.project(row)),
      ];
      if (p !== q) {
        add(
          `${st.key}: ${row.pid} on ${row.date} projected ${p.slice(0, 120)} against ${q.slice(0, 120)}`,
        );
        if (++n >= 3) break;
      }
    }
    if (sameText(x.model.startTable?.()) !== sameText(y.model.startTable?.()))
      add(`${st.key}: the start table differs`);
  }
  const ab = (o) =>
    sameText(Object.values(o ?? {})[0]?.matchups?.absorbed?.() ?? null);
  if (ab(a) !== ab(b)) add("the absorbed table differs");
  return diffs;
}

// (a sport's refit, in seconds on GitHub, where no saved fit has timed one (2026-10-14's runs))
export const FIT_SECONDS = { nfl: 1600, nba: 550, nhl: 350, mlb: 100 };
// What a sport's run does with its props' fit: 'reuse' the saved one, 'refit', or 'wait' (no props this run: a
// fit it can't reuse and no time left for it). The first refit of a run always goes ahead; after that, one that
// would take the run's refitting past FIT_BUDGET (its time the saved fit's own, else FIT_SECONDS) waits: a stale
// fit reused one more run, a missing or outdated one with no props priced, never a fit it can't trust. spent: the
// run's ms refitting so far
export function fitPlan(saved, due, { sport, spent = 0, budget = FIT_BUDGET }) {
  if (!due.refit) return "reuse";
  const guess =
    (Number.isFinite(saved?.fit?.seconds)
      ? saved.fit.seconds
      : (FIT_SECONDS[sport] ?? 600)) * 1000;
  if (spent > 0 && spent + guess > budget) return due.must ? "wait" : "reuse";
  return "refit";
}
