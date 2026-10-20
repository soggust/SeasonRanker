// The confidence layer (libs/ranker/scripts/model/confidence.mjs; DECISIONS.md D52): a pick read on the Bot's side, its
// features from what the Bot knows at placement alone, the walk-forward fit that never reads a row it prices (a planted
// leak pins it), the tiers earned only on held-out evidence, the band caps and the stake on the calibrated chance, and
// the desk's wiring (picks.mjs levelOf and capOf, board.mjs sides). Made-up rows, no files, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLEND_NEW, BLEND_START, BLEND_STEP, TIER_MIN, Z_CAP, blendChance, blendFit, capOf, features, fitConfidence, fitTiers, fitWalk, pickOf, qualityOf, scoreRows, snapshotFor, unitsOf } from '../libs/ranker/scripts/model/confidence.mjs';
import { PRACTICE_UNITS, decimal, stakeFor, stakeKelly } from '../libs/ranker/scripts/model/desk.mjs';
import { BANDS, capBand, capOf as betCapOf, edgeLevel, levelOf } from '../libs/ranker/scripts/model/picks.mjs';
import { boardMarkets, boardProp } from '../libs/ranker/scripts/model/board.mjs';
import { rng } from '../libs/ranker/scripts/model/gate-score.mjs';

const T0 = Date.parse('2024-01-01T00:00:00Z');
const DAY = 864e5;
const sig = (z) => 1 / (1 + Math.exp(-z));
const lg = (p) => Math.log(p / (1 - p));

// (a made-up history: n rows over `months`, the Book's chance f, the Bot's priced chance p leaning off it by a noise
// `lean` (a share `signal` of which is real), the result drawn from the true chance. keep: a share of the Bot's edge
// that is real; leak: a feature name the rows carry that gives the result away)
function history(n, { months = 24, signal = 0.3, seed = 7, stat = 'pts', market = 'prop', leak = null, big = false } = {}) {
  const r = rng(seed);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const t = T0 + Math.floor((i / n) * months * 30.4375 * DAY);
    const f = 0.35 + r() * 0.3;
    const lean = (r() - 0.5) * (big ? 0.5 : 0.25);
    const truth = Math.min(0.95, Math.max(0.05, sig(lg(f) + signal * lean)));
    const p = Math.min(0.95, Math.max(0.05, sig(lg(f) + lean)));
    const y = r() < truth ? 1 : 0;
    const over = f >= 0.5 ? -130 : 110;
    const under = f >= 0.5 ? 105 : -140;
    rows.push({ id: `r${i}`, event: `g${Math.floor(i / 4)}`, sport: 'nba', market, stat: market === 'prop' ? stat : market, kind: i % 2 ? 'c' : 'o', line: 20.5, t, at: t - (i % 2 ? 2 : 40) * 36e5, season: 2024 + Math.floor((t - T0) / (365 * DAY)), w: 1, f, raw: p, pCur: p, p, trust: 0.5, y, q: i % 2 ? null : Math.min(0.95, Math.max(0.05, f + (truth - f) * 0.5)), overOdds: over, underOdds: under, home: i % 3 === 0, mu: 21, sd: 6, im: 20.8, ...(leak ? { [leak]: y } : {}) });
  }
  return rows;
}

test('pickOf: the Bot side is the larger expected return at the priced chance, both sides framed right, the result and the close on that side', () => {
  const row = { f: 0.5, p: 0.58, raw: 0.6, pCur: 0.56, overOdds: -110, underOdds: -110, y: 0, q: 0.54, market: 'prop', stat: 'pts', line: 20.5, t: T0 };
  const k = pickOf(row);
  assert.equal(k.side, 'over');
  assert.equal(k.pS, 0.58);
  assert.equal(k.y, 0, 'the over lost');
  assert.equal(k.beat, 1, 'the close moved its way');
  assert.ok(k.edge > 0 && k.kelly > 0);
  const u = pickOf({ ...row, p: 0.42, raw: 0.4, pCur: 0.44, y: 0, q: 0.46 });
  assert.equal(u.side, 'under');
  assert.ok(Math.abs(u.pS - 0.58) < 1e-9 && Math.abs(u.fS - 0.5) < 1e-9);
  assert.equal(u.y, 1, 'the under won');
  assert.equal(u.beat, 1);
  // (a side named: the live desk's bet, whatever the larger return)
  assert.equal(pickOf(row, 'under').side, 'under');
  assert.equal(pickOf({ ...row, p: NaN }), null);
  assert.equal(pickOf({ ...row, underOdds: null }), null);
});

test('features: what the Bot knows at placement, nothing after: the result and the close change no feature; the edge, its sources, the price band, the timing, the stat and the line bucket', () => {
  const row = { f: 0.5, p: 0.58, raw: 0.62, anch: 0.6, pCur: 0.56, overOdds: -110, underOdds: -110, y: 1, q: 0.6, market: 'prop', stat: 'pts', line: 20.5, t: T0, at: T0 - 3e6, kind: 'c', trust: 0.5, home: true, mu: 24, sd: 6, im: 21 };
  const a = features(pickOf(row));
  const b = features(pickOf({ ...row, y: 0, q: 0.4 }));
  assert.deepEqual(a, b, 'the result and the close are not features');
  assert.ok(a.edge > 0 && a.kelly > 0 && a.dRaw > 0 && a.dTrust > 0 && a.dRes > 0 && a.dAnch < 0, 'the edge and its sources');
  assert.equal(a.late, 1);
  assert.equal(a['stat:pts'], 1);
  assert.equal(a['edge*stat:pts'], a.edge);
  assert.ok(a.sdEdge > 0 && a.imGap > 0, 'the edge in standard deviations and the gap to the implied mean');
  assert.equal(a.over, 1);
  assert.equal(a.home, 1);
  const u = features(pickOf({ ...row, p: 0.42, raw: 0.38, anch: 0.4, pCur: 0.44 }));
  assert.equal(u.over, 0);
  assert.ok(u.sdEdge < 0, 'the under side reads the projection against it');
  assert.equal(features(pickOf({ ...row, market: 'ml', stat: 'ml', line: null }))['market:ml'], 1);
  for (const v of Object.values(a)) assert.ok(Number.isFinite(v), 'every feature a number');
});

test('the walk-forward fit never reads a row it scores: every scored pick uses a snapshot whose newest moment is before the bet; a planted leak the earlier snapshots cannot know', () => {
  const rows = history(6000, { months: 30, seed: 3 });
  const model = fitWalk(rows, { sport: 'nba', min: 500 });
  assert.ok(model.snapshots.length >= 3, `snapshots: ${model.snapshots.length}`);
  for (const s of model.snapshots) assert.ok(s.to <= Date.parse(`${s.cutoff}-01T00:00:00Z`) + 1, 'a snapshot learned from nothing settled after its cutoff');
  let scored = 0;
  for (const x of rows) {
    const k = pickOf(x);
    const snap = snapshotFor(model, x.at);
    if (!snap) continue;
    assert.ok(snap.to <= x.at, `the snapshot for ${x.id} learned from a moment after the bet`);
    const qy = qualityOf(model, k, { tiers: null });
    assert.ok(qy && qy.pc > 0 && qy.pc < 1 && Number.isFinite(qy.q));
    scored++;
  }
  assert.ok(scored > 1000, `scored ${scored}`);
  // (the first rows, before any snapshot's newest moment: no quality, the Kelly bands and stakes as before)
  assert.equal(qualityOf(model, pickOf(rows[0]), { tiers: null }), null);
  // (a planted leak: a feature equal to the result. The features never read it (it is not a feature), so the fit on
  // the past cannot score the future off it; and the timestamp rule holds row by row: no snapshot's `to` is after
  // a row it prices)
  const leaky = history(6000, { months: 30, seed: 3, leak: 'spoiler' });
  const lm = fitWalk(leaky, { sport: 'nba', min: 500 });
  for (const s of lm.snapshots) assert.ok(!s.parts.win.spec.includes('spoiler'), 'a planted row field is never a feature');
  const late = leaky.filter((x) => x.at > lm.snapshots[0].to);
  for (const x of late.slice(0, 200)) assert.ok(snapshotFor(lm, x.at).to <= x.at);
});

test('the model is honest where the Bot has no edge: with the picks a coin at the price the calibrated chance sits at the Book, the quality under 0 and the stake the practice one', () => {
  const rows = history(8000, { months: 30, signal: 0, seed: 11, big: true });
  const model = fitConfidence(rows, { sport: 'nba', min: 500 });
  const scored = scoreRows(model, rows, { weight: 1 }).filter((r) => r.bet && r.k.y !== null);
  assert.ok(scored.length > 300);
  const mean = (f) => scored.reduce((s, r) => s + f(r), 0) / scored.length;
  // (the calibrated chance lands nearer the Book than the priced chance does, on the whole)
  assert.ok(mean((r) => Math.abs(r.pcRaw - r.k.fS)) < mean((r) => Math.abs(r.k.pS - r.k.fS)), 'the calibration gives the noise back');
  const ll = (pOf) => mean((r) => -Math.log(r.k.y ? pOf(r) : 1 - pOf(r)));
  assert.ok(ll((r) => r.pcRaw) < ll((r) => r.k.pS), 'and scores better than the priced chance held out');
  assert.equal(model.tiers.love, null, 'no tier earned');
  assert.equal(model.tiers.lock, null);
  // (the stake on a calibrated chance that clears no edge: the practice stake; one that does: the desk's Kelly)
  assert.equal(unitsOf({ pc: 0.5 }, -110, 0.08), PRACTICE_UNITS);
  assert.equal(unitsOf({ pc: 0.6 }, -110, 0.08), stakeFor(0.6 * decimal(-110) - 1, 0.08, -110));
  assert.equal(unitsOf({ pc: 0.6 }, -110, 0.08, { push: 0.5 }), stakeFor(0.5 * (0.6 * decimal(-110) - 1), 0.08, -110), 'a push share kept');
  assert.equal(unitsOf(null, -110, 0.08), null);
});

test('the blend weight moves by evidence alone: 0 to start, a step up or down only on new graded bets, the same data recorded twice the same weight', () => {
  assert.equal(BLEND_START, 0);
  const rows = history(8000, { months: 30, signal: 0, seed: 11, big: true });
  const model = fitWalk(rows, { sport: 'nba', min: 500 });
  const raw = scoreRows(model, rows, { weight: 0 });
  const b = blendFit(raw, null);
  assert.ok(b.target > 0, 'the calibration helps where the Bot has no edge');
  assert.equal(b.weight, BLEND_STEP, 'one step on the first evidence');
  assert.ok(Number.isFinite(b.through) && b.fresh >= BLEND_NEW);
  // (the same data recorded again: no new bets, the weight and its through hold, however many times)
  let again = b;
  for (let i = 0; i < 4; i++) again = blendFit(raw, again);
  assert.equal(again.weight, b.weight, 'same data twice, the same weight');
  assert.equal(again.through, b.through);
  assert.equal(again.fresh, 0);
  // (a file from before the rule: its weight is no evidence, read as BLEND_START, one step from there)
  assert.equal(blendFit(raw, { weight: 1 }).weight, BLEND_STEP);
  assert.equal(blendFit(raw, 0.75).weight, BLEND_STEP);
  // (new bets after through: under BLEND_NEW the weight holds; past it one step where they say so)
  const cut = [...raw].filter((r) => r.bet && r.k.y !== null).map((r) => r.k.row.t).sort((x, y) => x - y);
  const early = { weight: BLEND_STEP, through: cut[cut.length - 50] };
  assert.equal(blendFit(raw, early).weight, BLEND_STEP, 'fewer than BLEND_NEW new bets: held');
  assert.equal(blendFit(raw, early).through, early.through, 'and through stays, so they pile up');
  const mid = { weight: BLEND_STEP, through: cut[Math.floor(cut.length / 2)] };
  assert.ok(Math.abs(blendFit(raw, mid).weight - BLEND_STEP) <= BLEND_STEP + 1e-9, 'one step at most');
  // (the calibrated chance worse on the new bets: down a step, and 0 at the guard)
  const worse = raw.map((r) => ({ ...r, pcRaw: r.k.y ? Math.max(0.05, r.k.pS - 0.2) : Math.min(0.95, r.k.pS + 0.2) }));
  assert.equal(blendFit(worse, null).weight, 0);
  assert.equal(blendFit(worse, { weight: 0.5, through: cut[Math.floor(cut.length / 2)] }).weight, 0, 'the guard: never over 0 where it loses to the priced chance');
  // (the blend itself: 0 the priced chance, 1 the calibrated one, between on the logit scale)
  assert.equal(blendChance(0.55, 0.5, 0), 0.55);
  assert.equal(blendChance(0.55, 0.5, 1), 0.5);
  assert.ok(blendChance(0.55, 0.5, 0.5) > 0.5 && blendChance(0.55, 0.5, 0.5) < 0.55);
  // (a quality at the file's weight: with the weight 0 the calibrated chance is the priced one, q the Kelly)
  const k = pickOf(rows[rows.length - 1]);
  const q0 = qualityOf({ ...model, blend: { weight: 0 } }, k, { tiers: null });
  assert.ok(Math.abs(q0.pc - k.pS) < 1e-4 && Math.abs(q0.q - stakeKelly(k.price, k.pS)) < 1e-3);
});

test('the tiers are earned on held-out evidence alone: no gap, no tier; a clear gap, LOVE at the lowest bar that clears, LOCK only over it with its floors', () => {
  const r = rng(5);
  const mk = (n, qOf, hit) => Array.from({ length: n }, (_, i) => {
    const q = qOf(i);
    const y = r() < hit(q) ? 1 : 0;
    return { k: { row: { event: `e${i}`, id: `p${i}` }, price: -110, pS: 0.58, y, beat: r() < 0.5 + q ? 1 : 0 }, q, kelly: 0.03 + q };
  });
  // (no gap: the picks win 50% whatever their quality)
  const flat = fitTiers(mk(4000, (i) => (i % 10) / 100, () => 0.5));
  assert.equal(flat.love, null);
  assert.equal(flat.lock, null);
  assert.ok(flat.evidence.every((e) => !e.earned));
  // (a clear gap: the picks at q 0.04 and over win 70%, the rest 45%)
  const steep = fitTiers(mk(4000, (i) => (i % 10) / 100, (q) => (q >= 0.04 ? 0.7 : 0.45)));
  assert.ok(steep.love !== null && steep.love <= 0.04, `LOVE earned at ${steep.love}`);
  assert.ok(steep.evidence.filter((e) => e.tier === 'love' && e.earned).every((e) => e.n >= TIER_MIN));
  // (LOCK needs the Kelly floor and the chance floor, and a bar over LOVE's)
  const noLock = fitTiers(mk(4000, (i) => (i % 10) / 100, (q) => (q >= 0.04 ? 0.7 : 0.45)), { floors: { love: 0.02, lock: 0.5, lockChance: 0.55 } });
  assert.equal(noLock.lock, null, 'no pick clears a LOCK floor of 50%');
  if (steep.lock !== null) assert.ok(steep.lock > steep.love);
  // (the closing-line route: a tier whose picks beat the close CLV_LEAD more often than the rest beyond noise on
  // CLV_MIN opens or more, with a better mean closing-line value and a return not under the rest's; a tier with the
  // same return and the same close record earns nothing)
  const mkOpen = (n, qOf, beatP) => Array.from({ length: n }, (_, i) => { const q = qOf(i); const b = r() < beatP(q) ? 1 : 0; return { k: { row: { event: `o${i}`, id: `q${i}` }, price: -110, pS: 0.55, y: r() < 0.53 ? 1 : 0, beat: b, clv: b ? 0.02 : -0.02 }, q, kelly: 0.03 + q }; });
  const byClose = fitTiers(mkOpen(4000, (i) => (i % 10) / 100, (q) => (q >= 0.04 ? 0.75 : 0.55)));
  assert.ok(byClose.love !== null && byClose.love <= 0.04, `LOVE by the close at ${byClose.love}`);
  assert.ok(byClose.evidence.some((e) => e.tier === 'love' && e.earned && e.by === 'close'));
  assert.equal(fitTiers(mkOpen(4000, (i) => (i % 10) / 100, () => 0.6)).love, null, 'the same close record earns nothing');
  // (the caps from the tiers: none earned, a LIKE at most; LOVE earned, a LOVE at most at and over its bar, a LIKE
  // under; LOCK earned, none at and over its bar)
  assert.equal(capOf(0.1, { love: null, lock: null }), 'medium');
  assert.equal(capOf(0.1, null), null, 'no tiers (an older file): no cap');
  assert.equal(capOf(0.01, { love: 0.02, lock: null }), 'medium');
  assert.equal(capOf(0.03, { love: 0.02, lock: null }), 'high');
  assert.equal(capOf(0.06, { love: 0.02, lock: 0.05 }), null);
  assert.equal(capOf(NaN, { love: 0.02, lock: 0.05 }), 'medium');
});

test('the desk reads the cap: levelOf and capOf hold a bet to its conf.cap, the Kelly bands stay as floors (never a LOVE under 2%), a bet without one keeps its band', () => {
  assert.deepEqual(BANDS, { lock: 0.05, lockChance: 0.55, high: 0.02, medium: 0 });
  const b = (conf, more = {}) => ({ intent: 'edge', ev: 0.05, p: 0.6, ...(conf ? { conf } : {}), ...more });
  assert.equal(levelOf(b(null), 0.08, 0.6), 'lock');
  assert.equal(levelOf(b({ cap: 'medium', q: 0.08 }), 0.08, 0.6), 'medium');
  assert.equal(levelOf(b({ cap: 'high', q: 0.08 }), 0.08, 0.6), 'high');
  assert.equal(levelOf(b({ cap: null, q: 0.08 }), 0.08, 0.6), 'lock');
  // (the floor: a huge quality never lifts a 1% Kelly to a LOVE)
  assert.equal(levelOf(b({ cap: null, q: 0.2 }), 0.01, 0.6), 'medium');
  // (an edge at the practice stake stays a LIKE; a tracked row a PASS)
  assert.equal(levelOf(b({ cap: null, q: 0.08 }, { practice: 'gate' }), 0.08, 0.6), 'medium');
  assert.equal(levelOf({ intent: 'track', ev: -0.01, p: 0.5, conf: { cap: null, q: 0.1 } }, 0.01, 0.5), 'low');
  // (capOf is levelOf's cap, the lower of a rule's and the confidence layer's)
  for (const conf of [null, { cap: 'medium' }, { cap: 'high' }, { cap: null }]) for (const m of [{}, { practice: 'gate' }, { topN: { rank: 1 } }, { researchBet: { earned: true } }]) for (const [k, p] of [[0.01, 0.5], [0.03, 0.52], [0.08, 0.6]]) {
    const x = b(conf, { p, ...m });
    assert.equal(levelOf(x, k, p), capBand(edgeLevel(k, p), betCapOf(x)), JSON.stringify({ conf, m, k }));
  }
  assert.equal(betCapOf(b({ cap: 'high' }, { practice: 'gate' })), 'medium');
  assert.equal(betCapOf(b({ cap: 'high' })), 'high');
  assert.equal(betCapOf(b(null)), null);
});

test('the board carries each side\'s quality and the tiers\' cap (D52 beside D46): a LIKE at most with no tier earned, its why on the side; no model, no q', () => {
  const rows = history(8000, { months: 30, signal: 0, seed: 11, big: true });
  const model = fitConfidence(rows, { sport: 'nba', min: 500 });
  model.sport = 'nba';
  assert.equal(model.tiers.love, null);
  const now = Date.parse('2027-01-01T00:00:00Z');
  const ml = [{ market: 'ml', sides: [{ side: 'home', odds: -110, model: 0.6, fair: 0.5 }, { side: 'away', odds: -110, model: 0.4, fair: 0.5 }] }];
  const ctx = { sport: 'nba', t: now + 36e5, at: now, hours: 1 };
  const free = boardMarkets(ml, () => 1, null, ctx, { gate: { on: true } }).ml[0];
  assert.equal(free.b, 'lock');
  assert.equal(free.q, undefined);
  const held = boardMarkets(ml, () => 1, null, ctx, { gate: { on: true }, confidence: model }).ml[0];
  assert.equal(held.cap, 'medium');
  assert.equal(held.b, 'medium');
  assert.ok(Number.isFinite(held.q));
  assert.match(held.cr, /confidence layer/);
  // (a gate's cap and the tiers' together: the lower, the gate's why first)
  const both = boardMarkets(ml, () => 1, null, ctx, { gate: { on: false, why: 'CLV under 0' }, confidence: model }).ml[0];
  assert.equal(both.cap, 'medium');
  assert.match(both.cr, /CLV/);
  const x = { prop: { athlete: { name: 'A', id: 1, team: 2 }, stat: { key: 'pts', label: 'Pts' }, line: 20.5, prices: { over: -110, under: -110 } }, sides: [{ side: 'over', p: 0.58, ev: 0.107 }, { side: 'under', p: 0.42, ev: -0.2 }], side: 'over', fair: 0.5, model: 0.6, priced: true, trust: 0.5, projection: { mean: 24, r: 20 }, home: true };
  assert.equal(boardProp(x, 'now').b[0], 'lock');
  const px = boardProp(x, 'now', { confidence: model, start: new Date(now + 36e5).toISOString() });
  assert.deepEqual(px.cap, ['medium', 'medium']);
  assert.equal(px.b[0], 'medium');
  assert.ok(Array.isArray(px.q) && Number.isFinite(px.q[0]));
  assert.match(px.cr, /confidence layer/);
  // (a tier earned: the cap opens to it)
  const open = { ...model, tiers: { love: -1, lock: null } };
  assert.equal(boardProp(x, 'now', { confidence: open, start: new Date(now + 36e5).toISOString() }).b[0], 'high');
});

test('the replayed record (D47) holds its bands and stakes to the layer too: with no tier earned every replayed bet is a LIKE, its stake never over the Kelly’s or under the practice stake', async () => {
  const RR = await import('../libs/ranker/scripts/model/replay-record.mjs');
  const desk = await import('../libs/ranker/scripts/model/desk.mjs');
  const picks = await import('../libs/ranker/scripts/model/picks.mjs');
  const conf = await import('../libs/ranker/scripts/model/confidence.mjs');
  const rows = history(8000, { months: 30, signal: 0, seed: 11, big: true });
  const model = fitConfidence(rows, { sport: 'nba', min: 500 });
  const V = { desk, picks, confidence: conf, leagues: { TIMING: { nba: { lines: 26, props: 26, lastChance: 3 } } } };
  const split = { open: rows.filter((x) => x.kind === 'o'), close: rows.filter((x) => x.kind === 'c') };
  const plain = RR.replayRecord(V, 'nba', split, { evScale: 0.08 });
  const held = RR.replayRecord(V, 'nba', split, { evScale: 0.08, confidence: model });
  // (the record is a summary: by band, the whole and the stakes)
  const confident = (r) => (r.byBand.high?.bets ?? 0) + (r.byBand.lock?.bets ?? 0);
  assert.ok(plain.n.bets > 100 && plain.n.bets === held.n.bets, 'the same bets placed');
  assert.ok(confident(plain) > 0, 'the Kelly bands give LOVEs and LOCKs');
  assert.ok(confident(held) < confident(plain) / 4, `held to a LIKE wherever the model scores the row: ${confident(held)} of ${confident(plain)} LOVE/LOCK left (the rows before the first snapshot)`);
  assert.ok(held.overall.staked <= plain.overall.staked + 1e-9 && held.overall.staked >= PRACTICE_UNITS * held.n.bets, 'the stakes never over the rules or under the practice stake');
});

test('the standardized features are held to Z_CAP either way, so a rare value cannot swing a chance by whole logits', () => {
  assert.equal(Z_CAP, 4);
  const rows = history(3000, { months: 30, seed: 9 });
  const model = fitWalk(rows, { sport: 'nba', min: 500 });
  const wild = { ...rows[rows.length - 1], raw: 0.99, p: 0.9, pCur: 0.9, mu: 60, sd: 1, im: 20 };
  const qy = qualityOf(model, pickOf(wild), { tiers: null, weight: 1 });
  assert.ok(qy && Math.abs(Math.log(qy.pcRaw / (1 - qy.pcRaw)) - Math.log(0.9 / 0.1)) < 3, 'a wild row moves the chance by less than three logits');
});
