// The splash's data files as the scripts write them (libs/ranker/scripts/splash: outcomes.mjs, best-game.mjs,
// milestones.mjs), and a team's outcome as the scene reads it. No Angular here (tests/splash-data.test.mjs loads it).
import type { Outcome } from './splash.scene';

export interface PlayoffRound {
  round: number;
  roundName: string;
  opp: string;
  oppTeam: string;
  won: boolean | null;
  score: string | null; // the series' wins, its own first ("4-2"), or an NFL game's score
  date: string | null;
  home?: boolean;
  ot?: boolean;
}
export interface OutcomeFile {
  result: 'champion' | 'finalist' | 'semis' | 'playoffs' | 'missed' | null;
  over: boolean;
  round: number;
  roundName: string | null;
  opp: string | null;
  oppTeam: string | null;
  score: string | null;
  ot?: boolean;
  seed: number | null;
  seedLabel?: string;
  divChamp: boolean;
  confChamp: boolean;
  conf: string | null;
  division: string | null;
  divRank: number | null;
  record: string | null;
  gamesBack: number | null; // a missed team's: games behind the field's last team (the NHL's: points)
  playIn?: boolean;
  playoffs: PlayoffRound[];
  lastGame: { date: string; opp: string; oppTeam: string; home: boolean; result: 'W' | 'L' | 'T'; score: string; ot?: boolean } | null;
}
export interface BestGame {
  date: string;
  opp: string;
  oppTeam?: string | null;
  home: boolean;
  result?: 'W' | 'L' | 'T';
  score?: string;
  title: string; // "Wk 7 vs DET", "Super Bowl LVIII", "Apr 12 at BOS"
  line: string; // "357 yds · 3 TD"
  tip: string; // "W 38-6 vs DET · Oct 22, 2023"
  value: number;
  week?: number;
  round?: string;
  post?: boolean;
  games: number;
}
export interface Milestone {
  mark: string;
  big: string;
  small: string;
  tip: string;
  date?: string;
  opp?: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const longDate = (d: string | null | undefined) => (d && /^\d{4}-\d\d-\d\d$/.test(d) ? `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}, ${d.slice(0, 4)}` : undefined);
const ROMAN: [number, string][] = [[50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
function roman(n: number): string {
  let out = '';
  for (const [v, s] of ROMAN) while (n >= v) (out += s), (n -= v);
  return out;
}

// A team's outcome as the scene reads it: none while its season is still being played; the round it went out
// in (or won the title in) and that game; a near miss (a game or less, the NHL's two points) the bubble
export function sceneOutcome(o: OutcomeFile | undefined, sport: string, season: number): Outcome | null {
  if (!o?.over || !o.result) return null;
  const gb = o.gamesBack;
  const bubble = o.result === 'missed' && gb !== null && gb <= (sport === 'nhl' ? 2 : 1);
  const missedBy =
    gb === null ? undefined : gb === 0 ? 'a tiebreaker' : sport === 'nhl' ? `${gb} point${gb === 1 ? '' : 's'}` : gb === 0.5 ? 'half a game' : gb === 1 ? 'a game' : `${gb} games`;
  const roundOf = (name: string) => (sport === 'nfl' && name === 'Super Bowl' ? `Super Bowl ${roman(season - 1965)}` : name);
  const last = o.playoffs.at(-1);
  const lg = o.lastGame;
  const short = (name: string) => name.replace(/\s+round$/i, '');
  const wonText = (p: PlayoffRound) => (p.home !== undefined ? `W ${p.score} ${p.home ? 'vs' : 'at'} ${p.opp}` : `beat ${p.opp} ${p.score}`);
  // (the last round it won before the one it ended in)
  const won = o.playoffs.filter((p) => p.won && p !== last).at(-1);
  return {
    result: o.result === 'semis' ? 'playoffs' : bubble ? 'bubble' : o.result,
    record: o.record ?? undefined,
    seed: o.seed ?? undefined,
    division: o.divChamp ? o.division : null,
    conference: o.conf ?? undefined,
    missedBy,
    confChamp: o.confChamp,
    lastGame:
      last && lg
        ? { round: roundOf(last.roundName), opp: last.opp, home: lg.home, score: `${lg.score}${lg.ot ? ' OT' : ''}`, won: !!last.won, date: longDate(lg.date) }
        : lg
          ? { round: 'Regular season', opp: lg.opp, home: lg.home, score: lg.score, won: lg.result === 'W', date: longDate(lg.date) }
          : undefined,
    roundWon: won ? { round: short(won.roundName), result: wonText(won) } : undefined,
    // (an NFL champion's game ball: the title game; the other sports' game-ball prop is a football)
    gameBall:
      sport === 'nfl' && o.result === 'champion' && last && lg
        ? { title: roundOf(last.roundName), line: `${lg.score}${lg.ot ? ' OT' : ''}`, tip: `W ${lg.score}${lg.ot ? ' OT' : ''} ${lg.home ? 'vs' : 'at'} ${lg.opp} · ${longDate(lg.date)}` }
        : undefined,
  };
}

