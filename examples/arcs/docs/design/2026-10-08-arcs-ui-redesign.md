# Arcs table UI redesign

## Goal

Someone who knows physical Arcs, and has never seen this app, finishes a turn
without being taught the interface. They make decisions; the table does the
bookkeeping.

At every moment each player can answer, at a glance:

1. **What happened?** Pieces animate between their old and new places, a log
   names every change in game terms, and dice stay on screen after a battle.
2. **What can I do?** Legal targets glow on the board; everything else goes
   quiet.
3. **Why can't I?** Disabled options say why, in rules language.

## Principles applied to Arcs

| Principle                  | In this game                                                                                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The board is the interface | Click your city to tax it, an empty building slot to build, your fleet then a glowing neighbor to move, a Court card to influence or secure, a rival's pieces to battle. Action verbs exist as chips too, for players who think verb-first. |
| Remove bookkeeping         | Gained resources drop into open slots automatically; a turn ends itself when no pips or prelude remain; the client computes legality from the engine's own rules.                                                                           |
| Keep decisions             | Hit allocation, dice mix, ship counts, raid targets, discards on overflow, catapult stops, and every optional card effect stay with the player.                                                                                             |
| Never hide state           | Each player's resources, cities, supply, captives, trophies, guilds, outrage and power have a fixed place on screen. Ambition standings are always visible with projected Power.                                                            |
| Obvious turns              | A single prompt bar says whose turn it is and what they are deciding ("Waiting for Red — assigning hits"). The active player's panel and pieces pulse.                                                                                      |
| Progressive disclosure     | Cards enlarge on hover; battle dice show expected outcomes before rolling; tooltips explain disabled options.                                                                                                                               |

## Screen

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ ARCS  Ch 2 · Rd 3 │ ● YOUR TURN — taking actions ◆◆◆ │ latest event │ ☰ │
├─────────────┬──────────────────────────────────────────┬────────────────┤
│ The Court   │ ┌─────┐                                  │ Ambitions      │
│  2×2 cards  │ │Surp.│        THE REACH (map)           │  chapter, Power│
│  + agents   │ │Copy │   ring segments are the gates;   │  markers, live │
│             │ │Pivot│   the hub shows battle dice      │  standings     │
├─────────────┤ │Lead │                                  ├────────────────┤
│ Your board  │ └─────┘  ┌ action tray: choices ┐        │ Rival boards   │
│  (large)    │          └──────────────────────┘        │                │
│             │         hand (shelved; rises on hover)   │                │
└─────────────┴──────────────────────────────────────────┴────────────────┘
```

The side columns run the full height so the map takes the whole center. The
map stretches horizontally to the shape of the space it has. Like the printed
board, its left edge holds the played cards: a Surpass · Copy · Pivot slot
above the Lead slot, with the zero marker on the lead card once an ambition is
declared.

Every choice appears in the action tray directly above the hand, so playing a
card never sends the eye to the top of the screen; the top bar only says whose
turn it is and what just happened. The hand stays shelved at the bottom edge
and rises on hover, so it never covers the map. Clicking anywhere that is not a
choice backs out of the current one. Every resource, piece count and marker on
a board explains itself on hover.

On short screens the Court collapses to one row of four; on phones the columns
stack under the map.

## Map

Drawn in SVG to echo the physical board: a starfield, painted radial wedges
tinted by planet type, line-art planets drawn per planet type, white
building-slot triangles, and the central ring whose numbered segments are the
gates. Ships at a gate sit on its segment. Out-of-play clusters are
shadowed with the "path" drawn across their gate. Cross-cluster borders that
are not adjacent are drawn as the jagged white "arcs".

Pieces are HTML/SVG elements keyed by piece id and positioned from system
anchors, so any change of system animates as a flight. New pieces drop in;
destroyed pieces burst and fly toward the trophy box of the player who took
them. Damaged ships are tipped and dimmed; damaged buildings flip dark.

Control is shown as a faction-colored rim on the system.

## Interaction model

The client derives a single **situation** from the view and the viewer:

- **Waiting** — someone else acts. The prompt names them and what they are
  deciding.
- **Choose a card** — hand cards glow. Clicking a card shows its legal plays
  (Lead / Surpass / Pivot / Copy) with action counts, plus declare-ambition and
  seize-initiative toggles when legal. Pass is offered to the initiative holder.
- **Take actions** — prelude options (spend resources, guild preludes) appear
  on your board while the prelude lasts; pip actions highlight on the map and
  Court. End turn is always available.
- **Pending choice** — each engine pending kind (catapult, regroup, ransack,
  resource overflow, farseers, vox cards, mulligan…) gets a focused prompt that
  uses board targets where the choice is spatial.
- **Battle** — dice picker with expected results, a dice tray that persists
  after the roll, hit assignment on the battle system's pieces, raid spending
  on the defender's board.

Legality comes from the engine itself: the client hydrates a `GameState` from
the view (filling hidden fields with harmless placeholders), and tries each
candidate input with `applyInput` on a clone. A candidate that throws is
illegal and the error code becomes the "why not" text. The same dry run gives
the preview ("+1 Fuel · captures 1 agent").

## Engine changes for experience

- Resources gained into free slots are placed directly; the resources choice is
  asked only when something must be discarded.
- A turn ends automatically when the card's pips are spent and nothing is
  pending.
- Every standard action writes a log line; the last battle roll is kept in
  state so all players see the dice.

## Tech

React 19, TypeScript, Vite, `motion` for animation, plain CSS with design
tokens. The client imports the engine's rules for previews; the engine still
validates every command.

## Verification

- Unit tests for hydration, legality enumeration, and situation derivation.
- Component tests for the main flows (play card, build, move, battle).
- Scripted playthroughs against `tvk dev`, screenshotted in headless Chrome
  from every seat.
