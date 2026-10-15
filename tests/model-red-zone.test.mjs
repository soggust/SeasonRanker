// The NFL's red zone in the bettor (libs/ranker/scripts/model): the play-by-play's field position read into each
// final's red-zone work (football.mjs redZoneOf), the passing TDs' red-zone term from the games before only
// (matchups.mjs nflRedZone), the anytime touchdown's model (anytime.mjs: its looks, its chance, no look-ahead, its
// fit and held-out check), its pricing tracked only (never staked), its grading, its fit kept with the props' fits,
// and the credit setting that asks its market (oddsapi.mjs ANYTIME_TD, anytimeOn). No network: everything here is
// made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RZ_FIELDS, redZoneOf } from '../libs/ranker/scripts/model/football.mjs';
import { nflMatchups, nflRedZone, sideOfRz } from '../libs/ranker/scripts/model/matchups.mjs';
import { ANY_KEY, ANY_TRACK_UNITS, anytimeModel, anytimePlacement, anytimeRows, daysOf, fitAnytime, looksOf, makeAnytime, priceAnytime, replayAnytime, trackOnly } from '../libs/ranker/scripts/model/anytime.mjs';
import { ANYTIME_TD, MONTHLY, anytimeOn, projectedMonth } from '../libs/ranker/scripts/model/oddsapi.mjs';
import { CTX, STATS, apiProps, fitProps, propsFromBodies, settleProp, statInFinal } from '../libs/ranker/scripts/model/props.mjs';
import { ROUND_C, softable } from '../libs/ranker/scripts/model/project.mjs';
import { FIT_FILES, decodeFit, encodeFit, readFit, saveFit } from '../libs/ranker/scripts/model/fitcache.mjs';
import { TRACK, isTracked, learnView, record } from '../libs/ranker/scripts/model/desk.mjs';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

// (a play-by-play row, the columns redZoneOf reads)
const play = (o) => ({ game_id: 'G1', posteam: 'KC', home_team: 'KC', play_type: 'pass', pass: '1', yardline_100: '50', fixed_drive: '1', receiver_player_id: 'NA', rusher_player_id: 'NA', air_yards: 'NA', touchdown: '0', td_player_id: 'NA', two_point_attempt: '0', qb_kneel: '0', qb_spike: '0', ...o });

test('redZoneOf: trips, plays and passes inside the 20 by side; each player\'s looks by zone, end-zone targets and touchdowns', () => {
  const espnOfGame = new Map([['G1', '401']]);
  const espnOfGsis = new Map([['00-R', '11'], ['00-B', '22'], ['00-T', '33']]);
  const filler = Array.from({ length: 45 }, (_, i) => play({ fixed_drive: String(100 + i) }));
  const plays = [
    ...filler,
    // (drive 1: a target at the 18, a carry at the 8, a touchdown carry at the 3)
    play({ fixed_drive: '1', yardline_100: '18', receiver_player_id: '00-R', air_yards: '10' }),
    play({ fixed_drive: '1', yardline_100: '8', play_type: 'run', pass: '0', rusher_player_id: '00-B' }),
    play({ fixed_drive: '1', yardline_100: '3', play_type: 'run', pass: '0', rusher_player_id: '00-B', touchdown: '1', td_player_id: '00-B' }),
    // (a two-point try, a kneel and a spike: not counted)
    play({ fixed_drive: '1', yardline_100: '2', two_point_attempt: '1', receiver_player_id: '00-R' }),
    play({ fixed_drive: '2', yardline_100: '15', play_type: 'run', pass: '0', qb_kneel: '1', rusher_player_id: '00-B' }),
    // (drive 2, the away side: an end-zone touchdown pass from the 12)
    play({ fixed_drive: '2', posteam: 'LV', yardline_100: '12', receiver_player_id: '00-T', air_yards: '14', touchdown: '1', td_player_id: '00-T' }),
    // (a 60-yard touchdown catch: a long one)
    play({ fixed_drive: '3', yardline_100: '60', receiver_player_id: '00-R', air_yards: '40', touchdown: '1', td_player_id: '00-R' }),
    // (a penalty's no-play inside the 20: not a run or pass)
    play({ fixed_drive: '4', yardline_100: '9', play_type: 'no_play', receiver_player_id: '00-R' }),
  ];
  const g = redZoneOf(plays, espnOfGame, espnOfGsis).get('401');
  assert.deepEqual(g.h, [1, 3, 1]);
  assert.deepEqual(g.a, [1, 1, 1]);
  const f = (pid) => Object.fromEntries(RZ_FIELDS.map((k, i) => [k, g.p[pid][i]]));
  assert.deepEqual(f('11'), { tgt20: 1, car20: 0, tgt10: 0, car10: 0, tgt5: 0, car5: 0, ez: 0, rzTd: 0, longTd: 1 });
  assert.deepEqual(f('22'), { tgt20: 0, car20: 2, tgt10: 0, car10: 2, tgt5: 0, car5: 1, ez: 0, rzTd: 1, longTd: 0 });
  assert.deepEqual(f('33'), { tgt20: 1, car20: 0, tgt10: 0, car10: 0, tgt5: 0, car5: 0, ez: 1, rzTd: 1, longTd: 0 });
  // (a game with too few plays read: a file still filling in, left out)
  assert.equal(redZoneOf(plays.slice(40), espnOfGame, espnOfGsis).size, 0);
});

// (a made-up NFL history: two teams, a quarterback and a back each, a game a week; their red zones by game)
function history(weeks = 4) {
  const rows = [];
  const rz = {};
  for (let w = 1; w <= weeks; w++) {
    const game = `g${w}`;
    const date = `2025-09-${String(7 * w).padStart(2, '0')}T17:00Z`;
    for (const [team, opp, home] of [['1', '2', true], ['2', '1', false]]) {
      rows.push({ pid: `q${team}`, name: `QB ${team}`, pos: 'QB', date, season: 2025, team, opp, game, home, s: { passAtt: 30, passTd: team === '1' ? 3 : 1, rushAtt: 2, targets: 0 } });
      rows.push({ pid: `b${team}`, name: `RB ${team}`, pos: 'RB', date, season: 2025, team, opp, game, home, s: { rushAtt: 15, targets: 3, rushTd: w % 2, recTd: 0 } });
    }
    // (team 1 lives in the red zone and throws there; team 2 rarely gets there)
    rz[game] = { h: [5, 15, 10], a: [1, 3, 1], p: { b1: [0, 4, 0, 3, 0, 2, 0, w % 2, 0] } };
  }
  return { rows, rz };
}

test('the red zone on passing TDs: each row from the games before it only; the game\'s own red zone changes the next week\'s, never its own', () => {
  const { rows, rz } = history();
  nflMatchups(rows, null, { rz });
  const qb = (pid, game) => rows.find((r) => r.pid === pid && r.game === game);
  // (week 1: nothing read before it, the league's (0))
  assert.equal(qb('q1', 'g1').rzPass, 0);
  // (week 2 on: the busier red-zone team over 0, the other under)
  assert.ok(qb('q1', 'g2').rzPass > 0 && qb('q2', 'g2').rzPass < 0);
  // (no look-ahead: a different week 2 red zone leaves week 2's rows as they were, and moves week 3's)
  const again = history();
  again.rz.g2 = { h: [0, 0, 0], a: [9, 30, 25], p: {} };
  nflMatchups(again.rows, null, { rz: again.rz });
  const qb2 = (pid, game) => again.rows.find((r) => r.pid === pid && r.game === game);
  assert.equal(qb2('q1', 'g2').rzPass, qb('q1', 'g2').rzPass);
  assert.equal(qb2('q2', 'g2').rzGap, qb('q2', 'g2').rzGap);
  assert.notEqual(qb2('q1', 'g3').rzPass, qb('q1', 'g3').rzPass);
  // (the term's value: per 10% over the league's, 0 unread; on the passing TDs' ctx, a late term the gate judges,
  // softable)
  assert.equal(CTX.rzPass(null, true, null, { rzPass: 0.12 }), 1.2);
  assert.equal(CTX.rzPass(null, true, null, {}), 0);
  assert.ok(STATS.nfl.find((s) => s.key === 'passTd').ctx.includes('rzPass'));
  assert.ok(ROUND_C.includes('c_rzPass') && softable('c_rzPass'));
  // (the table alone: a side's [trips, plays, passes] read, its passing TDs from the game's rows)
  const t = nflRedZone();
  assert.equal(t.of('1', '2', 2025).rzPass, 0);
  t.learn({ team: '1', opp: '2', season: 2025, rows: [{ s: { passTd: 2 } }] }, [6, 18, 12]);
  assert.ok(t.of('1', '3', 2025).rzPass > 0 && t.of('1', '3', 2025).rzTrips > 3.2);
  assert.equal(sideOfRz({ h: [1, 2, 3], a: [4, 5, 6] }, false)[0], 4);
});

test('the anytime touchdown\'s looks: a player-game\'s red zone in the six zones that don\'t overlap, end-zone targets, his touchdowns', () => {
  // (tgt20 5, car20 4, tgt10 3, car10 2, tgt5 1, car5 1, ez 2, rzTd 1, longTd 1)
  assert.deepEqual(looksOf([5, 4, 3, 2, 1, 1, 2, 1, 1]), [1, 2, 2, 1, 1, 2, 2, 1, 1]);
  assert.deepEqual(looksOf(undefined), [0, 0, 0, 0, 0, 0, 0, 0, 0]);
});

const PARAMS = { rho: [0.3, 0.2, 0.1, 0.4, 0.15, 0.05, 0.2], D: 0.9, K: 1, F: 4, L: 8, beta: 1, a: 0, b: 1, kind: 'rz' };

test('the anytime chance: 1 - e^-lambda, lambda his looks a game times their worth, his finishing, his long ones and the script', () => {
  const m = makeAnytime(PARAMS);
  // (one game learned: a back with two carries inside the 5 and a touchdown; his position's averages the same)
  const x = { pid: 'b', pos: 'RB', team: '1', game: 'g1', day: '2025-09-07', season: 2025, implied: 22, y: 1, rz: true, looks: [0, 0, 0, 2, 0, 0, 0, 1, 0] };
  m.learn([x]);
  const pr = m.project({ pid: 'b', pos: 'RB', team: '1', season: 2025, implied: 22 });
  // (his looks a game: (his + K x his position's) / (games + K) = 2 inside the 5; worth 0.4 each; finishing (1 + F)
  // / (0.8 + F); long (0 + L x 0) / (1 + L) = 0; the script (22 over his team's usual 22) 1)
  const fin = (1 + 4) / (0.8 + 4);
  near(pr.lambda, Math.round(2 * 0.4 * fin * 1e4) / 1e4, 1e-4);
  near(pr.raw, 1 - Math.exp(-2 * 0.4 * fin));
  near(pr.p, pr.raw);
  // (a team expected to score more than its usual: more; recalibrated: a + b logit P)
  assert.ok(m.project({ pid: 'b', pos: 'RB', team: '1', season: 2025, implied: 33 }).p > pr.p);
  const cal = makeAnytime({ ...PARAMS, a: -0.5, b: 0.8 });
  cal.learn([x]);
  const q = cal.project({ pid: 'b', pos: 'RB', team: '1', season: 2025, implied: 22 }).p;
  near(q, 1 / (1 + Math.exp(-(-0.5 + 0.8 * Math.log(pr.raw / (1 - pr.raw))))));
  // (the plain model: his touchdowns a game alone)
  const plain = makeAnytime({ ...PARAMS, kind: 'plain', K: 2 });
  plain.learn([x]);
  near(plain.project({ pid: 'b', pos: 'RB', team: '1', season: 2025, implied: 22 }).raw, 1 - Math.exp(-(1 + 2 * 1) / (1 + 2)));
});

// (a made-up league: backs and receivers whose red-zone roles change each season, each look scoring at its zone's
// rate: the looks show a new role long before the touchdowns do)
function league(seasons = [2021, 2022, 2023, 2024], players = 40) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rows = [];
  const rz = {};
  for (const season of seasons) {
    const role = Array.from({ length: players }, () => [rnd() * 3.5, rnd() * 4]);
    for (let w = 1; w <= 17; w++) {
      const date = `${season}-09-${String(w).padStart(2, '0')}T17:00Z`;
      for (let g = 0; g < players / 2; g++) {
        const game = `${season}-${w}-${g}`;
        rz[game] = { h: [3, 9, 5], a: [3, 9, 5], p: {} };
        for (const side of [0, 1]) {
          const i = g * 2 + side;
          const goalLine = i % 4 === 0;
          const car5 = goalLine ? Math.round(rnd() * role[i][0]) : 0;
          const tgt20 = Math.round(rnd() * role[i][1]);
          let td = 0;
          for (let k = 0; k < car5; k++) td += rnd() < 0.45 ? 1 : 0;
          for (let k = 0; k < tgt20; k++) td += rnd() < 0.12 ? 1 : 0;
          const long = rnd() < 0.04 ? 1 : 0;
          rz[game].p[`p${i}`] = [tgt20, car5, 0, car5, 0, car5, 0, td, long];
          rows.push({ pid: `p${i}`, name: `P${i}`, pos: goalLine ? 'RB' : 'WR', date, season, team: `t${i}`, opp: `t${i ^ 1}`, game, home: side === 0, s: { rushTd: td, recTd: long } });
        }
      }
    }
  }
  return { rows, rz };
}

test('the anytime rows: each chance made before its day, its own game and the ones after never in it', () => {
  const { rows, rz } = league([2023, 2024], 8);
  const list = anytimeRows(rows, rz);
  const days = daysOf(list);
  const before = replayAnytime(days, PARAMS, 2023);
  // (the last day's outcomes and looks changed: every chance made before it the same, its own the same too)
  const last = list.at(-1).day;
  const changed = list.map((x) => (x.day === last ? { ...x, y: 1 - x.y, looks: x.looks.map((v) => v + 5) } : x));
  const after = replayAnytime(daysOf(changed), PARAMS, 2023);
  assert.equal(after.length, before.length);
  before.forEach((o, i) => near(after[i].pr.p, o.pr.p));
});

test('the anytime fit: the red zone\'s model beats the plain one held out where touchdowns come from the looks, calibrated, its check kept', () => {
  const { rows, rz } = league();
  const list = anytimeRows(rows, rz);
  const f = fitAnytime(list);
  assert.ok(f, 'fit');
  assert.equal(f.params.kind, 'rz');
  assert.ok(f.check.rz < f.check.plain, `${f.check.rz} vs ${f.check.plain}`);
  assert.ok(f.check.rz < f.check.base);
  assert.equal(f.params.rho.length, 7);
  // (the goal-line carries' worth near the made-up 0.45, the targets' near 0.12)
  assert.ok(Math.abs(f.params.rho[3] - 0.45) < 0.06, `car5 ${f.params.rho[3]}`);
  assert.ok(Math.abs(f.params.rho[2] - 0.12) < 0.04, `tgt20 ${f.params.rho[2]}`);
  // (calibration by band: what it said near what happened where a band has rows)
  for (const c of f.check.calibration.filter((x) => x.n >= 200)) assert.ok(Math.abs(c.said - c.was) < 0.06, JSON.stringify(c));
  // (too few rows: no fit)
  assert.equal(fitAnytime(list.slice(0, 500)), null);
});

test('the anytime fit kept with the props\' fits: saved, read back exactly, and the model rebuilt from it, not refit', () => {
  const { rows, rz } = league();
  const list = anytimeRows(rows, rz);
  const f = fitAnytime(list);
  const passTd = { params: { K: 16, c_wind: -0.15, c_rzPass: 0, soft: { c_rzPass: { w: 0.25, size: { c_rzPass: 0.01 } } } } };
  // (every stat's saved fit there, the others none: only the anytime model is rebuilt here)
  const fits = { ...Object.fromEntries(STATS.nfl.map((st) => [st.key, null])), passTd, [ANY_KEY]: f };
  assert.deepEqual(decodeFit(JSON.parse(JSON.stringify(encodeFit(fits)))), fits);
  assert.ok(FIT_FILES.includes('anytime.mjs'));
  const dir = mkdtempSync(path.join(tmpdir(), 'rz-fit-'));
  try {
    saveFit('nfl', { fits, at: new Date('2026-10-15T12:00:00Z'), finals: 100, rows: rows.length }, dir);
    const back = readFit('nfl', dir).fit.fits;
    assert.deepEqual(back[ANY_KEY].params, f.params);
    assert.equal(back.passTd.params.c_rzPass, 0);
    // (fitProps on the saved fit: the anytime model made from its params (reused), not searched again; the same
    // chances as a model made from the fresh fit's)
    const out = fitProps('nfl', rows, new Map(), new Map(), { rz }, null, null, null, null, back);
    assert.equal(out.anytime.reused, true);
    assert.deepEqual(out.anytime.params, f.params);
    assert.equal(out.fits[ANY_KEY], back[ANY_KEY]);
    const fresh = anytimeModel(list, f.params);
    const who = { pid: 'p0', pos: 'RB', team: 't0', season: 2024, implied: 24 };
    near(out.anytime.model.project(who).p, fresh.project(who).p);
    // (without the red zone read: no anytime model)
    assert.equal(fitProps('nfl', rows, new Map(), new Map(), {}, null, null, null, null, back).anytime, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the anytime touchdown priced: tracked only, never staked, whatever its edge; one out or not a back or receiver not priced', () => {
  const { rows, rz } = league([2023, 2024], 8);
  const list = anytimeRows(rows, rz);
  const model = anytimeModel(list, PARAMS);
  const who = { 'Goal Line': { pid: 'p0', name: 'Goal Line', pos: 'RB', team: 't0' }, Hurt: { pid: 'p1', name: 'Hurt', pos: 'WR', team: 't1' }, Passer: { pid: 'q', name: 'Passer', pos: 'QB', team: 't0' } };
  const prices = new Map([
    ['Goal Line', { name: 'Goal Line', yes: 110, no: -140 }],
    ['Hurt', { name: 'Hurt', yes: 200 }],
    ['Passer', { name: 'Passer', yes: 400 }],
    ['Nobody', { name: 'Nobody', yes: 300 }],
  ]);
  const { priced, skipped } = priceAnytime({ prices, whoOf: (n) => who[n] ?? null, model, season: 2024, implied: () => 24, out: (pid) => pid === 'p1' });
  assert.deepEqual(skipped, { unmatched: 1, position: 1, out: 1 });
  assert.equal(priced.length, 1);
  const x = priced[0];
  // (a goal-line back at +110: an edge by the model)
  assert.ok(x.model > x.fair && x.ev > 0, `model ${x.model} fair ${x.fair} ev ${x.ev}`);
  assert.ok(x.fair > 0.4 && x.fair < 0.5 && !x.fairAssumed);
  // (placed tracked: intent 'track', 0 units; what it'd have staked kept for the learning alone)
  const bet = { id: 'g:prop:anyTd:p0', market: 'prop', propType: ANY_KEY, odds: 900, p: x.p, ev: x.ev, status: 'won', profit: 0, ...anytimePlacement() };
  assert.ok(isTracked(bet));
  assert.equal(bet.units, 0);
  assert.equal(bet.trackUnits, ANY_TRACK_UNITS);
  assert.deepEqual(record([bet]), { bets: 0, won: 0, lost: 0, push: 0, staked: 0, profit: 0, roi: null });
  assert.equal(learnView(bet).units, ANY_TRACK_UNITS);
  // (one placed as an edge bet somehow: held to tracked before it's placed; any other prop as it is)
  const edge = trackOnly({ ...bet, intent: 'edge', units: 3, trackUnits: undefined });
  assert.equal(edge.intent, TRACK);
  assert.equal(edge.units, 0);
  const other = { propType: 'passTd', intent: 'edge', units: 1 };
  assert.equal(trackOnly(other).intent, 'edge');
  // (no No posted: the Yes's own price, vig in)
  const one = priceAnytime({ prices: new Map([['Goal Line', { name: 'Goal Line', yes: 200 }]]), whoOf: (n) => who[n], model, season: 2024, implied: () => 24 }).priced[0];
  assert.ok(one.fairAssumed);
  near(one.fair, 1 / 3);
});

test('the anytime touchdown graded: his rushing and receiving touchdowns, 1 or more wins; not in the box score and no snap, no action', async () => {
  const athlete = (id, stats) => ({ athlete: { id }, stats });
  const body = {
    boxscore: {
      players: [
        {
          statistics: [
            { name: 'rushing', labels: ['CAR', 'YDS', 'AVG', 'TD', 'LONG'], athletes: [athlete('5', ['12', '40', '3.3', '1', '9']), athlete('6', ['3', '10', '3.3', '0', '5'])] },
            { name: 'receiving', labels: ['REC', 'YDS', 'AVG', 'TD', 'LONG', 'TGTS'], athletes: [athlete('6', ['4', '50', '12.5', '0', '20', '6']), athlete('7', ['2', '30', '15', '2', '22', '3'])] },
          ],
        },
      ],
    },
  };
  const bet = (id) => ({ athlete: id, propType: ANY_KEY, player: `P${id}`, side: 'over', line: 0.5, odds: 150, units: 0, statLabel: 'Anytime TD' });
  assert.equal(await statInFinal('nfl', bet('5'), body, null), 1);
  assert.equal(await statInFinal('nfl', bet('6'), body, null), 0);
  assert.equal(await statInFinal('nfl', bet('7'), body, null), 2);
  assert.equal(await statInFinal('nfl', bet('8'), body, null, { played: async () => false }), null);
  assert.equal(settleProp(bet('5'), 1).status, 'won');
  assert.equal(settleProp(bet('6'), 0).status, 'lost');
  assert.equal(settleProp(bet('8'), null).void, true);
});

test('the credit setting: the anytime market asked only while the month\'s projected credits, its own in them, stay under 85%', () => {
  const now = Date.parse('2026-10-15T12:00:00Z');
  const b = (used, live, elapsedDays, daysLeft) => ({ cycleStart: new Date(now - elapsedDays * 864e5).toISOString(), used, remaining: MONTHLY - used, daysLeft, spent: { lines: live * 0.2, props: live * 0.8, history: 5310, other: 0 } });
  // (2026-10-15's: 6,421 used, 1,059 on the live features in 6.3 days, 25 left: about 10,600 projected, history not
  // carried forward)
  const today = b(6421, 1059, 6.3, 25);
  near(projectedMonth(today, now), Math.round(6421 + (1059 / 6.3) * 25), 1);
  const on = anytimeOn(today, ANYTIME_TD, now);
  assert.equal(on.on, true);
  assert.equal(on.limit, 17000);
  assert.equal(on.projected, projectedMonth(today, now) + ANYTIME_TD.monthlyCost);
  // (a month spending fast: off, and why)
  const busy = anytimeOn(b(12000, 4000, 10, 20), ANYTIME_TD, now);
  assert.equal(busy.on, false);
  assert.match(busy.why, /projected credits/);
  // (off by the setting)
  assert.equal(anytimeOn(today, { ...ANYTIME_TD, on: false }, now).on, false);
  // (no cycle yet: what's used)
  assert.equal(projectedMonth({ used: 100, remaining: 19900 }, now), 100);
});

test('the anytime market asked with the NFL\'s props (1 credit more), its Yes and No read by player, the other books\' consensus beside', async () => {
  const asked = [];
  const body = {
    bookmakers: [
      {
        key: 'draftkings',
        markets: [
          { key: 'player_pass_tds', outcomes: [{ name: 'Over', description: 'Q B', price: 1.9, point: 1.5 }, { name: 'Under', description: 'Q B', price: 1.9, point: 1.5 }] },
          { key: 'player_anytime_td', outcomes: [{ name: 'Yes', description: 'R B', price: 2.5 }, { name: 'No', description: 'R B', price: 1.5 }, { name: 'Yes', description: 'W R', price: 4 }] },
        ],
      },
      { key: 'fanduel', markets: [{ key: 'player_anytime_td', outcomes: [{ name: 'Yes', description: 'R B', price: 2.4 }, { name: 'No', description: 'R B', price: 1.55 }] }] },
      { key: 'betmgm', markets: [{ key: 'player_anytime_td', outcomes: [{ name: 'Yes', description: 'R B', price: 2.6 }, { name: 'No', description: 'R B', price: 1.48 }] }] },
    ],
  };
  const ask = async (feature, route, params) => (asked.push(params.markets), body);
  let cost = null;
  const out = await apiProps('nfl', 'ev1', { ask, afford: (n) => ((cost = n), true), anytime: true });
  assert.ok(asked[0].split(',').includes('player_anytime_td'));
  assert.equal(cost, 11);
  assert.ok(out.dkMarkets.includes('player_anytime_td'));
  assert.deepEqual([out.anytime.get('R B').yes, out.anytime.get('R B').no, out.anytime.get('W R').yes, out.anytime.get('W R').no], [150, -200, 300, undefined]);
  assert.equal(out.anytime.get('R B').consensus.n, 2);
  // (its rows never mixed into the over/under lines)
  assert.equal(out.get('Q B|passTd').line, 1.5);
  assert.equal([...out.keys()].length, 1);
  // (off: not asked, the cost the 10 markets')
  asked.length = 0;
  await apiProps('nfl', 'ev1', { ask, afford: (n) => ((cost = n), true), anytime: false });
  assert.ok(!asked[0].split(',').includes('player_anytime_td'));
  assert.equal(cost, 10);
  // (never another sport's)
  await apiProps('nhl', 'ev2', { ask, afford: (n) => ((cost = n), true), anytime: true });
  assert.equal(cost, 3);
  assert.equal(propsFromBodies('nfl', []).anytime.size, 0);
});
