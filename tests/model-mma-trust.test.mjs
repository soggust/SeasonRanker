// The MMA desk's trust from the priced history (libs/ranker/scripts/model/mma-desk.mjs readHistoryRows, fitMmaTrust;
// DECISIONS.md D36): the gate's recorded rows pooled with the live bets, the history capped at PRIOR_ROWS rows' worth
// and the live rows whole, fitted from the first run where the history has rows, the practice cap kept where the
// history says the model earned nothing, free to rise where the live bets say it has; the desk never writes the
// files. No network, no files: the rows are made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FILES, MMA_START, PRIOR_ROWS, fitMmaTrust, fittedFor, pickFor, readHistoryRows, trustFor } from '../libs/ranker/scripts/model/mma-desk.mjs';
import { packRows } from '../libs/ranker/scripts/model/gate-mma.mjs';
import { TOTAL_LIVE } from '../libs/ranker/scripts/model/fights-totals.mjs';
import { rng } from '../libs/ranker/scripts/model/gate-score.mjs';

// (a made-up history: n rows a market, the Bot's chance either informative (near the truth against a soft Book) or
// noise (the Book's chance plus noise), seeded)
function rowsOf({ n = 300, market = 'ml', informative = true, seed = 5, season = 2026, lead = 400 } = {}) {
  const r = rng(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const truth = 0.3 + 0.4 * r();
    const f = Math.min(0.95, Math.max(0.05, truth + (r() - 0.5) * (informative ? 0.2 : 0.08)));
    const model = Math.min(0.95, Math.max(0.05, informative ? truth + (r() - 0.5) * 0.02 : f + (r() - 0.5) * 0.3));
    const won = r() < truth;
    out.push({ market, event: `e${i}`, start: `${season}-06-01T00:00:00Z`, season, line: market === 'total' ? 2.5 : null, model, fair: f, status: won ? 'won' : 'lost', clv: { q: Math.min(0.95, Math.max(0.05, truth + (r() - 0.5) * 0.03)) }, kind: 'o', lead });
  }
  return out;
}
const fileOf = (bets, current = 2026) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mma-hist-'));
  const file = path.join(dir, 'history-rows.json');
  writeFileSync(file, JSON.stringify({ sport: 'mma', at: '2026-10-19T15:00:00Z', commit: 'abc12345', current, n: bets.length, rows: packRows(bets) }));
  return file;
};

test("readHistoryRows: the gate's rows back as bets, weighted by season and capped at PRIOR_ROWS rows' worth; none without the file", () => {
  const bets = [...rowsOf({ n: 500 }), ...rowsOf({ n: 500, season: 2025, seed: 6 })];
  const h = readHistoryRows(fileOf(bets));
  assert.equal(h.n, 1000);
  assert.equal(h.commit, 'abc12345');
  // (1,000 rows at 1 and 0.5: 750 rows' worth, capped at PRIOR_ROWS)
  assert.equal(h.weight, PRIOR_ROWS);
  const sum = h.bets.reduce((t, b) => t + b.tw, 0);
  assert.ok(Math.abs(sum - PRIOR_ROWS) < 1, `the rows' weight ${sum}`);
  const now = h.bets.find((b) => b.season === 2026).tw;
  const last = h.bets.find((b) => b.season === 2025).tw;
  assert.ok(Math.abs(now / last - 2) < 1e-2, 'last season half of this one');
  // (fewer than the cap: as they are)
  const small = readHistoryRows(fileOf(rowsOf({ n: 50 })));
  assert.equal(small.weight, 50);
  assert.equal(small.bets[0].tw, 1);
  assert.equal(readHistoryRows(path.join(tmpdir(), 'no-such-file.json')), null);
  assert.ok(PRIOR_ROWS >= 100 && PRIOR_ROWS <= 1000);
});

test('fitMmaTrust: fitted from the first run on the history alone; a history where the model is noise keeps the trust at 0 (the practice cap stays: no edge at the trusted chance); one where it is informative lifts it', () => {
  const ledger = { bets: [] };
  // (the rows 400 hours out: the early band's, fit at the untapered key; the other bands empty, at the start)
  const noise = fitMmaTrust(ledger, readHistoryRows(fileOf(rowsOf({ informative: false, n: 1500, seed: 1 }))));
  assert.equal(noise.ml.bands.early.fitted, true);
  assert.ok(noise.ml.bands.early.trust <= 0.1, `noise earns next to nothing: ${noise.ml.bands.early.trust}`);
  assert.equal(noise.ml.bands.late.fitted, false);
  assert.equal(noise.ml.history.rows, 1500);
  assert.equal(noise.live.ml, 0);
  assert.equal(trustFor(noise, 'ml', 400), noise.ml.bands.early.trust);
  assert.equal(trustFor(noise, 'ml', 10), 0.5, 'the late band unfit: the start');
  assert.equal(fittedFor(noise, 'ml', 400), true);
  assert.equal(fittedFor(noise, 'ml', 10), false);
  // (no edge at trust 0: the pick is tracked at the practice stake, never an edge bet)
  const pick = pickFor(0.57, { odds: { home: -110, away: -110 }, fair: 0.5 }, trustFor(noise, 'ml', 400), { edge: 0.03, untested: !fittedFor(noise, 'ml', 400), key: 'mlOpen' });
  assert.equal(pick.placed.intent, 'track');
  assert.equal(pick.pick.side, 'home', "the model's side, even with no return on either");
  const good = fitMmaTrust(ledger, readHistoryRows(fileOf(rowsOf({ informative: true }))));
  const gt = trustFor(good, 'ml', 400);
  assert.ok(gt >= 0.4, `an informative history earns trust: ${gt}`);
  assert.equal(fittedFor(good, 'ml', 400), true);
  // (and at that trust the same lean is an edge bet, past the untested cap)
  const bet = pickFor(0.57, { odds: { home: -110, away: -110 }, fair: 0.5 }, gt, { edge: 0.03, untested: !fittedFor(good, 'ml', 400), key: 'mlOpen' });
  assert.equal(bet.placed.intent, 'edge');
  assert.ok(bet.placed.units >= 0.5);
  // (the early key: a lean past the gap is priced whole and never skipped; the market's own key skips it)
  const far = pickFor(0.72, { odds: { home: -110, away: -110 }, fair: 0.5 }, 0.75, { edge: 0.03, untested: false, key: 'mlOpen' });
  assert.ok(!far.skip && far.pick.p > 0.66, `untapered at the early line: ${far.pick.p}`);
  assert.match(pickFor(0.72, { odds: { home: -110, away: -110 }, fair: 0.5 }, 0.75, { edge: 0.03, untested: false }).skip, /too far/);
  // (without the history: the live bets alone, untested under 40 as before)
  const alone = fitMmaTrust(ledger, null);
  assert.equal(alone.ml.fitted, false);
  assert.equal(alone.ml.trust, 0.5);
  assert.equal(alone.ml.history.rows, 0);
  assert.equal(trustFor(alone, 'ml', 400), 0.5);
});

test('fitMmaTrust: the live bets since the epoch weigh whole against the capped history, so a run of live rows moves the trust the history set; rows before the epoch never count', () => {
  const hist = readHistoryRows(fileOf(rowsOf({ informative: false, n: 1500, seed: 1 })));
  const base = trustFor(fitMmaTrust({ bets: [] }, hist), 'ml', 400);
  assert.ok(base <= 0.1);
  // (live bets placed 17 days before the start: the early band's evidence)
  const liveRows = rowsOf({ informative: true, n: 400, seed: 9 }).map((b, i) => ({ ...b, id: `live${i}`, placedAt: '2026-10-20T00:00:00Z', start: '2026-11-06T00:00:00Z', fairFrom: 'pinnacle', clv: { q: b.clv.q, prob: 0.01 }, tw: undefined, lead: undefined, band: undefined }));
  const moved = fitMmaTrust({ bets: liveRows }, hist);
  assert.ok(trustFor(moved, 'ml', 400) > base, `the live rows lift it: ${trustFor(moved, 'ml', 400)}`);
  assert.equal(trustFor(moved, 'ml', 10), 0.5, 'the late band untouched by early bets');
  assert.equal(moved.live.ml, 400);
  // (the same rows placed before the epoch: not evidence)
  const old = fitMmaTrust({ bets: liveRows.map((b) => ({ ...b, placedAt: '2026-10-01T00:00:00Z' })) }, hist);
  assert.equal(trustFor(old, 'ml', 400), base);
  assert.equal(old.live.ml, 0);
  assert.ok(Date.parse(MMA_START) > Date.parse('2026-10-19T00:00:00Z'), 'the epoch bumped for the history round');
});

test("fitMmaTrust: the round totals' graded-with-a-close count reads the history's rows too, so the market is live where the history has TOTAL_LIVE; its rungs by the line's size fit on the history's rows", () => {
  const few = fitMmaTrust({ bets: [] }, readHistoryRows(fileOf(rowsOf({ market: 'total', n: 10 }))));
  assert.equal(few.totalsGraded, 10);
  assert.equal(few.totalsLive, false);
  const many = fitMmaTrust({ bets: [] }, readHistoryRows(fileOf(rowsOf({ market: 'total', n: 60 }))));
  assert.equal(many.totalsGraded, 60);
  assert.equal(many.totalsLive, TOTAL_LIVE <= 60);
  assert.ok(many.ladder, 'the rungs');
  assert.ok(Number.isFinite(many.total.lines?.mid?.trust), 'the 2.5 line is the mid rung');
  assert.ok(Number.isFinite(trustFor(many, 'total', 400, 2.5)), 'a total at its band, held to the rung');
  assert.equal(many.ml.history.rows, 0, 'no moneyline rows in a totals-only history');
});

test('the desk reads the history files and never writes them (the gate --record does)', () => {
  const src = readFileSync(new URL('../libs/ranker/scripts/model/mma-desk.mjs', import.meta.url), 'utf8');
  assert.match(FILES.historyRows, /history-rows\.json$/);
  assert.match(FILES.trustPrior, /trust-prior\.json$/);
  for (const key of ['historyRows', 'trustPrior']) {
    assert.ok(!new RegExp(`write\\w*\\([^)]*FILES\\.${key}`).test(src), `${key} written by the desk`);
    assert.ok(!new RegExp(`writeIfChanged\\(FILES\\.${key}`).test(src), `${key} written by the desk`);
  }
  // (and gate.mjs writes both, on --record)
  const gate = readFileSync(new URL('../libs/ranker/scripts/model/gate.mjs', import.meta.url), 'utf8');
  assert.match(gate, /trust-prior\.json/);
  assert.match(gate, /history-rows\.json/);
});
