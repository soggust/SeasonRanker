// A pick's band, in one place: the bettor's confidence (picks.mjs's BANDS: lock, high, medium, low, and check) and
// the name the site shows for it (LOCK, CHECK, LOVE, LIKE, PASS), on the Bets rows, the lines' chips, the wallet's
// Bot column, the slip and the Algorithm's By Confidence. (The wallet stores the shown name on a bet: tier.)
//
// CHECK isn't a bet the bot made: a market the model is too far from the book on to bet (picks.mjs checks,
// checks.mjs), kept for the owner to look into. Its place is between LOCK and LOVE wherever the bands sort; an
// admin's alone on the Book (its own color, its name alone on its badge; a "?" for its rank)
export type Confidence = 'lock' | 'check' | 'high' | 'medium' | 'low';
export type Tier = 'lock' | 'check' | 'love' | 'like' | 'pass';

// (best first; CHECK after LOCK, before LOVE)
export const TIERS: readonly { confidence: Confidence; tier: Tier; label: string }[] = [
  { confidence: 'lock', tier: 'lock', label: 'Lock' },
  { confidence: 'check', tier: 'check', label: 'Check' },
  { confidence: 'high', tier: 'love', label: 'Love' },
  { confidence: 'medium', tier: 'like', label: 'Like' },
  { confidence: 'low', tier: 'pass', label: 'Pass' },
];

// A confidence's tier (none for none)
export function tierOf(confidence: Confidence | null | undefined): Tier | null {
  return TIERS.find((t) => t.confidence === confidence)?.tier ?? null;
}

// A confidence's name as the site says it ("Love")
export function tierLabel(confidence: Confidence): string {
  return TIERS.find((t) => t.confidence === confidence)?.label ?? '';
}

// (a band's place in the order, LOCK 0 to PASS 4; a tier's name or a confidence, none last: for sorting by band)
export function bandOrder(band: Confidence | Tier | null | undefined): number {
  const at = TIERS.findIndex((t) => t.confidence === band || t.tier === band);
  return at < 0 ? TIERS.length : at;
}

// (a cap the desk puts on a band: 'medium' a LIKE at most (a rule's: a practice pick, a gate, a role or research pick,
// a suspect price, D46), 'high' a LOVE at most (the confidence layer's tiers, D52). A band held to it: the cap where
// the band sits above it, else the band; a CHECK and a PASS as they are)
export type BandCap = 'medium' | 'high';
export function heldTo(band: Confidence, cap: BandCap | null | undefined): Confidence {
  if (!cap || band === 'check' || band === 'low') return band;
  return bandOrder(cap) > bandOrder(band) ? cap : band;
}

// (the bands above the ranks, unnumbered: a LOCK, and a CHECK, which isn't ranked as a bet)
export const unranked = (band: Confidence | null | undefined): boolean => band === 'lock' || band === 'check';

// (a favorable bet: a LOCK, LOVE or LIKE; never a CHECK (an admin's held bet), a pass or a fade. Best Bets with
// none of them says so in one line: book-page.component.html .board-empty)
export const favorableGrade = (grade: string | null | undefined): boolean => grade === 'lock' || grade === 'love' || grade === 'like';
