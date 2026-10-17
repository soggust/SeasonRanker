# Wallet redesign

The owner signed off on a new look for the **Wallet** (`#wallet`). This is the brief for building it.
`Wallet.dc.html` beside this file is the approved design (desktop, 1440 wide) as standalone HTML, with every
colour, size and layout value exact. Its markup is a design tool's format (`{{holes}}`, `<sc-if>`, `<sc-for>`);
read it for values and structure, not as code to paste. All its numbers, names, runs and trophies are made up.

**Where it lives:** the wallet is an **app page**, not part of the Bets page ("The Book"). It sits in the
app's sheet (`app.component`'s `.app-sheet`, the wide 1240px one, inside `.app-sheet-body`), reached from the
username menu and from the Bets page's bankroll card. It uses the app's frame and tokens
(`_account-kit.scss`): pewter backdrop, the warm dotted sheet, the **sand** light (`--app-sand`,
`--app-sand-glow`) and the sand buttons (`kit.primary-button`). It does **not** use The Book's felt, gold
header or tabs. The design draws the sport bar and the sheet only to show the context; those already exist,
so don't rebuild them.

## The one rule: change the look, not the logic

Do not change:

- `wallet.service.ts`: loading, `settledBets` paging (`loadSettled`), `tally`, `balance`, `reload()`,
  `clearHistory()`, `leaderboard()`, placing and the slip
- `wallet-math.ts`'s maths (`recordOf`, `playTally`, `versusBot`, `versusDays`, `toWin`, `parlayOdds`…), the bot
  ledgers fetch (`botLedger`), the privacy rule (public players only on the leaderboards), the admin-only
  clear-history control
- the wallet page's **Open Bets / Closed Bets modes**, which the Bets page uses for its Open and Cashed tabs
  (the Bets brief on the `bets-the-book` branch restyles those; leave them working)
- anything in `scripts/`, `StaticData/`, `tests/`, the Firestore rules

**New numbers are allowed only as client-side derivations from data the wallet already has** (the `tally`
document, `settledBets`, `openBets`, the wallet doc's `resets`, each bet's `run`, `botPick`, `tier` and
`kelly`, and the bot ledgers it already fetches). No new Firestore reads, collections, fields or writes. If a
piece needs more than that, or only part of the history is loaded (settled bets come in pages), either
compute it from the `tally` or **hide it** and list it for the owner. Never show a number computed from a
partial page as if it were all-time.

Work in the phases below, one commit each. After every phase run `npm test` and `ng build nfl` (and one other
sport). Stop and report if either fails.

## The page, top to bottom (inside the sheet)

Panels throughout: scoreboard face, 1px `$panel-edge`, radius 10px, the small drop shadow, and a **header bar
in the wallet's felt green** (`chip.$felt-light` at 16% over the dots, a 1px felt-light line under it). The
title sits in the bar in Outfit 700, 15px, 3px letter-spacing, in sand with the sand glow. Gaps are 18–20px.
Use the `$fs-*`, `$space-*` and `$text-*` tokens.

### 1. Header

The account pages' hero: an avatar disc ringed in sand, "Wallet" (`v.headline(22px)`), and "username · play
money" in sand, plus on the right a sand primary button, **Place bets**, which goes to the Bets page (the
existing `toBets`).

### 2. Your chips (left half of a two-column row; stacks under 1120px)

- **Bar**: "YOUR CHIPS", with "Run #N" on the right (`wallet().resets + 1`).
- **Balance**: "BALANCE" in small caps, the balance in DSEG7 44px with the sand glow, and a line under it:
  "units · started this run at 1,000 · +x% · peak y". Peak means the run's highest balance; compute it from the
  tally's days, or drop "peak" if this run's history isn't fully loaded. On the right: units on open tickets
  and what they could pay (from `openBets`).
- **The chip rack**: the balance as stacks of side-view casino chips standing on a leather rail
  (`v.leather` look, 30px tall, rounded, inset shadow).
  - Break the balance into 100s (`#1a1a1a`), 25s (`chip.$chip-green`), 5s (`chip.$chip-red`), 1s
    (`chip.$chip-blue`) and halves (`#8a8a8a`), greedily, at most 6 chips a stack.
  - Each chip is 76 × 12px with cream (`chip.$rim-cream`) edge stripes (`repeating-linear-gradient` 11px clay,
    5px cream), a top highlight and a bottom shade.
  - Each stack is labelled with its denomination and lifts 4px on hover (the pop easing; none for reduced
    motion).
  - A legend underneath: "11 × 100 · 1 × 25…".
  - The rack is decorative (`aria-hidden`); the balance text carries the number.

### 3. Rebuy (right half)

- **Bar**: "REBUY", with "Play money · no cash in or out, ever" on the right.
- **Rebuy button**: a 76px casino chip (`chip.chip`, `$chip-blue-reload`) reading "BUY BACK IN". The first tap
  turns it red (`$chip-red`) and changes it to "SURE?", with text explaining what happens. The second tap calls
  **the existing `reload()`**. Clicking anywhere else cancels. Keep whatever confirm the page has today if it's
  stricter.
- **Your runs**: one paper ticket per run (the slip's paper: cream, IBM Plex Mono, scalloped edges) in a grid
  (`repeat(auto-fill, minmax(150px, 1fr))`). Each shows:
  - RUN #N and its dates
  - a sparkline of the balance across the run
  - PEAK
  - how it ended: ENDED 0.0 for a bust, BOUGHT BACK AT x for a rebuy, NOW x for the current run
  - for finished runs, a rubber stamp (−12°, multiply blend): **BUST** in red if it hit 0, **REBUY** in grey
    otherwise

  Runs come from each bet's `run` and the tally's days. If the per-run history can't be rebuilt from loaded
  data, show the current run only.

### 4. Heads up (full width)

The existing **You vs the Bot** (`versus`), restyled as a stadium scoreboard. Same data, same periods.

- **Bar**: "HEADS UP", with a Week / 30 days / All pill switch on the right (sand fill when on).
- **Scoreboard**: three columns, `1fr 260px 1fr`. YOU and THE BOT each show their units in DSEG7 52px; the
  leader's glows sand, the other is white. The middle column shows the period, "YOU LEAD BY x U" (green) or
  "THE BOT LEADS BY x U" (grey), ten dots for who won each of the last ten days (sand for you, grey for the
  bot), and a caption.
- **Stat rows** under it, on the same three columns: RECORD, ROI and BEAT THE CLOSE (hide that row if
  `versus` doesn't carry it).
- **New footer strip**, three cells, all derived from settled bets:
  - **TAILING THE BOT**: `botPick` bets
  - **YOUR OWN CALLS**: bets the bot didn't pick
  - **FADING THE BOT**: the other side of a bot pick

  Each shows a record and units. Compute them from the tally if it can split them, otherwise from the loaded
  settled bets with "last N bets" in the caption.

### 5. High rollers (left half)

The existing **leaderboards** (`board`, `periods`), restyled:

- **Bar**: "HIGH ROLLERS", with the period pills.
- **Rows**: a DSEG7 rank on a sunk LED tile (#1 sand-glow, #2–3 green), an avatar disc (the user's own photo
  where the leaderboard has it, else initials on a colour), name, a one-line specialty (hide it if the
  leaderboard doesn't carry it; no new fields), units (green or red), record and streak.
- **The signed-in user's row**: a sand wash with a 2px sand rail on the left.
- **Footer**: the existing public-players note and the privacy link.

### 6. The trophy case (right half, new)

- **Bar**: "THE TROPHY CASE", with "N of M chips collected" on the right.
- **Grid** of collectible casino chips (`chip.chip`, 64px, each its own clay, a white stroke icon, rim
  spots). Earned chips are in full colour with "Earned <date>". Locked chips are greyscale and dark, with
  "x of y".
- **Selecting a chip** (a real button) shows a detail strip below: the chip, its name, how to earn it, and a
  sand progress bar if it's locked.
- **The eight in the design**, all derived from settled bets and the tally. Drop any you can't compute
  honestly:
  - First Blood: cash your first ticket
  - Heater: 5 straight wins
  - Longshot: cash a ticket at +300 or longer
  - Sharp: beat the closing line 25 times. Only if closing lines are on the bets; drop it otherwise.
  - Tailgater: 20 bot-picked wins
  - Parlay Prince: cash a parlay of 3 or more legs
  - Phoenix: bust a run, then finish the next one up
  - Iron Stomach: 50 bets in one week

### 7. On the wall, then your tells (new, two full-width panels)

**On the wall**: **one** full-width panel with the green bar ("ON THE WALL", and on the right "Your
biggest cash and your worst beat, pinned up for posterity"). Below the bar the panel's body is **a corkboard in a dark wood frame**, not the scoreboard. The cork
is a tile, `docs/wallet-redesign/cork.svg` (220 × 220px, warm cork with speckle), copied into the shared
assets as a file, not a data URI. Over it go a warm light from the top
(`radial-gradient(ellipse 70% 90% at 50% -10%, rgba(255,224,180,.16), transparent 60%)`) and a brown
vignette at the edges. The frame is inset shadows: a 12px `#3b2616` wood band, a 1px `#1c120a` line inside
it, a faint highlight, and a shadow falling from the top. Padding is 44px 40px 34px. Both tickets sit side by
side on it. There are **no** separate headers per ticket and
**no** gold frames. Each ticket is the slip's paper, up to 400px wide, tilted slightly (−1.5° and 1.2°), with
a deep drop shadow and a **red push-pin** at its top centre (16px, a lit red ball,
`radial-gradient(circle at 35% 30%, #ff9b8f, #c62828 50%, #7a1414)`, with a soft shadow down and right). Under each ticket is a caption pill (black at 55%) with a coloured
dot and a label: BIGGEST CASH in green, WORST BEAT in red.

- **Biggest cash**: the settled bet with the largest profit, stamped CASHED in green.
- **Worst beat**: the most painful loss, stamped BAD BEAT in red. That's the parlay with the most legs hit
  before a loss, or else the largest losing stake. Don't invent margins: show "lost by half a point" only if
  the bet's final score and line show it.

The two sit in `repeat(auto-fit, minmax(min(100%, 340px), 1fr))`, so they stack on phones. Hide a ticket
that has nothing to show, and the whole panel if both are empty.

**Your tells**: a full-width panel with the green bar ("YOUR TELLS", and on the right the link "Every ticket
you've cashed →" to the Bets page's Cashed tab). The body is a grid of six tiles (3 × 2 on desktop, one
column on phones), separated by 1px hairlines. Each tile has a small-caps label and a value in Outfit 17px,
green or red where it's a result. All six are derived from settled bets:

- favourite sport (share of bets)
- best market by units
- worst market by units
- typical stake
- average price
- "Bets placed after 10 PM" record and units, from `placedAt`

### 8. What happened to the open bets and history tables

The wallet's own open-bets and settled-history panels move out. The Bets page's **Open** and **Cashed**
tabs now show them (as tickets, per the Bets brief), and the wallet links there: the "Every ticket you've
cashed →" link, plus a line under Your chips, "5.0u on 4 open tickets", that links to Open. The profit-by-day
curve also goes; the runs' sparklines and Heads Up replace it. **Ask the owner before deleting any of these**,
and if they say keep, put them back as felt-barred panels at the bottom. The components and data stay
either way, because the Bets tabs use them.

### 9. Phones (≤575px)

Everything stacks to one column. The rack keeps its stacks but they shrink (chips 56 × 10px). Heads Up becomes
YOU / middle / THE BOT stacked, with the stat rows as two columns (you | bot) and the label above. The leaderboard
drops the specialty line. The trophy grid goes to 3 across.

## Phases

1. Header and the panel look (green bars, sand titles) on the existing panels.
2. Your chips: the balance and the chip rack.
3. Rebuy: the chip button with confirm (calling the existing `reload()`) and the run tickets.
4. Heads up restyle, plus the tailing / own-calls / fading strip.
5. High rollers restyle.
6. Trophy case.
7. On the wall and your tells.
8. Moving the open bets and history out (after the owner says yes), and the links to the Bets tabs.
9. Phone pass, reduced motion, keyboard: every control is a real button or link with visible focus
   (`v.focus-lit` / `v.focus-ring`), and touch targets are at least 44px.

## Done when

- every phase passed `npm test` and the builds
- the balance and record match today's wallet exactly
- rebuy still resets to 1,000 and starts a new run
- the leaderboards still show public players only
- the Bets page's Open and Cashed tabs still work
- nothing outside the wallet's files has changed
- the owner gets a list of anything hidden for lack of data
