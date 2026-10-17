import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { firestoreSdk } from '@ranker/core/firebase';
import { AccountService } from '../account/account.service';
import { CheckResolved, DeskNote, NOTE_MAX, NOTE_REASONS, NOTE_STATUSES, NoteForm, NotePlayer, OTHER_PLAYER, formOf, noteAtOf, noteOf, notePrices, noteState, noteText, readNote } from './desk-notes';

// An admin's note on a pick (a CHECK's or a bet's, under its write-up on the Book): why the model and the book
// disagree, a reason, a player the pick involves and his status, a line of their own. Saved to Firestore's
// deskNotes/{pick id} (firestore.rules: admins only, by its writer, at the write's time); the bettor reads them
// on its next run (libs/ranker/scripts/model/notes.mjs), a player's news an injury override for his game, so
// the pick's priced again (a note with no player and status is kept with a CHECK for the bot's review, on a
// bet only in Firestore, and says so). A CHECK's note, either way, has the bot re-price it on its next run:
// "Noted" till then (picks.json's resolved after the note: desk-notes.ts noteState), then still a CHECK, or
// its row gone (closed, or bet: a pick). A player not on the picks (a game market's starter) by his ESPN id. Shown back once saved, with
// Edit to change it; a read that fails says a note may be there, the form still usable. The page shows it to
// admins alone (canUse('experimental')); a write the rules refuse (the dev server, signed in without the claim) says so,
// nothing else changes. desk-notes.ts holds the pure parts.
@Component({
  selector: 'desk-note',
  templateUrl: './desk-note.component.html',
  styleUrls: ['../../styles/components/desk-note.scss'],
  standalone: false,
})
export class DeskNoteComponent implements OnInit {
  // (the pick's id, the ledger's: "<event>:<market>", a prop's "<event>:prop:<type>:<athlete>")
  @Input({ required: true }) pickId = '';
  @Input() sport: string | null = null;
  // (the players it can name: the pick's own first)
  @Input() players: NotePlayer[] = [];
  // (a CHECK's row, or a bet's: what a note the bot doesn't price with says becomes of it)
  @Input() check = true;
  // (a CHECK's last re-evaluation (picks.json's resolved): its note "Noted" till one after it)
  @Input() resolved: CheckResolved | null = null;

  private readonly account = inject(AccountService);
  readonly reasons = NOTE_REASONS;
  readonly statuses = NOTE_STATUSES;
  readonly max = NOTE_MAX;
  readonly other = OTHER_PLAYER;

  // (the note saved, once read; loading till then; editing: the form open over a saved one)
  readonly saved = signal<DeskNote | null>(null);
  // (when it was saved, ms: Firestore's at; one saved here, now)
  readonly savedAt = signal<number | null>(null);
  readonly loading = signal(true);
  readonly editing = signal(false);
  // (the form asked for: none saved yet, its button pressed)
  readonly opened = signal(false);
  readonly saving = signal(false);
  readonly problem = signal<string | null>(null);
  form: NoteForm = formOf(null);

  async ngOnInit(): Promise<void> {
    try {
      const [firestore, { doc, getDoc }] = await firestoreSdk();
      const snap = await getDoc(doc(firestore, 'deskNotes', this.pickId));
      this.saved.set(snap.exists() ? readNote(snap.data()) : null);
      this.savedAt.set(snap.exists() ? noteAtOf(snap.data()?.['at']) : null);
    } catch (error) {
      // (not read: a blank form, but a note may be there to save over; signed out or not an admin, saving says why)
      this.saved.set(null);
      const code = (error as { code?: string }).code ?? '';
      this.problem.set(code === 'permission-denied' ? null : 'Couldn’t read your note: one may be saved already');
    }
    this.form = formOf(this.saved(), this.players);
    this.loading.set(false);
  }

  // (the bot prices with a player and his status; the rest is kept for its review)
  get prices(): boolean {
    return notePrices(this.saved());
  }

  // (a CHECK's note: pending till the bot's next run re-prices it, then still a CHECK, or held: the run
  // couldn't re-price it, and why (desk-notes.ts noteState))
  get state(): 'pending' | 'still' | 'held' | null {
    return noteState(this.savedAt(), this.resolved, !!this.saved());
  }

  get held(): string {
    return this.resolved?.held ?? '';
  }

  get text(): string {
    const n = this.saved();
    return n ? noteText(n, this.players) : '';
  }

  edit(): void {
    this.form = formOf(this.saved(), this.players);
    this.problem.set(null);
    this.editing.set(true);
  }

  cancel(): void {
    this.problem.set(null);
    this.editing.set(false);
    this.opened.set(false);
  }

  // (a player picked: Out unless another status is chosen; none, no status)
  playerChanged(): void {
    if (!this.form.player) this.form.status = '';
    else if (!this.form.status) this.form.status = 'out';
  }

  async save(): Promise<void> {
    const note = noteOf(this.form, this.sport, this.players);
    if (typeof note === 'string') {
      this.problem.set(note);
      return;
    }
    const uid = this.account.user()?.uid;
    if (!uid) {
      this.problem.set('Sign in as an admin to leave a note');
      return;
    }
    this.saving.set(true);
    this.problem.set(null);
    try {
      const [firestore, { doc, serverTimestamp, setDoc }] = await firestoreSdk();
      await setDoc(doc(firestore, 'deskNotes', this.pickId), { ...note, by: uid, at: serverTimestamp() });
      this.saved.set(note);
      this.savedAt.set(Date.now());
      this.editing.set(false);
    } catch (error) {
      const code = (error as { code?: string }).code ?? '';
      this.problem.set(code === 'permission-denied' ? "Not saved: only an admin's note is kept" : 'Couldn’t save it: try again');
    } finally {
      this.saving.set(false);
    }
  }
}
