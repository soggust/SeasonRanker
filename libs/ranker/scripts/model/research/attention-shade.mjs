// The Books' over-shade on player props as a function of public attention (DECISIONS.md D111; research only, nothing
// here is read by the desk). D110 measured the NHL's and NBA's prop lines sitting 1.5 to 3 points toward the over and
// found a FLAT shade about the size of DraftKings' hold. The question here: is the shade a quantal-response effect of
// public money, bigger where the crowd is loudest (stars, big markets, thin slates and primetime, playoffs, headline
// lines, both books posting) and near zero on an anonymous fourth-liner on a Tuesday? If so the under in the loud
// bucket could clear the hold where the flat shade couldn't. Model-free and walk-forward: every feature is known before
// the game (a prior season's rank, the season-to-date rate before the game, the slate that night, the start time, the
// teams' records before the game, a fixed market list, the game's type).
//
//   props <nhl|nba> [c|o]   every DraftKings and Pinnacle prop line in the archive (odds-history, the close 'c' or the
//                           open 'o'), graded from the player-log cache (.cache/model/players-<sport>.json; a DNP or a
//                           push is out). The under side's record, win rate against its break-even at the book's own
//                           price, its no-vig fair, the shade (the under's actual rate less its fair: mean(fOver - y)
//                           in the over's frame, as shade.mjs fitShade reads it) and ROI, by each feature's levels and
//                           by an attention index's deciles (fixed weights, nothing fitted on outcomes), by season;
//                           the over's ROI beside it (the mirror); the same props at both books (does Pinnacle, the
//                           sharp book, shade less?); the confounds (the playoffs against a thin regular-season slate,
//                           stars and markets inside the playoffs)
//   lines <sport> [dk|pin]  the game lines 2020 on (the close): the over's and the favorite's actual rate less their
//                           fair by the same attention features and by season, as corroboration (the public loves
//                           overs and favorites there too)
//
// Usage: node libs/ranker/scripts/model/research/attention-shade.mjs props nhl c
//        node libs/ranker/scripts/model/research/attention-shade.mjs lines nba dk
// Plain JavaScript, no dependency; reads the committed archive and the player-log cache, writes nothing.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '../../../../..');
const [MODE = 'props', SPORT = 'nhl', ARG] = process.argv.slice(2);
const be = (o) => (o < 0 ? -o / (-o + 100) : 100 / (o + 100));
const pay = (o) => (o < 0 ? 100 / -o : o / 100);
const fin = Number.isFinite;

// (the archive's markets to the stat keys of the player-log cache)
const MARKETS = {
  nhl: { player_points: 'pts', player_shots_on_goal: 'sh', player_total_saves: 'sv' },
  nba: { player_points: 'pts', player_rebounds: 'reb', player_assists: 'ast', player_threes: 'fg3', player_points_rebounds_assists: 'pra' },
};
// (a fixed market list by metro and fan base: 2 the biggest, 1 mid, the rest 0; nothing here is fitted)
const MARKET = {
  nhl: { 'New York Rangers': 2, 'Toronto Maple Leafs': 2, 'Montreal Canadiens': 2, 'Chicago Blackhawks': 2, 'Boston Bruins': 2, 'Los Angeles Kings': 2, 'Philadelphia Flyers': 2, 'Detroit Red Wings': 2, 'Edmonton Oilers': 2, 'Pittsburgh Penguins': 2,
    'New York Islanders': 1, 'New Jersey Devils': 1, 'Washington Capitals': 1, 'Dallas Stars': 1, 'Vancouver Canucks': 1, 'Tampa Bay Lightning': 1, 'Florida Panthers': 1, 'Colorado Avalanche': 1, 'Minnesota Wild': 1, 'Vegas Golden Knights': 1, 'St Louis Blues': 1, 'St. Louis Blues': 1, 'San Jose Sharks': 1, 'Calgary Flames': 1, 'Ottawa Senators': 1, 'Anaheim Ducks': 1 },
  nba: { 'Los Angeles Lakers': 2, 'Golden State Warriors': 2, 'Boston Celtics': 2, 'New York Knicks': 2, 'Chicago Bulls': 2, 'Miami Heat': 2, 'Dallas Mavericks': 2, 'Philadelphia 76ers': 2, 'Brooklyn Nets': 2,
    'Houston Rockets': 1, 'Phoenix Suns': 1, 'Milwaukee Bucks': 1, 'Denver Nuggets': 1, 'Atlanta Hawks': 1, 'Toronto Raptors': 1, 'Cleveland Cavaliers': 1, 'Minnesota Timberwolves': 1, 'Sacramento Kings': 1, 'Los Angeles Clippers': 1, 'Washington Wizards': 1, 'Detroit Pistons': 1, 'Portland Trail Blazers': 1, 'Oklahoma City Thunder': 1 },
  nfl: { 'Dallas Cowboys': 2, 'New York Giants': 2, 'New York Jets': 2, 'Philadelphia Eagles': 2, 'Pittsburgh Steelers': 2, 'Green Bay Packers': 2, 'San Francisco 49ers': 2, 'Kansas City Chiefs': 2, 'Chicago Bears': 2, 'New England Patriots': 2, 'Los Angeles Rams': 2, 'Buffalo Bills': 2 },
  mlb: { 'New York Yankees': 2, 'Los Angeles Dodgers': 2, 'Boston Red Sox': 2, 'Chicago Cubs': 2, 'New York Mets': 2, 'Philadelphia Phillies': 2, 'Atlanta Braves': 2, 'San Francisco Giants': 2, 'Houston Astros': 2, 'St. Louis Cardinals': 2, 'St Louis Cardinals': 2 },
};
const DIVISION = {
  nhl: { 'Boston Bruins': 'ATL', 'Buffalo Sabres': 'ATL', 'Detroit Red Wings': 'ATL', 'Florida Panthers': 'ATL', 'Montreal Canadiens': 'ATL', 'Ottawa Senators': 'ATL', 'Tampa Bay Lightning': 'ATL', 'Toronto Maple Leafs': 'ATL',
    'Carolina Hurricanes': 'MET', 'Columbus Blue Jackets': 'MET', 'New Jersey Devils': 'MET', 'New York Islanders': 'MET', 'New York Rangers': 'MET', 'Philadelphia Flyers': 'MET', 'Pittsburgh Penguins': 'MET', 'Washington Capitals': 'MET',
    'Chicago Blackhawks': 'CEN', 'Colorado Avalanche': 'CEN', 'Dallas Stars': 'CEN', 'Minnesota Wild': 'CEN', 'Nashville Predators': 'CEN', 'St Louis Blues': 'CEN', 'St. Louis Blues': 'CEN', 'Utah Hockey Club': 'CEN', 'Utah Mammoth': 'CEN', 'Arizona Coyotes': 'CEN', 'Winnipeg Jets': 'CEN',
    'Anaheim Ducks': 'PAC', 'Calgary Flames': 'PAC', 'Edmonton Oilers': 'PAC', 'Los Angeles Kings': 'PAC', 'San Jose Sharks': 'PAC', 'Seattle Kraken': 'PAC', 'Vancouver Canucks': 'PAC', 'Vegas Golden Knights': 'PAC' },
  nba: { 'Boston Celtics': 'ATL', 'Brooklyn Nets': 'ATL', 'New York Knicks': 'ATL', 'Philadelphia 76ers': 'ATL', 'Toronto Raptors': 'ATL', 'Chicago Bulls': 'CEN', 'Cleveland Cavaliers': 'CEN', 'Detroit Pistons': 'CEN', 'Indiana Pacers': 'CEN', 'Milwaukee Bucks': 'CEN',
    'Atlanta Hawks': 'SE', 'Charlotte Hornets': 'SE', 'Miami Heat': 'SE', 'Orlando Magic': 'SE', 'Washington Wizards': 'SE', 'Denver Nuggets': 'NW', 'Minnesota Timberwolves': 'NW', 'Oklahoma City Thunder': 'NW', 'Portland Trail Blazers': 'NW', 'Utah Jazz': 'NW',
    'Golden State Warriors': 'PAC', 'Los Angeles Clippers': 'PAC', 'Los Angeles Lakers': 'PAC', 'Phoenix Suns': 'PAC', 'Sacramento Kings': 'PAC', 'Dallas Mavericks': 'SW', 'Houston Rockets': 'SW', 'Memphis Grizzlies': 'SW', 'New Orleans Pelicans': 'SW', 'San Antonio Spurs': 'SW' },
};

// The archive (odds-history.mjs's rows): the events with their ESPN game, the lines or the props asked for
function readArchive(sport, want) {
  const dir = path.join(ROOT, 'apps', sport, 'scripts/model/odds-history');
  const events = new Map();
  const rows = [];
  for (const f of readdirSync(dir).filter((f) => /^\d{4}\.jsonl\.gz$/.test(f))) {
    for (const l of gunzipSync(readFileSync(path.join(dir, f))).toString('utf8').split('\n')) {
      if (!l) continue;
      const r = JSON.parse(l);
      if (r[0] === 'E') {
        if (!events.has(r[1])) events.set(r[1], { oid: r[1], id: r[2], t: r[3], season: r[4], type: r[5], homeId: r[6], awayId: r[7], hs: r[8], as: r[9], home: r[10], away: r[11] });
      } else if (want(r)) rows.push(r);
    }
  }
  return { events, rows };
}
// (ET local time: the day the slate is counted on, the start hour, the weekday)
const etOf = (iso) => {
  const d = new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return { day: `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`, hour: d.getHours() + d.getMinutes() / 60, dow: d.getDay() };
};
// (each event's ET parts, the slate that night, each team's record before the game: all walk-forward)
function annotate(events) {
  const list = [...events.values()].filter((e) => e.id).sort((a, b) => (a.t < b.t ? -1 : 1));
  const slate = new Map();
  for (const e of list) {
    e.et = etOf(e.t);
    slate.set(e.et.day, (slate.get(e.et.day) ?? 0) + 1);
  }
  const rec = new Map();
  for (const e of list) {
    e.slate = slate.get(e.et.day) ?? 1;
    const kh = `${e.season}|${e.homeId}`;
    const ka = `${e.season}|${e.awayId}`;
    const rh = rec.get(kh) ?? { w: 0, g: 0 };
    const ra = rec.get(ka) ?? { w: 0, g: 0 };
    e.homePct = rh.g >= 10 ? rh.w / rh.g : null;
    e.awayPct = ra.g >= 10 ? ra.w / ra.g : null;
    if (fin(e.hs) && fin(e.as)) {
      rh.g++;
      ra.g++;
      if (e.hs > e.as) rh.w++;
      else ra.w++;
      rec.set(kh, rh);
      rec.set(ka, ra);
    }
  }
  return list;
}

// The under side's record on rows in the over's frame ({ fairOver, overWon, under: the under's American price })
const underStat = (arr) => {
  let w = 0, l = 0, eb = 0, ef = 0, v = 0, prof = 0, sh = 0;
  for (const r of arr) {
    const q = be(r.under);
    eb += q;
    ef += 1 - r.fairOver;
    v += q * (1 - q);
    sh += r.fairOver - (r.overWon ? 1 : 0);
    if (!r.overWon) {
      w++;
      prof += pay(r.under);
    } else {
      l++;
      prof -= 1;
    }
  }
  const n = w + l;
  return { n, w, l, win: w / n, be: eb / n, fair: ef / n, z: (w - eb) / Math.sqrt(v || 1), roi: prof / n, shade: sh / n };
};
const overRoi = (arr) => {
  let prof = 0;
  for (const r of arr) prof += r.overWon ? pay(r.over) : -1;
  return prof / (arr.length || 1);
};
const pct = (v, d = 1) => (100 * v).toFixed(d);
const fmtUnder = (s) => (s.n ? `${String(s.w).padStart(5)}-${String(s.l).padEnd(5)} win ${pct(s.win).padStart(5)} BE ${pct(s.be)} fair ${pct(s.fair)} shade ${pct(s.shade, 2).padStart(5)} z(BE) ${s.z.toFixed(2).padStart(6)} ROI ${pct(s.roi).padStart(6)}%` : '-');

function props(sport, kind = 'c') {
  const MK = MARKETS[sport];
  if (!MK) throw new Error(`props: ${sport} has no prop markets here (nhl, nba)`);
  const P = JSON.parse(readFileSync(path.join(ROOT, '.cache/model', `players-${sport}.json`), 'utf8'));
  const { events, rows: praw } = readArchive(sport, (r) => r[0] === 'P' && r[2] === kind && MK[r[5]]);
  const list = annotate(events);
  const byGame = new Map(list.map((e) => [e.id, e]));
  // (the player-log cache's lines: the NHL's [id, name, pos, toi, shots, goals, assists, pp] and goalies [id, name, 'G', min, saves];
  // the NBA's [id, name, pos, min, pts, reb, ast, fg3, ...]; a player's games by name, in time order)
  const logs = new Map();
  for (const [gid, g] of Object.entries(P)) {
    const e = byGame.get(gid);
    if (!e) continue;
    for (const side of ['h', 'a']) {
      for (const row of g[side] ?? []) {
        if (!Array.isArray(row)) continue;
        let v, mins, star;
        if (sport === 'nhl') {
          const [, , pos, toi, sh, gl, as] = row;
          if (pos === 'G') {
            v = { sv: row[4] };
            mins = toi;
            star = row[4];
          } else {
            if (!fin(sh)) continue;
            v = { sh, pts: (gl ?? 0) + (as ?? 0) };
            mins = toi;
            star = (gl ?? 0) + (as ?? 0);
          }
        } else {
          const [, , , min, pts, reb, ast, fg3] = row;
          if (!fin(pts) || !(min > 0)) continue;
          v = { pts, reb, ast, fg3, pra: pts + reb + ast };
          mins = min;
          star = pts;
        }
        (logs.get(row[1]) ?? logs.set(row[1], []).get(row[1])).push({ gid, t: e.t, season: e.season, v, mins, star, team: side === 'h' ? e.home : e.away, opp: side === 'h' ? e.away : e.home, home: side === 'h' });
      }
    }
  }
  for (const a of logs.values()) a.sort((x, y) => (x.t < y.t ? -1 : 1));
  // (stardom, walk-forward: the player's percentile by his mean points (NHL) or points (NBA) in the PRIOR season, among the
  // players with enough games in it)
  const MING = sport === 'nhl' ? 30 : 25;
  const means = new Map();
  for (const [name, a] of logs) {
    const by = new Map();
    for (const x of a) (by.get(x.season) ?? by.set(x.season, []).get(x.season)).push(x);
    for (const [s, l] of by) if (l.length >= MING) (means.get(s) ?? means.set(s, new Map()).get(s)).set(name, l.reduce((q, x) => q + x.star, 0) / l.length);
  }
  const pctOf = new Map();
  for (const [s, m] of means) {
    const arr = [...m.entries()].sort((a, b) => a[1] - b[1]);
    arr.forEach(([name], i) => pctOf.set(`${s}|${name}`, (i + 0.5) / arr.length));
  }
  // one row per (event, player, stat, book): the latest snapshot, its line priced closest to even
  const last = new Map();
  for (const r of praw) {
    const p = { oid: r[1], ts: r[3], book: r[4], stat: MK[r[5]], player: r[6], line: r[7], over: r[8], under: r[9] };
    if (!fin(p.over) || !fin(p.under)) continue;
    const k = `${p.oid}|${p.player}|${p.stat}|${p.book}`;
    const o = last.get(k);
    const juice = Math.abs(be(p.over) - be(p.under));
    if (!o || p.ts > o.ts || (p.ts === o.ts && juice < o.juice)) last.set(k, { ...p, juice });
  }
  const books = new Map();
  for (const p of last.values()) {
    const k = `${p.oid}|${p.player}|${p.stat}`;
    books.set(k, (books.get(k) ?? 0) + 1);
  }
  const rows = [];
  let noLog = 0, noGame = 0, pushes = 0;
  for (const p of last.values()) {
    const e = events.get(p.oid);
    if (!e?.id) continue;
    const lg = logs.get(p.player);
    if (!lg) {
      noLog++;
      continue;
    }
    const i = lg.findIndex((x) => x.gid === e.id);
    if (i < 0) {
      noGame++;
      continue;
    }
    const x = lg[i];
    const actual = x.v[p.stat];
    if (!fin(actual)) continue;
    if (actual === p.line) {
      pushes++;
      continue;
    }
    const prior = lg.slice(0, i).filter((y) => y.season === e.season);
    const stdMins = prior.length >= 5 ? prior.reduce((q, y) => q + y.mins, 0) / prior.length : null;
    const io = be(p.over);
    const iu = be(p.under);
    const M = MARKET[sport];
    const D = DIVISION[sport];
    rows.push({ season: e.season, stat: p.stat, book: p.book, line: p.line, over: p.over, under: p.under, fairOver: io / (io + iu), overWon: actual > p.line,
      prevPct: pctOf.get(`${e.season - 1}|${p.player}`) ?? null, stdMins, mkt: Math.max(M[x.team] ?? 0, M[x.opp] ?? 0), ownMkt: M[x.team] ?? 0, slate: e.slate, hour: e.et.hour, dow: e.et.dow,
      div: !!D[x.team] && D[x.team] === D[x.opp], playoff: e.type === 3, oppPct: x.home ? e.awayPct : e.homePct, ownPct: x.home ? e.homePct : e.awayPct, books: books.get(`${p.oid}|${p.player}|${p.stat}`) ?? 1, key: `${p.oid}|${p.player}|${p.stat}` });
  }
  console.log(`${sport} ${kind === 'c' ? 'close' : 'open'}: props ${praw.length}, unique ${last.size}, usable ${rows.length} (no log ${noLog}, not in the game ${noGame}, pushes ${pushes})`);
  const seasons = [...new Set(rows.map((r) => r.season))].sort();
  console.log(`by season: ${seasons.map((s) => `${s} ${rows.filter((r) => r.season === s).length}`).join(', ')}`);
  // (the line's tercile within its stat)
  const lineQ = new Map();
  for (const st of new Set(rows.map((r) => r.stat))) {
    const ls = rows.filter((r) => r.stat === st).map((r) => r.line).sort((a, b) => a - b);
    lineQ.set(st, [ls[Math.floor(ls.length / 3)], ls[Math.floor((2 * ls.length) / 3)]]);
  }
  const lineT = (r) => {
    const [a, b] = lineQ.get(r.stat);
    return r.line < a ? 0 : r.line < b ? 1 : 2;
  };
  const weekend = (r) => r.dow === 5 || r.dow === 6 || r.dow === 0;
  const FEATS = {
    'prior-season star percentile': (r) => (r.prevPct == null ? null : r.prevPct < 0.5 ? '0 low' : r.prevPct < 0.8 ? '1 mid' : r.prevPct < 0.95 ? '2 high' : '3 top5%'),
    'line magnitude (tercile in the stat)': (r) => ['0 low', '1 mid', '2 high'][lineT(r)],
    'season-to-date minutes': (r) => (r.stdMins == null ? null : sport === 'nhl' ? (r.stdMins < 15 ? '0 <15' : r.stdMins < 19 ? '1 15-19' : '2 19+') : r.stdMins < 26 ? '0 <26' : r.stdMins < 32 ? '1 26-32' : '2 32+'),
    'market (the bigger of the two teams)': (r) => `${r.mkt}`,
    'own team market': (r) => `${r.ownMkt}`,
    'slate (games that night)': (r) => (r.slate <= 3 ? '0 1-3' : r.slate <= 6 ? '1 4-6' : r.slate <= 9 ? '2 7-9' : '3 10+'),
    'weekend (Fri/Sat/Sun ET)': (r) => (weekend(r) ? '1 yes' : '0 no'),
    'Saturday night (ET)': (r) => (r.dow === 6 && r.hour >= 18 ? '1 yes' : '0 no'),
    'start hour (ET)': (r) => (r.hour < 18 ? '0 <6pm' : r.hour < 19.75 ? '1 6-7:45' : r.hour < 21.5 ? '2 7:45-9:30' : '3 9:30+'),
    'division game': (r) => (r.div ? '1 yes' : '0 no'),
    playoff: (r) => (r.playoff ? '1 yes' : '0 no'),
    'opponent win% to date': (r) => (r.oppPct == null ? null : r.oppPct < 0.45 ? '0 <.45' : r.oppPct < 0.55 ? '1 .45-.55' : '2 .55+'),
    'own team win% to date': (r) => (r.ownPct == null ? null : r.ownPct < 0.45 ? '0 <.45' : r.ownPct < 0.55 ? '1 .45-.55' : '2 .55+'),
    'books posting it (dk, pin)': (r) => `${r.books}`,
  };
  let cells = 0;
  const bySeason = (a, min, pad) => {
    for (const s of seasons) {
      const x = a.filter((r) => r.season === s);
      if (x.length >= min) {
        console.log(`${pad} ${s} ${fmtUnder(underStat(x))}  over ROI ${pct(overRoi(x))}%`);
        cells++;
      }
    }
  };
  for (const book of ['dk', 'pin']) {
    const R = rows.filter((r) => r.book === book);
    console.log(`\n######## ${sport.toUpperCase()} ${book.toUpperCase()} ${kind === 'c' ? 'close' : 'open'}: the UNDER by feature (shade = the under's actual rate less its no-vig fair, in points) ########`);
    for (const [name, fn] of Object.entries(FEATS)) {
      const by = new Map();
      for (const r of R) {
        const k = fn(r);
        if (k == null) continue;
        (by.get(k) ?? by.set(k, []).get(k)).push(r);
      }
      console.log(`\n-- ${name} --`);
      for (const k of [...by.keys()].sort()) {
        const a = by.get(k);
        console.log(`${k.padEnd(12)} ALL  ${fmtUnder(underStat(a))}  over ROI ${pct(overRoi(a))}%`);
        cells++;
        bySeason(a, 200, ''.padEnd(12));
      }
    }
  }
  // the attention index: fixed weights (a star 0-2, the line 0-1, the market 0-1, the slate 0-1, the weekend 0.5, the
  // playoffs 1.5, a division game 0.25, both books 0.5); deciles within the book
  const idx = (r) => (r.prevPct ?? 0.5) * 2 + lineT(r) * 0.5 + (r.mkt === 2 ? 1 : r.mkt === 1 ? 0.5 : 0) + (r.slate <= 3 ? 1 : r.slate <= 6 ? 0.5 : 0) + (weekend(r) ? 0.5 : 0) + (r.playoff ? 1.5 : 0) + (r.div ? 0.25 : 0) + (r.books === 2 ? 0.5 : 0);
  for (const r of rows) r.idx = idx(r);
  for (const book of ['dk', 'pin']) {
    const R = rows.filter((r) => r.book === book);
    const sorted = R.map((r) => r.idx).sort((a, b) => a - b);
    const q = (k) => sorted[Math.floor((sorted.length * k) / 10)];
    const dec = (r) => {
      let d = 0;
      while (d < 9 && r.idx >= q(d + 1)) d++;
      return d;
    };
    console.log(`\n######## ${sport.toUpperCase()} ${book.toUpperCase()} ${kind}: the UNDER by ATTENTION DECILE (0 anonymous .. 9 loudest) ########`);
    for (let d = 0; d < 10; d++) {
      const a = R.filter((r) => dec(r) === d);
      console.log(`dec ${d}  ALL  ${fmtUnder(underStat(a))}  over ROI ${pct(overRoi(a))}%`);
      cells++;
      bySeason(a, 100, '      ');
    }
    console.log(`\n-- ${book} the loudest 10% (decile 9) by season --`);
    bySeason(R.filter((r) => dec(r) === 9), 1, '');
    console.log(`-- ${book} the loudest 20% (deciles 8-9) by season --`);
    bySeason(R.filter((r) => dec(r) >= 8), 1, '');
  }
  // the same props at both books: does the sharp book shade less?
  {
    const dk = new Map(rows.filter((r) => r.book === 'dk').map((r) => [r.key, r]));
    const pin = rows.filter((r) => r.book === 'pin' && dk.has(r.key));
    console.log(`\n######## ${sport.toUpperCase()} the same props at both books (n ${pin.length}): the shade and the under's ROI at each ########`);
    console.log(`DK   ${fmtUnder(underStat(pin.map((r) => dk.get(r.key))))}`);
    console.log(`PIN  ${fmtUnder(underStat(pin))}`);
    for (const s of seasons) {
      const p = pin.filter((r) => r.season === s);
      if (p.length < 200) continue;
      console.log(`${s} DK  ${fmtUnder(underStat(p.map((r) => dk.get(r.key))))}`);
      console.log(`${s} PIN ${fmtUnder(underStat(p))}`);
      cells += 2;
    }
  }
  // the confounds (DraftKings): the playoffs against a thin regular-season slate; stars and markets inside the playoffs;
  // the loudest regular-season 10% with the playoff weight out
  {
    const R = rows.filter((r) => r.book === 'dk');
    const reg = R.filter((r) => !r.playoff);
    const show = (t, a) => {
      console.log(`${t.padEnd(46)} ALL  ${fmtUnder(underStat(a))}`);
      cells++;
      bySeason(a, 150, ''.padEnd(46));
    };
    console.log(`\n######## ${sport.toUpperCase()} DK ${kind}: the confounds ########`);
    show('regular season, slate 1-3 (thin, not the playoffs)', reg.filter((r) => r.slate <= 3));
    show('regular season, slate 4+', reg.filter((r) => r.slate > 3));
    show('playoffs, all', R.filter((r) => r.playoff));
    show('playoffs, stars (top 20% prior season)', R.filter((r) => r.playoff && r.prevPct >= 0.8));
    show('playoffs, the bottom half prior season', R.filter((r) => r.playoff && r.prevPct != null && r.prevPct < 0.5));
    show('playoffs, a big market on either side', R.filter((r) => r.playoff && r.mkt === 2));
    show('playoffs, small or mid markets', R.filter((r) => r.playoff && r.mkt < 2));
    for (const st of [...new Set(R.map((r) => r.stat))].sort()) show(`playoffs, ${st}`, R.filter((r) => r.playoff && r.stat === st));
    const regIdx = (r) => (r.prevPct ?? 0.5) * 2 + (r.mkt === 2 ? 1 : r.mkt === 1 ? 0.5 : 0) + (r.slate <= 3 ? 1 : r.slate <= 6 ? 0.5 : 0) + (weekend(r) ? 0.5 : 0) + (r.div ? 0.25 : 0);
    const v = reg.map(regIdx).sort((a, b) => a - b);
    const q9 = v[Math.floor(v.length * 0.9)];
    const q1 = v[Math.floor(v.length * 0.1)];
    show('regular season, the loudest 10%', reg.filter((r) => regIdx(r) >= q9));
    show('regular season, the quietest 10%', reg.filter((r) => regIdx(r) <= q1));
    const vig = (a) => a.reduce((q, r) => q + be(r.under) - (1 - r.fairOver), 0) / (a.length || 1);
    console.log(`the under side's vig (break-even less fair): regular season ${pct(vig(reg), 2)}, playoffs ${pct(vig(R.filter((r) => r.playoff)), 2)}`);
  }
  console.log(`\ncells reported: ${cells}`);
}

// The game lines (the close): the public's sides (the over, the favorite) by the same features
function lines(sport, book = 'dk') {
  const M = MARKET[sport] ?? {};
  const { events, rows: lraw } = readArchive(sport, (r) => r[0] === 'L' && r[2] === 'c' && r[4] === book && (r[5] === 'totals' || r[5] === 'h2h'));
  annotate(events);
  const last = new Map();
  for (const r of lraw) {
    const l = { oid: r[1], ts: r[3], market: r[5], line: r[6], a: r[7], b: r[8] };
    const k = `${l.oid}|${l.market}`;
    const o = last.get(k);
    if (!o || l.ts > o.ts) last.set(k, l);
  }
  const rows = [];
  for (const l of last.values()) {
    const e = events.get(l.oid);
    if (!e?.id || !fin(e.hs) || !fin(e.as) || !fin(l.a) || !fin(l.b)) continue;
    const ia = be(l.a);
    const ib = be(l.b);
    const fa = ia / (ia + ib);
    const base = { season: e.season, playoff: e.type === 3, big: (M[e.home] ?? 0) === 2 || (M[e.away] ?? 0) === 2, slate: e.slate, weekend: [0, 5, 6].includes(e.et.dow), prime: e.et.hour >= 19.5 && e.et.hour < 21.5 };
    if (l.market === 'totals') {
      const tot = e.hs + e.as;
      if (tot === l.line) continue;
      rows.push({ ...base, kind: 'the over', fair: fa, odds: l.a, won: tot > l.line });
    } else {
      if (e.hs === e.as) continue;
      const favHome = fa >= 0.5;
      rows.push({ ...base, kind: 'the favorite', fair: favHome ? fa : 1 - fa, odds: favHome ? l.a : l.b, won: favHome ? e.hs > e.as : e.as > e.hs });
    }
  }
  const S = (arr) => {
    let w = 0, l = 0, ef = 0, eb = 0, prof = 0;
    for (const r of arr) {
      ef += r.fair;
      eb += be(r.odds);
      if (r.won) {
        w++;
        prof += pay(r.odds);
      } else {
        l++;
        prof -= 1;
      }
    }
    const n = w + l;
    return { n, w, l, win: w / n, fair: ef / n, be: eb / n, shade: w / n - ef / n, roi: prof / n };
  };
  const fmt = (s) => (s.n ? `${String(s.w).padStart(5)}-${String(s.l).padEnd(5)} win ${pct(s.win).padStart(5)} fair ${pct(s.fair)} BE ${pct(s.be)} shade (actual less fair) ${pct(s.shade, 2).padStart(6)} ROI ${pct(s.roi).padStart(6)}%` : '-');
  const seasons = [...new Set(rows.map((r) => r.season))].sort();
  console.log(`${sport.toUpperCase()} ${book} close game lines: ${rows.length} rows, seasons ${seasons.join(' ')}`);
  const F = { all: () => 'all', 'big market': (r) => (r.big ? '1 yes' : '0 no'), 'slate 1-3 games': (r) => (r.slate <= 3 ? '1 thin' : '0 full'), weekend: (r) => (r.weekend ? '1 yes' : '0 no'), 'prime 7:30-9:30 ET': (r) => (r.prime ? '1 yes' : '0 no'), playoff: (r) => (r.playoff ? '1 yes' : '0 no') };
  let cells = 0;
  for (const kind of ['the over', 'the favorite']) {
    const R = rows.filter((r) => r.kind === kind);
    console.log(`\n==== ${kind.toUpperCase()} (the public's side) ====`);
    for (const [name, fn] of Object.entries(F)) {
      const by = new Map();
      for (const r of R) (by.get(fn(r)) ?? by.set(fn(r), []).get(fn(r))).push(r);
      for (const k of [...by.keys()].sort()) {
        const a = by.get(k);
        console.log(`${name.padEnd(20)} ${k.padEnd(7)} ALL  ${fmt(S(a))}`);
        cells++;
        if (name !== 'all' && k.startsWith('0')) continue;
        for (const s of seasons) {
          const x = a.filter((r) => r.season === s);
          if (x.length >= 60) {
            console.log(`${''.padEnd(28)} ${s} ${fmt(S(x))}`);
            cells++;
          }
        }
      }
    }
  }
  console.log(`\ncells reported: ${cells}`);
}

if (MODE === 'props') props(SPORT, ARG ?? 'c');
else if (MODE === 'lines') lines(SPORT, ARG ?? 'dk');
else {
  console.error('usage: attention-shade.mjs props <nhl|nba> [c|o] | lines <sport> [dk|pin]');
  process.exit(2);
}
