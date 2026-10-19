// Every team's look (libs/ranker/src/engine/team-look.ts, the one source of team colors), worked out logo by
// logo and written to libs/ranker/src/engine/team-looks/<sport>.json, with what tests/team-looks.test.mjs
// checks in <sport>.checks.json beside it.
//
//   node scripts/build-team-looks.mjs            (npm run team-looks) every sport
//   node scripts/build-team-looks.mjs nba nhl    some
//
// Run it after a logo is added or changed (a new era in logo-eras.ts, a rebrand) or a sport's
// team-colors.ts is: the test fails until it is (it keeps each logo's hash and each input's). Needs a
// Chrome or Edge to draw the logos in (CHROME=<path> if it isn't found).
//
// Each logo file, today's and every old era's, is drawn at 160px and its colors counted (all of it, and its
// silhouette's edge). Then, from its team's two colors in team-colors.ts (an era's own: its ERA_COLORS, else
// its logo's when it doesn't use today's), and that file's OVERRIDES:
//   the chip's face: the team's own color toned for the dark board, if the logo reads on it; else its
//     second color (not a gold or a yellow: toned down it goes mustard); else cream or near-black, whichever
//     the logo stands out from more (a black team's near-black when its logo reads there)
//   the rim: the curated second color (the color when the face already is the second color)
//   the accent: the team's color lifted to show on the board (a black team's: its rim); accentSafe the same
//     but never a red or a green (its other color, else a light neutral); other: its second color, lifted
//   the washes: a deep tone of its own hue, and a hero's two ends in it (charcoal for a black team)
// A logo reads on a face when its silhouette's edge stands off it (a light ring round a same-color body is
// how teams draw one), or most of it does: each color counts as standing off at a CIEDE2000 distance of 20.
// And whether it reads on the bare board, no chip behind it (look.mjs darkBy; the Book's rows and the game
// view's bets draw it so): that logo's, and ESPN's two drawings of each team's current one (it fetches them).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, contrast, dominantOf, fromLch, lch, load, darkBy, lookOf, onBoard, sha, sourceHash, visibility } from './team-looks/look.mjs';
import { WATERMARK, watermarkDir, watermarkName, watermarkSource } from './team-looks/watermark.mjs';

const OUT = path.join(ROOT, 'libs/ranker/src/engine/team-looks');
const ICONS = { nfl: 'NFL_Icons', nba: 'NBA_Icons', nhl: 'NHL_Icons', mlb: 'MLB_Icons' };
const SPORTS = [...Object.keys(ICONS), 'mma'];
// (ESPN's two drawings of a team's logo the site shows: teamlogos/<sport>/<variant>/<abbr>.png)
const ESPN_VARIANTS = ['500', '500-dark'];

// ---------------------------------------------------------------------------
// Drawing the logos: a headless Chrome (or Edge) driven over its DevTools protocol
// ---------------------------------------------------------------------------
function findChrome() {
  const candidates = [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  const found = candidates.find((c) => c && fs.existsSync(c));
  if (!found) throw new Error('No Chrome or Edge found: set CHROME to one');
  return found;
}

async function browser() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'team-looks-chrome-'));
  const proc = spawn(findChrome(), ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const url = await new Promise((resolve, reject) => {
    let err = '';
    proc.stderr.on('data', (d) => {
      err += d;
      const m = err.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) resolve(m[1]);
    });
    proc.on('exit', () => reject(new Error(`Chrome exited: ${err}`)));
  });
  const ws = new WebSocket(url);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let seq = 0;
  const waiting = new Map();
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    const w = waiting.get(msg.id);
    if (!w) return;
    waiting.delete(msg.id);
    if (msg.error) w.reject(new Error(msg.error.message));
    else w.resolve(msg.result);
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      waiting.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  return {
    async evaluate(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
      return r.result.value;
    },
    close() {
      ws.close();
      proc.kill();
      setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 500);
    },
  };
}

// (a logo drawn at 160px: its opaque pixels' colors counted in 4-bit buckets, all of it and its silhouette's
// edge, the 80 biggest of each)
const SAMPLE = `async (url) => {
  const img = new Image();
  img.src = url;
  await img.decode().catch(() => {});
  const N = 160, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const w = img.naturalWidth || N, h = img.naturalHeight || N, s = Math.min(N / w, N / h);
  g.drawImage(img, (N - w * s) / 2, (N - h * s) / 2, w * s, h * s);
  const d = g.getImageData(0, 0, N, N).data;
  const A = (x, y) => (x < 0 || y < 0 || x >= N || y >= N ? 0 : d[(y * N + x) * 4 + 3]);
  const px = [], ed = [];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      if (d[i + 3] <= 200) continue;
      px.push([d[i], d[i + 1], d[i + 2]]);
      if ([[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => A(x + dx, y + dy) < 60)) ed.push([d[i], d[i + 1], d[i + 2]]);
    }
  const q = (arr) => {
    const m = new Map();
    for (const [r, gg, bb] of arr) {
      const k = ((r >> 4) << 8) | ((gg >> 4) << 4) | (bb >> 4);
      const e = m.get(k) || [0, 0, 0, 0];
      e[0] += r; e[1] += gg; e[2] += bb; e[3]++;
      m.set(k, e);
    }
    return [...m.values()].map((e) => [e[0] / e[3], e[1] / e[3], e[2] / e[3], e[3]]).sort((a, b) => b[3] - a[3]).slice(0, 80);
  };
  return { n: px.length, buckets: q(px), edge: q(ed) };
}`;

// ---------------------------------------------------------------------------
// A sport
// ---------------------------------------------------------------------------
// (an NHL logo's seasons, from its name: "ANA_20062007-20122013.svg" -> [2007, 2013], a season by the year it
// ends in)
function nhlSeasons(file) {
  const m = file.match(/_(\d{4})(\d{4})(?:-(\d{4})(\d{4}))?\.svg$/);
  return m ? [Number(m[2]), Number(m[4] ?? m[2])] : null;
}

// (a team's era ranges, from the sport's logoForSeason: [first season, last season, that era's file])
function erasOf(logoForSeason, dir, current) {
  const ranges = [];
  for (let season = 1990; season <= 2040; season++) {
    const logo = logoForSeason(dir + current, season);
    const key = logo.slice(logo.indexOf(dir) + dir.length);
    if (key === current) continue;
    const last = ranges.at(-1);
    if (last && last[2] === key && last[1] === season - 1) last[1] = season;
    else ranges.push([season, season, key]);
  }
  return ranges;
}

async function buildSport(sport, chrome) {
  const sportDir = path.join(ROOT, 'apps', sport, 'src/sport');
  const inputsFile = path.join(sportDir, 'team-colors.ts');
  const erasFile = path.join(sportDir, 'logo-eras.ts');
  const inputs = await load(inputsFile);
  const source = sourceHash(sport);
  const fields = ['face', 'rim', 'accent', 'accentSafe', 'other', 'deep', 'hi', 'lo'];
  if (sport === 'mma') {
    const d = inputs.DEFAULT_LOOK;
    const look = { face: d.face, rim: d.rim, accent: d.accent, accentSafe: d.accent, other: d.rim, deep: d.face, hi: fromLch(30, 30, lch(d.face)[2]), lo: fromLch(10, 12, lch(d.face)[2]) };
    return { file: { dir: '', fields, teams: {}, looks: {}, default: [...fields.map((f) => look[f]), 0] }, checks: { source, logos: {} } };
  }
  const dir = `assets/${ICONS[sport]}/`;
  const iconDir = path.join(ROOT, 'apps', sport, 'src', dir);
  const { logoForSeason } = sport === 'nhl' ? { logoForSeason: null } : await load(erasFile);
  const files = [];
  for (const sub of ['', 'eras/']) {
    const d = path.join(iconDir, sub);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) if (/\.(png|svg)$/.test(f) && !/^(mlb|nfl|nba|nhl)\.svg$/.test(f)) files.push(sub + f);
  }
  // (a file's team: "eras/Bills-1997.png" -> Bills, "ANA_20062007-20122013.svg" -> ANA)
  const teamOf = (file) => {
    const name = file.replace(/^eras\//, '').replace(/\.(png|svg)$/, '');
    return sport === 'nhl' ? name.split('_')[0] : name.replace(/-\d{4}$/, '');
  };
  const isEra = (file) => file.startsWith('eras/') || (sport === 'nhl' && !!nhlSeasons(file));
  const teams = {};
  const looks = {};
  const checks = { source, logos: {} };
  for (const file of files.sort()) {
    const team = teamOf(file);
    const row = inputs.TEAMS[team];
    if (!row) throw new Error(`${sport}: no TEAMS entry for ${file}`);
    const [abbr, id, primary, alt] = row;
    const buf = fs.readFileSync(path.join(iconDir, file));
    const url = `data:${file.endsWith('.svg') ? 'image/svg+xml' : 'image/png'};base64,${buf.toString('base64')}`;
    const px = await chrome.evaluate(`(${SAMPLE})(${JSON.stringify(url)})`);
    if (!px.n) throw new Error(`${sport}: ${file} drew nothing`);
    const logo = { ...px, dom: dominantOf(px.buckets, px.n) };
    const listed = inputs.ERA_COLORS[file];
    const look = lookOf({
      primary: listed?.[0] ?? primary,
      alt: listed?.[1] ?? alt,
      logo,
      era: isEra(file) ? { listed: !!listed } : null,
      over: inputs.OVERRIDES[file],
    });
    // (and on the board itself, no chip behind it: the Book's rows, its dropdown and ticker, the game view's
    // bets, the Live tab and the Algorithm tab draw a logo straight on the dark board (look.mjs BARE_BOARD),
    // where a navy one vanishes; one that doesn't read there is drawn with a light halo: team-look.ts darkLogo)
    const board = onBoard(logo);
    const dark = darkBy(board);
    looks[file] = [...fields.map((f) => look[f]), look.whiteLogo ? 1 : 0, ...(dark ? [1] : [])];
    const v = look.whiteLogo ? { vis: 1, edge: 1 } : visibility(logo, look.face);
    // (its watermark: scripts/team-looks/watermark.mjs)
    const wm = watermarkSource(sport, iconDir, file);
    const wmUrl = `data:${wm.svg ? 'image/svg+xml' : 'image/png'};base64,${wm.buf.toString('base64')}`;
    const webp = await chrome.evaluate(`(${WATERMARK})(${JSON.stringify(wmUrl)}, ${wm.asIs})`);
    const wmFile = path.join(watermarkDir(sport), watermarkName(file));
    fs.mkdirSync(path.dirname(wmFile), { recursive: true });
    fs.writeFileSync(wmFile, Buffer.from(webp.slice(webp.indexOf(',') + 1), 'base64'));
    checks.logos[file] = { hash: sha(buf, file.endsWith('.svg')), wm: wm.hash, ...(wm.asIs ? { override: true } : {}), vis: +v.vis.toFixed(3), edge: +v.edge.toFixed(3), board: board.map((x) => +x.toFixed(3)), ...(dark ? { dark: true } : {}), ...(look.whiteLogo ? { white: +contrast('#ffffff', look.face).toFixed(2) } : {}) };
    if (!isEra(file) && /^[^_]+\.(png|svg)$/.test(file)) teams[file] = { ...(abbr ? { abbr } : {}), ...(id ? { id } : {}) };
  }
  // (each team's eras: by logoForSeason, or for the NHL by its logos' names)
  for (const current of Object.keys(teams)) {
    const eras =
      sport === 'nhl'
        ? files
            .filter((f) => teamOf(f) === teamOf(current) && nhlSeasons(f))
            .map((f) => [...nhlSeasons(f), f])
            .sort((a, b) => a[0] - b[0])
        : erasOf(logoForSeason, dir, current);
    if (eras.length) teams[current].eras = eras;
  }
  // (ESPN's own drawings of each team's logo, which the Book's rows, ticker and Algorithm tab show: its plain one
  // (500, the bettor's picks.json) and its one for a dark background (500-dark), each measured on the board the
  // same way; a team's espn: 1 its plain one doesn't read there, 2 its dark one, 3 both. Off the network: a
  // drawing that can't be fetched keeps what the last build measured)
  const before = fs.existsSync(path.join(OUT, `${sport}.checks.json`)) ? JSON.parse(fs.readFileSync(path.join(OUT, `${sport}.checks.json`), 'utf8')).espn ?? {} : {};
  checks.espn = {};
  for (const [file, team] of Object.entries(teams)) {
    if (!team.abbr) continue;
    const measured = [];
    for (const variant of ESPN_VARIANTS) {
      let board = before[file]?.[variant] ?? null;
      try {
        const res = await fetch(`https://a.espncdn.com/i/teamlogos/${sport}/${variant}/${team.abbr.toLowerCase()}.png`);
        if (!res.ok) throw new Error(`${res.status}`);
        const px = await chrome.evaluate(`(${SAMPLE})(${JSON.stringify(`data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`)})`);
        if (px.n) board = onBoard(px).map((x) => +x.toFixed(3));
      } catch (e) {
        console.warn(`${sport} ${team.abbr} ${variant}: ${e.message}; kept the last build's`);
      }
      measured.push(board);
    }
    checks.espn[file] = Object.fromEntries(ESPN_VARIANTS.map((v, i) => [v, measured[i]]));
    const bits = measured.reduce((sum, board, i) => sum | (board && darkBy(board) ? 1 << i : 0), 0);
    if (bits) team.espn = bits;
  }
  return { file: { dir, fields, teams, looks }, checks };
}

const asked = process.argv.slice(2).filter((a) => SPORTS.includes(a));
const chrome = await browser();
try {
  for (const sport of asked.length ? asked : SPORTS) {
    const { file, checks } = await buildSport(sport, chrome);
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, `${sport}.json`), JSON.stringify(file) + '\n');
    fs.writeFileSync(path.join(OUT, `${sport}.checks.json`), JSON.stringify(checks, null, 1) + '\n');
    console.log(`${sport}: ${Object.keys(file.looks).length} logos`);
  }
} finally {
  chrome.close();
}
