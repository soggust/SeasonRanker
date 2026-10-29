// The season being played, its first days: a rollover (scripts/rollover.mjs) makes the new season current
// after its first night's games, so for a week or so the top of StaticData holds a few teams a game or two in
// (the NBA's 2026-27 on 2026-10-21: six teams, one game). A test of a whole season's shape (every team, a
// season's leaders, Min Games leaving someone out) checks the current season's files only once it's past
// that; finished seasons are always checked in full.
import fs from 'node:fs';
import path from 'node:path';
import { expandRows, readJson, staticDir } from './engine.mjs';

// (under this many games for the team that's played the most: early. 2026-10-29: at five games, two weeks into
// the NBA, Min Games still left nobody out of a Top 50, so a whole season's shape is asked of the current one
// only from its third week or so)
export const EARLY_GAMES = 8;

// The most games any row of the season being played has (its skill-players.json; none: 0)
export function currentGames(sport) {
  const file = path.join(staticDir(sport), 'skill-players.json');
  if (!fs.existsSync(file)) return 0;
  const rows = Object.values(expandRows(readJson(file))).filter(Array.isArray).flat();
  return rows.reduce((most, r) => Math.max(most, r.games ?? 0), 0);
}

export const earlyCurrent = (sport) => currentGames(sport) < EARLY_GAMES;
