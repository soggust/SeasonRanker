// The player card's tabs, one component each (the card switches between them: player-card.component.html)
import { Component } from '@angular/core';
import { SPORT } from '@sport/sport';
import { extras, rowTeamNames } from '@ranker/engine/row-fields';
import { recentWord } from '@ranker/engine/stat-reader';
import { recentRef } from '../../game-view/game-view.service';
import { PlayerAnalysis, evidenceText, nextWeekGame, paragraphs, waysTitle, weekGameText } from '../analysis';
import { PlayerCard } from '../card.model';
import { GameLogViewRow, splitVs } from '../game-log-view';
import { leanShares, leanTitle, statTitle } from '../hover-text';
import { sortFlags } from '../overview';
import { CardTab } from './card-tab';
import { anyFaded, toneText } from '../../heat-map/heat-color';
import type { HeatChip, HeatMapData, HeatMapDef, HeatMatchup, HeatSurfaceId } from '../../heat-map/heat-map.model';
import { heatSurface } from '../../heat-map/surfaces';
import { isLiveSeason } from '@ranker/engine/data';
import { DepthRank, depthRankClass, depthRankText, depthRankTitle } from '../depth-ranks';

// Stats: each group a panel of stat tiles; Recent's W/L squares open their games
@Component({ selector: 'card-stats', templateUrl: './stats.component.html', standalone: false })
export class CardStatsTab extends CardTab {
  // The card's team (its Recent squares' games), a square's hover ("W 24-17 @ Miami Dolphins"), and a game
  // opened (the card set aside, as from the game log)
  recentTeam(card: PlayerCard): (string | undefined)[] {
    return rowTeamNames(card.player);
  }

  private recentVs(card: PlayerCard): (string | null)[] | undefined {
    return extras(card.player).lastFiveVs;
  }

  recentTitle(card: PlayerCard, result: number, index: number): string {
    const word = recentWord(result, extras(card.player).lastFiveOt?.[index]);
    const vs = this.recentVs(card)?.[index];
    const score = this.games.recentScore(this.recentTeam(card), this.recentVs(card), index, card.season);
    return [score, word, vs ? (/^(@|vs) /.test(vs) ? vs : 'vs ' + vs) : null].filter(Boolean).join(' ');
  }

  // (decided past regulation: a lighter square)
  recentOt(card: PlayerCard, index: number): boolean {
    return !!extras(card.player).lastFiveOt?.[index];
  }

  // (a tile's bar on hover: "Passing Yds: 4,183 (#3 of 32) · Avg 3,610")
  readonly statTitle = statTitle;

  openRecent(card: PlayerCard, index: number): void {
    const ref = recentRef(this.recentTeam(card), this.recentVs(card), index, card.season);
    if (ref) this.games.open(ref);
  }
}

// Overview: the archetype, flags, the skill radar, the scouting report, similar seasons
@Component({ selector: 'card-overview', templateUrl: './overview.component.html', standalone: false })
export class CardOverviewTab extends CardTab {
  readonly sortFlags = sortFlags;
  // (the lean bar's shares, adding up to 100, and its hover)
  readonly leanShares = leanShares;
  readonly leanTitle = leanTitle;

  // The card's AI analysis once it's in (its headline and the archetype's definition head the profile);
  // null without one, or while it loads
  aiReport(card: PlayerCard): PlayerAnalysis['report'] | null {
    if (!this.cards.analysisFile(card)) return null;
    const a = this.cards.analysis(card);
    return typeof a === 'object' ? a.report : null;
  }

  // (a split's pie: each part a slice in its own soft color: the NFL's WRs a blue, TEs a sea green, backs a gold;
  // the NBA's five positions those and a lavender and a coral)
  pieColor(i: number): string {
    return ['#8ab4e0', '#7fc8bb', '#e3cb8f', '#c3a8e3', '#e8a598'][i] ?? '#9aa0a6';
  }

  // The pie's slice under the pointer (its popover); null: none
  pieHover: number | null = null;

  // (each part's slice as an SVG path on a 100 x 100 box, clockwise from the top, with where its share
  // sits inside it)
  pieSlices(parts: { share: number }[]): { d: string; color: string; x: number; y: number; pct: string }[] {
    const total = parts.reduce((a, p) => a + p.share, 0) || 1;
    const point = (a: number, r: number) => [50 + r * Math.sin(a), 50 - r * Math.cos(a)].map((v) => Math.round(v * 100) / 100);
    let at = 0;
    return parts.map((p, i) => {
      const from = at;
      at += (p.share / total) * 2 * Math.PI;
      const [x0, y0] = point(from, 50);
      const [x1, y1] = point(at, 50);
      // (a big slice's share nearer the middle, clear of its edges)
      const [x, y] = point((from + at) / 2, at - from > 2.2 ? 24 : 31);
      const d = at - from >= 2 * Math.PI - 1e-6 ? 'M50,0 A50,50 0 1 1 49.99,0 Z' : `M50,50 L${x0},${y0} A50,50 0 ${at - from > Math.PI ? 1 : 0} 1 ${x1},${y1} Z`;
      return { d, color: this.pieColor(i), x, y, pct: `${Math.round(p.share * 100)}%` };
    });
  }
}

// Analysis: the AI write-up
@Component({ selector: 'card-analysis', templateUrl: './analysis.component.html', standalone: false })
export class CardAnalysisTab extends CardTab {
  readonly paragraphs = paragraphs;
  readonly evidenceText = evidenceText;
  readonly weekGameText = weekGameText;
  readonly waysTitle = waysTitle;
  readonly nextWeekGame = nextWeekGame;

  // (the matchup maps' shared key: whether any of them shows last season's, and which)
  fadedLabel(maps: HeatMatchup[]): string | null {
    const m = maps.find((x) => anyFaded(x.cells, x.fallback, x.stat, x.overlay, x.overlayFallback));
    return m ? (m.fallbackLabel ?? 'last season') : null;
  }
}

// Team: the depth chart, special teams, coaches, changes, everyone who's played
@Component({ selector: 'card-team', templateUrl: './team.component.html', standalone: false })
export class CardTeamTab extends CardTab {
  // A headshot whose player the site has: his card (like his name)
  openLink(link: { position: string; gsisId: string } | null | undefined, season: number): void {
    if (link) this.cards.openLinked(link, season);
  }

  // The rank gems (depth-ranks.ts): a player's rank at his own tab, in the rank column's digits, its colors
  // and its hover ("No. 3 of 32 Quarterbacks this season"); a click opens his card (on the chip, which
  // toggles the slot, the gem's click is told apart from the chip's)
  rank(link: { position: string; gsisId: string } | null | undefined): DepthRank | null {
    return this.cards.depthRank(this.c, link);
  }
  readonly rankDigits = depthRankText;
  readonly rankClass = depthRankClass;
  rankTitle(rank: DepthRank, link: { position: string }, season: number): string {
    return depthRankTitle(rank, this.cards.depthRankTab(link), isLiveSeason(season) ? 'this season' : `in ${SPORT.seasonText(season)}`);
  }
  chipClick(event: Event, key: string, link: { position: string; gsisId: string } | null | undefined, season: number): void {
    if ((event.target as Element | null)?.closest('.depth-rank')) {
      event.stopPropagation();
      this.openLink(link, season);
      return;
    }
    this.cards.toggleDepthSlot(key);
  }
}

// Heat Maps: the sport's maps for the row (SPORT.heatMaps: the NFL's zones, field position, down & distance),
// the bar over them, each map's stat, the red zone's numbers, and the Field Map under them
@Component({ selector: 'card-heat-maps', templateUrl: './heat-maps.component.html', standalone: false })
export class CardHeatMapsTab extends CardTab {
  readonly toneText = toneText;

  // (the season dropdown's words: "Current Season" while it's being played, as the compare view's; the
  // sport's own else, "2025", "2024-25")
  readonly heatSeasonText = (season: number): string => (isLiveSeason(season) ? 'Current Season' : SPORT.seasonText(season));

  // The red zone's maps with something to draw (or on their way), the one that leads first (a back's carries)
  maps(card: PlayerCard, defs: HeatMapDef[]): HeatMapDef[] {
    const shown = defs.map((d) => ({ d, m: this.cards.heatMap(card, d) })).filter((x) => x.m !== null);
    return shown.sort((a, b) => Number(b.m !== 'loading' && !!b.m?.lead) - Number(a.m !== 'loading' && !!a.m?.lead)).map((x) => x.d);
  }

  // ...and its numbers, the first map's that has them (each red-zone map carries the same), and their heading
  chipsOf(card: PlayerCard, defs: HeatMapDef[]): HeatChip[] {
    return this.withChips(card, defs)?.chips ?? [];
  }
  chipsTitleOf(card: PlayerCard, defs: HeatMapDef[]): string {
    return this.withChips(card, defs)?.chipsTitle ?? 'Inside the 20';
  }
  private withChips(card: PlayerCard, defs: HeatMapDef[]): HeatMapData | null {
    for (const d of defs) {
      const m = this.cards.heatMap(card, d);
      if (m && m !== 'loading' && m.chips?.length) return m;
    }
    return null;
  }

  // (maps laid out with their numbers in a column beside them, whatever the split: the NHL's)
  withNumbers(defs: HeatMapDef[]): boolean {
    return defs.some((d) => d.numbers);
  }

  // The rows the maps are laid out in: one for all of them (the red zone's, the NHL's), or a row a group (MMA's
  // striking, then its finishes), each with its own numbers beside it
  heatRows(defs: HeatMapDef[]): { id: string | null; defs: HeatMapDef[] }[] {
    const ids = [...new Set(defs.map((d) => d.group ?? null))];
    return ids.map((id) => ({ id, defs: defs.filter((d) => (d.group ?? null) === id) }));
  }

  // (a map's shape, its surface's width over its height: a grouped row sizes its maps by it, so they stand the
  // same height side by side)
  aspect(surface: HeatSurfaceId): number {
    const box = heatSurface(surface)?.viewBox;
    return box ? Math.round((box.w / box.h) * 1000) / 1000 : 1;
  }
}

// Game Log: the season's games (a result opens its game) and the games to come
@Component({ selector: 'card-games', templateUrl: './games.component.html', standalone: false })
export class CardGamesTab extends CardTab {
  // ("@ IND" as its "@" and its "IND")
  readonly splitVs = splitVs;

  // (an upcoming game's TV: under the first stat column, the line taking the rest)
  tvSpan(columns: number): number {
    return Math.min(1, columns);
  }

  // A row's game: ESPN's id, or its day and the two teams
  openGame(card: PlayerCard, row: GameLogViewRow): void {
    if (row.event) this.games.open({ event: row.event });
    else if (row.when) this.games.open({ date: row.when, names: [splitVs(row.vs)[1], extras(card.player).teamName ?? ''].filter(Boolean) });
  }
}

// The sport's history (SPORT.cardHistory: a fighter's fights), newest first
@Component({ selector: 'card-history', templateUrl: './history.component.html', standalone: false })
export class CardHistoryTab extends CardTab {
  historyRows(card: PlayerCard) {
    return SPORT.cardHistory?.rows(card.player) ?? [];
  }
}

// Seasons: the career arc and a line per season, each opening that season's card
@Component({ selector: 'card-seasons', templateUrl: './seasons.component.html', standalone: false })
export class CardSeasonsTab extends CardTab {}

export const CARD_TABS = [CardStatsTab, CardOverviewTab, CardAnalysisTab, CardTeamTab, CardHeatMapsTab, CardGamesTab, CardHistoryTab, CardSeasonsTab];
