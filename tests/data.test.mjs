// The generated data the apps serve (apps/<sport>/src/StaticData, written by the nightly workflows):
// every file parses; a season's playoffs (.post) and whole-season (.all) files come in pairs, have the
// same tabs as its regular season and the same fields in their rows; the sport's other per-part files
// (SPORT.seasonPartFiles) are there wherever its playoffs are; and the model desk's ledger and state
// read, every bet with the fields the desk needs (more fields are fine: the model keeps adding them).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SPORTS, expandRows, loadEngine, readJson, staticDir } from './support/engine.mjs';
import { isTracked, placement } from '../libs/ranker/scripts/model/desk.mjs';

// Every .json under a folder
function jsonFiles(dir) {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => path.join(e.parentPath ?? e.path, e.name));
}

// A sport's season folders: the current season's at the top of StaticData, the finished ones in seasons/
function seasonDirs(sport) {
  const root = staticDir(sport);
  const seasons = path.join(root, 'seasons');
  const past = fs.existsSync(seasons) ? fs.readdirSync(seasons).filter((d) => /^\d{4}$/.test(d)).map((d) => path.join(seasons, d)) : [];
  return [root, ...past];
}
const isCurrent = (dir) => path.basename(dir) === 'StaticData';
const label = (sport, dir) => `${sport} ${isCurrent(dir) ? 'current' : path.basename(dir)}`;

// A row's fields: its own, and the keys inside its stat blocks (stats.passYards)
const BLOCKS = new Set(['stats', 'box', 'advanced']);
const fieldsOf = (row) =>
  Object.entries(row).flatMap(([key, value]) =>
    BLOCKS.has(key) && value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).map((k) => `${key}.${k}`) : [key],
  );
// ...that every row of a tab has
function commonFields(rows) {
  let common = null;
  for (const row of rows) {
    const own = new Set(fieldsOf(row));
    common = common ? new Set([...common].filter((f) => own.has(f))) : own;
  }
  return common ?? new Set();
}

// Fields a row has only sometimes: an injury (a playoff list may have nobody hurt)
// (a grade's inputs, gradeIn: written where a data run read them, so a part's row a run didn't refit can lack them)
const OPTIONAL = new Set(['injured', 'injuryStatus', 'gradeIn']);
// Recent form, which a finished season's regular-season file leaves out (the app shows Recent for the
// season being played only) and its playoff files keep
const RECENT = /^(team)?[lL]astFive(Vs|Ot)?$/;

for (const sport of SPORTS) {
  test(`${sport}: every JSON file under StaticData parses`, () => {
    const files = jsonFiles(staticDir(sport));
    assert.ok(files.length > 0, `${sport}: no data files`);
    for (const file of files) {
      try {
        JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch (err) {
        assert.fail(`${sport}: ${path.relative(staticDir(sport), file)} doesn't parse: ${err.message}`);
      }
    }
  });

  test(`${sport}: season parts (.post / .all) are complete and match the regular season`, async () => {
    // (the sport's own per-part files: SPORT.seasonPartFiles, keys of SPORT.dataFiles)
    const { SPORT } = await loadEngine(sport);
    const partFiles = (SPORT.seasonPartFiles ?? []).map((key) => {
      assert.ok(SPORT.dataFiles?.[key], `${sport}: seasonPartFiles names ${key}, which isn't in dataFiles`);
      return SPORT.dataFiles[key];
    });

    for (const dir of seasonDirs(sport)) {
      const where = label(sport, dir);
      const names = new Set(fs.readdirSync(dir));
      // No .post without its .all, or the other way round (and never without the regular season's)
      for (const name of names) {
        const m = name.match(/^(.*)\.(post|all)\.json$/);
        if (!m) continue;
        const other = `${m[1]}.${m[2] === 'post' ? 'all' : 'post'}.json`;
        assert.ok(names.has(other), `${where}: ${name} without ${other}`);
        assert.ok(names.has(`${m[1]}.json`), `${where}: ${name} without ${m[1]}.json`);
      }
      if (!names.has('skill-players.post.json')) continue;

      for (const file of partFiles) {
        for (const part of ['post', 'all']) {
          const name = file.replace(/\.json$/, `.${part}.json`);
          assert.ok(names.has(name), `${where}: has its playoffs but no ${name} (SPORT.seasonPartFiles)`);
        }
      }

      const regular = expandRows(readJson(path.join(dir, 'skill-players.json')));
      for (const part of ['post', 'all']) {
        const rows = expandRows(readJson(path.join(dir, `skill-players.${part}.json`)));
        assert.deepEqual(Object.keys(rows).sort(), Object.keys(regular).sort(), `${where}: skill-players.${part}.json's tabs differ from skill-players.json's`);
        for (const [tab, regRows] of Object.entries(regular)) {
          assert.ok(Array.isArray(rows[tab]), `${where} ${part} ${tab}: not a list of rows`);
          // Every field each regular-season row has, each row of the part has
          const need = [...commonFields(regRows)].filter((f) => !OPTIONAL.has(f));
          for (const row of rows[tab]) {
            const own = new Set(fieldsOf(row));
            const missing = need.filter((f) => !own.has(f));
            assert.deepEqual(missing, [], `${where} ${part} ${tab}: ${row.name ?? row.gsisId} is missing ${missing.join(', ')}`);
          }
          // ...and the part has no field (in every row) that the regular season never has
          if (!rows[tab].length || !regRows.length) continue;
          const regAny = new Set(regRows.flatMap(fieldsOf));
          const finished = !isCurrent(dir);
          const extra = [...commonFields(rows[tab])].filter(
            (f) => !regAny.has(f) && !(finished && RECENT.test(f)),
          );
          assert.deepEqual(extra, [], `${where} ${part} ${tab}: has ${extra.join(', ')}, which skill-players.json doesn't`);
        }
      }
    }
  });
}

// The NFL's defensive player tabs (EDGE, DL, LB, CB, S: update-data.mjs defensePlayers, backfilled to 2000): in
// every season's ranked and unranked files, each part's, shaped like the offensive player tabs' rows (an ESPN id
// for the headshot where nflverse has one, the gsis id, games, the stats block) and no one on two of them a season
test('nfl: the defensive player tabs are in every season and part, shaped like the other player tabs', () => {
  const DEF_TABS = ['EDGE', 'DL', 'LB', 'CB', 'S'];
  for (const dir of seasonDirs('nfl')) {
    const where = label('nfl', dir);
    for (const name of ['skill-players.json', 'skill-players.post.json', 'skill-players.all.json']) {
      const file = path.join(dir, name);
      if (!fs.existsSync(file)) continue;
      const rows = readJson(file);
      const urFile = path.join(dir, name.replace('skill-players', 'skill-players.ur'));
      const ur = fs.existsSync(urFile) ? readJson(urFile) : {};
      const seen = new Set();
      for (const tab of DEF_TABS) {
        assert.ok(Array.isArray(rows[tab]) && rows[tab].length > 0, `${where} ${name}: no ${tab} rows`);
        for (const row of [...rows[tab], ...(ur[tab] ?? [])]) {
          assert.ok(typeof row.gsisId === 'string' && row.gsisId.startsWith('00-'), `${where} ${name} ${tab}: ${row.name} gsisId`);
          assert.ok(row.id === null || Number.isInteger(row.id), `${where} ${name} ${tab}: ${row.name} id`);
          assert.ok(Number.isInteger(row.games) && row.games > 0, `${where} ${name} ${tab}: ${row.name} games`);
          assert.ok(row.stats && typeof row.stats.tackles === 'number' && typeof row.stats.sacks === 'number', `${where} ${name} ${tab}: ${row.name} stats`);
          assert.ok(!seen.has(row.gsisId), `${where} ${name}: ${row.name} on two defensive tabs`);
          seen.add(row.gsisId);
        }
        // (the ranked rows have headshots to show: nearly every one has an ESPN id)
        const withId = rows[tab].filter((row) => row.id).length;
        assert.ok(withId >= rows[tab].length * 0.9, `${where} ${name} ${tab}: only ${withId} of ${rows[tab].length} rows have an ESPN id`);
      }
    }
  }
});

// The model desk (libs/ranker/scripts/model/run.mjs writes these): only the fields the desk and its page
// rely on are required, so the model can add more
const STATUSES = new Set(['open', 'won', 'lost', 'push']);
const isDate = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));

// A ledger row the desk and its page can read: a bet, or a tracked row (desk.mjs TRACK)
function betWhole(bet, sport, at) {
  assert.equal(typeof bet.event, 'string', `${at}: event`);
  assert.equal(bet.sport, sport, `${at}: sport`);
  assert.ok(isDate(bet.start), `${at}: start ${bet.start}`);
  if ('placedAt' in bet) assert.ok(isDate(bet.placedAt), `${at}: placedAt ${bet.placedAt}`);
  for (const key of ['matchup', 'market', 'side', 'pick']) assert.equal(typeof bet[key], 'string', `${at}: ${key}`);
  assert.ok(bet.line === null || Number.isFinite(bet.line), `${at}: line ${bet.line}`);
  assert.ok(Number.isFinite(bet.odds), `${at}: odds ${bet.odds}`);
  // (a tracked row, a market with no edge since 2026-10-13 (desk.mjs TRACK): units 0, never staked, what it
  // would have staked kept (trackUnits), no profit on the record)
  if (isTracked(bet)) {
    assert.equal(bet.units, 0, `${at}: a tracked row staked ${bet.units}`);
    assert.ok(Number.isFinite(bet.trackUnits) && bet.trackUnits > 0, `${at}: trackUnits ${bet.trackUnits}`);
    assert.ok(bet.profit === 0, `${at}: a tracked row with a profit ${bet.profit}`);
  } else assert.ok(Number.isFinite(bet.units) && bet.units > 0, `${at}: units ${bet.units}`);
  for (const key of ['model', 'fair', 'p', 'ev']) if (key in bet) assert.ok(Number.isFinite(bet[key]), `${at}: ${key} ${bet[key]}`);
  assert.ok(STATUSES.has(bet.status), `${at}: status ${bet.status}`);
  assert.ok(Number.isFinite(bet.profit), `${at}: profit ${bet.profit}`);
  if (bet.status === 'open') assert.equal(bet.profit, 0, `${at}: an open bet with a profit`);
  if (bet.market === 'prop') for (const key of ['player', 'propType']) assert.equal(typeof bet[key], 'string', `${at}: ${key}`);
}

// (a tracked row as the desk writes it passes, a staked or paid one doesn't: the nightly check reads the
// ledgers before the first live tracked row is in one)
test('model ledger: a tracked row (units 0) is whole, a staked or paid one is not', () => {
  const row = { id: 'nhl-x-ml-home', event: 'x', sport: 'nhl', start: '2026-10-14T23:00:00Z', matchup: 'A @ B', market: 'ml', side: 'home', pick: 'B', line: null, odds: -110, model: 0.5, fair: 0.5, p: 0.5, ev: -0.04, status: 'won', profit: 0, ...placement(false, 0.5) };
  betWhole(row, 'nhl', 'tracked');
  assert.throws(() => betWhole({ ...row, units: 0.5 }, 'nhl', 'staked'));
  assert.throws(() => betWhole({ ...row, profit: 0.45 }, 'nhl', 'paid'));
  assert.throws(() => betWhole({ ...row, trackUnits: undefined }, 'nhl', 'no stake kept'));
  betWhole({ ...row, ...placement(true, 1), profit: 0.91 }, 'nhl', 'edge');
  assert.throws(() => betWhole({ ...row, intent: 'edge', units: 0 }, 'nhl', 'an edge bet at 0'));
});

for (const sport of SPORTS) {
  const dir = path.join(staticDir(sport), 'model');
  if (!fs.existsSync(dir)) continue;
  test(`${sport}: model ledger and state parse, and every bet is whole`, () => {
    const statePath = path.join(dir, 'state.json');
    if (fs.existsSync(statePath)) {
      const state = readJson(statePath);
      assert.ok(state && typeof state === 'object' && !Array.isArray(state), 'state.json is not an object');
      if ('sport' in state) assert.equal(state.sport, sport);
    }
    const ledgerPath = path.join(dir, 'ledger.json');
    if (!fs.existsSync(ledgerPath)) return;
    const ledger = readJson(ledgerPath);
    assert.ok(Array.isArray(ledger.bets), 'ledger.json has no bets list');
    if ('sport' in ledger) assert.equal(ledger.sport, sport);
    if ('bankroll' in ledger) assert.ok(Number.isFinite(ledger.bankroll), 'bankroll');
    const ids = new Set();
    for (const bet of ledger.bets) {
      const at = `${sport} bet ${bet?.id}`;
      assert.equal(typeof bet.id, 'string', `${at}: id`);
      assert.ok(!ids.has(bet.id), `${at}: id placed twice`);
      ids.add(bet.id);
      betWhole(bet, sport, at);
    }
    // (the CHECKs, apart from the bets in their own file (checks.json; an older ledger's checks): markets too
    // far from the book to bet, no units, graded as if bet (checks.mjs))
    if ('checks' in ledger) assert.ok(Array.isArray(ledger.checks), 'ledger.json: checks');
    const checksPath = path.join(dir, 'checks.json');
    const checksFile = fs.existsSync(checksPath) ? readJson(checksPath) : null;
    if (checksFile) {
      assert.equal(checksFile.sport, sport, 'checks.json: sport');
      assert.ok(Array.isArray(checksFile.checks), 'checks.json: checks');
    }
    const checkIds = new Set();
    for (const c of checksFile?.checks ?? ledger.checks ?? []) {
      const at = `${sport} CHECK ${c?.id}`;
      assert.equal(typeof c.id, 'string', `${at}: id`);
      assert.ok(!checkIds.has(c.id), `${at}: kept twice`);
      checkIds.add(c.id);
      assert.equal(c.sport, sport, `${at}: sport`);
      assert.equal(c.intent, 'check', `${at}: intent`);
      assert.equal(c.units, 0, `${at}: units`);
      assert.ok(isDate(c.start), `${at}: start`);
      for (const key of ['matchup', 'market', 'side', 'pick', 'reason']) assert.equal(typeof c[key], 'string', `${at}: ${key}`);
      assert.ok(Number.isFinite(c.odds), `${at}: odds`);
      for (const key of ['model', 'fair', 'gap']) assert.ok(Number.isFinite(c[key]), `${at}: ${key}`);
      if (c.checkResult) assert.ok(STATUSES.has(c.checkResult.status), `${at}: result ${c.checkResult.status}`);
      if (c.closedAt) assert.ok(isDate(c.closedAt), `${at}: closedAt`);
    }
  });

  // The public Book's picks (libs/ranker/scripts/model/picks.mjs): the algorithm's top bets, ranked
  test(`${sport}: model picks are whole and ranked`, () => {
    const picksPath = path.join(dir, 'picks.json');
    if (!fs.existsSync(picksPath)) return;
    const file = readJson(picksPath);
    assert.ok(isDate(file.at), 'picks.json: at');
    assert.ok(Array.isArray(file.picks), 'picks.json: no picks list');
    if (file.record) for (const key of ['overall', 'byLevel']) assert.ok(file.record[key], `picks.json: record.${key}`);
    const KINDS = new Set(['spread', 'total', 'team_total', 'moneyline', 'player', 'team_stat']);
    // (the bands, by the Kelly score: a lock above them all; picks.mjs BANDS. Never a CHECK: the page reads
    // every pick as a bet the bot made, so they're in their own list, checks)
    const LEVELS = new Set(['lock', 'high', 'medium', 'low']);
    let last = Infinity;
    for (const [i, p] of file.picks.entries()) {
      const at = `${sport} pick ${i + 1}`;
      assert.equal(p.sport, sport, `${at}: sport`);
      for (const key of ['id', 'pick', 'matchup', 'market', 'book', 'reason']) assert.equal(typeof p[key], 'string', `${at}: ${key}`);
      // (its write-up's: the risk line, and the AI's headline, by and read where there are; reason never empty)
      assert.ok(p.reason.length > 0, `${at}: reason empty`);
      for (const key of ['risk', 'headline', 'by', 'read']) if (p[key] !== undefined) assert.equal(typeof p[key], 'string', `${at}: ${key}`);
      assert.ok(KINDS.has(p.kind), `${at}: kind ${p.kind}`);
      assert.ok(LEVELS.has(p.level), `${at}: level ${p.level}`);
      // (a Kelly score: 0 or under for a pick with no edge on its price; files before it, the chance)
      assert.ok(Number.isFinite(p.score), `${at}: score ${p.score}`);
      assert.ok(p.score <= last, `${at}: not in score order`);
      last = p.score;
      assert.ok(Number.isFinite(p.odds), `${at}: odds`);
      assert.ok(isDate(p.start), `${at}: start`);
      assert.ok(Array.isArray(p.teams) && p.teams.length === 2, `${at}: teams`);
    }
    // (the CHECKs, their own list (checks.mjs): level 'check', no units, the biggest model Kelly first (picks.mjs,
    // since the CHECK rule; the gap when the Kelly ties)
    if ('checks' in file) assert.ok(Array.isArray(file.checks), 'picks.json: checks');
    let kelly = Infinity;
    for (const [i, c] of (file.checks ?? []).entries()) {
      const at = `${sport} CHECK pick ${i + 1}`;
      assert.equal(c.level, 'check', `${at}: level`);
      assert.equal(c.units, 0, `${at}: units`);
      for (const key of ['id', 'pick', 'matchup', 'reason', 'checkReason']) assert.equal(typeof c[key], 'string', `${at}: ${key}`);
      if (c.risk !== undefined) assert.equal(typeof c.risk, 'string', `${at}: risk`);
      assert.ok(Number.isFinite(c.gap), `${at}: gap ${c.gap}`);
      // (ordered by the cleared Kelly they're judged by since 940fd86a (checkKelly); a file from before it, the model's)
      const by = (file.checks ?? []).some((x) => 'checkKelly' in x) ? 'checkKelly' : 'modelKelly';
      const k = Number.isFinite(c[by]) ? c[by] : -Infinity;
      assert.ok(k <= kelly, `${at}: ${by} ${c[by]} after ${kelly}`);
      kelly = k;
    }
  });

  // The weekly self-check (libs/ranker/scripts/model/selfcheck.mjs): every check's status one of the six, its
  // numbers finite, the summary's counts its checks'
  test(`${sport}: model self-check is whole`, () => {
    const file = path.join(dir, 'selfcheck.json');
    if (!fs.existsSync(file)) return;
    const sc = readJson(file);
    const OK = new Set(['flag', 'watch', 'partial', 'ok', 'thin', 'info']);
    assert.equal(sc.sport, sport, 'selfcheck.json: sport');
    assert.ok(isDate(sc.at), 'selfcheck.json: at');
    for (const key of ['from', 'to']) assert.match(sc.window?.[key] ?? '', /^\d{4}-\d{2}-\d{2}$/, `selfcheck.json: window.${key}`);
    assert.ok(Array.isArray(sc.checks) && sc.checks.length, 'selfcheck.json: no checks');
    const ids = new Set();
    for (const c of sc.checks) {
      const at = `${sport} self-check ${c?.id}`;
      assert.match(c.id, /^C\d+$/, `${at}: id`);
      assert.ok(!ids.has(c.id), `${at}: twice`);
      ids.add(c.id);
      assert.ok(OK.has(c.status), `${at}: status ${c.status}`);
      for (const key of ['title', 'headline', 'how']) assert.equal(typeof c[key], 'string', `${at}: ${key}`);
      for (const key of ['value', 'n', 'tested']) assert.ok(c[key] === null || Number.isFinite(c[key]), `${at}: ${key} ${c[key]}`);
      assert.ok(Array.isArray(c.rows) && Array.isArray(c.examples), `${at}: rows or examples`);
      assert.ok(c.needs === null || (Array.isArray(c.needs) && c.needs.length), `${at}: needs`);
      // (no NaN or Infinity hidden in a row: JSON writes them null, so a number there is finite)
      JSON.stringify(c.rows, (k, v) => {
        if (typeof v === 'number') assert.ok(Number.isFinite(v), `${at}: rows.${k}`);
        return v;
      });
    }
    for (const s of OK) assert.equal(sc.summary?.[s], sc.checks.filter((c) => c.status === s).length, `selfcheck.json: summary.${s}`);
  });

  // The replay gate's scorecard (libs/ranker/scripts/model/gate.mjs --record): a version an entry, oldest epoch first,
  // each keyed by its epoch and commit once, its numbers finite or null
  test(`${sport}: model scorecard is whole`, () => {
    const file = path.join(dir, 'scorecard.json');
    if (!fs.existsSync(file)) return;
    const sc = readJson(file);
    assert.equal(sc.sport, sport, 'scorecard.json: sport');
    assert.ok(Array.isArray(sc.entries), 'scorecard.json: entries');
    const keys = new Set();
    let last = '';
    for (const e of sc.entries) {
      const at = `${sport} scorecard ${e.epoch} ${e.commit}`;
      assert.equal(e.sport, sport, `${at}: sport`);
      assert.ok(isDate(e.at), `${at}: at`);
      assert.ok(!keys.has(`${e.epoch}|${e.commit}`), `${at}: twice`);
      keys.add(`${e.epoch}|${e.commit}`);
      assert.ok(String(e.epoch) >= last, `${at}: out of order`);
      last = String(e.epoch);
      for (const set of ['frozen', 'rolling'])
        for (const layer of ['props', 'lines']) {
          const s = e[set]?.[layer];
          if (s === null || s === undefined) continue;
          assert.ok(Number.isInteger(s.n) && s.n > 0, `${at}: ${set}.${layer}.n`);
          for (const k of ['gap', 'closeGap', 'clv', 'hit']) assert.ok(s[k] === null || s[k] === undefined || Number.isFinite(s[k]), `${at}: ${set}.${layer}.${k} ${s[k]}`);
        }
    }
  });
}

// The game view's kept highlights (libs/ranker/scripts/highlights.mjs writes StaticData/highlights/<season>.json):
// each game's a list of clips, and every clip has something to play (a YouTube id or a video file) and a title
for (const sport of SPORTS) {
  const dir = path.join(staticDir(sport), 'highlights');
  if (!fs.existsSync(dir)) continue;
  test(`${sport}: kept highlights are whole`, () => {
    for (const name of fs.readdirSync(dir)) {
      assert.match(name, /^\d{4}\.json$/, `${sport} highlights: ${name} isn't a season's file`);
      const kept = readJson(path.join(dir, name));
      assert.ok(kept && typeof kept === 'object' && !Array.isArray(kept), `${sport} highlights/${name}: not an object`);
      for (const [id, clips] of Object.entries(kept)) {
        const at = `${sport} highlights/${name} game ${id}`;
        assert.match(id, /^\d+$/, `${at}: not an ESPN event id`);
        assert.ok(Array.isArray(clips) && clips.length, `${at}: no clips`);
        for (const c of clips) {
          assert.equal(typeof c.title, 'string', `${at}: a clip without a title`);
          assert.ok((typeof c.youtube === 'string' && c.youtube) || (typeof c.src === 'string' && c.src), `${at}: "${c.title}" has no YouTube id or video file`);
          assert.ok(c.duration === null || Number.isFinite(c.duration), `${at}: "${c.title}" duration ${c.duration}`);
        }
      }
    }
  });
}
