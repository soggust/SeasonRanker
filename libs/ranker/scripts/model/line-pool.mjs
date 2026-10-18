// The line-size trust's pool (desk.mjs fitBuckets): every sport's evidence on a counted line, read from their
// ledgers, for the bucket a sport's own record is too thin to fit alone (the owner's, 2026-10-18: "pooled across
// sports only where sparse"). Each sport's props (anytime TDs among them) and the MMA's round totals, placed since
// the epoch, with a result or a close and not void (run.mjs refitTrust's evidence). A ledger unread: its bets not
// counted (fail safe: the pool is a prior, never the price)

import fs from 'node:fs';
import path from 'node:path';

export const POOL_SPORTS = ['nfl', 'nba', 'nhl', 'mlb', 'mma'];

// (a bet that is evidence on a line: a prop's, or a round total's (the MMA's), since the epoch)
export function lineEvidence(b, epoch) {
  if (!b || b.void || !Number.isFinite(b.line)) return false;
  if (b.market !== 'prop' && !(b.market === 'total' && b.sport === 'mma')) return false;
  if (b.status === 'open' && !b.clv) return false;
  return Date.parse(b.placedAt ?? b.start ?? '') >= Date.parse(epoch);
}

// Every other sport's (not `skip`, whose bets the caller has in hand) evidence, each bet tagged with its sport
export function readLinePool(root, epoch, skip = null) {
  const out = [];
  for (const sport of POOL_SPORTS) {
    if (sport === skip) continue;
    try {
      const bets = JSON.parse(fs.readFileSync(path.join(root, 'apps', sport, 'src/StaticData/model/ledger.json'), 'utf8')).bets ?? [];
      for (const b of bets) {
        const t = { ...b, sport: b.sport ?? sport };
        if (lineEvidence(t, epoch)) out.push(t);
      }
    } catch {
      // (unread: not counted)
    }
  }
  return out;
}
