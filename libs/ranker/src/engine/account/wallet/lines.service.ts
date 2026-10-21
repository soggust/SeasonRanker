import { Injectable, computed, signal } from '@angular/core';
import { fetchJson } from '@ranker/core/http';
import { ESPN_LEAGUES } from '../../book/desk-math';
import { SummaryBox, liveStat } from '../../book/live-props';
import { EspnEvent, GameBoard, boardOf, espnDay, modelGameBoard, modelGameOf, withBestPrices } from './wallet-math';
import { PreviewProp, PropBetItem, RosterBody, athleteIdOf, previewPropsOf, rosterNames } from './preview-props';

const CORE = 'https://sports.core.api.espn.com/v2/sports';
// (a game's propBets pages read at most, and players looked up one by one past the rosters)
const PREVIEW_PAGES = 5;
const PREVIEW_LOOKUPS = 40;

// (a preview prop with its player's name and his team's abbreviation)
export interface PreviewRow extends PreviewProp {
  player: string;
  team: string;
}

// The bettor's betting board (libs/ranker/scripts/model/board.mjs, its header has the keys: data/model/
// board.json): every market it priced on the games not started, each side with its Kelly score and band
export type BoardBand = 'lock' | 'high' | 'medium' | 'low' | 'check';
export interface BoardSide {
  s: string;
  l: number | null;
  o: number;
  // (the book whose price o is, where the bettor shopped the US books for it: book-names.ts codes; none, the free
  // board's home-book price)
  pb?: string;
  c: number;
  ks: number;
  b: BoardBand;
  // (a guard's pass: its reason in words (board.mjs skipReason, DECISIONS.md D31: no silent skip))
  sr?: string;
  bot?: 'bet' | 'check';
  // (the desk's word on it as a suggestion, where the board carries one: false or 0 keeps it off the Book's
  // suggestions, 'practice' (or { practice: true }) tags it practice: suggestions.ts sugOf)
  sug?: unknown;
  // (the desk's cap on it: 'medium' where any bet on it would be a LIKE at most whatever its price (a gate's practice
  // stake, a role or research pick: picks.mjs capOf), cr its why; the band at any price held to it (DECISIONS.md D46))
  cap?: 'medium' | 'high';
  cr?: string;
  // (its why, on an edge side and the Bot's side (board.mjs w): the K-score popover's makings for a suggestion)
  w?: BoardWhy;
}
// A side's why on the board (board.mjs w): the Kelly's price and lean parts in points, the trust, the Bot's own and
// the Book's no-vig chance, fitted (ft) and the no-vig's source (fr), the terms that moved it most ([name, points of
// the margin or total; a prop's, percent of his projection]), a prop's projection, implied mean and usage, and the
// plain reason the desk writes for a bet (r, an edge side's)
export interface BoardWhy {
  pr: number;
  ln: number;
  t?: number;
  m: number;
  f: number;
  ft?: 1;
  fr?: 'pinnacle';
  tm?: [string, number][];
  mn?: number;
  im?: number;
  u?: [number, string];
  r?: string;
}
export interface BoardProp {
  n: string;
  id: string;
  t: string | null;
  k: string;
  lb: string;
  l: number;
  o: [number | null, number | null];
  // (the book whose price each side's is, [over's, under's], where the bettor shopped it (null a side not); not bk)
  pb?: [string | null, string | null];
  c: number | null;
  ks: [number | null, number | null];
  b: [BoardBand | null, BoardBand | null];
  sk?: 1;
  // (a skipped prop's why, where it's a CHECK the rule drops (checks.mjs shadowOf): the gap, or a role change
  // under the CHECK bar)
  sw?: 'gap' | 'small';
  // (every skip's reason in words, the guard's own (board.mjs skipReason, D31): the PASS tag's hover and the K
  // score's popover say it)
  sr?: string;
  bot?: string;
  bk?: 'bet' | 'check';
  // (the desk's word on it as a suggestion, as a game side's: suggestions.ts sugOf)
  sug?: unknown;
  // (the desk's cap on each side, [over's, under's], as a game side's cap; cr its why (D46))
  cap?: ['medium' | 'high' | null, 'medium' | 'high' | null];
  cr?: string;
  // (each side's why, [over's, under's], as a game side's w)
  w?: [BoardWhy | null, BoardWhy | null];
}
export interface BoardGame {
  id: string;
  start: string;
  m: string;
  a: [string, string];
  h: [string, string];
  k: { spread?: BoardSide[]; total?: BoardSide[]; ml?: BoardSide[] };
  p?: BoardProp[];
  // (when its game lines were last priced)
  at?: string;
  // (a bout's card, ESPN's event name: "UFC 333: Volkanovski vs. Evloev" (mma-desk.mjs); the Book's dropdown
  // names its card's row by it)
  card?: string;
  // (its card's city, ESPN's venue's: "Las Vegas" (mma-desk.mjs); the dropdown names a Fight Night's row by it)
  city?: string;
}
export interface ModelBoard {
  sport: string;
  at: string;
  games: BoardGame[];
}

// Every game's lines at the book, from ESPN's free scoreboard (the one the bettor reads when it has no Odds API
// key: espn.mjs linesOf), straight from the browser. A sport's day is asked for once a minute at most; the
// boards land in one signal (by "sport|event") so every board on the page updates together.
@Injectable({ providedIn: 'root' })
export class LinesService {
  private readonly days = new Map<string, { at: number; load: Promise<GameBoard[]> }>();
  private readonly all = signal(new Map<string, GameBoard>());
  // (each sport's day as last loaded: when, for the board's "as of")
  readonly loadedAt = signal<number | null>(null);
  // (each sport's betting board: asked for once on a page's visit, again after five minutes at most)
  private readonly models = new Map<string, { at: number; load: Promise<ModelBoard | null> }>();
  private readonly modelAll = signal(new Map<string, ModelBoard>());
  // (the betting boards as last loaded, by sport: the Book's suggestions read them, suggestions.ts)
  readonly modelBoards = this.modelAll.asReadonly();
  // The boards, by "sport|event": ESPN's scoreboard's, and under them the games on the bettor's own betting boards
  // that ESPN has no board for (a UFC bout: ESPN's scoreboard is the card, not the bout; the bettor's board.json
  // carries each bout's moneyline), each as a GameBoard of its lines (wallet-math modelGameBoard), so the game
  // view, the dropdown and the ticker take them as any game's. An ESPN board's prices the best US price where the
  // betting board shopped it at the same line (wallet-math withBestPrices: the owner, 2026-10-20). Made again when
  // either changes
  readonly boards = computed<Map<string, GameBoard>>(() => {
    const espn = this.all();
    const out = new Map(espn);
    const now = Date.now();
    for (const [sport, board] of this.modelAll()) {
      for (const g of board.games) {
        const key = `${sport}|${g.id}`;
        const free = out.get(key);
        if (free) {
          out.set(key, withBestPrices(free, g));
          continue;
        }
        const b = modelGameBoard(sport, g, now);
        if (b) out.set(key, b);
      }
    }
    return out;
  });

  // A game on its sport's betting board, as last loaded (none: not on it, begun, or not loaded yet)
  modelGame(sport: string, event: string): BoardGame | undefined {
    return modelGameOf(this.modelAll().get(sport)?.games, event);
  }

  // A sport's betting board (the bettor writes it hourly: kept five minutes)
  model(sport: string, maxAge = 5 * 60e3): Promise<ModelBoard | null> {
    const kept = this.models.get(sport);
    if (kept && Date.now() - kept.at < maxAge) return kept.load;
    const load = fetch(`/${sport}/data/model/board.json`, { cache: 'no-cache' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: ModelBoard | null) => {
        if (body?.games) this.modelAll.set(new Map(this.modelAll()).set(sport, body));
        return body;
      })
      .catch(() => null);
    this.models.set(sport, { at: Date.now(), load });
    return load;
  }

  board(sport: string, event: string): GameBoard | undefined {
    return this.boards().get(`${sport}|${event}`);
  }

  // A sport's games on a day (ESPN's day: US Eastern), fresh within the last minute
  day(sport: string, day: string, maxAge = 60e3): Promise<GameBoard[]> {
    const key = `${sport}|${day}`;
    const kept = this.days.get(key);
    if (kept && Date.now() - kept.at < maxAge) return kept.load;
    const load = fetch(`https://site.api.espn.com/apis/site/v2/sports/${ESPN_LEAGUES[sport]}/scoreboard?dates=${day}&limit=200`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { events?: EspnEvent[] } | null) => {
        const games = (body?.events ?? []).map((e) => boardOf(sport, e)).filter((g): g is GameBoard => !!g);
        const next = new Map(this.all());
        for (const g of games) next.set(`${sport}|${g.event}`, g);
        this.all.set(next);
        this.loadedAt.set(Date.now());
        return games;
      })
      .catch(() => {
        // (a scoreboard that won't load: tried again next time it's asked for)
        this.days.delete(key);
        return [] as GameBoard[];
      });
    this.days.set(key, { at: Date.now(), load });
    return load;
  }

  // A game's board, by its ESPN id and the day it starts on
  async game(sport: string, event: string, start: string, maxAge = 60e3): Promise<GameBoard | null> {
    await this.day(sport, espnDay(start), maxAge);
    return this.board(sport, event) ?? null;
  }

  // Many games at once: each sport's days asked for once
  async games(list: { sport: string; start: string }[], maxAge = 60e3): Promise<void> {
    const wanted = new Set(list.filter((g) => ESPN_LEAGUES[g.sport]).map((g) => `${g.sport}|${espnDay(g.start)}`));
    await Promise.all([...wanted].map((k) => this.day(k.split('|')[0], k.split('|')[1], maxAge)));
  }

  // ---------------------------------------------------------------------------
  // Preview props (preview-props.ts): the book's prop lines for a game the bot hasn't priced, off ESPN's core API
  // ---------------------------------------------------------------------------
  // (a game's, by "sport|event": asked for when its board opens without the bot's props, kept five minutes; the
  // teams' rosters and any player found apart kept for the visit)
  private readonly previews = new Map<string, { at: number; load: Promise<PreviewRow[] | null> }>();
  private readonly rosters = new Map<string, Promise<Map<string, string>>>();
  private readonly athleteNames = new Map<string, Promise<string | null>>();

  // A game's preview props, each with its player's name and team (his team's abbreviation, '' where he's on
  // neither roster); null when ESPN's board can't be read
  previewProps(sport: string, event: string, teams: { away: string; home: string }, maxAge = 5 * 60e3): Promise<PreviewRow[] | null> {
    const key = `${sport}|${event}`;
    const kept = this.previews.get(key);
    if (kept && Date.now() - kept.at < maxAge) return kept.load;
    const load = this.loadPreview(sport, event, teams).catch(() => null);
    load.then((rows) => rows === null && this.previews.get(key)?.load === load && this.previews.delete(key));
    this.previews.set(key, { at: Date.now(), load });
    return load;
  }

  private async loadPreview(sport: string, event: string, teams: { away: string; home: string }): Promise<PreviewRow[] | null> {
    const league = ESPN_LEAGUES[sport];
    if (!league || !/^[0-9]{1,20}$/.test(event)) return null;
    const [kind, lg] = league.split('/');
    // (every page, one at a time: a thousand items a page, five pages at most)
    const items: PropBetItem[] = [];
    for (let page = 1; page <= PREVIEW_PAGES; page++) {
      const res = await fetch(`${CORE}/${kind}/leagues/${lg}/events/${event}/competitions/${event}/odds/100/propBets?lang=en&region=us&limit=1000&page=${page}`);
      if (!res.ok) {
        if (page === 1) return res.status === 404 ? [] : null;
        break;
      }
      const body = (await res.json()) as { items?: PropBetItem[]; pageCount?: number };
      items.push(...(body.items ?? []));
      if (page >= (body.pageCount ?? 1)) break;
    }
    const props = previewPropsOf(sport, items);
    if (!props.length) return [];
    // (the players' names: the two rosters first, then any not on them by his own ref, a few at a time)
    const [away, home] = await Promise.all([this.roster(sport, teams.away), this.roster(sport, teams.home)]);
    const refs = new Map(items.map((it) => [athleteIdOf(it.athlete?.$ref), it.athlete?.$ref]));
    const missing = [...new Set(props.map((p) => p.athlete))].filter((id) => !away.has(id) && !home.has(id)).slice(0, PREVIEW_LOOKUPS);
    const found = new Map<string, string | null>();
    for (let i = 0; i < missing.length; i += 4) {
      await Promise.all(missing.slice(i, i + 4).map(async (id) => found.set(id, await this.athleteName(id, refs.get(id)))));
    }
    const rows: PreviewRow[] = [];
    for (const p of props) {
      const player = away.get(p.athlete) ?? home.get(p.athlete) ?? found.get(p.athlete) ?? null;
      if (!player) continue;
      rows.push({ ...p, player, team: away.has(p.athlete) ? teams.away : home.has(p.athlete) ? teams.home : '' });
    }
    return rows;
  }

  // (a team's roster as ESPN id to name: none when it can't be read)
  private roster(sport: string, abbr: string): Promise<Map<string, string>> {
    const key = `${sport}|${abbr}`;
    if (!abbr) return Promise.resolve(new Map());
    if (!this.rosters.has(key)) {
      const load = fetch(`https://site.api.espn.com/apis/site/v2/sports/${ESPN_LEAGUES[sport]}/teams/${abbr.toLowerCase()}/roster`)
        .then((res) => (res.ok ? res.json() : null))
        .then((body: RosterBody | null) => rosterNames(body))
        .catch(() => new Map<string, string>());
      // (an empty one asked for again next time)
      load.then((m) => !m.size && this.rosters.delete(key));
      this.rosters.set(key, load);
    }
    return this.rosters.get(key)!;
  }

  // (a player's name by his core API ref)
  private athleteName(id: string, ref: string | undefined): Promise<string | null> {
    if (!this.athleteNames.has(id)) {
      const url = ref ? ref.replace(/^http:/, 'https:') : null;
      this.athleteNames.set(
        id,
        url
          ? fetch(url)
              .then((res) => (res.ok ? res.json() : null))
              .then((b: { displayName?: string } | null) => b?.displayName ?? null)
              .catch(() => null)
          : Promise.resolve(null),
      );
    }
    return this.athleteNames.get(id)!;
  }

  // A prop's count so far (a game under way or over), from its game's box score (live-props.ts: the reading
  // the grader does); null when it isn't in it
  async propCounts(sport: string, event: string, props: { id: string; propType: string; athlete: string }[]): Promise<Map<string, number | null>> {
    const out = new Map<string, number | null>();
    const body = await fetchJson<SummaryBox | null>(`https://site.api.espn.com/apis/site/v2/sports/${ESPN_LEAGUES[sport]}/summary?event=${event}`, null);
    for (const p of props) out.set(p.id, liveStat(sport, p.propType, p.athlete, body));
    return out;
  }
}
