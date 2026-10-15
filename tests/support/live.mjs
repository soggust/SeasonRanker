// A check on the live data's quality (a write-up's length, a value printed, its hash): what the code made of the
// data the bots just wrote, not whether that data is whole. In the bots' own runs (the workflows set
// LIVE_DATA_SOFT=1 on their npm test) a failure here is a warning in the run's log and the commit goes ahead: a
// long news headline in a CHECK's reason failed the desk's tests on 2026-10-14 and lost that run's bets and the
// Odds API ask that priced them. Everywhere else (ci.yml, the deploy, a local npm test) it fails as any test,
// so the code that made it is fixed. Whether the data is whole (it parses, every bet has its fields: data.test.mjs)
// is never soft.
import { test } from 'node:test';

export const LIVE_SOFT = process.env.LIVE_DATA_SOFT === '1';

export function liveTest(name, fn) {
  if (!LIVE_SOFT) return test(name, fn);
  return test(name, async (t) => {
    try {
      await fn(t);
    } catch (err) {
      const why = String(err?.message ?? err).split('\n')[0].slice(0, 300);
      console.log(`::warning::live data, not failed (LIVE_DATA_SOFT): ${name}: ${why}`);
    }
  });
}
