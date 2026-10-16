// The splash's gallery (?gallery=1 on any sport's page): every piece of the art drawn at once, for checking it.
// Each team's jerseys in its latest uniform era (all its eras with &eras=all), the sport's props on shelves of
// three, a player's own stall with his gear, a head coach's office (a season being played, and a finished one
// with his honors), and the NBA's conference trophies beside the O'Brien. Nothing here reads a card or the live
// data: each scene is built by hand (or by buildScene from a made-up SceneInput) and handed to the splash whole
// (CardSplash's preset). Loaded lazily: it never rides in the main bundle.
import { Component } from '@angular/core';
import { SPORT } from '@sport/sport';
import * as teamColors from '@sport/team-colors';
import { CardSplash, SplashPreset } from './splash.component';
import { PROPS } from './splash.props';
import { Piece, Scene, buildScene } from './splash.scene';
import { UNIFORM_ERAS, helmetFor } from './splash.uniforms';

const TEAMS = (Object.entries(teamColors).find(([name]) => name === 'TEAMS')?.[1] ?? {}) as Record<string, [string, string, string, string]>;
const SHELF_MAX = 222;
const PX_PER_IN = 11;

// (the words a prop's lines and tip would get from a real season: the gallery's stand-ins)
const SAMPLE: Record<string, string> = {
  season: '2024', seasonEnd: '2025', seasonLabel: '2024', seasonShort: "'24", teamShort: 'Team', teamName: 'The Team', name: 'A. Player',
  final: 'won the final 31–24', confFinal: 'won the conference 27–20', confName: 'Western', confShort: 'West', confTrophy: 'the Oscar Robertson Trophy',
  award: 'MVP', awardName: 'Most Valuable Player', league: 'AL', gbTitle: '412 YDS', gbLine: '5 TD vs KC', gbTip: 'Week 9 vs KC', mbBig: '40', mbSmall: 'HOME RUNS',
  mbTip: '40 home runs', a1: 'ALL-PRO', a1sub: 'First Team', a2: 'PRO BOWL', a2sub: '2024', plaquesTip: 'All-Pro, Pro Bowl', round: 'Divisional',
  roundResult: 'beat BAL 24–17', division: 'AFC East', record: '13–4', lostRound: 'Conference', lostMatch: 'Team at KC', lostWhere: 'Arrowhead', lostScore: '17–24',
  shoeTip: 'His shoes', seed: '2 seed', coyName: 'Coach of the Year', missBy: '1 game', ownRound: 'Wild card',
};
const fill = (s: string | undefined) => (s ?? '').replace(/\{(\w+)\}/g, (_, k) => SAMPLE[k] ?? k);

interface Section {
  id: string;
  title: string;
  presets: { title: string; preset: SplashPreset }[];
}

@Component({
  selector: 'splash-gallery',
  standalone: true,
  imports: [CardSplash],
  template: `
    <div class="splash-gallery">
      @for (sec of sections; track sec.id) {
        <section [id]="'g-' + sec.id" class="g-section">
          <h2>{{ sec.title }}</h2>
          <div class="g-grid">
            @for (p of sec.presets; track $index) {
              <figure class="g-item" [id]="'g-' + sec.id + '-' + $index">
                <card-splash [preset]="p.preset"></card-splash>
                <figcaption>{{ p.title }}</figcaption>
              </figure>
            }
          </div>
        </section>
      }
    </div>
  `,
  styles: `
    .splash-gallery { background: #0b0908; color: #ddd; padding: 12px 24px 60px; font-family: Nunito, sans-serif; }
    .splash-gallery h2 { font-size: 20px; margin: 28px 0 10px; }
    .g-grid { display: grid; gap: 12px 10px; grid-template-columns: repeat(auto-fill, minmax(600px, 1fr)); }
    .g-item { margin: 0; }
    .g-item card-splash .splash { margin: 0; }
    .g-item figcaption { color: #aaa; font-size: 12px; padding: 4px 2px; }
  `,
})
export class SplashGallery {
  readonly sections: Section[] = [];

  constructor() {
    const q = new URLSearchParams(location.search);
    const only = q.get('gallery') ?? '1';
    const want = (id: string) => only === '1' || only.split(',').includes(id);
    if (want('cuts')) this.sections.push(this.cuts(q.get('eras') === 'all'));
    if (want('props')) this.sections.push(this.props());
    if (want('locker')) this.sections.push(this.locker());
    if (want('office') && SPORT.coachTab) this.sections.push(this.office());
    if (want('conf') && SPORT.id === 'nba') this.sections.push(this.nbaConf());
  }

  private preset(team: string, season: number, scene: Scene): SplashPreset {
    return { scene, team, season, logo: SPORT.teamLogo(team) };
  }

  // Each team's three jerseys, hung in its locker: home, away, the alternate when it has one
  private cuts(all: boolean): Section {
    const presets: Section['presets'] = [];
    for (const [team, eras] of Object.entries(UNIFORM_ERAS)) {
      const list = all ? eras : eras.slice(-1);
      for (const era of list) {
        const season = era.to ?? Math.max(era.from, new Date().getFullYear() - 1);
        const abbr = TEAMS[team]?.[0] ?? team;
        const kits = (['home', 'away', 'alt'] as const).filter((k) => k !== 'alt' || era.alt);
        const scene: Scene = {
          stage: 'locker',
          items: [],
          lead: 0,
          mark: team.replace(/^.*\s/, ''),
          stalls: kits.map((kit, i) => ({ jersey: { name: abbr, num: String(12 + i * 33), kit }, plate: kit.toUpperCase(), star: i === 0, tip: `${team} ${kit}` })),
          label: `${team} ${season}`,
        };
        presets.push({ title: `${team} · ${era.from}–${era.to ?? 'today'}${era.note ? ' · ' + era.note : ''}`, preset: this.preset(team, season, scene) });
      }
    }
    return { id: 'cuts', title: `Jerseys · ${SPORT.id.toUpperCase()} (${all ? 'every era' : 'the latest era'})`, presets };
  }

  // The sport's props (and every sport's), three to a shelf, each at its real height
  private props(): Section {
    const sport = SPORT.id;
    const ids = Object.entries(PROPS)
      .filter(([id]) => id.startsWith(sport + '-') || (!/^(nfl|nhl|nba|mlb)-/.test(id) && !(sport !== 'mlb' && /^(bats|fielders-glove|milestone-ball|ball-cap)$/.test(id)) && !(sport !== 'nhl' && /^(puck|hockey-stick)$/.test(id)) && !(sport !== 'nba' && /^(signature-shoe)$/.test(id)) && !(sport !== 'mma' && /^(title-belt|fight-gloves)$/.test(id)) && !(sport !== 'nfl' && /^(deflated-football|game-ball)$/.test(id))))
      .map(([id]) => id);
    const team = Object.keys(TEAMS)[0] ?? 'Team';
    const presets: Section['presets'] = [];
    for (let i = 0; i < ids.length; i += 3) {
      const group = ids.slice(i, i + 3);
      const defs = group.map((id) => PROPS[id]);
      const scale = Math.min(PX_PER_IN, SHELF_MAX / Math.max(1, ...defs.map((d) => d.inches)));
      const items: Piece[] = defs.map((d) => ({ t: d.piece, lines: d.lines?.map(fill), tip: fill(d.tip), h: Math.round(d.inches * scale), wide: d.wide, helmet: helmetFor(team, 2024), line: 'lebron' }));
      // (the tallest in the middle, as the shelf has it)
      const lead = items.reduce((b, it, j) => ((it.h ?? 0) > (items[b].h ?? 0) ? j : b), 0);
      presets.push({ title: group.join(' · '), preset: this.preset(team, 2024, { stage: 'shelf', items, lead, stalls: [], label: group.join(', ') }) });
    }
    return { id: 'props', title: `Props · ${sport.toUpperCase()}`, presets };
  }

  // A player's own stall this season: his jersey, his gear where it belongs
  private locker(): Section {
    const team = Object.keys(TEAMS)[1] ?? Object.keys(TEAMS)[0] ?? 'Team';
    const season = new Date().getFullYear();
    const scene = buildScene({
      sport: SPORT.id, tab: 'QB', id: 'x', season, seasonLabel: String(season), current: true, team: false, name: 'Pat Player', teamName: team,
      abbr: TEAMS[team]?.[0] ?? team, awards: [], number: '15', bestGame: { title: '412 YDS', line: '5 TD vs KC', tip: 'Week 9 vs KC' },
      milestone: { big: '40', small: 'HOME RUNS', tip: '40 home runs' }, tape: '3,100 yds · 24 TD', shoe: SPORT.id === 'nba' ? { line: 'lebron', name: 'the LeBron line' } : null,
      division: SPORT.id === 'mma' ? 'Lightweight' : undefined, record: SPORT.id === 'mma' ? '24–3' : undefined, helmet: helmetFor(team, season),
    });
    return { id: 'locker', title: `A player's locker · ${SPORT.id.toUpperCase()}`, presets: scene ? [{ title: `${team} · his own stall`, preset: this.preset(team, season, scene) }] : [] };
  }

  // A head coach's office: this season (his record on the board), and a finished one with his honors
  private office(): Section {
    const team = Object.keys(TEAMS)[2] ?? Object.keys(TEAMS)[0] ?? 'Team';
    const season = new Date().getFullYear();
    const base = { sport: SPORT.id, tab: SPORT.coachTab ?? 'HC', id: 'x', team: false, coach: true, name: 'Pat Coach', teamName: team, abbr: TEAMS[team]?.[0] ?? team };
    const now = buildScene({ ...base, season, seasonLabel: String(season), current: true, awards: [], record: '5-1' });
    const title = SPORT.id === 'nhl' ? 'cup' : SPORT.id === 'nba' ? 'champ' : 'sb';
    const then = buildScene({
      ...base, season: season - 2, seasonLabel: String(season - 2), current: false, record: '14-3',
      awards: [{ id: 'coy', title: `2024 Coach of the Year` }, { id: title, title: 'Champions' }],
      outcome: { result: 'champion', record: '14-3', seed: 1, division: 'AFC East', conference: 'AFC', confChamp: true, lastGame: { round: 'Final', opp: 'KC', won: true, score: '31–24', home: false, neutral: true } },
    });
    const presets: Section['presets'] = [];
    if (now) presets.push({ title: `${team} · this season`, preset: this.preset(team, season, now) });
    if (then) presets.push({ title: `${team} · a title season`, preset: this.preset(team, season - 2, then) });
    return { id: 'office', title: `A head coach's office · ${SPORT.id.toUpperCase()}`, presets };
  }

  // The O'Brien between the two conference trophies (today's, and the older column)
  private nbaConf(): Section {
    const team = 'BOS';
    const mk = (id: string, lines: string[]): Piece => ({ t: PROPS[id].piece, lines, tip: fill(PROPS[id].tip), h: Math.round(PROPS[id].inches * 9) });
    const items = [mk('nba-conf-trophy', ['Eastern', '2024']), mk('nba-obrien', ['2024 Champions']), mk('nba-conf-trophy', ['Western', '2019'])];
    return { id: 'conf', title: "The conference trophies beside the O'Brien", presets: [{ title: 'Cousy (2022–) · O’Brien · the older column (pre-2022)', preset: this.preset(team, 2024, { stage: 'shelf', items, lead: 1, stalls: [], label: 'trophies' }) }] };
  }
}
