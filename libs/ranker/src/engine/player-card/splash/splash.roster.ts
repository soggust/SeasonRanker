// A team locker's players: who hangs in its room, the first named in the middle (splash.scene.ts hangs them).
// No Angular here (the tests load it as it is); splash.component.ts hands in the card's depth chart and the
// season's data.
//
// The depth chart gives each side's starters. The NFL's season lockers.json (apps/nfl/scripts/build-splash.mjs
// lockersOf) says who is on the team's roster that season, his number and his POPULARITY: the season's stat
// line scored like fantasy points (a 4,000-yard passer, a 1,200-yard receiver and a 12-sack edge rusher land
// in the same range), the season's honors on top. The other sports' charts are the site's own rows, and a
// man's popularity there is his USAGE, the chart's share of the minutes, the ice or the plate appearances (a
// goalie's weighted to four tenths, he starts most nights while the top line and pair skate a third of the game,
// and a starting pitcher's to eight tenths: a skater or a hitter leads, and the ace and the goalie still hang).
//   TM (the NFL)   the quarterback; the two most popular skill players (backs, receivers, tight ends); the three
//                  most popular defenders; then the next best of either side, the seventh (wide screens only)
//   DEF            the defense's starters by popularity
//   OL             the five linemen, center first
//   the others     the lineup's starters by usage: the NBA's five, the NHL's top line, pair and goalie, MLB's
//                  lineup and its ace
// A starter the roster doesn't have (traded away since the chart was drawn, a stale entry) is passed over for
// the next man at his spot; his number is the roster's, else the season's numbers file's. A room with fewer
// than three jerseys isn't shown (splash.scene.ts).
import type { DepthPlayer, DepthSide, DepthSlot, DepthView } from '../depth-chart';
import type { LockerRoster } from './splash.data';
import type { RosterPlayer } from './splash.scene';

interface Pick {
  p: DepthPlayer;
  pos: string;
  pop: number;
}

// (a defender's spot as his plate reads it: the side dropped, the nickel a corner)
const defPos = (label: string) => label.replace(/^[LR](DE|DT|CB|OLB|ILB)$/, '$1').replace(/^NICKEL$/, 'CB');

export function rosterOf(sport: string, view: DepthView, tab: string, numbers: Record<string, string>, lockers: LockerRoster | null): RosterPlayer[] {
  const onRoster = (p: DepthPlayer) => !lockers || !!lockers[p.id];
  const numOf = (p: DepthPlayer) => lockers?.[p.id]?.[0] ?? numbers[p.link?.gsisId ?? p.id] ?? numbers[p.id] ?? null;
  const starters = (side: DepthSide | undefined, posOf: (s: DepthSlot) => string = (s) => s.group ?? s.label): Pick[] =>
    (side?.slots ?? [])
      .filter((s) => !s.sub)
      .flatMap((s) => {
        const p = s.depth.find(onRoster);
        if (!p) return [];
        const pos = posOf(s);
        const pop = lockers ? (lockers[p.id]?.[1] ?? 0) : (p.snaps ?? 0) * (pos === 'G' ? 0.4 : /^(SP|P)$/.test(pos) ? 0.8 : 1);
        return [{ p, pos, pop }];
      });
  const byPop = (list: Pick[]) => [...list].sort((a, b) => b.pop - a.pop);
  const offense = view.sides[0];
  const defense = view.sides.find((s) => /def/i.test(s.id + s.title)) ?? view.sides[1];
  let picks: Pick[];
  if (tab === 'OL') {
    const line = ['C', 'RG', 'LG', 'RT', 'LT'];
    picks = starters(offense, (s) => s.label)
      .filter((x) => line.includes(x.pos))
      .sort((a, b) => line.indexOf(a.pos) - line.indexOf(b.pos));
  } else if (tab === 'DEF') {
    picks = byPop(starters(defense, (s) => defPos(s.label)));
  } else if (sport === 'nfl') {
    const off = starters(offense);
    const qb = byPop(off.filter((x) => x.pos.startsWith('QB')))[0];
    const skill = byPop(off.filter((x) => x !== qb && /^(RB|WR|TE|FB|HB)/.test(x.pos)));
    const def = byPop(starters(defense, (s) => defPos(s.label)));
    const rest = byPop([...skill.slice(2), ...def.slice(3)]);
    picks = [...(qb ? [qb] : []), ...skill.slice(0, 2), ...def.slice(0, 3), ...rest.slice(0, 1)];
  } else {
    picks = byPop(starters(offense));
  }
  const seen = new Set<string>();
  const out: RosterPlayer[] = [];
  for (const { p, pos } of picks) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push({ name: p.name, pos, num: numOf(p) });
  }
  return out.slice(0, 7);
}
