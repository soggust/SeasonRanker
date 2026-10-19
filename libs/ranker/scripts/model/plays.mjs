// The shots in an ESPN final's play-by-play, by shooter, for the props' feeds round (the owner, 2026-10-18: the
// site's rink zones and shot zones in the bettor; INPUTS.md). Read from the same summary playerlogs.mjs recordBox
// keeps each final's lines from (asked once a final), kept with them, and learned only after the game's day
// (matchups.mjs nhlMatchups, nbaMatchups): no look-ahead.
//
//   NHL  each skater's shot attempts: [on goal (saved or scored), missed, blocked, from the slot (SLOT_FT or
//        closer to the net), their distances summed (feet), the attempts with a spot read]. ESPN's rink is the NHL's (x -100 to 100, y -42.5 to
//        42.5, the nets at x +-89), the distance to the nearer net. A blocked attempt is the shooter's (ESPN's
//        participants: shooter, then the blocker); a goal's scorer is its shooter. A side's attempts blocked are
//        its shooters' blocked ones: the other side's blocks
//   NBA  each player's field-goal attempts by zone: [at the rim (RIM_FT or closer), its makes, the other twos,
//        their makes, threes, their makes]. ESPN's half court: the basket at x 25, y 0 (feet); a three by the
//        play's words ("three point") or its spot (THREE_FT or farther); free throws left out. The shooter is the play's
//        first participant (a blocked shot's too: the shooter first, then the blocker)
export const SLOT_FT = 25;
export const RIM_FT = 5;
export const THREE_FT = 24;

const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);
const r1 = (x) => Math.round(x * 10) / 10;

export function nhlShots(body) {
  const out = {};
  for (const p of Array.isArray(body?.plays) ? body.plays : []) {
    const t = p?.type?.text;
    const kind = t === 'Shot' || t === 'Goal' ? 0 : t === 'Missed' ? 1 : t === 'Blocked' ? 2 : -1;
    if (kind < 0) continue;
    const who = (p.participants ?? []).find((q) => q?.type === 'shooter' || q?.type === 'scorer')?.athlete?.id;
    if (!who) continue;
    const x = num(p.coordinate?.x);
    const y = num(p.coordinate?.y);
    const ok = x !== null && y !== null && Math.abs(x) <= 100 && Math.abs(y) <= 43;
    const d = ok ? Math.hypot(89 - Math.abs(x), y) : null;
    const v = (out[String(who)] ??= [0, 0, 0, 0, 0, 0]);
    v[kind]++;
    if (d !== null) {
      if (d <= SLOT_FT) v[3]++;
      v[4] = r1(v[4] + d);
      v[5]++;
    }
  }
  return out;
}

export function nbaShots(body) {
  const out = {};
  for (const p of Array.isArray(body?.plays) ? body.plays : []) {
    if (!p?.shootingPlay) continue;
    const text = String(p.text ?? '');
    const type = String(p.type?.text ?? '');
    if (/free throw/i.test(type) || /free throw/i.test(text)) continue;
    const parts = (p.participants ?? []).map((q) => q?.athlete?.id).filter(Boolean);
    const who = parts[0];
    if (!who) continue;
    const made = !!p.scoringPlay;
    const x = num(p.coordinate?.x);
    const y = num(p.coordinate?.y);
    const ok = x !== null && y !== null && Math.abs(x) < 1000 && Math.abs(y) < 1000;
    const three = /three point/i.test(text) || (ok && Math.hypot(x - 25, y) >= THREE_FT);
    const rim = !three && ok && Math.hypot(x - 25, y) <= RIM_FT;
    // (a two whose spot isn't read: the rim's by its kind of shot, a layup's or a dunk's or a tip's)
    const rimByType = !three && !ok && /layup|dunk|tip/i.test(type);
    const z = three ? 4 : rim || rimByType ? 0 : 2;
    const v = (out[String(who)] ??= [0, 0, 0, 0, 0, 0]);
    v[z]++;
    if (made) v[z + 1]++;
  }
  return out;
}
