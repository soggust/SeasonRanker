import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

// (2026-10-27: a step inserted into model-desk.yml took the restore step's restore-keys into its own script, so
// every desk run failed on "restore-keys:: command not found" and the cache was never restored)
const dir = path.resolve('.github/workflows');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.yml'));

test('workflows: each parses; no run script holds a step key; every cache restore has its restore-keys', () => {
  for (const f of files) {
    const wf = yaml.load(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const [name, job] of Object.entries(wf.jobs ?? {})) {
      for (const step of job.steps ?? []) {
        if (typeof step.run === 'string') assert.ok(!/^\s*(restore-keys|key|path|uses|with|if|env|name):\s/m.test(step.run), `${f} ${name}: "${step.name}" has a step key in its script`);
        if (/^actions\/cache\/restore@/.test(step.uses ?? '')) assert.ok(step.with?.['restore-keys'], `${f} ${name}: "${step.name}" restores without restore-keys`);
      }
    }
  }
});

test('the desk prunes its old caches only after this run saved its own', () => {
  const wf = yaml.load(fs.readFileSync(path.join(dir, 'model-desk.yml'), 'utf8'));
  const steps = Object.values(wf.jobs)[0].steps.map((s) => s.name);
  assert.ok(steps.indexOf('Prune old desk caches') > steps.indexOf("Save the desk's cache"));
  assert.equal(wf.permissions?.actions, 'write');
});

// (D117, 2026-11-08: the hourly desk ran the whole suite before committing its bets and nine runs failed on the NFL
// card's field maps, five on 2026-11-04 on an NBA card test: files the desk never writes. Whole data blocks; the
// suite warns, as the data workflows have since 2026-10-16)
test('D117: the desk and the data workflows block their commit on whole data alone; the full suite warns on the run\'s data', () => {
  const checkOf = (f) => {
    const wf = yaml.load(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const job of Object.values(wf.jobs)) {
      const s = (job.steps ?? []).find((x) => x.name === 'Check the data');
      if (s) return s;
    }
    return null;
  };
  const HARD = 'node --test tests/data.test.mjs tests/model-reliability.test.mjs tests/model-writeup.test.mjs';
  for (const f of ['model-desk.yml', 'nfl-update-data.yml', 'nba-update-data.yml', 'nhl-update-data.yml', 'mlb-update-data.yml', 'mma-update-data.yml']) {
    const s = checkOf(f);
    assert.ok(s, `${f}: no Check the data step`);
    assert.equal(s.env?.LIVE_DATA_SOFT, '1', f);
    const first = s.run.trim().split('\n')[0].trim();
    assert.match(first, /^node --test tests\/data\.test\.mjs( tests\/[\w-]+\.test\.mjs)*$/, `${f}: the whole-data checks first, hard`);
    assert.match(s.run, /if ! npm test > test-run\.log 2>&1; then\s+grep -E "\^not ok" test-run\.log \| sed "s\/\^\/::warning::/, `${f}: the suite inside the warning block`);
    assert.ok(!/^\s*npm test\s*$/m.test(s.run), `${f}: a bare npm test would block the commit`);
  }
  assert.equal(checkOf('model-desk.yml').run.trim().split('\n')[0].trim(), HARD);
  assert.equal(checkOf('model-desk-fast.yml').run.trim(), HARD);
});
