// The sports the Bets page reads picks for: every sport the bettor covers (desk-math SPORTS) that the site has,
// in the site's order; a sport not ready for everyone (sports.json devOnly: MMA) only for someone who can use the
// experimental features (features.ts canUse: an admin, or the dev server), the gate the Algorithm tab uses, so
// the owner sees the UFC picks on the board and in the game dropdown while the public still doesn't. No Angular
// here (tested under Node: tests/bets-sports.test.mjs)
export interface BetSport {
  id: string;
  label: string;
}

export function betSports(site: readonly { id: string; label: string; devOnly?: boolean }[], bettable: readonly string[], experimental: boolean): BetSport[] {
  return site.filter((s) => bettable.includes(s.id) && (!s.devOnly || experimental)).map(({ id, label }) => ({ id, label }));
}
