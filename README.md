# Season Ranker (NFL, MLB, NBA, NHL, MMA)

Rank players your way: every stat is normalized to the same scale, then your sliders decide what
matters. Live at https://www.seasonranker.com/ (`/nfl/`, `/mlb/`, `/nba/`, `/nhl/`, `/mma/`; the bare
address redirects to the NFL, and the apex and Firebase addresses redirect to www). The product is
**Season Ranker** everywhere a user reads it; "qbranker" survives only as the repo folder, the npm
package name and some internal task names.

## What's on the site

- **Five sports**, one app each on a shared engine: a ranked table per position tab, a filter menu of
  sliders and presets, settings, Compare, a player card and an About panel (each sport's
  `apps/<sport>/src/sport/about/`, the one place its features are explained to users). MMA is public.
- **The NFL's bar** is Teams, then three families (Offense, Defense, Special Teams) and Head Coaches. A
  family's tab opens its positions as an accordion: Team O · QB · RB · WR · TE · OL; Team D · Edge · DL ·
  LB · CB · S; Team ST · K · P (`tabFamilies` and `tabGroups` in `apps/nfl/src/sport/sport.ts`). The
  page lands on Teams, as every sport does.
- **The player card**: the Overview opens on the season's **splash** (this season a locker with the
  team's key players' jerseys in their stalls, or a player's own stall with jersey and gear; a past
  season a shelf of up to three honors as props; a coach's office), drawn as SVG from each team's real
  uniforms of that season (`libs/ranker/src/engine/player-card/splash/`,
  `apps/<sport>/src/sport/uniform-eras.ts`). Then the skills radar, archetype and takes, Stats, Game
  Log, Career/History, a weekly AI **Analysis** (NFL teams and QBs; a finished season gets one Recap),
  the **Team** tab's depth chart with a **rank gem** on every player (his rank at his own tab), and
  **Heat Maps** (`libs/ranker/src/engine/heat-map/`: NFL pass zones, field position, down and distance
  and the field map; NBA shot charts; NHL shots, saves and chances by zone; MLB hot zones and fielding;
  MMA striking).
- **The Book** (`/book`, `libs/ranker/src/engine/book/`): a sportsbook for fun. Best Bets or one game's
  board, every price with its Kelly score and confidence band, the model-vs-book meter, the why popover,
  a ticket (the bet slip; a stub on phones), a sport dropdown and bet-kind chips. **Play money only**:
  a signed-in account gets a 500-unit wallet (`account/wallet/wallet-math.ts` `START`), no real money
  ever. The wallet's redesign is a pull request, not live.
- **The Algorithm** (admin-only desk on The Book): the bettor, `libs/ranker/scripts/model/run.mjs`,
  hourly on GitHub Actions (never run locally without `--dry`), over five leagues: NFL, NBA, NHL and MLB
  lines and props, and MMA moneylines. Soft terms that earn their weight, CLV-gated trust, a model
  epoch (`MODEL_EPOCH` in `leagues.mjs`, bumped on every major change) and weekly self-checks.
- **Accounts** (`libs/ranker/src/engine/account/`): sign in with Google or email and password
  (Facebook is wired but off, `features.ts` `FACEBOOK_LOGIN`); a profile, saved lists and presets,
  Track Players, friends, the community page and the wallet. Firebase Auth and Firestore behind
  **App Check** (reCAPTCHA Enterprise, `libs/ranker/src/core/firebase.ts`).

### Data sources and credits

ESPN (results, rosters, injuries, game logs, lines), nflverse (play-by-play, Next Gen Stats and Pro
Football Reference's charting, CC BY 4.0; FTN's participation, CC BY-SA 4.0), Wikipedia (All-Pro and Pro
Bowl lists), Basketball-Reference, the NHL's stats API and MoneyPuck (credited in the NHL About for its
heat maps), Baseball Savant's Statcast, UFC.com, and for The Book The Odds API: odds from a major U.S.
sportsbook (the one the board shows) with a sharp book as the fair-price anchor. Each sport's About has its Credits section;
the site is an unofficial fan project, not affiliated with any league or team.

## Layout

One Angular workspace, one app per sport, and a shared library that holds everything the sports have
in common. How the pieces fit, and how to add a sport: [libs/ranker/README.md](libs/ranker/README.md).

```
libs/ranker/            the shared library (one copy of everything the sports share)
  src/core/             small shared utilities: copy, value tints, column directives, analytics,
                        the sport bar's list, Firebase (auth, Firestore, App Check)
  src/engine/           the ranker app itself (table, player card and its splash, filter menu,
                        settings, scoring, data loading, heat maps, accounts, The Book), for every
                        sport (see the library README)
  src/styles/           the look: base styles, variables, Material theme, each component's styles
  src/assets/           shared textures (leather grain, chalk dust)
  scripts/              shared data-script pieces: the similar-seasons builder, the grade curve,
                        splash/ (the splash builders), accounts/ (admin scripts), analysis/ (the AI
                        write-ups), model/ (the Algorithm bettor)
apps/
  nfl/ mlb/ nba/ nhl/ mma/  one per sport, each on the engine:
    src/sport/          what makes the sport: SPORT (sport.ts), positions and stats, presets, skills
                        and archetypes, awards, team colors, logo eras, uniform eras, heat maps,
                        the About panel
    src/theme/          its look on top of the shared styles (textures, knobs, accent, lines)
    src/StaticData/     the season data it serves (generated by its scripts)
    scripts/            its data pull (update-data.mjs), similar seasons (build-comps.mjs), the
                        splash's data (build-splash.mjs)
docs/                   accessibility.md (WCAG decisions), bets-redesign/ (The Book's design brief)
sports.json             the sports, in sport-bar order
angular.json            one project per app
firebase.json           hosting: dist/site, each sport under its own path; / redirects to /nfl/
dev.mjs                 `npm run dev`: every app at localhost:4200 (watch builds, one server)
scripts/new-sport.mjs   `npm run new-sport`: scaffolds a sport
.github/workflows/      <sport>-update-data.yml (nightly data), model-desk.yml and
                        model-desk-weekly.yml (the bettor and its self-check), firebase-deploy.yml
                        (deploy on push), ci.yml (tests and builds)
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Every app at once, all at http://localhost:4200 (`/nfl/`, `/mlb/`, `/nba/`, `/nhl/`, `/mma/`; the bare address redirects to `/nfl/`) so the sport bar works like the live site and any of them can be open at once. One port: each app builds in watch mode and one small server serves them all, reloading a page when its app rebuilds (`PORT=4300 npm run dev` if 4200 is taken) |
| `npm start` / `npm run start:mlb` / `npm run start:nba` / `npm run start:nhl` / `npm run start:mma` | Just one app's dev server (the sport bar's other links won't work) |
| `npm run build` | Production build of every app into `dist/site` (`nfl/`, `mlb/`, `nba/`, `nhl/`, `mma/`) |
| `node --test tests/*.test.mjs` | The unit tests (the engine's pure modules, the bettor's maths, the wallet and slip) |
| `npm run new-sport -- <id> <LABEL>` | Scaffold a sport (`npm run new-sport -- nhl NHL`): see the library README |
| `npm run update-data` | NFL: pull the current season (`SEASON=2025` for a past one) |
| `npm run update-honors` | NFL: All-Pro and Pro Bowl lists from Wikipedia |
| `npm run build-comps` | NFL: the player card's similar seasons and season history |
| `npm run build-blocking` | NFL: the player card's run-blocking reads (after a season's participation data is out) |
| `npm run mlb:update-data` | MLB: pull this season (`SEASON=2019` for a past one, `ALL=1` for 2000 on) |
| `npm run mlb:build-comps` | MLB: the player card's similar seasons and season history |
| `npm run nba:update-data` | NBA: pull this season (`SEASON=2019` for a past one, named for the year it ends in; `ALL=1` for 2000-01 on; about 15 minutes, Basketball-Reference allows 20 requests a minute) |
| `npm run nba:build-comps` | NBA: the player card's similar seasons and season history |
| `npm run nhl:update-data` | NHL: pull this season from the NHL's stats API and MoneyPuck (`SEASON=2019` for a past one, named for the year it ends in; `ALL=1` for 2008-09 on, a few minutes) |
| `npm run nhl:build-comps` | NHL: the player card's similar seasons and season history |
| `node apps/<sport>/scripts/build-splash.mjs [season|all]` | NFL, MLB, NBA, NHL: the Overview splash's data for a season (the current one by default): how each team's season ended (`outcomes.json`), each player's number (`numbers.json`) and best game (`best-games.<TAB>.json`), MLB's milestones (`milestones.json`); the uniform and helmet tables are apps/<sport>/src/sport/uniform-eras.ts and apps/nfl/src/sport/helmets.ts |
| `npm run mma:update-data` | MMA: every fight since 1997 in ten promotions from ESPN (archived by year in `apps/mma/scripts/fights/`; later runs fetch only the current year), the rating and career points (`rating.mjs`), each listed fighter's bio and stats (cached in `apps/mma/scripts/cache.json`), and the champions and rankings from UFC.com. `node apps/mma/scripts/backtest.mjs [--tune]` checks and tunes the rating on past fights |
| `node libs/ranker/scripts/model/run.mjs --dry` | The Algorithm bettor, a dry run (it prices and picks, writes nothing). The real run is GitHub's hourly `model-desk.yml` only |

## Kicking the desk

GitHub's free `schedule` trigger fires the bettor's workflow (`model-desk.yml`) late or not at all: in
the week to 2026-10-19 it ran about 5.7 times a day, a median 4 hours apart, once 10 hours apart. So the
workflow asks twice an hour (:07 and :37), its `model-desk` concurrency group keeps that to one run at a
time, and the owner's PC backs it up: the Windows task **SeasonRanker desk kick** runs
`scripts/desk-kick.ps1` hourly at :12 while he's logged on and dispatches the desk through his own `gh`
sign-in when no run started in the last 50 minutes (`-DryRun` says what it would do; `-Register`
recreates the task; log `.cache/desk-kick.log`).

**Optional, not set up: an always-on kicker.** The PC is off some nights. A Cloudflare Worker with a cron
trigger (say `12 * * * *`, free plan) can do the same from the cloud: list the last runs
(`GET /repos/{owner}/{repo}/actions/workflows/model-desk.yml/runs?per_page=5`) and, when none started in
the last 50 minutes, dispatch one (`POST .../actions/workflows/model-desk.yml/dispatches` with
`{"ref":"master"}`; no inputs needed). It needs a **fine-grained GitHub token** scoped to this repository
only, with **Actions: read and write** and nothing else (Metadata: read comes with it), stored as a Worker
secret (`wrangler secret put GH_TOKEN`), never in the Worker's code or this repo. Security note: that
token then lives in Cloudflare; anyone with the Cloudflare account can start (or cancel) this repo's
workflows with it, though not read its secrets or push code. Give it an expiry and revoke it on GitHub if
the Cloudflare account is ever in doubt. The owner decides whether it's worth it.
