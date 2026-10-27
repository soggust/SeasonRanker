// Preview props: DraftKings' prop lines off ESPN's core API for a game the bot hasn't priced, which users may bet at
// an assumed -110 (the bot never does). The page's mapping (preview-props.ts: ESPN's items to the bettor's stats at
// their main line, the movement from the open, the rosters' names), the settler's own table beside it
// (settle-lib.mjs PREVIEW_STATS), and the settler's grading of a preview bet: no price check, its line checked
// against the lines seen, then won, lost, pushed or void as a straight prop is; a parlay's preview leg the same.
// No network: the items here are made up in ESPN's shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';
import * as lib from '../libs/ranker/scripts/accounts/settle-lib.mjs';
import { snapshotPreviewLines } from '../libs/ranker/scripts/accounts/settle.mjs';
import { TIMING } from '../libs/ranker/scripts/model/leagues.mjs';

const pv = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support/preview-entry.ts'), data: {} });

// (one propBets item, ESPN's shape: the athlete's ref, the type, the line now and the open)
const ref = (id, sport = 'football/leagues/nfl') => `http://sports.core.api.espn.com/v2/sports/${sport}/seasons/2026/athletes/${id}?lang=en&region=us`;
const item = (id, name, line, open = line, sport = undefined) => ({ athlete: { $ref: ref(id, sport) }, type: { id: '1', name }, current: { target: { value: line, displayValue: String(line) } }, open: { target: { value: open } } });

test('the mapping: ESPN items as the bettor stats at their main line, with the open; only stats the settler grades', () => {
  const items = [
    // (each main prop listed twice, an over and an under)
    item('3912547', 'Total Passing Yards (incl. overtime)', 221.5, 225.5),
    item('3912547', 'Total Passing Yards (incl. overtime)', 221.5, 225.5),
    item('3912547', 'Total Pass Completions (incl. overtime)', 19.5, 20.5),
    item('3912547', 'Total Passing Touchdowns (incl. overtime)', 1.5),
    item('3912547', 'Total Passing Interceptions (incl. overtime)', 0.5),
    item('3912547', 'Total Passing Attempts (incl. overtime)', 30.5),
    item('4', 'Total Carries (incl. overtime)', 14.5),
    item('4', 'Total Rushing Yards (incl. overtime)', 61.5, 58.5),
    item('5', 'Total Receiving Yards (incl. overtime)', 55.5),
    item('5', 'Total Receptions (incl. overtime)', 4.5),
    item('5', 'Total Rushing Plus Receiving Yards (incl. overtime)', 60.5),
    // (an alt line beside the main one, listed once: the main line is the one listed most)
    item('5', 'Total Receptions (incl. overtime)', 5.5),
    item('5', 'Total Receptions (incl. overtime)', 4.5),
    // (never these: what the settler can't grade, a ladder, a half's, a quarter's, a scorer prop with no line)
    item('3912547', 'Longest Passing Completion (incl. overtime)', 34.5),
    item('3912547', 'Total Passing Plus Rushing Yards (incl. overtime)', 229.5),
    item('3912547', 'Passing Yards Milestones', 250),
    item('3912547', '1st Half Total Passing Yards', 114.5),
    item('5', '1st Quarter Total Receiving Yards', 20.5),
    { athlete: { $ref: ref('5') }, type: { name: 'Anytime Touchdown Scorer' }, current: {}, open: {} },
    // (no athlete id)
    { type: { name: 'Total Receptions (incl. overtime)' }, current: { target: { value: 3.5 } } },
  ];
  const props = pv.previewPropsOf('nfl', items);
  const by = Object.fromEntries(props.map((p) => [`${p.athlete}|${p.propType}`, p]));
  assert.deepEqual(Object.keys(by).sort(), ['3912547|passAtt', '3912547|passCmp', '3912547|passInt', '3912547|passTd', '3912547|passYds', '4|rushAtt', '4|rushYds', '5|rec', '5|recYds', '5|rushRecYds']);
  assert.deepEqual(by['3912547|passYds'], { athlete: '3912547', propType: 'passYds', label: 'Pass Yds', line: 221.5, open: 225.5 });
  assert.equal(by['5|rec'].line, 4.5);
  assert.equal(by['5|rushRecYds'].label, 'Rush+Rec Yds');
  // (the movement from the open, in words)
  assert.equal(pv.movementText(by['3912547|passYds']), '▼ 4 from 225.5');
  assert.equal(pv.movementText(by['4|rushYds']), '▲ 3 from 58.5');
  assert.equal(pv.movementText(by['5|recYds']), null);
  // (a tie between lines: the middle one)
  assert.equal(pv.mainLineOf([4.5, 5.5, 3.5]), 4.5);
  assert.equal(pv.athleteIdOf(ref('3912547')), '3912547');
  assert.equal(pv.athleteIdOf('http://x/teams/26'), null);
});

test('the mapping: each sport stats by ESPN names (NHL, NBA, MLB); MLB total bases left out', () => {
  const of = (sport, name) => pv.previewStatOf(sport, name)?.key ?? null;
  assert.equal(of('nhl', 'Total Shots on Goal'), 'sog');
  assert.equal(of('nhl', 'Total Points'), 'pts');
  assert.equal(of('nhl', 'Total Saves'), 'saves');
  assert.equal(of('nhl', 'Total Assists'), null);
  assert.equal(of('nhl', 'Total Blocked Shots'), null);
  assert.equal(of('nhl', 'Points Milestones'), null);
  assert.equal(of('nba', 'Total Points'), 'pts');
  assert.equal(of('nba', 'Total Rebounds'), 'reb');
  assert.equal(of('nba', 'Total Assists'), 'ast');
  assert.equal(of('nba', 'Total 3-Point Field Goals Made'), 'fg3');
  assert.equal(of('nba', 'Total Points, Rebounds and Assists'), 'pra');
  assert.equal(of('nba', 'Total Points + Assists + Rebounds'), 'pra');
  assert.equal(of('nba', 'Points + Assists + Rebounds Milestones'), null);
  assert.equal(of('nba', 'Team Total Points'), null);
  assert.equal(of('nba', 'Total Points + Rebounds'), null);
  assert.equal(of('mlb', 'Total Strikeouts'), 'k');
  assert.equal(of('mlb', 'Total Outs Recorded'), 'outs');
  assert.equal(of('mlb', 'Total Hits'), 'hits');
  assert.equal(of('mlb', 'Total Bases'), null);
  assert.equal(of('mlb', 'Total Hits Allowed'), null);
  assert.equal(of('mlb', 'Total Hits + Runs + RBIs'), null);
  assert.equal(of('mlb', 'Strikeouts (Batter) Milestones'), null);
  const nhl = pv.previewPropsOf('nhl', [item('3895074', 'Total Shots on Goal', 3.5, 3.5, 'hockey/leagues/nhl'), item('3895074', 'Total Points', 1.5, 1.5, 'hockey/leagues/nhl')]);
  assert.deepEqual(nhl.map((p) => `${p.athlete}|${p.propType}|${p.label}|${p.line}`).sort(), ['3895074|pts|Points|1.5', '3895074|sog|Shots|3.5']);
});

test('the page stats and the settler stats are one table; the window is the bettor props window', () => {
  for (const sport of ['nfl', 'nba', 'nhl', 'mlb']) {
    const page = pv.PREVIEW_STATS[sport].map((s) => [s.key, s.match.source, s.match.flags]);
    const settler = lib.PREVIEW_STATS[sport].map(([k, re]) => [k, re.source, re.flags]);
    assert.deepEqual(page, settler, sport);
    assert.equal(pv.PROPS_WINDOW_HOURS[sport], TIMING[sport].props, `${sport} props window`);
  }
  assert.equal(pv.PREVIEW_ODDS, lib.PREVIEW_ODDS);
  assert.equal(lib.PREVIEW_ODDS, -110);
});

test('the rosters names: the NFL grouped, the others flat', () => {
  const nfl = pv.rosterNames({ athletes: [{ items: [{ id: 3912547, displayName: 'Sam Darnold' }] }, { items: [{ id: '4', displayName: 'Kenneth Walker III' }] }] });
  assert.deepEqual([...nfl], [['3912547', 'Sam Darnold'], ['4', 'Kenneth Walker III']]);
  assert.deepEqual([...pv.rosterNames({ athletes: [{ id: 9, displayName: 'Connor McDavid' }] })], [['9', 'Connor McDavid']]);
  assert.equal(pv.rosterNames(null).size, 0);
});

// ---------------------------------------------------------------------------
// The settler
// ---------------------------------------------------------------------------
const game = (over = {}) => ({ id: '401', date: '2026-10-11T17:00Z', homeAbbr: 'DEN', awayAbbr: 'SEA', final: true, hs: 24, as: 20, ...over });
const now = Date.parse('2026-10-12T03:00Z');
const preview = (over = {}) => ({
  sport: 'nfl',
  event: '401',
  matchup: 'SEA @ DEN',
  start: '2026-10-11T17:00:00Z',
  placedAt: '2026-10-09T15:00:00Z',
  market: 'prop',
  side: 'over',
  line: 221.5,
  odds: -110,
  stake: 11,
  pick: 'Sam Darnold Over 221.5 Pass Yds',
  botPick: false,
  ref: '401:prop:passYds:3912547',
  propType: 'passYds',
  athlete: '3912547',
  player: 'Sam Darnold',
  statLabel: 'Pass Yds',
  preview: true,
  ...over,
});
// (ESPN's look after the game: the line opened at 225.5 and closed at 218.5)
const espn = lib.previewLinesOf('nfl', [item('3912547', 'Total Passing Yards (incl. overtime)', 218.5, 225.5), item('3912547', 'Total Passing Yards (incl. overtime)', 218.5, 225.5)]);

test('a preview bet graded at -110 as a straight prop: won, lost, pushed, void when he did not play; no price check', () => {
  const lines = lib.previewSeen(preview(), { espn });
  assert.deepEqual(lines.sort(), [218.5, 225.5]);
  const opts = (propValue) => ({ observations: [], previewLines: lines, propValue, now });
  // (11 at -110 wins 10; no board price for it anywhere, and none needed)
  assert.deepEqual(lib.settlePlayBet(preview(), game(), opts(240)), { status: 'won', profit: 10, final: 'Sam Darnold 240 Pass Yds' });
  assert.deepEqual(lib.settlePlayBet(preview(), game(), opts(200)), { status: 'lost', profit: -11, final: 'Sam Darnold 200 Pass Yds' });
  assert.deepEqual(lib.settlePlayBet(preview({ side: 'under' }), game(), opts(200)), { status: 'won', profit: 10, final: 'Sam Darnold 200 Pass Yds' });
  assert.deepEqual(lib.settlePlayBet(preview({ line: 222 }), game(), opts(222)), { status: 'push', profit: 0, final: 'Sam Darnold 222 Pass Yds' });
  assert.deepEqual(lib.settlePlayBet(preview(), game(), opts(null)), { status: 'void', profit: 0, note: 'did not play' });
  // (the count not read yet: it waits, as a straight prop does)
  assert.equal(lib.settlePlayBet(preview(), game(), opts(undefined)), null);
  // (a game not over: it waits; placed after the start: void)
  assert.equal(lib.settlePlayBet(preview(), game({ final: false }), opts(240)), null);
  assert.equal(lib.settlePlayBet(preview({ placedAt: '2026-10-11T17:05:00Z' }), game(), opts(240)).note, 'placed after the start');
});

test('a preview bet line: graded at its own line within the lines seen, void outside them', () => {
  const lines = lib.previewSeen(preview(), { espn });
  // (a stale line, between the open and the close: it stands, graded at its own line)
  const stale = preview({ line: 223.5 });
  assert.deepEqual(lib.previewLineCheck(stale, lines), { ok: true });
  assert.equal(lib.settlePlayBet(stale, game(), { previewLines: lines, propValue: 223, now }).status, 'lost');
  // (a line ESPN never showed near: void, its stake back)
  assert.deepEqual(lib.settlePlayBet(preview({ line: 150.5 }), game(), { previewLines: lines, propValue: 240, now }), { status: 'void', profit: 0, note: 'line wasn’t on the board' });
  // (the settler's own look before the start widens what's known: 230.5 seen then)
  const seen = lib.previewSeen(preview(), { espn, snap: { '3912547|passYds': [221.5, 230.5] } });
  assert.equal(lib.settlePlayBet(preview({ line: 229.5 }), game(), { previewLines: seen, propValue: 240, now }).status, 'won');
  // (the bot's board's or bets' line on the same prop counts too; another player's doesn't)
  const bot = lib.botObservations([{ market: 'prop', side: 'over', propType: 'passYds', athlete: 3912547, line: 216.5, odds: -115, placedAt: '2026-10-10T20:00Z' }]);
  const other = lib.botObservations([{ market: 'prop', side: 'over', propType: 'passYds', athlete: 1, line: 150.5, odds: -115, placedAt: '2026-10-10T20:00Z' }]);
  assert.ok(lib.previewSeen(preview(), { espn, observations: [...bot, ...other] }).includes(216.5));
  assert.ok(!lib.previewSeen(preview(), { espn, observations: other }).includes(150.5));
  // (nothing seen at all, ESPN unread: it waits, then is void after three days)
  assert.equal(lib.settlePlayBet(preview(), game(), { previewLines: [], propValue: 240, now }), null);
  assert.match(lib.settlePlayBet(preview(), game(), { previewLines: [], propValue: 240, now: now + 4 * lib.DAY }).note, /couldn’t check the line/);
});

test('a bet marked preview that is not one: void (another price, the bot tag, a stat the page does not offer)', () => {
  const lines = [218.5, 225.5];
  const as = (over) => lib.settlePlayBet(preview(over), game(), { previewLines: lines, propValue: 240, now });
  assert.equal(as({ odds: -105 }).note, 'not a preview price');
  assert.equal(as({ odds: 150 }).note, 'not a preview price');
  assert.equal(as({ botPick: true }).note, 'not a preview price');
  assert.equal(as({ preview: 'yes' }).note, 'not a preview price');
  assert.equal(as({ market: 'total', side: 'over', line: 45.5 }).note, 'not a preview price');
  assert.equal(as({ sport: 'mlb', propType: 'tb' }).note, 'not a preview stat');
  // (a prop without the tag is priced as any bet (D98): no board here, graded at its own price, never void)
  const { preview: _, ...plain } = preview();
  assert.notEqual(lib.settlePlayBet(plain, game(), { previewLines: lines, propValue: 240, now }).status, 'void');
});

test('a parlay preview leg: -110, graded as a straight preview bet, one leg a game', () => {
  const leg = (over = {}) => {
    const { stake: _s, placedAt: _p, ...l } = preview(over);
    return l;
  };
  assert.equal(lib.legProblem(leg()), null);
  assert.equal(lib.legProblem(leg({ odds: -120 })), 'not a preview price');
  assert.equal(lib.legProblem(leg({ market: 'spread', side: 'home', line: -3.5 })), 'not a preview price');
  const other = leg({ event: '402', matchup: 'KC @ LV', athlete: '7', player: 'X', ref: '402:prop:passYds:7', line: 250.5 });
  const parlay = { kind: 'parlay', stake: 10, placedAt: '2026-10-09T15:00:00Z', legs: [leg(), other] };
  const g2 = game({ id: '402', homeAbbr: 'LV', awayAbbr: 'KC' });
  const both = (v1, v2, lines2 = [250.5]) =>
    lib.settleParlay(
      parlay,
      [
        { game: game(), observations: [], previewLines: [218.5, 225.5], propValue: v1 },
        { game: g2, observations: [], previewLines: lines2, propValue: v2 },
      ],
      { now },
    );
  // (both hit: -110 twice, 10 wins 26.45)
  assert.deepEqual(both(240, 260).result, { status: 'won', profit: 26.45, final: '2 of 2 hit', odds: 264 });
  assert.equal(both(240, 200).result.status, 'lost');
  // (a leg whose line wasn't on the board drops out: the other pays as a straight -110)
  const r = both(240, 260, [240.5, 245.5]);
  assert.equal(r.legs[1].status, 'void');
  assert.deepEqual(r.result, { status: 'won', profit: 9.09, final: '1 of 2 hit, 1 void', odds: -110 });
  // (two legs on one game: void, as any parlay)
  const same = lib.settleParlay({ ...parlay, legs: [leg(), leg({ propType: 'passCmp', side: 'under', line: 19.5 })] }, [null, null], { now });
  assert.equal(same.result.note, 'two legs on one game');
});

test('the settler look at preview lines: only games not begun with an open preview bet, each stat lowest and highest kept', async () => {
  const store = new Map([['propLines/nfl_401', { seen: { '3912547|passYds': [221.5, 221.5] } }]]);
  const db = {
    doc: (p) => ({
      get: async () => ({ exists: store.has(p), get: (k) => store.get(p)?.[k] }),
      set: async (v) => store.set(p, v),
    }),
  };
  const docOf = (data) => ({ get: (k) => data[k], data: () => data });
  const later = '2026-10-16T00:15:00Z';
  const plainLeg = preview({ event: '403', start: later });
  delete plainLeg.preview;
  const docs = [
    docOf(preview({ start: later })),
    // (a parlay's preview leg, on another game; its plain leg and a begun game's preview bet: not read)
    docOf({ kind: 'parlay', legs: [preview({ event: '402', start: later }), plainLeg] }),
    docOf(preview({ event: '404', start: '2026-10-11T17:00:00Z' })),
  ];
  const asked = [];
  const fetchJson = async (url) => {
    asked.push(url.match(/events\/(\d+)/)[1]);
    return { pageCount: 1, items: [item('3912547', 'Total Passing Yards (incl. overtime)', 218.5, 225.5)] };
  };
  const written = await snapshotPreviewLines(db, docs, { fetchJson, now: Date.parse('2026-10-14T12:00Z'), log: () => {} });
  assert.deepEqual(asked.sort(), ['401', '402']);
  assert.equal(written, 2);
  assert.deepEqual(store.get('propLines/nfl_401').seen['3912547|passYds'], [218.5, 225.5]);
  assert.deepEqual(store.get('propLines/nfl_402').seen['3912547|passYds'], [218.5, 225.5]);
  // (nothing new: nothing written)
  assert.equal(lib.mergePreviewSeen({ 'a|b': [1.5, 2.5] }, new Map([['a|b', { line: 2.5, open: 1.5 }]])), null);
});
