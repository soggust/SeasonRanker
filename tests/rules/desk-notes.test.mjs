// firestore.rules for the owner's notes on the bettor's picks (deskNotes/{id}, libs/ranker/scripts/model/
// notes.mjs reads them with the service account): an admin (the token's claim) reads, writes and deletes them;
// nobody else does anything, signed in or not; a note's fields and their values, by its writer, at the
// write's time. And the bettor's own read of them (notes.mjs readDeskNotes) by the emulator's REST API. Run against the Firestore emulator by `npm run test:rules`; without the emulator these skip.
import { after, before, beforeEach, describe, test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import assert from 'node:assert/strict';
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { readDeskNotes } from '../../libs/ranker/scripts/model/notes.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const host = process.env.FIRESTORE_EMULATOR_HOST;
const skip = host ? false : 'no Firestore emulator (npm run test:rules)';

let env;
before(async () => {
  if (skip) return;
  const [hostname, port] = host.split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-season-ranker-desk-notes',
    firestore: { host: hostname, port: Number(port), rules: fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8') },
  });
});
after(async () => env?.cleanup());
beforeEach(async () => env?.clearFirestore());

const as = (uid, claims = {}) => env.authenticatedContext(uid, claims).firestore();
const admin = () => as('root', { admin: true });
const note = (extra = {}) => ({ reason: 'news', player: '3139477', status: 'out', note: 'ruled out at practice', by: 'root', at: serverTimestamp(), ...extra });
const ref = (db, id = '401547352:spread') => doc(db, 'deskNotes', id);

describe('deskNotes', { skip }, () => {
  test('an admin writes, reads, updates and deletes a note', async () => {
    const db = admin();
    await assertSucceeds(setDoc(ref(db), note()));
    await assertSucceeds(getDoc(ref(db)));
    await assertSucceeds(getDocs(collection(db, 'deskNotes')));
    await assertSucceeds(updateDoc(ref(db), { status: 'active', at: serverTimestamp(), by: 'root' }));
    // (only a reason: a note with no player's news)
    await assertSucceeds(setDoc(ref(db, '401547352:prop:recYds:9'), { reason: 'market-wrong', by: 'root', at: serverTimestamp() }));
    await assertSucceeds(deleteDoc(ref(db)));
  });

  test('nobody else: signed out, signed in, or a claim that isn\'t true', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => setDoc(ref(ctx.firestore()), { reason: 'news', by: 'root', at: new Date() }));
    for (const db of [env.unauthenticatedContext().firestore(), as('alice'), as('carl', { admin: 'true' })]) {
      await assertFails(getDoc(ref(db)));
      await assertFails(getDocs(collection(db, 'deskNotes')));
      await assertFails(setDoc(ref(db, 'x:ml'), note({ by: 'alice' })));
      await assertFails(updateDoc(ref(db), { note: 'x' }));
      await assertFails(deleteDoc(ref(db)));
    }
  });

  test("a note's shape: its reason, player, status, team and sport from their lists, by its writer, at the write's time", async () => {
    const db = admin();
    await assertFails(setDoc(ref(db), note({ reason: 'gossip' })));
    await assertFails(setDoc(ref(db), note({ status: 'doubtful' })));
    await assertFails(setDoc(ref(db), note({ player: 'Jalen Hurts' })));
    await assertFails(setDoc(ref(db), note({ team: 21 })));
    await assertFails(setDoc(ref(db), note({ sport: 'xfl' })));
    await assertFails(setDoc(ref(db), note({ note: 'x'.repeat(501) })));
    await assertFails(setDoc(ref(db), note({ by: 'someone' })));
    await assertFails(setDoc(ref(db), note({ at: new Date('2026-01-01') })));
    await assertFails(setDoc(ref(db), note({ units: 3 })));
    const { reason: _r, ...noReason } = note();
    await assertFails(setDoc(ref(db), noReason));
    await assertSucceeds(setDoc(ref(db), note({ team: '21', sport: 'nfl', status: 'questionable' })));
    // (every optional key null, sport too: a form that sends them all)
    await assertSucceeds(setDoc(ref(db), note({ player: null, status: null, team: null, sport: null, note: null })));
  });

  test('the bettor reads them back by the REST API, each note as it was written', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(ref(ctx.firestore()), { reason: 'news', player: '3139477', status: 'out', by: 'root', at: new Date('2026-10-09T12:00:00Z') });
      await setDoc(ref(ctx.firestore(), '401547352:prop:recYds:9'), { reason: 'market-wrong', note: 'no', by: 'root', at: new Date('2026-10-09T13:00:00Z') });
    });
    const got = await readDeskNotes({ env: { FIRESTORE_EMULATOR_HOST: host, GCLOUD_PROJECT: 'demo-season-ranker-desk-notes' }, log: { warn: assert.fail } });
    assert.equal(got.size, 2);
    assert.deepEqual(got.get('401547352:spread'), { id: '401547352:spread', reason: 'news', player: '3139477', status: 'out', team: null, sport: null, note: null, by: 'root', at: '2026-10-09T12:00:00Z' });
    assert.equal(got.get('401547352:prop:recYds:9').reason, 'market-wrong');
  });
});
