// Development is not admin: canUse('experimental') reads the ADMIN signal alone, so localhost shows what a
// plain user sees until an admin is staged; the account menu's "Stage as admin" (dev-admin.ts) shows only on
// the dev server with the emulators on, and sets the claim with the Auth emulator's privileged
// accounts:update, as the Admin SDK does on the live project.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const f = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support/dev-admin-entry.ts'), data: {} });

test('canUse: development alone is not admin; the open features stay open; the claim is what opens the rest', () => {
  assert.equal(f.isDevMode(), true, 'the bundle runs in dev mode, as the dev server does');
  f.ADMIN.set(false);
  assert.equal(f.canUse('experimental'), false);
  assert.equal(f.canUse('mma'), true);
  assert.equal(f.canUse('bets'), true);
  f.ADMIN.set(true);
  assert.equal(f.canUse('experimental'), true);
  f.ADMIN.set(false);
  assert.equal(f.canUse('experimental'), false);
});

test('the switch shows on the dev server with the emulators on, and nowhere else', () => {
  assert.equal(f.showStageAdmin(true, true), true);
  assert.equal(f.showStageAdmin(true, false), false, 'dev server against the live project');
  assert.equal(f.showStageAdmin(false, true), false, 'a build, even with the emulator flag set');
  assert.equal(f.showStageAdmin(false, false), false);
});

test('the claim call: the emulator\'s privileged accounts:update on its own host, as the owner', () => {
  const { url, init } = f.stageAdminRequest({ projectId: 'qbranker2026', port: 9101, uid: 'abc123', admin: true });
  assert.equal(url, 'http://127.0.0.1:9101/identitytoolkit.googleapis.com/v1/projects/qbranker2026/accounts:update');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer owner');
  assert.equal(init.headers['Content-Type'], 'application/json');
  const body = JSON.parse(init.body);
  assert.deepEqual(Object.keys(body).sort(), ['customAttributes', 'localId']);
  assert.equal(body.localId, 'abc123');
  assert.deepEqual(JSON.parse(body.customAttributes), { admin: true });
  const off = JSON.parse(f.stageAdminRequest({ projectId: 'qbranker2026', port: 9099, uid: 'abc123', admin: false }).init.body);
  assert.deepEqual(JSON.parse(off.customAttributes), { admin: false });
});

test('stageEmulatorAdmin posts once and surfaces the emulator\'s refusal', async () => {
  const calls = [];
  const ok = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({}) };
  };
  await f.stageEmulatorAdmin(ok, { projectId: 'qbranker2026', port: 9099, uid: 'u1', admin: true });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^http:\/\/127\.0\.0\.1:9099\//);
  assert.equal(JSON.parse(calls[0].init.body).localId, 'u1');

  const refused = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'USER_NOT_FOUND' } }) });
  await assert.rejects(f.stageEmulatorAdmin(refused, { projectId: 'qbranker2026', port: 9099, uid: 'u1', admin: true }), /USER_NOT_FOUND/);
  const down = async () => ({ ok: false, status: 502, json: async () => { throw new Error('no body'); } });
  await assert.rejects(f.stageEmulatorAdmin(down, { projectId: 'qbranker2026', port: 9099, uid: 'u1', admin: false }), /502/);
});
