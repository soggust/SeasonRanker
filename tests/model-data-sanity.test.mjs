// The data-quality audit (2026-10-24): the history's prices are only what was on the board. A change-only intraday or
// dense row no longer stands once its book pulled the market or the event left the board (intraday.mjs buildRows' G
// rows, read by readIntraday and readDeep, honoured by gate-history.mjs intradayLines and best-price.mjs shopRows);
// MLB's 2020 opening week's lines are quarantined from the gate's history (gate-history.mjs LINE_QUARANTINE); a
// Pinnacle pair with a negative vig (the NHL 2020 bubble's 3-way prices) is never the fair (sharpPair).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { buildRows, goneRow, intradayDir, readIntraday } from '../libs/ranker/scripts/model/intraday.mjs';
import { readDeep, denseDir } from '../libs/ranker/scripts/model/deep-history.mjs';
import { LINE_QUARANTINE, devig, historyLineBets, intradayLines, loadHistory, quarantined, sharpPair } from '../libs/ranker/scripts/model/gate-history.mjs';
import { shopRows } from '../libs/ranker/scripts/model/best-price.mjs';

const H = 36e5;
const T0 = Date.parse('2025-01-10T00:00:00Z');
const iso = (t) => new Date(t).toISOString().replace('.000Z', 'Z');
const ev = { oid: 'e1', t: iso(T0 + 30 * H), season: 2025, homeName: 'Home', awayName: 'Away' };
const snap = (h, x, extra = {}) => ({ ts: iso(T0 + h * H), events: x === null ? [] : [{ id: 'e1', c: ev.t, h: 'Home', a: 'Away', x }], ...extra });
const both = { dk: { h2h: [null, -150, 130] }, pin: { h2h: [null, -145, 135] } };

test('buildRows writes a price gone where the book left the board, and again on its next sighting', () => {
  const { out, gone } = buildRows('nba', [snap(0, both), snap(6, { pin: both.pin }), snap(12, both)], [ev], { ahead: 26 * H });
  const rows = out.get(2025).filter((r) => r[0] !== 'S');
  assert.equal(gone, 1);
  assert.deepEqual(rows.find((r) => r[0] === 'G'), ['G', 'e1', iso(T0 + 6 * H), 'dk', 'h2h']);
  // (back on the board at the same price: written again, so it stands from there)
  assert.equal(rows.filter((r) => r[0] === 'I' && r[3] === 'dk').length, 2);
});

test('buildRows writes gone a coming event the snapshot did not list inside its window, never one past it', () => {
  const inside = buildRows('nba', [snap(0, both), snap(10, null)], [ev], { ahead: 26 * H });
  assert.equal(inside.gone, 2);
  const past = buildRows('nba', [snap(0, both), snap(2, null)], [ev], { ahead: 26 * H });
  assert.equal(past.gone, 0, 'the event starts past the snapshot\'s window: not asked, not gone');
  const none = buildRows('nba', [snap(0, both), snap(10, null)], [ev]);
  assert.equal(none.gone, 0, 'no window known: only a listed event\'s missing books are gone');
  const own = buildRows('nba', [snap(0, both), snap(10, null, { ahead: 26 * H })], [ev]);
  assert.equal(own.gone, 2, 'a snapshot carries its own job\'s window (deep-history.mjs build)');
});

test('intradayLines never carries a gone price forward', () => {
  const list = [
    { ts: T0, book: 'dk', market: 'h2h', line: null, a: -150, b: 130 },
    { ts: T0, book: 'pin', market: 'h2h', line: null, a: -145, b: 135 },
    goneRow(['G', 'e1', iso(T0 + 6 * H), 'dk', 'h2h']),
  ];
  const events = new Map([['e1', { oid: 'e1', t: ev.t }]]);
  const intra = { rows: new Map([['e1', list]]), snaps: [iso(T0), iso(T0 + 6 * H)] };
  const at24 = intradayLines(events, intra, [30]);
  assert.deepEqual(at24.map((x) => x.book).sort(), ['dk', 'pin'], '30h out: both posted');
  const at24only = intradayLines(events, intra, [30]).filter((x) => x.book === 'dk');
  assert.equal(at24only[0].a, -150);
  // (6h after T0, 24h before the start: DraftKings had pulled it)
  const at6 = intradayLines(events, { ...intra, snaps: [iso(T0 + 6 * H)] }, [24]);
  assert.deepEqual(at6.map((x) => x.book), ['pin']);
});

test('shopRows never shops a book gone from the board', () => {
  const lines = new Map([['e1', [
    { ts: T0, book: 'fd', market: 'h2h', line: null, a: -140, b: 125 },
    goneRow(['G', 'e1', iso(T0 + 6 * H), 'fd', 'h2h']),
  ]]]);
  const deep = { lines, snaps: [iso(T0), iso(T0 + 6 * H)] };
  const fresh = [{ oid: 'e1', market: 'ml', at: T0, overOdds: -150, underOdds: 130, line: null }];
  assert.equal(shopRows(fresh, deep, (x) => x.oid).better, 1);
  assert.equal(fresh[0].shop.overBook, 'fd');
  const later = [{ oid: 'e1', market: 'ml', at: T0 + 6 * H, overOdds: -150, underOdds: 130, line: null }];
  shopRows(later, deep, (x) => x.oid);
  assert.equal(later[0].shop, undefined, 'FanDuel pulled it: no other book, nothing shopped');
});

test('the committed intraday and dense files carry the gone rows and parse', () => {
  let g = 0;
  for (const sport of ['nfl', 'nba', 'nhl', 'mlb', 'mma']) {
    for (const dir of [intradayDir(sport), denseDir(sport)]) {
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir).filter((x) => /^\d{4}\.jsonl\.gz$/.test(x))) {
        for (const s of gunzipSync(readFileSync(path.join(dir, f))).toString('utf8').split('\n')) {
          if (!s) continue;
          const r = JSON.parse(s);
          if (r[0] !== 'G') continue;
          g++;
          assert.equal(r.length, 5);
          assert.ok(['h2h', 'spreads', 'totals'].includes(r[4]));
        }
      }
    }
    const intra = readIntraday(sport);
    for (const list of intra.rows.values()) for (const x of list) if (x.gone) assert.ok(x.a === null && x.b === null && Number.isFinite(x.ts));
    const deep = readDeep(sport);
    for (const list of deep.lines.values()) for (const x of list) if (x.gone) assert.ok(x.a === null && Number.isFinite(x.ts));
  }
  assert.ok(g > 1000, `the files' gone rows: ${g}`);
});

test('a Pinnacle pair at a negative vig is not the fair: DraftKings\' own no-vig is', () => {
  assert.equal(sharpPair({ a: 101, b: 231 }), false);
  assert.equal(sharpPair({ a: -145, b: 135 }), true);
  const events = new Map([['e1', { oid: 'e1', id: 'g1', t: '2020-08-13T20:00:00Z' }]]);
  const games = [{ id: 'g1', final: true, hs: 3, as: 2, season: 2020 }];
  const ts = '2020-08-13T19:55:00Z';
  const lines = [
    { oid: 'e1', kind: 'c', ts, book: 'dk', market: 'h2h', line: null, a: -135, b: 115 },
    { oid: 'e1', kind: 'c', ts, book: 'pin', market: 'h2h', line: null, a: -135, b: 285 },
  ];
  const [row] = historyLineBets(events, lines, games);
  assert.equal(row.pin, false);
  assert.equal(row.fair, devig(-135, 115));
  const ok = historyLineBets(events, [lines[0], { ...lines[1], b: 120 }], games)[0];
  assert.equal(ok.pin, true);
  assert.equal(ok.fair, devig(-135, 120));
});

test('MLB\'s 2020 opening week is quarantined from the gate\'s lines, its events kept', () => {
  assert.ok(LINE_QUARANTINE.mlb?.length);
  assert.equal(quarantined('mlb', '2020-07-25T23:10:00Z'), true);
  assert.equal(quarantined('mlb', '2020-08-01T00:10:00Z'), true, 'the 31st\'s night games (Eastern)');
  assert.equal(quarantined('mlb', '2020-08-01T17:10:00Z'), false);
  assert.equal(quarantined('nba', '2020-07-25T23:10:00Z'), false);
  const hist = loadHistory('mlb');
  const july = [...hist.events.values()].filter((e) => quarantined('mlb', e.t));
  assert.ok(july.length > 50, 'the week\'s events stay (their finals)');
  const ids = new Set(july.map((e) => e.oid));
  assert.equal(hist.lines.filter((l) => ids.has(l.oid)).length, 0);
  assert.ok(hist.quarantined > 500);
  assert.ok(hist.lines.some((l) => hist.events.get(l.oid)?.t?.startsWith('2020-08-0')));
});
