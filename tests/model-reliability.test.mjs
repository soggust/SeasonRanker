// The desk's runs losing nothing to a failure (the 2026-10-15 audit): a file written whole or not at all
// (libs/ranker/scripts/model/sources.mjs writeAtomic), a pooled item that throws counted and logged, never
// silent (pool), and the live data's quality checks a warning in the bots' runs (tests/support/live.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pool, readJson, writeAtomic, writeJson } from '../libs/ranker/scripts/model/sources.mjs';

test('writeAtomic: the file replaced whole, its folder made, no temporary file left', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-atomic-'));
  const file = path.join(dir, 'deep', 'usage.json');
  writeJson(file, { remaining: 1 });
  writeJson(file, { remaining: 2 });
  assert.deepEqual(readJson(file, null), { remaining: 2 });
  writeAtomic(file, Buffer.from('{"remaining":3}'));
  assert.deepEqual(readJson(file, null), { remaining: 3 });
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['usage.json']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('pool: an item that throws gives null in its place, the rest in order, and the throws logged once', async () => {
  const warned = [];
  const was = console.warn;
  console.warn = (m) => warned.push(String(m));
  try {
    const out = await pool([1, 2, 3, 4], 2, async (x) => {
      if (x % 2 === 0) throw new Error(`bad ${x}`);
      return x * 10;
    });
    assert.deepEqual(out, [10, null, 30, null]);
    assert.equal(warned.length, 1);
    assert.match(warned[0], /2 of 4 items threw \(first: bad 2\)/);
    warned.length = 0;
    assert.deepEqual(await pool([1], 1, async (x) => x), [1]);
    assert.equal(warned.length, 0);
  } finally {
    console.warn = was;
  }
});

test('liveTest: a failure fails the test, but with LIVE_DATA_SOFT=1 (the bots\' runs) it is a warning', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-live-'));
  const file = path.join(dir, 'live.test.mjs');
  const live = new URL('./support/live.mjs', import.meta.url).href;
  fs.writeFileSync(file, `import { liveTest } from '${live}';\nliveTest('too long', () => { throw new Error('reason 451 chars'); });\n`);
  const run = (env) => spawnSync(process.execPath, ['--test', file], { encoding: 'utf8', env: { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'NODE_TEST_CONTEXT')), LIVE_DATA_SOFT: '', ...env } });
  const hard = run({});
  assert.notEqual(hard.status, 0);
  const soft = run({ LIVE_DATA_SOFT: '1' });
  assert.equal(soft.status, 0, soft.stdout);
  assert.match(soft.stdout, /::warning::live data, not failed \(LIVE_DATA_SOFT\): too long: reason 451 chars/);
  fs.rmSync(dir, { recursive: true, force: true });
});

// (the late terms' floor judged on the unrounded held-out gain, project.mjs fitStat: rounded to 4 places first, a
// gain of 0.00025 read 0.0003 and passed DRAFT_GAIN's 0.0003 (NFL receiving yards' nt at z 0.57, 2026-10-15). The
// rounded gains are only shown: no gate may compare them with a floor again)
test('project.mjs: no floor gate compares a rounded gain', () => {
  const src = fs.readFileSync(new URL('../libs/ranker/scripts/model/project.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /gains(\.\w+|\[key\])\s*>=\s*(MIN_GAIN|DRAFT_GAIN)/);
  assert.match(src, /\(key === 'sp' \? spRaw : raw\) >= MIN_GAIN\[key\]/);
  for (const k of ["dp", "hl"]) assert.ok(src.includes(`gains.${k} = Math.round(raw * 10000) / 10000`), k);
  assert.match(src, /csRaw >= DRAFT_GAIN/);
});
