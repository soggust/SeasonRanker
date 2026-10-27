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
