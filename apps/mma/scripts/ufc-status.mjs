// A fighter's standing on UFC.com, read from his page (update-data.mjs fetches it): pure, so it's tested alone
// (tests/mma-ufc-status.test.mjs)
// (the status and division tags on a UFC.com fighter page: { status, division }; null without tags)
export function statusOf(html) {
  const tags = [...String(html ?? '').matchAll(/hero-profile__tag">\s*([^<]*)/g)].map((m) => m[1].trim());
  if (!tags.length) return null;
  const status = tags.find((t) => /^(Active|Retired|Not Fighting)$/i.test(t)) ?? 'Active';
  const division = tags.find((t) => /Division$/i.test(t))?.replace(/\s*Division$/i, '') ?? null;
  return { status, division };
}
// What a fighter's UFC.com status means here: 'retired' (out of the active list), 'released' (listed, not
// a UFC fighter) or null (as he is). The page is found by name, so a namesake's page (another Bruno Silva)
// is caught by its division: one naming a different division than his is not trusted.
export function ufcStanding(found, { lastDate, sixMonths, division }) {
  if (!found) return null;
  const norm = (d) => String(d ?? '').toLowerCase().replace(/^women'?s\s+/, 'w ').replace(/[^a-z ]/g, '').trim();
  if (found.division && division && norm(found.division) !== norm(division)) return null;
  if (/^retired$/i.test(found.status)) return 'retired';
  if (/^not fighting$/i.test(found.status)) return lastDate < sixMonths ? 'retired' : 'released';
  return null;
}
// (Dana White's Contender Series: ESPN files it under the UFC, but it's a tryout for a contract, not a UFC fight;
// the owner, 2026-11-06: its losers were listed as UFC fighters)
export const tryout = (bout) => /Contender Series/i.test(bout?.event ?? '');
