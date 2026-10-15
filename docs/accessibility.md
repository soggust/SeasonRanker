# Accessibility notes

Where the site stands on the WCAG 2.2 AA checks that touch its styles, what was decided, and what's left on
purpose. Paths are under `libs/ranker/src/styles/` unless they say otherwise.

## Keyboard focus (decided, in place)

- **Only keyboard focus shows.** Everything uses `:focus-visible`, so a mouse click or a tap shows nothing
  new. (Text boxes are the one exception browsers make: a click into a text box counts as keyboard focus,
  so the rankings search bar's edge and the tracker title's glow light on a click too, as every field's edge
  on the account pages already did.)
- **Minimal: a color change, not a ring.** WCAG 2.4.7 Focus Visible (AA) only asks that keyboard focus is
  visible; a clear color change is enough. (2.4.13 Focus Appearance, the one that sets ring size and
  contrast, is AAA and not a goal.) So a focused control lights the way its hover does: its text, icon or
  edge takes the page's light (`--scoreboard-led`). Expand controls and chevrons lighten to white, never the
  yellow accent. On the Bets page, where the light is the felt's own gold, felt controls and note fields
  turn their edge white instead. Menu items get a light wash only when the keyboard is on them (Material's
  `.cdk-keyboard-focused`), so a menu opened with the mouse shows nothing on its first item.
- **A thin ring only where there's no color to change**: a colored chip (stake chips, wallet chips, recent
  results), a sport's leather pill, the slot lever, a video picture, a Material switch. It's 1px of soft
  white (`$focus-ring`), never the accent.
- **How to style a new control**, in `_variables.scss`:
  - `@include v.focus-lit { color: var(--scoreboard-led); }`: the focus, no ring; put in it what the
    hover changes.
  - `&:focus-visible { @include v.focus-ring; }`: the thin ring, only when nothing can change color.
- **The fallback** (`_base.scss`): any focusable element without a focus style of its own gets the thin
  ring, at zero specificity (`:where`), so a component's own focus always wins. There's no `!important` ring
  any more. A rule that sets `outline: none` must give the control a focus of its own, or keyboard users
  lose it.
- **Known gap:** the filter menu's sliders show no focus (Material's focus halo is turned off in
  `_base.scss`, and the range input under the knob is invisible). Lighting the knob on
  `.mdc-slider__thumb--focused` would close it.

## Contrast (not fixed yet)

WCAG 1.4.3 Contrast (AA) asks for 4.5:1 for text under about 18px (3:1 for icons, 1.4.11). Much of the
site's fine print is white at 35-50% on the dark scoreboard, at 9-11.5px. Measured against the flat panel
color, white at 50% is about 5.0-5.4:1 and passes, but the dotted scoreboard, the lighter pewter wells and
tinted bars pull it under; 45% is about 4.4:1, 40% about 3.8:1, 35% about 3.2:1, and `#777` about 4.2:1.

**Suggested fix:** one "faint text" floor of `rgba(255, 255, 255, 0.6)` (about 6.6-7:1), applied site-wide,
and 10px as the smallest text. Decorative lines can stay faint. Best done with a small set of white-text
tokens (the audit's "alpha ladder") so the floor is set once.

| Where | What | Now | Needs | Suggested |
| --- | --- | --- | --- | --- |
| `components/player-card.scss` `.ai-meta` | AI section's date/model line, 9.5px | white 45%, ~4.4:1 | 4.5:1 | 60%, 10px |
| `components/player-card.scss` `.log-vs`, depth-row `small`, `.depth-row-games`, `.depth-change-note`, `.ai-swing-label`, AI `h4`, log chart `small` | game log "vs", Team tab counts and notes, AI labels, 10-11px | white 45-50% | 4.5:1 | 60% |
| `components/rankings.component.scss` `.rank-why .why-foot` | the "why" popover's footnote, 10.5px | `#777`, ~4.2:1 | 4.5:1 | `#999` (~6.6:1) |
| `components/bets-page.scss` `.bet-why .why-foot` | the Bets "why" footnote, 10.5px | `#777`, ~4.2:1 | 4.5:1 | `#999` |
| `components/rankings.component.scss` `.drag-indicator` | the row's drag grip (an icon) | 30% opacity, ~2.5:1 | 3:1 | 45% |
| `components/rankings.component.scss` header `.label-tag`, `.compare-count` | 8px label tags, the 9px compare count | small | 10px | 10px |
| `components/compare.scss` search placeholder, skill-bar numbers | Compare's search hint and bar numbers | white 45% | 4.5:1 | 60% |
| `components/game-view.scss` caps labels, table heads, `.wp-edge`, `.drive-result`, `.game-play-clock`, `.log-vs`, several `small` | game view fine print, 10-11.5px | white 45-50% | 4.5:1 | 60% |
| `components/model-desk.scss` table `small`, `dt` | Algorithm fine print, 10.5-11px | white 45-50% | 4.5:1 | 60% |
| `components/tracker.scss` `.pin-when`, `.pin-footnote`, `small` | Track Players dates and footnotes, 10-11px | white 35-50% (footnote ~3.2:1) | 4.5:1 | 60% |
| `components/wallet-lines.scss` `.lines-when`, table heads, `.preview-moved`, `.lines-foot`, `.price-kelly` | wallet lines fine print, 9.5-11.5px | white 40-55% | 4.5:1 | 60%, 10px |
| `components/wallet-slip.scss` `.slip-fine`, `.slip-game`; `components/wallet-page.scss` `.wallet-fine`, `.w-phone-game` | slip and wallet fine print, 10.5-11.5px | white 45-50% | 4.5:1 | 60% |
| `components/account-lists.scss` `.of`, `.section-foot`, `.m-lists`; `components/account-profile.scss` `.bet-when`, stat labels | list footers, profile labels, 9.5-11.5px | white 50% on pewter, ~5.0:1 or less | 4.5:1 | 60%, 10px |
| `components/login-dialog.scss` `.login-or`; `components/field-map.scss` legend `small` | "or" divider, field map legend, 10-11px | white 45-50% | 4.5:1 | 60% |

The list comes from the CSS audit (white at 50% or less, or `#777`, at 11.5px or under); about 37 more
places use white at 45% at larger sizes, which pass on flat black but are worth the same floor.

## Older Safari: the LED rank letters (check on an iPhone)

The CSS audit removed hand-written `-webkit-background-clip: text` lines that sat before a `background`
shorthand (which reset them, so they never applied). Autoprefixer now writes the prefix after the
shorthand, where it works. Chrome can't show a difference. On an older Safari that still needs the
prefix, the dotted LED lettering should now clip to the letters as designed: the player card's rank label
("RANK" / "OF"), the game view's start-time half label. Worth a look on an iPhone that's a few versions
behind: the letters should be dotted, not a dotted box. (`components/_awards.scss` keeps its own
hand-written prefix on purpose; Autoprefixer doesn't add one there.)
