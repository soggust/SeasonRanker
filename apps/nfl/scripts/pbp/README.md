# NFL play-by-play aggregates

Small per-player-season and per-team-season stats from nflverse's play-by-play, built for the bettor's research
(DECISIONS.md D78) and usable by the stats site. Nothing on the site reads them yet: that is the owner's call.

- **Source:** nflverse `play_by_play_<season>.csv.gz`, the desk's cache (`.cache/model`, gitignored; `playerlogs.mjs`
  and `context.mjs` fetch them). The raw files are never committed.
- **Build:** `node apps/nfl/scripts/pbp/build.mjs [--seasons 2016,...,2026]` (free, no network, about 3 s a season).
- **Output:** `data/<season>.json` (committed, about 300 KB each), and `.cache/pbp/nfl/games-<season>.json` (the same
  tallies per player game, for research; not committed).
- **Coverage:** 2016-2026 (2026 is the season in progress, to the cache's last game). Regular season and playoffs.
- **Plays counted:** runs and passes (`play_type` run or pass), sacks and scrambles included as dropbacks; kneels,
  spikes, two-point tries, kicks and no-plays left out.

## File shape

```
{ v: 1, sport: "nfl", season, source, players: [Player], teams: [Team] }
```

### Player

| Field | Meaning |
|---|---|
| `id` | nflverse's gsis id (`00-0036900`) |
| `name` | nflverse's short name (`J.Chase`) |
| `team` | the team he had the most plays for |
| `games` | games with a target, carry or dropback |
| `receiving` | null without a target; else the block below |
| `rushing` | null without a carry; else the block below |
| `passing` | null under 20 dropbacks; else the block below |

**receiving:** `targets`; `targetShare` (his targets over his team's in his games); `airYards` (summed air yards of
his targets, catches or not); `airYardsShare` (over his team's in his games); `adot` (air yards a target);
`deepTargetRate` (targets 20+ air yards over targets with air yards); `middleTargetRate` (targets thrown to the
middle over targets with a location: nflverse's `pass_location`; a slot proxy, see below); `redZoneTargets` (the ball
at the opponent's 20 or closer); `redZoneTargetShare`; `endZoneTargets` (air yards reaching the goal line);
`receptions`; `receivingYards`; `catchRate`; `yacPerRec`; `yacOverExpected` (yards after catch less nflverse's
`xyac_mean_yardage`, a catch); `epaPerTarget`; `successRate` (nflverse's `success` on his targets); `wopr`
(1.5 x target share + 0.7 x air-yards share).

**rushing:** `carries`; `carryShare`; `rushingYards`; `redZoneCarries`; `redZoneCarryShare`; `inside5Carries`;
`epaPerRush`; `successRate`; `gapShare` (`end`, `tackle`, `guard`, `middle`: nflverse's `run_gap`, a middle run by
`run_location`).

**passing:** `dropbacks` (passes, sacks, scrambles); `attempts` (passes thrown); `adot`; `deepAttemptRate`; `cpoe`
(nflverse's completion over expected, a mean); `epaPerDropback`; `successRate`; `sackRate`; `redZoneAttempts`.

### Team

`team` (nflverse's abbreviation) and two sides, `offense` (its own plays) and `defense` (its opponents' plays
against it), each: `games`, `plays`, `passRate`, `passRateOverExpected` (passes less nflverse's `xpass`, a play
with `xpass`), `epaPerPlay`, `epaPerPass`, `epaPerRush`, `successRate`, `redZonePlays`, `redZoneTdRate`, `adot`,
`deepTargetRate`, `middleTargetRate`.

## Not in the free data

- **Slot vs wide alignment:** nflverse's play-by-play and participation data have no receiver alignment (that is
  PFF's or Next Gen's charting). `middleTargetRate` is the nearest free proxy and is not the same thing.
