// The wallet's whole record from the settler's tally (tallies/{uid}), on the Firestore emulator with
// firestore.rules: a player with 450 settled bets sees all 450 in his record, profit, ROI and chart while the
// wallet reads one page of his history (wallet-math SETTLED_PAGE) and one tally; the tally his alone to read
// (his friends' when he shares his history). `npm run test:rules`; without the emulator these skip, and with a
// host that isn't this machine's they refuse to run (never the live project).
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc, where, writeBatch } from 'firebase/firestore';
import { loadEngine } from '../support/engine.mjs';
import * as lib from '../../libs/ranker/scripts/accounts/settle-lib.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const host = process.env.FIRESTORE_EMULATOR_HOST;
const skip = host ? false : 'no Firestore emulator (npm run test:rules)';
if (host && !/^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(host)) throw new Error(`FIRESTORE_EMULATOR_HOST is ${host}: these run against a local emulator only`);

const w = await loadEngine('nfl', { entry: path.join(import.meta.dirname, '../support/wallet-entry.ts'), data: {} });

let env;
before(async () => {
  if (skip) return;
  const [hostname, port] = host.split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-season-ranker-tally',
    firestore: { host: hostname, port: Number(port), rules: fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8') },
  });
});
after(async () => env?.cleanup());
beforeEach(async () => env?.clearFirestore());

const as = (uid) => env.authenticatedContext(uid).firestore();
const SETTLED = ['won', 'lost', 'push', 'void'];

// (450 settled bets over 45 days, NFL and NBA, 10 a day: 6 won at -110 (+9.09 on 10), 3 lost, 1 a push, and
// every 50th a void; written past the rules, the tally built as the settler builds it, bet by bet)
function history(n = 450) {
  const bets = [];
  let tally = null;
  for (let i = 0; i < n; i++) {
    const day = Math.floor(i / 10);
    const start = new Date(Date.UTC(2026, 8, 1 + day, 17)).toISOString();
    const status = i % 50 === 49 ? 'void' : ['won', 'won', 'lost', 'won', 'push', 'won', 'lost', 'won', 'lost', 'won'][i % 10];
    const profit = status === 'won' ? 9.09 : status === 'lost' ? -10 : 0;
    const b = { sport: i % 3 ? 'nfl' : 'nba', event: String(400 + day), matchup: 'LV @ NE', start, market: 'spread', side: 'home', line: -3.5, odds: -110, stake: 10, pick: 'NE -3.5', run: 0, status, profit, settledAt: new Date(Date.parse(start) + 4 * 36e5 + i * 1000).toISOString() };
    bets.push(b);
    tally = lib.addToTally(tally, b, { status, profit });
  }
  return { bets, tally };
}

async function seed(uid, betHistory = 'private') {
  const { bets, tally } = history();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', uid), { username: uid, usernameLower: uid, displayName: uid, visibility: { lists: 'public', presets: 'public', openBets: 'private', betHistory, tracker: 'private' } });
    for (let i = 0; i < bets.length; i += 200) {
      const batch = writeBatch(db);
      bets.slice(i, i + 200).forEach((b, j) => {
        batch.set(doc(db, 'users', uid, 'bets', `b${i + j}`), { ...b, start: Timestamp.fromDate(new Date(b.start)), settledAt: Timestamp.fromDate(new Date(b.settledAt)) });
      });
      await batch.commit();
    }
    await setDoc(doc(db, 'tallies', uid), tally);
  });
  return { bets, tally };
}

describe('the wallet from the tally', { skip }, () => {
  test('450 settled bets: the whole record shown, one page and one tally read', async () => {
    const { bets } = await seed('heavy');
    const db = as('heavy');
    // (the wallet's reads, as wallet.service does them: the tally, and the history's first page, the latest
    // settled first)
    const tallySnap = await assertSucceeds(getDoc(doc(db, 'tallies', 'heavy')));
    const page = await assertSucceeds(getDocs(query(collection(db, 'users', 'heavy', 'bets'), where('status', 'in', SETTLED), orderBy('settledAt', 'desc'), limit(w.SETTLED_PAGE))));
    const read = 1 + page.size;
    assert.ok(read <= w.SETTLED_PAGE + 1, `${read} documents read`);
    assert.equal(page.size, w.SETTLED_PAGE);
    const loaded = page.docs.map((d) => ({ ...d.data(), id: d.id, start: d.get('start').toDate().toISOString(), settledAt: d.get('settledAt').toDate().toISOString(), placedAt: d.get('start').toDate().toISOString() }));

    // (what every bet adds up to)
    const real = { won: 0, lost: 0, push: 0, void: 0, staked: 0, profit: 0 };
    for (const b of bets) {
      real[b.status]++;
      if (b.status === 'void') continue;
      real.staked += b.stake;
      real.profit += b.profit;
    }
    real.profit = Math.round(real.profit * 100) / 100;

    const tally = w.tallyFrom(tallySnap.data());
    const tiles = w.recordOf(tally, loaded);
    assert.deepEqual([tiles.won, tiles.lost, tiles.push, tiles.void], [real.won, real.lost, real.push, real.void]);
    assert.equal(tiles.won + tiles.lost + tiles.push + tiles.void, 450);
    assert.equal(tiles.profit, real.profit);
    assert.equal(tiles.staked, real.staked);
    assert.equal(tiles.roi, real.profit / real.staked);
    assert.equal(w.settledCount(tally), 450);
    // (the page alone would have shown only its one page: the regression this guards against)
    const pageOnly = w.playTally(loaded);
    assert.equal(pageOnly.won + pageOnly.lost + pageOnly.push + pageOnly.void, w.SETTLED_PAGE);
    // (the chart: all 45 game days, ending at the whole profit; each sport's line adding up to it)
    const c = w.dayCurve(tally);
    assert.equal(c.totals.length, 46);
    assert.equal(c.profit, real.profit);
    assert.equal(Math.round(c.lines.reduce((t, l) => t + l.profit, 0) * 100) / 100, real.profit);
    // (the tally stays small: a day's row and a day's sports, not a bet each)
    assert.ok(JSON.stringify(tallySnap.data()).length < 8000);
  });

  test('the tally: its owner reads it, a stranger doesn’t, a friend only when the history’s shared; nobody writes it', async () => {
    await seed('owner', 'friends');
    await assertSucceeds(getDoc(doc(as('owner'), 'tallies', 'owner')));
    await assertFails(getDoc(doc(as('stranger'), 'tallies', 'owner')));
    await assertFails(setDoc(doc(as('owner'), 'tallies', 'owner'), { all: { won: 999 } }));
  });
});
