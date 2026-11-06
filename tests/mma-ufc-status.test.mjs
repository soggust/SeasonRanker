// UFC.com standing (apps/mma/scripts/ufc-status.mjs): a fighter the UFC has cut after a recent fight is released
// (listed, not a UFC fighter: the UFC Fighters Only setting leaves him out); retired, or "Not Fighting" after six
// months idle, leaves the active list (the owner, 2026-11-06)
import test from 'node:test';
import assert from 'node:assert/strict';
import { statusOf, ufcStanding } from '../apps/mma/scripts/ufc-status.mjs';

const page = (...tags) => tags.map((t) => `<p class="hero-profile__tag">\n  ${t}</p>`).join('\n');
const opts = { lastDate: '2026-08-09', sixMonths: '2026-05-08', division: 'Featherweight' };

test('the page tags read as status and division', () => {
  assert.deepEqual(statusOf(page('Featherweight Division', 'Not Fighting')), { status: 'Not Fighting', division: 'Featherweight' });
  assert.deepEqual(statusOf(page('#12', 'Active')), { status: 'Active', division: null });
  assert.equal(statusOf('<html></html>'), null);
});

test('Not Fighting after a recent fight is a release; after six months idle, retired', () => {
  const nf = { status: 'Not Fighting', division: 'Featherweight' };
  assert.equal(ufcStanding(nf, opts), 'released');
  assert.equal(ufcStanding(nf, { ...opts, lastDate: '2026-01-01' }), 'retired');
  assert.equal(ufcStanding({ status: 'Retired', division: 'Featherweight' }, opts), 'retired');
  assert.equal(ufcStanding({ status: 'Active', division: 'Featherweight' }, opts), null);
  assert.equal(ufcStanding(null, opts), null);
});

test("a namesake's page (another division) is not trusted; women's divisions match", () => {
  assert.equal(ufcStanding({ status: 'Not Fighting', division: 'Heavyweight' }, opts), null);
  assert.equal(ufcStanding({ status: 'Not Fighting', division: "Women's Strawweight" }, { ...opts, division: "Women's Strawweight" }), 'released');
  assert.equal(ufcStanding({ status: 'Not Fighting', division: null }, opts), 'released');
});

test('the data script reads every UFC fighter and drops the released from the UFC', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = (await readFile(new URL('../apps/mma/scripts/update-data.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  assert.match(src, /promotion: released\.has\(id\) \? null/);
  assert.doesNotMatch(src, /if \(last\.date >= sixMonths \|\| last\.league !== 'ufc'\) continue;/);
});

test("a Contender Series bout is a tryout, not a UFC fight: a fighter is UFC only once signed (Active on UFC.com)", async () => {
  const { tryout } = await import('../apps/mma/scripts/ufc-status.mjs');
  assert.equal(tryout({ event: "Dana White's Contender Series: Season 10, Week 5" }), true);
  assert.equal(tryout({ event: 'UFC 333: Volkanovski vs. Evloev' }), false);
  assert.equal(tryout({ event: 'The Ultimate Fighter 31 Semifinal' }), false);
  const { readFile } = await import('node:fs/promises');
  const src = (await readFile(new URL('../apps/mma/scripts/update-data.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  assert.match(src, /tryout\(last\) && !\/\^active\$\/i\.test\(entry\.status\?\.status/);
  assert.match(src, /ufcCareer: fights\.some\(\(f\) => f\.league === 'ufc' && !tryout\(f\)\)/);
});
