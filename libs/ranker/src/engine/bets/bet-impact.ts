// Which plays moved a bet, pure (tests/bet-impact.test.mjs): a play read against one of the user's bets, with the
// game's state before and after it, says whether it helped ('good'), hurt ('bad') or did nothing (null). The game
// modal's Important Plays and the Plays tab's My Bets pill, and the Live card's last-play tint, all run on it.
//
// The rules (docs/bets-redesign/README.md, section 10):
// - a player prop: a play that adds to the player's stat (good for an over, bad for an under); his turnovers,
//   and on a shots prop his blocked shots, bad for an over; nothing else
// - a total: in hockey and baseball every goal or run (good for an over, bad for an under); in basketball and
//   football only scoring plays that move the projected total by a point or more, or that start or extend a
//   run of six or more unanswered points
// - a spread or moneyline: only scoring plays that change whether the bet is winning (covering or not, a lead
//   change, a tie), and the final play
// The tag: the bet in caps, a dot, then what changed ("J. BROWN O24.5 · 20 pts, needs 5"; "UNDER 221.5 · pace up
// to 214")

import { UNIT_WORDS } from './desk-math';
import { PACE_FROM } from './live-bets';

export type Impact = 'good' | 'bad' | null;

// (a play as the impact reads it: ESPN's text and type, its participants' ids in ESPN's order (the one who did it
// first), its team's side, the score after it, how far the game has gone at it, and whether it's the last play of
// a finished game)
export interface ImpactPlay {
  text: string;
  scoring: boolean;
  kind: string | null;
  athletes: string[];
  side: 'away' | 'home' | null;
  awayScore: number | null;
  homeScore: number | null;
  share: number | null;
  final?: boolean;
}

// (a bet as the impact reads it: the wallet's fields; a prop's player's side once his team is known)
export interface ImpactBet {
  sport: string;
  market: 'spread' | 'total' | 'ml' | 'prop';
  side: string;
  line: number | null;
  pick: string;
  propType?: string | null;
  athlete?: string | null;
  player?: string | null;
  statLabel?: string | null;
  team?: 'away' | 'home' | null;
}

// (the game's state at a point in the plays: the score, how far it's gone, the prop's count so far as the plays
// add it up, and the run of unanswered points under way)
export interface ImpactState {
  away: number;
  home: number;
  share: number | null;
  stat: number;
  run: { side: 'away' | 'home'; pts: number } | null;
}

export const START_STATE: ImpactState = { away: 0, home: 0, share: 0, stat: 0, run: null };

// (the stats that count shots: a blocked shot is a shot that doesn't count)
const SHOT_PROPS = new Set(['sog', 'fg3']);
// (the sports where every score moves a total)
const EVERY_SCORE = new Set(['nhl', 'mlb', 'soccer']);
const RUN = 6;

// A name as the plays write it: "Travis Kelce" → "tkelce" (the NFL's "T.Kelce"), and whole ("traviskelce")
export function nameKeys(name: string): string[] {
  const clean = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, '')
    .replace(/[.'’]/g, '')
    .trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (!parts.length) return [];
  const whole = parts.join('').toLowerCase();
  return parts.length > 1 ? [whole, (parts[0][0] + parts.slice(1).join('')).toLowerCase()] : [whole];
}

const squash = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s.'’]/g, '').toLowerCase();

// (whether the play is the player's own: his id first among its participants, or his name opening its text, or,
// in the NFL's text, his short name in it)
export function didIt(bet: ImpactBet, play: ImpactPlay): boolean {
  if (bet.athlete && play.athletes.length) return play.athletes[0] === String(bet.athlete);
  if (!bet.player) return false;
  const keys = nameKeys(bet.player);
  const text = squash(play.text.replace(/^\([^)]*\)\s*/, ''));
  if (bet.sport === 'nfl') return keys.some((k) => text.includes(k));
  return keys.some((k) => text.startsWith(k));
}

// (whether the player is in the play at all: a helper, an assist, a target)
export function inPlay(bet: ImpactBet, play: ImpactPlay): boolean {
  if (bet.athlete && play.athletes.includes(String(bet.athlete))) return true;
  if (!bet.player) return false;
  const text = squash(play.text);
  return nameKeys(bet.player).some((k) => text.includes(k));
}

// (yards gained in an NFL play's text: "for 12 yards", "for no gain", "for a loss of 3", "for -2 yards")
export function yardsIn(text: string): number {
  if (/for no gain/i.test(text)) return 0;
  const loss = text.match(/for a loss of (\d+)/i);
  if (loss) return -Number(loss[1]);
  const m = text.match(/for (-?\d+) yards?/i);
  return m ? Number(m[1]) : 0;
}

// How a play changes a prop's stat: what it adds (0 for nothing), and whether it's the player's turnover or
// his blocked shot (a shot that doesn't count)
export function statDelta(bet: ImpactBet, play: ImpactPlay): { add: number; turnover: boolean; blocked: boolean } {
  const none = { add: 0, turnover: false, blocked: false };
  const type = bet.propType ?? '';
  const text = play.text;
  const kind = play.kind ?? '';
  if (bet.sport === 'nba') {
    const mine = didIt(bet, play);
    const made = play.scoring && /\bmakes\b/i.test(text);
    const three = /three[\s-]?point|3[\s-]?pt|3-pointer/i.test(text);
    const pts = made ? (/free throw/i.test(text) ? 1 : three ? 3 : 2) : 0;
    const turnover = mine && (/turnover/i.test(kind) || /\b(bad pass|lost ball|traveling|out of bounds turnover|offensive foul turnover)\b/i.test(text));
    const reb = mine && /rebound/i.test(kind + ' ' + text) ? 1 : 0;
    const assists = made && (play.athletes.length > 1 ? play.athletes[1] === String(bet.athlete ?? '') : !!bet.player && new RegExp(`\\(${bet.player.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} assists\\)`, 'i').test(text));
    const own = mine ? pts : 0;
    const add = type === 'pts' ? own : type === 'reb' ? reb : type === 'ast' ? (assists ? 1 : 0) : type === 'fg3' ? (mine && made && three ? 1 : 0) : type === 'pra' ? own + reb + (assists ? 1 : 0) : 0;
    const blocked = mine && SHOT_PROPS.has(type) && /blocked/i.test(text) && !made;
    return { add, turnover, blocked };
  }
  if (bet.sport === 'nhl') {
    const mine = didIt(bet, play);
    const goal = /goal/i.test(kind) && play.scoring;
    const shot = /^shot$/i.test(kind) || /shot on goal|saved by|save by/i.test(text);
    const blocked = mine && SHOT_PROPS.has(type) && /blocked/i.test(kind + ' ' + text);
    const turnover = mine && /giveaway/i.test(kind + ' ' + text);
    if (type === 'sog') return { add: mine && (goal || shot) ? 1 : 0, turnover, blocked };
    if (type === 'saves') {
      // (the goalie's: a shot on goal by the other side that isn't a goal)
      const against = bet.team ? play.side !== null && play.side !== bet.team : true;
      return { add: against && shot && !goal ? 1 : 0, turnover: false, blocked: false };
    }
    // (points: a goal he scored or set up)
    return { add: goal && inPlay(bet, play) ? 1 : 0, turnover, blocked: false };
  }
  if (bet.sport === 'nfl') {
    if (!bet.player) return none;
    const keys = nameKeys(bet.player);
    const t = squash(text.replace(/^\([^)]*\)\s*/, ''));
    const named = keys.some((k) => t.includes(k));
    if (!named) return none;
    const pass = /\bpass\b/i.test(text) && !/\bsacked\b/i.test(text);
    const toIdx = t.search(/pass(?:short|deep)?(?:left|right|middle)?(?:intendedfor|to)/);
    const passer = pass && keys.some((k) => t.slice(0, toIdx < 0 ? t.length : toIdx).includes(k));
    const receiver = pass && !passer && keys.some((k) => (toIdx < 0 ? false : t.slice(toIdx).includes(k)));
    const complete = pass && !/incomplete|intercepted/i.test(text);
    const rush = !pass && /\b(left|right|middle|up the middle|end|tackle|guard|rushes|scrambles|kneels)\b/i.test(text) && keys.some((k) => t.startsWith(k) || t.indexOf(k) < 12);
    const td = /touchdown/i.test(text);
    const yards = yardsIn(text);
    const fumble = /fumbles/i.test(text) && keys.some((k) => t.includes(k + 'fumbles'));
    const intercepted = passer && /intercepted/i.test(text);
    const turnover = fumble || (intercepted && type !== 'passInt');
    const add =
      type === 'passYds' ? (passer && complete ? yards : 0)
      : type === 'passTd' ? (passer && complete && td ? 1 : 0)
      : type === 'passAtt' ? (passer ? 1 : 0)
      : type === 'passCmp' ? (passer && complete ? 1 : 0)
      : type === 'passInt' ? (intercepted ? 1 : 0)
      : type === 'rushYds' ? (rush ? yards : 0)
      : type === 'rushAtt' ? (rush ? 1 : 0)
      : type === 'rushTd' ? (rush && td ? 1 : 0)
      : type === 'recYds' ? (receiver && complete ? yards : 0)
      : type === 'rec' ? (receiver && complete ? 1 : 0)
      : type === 'recTd' ? (receiver && complete && td ? 1 : 0)
      : type === 'rushRecYds' ? (rush ? yards : receiver && complete ? yards : 0)
      : type === 'anyTd' ? ((rush || (receiver && complete)) && td ? 1 : 0)
      : 0;
    return { add, turnover, blocked: false };
  }
  if (bet.sport === 'mlb') {
    const batter = didIt(bet, play);
    if (type === 'hits') return { add: batter && /\b(singles?|doubles?|triples?|homers?|home run)\b/i.test(kind + ' ' + text) ? 1 : 0, turnover: false, blocked: false };
    // (a pitcher's: his strikeouts, the outs he gets; the pitcher is the second participant on an at-bat)
    const pitcher = bet.athlete ? play.athletes.includes(String(bet.athlete)) && play.athletes[0] !== String(bet.athlete) : false;
    if (type === 'k') return { add: pitcher && /strikes? out|strikeout/i.test(kind + ' ' + text) ? 1 : 0, turnover: false, blocked: false };
    if (type === 'outs') {
      const outs = /double play/i.test(text) ? 2 : /triple play/i.test(text) ? 3 : /\b(out|strikes? out|strikeout|flies out|grounds out|lines out|pops out|caught stealing)\b/i.test(kind + ' ' + text) ? 1 : 0;
      return { add: pitcher ? outs : 0, turnover: false, blocked: false };
    }
  }
  return none;
}

// (a bet's edge at a score: a spread's covering margin, a moneyline's margin, as the desk grades)
function edgeAt(bet: ImpactBet, s: { away: number; home: number }): number {
  const margin = (bet.side === 'home' ? 1 : -1) * (s.home - s.away);
  return bet.market === 'spread' ? margin + (bet.line ?? 0) : margin;
}

const projection = (s: { away: number; home: number; share: number | null }): number | null => (s.share !== null && s.share >= PACE_FROM ? (s.away + s.home) / s.share : null);

// The state after a play: its score (the one before when the play carries none), its share, the run of
// unanswered points, and the bet's stat count
export function afterPlay(bet: ImpactBet, play: ImpactPlay, before: ImpactState): ImpactState {
  const away = play.awayScore ?? before.away;
  const home = play.homeScore ?? before.home;
  let run = before.run;
  if (away !== before.away || home !== before.home) {
    const side: 'away' | 'home' = away !== before.away ? 'away' : 'home';
    const pts = away - before.away + (home - before.home);
    run = run && run.side === side ? { side, pts: run.pts + pts } : { side, pts };
  }
  const delta = bet.market === 'prop' ? statDelta(bet, play).add : 0;
  return { away, home, share: play.share ?? before.share, stat: before.stat + delta, run };
}

// Whether a play moved the bet: good, bad or not at all
export function betImpact(play: ImpactPlay, bet: ImpactBet, before: ImpactState, after: ImpactState): Impact {
  if (bet.market === 'prop') {
    const d = statDelta(bet, play);
    // (his turnover is the story of the play, whatever it gained him)
    if ((d.turnover || d.blocked) && bet.side === 'over') return 'bad';
    if (d.add > 0) return bet.side === 'over' ? 'good' : 'bad';
    if (d.add < 0) return bet.side === 'over' ? 'bad' : 'good';
    return null;
  }
  const scored = after.away + after.home !== before.away + before.home;
  if (bet.market === 'total') {
    if (!scored) return null;
    const up = bet.side === 'over' ? 'good' : 'bad';
    if (EVERY_SCORE.has(bet.sport)) return up;
    const run = after.run && after.run.pts >= RUN;
    const pBefore = projection(before);
    const pAfter = projection(after);
    if (pBefore !== null && pAfter !== null && Math.abs(pAfter - pBefore) >= 1) return pAfter > pBefore ? up : bet.side === 'over' ? 'bad' : 'good';
    if (run) return up;
    // (no pace yet: the first points of the game move it, as any score does in the pace's absence)
    if (pBefore === null && pAfter === null && before.away + before.home === 0) return up;
    return null;
  }
  // (a side: only a score, or the final, that changes whether it's winning)
  if (!scored && !play.final) return null;
  const eBefore = edgeAt(bet, before);
  const eAfter = edgeAt(bet, after);
  const mBefore = Math.sign(before.home - before.away);
  const mAfter = Math.sign(after.home - after.away);
  const flipped = eBefore > 0 !== eAfter > 0 || (eBefore === 0) !== (eAfter === 0) || mBefore !== mAfter;
  if (!flipped && !play.final) return null;
  return eAfter > 0 ? 'good' : eAfter < 0 ? 'bad' : eBefore > 0 ? 'bad' : 'good';
}

// (a prop player's name as the tag writes it: "J. BROWN")
export function tagName(player: string): string {
  const [first, ...rest] = player.trim().split(/\s+/);
  return (rest.length ? `${first[0]}. ${rest.join(' ')}` : first).toUpperCase();
}

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

// The tag under a play that moved a bet: the bet in caps, a dot, what changed
export function impactTag(bet: ImpactBet, play: ImpactPlay, after: ImpactState, statNow: number | null = null): string {
  const line = bet.line ?? 0;
  if (bet.market === 'prop') {
    const d = statDelta(bet, play);
    const name = `${tagName(bet.player ?? 'HIM')} ${bet.side === 'under' ? 'U' : 'O'}${line}`;
    const count = statNow ?? after.stat;
    const unit = bet.statLabel ?? '';
    const of = unit ? ` ${unit}` : '';
    if (bet.side === 'over' && d.blocked) return `${name} · blocked, doesn’t count`;
    if (bet.side === 'over' && d.turnover) return `${name} · turnover`;
    if (count > line) return `${name} · ${fmt(count)}${of}${bet.side === 'under' ? ', over the line' : ''}`;
    // (what he needs, whole: a stat counts in ones)
    return bet.side === 'over' ? `${name} · ${fmt(count)}${of}, needs ${Math.ceil(line - count)}` : `${name} · ${fmt(count)}${of}, ${fmt(line - count)} to spare`;
  }
  const words = bet.pick.toUpperCase().replace(/ -(\d)/, ' −$1');
  if (bet.market === 'total') {
    const pts = after.away + after.home;
    const unit = UNIT_WORDS[bet.sport] ?? 'pts';
    const proj = projection(after);
    const run = after.run && after.run.pts >= RUN ? `${after.run.pts}–0 run, ` : '';
    if (proj === null) return `${words} · ${run}${pts} ${unit}`;
    const p = Math.round(proj);
    return `${words} · ${run}pace ${p > line ? 'up' : 'down'} to ${p}`;
  }
  const edge = edgeAt(bet, after);
  if (bet.market === 'spread') return `${words} · ${edge > 0 ? `covering by ${fmt(edge)}` : edge < 0 ? `short by ${fmt(-edge)}` : 'on the number'}`;
  return `${words} · ${edge > 0 ? `leading by ${fmt(edge)}` : edge < 0 ? `trailing by ${fmt(-edge)}` : 'tied'}`;
}

// Every play read against every bet, in order: each play's impacts (the bets it moved, each with its tag). The
// prop counts as the plays add them up; a count from the box score (statNow) names the tag's figure where there is
// one, so it matches what the bet's graded on
export interface PlayImpacts<P> {
  play: P;
  impacts: { bet: ImpactBet; impact: Exclude<Impact, null>; tag: string }[];
}
export function walkPlays<P extends ImpactPlay>(plays: P[], bets: ImpactBet[], statNow: (bet: ImpactBet) => number | null = () => null): PlayImpacts<P>[] {
  const states = bets.map(() => START_STATE);
  const out: PlayImpacts<P>[] = [];
  const last = plays.length - 1;
  plays.forEach((play, i) => {
    const impacts: PlayImpacts<P>['impacts'] = [];
    bets.forEach((bet, j) => {
      const before = states[j];
      const after = afterPlay(bet, play, before);
      states[j] = after;
      const impact = betImpact(play, bet, before, after);
      // (a prop's count in the tag: the box score's on the latest play that moved it, the plays' sum before)
      if (impact) impacts.push({ bet, impact, tag: impactTag(bet, play, after, i === last || isLatestFor(plays, i, bet) ? statNow(bet) : null) });
    });
    out.push({ play, impacts });
  });
  return out;
}

// (whether no later play adds to the bet's stat: the box score's count is this play's)
function isLatestFor(plays: ImpactPlay[], i: number, bet: ImpactBet): boolean {
  if (bet.market !== 'prop') return false;
  for (let k = i + 1; k < plays.length; k++) if (statDelta(bet, plays[k]).add !== 0) return false;
  return true;
}

// The important plays: the latest n (six) that scored or moved a bet, newest first
export function importantPlays<P extends ImpactPlay>(walked: PlayImpacts<P>[], n = 6): PlayImpacts<P>[] {
  return walked
    .filter((w) => w.play.scoring || w.impacts.length)
    .slice(-n)
    .reverse();
}
