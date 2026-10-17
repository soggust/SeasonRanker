import { Injectable, NgZone, inject } from '@angular/core';
import { SPORT } from '@sport/sport';
import { espnTeamId, findEspnTeamId } from '@ranker/core/game-logs';
import { TeamResult, findGame, findGameOn, nthMeeting, teamResults } from './find-game';
import { loadGame } from './game';
import { GameVideo, GameView } from './game.model';
import { loadHighlights } from './highlights';
import { GameWeather, loadWeather, venuePhoto } from './venue';

// Which game to open: ESPN's id (a game log's row), a date and a team in it (a row without one), or a
// Recent dot (its team, the opponent and where, the season, and which meeting: 0 the latest)
export type GameRef =
  | { event: string }
  | { date: string; names: string[] }
  | { team: (string | undefined)[]; opponent: string; home: boolean | null; season: number; nth: number };

export type GameTab = 'summary' | 'box' | 'plays' | 'chart' | 'fantasy' | 'highlights' | 'info' | 'preview' | 'injuries' | 'pitches';

// (how often a game under way is read again while its modal's open)
const LIVE_BEAT = 30_000;

// Phones (the styles' down(phablet), 640px): the modal's panels start shut there, and the Plays tab opens on
// its latest period
export const phoneModal = (): boolean => typeof matchMedia === 'function' && matchMedia('(max-width: 640px)').matches;

// Whether a game has a tab (the view's tabsFor; Highlights only once its videos are found)
export function hasTab(game: GameView, tab: GameTab): boolean {
  if (game.preview) return tab === 'preview' || tab === 'info' || (tab === 'injuries' && game.injuries.length > 0);
  if (tab === 'summary' || tab === 'box' || tab === 'plays' || tab === 'info') return true;
  if (tab === 'chart') return !!game.chart;
  if (tab === 'pitches') return !!game.chart && 'pitches' in game.chart && game.chart.pitches.length > 0;
  if (tab === 'fantasy') return game.fantasy.length > 0;
  return false;
}

// The game view's state: the game open (or finding it, or failed), its tab, its weather. One at a time,
// in a player card's place when opened from one (the card is set aside; closing the game brings it back).
@Injectable({ providedIn: 'root' })
export class GameViewService {
  game: GameView | 'loading' | 'error' | null = null;
  tab: GameTab = 'summary';
  weather: GameWeather | 'loading' | null = null;
  // the game's highlights (highlights.ts: none until they're found), and the one playing
  videos: GameVideo[] = [];
  video = 0;
  // (the play groups open on the Plays tab, and its filter: every play, the scoring ones, or the ones that moved
  // one of the user's bets)
  openPlays = new Set<number>();
  playsFilter: 'all' | 'scoring' | 'mine' = 'all';
  // (the chart's team: both, or one)
  chartSide: 'both' | 'away' | 'home' = 'both';
  // (the chart's or the Pitches tab's player: one, or all of them)
  player: string | null = null;
  // (a team's card for a season: the page that shows the cards hands it over; the game closes for it)
  openTeam: ((abbreviation: string, season: number) => void) | null = null;
  // (a player's card for a season, the same way; and the players the site has that season, by name, to link)
  openPlayer: ((link: { position: string; gsisId: string }, season: number) => void) | null = null;
  findPlayers: ((season: number) => Promise<Map<string, { position: string; gsisId: string }>>) | null = null;
  players: Map<string, { position: string; gsisId: string }> | null = null;
  // The game a card was opened from (its back arrow reopens it), and the one open now
  backTo: GameRef | null = null;
  private current: GameRef | null = null;
  private opened = 0;

  // The sport has games to open (ESPN's league: the game log's)
  get available(): boolean {
    return !!SPORT.gameLog?.league;
  }

  // The game open now (ESPN's event id: its Share link), once it's loaded
  get event(): string | null {
    return this.game && this.game !== 'loading' && this.game !== 'error' && this.current && 'event' in this.current ? this.current.event : null;
  }

  // (whether the game open is this sport's own: another sport's game (the Book's Live tab opens any sport's)
  // has no team or player cards here to link to)
  private own = true;
  readonly ownGame = (): boolean => this.own;

  // tab: the one to open on (a shared link's), when the game has it; else the Summary, or a game to come's Preview.
  // league: ESPN's, for another sport's game (the Book's Live tab: "basketball/nba"); this sport's own otherwise
  async open(ref: GameRef, tab: GameTab | null = null, league: string | null = SPORT.gameLog?.league ?? null): Promise<void> {
    if (!league) return;
    this.own = league === SPORT.gameLog?.league;
    const ticket = ++this.opened;
    this.stopLive();
    this.game = 'loading';
    this.tab = 'summary';
    this.weather = null;
    this.videos = [];
    this.video = 0;
    this.openPlays.clear();
    this.playsFilter = 'all';
    this.chartSide = 'both';
    this.player = null;
    try {
      const id = await this.eventId(league, ref);
      // (another game opened, or this one closed, while it was being found: that one's, not this)
      if (ticket !== this.opened) return;
      if (!id) throw new Error('game not found');
      const game = await loadGame(league, id);
      if (ticket !== this.opened) return;
      this.current = { event: id };
      this.game = game;
      // (the players the site has that season, for the names' links: this sport's own games alone)
      this.players = null;
      if (this.own) {
        this.findPlayers?.(game.seasonYear ?? new Date(game.date).getFullYear())
          .then((map) => ticket === this.opened && (this.players = map))
          .catch(() => null);
      }
      // (a game to come opens on its preview)
      this.tab = tab && hasTab(game, tab) ? tab : game.preview ? 'preview' : 'summary';
      // (the Plays tab's first group open, the rest shut; on a phone the latest period's, the tab's panels starting
      // shut there)
      if (game.plays.length) this.openPlays.add(phoneModal() ? game.plays.length - 1 : 0);
      // (a game under way: its summary read again every thirty seconds while it's open)
      this.watchLive(league, id, ticket);
      // (no photo of the venue from ESPN: Wikipedia's of it, or of its city)
      if (game.venue && !game.venue.image) {
        const venue = game.venue;
        venuePhoto(venue.name, venue.city)
          .then((photo) => ticket === this.opened && photo && (venue.image = photo))
          .catch(() => null);
      }
      loadHighlights(game)
        .then((videos) => {
          if (ticket !== this.opened) return;
          this.videos = videos;
          // (a link to its Highlights: the tab once they're found)
          if (tab === 'highlights' && videos.length) this.tab = 'highlights';
        })
        .catch(() => null);
      this.weather = 'loading';
      loadWeather(game)
        .then((w) => ticket === this.opened && (this.weather = w))
        .catch(() => ticket === this.opened && (this.weather = null));
    } catch (err) {
      console.error(err);
      if (ticket === this.opened) this.game = 'error';
    }
  }

  // A Recent dot's score ("24-17", the team's way): the team's results loaded once the pointer reaches
  // its row's dots (primeRecent), then read for each dot
  private scored = new Map<string, TeamResult[]>();

  // (the grid's: once the pointer stays on a row's squares a moment, so a sweep down the list doesn't ask
  // for every team it passes; leaving them before then asks for none)
  // (asked from outside Angular, the grid's hover: the load itself runs inside, so its scores show once in)
  private primeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly zone = inject(NgZone);
  primeSoon(team: (string | undefined)[], season: number): void {
    this.cancelPrime();
    this.primeTimer = setTimeout(() => this.zone.run(() => this.primeRecent(team, season)), 150);
  }

  cancelPrime(): void {
    if (this.primeTimer) clearTimeout(this.primeTimer);
    this.primeTimer = null;
  }

  primeRecent(team: (string | undefined)[], season: number): void {
    const league = SPORT.gameLog?.league;
    const id = league ? findEspnTeamId(league, team) : null;
    if (!league || !id) return;
    const key = `${id}/${season}`;
    if (this.scored.has(key)) return;
    this.scored.set(key, []);
    teamResults(league, id, season)
      .then((list) => this.scored.set(key, list))
      .catch(() => this.scored.delete(key));
  }

  recentScore(team: (string | undefined)[], vsList: (string | null)[] | undefined, index: number, season: number): string | null {
    const league = SPORT.gameLog?.league;
    const ref = recentRef(team, vsList, index, season);
    if (!league || !ref || !('opponent' in ref)) return null;
    const id = findEspnTeamId(league, team);
    const list = id ? this.scored.get(`${id}/${season}`) : undefined;
    const opponent = findEspnTeamId(league, [ref.opponent]);
    return list?.length && opponent ? (nthMeeting(list, opponent, ref.home, ref.nth)?.score ?? null) : null;
  }

  // A name in the game: the site's player that season, or none
  link(name: string): { position: string; gsisId: string } | null {
    return this.players?.get(nameKey(name)) ?? null;
  }

  // A player or team opened from the game: the game closes (its card's back arrow reopens it)
  toPlayer(name: string, season: number): void {
    const link = this.link(name);
    if (!link || !this.openPlayer || !this.own) return;
    this.backTo = this.current;
    this.close();
    this.openPlayer(link, season);
  }

  // A card opened over the game from one of its links (player-link.ts: a prop tile's player): the game closes,
  // the card's back arrow reopens it; nothing open, nothing to do
  leaveForCard(): void {
    if (!this.game) return;
    this.backTo = this.current;
    this.close();
  }

  toTeam(abbreviation: string, season: number): void {
    if (!this.openTeam || !this.own) return;
    this.backTo = this.current;
    this.openTeam(abbreviation, season);
  }

  // The card's back arrow: the game it came from, open again (the card set aside under it)
  back(): void {
    const ref = this.backTo;
    this.backTo = null;
    if (ref) this.open(ref);
  }

  close(): void {
    this.opened++;
    this.stopLive();
    this.game = null;
  }

  // A game under way: its summary read again every thirty seconds while the modal's open (the Book's Live
  // tab's beat), the scores, line score, plays, win probability and box score all following it; the panels keep
  // their places (the same game object's parts under them, the modal not redrawn); stopped when it closes, another
  // game opens, or the game goes final. Nothing while the page is out of sight
  private liveTimer: ReturnType<typeof setInterval> | null = null;
  private watchLive(league: string, id: string, ticket: number): void {
    this.stopLive();
    const g = this.game;
    if (!g || g === 'loading' || g === 'error' || g.state !== 'in') return;
    this.liveTimer = setInterval(() => void this.refreshLive(league, id, ticket), LIVE_BEAT);
  }

  private async refreshLive(league: string, id: string, ticket: number): Promise<void> {
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const fresh = await loadGame(league, id);
      if (ticket !== this.opened) return;
      const old = this.game;
      // (the venue's photo found since: kept)
      if (old && old !== 'loading' && old !== 'error' && fresh.venue && old.venue?.image && !fresh.venue.image) fresh.venue.image = old.venue.image;
      this.game = fresh;
      if (fresh.state !== 'in') this.stopLive();
    } catch {
      // (a read that failed: the next beat tries again)
    }
  }

  private stopLive(): void {
    if (this.liveTimer) clearInterval(this.liveTimer);
    this.liveTimer = null;
  }

  togglePlays(i: number): void {
    if (!this.openPlays.delete(i)) this.openPlays.add(i);
  }

  private async eventId(league: string, ref: GameRef): Promise<string | null> {
    if ('event' in ref) return ref.event;
    if ('date' in ref) return findGameOn(league, ref.date, ref.names);
    const team = espnTeamId(league, ref.team);
    const opponent = espnTeamId(league, [ref.opponent]);
    return findGame(league, team, opponent, ref.home, ref.season, ref.nth);
  }
}

// A Recent dot's game: "@ Denver Broncos" the opponent and where; the nth meeting with them among the
// row's earlier dots (newest first)
export function recentRef(
  team: (string | undefined)[],
  vsList: (string | null)[] | undefined,
  index: number,
  season: number,
): GameRef | null {
  const vs = vsList?.[index];
  if (!vs) return null;
  const m = vs.match(/^(@|vs)\s+(.*)$/);
  const opponent = m ? m[2] : vs;
  const home = m ? m[1] === 'vs' : null;
  const nth = (vsList ?? []).slice(0, index).filter((v) => v === vs).length;
  return { team, opponent, home, season, nth };
}

// A name to match on: lower case, no accents, periods or suffixes ("Kenneth Walker III" -> "kenneth walker")
export function nameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}
