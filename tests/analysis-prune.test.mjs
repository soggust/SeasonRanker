// Taking down stale weekly analyses (libs/ranker/scripts/analysis/prune.mjs) in every sport's publish step:
// the NFL's (apps/nfl/scripts/analysis/analyze.mjs) and MLB, NBA and NHL's (libs/ranker/scripts/analysis/
// analyze.mjs). A preview goes once its games are played and the latest run didn't replace it, or when its
// subject isn't one the pipeline writes, or it's another season's; a recap never goes on its own, and a
// publish with no kept reports keeps every current preview. No network and no calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gamesOf, latestRun, staleReason, todayOf, RUN_WINDOW_MS } from '../libs/ranker/scripts/analysis/prune.mjs';
import { publish as nflPublish, NFL_COVERS } from '../apps/nfl/scripts/analysis/analyze.mjs';
import { publish as teamPublish } from '../libs/ranker/scripts/analysis/analyze.mjs';

const quiet = () => {};
const NOW = new Date('2026-10-15T15:00:00Z'); // a Thursday, 10am Central
const take = { take: 't', strengths: [], concerns: [] };
const recapReport = { archetype: { name: 'x', definition: 'x' }, headline: 'h', recap: { finish: '6-11', body: 'b' } };
const preview = (at, date, extra = {}) => ({ at, model: 'm', game: { week: 6, date, opp: 'CHI', at: 'home', line: null }, report: take, ...extra });

function nflSite(files, index) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'nfl-prune-'));
  const siteDir = path.join(dir, 'site');
  mkdirSync(siteDir);
  for (const [f, j] of Object.entries(files)) writeFileSync(path.join(siteDir, `${f}.json`), JSON.stringify(j));
  writeFileSync(path.join(siteDir, 'index.json'), JSON.stringify(index));
  // (no kept reports and no dossiers: a machine with an empty cache)
  return { dir, siteDir, reportsDir: path.join(dir, 'reports'), base: dir };
}
const files = (siteDir) => readdirSync(siteDir).sort();
const index = (siteDir) => JSON.parse(readFileSync(path.join(siteDir, 'index.json'), 'utf8'));

test('the rule: today in Central time, the games a preview looks at, the latest run', () => {
  assert.equal(todayOf(new Date('2026-10-19T03:00:00Z')), '2026-10-18'); // Sunday night in Chicago
  assert.deepEqual(gamesOf({ game: { date: '2026-10-18' } }), ['2026-10-18']);
  assert.deepEqual(gamesOf({ game: null, week: [{ date: '2026-10-16' }, { date: '2026-10-19' }] }), ['2026-10-16', '2026-10-19']);
  assert.equal(latestRun([{ at: '2026-10-13T13:00:00Z' }, null, { at: '2026-10-06T02:00:00Z' }]), Date.parse('2026-10-13T13:00:00Z'));
  const o = { season: '2026', today: '2026-10-20', latest: Date.parse('2026-10-20T13:00:00Z'), covers: NFL_COVERS };
  // a recap: never
  assert.equal(staleReason('team-KC', { mode: 'recap', season: '2025', at: '2026-01-10T00:00:00Z' }, o), null);
  // the latest run: kept even with its game played
  assert.equal(staleReason('team-KC', preview('2026-10-20T12:00:00Z', '2026-10-18'), o), null);
  // an older run with its game ahead: kept; played: stale
  assert.equal(staleReason('QB-1', preview(new Date(o.latest - RUN_WINDOW_MS - 1).toISOString(), '2026-10-20'), o), null);
  assert.match(staleReason('QB-1', preview('2026-10-13T13:00:00Z', '2026-10-19'), o), /played/);
  // a subject the pipeline doesn't write, even fresh with its game ahead
  assert.match(staleReason('00-0038542', preview('2026-10-20T12:00:00Z', '2026-10-25'), o), /not a subject/);
  // another season's preview
  assert.match(staleReason('team-KC', preview('2026-10-20T12:00:00Z', '2026-10-25', { mode: 'preview', season: '2025' }), o), /2025 season/);
  // unreadable: left alone
  assert.equal(staleReason('team-KC', null, o), null);
});

test("NFL: an empty cache keeps the latest run's previews and a recap, takes down a played week's leftover and a running back's", () => {
  const { siteDir, reportsDir, base } = nflSite(
    {
      'team-BAL': preview('2026-10-13T13:47:43Z', '2026-10-18'),
      'QB-1': preview('2026-10-13T13:47:43Z', '2026-10-18'),
      // a QB benched: last week's preview, its game played, not in the latest run
      'QB-2': preview('2026-10-06T13:00:00Z', '2026-10-12'),
      // an older run's preview whose game is still ahead (Thursday's game: today)
      'QB-3': preview('2026-10-06T13:00:00Z', '2026-10-15'),
      // the old experiment's back
      '00-0038542': preview('2026-10-06T02:56:18Z', '2026-10-18'),
      // a recap, however old
      'team-KC': { at: '2026-01-06T10:00:00Z', mode: 'recap', season: '2026', ended: 'x', game: null, report: recapReport },
    },
    { 'TM-BAL': 'team-BAL', 'DEF-BAL': 'team-BAL', 'QB-1': 'QB-1', 'QB-2': 'QB-2', 'QB-3': 'QB-3', '00-0038542': '00-0038542', 'TM-KC': 'team-KC' },
  );
  const before = readFileSync(path.join(siteDir, 'team-BAL.json'), 'utf8');
  const stale = nflPublish({ siteDir, reportsDir, base, season: 2026, now: NOW, log: quiet });
  assert.deepEqual(stale.map((s) => s.file).sort(), ['00-0038542', 'QB-2']);
  assert.deepEqual(files(siteDir), ['QB-1.json', 'QB-3.json', 'index.json', 'team-BAL.json', 'team-KC.json']);
  assert.deepEqual(index(siteDir), { 'TM-BAL': 'team-BAL', 'DEF-BAL': 'team-BAL', 'QB-1': 'QB-1', 'QB-3': 'QB-3', 'TM-KC': 'team-KC' });
  // (the files kept aren't rewritten)
  assert.equal(readFileSync(path.join(siteDir, 'team-BAL.json'), 'utf8'), before);
});

test("NFL: a new run's report replaces last week's; a newer file out stays over an older kept report", () => {
  const { siteDir, reportsDir, base } = nflSite(
    { 'team-BAL': preview('2026-10-06T13:00:00Z', '2026-10-12'), 'team-KC': preview('2026-10-13T13:00:00Z', '2026-10-19') },
    { 'TM-BAL': 'team-BAL', 'TM-KC': 'team-KC' },
  );
  mkdirSync(reportsDir);
  writeFileSync(path.join(base, 'index.json'), '[]');
  writeFileSync(path.join(base, 'team-index.json'), JSON.stringify([{ team: 'BAL', siteIds: ['TM-BAL'] }, { team: 'KC', siteIds: ['TM-KC'] }]));
  writeFileSync(path.join(reportsDir, 'team-BAL.json'), JSON.stringify({ id: 'team-BAL', mode: 'preview', season: '2026', at: '2026-10-13T13:00:00Z', model: 'm', report: take, site: take }));
  writeFileSync(path.join(reportsDir, 'team-KC.json'), JSON.stringify({ id: 'team-KC', mode: 'preview', season: '2026', at: '2026-09-29T13:00:00Z', model: 'm', report: take, site: take }));
  nflPublish({ siteDir, reportsDir, base, season: 2026, now: NOW, log: quiet });
  const read = (f) => JSON.parse(readFileSync(path.join(siteDir, f), 'utf8'));
  assert.equal(read('team-BAL.json').at, '2026-10-13T13:00:00Z');
  assert.equal(read('team-KC.json').at, '2026-10-13T13:00:00Z');
  assert.deepEqual(index(siteDir), { 'TM-BAL': 'team-BAL', 'TM-KC': 'team-KC' });
});

test("NFL rollover: last season's recaps stay until this season's first report replaces each; a stale preview of last season goes", () => {
  const recap = (team) => ({ at: '2027-01-06T10:00:00Z', mode: 'recap', season: '2026', ended: 'x', game: null, report: recapReport });
  const { siteDir, reportsDir, base } = nflSite(
    { 'team-KC': recap('KC'), 'team-BUF': recap('BUF'), 'QB-9': preview('2027-01-03T10:00:00Z', '2027-01-04', { mode: 'preview', season: '2026' }) },
    { 'TM-KC': 'team-KC', 'TM-BUF': 'team-BUF', 'QB-9': 'QB-9' },
  );
  const now = new Date('2027-09-02T15:00:00Z');
  // the new season, before any preview: every recap stays, last season's leftover preview goes
  nflPublish({ siteDir, reportsDir, base, season: 2027, now, log: quiet });
  assert.deepEqual(files(siteDir), ['index.json', 'team-BUF.json', 'team-KC.json']);
  // the first preview of 2027 for KC replaces its recap; BUF's stays
  mkdirSync(reportsDir);
  writeFileSync(path.join(base, 'index.json'), '[]');
  writeFileSync(path.join(base, 'team-index.json'), JSON.stringify([{ team: 'KC', siteIds: ['TM-KC'] }, { team: 'BUF', siteIds: ['TM-BUF'] }]));
  writeFileSync(path.join(reportsDir, 'team-KC.json'), JSON.stringify({ id: 'team-KC', mode: 'preview', season: '2027', at: '2027-09-08T13:00:00Z', model: 'm', report: take, site: take }));
  // (last season's preview still in the cache isn't published again)
  writeFileSync(path.join(reportsDir, 'team-BUF.json'), JSON.stringify({ id: 'team-BUF', mode: 'preview', season: '2026', at: '2027-01-08T13:00:00Z', model: 'm', report: take, site: take }));
  nflPublish({ siteDir, reportsDir, base, season: 2027, now: new Date('2027-09-08T15:00:00Z'), log: quiet });
  const read = (f) => JSON.parse(readFileSync(path.join(siteDir, f), 'utf8'));
  assert.deepEqual([read('team-KC.json').mode, read('team-KC.json').season], ['preview', '2027']);
  assert.deepEqual([read('team-BUF.json').mode, read('team-BUF.json').season], ['recap', '2026']);
  assert.deepEqual(index(siteDir), { 'TM-KC': 'team-KC', 'TM-BUF': 'team-BUF' });
});

function teamSite(files) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'team-prune-'));
  const site = path.join(dir, 'site');
  mkdirSync(site);
  for (const [f, j] of Object.entries(files)) writeFileSync(path.join(site, `${f}.json`), JSON.stringify(j));
  return { site, dir: path.join(dir, 'reports') };
}
const teamPreview = (key, at, dates, season = '2026-27') => ({ at, model: 'm', mode: 'preview', season, siteIds: [`TM-${key}`], game: null, week: dates.map((date) => ({ date, opp: 'X', at: 'home' })), report: take });

test("MLB, NBA, NHL: an empty cache keeps the latest run and a recap; a played week another run left goes", () => {
  const { site, dir } = teamSite({
    'team-BOS': teamPreview('BOS', '2026-10-14T23:59:51Z', ['2026-10-16', '2026-10-17']),
    'team-ANA': teamPreview('ANA', '2026-10-14T23:59:51Z', ['2026-10-10']),
    // a week ago's run: one with a game still ahead stays, one played goes
    'team-DAL': teamPreview('DAL', '2026-10-07T23:00:00Z', ['2026-10-12', '2026-10-15']),
    'team-COL': teamPreview('COL', '2026-10-07T23:00:00Z', ['2026-10-09', '2026-10-12']),
    'team-NYR': { at: '2026-04-20T00:00:00Z', model: 'm', mode: 'recap', season: '2026-27', siteIds: ['TM-NYR'], game: null, ended: 'x', report: recapReport },
    // not a team: no subject the pipeline writes
    'player-1': teamPreview('P1', '2026-10-14T23:59:51Z', ['2026-10-16']),
  });
  const stale = teamPublish('nhl', '2026-27', { site, dir, now: NOW, log: quiet });
  assert.deepEqual(stale.map((s) => s.file).sort(), ['player-1', 'team-COL']);
  assert.deepEqual(files(site), ['index.json', 'team-ANA.json', 'team-BOS.json', 'team-DAL.json', 'team-NYR.json']);
  assert.deepEqual(index(site), { 'TM-ANA': 'team-ANA', 'TM-BOS': 'team-BOS', 'TM-DAL': 'team-DAL', 'TM-NYR': 'team-NYR' });
});

test("MLB, NBA, NHL rollover: last season's recap stays until the team's first preview; last season's previews go", () => {
  const recap = (key) => ({ at: '2026-10-14T07:10:26Z', model: 'm', mode: 'recap', season: '2026', siteIds: [`TM-${key}`], game: null, ended: 'x', report: recapReport });
  const { site, dir } = teamSite({ 'team-108': recap('108'), 'team-109': recap('109'), 'team-110': teamPreview('110', '2026-09-20T00:00:00Z', ['2026-09-27'], '2026') });
  const spring = new Date('2027-03-20T15:00:00Z');
  teamPublish('mlb', '2027', { site, dir, now: spring, log: quiet });
  assert.deepEqual(files(site), ['index.json', 'team-108.json', 'team-109.json']);
  mkdirSync(dir);
  writeFileSync(path.join(dir, 'team-108.json'), JSON.stringify({ key: '108', mode: 'preview', season: '2027', siteIds: ['TM-108'], week: [{ date: '2027-03-27' }], at: '2027-03-20T12:00:00Z', model: 'm', site: take }));
  teamPublish('mlb', '2027', { site, dir, now: spring, log: quiet });
  const read = (f) => JSON.parse(readFileSync(path.join(site, f), 'utf8'));
  assert.deepEqual([read('team-108.json').mode, read('team-108.json').season], ['preview', '2027']);
  assert.deepEqual([read('team-109.json').mode, read('team-109.json').season], ['recap', '2026']);
  assert.deepEqual(index(site), { 'TM-108': 'team-108', 'TM-109': 'team-109' });
});

test('every published analysis today: nothing stale (only teams and QBs in the NFL; every preview current)', () => {
  for (const sport of ['nfl', 'mlb', 'nba', 'nhl']) {
    const dir = path.resolve(import.meta.dirname, `../apps/${sport}/src/StaticData/analysis`);
    if (!existsSync(dir)) continue;
    const idx = JSON.parse(readFileSync(path.join(dir, 'index.json'), 'utf8'));
    for (const f of readdirSync(dir)) {
      if (f === 'index.json') continue;
      if (sport === 'nfl') assert.ok(NFL_COVERS(f.slice(0, -5)), `${sport}/${f}`);
      else assert.ok(f.startsWith('team-'), `${sport}/${f}`);
    }
    for (const file of Object.values(idx)) assert.ok(existsSync(path.join(dir, `${file}.json`)), `${sport}: ${file}`);
  }
});
