// The Overview's splash: the card's top, edge to edge, a lit stage in the team's colors. Three stages, the same
// in every scene, only the props change: a season still being played is the LOCKER (a team's key players'
// lockers, or a player's own stall with his gear in it), a finished one is the SHELF (up to three props, the
// most meaningful in the middle), a head coach's card is his OFFICE. The card's season becomes a scene in
// splash.scene.ts; this gathers what it reads (the card, its season's splash data, a team's depth chart) and
// draws it. Loaded lazily (splash-host.component.ts): the art is its own chunk.
//
// A `preset` draws a scene given to it instead of a card's (the gallery, ?gallery=: every jersey, prop and
// stage, for checking the art).
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, ViewEncapsulation, inject } from '@angular/core';
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
import { Box, HI_DPI, JerseyAnchors, NAMEPLATE, OUTLINED_FACES, PROP_IMAGES, Sleeve, jerseyAnchors, nameSize, numberSize, propHref } from './splash.images';
import { loadSplashFonts } from './splash-fonts';

type Kit = 'home' | 'away' | 'alt';
// (how long the stage waits for the season's data before drawing without it)
const WAIT_MS = 600;
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
  // (drawn again only when its card changes, its season's data lands (markForCheck) or a tap: never on the
  // page's other events; and what the template reads is built once per scene, below)
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardSplash implements OnDestroy {
  @Input() card!: PlayerCard;
  @Input() cards!: PlayerCards;
  @Input() preset: SplashPreset | null = null;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly host = inject(ElementRef<HTMLElement>);
  private data = new Map<string, SplashData | 'loading'>();
  private built: Built | null = null;
  // (the kits and their drawn bands, once each: a team locker reads them for seven jerseys every check)
  private kits = new Map<string, FullKit>();
  private bandArt = new WeakMap<FullKit, Map<string, unknown>>();
  private varsFor: { key: string; vars: Record<string, string> } | null = null;
  tip: { text: string; x: number; y: number } | null = null;
  private tipTimer: ReturnType<typeof setTimeout> | null = null;

  // (a baseball jersey's pinstripes, a line every 8; the placket's buttons)
  readonly pins = Array.from({ length: 17 }, (_, i) => -4 + i * 8);
  readonly buttons = [40, 56, 72, 88, 104, 120, 136];

  constructor() {
    // (the splash's type: usually in already, fetched at idle with the chunk; the gallery comes here first)
    loadSplashFonts();
  }

  ngOnDestroy(): void {
    if (this.tipTimer) clearTimeout(this.tipTimer);
    if (this.waitTimer) clearTimeout(this.waitTimer);
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

  // The scene for the card as it is now. Its season's data (and a team's roster) is usually a moment behind
  // the card: until it's in, the stage stands empty (`waiting`: the wall and the shelf, lit) rather than drawn
  // once without it and again with it; a fetch that takes longer than WAIT_MS draws what it has
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
    // (the wait is for the season's small files alone; a team's depth chart can take a second or more, and a
    // locker drawn from the roster on hand is redrawn when it lands)
    this.waiting = data === null && !this.waitedOut();
    if (this.waiting) return null;
    const key = [tab, c.player.gsisId, c.season, data ? 1 : 0, typeof depth === 'object' && depth ? 1 : 0].join('/');
    if (this.built?.key !== key) this.built = { key, scene: buildScene(this.input(team, coach, data, typeof depth === 'object' ? depth : null)) };
    return this.built.scene;
  }
  waiting = false;
  private waitFrom = 0;
  private waitTimer: ReturnType<typeof setTimeout> | null = null;
  private waitedOut(): boolean {
    const now = Date.now();
    if (!this.waitFrom) {
      this.waitFrom = now;
      // (drawn again when the wait is up, with or without the data)
      this.waitTimer = setTimeout(() => this.cdr.markForCheck(), WAIT_MS + 20);
    }
    return now - this.waitFrom > WAIT_MS;
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
    const key = [c1, c2, c3, ...Object.values(hero)].join('|');
    if (this.varsFor?.key !== key) this.varsFor = { key, vars: { ...hero, '--c1': c1, '--c2': c2, '--c3': c3 } };
    return this.varsFor.vars;
  }

  // (a kit's drawn details, by the kit and the drawing: built once)
  private memo<T>(k: FullKit, key: string, build: () => T): T {
    let m = this.bandArt.get(k);
    if (!m) this.bandArt.set(k, (m = new Map()));
    if (!m.has(key)) m.set(key, build());
    return m.get(key) as T;
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

  // The cut's photographed white base (splash.images.ts): its anchors in the jersey's drawing space, and its
  // file; none when the cut has no base (the vector jersey then)
  private anchorsFor: { cut: string; a: JerseyAnchors | null } | null = null;
  get ja(): JerseyAnchors | null {
    const cut = this.cut;
    if (this.anchorsFor?.cut !== cut) this.anchorsFor = { cut, a: jerseyAnchors(cut) };
    return this.anchorsFor.a;
  }
  get jerseyBase(): string {
    return propHref('jersey-' + this.cut, HI_DPI);
  }
  // (the office's brass desk nameplate, photographed face on: splash.component.scss .sp-desk-plate; his name
  // flat on the plate's box, NAMEPLATE, as big as it holds)
  readonly deskPlate = propHref('desk-nameplate', HI_DPI);
  private plateFor: { name: string; art: { w: number; h: number; y: number; size: number } } | null = null;
  plateArt(name: string): { w: number; h: number; y: number; size: number } {
    if (this.plateFor?.name !== name) {
      const w = +((PROP_IMAGES['desk-nameplate'] ?? 1.5) * 100).toFixed(2), h = 100;
      const bw = NAMEPLATE.w * w, bh = NAMEPLATE.h * h;
      // (the condensed block, as a nameplate is engraved: about 0.58 em a letter with its spacing)
      const size = +Math.min(bh * 0.62, (bw * 0.92) / (Math.max(1, name.length) * 0.58)).toFixed(2);
      this.plateFor = { name, art: { w, h, y: +((NAMEPLATE.y + NAMEPLATE.h / 2) * h + size * 0.35).toFixed(2), size } };
    }
    return this.plateFor.art;
  }

  // The number's size on a photographed jersey: two digits fill the measured box in the kit's face
  numSize(k: FullKit, a: JerseyAnchors): number {
    return this.memo(k, 'num', () => numberSize(k.numberFont, a.num.w, a.num.h));
  }
  numX(a: JerseyAnchors): number {
    return +(a.num.x + a.num.w / 2).toFixed(2);
  }
  numY(a: JerseyAnchors): number {
    return +(a.num.y + a.num.h).toFixed(2);
  }
  // (the varsity faces carry their own serifs: their second outline only where the kit has an outline color)
  outlined(k: FullKit): boolean {
    return OUTLINED_FACES.has(k.numberFont ?? '') && !!k.outline && k.outline !== k.num;
  }
  // The name's size: its capitals the arc's share of the body, smaller to fit the arc in the kit's face
  photoNameSize(k: FullKit, name: string, a: JerseyAnchors): number {
    return nameSize(k.nameFont ?? k.numberFont, name.toUpperCase(), a.nameRun, a.nameCap);
  }
  // A TV number's size: two digits filling its box on the sleeve cap
  tvSize(k: FullKit, box: Box): number {
    return numberSize(k.numberFont, box.w, box.h);
  }

  // The bands on a photographed jersey's sleeves: vertical bands inward from each cuff, the sleeves being
  // spread flat (top to bottom as the kit lists them, the outermost nearest the cuff; a football's solid
  // sleeve cap first, a baseball sleeve's one or two); each is clipped to its sleeve's rectangle
  photoBands(k: FullKit, a: JerseyAnchors, baseball = false): Box[] & { color?: string }[] {
    return this.memo(k, 'bands' + (baseball ? '-bb' : ''), () => this.buildPhotoBands(k, a, baseball));
  }
  private buildPhotoBands(k: FullKit, a: JerseyAnchors, baseball: boolean): (Box & { color: string })[] {
    if (!a.sleeves) return [];
    const out: (Box & { color: string })[] = [];
    const list = baseball ? (k.stripe2 ? [k.stripe || k.collar, k.stripe2] : [k.stripe || k.collar]) : k.cap ? [] : k.sleeve === 'stripes' ? this.bands(k).map((b) => b.color) : [];
    const w = baseball ? 3 : Math.min(3.4, 11 / Math.max(1, list.length));
    const gap = baseball ? 1.2 : list.length > 2 ? 0.5 : 2.2;
    const start = baseball ? 1.5 : 3.5;
    for (const s of a.sleeves) {
      if (k.cap && !baseball) out.push(this.band(s, 0, 13, k.cap));
      list.forEach((color, i) => out.push(this.band(s, start + (list.length - 1 - i) * (w + gap), w, color)));
    }
    return out;
  }
  // (a band on a sleeve: from `from` to `from + w` in from the cuff, the sleeve's full height)
  private band(s: Sleeve, from: number, w: number, color: string): Box & { color: string } {
    const x = s.dir > 0 ? s.cuff + from : s.cuff - from - w;
    return { x: +x.toFixed(2), y: s.y, w: +w.toFixed(2), h: s.h, color };
  }

  // A photographed sweater's arm bands: the kit's, in the lower third of each sleeve from the cuff
  photoArmBands(k: FullKit, a: JerseyAnchors): (Box & { color: string })[] {
    return this.memo(k, 'arms', () => {
      if (!a.sleeves) return [];
      const bands = this.hockeyBands(k);
      if (!bands.length) return [];
      const total = bands.reduce((t, b) => t + b.h, 0) + (bands.length - 1) * 1.6;
      const out: (Box & { color: string })[] = [];
      for (const s of a.sleeves) {
        // (the run from 2.5 units in from the cuff to a third of the sleeve: the kit's bands scaled into it)
        const room = Math.max(4, s.w * 0.36 - 2.5);
        const k2 = Math.min(1, room / total);
        let at = 2.5;
        for (const b of bands) {
          out.push(this.band(s, at, b.h * k2, b.color));
          at += (b.h + 1.6) * k2;
        }
      }
      return out;
    });
  }

  // A photographed jersey's hem stripes: the kit's, laid in the hem's region (the bottom 12% of the torso),
  // the lowest a unit above the hem
  photoHems(k: FullKit, cut: Cut, a: JerseyAnchors): { color: string; y: number; h: number }[] {
    return this.memo(k, 'hems-' + cut, () => {
      const list = this.hems(k, cut);
      if (!list.length) return [];
      const gap = 1;
      const room = a.hemH - 1;
      const h = Math.min(list[0].h, (room - (list.length - 1) * gap) / list.length);
      let y = a.hemY - 1 - list.length * h - (list.length - 1) * gap;
      return list.map((l) => {
        const band = { color: l.color, y: +y.toFixed(2), h: +h.toFixed(2) };
        y += h + gap;
        return band;
      });
    });
  }

  // A jersey's colors and details: what the team wore that season (UNIFORM_ERAS), else from its colors: home
  // the team color, away white, the alternate its dark one (each built once per team, season and kit)
  kit(kit: Kit): FullKit {
    const key = `${this.teamKey}/${this.season}/${kit}/${this.colors.join()}`;
    let k = this.kits.get(key);
    if (!k) this.kits.set(key, (k = this.buildKit(kit)));
    return k;
  }
  private buildKit(kit: Kit): FullKit {
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

