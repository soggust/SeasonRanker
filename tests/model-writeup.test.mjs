// The plain write-ups (libs/ranker/scripts/model/writeup.mjs): every pick's reason and risk line written by
// rule from its own numbers. The four sample bets' texts as they read, passing the same grounding checks the
// AI's text must; every bet in every ledger written within its lengths, never printing a missing value, the
// same whatever happens to the bet after it's placed (seen, its close, its grading, its publishing) and still
// whole with any optional field gone (the live data's grounding problems and drivers only reported, never
// failed: npm test gates the hourly desk's commit, and a new field must never stop it); the drivers named by their applied effect, their product the
// projection; the validator's rejections; the text frozen per bet in writeups.json (picks.mjs buildPicks)
// till its facts change, and the AI's analysis applied in its place only for the facts it was written from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { applyWriteups, driversOf, factsOf, firstCtxKeyOf, fmt, hashOf, PLAIN_V, plainFor, plainOf, propParamsOf, sibOf, validate } from '../libs/ranker/scripts/model/writeup.mjs';
import { buildPicks, legacyReasonOf } from '../libs/ranker/scripts/model/picks.mjs';
import { staticDir } from './support/engine.mjs';

const SAMPLES = JSON.parse(fs.readFileSync(new URL('./support/writeup-samples.json', import.meta.url), 'utf8'));
const sample = (id) => SAMPLES.find((s) => s.bet.id.startsWith(id));
// (the state the spec's samples were read against: the trust, the kept goalie term, the fits' back-tests)
const STATE = {
  trust: { spread: { trust: 0.3, fitted: true, n: 15 } },
  context: { terms: [{ key: 'goalie', label: 'Goalie edge', on: 'margin', size: 0.54, kept: true, unit: 'per goal a game' }] },
  props: {
    types: [
      { key: 'recYds', params: { w: 0, a: 0.5, b: 0, scale: 1.166 }, check: { n: 900, mae: 23.9, maeBase: 25.1, bias: 5.8, calibration: [] }, allPlayersBias: 6.4 },
      { key: 'saves', params: { w: 0.2, a: 1, b: 0.5, scale: 1.001 }, check: { n: 852, mae: 5.04, maeBase: 5.58, bias: 0.5, calibration: [{ band: 0.3, n: 104, said: 0.357, was: 0.356 }] }, allPlayersBias: 0.56 },
      { key: 'k', params: { w: 0, a: 0.5, b: 0, scale: 0.986 }, check: { n: 700, mae: 1.8, maeBase: 1.9, bias: 0.1, calibration: [{ band: 0.6, n: 89, said: 0.642, was: 0.618 }] }, allPlayersBias: 0.2 },
    ],
  },
};
// (the NHL spreads' record the MIN sample cites: 15 graded, 10-5, down 1.3 units)
const NHL_LEDGER = { bets: [...Array.from({ length: 10 }, (_, i) => ({ id: `w${i}`, market: 'spread', side: 'home', status: 'won', profit: 0.47 })), ...Array.from({ length: 5 }, (_, i) => ({ id: `l${i}`, market: 'spread', side: 'away', status: 'lost', profit: -1.2 }))] };
const sheetOf = (id, extra = {}) => {
  const { bet, sib, game } = sample(id);
  return factsOf(bet, { game, sib, state: STATE, ...extra });
};

test('the four samples: their plain reason and risk, word for word, each passing the grounding checks', () => {
  const want = {
    '401872990:prop:recYds': {
      reason: "Over 8.5 receiving yards for Cole Kmet: the model projects 19.5, 11 over the line. His blended rate is 17.9 a game (4 games this season, 18 last season); the fit scaling every player's receiving yards up (+16.6% here) pushes it up to the projection. We make the over 64%; at -115 it needs 53%, and DraftKings' no-vig price says 51%, so the edge is the projection, at half weight while Rec Yds props are untested.",
      risk: "The model is 26.5 points from the market, past the 15-point gap the desk now bets; a gap that size is more often news it hasn't seen than an edge.",
    },
    '401892478:prop:saves': {
      reason: "Under 23.5 saves for Mackenzie Blackwood: the model projects 20.9, 2.6 under the line. His blended rate is 23 a game (3 starts this season, 37 last season), 22.7 over his last 5; the game script, with TOR expected to score 2.4 (-5% here), brings it down to the projection. We make the under 59%; at -105 it needs 51%, and DraftKings' no-vig price says 48%, so the edge is the projection, at half weight while Saves props are untested.",
      risk: "The model is 21.6 points from the market, past the 15-point gap the desk now bets; a gap that size is more often news it hasn't seen than an edge.",
    },
    '401891805:spread': {
      reason: "MIN +1.5: the model has MIN winning 3.4 to 2.9, so it loses only if FLA wins by 2 or more. We make MIN 70.3% to cover; at -217 it needs 68.5%, and DraftKings' no-vig price says 65.7%, so the edge is the model's read of the game, with the desk leaning only part of the way toward it. Jesper Wallstedt vs Jacob Markstrom in net, a term the model counts. The situational factors barely move it.",
      risk: "The model is 13.2 points from the market, past the 12-point gap the desk now bets; a gap that size is more often news it hasn't seen than an edge.",
    },
    '401907994:prop:k': {
      reason: "Over 4.5 strikeouts for Sean Burke: the model projects 5.2, 0.7 over the line. His blended rate is 5.6 a game (24 starts this season, 21 last season); CLE's lineup, which strikes out less than usual (-5.6% here), brings it down to the projection. We make the over 54.1%; at -101 it needs 50.2%, and DraftKings' no-vig price says 47.4%, so the edge is the projection, at half weight while Strikeouts props are untested.",
      risk: "When this was priced, the game's own lines were held (a starting pitcher not announced).",
    },
  };
  for (const [id, text] of Object.entries(want)) {
    const sheet = sheetOf(id);
    assert.deepEqual(plainOf(sheet), text, id);
    assert.deepEqual(validate(`${text.reason} ${text.risk}`, sheet), [], id);
  }
});

test('the samples\' drivers: each by its applied effect (opp^a, script^b, the scale), their product the projection', () => {
  const kmet = sheetOf('401872990:prop:recYds');
  assert.deepEqual(kmet.drivers.map((d) => [d.name, d.appliedPct]), [['scale', 16.6], ['opponent', -6.7]]);
  assert.match(kmet.drivers[1].what, /^GB's defense against tight ends$/);
  // (measured, given no weight: his recent form, the game script, his role, the funnel)
  assert.deepEqual(kmet.notWeighed.map((x) => x.name), ['recent', 'script', 'role', 'funnel']);
  const blackwood = sheetOf('401892478:prop:saves');
  assert.deepEqual(blackwood.drivers.map((d) => [d.name, d.appliedPct]), [['opponent', -4.5], ['script', -5]]);
  assert.equal(blackwood.lineBeforeBet.againstBet, true);
  const burke = sheetOf('401907994:prop:k');
  assert.deepEqual(burke.drivers.map((d) => [d.name, d.appliedPct]), [['scale', -1.4], ['opponent', -5.6]]);
  for (const id of ['401872990', '401892478', '401907994']) assert.ok(driversOf(sample(id).bet).ok, id);
  // (params that don't give the projection back: no driver named, and never "nothing moves it": only the gap)
  const off = { ...sample('401872990').bet, projection: { ...sample('401872990').bet.projection, applied: { scale: 1, w: 0, a: 0.5, b: 0 } } };
  const sheet = factsOf(off, { game: sample('401872990').game, sib: sample('401872990').sib });
  assert.equal(sheet.drivers, undefined);
  assert.equal(sheet.driversOk, false);
  const said = plainOf(sheet).reason;
  assert.doesNotMatch(said, /nothing in the matchup/);
  assert.match(said, /His blended rate is 17\.9 a game .*; the matchup and the game's context take it to 19\.5\./);
  // (the steps giving it back, each under half a percent: then nothing moves it)
  const flat = { ...off, projection: { ...off.projection, mean: off.projection.rate, opp: 1, script: 1, ctx: undefined, ctxF: 1, funnelF: 1, paceF: 1, tgtF: 1, vacF: 1, applied: { scale: 1, w: 0, a: 0.5, b: 0 } } };
  const flatSheet = factsOf(flat, { game: sample('401872990').game, sib: sample('401872990').sib });
  assert.equal(flatSheet.driversOk, true);
  assert.match(plainOf(flatSheet).reason, /nothing in the matchup moves it much/);
});

test("a prop priced before its fit was kept (no applied), the state's refit no longer giving it back: its rate unblended, no blend's weight claimed, the gap said", () => {
  const { bet, sib, game } = sample('401872990');
  const { applied: _gone, ...projection } = bet.projection;
  const old = { ...bet, projection: { ...projection, recent: 30 } };
  // (today's refit: a weight on recent form and a scale the bet wasn't priced with)
  const state = { ...STATE, props: { types: [{ key: 'recYds', params: { w: 0.4, a: 0.5, b: 0, scale: 1.02 } }] } };
  const params = propParamsOf(state, 'recYds');
  assert.equal(driversOf(old, params).ok, false);
  const sheet = factsOf(old, { game, sib, state, params });
  assert.equal(sheet.projection.blendedRate, undefined);
  assert.equal(sheet.projection.recentWeightPct, undefined);
  assert.ok(!(sheet.notWeighed ?? []).some((x) => x.name === 'recent' || x.name === 'script'));
  const { reason, risk } = plainOf(sheet);
  assert.ok(reason.includes(`His rate is ${fmt.num(bet.projection.rate)} a game`), reason);
  assert.match(reason, /the matchup and the game's context take it to 19\.5\./);
  assert.doesNotMatch(reason, /blended|nothing in the matchup|over his last 5/);
  assert.deepEqual(validate(`${reason} ${risk}`, sheet), []);
  // (plainFor the same, written with the refit's params and frozen with them)
  const writeups = { items: {} };
  const { entry } = plainFor(old, { game, sib, state, writeups });
  assert.equal(entry.plain.reason, reason);
  assert.equal(entry.plain.v, PLAIN_V);
  assert.deepEqual(entry.plain.params, params);
});

test("propParamsOf: the state's plain c is the type's first context term's (as props.mjs's applied)", () => {
  const state = { props: { types: [{ key: 'passYds', params: { K: 4, w: 0, a: 0.5, b: 0, c: -0.15, scale: 0.999, cal: [0.05, 0.95] } }] } };
  assert.deepEqual(propParamsOf(state, 'passYds', 'wind'), { w: 0, a: 0.5, b: 0, scale: 0.999, c_wind: -0.15 });
  assert.deepEqual(propParamsOf(state, 'passYds'), { w: 0, a: 0.5, b: 0, scale: 0.999 });
  assert.equal(firstCtxKeyOf({ projection: { ctx: { wind: 12, cold: 0, precip: 0 } } }), 'wind');
  assert.equal(firstCtxKeyOf({ projection: { ctx: 1.02 } }), null);
});

test('the hooks: a bet missing its pick or its price never prints a missing value; far off the line on its wrong side, a bet on the price', () => {
  const { bet, sib, game } = sample('401891805');
  for (const v of [(({ pick: _p, ...r }) => r)(bet), (({ odds: _o, ...r }) => r)(bet), { id: 'empty' }]) {
    const { reason, risk } = plainOf(factsOf(v, { game, sib, state: STATE }));
    assert.ok(!BAD.test(reason) && !BAD.test(risk), reason);
  }
  const k = sample('401872990');
  const far = { ...k.bet, projection: { ...k.bet.projection, mean: 2, pOver: undefined } };
  assert.match(plainOf(factsOf(far, { game: k.game, sib: k.sib, state: STATE })).reason, /so the over 8\.5 is a bet on the price, not the likelier result/);
  const near = { ...k.bet, projection: { ...k.bet.projection, mean: 8.2, pOver: undefined } };
  assert.match(plainOf(factsOf(near, { game: k.game, sib: k.sib, state: STATE })).reason, /projects right around the line \(8\.2\)/);
  // (a CHECK was never bet: it would be a play on the price)
  const chk = { ...far, intent: 'check', units: 0 };
  const said = plainOf(factsOf(chk, { game: k.game, sib: k.sib, state: STATE })).reason;
  assert.match(said, /would be a play on the price/);
  assert.match(said, /The question:/);
});

test('fmt: half-up rounding (5.55 to 5.6), signed odds, whole at 100 or more', () => {
  assert.equal(fmt.num(5.55), '5.6');
  assert.equal(fmt.num(263.4), '263');
  assert.equal(fmt.odds(130), '+130');
  assert.equal(fmt.odds(-105), '-105');
  assert.equal(fmt.pct(50.249, 1), '50.2');
  assert.equal(fmt.r(-0.04, 1), 0);
});

test("the validator: places, invented names, number words, fractions and banned topics rejected; the spec's sample analyses pass", () => {
  const kmet = sheetOf('401872990:prop:recYds', { ledger: { bets: [] } });
  const base = 'Over 8.5 receiving yards for Cole Kmet: the model projects 19.5.';
  assert.deepEqual(validate(base, kmet), []);
  assert.ok(validate(`${base} Toronto has been bad.`, kmet).some((p) => /Toronto/.test(p)));
  assert.ok(validate(`${base} He torched Minnesota last year.`, kmet).some((p) => /Minnesota/.test(p)));
  assert.ok(validate(`${base} He has cleared it in seven games.`, kmet).some((p) => /number word/.test(p)));
  assert.ok(validate(`${base} He clears it two thirds of the time.`, kmet).some((p) => /number word/.test(p)));
  assert.ok(validate(`${base} An empty-net goal could matter.`, kmet).some((p) => /banned/.test(p)));
  assert.ok(validate(`${base} He averaged 42 last month.`, kmet).some((p) => /42/.test(p)));
  assert.ok(validate(`${base} His knee injury lingers.`, kmet).some((p) => /injury/.test(p)));
  assert.ok(validate('Under 8.5 receiving yards for Cole Kmet.', kmet).some((p) => /other side|not said together/.test(p)));
  // (a numeral paired to the wrong fact fails; to its own, passes)
  assert.deepEqual(validate(base, kmet, [{ text: '8.5', fact: 'bet.line' }, { text: '19.5', fact: 'projection.mean' }]), []);
  assert.ok(validate(base, kmet, [{ text: '8.5', fact: 'bet.line' }, { text: '19.5', fact: 'projection.blendedRate' }]).some((p) => /is not projection.blendedRate/.test(p)));
  // (a player's name isn't a topic: Jalen Hurts isn't injury talk, Chandler isn't a handle)
  const hurts = { ...kmet, bet: { ...kmet.bet, player: 'Jalen Hurts' } };
  assert.deepEqual(validate('Over 8.5 for Jalen Hurts.', hurts), []);

  // (the spec's sample analyses, each against its sheet)
  const analyses = [
    [
      '401872990:prop:recYds',
      {},
      'Kmet over 8.5 on volume, against a market that strongly disagrees',
      "The case is volume: his blended rate is 17.9 receiving yards over 4 games, the model projects 19.5, 11 over the line, and 67% of his weighted games cleared 8.5. Two things inside that number argue for caution. The fit scales every receiver up 16.6%, yet across all players its receiving-yards projections have run 6.4 yards above what happened, and GB's defense takes 6.7% off. CHI starting a backup QB, Tyson Bagent, is a term the game model counts, and the spread had moved 5.5 points before the bet. DraftKings' no-vig price makes the over 51% against the model's 77%; at half weight for an untested prop type the desk bets 63.9% against a 53.5% break-even.",
      'The model sits 26.5 points from the market, past the 15-point gap the desk now bets, and his recent 12 gets no weight; a backup QB and a quiet game keep him under 8.5.',
    ],
    [
      '401892478:prop:saves',
      {},
      "Blackwood under 23.5 saves on TOR's light expected volume",
      "This is a workload bet: the model projects 20.9 saves, 2.6 under the line, because both things that drive a goalie's night point down. Goalies facing TOR make fewer saves, worth 4.5% here, and with TOR expected to score only 2.4 to COL's 4.1, the game script takes off another 5%. The saves projection has earned a hearing: over 852 back-tested games it missed by 5.04 saves against 5.58 for a goalie's own average, and at this chance it said 64.3% and saw 64.4% happen. DraftKings' no-vig price says 48%; at half weight for an untested prop type the desk bets 58.8% against a 51.2% break-even.",
      'The model is 21.6 points from the market, past the 15-point gap the desk now bets, on 3 starts of his season, and the line had already dropped from 24.5 before the bet.',
    ],
    [
      '401891805:spread',
      { ledger: NHL_LEDGER },
      'MIN +1.5 likely cashes, but -217 leaves almost no edge',
      "This is a likely winner at a price that leaves little over. The model has MIN ahead outright, 3.4 goals to FLA's 2.9, so the bet loses only if FLA wins by 2 or more, and it rates the cover 78.9% against DraftKings' no-vig 65.7%. The goalie matchup is the one context term the model keeps: Jesper Wallstedt has saved 0.28 goals a game above expected and Jacob Markstrom sits at -0.21, but measured against each team's usual starter it moves the margin only 0.05. At -217 the break-even is 68.5% and the desk bets 70.3%, an edge of 1.9 points.",
      "The model is 13.2 points from the market, past the 12-point gap the desk now bets, for a 1.9-point edge; at -217 one loss takes 2.17 wins to repay, and the desk's 15 graded NHL spreads went 10-5 yet lost 1.3 units.",
    ],
    [
      '401907994:prop:k',
      {},
      "Burke over 4.5 strikeouts on a full season's rate",
      "The over rests on a long record: a blended 5.6 strikeouts a game over 24 starts this season with 21 last season behind it, and 61.6% of his weighted starts cleared 4.5. Even after CLE's lineup takes 5.6% off, the model projects 5.2, 0.7 over the line. The strikeout fit has been close to honest near this chance, saying 64.2% where 61.8% happened over 89 back-tested games. DraftKings' no-vig price says 47.4%; the desk bets 54.1% against a 50.2% break-even, an edge of 3.9 points with the lean already tapered because the model sits 13.4 points from the market.",
      'His last 5 starts averaged 4.2, under the line, and the fit gives recent form no weight; the game\'s lines were held because a starting pitcher was not announced and lineups were not posted.',
    ],
  ];
  // (the side and the line looked for in the headline and the reason: the risk may say how the other side wins)
  for (const [id, extra, headline, reason, risk] of analyses) {
    assert.deepEqual(validate([headline, reason, risk].join('\n'), sheetOf(id, extra), null, { reason: [headline, reason].join('\n') }), [], id);
  }
});

// Every bet in every ledger (and every CHECK kept), as the page would show it
const SPORTS = ['nfl', 'nba', 'nhl', 'mlb'];
const readIf = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);
const BAD = /undefined|NaN|null|\[object/;
const AFTER = { seen: { at: '2026-10-11T00:00:00Z', line: 99.5, odds: 400, fair: 0.9 }, close: { line: 1, odds: -900, fair: 0.1 }, clv: { pts: 9, beat: true }, status: 'won', profit: 9, published: true, publishedAt: '2026-10-11T00:00:00Z', publishedP: 0.9, publishedKelly: 0.9, publishedLevel: 'lock', shown: true };
// (the optional fields: each one gone in turn)
const OPTIONAL = ['projection', 'expMargin', 'expTotal', 'context', 'book', 'fairFrom', 'oddsAssumed', 'tested', 'placedAt', 'team', 'statLabel', 'player', 'push', 'otherOdds', 'intent'];
const OPTIONAL_PROJ = ['mean', 'rate', 'recent', 'games', 'lastSeason', 'pOver', 'fairOver', 'record', 'opp', 'script', 'ctx', 'ctxF', 'applied', 'out', 'questionable', 'push', 'funnelF', 'paceF', 'tgtF', 'vacF', 'role'];

for (const sport of SPORTS) {
  const dir = path.join(staticDir(sport), 'model');
  const ledger = readIf(path.join(dir, 'ledger.json'), null);
  if (!ledger?.bets?.length) continue;
  const state = readIf(path.join(dir, 'state.json'), {});
  const games = new Map(readIf(path.join(staticDir(sport), '..', '..', 'scripts', 'model', 'games.json'), []).map((g) => [g.id, g]));
  const checks = readIf(path.join(dir, 'checks.json'), null)?.checks ?? [];
  const all = [...ledger.bets, ...checks];
  const render = (b, extra = {}) => {
    const sheet = factsOf(b, { game: games.get(b.event), sib: sibOf(b, ledger.bets), state, params: b.market === 'prop' ? propParamsOf(state, b.propType, firstCtxKeyOf(b)) : null, ...extra });
    return { sheet, ...plainOf(sheet) };
  };

  // (the live data: its structure checked, its grounding only reported (plainOf falls back to its hook and
  // its price where the validator objects; a new field must never fail the desk's commit))
  test(`${sport}: every bet's write-up within its lengths, no missing value printed (its grounding reported)`, () => {
    const problems = [];
    for (const b of all) {
      const { sheet, reason, risk } = render(b, { ledger });
      const at = `${sport} ${b.id}`;
      assert.ok(reason.length > 0 && reason.length <= 450, `${at}: reason ${reason.length} chars: ${reason}`);
      assert.ok(risk.length <= 220, `${at}: risk ${risk.length} chars`);
      assert.ok(!BAD.test(reason) && !BAD.test(risk), `${at}: ${reason} | ${risk}`);
      const p = validate(`${reason} ${risk}`, sheet);
      if (p.length || reason.length < 120) problems.push(`${at}: ${[...p, reason.length < 120 ? `short (${reason.length})` : null].filter(Boolean).join('; ')}`);
    }
    if (problems.length) console.log(`${sport}: ${problems.length} write-ups to look at:\n  ${problems.slice(0, 10).join('\n  ')}`);
  });

  test(`${sport}: the write-up and its hash the same whatever happens to the bet after it's placed`, () => {
    for (const b of all) {
      const a = render(b);
      const later = { ...b, ...AFTER };
      const z = render(later);
      assert.equal(z.reason, a.reason, b.id);
      assert.equal(z.risk, a.risk, b.id);
      const sib = sibOf(b, ledger.bets);
      assert.equal(hashOf(later, sib && sib !== b ? { ...sib, ...AFTER, context: { ...sib.context, seen: { x: 1 }, move: { spread: 99 } } } : null), hashOf(b, sib && sib !== b ? sib : null), b.id);
    }
  });

  test(`${sport}: with any optional field gone, the write-up still whole and grounded`, () => {
    for (const b of all.filter((_, i) => i % 7 === 0)) {
      const variants = [...OPTIONAL.map((k) => (({ [k]: _gone, ...rest }) => rest)(b)), ...(b.projection ? OPTIONAL_PROJ.map((k) => ({ ...b, projection: (({ [k]: _gone, ...rest }) => rest)(b.projection) })) : [])];
      for (const v of variants) {
        const { sheet, reason, risk } = render(v);
        assert.ok(reason.length > 0 && reason.length <= 450, `${b.id}: ${reason}`);
        assert.ok(!BAD.test(reason) && !BAD.test(risk), `${b.id}: ${reason} | ${risk}`);
        const p = validate(`${reason} ${risk}`, sheet);
        if (p.length) console.log(`${sport} ${b.id} (a field gone): ${p.join('; ')}`);
      }
    }
  });

  test(`${sport}: writeups.json, where there is one, a write-up per open bet with its hash and text`, () => {
    const file = readIf(path.join(staticDir(sport), '..', '..', 'scripts', 'model', 'writeups.json'), null);
    if (!file) return;
    assert.equal(typeof file.items, 'object');
    for (const [id, e] of Object.entries(file.items)) {
      assert.equal(typeof e.plain?.hash, 'string', `${id}: hash`);
      assert.ok(typeof e.plain.reason === 'string' && e.plain.reason.length > 0, `${id}: reason`);
      assert.equal(typeof e.plain.risk, 'string', `${id}: risk`);
    }
  });

  test(`${sport}: the drivers' product gives the projection back for the props that carry their fit (applied), reported`, () => {
    const full = ledger.bets.filter((b) => b.market === 'prop' && b.projection?.applied);
    if (!full.length) return;
    const ok = full.filter((b) => driversOf(b).ok).length;
    if (ok / full.length < 0.95) console.log(`${sport}: only ${ok} of ${full.length} props' drivers give their projection back`);
  });
}

// A small ledger for the picks: a prop, its game's spread, and a graded bet
const NOW = new Date('2026-10-09T12:00:00Z');
const kmetBet = () => ({ ...structuredClone(sample('401872990').bet), start: '2026-10-11T17:00Z', placedAt: '2026-10-09T11:00:00Z' });
const pickLedger = () => ({
  bets: [
    kmetBet(),
    { ...structuredClone(sample('401872990').sib), start: '2026-10-11T17:00Z', status: 'open' },
    { ...kmetBet(), id: 'graded', status: 'won' },
  ],
});
const GAMES = new Map([[sample('401872990').game.id, sample('401872990').game]]);

test('buildPicks: each pick its plain reason and risk (by plain), kept in writeups.json per bet and frozen till its facts change', () => {
  const ledger = pickLedger();
  const writeups = { sport: 'nfl', items: { gone: { plain: { hash: 'x', v: PLAIN_V, reason: 'old', risk: 'old' } } } };
  const out = buildPicks('nfl', ledger, {}, GAMES, NOW, { state: STATE, writeups });
  const p = out.picks.find((x) => x.id === '401872990:prop:recYds:4258595');
  assert.equal(p.reason, writeups.items[p.id].plain.reason);
  assert.match(p.reason, /^Over 8\.5 receiving yards for Cole Kmet/);
  assert.match(p.risk, /26\.5 points from the market/);
  assert.equal(p.by, 'plain');
  // (only the open bets' kept: a graded one's, or one gone, dropped)
  assert.deepEqual(Object.keys(writeups.items).sort(), out.picks.map((x) => x.id).sort());
  assert.ok(!('gone' in writeups.items) && !('graded' in writeups.items));
  // (a refit, the state changed: the text kept; the bet seen again, closed: kept)
  const frozen = writeups.items[p.id].plain;
  const ledger2 = pickLedger();
  ledger2.bets[0].seen = { at: NOW.toISOString(), line: 9.5, odds: -120, fair: 0.55 };
  const p2 = buildPicks('nfl', ledger2, { 'prop:recYds': { trust: 0.9, fitted: true } }, GAMES, NOW, { state: { trust: { 'prop:recYds': { trust: 0.9, fitted: true } } }, writeups }).picks.find((x) => x.id === p.id);
  assert.equal(p2.reason, frozen.reason);
  assert.equal(writeups.items[p.id].plain, frozen);
  // (re-priced: a new price, a new text)
  const ledger3 = pickLedger();
  ledger3.bets[0].odds = -105;
  const p3 = buildPicks('nfl', ledger3, {}, GAMES, NOW, { state: STATE, writeups }).picks.find((x) => x.id === p.id);
  assert.notEqual(writeups.items[p.id].plain.hash, frozen.hash);
  assert.match(p3.reason, /at -105 it needs/);
  // (no store: written live, the same text)
  const live = buildPicks('nfl', pickLedger(), {}, GAMES, NOW, { state: STATE }).picks.find((x) => x.id === p.id);
  assert.equal(live.reason, frozen.reason);
  // (the old text kept a release, to diff against)
  assert.match(legacyReasonOf(kmetBet(), sample('401872990').game), /^Model 77% vs the book 51%/);
});

test("applyWriteups: Claude's analysis only for the facts it was written from (its hash), else the plain text", () => {
  const plain = { hash: 'h1', v: PLAIN_V, reason: 'Plain reason.', risk: 'Plain risk.' };
  const ai = { hash: 'h1', status: 'ok', reason: 'AI reason.', risk: 'AI risk.', headline: 'Head', stance: 'fair' };
  assert.deepEqual(applyWriteups({ reason: 'x' }, { plain, ai }, 'h1'), { reason: 'AI reason.', risk: 'AI risk.', headline: 'Head', read: 'fair', by: 'claude' });
  assert.deepEqual(applyWriteups({ reason: 'x' }, { plain, ai: { ...ai, hash: 'h0' } }, 'h1'), { reason: 'Plain reason.', risk: 'Plain risk.', by: 'plain' });
  assert.deepEqual(applyWriteups({ reason: 'x' }, { plain, ai: { ...ai, status: 'rejected' } }, 'h1'), { reason: 'Plain reason.', risk: 'Plain risk.', by: 'plain' });
  // (nothing kept: the pick as it was)
  assert.deepEqual(applyWriteups({ reason: 'x' }, null), { reason: 'x' });
});

test("a CHECK's write-up: the disagreement and its question in place of the price; its risk the gap's", () => {
  const { bet, sib, game } = sample('401892478');
  const check = { ...bet, intent: 'check', units: 0, reason: "the model's 70% against the book's 48%: too far from the market to trust" };
  const sheet = factsOf(check, { game, sib, state: STATE });
  const { reason, risk } = plainOf(sheet);
  assert.match(reason, /^Under 23\.5 saves for Mackenzie Blackwood/);
  assert.match(reason, /Not bet: the model makes the under 70% and DraftKings' no-vig price 48%, a 21\.6-point gap, past the 15 points the desk allows, so it is kept as a CHECK\./);
  assert.match(reason, /The question: is Mackenzie Blackwood confirmed in net/);
  assert.doesNotMatch(reason, /We make/);
  assert.match(risk, /^A gap that size is more often news/);
  assert.deepEqual(validate(`${reason} ${risk}`, sheet), []);
});

test("a CHECK's question kept in its last resort, past every trim; a write-up that fails, the old text marked legacy", () => {
  const { bet, sib, game } = sample('401892478');
  const long = { ...bet, intent: 'check', units: 0, player: 'Maximilian Alexander-Featherstonehaugh Junior the Third of the Northern Reaches', reason: 'x' };
  const { reason } = plainOf(factsOf(long, { game, sib, state: STATE }));
  assert.ok(reason.length <= 450, reason);
  assert.match(reason, /The question:/);
  assert.deepEqual(applyWriteups({ reason: 'x' }, { plain: { reason: 'Model 70% vs the book 48%.', legacy: true } }), { reason: 'Model 70% vs the book 48%.', by: 'legacy' });
});

test("buildPicks: the CHECKs' write-ups kept only while they show (not graded, closed or bet after all)", () => {
  const ledger = pickLedger();
  const c = { ...structuredClone(sample('401892478').bet), intent: 'check', units: 0, start: '2026-10-11T17:00Z' };
  ledger.checks = [{ ...c, id: 'c-open' }, { ...c, id: 'c-closed', closedAt: NOW.toISOString() }, { ...c, id: 'c-bet', bet: true }, { ...c, id: 'c-graded', checkResult: 'won' }];
  const writeups = { items: Object.fromEntries(['c-open', 'c-closed', 'c-bet', 'c-graded'].map((id) => [id, { plain: { hash: 'x', v: PLAIN_V, reason: 'r', risk: '' } }])) };
  buildPicks('nfl', ledger, {}, GAMES, NOW, { state: STATE, writeups });
  assert.ok('c-open' in writeups.items);
  for (const id of ['c-closed', 'c-bet', 'c-graded']) assert.ok(!(id in writeups.items), id);
});
