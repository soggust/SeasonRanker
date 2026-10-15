// The player card (click a name): builds it and keeps it while it's open. Its stats are the columns
// showing in the grid, as ranks in the list it's ranked in (the table's, or another season's ranked the
// same way); then the Overview (skills, archetype, flags, radar, scouting report), the seasons they're
// in and similar seasons load in behind it.
import { SKILL_STATS, SkillPlayer, SkillPosition, SkillStat, SkillStatGroup, headlineStats } from '@sport/positions';
import { awardsFor } from '@sport/awards';
import { SPORT } from '@sport/sport';
import { extras, logoFile, rowTeamNames } from '@ranker/engine/row-fields';
import { badgeColor, whiteLogo } from '@sport/team-colors';
import { logoForSeason } from '@sport/logo-eras';
import { CardFlag, FlagContext, ValueContext } from '@ranker/engine/sport';
import { CardSkill } from '@ranker/engine/skills';
import { CURRENT_SEASON, SEASONS, dataPart, dataSeason, isLiveSeason } from '@ranker/engine/data';
import { DEFAULT_SPORT_SETTINGS, SKILL_UNITS, statValue } from '@ranker/engine/unit-scoring';
import { StatReader } from '@ranker/engine/stat-reader';
import { RANK_EVERYONE, underMin } from '@ranker/engine/playing-time';
import { SeasonDataService } from '@ranker/engine/season-data.service';
import { currentGrid } from '@ranker/engine/skill-rankings/grid-rankings';
import { homeTab, isPooled } from '@ranker/engine/pooled-tabs';
import { CareerIndex, CareerNames, careerIndex } from '@ranker/engine/career-index';
import { NUMBER, grade, innings, ordinal, rankPct, rankTone } from '@ranker/core/format';
import type { DepthPlayer, DepthSide, DepthView } from './depth-chart';
import { DepthMode, Formation, SlotLineup, sideFormation, slotLineup } from './depth-lineup';
import type { ZoneView } from './zones';
import type { FieldMapView } from './field-map';
import { CardOverview, CardSeason, CardStat, CardTab, CareerSeason, PlayerCard, SeasonContext } from './card.model';
import { archetypeFor, overviewBlurb, profileFlags, scoutingReport, skillScores, skillsOf } from './overview';
import { careerHistory } from './career-history';
import { radar, radarShape } from './radar';
import { GameLogView, gameLogView, splitVs } from './game-log-view';
import { percentile } from './hover-text';
import { PlayerAnalysis, analysisIndex, loadAnalysis } from './analysis';
import { espnTeamNames, espnUpcoming } from '@ranker/core/game-logs';
import { heroColor } from '../game-view/team-color';
import { GameViewService, nameKey } from '../game-view/game-view.service';

// What the card needs from the table it opens from
export interface CardHost {
  readonly position: SkillPosition;
  // The table's season, list and stats, and the Color-Coded Values setting
  readonly season: number;
  readonly playerList: SkillPlayer[];
  readonly stats: SkillStat[];
  readonly colorValues: boolean;
  // A reader for another season (the table's for null)
  readerFor(context: SeasonContext | null): StatReader;
  // Another season's list: the same filters as the table, ranked with the current sliders (another
  // tab's, for a card opened on it)
  seasonContext(season: number, rows: Record<SkillPosition, SkillPlayer[]>, position?: SkillPosition): SeasonContext;
  rankedIn(context: SeasonContext, players: SkillPlayer[]): SkillPlayer[];
  // The stat groups with columns showing, for that reader's season
  shownGroups(reader: StatReader, position?: SkillPosition): SkillStatGroup[];
  headshot(unit: { id?: number | null }, w?: number): string | null;
  // (one failed to load: the next headshot() is the next place to look)
  noHeadshot(unit: { id?: number | null }): void;
}

const TABS: { id: CardTab; title: string }[] = [
  { id: 'overview', title: 'Overview' },
  { id: 'stats', title: 'Stats' },
  { id: 'seasons', title: 'Career' },
];

const POSITION_NAMES = SPORT.positionNames as Record<SkillPosition, string>;

export class PlayerCards {
  card: PlayerCard | null = null;
  // Another season's card being built
  loading = false;
  // The card's tab (kept while flipping through players and seasons)
  tab: CardTab = 'overview';
  // Stats tab groups folded shut (kept across cards)
  closedGroups = new Set<string>();

  constructor(
    private readonly host: CardHost,
    private readonly data: SeasonDataService,
  ) {}

  // The game view's names and teams open cards here: a team its card that season (the game closes), a
  // player his; and a season's players by name, to know which names to link
  connectGames(games: GameViewService): void {
    games.openTeam = (abbreviation, season) => {
      games.close();
      this.openTeam(abbreviation, season);
    };
    games.openPlayer = (link, season) => this.openLinked(link, season);
    games.findPlayers = async (season) => {
      const rows = season === this.host.season ? SKILL_UNITS : await this.data.rows(season);
      // (and who played outside the ranked lists: their unranked cards)
      const unranked = await this.data.unranked(season);
      const players = new Map<string, { position: string; gsisId: string }>();
      for (const tabs of [rows, unranked]) {
        for (const [position, list] of Object.entries(tabs)) {
          // (a pooled tab's rows, the Top 50's, are his own tab's again)
          if (SPORT.teamTabs?.includes(position) || isPooled(position)) continue;
          for (const p of (list ?? []) as SkillPlayer[]) if (!players.has(nameKey(p.name))) players.set(nameKey(p.name), { position, gsisId: p.gsisId });
        }
      }
      return players;
    };
  }

  // The card's tab: the table's, or another one's (a roster's player, or the hero's team, opened on its
  // own tab with the grid left where it is)
  private cardPosition: SkillPosition | null = null;
  private get position(): SkillPosition {
    return this.cardPosition ?? this.host.position;
  }
  // (the tab the card's on, for the compare view)
  get tabPosition(): SkillPosition {
    return this.position;
  }
  // (the card is on the table's tab: the table's own list and reader are its)
  private get onTable(): boolean {
    return this.position === this.host.position;
  }
  // (its tab's stats)
  private get stats(): SkillStat[] {
    return this.onTable ? this.host.stats : SKILL_STATS[this.position];
  }

  // The card's tabs: Overview, Analysis (when written up), Team, Stats, Zones, Game Log and Seasons or
  // History (a team's, a defense's or a line's; the sport's own history tab when it has one: MMA's fights)
  tabsFor(card: PlayerCard): { id: CardTab; title: string }[] {
    const [overview, stats, seasons] = TABS;
    const tabs: { id: CardTab; title: string }[] = [overview];
    if (this.analysisFile(card)) tabs.push({ id: 'analysis', title: 'Analysis' });
    // (a team's Team tab: its depth chart, staff and roster, before its Stats)
    if (SPORT.depthChart?.has(card.player, this.position, card.season)) tabs.push({ id: 'depth', title: 'Team' });
    tabs.push(stats);
    // (MLB's season by zone: a pitcher's, a hitter's)
    if (SPORT.zones?.has(card.player, this.position, card.season)) tabs.push({ id: 'zones', title: SPORT.zones.title(this.position) });
    if (this.hasGameLog(card)) tabs.push({ id: 'games', title: 'Game Log' });
    if (!SPORT.careerOnly && (!card.seasons || card.seasons.length > 1)) tabs.push({ ...seasons, title: this.careerTitle });
    return SPORT.cardHistory ? [...tabs, { id: 'history', title: SPORT.cardHistory.title }] : tabs;
  }

  // The Analysis tab: the season being played's write-up, for a row the sport has one for (the index
  // loads with the first card; the tab shows once it's in)
  private analyses: Record<string, string> | null = null;
  private analysisLoads = new Map<string, PlayerAnalysis | 'loading' | 'error'>();
  analysisFile(card: PlayerCard): string | null {
    if (!SPORT.analysis || card.season !== CURRENT_SEASON) return null;
    if (!this.analyses) {
      analysisIndex().then((index) => (this.analyses = index));
      return null;
    }
    return this.analyses[card.player.gsisId] ?? null;
  }
  analysis(card: PlayerCard): PlayerAnalysis | 'loading' | 'error' {
    const file = this.analysisFile(card);
    if (!file) return 'error';
    if (!this.analysisLoads.has(file)) {
      this.analysisLoads.set(file, 'loading');
      loadAnalysis(file)
        .then((a) => this.analysisLoads.set(file, a))
        .catch(() => this.analysisLoads.set(file, 'error'));
    }
    return this.analysisLoads.get(file)!;
  }

  // The Zones tab: the season by zone (loaded the first time the tab asks, then kept), and the stat showing
  private zoneLoads = new Map<string, ZoneView | 'loading' | 'error'>();
  zoneStat: string | null = null;
  zones(card: PlayerCard): ZoneView | 'loading' | 'error' {
    const zones = SPORT.zones;
    return this.loadOnce(this.zoneLoads, card, zones && (() => zones.load(card.player, this.position, card.season)));
  }

  // The Overview's Field Map (the NFL's: the season by where on the field it happened, player-card/field-map.ts),
  // for the part the card's season shows (the playoffs, or both, when the table's season is on one), loaded
  // with the card and kept; null until it's in, or when there's none. Its zones by efficiency or by volume
  // (kept across cards)
  private fieldMaps = new Map<string, FieldMapView | null | 'loading' | 'error'>();
  fieldMapMode: 'efficiency' | 'volume' = 'efficiency';
  fieldMap(card: PlayerCard): FieldMapView | null {
    const map = SPORT.fieldMap;
    if (!map?.has(card.player, this.position, card.season)) return null;
    const part = card.season === dataSeason ? dataPart : 'regular';
    const view = this.loadOnce(this.fieldMaps, card, () => map.load(card.player, this.position, card.season, part), part);
    return view === 'loading' || view === 'error' ? null : view;
  }

  // A tab's view of a card (its season by zone, its game log, its depth chart), loaded the first time the tab
  // asks, then kept: the view, or still loading, or failed (and failed for a sport without one: no load)
  private loadOnce<T>(cache: Map<string, T | 'loading' | 'error'>, card: PlayerCard, load: (() => Promise<T>) | undefined, part = ''): T | 'loading' | 'error' {
    const key = `${this.position}/${card.player.gsisId}/${card.season}${part ? '/' + part : ''}`;
    if (!cache.has(key) && load) {
      cache.set(key, 'loading');
      load()
        .then((view) => cache.set(key, view))
        .catch(() => cache.set(key, 'error'));
    }
    return cache.get(key) ?? 'error';
  }

  // The Analysis tab's sections toggled from where they start (back to that each time the tab opens, or
  // another card does: the Overview and a recap open, kept here as '-closed' once shut; the rest folded)
  aiOpen = new Set<string>();
  toggleAi(section: string): void {
    if (!this.aiOpen.delete(section)) this.aiOpen.add(section);
  }

  // The Career tab's name: a team row's is its History
  get careerTitle(): string {
    const position: string = this.position;
    return SPORT.teamTabs?.includes(position) ? 'History' : 'Career';
  }

  // The Game Log tab: the card's season's games, for a row the sport has one for (SPORT.gameLog)
  hasGameLog(card: PlayerCard): boolean {
    return !!SPORT.gameLog?.has(card.player, this.position, card.season);
  }

  // A card's game log for its season (loadOnce), with the team's games still to play when it's the season
  // being played and the sport names its league (those failing just leave them out)
  private gameLogs = new Map<string, GameLogView | 'loading' | 'error'>();
  gameLog(card: PlayerCard): GameLogView | 'loading' | 'error' {
    const sportLog = SPORT.gameLog;
    return this.loadOnce(this.gameLogs, card, sportLog && (async () => {
      const { load, league } = sportLog;
      const next = league && card.season === CURRENT_SEASON ? espnUpcoming(league, rowTeamNames(card.player), SPORT.currentSeason).catch(() => []) : Promise.resolve([]);
      const [log, upcoming] = await Promise.all([load(card.player, this.position, card.season), next]);
      return gameLogView(log, upcoming);
    }));
  }

  // A team card's depth chart for its season (loadOnce), its players linked to their cards. depthOpen: the
  // slot whose backups are showing (one at a time)
  private depthCharts = new Map<string, DepthView | 'loading' | 'error'>();
  depthOpen: string | null = null;
  depthChart(card: PlayerCard): DepthView | 'loading' | 'error' {
    const depth = SPORT.depthChart;
    return this.loadOnce(this.depthCharts, card, depth && (async () => {
      // (the sport builds it from that season's rows: every tab's, the table's own for its season)
      const rows = card.season === this.host.season ? SKILL_UNITS : await this.data.rows(card.season);
      const view = await depth.load(card.player, this.position, card.season, { rows, headshot: (p) => this.host.headshot(p, 96) });
      await this.linkRoster(view, card.season);
      return view;
    }));
  }

  // A roster's players the site has: each one's card (his tab and row id), found among that season's rows
  // by his id (the QBs' rows by ESPN's: "QB-<id>")
  private async linkRoster(view: DepthView, season: number): Promise<void> {
    const rows = season === this.host.season ? SKILL_UNITS : await this.data.rows(season).catch(() => null);
    if (!rows) return;
    // (someone who played outside the ranked lists links to his unranked card; a ranked row comes first)
    const unranked = await this.data.unranked(season);
    const index = new Map<string, { position: string; gsisId: string }>();
    for (const tabs of [unranked, rows]) {
      for (const [position, list] of Object.entries(tabs)) {
        // (not a pooled tab's copy: his card is his own tab's)
        if (isPooled(position)) continue;
        for (const p of (list ?? []) as SkillPlayer[]) if (p.gsisId) index.set(p.gsisId, { position, gsisId: p.gsisId });
      }
    }
    const link = (p: DepthPlayer | null | undefined) => {
      if (p) p.link = index.get(p.id) ?? (p.espnId ? index.get(`QB-${p.espnId}`) : undefined) ?? null;
    };
    for (const side of view.sides) for (const f of [side, ...(side.others ?? [])]) for (const slot of f.slots) slot.depth.forEach(link);
    view.special.forEach((s) => (s.depth ?? [s.player]).forEach(link));
    for (const g of view.usage) g.rows.forEach(link);
    for (const w of view.timeline) for (const ch of w.changes) [ch.from, ch.to].forEach(link);
    // (a head coach by his name, on the coaches' tab)
    const coachTab = Object.keys(rows).find((p) => SPORT.positionNames[p as SkillPosition] === 'Head Coach') as SkillPosition | undefined;
    const coachRows = coachTab ? ((rows[coachTab] ?? []) as SkillPlayer[]) : [];
    for (const g of view.coaches) {
      for (const co of g.rows) {
        const row = coachRows.find((r) => r.name === co.name);
        co.link = row && coachTab ? { position: coachTab, gsisId: row.gsisId } : null;
      }
    }
  }

  // A roster's player (or the hero's team) opened: their card for that season, on their own tab, ranked
  // with that tab's sliders and filters; the grid stays where it is
  async openLinked(link: { position: string; gsisId: string }, season: number): Promise<boolean> {
    const back = this.cardPosition;
    this.cardPosition = link.position === this.host.position ? null : (link.position as SkillPosition);
    const opened = await this.openSeason(season, link.gsisId);
    if (!opened) this.cardPosition = back;
    return opened;
  }

  // A card's link (card-link.ts) opened: the card on the tab it was shared on (one this card doesn't have:
  // the Overview); pool: the pooled tab's list it was shared from (the Top 50: "#7 in Top 50", the arrows
  // walking it). False: nobody by that id this season.
  async openShared(link: { position: string; gsisId: string; tab: CardTab | null }, season: number, pool: SkillPlayer[] | null): Promise<boolean> {
    // (the Analysis tab shows once the write-ups' index is in)
    if (link.tab === 'analysis' && SPORT.analysis && !this.analyses) this.analyses = await analysisIndex().catch(() => null);
    this.tab = link.tab ?? 'overview';
    this.pool = pool;
    const opened = await this.openLinked(link, season);
    if (!opened) this.pool = null;
    return opened;
  }

  // The card was opened from a pooled tab (the Top 50), its season: its link opens there
  get fromPool(): boolean {
    return !!this.card && this.poolIndex(this.card) >= 0;
  }

  // The hero's team name: that season's team row (the sport's team tab), for anyone but a team
  private teamLink(player: SkillPlayer, rows: Record<SkillPosition, SkillPlayer[]>): { position: string; gsisId: string } | null {
    const position = SPORT.teamTabs?.[0] as SkillPosition | undefined;
    if (!position || this.position === position || !player.teamLogo) return null;
    const team = rows[position]?.find((t) => t.teamLogo === player.teamLogo);
    return team ? { position, gsisId: team.gsisId } : null;
  }

  // A game log's opponent ("@ IND"): its team's card for the card's season (the sport's team tab), found
  // by ESPN's name for the abbreviation, or the row's logo file ("LAK_2002..." for the NHL's own)
  async openOpponent(card: PlayerCard, vs: string): Promise<void> {
    await this.openTeam(splitVs(vs)[1], card.season);
  }

  // A team by its abbreviation ("IND"): its card for a season (the game view's teams too)
  async openTeam(abbreviation: string, season: number): Promise<void> {
    const position = SPORT.teamTabs?.[0];
    if (!position) return;
    const abbr = abbreviation.toLowerCase();
    const rows = season === this.host.season ? SKILL_UNITS : await this.data.rows(season).catch(() => null);
    const teams = (rows?.[position as SkillPosition] ?? []) as SkillPlayer[];
    const names = espnTeamNames(SPORT.gameLog?.league ?? '', abbr).map((n) => n.toLowerCase());
    const file = (p: SkillPlayer) => logoFile(p.teamLogo)?.toLowerCase() ?? '';
    const team =
      teams.find((t) => names.includes(t.name.toLowerCase()) || names.includes((extras(t).teamName ?? '').toLowerCase())) ??
      teams.find((t) => file(t).split('_')[0] === abbr || names.includes(file(t)));
    if (team) await this.openLinked({ position, gsisId: team.gsisId }, season);
  }

  toggleDepthSlot(key: string): void {
    this.depthOpen = this.depthOpen === key ? null : key;
  }

  // The formations' Current / Starters knob (kept across cards for the visit): who's playing now, the ones
  // the injury report keeps out replaced by the next healthy man (depth-lineup.ts), or the chart's starters.
  // A past season (no injury report) is always its starters
  depthMode: DepthMode = 'current';
  private formations = new WeakMap<object, { mode: DepthMode; formation: Formation }>();
  private specials = new WeakMap<object, { mode: DepthMode; lineup: Record<string, SlotLineup> }>();
  depthModeOf(view: DepthView): DepthMode {
    return view.injuries ? this.depthMode : 'starters';
  }
  // (a side as drawn: its grouping, its chips by slot key)
  formation(view: DepthView, side: DepthSide): Formation {
    const mode = this.depthModeOf(view);
    const kept = this.formations.get(side);
    if (kept?.mode === mode) return kept.formation;
    const formation = sideFormation(side, mode);
    this.formations.set(side, { mode, formation });
    return formation;
  }
  // (the special teams' chips by label, each spot its own: a returner can be at both)
  specialLineup(view: DepthView): Record<string, SlotLineup> {
    const mode = this.depthModeOf(view);
    const kept = this.specials.get(view.special);
    if (kept?.mode === mode) return kept.lineup;
    const lineup = Object.fromEntries(view.special.map((s) => [s.label, slotLineup(s.depth ?? (s.player ? [s.player] : []), mode)]));
    this.specials.set(view.special, { mode, lineup });
    return lineup;
  }

  // A name in the table: their card for the table's season, ranked as the table has them (always on
  // the Overview; flipping through players and seasons keeps the tab you're on)
  open(player: SkillPlayer): void {
    this.pool = null;
    this.cardPosition = null;
    this.tab = 'overview';
    this.show(this.render(player, this.host.season, this.host.playerList, null));
  }

  // A season link or a similar season: that season's card, without changing the table (the table's own
  // season shows as the table has it)
  async openSeason(season: number, gsisId: string): Promise<boolean> {
    const { host } = this;
    const listed = season === host.season && this.onTable ? host.playerList.find((p) => p.gsisId === gsisId) : undefined;
    if (listed) {
      this.show(this.render(listed, host.season, host.playerList, null));
      return true;
    }
    this.loading = true;
    try {
      const rows = season === host.season ? SKILL_UNITS : await this.data.rows(season);
      const player = rows[this.position]?.find((p) => p.gsisId === gsisId);
      if (!player) return await this.openUnranked(season, gsisId, rows);
      const context = host.seasonContext(season, rows, this.position);
      // (someone under the Min Games setting: UR, as the grid shows him, when the sport ranks everyone;
      // otherwise his card ranked where he'd fall)
      if (!context.list.includes(player) && underMin(player, context)) {
        this.show(this.render(player, season, context.list, context, true));
        return true;
      }
      if (!context.list.includes(player)) {
        context.list = context.manual ? [...context.list, player] : host.rankedIn(context, [...context.list, player]);
      }
      this.show(this.render(player, season, context.list, context));
      return true;
    } catch (err) {
      console.error(err);
      return false;
    } finally {
      this.loading = false;
    }
  }

  // A season they played outside the tab's ranked list (SPORT.unrankedSeasons): its card, the stats read
  // against that season's list as the table reads them but never ranked in it (UR)
  private async openUnranked(season: number, gsisId: string, rows: Record<SkillPosition, SkillPlayer[]>): Promise<boolean> {
    const player = await this.data.unrankedRow(season, this.position, gsisId);
    if (!player) return false;
    const context = this.host.seasonContext(season, rows, this.position);
    this.show(this.render(player, season, context.list, context, true));
    return true;
  }

  // A name on a pooled tab (the Top 50): his card on his own tab, ranked there with its sliders, as a
  // roster's link opens it (his own career lines, comps, skills and game log); the arrows walk the pooled
  // list (list: the table's) while the card is the table's season
  private pool: SkillPlayer[] | null = null;
  async openFromPool(row: SkillPlayer, list: SkillPlayer[]): Promise<void> {
    this.tab = 'overview';
    this.pool = list;
    await this.openLinked({ position: homeTab(row, this.host.position), gsisId: row.gsisId }, this.host.season);
  }

  // His place in the pooled list the card was opened from ("#7 in Top 50"), while it's that season's
  poolPlace(card: PlayerCard): string | null {
    const at = this.poolIndex(card);
    return at < 0 ? null : `#${at + 1} in ${SPORT.tabNames[this.host.position] ?? this.host.position}`;
  }

  private poolIndex(card: PlayerCard): number {
    if (!this.pool || card.season !== this.host.season || card.ur) return -1;
    return this.pool.findIndex((p) => p.gsisId === card.player.gsisId);
  }

  // The player above or below in the list (arrow keys too)
  step(step: number): void {
    if (!this.card) return;
    // (a card opened from a pooled tab: the next one there, on his own tab)
    const at = this.poolIndex(this.card);
    if (at >= 0) {
      const pool = this.pool!;
      const next = pool[(at + step + pool.length) % pool.length];
      void this.openLinked({ position: homeTab(next, this.host.position), gsisId: next.gsisId }, this.card.season);
      return;
    }
    const { list, season, context, player } = this.card;
    // (a UR card's player isn't in the list: he stands between its end and #1, so up opens the last, down #1)
    const to = this.card.ur ? (step > 0 ? step - 1 : list.length + step) : list.indexOf(player) + step;
    const next = list[(to + list.length) % list.length];
    if (next) this.show(this.render(next, season, list, context));
  }

  close(): void {
    this.card = null;
    this.cardPosition = null;
    this.pool = null;
  }

  selectTab(tab: CardTab): void {
    this.tab = tab;
    // (each tab's panels back to their defaults when it's opened: the Season groups open, the Analysis
    // sections shut but its Overview or recap)
    if (tab === 'stats') this.closedGroups.clear();
    if (tab === 'analysis') this.aiOpen.clear();
    if (tab === 'seasons' && this.card) this.rankCareer(this.card);
  }

  // A headshot that failed to load: the next place to look, or none
  nextPhoto(unit: { id?: number | null }, w: number): string | null {
    this.host.noHeadshot(unit);
    return this.host.headshot(unit, w);
  }

  toggleGroup(id: string): void {
    if (this.closedGroups.has(id)) this.closedGroups.delete(id);
    else this.closedGroups.add(id);
  }

  private show(card: PlayerCard): void {
    this.card = card;
    this.aiOpen.clear();
    // (a tab this card doesn't have falls back to the Overview)
    if (!this.tabsFor(card).some((tab) => tab.id === this.tab)) this.tab = 'overview';
    this.loadSeasons(card);
    // (an unranked season has no skills to set against last season's)
    if (!card.ur) this.loadPrevSkills(card);
    // (the hero in the team's own color, as the game view draws it, once ESPN's list is in)
    const league = SPORT.gameLog?.league;
    if (league && card.heroColor === undefined) {
      heroColor(league, rowTeamNames(card.player))
        .then((color) => (card.heroColor = color))
        .catch(() => (card.heroColor = null));
    }
  }

  // ---------------------------------------------------------------------------
  // The card itself: the hero and the Stats tab's tiles, then the Overview
  // ---------------------------------------------------------------------------
  // (ur: an unranked season, not in the list: its stats with no rank or color, no skills or awards)
  private render(player: SkillPlayer, season: number, list: SkillPlayer[], context: SeasonContext | null, ur = false): PlayerCard {
    const reader = this.host.readerFor(context);
    const groups = this.host
      .shownGroups(reader, this.position)
      .map((group) => ({
        id: group.id,
        title: group.title,
        icon: group.icon,
        // (another season's card leaves out the values from other tabs, which are the table's season's, and
        // a display-only stat that season doesn't have: Time of Possession before it was kept)
        stats: group.stats
          .filter((stat) => !context || !SPORT.tableSeasonOnly?.(stat))
          .filter((stat) => !stat.infoOnly || Number.isFinite(reader.value(player, stat)))
          .map((stat) => this.cardStat(reader, player, stat, list, group.id))
          .map((stat) => (ur ? { ...stat, rank: null, tied: false, pct: null, tint: null } : stat)),
      }))
      .filter((group) => group.stats.length);
    const rows = context ? context.rows : SKILL_UNITS;
    // (the sport's breakdown panel, and its takes among the Overview's, under the archetype)
    const breakdown = ur ? null : (SPORT.cardBreakdown?.(player, this.position, list) ?? null);
    const overview = ur ? this.unrankedOverview(season) : this.overview(reader, player, season, list, context);
    if (breakdown) overview.flags = [...overview.flags, ...breakdown.flags];
    return {
      player,
      season,
      ...(ur ? { ur } : {}),
      list,
      context,
      name: player.name,
      positionName: POSITION_NAMES[this.position],
      positionLabel: SPORT.teamTabs?.includes(this.position) || this.position === SPORT.coachTab ? POSITION_NAMES[this.position] : this.position,
      seasonLabel: SPORT.careerOnly ? 'Career' : isLiveSeason(season) ? 'Current Season' : `${SPORT.seasonText(season)} Season`,
      teamName: SPORT.teamName ? SPORT.teamName(player, this.position, rows) : (extras(player).teamName ?? null),
      teamLink: this.teamLink(player, rows),
      logo: SPORT.cardLogo ? SPORT.cardLogo(logoForSeason(player.teamLogo, season)) : logoForSeason(player.teamLogo, season),
      color: badgeColor(player.teamLogo),
      whiteLogo: whiteLogo(player.teamLogo),
      // The table's headshot, big enough for the card's hero
      photo: this.host.headshot(player, 440),
      rank: ur ? 0 : list.indexOf(player) + 1,
      of: list.length,
      awards: ur ? [] : awardsFor(player, this.position, season),
      groups,
      overview,
      breakdown,
      seasons: null,
      comps: null,
    };
  }

  private cardStat(reader: StatReader, player: SkillPlayer, stat: SkillStat, list: SkillPlayer[], group: string): CardStat {
    // Lower is better for ranks and stats that count against a player (support grades read higher is
    // better: a better lineup is a better lineup)
    const lowerBetter = stat.format === 'rank' || (!!stat.negative && !stat.support);
    const values = list.map((p) => reader.value(p, stat)).filter((v): v is number => v !== null);
    const value = reader.value(player, stat);
    // (display-only stats like Games aren't ranked)
    const rank = value === null || stat.infoOnly ? null : 1 + values.filter((v) => (lowerBetter ? v < value : v > value)).length;
    const of = values.length;
    return {
      key: stat.key,
      group,
      label: reader.label(stat),
      name: reader.name(stat),
      display: reader.format(player, stat),
      rank,
      tied: value !== null && values.filter((v) => v === value).length > 1,
      dots: stat.format === 'recent' ? [...reader.lastFive(player)].reverse() : undefined,
      of,
      pct: rank === null ? null : rankPct(rank, of),
      avg: reader.averageText(stat),
      trait: !stat.infoOnly && (!stat.support || !!stat.supportHelps),
      tint: reader.valueColor(player, stat),
    };
  }

  // ---------------------------------------------------------------------------
  // Overview: skills, archetype, the one-line take and the context flags
  // ---------------------------------------------------------------------------
  private overview(reader: StatReader, player: SkillPlayer, season: number, list: SkillPlayer[], context: SeasonContext | null): CardOverview {
    const skills = this.skillsFor(reader, player, list);
    const at = list.indexOf(player);
    const overall = at < 0 || list.length < 2 ? 0.5 : (list.length - 1 - at) / (list.length - 1);
    const { strengths, weaknesses, report } = scoutingReport(skills);
    return {
      archetype: archetypeFor(this.position, skills, overall, player),
      blurb: overviewBlurb(strengths, [...weaknesses].reverse()),
      skills,
      report,
      flags: this.flags(reader, player, season, overall, skillScores(this.position, skills), !context),
      radar: radar(skills),
      prev: null,
    };
  }

  // An unranked season's Overview: what UR means, in place of skills against a list he isn't in
  private unrankedOverview(season: number): CardOverview {
    return {
      archetype: 'Unranked season',
      blurb: `Not ranked in the ${SPORT.seasonText(season)} ${POSITION_NAMES[this.position]} rankings (${RANK_EVERYONE ? 'under the Min Games setting, or outside the list' : 'outside the list'}): the stats are here, but the season isn't ranked, graded or set against the list (UR).`,
      skills: [],
      report: scoutingReport([]).report,
      flags: [],
      radar: radar([]),
      prev: null,
    };
  }

  // Each skill as a percentile in the list (overview.ts skillsOf), on the card's tab's stats
  private skillsFor(reader: StatReader, player: SkillPlayer, list: SkillPlayer[]): CardSkill[] {
    return skillsOf(this.position, this.stats, reader, player, list);
  }

  // Context the stats alone don't say: the sport's own takes (a small sample, luck: results against
  // what the contact or the peripherals say should have happened), then the profile's shape and results
  // against play, then the sport's last ones
  private flags(
    reader: StatReader,
    player: SkillPlayer,
    season: number,
    overall: number,
    scores: Record<string, number>,
    tableSeason: boolean,
  ): CardFlag[] {
    const context: FlagContext = {
      player,
      season,
      position: this.position,
      current: isLiveSeason(season),
      ordinal,
      innings,
      overall,
      tableSeason,
      stats: this.stats,
      value: (stat) => reader.raw(player, stat),
      grade,
    };
    return [...SPORT.cardFlags(context), ...profileFlags(this.position, scores), ...(SPORT.cardFlagsLast?.(context) ?? [])];
  }

  // ---------------------------------------------------------------------------
  // Last season's skills: for team tabs, the biggest rise and drop as flags
  // ---------------------------------------------------------------------------
  private async loadPrevSkills(card: PlayerCard): Promise<void> {
    const prevSeason = card.season - 1;
    if (prevSeason < SEASONS[SEASONS.length - 1]) return;
    // (a playoffs or both row against last season's regular season: no "up from" lines)
    if (card.season === dataSeason && dataPart !== 'regular') return;
    const { host } = this;
    try {
      let unit: SkillPlayer | undefined;
      let list: SkillPlayer[];
      let context: SeasonContext | null = null;
      if (prevSeason === host.season && this.onTable) {
        list = host.playerList;
        unit = SKILL_UNITS[this.position].find((p) => p.gsisId === card.player.gsisId);
      } else {
        const rows = await this.data.tabRows(prevSeason, this.position);
        unit = rows.find((p) => p.gsisId === card.player.gsisId);
        if (!unit) return;
        context = host.seasonContext(prevSeason, { [this.position]: rows } as Record<SkillPosition, SkillPlayer[]>, this.position);
        list = context.list;
      }
      if (!unit || this.card !== card) return;
      const prev = this.skillsFor(host.readerFor(context), unit, list);
      const byId = new Map(prev.map((s) => [s.id, s.pct]));
      const overview = card.overview;
      overview.prev = {
        season: prevSeason,
        pcts: byId,
        // (a skill last season didn't have, like run blocking, sits where it is now)
        shape: radarShape(overview.skills.map((s) => byId.get(s.id) ?? s.pct)),
      };
      // (players and coaches get these against their whole career instead, in the history)
      if (!SPORT.teamTabs?.includes(this.position)) return;
      const moves = overview.skills.filter((s) => byId.has(s.id)).map((s) => ({ skill: s, delta: s.pct - byId.get(s.id)! }));
      const up = moves.reduce((best, m) => (m.delta > (best?.delta ?? 0.2) ? m : best), null as (typeof moves)[0] | null);
      const down = moves.reduce((worst, m) => (m.delta < (worst?.delta ?? -0.2) ? m : worst), null as (typeof moves)[0] | null);
      // (a skill's percentiles: "58th → 92nd percentile")
      const move = (m: (typeof moves)[0], way: string) =>
        `${m.skill.name} ${way} from ${prevSeason} (${percentile(m.skill.pct - m.delta)} → ${percentile(m.skill.pct)} percentile)`;
      if (up) overview.flags.push({ icon: 'trending_up', tone: 'good', text: move(up, 'up') });
      if (down) overview.flags.push({ icon: 'trending_down', tone: 'bad', text: move(down, 'down') });
    } catch (err) {
      console.error(err);
    }
  }

  // ---------------------------------------------------------------------------
  // The seasons they're in (the Seasons tab, and the Overview's career history) and similar seasons
  // ---------------------------------------------------------------------------
  private async loadSeasons(card: PlayerCard): Promise<void> {
    // (a career-only sport has no seasons to link, and no similar seasons)
    if (SPORT.careerOnly) return;
    // (a playoffs or both row, Length: its career history and similar seasons would weigh it against
    // whole regular seasons, a 58-PA October reading as a career year, so the card leaves them out)
    const partRow = card.season === dataSeason && dataPart !== 'regular';
    try {
      const seasons = await this.seasonLines(card.player.gsisId);
      if (this.card !== card) return;
      card.seasons = seasons;
      if (this.tab === 'seasons' && seasons.length < 2) this.tab = 'overview';
      if (this.tab === 'seasons') this.rankCareer(card);
      this.loadLinked(card);
      // (an unranked season: no career history, blocking skills or similar seasons; it has no standing)
      if (card.ur) return;
      if (!partRow) this.loadHistory(card);
      this.loadExtras(card);
    } catch (err) {
      console.error(err);
    }
    if (card.season !== CURRENT_SEASON && !partRow && !card.ur) this.loadComps(card);
  }

  // A line per season they're in, on every tab of their career (careerLines)
  private seasonLines(id: string): Promise<CardSeason[]> {
    return careerLines(this.data, this.host.season, this.position, id);
  }

  // His other careers (MLB: Ohtani's pitching beside his hitting), for the Career tab's links
  private async loadLinked(card: PlayerCard): Promise<void> {
    try {
      const linked = await linkedCareers(this.data, this.host.season, this.position, card.player.gsisId);
      if (this.card === card) card.linked = linked;
    } catch (err) {
      console.error(err);
    }
  }

  // A season on the Career tab (or a linked career) opened: that season's card on the tab he played it on
  // (the card's own tab: as a season link; another: as a roster's link opens it, the grid where it is)
  openLine(line: { season: number; position: SkillPosition; id: string }): Promise<boolean> {
    if (line.position === this.position) return this.openSeason(line.season, line.id);
    return this.openLinked({ position: line.position, gsisId: line.id }, line.season);
  }

  // The season on the card is this line's (its year and its tab)
  isShowing(card: PlayerCard, line: CardSeason): boolean {
    return line.season === card.season && line.position === this.position;
  }

  // The Seasons tab: re-rank every season with the current sliders (a season dragged by hand this visit
  // keeps its dragged order; the table's own season is the table's list). Each line swaps its default
  // rank for this one as its season loads.
  private rankCareer(card: PlayerCard): void {
    if (card.careerRanked || !card.seasons) return;
    card.careerRanked = true;
    for (const line of card.seasons) {
      this.rankSeasonLine(card, line).catch((err) => console.error(err));
    }
  }

  private async rankSeasonLine(card: PlayerCard, line: CardSeason): Promise<void> {
    // (an unranked season stays UR)
    if (line.ur) return;
    const { list, context } = await this.rankedSeason(line.season, line.position);
    const at = list.findIndex((p) => p.gsisId === line.id);
    // (under the Min Games setting that year, or hidden as injured: the default rank stays)
    if (at < 0 || this.card !== card) return;
    line.rank = at + 1;
    line.of = list.length;
    line.pct = rankPct(line.rank, line.of);
    line.yours = true;
    // Each headline stat by where it stood in that year's list (per game, like the table): the bar's
    // length, and with Color-Coded Values on, its color on the card's red-orange-green scale (a season on
    // another tab: the stat as that tab has it, when it has it)
    const reader = this.host.readerFor(context);
    const own = headlineStats(line.position);
    headlineStats(this.position).forEach((shown, i) => {
      const stat = line.position === this.position ? shown : own.find((s) => s.key === shown.key);
      const readout = line.stats[i];
      const mine = stat ? reader.rate(list[at], stat) : null;
      if (!stat || !readout || mine === null) return;
      const values = list.map((p) => reader.rate(p, stat)).filter((v): v is number => v !== null);
      if (values.length < 2) return;
      const above = values.filter((v) => (stat.negative ? v < mine : v > mine)).length;
      const pct = 1 - above / (values.length - 1);
      readout.share = pct;
      if (this.host.colorValues) readout.tint = rankTone(pct);
    });
  }

  // A season's list on a tab (the card's, or another of his career's) ranked with the current sliders: the
  // table's own, or another's (null context: the table's)
  private async rankedSeason(season: number, position = this.position): Promise<{ list: SkillPlayer[]; context: SeasonContext | null }> {
    if (season === this.host.season && position === this.host.position) return { list: this.host.playerList, context: null };
    const rows = season === CURRENT_SEASON ? (await this.data.rows(CURRENT_SEASON))[position] : await this.data.tabRows(season, position);
    const context = this.host.seasonContext(season, { [position]: rows } as Record<SkillPosition, SkillPlayer[]>, position);
    return { list: context.list, context };
  }

  // The Overview's career history: this season and the ones before it, on every tab of the career (a
  // season on two tabs counted once). Players and coaches only: a defense or O-line turns over too much
  // year to year.
  private async loadHistory(card: PlayerCard): Promise<void> {
    if (SPORT.teamTabs?.includes(this.position) || !card.seasons) return;
    const upTo = seasonByYear(card.seasons, this.position).filter((s) => s.season <= card.season);
    try {
      // (every season played counts toward where they are in their career; the unranked ones have no standing)
      const ranked = upTo.filter((s) => !s.ur);
      const entries = (await Promise.all(ranked.map((s) => this.careerSeason(card, s)))).filter((e): e is CareerSeason => !!e);
      if (this.card !== card || !entries.some((e) => e.season === card.season)) return;
      const played = upTo.map((s) => s.season);
      card.overview.flags = [
        ...card.overview.flags,
        ...careerHistory(this.position, card.season, played, entries, card.overview.blockingArchetype),
      ];
    } catch (err) {
      console.error(err);
    }
  }

  // One season of a career: where they ranked (current sliders, on the tab he played it on) and their
  // skills, or null when they're not in that year's list (under Min Games, or hidden as injured)
  private async careerSeason(card: PlayerCard, line: CardSeason): Promise<CareerSeason | null> {
    const { season, position } = line;
    if (season === card.season && position === this.position) {
      return { season, rank: card.rank, of: card.of, pct: rankPct(card.rank, card.of), skills: card.overview.skills, archetype: card.overview.archetype };
    }
    const { list, context } = await this.rankedSeason(season, position);
    const at = list.findIndex((p) => p.gsisId === line.id);
    if (at < 0) return null;
    const reader = this.host.readerFor(context);
    const skills = position === this.position ? this.skillsFor(reader, list[at], list) : skillsOf(position, SKILL_STATS[position], reader, list[at], list);
    const pct = rankPct(at + 1, list.length);
    return { season, rank: at + 1, of: list.length, pct, skills, archetype: archetypeFor(position, skills, pct, list[at]) };
  }

  // The three closest seasons by anyone else (finished seasons only)
  private async loadComps(card: PlayerCard): Promise<void> {
    try {
      const matches = (await this.data.comps(card.season))[this.position]?.[card.player.gsisId] ?? [];
      if (this.card !== card) return;
      card.comps = matches.map(([season, gsisId, name, espnId, logo, match]) => {
        const teamLogo = SPORT.teamLogo(logo);
        return {
          season,
          gsisId,
          name,
          match,
          logo: logoForSeason(teamLogo, season),
          color: badgeColor(teamLogo),
          whiteLogo: whiteLogo(teamLogo),
          espnId,
          photo: this.host.headshot({ id: espnId }, 240),
        };
      });
    } catch (err) {
      console.error(err);
      if (this.card === card) card.comps = [];
    }
  }

  // The sport's card extras (SPORT.cardExtras: the NFL's run blocking), once the seasons are in
  private async loadExtras(card: PlayerCard): Promise<void> {
    if (!SPORT.cardExtras || !card.seasons) return;
    const overview = card.overview;
    const redraw = () => {
      overview.radar = radar(overview.skills);
      overview.report = scoutingReport(overview.skills).report;
      if (overview.prev) overview.prev.shape = radarShape(overview.skills.map((s) => overview.prev!.pcts.get(s.id) ?? s.pct));
    };
    try {
      await SPORT.cardExtras({
        player: card.player,
        season: card.season,
        position: this.position,
        seasons: card.seasons.filter((s) => s.season <= card.season && !s.ur).map((s) => s.season),
        open: () => this.card === card,
        tabRows: (season) => this.data.tabRows(season, this.position),
        seasonFile: (season, file) => this.data.extraFile(season, file),
        skills: () => overview.skills,
        addSkill: (skill: CardSkill) => {
          overview.skills = [...overview.skills.filter((s) => s.id !== skill.id), skill];
          redraw();
        },
        addFlags: (flags) => (overview.flags = [...overview.flags, ...flags]),
        setArchetype: (name) => {
          overview.archetype = name;
          overview.blockingArchetype = true;
          // (a "new profile" note compared archetypes worked out without it, so it no longer applies)
          overview.flags = overview.flags.filter((f) => !f.text.startsWith('New profile'));
        },
      });
    } catch (err) {
      console.error(err);
    }
  }
}

// A line per season someone's in (the card's Career tab and history, the compare view's arcs), ranked with
// the default sliders as the grid first shows each season (careers/<tab>.json for the finished seasons, this season from its rows: currentGrid), each headline stat's best finished season lit (lowest for a
// stat that counts against them; a few games into this season, a hot start would take it). Every tab of
// his career is in it (career-index.ts: LeBron's SG, SF, PF, PG and C seasons), each season ranked on the
// tab he played it on and marked with that tab (position, and his id there); the headline stats are the
// card's tab's, a season on another tab showing the ones it shares (by key), the rest "-". Oldest first,
// a season on two tabs (Taysom Hill's QB and TE) the card's tab first.
export async function careerLines(data: SeasonDataService, tableSeason: number, position: SkillPosition, id: string): Promise<CardSeason[]> {
  const { current, index } = await careerIndexFor(data, tableSeason);
  const headline = headlineStats(position);
  const tabs = index.career(position, id);
  const grid = tabs.some((t) => (current[t.position] ?? []).some((p) => p.gsisId === t.id)) ? await currentGrid(data, current) : null;
  const seasons = (
    await Promise.all(
      tabs.map(async ({ position: tab, id: tabId }) => {
        // (the tab's headline stats by the card's: where each of the card's is in the tab's, -1 if it hasn't it)
        const own = headlineStats(tab);
        const at = headline.map((stat) => own.findIndex((s) => s.key === stat.key));
        // (rank 0: an unranked season, UR)
        const line = (season: number, teamLogo: string, games: number, rank: number, of: number, stats: (number | null)[]): CardSeason => ({
          season,
          position: tab,
          id: tabId,
          // (the team's logo that season, and the team's own file: whiteLogo reads it)
          logo: logoForSeason(teamLogo, season),
          teamLogo,
          games,
          rank,
          of,
          pct: rank > 0 ? rankPct(rank, of) : 0,
          ...(rank > 0 ? {} : { ur: true }),
          stats: headline.map((stat, i) => {
            const value = at[i] < 0 ? null : (stats[at[i]] ?? null);
            return { text: totalText(stat, value), label: stat.label, value, share: 0, best: false };
          }),
        });
        const lines = ((await data.careers(tab))[tabId] ?? []).map(([season, logo, games, rank, of, stats]) => line(season, SPORT.teamLogo(logo), games, rank, of, stats));
        const now = (current[tab] ?? []).find((p) => p.gsisId === tabId);
        // (not ranked this season: played outside the list, UR)
        const unranked = now ? undefined : await data.unrankedRow(CURRENT_SEASON, tab, tabId);
        const context: ValueContext = { position: tab, settings: DEFAULT_SPORT_SETTINGS, rows: current, tableSeason: false, defaults: true };
        if (now) {
          // (as the grid first shows this season's tab: its own ranking at the default settings, the grades from
          // other tabs counted, as the careers' finished seasons are)
          const ranked = grid?.[tab] ?? [];
          const stats = own.map((stat) => statValue(now, stat, context));
          // (rank everyone: under the default Min Games, UR)
          const rank = ranked.indexOf(now) + 1;
          lines.push(line(CURRENT_SEASON, now.teamLogo, now.games, rank, rank ? ranked.length : 0, stats));
        } else if (unranked) {
          lines.push(line(CURRENT_SEASON, unranked.teamLogo, unranked.games, 0, 0, own.map((stat) => statValue(unranked, stat, context))));
        }
        return lines;
      }),
    )
  )
    .flat()
    .sort((a, b) => a.season - b.season || (b.position === position ? 1 : 0) - (a.position === position ? 1 : 0));
  // (a career best is a ranked season's: a handful of plays outside the list would take the rates)
  const finished = seasons.filter((s) => !isLiveSeason(s.season) && !s.ur);
  headline.forEach((stat, i) => {
    const done = finished.map((s) => s.stats[i].value).filter((v): v is number => v !== null);
    if (!seasons.some((s) => s.stats[i].value !== null)) return;
    const best = stat.negative ? Math.min(...done) : Math.max(...done);
    for (const s of seasons) {
      const v = s.stats[i].value;
      if (v !== null) s.stats[i].best = done.length > 1 && !isLiveSeason(s.season) && !s.ur && v === best;
    }
  });
  return seasons;
}

// Who played on which tabs (career-index.ts): the careers' names and this season's rows, ranked and not
async function careerIndexFor(data: SeasonDataService, tableSeason: number): Promise<{ current: Record<SkillPosition, SkillPlayer[]>; index: CareerIndex }> {
  const current = tableSeason === CURRENT_SEASON ? SKILL_UNITS : await data.rows(CURRENT_SEASON);
  const [names, unranked] = await Promise.all([
    SPORT.careerOnly ? ({} as CareerNames) : data.careerNames().catch(() => ({}) as CareerNames),
    data.unranked(CURRENT_SEASON).catch(() => ({})),
  ]);
  return { current, index: careerIndex(names, current, unranked) };
}

// His other careers, kept apart from this one (SPORT.careerGroup: Ohtani's pitching, from his hitting card):
// each one's name, the tab he played last there, his id and that season
export async function linkedCareers(
  data: SeasonDataService,
  tableSeason: number,
  position: SkillPosition,
  id: string,
): Promise<{ label: string; position: SkillPosition; id: string; season: number }[]> {
  if (!SPORT.careerGroup || SPORT.careerOnly) return [];
  const { index } = await careerIndexFor(data, tableSeason);
  return index.linked(position, id).map((e) => ({ label: e.group, position: e.position, id: e.id, season: e.last }));
}

// One line a season (the career arcs, the history's seasons): a season on two tabs (Taysom Hill's QB and
// TE) as the tab given has it, else the one he ranked better on
export function seasonByYear(lines: CardSeason[], position: SkillPosition): CardSeason[] {
  const out = new Map<number, CardSeason>();
  for (const l of lines) {
    const known = out.get(l.season);
    if (!known || (known.position !== position && (l.position === position || (!l.ur && (known.ur || l.pct > known.pct))))) out.set(l.season, l);
  }
  return [...out.values()].sort((a, b) => a.season - b.season);
}

// A headline stat on the Seasons tab: a season's total, formatted like the table ("4,183")
function totalText(stat: SkillStat, value: number | null): string {
  if (value === null) return '-';
  switch (stat.format) {
    case 'pct':
      return `${Math.round(value * 100)}%`;
    case 'pctPoints':
      return `${value.toFixed(1)}%`;
    case 'dec1':
      return value.toFixed(1);
    case 'dec2':
      return value.toFixed(2);
    case 'rank':
      return `#${value}`;
    default:
      return NUMBER.format(Math.round(value));
  }
}

