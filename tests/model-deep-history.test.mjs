// D67: the deep history's archives (deep-history.mjs) parse, keep every price on its outcome's name, and stay out of
// what the desk, the gate and the replay read (intraday.mjs readIntraday reads intraday/ only, never intraday/dense/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { BOOK_CODES, DEEP_SPORTS, JOBS, buildMarketRows, denseDir, readDeep, wideLines, wideOutcomes } from '../libs/ranker/scripts/model/deep-history.mjs';
import { intradayDir } from '../libs/ranker/scripts/model/intraday.mjs';
import { WIDE_BOOKS } from '../libs/ranker/scripts/model/oddsapi.mjs';

const codes = new Set(Object.values(BOOK_CODES));

test('D67 every book a call names has a code, ten books one region', () => {
  assert.equal(WIDE_BOOKS.length, 10);
  for (const b of WIDE_BOOKS) assert.ok(BOOK_CODES[b], b);
  assert.equal(new Set(JOBS.map((j) => j.id)).size, JOBS.length);
});

test('D67 the compact answers keep each price on its own name, every book', () => {
  const ev = {
    home_team: 'A',
    away_team: 'B',
    bookmakers: [
      { key: 'fanduel', markets: [{ key: 'h2h', outcomes: [{ name: 'B', price: 120 }, { name: 'A', price: -140 }] }, { key: 'team_totals', outcomes: [{ name: 'Over', description: 'A', point: 24.5, price: -110 }] }] },
      { key: 'nobook', markets: [{ key: 'h2h', outcomes: [{ name: 'A', price: 1 }, { name: 'B', price: 1 }] }] },
    ],
  };
  assert.deepEqual(wideLines(ev), { fd: { h2h: [null, -140, 120] } });
  assert.deepEqual(wideOutcomes(ev, ['team_totals']), [['fd', 'team_totals', 'Over', 'A', 24.5, -110]]);
  const rows = buildMarketRows([{ oid: 'x', ts: '2024-01-01T00:00:00Z', rows: [['fd', 'team_totals', 'Over', 'A', 24.5, -110]] }, { oid: 'x', ts: '2024-01-01T01:00:00Z', rows: [['fd', 'team_totals', 'Over', 'A', 24.5, -110]] }], [{ oid: 'x', season: 2024 }]);
  assert.equal(rows.get(2024).filter((r) => r[0] === 'M').length, 1);
});

test('D67 the committed deep files parse, outside readIntraday\'s folder', () => {
  let files = 0;
  for (const sport of DEEP_SPORTS) {
    const dir = denseDir(sport);
    assert.notEqual(dir, intradayDir(sport));
    if (!existsSync(dir)) continue;
    files += readdirSync(dir).filter((f) => f.endsWith('.jsonl.gz')).length;
    const { lines, props, markets, snaps } = readDeep(sport);
    for (const list of lines.values()) for (const r of list) {
      assert.ok(codes.has(r.book), r.book);
      assert.ok(['h2h', 'spreads', 'totals'].includes(r.market));
      assert.ok(Number.isFinite(r.ts));
    }
    for (const r of props) assert.ok(r.length === 9 && codes.has(r[3]));
    for (const r of markets) assert.ok(r.length === 9 && codes.has(r[3]) && Number.isFinite(r[8]));
    assert.ok(snaps.every((t) => Number.isFinite(Date.parse(t))));
  }
  assert.ok(files > 0, 'no deep files committed');
});
