// The props' fits kept between runs (libs/ranker/scripts/model/fitcache.mjs, props.mjs fitProps' reuse, run.mjs
// fitTheProps): a fit saved and read back is the fit exactly (NaN, the infinities, -0, undefined, Maps and Sets
// kept), the projections rebuilt from it are a fresh fit's, a stat the saved fit lacks is fit fresh, and a sport
// refits when its fit is missing, unreadable, from other code or epoch, from another fit day (6 AM Central on),
// or a slate behind; past the run's refit budget a stale one is reused once more and an unusable one waits (no
// props that run), never priced on a fit it can't trust.
// On real data (the desk's own pipeline, run.mjs --dry --refit --fit-check, network and the desk's cache): set
// FIT_CACHE_REAL=1 (NFL and NHL; minutes each).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  FIT_BUDGET,
  FIT_SECONDS,
  REFIT_FINALS,
  REFIT_HOUR,
  decodeFit,
  encodeFit,
  fitCode,
  fitDay,
  fitDiffs,
  fitFile,
  fitPlan,
  readFit,
  refitWhy,
  saveFit,
} from "../libs/ranker/scripts/model/fitcache.mjs";
import {
  STATS,
  fitProps,
  statRows,
} from "../libs/ranker/scripts/model/props.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const round = (x) => JSON.parse(JSON.stringify(encodeFit(x)));

test("a fit written and read back is the fit exactly: the numbers JSON drops, undefined, Maps and Sets kept", () => {
  const x = {
    a: NaN,
    b: Infinity,
    c: -Infinity,
    d: -0,
    e: undefined,
    f: [1, NaN, undefined, null],
    g: new Map([
      ["k", { v: -0 }],
      [3, new Set([1, "x"])],
    ]),
    h: { deep: { r: 0.1 + 0.2 } },
    i: new Date("2026-10-15T12:00:00Z"),
  };
  const y = decodeFit(round(x));
  assert.ok(Number.isNaN(y.a));
  assert.equal(y.b, Infinity);
  assert.equal(y.c, -Infinity);
  assert.ok(Object.is(y.d, -0));
  assert.ok(Object.hasOwn(y, "e") && y.e === undefined);
  assert.ok(Number.isNaN(y.f[1]) && y.f[2] === undefined && y.f[3] === null);
  assert.ok(
    y.g instanceof Map &&
      Object.is(y.g.get("k").v, -0) &&
      y.g.get(3) instanceof Set &&
      y.g.get(3).has("x"),
  );
  assert.equal(y.h.deep.r, 0.1 + 0.2);
  assert.equal(y.i.toISOString(), "2026-10-15T12:00:00.000Z");
  // (a Map keyed by rows (a check's lossBy) isn't kept: read by the search alone)
  assert.equal(decodeFit(round(new Map([[{ row: 1 }, 0.5]]))).size, 0);
  assert.throws(() => encodeFit({ f: () => 1 }));
});

test("the fit day starts at 6 AM Central, daylight saving and all", () => {
  assert.equal(REFIT_HOUR, 6);
  // (CDT: 6 AM is 11:00Z)
  assert.equal(fitDay("2026-10-15T10:59:00Z"), "2026-10-14");
  assert.equal(fitDay("2026-10-15T11:00:00Z"), "2026-10-15");
  assert.equal(fitDay("2026-10-16T04:30:00Z"), "2026-10-15");
  // (CST: 6 AM is 12:00Z; across a month's end)
  assert.equal(fitDay("2026-12-01T11:59:00Z"), "2026-11-30");
  assert.equal(fitDay("2026-12-01T12:00:00Z"), "2026-12-01");
  assert.equal(fitDay("2027-01-01T05:00:00Z"), "2026-12-31");
});

test("the refit triggers: missing, unreadable, other code, a new day, a slate of finals, fewer finals, asked; else the saved fit", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "fits-"));
  try {
    const at = Date.parse("2026-10-15T13:00:00Z");
    const fits = { sog: { params: { a: 1, roleK: NaN } }, saves: null };
    // (none saved: a must)
    let saved = readFit("nhl", dir);
    assert.equal(saved.fit, null);
    assert.deepEqual(refitWhy(saved, { sport: "nhl", now: at, finals: 100 }), {
      refit: true,
      must: true,
      why: "no saved fit",
    });
    saveFit("nhl", { fits, at, finals: 100, rows: 5000 }, dir);
    saved = readFit("nhl", dir);
    assert.equal(saved.why, null);
    assert.equal(saved.fit.day, "2026-10-15");
    assert.equal(saved.fit.code, fitCode());
    assert.ok(Number.isNaN(saved.fit.fits.sog.params.roleK));
    assert.equal(saved.fit.fits.saves, null);
    // (the same day, a few finals since: reused)
    const ok = {
      sport: "nhl",
      now: at + 5 * 36e5,
      finals: 100 + REFIT_FINALS.nhl - 1,
    };
    assert.deepEqual(refitWhy(saved, ok), {
      refit: false,
      must: false,
      why: null,
    });
    // (a slate since: stale)
    const slate = refitWhy(saved, { ...ok, finals: 100 + REFIT_FINALS.nhl });
    assert.ok(slate.refit && !slate.must, slate.why);
    // (the next fit day, from 6 AM Central: stale; 5:59 still the same day)
    assert.equal(
      refitWhy(saved, { ...ok, now: Date.parse("2026-10-16T10:59:00Z") }).refit,
      false,
    );
    const day = refitWhy(saved, {
      ...ok,
      now: Date.parse("2026-10-16T11:00:00Z"),
    });
    assert.ok(day.refit && !day.must && /new day/.test(day.why));
    // (other code or epoch: a must)
    const code = refitWhy(saved, { ...ok, code: "something-else" });
    assert.ok(code.refit && code.must);
    assert.notEqual(
      fitCode(
        path.join(ROOT, "libs/ranker/scripts/model"),
        ["project.mjs"],
        "another epoch",
      ),
      fitCode(),
    );
    // (the history shorter than the fit's: a must; --refit: a must)
    assert.ok(refitWhy(saved, { ...ok, finals: 99 }).must);
    assert.ok(refitWhy(saved, { ...ok, force: true }).must);
    // (unreadable: cut off, not JSON, another sport's, missing its fields: a must, with why)
    const file = fitFile("nhl", dir);
    const text = readFileSync(file, "utf8");
    for (const bad of [
      text.slice(0, Math.floor(text.length / 2)),
      "null",
      "{}",
      JSON.stringify({ ...JSON.parse(text), sport: "nba" }),
      JSON.stringify({ ...JSON.parse(text), fits: {} }),
      JSON.stringify({ ...JSON.parse(text), fits: { sog: { $fit: "what" } } }),
    ]) {
      writeFileSync(file, bad);
      const back = readFit("nhl", dir);
      assert.equal(back.fit, null, bad.slice(0, 40));
      assert.match(back.why, /unreadable/);
      const due = refitWhy(back, ok);
      assert.ok(due.refit && due.must);
    }
    // (another sport's file isn't this one's)
    assert.equal(readFit("nfl", dir).fit, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.ok(FIT_BUDGET >= 10 * 60e3);
});

test("the run's refit budget: its first refit always; then a stale fit that won't fit waits on the saved one, an unusable one with no props", () => {
  const saved = { fit: { seconds: 1600 } };
  const stale = { refit: true, must: false, why: "a new day" };
  const must = { refit: true, must: true, why: "no saved fit" };
  assert.equal(
    fitPlan(
      saved,
      { refit: false, must: false, why: null },
      { sport: "nfl", spent: 99 * 60e3 },
    ),
    "reuse",
  );
  assert.equal(fitPlan(saved, stale, { sport: "nfl", spent: 0 }), "refit");
  assert.equal(
    fitPlan({ fit: null }, must, { sport: "nfl", spent: 0 }),
    "refit",
  );
  // (the NBA's, NHL's and MLB's after a while: inside the budget; the NFL's after them: past it)
  assert.equal(
    fitPlan({ fit: { seconds: 350 } }, stale, { sport: "nhl", spent: 550e3 }),
    "refit",
  );
  assert.equal(fitPlan(saved, stale, { sport: "nfl", spent: 1000e3 }), "reuse");
  assert.equal(
    fitPlan({ fit: null, why: "no saved fit" }, must, {
      sport: "nfl",
      spent: 1000e3,
    }),
    "wait",
  );
  // (an outdated fit (the code or MODEL_EPOCH changed) past the budget: its choices price the suggestions alone, never
  // nothing at all (2026-10-19: the NFL's refit left the other three boards with no props, run after run))
  const code = { refit: true, must: true, why: "the fit's code or MODEL_EPOCH changed" };
  assert.equal(fitPlan({ fit: { seconds: 200, fits: { k: {} } } }, code, { sport: "mlb", spent: 1820e3 }), "suggest");
  assert.equal(fitPlan({ fit: { seconds: 200, fits: { k: {} } } }, code, { sport: "mlb", spent: 0 }), "refit");
  assert.equal(fitPlan({ fit: null, why: "no saved fit" }, code, { sport: "mlb", spent: 1820e3 }), "wait");
  // (no time of its own: the sport's guess)
  assert.equal(
    fitPlan({ fit: {} }, stale, {
      sport: "mlb",
      spent: FIT_BUDGET - (FIT_SECONDS.mlb + 1) * 1000,
    }),
    "refit",
  );
  assert.equal(
    fitPlan({ fit: {} }, stale, {
      sport: "mlb",
      spent: FIT_BUDGET - (FIT_SECONDS.mlb - 1) * 1000,
    }),
    "reuse",
  );
});

// (mulberry32: a deterministic stream of 0..1)
const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
// (two NHL seasons, made up: 8 teams, each a game every other day, four forwards, two defensemen and a goalie a side)
function nhlRows() {
  const r = rng(11);
  const rows = [];
  const teams = Array.from({ length: 8 }, (_, i) => `t${i}`);
  let game = 0;
  for (const season of [2025, 2026]) {
    for (let d = 0; d < 32; d++) {
      const date = new Date(
        Date.UTC(season - 1, 9, 5 + d * 2, 23),
      ).toISOString();
      const order = [...teams].sort(() => r() - 0.5);
      for (let k = 0; k < order.length; k += 2) {
        const id = String(++game);
        for (const [team, opp, home] of [
          [order[k], order[k + 1], true],
          [order[k + 1], order[k], false],
        ]) {
          const t = Number(team.slice(1));
          for (let p = 0; p < 6; p++) {
            const pos = p < 4 ? "F" : "D";
            const lvl = (pos === "F" ? 2.2 : 1.4) + ((t + p) % 5) * 0.3;
            const sog = Math.max(0, Math.round(lvl + (r() - 0.5) * 3));
            const goals = r() < 0.1 * sog ? 1 : 0;
            rows.push({
              pid: `${team}p${p}`,
              name: `${team}p${p}`,
              pos,
              date,
              season,
              team,
              opp,
              game: id,
              home,
              s: {
                toi: (pos === "F" ? 16 : 21) + (r() - 0.5) * 4,
                sog,
                goals,
                pts: goals + (r() < 0.3 ? 1 : 0),
                pptoi: r() * 3,
              },
            });
          }
          rows.push({
            pid: `${team}g`,
            name: `${team}g`,
            pos: "G",
            date,
            season,
            team,
            opp,
            game: id,
            home,
            s: {
              toi: 60,
              saves: Math.round(24 + ((t * 7) % 9) + (r() - 0.5) * 10),
            },
          });
        }
      }
    }
  }
  return rows;
}

test("the projections rebuilt from a saved fit are the fresh fit's exactly; a stat it lacks is fit fresh; another fit's differ", () => {
  const fresh = fitProps("nhl", nhlRows(), new Map(), new Map());
  assert.ok(Object.keys(fresh).length >= 2, Object.keys(fresh).join(","));
  assert.equal(Object.keys(fresh.fits).length, STATS.nhl.length);
  assert.ok(Object.values(fresh).every((f) => f.reused === false));
  // (through the file's text, as the next run reads it)
  const saved = decodeFit(round(fresh.fits));
  const rows = nhlRows();
  const again = fitProps(
    "nhl",
    rows,
    new Map(),
    new Map(),
    null,
    null,
    null,
    null,
    null,
    saved,
  );
  assert.ok(Object.values(again).every((f) => f.reused === true));
  assert.deepEqual(
    fitDiffs(fresh, again, STATS.nhl, (st) => statRows("nhl", st, rows)),
    [],
  );
  // (one stat missing from the saved fit: that one searched again, the same as fresh)
  const key = Object.keys(fresh)[0];
  const part = { ...saved };
  delete part[key];
  const mixed = fitProps(
    "nhl",
    nhlRows(),
    new Map(),
    new Map(),
    null,
    null,
    null,
    null,
    null,
    part,
  );
  assert.equal(mixed[key].reused, false);
  assert.deepEqual(
    fitDiffs(fresh, mixed, STATS.nhl, (st) => statRows("nhl", st, rows)),
    [],
  );
  // (the check isn't blind: a saved size moved shows in the projections)
  const moved = decodeFit(round(fresh.fits));
  moved[key].params = {
    ...moved[key].params,
    scale: (moved[key].params.scale ?? 1) * 1.05,
  };
  const off = fitProps(
    "nhl",
    nhlRows(),
    new Map(),
    new Map(),
    null,
    null,
    null,
    null,
    null,
    moved,
  );
  const diffs = fitDiffs(fresh, off, STATS.nhl, (st) =>
    statRows("nhl", st, rows),
  );
  assert.ok(
    diffs.some((d) => d.startsWith(`${key}: params`)),
    diffs.join("; "),
  );
  assert.ok(
    diffs.some((d) => / projected /.test(d)),
    diffs.join("; "),
  );
});

// (the desk's own pipeline on the real history, the fresh fit and its rebuild compared by run.mjs --fit-check:
// every stat's numbers and every history row's projection; the fits kept apart from the desk's (MODEL_FITS))
for (const sport of ["nhl", "nfl"]) {
  test(
    `real data (${sport}): the rebuilt fit projects every history row as the fresh fit does`,
    {
      skip:
        process.env.FIT_CACHE_REAL !== "1" &&
        "set FIT_CACHE_REAL=1 (the desk run, dry: network, the cache, minutes)",
      timeout: 60 * 60e3,
    },
    () => {
      const dir = mkdtempSync(path.join(tmpdir(), "fits-real-"));
      try {
        mkdirSync(dir, { recursive: true });
        const out = spawnSync(
          process.execPath,
          [
            "libs/ranker/scripts/model/run.mjs",
            sport,
            "--dry",
            "--refit",
            "--fit-check",
          ],
          {
            cwd: ROOT,
            env: { ...process.env, MODEL_FITS: dir },
            encoding: "utf8",
            maxBuffer: 256e6,
          },
        );
        const line = (out.stdout ?? "")
          .split("\n")
          .find((l) => l.startsWith(`${sport}: fit check:`));
        assert.ok(
          line,
          `no fit check in the run's log (exit ${out.status}): ${(out.stderr ?? "").slice(-400)}`,
        );
        assert.match(line, /identical/);
        assert.equal(out.status, 0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
}
