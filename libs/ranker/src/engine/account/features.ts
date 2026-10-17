import { signal } from '@angular/core';

// What's switched on, in one place. MMA and the Book are open to everyone (the owner, 2026-10-17; placing a
// bet still asks for a sign-in, as the wallet always has). Anything experimental (the Algorithm desk, the
// CHECK rows, desk notes) shows for an admin alone, on the dev server as on the live site: development
// used to count as admin, so localhost could never show what a plain user sees (the owner, 2026-10-17).
// Admin is a custom claim on the sign-in token (admin: true, set by libs/ranker/scripts/accounts/set-admin.mjs
// with the Admin SDK; against the Auth emulator, the account menu's "Stage as admin" switch: dev-admin.ts),
// never a field a user can write; AccountService sets it from the token when someone signs in.
export type Feature = 'mma' | 'book' | 'experimental';

export const ADMIN = signal(false);

// Sign in with Facebook: off until its Meta app is set up and Live (the Facebook provider enabled in Firebase);
// off, the sign-in dialog and Settings don't offer it (an account that already has it linked still shows it)
export const FACEBOOK_LOGIN = false;

const OPEN: ReadonlySet<Feature> = new Set<Feature>(['mma', 'book']);

// (a signal read: a template calling it updates when the admin flag arrives)
export function canUse(feature: Feature): boolean {
  return OPEN.has(feature) || ADMIN();
}
