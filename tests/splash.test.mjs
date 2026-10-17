// The card splash's scenes (libs/ranker/src/engine/player-card/splash): which props a season gets, by how it
// ended and its awards; the hand-set seasons; the most meaningful prop in the middle; the locker for a season
// still being played and the shelf for a finished one; props left out until the data has their words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'libs/ranker/src/engine/player-card/splash');
const out = path.join(os.tmpdir(), `splash-${process.pid}.mjs`);
await build({ entryPoints: [path.join(DIR, 'splash.scene.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
const { buildScene, fill, roman } = await import(pathToFileURL(out).href);
fs.rmSync(out, { force: true });
const loadTs = async (file) => {
  const o = path.join(os.tmpdir(), `splash-${path.basename(file, '.ts')}-${process.pid}.mjs`);
  await build({ entryPoints: [path.join(DIR, file)], bundle: true, format: 'esm', platform: 'node', outfile: o, logLevel: 'silent' });
  const m = await import(pathToFileURL(o).href);
  fs.rmSync(o, { force: true });
  return m;
};
const { pickProps, centered, SCENE_OVERRIDES, PROPS } = await loadTs('splash.props.ts');
const { rosterOf } = await loadTs('splash.roster.ts');

const base = { sport: 'nfl', tab: 'TM', id: 'TM-Chiefs', season: 2023, current: false, team: true, awards: [] };
const scene = (over) =>
  buildScene({ sport: 'nfl', tab: 'TM', id: 'TM-Chiefs', season: 2023, seasonLabel: '2023', current: false, team: true, name: 'Kansas City Chiefs', teamName: 'Kansas City Chiefs', abbr: 'KC', awards: [], ...over });

test('a champion leads with its title trophy, then its conference trophy', () => {
  assert.deepEqual(pickProps({ ...base, awards: ['sb', 'conf'], conf: 'nfl-afc-trophy' }).slice(0, 2), ['nfl-lombardi', 'nfl-afc-trophy']);
  assert.equal(pickProps({ ...base, sport: 'nhl', awards: ['cup', 'conf'], conf: 'nhl-wales-trophy' })[0], 'nhl-stanley-cup');
  assert.equal(pickProps({ ...base, sport: 'nba', awards: ['champ'] })[0], 'nba-obrien');
  assert.equal(pickProps({ ...base, sport: 'mlb', awards: ['ws', 'pennant'], conf: 'mlb-pennant' })[0], 'mlb-commissioners-trophy');
});

test('a finalist leads with its conference trophy; no title trophy', () => {
  const ids = pickProps({ ...base, awards: ['conf'], conf: 'nfl-nfc-trophy', lostGame: true });
  assert.equal(ids[0], 'nfl-nfc-trophy');
  assert.ok(!ids.includes('nfl-lombardi'));
  assert.ok(ids.includes('ticket-stub'));
});

test('a playoff exit shows the ticket stub; a division title leads', () => {
  assert.deepEqual(pickProps({ ...base, tier: 'playoffs', lostGame: true }).slice(0, 1), ['ticket-stub']);
  const ids = pickProps({ ...base, tier: 'playoffs', lostGame: true, division: true, roundWon: true });
  assert.deepEqual(ids, ['division-banner', 'ticket-stub', 'round-plaque']);
});

test('a missed season goes to Cancún, the boarding pass in the middle; a near miss to the golf course', () => {
  assert.equal(pickProps({ ...base, tier: 'missed' })[0], 'boarding-pass');
  const s = scene({ outcome: { result: 'missed', record: '4-13' } });
  assert.equal(s.stage, 'shelf');
  assert.equal(s.items[s.lead].t, 'pass');
  assert.equal(pickProps({ ...base, tier: 'bubble' })[0], 'scorecard');
});

test('the lead stands in the middle of three', () => {
  assert.deepEqual(centered(['a', 'b', 'c']), ['b', 'a', 'c']);
  assert.deepEqual(centered(['a', 'b']), ['a', 'b']);
  const s = scene({ awards: [{ id: 'sb', title: '2023 Super Bowl Champion' }, { id: 'conf', title: '2023 AFC Champion (Lamar Hunt Trophy)' }] });
  assert.equal(s.items[s.lead].t, 'lombardi');
  assert.equal(s.lead, 1);
});

test('a hand-set season wins over the rules (Deflategate)', () => {
  assert.ok(SCENE_OVERRIDES['nfl:QB:QB-2330:2015']);
  assert.equal(pickProps({ ...base, tab: 'QB', id: 'QB-2330', season: 2015, team: false, awards: ['pb'] })[0], 'deflated-football');
  // (its ticket needs the game it ended in: until the data has it, a filler takes its place)
  const s = scene({ tab: 'QB', id: 'QB-2330', season: 2015, team: false, name: 'Tom Brady', teamName: 'New England Patriots', awards: [{ id: 'pb', title: '2015 Pro Bowl' }] });
  assert.equal(s.items[s.lead].t, 'deflated');
  assert.ok(!s.items.some((i) => i.t === 'stub'));
});

test('a season still being played is the locker; a finished one the shelf', () => {
  assert.equal(scene({ current: true, season: 2026, roster: [{ name: 'Trevor Lawrence', pos: 'QB', num: '16' }, { name: 'Travis Etienne', pos: 'RB' }, { name: 'Brian Thomas', pos: 'WR', num: '7' }] }).stage, 'locker');
  assert.equal(scene({ current: true, season: 2026 }), null, 'no roster yet: no locker');
  const me = scene({ current: true, season: 2026, team: false, tab: 'WR', name: 'Parker Washington', number: '11' });
  assert.equal(me.stage, 'locker');
  assert.ok(me.stalls.some((st) => st.mine && st.jersey?.num === '11'));
  assert.ok(!me.stalls.some((st) => ['lombardi', 'honors'].includes(st.item?.t)), 'no trophies in a season still being played');
  assert.equal(scene({ awards: [{ id: 'sb', title: '2023 Super Bowl Champion' }] }).stage, 'shelf');
});

test("a team locker's key player in the middle", () => {
  const s = scene({ current: true, season: 2026, roster: ['QB', 'RB', 'WR', 'WR', 'TE'].map((pos, i) => ({ name: `P ${i}`, pos })) });
  const mid = s.stalls.findIndex((st) => st.star);
  assert.equal(s.stalls[mid].plate, 'QB');
  assert.equal(mid, Math.floor(s.stalls.length / 2));
});

test("a player's finished season: his top award leads", () => {
  assert.equal(pickProps({ ...base, tab: 'QB', team: false, awards: ['mvp', 'ap1', 'pb'], plaques: true })[0], 'nfl-honors');
  assert.deepEqual(pickProps({ ...base, sport: 'nba', tab: 'PG', team: false, awards: ['champ', 'mvp'] }).slice(0, 2), ['nba-obrien', 'nba-jordan-mvp'], 'the title over the MVP');
  assert.equal(pickProps({ ...base, sport: 'mlb', tab: 'OF', team: false, awards: ['mvp', 'ss'] }).slice(0, 2).join(), 'mlb-mvp,mlb-silver-slugger');
});

test('a fighter: the belt when a champion, and his gloves', () => {
  assert.deepEqual(pickProps({ ...base, sport: 'mma', tab: 'WW', team: false, awards: ['champ'] }), ['title-belt', 'fight-gloves']);
  assert.deepEqual(pickProps({ ...base, sport: 'mma', tab: 'WW', team: false, awards: [] }), ['fight-gloves']);
});

test("the shelf's hero, in the middle, is always its tallest prop (the 2023 49ers: the Halas trophy over the division banner)", () => {
  const niners = scene({ id: 'TM-49ers', name: 'San Francisco 49ers', teamName: 'San Francisco 49ers', abbr: 'SF', awards: [{ id: 'conf', title: '2023 NFC Champion' }], outcome: { result: 'finalist', confChamp: true, conference: 'NFC', division: 'NFC West', record: '12-5', lastGame: { round: 'Super Bowl LVIII', opp: 'KC', home: false, neutral: true, score: '22-25 OT', won: false } } });
  assert.deepEqual(niners.items.map((i) => i.t), ['stub', 'conf', 'banner']);
  const [stub, conf, banner] = niners.items;
  assert.ok(conf.h > banner.h && conf.h > stub.h, `the trophy ${conf.h}px, the banner ${banner.h}px`);
  assert.equal(conf.h, 16 * 11, 'the trophy at full scale (the Halas is 16 inches)');
  // every sport, every way a season ends, every award: nothing beside the hero stands taller than it
  const outcomes = [
    { result: 'champion', confChamp: true, conference: 'AFC', division: 'D', roundWon: { round: 'R', result: 'W' }, lastGame: { round: 'F', opp: 'O', home: true, score: '1-0', won: true } },
    { result: 'finalist', confChamp: true, conference: 'West', division: 'D', lastGame: { round: 'F', opp: 'O', home: false, score: '0-1', won: false } },
    { result: 'playoffs', division: 'D', roundWon: { round: 'R', result: 'W' }, lastGame: { round: 'R2', opp: 'O', home: false, score: '0-1', won: false } },
    { result: 'playoffs', lastGame: { round: 'R1', opp: 'O', home: false, score: '0-1', won: false } },
    { result: 'bubble', record: '9-8', missedBy: 'a game' },
    { result: 'missed', record: '4-13' },
  ];
  const awards = { nfl: ['mvp', 'ap1'], nhl: ['hart', 'selke', 'conn', 'norris'], nba: ['mvp', 'nba1'], mlb: ['mvp', 'cy', 'ss', 'gg'] };
  const title = { nfl: 'sb', nhl: 'cup', nba: 'champ', mlb: 'ws' };
  let checked = 0;
  for (const sport of ['nfl', 'nhl', 'nba', 'mlb']) {
    const shelves = [
      ...outcomes.map((outcome) => ({ outcome, awards: outcome.result === 'champion' ? [{ id: title[sport], title: 'Champion' }, { id: 'conf', title: 'Conf' }] : outcome.confChamp ? [{ id: 'conf', title: 'Conf' }] : [] })),
      ...awards[sport].flatMap((a) => [
        { team: false, tab: 'X', awards: [{ id: a, title: `2023 ${a}` }] },
        { team: false, tab: 'X', awards: [{ id: a, title: `2023 ${a}` }, { id: title[sport], title: 'Champion' }] },
        { team: false, tab: 'X', awards: [{ id: title[sport], title: 'Champion' }, { id: a, title: `2023 ${a}` }] },
      ]),
    ];
    for (const over of shelves) {
      const s = scene({ sport, ...over, shoe: { line: 'L', name: 'N' }, bestGame: { title: 'G', line: 'L', tip: 'T' }, milestone: { big: 'B', small: 's', tip: 't' } });
      if (!s || s.stage !== 'shelf') continue;
      const hero = s.items[s.lead];
      for (const it of s.items) if (it !== hero) assert.ok(it.h < hero.h, `${sport} ${JSON.stringify(over).slice(0, 90)}: ${it.t} ${it.h}px beside ${hero.t} ${hero.h}px`);
      checked++;
    }
  }
  assert.ok(checked > 40, `${checked} shelves`);
});

// The owner's order, every sport and card: the title, the MVP (the final's just under), the major awards, the
// conference title, the playoffs, then the balls and fun props; the shelf's lead (first) in the middle
test("the owner's order: title, MVP, major awards, conference, playoffs, balls", () => {
  const order = (s) => (s.items.length === 3 ? [s.items[1], s.items[0], s.items[2]] : s.items).map((i) => i.tip);
  const nhl = { sport: 'nhl', tab: 'C', team: false, seasonLabel: '2023–24' };
  // Barkov 2024: the Stanley Cup in the middle, the Selke beside it, then the Wales
  const barkov = scene({ ...nhl, id: '8477493', season: 2024, name: 'Aleksander Barkov', teamName: 'Florida Panthers', abbr: 'FLA', awards: [{ id: 'cup', title: '2023-24 Stanley Cup Champion' }, { id: 'conf', title: '2023-24 Eastern Conference Champion (Prince of Wales Trophy)' }, { id: 'selke', title: '2023-24 Selke Trophy' }] });
  assert.equal(barkov.items[barkov.lead].t, 'stanley');
  assert.deepEqual(barkov.items.map((i) => i.t), ['selke', 'stanley', 'wales']);
  // Lamar 2023: the MVP in the middle, his All-Pro beside it
  const lamar = scene({ tab: 'QB', id: 'QB-3916387', team: false, name: 'Lamar Jackson', teamName: 'Baltimore Ravens', abbr: 'BAL', awards: [{ id: 'mvp', title: '2023 Most Valuable Player' }, { id: 'ap1', title: '2023 AP First-Team All-Pro' }, { id: 'pb', title: '2023 Pro Bowl' }], bestGame: { title: 'G', line: 'L', tip: 'T' } });
  assert.equal(lamar.items[lamar.lead].t, 'honors');
  assert.deepEqual(lamar.items[lamar.lead].lines, ['MVP', '2023']);
  assert.deepEqual(lamar.items.map((i) => i.t), ['plaques', 'honors', 'gameball']);
  // the 2023 Chiefs: the Lombardi, the Lamar Hunt, the division banner
  const kc = scene({ awards: [{ id: 'sb', title: '2023 Super Bowl Champion' }, { id: 'conf', title: '2023 AFC Champion (Lamar Hunt Trophy)' }], outcome: { result: 'champion', confChamp: true, conference: 'AFC', division: 'AFC West', record: '11-6', lastGame: { round: 'Super Bowl', opp: 'SF', home: true, neutral: true, score: '25-22', won: true }, gameBall: { title: 'Super Bowl LVIII', line: '25-22 OT', tip: 'T' } }, bestGame: { title: 'Super Bowl LVIII', line: '25-22 OT', tip: 'T' } });
  assert.equal(kc.items[kc.lead].t, 'lombardi');
  assert.deepEqual(kc.items.map((i) => i.t), ['conf', 'lombardi', 'banner']);
  // Mahomes 2023: the Lombardi, the Super Bowl MVP, the Lamar Hunt
  const mahomes = scene({ tab: 'QB', id: 'QB-3139477', team: false, name: 'Patrick Mahomes', awards: [{ id: 'sb', title: '2023 Super Bowl Champion' }, { id: 'conf', title: '2023 AFC Champion (Lamar Hunt Trophy)' }, { id: 'sbmvp', title: '2023 Super Bowl MVP' }, { id: 'pb', title: '2023 Pro Bowl' }], bestGame: { title: 'G', line: 'L', tip: 'T' } });
  assert.equal(mahomes.items[mahomes.lead].t, 'lombardi');
  assert.deepEqual(order(mahomes).map((t) => t.split(' · ')[0]), ['Super Bowl LVIII champions', 'Super Bowl MVP', 'AFC champions']);
  // the 2023 49ers: the Halas, then the ticket stub
  const niners = pickProps({ ...base, id: 'TM-49ers', awards: ['conf'], conf: 'nfl-nfc-trophy', tier: 'finalist', lostGame: true, division: true });
  assert.deepEqual(niners, ['nfl-nfc-trophy', 'ticket-stub', 'division-banner']);
  // Judge 2022: the MVP, the Silver Slugger, the 62nd home run's ball (over his All-Star plaque)
  const judge = pickProps({ ...base, sport: 'mlb', tab: 'OF', id: 'H-592450', season: 2022, team: false, awards: ['mvp', 'ss', 'as'], plaques: true, milestone: true });
  assert.deepEqual(judge, ['mlb-mvp', 'mlb-silver-slugger', 'milestone-ball']);
  // the league MVP over the final's; a major award over a conference title; a title over everything
  assert.deepEqual(pickProps({ ...base, sport: 'nhl', team: false, tab: 'C', awards: ['conn', 'hart'] }).slice(0, 2), ['nhl-hart', 'nhl-conn-smythe']);
  assert.deepEqual(pickProps({ ...base, sport: 'nhl', team: false, tab: 'C', awards: ['conf', 'selke'], conf: 'nhl-wales-trophy' }).slice(0, 2), ['nhl-selke', 'nhl-wales-trophy']);
  assert.equal(pickProps({ ...base, sport: 'mlb', team: false, tab: 'SP', awards: ['cy', 'ws'] })[0], 'mlb-commissioners-trophy');
  // the kits only when nothing from the first five tiers is there: a defense's DPOY over Cancún
  assert.equal(pickProps({ ...base, tab: 'DEF', awards: ['dpoy'], tier: 'missed' })[0], 'nfl-honors');
  assert.equal(pickProps({ ...base, tier: 'missed' })[0], 'boarding-pass');
  // a hand-set season still wins exactly as written
  assert.deepEqual(pickProps({ ...base, tab: 'QB', id: 'QB-2330', season: 2015, team: false, awards: ['mvp', 'sb'] }), SCENE_OVERRIDES['nfl:QB:QB-2330:2015']);
});

test('every prop is drawn by a piece, sized by a real height', () => {
  for (const [id, p] of Object.entries(PROPS)) {
    assert.ok(p.piece, id);
    assert.ok(p.inches > 0 && p.inches < 60, id);
  }
});

test('templates drop the parts their data lacks', () => {
  assert.equal(fill('Stanley Cup champions · {final}', {}), 'Stanley Cup champions');
  assert.equal(fill('{a} · {b}', { a: 'x', b: 'y' }), 'x · y');
  assert.equal(roman(58), 'LVIII');
});

// ---- the team lockers' players (splash.roster.ts): who hangs, from the depth chart and the season's roster
const man = (id, name, snaps = null) => ({ id, espnId: null, name, short: name, headshot: null, snaps, games: 5, status: null, statusText: null, injury: null });
const slotOf = (label, group, depth, extra = {}) => ({ key: label, label, name: label, x: 0, y: 0, group, depth, ...extra });
const nflChart = {
  asOf: '',
  sides: [
    {
      id: 'offense', title: 'Offense', set: null, los: 30,
      slots: [
        slotOf('QB', 'QB', [man('qb1', 'Pat Passer')]),
        slotOf('RB', 'RB', [man('rb1', 'Rick Runner')]),
        // (the X receiver was traded away since the chart was drawn: the roster hasn't him; his backup hangs)
        slotOf('WR', 'WR', [man('wrX', 'Gone Guy'), man('wr3', 'Third Wideout')]),
        slotOf('WR', 'WR', [man('wr2', 'Zed Receiver')]),
        slotOf('TE', 'TE', [man('te1', 'Tim Tight')]),
        ...['LT', 'LG', 'C', 'RG', 'RT'].map((p) => slotOf(p, 'OL', [man(p.toLowerCase(), `${p} Lineman`)])),
      ],
    },
    {
      id: 'defense', title: 'Defense', set: 'Base 4-3', los: 70,
      slots: [
        slotOf('LDE', 'DL', [man('de1', 'Ed Rusher')]),
        slotOf('RDT', 'DL', [man('dt1', 'Nose Tackle')]),
        slotOf('MLB', 'LB', [man('lb1', 'Mike Backer')]),
        slotOf('RCB', 'DB', [man('cb1', 'Corner Back')]),
        slotOf('SS', 'DB', [man('s1', 'Strong Safety')]),
        slotOf('NICKEL', 'DB', [man('nb1', 'Nick Back')], { sub: true }),
      ],
    },
  ],
  special: [], usage: [], timeline: [], coaches: [], teamGames: 5,
};
const nflLockers = {
  qb1: ['15', 300], rb1: ['25', 120], wr3: ['80', 20], wr2: ['17', 210], te1: ['87', 150],
  lt: ['77', 0], lg: ['65', 0], c: ['62', 0], rg: ['73', 0], rt: ['76', 0],
  de1: ['56', 90], dt1: ['95', 40], lb1: ['54', 130], cb1: ['21', 60], s1: ['32', 110], nb1: ['27', 70],
};

test("an NFL team locker: the quarterback, the two most popular skill players, the three most popular defenders, the next best; a traded man passed over", () => {
  const r = rosterOf('nfl', nflChart, 'TM', {}, nflLockers);
  assert.deepEqual(r.map((p) => p.name), ['Pat Passer', 'Zed Receiver', 'Tim Tight', 'Mike Backer', 'Strong Safety', 'Ed Rusher', 'Rick Runner']);
  assert.deepEqual(r.map((p) => p.num), ['15', '17', '87', '54', '32', '56', '25'], 'his number from the roster');
  assert.deepEqual(r.slice(3, 6).map((p) => p.pos), ['MLB', 'SS', 'DE'], "a defender's spot as his plate reads it");
  assert.ok(!r.some((p) => p.name === 'Gone Guy'), 'the traded receiver is not on the roster');
  // (no roster file: the chart as it is, the numbers file for the numbers)
  const bare = rosterOf('nfl', nflChart, 'TM', { qb1: '15' }, null);
  assert.equal(bare[0].name, 'Pat Passer');
  assert.equal(bare[0].num, '15');
  assert.ok(bare.some((p) => p.name === 'Gone Guy'), 'nothing says he left');
});

test('a Defense card hangs defenders by popularity; an O-Line card its five linemen, center first', () => {
  const def = rosterOf('nfl', nflChart, 'DEF', {}, nflLockers);
  assert.deepEqual(def.map((p) => p.pos), ['MLB', 'SS', 'DE', 'CB', 'DT'], 'the nickel is a sub package, not hung');
  assert.equal(def[0].num, '54');
  const ol = rosterOf('nfl', nflChart, 'OL', {}, nflLockers);
  assert.deepEqual(ol.map((p) => p.pos), ['C', 'RG', 'LG', 'RT', 'LT']);
  assert.deepEqual(ol.map((p) => p.num), ['62', '73', '65', '76', '77']);
});

test("another sport's locker: the lineup by usage, the goalie or the ace weighted down so a skater leads", () => {
  const nhl = {
    ...nflChart,
    sides: [{ id: 'lineup', title: 'Top Unit', set: null, los: null, slots: [
      slotOf('G', undefined, [man('g1', 'Gus Goalie', 0.9)]),
      slotOf('LD', undefined, [man('d1', 'Dee Fender', 0.42)]),
      slotOf('C', undefined, [man('c1', 'Cy Center', 0.38)]),
      slotOf('LW', undefined, [man('lw1', 'Lou Wing', 0.3)]),
    ] }],
  };
  const r = rosterOf('nhl', nhl, 'TM', { g1: '31', d1: '8', c1: '97', lw1: '29' }, null);
  assert.deepEqual(r.map((p) => `${p.pos} ${p.num}`), ['LD 8', 'C 97', 'G 31', 'LW 29'], 'by usage, the goalie at four tenths of his starts');
  assert.equal(r[0].name, 'Dee Fender', 'the top-pair defenseman (0.42) over the goalie (0.9 x 0.4)');
});

test('a team locker room needs three jerseys; two is no splash', () => {
  assert.equal(scene({ current: true, season: 2026, roster: [{ name: 'A B', pos: 'QB' }, { name: 'C D', pos: 'RB' }] }), null);
  assert.equal(scene({ current: true, season: 2026, roster: [{ name: 'A B', pos: 'QB' }, { name: 'C D', pos: 'RB' }, { name: 'E F', pos: 'WR' }] }).stage, 'locker');
});

test("a coach's office reads his own record first (a man hired in midseason), the team's when his row has none", () => {
  const coach = { tab: 'HC', id: 'HC-Kevin Stefanski', team: false, coach: true, name: 'Kevin Stefanski', teamName: 'Cleveland Browns', abbr: 'CLE' };
  const mid = scene({ ...coach, current: true, season: 2026, record: '3-2', outcome: { result: 'unknown', record: '2-3' } });
  assert.equal(mid.stage, 'office');
  assert.equal(mid.office.record, '3-2');
  assert.deepEqual(mid.items, [], 'a season being played: the room alone');
  const past = scene({ ...coach, season: 2024, outcome: { result: 'missed', record: '3-14' } });
  assert.equal(past.office.record, '3-14');
  assert.equal(past.items[0].t, 'plaque', 'a missed season: the season plaque');
  const coy = scene({ ...coach, season: 2020, awards: [{ id: 'coy', title: '2020 Coach of the Year' }], outcome: { result: 'playoffs', record: '11-5', roundWon: { round: 'Wild Card', result: 'W 48-37 at PIT' } } });
  assert.equal(coy.items[0].t, 'coyplaque');
  assert.ok(coy.items[0].lines.includes('Coach of the Year'));
});
