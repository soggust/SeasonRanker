// The CHECK band on the Book and the Algorithm (tiers.ts, desk-notes.ts, bet-why.ts): CHECK sorted under
// LOCK and over LOVE everywhere the bands sort, never numbered among the ranks; the owner's note as the form
// builds it, in the shape firestore.rules validDeskNote and the bettor's notes.mjs read; the CHECKs as By
// Confidence tallies them (a unit each as if bet, the closed ones out). Made-up picks, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';
import { REASONS, NOTE_STATUS, noteOf as deskNoteOf } from '../libs/ranker/scripts/model/notes.mjs';

const desk = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'book-entry.ts'), data: {} });

test('tiers: CHECK between LOCK and LOVE, its own chip, unranked with the locks', () => {
  assert.deepEqual(desk.TIERS.map((t) => t.tier), ['lock', 'check', 'love', 'like', 'pass']);
  assert.equal(desk.tierOf('check'), 'check');
  assert.equal(desk.tierLabel('check'), 'Check');
  const order = ['pass', 'love', 'check', 'like', 'lock', null].sort((a, b) => desk.bandOrder(a) - desk.bandOrder(b));
  assert.deepEqual(order, ['lock', 'check', 'love', 'like', 'pass', null]);
  // (a confidence or a tier's name, the same place)
  assert.equal(desk.bandOrder('high'), desk.bandOrder('love'));
  assert.ok(desk.unranked('lock') && desk.unranked('check'));
  assert.ok(!desk.unranked('high') && !desk.unranked(null));
});

test("byBand: the locks, then the CHECKs by their gap, then the rest by the Kelly score, then the start", () => {
  const row = (id, confidence, sureness, extra = {}) => ({ id, confidence, sureness, game: { kickoff: '2026-10-11T17:00Z' }, ...extra });
  const rows = [
    row('like', 'medium', 0.03),
    row('check-small', 'check', 0.2, { gap: 0.12 }),
    row('love', 'high', 0.07),
    row('lock', 'lock', 0.12),
    row('check-big', 'check', -0.01, { gap: -0.31 }),
    row('pass', 'low', -0.02),
    row('love-later', 'high', 0.07, { game: { kickoff: '2026-10-11T20:00Z' } }),
  ];
  assert.deepEqual(rows.sort(desk.byBand).map((r) => r.id), ['lock', 'check-big', 'check-small', 'love', 'love-later', 'like', 'pass']);
});

test("betWhy: a CHECK above the ranks as a lock is, the first bet under them #1", () => {
  const row = (id, confidence, sureness) => ({ id, confidence, sureness, pick: `pick ${id}`, market: 'Spread', betType: 'spread', p: 0.55, price: -110, why: null });
  const rows = [row(0, 'lock', 0.12), row(1, 'check', 0.01), row(2, 'high', 0.06), row(3, 'medium', 0.03)];
  assert.equal(desk.betWhy(rows, 1).place, 'Check');
  assert.equal(desk.betWhy(rows, 0).place, 'Lock');
  assert.equal(desk.betWhy(rows, 2).place, '#1');
  assert.equal(desk.betWhy(rows, 3).place, '#2');
  assert.equal(desk.betWhy(rows, 3).of, 2);
  // (a bet's neighbors the nearest bets past the CHECKs, a CHECK's the nearest CHECKs: never a bet against a CHECK)
  const mixed = [row(0, 'lock', 0.12), row(1, 'check', 0.01), row(2, 'check', 0.3), row(3, 'high', 0.06), row(4, 'medium', 0.03)];
  assert.deepEqual(desk.betWhy(mixed, 3).vs.map((v) => v.place), ['Lock', '#2']);
  assert.deepEqual(desk.betWhy(mixed, 0).vs.map((v) => v.place), ['#1']);
  assert.deepEqual(desk.betWhy(mixed, 1).vs.map((v) => v.place), ['Check']);
});

test("notePlayers: a prop's own player first, then its game's on the picks, each once; a game market's its game's", () => {
  const hurts = { betType: 'player', player: 'Jalen Hurts', athleteId: '4040715', playerTeam: '21' };
  const brown = { betType: 'player', player: 'A.J. Brown', athleteId: 4047646, playerTeam: '21' };
  const spread = { betType: 'spread', player: null, athleteId: null };
  assert.deepEqual(desk.notePlayers(brown, [hurts, brown, spread]), [
    { id: '4047646', name: 'A.J. Brown', team: '21' },
    { id: '4040715', name: 'Jalen Hurts', team: '21' },
  ]);
  assert.deepEqual(desk.notePlayers(spread, [spread, hurts]).map((p) => p.name), ['Jalen Hurts']);
  assert.deepEqual(desk.notePlayers(spread, [spread]), []);
});

test("noteOf: the form's note in the rules' shape, the bettor reading it back as written", () => {
  const players = [{ id: '4040715', name: 'Jalen Hurts', team: '21' }];
  // (the reasons and statuses the form offers: the bettor's own, and the rules')
  assert.deepEqual(desk.NOTE_REASONS.map((r) => r.value), REASONS);
  assert.deepEqual(desk.NOTE_STATUSES.map((s) => s.value), Object.keys(NOTE_STATUS));
  assert.equal(desk.NOTE_REASONS.find((r) => r.value === 'market-wrong').label, "Market is wrong, the Bot's right");

  assert.equal(desk.noteOf({ reason: '', player: '', status: '', note: '' }, 'nfl', players), 'Pick a reason');
  assert.match(desk.noteOf({ reason: 'other', player: '', status: '', note: 'x'.repeat(501) }, 'nfl', players), /500 at most/);

  const news = desk.noteOf({ reason: 'news', player: '4040715', status: 'questionable', note: '  limited at practice ' }, 'nfl', players);
  assert.deepEqual(news, { reason: 'news', player: '4040715', status: 'questionable', team: '21', sport: 'nfl', note: 'limited at practice' });
  // (a player with no status reads as out; a status with no player, none; a player the pick doesn't involve, none)
  assert.equal(desk.noteOf({ reason: 'news', player: '4040715', status: '', note: '' }, 'nfl', players).status, 'out');
  assert.deepEqual(desk.noteOf({ reason: 'weather', player: '', status: 'out', note: '' }, 'mma', players), { reason: 'weather', player: null, status: null, team: null, sport: null, note: null });
  assert.equal(desk.noteOf({ reason: 'news', player: '999', status: 'out', note: '' }, 'nfl', players).player, null);
  // (someone not on the picks, a game market's starter, by his ESPN id: his team left to the bettor)
  const qb = desk.noteOf({ reason: 'news', player: desk.OTHER_PLAYER, athlete: ' 3139477 ', status: 'out', note: '' }, 'nfl', players);
  assert.deepEqual(qb, { reason: 'news', player: '3139477', status: 'out', team: null, sport: 'nfl', note: null });
  assert.match(desk.noteOf({ reason: 'news', player: desk.OTHER_PLAYER, athlete: 'Mahomes', status: 'out', note: '' }, 'nfl', players), /digits/);
  // (the bot prices with a player and his status; a reason alone is kept for its review)
  assert.ok(desk.notePrices(news) && desk.notePrices(qb));
  assert.ok(!desk.notePrices(desk.noteOf({ reason: 'weather', player: '', status: '', note: 'wind 25mph' }, 'nfl', players)));

  // (the bettor's reader takes it as it was saved)
  const read = deskNoteOf('401:spread', { ...news, by: 'root', at: '2026-10-10T12:00:00Z' });
  assert.deepEqual([read.reason, read.player, read.status, read.team, read.sport, read.note], ['news', '4040715', 'questionable', '21', 'nfl', 'limited at practice']);
});

test('readNote, noteText, formOf: a saved note read back, in words, and into the form again', () => {
  const players = [{ id: '4040715', name: 'Jalen Hurts', team: '21' }];
  const n = desk.readNote({ reason: 'news', player: '4040715', status: 'out', team: '21', sport: 'nfl', note: 'ruled out', by: 'root', at: {} });
  assert.equal(desk.noteText(n, players), 'News the Bot missed · Jalen Hurts Out · “ruled out”');
  assert.equal(desk.noteText({ ...n, player: '77' }, players), 'News the Bot missed · player 77 Out · “ruled out”');
  assert.equal(desk.noteText(desk.readNote({ reason: 'market-wrong' }), players), "Market is wrong, the Bot's right");
  assert.equal(desk.readNote({ reason: 'gossip' }), null);
  assert.equal(desk.readNote(null), null);
  assert.deepEqual(desk.formOf(n, players), { reason: 'news', player: '4040715', athlete: '', status: 'out', note: 'ruled out' });
  assert.deepEqual(desk.formOf(null), { reason: '', player: '', athlete: '', status: '', note: '' });
  // (a player the form doesn't list, back as someone else by his id)
  assert.deepEqual(desk.formOf({ ...n, player: '3139477' }, players), { reason: 'news', player: desk.OTHER_PLAYER, athlete: '3139477', status: 'out', note: 'ruled out' });
});

test("noteState: a CHECK's note 'Noted' (pending) till a re-evaluation after it (picks.json's resolved), then still a CHECK; noteAtOf reads Firestore's time", () => {
  const at = Date.parse('2026-10-11T14:30:00Z');
  assert.equal(desk.noteState(at, null), 'pending');
  // (re-evaluated before the note: still pending)
  assert.equal(desk.noteState(at, { at: '2026-10-11T14:00:00Z', as: 'still', by: 'reprice' }), 'pending');
  assert.equal(desk.noteState(at, { at: '2026-10-11T15:00:00Z', as: 'still', by: 'note' }), 'still');
  // (closed or bet: the row's gone; nothing to say)
  assert.equal(desk.noteState(at, { at: '2026-10-11T15:00:00Z', as: 'closed', by: 'note' }), null);
  assert.equal(desk.noteState(at, null, false), null);
  // (a note whose time isn't known: any re-evaluation answers it)
  assert.equal(desk.noteState(null, { at: '2026-10-11T15:00:00Z', as: 'still', by: 'note' }), 'still');
  // (the run couldn't re-price it: held, its why on resolved, not "Noted" for a re-price that isn't coming)
  assert.equal(desk.noteState(at, { at: '2026-10-11T15:00:00Z', as: 'still', by: 'note', held: 'its line moved on the board' }), 'held');
  assert.equal(desk.noteAtOf({ toMillis: () => at }), at);
  assert.equal(desk.noteAtOf('2026-10-11T14:30:00Z'), at);
  assert.equal(desk.noteAtOf(at), at);
  assert.equal(desk.noteAtOf({}), null);
});
