// The record's inputs guard (libs/ranker/scripts/model/gate.mjs recordGuard, guardRecords; DECISIONS.md D47): a
// --record refuses to write when the cache it read wasn't complete and consistent (57f80332 wrote the NFL's record at
// -63.5u from a worktree's incomplete cache, -32.95u on the desk's: ddefa4e1). Made-up fingerprints, no cache: an
// incomplete cache refused; a shrunk one held; the incident's move with the model unchanged held as "inputs changed,
// not the model"; the same model on the same fingerprint written as before; a record from before the fingerprint
// read from its counts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNITS_TOL, compactInputs, contextCoverage, frozenCover, guardRecords, inputsHash, prevInputsOf, recordGuard, sameModel } from '../libs/ranker/scripts/model/gate.mjs';

const CODE = { props: 'p1', games: 'g1', pricing: 'c1', record: 'r1', harness: 'h1', residual: 'x1' };
// (a complete cache's fingerprint, as inputsOf writes it with the parent's frozen counts)
const full = (over = {}) => ({
  v: 1,
  sport: 'nfl',
  code: { ...CODE },
  fit: { code: 'fit1', expected: 'fit1', day: '2026-10-19', at: '2026-10-19T20:26:00.000Z', finals: 2900, stats: ['passYds', 'recYds'], want: 2, hash: 'aa' },
  context: { facts: true, on: true, failed: [], bySeason: { 2024: { ol: 285, rz: 285, wx: 200 }, 2025: { ol: 285, rz: 285, wx: 198 } } },
  injuries: { seasons: [2024, 2025], read: [2024, 2025] },
  files: { state: true, backtest: 812, residual: true, evScale: 0.08 },
  rows: { replay: 77894, keys: 44714, bets: 3241 },
  frozen: { props: { mode: 'replay', n: 389, ids: 389, want: 389 }, lines: { mode: 'replay', n: 1755, ids: 55, want: 55 } },
  units: -32.95,
  ...over,
});

test('record guard: a complete cache with the same model and fingerprint is written, the hash the same', () => {
  const g = recordGuard(full(), full());
  assert.equal(g.ok, true);
  assert.deepEqual(g.hard, []);
  assert.deepEqual(g.held, []);
  assert.equal(g.same, true);
  assert.equal(inputsHash(full()), inputsHash(full()));
  // (the units and an override's reason aren't the fingerprint; the inputs are)
  assert.equal(inputsHash(full({ units: -40 })), inputsHash(full()));
  assert.equal(inputsHash({ ...full(), accepted: 'why' }), inputsHash(full()));
  assert.notEqual(inputsHash(full({ fit: { ...full().fit, hash: 'bb' } })), inputsHash(full()));
  // (a small move with the model unchanged, the day's refit: written)
  assert.equal(recordGuard(full({ units: -32.95 + UNITS_TOL / 2 }), full()).ok, true);
});

test('record guard: an incomplete cache is refused whatever the override', () => {
  const noFit = recordGuard(full({ fit: { missing: 'no saved fit', expected: 'fit1', want: 2 } }), full());
  assert.equal(noFit.ok, false);
  assert.match(noFit.hard.join(' '), /no props fit in the cache.*--rebuild-cache nfl/);
  const noFacts = recordGuard(full({ context: { facts: false, on: false, failed: [], bySeason: {} } }), full(), { accept: 'try' });
  assert.equal(noFacts.ok, false);
  assert.match(noFacts.hard.join(' '), /no context facts/);
  const noCtx = recordGuard(full({ context: { ...full().context, on: false } }), full());
  assert.match(noCtx.hard.join(' '), /context fit was left out/);
  // (a fit searched by other code than either version's: refused, unless the run searches its own)
  const other = full({ fit: { ...full().fit, code: 'old' } });
  assert.match(recordGuard(other, full()).hard.join(' '), /not the one the champion or the candidate expects/);
  assert.equal(recordGuard(other, full(), { refit: true }).ok, true);
  assert.equal(recordGuard(other, full(), { champion: full({ fit: { ...full().fit, expected: 'old' } }) }).ok, true);
  assert.match(recordGuard(full({ files: { ...full().files, backtest: 0 } }), full()).hard.join(' '), /backtest/);
  assert.match(recordGuard(full({ files: { ...full().files, state: false } }), full()).hard.join(' '), /ratings state/);
});

test('record guard: inputs that shrank since the last record are held, written only with a reason', () => {
  const ctx = full({ context: { ...full().context, bySeason: { 2024: { ol: 285, rz: 0, wx: 200 }, 2025: { ol: 285, rz: 285, wx: 198 } } } });
  const g = recordGuard(ctx, full());
  assert.equal(g.ok, false);
  assert.deepEqual(g.hard, []);
  assert.match(g.held.join(' '), /inputs shrank.*context rz 2024 games 285 to 0/);
  const ok = recordGuard(ctx, full(), { accept: 'the red zone rebuilt by hand' });
  assert.equal(ok.ok, true);
  assert.equal(ok.accepted, 'the red zone rebuilt by hand');
  // (the players' games missing: the frozen props at their saved chances; the injury listings short)
  assert.match(recordGuard(full({ frozen: { ...full().frozen, props: { mode: 'saved', n: 389, ids: 389, want: 389 } } }), full()).held.join(' '), /saved chances, not replayed/);
  assert.match(recordGuard(full({ injuries: { seasons: [2024, 2025], read: [2025] } }), full()).held.join(' '), /injury listings read for 1 of 2 seasons/);
  assert.match(recordGuard(full({ rows: { replay: 70000, keys: 44714, bets: 3000 } }), full()).held.join(' '), /replay rows 77894 to 70000/);
  assert.match(recordGuard(full({ fit: { ...full().fit, stats: ['passYds'] } }), full()).held.join(' '), /props fit without recYds/);
  assert.match(recordGuard(full({ context: { ...full().context, failed: ['red zone'] } }), full()).held.join(' '), /context sources failed this run: red zone/);
});

test("record guard: the incident (same model, same rows, the record 30u off) is held as inputs changed, not the model", () => {
  const prev = full();
  const next = full({ units: -63.5, fit: { ...full().fit, hash: 'other', at: '2026-10-18T09:00:00.000Z' } });
  const g = recordGuard(next, prev);
  assert.equal(g.ok, false);
  assert.equal(g.same, true);
  assert.match(g.held.join(' '), /inputs changed, not the model: the replay moved -32\.95u to -63\.5u \(-30\.55u, past 3u\)/);
  // (the same move with the model's code changed: the model's own, written)
  assert.equal(recordGuard(full({ units: -63.5, code: { ...CODE, pricing: 'c2' } }), prev).ok, true);
  // (the residual model's weekly refit is the model's own change too)
  assert.equal(recordGuard(full({ units: -63.5, code: { ...CODE, residual: 'x2' } }), prev).ok, true);
  // (with the model unchanged, a count that grew is an input change too)
  assert.match(recordGuard(full({ rows: { replay: 78000, keys: 44714, bets: 3241 } }), prev).held.join(' '), /inputs changed, not the model: replay rows 77894 to 78000/);
  // (the champion with the same code replaying another record in the same run: refused)
  const c = recordGuard(full(), prev, { champion: full({ units: -31 }) });
  assert.match(c.hard.join(' '), /same code but replay -31u and -32\.95u/);
});

test("record guard: a record from before the fingerprint read from its counts and its commit's code", () => {
  const record = { sport: 'nfl', commit: '57f80332', n: { rows: 77894, keys: 44714, bets: 3241 }, overall: { profit: -32.95 } };
  const entry = { commit: '57f80332', frozen: { props: { mode: 'replay', n: 389 }, lines: { mode: 'replay', n: 1755 } } };
  const code = { props: 'p1', games: 'g1', pricing: 'c1', record: 'r1', harness: 'h1' };
  const prev = prevInputsOf(record, entry, code);
  assert.deepEqual(prev.rows, { replay: 77894, keys: 44714, bets: 3241 });
  assert.equal(prev.frozen.props.mode, 'replay');
  assert.equal(prev.units, -32.95);
  // (its code without the residual's hash: compared on the parts both know)
  assert.equal(sameModel(prev.code, CODE), true);
  assert.equal(sameModel(null, CODE), false);
  assert.match(recordGuard(full({ units: -63.5 }), prev).held.join(' '), /inputs changed, not the model/);
  assert.match(recordGuard(full({ frozen: { ...full().frozen, lines: { mode: 'replay', n: 1700, ids: 55, want: 55 } } }), prev).held.join(' '), /frozen lines rows 1755 to 1700/);
  // (a record with a fingerprint is read as it is)
  assert.deepEqual(prevInputsOf({ inputs: full() }), full());
});

test('record guard: the context coverage by season and source, before the epoch; the frozen counts; every sport checked before any is written', () => {
  const history = [
    { id: 1, season: 2024, date: '2024-09-08T17:00Z' },
    { id: 2, season: 2024, date: '2024-09-08T20:00Z' },
    { id: 3, season: 2026, date: '2026-10-25T17:00Z' },
  ];
  const facts = { places: { 'Philadelphia|PA|USA': {} }, rz: { 1: {}, 2: {}, 3: {} }, wx: { 2: {} }, teams: [1, 2], nfl: new Map([['2024_01_A_B', { espn: 1 }]]) };
  assert.deepEqual(contextCoverage(facts, history, '2026-10-19T17:15:00Z'), { 2024: { nfl: 1, rz: 2, wx: 1 } });
  const score = { sport: 'nfl', bet: { props: { replay: [{ id: 'a' }, { id: 'b' }, { id: 'z' }] }, lines: { replay: [], saved: [{ id: 'l1' }, { id: 'bt', src: 'backtest' }] } } };
  const frozen = { sports: { nfl: { props: ['a', 'b', 'c'], lines: ['l1'] } } };
  assert.deepEqual(frozenCover(score, frozen), { props: { mode: 'replay', n: 2, ids: 2, want: 3 }, lines: { mode: 'saved', n: 2, ids: 1, want: 1 } });
  // (two sports, one complete and one not: refused, so neither is written; the log says why)
  const logs = [];
  const nfl = { sport: 'nfl', inputs: full(), bet: { props: { replay: [] }, lines: { replay: [] } } };
  const nhl = { sport: 'nhl', inputs: full({ sport: 'nhl', fit: { missing: 'no saved fit', expected: 'fit1', want: 2 } }), bet: { props: { replay: [] }, lines: { replay: [] } } };
  const prevOf = (s) => ({ ...full({ sport: s }), frozen: null });
  const g = guardRecords([{ sport: 'nfl', score: nfl, champion: null }, { sport: 'nhl', score: nhl, champion: null }], { sports: {} }, { log: (s) => logs.push(s), prevOf });
  assert.equal(g.ok, false);
  assert.match(logs.join('\n'), /nhl: the record's inputs NOT complete[\s\S]*REFUSED: no props fit/);
  assert.match(logs.join('\n'), /--record refused: nothing written/);
  assert.equal(g.inputs.nfl.hash, inputsHash(g.inputs.nfl));
  const ok = guardRecords([{ sport: 'nfl', score: nfl, champion: null }], { sports: {} }, { log: () => {}, prevOf });
  assert.equal(ok.ok, true);
  const c = compactInputs(ok.inputs.nfl);
  assert.deepEqual(c.context, { on: true, games: { 2024: 285, 2025: 285 } });
  assert.equal(c.injuries, '2/2');
});
