// A game as the game view holds it (game.model.ts GameView, read from ESPN's summary), turned for the Live tab
// and the game modal's bet panels: its box score as the prop counter reads it (live-props liveStat: the grader's
// reading), the user's bets on it as the impact reads them, its plays in order with how far the game had gone at
// each, and the game itself as a bet watch reads it. Pure (no Angular)

import type { GamePlay, GameView } from '../game-view/game.model';
import type { PlayBet } from '../account/wallet/wallet-math';
import { SummaryBox, athleteTeam, liveStat } from './live-props';
import type { ImpactBet, ImpactPlay } from './bet-impact';
import { clockSeconds, gameShare, readDetail } from './live-games';
import type { GameRead } from './live-bets';

// (a league's sport: "basketball/nba" → "nba")
export const sportOf = (league: string): string => league.split('/').pop() ?? league;

type Box = SummaryBox & { boxscore: { players: { team: { id: string }; statistics: { name: string; type: string; labels: string[]; athletes: { athlete: { id: string }; stats: string[]; didNotPlay: boolean }[] }[] }[] } };

// The game's box score in ESPN's summary shape, for liveStat and athleteTeam (kept per game object)
const boxes = new WeakMap<GameView, Box>();
export function summaryBox(game: GameView): Box {
  let box = boxes.get(game);
  if (!box) {
    box = {
      boxscore: {
        players: game.box.map((t) => ({
          team: { id: (t.side === 'away' ? game.away : game.home).id },
          statistics: t.groups.map((g) => ({ name: g.key, type: g.key, labels: g.labels, athletes: g.rows.map((r) => ({ athlete: { id: r.id }, stats: r.values, didNotPlay: !!r.dnp })) })),
        })),
      },
    };
    boxes.set(game, box);
  }
  return box;
}

// A prop's count so far in the game, from its box score (null for anything but a prop, or a player not in it)
export function propNowOf(bet: Pick<PlayBet, 'market' | 'propType' | 'athlete'>, game: GameView): number | null {
  if (bet.market !== 'prop' || !bet.propType || !bet.athlete) return null;
  return liveStat(sportOf(game.league), bet.propType, String(bet.athlete), summaryBox(game));
}

// A prop player's side in the game, from the box score (null till he's in it)
export function playerSide(athlete: string | null | undefined, game: GameView): 'away' | 'home' | null {
  if (!athlete) return null;
  const team = athleteTeam(String(athlete), summaryBox(game));
  return team === null ? null : team === game.away.id ? 'away' : team === game.home.id ? 'home' : null;
}

// A bet as the impact reads it
export function impactBetOf(bet: PlayBet, game: GameView): ImpactBet {
  return {
    sport: bet.sport,
    market: bet.market as ImpactBet['market'],
    side: bet.side,
    line: bet.line,
    pick: bet.pick,
    propType: bet.propType ?? null,
    athlete: bet.athlete ?? null,
    player: bet.player ?? null,
    statLabel: bet.statLabel ?? null,
    team: bet.market === 'prop' ? playerSide(bet.athlete, game) : null,
  };
}

// The game's plays in order, each with how far the game had gone at it (its period and clock; baseball's half
// inning from its group), the last play of a finished game marked final; each keeps its play (ref) and its moment
// ("Q3 4:12") for the rows
export interface PlayAt extends ImpactPlay {
  ref: GamePlay;
  when: string | null;
  group: number;
}
const playLists = new WeakMap<GameView, PlayAt[]>();
export function impactPlaysOf(game: GameView): PlayAt[] {
  let list = playLists.get(game);
  if (list) return list;
  const sport = sportOf(game.league);
  const baseball = sport === 'mlb';
  list = [];
  game.plays.forEach((grp, gi) => {
    const inning = baseball ? readDetail('mlb', grp.title) : null;
    for (const p of grp.plays) {
      const share = baseball ? (inning ? gameShare('mlb', 'in', inning.period, null, inning.half) : null) : gameShare(sport, 'in', p.period, clockSeconds(p.clock));
      list.push({
        ref: p,
        group: gi,
        when: p.when,
        text: p.text,
        scoring: p.scoring,
        kind: p.kind,
        athletes: p.athletes,
        side: p.side,
        awayScore: p.awayScore,
        homeScore: p.homeScore,
        share,
      });
    }
  });
  if (game.state === 'post' && list.length) list[list.length - 1].final = true;
  playLists.set(game, list);
  return list;
}

// The game as a bet watch reads it: its score, state, how far it's gone (from its period and clock), its sides
export function gameReadOf(game: GameView): GameRead {
  const sport = sportOf(game.league);
  const share = game.state === 'in' ? (sport === 'mlb' ? ((r) => (r ? gameShare('mlb', 'in', r.period, null, r.half) : null))(readDetail('mlb', game.status)) : gameShare(sport, 'in', game.period, clockSeconds(game.clock))) : gameShare(sport, game.state, null, null);
  return { as: Number(game.away.score) || 0, hs: Number(game.home.score) || 0, state: game.state, final: game.state === 'post', share, away: game.away.abbr, home: game.home.abbr };
}

// The user's open bets on a game, straight bets and the open legs of parlays, by "sport|event"
export function betsByGame(open: PlayBet[], legsOf: (p: PlayBet) => PlayBet[]): Map<string, PlayBet[]> {
  const out = new Map<string, PlayBet[]>();
  for (const b of open) {
    const list = b.kind === 'parlay' ? legsOf(b).filter((l) => l.status === 'open') : [b];
    for (const l of list) {
      const key = `${l.sport}|${l.event}`;
      out.set(key, [...(out.get(key) ?? []), l]);
    }
  }
  return out;
}
