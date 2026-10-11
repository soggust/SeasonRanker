import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { firestoreSdk } from '@ranker/core/firebase';
import { AccountService } from '../account/account.service';
import { DeskNote, NOTE_MAX, NOTE_REASONS, NOTE_STATUSES, NoteForm, NotePlayer, OTHER_PLAYER, formOf, noteOf, notePrices, noteText, readNote } from './desk-notes';

// An admin's note on a pick (a CHECK's, under its write-up on the Bets page): why the model and the book
// disagree, a reason, a player the pick involves and his status, a line of their own. Saved to Firestore's
// deskNotes/{pick id} (firestore.rules: admins only, by its writer, at the write's time); the bettor reads them
// on its next run (libs/ranker/scripts/model/notes.mjs), a player's news an injury override for his game, so
// the pick's priced again (a note with no player and status is kept with the CHECK for the bot's review, and
// says so). A player not on the picks (a game market's starter) by his ESPN id. Shown back once saved, with
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

  private readonly account = inject(AccountService);
  readonly reasons = NOTE_REASONS;
  readonly statuses = NOTE_STATUSES;
  readonly max = NOTE_MAX;
  readonly other = OTHER_PLAYER;

  // (the note saved, once read; loading till then; editing: the form open over a saved one)
  readonly saved = signal<DeskNote | null>(null);
  readonly loading = signal(true);
  readonly editing = signal(false);
  readonly saving = signal(false);
  readonly problem = signal<string | null>(null);
  form: NoteForm = formOf(null);

  async ngOnInit(): Promise<void> {
    try {
      const [firestore, { doc, getDoc }] = await firestoreSdk();
      const snap = await getDoc(doc(firestore, 'deskNotes', this.pickId));
      this.saved.set(snap.exists() ? readNote(snap.data()) : null);
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
      this.editing.set(false);
    } catch (error) {
      const code = (error as { code?: string }).code ?? '';
      this.problem.set(code === 'permission-denied' ? "Not saved: only an admin's note is kept" : 'Couldn’t save it: try again');
    } finally {
      this.saving.set(false);
    }
  }
}
