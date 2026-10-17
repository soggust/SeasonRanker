import { Component, isDevMode } from '@angular/core';
import { SPORT } from '@sport/sport';
import { FIREBASE_CONFIG, emulatorPorts, usingEmulators } from '@ranker/core/firebase';
import { goHome, pageHash, pagePath } from '@ranker/engine/page-url';
import { AccountService } from './account.service';
import { errorMessage } from './account-helpers';
import { showStageAdmin, stageEmulatorAdmin } from './dev-admin';
import { canUse } from './features';

// The sport bar's account entry, on the far right: signed out, a small Sign in (the brand after it);
// signed in, in the brand's place, the user's display name then their avatar (phones: the avatar alone),
// opening their menu: the account pages (at their own addresses: page-url.ts), Settings and Sign out. A faint
// circle while a returning user's sign-in is restored. On the dev server against the emulators, a "Stage as
// admin" checkbox above Sign out (dev-admin.ts), so an admin and a plain user can both be tried on localhost.
@Component({
  selector: 'account-menu',
  templateUrl: './account-menu.component.html',
  styleUrls: ['../../styles/components/account-menu.scss'],
  standalone: false,
})
export class AccountMenuComponent {
  constructor(readonly account: AccountService) {}

  // (the pages, Settings last; Sign out alone under the divider)
  private readonly all = [
    { hash: '#lists', icon: 'format_list_numbered', label: 'My Lists' },
    { hash: '#community', icon: 'leaderboard', label: 'Community' },
    { hash: '#tracker', icon: 'push_pin', label: 'Track Players' },
    { hash: '#wallet', icon: 'account_balance_wallet', label: 'Betting Wallet' },
    { hash: '#friends', icon: 'group', label: 'Friends' },
    { hash: '#account', icon: 'settings', label: 'Settings' },
  ].map((item) => ({ ...item, href: pagePath(item.hash, SPORT.id) }));

  // (the Betting Wallet only where play betting is open: development, or an admin, like the Book link)
  get items() {
    return canUse('book') ? this.all : this.all.filter((item) => item.hash !== '#wallet');
  }

  get name(): string {
    return this.account.profile()?.displayName ?? '';
  }

  // (in the bar: the whole display name, on one line, cut short with an ellipsis only where it won't fit (its
  // whole on hover); the username when there's none)
  get shown(): string {
    return this.name.trim() || this.account.profile()?.username || '';
  }

  isOpen(hash: string): boolean {
    const here = pageHash();
    return here === hash || here.startsWith(hash + '/');
  }

  // (the switch: the dev server with the emulators on, never a build and never the live project)
  readonly stageable = showStageAdmin(isDevMode(), usingEmulators());
  staging = false;

  // Sets (or clears) the signed-in emulator user's admin claim on the Auth emulator, then reads the token again
  // so ADMIN comes from the claim exactly as production's does (never an override the rules couldn't see)
  async stageAdmin(admin: boolean): Promise<void> {
    const uid = this.account.user()?.uid;
    if (!uid || this.staging) return;
    this.staging = true;
    try {
      await stageEmulatorAdmin((url, init) => fetch(url, init), { projectId: FIREBASE_CONFIG.projectId, port: emulatorPorts().auth, uid, admin });
      await this.account.refreshAdmin();
    } catch (error) {
      alert(errorMessage(error));
    } finally {
      this.staging = false;
    }
  }

  async signOut(): Promise<void> {
    try {
      await this.account.signOut();
      // (off an account page: back to the rankings)
      if (pageHash() && pageHash() !== '#book') goHome();
    } catch (error) {
      alert(errorMessage(error));
    }
  }
}
