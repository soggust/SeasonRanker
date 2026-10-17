// The Overview's splash: the card's top, edge to edge, a lit stage in the team's colors. Three stages, the same
// in every scene, only the props change: a season still being played is the LOCKER (a team's key players'
// lockers, or a player's own stall with his gear in it), a finished one is the SHELF (up to three props, the
// most meaningful in the middle), a head coach's card is his OFFICE. The card's season becomes a scene in
// splash.scene.ts; this gathers what it reads (the card, its season's splash data, a team's depth chart) and
// draws it. Loaded lazily (splash-host.component.ts): the art is its own chunk.
//
// A `preset` draws a scene given to it instead of a card's (the gallery, ?gallery=: every jersey, prop and
// stage, for checking the art).
import { ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, ViewEncapsulation, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { SPORT } from '@sport/sport';
import * as teamColors from '@sport/team-colors';
import { isLiveSeason } from '@ranker/engine/data';
import type { PlayerCard } from '../card.model';
import type { PlayerCards } from '../player-cards';
import type { DepthView } from '../depth-chart';
import { SplashPiece } from './splash-piece.component';
import { RosterPlayer, Scene, SceneInput, buildScene } from './splash.scene';
import { SplashData, splashData } from './splash.data';
import { rosterOf } from './splash.roster';
import { KitColors, SIGNATURE_SHOES, helmetFor, uniformFor } from './splash.uniforms';

type Kit = 'home' | 'away' | 'alt';
export type Cut = 'football' | 'basketball' | 'baseball' | 'hockey';
export type FullKit = KitColors & { stripe: string };

// A scene handed in whole (the gallery): the scene, the team it's drawn for (its logo name, the season for its
// uniform), the logo, and the colors
export interface SplashPreset {
  scene: Scene;
  team: string;
  season: number;
  logo: string;
  colors?: [string, string, string];
  hero?: Record<string, string>;
  cut?: Cut;
}

let fontsAdded = false;

// (each sport's team colors, by the team's logo name: [abbreviation, ESPN id, color, second color]; MMA has none)
const TEAMS = (Object.entries(teamColors).find(([name]) => name === 'TEAMS')?.[1] ?? {}) as Record<string, [string, string, string, string]>;

// A card's splash, by what it's built from (built again only when one of them changes)
interface Built {
  key: string;
  scene: Scene | null;
}

@Component({
  selector: 'card-splash',
  standalone: true,
  imports: [NgTemplateOutlet, SplashPiece],
  templateUrl: './splash.component.html',
  styleUrl: './splash.component.scss',
  // (its pieces are their own component, drawn with these styles; every class is sp-)
  encapsulation: ViewEncapsulation.None,
})
export class CardSplash implements OnDestroy {
  @Input() card!: PlayerCard;
  @Input() cards!: PlayerCards;
  @Input() preset: SplashPreset | null = null;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly host = inject(ElementRef<HTMLElement>);
  private data = new Map<string, SplashData | 'loading'>();
  private built: Built | null = null;
  tip: { text: string; x: number; y: number } | null = null;
  private tipTimer: ReturnType<typeof setTimeout> | null = null;

  // (a baseball jersey's pinstripes, a line every 8; the placket's buttons)
  readonly pins = Array.from({ length: 17 }, (_, i) => -4 + i * 8);
  readonly buttons = [40, 56, 72, 88, 104, 120, 136];

  constructor() {
    if (!fontsAdded && typeof document !== 'undefined') {
      fontsAdded = true;
      // (the splash's own type, subset to the characters it uses and self-hosted: an engraved serif, a
      // condensed block, a ticket mono and a marker; about 80 KB, fetched with the splash)
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'assets/fonts/splash/faces.css';
      document.head.appendChild(link);
    }
  }

  ngOnDestroy(): void {
    if (this.tipTimer) clearTimeout(this.tipTimer);
  }

  private get tab(): string {
    return this.cards.tabPosition;
  }

  private get teamKey(): string {
    if (this.preset) return this.preset.team;
    return (this.card.player.teamLogo ?? '').split('/').pop()!.replace(/\.\w+$/, '');
  }

  private get season(): number {
    return this.preset ? this.preset.season : this.card.season;
  }

  private get current(): boolean {
    return isLiveSeason(this.card.season);
  }

  // The scene for the card as it is now (its season's data, or a team's roster, may still be on its way)
  get view(): Scene | null {
    if (this.preset) return this.preset.scene;
    const c = this.card;
    const tab = this.tab;
    const team = !!SPORT.teamTabs?.includes(tab);
    const coach = tab === SPORT.coachTab;
    // (no splash: an unranked season)
    if (c.ur) return null;
    const data = this.seasonData(c.season);
    const depth = team && this.current && SPORT.depthChart?.has(c.player, tab, c.season) ? this.cards.depthChart(c) : null;
    const key = [tab, c.player.gsisId, c.season, data ? 1 : 0, typeof depth === 'object' && depth ? 1 : 0].join('/');
    if (this.built?.key !== key) this.built = { key, scene: buildScene(this.input(team, coach, data, typeof depth === 'object' ? depth : null)) };
    return this.built.scene;
  }

  // (a season's splash data for the card's tab, read once; the card drawn again when it's in)
  private seasonData(season: number): SplashData | null {
    const key = `${season}/${this.tab}`;
    const got = this.data.get(key);
    if (got === undefined) {
      this.data.set(key, 'loading');
      splashData(season, this.tab).then((d) => {
        this.data.set(key, d);
        this.cdr.markForCheck();
      });
      return null;
    }
    return got === 'loading' ? null : got;
  }

  private input(team: boolean, coach: boolean, data: SplashData | null, depth: DepthView | null): SceneInput {
    const c = this.card;
    const id = c.player.gsisId;
    const key = this.teamKey;
    // (his best two stats so far, by where they rank)
    const stats = c.groups.flatMap((g) => g.stats).filter((s) => !s.dots && s.display && s.trait && s.pct !== null).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
    const fighter = SPORT.id === 'mma';
    const raw = c.player.stats as Record<string, number | null | undefined>;
    // (a coach's record: his wins and losses, the ties when there were any)
    const wl = coach && raw['wins'] !== undefined ? `${raw['wins'] ?? 0}-${raw['losses'] ?? 0}${raw['ties'] ? `-${raw['ties']}` : ''}` : undefined;
    return {
      sport: SPORT.id,
      tab: this.tab,
      id,
      season: c.season,
      seasonLabel: SPORT.seasonText(c.season),
      current: this.current,
      team,
      coach,
      name: c.name,
      teamName: team ? c.name : c.teamName ?? '',
      abbr: TEAMS[key]?.[0] ?? key,
      awards: c.awards,
      outcome: data?.outcomes[key] ?? null,
      number: data?.numbers[id] ?? null,
      bestGame: data?.bestGames[id] ?? (team ? data?.outcomes[key]?.gameBall : null) ?? null,
      milestone: data?.milestones[id] ?? null,
      // (his line on the tape: a fighter's record, else his card's first two headline stats)
      tape: fighter ? `${raw['wins'] ?? 0}–${raw['losses'] ?? 0} · ${raw['finishes'] ?? 0} finishes` : stats.slice(0, 2).map((s) => `${s.display} ${s.label}`).join(' · '),
      shoe: SPORT.id === 'nba' ? SIGNATURE_SHOES[c.name] ?? null : null,
      roster: depth ? rosterOf(SPORT.id, depth, this.tab, data?.numbers ?? {}, data?.lockers[key] ?? null) : undefined,
      division: fighter ? SPORT.positionNames[this.tab] : undefined,
      record: fighter ? `${raw['wins'] ?? 0}–${raw['losses'] ?? 0}` : wl,
      helmet: helmetFor(key, c.season),
    };
  }

  // The team's colors: its own two that season's (its look's era colors are folded in), a dark third
  get colors(): [string, string, string] {
    if (this.preset?.colors) return this.preset.colors;
    if (SPORT.id === 'mma') return ['#b8001f', '#d9a520', '#111111'];
    const t = TEAMS[this.teamKey];
    if (this.preset) return [t?.[2] ?? '#555', t?.[3] ?? '#ccc', '#1a1a1a'];
    return [t?.[2] ?? this.card.look.accent, t?.[3] ?? this.card.look.other, this.card.look.deep];
  }

  get vars(): Record<string, string> {
    const [c1, c2, c3] = this.colors;
    const hero = this.preset ? this.preset.hero ?? { '--team-hi': c1, '--team-lo': c3, '--team-accent': c1 } : this.card.look.hero;
    return { ...hero, '--c1': c1, '--c2': c2, '--c3': c3 };
  }

  get mood(): string {
    const t = this.view;
    if (!t || t.stage === 'locker') return 'cool';
    if (t.stage === 'office') return 'office';
    const pieces = t.items.map((i) => i.t);
    return pieces.includes('pass') ? 'sunset' : pieces.includes('golfbag') ? 'warm' : ['lombardi', 'stanley', 'obrien', 'commish'].some((p) => pieces.includes(p)) ? 'gold' : 'cool';
  }

  get logo(): string {
    return this.preset ? this.preset.logo : this.card.logo;
  }

  // Each sport's jersey cut: football, the basketball tank, the hockey sweater, the baseball button-front
  get cut(): Cut {
    return this.preset?.cut ?? cutOf(SPORT.id);
  }

  // A jersey's colors and details: what the team wore that season (UNIFORM_ERAS), else from its colors: home
  // the team color, away white, the alternate its dark one
  kit(kit: Kit): FullKit {
    const worn = uniformFor(this.teamKey, this.season, kit);
    if (worn) return { ...worn, stripe: worn.stripe ?? worn.outline };
    const [c1, c2, c3] = this.colors;
    const k: KitColors =
      kit === 'away'
        ? { body: '#f3f2ee', num: c1, outline: c2, name: c1, collar: c2, sleeve: 'stripes' }
        : kit === 'alt'
          ? { body: c3, num: c1, outline: c2, name: '#ffffff', collar: c2, sleeve: 'stripes' }
          : { body: c1, num: '#ffffff', outline: c2, name: '#ffffff', collar: c2, sleeve: 'stripes' };
    return { ...k, stripe: k.outline };
  }

  // A football sleeve's bands, top to bottom (y along the sleeve's top edge; the band slants down toward the
  // body): the kit's list, else the classic set, the stripe color either side of the second
  bands(k: FullKit): { color: string; y: number; w: number }[] {
    const list = k.bands?.length ? k.bands : k.stripe2 ? [k.stripe, k.stripe2, k.stripe] : [k.stripe, k.stripe];
    const w = Math.min(3.4, 11 / list.length);
    const gap = list.length > 2 ? 0.5 : 2.2;
    const total = list.length * w + (list.length - 1) * gap;
    const start = 43 - total / 2;
    return list.map((color, i) => ({ color, y: start + i * (w + gap) + w / 2, w }));
  }

  // A hockey sweater's arm bands, top to bottom down the forearm: the kit's list, else its stripe colors
  hockeyBands(k: FullKit): { color: string; y: number; h: number }[] {
    const list = k.bands?.length ? k.bands : k.sleeve === 'stripes' ? (k.stripe2 ? [k.stripe, k.stripe2, k.stripe] : [k.stripe]) : [];
    const h = list.length === 1 ? 9 : list.length === 2 ? 5.5 : 4.2;
    const gap = 1.6;
    let y = 96 - (list.length * h + (list.length - 1) * gap) / 2;
    return list.map((color) => {
      const band = { color, y, h };
      y += h + gap;
      return band;
    });
  }

  // The hem's stripes, top to bottom: the kit's list; a sweater without one repeats its arm bands, a tank without
  // one has a band of its trim color
  hems(k: FullKit, cut: Cut): { color: string; y: number; h: number }[] {
    const list = k.hem?.length ? k.hem : cut === 'hockey' ? this.hockeyBands(k).map((b) => b.color) : k.sleeve === 'stripes' || k.stripe ? [k.stripe || k.collar] : [];
    const h = cut === 'basketball' ? 3.5 : list.length === 1 ? 7 : list.length === 2 ? 5 : 4;
    const gap = 1.4;
    let y = cut === 'basketball' ? 131 : 140 - 4 - (list.length * h + (list.length - 1) * gap);
    return list.map((color) => {
      const band = { color, y, h };
      y += h + gap;
      return band;
    });
  }

  // (a long name in smaller letters, to fit across the shoulders: never squeezed)
  nameSize(name: string): number {
    return Math.min(9.5, +(66 / (name.length * 0.62)).toFixed(2));
  }

  // (a baseball wordmark across the chest: bigger, the same rule)
  markSize(mark: string): number {
    return Math.min(16, +(84 / (mark.length * 0.6)).toFixed(2));
  }

  // A tap on a prop or a stall: its name, over it, for a few seconds (a touch screen has no hover)
  tap(event: MouseEvent): void {
    const target = (event.target as Element).closest('[data-tip]');
    if (this.tipTimer) clearTimeout(this.tipTimer);
    if (!target) {
      this.tip = null;
      return;
    }
    const box = target.getBoundingClientRect();
    const stage = (this.host.nativeElement as HTMLElement).getBoundingClientRect();
    this.tip = { text: target.getAttribute('data-tip') ?? '', x: box.left + box.width / 2 - stage.left, y: Math.max(8, box.top - stage.top + 8) };
    this.tipTimer = setTimeout(() => {
      this.tip = null;
      this.cdr.markForCheck();
    }, 3500);
  }
}

// The jersey cut each sport wears
export function cutOf(sport: string): Cut {
  return sport === 'nba' ? 'basketball' : sport === 'mlb' ? 'baseball' : sport === 'nhl' ? 'hockey' : 'football';
}

