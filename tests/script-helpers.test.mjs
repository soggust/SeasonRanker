// The data scripts' shared helpers (libs/ranker/scripts: csv.mjs, cli.mjs, json-files.mjs, fetch.mjs pacer), each
// once copied into several scripts: the CSV parser's quoted fields, the seasons a command line asks for, a map
// file left as it was when only its "updated" changed, and a polite pace between requests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseCsv } from '../libs/ranker/scripts/csv.mjs';
import { seasonsArg } from '../libs/ranker/scripts/cli.mjs';
import { readJson, writeIfChanged } from '../libs/ranker/scripts/json-files.mjs';
import { pacer } from '../libs/ranker/scripts/fetch.mjs';

test('parseCsv: rows by the header, quoted commas and quotes, CRLF, a last line without its newline', () => {
  const text = 'id,name,team\r\n1,"Smith, John",KC\r\n2,"say ""hi""",\n3,Lee,BUF';
  assert.deepEqual(parseCsv(text), [
    { id: '1', name: 'Smith, John', team: 'KC' },
    { id: '2', name: 'say "hi"', team: '' },
    { id: '3', name: 'Lee', team: 'BUF' },
  ]);
  assert.deepEqual(parseCsv('a,b\n1,2\n'), [{ a: '1', b: '2' }]);
});

test('seasonsArg: a range, a list, one season, or the fallback', () => {
  assert.deepEqual(seasonsArg('2018-2021', 2026), [2018, 2019, 2020, 2021]);
  assert.deepEqual(seasonsArg('2019,2021', 2026), [2019, 2021]);
  assert.deepEqual(seasonsArg('2020', 2026), [2020]);
  assert.deepEqual(seasonsArg(undefined, 2026), [2026]);
});

test('writeIfChanged: a file whose only change is "updated" is left as it was', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'json-files-'));
  const file = path.join(dir, 'heat-maps.json');
  assert.equal(readJson(file), null);
  assert.equal(writeIfChanged(file, { season: 2026, updated: 'a', rows: [1] }).same, false);
  assert.equal(writeIfChanged(file, { season: 2026, updated: 'b', rows: [1] }).same, true);
  assert.deepEqual(readJson(file), { season: 2026, updated: 'a', rows: [1] });
  assert.equal(writeIfChanged(file, { season: 2026, updated: 'c', rows: [2] }).same, false);
  assert.deepEqual(readJson(file), { season: 2026, updated: 'c', rows: [2] });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('pacer: each request at least its gap after the one before', async () => {
  const pace = pacer(40);
  const at = [];
  for (let i = 0; i < 3; i++) {
    await pace();
    at.push(Date.now());
  }
  assert.ok(at[1] - at[0] >= 35 && at[2] - at[1] >= 35, `${at[1] - at[0]}, ${at[2] - at[1]}`);
});
