# The bettor's inputs

Every stat and data set the site has, set against what the bettor reads. Started 2026-10-18 for the owner's ask: "the bettor should ABSOLUTELY be knowing about any stats we have including NGS and any analysis I have etc etc etc... bot should be as smart as possible."

Read this before adding an input. Update it in the same commit as the change. DECISIONS.md has the rules, D8 (soft terms) and D22 (the gate) among them.

## The rules for an input

- **No look-ahead.** An input may use only data published before the bet is placed.
  - Most of the site's files are season-to-date totals with no dates. Reading one for a game in the season it covers would teach the model with games played after it. They can't be used as they are.
  - So the bettor reads the raw source per game or per week, and each table learns a game only after its day. `tests/model-ngs.test.mjs` and `tests/model-shots.test.mjs` pin this.
- **NGS's weekly rows** count from their week's last kickoff plus `NGS_PUB_HOURS` (36). So a week's row informs later weeks only, never its own. NGS's week-0 rows (the season totals) are never read.
- **Fit held out, gated.** Each term is a late term on `project.mjs`'s gate (`FEEDS`), measured with `fitStat` the way `fitProps` runs it (held out the last 30%).
  - A term with a gain stays on its stat's ctx. It enters at its size, or shrunk (soft) where the gate allows.
  - A term with no gain is left off the ctx. `CTX` keeps it, so it can be measured again on demand.
  - Then the replay gate (`gate.mjs`, D22) judges the whole change.
- **No free text in pricing.** Only structured claims are inputs, and only after a held-out test.

## Status key

| Status | Meaning |
|---|---|
| **in** | The bettor reads it. |
| **new** | Wired in this round (2026-10-18), with its held-out gain. |
| **left out** | Wired and measured, no gain. Off the ctx; `CTX` and its table keep it for a later re-measure. |
| **in another form** | Its information already reaches the model by another route. Adding it again would double count. |
| **not useful** | Not a pricing input, for the reason given. |

Gains are held-out log loss per line, without minus with. Above 0 is better. The floor is 0.0003 (`DRAFT_GAIN`).

## NFL

| Data | Site source and grain | Bettor | Reason or held-out gain |
|---|---|---|---|
| Weekly player stats (passing, rushing, receiving, TDs) | nflverse `stats_player_week`, per game | **in** | The props' history (`playerlogs.mjs`). |
| Targets and target share | nflverse weekly, per game | **in** | The volume base: his share of team targets times team targets expected (`project.mjs` volume, `targets: true`). |
| Receiving air yards and air yards share | nflverse weekly, per game | **in** | His depth, `dep` (`matchups.mjs` learnAir), used by `qbDeep`. A separate share term would double count `dep` times target share. |
| Snap counts | nflverse `snap_counts`, per game | **in** | Who played, snap share, role, a starter's start, the defenders out. |
| Play-by-play: xpass, EPA, red zone | nflverse pbp, per play | **in** | `proe` (measured, left out), `rzPass`, the funnel, the anytime TD. |
| Injuries and weekly rosters | nflverse, per week | **in** | `qb1Out`, `qbDeep`, the play chance. |
| Depth charts | site `StaticData/depth` (current) | **in** (live only) | The pre-game role guard (`depthRoleOf`). It is a snapshot, so the history can't use it. |
| Schedule, closing lines | nflverse games, per game | **in** | Script, `mSpread`, the market terms. |
| Players file (draft, birth date) | nflverse, static | **in** | Draft prior (`dp`), age prior (`sp`). |
| Last season's team EPA, line grade, weapons grade, pass rush | site `seasons/<y>/units/TM.json` | **in** (game model) | `teamstats.mjs` `RANKER_TERMS`. Only the season before the game is read. |
| NGS passing: CPOE | nflverse `nextgen_stats`, weekly | **left out** | On completions -0.0013, passing yards -0.0009, attempts +0.0001. Completion rate is already in his base. |
| NGS passing: time to throw | weekly | **left out** | Completions +0.0008, but the under side's bias grew (SIGNED). Attempts -0.0012. Yards not taken. |
| NGS passing: aggressiveness | weekly | **new** | On attempts, -0.015 a unit: +0.0005 (held out 0.6236 to 0.6231). Completions +0.0001, yards not taken. |
| NGS receiving: separation | weekly | **left out** | Receiving yards -0.0001, receptions -0.0001, rush+rec -0.0002. |
| NGS receiving: cushion | weekly | **left out** | 0 and +0.0001. |
| NGS receiving: YAC over expected | weekly | **new** (soft) | On receptions: +0.0006, the whole stat's bias larger, so soft at 0.25 (z 1.99). Receiving yards 0, rush+rec -0.0001. |
| NGS rushing: rush yards over expected | weekly | **new** (good side only) | `ryoeP` on carries, 0.06: +0.0017 (0.6312 to 0.6295). An efficient back's carries ran 11% over projection, 7% after. The two-sided form was +0.0018, but the poor backs' side overshot. Rushing yards -0.0003 (one-sided: not taken), rush+rec -0.0007 (one-sided -0.0006). |
| NGS rushing: 8+ defenders in the box (his) | weekly | **left out** | 0 and +0.0001. |
| NGS rushing: the defense's stacked-box rate (`oppBox`) | weekly, by the other side | **left out** | Not taken on rushing yards, rush+rec -0.0001. |
| PFR advanced: pressure, bad throws, drops, broken tackles | nflverse `pfr_advstats`; weekly only from 2024, season totals before | **not wired** | Candidate. The weekly rows start in 2024, so the fit window (2019 to 2023) can't see it. Revisit once 2024 on can carry a fit. Pass rush already reaches the game model as last season's pass rush. |
| Participation (blocking) | nflverse participation, per play (2016 on) | **in another form** | Who is on the line arrives through snap counts (`olOut`, measured, left out). |
| Field maps and heat maps (pass location by depth, run lanes) | site `field-maps.json`, `heat-maps.json`, season totals | **in another form** | Season totals with no dates. The per-game version is the pbp the bettor reads. His depth (`dep`) is the location signal that pays. |
| Skill rankings (`skill-players.json`), data grades, team grades | site, season totals | **in another form** | Built from the same weekly stats, NGS and PFR rows. Same-season totals would be look-ahead. |
| Subjective grades | hand-set | **not useful** | Hand-set, no history to fit. |
| Best games, careers, lockers, numbers, outcomes, highlights | site | **not useful** | Display. Careers go back to 2000, but the history reads the games themselves. |
| Weekly AI analyses (teams and QBs) | `apps/nfl/scripts/analysis`, `StaticData/analysis` | **left out** | See "The AI analyses" below. |

## NBA

| Data | Site source and grain | Bettor | Reason or held-out gain |
|---|---|---|---|
| Box scores: minutes, points, rebounds, assists, threes, FGA, FTA, starts, turnovers, fouls | ESPN summaries, per game | **in** | The props' history. |
| Closing lines | ESPN pickcenter, per game | **in** | The blowout by role. |
| Injuries, inactives, starters | ESPN, live | **in** | Role, the work missing, `freshInactives`. |
| Pace and possessions | from the box, per game | **in** | `paceOf`. |
| Last season's net rating, pace, ratings | site archive `TM.json` | **in** (game model) | `RANKER_TERMS`. |
| Shot zones: his zone mix against the defense's allowed make rates (`zoneEdge`) | ESPN play-by-play, per game (`plays.mjs`) | **new, on the ctx** | Points +0.0004, but the bias grew, so the gate leaves it out for now. It stays on the ctx for the gate to judge again as the season's games come in. Rebounds -0.0005, assists -0.0006, threes 0, pts+reb+ast +0.0002. |
| Shot zones: threes allowed (`opp3`) | the same | **new, on the ctx** (points) | Points +0.0003 (bias larger), assists +0.0003 (one side's bias larger), rebounds -0.0004, threes not taken. |
| Shot zones: three-point make rate allowed (`zone3`) | the same | **left out** | -0.0007 to +0.0002 on every stat. |
| Season stats: TS%, usage, PER, WS/48, BPM, VORP, on/off (`skill-players.json`) | Basketball-Reference, season totals | **in another form** | Usage reaches the model per game (`usage`, from FGA, FTA and turnovers). Same-season totals would be look-ahead. |
| Heat maps (12 zones, season and last 10) | ESPN pbp, season totals | **in another form** | The per-game zones above. |
| Committed box-score store (`apps/nba/scripts/box-scores`) | ESPN, per game | **in another form** | The same games as the props' history. |
| Best games, careers, coaches, numbers, outcomes, highlights | site | **not useful** | Display. |
| AI analysis | none | not applicable | The NBA has none. |

## NHL

| Data | Site source and grain | Bettor | Reason or held-out gain |
|---|---|---|---|
| Box scores: TOI, PP TOI, shots on goal, goals, assists, saves | ESPN summaries, per game | **in** | The props' history. |
| Game totals | ESPN pickcenter | **in** | `mTotal`. |
| Team expected goals by game | MoneyPuck team game-by-game | **in** (game model) | The context. |
| Lines and goalies | DailyFaceoff, NHL API | **in** | Starters, `oppGoalie`. |
| Last season's xG, GSAx, PDO | site archive | **in** (game model) | `RANKER_TERMS`. |
| Rink zones: on-goal share regressed (`shOn`) | ESPN play-by-play, per game (`plays.mjs nhlShots`) | **left out** | Shots +0.0002 (bias larger), points 0. |
| Rink zones: slot share (`shSlot`) | the same | **left out** | Shots -0.0003, points 0. |
| Rink zones: shot distance (`shDist`) | the same | **left out** | Shots not taken, points 0. |
| Rink zones: the defense's blocked share (`oppBlk`) | the same | **left out** | Not taken on shots or points. |
| Skater season stats: ixG, goals above expected, xGF%, CF%, Game Score (`skill-players.json`) | MoneyPuck and NHL API, season totals | **in another form** | Same-season totals would be look-ahead. The per-game shots above carry the shooting signal, and gained nothing. |
| Heat maps (16 rink zones) | MoneyPuck shots, season totals | **in another form** | The per-game zones above. |
| Game logs (`game-logs/<season>`) | NHL API, per game | **in another form** | The same games as ESPN's box. |
| AI analysis (team previews) | `StaticData/analysis` | **not useful** | Free text with no betting claims since 2026-10-14. |

## MLB

| Data | Site source and grain | Bettor | Reason or held-out gain |
|---|---|---|---|
| Starters' and batters' game logs: K, outs, pitches, PA, hits, TB, HR, K, BB | StatsAPI, per game | **in** | The props' history. |
| Lineups, probables, umpires, weather, parks | StatsAPI and Open-Meteo, per game | **in** | `lineupK`, `hitEnv`, `leash`, `ump`, and the rest. |
| Last season's OPS, ERA, fielding, park factor | site archive | **in** (game model) | `RANKER_TERMS`. |
| Statcast contact: expected hits on contact over hits (`xHit`) | Baseball Savant, per ball in play (`savant.mjs`) | **held by the gate** | Held out it gained: hits 0.06 +0.0009 (0.5401 to 0.5392), total bases 0.06 +0.0005, each side's bias cut by two thirds or more, and the gate's projections were better beyond noise (-0.0008). But against the book, on the 154 saved MLB props, it was worse beyond noise (close log loss +0.0025, top picks' CLV -0.0129). So it is off the ctx and Statcast isn't downloaded (`savant.mjs` `CONTACT_ON` false). Re-check when spring adds priced rows. |
| Statcast: expected slugging over total bases (`xTb`) | the same | **left out** | 0 on hits, +0.0002 on total bases (bias larger). |
| Statcast: hard-hit rate (`hardHit`) | the same | **left out** | Not taken. |
| Statcast spray: pulled in the air (`pullAir`) | the same | **left out** | +0.0002 on each, one side's bias larger. |
| Pitch-zone heat maps, defense, OAA, sprint speed, xwOBA, barrels (`skill-players.json`, `heat-maps.json`) | Savant, season totals | **in another form** | The per-ball contact above. Same-season totals would be look-ahead. Candidates for later: a pitcher's contact allowed for strikeouts and outs. |
| AI analysis (season-end recaps) | `StaticData/analysis` | **not useful** | Recaps, no claims about coming games. |

## MMA

| Data | Site source and grain | Bettor | Reason |
|---|---|---|---|
| Every pro bout (method, round, time, date) | ESPN, per bout (`apps/mma/scripts/fights`) | **in** | `fights-model.mjs`. |
| Per-bout strikes (`apps/mma/scripts/strikes`) | ESPN, per bout | **in** | The striking and grappling parts of `fights-model.mjs` and the totals. |
| Bios: age, reach, stance | ESPN | **in** | The age and reach parts. |
| Rankings and status | UFC.com, PFL | **in another form** | Rankings follow the record the rating already reads. |
| Career rates and heat maps (`skill-players.json`, `heat-maps.<div>.json`) | derived from the bouts, career totals | **in another form** | Built from the same bouts, which the model reads as of each bout's date. |
| Champions (Wikipedia) | static | **not useful** | Display. |

## The AI analyses

- **What exists.** The NFL's weekly reports (teams and QBs, Claude, `apps/nfl/scripts/analysis`) carried structured betting angles until 2026-10-14. That day the owner dropped the angles and retired the analysis bet desk (ef5869e0).
  - `data/analysis/bets.json` and the desk's `ledger.json` were deleted then. They are in git: the week-5 run at f24dfe94 (2026-10-06) and the week-6 run at ef5869e0^ (2026-10-13).
  - The other sports' analyses never had betting claims. NHL has free-text previews, MLB has recaps, NBA has none.
- **What was tested.** Every structured player claim with a direction and a number (a market, Over or Under, a strength): 80 claims on graded games across weeks 5 and 6. Each was set against the bettor's own replayed projection at the claim's number.
  - The AI's side hit 60%. The model gave that side 53.1% on average.
  - Adding the AI's direction to the model's chance as a logit shift, fit leave-one-out, made the log loss worse: 0.6343 to 0.6362.
  - By strength, like was 24 of 39 and lean 22 of 39.
- **Decision: left out.** The claims add nothing held out over the model at this sample size. The source has also stopped: no claims are written since 2026-10-14.
- **Not done.** Team-level claims (spreads, totals) and categorical claims (a "trend" direction, a confidence level) weren't tested. Neither is fed into pricing.
- **To revisit.** If the owner turns the angles back on, they come in through the same test: a structured claim, a held-out gain over the model, and the gate.

## The odds history (2026-10-19, DECISIONS.md D29 and D30)

The Odds API's archive, bought once on the 5M-credit month: every NFL, NBA, NHL, MLB and MMA game's lines since 2020-06-06 and props since 2023-05-03, DraftKings and Pinnacle, the open and the close. `apps/<sport>/scripts/model/odds-history/<season>.jsonl.gz` (`odds-history.mjs`), kept growing by the morning snapshot (`morning/<day>.jsonl.gz`).

| Data | Status | Where it goes |
|---|---|---|
| Archived opens and closes, lines and props | **not useful** as a pricing input | Never a price the bettor bets at (D30: only a price quoted in the current run). It is the gate's priced history (layer b `history`, `gate-history.mjs`) and the leak hunt's (C23). |
| The morning snapshot | **not useful** as a pricing input | The same: history, learning and the gate only. |
| The line's move to date (the open's no-vig against the price at the bet's moment) | **in the residual model** (D31, a candidate behind `RESID_ON`) | Read only up to the bet's own moment: a row priced at the close reads the open-to-close move, one priced at the open reads none (`residual.mjs` features `mv`). Never the close for a bet placed before it. |
| The priced history as training rows for the residual model (every open and close, the Bot's replayed chance, the result) | **in the residual model** (D31) | `residual-train.mjs` replays it as the gate does; monthly snapshots fit only on rows settled before each month (`residual.mjs` fitWalk, snapshotFor), so a row is never priced by a fit that saw it. Still never a price the bettor bets at (D30). |
| The live line's implied mean as the projection's anchor (D33, 2026-10-19) | **in** (the current run's price, never the history's) | `anchor.mjs`: the bot's mean pulled toward the mean the board's line and price imply, by a per-stat weight fit walk-forward on the priced history (the history fits the weight, the live board gives the mean). 0 where the bot's own number beats the book's out of sample. Measured on the history: the bot's disagreement with the close is 75% to 90% noise (the slope of the result on it .10 to .25 by sport); anchored, NFL props go from a tie with the book to -0.0012 better at the close, NBA -0.0003, NHL and MLB ties. The pull by stat is in `apps/<sport>/src/StaticData/model/anchor.json` and on the scorecard. |

## The schedule's situations (2026-10-19, the misses round; DECISIONS.md D34)

Every game with a close in the odds history, joined to the schedule, the lines and the facts cache (`scratchpad/misses/situations.mjs`, `analyze.mjs`, `FINDINGS.md`), each feature tagged with when it is known. The close's residual by situation, shrunk, with q-values and sign stability by season. What came of it for the game model:

| Situation (known from) | Sports | Bettor | What the close showed |
|---|---|---|---|
| Time zones from home and crossed since the last game, the start by the side's own clock (schedule) | all | **new, soft** (`tzHome`, `tzMove`, `clockLate`, `clockEarly`) | NHL home side in 21:00 ET starts -2.9 pts (7/8 seasons); NFL side 2-3 zones west of home +7.8 (n 214, 6/6); NBA 2-3 zones east +1.8. |
| The last result: off a blowout win or loss (schedule) | all | **new, soft** (`letdown`, `bounce`, `letdownT`) | NHL off a blowout win -1.9 ML (7/8); NBA totals -1.2 pts with a side off one (5/7). |
| Games in the last 7 nights (schedule) | NBA, NHL | **new, soft** (`density7`) | NHL rested (2 or fewer in 7) +3.1 ML (7/8); the back-to-back -2.8 (8/8), -4.4 against a rested side. The b2b, dense3 and rest terms were already in (gated). |
| The long road trip, the home stand's opener (schedule) | all | **new, soft** (`tripLong`, `firstHome`) | NHL road games 4-5 -2.7; NBA home game 1 -1.7. |
| Altitude on the total (schedule) | NBA, NHL | **new, soft** (`altitudeT`) | NBA +2.2 pts over (6/7). |
| The totals' skew by line level (close) | NHL, MLB | **held** | High totals run 0.2 goals under the market's own mean, low ones over: a shape for `margins.mjs` (totals are "the base alone"), not a situation. |
| The favorite-longshot bias (close) | NHL | **held** | Favorites of .75+ +5 pts, every season: a pricing read; the game trust's. |
| DraftKings against Pinnacle at the close (close) | MLB | **not useful** | Look-ahead at bet time (D30). |
| Referees, umpires (dayof) | all | **not useful** | One or two seasons each, n under 100: noise until proven. |
| Division, conference, day of week, start hour, month, postseason, roof, surface, temperature, wind, week, the starter's rest and last pitch count, the quarterback change, the starting goalie's back-to-back, line moves, favorite and total size | all | measured, **left out** | Nothing at q under 0.2 that held across seasons. |

## The replay gate (2026-10-18, gate.mjs --refit against origin/master)

- **NFL: SHIP.** Projections better beyond noise: props -0.0002 (95% -0.0004 to -0.0001) in the deciding seasons, and the same in the older ones.
  - Against the book it tied: props log loss 0.5245 to 0.5246, the close the same, the gap to the book +0.0093 either way.
  - The top picks' CLV (-0.0042) and hit rate (54.7% to 52.8%) were down, inside the noise.
  - None of the new inputs narrowed the NFL's +0.0093 gap or its leaks (early bets, overs, receptions). The receptions term (`yacoe`, soft) was the one aimed at a leak, and it tied there.
- **NBA: tie.** No priced props yet; the zone terms are on the ctx but not taken.
- **NHL: tie.** No rink-zone term is on a ctx; the gap stays +0.0004.
- **MLB: HOLD.** Its projections were better (props -0.0008, 95% -0.0013 to -0.0003), but its priced rows were worse: the close log loss +0.0025 and the top picks' CLV -0.0129, both beyond noise. So `xHit` is off (above).

## Counts (2026-10-18)

| Sport | Data sets listed | In | New this round | Left out | In another form | Not useful or not wired |
|---|---|---|---|---|---|---|
| NFL | 26 | 10 | 3 | 7 | 3 | 3 |
| NBA | 13 | 5 | 2 | 1 | 3 | 2 (one is no AI analysis) |
| NHL | 13 | 5 | 0 | 4 | 3 | 1 |
| MLB | 9 | 3 | 0 | 4 (one held by the gate) | 1 | 1 |
| MMA | 6 | 3 | 0 | 0 | 2 | 1 |

"New" counts terms that are kept or still on the ctx for the gate. The NBA's two are on the ctx and not yet taken.
