import { isDevMode, signal } from '@angular/core';

// What's switched on, in one place. MMA and the Bets page are open to everyone (the owner, 2026-10-17; placing a
// bet still asks for a sign-in, as the wallet always has). Anything experimental (the Algorithm desk, the
// CHECK rows, desk notes) shows in development (the dev server and dev builds, as before) and for an admin on
// the live site. Admin is a custom claim on the sign-in token (admin: true, set by
// libs/ranker/scripts/accounts/set-admin.mjs with the Admin SDK), never a field a user can write;
// AccountService sets it from the token when someone signs in.
export type Feature = 'mma' | 'bets' | 'experimental';

export const ADMIN = signal(false);

// Sign in with Facebook: off until its Meta app is set up and Live (the Facebook provider enabled in Firebase);
// off, the sign-in dialog and Settings don't offer it (an account that already has it linked still shows it)
export const FACEBOOK_LOGIN = false;

const OPEN: ReadonlySet<Feature> = new Set<Feature>(['mma', 'bets']);

// (a signal read: a template calling it updates when the admin flag arrives)
export function canUse(feature: Feature): boolean {
  return OPEN.has(feature) || isDevMode() || ADMIN();
}
