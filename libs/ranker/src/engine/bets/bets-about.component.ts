import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { AboutSection } from '../about/about-frame.component';
import { BANDS } from './bet-why';
import { CHECK_CAUSE_LABELS, CheckTally, ContextTerm, ModelState, PropType, Trust, playChanceText, sameGameText } from './desk-model';
import { MARKET_NAMES, SPORTS } from './desk-math';

// The Bets page's About (its header's info button): the shared About frame (about/about-frame.component) with the
// Bets page's own sections, for everyone: what the page is, the board and its bands (BANDS, bet-why.ts, so the
// cuts here are the bot's own), the Kelly score, your bets and the write-ups. An admin's (the page's desk():
// canUse('experimental')) also has the Algorithm: the pipeline in words, and each sport's model as its bettor
// left it (data/model/state.json, the Algorithm tab's file and types): its context terms, its prop types and
// their fitted terms, its trust, its model epoch and its CHECKs' tallies, so it stays current with every run.

// (a state's prop type as the About lists it: its base terms in a line, its matchup and context terms each a row)
type TermRow = { name: string; value: string; kept: boolean; gain: string | null; up: boolean; down: boolean };
type PropView = { key: string; label: string; rows: number; base: string; terms: TermRow[]; trust: string };
type TrustRow = { key: string; label: string; trust: string; n: number; fitted: boolean };
type CheckRow = { key: string; label: string; record: string; hit: string; profit: string; up: boolean };
type SportView = {
  sport: string;
  updated: string | null;
  epoch: string | null;
  context: (ContextTerm & { sizeText: string; gainText: string })[];
  props: PropView[];
  // (the NFL's questionable players' chance of playing, in words; null elsewhere)
  playChance: string | null;
  // (the same-game sizing, in words; null where the state predates it)
  sameGame: string | null;
  trust: TrustRow[];
  checks: { n: number; open: number; graded: number; rows: CheckRow[] } | null;
};

// (a prop term's words: project.mjs's names for the fitted terms)
const TERM_NAMES: Record<string, string> = {
  K: 'prior weight (games)',
  w: 'recent form (last five)',
  a: 'opponent allowed',
  b: 'game script',
  roleK: 'role split (opponent by role)',
  fun: 'defense funnel',
  pc: 'pace',
  tg: 'target share allowed',
  vc: 'vacated work',
  vcM: 'vacated work fit again on the NBA minutes base',
  vs: 'vacated work: how it is shared (0 to 2: in proportion, flatter, equally within his position; NBA 3 to 5 the same by usage, NHL 3 to 5 by power-play time; NFL 3, NBA 6 and 7: who absorbs it, learned from the history)',
  vl: 'who absorbs the missing work: learned from past absences by position and depth (NBA: position and starter or bench), across positions, some of it lost',
  sn: 'snaps-based rate (NBA: minutes first, his per-minute rate times his expected minutes; NHL: ice time first, the same with his time on ice)',
  ps: 'NBA positions (guards, forwards, centers): the opponent allowed and the prior by position (2: the role split by it too)',
  po: "NBA pace: how many possessions tonight's game should have, as a power",
  ep: "NFL expected plays tonight: how many plays his team should run (its own pace and the other side's, or the game's expected total and its share of the ball), against the games he's played this season, as a power; used in place of the defense's pace",
  eg: "NFL expected plays' form (1: his team's expected plays from its own pace and the other side's, over their average in his games this season; 2: the same over the plays his team actually ran in his games; 3: the game's expected total times his team's share of it (its time of possession, measured by its share of the plays), over its average in his games; 4: that over the plays actually run)",
  tr: "team allocation: each team's game projected first (its own total of the stat a game, against the opponent's allowed), then each player's projection pulled toward his share of it, so a team's players add up to the team's (receivers' yards to its passing, its backs' carries to its runs, the NBA's points to the team's)",
  tf: "team allocation's form (1: the team's own games and the opponent's alone; 2: with the betting lines' implied points for his side, at half; 3: in full)",
  pg: "NBA pace's form (0: the other side's possessions over the league's; 2: the game's expected possessions over their average in his games this season; 3: the other side's over its average in his games this season; 1, off the search: the game's expected over the league's)",
  sr: "expected share: last game's weight (NBA, NHL: his last three games' minutes)",
  qs: 'QB starts (starter by his starts)',
  kd: 'early season (prior shrinks with games)',
  a_WR: 'opponent allowed to wide receivers',
  a_TE: 'opponent allowed to tight ends',
  a_RB: 'opponent allowed to running backs',
  a_QB: 'opponent allowed to quarterbacks',
  vol: 'volume base (targets times yards a target)',
  yk: "yards a target: his longer run's weight (targets)",
  dp: 'draft slot (a rookie\'s prior)',
  c_rb1Out: 'lead running back out',
  c_newCoach: "a new head coach's first games",
  c_qb1Out: 'starting QB out',
  c_qbDeep: "starting QB out, a deep receiver (his air yards a target over the league's)",
  c_ppShare: 'power-play share',
  c_midSeason: 'weeks 5 to 8',
  rp: 'next man up (projected in the role he steps into)',
  nu: "next man up: his share at least this much of the missing one's",
  nt: "next man up: his target share at least this much of the missing one's",
  ij: 'back from injury (his eased games weigh less)',
  ia: 'back from injury: team games missed',
  ir: "back from injury: the returners' first game back",
  ro: 'role order by recent healthy work (not season totals)',
  ab: 'same teammates out: his games with them out weigh in',
  c_aheadOut: 'a regular ahead of him out',
  ot: 'organic trend (his work rising or falling, no injury ahead)',
  sk: "part-timer's prior counted at his snap share",
  rx: "last five reaching back into last season",
  pl: "prior leaning to last season's late games",
  sp: "start-of-season prior: a veteran's prior from last season moved by how players like him (his position, his age, on a new team or not) have opened seasons against it, fading as his own games come in",
  sl: 'extreme projections pulled toward the typical one (or pushed from it), fitted',
  mk: "game script from the betting lines (the market's implied team points, not the desk's own)",
  c_mSpread: 'favored or underdog by the betting lines (spread)',
  cs: 'over/under chance calibrated separately above and below the projection',

  rk: 'spread grows with projection',
  c_wind: 'wind',
  c_cold: 'cold',
  c_precip: 'rain / snow',
  c_backupQb: 'backup QB',
  c_usage: 'teammates out',
  c_b2b: 'back-to-back (his team played last night)',
  c_b2bAll: 'back-to-back, every player one size (his team played last night)',
  c_b2bB: 'back-to-back, a bench player (the minutes the starters give up)',
  c_b2bS: 'back-to-back, a starter',
  c_oppB2b: 'opponent on a back-to-back',
  c_blowout: 'expected blowout',
  c_blowS: 'blowout by the betting lines, a starter (his fourth quarter sat)',
  c_blowB: 'blowout by the betting lines, a bench player (the garbage time his)',
  c_newStart: 'a bench player who started his last game',
  c_oppShots: 'opponent shots',
  c_pp: 'power play',
  c_ppLean: "his share of his team's power-play time lately against his season's (NHL: a top unit's spot won or lost)",
  c_teamShots: "his team's expected shots tonight (NHL)",
  c_mTotal: 'the betting total (NHL goals)',
  od: "defense tables' recency: the opponent's latest games count most in what it allows",
  c_oppOut: "the opponent's players out tonight (NBA: its production missing)",
  c_oppD: "the opponent's top-four defensemen out tonight (NHL)",
  c_oppDB: "the opponent's starting cornerbacks and safeties out tonight (NFL)",
  c_oppFront: "the opponent's starting linemen and linebackers out tonight (NFL)",
  ex: "early exit: his chance of a short game (hurt, benched, pulled) shaping the chances around his projection, its average unchanged (NFL receiving yards)",
  c_oppGoalie: 'opposing goalie',
  c_slot: 'batting-order slot',
  c_platoon: 'platoon edge',
  c_oppStarter: 'opposing starter',
  c_leash: 'pitch-count leash',
  c_rest: 'rest',
  c_ump: 'plate umpire',
};
const termName = (k: string): string => TERM_NAMES[k] ?? k.replace(/^c_/, '');
const pct = (v: number | null | undefined, digits = 0): string => (v === null || v === undefined || !Number.isFinite(v) ? '-' : `${(v * 100).toFixed(digits)}%`);
const signed = (v: number, digits = 2): string => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`;

// (the bettor's leagues.mjs MODEL_EPOCH when a state doesn't carry it yet: the trust is fit only on bets since)
const EPOCH_FALLBACK = '2026-10-11T22:00:00Z';

@Component({
  selector: 'bets-about',
  templateUrl: './bets-about.component.html',
  styleUrls: ['../../styles/components/about-content.scss', '../../styles/components/bets-about.scss'],
  standalone: false,
})
export class BetsAboutComponent implements OnInit {
  // (an admin: the Algorithm sections too)
  @Input() desk = false;
  // (the CHECK rule as the bettor publishes it (picks.json's checkRule.kelly, the Bets page's read): null till read)
  @Input() checkKelly: number | null = null;
  checkBarText(): string {
    return this.checkKelly === null ? 'the bar the bot publishes' : `+${(this.checkKelly * 100).toFixed(0)}`;
  }
  @Output() closed = new EventEmitter<void>();

  sections: AboutSection[] = [];
  // (the bands, the bot's own cuts: bet-why.ts BANDS)
  readonly bands = [
    { tier: 'lock', name: 'LOCK', rule: `Kelly score ${pct(BANDS.lock)} or more and a ${pct(BANDS.lockChance)}+ chance to win`, text: 'A big edge on a likely result. Rare.' },
    { tier: 'love', name: 'LOVE', rule: `Kelly score ${pct(BANDS.high)} or more`, text: 'A strong edge at the price.' },
    { tier: 'like', name: 'LIKE', rule: `Any edge: a Kelly score over 0, under ${pct(BANDS.high)}`, text: 'A real but modest edge. Every bet the bot places is a LIKE or better.' },
    { tier: 'pass', name: 'PASS', rule: 'No edge: a Kelly score of 0 or under', text: "Priced, but not worth a bet in the bot's eyes: never bet (since Oct 13, 2026 it's tracked to learn from, not bet)." },
  ];

  // (each sport's model, as its last run left it; loading till they're in)
  sports: SportView[] = [];
  loading = false;
  private open = new Set<string>();

  ngOnInit(): void {
    this.sections = [
      { id: 'page', title: 'The Page' },
      { id: 'board', title: 'Board & Bands' },
      { id: 'kelly', title: 'Kelly Score' },
      { id: 'bets', title: 'Your Bets' },
      { id: 'writeups', title: 'Write-ups' },
      ...(this.desk
        ? [
            { id: 'pipeline', title: 'Algorithm' },
            { id: 'model', title: 'Live Model' },
          ]
        : []),
    ];
    if (this.desk) void this.load();
  }

  // (a fold: a sport, or a part of one; shut to start)
  shown(key: string): boolean {
    return this.open.has(key);
  }
  toggle(key: string): void {
    if (!this.open.delete(key)) this.open.add(key);
  }

  private async load(): Promise<void> {
    this.loading = true;
    const states = await Promise.all(
      SPORTS.map((sport) =>
        fetch(`/${sport}/data/model/state.json`, { cache: 'no-cache' })
          .then((res) => (res.ok ? (res.json() as Promise<ModelState & { epoch?: string }>) : null))
          .catch(() => null),
      ),
    );
    this.sports = states.flatMap((s, i) => (s ? [this.viewOf(SPORTS[i], s)] : []));
    this.loading = false;
  }

  private viewOf(sport: string, s: ModelState & { epoch?: string }): SportView {
    const props = s.props?.types ?? [];
    const propLabel = new Map(props.map((t) => [`prop:${t.key}`, t.label]));
    const trustText = (t: Trust | null | undefined): string => (!t ? '-' : `${t.trust.toFixed(2)} ${t.fitted ? 'fitted' : 'starting'} · ${t.n} bets`);
    const learning = s.checks?.learning ?? null;
    const checkRow = ([key, t]: [string, CheckTally]): CheckRow => ({
      key,
      label: CHECK_CAUSE_LABELS[key] ?? key,
      record: `${t.won}-${t.lost}${t.push ? `-${t.push}` : ''}`,
      hit: `${pct(t.hitRate)} (break-even ${pct(t.breakEven)})`,
      profit: `${signed(t.profit)}u`,
      up: t.profit > 0,
    });
    return {
      sport,
      updated: s.updated ?? null,
      epoch: s.epoch ?? null,
      context: (s.context?.terms ?? []).map((t) => ({
        ...t,
        sizeText: t.kept ? `${signed(t.size)} ${t.unit}` : 'left out',
        gainText: t.gain === null || t.gain === undefined ? '-' : `${signed(t.gain)}%`,
      })),
      props: props.map((t) => this.propOf(t, trustText(t.trust ?? s.trust?.[`prop:${t.key}`]))),
      playChance: playChanceText(s.props?.playChance),
      sameGame: sameGameText(s.sameGame),
      trust: Object.entries(s.trust ?? {}).map(([key, t]) => ({
        key,
        label: key.startsWith('prop:') ? `Prop: ${propLabel.get(key) ?? key.slice(5)}` : (MARKET_NAMES[key] ?? key),
        trust: t.trust.toFixed(2),
        n: t.n,
        fitted: t.fitted,
      })),
      checks: s.checks
        ? {
            n: s.checks.n ?? 0,
            open: s.checks.open ?? 0,
            graded: learning?.graded ?? 0,
            rows: [
              ...Object.entries(learning?.byCause ?? {})
                .sort((a, b) => b[1].n - a[1].n)
                .map(checkRow),
              // (the shadows: the PASSes kept only to grade, by why they passed)
              ...Object.entries(learning?.byPassAs ?? {}).map(([k, t]) => checkRow([`shadow:${k}`, t])),
            ],
          }
        : null,
    };
  }

  // (a prop type: its base terms in a line, its matchup and context terms each with its fitted size or "left
  // out" and its held-out gain (the line's log loss without it less with it))
  private propOf(t: PropType, trust: string): PropView {
    const p = t.params as unknown as Record<string, number | null | undefined>;
    const base = ['K', 'w', 'a', 'b']
      .filter((k) => p[k] !== undefined)
      .map((k) => `${termName(k)} ${p[k]}`)
      .join(' · ');
    const terms = Object.entries(t.gains ?? {}).map(([k, g]): TermRow => {
      const v = p[k];
      // (a size that can be 0 and still kept: the role split's, an opponent group's own power)
      const kept = k === 'roleK' || k.startsWith('a_') ? v !== null && v !== undefined : !!v;
      return {
        name: termName(k),
        value: kept ? String(v) : 'left out',
        kept,
        gain: g === null || g === undefined ? 'never fit in' : `${signed(g * 100)}%`,
        up: kept && (g ?? 0) > 0,
        down: (g ?? 0) < 0,
      };
    });
    return { key: t.key, label: t.label, rows: t.rows, base, terms, trust };
  }

  epochOf(s: SportView): string {
    return s.epoch ?? EPOCH_FALLBACK;
  }
}
