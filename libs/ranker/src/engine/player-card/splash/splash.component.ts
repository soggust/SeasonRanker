// The Overview's splash: the card's top, edge to edge, a lit stage in the team's colors. Two stages, the same in
// every scene, only the props change: a season still being played is the LOCKER (a team's key players' lockers,
// or a player's own), a finished one is the SHELF (up to three props, the most meaningful in the middle). The
// card's season becomes a scene in splash.scene.ts; this gathers what it reads (the card, its season's splash
// data, a team's depth chart) and draws it. Loaded lazily (splash-host.component.ts): the art is its own chunk.
import { ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, ViewEncapsulation, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { SPORT } from '@sport/sport';
import * as teamColors from '@sport/team-colors';
import { isLiveSeason } from '@ranker/engine/data';
import type { PlayerCard } from '../card.model';
import type { PlayerCards } from '../player-cards';
import type { DepthPlayer, DepthView } from '../depth-chart';
import { SplashPiece } from './splash-piece.component';
import { RosterPlayer, Scene, SceneInput, buildScene } from './splash.scene';
import { SplashData, splashData } from './splash.data';
import { HELMETS, KitColors, SIGNATURE_SHOES, uniformFor } from './splash.uniforms';

type Kit = 'home' | 'away' | 'alt';
type Cut = 'football' | 'basketball' | 'baseball';

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
  @Input({ required: true }) card!: PlayerCard;
  @Input({ required: true }) cards!: PlayerCards;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly host = inject(ElementRef<HTMLElement>);
  private data = new Map<number, SplashData | 'loading'>();
  private built: Built | null = null;
  tip: { text: string; x: number; y: number } | null = null;
  private tipTimer: ReturnType<typeof setTimeout> | null = null;

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
    return (this.card.player.teamLogo ?? '').split('/').pop()!.replace(/\.\w+$/, '');
  }

  private get current(): boolean {
    return isLiveSeason(this.card.season);
  }

  // The scene for the card as it is now (its season's data, or a team's roster, may still be on its way)
  get view(): Scene | null {
    const c = this.card;
    const tab = this.tab;
    const team = !!SPORT.teamTabs?.includes(tab);
    // (no splash: an unranked season, a coach's card)
    if (c.ur || tab === SPORT.coachTab) return null;
    const data = this.seasonData(c.season);
    const depth = team && this.current && SPORT.depthChart?.has(c.player, tab, c.season) ? this.cards.depthChart(c) : null;
    const key = [tab, c.player.gsisId, c.season, data ? 1 : 0, typeof depth === 'object' && depth ? 1 : 0].join('/');
    if (this.built?.key !== key) this.built = { key, scene: buildScene(this.input(team, data, typeof depth === 'object' ? depth : null)) };
    return this.built.scene;
  }

  // (a season's splash data, read once; the card drawn again when it's in)
  private seasonData(season: number): SplashData | null {
    const got = this.data.get(season);
    if (got === undefined) {
      this.data.set(season, 'loading');
      splashData(season).then((d) => {
        this.data.set(season, d);
        this.cdr.markForCheck();
      });
      return null;
    }
    return got === 'loading' ? null : got;
  }

  private input(team: boolean, data: SplashData | null, depth: DepthView | null): SceneInput {
    const c = this.card;
    const id = c.player.gsisId;
    const key = this.teamKey;
    // (his best two stats so far, by where they rank)
    const stats = c.groups.flatMap((g) => g.stats).filter((s) => !s.dots && s.display && s.trait && s.pct !== null).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
    const fighter = SPORT.id === 'mma';
    const raw = c.player.stats as Record<string, number | null | undefined>;
    return {
      sport: SPORT.id,
      tab: this.tab,
      id,
      season: c.season,
      seasonLabel: SPORT.seasonText(c.season),
      current: this.current,
      team,
      name: c.name,
      teamName: team ? c.name : c.teamName ?? '',
      abbr: TEAMS[key]?.[0] ?? key,
      awards: c.awards,
      outcome: data?.outcomes[key] ?? null,
      number: data?.numbers[id] ?? null,
      bestGame: data?.bestGames[id] ?? null,
      milestone: data?.milestones[id] ?? null,
      // (his line on the tape: a fighter's record, else his card's first two headline stats)
      tape: fighter ? `${raw['wins'] ?? 0}–${raw['losses'] ?? 0} · ${raw['finishes'] ?? 0} finishes` : stats.slice(0, 2).map((s) => `${s.display} ${s.label}`).join(' · '),
      shoe: SPORT.id === 'nba' ? SIGNATURE_SHOES[c.name] ?? null : null,
      roster: depth ? rosterOf(depth, this.tab, data?.numbers ?? {}) : undefined,
      division: fighter ? SPORT.positionNames[this.tab] : undefined,
      record: fighter ? `${raw['wins'] ?? 0}–${raw['losses'] ?? 0}` : undefined,
      helmet: HELMETS[key],
    };
  }

  // The team's colors: its own two that season's (its look's era colors are folded in), a dark third
  get colors(): [string, string, string] {
    if (SPORT.id === 'mma') return ['#b8001f', '#d9a520', '#111111'];
    const t = TEAMS[this.teamKey];
    return [t?.[2] ?? this.card.look.accent, t?.[3] ?? this.card.look.other, this.card.look.deep];
  }

  get vars(): Record<string, string> {
    const [c1, c2, c3] = this.colors;
    return { ...this.card.look.hero, '--c1': c1, '--c2': c2, '--c3': c3 };
  }

  get mood(): string {
    const t = this.view;
    if (!t || t.stage === 'locker') return 'cool';
    const pieces = t.items.map((i) => i.t);
    return pieces.includes('pass') ? 'sunset' : pieces.includes('golfbag') ? 'warm' : ['lombardi', 'stanley', 'obrien', 'commish'].some((p) => pieces.includes(p)) ? 'gold' : 'cool';
  }

  get logo(): string {
    return this.card.logo;
  }

  get cut(): Cut {
    return SPORT.id === 'nba' ? 'basketball' : SPORT.id === 'mlb' ? 'baseball' : 'football';
  }

  // A jersey's colors: what the team wore that season (UNIFORM_ERAS), else from its colors: home the team
  // color, away white, the alternate its dark one
  kit(kit: Kit): KitColors & { stripe: string } {
    const worn = uniformFor(this.teamKey, this.card.season, kit);
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

  // (a long name in smaller letters, to fit across the shoulders: never squeezed)
  nameSize(name: string): number {
    return Math.min(9.5, +(66 / (name.length * 0.62)).toFixed(2));
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

// A team locker's players, from its depth chart: the side the card is about (the defense's, the five linemen,
// else the first: the offense, a lineup), each slot's starter, the key one first (a quarterback; else the most
// used), each with his number when the season's numbers have him
function rosterOf(view: DepthView, tab: string, numbers: Record<string, string>): RosterPlayer[] {
  const side = tab === 'DEF' ? view.sides.find((s) => /def/i.test(s.id + s.title)) ?? view.sides[1] : view.sides[0];
  let slots = (side?.slots ?? []).filter((s) => !s.sub && s.depth[0]);
  if (tab === 'OL') {
    const line = ['C', 'RG', 'LG', 'RT', 'LT'];
    slots = slots.filter((s) => line.includes(s.label)).sort((a, b) => line.indexOf(a.label) - line.indexOf(b.label));
  } else if (SPORT.id === 'nfl' && tab === 'TM') {
    // (a team's offense leaders: the quarterback, the backs and receivers, the tight end; not the line)
    const order = ['QB', 'RB', 'WR', 'TE', 'FB'];
    const rank = (s: { label: string; group?: string }) => order.findIndex((o) => (s.group ?? s.label).startsWith(o));
    slots = slots.filter((s) => rank(s) >= 0).sort((a, b) => rank(a) - rank(b) || (b.depth[0].snaps ?? 0) - (a.depth[0].snaps ?? 0));
  } else {
    slots = [...slots].sort((a, b) => (b.depth[0].snaps ?? 0) - (a.depth[0].snaps ?? 0));
  }
  const seen = new Set<string>();
  const out: RosterPlayer[] = [];
  for (const s of slots) {
    const p: DepthPlayer = s.depth[0];
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push({ name: p.name, pos: tab === 'OL' ? s.label : s.group ?? s.label, num: numbers[p.link?.gsisId ?? p.id] ?? numbers[p.id] ?? null });
  }
  return out.slice(0, 7);
}
