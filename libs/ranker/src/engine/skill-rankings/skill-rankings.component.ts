import { AfterViewInit, Component, DestroyRef, ElementRef, HostListener, Input, NgZone, OnChanges, ViewChild, inject } from '@angular/core';
import { quietListener } from '@ranker/core/quiet-listener';
import { MatMenuTrigger } from '@angular/material/menu';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import {
  SKILL_STATS,
  SkillPlayer,
  SkillPosition,
  SkillStat,
  SkillStatGroup,
  SkillWeights,
  StatGroupId,
  skillGroups,
} from '@sport/positions';
import { AWARD_INFO, AwardWin, awardsFor } from '@sport/awards';
import { SPORT } from '@sport/sport';
import { extras, rowTeamNames } from '@ranker/engine/row-fields';
import { logoForSeason } from '@sport/logo-eras';
import { TeamLook, teamLook } from '@ranker/engine/team-look';
import { SportSetting, SportSettings } from '@ranker/engine/sport';
import { PositionService, RankerSettings } from '@ranker/engine/position.service';
import { SeasonDataService } from '@ranker/engine/season-data.service';
import { CURRENT_SEASON, SEASONS, SeasonPart, dataPart, dataSeason, dataVersion, isLiveSeason } from '@ranker/engine/data';
import { SKILL_UNITS, emptyIn, recentCount, statIsEmpty } from '@ranker/engine/unit-scoring';
import { StatReader } from '@ranker/engine/stat-reader';
import { settingGroups, settingOptions, settingText, settingsAt } from '@ranker/engine/setting-options';
import { CardHost, PlayerCards } from '@ranker/engine/player-card/player-cards';
import { COMPARE_MAX, CompareHit, PlayerCompare } from '@ranker/engine/compare/player-compare';
import { GameViewService, recentRef } from '@ranker/engine/game-view/game-view.service';
import { SeasonContext } from '@ranker/engine/player-card/card.model';
import { copyRankingsToClipboard } from '@ranker/core/clipboard';
import { RANK_EVERYONE } from '@ranker/engine/playing-time';
import { homeTab, isPooled } from '@ranker/engine/pooled-tabs';
import type { LinkedCard } from '@ranker/engine/card-link';
import { RowGlide } from './row-glide';
import { boxWidth, columnWidth, watchColumns } from './column-fit';
import { TabRanker } from './tab-ranker';
import { RankWhy, rankWhy, scoreText, signedScore } from './rank-why';
import { scoreClass } from '@ranker/engine/result-class';
import { Breakdown, barWidths } from '@ranker/core/breakdown';
import { GradePart, GradeWhy, gradeText } from '@ranker/engine/grade-why';
import { grade, gradeColor, pctText } from '@ranker/core/format';
import { copyIsolatedShown, isolateRows, isolatedCopyText, isolatedTeam, lowerIsBetter, recentText, shownValue } from './isolate';
import { ListDraft } from '@ranker/engine/account/lists/lists.store';
import { draftTitle, gridDraft } from '@ranker/engine/account/lists/grid-draft';
import { listPath } from '@ranker/engine/account/lists/lists-helpers';
import { AccountService } from '@ranker/engine/account/account.service';
import { TeamFilterService, rowTeamName, teamOptions, teamPlaceText, teamRows } from '@ranker/engine/team-filter';

// (a card's link naming nobody in that season's rows)
const CARD_MISSING = "Couldn't find that player";

// A support grade's breakdown as its popover shows it (grade-why.ts): the row and the stat, the grade's
// letter and color, each part's bar (red under a C: it pulls the grade down) and weight, how the parts come
// together, the grade's place in this list and its slider here
interface GradeView extends GradeWhy {
  id: string;
  name: string;
  label: string;
  letter: string;
  color: string;
  parts: (GradePart & { width: number; hurts: boolean; weightText: string })[];
  combine: string;
  listPlace: string | null;
  slider: string | null;
}

// A tab's rankings: the button bar, then the grid (a row per player, best first by the sliders, or as
// dragged by hand), and the player card for a name clicked
@Component({
  selector: 'skill-rankings',
  templateUrl: './skill-rankings.component.html',
  // (the shared look: libs/ranker/src/styles/components, plus this sport's theme partial)
  styleUrls: ['../../styles/components/rankings.component.scss'],
  standalone: false,
})
export class SkillRankingsComponent implements OnChanges, AfterViewInit, CardHost {
  @ViewChild('rankingsList') rankingsList!: ElementRef<HTMLElement>;

  @Input({ required: true }) position!: SkillPosition;

  playerList: SkillPlayer[] = [];
  stats: SkillStat[] = [];
  // This position's stat groups, which are switched off (eye / header chip), and its slider weights
  groups: SkillStatGroup[] = [];
  hidden: Partial<Record<StatGroupId, boolean>> = {};
  weights: SkillWeights = {};

  // The year dropdown: every season we have, newest first
  readonly seasons = SEASONS;
  season = CURRENT_SEASON;
  seasonPart: SeasonPart = dataPart;
  seasonLoading = false;

  readonly sport = SPORT;
  readonly awardInfo = AWARD_INFO;
  readonly footerSettings = settingsAt('footer');
  readonly settingOptions = settingOptions;
  readonly settingGroups = settingGroups;

  // Bumped when the sport's values from other tabs change (the column averages are worked out again)
  private dataVersion = 0;

  // The table's values: this season's rows, ranked as the list shows
  readonly reader = new StatReader(this.tableSource());
  // ...and the UR rows': the same values, never colored or placed against the list
  readonly urReader = new StatReader(this.tableSource(true));

  // Rank everyone (RANK_EVERYONE: the NFL): the rows under Min Games, and those the season keeps apart (a
  // backup QB's), below the ranked ones as UR (TabRanker.unranked); the grid draws gridRows, the ranked
  // list then them
  unrankedList: SkillPlayer[] = [];
  private unrankedSet = new Set<SkillPlayer>();
  gridRows: SkillPlayer[] = [];
  // (with a team picked in the settings' Teams Included: just its rows, the ranked ones the first rankedShown;
  // each ranked row's place in the whole list, its league rank, in leagueIndex)
  rankedShown = 0;
  private leagueIndex = new Map<SkillPlayer, number>();
  readonly teams = inject(TeamFilterService);
  private apart: SkillPlayer[] = [];
  private apartFor = '';
  private unrankedAsk = 0;

  // How the list is made (the filters, the sliders, the columns), from the table's tab as it is now (one
  // object, read through: the ranker asks for it for every cell)
  private readonly ranker: TabRanker;
  private readonly tabState = ((table: SkillRankingsComponent) => ({
    get position() {
      return table.position;
    },
    get stats() {
      return table.stats;
    },
    get groups() {
      return table.groups;
    },
    get hidden() {
      return table.hidden;
    },
    get weights() {
      return table.weights;
    },
  }))(this);

  // The player card (a name clicked)
  readonly cards: PlayerCards;

  // The compare view, and the rows picked for it (a click on a row, off its name and links), in the
  // order they were picked
  readonly compare: PlayerCompare;
  picked: string[] = [];
  private dragEnded = 0;

  // The search (the picks' button with nobody picked): the compare view's search, a copy of its own (what's
  // typed here isn't the view's), open in the button bar or not
  readonly finder: PlayerCompare;
  finding = false;
  @ViewChild('findBox') findBox?: ElementRef<HTMLInputElement>;
  @ViewChild('toolButton') toolButton?: ElementRef<HTMLButtonElement>;

  private readonly glide = new RowGlide();
  // (the columns' widths from the header's labels, kept up as it changes: column-fit.ts; the page-wide
  // listeners: quietListener)
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  // "List copied" under the copy button (and a link's note: CARD_MISSING)
  toastVisible = false;
  toastText = '';
  toastAt: { top: number; left: number | null; right: number | null } = { top: 0, left: 0, right: null };
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private positionService: PositionService,
    private seasonData: SeasonDataService,
    readonly games: GameViewService,
  ) {
    this.ranker = new TabRanker(
      positionService,
      seasonData,
      () => this.tabState,
      () => this.position && this.sortPlayers(),
    );
    this.cards = new PlayerCards(this, seasonData);
    this.compare = new PlayerCompare(this, seasonData);
    this.finder = new PlayerCompare(this, seasonData);
    // (the game view's names and teams open cards)
    this.cards.connectGames(games);
    const service = this.positionService;

    // (a click anywhere: outside Angular unless a breakdown or the search is open to shut)
    quietListener<MouseEvent>(this.zone, this.destroyRef, document, 'click', () => !!(this.why || this.gradeWhy || this.finding), (event) => this.clickOff(event));
    // (the search box in focus: its names worked out at idle, ahead of the first letter; outside Angular)
    const warm = (event: FocusEvent) => event.target === this.findBox?.nativeElement && this.finder.warm();
    this.zone.runOutsideAngular(() => document.addEventListener('focusin', warm));
    this.destroyRef.onDestroy(() => document.removeEventListener('focusin', warm));
    // (the toasts' timers, let go with the page)
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.toastTimer);
      clearTimeout(this.savedTimer);
    });

    // Re-rank when the sliders, the group eyes, the settings menu or the stat eyes change (each one, a preset
    // too, ending an isolated look: back to the ranking)
    service.weights$.pipe(takeUntilDestroyed()).subscribe((weights) => {
      if (!this.position) return;
      this.leaveIsolation();
      this.weights = weights[this.position];
      this.sortPlayers();
    });
    service.skillHidden$.pipe(takeUntilDestroyed()).subscribe((hidden) => {
      if (!this.position) return;
      this.leaveIsolation();
      this.hidden = hidden[this.position] ?? {};
      this.sortPlayers();
    });
    service.settings$.pipe(takeUntilDestroyed()).subscribe(() => this.position && (this.leaveIsolation(), this.sortPlayers()));
    service.statHidden$.pipe(takeUntilDestroyed()).subscribe(() => this.position && (this.leaveIsolation(), this.sortPlayers()));

    // Another season from the year dropdown (or its playoffs, Length): its rows from the top, in
    // that season's order for this tab (dragged or not) if it has one, otherwise sorted by the sliders
    service.season$.pipe(takeUntilDestroyed()).subscribe((season) => {
      const changed = season !== this.season || service.seasonPart !== this.seasonPart;
      this.season = season;
      this.seasonPart = service.seasonPart;
      if (changed) this.picked = [];
      if (changed && this.position) this.ngOnChanges();
    });
    service.seasonLoading$.pipe(takeUntilDestroyed()).subscribe((loading) => (this.seasonLoading = loading));
    // (a team picked or let go: the same list, more or fewer of its rows shown, and Compare's picks
    // just the rows still shown; a capped tab, the Top 50, lists its whole ranking for a team, so the
    // team's rows past the cap show too, each with its league rank)
    this.teams.changed$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.closeWhy();
      this.leaveIsolation();
      if (this.position && SPORT.listLimit?.(this.position)) this.relist();
      else this.showUnranked(this.unrankedList);
      const shown = new Set(this.gridRows.map((p) => p.gsisId));
      this.picked = this.picked.filter((id) => shown.has(id));
    });

    // The sport's values from other tabs changed (SPORT.connect: the NFL's team grades): they show,
    // and the list re-sorts unless it was dragged by hand (then just its scores, for the rank tiles)
    service.sportChanged$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.dataVersion++;
      if (!this.position) return;
      if (!this.positionService.unitOrder(this.position)?.manual) this.sortPlayers();
      else {
        this.closeWhy();
        this.totals = this.scoreTotals(this.ranker.listed(SKILL_UNITS, this.season, this.position));
        this.listUnranked();
      }
    });
  }

  ngAfterViewInit(): void {
    const stop = this.zone.runOutsideAngular(() => watchColumns(this.rankingsList.nativeElement));
    this.destroyRef.onDestroy(stop);
    // (the list scrolling: a breakdown open over it shuts; otherwise nothing to do, so no change detection
    // for every scroll event)
    quietListener(this.zone, this.destroyRef, this.rankingsList.nativeElement, 'scroll', () => !!(this.why || this.gradeWhy), () => this.listMoved(), { passive: true });
  }

  ngOnChanges(): void {
    // (picks are a tab's own, and so is an open breakdown)
    this.picked = [];
    this.closeWhy();
    // (and isolation: a look at one tab's list)
    if (this.isolatedKey) {
      this.isolatedKey = null;
      this.isoStat = null;
      this.sayIso('Back to the ranking');
    }
    // A new tab starts scrolled to the top-left of its list
    this.rankingsList?.nativeElement.scrollTo({ top: 0, left: 0 });
    this.stats = SKILL_STATS[this.position];
    this.groups = skillGroups(this.position);
    this.hidden = this.positionService.skillHiddenGroups(this.position);
    this.weights = this.positionService.getWeights(this.position);
    // A hand-dragged order comes back as it was; otherwise sorted by the sliders
    const saved = this.positionService.unitOrder(this.position);
    if (saved?.manual) this.restoreOrder(saved.ids);
    else this.sortPlayers();
    // (a card a link asked for: open on its tab, once; one naming nobody this season: a note saying so)
    const card = this.positionService.takePendingCard(this.position);
    if (card) void this.openSharedCard(card);
    if (this.positionService.takeCardMissing()) this.note(CARD_MISSING);
    // (a game a link asked for: open on its tab, once)
    const game = this.positionService.takePendingGame();
    if (game) void this.games.open({ event: game.event }, game.tab);
    // (a comparison a link asked for: open over whichever tab, once)
    const shared = this.positionService.takePendingCompare();
    if (shared) this.compare.openLinked(shared);
  }

  get settings(): RankerSettings {
    return this.positionService.settings;
  }

  get sportSettings(): SportSettings {
    return this.settings.sport;
  }

  get colorValues(): boolean {
    return this.settings.colorValues;
  }

  get categoryColors(): boolean {
    return this.settings.categoryColors;
  }

  // ---------------------------------------------------------------------------
  // The list: who's in it, and their order
  // ---------------------------------------------------------------------------
  // Sort by the sliders (weighted totals of every stat that counts), then head-to-head among ties
  sortPlayers(): void {
    const from = this.glide.measure(this.rankingsList?.nativeElement);
    this.closeWhy();
    const { ranked, totals } = this.ranker.rankedTotals(this.reader, this.ranker.listed(SKILL_UNITS, this.season, this.position), this.position, SKILL_UNITS);
    this.playerList = this.limited(this.shown(ranked));
    this.totals = totals;
    this.listUnranked();
    this.publishOrder(false);
    this.glide.play(() => this.rankingsList?.nativeElement, from);
  }

  // A row dragged to another place: the order is kept, by hand, until the tab re-sorts
  drop(event: CdkDragDrop<string[]>): void {
    this.closeWhy();
    // (the ranked rows only: an unranked row doesn't drag, and none goes below them)
    moveItemInArray(this.playerList, event.previousIndex, Math.min(event.currentIndex, this.playerList.length - 1));
    this.showUnranked(this.unrankedList);
    this.publishOrder(true);
  }

  // Put the list back in a saved order (players that have since appeared go at the end). A capped tab (the
  // Top 50) saved only the rows showing, so the rest follow in the sliders' order, under them (Show all
  // after a drag: the dragged top, then everyone else as ranked, not in the file's order)
  private restoreOrder(ids: string[]): void {
    const listed = this.ranker.listed(SKILL_UNITS, this.season, this.position);
    let ranked: SkillPlayer[] | undefined;
    if (SPORT.listLimit?.(this.position)) ({ ranked, totals: this.totals } = this.ranker.rankedTotals(this.reader, listed, this.position, SKILL_UNITS));
    else this.totals = this.scoreTotals(listed);
    this.playerList = this.limited(this.ranker.inOrder(this.shown(listed), ids, ranked));
    this.listUnranked();
  }

  // The UR rows under the list (rank everyone): the tab's rows under Min Games at once, then those the
  // season keeps apart when their file comes (loaded when first asked for, kept for the same season and tab)
  private listUnranked(): void {
    const ask = ++this.unrankedAsk;
    if (!RANK_EVERYONE) {
      this.showUnranked([]);
      return;
    }
    const { season, position } = this;
    const key = `${season}.${this.seasonPart}.${position}`;
    const list = (apart: SkillPlayer[]) => this.shown(this.ranker.unranked(this.reader, apart, season, position, SKILL_UNITS));
    this.showUnranked(list(this.apartFor === key ? this.apart : []));
    if (this.apartFor === key) return;
    this.seasonData
      .unranked(season)
      .then((tabs) => {
        if (ask !== this.unrankedAsk) return;
        this.apartFor = key;
        this.apart = tabs[position] ?? [];
        if (this.apart.length) this.showUnranked(list(this.apart));
      })
      .catch((err) => console.error(err));
  }

  private showUnranked(list: SkillPlayer[]): void {
    this.unrankedList = list;
    this.unrankedSet = new Set(list);
    // (the teams in the list for the settings' Teams Included, then the picked one's rows: the ranking
    // stays the whole list's, each row its league rank; a capped tab offers every team it ranks, not
    // just those in its top rows)
    this.teams.offer(teamOptions([...this.rankedAll, ...list], (row) => this.teamNameOf(row)));
    const shown = teamRows(this.playerList, list, this.teams.team);
    this.formalRows = shown.rows;
    this.rankedShown = shown.ranked;
    this.leagueIndex = shown.leagueIndex;
    // (a header clicked: the rows shown in that stat's order instead)
    this.applyIsolation();
  }

  // ---------------------------------------------------------------------------
  // Isolation: a header clicked (or Enter / Space on it) sorts the rows shown by that stat alone, best
  // first, the other columns dimmed: a look, not a ranking (the sliders, scores, saved order, cards and
  // links don't move). The same header again, Esc or the chip's X goes back; another header switches to
  // it; a new tab or season, or the column going away, ends it.
  // ---------------------------------------------------------------------------
  isolatedKey: string | null = null;
  isoStat: SkillStat | null = null;
  // (its direction flipped by the arrow beside its header: worst first)
  isoReversed = false;
  // (each ranked row's place by the stat: the rank tile's number while it lasts)
  private isoPlaces: Map<SkillPlayer, number | null> | null = null;
  // (the rows shown in the list's order, before isolation)
  private formalRows: SkillPlayer[] = [];
  // (said to screen readers as it starts and ends)
  isoNote = '';

  // (emptied first, then said on the next tick: the same words twice running are still announced)
  private sayIso(note: string): void {
    this.isoNote = '';
    setTimeout(() => (this.isoNote = note));
  }

  // A column that can be sorted by: one with values this season (a season from before it was kept has none)
  canIsolate(stat: SkillStat): boolean {
    return this.reader.hasValues(stat);
  }

  private applyIsolation(): void {
    const stat = this.isolatedKey ? this.shownStat(this.isolatedKey) : null;
    if (this.isolatedKey && !stat) {
      this.isolatedKey = null;
      this.sayIso('Back to the ranking');
    }
    this.isoStat = stat;
    if (!stat) {
      this.gridRows = this.formalRows;
      this.isoPlaces = null;
      return;
    }
    // (on what the column shows: with Show Ranks, its places, which go by the per-game rate)
    const sorted = isolateRows(this.formalRows, this.rankedShown, (row, ur) => shownValue(ur ? this.urReader : this.reader, row, stat), lowerIsBetter(stat) !== this.isoReversed);
    this.gridRows = sorted.rows;
    this.isoPlaces = sorted.places;
  }

  // A column the grid shows now (not in a collapsed group), by its key
  private shownStat(key: string): SkillStat | null {
    for (const group of this.visibleGroups) {
      if (this.isCollapsed(group.id)) continue;
      const stat = group.stats.find((s) => s.key === key);
      if (stat) return stat;
    }
    return null;
  }

  // A header clicked (a press, not a drag: a drag never clicks): that stat alone, or back if it's the one
  isolate(stat: SkillStat, event: Event): void {
    // (the group's icon in the cell collapses the group instead)
    if ((event.target as Element | null)?.closest('.group-icon, .isolate-tools')) return;
    event.preventDefault();
    if (this.isolatedKey === stat.key) {
      this.endIsolation();
      return;
    }
    if (!this.reader.hasValues(stat)) return;
    this.closeWhy();
    this.isolatedKey = stat.key;
    this.isoReversed = false;
    this.sayIso(`Sorted by ${this.reader.name(stat)} only, ${lowerIsBetter(stat) ? 'lowest' : 'highest'} first. The ranking is unchanged; Escape goes back`);
    // (from the top, the best by it in view; the rows glide when the list is there already)
    const list = this.rankingsList?.nativeElement;
    const from = list?.scrollTop ? null : this.glide.measure(list);
    list?.scrollTo({ top: 0, left: list.scrollLeft });
    this.applyIsolation();
    this.glide.play(() => this.rankingsList?.nativeElement, from);
  }

  // The arrow beside the isolated header: the other way round (best first, or worst first), the places with it
  flipIsoDir(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    if (!this.isoStat) return;
    this.closeWhy();
    const from = this.glide.measure(this.rankingsList?.nativeElement);
    this.isoReversed = !this.isoReversed;
    this.sayIso(`${this.isoAscending ? 'Lowest' : 'Highest'} first`);
    this.applyIsolation();
    this.glide.play(() => this.rankingsList?.nativeElement, from);
  }

  // (the values running up the list: lowest first)
  get isoAscending(): boolean {
    return !!this.isoStat && lowerIsBetter(this.isoStat) !== this.isoReversed;
  }

  isoDirTitle(): string {
    return `${this.isoAscending ? 'Lowest' : 'Highest'} first (${this.isoReversed ? 'worst' : 'best'} first): click for ${this.isoAscending ? 'highest' : 'lowest'} first`;
  }

  // (a filter or setting changed while isolated: back to the ranking at once, the list re-sorting anyway)
  private leaveIsolation(): void {
    if (!this.isolatedKey) return;
    this.isolatedKey = null;
    this.sayIso('Back to the ranking');
  }

  // Back to the ranking (refocus: the list takes focus, the chip's X having gone)
  endIsolation(refocus = false): void {
    if (!this.isolatedKey) return;
    this.closeWhy();
    const from = this.glide.measure(this.rankingsList?.nativeElement);
    this.isolatedKey = null;
    this.sayIso('Back to the ranking');
    this.applyIsolation();
    this.glide.play(() => this.rankingsList?.nativeElement, from);
    if (refocus) this.rankingsList?.nativeElement.focus({ preventScroll: true });
  }

  // A header's name for screen readers: what a press does
  isoLabel(stat: SkillStat): string {
    const name = this.reader.name(stat);
    return this.isolatedKey === stat.key ? `Sorted by ${name} only: press to go back to the ranking` : `Sort by ${name} only`;
  }

  // A ranked row's place by the isolated stat (null: no value)
  isoPlace(player: SkillPlayer): number | null {
    return this.isoPlaces?.get(player) ?? null;
  }

  // A row's team by name (a team tab's row is its team)
  private teamNameOf(row: SkillPlayer): string | null {
    return rowTeamName(row, SKILL_UNITS) ?? (SPORT.teamTabs?.includes(this.position) ? row.name : null);
  }

  // A ranked row's place in the whole list (0 the first), shown or not
  leagueAt(player: SkillPlayer, index: number): number {
    return this.leagueIndex.get(player) ?? index;
  }

  // (dragging by hand needs the whole list: not while one team's rows show)
  get teamPicked(): boolean {
    return !!this.teams.team;
  }

  // A UR row: under Min Games, or kept apart by the season
  isUr(player: SkillPlayer): boolean {
    return this.unrankedSet.has(player);
  }

  // (every row's score as the sliders have it, for a list in an order dragged by hand: the rank tiles' hovers)
  private scoreTotals(listed: SkillPlayer[]): Map<SkillPlayer, number> {
    return this.ranker.scores(this.reader, listed, this.position, SKILL_UNITS).totals;
  }

  // Remember this tab's order for when you come back
  private publishOrder(manual: boolean): void {
    this.positionService.setUnitOrder(this.position, this.playerList.map((player) => player.gsisId), manual);
  }

  // The ranked rows the sport's view-only filter keeps (SPORT.rowShown)
  private shown(list: SkillPlayer[]): SkillPlayer[] {
    const show = SPORT.rowShown;
    return show ? list.filter((player) => show(player, this.sportSettings)) : list;
  }

  // The tab's top rows only, when the sport caps it (SPORT.listLimit), after the ranking: the cut never moves
  // the order or what each stat is measured against. A pooled tab (the Top 50) can show them all (its Show
  // all row: the whole ranking, a line under its last place); with a team picked the whole ranking is
  // listed, the team's rows shown from it
  private limited(list: SkillPlayer[]): SkillPlayer[] {
    this.rankedCount = list.length;
    this.rankedAll = list;
    const limit = SPORT.listLimit?.(this.position);
    return limit && !this.showsAll && !this.teams.team ? list.slice(0, limit) : list;
  }

  // (the ranked rows before the cap: Show all's count, and where the bottom ten start; and the rows
  // themselves, for Teams Included's teams)
  rankedCount = 0;
  private rankedAll: SkillPlayer[] = [];

  // A pooled tab's cap (the Top 50's 50), when its ranking is longer: the Show all row, and the line
  // under its last place while they all show (none with a team picked: its rows all show)
  get listCap(): number | null {
    if (this.teams.team) return null;
    const limit = isPooled(this.position) ? SPORT.listLimit?.(this.position) : undefined;
    return limit && this.rankedCount > limit ? limit : null;
  }

  get showsAll(): boolean {
    return isPooled(this.position) && this.positionService.showsAll(this.position);
  }

  // Show all, or back to the top rows (for the visit; the list keeps its order, dragged or sorted)
  toggleShowAll(): void {
    this.closeWhy();
    this.positionService.setShowAll(this.position, !this.showsAll);
    this.relist();
  }

  // (the list again, its cap as it stands: in the order dragged by hand, or sorted by the sliders)
  private relist(): void {
    const saved = this.positionService.unitOrder(this.position);
    if (saved?.manual) this.restoreOrder(saved.ids);
    else this.sortPlayers();
  }

  // The row the cap falls under while they all show (its league place the cap's last; not isolated, nor
  // one team's rows)
  pastCut(n: number, ur: boolean): boolean {
    const cap = this.listCap;
    return !!cap && this.showsAll && !ur && !this.isoStat && !this.teams.team && n === cap - 1;
  }

  // ---------------------------------------------------------------------------
  // The columns
  // ---------------------------------------------------------------------------
  // The groups shown in the grid, in the order of the sidebar's cards, each with its stats that have a
  // column (in their dragged order)
  get visibleGroups(): SkillStatGroup[] {
    const { groups, spots } = this.ranker.shownGroups(this.reader, this.position);
    Object.assign(this.combinedSpot, spots);
    return groups;
  }

  shownGroups(reader: StatReader, position = this.position): SkillStatGroup[] {
    return this.ranker.shownGroups(reader, position).groups;
  }

  // Which stat's spot each combined column took (header dragging moves it as that stat)
  private combinedSpot: Partial<Record<string, string>> = {};

  columnId(stat: SkillStat): string {
    return this.combinedSpot[stat.key] ?? stat.key;
  }

  // ---------------------------------------------------------------------------
  // Reading the stats (StatReader): the table's season, or another one for the player card
  // ---------------------------------------------------------------------------
  private tableSource(unranked = false) {
    const table = this;
    // (the UR rows' reader: Color-Coded Values and Show As Ranks off, the same object until the
    // settings change)
    let plain: { from: RankerSettings; settings: RankerSettings } | null = null;
    return {
      get position() {
        return table.position;
      },
      get settings() {
        if (!unranked) return table.settings;
        if (plain?.from !== table.settings) plain = { from: table.settings, settings: { ...table.settings, colorValues: false, showRanks: false } };
        return plain.settings;
      },
      get rows() {
        return SKILL_UNITS;
      },
      get list() {
        return table.playerList;
      },
      get version() {
        return table.dataVersion;
      },
      get season() {
        return table.season;
      },
      get weights() {
        return table.ranker.mixWeights(table.position);
      },
      tableSeason: true,
      empty: (key: string) => statIsEmpty(table.position, key),
    };
  }

  readerFor(context: SeasonContext | null): StatReader {
    if (!context) return this.reader;
    const table = this;
    const position = context.position ?? this.position;
    return new StatReader({
      position,
      settings: this.settings,
      rows: context.rows,
      list: context.list,
      tableSeason: false,
      season: context.season,
      empty: context.empty,
      get weights() {
        return table.ranker.mixWeights(position);
      },
    });
  }

  // Another season's list: the same filters as the table, ranked with the current sliders (or as
  // dragged by hand this visit)
  seasonContext(season: number, rows: Record<SkillPosition, SkillPlayer[]>, position = this.position): SeasonContext {
    const units = rows[position];
    const context: SeasonContext = {
      season,
      rows,
      list: [],
      empty: (key) => emptyIn(units, key),
      ...(position !== this.position && { position }),
      min: this.ranker.minFor({ [position]: units }, position),
    };
    const listed = this.ranker.listed({ [position]: units }, season, position);
    const saved = this.positionService.seasonUnitOrder(season, position);
    if (saved?.manual) {
      context.list = this.ranker.inOrder(listed, saved.ids);
      context.manual = true;
    } else {
      context.list = this.rankedIn(context, listed);
    }
    return context;
  }

  rankedIn(context: SeasonContext, players: SkillPlayer[]): SkillPlayer[] {
    return this.ranker.ranked(this.readerFor(context), players, context.position ?? this.position, context.rows);
  }

  // ---------------------------------------------------------------------------
  // The grid's cells
  // ---------------------------------------------------------------------------
  // The name column's header
  get rowHeader(): string {
    return SPORT.rowHeader?.(this.position) ?? 'Player';
  }

  // Gold for #1 (the rank-first class, with the trophy), green for 2-10 (rank-top), red for the bottom 10
  // (rank-bottom), white for the rest
  rankClasses(i: number): string {
    if (i === 0) return 'count rank-first';
    // (the top 10 keep their green if the list is ever that short)
    if (i < 10) return 'count rank-top';
    // (a pooled tab's: the whole ranking's bottom ten, none among its top 50)
    if (i >= (isPooled(this.position) ? this.rankedCount : this.playerList.length) - 10) return 'count rank-bottom';
    return 'count';
  }

  // Header hover: the stat written out, plus the list average of what the column shows, and what a click does
  // (can: false, no values to sort by, so no click to offer)
  labelTitle(stat: SkillStat, can = true): string {
    const name = this.reader.name(stat);
    const avg = this.reader.averageText(stat);
    if (!can) return avg === null ? name : `${name} (Avg: ${avg})`;
    const click = this.isolatedKey === stat.key ? 'Click to go back to the ranking (Esc)' : 'Click to sort by it alone';
    return `${avg === null ? name : `${name} (Avg: ${avg})`}\n${click}`;
  }

  // A column's width, the header's and every row's alike: at least its label's (column-fit.ts)
  readonly columnWidth = (stat: SkillStat) => columnWidth(stat.key);
  readonly boxWidth = (group: SkillStatGroup) => boxWidth(group.id, group.stats.length);

  // A header label split before its parenthetical ("HR" + "(162G)"), which shows smaller
  labelParts(stat: SkillStat): [string, string | null] {
    const label = this.reader.label(stat);
    const match = label.match(/^(.*?)\s*(\([^()]*\))$/);
    return match ? [match[1], match[2]] : [label, null];
  }

  // Row hover (the label invisibly covers its value): "[value] [stat name]"
  valueTitle(player: SkillPlayer, stat: SkillStat): string {
    const name = this.reader.name(stat);
    const value = this.reader.format(player, stat);
    return value === '-' ? name : `${value} ${name}`;
  }

  // A Recent dot: its game (the row's team's nth meeting with that opponent, newest first)
  openRecent(player: SkillPlayer, index: number, event: Event): void {
    if (!this.games.available) return;
    const vs = extras(player).lastFiveVs;
    const ref = recentRef(this.recentTeam(player), vs, index, this.season);
    if (!ref) return;
    event.stopPropagation();
    this.games.open(ref);
  }

  // A row's card (a click in the grid: a fresh start, no game to go back to)
  openCard(player: SkillPlayer): void {
    this.games.backTo = null;
    // (a pooled tab's row, the Top 50's: his card on his own tab, the arrows walking this list)
    if (isPooled(this.position)) {
      void this.cards.openFromPool(player, this.playerList);
      return;
    }
    // (an unranked row: his unranked card, as a search or a link opens it)
    if (this.isUr(player)) void this.cards.openLinked({ position: this.position, gsisId: player.gsisId }, this.season);
    else this.cards.open(player);
  }

  // ---------------------------------------------------------------------------
  // The breakdowns (core/breakdown.ts, one look with the Bets page's): why a row ranks where it does (its
  // rank tile clicked, or Enter / Space on it), and what makes a support grade (its cell). One open at a time.
  // ---------------------------------------------------------------------------
  @ViewChild('whyPop') whyPop?: ElementRef<HTMLElement>;
  @ViewChild('gradePop') gradePop?: ElementRef<HTMLElement>;
  private readonly rankPop = new Breakdown<RankWhy & { ur?: boolean }>(() => this.whyPop?.nativeElement);
  private readonly gradePopover = new Breakdown<GradeView>(() => this.gradePop?.nativeElement);
  get why() {
    return this.rankPop.shown;
  }
  get gradeWhy() {
    return this.gradePopover.shown;
  }
  readonly signedScore = signedScore;
  // (a recent game's class in the last five: .won, .lost, .tied)
  readonly scoreClass = scoreClass;
  // (every row's score, as the list last scored it: the rank tile's hover)
  private totals = new Map<SkillPlayer, number>();

  // The rank tile's hover: its place and its score ("Rank 1 · Score 21.04"), or with a team picked its
  // place on the team too ("2nd on the Buffalo Bills · #14 in the league · Score 8.12"). index: in the
  // whole list; shownIndex: in the rows shown
  rankTitle(player: SkillPlayer, index: number, shownIndex = index): string {
    if (this.isUr(player)) return 'Unranked (UR): under the Min Games setting';
    const total = this.totals.get(player);
    // (isolated: its place by the stat, then the ranking's)
    if (this.isoStat) {
      const name = this.reader.name(this.isoStat);
      const place = this.isoPlace(player);
      return `${place === null ? `No ${name}` : `#${place} by ${name}`} · #${index + 1} overall${total === undefined ? '' : ` · Score ${scoreText(total)}`}`;
    }
    const team = this.teams.team && this.teams.teamName;
    const place = team ? teamPlaceText(shownIndex + 1, index + 1, team) : `Rank ${index + 1}`;
    return `${place}${total === undefined ? '' : ` · Score ${scoreText(total)}`}`;
  }

  toggleWhy(player: SkillPlayer, index: number, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.rankPop.isOpen(player.gsisId)) {
      this.closeWhy(true);
      return;
    }
    this.closeWhy();
    // (an unranked row: no score or place, just what UR means)
    const ur = this.isUr(player);
    const empty: RankWhy = { id: player.gsisId, name: player.name, rank: 0, of: this.playerList.length, score: 0, scoreRank: 0, manual: false, movedByHeadToHead: false, parts: [], vs: [] };
    // (the list's own scoring, each stat's share kept: the same rows, sliders and filters as sortPlayers)
    const why = ur ? empty : this.rankedWhy(index);
    // (hung under the tile, or over it when there's more room above: its list of stats scrolls)
    this.rankPop.open({ ...why, ur }, event.currentTarget as HTMLElement);
  }

  private rankedWhy(index: number): RankWhy {
    const parts = new Map<SkillPlayer, Map<string, number>>();
    const listed = this.ranker.listed(SKILL_UNITS, this.season, this.position);
    const strengths = new Map<string, number>();
    const { totals, counted, weights } = this.ranker.scores(this.reader, listed, this.position, SKILL_UNITS, parts, strengths);
    const manual = !!this.positionService.unitOrder(this.position)?.manual;
    return rankWhy(this.playerList, index, { totals, counted, parts, weights, strengths }, this.reader, { manual, settings: this.sportSettings });
  }

  // A support grade's cell: its hover says it opens, a click (or Enter / Space) opens what makes it
  gradeTitle(player: SkillPlayer, stat: SkillStat): string {
    return `${this.valueTitle(player, stat)} · click for what makes this grade`;
  }

  toggleGrade(player: SkillPlayer, stat: SkillStat, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const id = `${player.gsisId}|${stat.key}`;
    if (this.gradePopover.isOpen(id)) {
      this.closeWhy(true);
      return;
    }
    const view = this.gradeView(player, stat, id);
    if (!view) return;
    this.closeWhy();
    this.gradePopover.open(view, event.currentTarget as HTMLElement);
  }

  isGradeOpen(player: SkillPlayer, stat: SkillStat): boolean {
    return this.gradePopover.isOpen(`${player.gsisId}|${stat.key}`);
  }

  // A grade's breakdown as the popover shows it: the sport's (SPORT.gradeWhy: its inputs, weights and
  // curve), or without one (inputs not kept for that season) its place in this list; then its slider here
  private gradeView(player: SkillPlayer, stat: SkillStat, id: string): GradeView | null {
    const shown = this.reader.value(player, stat);
    if (shown === null) return null;
    const why: GradeWhy = SPORT.gradeWhy?.(player, stat, shown, this.reader.valueContext()) ?? {
      grade: shown,
      score: shown,
      parts: [],
      curve: null,
      facts: [],
      notes: ["This season's file doesn't carry the inputs behind this grade (each data update writes them from now on): its place in this list is what there is"],
      foot: stat.description,
    };
    const place = this.reader.listRank(player, stat);
    const weight = this.weights?.[stat.key as keyof SkillWeights];
    // (a support grade counts at a fifth of a stat's strength, against him: more help, less credit; or for
    // him, supportHelps)
    const slider = weight === undefined ? null : weight ? `${Math.round(weight)}%, ${stat.supportHelps ? 'for him' : 'against him'}` : '0%: not counted';
    const curve = why.curve;
    return {
      ...why,
      id,
      name: player.name,
      label: this.reader.label(stat),
      letter: grade(why.grade),
      color: gradeColor(why.grade),
      parts: barWidths(why.parts).map((part) => ({ ...part, hurts: part.grade < 6, weightText: pctText(part.weight) })),
      // (how they come together: the parts' score, then the curve or straight to the grade)
      combine:
        curve?.on === 'score'
          ? `${why.score.toFixed(2)}, #${curve.rank} of ${curve.of} ${curve.among}: ${gradeText(why.grade)}`
          : `${why.score.toFixed(2)}: ${gradeText(why.grade)}`,
      listPlace: place ? `#${place.rank}${place.tied ? ' (tied)' : ''} of ${this.playerList.length}` : null,
      slider,
    };
  }

  closeWhy(refocus = false): void {
    this.rankPop.close(refocus);
    this.gradePopover.close(refocus);
  }

  // (a click anywhere off it and its tile shuts it; so does the list scrolling out from under it: listened for
  // in the constructor and ngAfterViewInit, quietListener. The window resizing stays a HostListener: its change
  // detection is the one that moves the page between its phone and wide layouts, app.component's menuOpen)
  clickOff(event: MouseEvent): void {
    const target = event.target as Element | null;
    if (this.why && !target?.closest('.rank-why, .rank-tile')) this.rankPop.close();
    if (this.gradeWhy && !target?.closest('.grade-why, .grade-tile')) this.gradePopover.close();
    // (and the search, folded back into its button: what's typed is kept for the next time)
    if (this.finding && !target?.closest('.find-bar, .compare-toggle')) this.finding = false;
  }

  @HostListener('window:resize')
  listMoved(): void {
    this.closeWhy();
  }

  // The score as the list went by: "1.23"
  readonly scoreText = scoreText;

  // ---------------------------------------------------------------------------
  // Compare: rows picked in the grid, then the button
  // ---------------------------------------------------------------------------
  // A click on a row, anywhere but its name, its badge and its links (a drag just let go isn't one, nor a
  // click that ends a text selection): picked, or unpicked
  pickRow(player: SkillPlayer, event: MouseEvent): void {
    const target = event.target as Element | null;
    if (target?.closest('.card-target, .rank-tile, .grade-tile, .last-five, .drag-indicator, .group-icon, button, a')) return;
    if (Date.now() - this.dragEnded < 300 || getSelection()?.toString()) return;
    this.togglePick(player, event.currentTarget as HTMLElement);
  }

  // ...or C with the row's name in focus (Enter and Space still open the card), said under the name
  pickKey(player: SkillPlayer, event: KeyboardEvent): void {
    if (event.key.toLowerCase() !== 'c' || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    const name = event.target as HTMLElement;
    const picked = this.togglePick(player, name);
    if (picked !== null) this.toast(name, picked ? `Picked for Compare (${this.picked.length} of ${COMPARE_MAX})` : 'Unpicked');
  }

  // (picked: true, unpicked: false, a fifth turned away: null)
  private togglePick(player: SkillPlayer, anchor: HTMLElement): boolean | null {
    const at = this.picked.indexOf(player.gsisId);
    if (at >= 0) this.picked.splice(at, 1);
    else if (this.picked.length >= COMPARE_MAX) {
      this.toast(anchor, `Compare up to ${COMPARE_MAX} at a time`);
      return null;
    } else this.picked.push(player.gsisId);
    // (the search folds away with any pick, so it never comes back on its own when the picks reach none)
    this.finding = false;
    return at < 0;
  }

  // Escape with nothing open over the grid lets go of the picks
  @HostListener('document:keydown.escape', ['$event'])
  clearPicks(event: Event): void {
    // (an open breakdown shuts first, focus back on its tile)
    if (this.why || this.gradeWhy) {
      this.closeWhy(true);
      return;
    }
    // (then isolation, back to the ranking; the picks stay for the next Escape)
    if (this.isolatedKey && !event.defaultPrevented && !document.querySelector('[aria-modal="true"], .cdk-overlay-pane, [role=dialog]')) {
      this.endIsolation();
      return;
    }
    if (!this.picked.length || event.defaultPrevented || document.querySelector('[aria-modal="true"], .cdk-overlay-pane')) return;
    this.picked = [];
  }

  rowDropped(): void {
    this.dragEnded = Date.now();
  }

  // The picks compared (then let go)
  openCompare(): void {
    const picks = this.picked.map((id) => this.gridRows.find((p) => p.gsisId === id)).filter((p): p is SkillPlayer => !!p);
    this.picked = [];
    this.compare.start(picks);
  }

  // The button left of Save, by the picks: nobody, the search; one, his card (as his name opens it); two
  // to four, Compare
  pickedAction(): void {
    if (this.picked.length > 1) this.openCompare();
    else if (this.pickedOne) this.openCard(this.pickedOne);
    else if (this.picked.length) {
      // (one the list no longer shows, a filter or the cap since: his card from the season's rows all the same)
      this.games.backTo = null;
      const row = isPooled(this.position) ? SKILL_UNITS[this.position]?.find((p) => p.gsisId === this.picked[0]) : undefined;
      void this.cards.openLinked({ position: row ? homeTab(row, this.position) : this.position, gsisId: this.picked[0] }, this.season);
    } else this.openFind();
  }

  // (the one picked, as the grid has him)
  get pickedOne(): SkillPlayer | undefined {
    return this.picked.length === 1 ? this.gridRows.find((p) => p.gsisId === this.picked[0]) : undefined;
  }

  get pickedLabel(): string {
    if (this.picked.length > 1) return `Compare the ${this.picked.length} picked`;
    if (this.picked.length) return `Open ${this.pickedOne?.name ?? 'the one picked'}`;
    return 'Search for a player';
  }

  get pickedTitle(): string {
    if (this.picked.length > 1) return `Compare the ${this.picked.length} picked`;
    if (this.picked.length) return `Open ${this.pickedOne?.name ?? 'the one picked'} (pick more rows to compare)`;
    return `Search anyone${this.sport.careerOnly ? '' : ', any season'} and open their card (click rows to pick them for Compare)`;
  }

  // The search opened in the bar, the box in focus
  openFind(): void {
    this.finding = true;
    setTimeout(() => this.findBox?.nativeElement.focus({ preventScroll: true }));
  }

  // ...and shut (Esc, its X), the button back in focus
  closeFind(refocus = false): void {
    this.finding = false;
    if (refocus) setTimeout(() => this.toolButton?.nativeElement.focus({ preventScroll: true }));
  }

  // In the box: the arrows move through the hits, Enter opens the lit one, Esc clears what's typed, then
  // shuts the search
  findKey(event: KeyboardEvent): void {
    const { finder } = this;
    const n = finder.hits.length;
    if (event.key === 'Enter') {
      if (n) this.openFound(finder.hits[finder.active]);
    } else if (n && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      finder.active = (finder.active + (event.key === 'ArrowDown' ? 1 : n - 1)) % n;
      setTimeout(() => document.querySelector('.find-hits .active')?.scrollIntoView({ block: 'nearest' }));
    } else if (event.key === 'Escape') {
      if (finder.query) finder.search('');
      else this.closeFind(true);
      event.stopPropagation();
    } else return;
    event.preventDefault();
  }

  // A hit: his card for his latest ranked season (his latest unranked one if he was never ranked), on his own
  // tab (the grid stays where it is), the search shut
  openFound(hit: CompareHit): void {
    const season = hit.ranked?.at(-1) ?? hit.seasons.at(-1);
    if (season === undefined) return;
    this.finder.search('');
    this.closeFind();
    this.games.backTo = null;
    void this.cards.openLinked({ position: hit.position, gsisId: hit.id }, season);
  }

  // The card's compare button: its season into the compare view (the card closes, the view under it)
  readonly compareFromCard = () => {
    const card = this.cards.card;
    if (!card) return;
    const position = this.cards.tabPosition;
    this.games.backTo = null;
    this.cards.close();
    this.compare.startWith(position, card.season, card.player.gsisId);
  };

  // A card's link opened (card-link.ts): his card on the tab it was shared on; shared from a pooled tab (the
  // Top 50), its place there and the arrows walking it
  private async openSharedCard(card: LinkedCard): Promise<void> {
    this.games.backTo = null;
    const pool = card.grid !== card.position && this.playerList.some((p) => p.gsisId === card.gsisId) ? this.playerList : null;
    if (!(await this.cards.openShared(card, this.season, pool))) this.note(CARD_MISSING);
  }

  // The card's Share button: a link to this card, its season and the card tab showing (from a pooled tab: the
  // grid on that tab again)
  readonly shareCard = (button: HTMLElement) => {
    const card = this.cards.card;
    if (!card) return;
    const position = this.cards.fromPool ? this.position : this.cards.tabPosition;
    const link = this.positionService.cardLink({ position, season: card.season, id: card.player.gsisId, name: card.player.name, tab: this.cards.tab });
    this.shareLink(button, link, 'Link copied: anyone who opens it sees this card');
  };

  // The game view's: the game (ESPN's id) and its tab showing (the one it opens on anyway left out)
  readonly shareGame = (button: HTMLElement) => {
    const event = this.games.event;
    if (!event) return;
    const tab = this.games.tab === 'summary' || this.games.tab === 'preview' ? null : this.games.tab;
    this.shareLink(button, this.positionService.gameLink(event, tab), 'Link copied: anyone who opens it sees this game');
  };

  // A Recent square decided past regulation (the NHL's overtime or shootout: a lighter square)
  recentOt(player: SkillPlayer, index: number): boolean {
    return !!extras(player).lastFiveOt?.[index];
  }

  // A row's team, by the names the row knows (its team's name, its own, its logo's file)
  recentTeam(player: SkillPlayer): (string | undefined)[] {
    return rowTeamNames(player);
  }

  // A Recent square's hover: "24-17 W @ Miami Dolphins" (the score first, once the team's results are in)
  dotTitle(player: SkillPlayer, index: number): string {
    const title = this.reader.recentTitle(player, index);
    const vs = extras(player).lastFiveVs;
    const score = this.games.recentScore(this.recentTeam(player), vs, index, this.season);
    return score ? `${score} ${title}` : title;
  }

  // Empty Recent slots for games not played yet (up to the tab's count: SPORT.recentGames)
  unplayed(player: SkillPlayer): null[] {
    return Array(Math.max(0, recentCount(this.position) - this.reader.lastFive(player).length)).fill(null);
  }

  // More than 7 Recent dots: smaller ones, so the column stays narrow
  get manyRecent(): boolean {
    return recentCount(this.position) > 7;
  }

  // A stat group collapsed to a strip (its header icon clicked; clicked again to open): hidden, still
  // counted in the ranking
  isCollapsed(id: StatGroupId): boolean {
    return this.positionService.isGroupCollapsed(this.position, id);
  }

  toggleCollapsed(id: StatGroupId, event: Event): void {
    event.stopPropagation();
    this.positionService.toggleGroupCollapsed(this.position, id);
    // (the isolated column folded away: back to the ranking)
    if (this.isolatedKey && !this.shownStat(this.isolatedKey)) this.endIsolation();
  }

  collapseTitle(group: { id: StatGroupId; title: string }): string {
    return `${group.title}: Click to ${this.isCollapsed(group.id) ? 'Expand' : 'Collapse'}`;
  }

  // Games in a row's record its stats don't cover yet (the data's statsBehind; the current season only)
  statsBehind(player: SkillPlayer): number {
    return this.season === CURRENT_SEASON ? ((player as { statsBehind?: number }).statsBehind ?? 0) : 0;
  }

  // Bandage hover: the injury status (the sport's wording)
  injuryTitle(player: SkillPlayer): string {
    return SPORT.copy.injuryTitle(player, dataSeason === CURRENT_SEASON);
  }

  // A row's awards this season (badges beside the name), looked up once per season
  private awardCache?: { key: string; wins: Map<SkillPlayer, AwardWin[]> };

  awards(player: SkillPlayer): AwardWin[] {
    const key = `${dataVersion}.${this.position}`;
    if (this.awardCache?.key !== key) this.awardCache = { key, wins: new Map() };
    let wins = this.awardCache.wins.get(player);
    if (!wins) {
      wins = awardsFor(player, this.position, dataSeason);
      this.awardCache.wins.set(player, wins);
    }
    return wins;
  }

  // The team card: the team's look in the table's season (team-look.ts: that era's logo on its chip, drawn
  // in white for a logo that's lettering, the Giants'), and its logo that season; each team's once a season
  // (every row asks on every check)
  private looks = new Map<string, { look: TeamLook; logo: string }>();

  private seasonTeam(teamLogo: string): { look: TeamLook; logo: string } {
    const key = `${this.season}|${teamLogo}`;
    let team = this.looks.get(key);
    if (!team) this.looks.set(key, (team = { look: teamLook(SPORT.id, teamLogo, this.season), logo: logoForSeason(teamLogo, this.season) }));
    return team;
  }

  teamLook(unit: { teamLogo: string }): TeamLook {
    return this.seasonTeam(unit.teamLogo).look;
  }

  seasonLogo(teamLogo: string): string {
    return this.seasonTeam(teamLogo).logo;
  }

  // The player's headshot (a cutout on a clear background, sized for the team card; w: its width): the
  // sport's, then its fallback once that fails to load (SPORT.headshotFallback), then none
  private headshotMisses = new Map<number, number>();

  headshot(unit: { id?: number | null }, w = 160): string | null {
    if (!unit.id) return null;
    const misses = this.headshotMisses.get(unit.id) ?? 0;
    if (misses === 0) return SPORT.headshot(unit.id, w);
    if (misses === 1 && SPORT.headshotFallback) return SPORT.headshotFallback(unit.id, w);
    return null;
  }

  noHeadshot(unit: { id?: number | null }): void {
    if (unit.id) this.headshotMisses.set(unit.id, (this.headshotMisses.get(unit.id) ?? 0) + 1);
  }

  // ---------------------------------------------------------------------------
  // The button bar
  // ---------------------------------------------------------------------------
  get filtersOpen(): boolean {
    return this.positionService.filtersOpen;
  }

  toggleFilters(): void {
    this.positionService.setFiltersOpen(!this.filtersOpen);
  }

  get aboutOpen(): boolean {
    return this.positionService.aboutOpen;
  }

  openAbout(): void {
    this.positionService.setAboutOpen(true);
  }

  // Phones: the More menu's Settings opens the settings menu, hung from the More button (once the More
  // menu has closed and handed focus back, so the settings menu takes it)
  openSettingsFromMore(trigger: MatMenuTrigger): void {
    setTimeout(() => trigger.openMenu());
  }

  // The sport's footer dropdowns (MMA's Current / All-Time)
  settingText(setting: SportSetting): string {
    return settingText(setting, this.sportSettings);
  }

  setSportSetting(key: string, value: string): void {
    this.positionService.setSportSetting(key, value);
  }

  // The year dropdown: "2019" ("2024-25" for a sport named for the year it ends in), or CURRENT while
  // it's being played
  seasonName(season: number): string {
    return isLiveSeason(season) ? 'CURRENT' : SPORT.seasonText(season);
  }

  selectSeason(season: number): void {
    this.positionService.setSeason(season);
  }

  // The list as text, then "List copied" for two seconds, just under the button
  // (isolated: the rows as shown, each at its place by the stat and with its value, under a line saying so)
  copyList(button: HTMLElement): void {
    const note = this.isoStat ? `Sorted by ${this.reader.name(this.isoStat)}${this.isoReversed ? ', worst first' : ''}` : undefined;
    copyRankingsToClipboard(this.rankingsList.nativeElement, this.settings.copyStats, note)
      .then(() => this.toast(button, 'List copied to clipboard!'))
      .catch((err) => console.error('Failed to copy: ', err));
  }

  // Share's Copy Isolated, there only while a column is isolated: the rows shown in its order, each its
  // place by the stat, name, team and the value as the column shows it (isolate.ts: isolatedCopyText)
  get copyIsolatedShown(): boolean {
    return copyIsolatedShown(this.isoStat);
  }

  copyIsolated(button: HTMLElement): void {
    const stat = this.isoStat;
    if (!stat) return;
    // (a team's own row, or a sport without teams: no team beside the name)
    const teams = !SPORT.noTeams && !SPORT.teamTabs?.includes(this.position);
    const text = isolatedCopyText(
      this.reader.name(stat),
      this.gridRows,
      this.rankedShown,
      (player) => ({
        place: this.isoPlace(player),
        name: player.name,
        team: teams ? isolatedTeam(this.teamNameOf(player), player.teamLogo) : null,
        value: stat.format === 'recent' ? recentText(this.reader.lastFive(player)) : this.reader.cellText(player, stat),
      }),
      this.isoReversed,
    );
    // (a table like the other copy's, each row's rank, team logo, name and the stat; the text with its teams)
    const title = text.split('\n')[0];
    copyRankingsToClipboard(this.rankingsList.nativeElement, false, title, text)
      .then(() => this.toast(button, 'Isolated list copied to clipboard!'))
      .catch((err) => console.error('Failed to copy: ', err));
  }

  // Save (the toolbar's floppy disk, a phone's More): the grid as it is now, frozen for the save dialog,
  // its title filled in ("2026 Quarterbacks · Oct 9"); signed out, the sign-in instead. Saving closes the
  // dialog and the toast says so, with Open and Rename (the same dialog, the title alone).
  private readonly account = inject(AccountService);
  listDraft: ListDraft | null = null;
  listTitle = '';
  renaming: { id: string; title: string } | null = null;
  savedList: { id: string; title: string; href: string; renamed: boolean } | null = null;
  private savedTimer?: ReturnType<typeof setTimeout>;

  async openSaveList(): Promise<void> {
    // (a returning user's sign-in may still be on its way)
    if (!this.account.user()) await this.account.start().catch(() => undefined);
    if (!this.account.user()) {
      this.account.openLogin();
      return;
    }
    this.listDraft = gridDraft(this);
    this.listTitle = draftTitle(this);
  }

  listSaved(saved: { id: string; title: string }, renamed = false): void {
    this.listDraft = null;
    this.renaming = null;
    this.savedList = { ...saved, renamed, href: listPath(SPORT.id, this.account.user()?.uid ?? '', saved.id) };
    clearTimeout(this.savedTimer);
    this.savedTimer = setTimeout(() => (this.savedList = null), 8000);
  }

  renameSaved(): void {
    if (!this.savedList) return;
    this.renaming = { id: this.savedList.id, title: this.savedList.title };
    this.dismissSaved();
  }

  dismissSaved(): void {
    clearTimeout(this.savedTimer);
    this.savedList = null;
  }

  // The list's link (its tab, season, sliders, eyes and settings: share.ts)
  shareList(button: HTMLElement): void {
    this.shareLink(button, this.positionService.shareLink(), 'Link copied: anyone who opens it sees this list');
  }

  // The compare view's: the list's, with its sides and its tab on top
  readonly shareCompare = (button: HTMLElement) => {
    const { sides, tab } = this.compare;
    this.shareLink(button, this.positionService.compareLink(sides, tab), 'Link copied: anyone who opens it sees this comparison');
  };

  // (a phone's share sheet, else copied, "Link copied" under the button)
  private shareLink(button: HTMLElement, url: string, copied: string): void {
    const phone = matchMedia('(pointer: coarse)').matches && typeof navigator.share === 'function';
    if (phone) {
      navigator.share({ title: document.title, url }).catch(() => null);
      return;
    }
    navigator.clipboard
      .writeText(url)
      .then(() => this.toast(button, copied))
      .catch((err) => console.error('Failed to copy: ', err));
  }

  // A note over the list, no button under it (a link that found nobody), a few seconds
  private note(text: string): void {
    setTimeout(() => {
      const top = this.rankingsList?.nativeElement.getBoundingClientRect().top ?? 120;
      this.toastAt = { top: Math.max(8, top + 12), left: innerWidth / 2, right: null };
      this.toastText = text;
      this.toastVisible = true;
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => (this.toastVisible = false), 4000);
    });
  }

  private toast(button: HTMLElement, text: string): void {
    const rect = button.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    // (centered under the button; one near the right edge (a phone's More, the compare view's share) has
    // the toast's right edge in line with its own, so the toast stays on screen)
    this.toastAt =
      center > innerWidth - 200
        ? { top: rect.bottom + 8, left: null, right: Math.max(8, innerWidth - rect.right) }
        : { top: rect.bottom + 8, left: center, right: null };
    this.toastText = text;
    this.toastVisible = true;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toastVisible = false), 2200);
  }
}
