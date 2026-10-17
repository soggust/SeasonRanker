// The depth chart's rank gems (the Team tab, team.component.html): each player on the chart, in the special
// teams, the roster and the staff shows where he ranks at his own tab for the card's season, under the
// user's own settings for that tab (the same rank his card opens to), in the rank column's scoreboard
// digits: "#3", or UR for a player under Min Games or outside the tab's list. Nothing for a slot whose tab
// is a team unit (an O-line's: the line's rank is the line's as a whole), or for a player the site hasn't got.
// The card (player-cards.ts) ranks each tab once per season and keeps it; these are the plain parts.
import type { SkillPlayer } from '@sport/positions';

// Where a player stands at his tab: his rank in its list and the list's size, or unranked
export type DepthRank = { rank: number; of: number } | 'ur';

// A tab's places for a season: everyone in its list by id, and the rest of its rows worked out as asked
export interface TabPlaces {
  of: number;
  rankOf: (gsisId: string) => DepthRank;
}

// A tab's list ranked (list) among all its rows (rows): a listed player's place is his index; a row the
// list leaves out is UR when he's under the Min Games cutoff (under), and otherwise ranked where he'd fall
// (rankIn: the list with him in it, as his card opens), worked out the first time he's asked for; a player
// not among the rows at all (one who played outside the ranked list) is UR
export function tabPlaces(list: SkillPlayer[], rows: SkillPlayer[], under: (player: SkillPlayer) => boolean, rankIn: (players: SkillPlayer[]) => SkillPlayer[]): TabPlaces {
  const place = new Map(list.map((p, i) => [p.gsisId, i + 1]));
  const out = new Map(rows.filter((p) => !place.has(p.gsisId)).map((p) => [p.gsisId, p]));
  const fallen = new Map<string, DepthRank>();
  const of = list.length;
  return {
    of,
    rankOf: (gsisId) => {
      const at = place.get(gsisId);
      if (at !== undefined) return { rank: at, of };
      const row = out.get(gsisId);
      if (!row || under(row)) return 'ur';
      let got = fallen.get(gsisId);
      if (!got) {
        const rank = rankIn([...list, row]).findIndex((p) => p.gsisId === gsisId) + 1;
        got = rank ? { rank, of: of + 1 } : 'ur';
        fallen.set(gsisId, got);
      }
      return got;
    },
  };
}

// A linked player's rank: none for a team unit's tab (the line, the defense) or a tab not ranked yet
export function depthRank(link: { position: string; gsisId: string } | null | undefined, places: (position: string) => TabPlaces | null, teamTabs: readonly string[]): DepthRank | null {
  if (!link || teamTabs.includes(link.position)) return null;
  return places(link.position)?.rankOf(link.gsisId) ?? null;
}

// The gem's digits: the rank, or UR
export function depthRankText(rank: DepthRank): string {
  return rank === 'ur' ? 'UR' : String(rank.rank);
}

// Its colors, the rank column's: green for the top ten, red for the bottom ten, grey for UR, white between
export function depthRankClass(rank: DepthRank): string {
  if (rank === 'ur') return 'unranked';
  if (rank.rank <= 10) return 'rank-top';
  if (rank.rank > rank.of - 10) return 'rank-bottom';
  return '';
}

// Its hover: "No. 3 of 32 Quarterbacks this season" (a past season: "in 2024"), or what UR means
export function depthRankTitle(rank: DepthRank, tabName: string, when: string): string {
  if (rank === 'ur') return `Unranked (UR) among the ${tabName} ${when}: under Min Games, or outside the list`;
  return `No. ${rank.rank} of ${rank.of} ${tabName} ${when}`;
}
