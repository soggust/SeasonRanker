// The MMA priced history (libs/ranker/scripts/model/fights-history.mjs: the Odds API's bouts matched to our archive by
// the fighters' names and the day) and the gate's MMA scoring (gate-mma.mjs: the fight model walk-forward with no
// look-ahead, the history's rows framed on ESPN's first fighter, the history's trust prior and its rows for the desk).
// No network: the archive and the history are made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY_WINDOW, closedEvents, editDistance, matchHistory, matchReport, nameScore, surnameOf, tokensOf } from '../libs/ranker/scripts/model/fights-history.mjs';
import { PERIOD_MONTHS, historyRows, ledgerRows, packRows, periodsOf, trustBets, trustPrior, unpackRows, walkForward } from '../libs/ranker/scripts/model/gate-mma.mjs';
import * as fightsModel from '../libs/ranker/scripts/model/fights-model.mjs';
import * as fightsTotals from '../libs/ranker/scripts/model/fights-totals.mjs';
import * as desk from '../libs/ranker/scripts/model/desk.mjs';
import * as leagues from '../libs/ranker/scripts/model/leagues.mjs';
import { rng } from '../libs/ranker/scripts/model/gate-score.mjs';

const V = { leagues, desk, fightsModel, fightsTotals, mmaDesk: null };

test('names: accents, case, spacing and a Jr. or Junior drop out; a shortened first name matches on the surname and initial; a reordered, joined, longer or married name matches; a changed surname never', () => {
  assert.equal(nameScore('Lucia Szabová', 'lucia szabova'), 3);
  assert.equal(nameScore('Antonio Carlos Junior', 'Antonio Carlos Jr.'), 3);
  assert.equal(nameScore('Raul Rosas Jr', 'Raul Rosas'), 3);
  assert.equal(nameScore('Alexander Volkanovski', 'Alex Volkanovski'), 2);
  assert.equal(nameScore('Weili Zhang', 'Zhang Weili'), 2);
  assert.equal(nameScore('Heili Alateng', 'Alatengheili'), 2);
  assert.equal(nameScore('Ian Garry', 'Ian Machado Garry'), 2);
  assert.equal(nameScore('Ariane Lipski', 'Ariane Lipski da Silva'), 2);
  assert.equal(nameScore('Katlyn Chookagian', 'Katlyn Cerminara'), 2, 'a married name the books kept');
  assert.equal(nameScore('Sergey Spivak', 'Serghei Spivac'), 2, 'a transliteration a letter apart');
  assert.equal(nameScore('Shamil Abdurahimov', 'Shamil Abdurakhimov'), 2);
  assert.equal(nameScore('Yana Santos', 'Luana Santos'), 1, 'a surname alone');
  assert.equal(nameScore('Mike Malott', 'Joaquin Buckley'), 0);
  assert.equal(nameScore('Tecia Torres', 'Tecia Pennington'), 2);
  assert.equal(editDistance('spivak', 'spivac'), 1);
  assert.equal(editDistance('abdurahimov', 'abdurakhimov'), 1);
  assert.ok(editDistance('smith', 'jones', 1) > 1);
  assert.deepEqual(tokensOf('Jean-Paul Lebosnoyani Jr.'), ['jean', 'paul', 'lebosnoyani']);
  assert.equal(surnameOf('Lone\'er Kavanagh'), 'kavanagh');
});

const fight = (id, date, a, b, { method = 'UD', winner = 'a', rounds = 3, period = 3, clock = 300, league = 'ufc' } = {}) => ({ id, league, event: 'UFC', date, division: 'Lightweight', rounds, period, clock, method, fighters: [{ id: `${a}`, name: a, winner: winner === 'a' }, { id: `${b}`, name: b, winner: winner === 'b' }] });
const event = (oid, t, home, away, season = Number(t.slice(0, 4))) => ({ oid, id: null, t, season, type: null, home: null, away: null, hs: null, as: null, homeName: home, awayName: away });

test('matchHistory: an event joins the fight of its two fighters within the day window, straight or crossed; a duplicate listing goes to the one priced to the bell; a loose pair matches only alone', () => {
  const fights = [fight('1', '2024-06-29', 'Alex Pereira', 'Jiri Prochazka'), fight('2', '2024-06-29', 'Andrei Arlovski', 'Martin Buday'), fight('3', '2024-07-13', 'Alexander Volkanovski', 'Ilia Topuria'), fight('4', '2024-07-13', 'Alexandre Pantoja', 'Steve Erceg')];
  const events = new Map(
    [
      event('a', '2024-06-30T02:00:00Z', 'Jiri Prochazka', 'Alex Pereira'),
      event('b', '2024-06-29T23:12:00Z', 'Andrei Arlovski', 'Martin Buday'),
      // (the same bout listed twice: the API re-issued it; the second has the close)
      event('b2', '2024-06-29T23:12:00Z', 'Andrei Arlovski', 'Martin Buday'),
      // (a loose pair: both by surname and initial, the day's only candidate)
      event('c', '2024-07-14T02:00:00Z', 'Alex Volkanovski', 'I. Topuria'),
      // (a far day: another card)
      event('d', '2024-08-10T02:00:00Z', 'Alex Pereira', 'Jiri Prochazka'),
      // (a changed surname, never guessed)
      event('e', '2024-07-14T02:00:00Z', 'Alexandre Pantoja', 'Steve Smith'),
    ].map((e) => [e.oid, e]),
  );
  const { matched, unmatched } = matchHistory(events, fights, { closed: new Set(['b2']) });
  assert.equal(matched.get('a').fight.id, '1');
  assert.equal(matched.get('a').crossed, true, "the API's first side is ESPN's second");
  assert.equal(matched.get('b2').fight.id, '2');
  assert.equal(matched.get('b2').crossed, false);
  assert.ok(!matched.has('b'), 'the listing without a close loses the fight to the one with it');
  assert.equal(matched.get('c').fight.id, '3');
  assert.ok(!matched.has('d'));
  assert.ok(!matched.has('e'));
  assert.deepEqual(unmatched.map((e) => e.oid).sort(), ['b', 'd', 'e']);
  // (two loose candidates on the day: neither taken)
  const two = new Map([event('x', '2024-07-14T02:00:00Z', 'A. Volkanovski', 'I. Topuria')].map((e) => [e.oid, e]));
  const fights2 = [...fights, fight('5', '2024-07-13', 'Arnold Volkanovski', 'Ivan Topuria')];
  assert.ok(!matchHistory(two, fights2).matched.has('x'));
  const report = matchReport(events, matched, unmatched, fights, new Set(['b2']));
  assert.equal(report.total, 6);
  assert.equal(report.matched, 3);
  assert.equal(report.closedMatched, 1);
  assert.ok(report.cards.length >= 2 && report.cards[0].n >= 1);
  assert.ok(DAY_WINDOW >= 24 * 36e5);
});

test('closedEvents: an event is priced to the bell when a close snapshot sits inside the window of its start', () => {
  const hist = { events: new Map([event('a', '2024-06-30T02:00:00Z', 'x', 'y'), event('b', '2024-06-30T02:00:00Z', 'x', 'y')].map((e) => [e.oid, e])), lines: [{ oid: 'a', kind: 'c', ts: '2024-06-30T01:30:00Z' }, { oid: 'b', kind: 'c', ts: '2024-06-28T01:30:00Z' }, { oid: 'b', kind: 'o', ts: '2024-06-30T01:30:00Z' }] };
  assert.deepEqual([...closedEvents(hist)], ['a']);
});

test('periodsOf: half-years from a day to the month after now', () => {
  const p = periodsOf('2024-01-01', new Date('2025-03-15T00:00:00Z'));
  assert.equal(PERIOD_MONTHS, 6);
  assert.deepEqual(p.map((x) => x.from), ['2024-01-01', '2024-07-01', '2025-01-01']);
  assert.equal(p.at(-1).to, '2025-07-01');
});

// (a made-up archive: n bouts among k fighters, seeded, over six years from a year on; the better-numbered fighter wins
// more; the names letters, as a fighter's are)
const letters = (n) => n.toString(26).split('').map((c) => String.fromCharCode(97 + parseInt(c, 26))).join('');
const who = (n) => `Fi${letters(n)} Sur${letters(n * 7 + 3)}`;
function archive({ n = 1500, k = 40, from = 2014, seed = 3 } = {}) {
  const r = rng(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = 1 + Math.floor(r() * k);
    let b = 1 + Math.floor(r() * k);
    if (b === a) b = (a % k) + 1;
    const day = new Date(Date.UTC(from, 0, 1) + Math.floor((i / n) * 6 * 365) * 864e5).toISOString().slice(0, 10);
    const pa = 1 / (1 + Math.exp(-(a - b) / 10));
    const won = r() < pa;
    const finish = r() < 0.4;
    out.push(fight(`f${i}`, day, who(a), who(b), { method: finish ? 'KO' : 'UD', winner: won ? 'a' : 'b', period: finish ? 1 + Math.floor(r() * 3) : 3, clock: finish ? Math.floor(r() * 300) : 300 }));
  }
  return out;
}

test('walkForward: every bout is priced by a fit on the bouts before its period alone: a later result changed moves no earlier chance (no look-ahead)', () => {
  const fights = archive();
  const { rows } = fightsModel.buildRows(fights, {});
  const now = new Date('2020-01-15T00:00:00Z');
  const a = walkForward(V, rows, { from: '2018-01-01', now });
  assert.ok(a.periods.length >= 3, `periods ${a.periods.length}`);
  for (const p of a.periods) assert.ok(p.train >= 500, 'the fit has its rows');
  // (a 2018 bout's chance against the ratingP of the same row: both finite, the chance from the fit)
  const early = rows.filter((x) => x.date >= '2018-01-01' && x.date < '2018-07-01');
  assert.ok(early.length > 10);
  const before = early.map((x) => a.chances.get(x.id).p);
  for (const p of before) assert.ok(p > 0.03 && p < 0.97);
  // (every 2019 bout's winner flipped: the 2018 chances are the same to the last digit)
  const flipped = fights.map((f) => (f.date >= '2019-01-01' ? { ...f, fighters: f.fighters.map((x) => ({ ...x, winner: !x.winner })) } : f));
  const b = walkForward(V, fightsModel.buildRows(flipped, {}).rows, { from: '2018-01-01', now });
  const after = early.map((x) => b.chances.get(x.id).p);
  assert.deepEqual(after, before);
  // (and a 2019 bout's chance does move with its own period's training rows changed)
  const late = rows.filter((x) => x.date >= '2019-07-01').slice(0, 20);
  assert.ok(late.some((x) => a.chances.get(x.id).p !== b.chances.get(x.id).p));
  // (the totals' chance: a line its rounds carry, none past them)
  const c = a.chances.get(early[0].id);
  assert.ok(Number.isFinite(c.over(2.5, 3)));
  assert.equal(c.over(4.5, 3), null);
});

test("historyRows: the moneyline framed on ESPN's first fighter whichever side the API listed first, Pinnacle's pair the fair chance where it posts, the round total at the book's main line graded by the bout's length; the trust walk-forward by month", () => {
  const fights = archive();
  const { rows } = fightsModel.buildRows(fights, {});
  const now = new Date('2020-01-15T00:00:00Z');
  const { chances } = walkForward(V, rows, { from: '2018-01-01', now });
  // (two bouts of 2019: one listed straight, one crossed; the first a finish in round 1, the second the distance)
  const r1 = rows.find((x) => x.date >= '2019-03-01' && x.secs !== null && x.secs < 300 && x.y !== null);
  const r2 = rows.find((x) => x.date >= '2019-03-01' && x.secs === 900 && x.y !== null);
  const f1 = fights.find((f) => f.id === r1.id);
  const f2 = fights.find((f) => f.id === r2.id);
  const t1 = `${f1.date}T02:00:00Z`;
  const t2 = `${f2.date}T02:00:00Z`;
  const events = new Map([event('e1', t1, f1.fighters[0].name, f1.fighters[1].name), event('e2', t2, f2.fighters[1].name, f2.fighters[0].name)].map((e) => [e.oid, e]));
  const L = (oid, kind, ts, book, market, line, a, b) => ({ oid, kind, ts, book, market, line, a, b });
  const lines = [
    L('e1', 'o', '2019-02-20T14:00:00Z', 'dk', 'h2h', null, -150, 130),
    L('e1', 'o', '2019-02-20T14:00:00Z', 'pin', 'h2h', null, -140, 125),
    L('e1', 'c', `${f1.date}T01:30:00Z`, 'dk', 'h2h', null, -180, 150),
    L('e1', 'c', `${f1.date}T01:30:00Z`, 'dk', 'totals', 2.5, -120, 100),
    L('e1', 'c', `${f1.date}T01:30:00Z`, 'dk', 'totals', 1.5, -250, 200),
    // (crossed: the API's first side is ESPN's second fighter)
    L('e2', 'c', `${f2.date}T01:30:00Z`, 'dk', 'h2h', null, 200, -240),
    L('e2', 'c', `${f2.date}T01:30:00Z`, 'pin', 'h2h', null, 210, -230),
    L('e2', 'c', `${f2.date}T01:30:00Z`, 'dk', 'totals', 2.5, 110, -130),
    L('e2', 'c', `${f2.date}T01:30:00Z`, 'pin', 'totals', 2.5, 105, -125),
  ];
  const h = historyRows(V, rows, { events, lines }, chances, 2019, { fights });
  const ml1o = h.open.find((x) => x.key === `h:${r1.id}:ml`);
  const ml1 = h.close.find((x) => x.key === `h:${r1.id}:ml`);
  const ml2 = h.close.find((x) => x.key === `h:${r2.id}:ml`);
  const t1r = h.close.find((x) => x.key === `h:${r1.id}:total`);
  const t2r = h.close.find((x) => x.key === `h:${r2.id}:total`);
  // (straight: the first fighter's price is the API's a; the fair Pinnacle's at the open, DraftKings' own at the close)
  assert.equal(ml1o.overOdds, -150);
  assert.equal(ml1o.fairFrom, 'pinnacle');
  assert.ok(Math.abs(ml1o.f - 140 / 240 / (140 / 240 + 100 / 225)) < 1e-9);
  assert.equal(ml1.fairFrom, 'dk');
  assert.equal(ml1.overOdds, -180);
  assert.equal(ml1.y, r1.y);
  assert.equal(ml1.raw, Math.min(0.999, Math.max(0.001, chances.get(r1.id).p)));
  // (the open row's q is the close's fair at the same (null) line)
  assert.equal(ml1o.q, ml1.f);
  // (crossed: ESPN's first fighter is the API's second: his price is b, his fair 1 less the API's home's)
  assert.equal(ml2.overOdds, -240);
  assert.equal(ml2.underOdds, 200);
  assert.ok(ml2.f > 0.6, `the first fighter the favorite: ${ml2.f}`);
  assert.equal(ml2.fairFrom, 'pinnacle');
  // (the round total: the book's main line (the pair nearest even: 2.5 over 1.5); the finish in round 1 is under)
  assert.equal(t1r.line, 2.5);
  assert.equal(t1r.y, 0);
  assert.equal(t2r.y, 1, 'the distance is over 2.5');
  assert.equal(t2r.fairFrom, 'pinnacle');
  // (every row priced: a chance, a trust)
  for (const x of [...h.open, ...h.close]) {
    assert.ok(x.p > 0 && x.p < 1, 'priced');
    assert.ok(Number.isFinite(x.trust));
  }
  assert.equal(h.report.matched, 2);
});

test("the history's trust: the rows as the trust fit reads a bet, recency-weighted; packed and unpacked the same; fitted once the rows reach the fit's minimum, the starting trust under it", () => {
  const row = (i, market, kind, season) => ({ id: `h:${i}:${market}:${kind}`, key: `h:${i}:${market}`, event: `${i}`, market, kind, line: market === 'total' ? 2.5 : null, raw: 0.55, f: 0.5, y: i % 2, q: 0.52, t: Date.parse(`${season}-06-01T00:00:00Z`), season });
  const open = Array.from({ length: 30 }, (_, i) => row(i, 'ml', 'o', 2026));
  const close = [...Array.from({ length: 30 }, (_, i) => row(i, 'ml', 'c', 2025)), row(99, 'total', 'c', 2026)];
  const bets = trustBets(open, close, 2026);
  assert.equal(bets.length, 61, 'every open and close row its own evidence');
  assert.equal(bets[0].tw, 1, 'this season whole');
  assert.equal(bets.find((b) => b.season === 2025).tw, 0.5, 'last season half');
  assert.equal(bets[0].status, 'lost');
  assert.equal(bets[1].status, 'won');
  assert.equal(bets[0].clv.q, 0.52);
  const packed = packRows(bets);
  assert.equal(packed[0].length, 10);
  const back = unpackRows(packed, 2026);
  assert.equal(back.length, bets.length);
  for (const [i, b] of back.entries()) {
    assert.equal(b.market, bets[i].market);
    assert.equal(b.status, bets[i].status);
    assert.equal(b.clv.q, bets[i].clv.q);
    assert.equal(b.tw, bets[i].tw);
    assert.equal(b.model, bets[i].model);
  }
  const prior = trustPrior(V, bets);
  assert.equal(prior.ml.fitted, true, '60 moneyline rows: fitted');
  assert.equal(prior.ml.rows, 60);
  assert.ok(prior.ml.trust >= 0 && prior.ml.trust <= 1);
  assert.equal(prior.total.fitted, false, 'one total row: the start');
  assert.equal(prior.total.trust, 0.5);
});

test("ledgerRows: the desk's graded bets priced at the version's chance of the bet's own fighter and the history's trust as of its month", () => {
  const ledger = {
    bets: [
      { id: 'b1', event: '10', market: 'ml', side: 'away', fighters: { home: { id: 'A' }, away: { id: 'B' } }, start: '2026-10-18T02:00:00Z', fair: 0.4, model: 0.45, odds: 150, otherOdds: -180, status: 'won', clv: { q: 0.42 }, units: 1, intent: 'edge' },
      { id: 'b2', event: '11', market: 'total', side: 'under', line: 2.5, fighters: { home: { id: 'C' }, away: { id: 'D' } }, start: '2026-10-18T02:00:00Z', fair: 0.5, model: 0.6, odds: -110, otherOdds: -110, status: 'lost', units: 0, intent: 'track' },
      { id: 'old', event: '12', market: 'ml', side: 'home', fighters: { home: { id: 'C' }, away: { id: 'D' } }, start: '2026-09-01T02:00:00Z', fair: 0.5, model: 0.6, odds: -110, status: 'won', units: 1 },
    ],
  };
  // (the archive lists bout 10 with B first: the version's chance for B is its first fighter's)
  const chanceOf = (b) => (b.market === 'total' ? (b.side === 'over' ? 0.3 : 0.7) : b.fighters[b.side].id === 'B' ? 0.5 : null);
  const rows = ledgerRows(V, ledger, (market) => (market === 'ml' ? 0.2 : 0), { chanceOf });
  assert.equal(rows.length, 2, 'the row before the window is out');
  const [r1, r2] = rows;
  assert.equal(r1.raw, 0.5);
  assert.equal(r1.trust, 0.2);
  assert.ok(Math.abs(r1.p - desk.chanceAt('ml', 0.4, 0.5, 0.2)) < 1e-12);
  assert.equal(r1.y, 1);
  assert.equal(r1.q, 0.42);
  assert.equal(r2.raw, 0.7);
  assert.equal(r2.p, 0.5, 'a total at trust 0 is the Book');
  assert.equal(r2.units, 0);
});
