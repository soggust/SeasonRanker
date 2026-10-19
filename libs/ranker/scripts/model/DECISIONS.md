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
- **MMA (O2 closed 2026-10-18):** `PRACTICE_N.mma` is 3 a card. Every bout clearing the vig bets as before. Of the rest with a DraftKings price and an edge before the vig (the trusted chance over the no-vig, the same fallback as the props without the correction), each main-card bout plays its side, and the best prelims fill the card to 3. Main card: the card's bouts at its last ESPN start time. Each is a 0.5u practice pick, `topN`, tallied apart. Code: `mma-desk.mjs` `mainCardOf`, `mmaPracticePicks`.

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

### D18. The learned correction: a candidate behind a flag; the props are priced at the trust (the gate's verdict)
- **Date:** 2026-10-18 (a454c624; the gate's verdict the same night).
- **Verdict (gate.mjs, D22, 2026-10-18):** the correction loses to the trust pricing it replaced, so `CORR_PRICING` is false. The props are priced at the trust-shrunk chance again (`chanceAt` at the line bucket's trust, D17, with the stake-Kelly bands). Everything else from a454c624 stays: every slate played, the top-N practice picks (ranked by the trusted chance's edge before the vig, D2's fallback), `PRACTICE_SPLIT`. `CORR_ON=1` turns the correction on for one run, as the gate's challenger.
  - a454c624's correction against the trust (the gate agent's run): close log loss worse beyond noise in the NFL, NHL and MLB, results tied.
  - The shrunk correction below, against the trust: NHL close log loss +0.0015 worse (95% +0.0010 to +0.0020) and top picks' CLV -0.024 worse (-0.037 to -0.011); MLB close +0.0004 worse (+0.0002 to +0.0006); NFL tied (close 0.4622 both, results 0.5150 against 0.5157). With the global terms shrunk too (`CORR_GLOBAL_RIDGE=1`): NHL close still +0.0005 worse (+0.0003 to +0.0007), MLB and NFL tied. HOLD both ways.
  - The trust pricing (this version) against origin/master's correction: SHIP. Props close log loss better in the NFL (0.4666 to 0.4622, 95% -0.0086 to -0.0018), NHL (0.6724 to 0.6699, -0.0031 to -0.0018) and MLB (0.6798 to 0.6774, -0.0058 to -0.0002); results log loss tied; MLB top picks' CLV better (+0.013).
  - Out of sample (fit on each sport's earlier 70%, judged on its later 30%, `correctionReport`), log loss of the shrunk correction against a454c624's: NFL 0.4644 against 0.4650 (raw 0.4959, book 0.4651); NHL 0.6683 against 0.6684 (raw 0.6759, book 0.6680); MLB 0.7026 both (raw 0.7110, book 0.6982). It tracks the book, a little better than it in the NFL and no better elsewhere.
- **Rule, while it's on:** one fit covers every graded prop: bets, tracked and practice rows, across epochs and sports. It learns where the model beats the book's no-vig and where it doesn't, by segment (sport, stat, bucket, lean, gap, price, home, timing). It is ridge-shrunk, and its penalty and families are self-tuned on a time split.
  - A segment that loses moves toward the book, or past it.
  - The live calibration sits inside it (it fits the raw chances), never stacked on it. Audited 2026-10-18: `priceProps` passes the raw `pOver` to `correctSides`, and `corrRows` reads `modelRaw`, so there is no double count.
  - The trust sizes the stake (`trustedUnits`, never under 0.5u). It never decides whether a row plays.
  - Under `CORR_MIN` (120) rows, the old trusted chance is used.
  - **Shrunk by its evidence (the 2026-10-18 audit).** The NFL had tuned to the penalty grid's floor (2). A 4-row segment (rushAtt high under) then kept a third of its own fit, three nested families of the same rows adding up. A dry run priced Christian McCaffrey Under 14.5 carries at ev +0.39. Now:
    - `LAMBDAS` 2000 down to 20, never lower. At 20 a segment keeps about n / (n + 80) of its own fit.
    - A segment under `SEG_MIN` (30) graded rows has no term. It reads its parents' terms.
    - The gap feature is held to `DN_CAP` (2.5 spreads), so it can't extrapolate.
    - The move off the no-vig is capped by the stat's graded rows: `moveCap(n)` = 0.1 + 0.5 · n / (n + 200) logits, about 2.6 points at 4 rows and 11 at 400. In the model's own direction it never goes past the model.
    - The penalty and the family set use the one-standard-error rule toward more shrinkage (`oneSe`): the most shrunk candidate within one SE of the lowest held-out loss, paired row by row.
- **Code:** `correct.mjs` (`LAMBDAS`, `SEG_MIN`, `DN_CAP`, `moveCap`, `capMove`, `oneSe`), `props.mjs` `priceProps`, `run.mjs` `refitCorrection`, `desk.mjs` `trustedUnits`.

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
- **Every bettor change runs it before it ships** (its projections, pricing, stakes or selection): `node libs/ranker/scripts/model/gate.mjs --candidate <ref|worktree|env:NAME=value> [--champion origin/master] [sports] [--refit] [--record]`. A HOLD doesn't ship. A shipped version is recorded with `--record`.
- **Layer a (projections, price-free):** each final's margin and total (normal log score; CRPS reported) and each eligible player game's stat (the version's own count distribution), replayed from the games before it. Weighted by season (halving each season back) and split at the rule eras (`gate-score.mjs` `ERAS`: NFL 2024 kickoff, MLB 2023 pitch clock and shift ban, NBA 2016-17's three-point jump, NHL post-2005 rules). The current season and the two before it inside the era decide. Older seasons are a sanity check at a tenth of their weight: they can flag, never decide.
- **Layer b (every saved price):** the ledgers' graded props and game lines since 2026-10-08, bets and tracked rows, and the game-line backtest. Since D29, also the priced history (`history`): every archived game line since 2020 and prop since 2023, at the open against the close, recency-weighted. Each row is priced again walk-forward by the version: its correction fit only on the slates before the row's day; a version from before `correct.mjs` by the trust's shrink by line size. Measured: log loss on results and against the close's no-vig, each slate's top picks (`PRACTICE_N`) hit rate, CLV (v2) and units at the practice stake, and the edge picks at the stake table.
- **The rule in code:** `gate-score.mjs` `sportVerdict`, `gateVerdict`. SHIP when every sport's deciding layer a isn't worse beyond noise and layer b's log loss, close log loss and top picks' CLV beat or tie. Worse beyond noise means the clustered bootstrap's 95% interval (seeded, by day, slate or game) is wholly worse.
- **Scorecard:** `apps/<sport>/src/StaticData/model/scorecard.json`, an entry per version keyed by `MODEL_EPOCH` and commit, on the frozen benchmark (`gate-frozen.json`, fixed 2026-10-18) and the last 28 days. The Algorithm tab's Scorecard panel draws a point per version (`scorecard.ts`).
- **Leaks:** the weekly self-check's C23 (`leaks.mjs`) replays the priced history by segment (sport, stat, line size, side, team, price, timing; stat with side, stat with line size). A leak loses to the book beyond a 10% false discovery rate (Benjamini-Hochberg), at 40 rows in 8 games or more, with a shrunk loss. Trends are segments worse this week than before. Leaks are ranked by units at risk, carry the miss review's causes, and each is a candidate fix that must pass the gate.
- **Limits:** the props' layer needs the desk's cache (`.cache/model`: players' games and the saved fit; a dry run fills it). Both versions replay under the saved fit's settings unless `--refit`, which a change to the fit's search itself needs (the NFL's is about 27 minutes a version). Live-only code (news, CHECKs, timing, ladder rungs) can't be replayed. The gate says so and reads it as a tie.
- **Code:** `gate.mjs`, `gate-score.mjs`, `leaks.mjs`, `selfcheck.mjs` `c23`, `libs/ranker/src/engine/book/scorecard.ts`. Tests: `tests/model-gate.test.mjs`.

### D23. No sane price has an ev past 0.15: such a row is suspect, never bet at size
- **Date:** 2026-10-18 (the audit's McCaffrey row, ev +0.39).
- **Rule:** a priced row whose ev passes `EV_SUSPECT` (0.15) either way is logged loudly (`SUSPECT PRICE`) and marked `suspect`. Its ev is held to the bar, so it can't outrank the rest. It stakes the practice 0.5u and is a LIKE at most. It is still placed if it has an edge (D1: a cap, never an off switch).
- **Covers:** props, game lines, MMA moneylines.
- **Code:** `desk.mjs` (`EV_SUSPECT`, `suspectOf`, `choose`), `props.mjs` `priceProps`, `run.mjs` (`betProps`, the game markets), `mma-desk.mjs` `pickFor`, `picks.mjs` `levelOf`.

### D24. Model-vs-book gaps are scale-aware, never ratios
- **Date:** 2026-10-18.
- **Owner:** "a guy projected for .6 but the book thinks ~1 is huge %-wise but clearly not as different as projected 8 catches vs 14."
- **Rule:** a gap between the model and the book is read in probability points (the model's chance less the book's no-vig) or in SDs of the count distribution (`lineZ`: the implied mean less the model's, over sqrt(mu + mu²/r)). It is never read as a ratio of the means.
  - The role guard's far line (`ROLE.zHi` 1.15, `zLo` -0.75), the line alarm and C20's bands (`farOf`), and the CHECK diagnosis (`DIAG.MISSING_Z`, `RECENT_Z`, `RECENT_NEAR`, `RATE_FAR`, `NEAR`) are in SDs. The thresholds read as the old ratios did at middle counts (a 4-catch receiver, a 60-yard back).
  - Already scale-aware, left alone: the gap guard and the lean taper (`GAP`, `leanOf`: points), the correction's gap feature (logits and points), the miss review's surprise (`countZ`: SDs of the count), and research's "far" (the CHECKs those guards make).
  - The owner's examples: 0.6 against 1.0 at 0.5 is +0.52 SDs, so it is not a far line (its ratio 1.67 was). It is still past the gap guard at about 18 points, so it is a PASS shadow, not a role CHECK. 8 against 14 at 10.5 is +1.8 SDs at r 20, a far line as before, and about 55 points past the gap.
- **Code:** `props.mjs` (`lineZ`, `ROLE`, `roleChangeOf`, `farOf`, `lineAlarmOf`), `check-learn.mjs` (`DIAG`, `diagnoseProp`, the line loosening), `selfcheck.mjs` `lineBandOf`.

### D25. Research found nothing on a small line: a practice pick unless the corrected chance clears the vig
- **Date:** 2026-10-18 (the owner, resolving O1).
- **Rule:** a "found nothing" verdict (D6) on a line of 1.5 or under (the low trust bucket) is priced at its corrected chance where the correction is on, else at the trusted chance (the correction is off since the gate's verdict, D18). Clearing the vig, it is a real research bet. Otherwise it bets the model's side as a 0.5u practice pick (`topN`, a LIKE at most, tallied apart while `PRACTICE_SPLIT`). Larger lines are as D5 and D6.
- **Code:** `research.mjs` `researchDecision` (`low`, `corrected`, as `practice`), `run.mjs` `betProps` (`researchPractice`).

### D26. Users read "the Bot" and "the Book", never "the model" or "DraftKings"
- **Date:** 2026-10-19 (the owner, twice that day).
- **Owner:** the Book used "model" and "the bot" interchangeably; "the bot" is the standard everywhere users read it. Then: wherever users read "DraftKings", write "the book"; and, to users, the sportsbook IS the Book (they bet with us, we only borrow the lines), so Book and Bot are proper names.
- **Rule:** every word that reaches the page calls the bettor "the Bot" and the sportsbook "the Book": "the Bot's lean", "Bot vs Book", "the Bot's chance", "against the Book's no-vig 50%", "its" where it reads better. Both are capitalized everywhere users read them: "the Bot", "the Book" mid-sentence (the article lowercase), "The Bot", "The Book" at a sentence start. The Book is also the page's name (nav, title, logo chip): one name for both, the page and the sportsbook. That covers the Book, its popovers and About, the Live tab, the Algorithm tab's labels and tooltips, the wallet's You vs Bot, the game view, the text the bettor writes into user-facing fields (picks.json reasons and risks, CHECK reasons and research verdicts, the plain write-ups, the self-check's rows, the board's labels), and the NFL analysis prompts. The Claude write-ups' prompt says so too (`PROMPT_V` 3; older analyses keep their words till rewritten; the plain write-ups all written again, `PLAIN_V` 6), and the write-ups' validator no longer allows "DraftKings" as a name.
  - Kept as names of a technical part, not the Bot itself: "the game model", the fight model, the anytime TD's "plain model" and "red zone's model", the "model epoch", the "Live Model" admin tab, "Model term" (a miss-review cause), "model files", the "raw model" log loss, GitHub's Model Desk workflow, Claude as "an AI model", and nflverse's model. Other sportsbooks stay lowercase common nouns ("a sharp book", "another book's line", "the other books"), and Pinnacle and ESPN BET keep their names (sources, not the Book).
  - Kept as data: the ledger's `book: 'DraftKings'`, `BOOK` in leagues.mjs, the Odds API's bookmaker keys, ESPN's provider name and the NFL dossier's `book` field. Code identifiers, file names, JSON fields (`model`, `modelPct`, data/model) and comments are unchanged.
- **Code:** `libs/ranker/src/engine/book/`, `account/wallet/`, `game-view/`, `writeup.mjs` (`factsOf`: the sheet's book "the Book"; `ALLOW`), `writeups.mjs` `SYSTEM` and `PROMPT_V`, `picks.mjs` `legacyReasonOf`, `mma-desk.mjs`, `checks.mjs`, `desk.mjs` `gapGuard`, `props.mjs`, `research.mjs`, `run.mjs`, `selfcheck.mjs`, `apps/nfl/scripts/analysis/analyze.mjs`; pinned in `tests/model-decisions.test.mjs` (every non-comment line of those files read for "DraftKings" outside a data field and for a lowercase "the bot" or "the book").

### D27. Every bet the bot placed is a pick on the Book
- **Date:** 2026-10-18 (the owner's bug: WSH @ SF showed one of its four open bets).
- **Rule:** every open bet on a game not started that isn't a tracked row goes in picks.json: a guard's 0.5u cut one (`context.guard`: a moved line, a questionable player, the line gate) and a practice pick (its practice tag) too, and all of them, never cut to `TOP`. `TOP` (40) is only the page's Best Bets count across the sports. Each is shown, then published once locked, so the record by band covers every placed bet.
- **Why:** before 2026-10-13 a guard's cut was an action bet, kept off the Book. Since then a guard's cut with an edge is a real 0.5u bet, but the old filter still hid it, and `TOP` cut a 50-bet NFL Sunday.
- **Code:** `picks.mjs` `buildPicks`, `mma-desk.mjs` `buildFightPicks`; `tests/data.test.mjs` (every open placed bet is in picks.json).
- **Never:** a placed bet left off picks.json, whatever its guard, practice tag or rank.

### D28. Every stat the site has is weighed for the bettor, with no look-ahead
- **Date:** 2026-10-18 (the feeds round).
- **Owner:** "the bettor should ABSOLUTELY be knowing about any stats we have including NGS and any analysis I have etc etc etc... bot should be as smart as possible."
- **Rule:** `INPUTS.md` lists every data set the site has against what the bettor reads, each marked in, new, left out (with its held-out gain), in another form, or not useful. A new input:
  - reads only what was published before the bet. A per-game table learns a game after its day. NGS's weekly rows count from their week's last kickoff plus `NGS_PUB_HOURS` (36), and NGS's week-0 season totals are never read. A season-to-date site file is never read for a game in its own season.
  - is a late term on the gate (`project.mjs` `FEEDS`), soft where small (D8), kept on its stat's ctx only with a held-out gain or for the gate to judge again, and runs the replay gate (D22).
  - never comes from free text. An AI analysis's structured claims are tested held out first; the NFL's (2026-10-18: 80 claims, leave-one-out log loss worse) are left out.
- **Code:** `ngs.mjs`, `plays.mjs`, `savant.mjs`, `matchups.mjs` (`shotTable`, `zoneTable`, `contactTable`), `props.mjs` `CTX` and `STATS`, `INPUTS.md`. Tests: `tests/model-ngs.test.mjs`, `tests/model-shots.test.mjs`.

### D29. The priced history: every archived open and close graded in the gate, kept growing by a morning snapshot
- **Date:** 2026-10-18. The owner bought The Odds API's 5M-credit plan for one month to buy the history, then back to the 20K plan.
- **The archive (the docs and probes, 2026-10-18):** game lines (h2h, spreads, totals) from 2020-06-06, snapshots 10 minutes apart, 5 from September 2022; player props from 2023-05-03 (an earlier date is refused). A historical call costs 10 x the markets it returns x the regions; DraftKings and Pinnacle named are one region; an empty answer is free.
- **What was bought** (`odds-history.mjs pull`, local, once): NFL, NBA, NHL, MLB and MMA. Each game's lines at the open (the first daily 10 AM Eastern snapshot that saw it) and the close (a minute before the start). Each game's props, every market the desk prices (`props.mjs` `API_MARKETS`), at the close and at an earlier snapshot (`OPEN_LEAD`: 48 hours for the NFL, 12 for the rest). The API's re-issued event ids are merged by teams and start.
- **Stored:** `apps/<sport>/scripts/model/odds-history/<season>.jsonl.gz`, compact rows (an event matched to its ESPN game with its score; a line; a prop). The unmatched are logged in the pull's cache.
- **The gate (D22) grades it** as layer b's `history`: each version's replayed price (the ratings from the games before each game, the props' replayed projection, the trust fit walk-forward by month) at the open, against the result and the close's no-vig, recency-weighted by `seasonWeight`. It also reports each version against the book at the close (`vsBook`, on the scorecard). The weekly leak hunt (C23) reads the gate's hunt on the same rows (`history-leaks.json`, written with `--record`).
- **The morning snapshot** (the owner, 2026-10-18): `odds-history.mjs morning`, a step of the hourly desk workflow, failing soft. From 10 AM Eastern, once a day a sport: every coming game's lines and the props of the games inside 26 hours (each game's bought once, on its own morning), at DraftKings and Pinnacle. Kind `m` in the same rows, `odds-history/morning/<ET day>.jsonl.gz`, written once a day. Its own budget feature, `snapshot` (`oddsapi.mjs` `SNAPSHOT`: 300 credits a UTC day at most). It is the first cut when credits run low: it stops while 2,000 more than the reserve and history's share is left.
- **Code:** `odds-history.mjs`, `gate-history.mjs`, `gate.mjs` (`scoreVersion`, `compareScores`, `recordScore`), `gate-score.mjs` (row weights), `leaks.mjs` `historyLeakBets`, `selfcheck.mjs` `c23`, `oddsapi.mjs` (`SNAPSHOT`, `spendable`).
- **Limits:** the props are graded where the desk's cache has the players' games (the NFL from 2016; the NBA, NHL and MLB the last two seasons). Older seasons' lines are graded by the ratings alone, with no context. The fitted settings are the version's own (fit over their window), the small look-ahead layer a has too. MMA's history isn't matched to ESPN (the names and dates are kept).

### D30. Every bet is judged at the price offered the moment it's placed
- **Date:** 2026-10-18.
- **Owner:** "every bet is judged at the price offered at the moment it's placed."
- **Rule:** a bet is placed only at a price quoted in the current run: the live board, or a fresh Odds API call this run.
  - The odds history and the morning snapshot (D29) are for history, learning and the gate only. Nothing that prices or places a bet reads them.
  - A CHECK's stored price is an earlier run's, so it is never bet (`STORED_FRESH` 0, was 6 hours). Its CHECK is still evaluated, kept or closed. A row about to be bet at a stored price owes its game a fresh ask (once per stored price, `PROP_ASKS` at most), and bets on that ask's run at the price then. With no key, a stored price is no fresher.
- **Code:** `checks.mjs` (`STORED_FRESH`, `storedFresh`, `storedBet`), `run.mjs` `betProps` (`stale-owed`).
- **Never:** a bet's `odds` or `placedAt` price from a stored, snapshot or historical price.

### D31. No silent skip: a line move the projection followed is priced, and every skip says why on the board
- **Date:** 2026-10-18 (the owner's Rachaad White question: Under 47.5 Rush Yds, WSH @ SF, K +1.05%, `sk` with no `sw`).
- **What happened:** his line opened at 20.5 with Croskey-Merritt and McNichols healthy and moved to 47.5 with both out on the report. His projection already had them out (47.15). The 23:05Z run was before the depth chart's QB change (8867ecdd), so he was a qb-change role row, and the line-move skip (twice `limit`) stripped the role's kind (the "also" rule): a skip with no kind, no shadow, no reason on the page. On the current code (Kaliakmanis Out by the depth chart: qb1-out, whose safe side is the under) the line-move guard alone skipped it.
- **Rule:**
  - A line move the projection followed is the inputs' own reason, priced (D5). `moveFollowed`: the line now within `MOVE_FOLLOWED` (0.5) of the open's distance from the model's mean, both in SDs of the count (`lineZ`, D24). Such a row is flagged (the guard's half stake), never skipped by the move, and the move no longer strips a role, news or gap CHECK of its kind. A move the projection didn't follow still skips, as kind `moved`.
  - Every skip carries its reason to the board: `sr`, the guard's own words (`skipReason`, at most `SR_MAX` 200 characters; a guard with none says so). A prop's on the row, a gapped game market's on each side. The page shows it on the PASS tag's hover, the price's hover and the K score's popover.
- **Code:** `props.mjs` (`MOVE_FOLLOWED`, `moveFollowed`, `movedSkip` in `priceProps`), `board.mjs` (`skipReason`, `sr`), `lines.service.ts`, `game-lines.component.ts` (`passReason`, `passTag`, `PriceWhy.reason`), `book-page.component.ts` `priceWhy`.

## Loops

Each loop below runs by itself. For each one: what it changes, how often, what it reads, and what it must never touch.

| Loop | Changes | How often | Inputs | Never |
|---|---|---|---|---|
| Trust fit (`desk.mjs` `fitTrust`, `fitBuckets`; `run.mjs` `refitTrust`) | `state.trust` and line buckets: stake size, the CHECK bar's cleared chance, research pricing | every run | bets and tracked rows since `MODEL_EPOCH` (practice included), results and close `q`, the backtest | read pre-epoch rows; decide whether a prop plays (D18) |
| Live calibration (`calib.mjs`; `run.mjs` `refitCalib`) | `state.calib`: shifts on the model chance (guards, CHECKs, research pricing, the trusted fallback) | every run, at most `CAL_STEP` a UTC day | every graded prop's raw chance (`modelRaw`) across epochs, other sports pooled | fit on its own shifted chance; stack under the correction; jump to 0 |
| Learned correction (`correct.mjs`; `run.mjs` `refitCorrection`), off since the gate's verdict (D18, `CORR_PRICING`) | each prop's priced chance `p`, and the `topN` ranking, when on | every run | every graded prop (bets, tracked, practice), raw chance, no-vig, result, close `q` (CLV v2 carried to the bet's line) | read the calibrated chance; let the trust shrink on top |
| CHECK learning (`check-learn.mjs`) | role thresholds (soft weights, 0.25 a run), cause bet rules, `ROLE_BET` gates | every run | every graded CHECK, closed ones too for the gates | act under 40 decided; apply a loosening before its interval clears |
| CHECK patterns (`check-patterns.mjs`) | resolves open CHECKs by rule (cost 0) | every run, free, `--dry` too | researched CHECKs, `check-seeds.json` | count its own rule resolutions; go past `MAX_RATE`; skip the gates or caps (D11) |
| CHECK research (`research.mjs`) | verdicts, injury report inputs (`researchInputs`), research bets | hourly with `CHECK_RESEARCH=1`, under `CAP_WINDOWS` | open CHECKs, the injury report, rosters, web search | store a failed search (D7); raise a cap; run on `--dry` (saved findings replay only) |
| Research level and gate (`researchLevelOf`, `researchGateOf`) | stake level of research bets | every run | research bets since the epoch, every sport, CLV v2 `prob` | turn research off (D1, D19) |
| Miss review (`miss-review.mjs`) | the Self-check panel's recommendations and bug flags | daily from 12:00 UTC, batch | each sport's biggest misses since its last review | write a weight or `state.json` (D10) |
| Post-mortems and stat re-checks (`postmortem.mjs`; `run.mjs` 4b) | grades, a broken premise's `weight`, re-grades after stat corrections | every run (re-check a day and a half after the start) | finals' box scores, the league's own box (NHL) | grade a DNP as a loss |
| CLV capture (`clv.mjs`; `run.mjs` `captureClose`) | each bet's `clv` (v2: `prob`, `q`, `beat`) | every run | ESPN closes once final, the board's ladder | count a moved line it can't carry as 0 |
| Weekly self-check (`selfcheck.mjs`; `model-desk-weekly.yml`) | `selfcheck.json`, a report only | weekly | ledgers, CHECKs, `state.json` history in git, the gate's `history-leaks.json` | change the bettor |
| Morning snapshot (`odds-history.mjs morning`; the desk workflow) | `odds-history/morning/<day>.jsonl.gz` | once a day a sport, from 10 AM Eastern | The Odds API (the `snapshot` budget, 300 a day), games.json | price or place a bet (D30); spend past its cap or the hold |
| Refits (`project.mjs` via `fitcache.mjs`; `ratings.mjs`; `fights-model.mjs`) | projection terms, team ratings, context terms, the MMA model | props once a day (first run from 6 AM CT, or `--refit`); ratings and context every run; MMA soft terms every run | the history (NFL from 2016; NBA, NHL and MLB the last two seasons; MMA every pro bout) | keep a term without its held-out gain |

### Recency in the fits (audited 2026-10-18)

- **Team ratings:** decay geometrically. Each offseason multiplies a rating by `revert`: NFL, NBA and MLB at 0.5, NHL at 0.98. An NHL rating carries almost whole into the next season.
- **A player's base:**
  - This season's games against a prior, with weight `priorW = K / (games + K)`. K runs 2 to 32 by stat.
  - In the prior, last season counts 1 and every older season 0.5, lumped together.
  - The last 5 games' form weight runs from 0 to 0.4.
  - The defense tables count this season 1, last season 0.5, older seasons 0.
- **The fitted settings themselves** (each stat's K, form weight, scale, dispersion, calibration and context terms) are fit flat over their window. The NFL's window is roughly 2019 to 2023 and is held out on 2023 to 2026; the other sports' window is two seasons. The recency half-life `hl` (`HL` 3/2/1 seasons) is tried on every stat, but only NFL passing yards kept it (3 seasons).
- **Since 2026-10-18 (the owner: recent seasons count more, rule eras respected), every stat's fit (`project.mjs` `fitStat`) tries:**
  - A half-life by season, `HL` 8, 4, 3, 2 or 1, picked inside the fit window. Held out, the best is tried first. If it fails, the fit steps softer to the longer half-lives that also beat none inside, `HL_TRIES` (3) in all. The gate is the same as before (`DRAFT_GAIN`, no larger bias).
  - A rule-era weight (`ERAS`: NFL 2024-09-01, the kickoff; MLB 2023-03-30, the pitch clock and shift ban), at `ERA_W` 0.5 or 0.25 on the games before the break. It is judged where the fit and held-out windows have 200 or more games on each side: fit on the games before the newest half of those since the break, scored on that half, kept with `DRAFT_GAIN` a game or more (`floors.era`).
  - Either kept, the lean and r are fit again from the newest game over both windows by those weights (`floors.hl.live`). None kept, the settings are as fit.
- **Measured 2026-10-18 (the NFL's dry-run refit):** no stat kept a half-life. Passing yards' 3 failed its bias test, and the rest failed on gain. The era weight 0.25 was kept on passing yards (+0.0003 a game), attempts (+0.0003), completions (+0.0007), carries (+0.0096) and rush+rec yards (+0.0004). Their live lean went 0.978 to 0.974, 0.994 to 0.983, 0.996 to 0.982, 0.979 to 0.986 (carries' r 4 to 6) and 0.988 to 1.002. Passing TDs, interceptions, rushing yards, receiving yards and receptions stayed flat. MLB's two-season window is all after its break, and the NBA and NHL have none, so none of them has an era to weigh. No NHL, MLB or NBA stat took a half-life either.
- **The gate (D22, `--refit`, against origin/master):** NFL props layer a, deciding seasons, 3.6264 to 3.6251 (95% -0.0021 to -0.0006, better); older seasons tied. NHL, MLB and NBA layer a tied (NHL 1.4963 both, NBA 2.4747 both). SHIP.
- **No fit uses 25-year-old seasons.** The NFL's history starts in 2016 and the others' at the last season.
- **Gaps:**
  - Only the lean and r are refit live by recency. K, the form weight, the context terms and the calibration are still fit flat over the fit window.
  - The prior lumps older seasons at 0.5.
  - The MMA fit, the calibration and the correction weight all their rows flat. The last two only have rows since 2026-10-08.

## Open for the owner

None. Resolved 2026-10-18:

- **O1** (research "we like it" against the small-count trust): the owner chose a practice pick, then the corrected chance. See D25.
- **O2** (MMA had no practice top N): built. See D2.
