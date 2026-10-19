import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, computed, signal } from '@angular/core';
import { Confidence, tierOf } from '../../book/tiers';
import { betScoreText, confidenceOf, kellyOf } from '../../book/bet-why';
import { boardColumns, headshot, hideImage, teamLogo, totalTop } from '../../book/bet-format';
import { pickTeamColor } from '../../book/pick-style';
import { BoardBand, BoardGame, BoardProp, BoardSide, LinesService, PreviewRow } from './lines.service';
import { PREVIEW_ODDS, PROPS_WINDOW_HOURS, movementText } from './preview-props';
import { WalletService } from './wallet.service';
import { BoardTeam, GameBoard, PlayMarket, Price, Selection, Tier, bettable, lineText, oddsText, pickWords, selectionKey } from './wallet-math';
import { matchupName } from '../../book/game-menu';

// The bot's pick as the Book has it (its BetRow, as far as the board reads it)
export interface BotPick {
  betType: string;
  side?: string | null;
  line?: number | null;
  price?: number;
  // (a prop's other side's price, where the bettor kept it: to take the side the bot didn't)
  otherPrice?: number | null;
  confidence: Confidence | null;
  sureness: number;
  pickId?: string;
  player?: string | null;
  athleteId?: string | number | null;
  market: string;
  pick: string;
  chance?: number;
}

// (a game price's word from the bot: its pick there, else its betting board's band and Kelly score at that line)
export interface PriceCall {
  bot: BotPick | null;
  tier: Tier | null;
  // (the Kelly score as a fraction; null where there's none to show: no price of the bot's, or a CHECK)
  kelly: number | null;
  chance: number | null;
}

// (a price's K score button clicked: what the page needs to open the why popover for it: the bot's pick where it's
// one (the page has its row), else the board's Kelly score, chance and price with the bet's words)
export interface PriceWhy {
  bot: BotPick | null;
  kelly: number;
  chance: number | null;
  odds: number;
  tier: Tier | null;
  words: string;
  market: PlayMarket;
  side: string;
  game: { sport: string; matchup: string; start: string | null } | null;
}

// (one side of a prop on the board: its price, the bot's Kelly score and band on it, the bot's side or not)
export interface PropSide {
  side: 'over' | 'under';
  odds: number | null;
  kelly: number | null;
  tier: Tier | null;
  bot: boolean;
}

// (a prop on the board: a player's stat at its line, over and under; pick the bot's on it, where it made one)
export interface PropRow {
  key: string;
  player: string;
  athlete: string;
  team: string;
  propType: string;
  label: string;
  line: number;
  chance: number | null;
  check: boolean;
  pass: boolean;
  // (why it passes, where the board says: board.mjs sw)
  passWhy?: 'gap' | 'small';
  pick: BotPick | null;
  sides: PropSide[];
  // (the player's first stat: his face and name on it, the rest under it)
  first: boolean;
}

// (a preview prop on the board: its player's first stat with his face and name; its line's move from its open)
export interface PreviewPropRow extends PreviewRow {
  key: string;
  first: boolean;
  moved: string | null;
}

// (a team's preview props: folded till it's opened, as the bot's)
export interface PreviewTeam {
  id: string;
  abbr: string;
  rows: PreviewPropRow[];
}

// (a team's props: folded till it's opened)
export interface PropTeam {
  id: string;
  abbr: string;
  rows: PropRow[];
  picks: number;
}

const MARKET_OF: Record<string, PlayMarket> = { spread: 'spread', total: 'total', moneyline: 'ml', player: 'prop' };

// The bot's pick as a bet for the slip, at the bot's own line and price: what the Book's row price button
// hands wallet.toggle, the one slip call the tiles below make (take, takeProp), with the same fields: the pick's
// band and Kelly score on it, its id as the ref, a prop's player and stat. A CHECK isn't the bot's pick (botPick
// false, its tier an admin's alone); none without a price, or for a type the slip doesn't take
export function botSelection(game: { sport: string; event: string; matchup: string; start: string }, p: BotPick, desk: boolean): Omit<Selection, 'key' | 'stake'> | null {
  const market = MARKET_OF[p.betType];
  if (!market || !Number.isFinite(p.price) || !p.price) return null;
  const check = p.confidence === 'check';
  const prop = market === 'prop';
  const side = p.side ?? (market === 'total' || prop ? (/^(.*s)?under/i.test(p.pick) ? 'under' : 'over') : '');
  if (!side || (prop && p.line === null)) return null;
  return {
    ...game,
    market,
    side,
    line: p.line ?? null,
    odds: p.price,
    pick: p.pick,
    botPick: !check,
    tier: check && !desk ? null : p.confidence ? tierOf(p.confidence) : null,
    kelly: check ? null : Math.round(p.sureness * 1e4) / 100,
    ref: p.pickId ?? null,
    propType: prop ? (p.pickId?.split(':')[2] ?? p.market) : null,
    athlete: prop ? String(p.athleteId ?? '') : null,
    player: prop ? (p.player ?? null) : null,
    statLabel: prop ? p.market : null,
  };
}
const tierOfBand = (b: BoardBand | null | undefined): Tier | null => (b ? tierOf(b as Confidence) : null);

// A game's every line, both sides (the spread, the total, the moneyline) at the book's prices from ESPN's
// board, as a sportsbook lays them out: a row a team, a column a market; under it every player prop the bot
// priced (its betting board: data/model/board.json, board.mjs), a team's folded till it's opened, a player's
// stats under his name, over and under. Every price with the bot's band chip (Lock, Love, Like, Pass) and its
// Kelly score, the bot's own picks lit in their band's color; a CHECK (an admin's: a market the bot questions,
// not a bet it made) in its lavender, no Kelly score, either side as good to take, the slip's bet not the bot's
// pick (botPick false, its tier check). The live prices (ESPN's) decide what's there to take; the board's Kelly
// score where its line is the same. A price clicked goes on the bet slip (again, off it); only before the game
// starts.
@Component({
  selector: 'game-lines',
  templateUrl: './game-lines.component.html',
  styleUrls: ['../../../styles/components/wallet-lines.scss'],
  standalone: false,
})
export class GameLinesComponent implements OnInit, OnDestroy {
  @Input({ required: true }) sport = '';
  @Input({ required: true }) event = '';
  @Input({ required: true }) start = '';
  @Input() matchup = '';
  // (an admin's: the board's CHECKs on show; anyone else's a CHECK is a pass, no Kelly score, no side the bot's,
  // as the rules take a CHECK's bet from an admin alone)
  @Input() desk = false;
  // (the bot's picks on this game)
  @Input() set picks(list: BotPick[] | null | undefined) {
    this.botPicks.set(list ?? []);
  }

  // (one pick alone: its market's two sides and nothing else, under its row when the game's every line is
  // already on top)
  @Input() set only(p: BotPick | null | undefined) {
    this.onlyPick.set(p ?? null);
  }

  // The look's inputs (The Book): where the game's played, for the header; the bet-type chips on, which filter the
  // sections (none on: every section); compact, an open row's board on the Best bets view (the game lines' grid
  // alone, small tiles, no strip under them)
  @Input() venue: string | null = null;
  @Input() set kinds(set: Set<string> | null | undefined) {
    this.kindsOn.set(set ? new Set(set) : new Set());
  }
  @Input() compact = false;
  // (the header's way back to Best bets; a K score button clicked: the page opens the why popover for the price)
  @Output() readonly back = new EventEmitter<void>();
  @Output() readonly why = new EventEmitter<{ at: PriceWhy; event: Event }>();
  private readonly kindsOn = signal(new Set<string>());
  readonly showLines = computed(() => {
    const k = this.kindsOn();
    return !k.size || k.has('spread') || k.has('total') || k.has('moneyline');
  });
  readonly showProps = computed(() => !this.kindsOn().size || this.kindsOn().has('player'));
  // (the sections open: the game lines; the props and the preview props folded at first)
  private readonly sections = signal<Record<string, boolean>>({ lines: true, props: false, preview: false });
  sectionOpen(key: string): boolean {
    return !!this.sections()[key];
  }
  toggleSection(key: string): void {
    this.sections.update((o) => ({ ...o, [key]: !o[key] }));
  }
  // (the sections' counts: the prices on the game lines; the props' players and their sides with a price)
  linesCount(b: GameBoard): number {
    return [b.spread?.away, b.spread?.home, b.total?.over, b.total?.under, b.ml?.away, b.ml?.home].filter((p) => p && p.odds !== null).length;
  }
  propsCount(rows: PropRow[]): string {
    const players = new Set(rows.map((r) => r.athlete)).size;
    const bets = rows.reduce((t, r) => t + r.sides.filter((s) => s.odds !== null).length, 0);
    return `${players} ${players === 1 ? 'player' : 'players'} · ${bets} ${bets === 1 ? 'bet' : 'bets'}`;
  }
  previewCount(teams: PreviewTeam[]): string {
    const rows = teams.flatMap((t) => t.rows);
    const players = new Set(rows.map((r) => r.athlete)).size;
    return `${players} ${players === 1 ? 'player' : 'players'} · ${rows.length * 2} bets`;
  }
  // (a K score's tone: green at 0.5 or more, grey over 0, red at 0 or under; in points, as kellyText writes it)
  kTone(kelly: number): 'good' | 'flat' | 'bad' {
    const points = kelly * 100;
    return points >= 0.5 ? 'good' : points > 0 ? 'flat' : 'bad';
  }
  // (a team's color for its disc's ring, by its abbreviation or its ESPN id; none known, the default ring)
  teamColor(team: string): string | null {
    if (!team) return null;
    return /^d+$/.test(team) ? pickTeamColor(this.sport, { total: false, teamId: team }) : pickTeamColor(this.sport, { total: false, abbr: team });
  }
  // (a prop's team as its abbreviation, from the board's teams; its id, or nothing, where the board doesn't know it)
  teamAbbr(team: string): string {
    const g = this.model();
    if (g && team === String(g.a[1])) return g.a[0];
    if (g && team === String(g.h[1])) return g.h[0];
    return /^d+$/.test(team) ? '' : team;
  }
  askWhy(at: Omit<PriceWhy, 'game'>, event: Event): void {
    this.why.emit({ at: { ...at, game: { sport: this.sport.toUpperCase(), matchup: this.matchupText, start: this.board?.start ?? this.start ?? null } }, event });
  }

  private readonly botPicks = signal<BotPick[]>([]);
  readonly onlyPick = signal<BotPick | null>(null);
  readonly loading = signal(true);
  private timer: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  readonly lineText = lineText;
  readonly oddsText = oddsText;
  readonly hideImage = hideImage;
  readonly now = signal(Date.now());

  constructor(
    readonly lines: LinesService,
    readonly wallet: WalletService,
  ) {}

  get board(): GameBoard | undefined {
    return this.lines.board(this.sport, this.event);
  }

  // (the game on the bot's betting board: gone once it starts)
  readonly model = computed<BoardGame | undefined>(() => this.lines.modelGame(this.sport, this.event));

  // Every prop on the board, a team's together and a player's together: the board's, and the bot's picks it
  // doesn't have (a game begun: its picks alone)
  readonly propRows = computed<PropRow[]>(() => {
    const g = this.model();
    const picks = this.botPicks().filter((p) => p.betType === 'player' && Number.isFinite(p.price) && p.line !== null && p.line !== undefined);
    const pickOf = (x: BoardProp) => picks.find((p) => String(p.athleteId ?? '') === x.id && this.propType(p) === x.k) ?? null;
    const rows = (g?.p ?? []).map((x) => this.rowOf(x, pickOf(x)));
    const had = new Set(rows.map((r) => r.key));
    for (const p of picks) {
      const r = this.rowOfPick(p);
      if (!had.has(r.key)) rows.push(r);
    }
    const order = (t: string) => (g && t === String(g.a[1]) ? 0 : g && t === String(g.h[1]) ? 1 : 2);
    rows.sort((a, b) => order(a.team) - order(b.team) || a.player.localeCompare(b.player) || a.label.localeCompare(b.label));
    rows.forEach((r, i) => (r.first = i === 0 || rows[i - 1].athlete !== r.athlete || rows[i - 1].team !== r.team));
    return rows;
  });

  // (the props by team: the away team's, then the home team's, then any whose team isn't known)
  readonly propTeams = computed<PropTeam[]>(() => {
    const g = this.model();
    const out: PropTeam[] = [];
    for (const r of this.propRows()) {
      let t = out.find((x) => x.id === r.team);
      if (!t) {
        const abbr = g && r.team === String(g.a[1]) ? g.a[0] : g && r.team === String(g.h[1]) ? g.h[0] : 'Other';
        out.push((t = { id: r.team, abbr, rows: [], picks: 0 }));
      }
      t.rows.push(r);
      if (r.sides.some((s) => s.bot)) t.picks++;
    }
    return out;
  });

  // (one prop pick alone: its row, the board's where it has it)
  readonly onlyProp = computed<PropRow | null>(() => {
    const only = this.onlyPick();
    if (!only || only.betType !== 'player' || !Number.isFinite(only.price) || only.line === null || only.line === undefined) return null;
    const key = this.rowKey(String(only.athleteId ?? ''), this.propType(only));
    const r = this.propRows().find((x) => x.key === key) ?? this.rowOfPick(only);
    return { ...r, first: true };
  });

  // (the one pick's game market, when it's one: spread, total or ml)
  get onlyMarket(): PlayMarket | null {
    const only = this.onlyPick();
    return only && only.betType !== 'player' ? (MARKET_OF[only.betType] ?? null) : null;
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([this.lines.game(this.sport, this.event, this.start).catch(() => null), this.lines.model(this.sport)]);
    this.loading.set(false);
    void this.loadPreview();
    // (the prices kept fresh while the board's open: once a minute, while the page is in view (the bot's board
    // every five, its own hourly); not at all if the board closed while its first prices loaded, the game filter
    // changed: nothing would stop it)
    if (this.closed) return;
    this.timer = setInterval(() => {
      if (document.hidden) return;
      this.now.set(Date.now());
      void this.lines.game(this.sport, this.event, this.start);
      void this.lines.model(this.sport).then(() => this.loadPreview());
    }, 60e3);
  }

  ngOnDestroy(): void {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
  }

  // ---------------------------------------------------------------------------
  // Preview props: the book's prop lines off ESPN for a game the bot hasn't priced props on yet (preview-props.ts),
  // shown until the bot's board has the game's props, then the bot's instead; bet either side at an assumed -110,
  // no band and no Kelly score (the bot hasn't priced them), and the bot never bets them
  // ---------------------------------------------------------------------------
  readonly preview = signal<PreviewRow[] | null>(null);
  readonly previewLoading = signal(false);
  readonly previewOdds = PREVIEW_ODDS;
  readonly previewSides = ['over', 'under'] as const;

  // (whether the preview's for this board: the whole board (not one pick), no props of the bot's on it)
  readonly previewWanted = computed(() => !this.onlyPick() && !this.propRows().length);

  // (read once the board's open, and again (from its five minutes' cache) each minute while it's wanted: a game
  // not begun, no props of the bot's)
  private async loadPreview(): Promise<void> {
    const b = this.board;
    // (a sport the bot prices no props for (a fight): none to preview)
    if (this.closed || !PROPS_WINDOW_HOURS[this.sport] || !this.previewWanted() || !b || b.state !== 'pre' || !this.open) return;
    if (this.preview() === null) this.previewLoading.set(true);
    try {
      const rows = await this.lines.previewProps(this.sport, this.event, { away: b.away.abbr, home: b.home.abbr });
      if (rows) this.preview.set(rows);
    } finally {
      this.previewLoading.set(false);
    }
  }

  // (the preview props by team: the away team's, then the home team's, then any whose team isn't known; a player's
  // stats together)
  readonly previewTeams = computed<PreviewTeam[]>(() => {
    const rows = this.previewWanted() ? (this.preview() ?? []) : [];
    const b = this.board;
    const order = (t: string) => (b && t === b.away.abbr ? 0 : b && t === b.home.abbr ? 1 : 2);
    const sorted = [...rows].sort((x, y) => order(x.team) - order(y.team) || x.player.localeCompare(y.player) || x.label.localeCompare(y.label));
    const out: PreviewTeam[] = [];
    sorted.forEach((r, i) => {
      const id = r.team || 'other';
      let t = out.find((x) => x.id === id);
      if (!t) out.push((t = { id, abbr: r.team, rows: [] }));
      const first = i === 0 || sorted[i - 1].athlete !== r.athlete;
      t.rows.push({ ...r, key: `${r.athlete}|${r.propType}`, first, moved: movementText(r) });
    });
    return out;
  });

  // (when the bot starts pricing this game's props: its window before the start (leagues.mjs TIMING's props))
  get previewWindow(): { hours: number; at: string } | null {
    const hours = PROPS_WINDOW_HOURS[this.sport];
    const start = Date.parse(this.board?.start ?? this.start);
    return hours && Number.isFinite(start) ? { hours, at: new Date(start - hours * 36e5).toISOString() } : null;
  }

  previewFace(r: PreviewPropRow): string {
    return headshot(this.sport, r.athlete);
  }

  previewKey(r: PreviewPropRow, side: string): string {
    return selectionKey({ sport: this.sport, event: this.event, market: 'prop', side, propType: r.propType, athlete: r.athlete });
  }

  // (a preview side's words and hover: "Sam Darnold Over 221.5 Pass Yds", at -110 assumed)
  previewWords(r: PreviewPropRow, side: 'over' | 'under'): string {
    return `${r.player} ${side === 'over' ? 'Over' : 'Under'} ${r.line} ${r.label}`;
  }

  previewTitle(r: PreviewPropRow, side: 'over' | 'under'): string {
    const opened = r.open !== null && r.open !== r.line ? ` (it opened at ${r.open})` : '';
    return `${this.previewWords(r, side)} ${oddsText(PREVIEW_ODDS)} assumed · the Book's line via ESPN${opened}, no price posted yet; the Bot hasn't priced it: no band, no Kelly score${this.open ? '' : ' · Betting closed: the game has started'}`;
  }

  // A preview side clicked: onto the slip at -110 (or off it), tagged preview, never the bot's pick; its line the
  // one on show, which it's graded at
  takePreview(r: PreviewPropRow, side: 'over' | 'under'): void {
    if (!this.open) return;
    this.wallet.toggle({
      sport: this.sport,
      event: this.event,
      matchup: this.matchupText,
      start: this.board?.start ?? this.start,
      market: 'prop',
      side,
      line: r.line,
      odds: PREVIEW_ODDS,
      pick: this.previewWords(r, side),
      botPick: false,
      tier: null,
      kelly: null,
      ref: `${this.event}:prop:${r.propType}:${r.athlete}`,
      propType: r.propType,
      athlete: r.athlete,
      player: r.player,
      statLabel: r.label,
      preview: true,
    });
  }

  get open(): boolean {
    return bettable(this.board?.start ?? this.start, this.board?.state, this.now());
  }

  get matchupText(): string {
    return this.board?.matchup ?? this.matchup;
  }

  // (the header's words: the matchup as it reads, a fight "A vs B" (game-menu.ts matchupName); the bets' words
  // keep the board's "away @ home")
  get titleText(): string {
    return matchupName(this.sport, this.matchupText);
  }

  // (the grid's market columns: those with a price posted (bet-format.ts boardColumns); a fight's moneyline alone,
  // or its round total and moneyline, no empty column)
  readonly boardColumns = boardColumns;
  // (a total's tile words: "O 47.5", a fight's "Over 2.5 rounds")
  totalTop(side: string, line: number | null | undefined): string {
    return totalTop(this.sport, side, line);
  }

  // (a total's unit in its words: a fight's round total reads "Over 2.5 rounds")
  get totalUnit(): string {
    return this.sport === 'mma' ? ' rounds' : '';
  }

  // (whether a side is a team with a side of the field, Away or Home: a fight's fighters have none)
  get teams(): boolean {
    return this.sport !== 'mma';
  }

  logo(abbr: string): string {
    return teamLogo(this.sport, abbr);
  }

  // (a side's picture: a team's logo by its abbreviation; a fighter's headshot, the board's (wallet-math
  // modelGameBoard))
  pic(t: BoardTeam): string {
    return this.sport === 'mma' && t.logo ? t.logo : this.logo(t.abbr);
  }

  face(r: PropRow): string {
    return headshot(this.sport, r.athlete);
  }

  // The bot's pick on a market's side, if it made one
  botOn(market: PlayMarket, side: string): BotPick | null {
    return this.botPicks().find((p) => MARKET_OF[p.betType] === market && p.side === side) ?? null;
  }

  // (a CHECK: the bot questions the market, it didn't bet it)
  isCheck(p: BotPick | null): boolean {
    return p?.confidence === 'check';
  }

  tier(p: BotPick | null): Tier | null {
    return p?.confidence ? tierOf(p.confidence) : null;
  }

  kellyText(kelly: number): string {
    return betScoreText(kelly * 100);
  }

  // A game price's word from the bot: its pick's band and Kelly score where it's the bot's pick; else the
  // betting board's at the same line (its Kelly score at the live price, where the price has moved: its band by
  // it too, but a CHECK still one and a guard's pass still a pass); else a pass, nothing to say
  call(price: Price): PriceCall {
    const bot = this.botOn(price.market, price.side);
    const side: BoardSide | undefined = this.model()?.k[price.market as 'spread' | 'total' | 'ml']?.find((s) => s.s === price.side && s.l === price.line);
    if (bot) {
      const check = this.isCheck(bot);
      // (a CHECK's: no Kelly on its button; its "?" popover on the Book has the model's)
      return { bot, tier: this.tier(bot), kelly: check ? null : bot.sureness, chance: bot.chance != null ? bot.chance / 100 : (side?.c ?? null) };
    }
    if (!side || price.odds === null) return { bot: null, tier: 'pass', kelly: null, chance: null };
    if (side.b === 'check' && !this.desk) return { bot: null, tier: 'pass', kelly: null, chance: side.c };
    if (side.o === price.odds || side.b === 'check') return { bot: null, tier: tierOfBand(side.b), kelly: side.b === 'check' ? null : side.ks, chance: side.c };
    const kelly = kellyOf(side.c, price.odds) ?? side.ks;
    const band = side.b === 'low' && side.ks > 0 ? 'low' : confidenceOf(kelly, side.c, true);
    return { bot: null, tier: tierOf(band), kelly, chance: side.c };
  }

  // (a price's hover: what it is, what 10 units win at it, and the bot's word on it)
  priceTitle(price: Price, c: PriceCall): string {
    const words = pickWords(price, this.matchupText);
    const at = `${words} ${oddsText(price.odds)} at the Book`;
    const bot = c.bot;
    const botWords =
      c.tier === 'check'
        ? ` · The Bot's CHECK: a big Kelly on its own number that a guard stopped (a role changing, news on his team), kept for a look, not bet${bot?.chance != null ? ` (the Bot: ${bot.chance}%)` : ''}`
        : bot
        ? ` · The Bot's pick: ${c.tier?.toUpperCase()}, Kelly ${this.kellyText(bot.sureness)}${bot.chance != null ? `, ${bot.chance}% to win` : ''}${bot.line !== undefined && bot.line !== null && bot.line !== price.line ? ` (it took ${lineText(bot.line)})` : ''}`
        : c.kelly !== null
        ? ` · The Bot: ${c.tier?.toUpperCase()}, Kelly ${this.kellyText(c.kelly)}${c.chance != null ? `, ${Math.round(c.chance * 100)}% to win` : ''}`
        : '';
    return `${at}${botWords}${this.open ? '' : ' · Betting closed: the game has started'}`;
  }

  // A price's key on the slip (lit while it's on it)
  keyOf(price: Price): string {
    return selectionKey({ sport: this.sport, event: this.event, market: price.market, side: price.side });
  }

  propKey(r: PropRow, side: string): string {
    return selectionKey({ sport: this.sport, event: this.event, market: 'prop', side, propType: r.propType, athlete: r.athlete });
  }

  // (a prop's key on the board: its player's stat)
  private rowKey(athlete: string, propType: string): string {
    return `${athlete}|${propType}`;
  }

  // A board prop as a row: each side at its price with the bot's Kelly score and band (the bot's side its pick's,
  // where it made one)
  private rowOf(x: BoardProp, pick: BotPick | null): PropRow {
    // (not an admin: the board's CHECK a pass, no Kelly score, its side not the bot's)
    const hidden = !this.desk;
    const check = (x.bk === 'check' && !hidden) || this.isCheck(pick);
    const botSide = pick?.side ?? (x.bk === 'check' && hidden ? null : x.bot) ?? null;
    const sides = (['over', 'under'] as const).map((side, i): PropSide => {
      const bot = botSide === side;
      if (!(bot && pick) && x.b[i] === 'check' && hidden) return { side, odds: x.o[i], kelly: null, tier: 'pass', bot: false };
      const tier = bot && pick ? this.tier(pick) : tierOfBand(x.b[i]);
      const kelly = tier === 'check' ? null : bot && pick && !check ? pick.sureness : x.ks[i];
      return { side, odds: x.o[i], kelly, tier, bot };
    });
    return {
      key: this.rowKey(x.id, x.k),
      player: x.n,
      athlete: x.id,
      team: x.t ?? '',
      propType: x.k,
      label: x.lb,
      line: x.l,
      chance: x.c,
      check,
      pass: !!x.sk,
      ...(x.sw ? { passWhy: x.sw } : {}),
      pick,
      sides,
      first: true,
    };
  }

  // A bot's prop pick not on the board as a row: its side at its price, the other at its own where it was kept
  private rowOfPick(p: BotPick): PropRow {
    const mine = (p.side === 'under' ? 'under' : 'over') as 'over' | 'under';
    const check = this.isCheck(p);
    const sides = (['over', 'under'] as const)
      .map((side): PropSide =>
        side === mine
          ? { side, odds: p.price as number, kelly: check ? null : p.sureness, tier: this.tier(p), bot: true }
          : { side, odds: Number.isFinite(p.otherPrice) ? (p.otherPrice as number) : null, kelly: null, tier: null, bot: false },
      )
      .filter((s) => s.bot || s.odds !== null);
    return {
      key: this.rowKey(String(p.athleteId ?? ''), this.propType(p)),
      player: p.player ?? '',
      athlete: String(p.athleteId ?? ''),
      // (the pick's player's team, so it's grouped with his team's props, not apart)
      team: String((p as { playerTeam?: string | number | null }).playerTeam ?? ''),
      propType: this.propType(p),
      label: p.market,
      line: p.line as number,
      chance: p.chance != null ? p.chance / 100 : null,
      check,
      pass: false,
      pick: p,
      sides,
      first: true,
    };
  }

  // (a side's words: "Connor McDavid Under 3.5 Shots")
  sideWords(r: PropRow, s: PropSide): string {
    return `${r.player ? r.player + ' ' : ''}${s.side === 'over' ? 'Over' : 'Under'} ${r.line} ${r.label}`;
  }

  // (a prop side's hover: the bet, its price, the bot's word on it)
  propTitle(r: PropRow, s: PropSide): string {
    const at = `${this.sideWords(r, s)} ${s.odds !== null ? oddsText(s.odds) : ''}`;
    const chance = r.chance === null ? null : Math.round((s.side === 'over' ? r.chance : 1 - r.chance) * 100);
    const word =
      s.tier === 'check'
        ? ' · The Bot’s CHECK: a guard stopped it (a role changing, news on his team), kept for a look, not bet'
        : r.check
        ? ' · The other side of the Bot’s CHECK'
        : s.tier
        ? ` · ${s.bot ? 'The Bot’s pick' : 'The Bot'}: ${s.tier.toUpperCase()}${s.kelly !== null ? ', Kelly ' + this.kellyText(s.kelly) : ''}${chance !== null ? `, ${chance}% to win` : ''}${r.pass ? (r.passWhy === 'gap' ? ' (it passes: the Bot is too far off the Book here to trust)' : r.passWhy === 'small' ? ' (it passes: his role is changing, and the edge isn’t big enough to look into)' : ' (it passes on this player for now)') : ''}`
        : '';
    return `${at}${word}${this.open ? '' : ' · Betting closed: the game has started'}`;
  }

  private propType(p: BotPick): string {
    return p.pickId?.split(':')[2] ?? p.market;
  }

  // A price clicked: onto the slip (or off it)
  take(price: Price): void {
    if (!this.open || price.odds === null) return;
    const bot = this.botOn(price.market, price.side);
    this.wallet.toggle({
      sport: this.sport,
      event: this.event,
      matchup: this.matchupText,
      start: this.board?.start ?? this.start,
      market: price.market,
      side: price.side,
      line: price.line,
      odds: price.odds,
      pick: pickWords(price, this.matchupText),
      // (a CHECK isn't the bot's pick: its tier kept, no Kelly score)
      botPick: !!bot && !this.isCheck(bot),
      tier: this.tier(bot),
      kelly: bot && !this.isCheck(bot) ? Math.round(bot.sureness * 1e4) / 100 : null,
      ref: bot?.pickId ?? null,
      propType: null,
      athlete: null,
      player: null,
      statLabel: null,
    });
  }

  takeProp(r: PropRow, s: PropSide): void {
    if (!this.open || s.odds === null || !Number.isFinite(s.odds)) return;
    // (the bot's pick only where this viewer has it: an open bet of the bot's off the list isn't one)
    const botPick = s.bot && !!r.pick && !r.check;
    this.wallet.toggle({
      sport: this.sport,
      event: this.event,
      matchup: this.matchupText,
      start: this.board?.start ?? this.start,
      market: 'prop',
      side: s.side,
      line: r.line,
      odds: s.odds,
      pick: s.bot && r.pick ? r.pick.pick : this.sideWords(r, s),
      botPick,
      // (a CHECK's tier from an admin alone: the rules refuse it from anyone else)
      tier: s.bot && (s.tier !== 'check' || this.desk) ? s.tier : null,
      kelly: botPick && s.kelly !== null ? Math.round(s.kelly * 1e4) / 100 : null,
      // (the pick's id, or the bot's own form of one where it made none: a prop's ref names its player's count
      // for the settler, and the rules want one on every prop)
      ref: r.pick?.pickId ?? `${this.event}:prop:${r.propType}:${r.athlete}`,
      propType: r.propType,
      athlete: r.athlete,
      player: r.player || null,
      statLabel: r.label,
    });
  }
}
