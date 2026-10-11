import type { ModelBet } from './desk-model';
import { bandOrder } from './tiers';

// The CHECK band's pure parts (no Angular, no Firestore: tests/bet-why.test.mjs reads them): the Bets page's
// order with CHECKs in it, the owner's note on a pick (Firestore's deskNotes/{id}, the id the pick's; the
// bettor reads them, libs/ranker/scripts/model/notes.mjs, and a player's news prices his game again), and the
// CHECKs as the Algorithm's By Confidence tallies them.
//
//   order    LOCK, then CHECK, then the rest (tiers.ts bandOrder: CHECK between LOCK and LOVE), and within a band
//            the Kelly score; the CHECKs among themselves the biggest gap from the book first (picks.mjs's own
//            order for them), as their score is the book's chance more than the model's
//   note     { reason, player?, status?, team?, sport?, note?, by, at } as firestore.rules validDeskNote has it:
//            the reason one of NOTE_REASONS, the player and his team ESPN ids (digits), the status one of
//            NOTE_STATUSES (only with a player), the note 500 characters at most; by and at the writer's and the
//            write's time, the service's to add. On a CHECK, "Noted: the bot re-prices it on its next run" till
//            a re-evaluation after it (picks.json's resolved: noteState), then what came of it (still a CHECK;
//            closed or bet, the row's gone, the bet a pick)
//   tally    a CHECK at a unit, graded as if it had been bet (checks.mjs checkResult): a bet-shaped row for the
//            desk's tally, open till it's graded; a closed one (the gap closed before the lock) left out

// (the reasons an admin can give, in the order the form lists them: notes.mjs REASONS)
export type NoteReason = 'news' | 'role' | 'weather' | 'suspension' | 'market-wrong' | 'other';
export const NOTE_REASONS: readonly { value: NoteReason; label: string }[] = [
  { value: 'news', label: 'News the model missed' },
  { value: 'role', label: 'Role or depth change' },
  { value: 'weather', label: 'Weather' },
  { value: 'suspension', label: 'Suspension' },
  { value: 'market-wrong', label: "Market is wrong, model's right" },
  { value: 'other', label: 'Other' },
];

// (a player's status as the note gives it: notes.mjs NOTE_STATUS; active takes him off the injury report)
export type NoteStatus = 'out' | 'questionable' | 'active';
export const NOTE_STATUSES: readonly { value: NoteStatus; label: string }[] = [
  { value: 'out', label: 'Out' },
  { value: 'questionable', label: 'Questionable' },
  { value: 'active', label: 'Active' },
];

// (the sports a note may name: the rules')
const NOTE_SPORTS = ['nfl', 'nba', 'nhl', 'mlb'];
export const NOTE_MAX = 500;

// A player a note can name: his ESPN id, his name, his team's ESPN id
export interface NotePlayer {
  id: string;
  name: string;
  team: string | null;
}

// A note as it's stored (and read back), less who wrote it and when
export interface DeskNote {
  reason: NoteReason;
  player: string | null;
  status: NoteStatus | null;
  team: string | null;
  sport: string | null;
  note: string | null;
}

// (the form's fields: a select's empty choice is ''; the player OTHER_PLAYER, someone not on the picks, by
// his ESPN id in athlete: a game market's starter the picks don't name, notes.mjs finding his team)
export const OTHER_PLAYER = 'other';
export interface NoteForm {
  reason: NoteReason | '';
  player: string;
  athlete?: string;
  status: NoteStatus | '';
  note: string;
}

const digits = (x: unknown): string | null => (x !== null && x !== undefined && /^\d{1,12}$/.test(String(x)) ? String(x) : null);

// A pick's row as far as the order and the players go
export interface NoteRow {
  confidence: string | null;
  sureness: number;
  gap?: number | null;
  game?: { kickoff?: string | null } | null;
  betType?: string;
  player?: string | null;
  athleteId?: string | number | null;
  playerTeam?: string | null;
}

// The Bets page's order: by band (LOCK, CHECK, the rest), then the Kelly score (the CHECKs by their gap), then
// the start
export function byBand(a: NoteRow, b: NoteRow): number {
  const band = (r: NoteRow) => Math.min(bandOrder(r.confidence as never), 2);
  const gap = (r: NoteRow) => (r.confidence === 'check' ? Math.abs(r.gap ?? 0) : 0);
  return band(a) - band(b) || gap(b) - gap(a) || b.sureness - a.sureness || (a.game?.kickoff ?? '').localeCompare(b.game?.kickoff ?? '');
}

// The players a pick's note can name: a prop's own player first, then the other players on its game's picks
// (each once); a game market's, its game's players on the picks (none: the form asks for no player)
export function notePlayers(row: NoteRow, game: readonly NoteRow[]): NotePlayer[] {
  const out = new Map<string, NotePlayer>();
  for (const r of [row, ...game]) {
    const id = digits(r.athleteId);
    if (r.betType !== 'player' || !id || !r.player || out.has(id)) continue;
    out.set(id, { id, name: r.player, team: digits(r.playerTeam) });
  }
  return [...out.values()];
}

// The note to save from the form, or why it can't be: a reason; a status only with a player, and a player's
// news needs one (a player alone reads as out); someone else by his ESPN id, digits, his team left to the bot;
// the note trimmed, NOTE_MAX at most
export function noteOf(form: NoteForm, sport: string | null, players: readonly NotePlayer[]): DeskNote | string {
  const reason = NOTE_REASONS.find((r) => r.value === form.reason)?.value;
  if (!reason) return 'Pick a reason';
  let player: NotePlayer | null = players.find((p) => p.id === form.player) ?? null;
  if (form.player === OTHER_PLAYER) {
    const id = digits((form.athlete ?? '').trim());
    if (!id) return "The player's ESPN id is digits (from his espn.com page's address)";
    player = players.find((p) => p.id === id) ?? { id, name: `player ${id}`, team: null };
  }
  const status = player ? (NOTE_STATUSES.find((s) => s.value === form.status)?.value ?? 'out') : null;
  const note = form.note.trim();
  if (note.length > NOTE_MAX) return `The note is ${note.length} characters: ${NOTE_MAX} at most`;
  return {
    reason,
    player: player?.id ?? null,
    status,
    team: player?.team ?? null,
    sport: sport && NOTE_SPORTS.includes(sport) ? sport : null,
    note: note || null,
  };
}

// A saved note read back (a Firestore doc's data), or null when it isn't one
export function readNote(d: Record<string, unknown> | null | undefined): DeskNote | null {
  if (!d || typeof d !== 'object') return null;
  const reason = NOTE_REASONS.find((r) => r.value === d['reason'])?.value;
  if (!reason) return null;
  return {
    reason,
    player: digits(d['player']),
    status: NOTE_STATUSES.find((s) => s.value === d['status'])?.value ?? null,
    team: digits(d['team']),
    sport: typeof d['sport'] === 'string' ? d['sport'] : null,
    note: typeof d['note'] === 'string' ? d['note'] : null,
  };
}

// A note in words: "News the model missed · Jalen Hurts Out · “ruled out at practice”" (a player the page
// doesn't know by his id)
export function noteText(n: DeskNote, players: readonly NotePlayer[]): string {
  const reason = NOTE_REASONS.find((r) => r.value === n.reason)?.label ?? n.reason;
  const name = n.player ? (players.find((p) => p.id === n.player)?.name ?? `player ${n.player}`) : null;
  const status = NOTE_STATUSES.find((s) => s.value === n.status)?.label ?? null;
  const who = name ? [name, status].filter(Boolean).join(' ') : null;
  return [reason, who, n.note ? `“${n.note}”` : null].filter(Boolean).join(' · ');
}

// The form a saved note fills back in (or a blank one): a player not among the ones it lists, by his id
export function formOf(n: DeskNote | null, players: readonly NotePlayer[] = []): NoteForm {
  const other = !!n?.player && !players.some((p) => p.id === n.player);
  return {
    reason: n?.reason ?? '',
    player: other ? OTHER_PLAYER : (n?.player ?? ''),
    athlete: other ? n!.player! : '',
    status: n?.status ?? '',
    note: n?.note ?? '',
  };
}

// (a saved note the bot prices with: a player and his status, notes.mjs applyNotes; the rest kept with the
// CHECK for its review, tallied by reason)
export const notePrices = (n: DeskNote | null): boolean => !!n?.player && !!n?.status;

// A CHECK's last re-evaluation, as picks.json carries it (checks.mjs resolveChecks: priced again from its stored
// prices, or on an owner's note): still a CHECK (a closed or bet one is off the CHECKs' list, the bet a pick)
export interface CheckResolved {
  at: string;
  as: 'bet' | 'closed' | 'still';
  by: 'note' | 'reprice';
}

// (when a saved note was written, in ms: Firestore's Timestamp (toMillis), a time's string or ms; else null)
export function noteAtOf(at: unknown): number | null {
  if (at && typeof (at as { toMillis?: unknown }).toMillis === 'function') return (at as { toMillis: () => number }).toMillis();
  const ms = typeof at === 'number' ? at : typeof at === 'string' ? Date.parse(at) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

// What a CHECK's note says of it: 'pending' (the bot re-prices it on its next run) till a re-evaluation after
// the note (resolved, its at later), then 'still' (re-priced with it, still a CHECK); no note, null. A note
// whose time isn't known answered by any re-evaluation
export function noteState(noteAt: number | null, resolved: CheckResolved | null | undefined, noted = true): 'pending' | 'still' | null {
  if (!noted) return null;
  const answered = !!resolved && (noteAt === null || Date.parse(resolved.at) >= noteAt);
  return answered ? (resolved!.as === 'still' ? 'still' : null) : 'pending';
}

// A CHECK as checks.json keeps it (checks.mjs), as far as the desk reads it
export interface CheckEntry extends Partial<ModelBet> {
  id: string;
  sport: string;
  start: string;
  placedAt: string;
  firstAt?: string;
  closedAt?: string;
  checkResult?: { status: 'won' | 'lost' | 'push'; profit: number; void?: boolean } | null;
  // (why it's a CHECK: 'gap' (the model too far from the book) or 'role' (his role changing: props.mjs
  // roleChangeOf); an older one without it is the gap's)
  cause?: 'gap' | 'role';
  roleReason?: string;
}

// The CHECKs at a unit, as bets for the desk's tally: graded ones with what they'd have done, the rest open; the
// closed ones (their gap closed before the lock: checkSummary's apart) left out
export function checkBets(checks: readonly CheckEntry[] | null | undefined): ModelBet[] {
  return (checks ?? [])
    .filter((c) => c && c.id && !c.closedAt)
    .map((c) => {
      const r = c.checkResult;
      return {
        ...(c as ModelBet),
        placedAt: c.firstAt ?? c.placedAt,
        units: 1,
        status: r ? r.status : 'open',
        profit: r ? (r.profit ?? 0) : 0,
        void: !!r?.void,
        clv: null,
      };
    });
}
