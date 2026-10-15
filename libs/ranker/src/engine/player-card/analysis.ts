// The card's Analysis tab: an AI write-up of a player's season, the coming game and the rest of the season
// (written by the sport's analysis script, from his numbers only: e.g. apps/nfl/scripts/analysis). No betting
// angles in any sport: the Bets page has the bets, at live prices (an older NFL report's bets aren't shown).
// The site reads the index of who has one, then a player's file when the tab opens. MLB, NBA and NHL teams
// have weekly ones (libs/ranker/scripts/analysis): a preview while the season is on (the week ahead in place
// of the next game), and once it's over a recap of the year, its one section. The NFL's teams and QBs get the
// same recap once the team's season is over (apps/nfl/scripts/analysis: out of the playoffs, or the Super
// Bowl played).
import { fetchJson } from '@ranker/core/http';

// A number behind a point: its name, the value, its rank in the position this season (when ranked)
export interface AnalysisEvidence {
  label: string;
  value: number | string;
  rank?: number;
  of?: number;
}
export interface AnalysisPoint {
  title: string;
  body: string;
  evidence: AnalysisEvidence[];
}
// A recap's section: how it ended, the year's story, what went right and wrong, its arc, next year
export interface AnalysisRecap {
  finish: string;
  body: string;
  highlights: AnalysisPoint[];
  lowlights: AnalysisPoint[];
  arc: { direction: 'rising' | 'falling' | 'steady' | 'volatile'; note: string };
  nextYear: string;
}
// The week ahead (a weekly team preview): the games' outlook and the matchups that decide it
export interface AnalysisWeek {
  outlook: 'favorable' | 'tough' | 'neutral';
  headline: string;
  body: string;
  keyMatchups: AnalysisPoint[];
  watch: string;
}
export interface PlayerAnalysis {
  // when it was written, and by what
  at: string;
  model: string;
  // (the weekly team reports' and the NFL's: a preview or the season's recap, the season's name ("2026",
  // "2025-26"), the week's games a preview looks at, how a recap's season ended)
  mode?: 'preview' | 'recap';
  season?: string;
  ended?: string | null;
  week?: { date: string; opp: string; at: 'home' | 'away' }[];
  // the game it previews: the week, the opponent, home or away, the sportsbook's line when posted
  game: { week: number; date: string; opp: string; at: 'home' | 'away'; line: { line: string; overUnder: number | null; hisTeamMoneyline: string | null; book: string | null } | null } | null;
  // (a recap has the archetype, headline, recap and confidence alone; a team preview no nextGame)
  report: {
    archetype: { name: string; definition: string };
    headline: string;
    take?: string;
    strengths?: AnalysisPoint[];
    concerns?: AnalysisPoint[];
    trend?: { direction: 'rising' | 'falling' | 'steady' | 'volatile'; note: string };
    // (an NFL team's: the ways it wins and the ways it loses this game, in place of the key matchups an older
    // report and a player's have)
    nextGame?: {
      outlook: 'favorable' | 'tough' | 'neutral';
      headline: string;
      body: string;
      keyMatchups?: AnalysisPoint[];
      waysToWin?: AnalysisPoint[];
      waysToLose?: AnalysisPoint[];
      watch: string;
    };
    weekAhead?: AnalysisWeek;
    restOfSeason?: { body: string; projections: { stat: string; low: number; high: number }[]; swingFactors: string[] };
    recap?: AnalysisRecap;
    confidence: { level: 'low' | 'medium' | 'high'; note: string };
  };
}

// The written-up players: row id -> its file (loaded once a visit; empty when there are none)
let index: Promise<Record<string, string>> | null = null;
export function analysisIndex(): Promise<Record<string, string>> {
  index ??= fetchJson<Record<string, string>>('data/analysis/index.json', {}, { cache: 'no-cache' });
  return index;
}

export async function loadAnalysis(file: string): Promise<PlayerAnalysis> {
  const res = await fetch(`data/analysis/${file}.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// A text's paragraphs (split on blank lines)
// A fade's line under what it fades (the Bets page's): "Bet TB +9.5 instead"; a bet that already says what to do as
// written ("Fade the 2-per-game pace instead"); "against X" as "Bet against X instead"
export function insteadText(bet: string): string {
  const text = bet.trim().replace(/\s+instead\.?$/i, '');
  if (/^(fade|avoid|take|back|bet|lay|play|stay)\b/i.test(text)) return `${text[0].toUpperCase()}${text.slice(1)} instead`;
  if (/^against\b/i.test(text)) return `Bet ${text[0].toLowerCase()}${text.slice(1)} instead`;
  return `Bet ${text} instead`;
}

// A week's game as its chip shows it: "Wed 10/15 @ LAD" (its day as written, not shifted by the time zone)
export function weekGameText(game: { date: string; opp: string; at: 'home' | 'away' }): string {
  const [y, m, d] = game.date.split('-').map(Number);
  const day = new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' });
  return `${day} ${m}/${d} ${game.at === 'home' ? 'vs' : '@'} ${game.opp}`;
}

// The week's next game (a team's weekly preview): the first one today or later, by the day as written (the
// viewer's today); none once they're all played
export function nextWeekGame<T extends { date: string }>(week: T[] | null | undefined, today = new Date()): T | null {
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return (week ?? []).find((g) => g.date >= day) ?? null;
}

// An NFL team preview's two lists' headings: "Ways the Ravens win", "Ways the Ravens lose" (the team by its
// logo's name: its Team, Defense, O-Line and Coach cards alike; none: "Ways to win")
export function waysTitle(card: { player: { teamLogo?: string } }, way: 'win' | 'lose'): string {
  const team = /([^/]+)\.png$/.exec(card.player.teamLogo ?? '')?.[1];
  return team ? `Ways the ${team} ${way}` : `Ways to ${way}`;
}

export const paragraphs = (text: string): string[] =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

// An evidence value as shown: ".363" for small rates, "10.74", "967"
export function evidenceText(value: number | string): string {
  if (typeof value !== 'number') return value;
  if (Number.isInteger(value)) return value.toLocaleString('en-US');
  if (Math.abs(value) < 1) return value.toFixed(3).replace(/^(-?)0\./, '$1.');
  return String(Math.round(value * 100) / 100);
}
