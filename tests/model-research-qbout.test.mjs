// A pass catcher's CHECK the research answered with "his quarterback is out" (research.mjs researchInputs and
// researchDecision; run.mjs betProps). The quarterback out on the report already is the model's input as it
// stands (held: the backup-QB term and qb1Out read the report), so the CHECK is priced at the trust and bet or
// passed; and where it can't be bet as it is (the qb1-out role guard with no price of the book's: "no price, and
// his line far from his usual", a skip that makes no CHECK) it's passed on that skip's words, or held a CHECK only
// with its reason stated (the ask its price is owed). 2026-10-18: Ted Hurst III Over 12.5 Rec Yds, Bucky Irving
// Over 2.5 Receptions, Emeka Egbuka Over 37.5 Rec Yds (Mayfield out) and Dontayvion Wicks Over 28.5 Rec Yds
// (Hurts out) sat CHECKs with verdict adjust, never decided.

import assert from 'node:assert/strict';
import test from 'node:test';
import { researchCall, researchDecision, researchInputs, researchPriced } from '../libs/ranker/scripts/model/research.mjs';

const now = new Date('2026-10-18T15:30:00Z');
const src = ['https://www.nbcsports.com/fantasy/football/player-news/2026-10-16/bucs-officially-rule-out-baker-mayfield-thumb'];
const rosterOf = (rows) => {
  const ids = new Set(rows.map(([id]) => id));
  ids.info = new Map(rows.map(([id, name, pos]) => [id, { name, pos }]));
  return ids;
};
const rosters = () =>
  new Map([
    ['27', rosterOf([['3052587', 'Baker Mayfield', 'QB'], ['4596472', 'Jalon Daniels', 'QB'], ['5220680', 'Ted Hurst III', 'WR'], ['4567750', 'Emeka Egbuka', 'WR']])],
    ['23', rosterOf([['4685720', 'Aaron Rodgers', 'QB']])],
  ]);
const report = new Map([['27', [{ id: '3052587', name: 'Baker Mayfield', status: 'Out' }]], ['23', []]]);
const hurst = { id: '401873002:prop:recYds:5220680', event: '401873002', sport: 'nfl', start: '2026-10-18T17:00Z', market: 'prop', player: 'Ted Hurst III', athlete: '5220680', team: '27', side: 'over', cause: 'role' };
const mayfieldOut = { player: 'Baker Mayfield', status: 'out', reason: 'injury', category: 'injury', explains: true, confidence: 'high', verdict: 'adjust', summary: 'Mayfield (right thumb) is out, so Jalon Daniels starts.', sources: src, at: '2026-10-18T13:05:39.167Z' };

// (the call as run.mjs researchCalls makes it for a held input)
function heldCall(c, rs) {
  const call = researchCall(c, rs, { now });
  const got = researchInputs(c, rs, 'nfl', { now, report, rosters: rosters() });
  return { got, call: { ...call, note: { held: true, name: got.inputs[0]?.name, inputs: got.inputs, input: got.inputs.map((x) => `${x.name} ${x.status} (${x.kind})`).join('; ') }, side: c.side } };
}

test("a receiver's quarterback out, on the report already: the model's input as it stands (held), priced", () => {
  const { got, call } = heldCall(hurst, mayfieldOut);
  assert.equal(got.held, true);
  assert.deepEqual(got.inputs, [{ name: 'Baker Mayfield', status: 'out', kind: 'teammate, on the report already' }]);
  assert.equal(call.act, 'adjust');
  assert.equal(researchPriced(call), true);
});

test("the qb1-out role guard firing (a CHECK kind): priced at the trust, bet or passed, never left a CHECK", () => {
  const { call } = heldCall(hurst, mayfieldOut);
  // (Egbuka Over 37.5 Rec Yds at -111 as the 15:47 run had it: model 57.4% against the book's 49.7%)
  const egbuka = { side: 'over', fair: 0.4969, model: 0.5744, odds: -111, push: 0, guarded: true, shadow: false };
  const d = researchDecision(call, egbuka, 0.5, { keyed: true, priced: true });
  assert.ok(['bet', 'pass'].includes(d.as), d.why);
  assert.ok(Number.isFinite(d.p) && Number.isFinite(d.ev));
});

test("the role guard with no price (a skip that makes no CHECK): the ask owed waits with its words, then passed; a priced hard skip passed on its words", () => {
  const { call } = heldCall(hurst, mayfieldOut);
  const why = "his team's starting quarterback (Baker Mayfield) out: a backup throwing to him; no price, and his line far from his usual (over it in 71% of his games): a juiced price the desk can't know";
  const x = { side: 'over', fair: 0.5, model: 0.6334, odds: -110, push: 0, guarded: false, shadow: false, hard: why };
  // (before: no CHECK guard firing, so nothing decided it and it sat a CHECK every run)
  assert.equal(researchDecision(call, { ...x, hard: null }, 0.5, { keyed: false, priced: true }), null);
  const owed = researchDecision(call, x, 0.5, { keyed: true, priced: false, fresh: false, asksLeft: true });
  assert.equal(owed.as, 'check');
  assert.match(owed.why, /owed an ask/);
  const none = researchDecision(call, x, 0.5, { keyed: true, priced: false, fresh: true });
  assert.equal(none.as, 'pass');
  assert.match(none.why, /no price for it now/);
  const priced = researchDecision(call, x, 0.5, { keyed: true, priced: true });
  assert.equal(priced.as, 'pass');
  assert.match(priced.why, /^passed: his team's starting quarterback \(Baker Mayfield\) out/);
  // (a research bet's 'pass' and a can't-tell keep their own ways)
  assert.equal(researchDecision({ act: 'pass', why: 'passed: x' }, x, 0.5).as, 'pass');
  assert.equal(researchDecision({ act: 'check', why: 'x' }, x, 0.5), null);
});

test('no CHECK guard and no hard skip, but no price of the book\'s with the Odds API to hand: waits with its words, then passed', () => {
  const { call } = heldCall(hurst, mayfieldOut);
  const x = { side: 'over', fair: 0.5, model: 0.56, odds: -110, push: 0, guarded: false, shadow: false, hard: null };
  assert.equal(researchDecision(call, x, 0.5, { keyed: true, priced: false, fresh: false, asksLeft: true }).as, 'check');
  assert.equal(researchDecision(call, x, 0.5, { keyed: true, priced: false, fresh: false, asksLeft: false }).as, 'pass');
  // (priced and no guard: the usual rules, not the research's)
  assert.equal(researchDecision(call, x, 0.5, { keyed: true, priced: true }), null);
});

test("a quarterback the report lacks (Hurts placed on IR): put into the report this run, the projection's own terms move", () => {
  const phi = new Map([['21', rosterOf([['4040715', 'Jalen Hurts', 'QB'], ['4428850', 'Dontayvion Wicks', 'WR']])], ['29', rosterOf([])]]);
  const wicks = { id: '401872998:prop:recYds:4428850', event: '401872998', sport: 'nfl', start: '2026-10-18T17:00Z', market: 'prop', player: 'Dontayvion Wicks', athlete: '4428850', team: '21', side: 'over', cause: 'role' };
  const rs = { ...mayfieldOut, player: 'Jalen Hurts', summary: 'Hurts ruled out, on IR.', at: '2026-10-18T15:22:11.035Z' };
  const got = researchInputs(wicks, rs, 'nfl', { now, report: new Map([['21', []], ['29', []]]), rosters: phi });
  assert.equal(got.notes.length, 1);
  assert.equal(got.notes[0].status, 'out');
  assert.equal(got.inputs[0].kind, 'teammate');
});
