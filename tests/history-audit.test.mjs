// The history audit (scripts/history-audit.mjs, DECISIONS.md D86): its pure pieces, the record's history rows
// (gate.mjs) and the gate's recency veto (gate-score.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as HA from '../scripts/history-audit.mjs';
import { RECENT_MIN, recencyVeto, sportVerdict, ownerException } from '../libs/ranker/scripts/model/gate-score.mjs';
import { addHistoryRow, historyRowOf, HISTORY_MAX } from '../libs/ranker/scripts/model/gate.mjs';

test('the code check: model commits debounced 30 minutes, the audit and the desk never retrigger', () => {
  const now = Date.parse('2026-10-23T12:00:00Z');
  const c = (sha, mins, subject) => ({ sha, at: now - mins * 60000, subject });
  assert.equal(HA.codeDue([], now).run, false);
  assert.equal(HA.codeDue([c('a'.repeat(40), 90, "Weekly audit: history re-recorded with today's Bot (2026-10-23)")], now).run, false);
  assert.equal(HA.codeDue([c('b'.repeat(40), 90, 'Model desk: weekly self-check')], now).run, false);
  assert.equal(HA.codeDue([c('c'.repeat(40), 10, 'D86 recency veto')], now).run, false, 'too fresh');
  // (the newest real commit decides: an older one 90 minutes back waits for the fresh one)
  assert.equal(HA.codeDue([c('d'.repeat(40), 10, 'tweak'), c('e'.repeat(40), 90, 'rule')], now).run, false);
  const due = HA.codeDue([c('f'.repeat(40), 31, 'rule'), c('g'.repeat(40), 5, 'Nightly audit: x')], now);
  assert.equal(due.run, true);
  assert.equal(due.sha, 'f'.repeat(40));
  assert.equal(HA.DEBOUNCE_MIN, 30);
  assert.ok(HA.isAuditCommit(HA.commitMessage('code', '2026-10-23', 'abcdef1234')), "the audit's own message is recognized");
  assert.ok(HA.isAuditCommit(HA.commitMessage('weekly', '2026-10-23')));
  assert.equal(HA.commitMessage('weekly', '2026-10-23'), "Weekly audit: history re-recorded with today's Bot (2026-10-23)");
  assert.ok(!HA.isAuditCommit('Update NFL data'));
  // (the bettor's code and config re-record, its docs don't)
  assert.deepEqual(HA.MODEL_PATHS, ['libs/ranker/scripts/model', ':(exclude,glob)libs/ranker/scripts/model/**/*.md']);
});

test("the record guard's reasons and the rebuild's failed sources read off the gate's output", () => {
  const out = 'nfl: the record\'s inputs NOT complete (fingerprint x)\n  REFUSED: no context facts in the cache\n  HELD: inputs changed, not the model: the replay moved -39u to -30u\n--record refused';
  assert.deepEqual(HA.guardReasons(out), ['refused: no context facts in the cache', 'held: inputs changed, not the model: the replay moved -39u to -30u']);
  assert.deepEqual(HA.guardReasons('all fine'), []);
  assert.ok(HA.rebuildFailed('nfl: context facts gathered in 40s and saved (failed: weather: run it again)'));
  assert.ok(!HA.rebuildFailed('nfl: context facts gathered in 40s and saved'));
});

test("a held sport's Findings line: one a sport, replaced, cleared when it records again", () => {
  const base = { v: 1, about: 'x', entries: [{ date: '2026-10-20', group: 'watching', sport: 'nba', ref: 'D66', text: 'News lag' }] };
  const a = HA.setFinding(base, 'nfl', '2026-10-23 nightly re-record held. the record guard refused', '2026-10-23');
  assert.equal(a.entries.length, 2);
  assert.equal(a.entries[1].ref, 'D86');
  assert.ok(a.entries[1].text.startsWith('History audit: '));
  const b = HA.setFinding(a, 'nfl', 'again', '2026-10-24');
  assert.equal(b.entries.length, 2);
  assert.equal(b.entries[1].date, '2026-10-24');
  const c = HA.setFinding(b, 'nfl', null, '2026-10-25');
  assert.deepEqual(c, base, 'cleared, the others kept');
});

test('the arguments', () => {
  assert.deepEqual(HA.parseArgs(['--mode', 'weekly', '--dry', '--sports', 'nfl,xyz,mma']), { mode: 'weekly', dry: true, refit: false, sports: ['nfl', 'mma'], main: 'C:\\dev\\QBRanker2026', reexec: false });
  assert.throws(() => HA.parseArgs(['--mode', 'hourly']));
  assert.deepEqual(HA.parseArgs([]).sports, HA.SPORTS);
  const ps = fs.readFileSync(path.resolve('scripts/history-audit.ps1'), 'utf8');
  for (const name of ['SeasonRanker weekly audit', 'SeasonRanker nightly audit', 'SeasonRanker audit check']) assert.ok(ps.includes(name), name);
  assert.ok(ps.includes("-DaysOfWeek Monday -At '3:30AM'"));
  assert.ok(!fs.readFileSync(path.resolve('scripts/history-audit.mjs'), 'utf8').includes('run.mjs'), 'never runs the live bettor');
});

test("D86 the record's history: a dated row a re-record, oldest first, capped", () => {
  const score = { epoch: 'E', replay: { through: '2026-10-19', overall: { bets: 10, won: 6, lost: 4, push: 0, profit: 1.5, roi: 0.05, beat: 0.6, beatN: 8, clv: 0.01 }, byBand: { lock: { bets: 0 }, medium: { bets: 10, profit: 1.5, roi: 0.05 } } } };
  const row = historyRowOf(score, { history: { lines: { gap: -0.001 }, props: { gap: 0.0002 } } }, { at: '2026-10-23T09:00:00Z', commit: 'abc' }, 'nightly');
  assert.deepEqual(row, { at: '2026-10-23T09:00:00Z', trigger: 'nightly', commit: 'abc', epoch: 'E', through: '2026-10-19', bets: 10, record: '6-4-0', units: 1.5, roi: 0.05, beat: 0.6, beatN: 8, clv: 0.01, bands: { medium: { bets: 10, units: 1.5, roi: 0.05 } }, vsBook: { lines: -0.001, props: 0.0002 } });
  let file = { sport: 'nfl' };
  for (let i = 0; i < HISTORY_MAX + 5; i++) file = addHistoryRow(file, { ...row, at: new Date(Date.parse('2026-01-01') + i * 864e5).toISOString() });
  assert.equal(file.rows.length, HISTORY_MAX);
  assert.equal(file.sport, 'nfl');
  assert.ok(file.rows[0].at < file.rows.at(-1).at);
  const gate = fs.readFileSync(path.resolve('libs/ranker/scripts/model/gate.mjs'), 'utf8');
  assert.ok(gate.includes("process.env.RECORD_TRIGGER || 'manual'"), 'every --record appends, whoever records');
});

test('D86 the recency veto: worse on the last complete season, or the current with its rows, fails the sport', () => {
  assert.deepEqual(RECENT_MIN, { props: 200, lines: 40 });
  // (A's rows and B's: B worse by 0.1 a row in `bad` seasons, the same elsewhere)
  const rows = (seasons, n, worse = [], d = 0.1) => {
    const a = [];
    const b = [];
    for (const s of seasons)
      for (let i = 0; i < n; i++) {
        const v = 0.6 + ((i * 7919) % 13) / 100;
        a.push({ k: `${s}-${i}`, c: `${s}-${i % 30}`, season: s, v });
        b.push({ k: `${s}-${i}`, c: `${s}-${i % 30}`, season: s, v: worse.includes(s) ? v + d : v });
      }
    return [a, b];
  };
  const [a1, b1] = rows([2024, 2025, 2026], 100, [2025]);
  const r1 = recencyVeto('games', a1, b1, 2026);
  assert.equal(r1.find((r) => r.which === 'complete').verdict, 'worse');
  assert.equal(r1.find((r) => r.which === 'current').verdict, 'tie');
  const v1 = sportVerdict({ proj: {}, bet: {}, recent: r1 });
  assert.equal(v1.pass, false);
  assert.ok(v1.why[0].includes('the recency veto'));
  // (the veto is never the owner's close-leg exception)
  assert.equal(ownerException({ nfl: v1 }).eligible, false);
  // (the current season counts only with its rows: 30 games under 40)
  const [a2, b2] = rows([2025, 2026], 30, [2026]);
  assert.deepEqual(recencyVeto('games', a2, b2, 2026).map((r) => r.which), ['complete']);
  const [a3, b3] = rows([2025, 2026], 60, [2026]);
  assert.equal(recencyVeto('games', a3, b3, 2026).find((r) => r.which === 'current').verdict, 'worse');
  assert.deepEqual(recencyVeto('props', a3, b3, 2026).map((r) => r.which), ['complete'], "the props' 200");
  // (better on the newest seasons passes)
  const [a4, b4] = rows([2025, 2026], 100, [2025, 2026], -0.1);
  assert.equal(sportVerdict({ recent: recencyVeto('games', a4, b4, 2026) }).pass, true);
  const gate = fs.readFileSync(path.resolve('libs/ranker/scripts/model/gate.mjs'), 'utf8');
  assert.ok(gate.includes('recencyVeto(layer, pa[layer], pb[layer], current, opts)'), 'compareScores applies it to every projection layer');
  assert.ok(fs.readFileSync(path.resolve('libs/ranker/scripts/model/DECISIONS.md'), 'utf8').includes('### D86.'));
});

test("the record paths are git pathspecs that match the record files (a bare apps/*/... matches nothing)", async () => {
  const { execFileSync } = await import('node:child_process');
  const files = execFileSync('git', ['ls-files', '--', ...HA.RECORD_PATHS], { encoding: 'utf8' }).trim().split('\n');
  for (const f of ['apps/nfl/src/StaticData/model/replay-record.json', 'apps/mma/scripts/model/history-rows.json', 'apps/nfl/src/StaticData/model/findings.json']) assert.ok(files.includes(f), f);
  assert.ok(!files.some((f) => !/^apps\/[a-z]+\/(src\/StaticData|scripts)\/model\//.test(f)), 'only the record files');
});
