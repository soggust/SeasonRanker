# The bettor's decisions

The owner's rules for the Algorithm (the play-money bettor in this folder). Read this before any bettor change.

- A change must not undo a rule here without saying so.
- When a change conflicts with a rule, the conflict goes to the owner. The agent doesn't pick.
- Each rule has a pinning test in `tests/model-decisions.test.mjs`. The test's name starts with its id (`D3 ...`), so a failure points back here.
- Update this file and its test in the same commit as the change.

Started 2026-10-18, after about 20 bettor changes in one day. The owner: "keep it organized with good notes so the bot doesn't go retard later."

## Rules

### D1. Gates shrink stakes, never stop a market
- **Date:** 2026-10-17 (1b461dfa); the research gate's version 2026-10-18.
- **Owner:** "why would it stop betting? it should reset everything on an algorithm change, and it needs practice and data; it's play money; don't chase a perfect record via confidence, improve the choices."
- **Rule:** a failing gate puts its market at the practice stake (`PRACTICE_UNITS`, 0.5u, a LIKE at most) and keeps betting it by its normal rules. An edge is still needed. This covers the line CLV gate, the prop CLV gate, the research gates and the MMA round totals.
- **Code:**
  - `desk.mjs`: `gatedPlacement`, `lineGate`, `propGate`, `practiceGates`
  - `research.mjs`: `researchGateOf`, which `practiceGates` turns into a cap
  - `fights-totals.mjs`: the practice stake until `TOTAL_LIVE`
  - `picks.mjs`: `levelOf`, which reads `b.practice` (a LIKE at most)
- **Never:** a gate that sets units to 0, tracks a row "for the gate's sake", or turns a kind of bet off.

### D2. Every slate is played; no sport is reduced to zero bets by its record
- **Date:** 2026-10-18 (a454c624).
- **Owner:** "the idea that the bot is going to stop finding picks because of its historical record is a flaw... it should be using history to make BETTER picks, not stop playing the game altogether."
- **Rule:** each slate (a sport's US Eastern day) plays about `PRACTICE_N` picks: NFL 15, NHL 6, MLB 3, NBA 8.
  - Each game gets its share, at least one (`slateQuota`).
  - Every row that clears the vig bets as before.
  - The best of the rest with an edge before the vig (the corrected chance over the no-vig) bet at 0.5u, a LIKE at most, marked `topN`. One per player, and the caps and gates still apply.
  - The record corrects the numbers by segment (D17). It never reduces the volume.
- **Code:**
  - `desk.mjs`: `PRACTICE_N`, `slateQuota`, `practiceTop`
  - `run.mjs`: `practicePicks`, and `betProps` (`topN`)
- **2026-10-18 audit fix:** `practicePicks` returned nothing whenever the correction had no fit, for example when its fit threw. Now the trusted chance's edges rank the picks then, so the slate is still played.
- **Gap, not built:** MMA has no `PRACTICE_N`. Its bouts bet on an edge alone, and the rest are tracked. On 10-17 and 10-18 it placed 1 and 2 bets. See "Open for the owner".

### D3. PRACTICE_SPLIT: practice picks are tallied apart
- **Date:** 2026-10-18 (a454c624).
- **Owner:** "not set on practice bets counting in the real record."
- **Rule:** while `PRACTICE_SPLIT` is on, a `topN` pick has its own Practice line. It stays out of the bot's record, its recent form and the CLV gates. It is still graded and learned from like any bet: by the correction, the trust and the calibration.
- **Code:**
  - `desk.mjs`: `PRACTICE_SPLIT`, `inPractice`, `record`, `practiceRecord`, and `propGate`/`lineGate` (`!inPractice`)
  - `picks.mjs`: `recentOf`
  - `model-desk.component.ts`: `allPractice`
  - `state.json`: `practiceSplit`
- **Never:** a practice pick in `record()`, the recent form or a gate window. Audited 2026-10-18: no path bypasses it. A re-priced practice pick is picked again from scratch, and `topN` is set only on rows that don't clear the vig.

### D4. The epoch: trust and gates restart on every major change
- **Date:** 2026-10-11.
- **Owner:** "we should be restarting trust every time we make a major change to the model."
- **Rule:** bump `MODEL_EPOCH` (an ISO time, `leagues.mjs`) to the push time on any change that alters projections, pricing or what is bet, and add a line to its History comment.
  - These count only bets since the epoch: the trust fit (`fitTrust`), the CLV gates (`lineGate`, `propGate`), the research gate and the research level.
  - These read every epoch: the calibration and the correction. Since 2026-10-18 they are row-hungry fits, not judges of the model (940fd86a, a454c624).
- **Code:** `leagues.mjs` (`MODEL_EPOCH`), `desk.mjs` (`sinceEpoch`), `run.mjs` (`refitTrust`, `researchCalls`).
- **Not bumped for:** UI-only, data-plumbing or staking-policy changes (1b461dfa was staking policy).

### D5. A research reason goes into the price, never an automatic pass
- **Date:** 2026-10-17 (e91ebd32), 2026-10-18 (19d41785, 63b33dd1).
- **Owner:** "if the book has a real reason, add it to the calculation, don't auto pass."
- **Rule:** a reason the research finds that an input can carry goes into this run's injury report copy: the player's own status, a teammate's, or a QB named to start. The market is projected and priced again.
  - A reason already on the report is "held": priced as it stands.
  - Both are priced at the market's trust with the lean held at half the GAP (`clearedChanceAt`). An edge is bet. With no edge it is passed with its reason, and either way it leaves the CHECKs.
  - Only a real reason that no input carries (a role alone) is passed outright.
- **Code:** `research.mjs` (`researchInputs`, `researchDecision`), `run.mjs` (`researchCalls`, the `betProps` research block).

### D6. Research found nothing: bet the model's side
- **Date:** 2026-10-18 (a71c7704, then b811fff6).
- **Owner:** "when you can't find info like Corum, at a certain point we have to just say we like it."
- **Rule:** a real answer that found nothing (explains false, with sources, not hollow) is verdict `bet` at any confidence, low included. It is priced as in D5. Only a low answer that names a real reason it can't size stays a CHECK.
- **Code:** `research.mjs` `verdictOf`.

### D7. A failed search is re-asked, never stored as a finding
- **Date:** 2026-10-18 (a71c7704, 73734875).
- **Rule:** a call whose search failed is hollow. That covers an answer's own words ("hit the search limit"), any `web_search_tool_result` error, and no sources with status unknown. A hollow call gets no verdict, is never kept, and is re-asked ahead of every new CHECK.
- **Code:** `research.mjs` (`searchFailed`, `hollow`, `verdictOf`, `researchChecks` ordering), `check-patterns.mjs` (hollow answers are no evidence).

### D8. Soft terms, self-tuning, never all-or-nothing
- **Date:** 2026-10-14 (264738d3, b890dbc0).
- **Owner:** "even if the factors are minor... we should still be able to modify it to like 0.0007 or whatever."
- **Rule:** a small real effect stays in at a small weight, shrunk by its evidence and moved a capped step per refit. On/off exists only as a safety fallback. Related terms are tested jointly, with no double counting against the baseline.
- **Code:**
  - `project.mjs`: the soft late terms
  - `calib.mjs`: `shrinkOf`, `CAL_STEP`
  - `desk.mjs`: `shrunkTrust` (`eff / (eff + TRUST_K)`)
  - `correct.mjs`: ridge `LAMBDAS`
  - `check-learn.mjs`: `loosenings` (weight up to 1, `LOOSEN_STEP` 0.25 a run)
- **2026-10-18 audit fix (the loss review's B12):** the calibration's step was per run, so hourly runs moved it about 0.03 an hour. A spot that lost its gate also dropped to 0 at once. Both now step at most `CAL_STEP` per UTC day, toward the target or toward 0. Labels are fixed as well: a spot shifted only by the pooled rungs says "pooled only".

### D9. The dated AI caps (CAP_WINDOWS) revert on their own on 2026-11-01
- **Date:** 2026-10-18 (9d2e4fc6, 5edc4c98).
- **Why:** $233.69 in API credits expires on 2026-11-01. `ai-budget.mjs` `CAP_WINDOWS` is the caps' source of truth.

| Window | Research | News signals | Miss review |
|---|---|---|---|
| 10-18 (UTC day) | $100/day, $100/month | $1/day, $10 for the window (read every run) | $2/day, $40 for the window |
| 10-19 to 10-31 | $8/day, $60/month | $1/day, $10 for the window (read every run) | $2/day, $40 for the window |
| From 11-01 00:00Z (standing) | $4/day, $55/month | $0.15/day, $4/month (once a day) | $1/day, $25/month |

- **Code:** `ai-budget.mjs` (`CAP_WINDOWS`, `scheduledCaps`, `capsFrom`). Repository variables may lower a cap, never raise it.
- **Other caps:** the miss review's backfill has a hard $30 (`MISS_BACKFILL_CAP`). The write-ups are $1.50/day and $25/month, for LOVE/LOCK only (`DAY_CAP`, `MONTH_CAP`, `WRITEUP_LEVELS` lock,high; 2026-10-10/11). Never raise a cap or widen a scope without a measured quote and a yes.

### D10. The miss review explains; it never moves a weight
- **Date:** 2026-10-18 (5edc4c98, backfill 36de991f).
- **Rule:** once a UTC day from 12:00, through the Batches API, the review takes each sport's 5 biggest misses plus the 2 worst CLV losers. A broken premise is left out. It tallies their causes.
  - A cause past a shrunk share (25%, 3 reviews or more, variance aside) becomes a recommendation and a refit candidate.
  - A stale-data finding is flagged as a bug.
- **Code:** `miss-review.mjs` (`pickMisses`, `recommendationsOf`), `ai-budget.mjs` `missBudget`.
- **Never:** writes `state.json`, a term or a weight. A recommendation still has to pass the refit's held-out gate, and the champion/challenger gate once it lands.

### D11. The CHECK pattern loop resolves only what research has answered, and keeps research measuring
- **Date:** 2026-10-18 (8867ecdd, seeds a07a3885).
- **Rule:** each researched CHECK is grouped by cause and by "feeds saw it". A pattern resolves a new CHECK by rule (cost 0) only at its rate. The rate is `MAX_RATE` 0.9 times the top resolution's share, the support of its graded record and its evidence. So at least about 10% of its CHECKs are still researched, and the share stays measured.
  - A rule's own resolutions are never evidence for the share.
  - A pattern whose record turns falls back to research by itself.
  - A rule-resolved bet goes through the same research gate, research level, prop caps and one-per-player rule as a research bet. It is never a bypass.
- **Code:** `check-patterns.mjs` (`patternBook`, `preResolve`, `MAX_RATE`), `run.mjs` `noteInjuries`.

### D12. One desk run per batch of fixes
- **Date:** 2026-10-18.
- **Owner:** "works really well first, built now second... why are we waiting to fix shit?"
- **Rule:** push each fix as soon as it is green, with no game-time deadlines. Dispatch one desk run after the batch is on master, not one per fix.
- **Where:** process only, in agent briefs (`quality-over-deadline`). There is no code to pin.

### D13. GitHub is the only bettor; never run it locally without --dry
- **Date:** 2026-10-09.
- **Rule:** a local run without `--dry` writes ledgers that collide with GitHub's commits, which happened on 2026-10-09.
- **Code:** since 2026-10-18 `run.mjs` (`liveRunAllowed`) refuses a run that isn't `--dry` unless `GITHUB_ACTIONS` is `true` or `MODEL_DESK_LOCAL=1` is set for a deliberate run (pull first, push right after).
- **Also:** `--dry` spends no Odds API credits unless `--paid`.

### D14. You vs the Bot: same game, same bet
- **Date:** 2026-10-17 (f82f80ee).
- **Rule:** each settled straight bet of yours is set against the bot's own side on that market when you placed it. That side is read from `board-seen.json` rows: the side its board liked better at that price, at its own stake or a forced Kelly stake. "When you placed it" is the row showing then, else the newest within 6 hours, else none.
  - Opposite sides are a duel. The same side is agreed, half a point each.
  - These are never counted: a parlay, a void bet, or a bet with no bot row.
  - Only the settler writes `bot` (`firestore.rules`).
  - The bot's own record stays on the Algorithm tab. The practice split (D3) doesn't change the duel.
- **Code:** `board.mjs` (`botSidesOf`, `botSeenUpdate`), `accounts/settle-lib.mjs` (`botPickAt`, `gradeBot`), `wallet-view.ts` `headsUp`.

### D15. The slot machine is gone for good
- **Date:** 2026-10-17.
- **Rule:** the Book's slot-machine handle and reel spin (pull, pulling, spinning) are deleted. Never bring them back or ask about them again.
- **Code:** `libs/ranker/src/engine/book/`.

### D16. Stale inactives and listings are never read as new
- **Date:** 2026-10-18 (f56f86d0, 04c94b45, 27615ed6).
- **Rule:** a game-day inactive list counts only the names new since the team's last game (`freshInactives`). A carried name keeps its injury report status. With no last game read, nothing is taken from the list.
  - A listing dated before the team's last game, plus 4 hours, is taken off the report (`staleReport`). Out and IR listings stay.
  - The posting's size cap is judged on new names (`espn.mjs` `postedMax`).
  - The NBA's starting five gets the same carry-over guard (5106c5fa).
- **Code:** `context.mjs` (`freshInactives`, `staleReport`, `gameRosters`), `espn.mjs` `postedMax`.

### D17. Small counts never read big: line-size trust buckets and stake-Kelly bands
- **Date:** 2026-10-18 (940fd86a).
- **Owner:** "make sure small numbers aren't influencing K rating by % or anything crazy."
- **Rule:** a prop's trust is its line bucket's: low (1.5 or under) starts at 0.25, mid (2 to 3.5) at 0.375, high at 0.5. Each rung is pulled toward its sport's and every sport's pooled trust by its own evidence (`TRUST_K` 40), and is held to the stat's own trust.
  - Bands and every Kelly shown use the stake's Kelly (`stakeKelly`, held to -110's scale), never the raw model's.
  - A CHECK is judged by its cleared Kelly, with a bar of +1 (`checkKelly`).
- **Code:** `desk.mjs` (`lineBucket`, `fitBuckets`, `bucketTrustOf`, `stakeKelly`), `picks.mjs` `kellyOf`, `checks.mjs` `checkKelly`.

### D18. The learned correction prices the props; the trust sizes, never decides
- **Date:** 2026-10-18 (a454c624).
- **Rule:** one fit covers every graded prop: bets, tracked and practice rows, across epochs and sports. It learns where the model beats the book's no-vig and where it doesn't, by segment (sport, stat, bucket, lean, gap, price, home, timing). It is ridge-shrunk, and its penalty and families are self-tuned on a time split.
  - A segment that loses moves toward the book, or past it.
  - The live calibration sits inside it (it fits the raw chances), never stacked on it. Audited 2026-10-18: `priceProps` passes the raw `pOver` to `correctSides`, and `corrRows` reads `modelRaw`, so there is no double count.
  - The trust sizes the stake (`trustedUnits`, never under 0.5u). It never decides whether a row plays.
  - Under `CORR_MIN` (120) rows, the old trusted chance is used.
- **Code:** `correct.mjs`, `props.mjs` `priceProps`, `run.mjs` `refitCorrection`, `desk.mjs` `trustedUnits`.

### D19. Research earns its level
- **Date:** 2026-10-18 (b811fff6).
- **Rule:** research bets, and research-adjusted bets on their CHECK's own market, start at the practice stake (0.5u, a LIKE). They are counted across every sport, since the epoch.
  - The level is earned at 40 graded or more, with the hit rate over its prices' break-even and a mean CLV (v2 `prob`) of 0 or better. Then they stake at their Kelly (`stakeFor`), and LOVE/LOCK are possible.
  - Below that bar they go back to practice, never off.
  - A kind whose own gate is at practice stays at practice.
- **Code:** `research.mjs` (`researchLevelOf`, `researchEarned`, `researchCall`), `run.mjs` (`researchTag`, `betProps`), `picks.mjs` `levelOf`.
- **2026-10-18 audit:** this survived a71c7704 and 19d41785 (both before it), and 940fd86a, a454c624 and 11302242 (after it). Research rows are excluded from `topN`, and the level reads v2 CLV.

### D20. The CHECK rule and the role bets
- **Dates:** 2026-10-12 (7e7dca64), 2026-10-17 (round E), 2026-10-18 (940fd86a, e2d3434a).
- **Owner:** "CHECKs should be for crazy value, not inappropriate math."
- **Rule:**
  - A gap trip is a PASS, kept as a graded shadow.
  - A role or news CHECK must clear +1 on its cleared Kelly.
  - A role cause bets its risky side (0.5u, a LIKE) only once 40 graded CHECKs of that cause pay on the model's side. Those 40 count every graded CHECK, closed ones too (`reopened`). Never under 40 for a cause.
  - check-learn's loosenings apply softly, from 40 decided with the interval's low end 3 points clear of break-even.
- **Code:** `checks.mjs` (`shadowOf`, `CHECK_KELLY`), `props.mjs` (`ROLE_BET`, `ROLE_BET_N`, `roleGateOf`), `check-learn.mjs` (`checkLearning`, `loosenings`, `reopened`).

### D21. Bands, stakes and the book
- **Dates:** 2026-10-09 to 10-13.
- **Rule:**
  - `BOOK = 'draftkings'` only. The owner rejected best-price shopping, and Pinnacle de-vigged is the fair anchor.
  - LIKE is any edge, LOVE is 2% Kelly, LOCK is 5% plus a 55% chance (9cb65c47).
  - Every placed bet is a LIKE or better. No-edge rows are tracked: never staked, never on the record, still learned from (2026-10-13).
  - A flagged pick with an edge bets at the minimum (d9879f0d).
  - Stakes run 0.5 to 3u.
- **Code:** `leagues.mjs` `BOOK`, `picks.mjs` (`BANDS`, `levelOf`), `desk.mjs` (`placement`, `TRACK`).

### D22. Every change faces the champion/challenger gate
- **Date:** 2026-10-18.
- **Owner:** "I fuckin love this."
- **Rule:** a change ships only if it doesn't worsen projection accuracy (recency-weighted, split at the rule eras) and beats or ties the current version against the book. Results go on the dated scorecard.
- **Status:** being built (backtest, selfcheck, model-desk UI) by its own agent. Add its code pointers and pinning test here when it lands.

## Loops

Each loop below runs by itself. For each one: what it changes, how often, what it reads, and what it must never touch.

| Loop | Changes | How often | Inputs | Never |
|---|---|---|---|---|
| Trust fit (`desk.mjs` `fitTrust`, `fitBuckets`; `run.mjs` `refitTrust`) | `state.trust` and line buckets: stake size, the CHECK bar's cleared chance, research pricing | every run | bets and tracked rows since `MODEL_EPOCH` (practice included), results and close `q`, the backtest | read pre-epoch rows; decide whether a prop plays (D18) |
| Live calibration (`calib.mjs`; `run.mjs` `refitCalib`) | `state.calib`: shifts on the model chance (guards, CHECKs, research pricing, the trusted fallback) | every run, at most `CAL_STEP` a UTC day | every graded prop's raw chance (`modelRaw`) across epochs, other sports pooled | fit on its own shifted chance; stack under the correction; jump to 0 |
| Learned correction (`correct.mjs`; `run.mjs` `refitCorrection`) | each prop's priced chance `p`, and the `topN` ranking | every run | every graded prop (bets, tracked, practice), raw chance, no-vig, result, close `q` (CLV v2 carried to the bet's line) | read the calibrated chance; let the trust shrink on top |
| CHECK learning (`check-learn.mjs`) | role thresholds (soft weights, 0.25 a run), cause bet rules, `ROLE_BET` gates | every run | every graded CHECK, closed ones too for the gates | act under 40 decided; apply a loosening before its interval clears |
| CHECK patterns (`check-patterns.mjs`) | resolves open CHECKs by rule (cost 0) | every run, free, `--dry` too | researched CHECKs, `check-seeds.json` | count its own rule resolutions; go past `MAX_RATE`; skip the gates or caps (D11) |
| CHECK research (`research.mjs`) | verdicts, injury report inputs (`researchInputs`), research bets | hourly with `CHECK_RESEARCH=1`, under `CAP_WINDOWS` | open CHECKs, the injury report, rosters, web search | store a failed search (D7); raise a cap; run on `--dry` (saved findings replay only) |
| Research level and gate (`researchLevelOf`, `researchGateOf`) | stake level of research bets | every run | research bets since the epoch, every sport, CLV v2 `prob` | turn research off (D1, D19) |
| Miss review (`miss-review.mjs`) | the Self-check panel's recommendations and bug flags | daily from 12:00 UTC, batch | each sport's biggest misses since its last review | write a weight or `state.json` (D10) |
| Post-mortems and stat re-checks (`postmortem.mjs`; `run.mjs` 4b) | grades, a broken premise's `weight`, re-grades after stat corrections | every run (re-check a day and a half after the start) | finals' box scores, the league's own box (NHL) | grade a DNP as a loss |
| CLV capture (`clv.mjs`; `run.mjs` `captureClose`) | each bet's `clv` (v2: `prob`, `q`, `beat`) | every run | ESPN closes once final, the board's ladder | count a moved line it can't carry as 0 |
| Weekly self-check (`selfcheck.mjs`; `model-desk-weekly.yml`) | `selfcheck.json`, a report only | weekly | ledgers, CHECKs, `state.json` history in git | change the bettor |
| Refits (`project.mjs` via `fitcache.mjs`; `ratings.mjs`; `fights-model.mjs`) | projection terms, team ratings, context terms, the MMA model | props once a day (first run from 6 AM CT, or `--refit`); ratings and context every run; MMA soft terms every run | the history (NFL from 2016; NBA, NHL and MLB the last two seasons; MMA every pro bout) | keep a term without its held-out gain |

### Recency in the fits (audited 2026-10-18)

- **Team ratings:** decay geometrically. Each offseason multiplies a rating by `revert`: NFL, NBA and MLB at 0.5, NHL at 0.98. An NHL rating carries almost whole into the next season.
- **A player's base:**
  - This season's games against a prior, with weight `priorW = K / (games + K)`. K runs 2 to 32 by stat.
  - In the prior, last season counts 1 and every older season 0.5, lumped together.
  - The last 5 games' form weight runs from 0 to 0.4.
  - The defense tables count this season 1, last season 0.5, older seasons 0.
- **The fitted settings themselves** (each stat's K, form weight, scale, dispersion, calibration and context terms) are fit flat over their window. The NFL's window is roughly 2019 to 2023 and is held out on 2023 to 2026; the other sports' window is two seasons. The recency half-life `hl` (`HL` 3/2/1 seasons) is tried on every stat, but only NFL passing yards kept it (3 seasons).
- **No fit uses 25-year-old seasons.** The NFL's history starts in 2016 and the others' at the last season.
- **Gaps:**
  - The fitted settings are flat over 2019 to 2023 for the NFL.
  - There is no rule-era split (D22 adds one for its gate).
  - The prior lumps older seasons at 0.5.
  - The MMA fit, the calibration and the correction weight all their rows flat. The last two only have rows since 2026-10-08.

## Open for the owner

- **O1.** Research "we like it" (D6) against small-count trust (D17), at low lines. Research decisions are priced at the trust with the lean held at half the GAP. At a low line's trust of 0.25 that adds at most 1.9 points, under -110's 2.4-point vig. So a "found nothing" verdict on a 1.5-or-under line at a standard price can't show an edge, and it is passed. Since a454c624 the regular props don't use the trust to decide (D18), but research decisions still do. The NFL's research calls so far show 27 edge bets against 2 no-edge passes, so it has rarely bitten yet. Options:
  1. Keep it (the trust decides research rows).
  2. Price research rows with the correction.
  3. A "found nothing" row with no edge becomes a 0.5u practice pick (D2).
- **O2.** MMA has no practice top N (D2). Its cards bet edges alone.
