// A defense's pass and run splits: yards and touchdowns allowed per game through the air and on the
// ground, for the DEF tab's Pass D Rank and Run D Rank (the app ranks them by the Rank Base setting:
// yards, or touchdowns standing in for points, which the data doesn't split by play type).
// update-data.mjs adds them to each DEF row's stats; run on its own, this file adds them to the files
// that are already written (the current season's, in StaticData/ itself, too), from the play-by-play
// kept in .cache/nflverse:
//
//   node apps/nfl/scripts/defense-splits.mjs            (every season, 2000 on, the current one too)
//   node apps/nfl/scripts/defense-splits.mjs 2024 2025  (just those)
//
// The plays are the ones the head coaches' Yds Allowed / Game counts (runs and passes, sacks included),
// split the way the league's own stat lines do: sacks with the passes, QB scrambles with the runs. So
// the two add up to the team's yards allowed. A touchdown counts where the offense scored it on one.
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { currentSeason } from '../../../libs/ranker/scripts/wiki-staff.mjs';

export const SPLIT_KEYS = ['passYdsAllowedPerGame', 'rushYdsAllowedPerGame', 'passTdsAllowedPerGame', 'rushTdsAllowedPerGame'];

const num = (v) => (v === undefined || v === '' || v === 'NA' ? null : Number(v));
const round = (v, places) => Math.round(v * 10 ** places) / 10 ** places;

// One defense's splits from its plays (any play-by-play rows; those it was on defense for count) over
// its games (none: every split null)
export function defenseSplits(plays, team, games) {
  const out = Object.fromEntries(SPLIT_KEYS.map((key) => [key, null]));
  if (!games) return out;
  let passYds = 0;
  let rushYds = 0;
  let passTds = 0;
  let rushTds = 0;
  for (const play of plays) {
    if (play.defteam !== team || (play.pass !== '1' && play.rush !== '1')) continue;
    const run = play.rush === '1' || play.qb_scramble === '1';
    const yds = num(play.yards_gained) ?? 0;
    const td = play.touchdown === '1' && play.td_team === play.posteam;
    if (run) {
      rushYds += yds;
      if (td) rushTds++;
    } else {
      passYds += yds;
      if (td) passTds++;
    }
  }
  return {
    passYdsAllowedPerGame: round(passYds / games, 1),
    rushYdsAllowedPerGame: round(rushYds / games, 1),
    passTdsAllowedPerGame: round(passTds / games, 2),
    rushTdsAllowedPerGame: round(rushTds / games, 2),
  };
}

// ---------------------------------------------------------------------------
// Run on its own: add the splits to the seasons' DEF rows (every part already written)
// ---------------------------------------------------------------------------
const CACHE = new URL('../../../.cache/nflverse/', import.meta.url);
const STATIC_DIR = new URL('../src/StaticData/', import.meta.url);
const SEASONS_DIR = new URL('seasons/', STATIC_DIR);
const CURRENT_SEASON = currentSeason(path.join(import.meta.dirname, '..'));
// (earlier seasons' abbreviations for teams that moved, as update-data.mjs's sameTeamAbbrs)
const MOVED = { OAK: 'LV', SD: 'LAC', STL: 'LA', LAR: 'LA' };

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field || row.length) rows.push([...row, field]);
  const header = rows.shift();
  return rows.map((r) => Object.fromEntries(header.map((key, i) => [key, r[i]])));
}

async function backfill(seasons) {
  for (const year of seasons) {
    const text = await readFile(new URL(`play_by_play_${year}.csv.gz`, CACHE)).catch(() => null);
    if (!text) {
      console.log(`${year}: no play-by-play in .cache/nflverse, skipped`);
      continue;
    }
    const pbp = parseCsv(gunzipSync(text).toString());
    for (const play of pbp) for (const key of ['posteam', 'defteam', 'td_team']) play[key] = MOVED[play[key]] ?? play[key];
    const dir = year === CURRENT_SEASON ? STATIC_DIR : new URL(`${year}/`, SEASONS_DIR);
    const done = [];
    for (const part of ['regular', 'post', 'all']) {
      const file = new URL(part === 'regular' ? 'skill-players.json' : `skill-players.${part}.json`, dir);
      const json = await readFile(file, 'utf8').catch(() => null);
      if (json === null) continue;
      const data = JSON.parse(json);
      const plays = pbp.filter((play) => part === 'all' || (part === 'regular') === (play.season_type === 'REG'));
      // (each row's own games, as update-data counted them)
      for (const row of data.DEF ?? []) Object.assign(row.stats, defenseSplits(plays, row.gsisId.replace(/^DEF-/, ''), row.games));
      await writeFile(file, JSON.stringify(data));
      done.push(part);
    }
    console.log(`${year}: pass/run splits added (${done.join(', ') || 'no files'})`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2).map(Number).filter(Boolean);
  const seasons = args.length ? args : Array.from({ length: CURRENT_SEASON + 1 - 2000 }, (_, i) => 2000 + i);
  backfill(seasons).catch((err) => {
    console.error(err.stack);
    process.exit(1);
  });
}
