import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { AboutSection } from '../about/about-frame.component';
import { BANDS } from './bet-why';
import { CHECK_CAUSE_LABELS, CheckTally, ContextTerm, ModelState, PropType, Trust } from './desk-model';
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
  vs: 'vacated work: how it is shared',
  sn: 'snaps-based rate',
  sr: "expected share: last game's weight",
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
  c_b2bB: 'back-to-back, a bench player (the minutes the starters give up)',
  c_b2bS: 'back-to-back, a starter',
  c_oppB2b: 'opponent on a back-to-back',
  c_blowout: 'expected blowout',
  c_oppShots: 'opponent shots',
  c_pp: 'power play',
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
    { tier: 'like', name: 'LIKE', rule: `Kelly score ${pct(BANDS.medium)} or more`, text: 'A real but modest edge.' },
    { tier: 'pass', name: 'PASS', rule: `Kelly score under ${pct(BANDS.medium)}, or no edge`, text: "Priced, but not worth a bet in the bot's eyes." },
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
