# NBA play-by-play aggregates

Small per-player-season and per-team-season stats from ESPN's free play-by-play, built for the bettor's research
(DECISIONS.md D78) and usable by the stats site. Nothing on the site reads them yet: that is the owner's call.

- **Source:** ESPN's public summary (`site.api.espn.com/.../basketball/nba/summary?event=<id>`), one call a final.
- **Fetch:** `node apps/nba/scripts/pbp/fetch.mjs [--seasons 2021,...,2026]`: slim copies of each final's plays in
  `.cache/pbp/nba/<espn id>.json.gz` (gitignored, about 90 MB for six seasons; never committed). A final already kept
  is not asked again.
- **Build:** `node apps/nba/scripts/pbp/build.mjs [--seasons ...]` (no network, about 6 s a season).
- **Output:** `data/<season>.json` (committed, about 230 KB each), and `.cache/pbp/nba/games-<season>.json` (per
  player game, for research; not committed).
- **Coverage:** seasons 2021-2026 (a season is named by its end year: 2026 is 2025-26), regular season and playoffs,
  every final in the odds archive's events. 2027 (the season now starting) has no finals yet.

## File shape

```
{ v: 1, sport: "nba", season, source, players: [Player], teams: [Team] }
```

### Player

| Field | Meaning |
|---|---|
| `id`, `name` | ESPN's athlete id and name |
| `team` | ESPN's team id he played the most games for |
| `games` | games with a play of his or minutes on the court |
| `minutesOnCourt` | minutes on the court, from the lineups read (below) |
| `shots` | `fga` (field goals tried); `rimShare`, `midShare`, `threeShare` (each zone's share of them); `rimPct`, `midPct`, `threePct` (made, by zone); `ftRate` (free throws tried over field goals tried) |
| `assistedPct` | his made field goals that were assisted (ESPN's "(X assists)") |
| `ftm`, `fta` | free throws made and tried |
| `clutch` | the last 5 minutes of the 4th quarter or overtime, the score within 5 before the play: `points`, `fga`, `fgm`, `fgPct` |
| `onOff` | null under 100 minutes on or off; else `onNetPer48` (his team's points less its opponent's, a 48 minutes he's on the court), `offNetPer48` (the same with him off it), `diffPer48` (on less off), `onMinutes`, `offMinutes` |

**Zones** (as the bettor's `plays.mjs`): the rim, 5 feet or closer to the basket (ESPN's court: the basket at x 25,
y 0); a three by the play's words or 24 feet or farther; every other two is mid (the paint off the rim included). A
shot without a spot: a layup, dunk or tip is the rim's, else mid.

**Lineups:** ESPN's play-by-play lists substitutions but not who starts a period. Each period's five are read from the
players seen in it before they were subbed in (the first period's from the box score's starters where fewer than
five are seen). A player who plays a whole period without a play of his is missed, so on/off is approximate.

### Team

`team` (ESPN's team id), `games`, `offense` (its own shots: the `shots` fields above plus `assistedPct`), `defense`
(its opponents' shots against it, the same fields: what it concedes by zone), `lineupsRead` (the share of its game
time with a five read).
