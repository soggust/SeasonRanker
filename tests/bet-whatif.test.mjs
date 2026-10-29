// The K-score popover's what-if price (bet-why.ts stepPrice, priceAt, flipsAt, whatIfOf; the owner, 2026-10-19):
// the stepper walks the books' ladder across even (−110 → −105 → +100 → +105), the numbers at a price are the
// bettor's own (desk.mjs stakeKelly and stakeFor, picks.mjs kellyOf, level and edgeLevel), the bot's picks files
// read back to their own Kelly, band, stake and return at their own price, and the flip points are the exact
// whole-cent prices where the band changes. Made-up bets and the picks files on disk, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';
import { edgeLevel, kellyOf, level } from '../libs/ranker/scripts/model/picks.mjs';
import { PRACTICE_UNITS, decimal, isSuspect, stakeFor } from '../libs/ranker/scripts/model/desk.mjs';

const desk = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'book-entry.ts'), data: {} });
const close = (a, b, what, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} vs ${b}`);
const base = (p, odds, over = {}) => ({ odds, p, bet: true, cap: null, unitsCap: null, win: 1, blend: null, ...over });

test('the stepper: the books’ ladder, across ±100 both ways, off-ladder prices to the next rung', () => {
  const up = [-110];
  for (let i = 0; i < 4; i++) up.push(desk.stepPrice(up.at(-1), 1));
  assert.deepEqual(up, [-110, -105, 100, 105, 110]);
  const down = [110];
  for (let i = 0; i < 4; i++) down.push(desk.stepPrice(down.at(-1), -1));
  assert.deepEqual(down, [110, 105, 100, -105, -110]);
  assert.equal(desk.stepPrice(-118, 1), -115);
  assert.equal(desk.stepPrice(-118, -1), -120);
  assert.equal(desk.stepPrice(-100, 1), 105, '-100 is +100');
  assert.equal(desk.stepPrice(-100, -1), -105);
  assert.equal(desk.stepPrice(102, -1), 100);
  assert.equal(desk.stepPrice(-195, -1), -200);
  assert.equal(desk.stepPrice(-200, -1), -210, 'by 10 past 200');
  assert.equal(desk.stepPrice(200, 1), 210);
  assert.equal(desk.stepPrice(490, 1), 500);
  assert.equal(desk.stepPrice(500, 1), 525, 'by 25 past 500');
  assert.equal(desk.stepPrice(10000, 1), 10000, 'the end holds');
  // (each step pays more, up; less, down)
  for (const a of [-1500, -260, -118, -101, 100, 101, 145, 333, 2000]) {
    assert.ok(decimal(desk.stepPrice(a, 1)) > decimal(a), `${a} up`);
    assert.ok(decimal(desk.stepPrice(a, -1)) < decimal(a), `${a} down`);
  }
  assert.equal(desk.nextCent(-101, 1), 100);
  assert.equal(desk.nextCent(100, -1), -101);
  assert.equal(desk.nextCent(-120, 1), -119);
});

test('priceAt: the bettor’s Kelly, band, stake and return at any price, the chance held', () => {
  for (const p of [0.31, 0.45, 0.5, 0.52, 0.535, 0.56, 0.62, 0.74]) {
    for (const odds of [-400, -260, -150, -118, -110, -105, 100, 105, 120, 150, 220, 300]) {
      const ev = p * decimal(odds) - 1;
      for (const bet of [true, false]) {
        const at = desk.priceAt(base(p, odds, { bet }), odds);
        const k = kellyOf(odds, p);
        close(at.kelly, k, `${p} ${odds} kelly`, 1e-12);
        close(at.ev, ev, `${p} ${odds} ev`, 1e-12);
        close(at.breakEven, 1 / decimal(odds), 'break-even', 1e-12);
        close(at.edge, p - 1 / decimal(odds), 'edge', 1e-12);
        const want = isSuspect(p, ev) && ['lock', 'high'].includes(bet ? edgeLevel(k, p) : level(k, p)) ? 'medium' : bet ? edgeLevel(k, p) : level(k, p);
        assert.equal(at.level, want, `${p} ${odds} ${bet} band`);
        assert.equal(at.units, want === 'low' ? null : isSuspect(p, ev) ? PRACTICE_UNITS : stakeFor(ev, 0.08, odds), `${p} ${odds} stake`);
      }
    }
  }
  // (the rule's caps held: a LIKE at most, a guard's stake)
  const capped = desk.priceAt(base(0.6, 120, { cap: 'medium', unitsCap: 0.5 }), 120);
  assert.equal(capped.level, 'medium');
  assert.equal(capped.units, 0.5);
});

test('the picks files: every pick reads back its own Kelly, band, stake and return at its own price', () => {
  let n = 0;
  for (const sport of ['nfl', 'nba', 'nhl', 'mlb', 'mma']) {
    const file = path.join(import.meta.dirname, '..', 'apps', sport, 'src', 'StaticData', 'model', 'picks.json');
    if (!fs.existsSync(file)) continue;
    const picks = JSON.parse(fs.readFileSync(file, 'utf8')).picks ?? [];
    for (const pick of picks) {
      const row = desk.rowOf(sport, pick, false);
      const wi = desk.whatIfOf(row);
      if (!wi) continue;
      const at = desk.priceAt(wi, row.price);
      // (the files carry p, ev and the Kelly rounded to four places, so a read-back from the rounded chance can sit a
      // little over 1e-4 off the stored return: desk run 39280205115 failed its data check on 0.00267 vs 0.0028)
      close(at.kelly, row.sureness, `${sport} ${row.pick} kelly`, 5e-4);
      assert.equal(at.level, row.confidence, `${sport} ${row.pick} band`);
      // (a stake where the band is a bet: a placed bet priced again under the edge's reach reads PASS on the page, no stake)
      if (Number.isFinite(row.units) && at.level !== 'low') assert.equal(at.units, row.units, `${sport} ${row.pick} stake`);
      if (Number.isFinite(row.ev) && !at.suspect) close(at.ev, row.ev, `${sport} ${row.pick} ev`, 5e-4);
      n++;
    }
  }
  // (a sport's file may be empty between slates: a made-up row the same way, its push held)
  const row = { id: 1, pick: 'DAL -3', market: 'spread', confidence: 'medium', sureness: kellyOf(-110, 0.535), price: -110, p: 0.535, ev: 0.95 * (0.535 * decimal(-110) - 1), units: stakeFor(0.95 * (0.535 * decimal(-110) - 1), 0.08, -110), edge: true, model: 0.6, fair: 0.5, why: { fair: 0.5, trust: 0.5, lean: 0, fitted: true, from: 'book' } };
  const wi = desk.whatIfOf(row);
  close(wi.win, 0.95, 'the push held', 1e-9);
  const at = desk.priceAt(wi, -110);
  close(at.ev, row.ev, 'its return', 1e-12);
  assert.equal(at.units, row.units);
  assert.equal(at.level, 'medium');
  const cap = desk.whatIfCaption(wi);
  assert.equal(cap.text, "The Bot's chance held at 53.5% · what-if only, nothing saved");
  assert.match(cap.title, /^The Bot's own 60.0% blended with the Book's no-vig 50.0% at trust 0.50/);
  assert.ok(n >= 0);
});

// (desk run 39294305911: the MMA early band (D37) priced Josh Hokit +205 at a trusted 37.86%, its Kelly a LOVE, its
// return +15.5%: under D23's old bar (an ev past 0.15) the desk held it to a LIKE at the practice stake. The owner,
// 2026-10-19: a 5.1-point edge on a long dog is a real edge, not a broken row (D23 reads points and SDs over the
// break-even now, D24's scale). A file the old desk capped (picks.json cap) still reads back its LIKE at the stake it
// was given, on the row and the what-if; the same row with no cap reads its Kelly's band on both)
test('an MMA early-band pick reads back the desk’s band: a file’s cap held, a +205 dog at a 5-point edge not suspect', () => {
  const k = kellyOf(205, 0.3786);
  assert.ok(['high', 'lock'].includes(edgeLevel(k, 0.3786)), 'its Kelly alone a LOVE');
  assert.equal(isSuspect(0.3786, 0.1547), false, 'a 5.1-point edge at +205 is not suspect');
  const pick = (over = {}) => ({ id: 'mma-x', sport: 'mma', score: k, chance: 38, level: 'medium', cap: 'medium', edge: true, kind: 'moneyline', market: 'Moneyline', pick: 'Josh Hokit', side: 'away', line: null, odds: 205, book: 'DraftKings', start: '2026-11-15T03:00:00Z', matchup: 'Josh Hokit @ Ciryl Gane', teams: [], where: null, reason: '', model: 0.3957, fair: 0.3271, p: 0.3786, ev: 0.1547, units: PRACTICE_UNITS, why: { fair: 0.3271, trust: 0.75, lean: 0, fitted: true, from: 'book' }, ...over });
  const capped = desk.rowOf('mma', pick(), false);
  assert.equal(capped.confidence, 'medium', 'the row: the file’s LIKE');
  const at = desk.priceAt(desk.whatIfOf(capped), capped.price);
  assert.equal(at.level, 'medium', 'the what-if reads back its band');
  assert.equal(at.units, capped.units, 'and the stake it was given');
  const free = desk.rowOf('mma', pick({ cap: undefined, level: edgeLevel(k, 0.3786), units: stakeFor(0.1547, 0.08, 205) }), false);
  assert.equal(free.confidence, edgeLevel(k, 0.3786), 'uncapped: its Kelly’s band');
  assert.equal(desk.priceAt(desk.whatIfOf(free), 205).level, free.confidence);
  // (a broken row, McCaffrey's: about 20 points over the break-even at -110, a LIKE at the practice stake)
  const mc = desk.priceAt({ odds: -110, p: 0.724, bet: true, cap: null, unitsCap: null, win: 1, blend: null }, -110);
  assert.ok(mc.suspect && mc.level === 'medium' && mc.units === PRACTICE_UNITS);
  // (an early-band LOVE the desk doesn't cap (Amanda Nunes +164 at 40.21%, untapered) stays a LOVE on the row and the what-if)
  const kn = kellyOf(164, 0.4021);
  const ev = 0.4021 * decimal(164) - 1;
  const love = desk.rowOf('mma', pick({ pick: 'Amanda Nunes', odds: 164, p: 0.4021, score: kn, level: edgeLevel(kn, 0.4021), cap: undefined, ev, units: stakeFor(ev, 0.08, 164) }), false);
  assert.equal(love.confidence, 'high');
  assert.equal(desk.priceAt(desk.whatIfOf(love), 164).level, 'high');
});

// (the confidence layer, D52: every placed bet carries the layer's cap, 'medium' while no tier is earned. A placed
// LIKE so capped reads back its own Kelly stake at its own price, not the practice stake a side's ceiling sets, and
// stays a LIKE at a better price where its Kelly alone would read LOVE)
test('a placed bet the confidence layer caps (D52) reads back its own stake, held to a LIKE at every price', () => {
  const p = 0.535;
  const ev = p * decimal(-110) - 1;
  const file = { id: 'nfl-x', sport: 'nfl', score: kellyOf(-110, p), chance: 53.5, level: 'medium', cap: 'medium', conf: { pc: p, q: kellyOf(-110, p), cap: 'medium' }, edge: true, kind: 'spread', market: 'Spread', pick: 'DAL -3', side: 'away', line: -3, odds: -110, book: 'DraftKings', start: '2026-11-15T18:00:00Z', matchup: 'DAL @ NYG', teams: [], where: null, reason: '', model: 0.56, fair: 0.5, p, ev, units: stakeFor(ev, 0.08, -110), why: { fair: 0.5, trust: 0.5, lean: 0, fitted: true, from: 'book' } };
  const row = desk.rowOf('nfl', file, false);
  assert.equal(row.confidence, 'medium');
  const wi = desk.whatIfOf(row);
  const at = desk.priceAt(wi, -110);
  assert.equal(at.level, 'medium');
  assert.equal(at.units, row.units, 'its own stake, not the practice stake');
  assert.ok(row.units > PRACTICE_UNITS);
  assert.ok(['high', 'lock'].includes(edgeLevel(kellyOf(105, p), p)), 'its Kelly alone a LOVE at +105');
  assert.equal(desk.priceAt(wi, 105).level, 'medium', 'held to a LIKE at a better price');
});

// (desk run 40946891346's failed data check, 2026-10-29: Arturs Silovs Under 24.5 Saves, an NHL trial LOVE (D73) staked the
// trial's fixed 2.5u where the return's formula reads 1u. The trial's stakes ride on the pick (picks.json trialUnits, D101):
// the what-if reads a LOVE at the trial's stake and a LIKE at its step, the band still the Kelly range's)
test('a two-band trial pick (D73) reads back the trial’s stakes: a LOVE’s fixed stake, a LIKE’s step, at every price', () => {
  const p = 0.53;
  const odds = -110;
  const k = kellyOf(odds, p);
  const ev = p * decimal(odds) - 1;
  assert.ok(stakeFor(ev, 0.08, odds) < 2.5, 'the formula would stake less');
  const file = { id: 'nhl-x', sport: 'nhl', score: k, chance: 53, level: 'high', tier: 'high', tierKelly: [0.01, null], trial: true, trialUnits: { high: 2.5, medium: 0.5 }, edge: true, kind: 'player', market: 'Saves', pick: 'Arturs Silovs Under 24.5 Saves', side: 'under', line: 24.5, odds, book: 'DraftKings', start: '2026-10-30T00:00:00Z', matchup: 'PIT @ NYR', teams: [], where: null, reason: '', model: 0.55, fair: 0.5, p, ev, units: 2.5, why: { fair: 0.5, trust: 0.6, lean: 0, fitted: true, from: 'book' } };
  const row = desk.rowOf('nhl', file, false);
  assert.equal(row.confidence, 'high');
  const wi = desk.whatIfOf(row);
  assert.deepEqual(wi.tierUnits, { high: 2.5, medium: 0.5 });
  const at = desk.priceAt(wi, odds);
  assert.equal(at.level, 'high');
  assert.equal(at.units, 2.5, 'the trial’s LOVE stake, not the formula’s');
  // (a worse price, the Kelly under the trial's floor: a LIKE at the step's stake)
  const { worse } = desk.flipsAt(wi, odds);
  assert.equal(worse.level, 'medium');
  assert.equal(desk.priceAt(wi, desk.nextCent(worse.odds, -1)).units, 0.5);
  // (a LIKE trial pick with the step off reads the formula's stake, as before)
  const like = desk.rowOf('nhl', { ...file, level: 'medium', tier: 'medium', trialUnits: { high: 2.5, medium: null }, units: stakeFor(ev, 0.08, odds) }, false);
  assert.equal(desk.priceAt(desk.whatIfOf(like), odds).units, stakeFor(ev, 0.08, odds));
  // (a file from before D101, no trialUnits: a stake under the formula's still reads back as its ceiling)
  const old = desk.rowOf('nhl', { ...file, level: 'medium', tier: 'medium', trialUnits: undefined, units: 0.5 }, false);
  assert.equal(desk.priceAt(desk.whatIfOf(old), odds).units, 0.5);
});

test('flipsAt: the exact whole-cent prices where the band changes, either way', () => {
  for (const [p, odds] of [[0.535, -110], [0.56, -118], [0.62, -150], [0.45, 150], [0.58, 105], [0.3, 260]]) {
    const b = base(p, odds);
    const here = desk.priceAt(b, odds).level;
    const { better, worse } = desk.flipsAt(b, odds);
    if (better) {
      assert.notEqual(better.level, here);
      assert.equal(desk.priceAt(b, better.odds).level, better.level, 'the flip price is in the new band');
      assert.equal(desk.priceAt(b, desk.nextCent(better.odds, -1)).level, here, 'a cent worse is still this band');
      const word = { lock: 'LOCK', high: 'LOVE', medium: 'LIKE', low: 'PASS' }[better.level];
      assert.match(better.text, new RegExp(`^${word} from [+−]\\d+( or better| \\(the sanity bar: an edge past 12 points or 0\\.3 SDs\\))$`));
    }
    if (worse) {
      assert.notEqual(worse.level, here);
      assert.equal(desk.priceAt(b, worse.odds).level, here, 'the last price of this band');
      assert.equal(desk.priceAt(b, desk.nextCent(worse.odds, -1)).level, worse.level, 'a cent past it the other band');
      assert.match(worse.text, / past [+−]\d+$/);
    }
  }
  // (worked by hand: 53.5% at -110, (0.535 − 110/210) × 2.1 = 0.0235, a LOVE; never a LOCK under a 55% chance)
  const b = base(0.535, -110);
  assert.equal(desk.priceAt(b, -110).level, 'high');
  const { better, worse } = desk.flipsAt(b, -110);
  // (never a LOCK under a 55% chance: up the prices it stays a LOVE till the sanity bar, an edge past 12 points over
  // the break-even (0.535 − 0.12 = 0.415: d past 2.4096, +140.96; +141 the first whole cent), holds it to a LIKE)
  assert.equal(better.text, 'LIKE from +141 (the sanity bar: an edge past 12 points or 0.3 SDs)');
  // (LOVE needs (0.535 − 1/d) × 2.1 ≥ 0.02: 1/d ≤ 0.52548, d ≥ 1.90304, -110.7: the last LOVE −110, LIKE past it)
  assert.equal(worse.odds, -110);
  assert.equal(worse.text, 'LIKE past −110');
  // (PASS: the break-even at 53.5%, −115.05: −115 the last LIKE)
  assert.equal(desk.flipsAt(b, -113).worse.text, 'PASS past −115');
  assert.equal(desk.flipsAt(b, -113).better.text, 'LOVE from −110 or better');
  // (the one line: this band's run first, then either side; the sanity bar's LIKE again, capped)
  assert.equal(desk.flipLine(b, -110).text, 'LOVE from −110 to +140 · LIKE past −110 · LIKE again from +141 (capped)');
  assert.match(desk.flipLine(b, -110).title, /Capped: past a 12-point edge over the break-even/);
  assert.equal(desk.flipLine(b, -113).text, 'LIKE from −115 to −111 · PASS past −115 · LOVE from −110');
  assert.equal(desk.flipLine(base(0.535, -110, { cap: 'medium' }), -110).text, 'LIKE at every price', 'a held LIKE never flips');

});

test('the popover kept lean: no neighbor comparison, no Kelly definition paragraph; the what-if stepper in it', () => {
  const dir = path.join(import.meta.dirname, '..', 'libs', 'ranker', 'src', 'engine', 'book');
  const html = fs.readFileSync(path.join(dir, 'book-page.component.html'), 'utf8');
  const ts = fs.readFileSync(path.join(dir, 'book-page.component.ts'), 'utf8');
  assert.doesNotMatch(html, /Kelly: how much of a bankroll/);
  assert.doesNotMatch(html, /The score is its chance to win, in points/);
  assert.doesNotMatch(ts, /It edges \$\{/);
  assert.doesNotMatch(ts, /sits over it by/);
  assert.match(html, /class="why-whatif"/);
  // (the lean's 'bot 57.1%' in its hover, not its label: no label cut off)
  assert.match(html, /part.value && part.key !== 'lean'/);
  assert.doesNotMatch(html, /q.held }}}/);
  // (the stepper's clicks kept from the outside click that shuts the popover; no reset link, the owner's,
  // 2026-10-19: the Bot's own price shows beside the stepper)
  assert.match(html, /\(click\)="nudgePrice\(-1, \$event\)"/);
  assert.match(ts, /nudgePrice\(dir: 1 \| -1, event\?: Event\): void \{\s+event\?\.stopPropagation\(\);/);
  assert.doesNotMatch(html, /resetPrice|wi-reset/);
});
