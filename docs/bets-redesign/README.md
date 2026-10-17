# Bets page redesign: "The Book"

The owner signed off on a new look for the Bets page (`/bets`). This is the brief for building it. The two
design files beside this one are the approved designs as standalone HTML, with every colour, size and layout
value exact: `Main.dc.html` (desktop, 1440 wide) and `Phone.dc.html` (390 × 844). Their markup is a design
tool's format (`{{holes}}`, `<sc-if>`, `<sc-for>`); read them for values and structure, not as code to paste.
The sample picks, odds, records and write-ups in them are made up.

## The one rule: change the look, not the logic

The page's behaviour is already right and tested. This is a **presentation rewrite**. Do not change:

- how picks, boards, lines and props are loaded (`bets-page.component.ts` fetches, `lines.service.ts`,
  `season data`), `pickKey`, `kellyOf`, `americanOdds`, the sorting (confidence band, then Kelly), the limits
  (`limit`, `gameLimit`, `checkLimit`)
- the wallet and slip logic (`wallet.service.ts`, `wallet-math.ts`, `bet-slip.component.ts`'s placing,
  staking, parlay maths, sign-in gate)
- the why / check-why popover **data** (`toggleWhy`, `closeWhy`, `checkKelly`, `rankTitle`, `betScoreText`,
  `signedPoints`), the admin-only pieces (CHECK rows, desk notes, the Algorithm tab, `canUse`, `ADMIN`)
- `model-desk.*`, `desk-*`, `bets-about.*` beyond the styling the brief names
- anything in `scripts/`, `apps/*/scripts/`, `StaticData/`, `tests/`

If a piece of the design needs data the page does not already have, **do not add a new fetch or a new
source**: build the piece so it hides when its data is missing, and list it for the owner. Where the brief
says "the existing X", find X and call it; never re-implement it.

Work in the phases below, one commit each, and after every phase run `npm test` and `ng build nfl` (and one
other sport). Stop and report if either fails rather than pushing on.

## Before you start

- PR #1 (`design-system-cleanup`: the `$fs-*` type scale, `$space-*` spacing scale and `$text-*` white-text
  ladder in `_variables.scss`) should be merged first; use those tokens for every size, gap and white text
  below. If it is not merged, ask the owner whether to wait.
- Read `Main.dc.html` top to bottom once. The helmet `<style>` block holds every surface recipe.

## What changes, piece by piece

### 1. The ground: felt

Keep the page's own texture stack in `bets-page.scss` `:host` (the warm pool of light, the dark edges, the
two crosshatch `repeating-linear-gradient`s, the fiber and mottle SVGs). Change only the last layer, the blue
cloth, to green felt: `radial-gradient(ellipse at 50% 30%, #1d7a4f, #155a3a 55%, #0b3322)`, and soften the
edge shadow from `rgba(0,0,0,.72)` to `rgba(0,0,0,.6)`. The light stays the tables' gold (`chip.$gold-led`,
`#ebc56c`).

### 2. Header (one row, wraps on small screens)

- **Title**: a black chip (the existing `chip.chip` mixin, clay `#1a1a1a`, 46px, "SR") and `THE BOOK` in
  Outfit 600, 26px, 3px letter-spacing, uppercase, gold with the scoreboard glow. No subtitle.
- **Tabs**: the existing Place / Open / Closed / Algorithm tabs, renamed **The board / Open · N / Cashed /
  Algorithm**, restyled exactly like the sport pages' **position bar** (`app.component.scss .position-bar`):
  a scoreboard panel 44px tall, corners `v.$tab-r`, equal-width buttons, Nunito **800** 11px, 1.5px
  letter-spacing, uppercase, white with the small text shadow, the active one `@include v.lit-tab`. Same
  visibility rules as today (Open and Cashed only when the user has them, Algorithm admin-only). Keep the
  About "i" button at the end of the row.
- **Bankroll card**, right-aligned: a 268px "player's card" built from the existing `bankroll()` data. Black
  fade (`radial-gradient(ellipse at 85% 0%, rgba(255,226,122,.18), transparent 55%), linear-gradient(135deg,
  #1d1d1d, #121212 60%, #1a1a1a)`) with a 1px gold-metal gradient border (`chip.$felt-gold`), radius 10px.
  It holds a small lock-chocolate chip, `BANKROLL`, the balance in Outfit 24px gold, units in play, and the
  record and ROI. **The whole card is a link to the wallet page** (the existing wallet route; hover:
  `brightness(1.15)` and a 1px lift). Signed-out users: hide it, as `bankroll()` already returns null.

### 3. Ticker (new, under the header)

A one-line scoreboard strip (dot-matrix panel, 1px `$panel-edge`, radius 4px) that scrolls sideways forever
(`translateX(-50%)` over 45s on a doubled list; **still** for `prefers-reduced-motion`). Each item: the
sport in small caps, away team, away score, home team, home score, then the state: `FINAL` (60% white),
live clock like `3RD 4:12` (green `$good-bright`), or a start time like `7:00 PM` (light grey) for games not
started. Outfit 12px, 1px letter-spacing, scores in gold. The strip is 30px tall and every item is
**vertically centred** in it (flex `align-items: center`, `line-height: 1` on the items, no top/bottom padding),
including the smaller 10px sport label.

**Data**: use only what the page already loads, which is the game list behind the game dropdown (start
times) plus any live or final scores already loaded for Open Bets. Do not add a scores feed. If there is
nothing live, the strip shows the upcoming start times. If there is nothing at all, it hides.

### 4. Controls row (above the board)

- **Game dropdown**: the existing one (`game`, `chooseGame`, its open list grouped by day and sport, with
  pick counts or "lines"). Restyle the pill and its open list with the bankroll card's black-to-gold fade and
  gold edge (pill radius 999px, 44px tall, min 260px; list black fade, `#b38a3c` 1px border, radius 10px,
  `max-height: 420px`, scrolls). "Best bets" stays the home choice.
- **Bet-type chips**: the existing `kind-chip`s, **unchanged** (`chip.chip`, the `$kind-clay` colours, label
  and count, rim spots, multi-select through `toggleKind`). Make them 54px and drop the hover key's paragraph
  (keep `title`).

### 5. The board (the only thing that scrolls on desktop)

Layout at ≥1000px: the page doesn't scroll (as today). The header, ticker and controls stay put, and the board
fills the rest of the height and scrolls inside (`flex: 1; min-height: 0; overflow-y: auto`). The right
column (ticket and recent form) scrolls on its own if it's taller than the screen. Below 1000px everything
stacks and the page scrolls normally.

The board panel is a dot-matrix scoreboard (`#121212`, 1px `$panel-edge`, an outer 5px `$panel-dark` ring and
a 1px `$panel-edge` ring, radius 8px). **No title and no column header row.**

**Best bets view (no game chosen)**: one collapsible section per band, in order LOCK, LOVE, LIKE (CHECK for
admins after LOCK, as today); PASS and FADE fold into one dim line at the bottom ("Off the board: N passes
and M fades…") that expands to show them as today.

- **Band header** (a `<button aria-expanded>`, sticky to the top of the scroller while its rows scroll):
  a 30px chevron slot (rotates 90° open) **aligned with the rows' chevron column**, the band icon (padlock /
  heart / thumbs-up as stroke SVG), the name in Outfit 700, 16px, 3px letter-spacing in the band colour with
  a glow (LOCK `chip.$lock-light` `#f0a060`, LOVE `$good-bright`, LIKE `$caution`) — **no pick count and no
  description after the name** — and on the right the band's **season record, units and last-five results** as five small squares. The
  background is a left-to-right wash of the band colour fading out by 70%, and the bottom edge is the band
  colour at about 45%. Record data: use the per-confidence results the page or the desk already loads. If
  the public page doesn't have them, show the header without the record and tell the owner.
- **Row** (grid `30px 46px 34px 1fr 170px 96px`, gap `$space-14`, padding 11px 16px; 700px and narrower:
  follow the phone design):
  1. chevron button: expands the row (`toggle`, the existing `open` set). **Rows start closed.**
  2. **rank tile**: the existing LED tile (`v.led-tile`, DSEG7, 46 × 36), top ranks green as today, LOCK's
     padlock and CHECK's "?" as today. It's a `<button>` that opens the existing **why popover**
     (`toggleWhy`).
  3. the existing 34px circle (`headshot` / `pickLogo` / over-under arrow).
  4. the pick in Outfit 500 **15px** (key word in gold, or the team colour as `pickColor` gives it today),
     and under it at 11px: `SPORT · matchup · time — one-line reason`, ellipsised.
  5. **model vs book meter** (the owner loves this one): "Model 62%" in green on the left, "Book 53%" at
     60% white on the right, then a 6px track (`$panel-rule`) with a green fill to the model's chance
     (`r.chance`) and a 2px white tick at the book's chance (the price's implied chance, without the vig if
     the page already computes it).
  6. **price button** (46px tall): the odds over "+ TICKET" on felt with a gold-seam border; when the bet's
     on the slip, it's solid gold `#ebc56c` with dark text, "ON TICKET", and a gold glow. It adds the bet and
     takes it back off through **the same slip call the game-lines price tiles use today**. Find it in
     `game-lines.component.ts` and call it; don't write a second one. Keep the existing "✓ 2u placed" note
     (`placedOn`) under the pick.
- **Expanded row**: the reason paragraph, "Devil's advocate:" in `$doubtful`, a meta line (edge · Kelly ·
  venue and weather from `where()` · "Analysis by Claude"), the admin desk-note button as today, and the
  existing compact lines board for the game.

**Game view (a game chosen in the dropdown)**: the board swaps to that game's full menu, which is the
existing `game-lines` component with all its data, restyled:

- a sticky header: "← Best bets" (back to `game = ''`), the matchup, time and venue, and a key: "gold ring =
  the bot's pick · **K** = Kelly score, tap it for the math"
- three collapsible sections with the band-header look in gold: **GAME LINES** (spread / total / moneyline
  × away/home), **TEAM TOTALS**, **PLAYER PROPS** (over / under per player). **Player props starts
  collapsed.** Section counts like "6 bets" or "4 players · 8 bets". The bet-type chips filter the sections.
- every price is a tile and **every price is bettable**: line over odds on felt, plus a footer strip with
  the bot's band tag (LOCK chocolate, LOVE green, LIKE yellow, PASS grey outline, FADE red outline, or
  nothing) and a **K score button** (green ≥ 0.5, grey above 0, red at or below 0) that opens the why
  popover for that price. The bot's picks get a 1.5px gold ring and a soft gold glow. A bet the user adds
  that the bot didn't pick goes on the ticket tagged "YOUR CALL".

**Scrollbars** on this page (the board, the right column, the game dropdown's list, the sheets) have **gold
thumbs**: `scrollbar-color: #d9a520 rgba(0,0,0,.25)` with `scrollbar-width: thin` (the page's own scrollbar
mixin otherwise: 10px, `$scrollbar-radius`).

### 6. The why popover ("how the sausage is made")

Same data as today's why and check-why popovers; restyle them as one panel (dot-matrix, 1px gold border,
radius 8px, 350px, anchored at the board's top right on desktop and a bottom sheet on phones as today). It
shows:

- the Kelly score big on an LED tile
- the bet and its game
- the score's components as ± bars (green or red), from the existing component data
- the model-vs-book meter and expected return per unit
- the existing comparison to the neighbouring ranks, as one sentence
- for passes and fades, the existing reason
- one line of fine print on what the score means

**Popovers close on any click outside** (`clickOff` exists, so make sure it covers the new triggers) and on
Escape.

### 7. The ticket (right column on desktop, ~360–390px)

The existing `bet-slip` component, docked in the right column on ≥1000px instead of the floating
drawer, and restyled as a **printed bet ticket**:

- cream thermal paper `linear-gradient(180deg, #f4efe3, #ece5d4)`, `#1a1a1a` ink, IBM Plex Mono (add it to
  the Google Fonts import), scalloped top and bottom edges (the CSS `mask` in `.ticket`), drop shadow
- a centred header: "THE BOOK / SEASON RANKER · PLAY MONEY / date · ticket number", then a dashed
  perforation
- the Straight/Parlay switch as a black-outlined two-way toggle
- each bet in caps with its game line and band tag (or YOUR CALL), the odds, a remove ×, "RISK x U / WIN y U",
  and the **existing stake chips** (`chip.chip`, 34px) plus "clear"
- totals (TOTAL RISK, TO WIN, PAYS), the **place button in the bankroll card's black-to-gold fade with gold
  lettering**, "tear up ticket" (clear all), a decorative barcode and the fine print

Phones: a ticket stub docked at the bottom ("TICKET · N BETS", risk, win and pays, and the place button). Its
"Expand" (a chevron up) raises today's bottom-sheet slip with the same restyle; the sheet's chevron down, Escape
or a tap outside the sheet minimize it back to the stub, the bets kept. Sign-in, errors and placing all stay as
they are.

### 8. Recent form (under the ticket)

A dot-matrix card titled "RECENT FORM" in gold, with a **You / The Bot** switch. It shows last-7-days record,
units and streak, and then the last five settled bets: a W/L/P tile, the pick, the game and the units. "You"
comes from the wallet's settled bets. "The Bot" uses the bot's settled results if the page already has them
(otherwise hide the switch). It defaults to The Bot for a user with no settled bets.

### 9. Open tickets, Cashed and Algorithm (the other three tabs)

The tabs switch views in place, as today. In the designs, click the tabs on either artboard to see each one.

**Open tickets** (today's Open Bets tab, `hasOpen()`): a summary strip (dot-matrix panel: "OPEN TICKETS" in gold,
then IN PLAY, TO WIN, LIVE and PENDING counts), then the user's open bets **as printed tickets**, the same paper as
the slip, in a grid (`repeat(auto-fill, minmax(290px, 1fr))`, gap 26px × 24px; one column on phones). Live
tickets come first. Each ticket shows:

- "THE BOOK", the ticket number and when it was placed
- a status tag: a black **LIVE** tag with a blinking green dot (still for reduced motion), or the start time
  outlined
- STRAIGHT, or "N-LEG PARLAY · odds"
- every leg: the pick in caps and its odds, "SPORT · matchup · band tag", and a live line: the score and clock
  with how the bet stands ("PACE 212, UNDER BY 9.5" in green, "2 OF 4 SHOTS · NEEDS 2 MORE" in ink), or
  "KICKS OFF SUN 3:05 PM" in grey. Props get a thin green progress meter.
- RISK, TO WIN and PAYS, and the barcode

The data is the wallet's open bets and the live scores and progress the Open Bets table already shows (its
score and progress-meter columns). Grouping by game is no longer needed, because each ticket names its game.

**Cashed** (today's Closed Bets tab, `hasClosed()`): the same tickets for settled bets, newest first, under a
strip with the last 7 days' RECORD, UNITS and STREAK. Each ticket carries a rubber stamp rotated −14°, set in the top-right corner (about 54px from the top on desktop, 38px on phones; the designs have it exact)
so it overlaps the SETTLED tag and the ticket number and time, **never the result line or the totals**: a 3px
border in `currentColor` over the ticket, multiply blend at about 82%. It reads **CASHED +x U** in `#1d8a4e`,
**LOST −x U** in `#c62828`, or **PUSH** in `#4a4a4a`. The totals read WON, WOULD HAVE WON or RETURNED, and the
live line becomes the final score.

**Algorithm** (the model desk, admin only, `desk()`): restyle only. **No ticker on this tab** (it stays on The board, Open
tickets and Cashed). Its panels are plain scoreboard panels (`v.scoreboard-panel`: dots, 1px `$panel-edge`, the
small drop shadow), **not** the board's ringed panel. The ringed board style is the Best-bets board's alone, and
its `flex: 1` would squash the profit curve. **Every panel, number and calculation stays
the model desk's own.**

- **The six scoreboard tiles** in a row: Balance, Record, Profit, ROI, At risk, Beat the close. Each is a
  dot-matrix tile with a small caps label, the value in DSEG7 (gold for Balance, green for gains) and a
  one-line note.
- **The date-range and game selects** as the black-to-gold pills.
- **The sport chips** as the house's casino chips, using `$sport-clay` with All in gold. They now pick one
  sport at a time; check how they behave today, and if they're multi-select, keep that.
- **The profit curve** on a board panel: one line per sport in `$sport-line`, the total in gold over a soft
  gold area, a dashed zero line, and the legend with each sport's units.
- **The panels** become collapsible board panels with the gold header bar (chevron, title, and a one-line
  summary on the right). The owner's order (2026-10-17): By Sport and By Confidence side by side at the top
  (stacked on a phone), then Open Bets, those three open to begin with; then, full width and folded, Latest
  Results, Calibration, By Stake, Tracked, Self-check, News signals, CHECKs, What It's Changed, Context,
  Backtest, Model Settings, In Play. By Market is gone. Tables get 10px caps heads and tabular numbers. Self-check statuses are word
  tags (OK green, WATCH orange, FAIL red), never colour alone.

### 10. Removed

The slot-machine handle and reel spin (`pull`, `pulling`, `spinning`) aren't in the design. **Ask the owner
before deleting them.** If they say remove, take out the markup, styles and the three members together. Also
drop: the paragraph-long chip key tooltip, the duplicate lines board that showed on top when a game was
chosen, and the six-material clutter (gunmetal panel, gold rail, blue cloth).

**Vertical centring, everywhere**: every pill, dropdown, tab, chip label and header row centres its contents
with flex `align-items: center` and `line-height: 1` on the text, never baseline alignment (the ticker, the
dropdown pills and the Algorithm's PROFIT header row with its legend in particular).

## Phases (commit and check after each)

1. Felt, header, tabs and the bankroll card.
2. Ticker.
3. Controls row (dropdown restyle; chips untouched).
4. Board layout (only the board scrolls), band headers, rows, the meter, the price button wired to the
   existing slip call, expanded rows.
5. Game view (game-lines restyle, collapsible sections, K buttons, YOUR CALL).
6. The why popover restyle and outside-click closing.
7. The ticket (desktop dock, phone stub and sheet).
8. Recent form.
9. Open tickets and Cashed as tickets; the Algorithm restyle (restyle only).
10. Phone pass against `Phone.dc.html` (≤700px), and the reduced-motion and keyboard check: every control is
   a real button or link, focus uses `v.focus-lit` / `v.focus-ring`, and touch targets are at least 44px.

## Done when

- every phase has passed `npm test` and the builds
- placing a straight and a parlay, removing a bet, and changing stakes all work as before
- signed-out users see no bankroll card or ticket actions, as today
- admins still see CHECK rows, desk notes and the Algorithm tab
- nothing outside the files this page owns has changed, apart from the font import
- the owner gets a list of anything hidden for lack of data (band records, the bot's recent form, live
  scores)
