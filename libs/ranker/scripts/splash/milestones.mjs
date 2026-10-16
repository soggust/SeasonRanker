// A player's season's notable marks for the splash's milestone ball (MLB's milestones.json: { <card id>: [Mark] }),
// the rarest first. Plain data in, data out (tests/splash-best-game.test.mjs).
//   kind     'H' a hitter, 'P' a pitcher
//   season   his row's season stats (the site's: homeRuns, hits, stolenBases, avg, pa; wins, strikeOuts, saves,
//            era, ip)
//   games    his game log's games: [{ date, opp, home, stat }] (stat: the MLB Stats API's game line)
// A Mark: { mark, big, small, tip, date?, opp? } (big and small: the ball's two lines, "62" over "HR")
//   in a game:   'perfect', 'no-hitter' (a complete game without a hit: a combined one isn't his), 'cycle',
//                'hr-game' (3 or more), 'k-game' (15 or more)
//   the season:  'home-runs' (40+), 'hits' (200+), 'steals' (40+), 'average' (.340+, qualified), 'wins' (20+),
//                'strikeouts' (200+), 'saves' (40+), 'era' (under 2.00, qualified)
import { dayName } from './best-game.mjs';

const n = (v) => Number(v) || 0;
export function milestonesOf(kind, season, games) {
  const out = [];
  const inGame = (mark, big, small, tip, g) => out.push({ mark, big, small, tip: `${tip}, ${dayName(g.date)} ${g.home ? 'vs' : 'at'} ${g.opp}`, date: g.date, opp: g.opp });
  for (const g of games) {
    const s = g.stat ?? {};
    if (kind === 'P') {
      const outs = n(s.outs);
      if (n(s.completeGames) && !n(s.hits) && outs >= 27) {
        if (n(s.battersFaced) === outs) inGame('perfect', 'PG', 'Perfect', 'A perfect game', g);
        else inGame('no-hitter', 'NO', 'Hitter', 'A no-hitter', g);
      }
      if (n(s.strikeOuts) >= 15) inGame('k-game', String(n(s.strikeOuts)), 'K', `${n(s.strikeOuts)} strikeouts in a game`, g);
    } else {
      const singles = n(s.hits) - n(s.doubles) - n(s.triples) - n(s.homeRuns);
      if (singles > 0 && n(s.doubles) && n(s.triples) && n(s.homeRuns)) inGame('cycle', 'CYC', 'Cycle', 'Hit for the cycle', g);
      if (n(s.homeRuns) >= 3) inGame('hr-game', String(n(s.homeRuns)), 'HR', `${n(s.homeRuns)} home runs in a game`, g);
    }
  }
  const total = (big, small, tip, mark) => out.push({ mark, big: String(big), small, tip });
  if (kind === 'P') {
    if (n(season.wins) >= 20) total(season.wins, 'W', `${season.wins} wins`, 'wins');
    if (n(season.strikeOuts) >= 200) total(season.strikeOuts, 'K', `${season.strikeOuts} strikeouts`, 'strikeouts');
    if (n(season.saves) >= 40) total(season.saves, 'SV', `${season.saves} saves`, 'saves');
    if (season.era !== null && season.era !== undefined && n(season.ip) >= 162 && season.era < 2) total(season.era.toFixed(2), 'ERA', `A ${season.era.toFixed(2)} ERA`, 'era');
  } else {
    if (n(season.homeRuns) >= 40) total(season.homeRuns, 'HR', `${season.homeRuns} home runs`, 'home-runs');
    if (n(season.hits) >= 200) total(season.hits, 'H', `${season.hits} hits`, 'hits');
    if (n(season.stolenBases) >= 40) total(season.stolenBases, 'SB', `${season.stolenBases} stolen bases`, 'steals');
    if (n(season.avg) >= 0.34 && n(season.pa) >= 502) total(season.avg.toFixed(3).replace(/^0/, ''), 'AVG', `A ${season.avg.toFixed(3).replace(/^0/, '')} average`, 'average');
  }
  return out;
}

