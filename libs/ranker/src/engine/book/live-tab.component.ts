import { Component, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { SPORT } from '@sport/sport';
import { logoUrl } from '../account/lists/lists-helpers';
import { canUse } from '../account/features';
import { GameBoard, PlayBet } from '../account/wallet/wallet-math';
import { WalletService } from '../account/wallet/wallet.service';
import { GameViewService } from '../game-view/game-view.service';
import { FightViewService } from './fight-view.service';
import type { GameView } from '../game-view/game.model';
import { teamLook } from '../team-look';
import { walkPlays } from './bet-impact';
import type { GameInfo } from './book-rows';
import { ESPN_LEAGUES } from './desk-math';
import { BetWatch, betWatch, shortPick, shortPickParts, sweatOf, withHurt } from './live-bets';
import { boardShare, cardState, clockWords, livePool, shortTeam, sparkPath, splitRead, startWords } from './live-games';
import { LiveBout, fightWatch, fightWords } from './live-mma';
import { betPickColor, hurtOf, impactBetOf, impactPlaysOf, propNowOf } from './live-view';
import { LiveGame, LiveService } from './live.service';
import type { Confidence } from './tiers';

// (the board's picks on a game, as the Book holds them (book-page.component liveBoards): its bets, and its
// suggestions at the latest price (suggestions.ts))
export interface LivePicks {
  betPicks: { pick: string; confidence: Confidence | null; strength?: string; odds?: string }[];
  suggestions?: { pick: string; confidence: Confidence | null; odds?: string }[];
}

interface LiveTeam {
  abbr: string;
  name: string;
  logo: string | null;
  // (ESPN's, where the site's own logo can't be read)
  espnLogo: string | null;
  chip: Record<string, string>;
  whiteLogo: boolean;
  score: string;
  unlit: string;
  lead: boolean;
  record: string | null;
  // (a fighter who won his bout: the WIN tag where a team's score would be)
  win?: boolean;
}

interface LiveBetRow {
  key: string;
  short: string;
  // (the short pick split round its one word, that word in its team's color (pick-style.ts, as the Book's); a
  // fight's row the words alone)
  parts?: [string, string, string];
  color?: string | null;
  w: BetWatch;
}

// (one game's card: the game, its two teams, its sparkline and last play (the summary's, a game with the user's
// bets), the bets on it as rows, or the line that says there are none)
interface LiveCard {
  key: string;
  sport: string;
  event: string;
  league: string;
  where: string | null;
  clock: string;
  live: boolean;
  // (a UFC bout: no modal to open (ESPN has no summary of a bout the game view can read), so not a button)
  fight: boolean;
  teams: [LiveTeam, LiveTeam];
  spark: string | null;
  last: { clock: string | null; text: string; tone: 'good' | 'bad' | null } | null;
  bets: LiveBetRow[];
  noBets: string | null;
  aria: string;
}

// The Live tab (book-page.component's Live view): one card, full width, on the chalkboard with the Book's chalked
// betting art. Its bar: ON NOW with the blinking live dot (UPCOMING with a steady orange one when nothing's on
// yet; ALL DONE TONIGHT, grey, when nothing's left), the sweat summary over the user's bets on the live games
// (winning, close, losing), and the All games / My bets pill. Its body: a card per game on the scoreboard (the
// user's games first), each a button that opens the game's modal (the existing game view, this sport's or
// another's); the clock, the two teams on LED digits, the win-probability sparkline as far as the game has gone
// and the last play (both from the game's summary, read only for games with the user's bets), and a row per bet
// with its meter and status. Nothing's fetched here that the page doesn't already: live.service.ts
@Component({
  selector: 'live-tab',
  templateUrl: './live-tab.component.html',
  styleUrls: ['../../styles/components/live-tab.scss'],
  standalone: false,
})
export class LiveTabComponent implements OnInit, OnDestroy {
  // (the board's picks by game key, "sport|matchup": the bot's read on a game without the user's bets)
  @Input() boards: Map<string, LivePicks> = new Map();
  // (each game's venue, by the same key: the picks' (book-rows GameInfo))
  @Input() places: Map<string, GameInfo> = new Map();

  readonly live = inject(LiveService);
  readonly wallet = inject(WalletService);
  readonly games = inject(GameViewService);
  readonly canUse = canUse;

  // All games, or the games the user has a bet on
  show: 'all' | 'mine' = 'all';

  ngOnInit(): void {
    this.live.start();
  }

  ngOnDestroy(): void {
    this.live.stop();
  }

  // The card's state: games on, none on but some to come, or none left; and the first start still to come
  get state(): 'live' | 'upcoming' | 'done' {
    return cardState(this.live.games()).state;
  }
  get firstStart(): string | null {
    return cardState(this.live.games()).firstStart;
  }
  get title(): string {
    const s = this.state;
    return s === 'live' ? 'On now' : s === 'upcoming' ? 'Upcoming' : 'All done tonight';
  }
  // (the quiet bar's words: when the first game tips off; nothing left, no next time to name (the board has no
  // real next-update time to give))
  get note(): { text: string; time: string | null } | null {
    const s = this.state;
    if (s === 'upcoming') return { text: 'Nothing on right now. First tip-off at ', time: this.firstStart ? startWords(this.firstStart) : null };
    if (s === 'done') return { text: 'No games left.', time: null };
    return null;
  }

  // (the My bets filter: for someone who can bet; signed out there's nothing to filter by)
  get canFilter(): boolean {
    return canUse('book') && this.wallet.loaded() && !!this.wallet.wallet();
  }

  // The sweat summary: the user's bets on the games under way, how many are winning, close and losing
  get sweat(): { winning: number; close: number; losing: number } {
    return sweatOf(this.cards.filter((c) => c.live).flatMap((c) => c.bets.map((b) => b.w)));
  }

  // The cards: the live games (the user's first) in the live state, today's games to come otherwise; built again
  // only when the games, the bets, the summaries, the filter or the boards change
  private cardsFor: { games: unknown; bets: unknown; summaries: unknown; show: string; boards: unknown; cards: LiveCard[] } | null = null;
  get cards(): LiveCard[] {
    const games = this.live.games();
    const bets = this.live.betsByGame();
    const summaries = this.live.summaries();
    const f = this.cardsFor;
    if (f && f.games === games && f.bets === bets && f.summaries === summaries && f.show === this.show && f.boards === this.boards) return f.cards;
    const state = cardState(games).state;
    const pool = livePool(games);
    const mine = (g: GameBoard) => (bets.get(`${g.sport}|${g.event}`)?.length ?? 0) > 0;
    const shown = this.show === 'mine' && state === 'live' ? pool.filter(mine) : pool;
    const cards = shown
      .map((g) => this.card(g, bets.get(`${g.sport}|${g.event}`) ?? [], summaries.get(`${g.sport}|${g.event}`)))
      .sort((a, b) => Number(!!b.bets.length) - Number(!!a.bets.length));
    this.cardsFor = { games, bets, summaries, show: this.show, boards: this.boards, cards };
    return cards;
  }

  private card(g: LiveGame, bets: PlayBet[], summary: GameView | undefined): LiveCard {
    if (g.fight) return this.bout(g as LiveBout, bets);
    const live = g.state === 'in';
    const share = boardShare(g);
    const read = { as: g.away.score ?? 0, hs: g.home.score ?? 0, state: g.state, final: g.final, share, away: g.away.abbr, home: g.home.abbr };
    const lead = (g.away.score ?? 0) - (g.home.score ?? 0);
    const team = (t: GameBoard['away'], side: 'away' | 'home'): LiveTeam => {
      const look = teamLook(g.sport, { abbr: t.abbr });
      const own = look.logo ? (g.sport === SPORT.id ? (SPORT.cardLogo ? SPORT.cardLogo(look.logo) : look.logo) : logoUrl(g.sport, look.logo)) : null;
      const score = g.state === 'pre' || t.score === null ? '' : String(t.score);
      const st = summary ? (side === 'away' ? summary.away : summary.home) : null;
      return { abbr: t.abbr, name: shortTeam(t.name), logo: own ?? t.logo, espnLogo: t.logo, chip: look.chip, whiteLogo: look.whiteLogo, score, unlit: '8'.repeat(score.length), lead: live && (side === 'away' ? lead > 0 : lead < 0), record: st?.record ?? null };
    };
    const rows: LiveBetRow[] = bets.map((b) => ({
      key: b.id,
      short: shortPick(b),
      parts: shortPickParts(b),
      color: betPickColor(b, summary, { away: g.away.abbr, home: g.home.abbr }),
      // (his injury tag over the status, where he's hurt: the summary's plays and rulings, as the game view reads them)
      w: withHurt(betWatch(b, read, summary ? propNowOf(b, summary) : null), summary ? hurtOf(b, summary) : null),
    }));
    // (the last play, tinted when it moved one of the user's bets: bet-impact over the summary's plays)
    let last: LiveCard['last'] = null;
    let spark: string | null = null;
    if (summary && live) {
      const plays = impactPlaysOf(summary);
      const p = plays[plays.length - 1];
      if (p) {
        const walked = walkPlays(plays, bets.map((b) => impactBetOf(b, summary)), (ib) => (ib.market === 'prop' ? propNowOf({ market: 'prop', propType: ib.propType, athlete: ib.athlete }, summary) : null));
        const impacts = walked[walked.length - 1]?.impacts ?? [];
        last = { clock: p.ref.clock ?? p.when, text: p.text, tone: impacts.some((i) => i.impact === 'bad') ? 'bad' : impacts.some((i) => i.impact === 'good') ? 'good' : null };
      }
      spark = summary.winProbability ? sparkPath(summary.winProbability, share) || null : null;
    }
    const on = this.boards.get(`${g.sport}|${g.matchup}`);
    const read2 = splitRead(on?.betPicks ?? [], on?.suggestions ?? []);
    // (the bot's read when it has one; nothing at all when it has no pick (the owner: no "Bot: no pick" line))
    const noBets = rows.length || !read2 ? null : g.state === 'pre' ? `Bot: ${read2}` : `No tickets · bot: ${read2}`;
    const info = this.places.get(`${g.sport}|${g.matchup}`);
    return {
      key: `${g.sport}|${g.event}`,
      sport: g.sport,
      event: g.event,
      league: ESPN_LEAGUES[g.sport],
      where: summary?.venue?.name ?? info?.stadium ?? info?.city ?? null,
      clock: clockWords(g),
      live,
      fight: false,
      teams: [team(g.away, 'away'), team(g.home, 'home')],
      spark,
      last,
      bets: rows,
      noBets,
      aria: `${g.away.name} at ${g.home.name}, ${clockWords(g)}`,
    };
  }

  // A UFC bout's card: the two fighters (names, the board's headshots, records; the winner's WIN tag once it's over),
  // the bout's state (its start, "R2 3:14", how it ended "KO R1 2:05"), the user's bets on it and the bot's read;
  // no LED score, sparkline or last play (no score, no win probability, no summary)
  private bout(g: LiveBout, bets: PlayBet[]): LiveCard {
    const f = g.fight;
    const live = g.state === 'in';
    const clock = fightWords(g);
    const side = (t: GameBoard['away'], which: 'away' | 'home'): LiveTeam => {
      const win = g.state === 'post' && f.winner === which;
      return { abbr: t.abbr || t.name, name: t.name, logo: t.logo, espnLogo: null, chip: {}, whiteLogo: false, score: '', unlit: '', lead: false, record: f.records[which === 'away' ? 0 : 1], win };
    };
    const rows: LiveBetRow[] = bets.map((b) => ({ key: b.id, short: shortPick(b), w: fightWatch(b, g) }));
    const mine = this.boards.get(`mma|${g.matchup}`);
    const read = splitRead(mine?.betPicks ?? [], mine?.suggestions ?? []);
    const noBets = rows.length || !read ? null : g.state === 'pre' ? `Bot: ${read}` : `No tickets · bot: ${read}`;
    return {
      key: `mma|${g.event}`,
      sport: 'mma',
      event: g.event,
      league: ESPN_LEAGUES['mma'],
      where: f.weight,
      clock,
      live,
      fight: true,
      teams: [side(g.away, 'away'), side(g.home, 'home')],
      spark: null,
      last: null,
      bets: rows,
      noBets,
      aria: `${g.away.name} against ${g.home.name}${f.weight ? `, ${f.weight}` : ''}, ${clock}`,
    };
  }

  // A card clicked: the game's modal (the existing game view, by ESPN's league for its sport); a bout's its fight view
  // (fight-view.service.ts; the owner, 2026-10-26)
  private readonly fightView = inject(FightViewService);
  open(c: LiveCard): void {
    if (c.fight) {
      this.fightView.open({ event: c.event, start: this.live.bouts().find((b) => b.event === c.event)?.start ?? null });
      return;
    }
    void this.games.open({ event: c.event }, null, c.league);
  }

  // (a logo that won't load: ESPN's in its place, once; neither, nothing)
  fallback(event: Event, espn: string | null): void {
    const img = event.target as HTMLImageElement;
    if (espn && img.src !== espn && !img.dataset['fell']) {
      img.dataset['fell'] = '1';
      img.src = espn;
    } else img.style.visibility = 'hidden';
  }
}
