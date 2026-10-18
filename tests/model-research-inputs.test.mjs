// The CHECK research's real reasons into the model's own inputs (libs/ranker/scripts/model/research.mjs
// researchInputs, the owner's of 2026-10-17: a reason found is added to the calculation, not passed): a
// teammate's (or an opponent's) status found by name on the game's rosters, the player's own, a quarterback
// named to start (every other one on his roster not starting, the starter's listing cleared), a role change with
// no status and a market-only finding left CHECKs. Each into the game's injury report copy (notes.mjs
// applyNotes) as the projection reads it (props.mjs outOf: the vacated volume, the next man up, qb1Out / qbDeep
// all read its missing ones). No live calls: mocked findings and rosters.

import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { rosterOf as rosterFromBody } from '../libs/ranker/scripts/model/espn.mjs';
import { applyNotes } from '../libs/ranker/scripts/model/notes.mjs';
import { movedWords, researchRow } from '../libs/ranker/scripts/model/picks.mjs';
import { outOf } from '../libs/ranker/scripts/model/props.mjs';
import { researchInputs, rosterPlayer } from '../libs/ranker/scripts/model/research.mjs';
import { loadEngine } from './support/engine.mjs';

const now = new Date('2026-10-17T15:00:00Z');
const at = '2026-10-17T10:00:00Z';
const src = ['https://news.example/a'];
// (a game: PIT (23) at TB (27); a roster as espn.mjs rosterOf makes it, its info a Map of id -> { name, pos })
const rosterOf = (rows) => {
  const ids = new Set(rows.map(([id]) => id));
  ids.info = new Map(rows.map(([id, name, pos]) => [id, { name, pos }]));
  return ids;
};
const rosters = () =>
  new Map([
    ['23', rosterOf([['4430802', 'Darnell Washington', 'TE'], ['4361411', 'Pat Freiermuth', 'TE'], ['4685720', 'Aaron Rodgers', 'QB'], ['4431452', 'Mason Rudolph', 'QB'], ['4360310', 'Will Howard', 'QB']])],
    ['27', rosterOf([['4361741', 'Tristan Wirfs', 'OT'], ['3052587', 'Baker Mayfield', 'QB'], ['4596472', 'Jalon Daniels', 'QB']])],
  ]);
const game = { id: '401', home: '27', away: '23' };
const check = (over = {}) => ({ id: '401:prop:receptions:4430802', event: '401', sport: 'nfl', start: '2026-10-18T17:00:00Z', market: 'prop', player: 'Darnell Washington', athlete: '4430802', team: '23', side: 'over', ...over });
const finding = (o) => ({ at, sources: src, explains: true, confidence: 'medium', summary: '', athlete: null, ...o });
// (the notes into the game's report copy, as run.mjs noteInjuries puts them: the first at the CHECK's id)
async function apply(c, got, report = new Map([['23', []], ['27', []]])) {
  const live = new Map([['401', { injuries: report }]]);
  const notes = new Map(got.notes.map((n, i) => [i ? `${c.id}#research:${n.player}` : c.id, n]));
  const applied = await applyNotes('nfl', live, [{ game }], notes, { checks: [c], rosterOf: async () => null });
  return { live: live.get('401'), applied };
}

test('rosterOf keeps each player name and position: the research finds a player by name', () => {
  const body = { athletes: [{ position: 'offense', items: [{ id: 1, displayName: 'Pat Freiermuth', position: { abbreviation: 'TE' } }, { id: 2, displayName: 'Mason Rudolph', position: { abbreviation: 'QB' } }] }] };
  const r = rosterFromBody(body, 1);
  assert.deepEqual(r.info.get('1'), { name: 'Pat Freiermuth', pos: 'TE' });
  const all = new Map([['23', r]]);
  assert.deepEqual(rosterPlayer(all, { name: 'pat freiermuth' }), { id: '1', team: '23', name: 'Pat Freiermuth', pos: 'TE' });
  assert.equal(rosterPlayer(all, { name: 'Pat Freiermuth Jr.' })?.id, '1');
  assert.equal(rosterPlayer(all, { id: 2 })?.name, 'Mason Rudolph');
  assert.equal(rosterPlayer(all, { name: 'Nobody Here' }), null);
});

test("a teammate's status the research found (questionable, not on the report) goes into the report as his: the projection's missing ones read it", async () => {
  const c = check();
  const got = researchInputs(c, finding({ player: 'Pat Freiermuth', status: 'questionable', reason: 'injury', category: 'injury' }), 'nfl', { now, report: new Map(), rosters: rosters() });
  assert.equal(got.why, null);
  assert.deepEqual(got.inputs, [{ name: 'Pat Freiermuth', status: 'questionable', kind: 'teammate' }]);
  assert.deepEqual([got.notes[0].player, got.notes[0].team, got.notes[0].pos, got.notes[0].from, got.notes[0].id], ['4361411', '23', 'TE', 'research', c.id]);
  const { live, applied } = await apply(c, got);
  assert.equal(applied.length, 1);
  const entry = live.injuries.get('23').find((p) => p.id === '4361411');
  assert.deepEqual([entry.name, entry.pos, entry.status, entry.from], ['Pat Freiermuth', 'TE', 'Questionable', 'research']);
  // (as the projection reads the report: his share of the vacated work at his chance of missing)
  assert.ok(outOf('nfl', live, '23', 'TE').questionable.has('4361411'));
});

test("a teammate out (the QB): into the report Out, so the missing ones (the vacated volume, qb1Out / qbDeep) have him", async () => {
  const c = check();
  const got = researchInputs(c, finding({ player: 'Aaron Rodgers', status: 'out', reason: 'injury', category: 'injury' }), 'nfl', { now, report: new Map(), rosters: rosters() });
  assert.deepEqual(got.inputs, [{ name: 'Aaron Rodgers', status: 'out', kind: 'teammate' }]);
  const { live } = await apply(c, got);
  assert.ok(outOf('nfl', live, '23', 'TE').ids.has('4685720'));
  // (an opponent's: his kind says so; the CHECK's own: 'own')
  assert.equal(researchInputs(c, finding({ player: 'Tristan Wirfs', status: 'doubtful', reason: 'injury', category: 'injury' }), 'nfl', { now, rosters: rosters() }).inputs[0].kind, 'opponent');
  assert.equal(researchInputs(c, finding({ player: 'Darnell Washington', athlete: '4430802', status: 'limited', reason: 'injury', category: 'injury' }), 'nfl', { now, rosters: rosters() }).inputs[0].kind, 'own');
});

test('a status the report already has (so or worse), a player found nowhere, a stale finding: no input, a CHECK with why', () => {
  const c = check();
  const listed = new Map([['23', [{ id: '4361411', name: 'Pat Freiermuth', status: 'Questionable' }]]]);
  const f = finding({ player: 'Pat Freiermuth', athlete: '4361411', status: 'questionable', reason: 'injury', category: 'injury' });
  const same = researchInputs(c, f, 'nfl', { now, report: listed, rosters: rosters() });
  assert.equal(same.notes.length, 0);
  assert.match(same.why, /report already has him/);
  assert.match(researchInputs(c, finding({ player: 'Someone Else', status: 'out', reason: 'injury', category: 'injury' }), 'nfl', { now, rosters: rosters() }).why, /not known by his ESPN id/);
  assert.equal(researchInputs(c, { ...f, at: '2026-10-15T00:00:00Z' }, 'nfl', { now, rosters: rosters() }).notes.length, 0);
  // (no source: none)
  assert.equal(researchInputs(c, { ...finding({ player: 'Pat Freiermuth', status: 'out', reason: 'injury', category: 'injury' }), sources: [] }, 'nfl', { now, rosters: rosters() }).notes.length, 0);
});

test('a QB named to start: every other QB on his roster Out (not starting), so the lead QB the desk reads is missing; his own questionable listing cleared', async () => {
  const c = check();
  // (Rudolph named the starter over Rodgers: Rodgers and Howard not starting)
  const f = finding({ player: 'Mason Rudolph', status: 'active', reason: 'lineup', category: 'lineup', summary: 'Rudolph starts at TB; Rodgers sits.' });
  const report = new Map([['23', [{ id: '4431452', name: 'Mason Rudolph', status: 'Questionable', date: '2026-10-16T20:00:00Z' }]], ['27', []]]);
  const got = researchInputs(c, f, 'nfl', { now, report, rosters: rosters() });
  assert.deepEqual(
    got.inputs.map((x) => [x.name, x.status]),
    [
      ['Aaron Rodgers', 'out'],
      ['Will Howard', 'out'],
      ['Mason Rudolph', 'active'],
    ],
  );
  assert.match(got.inputs[0].kind, /not starting \(Mason Rudolph starts\)/);
  assert.ok(got.notes.every((n) => n.id === c.id && n.from === 'research' && n.starter === '4431452'));
  const { live, applied } = await apply(c, got, report);
  assert.equal(applied.length, 3);
  const out = outOf('nfl', live, '23', 'QB');
  assert.ok(out.ids.has('4685720') && out.ids.has('4360310'));
  // (the starter off the report: playing)
  assert.equal(
    live.injuries.get('23').some((p) => p.id === '4431452'),
    false,
  );
  // (a role reason saying he starts reads the same; one with the report having him Out: the report wins)
  assert.equal(researchInputs(c, { ...f, reason: 'role', category: 'role', summary: 'Rudolph is the starter now.' }, 'nfl', { now, rosters: rosters() }).inputs.length, 2);
  const outListed = new Map([['23', [{ id: '4431452', name: 'Mason Rudolph', status: 'Out' }]]]);
  assert.match(researchInputs(c, f, 'nfl', { now, report: outListed, rosters: rosters() }).why, /report wins/);
  // (the report already has the others out and the starter clear: nothing to put in)
  const settled = new Map([['23', [{ id: '4685720', status: 'Out' }, { id: '4360310', status: 'Out' }]]]);
  assert.match(researchInputs(c, f, 'nfl', { now, report: settled, rosters: rosters() }).why, /already say so/);
  // (another sport's: not a QB start)
  assert.equal(researchInputs(c, f, 'nba', { now, rosters: rosters() }).notes.length, 0);
});

test('a role change with no status, and a market-only or other finding: no input moves the projection, a CHECK', () => {
  const c = check();
  const role = researchInputs(c, finding({ player: 'Darnell Washington', athlete: '4430802', status: 'active', reason: 'role', category: 'role', summary: 'Washington promoted to TE1 in two-TE sets.' }), 'nfl', { now, rosters: rosters() });
  assert.equal(role.notes.length, 0);
  assert.match(role.why, /role change with no player's status: the depth chart only gates a role CHECK/);
  const other = researchInputs(c, finding({ player: 'Darnell Washington', athlete: '4430802', status: 'active', reason: 'none', category: 'other', summary: 'Big favorites, more late runs.' }), 'nfl', { now, rosters: rosters() });
  assert.equal(other.notes.length, 0);
  assert.match(other.why, /no player's status the report lacks/);
  assert.equal(researchInputs(c, null, 'nfl', { now }).notes.length, 0);
});

test("what it moved, kept on the research for the CHECK's popover: the inputs, the projection and chance before and after", async () => {
  const moved = { input: 'Pat Freiermuth questionable (teammate) (the injury report, this run)', before: { mean: 1.9, model: 0.62, side: 'under' }, after: { mean: 2.4, model: 0.51, side: 'under' }, now: 'no edge: passed, its CHECK closed', at };
  const words = movedWords(moved);
  assert.equal(words, 'Pat Freiermuth questionable (teammate) (the injury report, this run): projection 1.9 -> 2.4, model under 62% -> under 51%; no edge: passed, its CHECK closed');
  assert.equal(researchRow({ status: 'questionable', moved }).moved, words);
  assert.equal(researchRow({ status: 'questionable' }).moved, undefined);
  const ui = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'ai-signals-entry.ts'), data: {} });
  assert.equal(ui.researchView({ verdict: 'adjust', act: 'adjust', moved: words }).moved, words);
  assert.equal(ui.researchView({ verdict: 'adjust', act: 'adjust' }).moved, null);
});
