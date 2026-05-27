# Tabletop UI Library Design

## Summary

Ship a first-party UI library, `@tabletop-kit/ui`, that gives boardgame
implementations a consistent way to render the engine's state tree and wire
commands.

The library should be **hybrid**:

- React **hooks** distributed as a normal npm package, imported like any
  dependency.
- React **components** distributed as source code that customers copy into
  their own repo via `ttk ui add <component>`, in the style of
  `shadcn/ui`.

Both halves should live in the same npm package and share one version, so the
copied components and the imported hooks can never drift apart.

## Background

The longer-term direction for `tabletop-kernel` is a coding agent that
implements the digital version of a boardgame from its rulebook and art
assets. The customer is the boardgame designer; the agent does the
implementation work.

For that pipeline to produce consistent UIs across many games, the agent
needs a **fixed vocabulary** of UI building blocks — selection, discovery,
command confirmation, hand vs. board zones, hidden information — already
solved once and ready to compose. Without that, every generated game
re-invents the same interaction patterns at slightly different quality
levels, and the agent's output becomes unreliable.

This doc describes the library that vocabulary lives in.

## Goals

- give the agent a stable, narrow surface to compose boardgame UIs from
- encode interaction logic (selection, discovery, command confirmation) once,
  not per game
- let designers tweak the visuals and interactions of any primitive without
  forking a package
- keep version coherence between hooks and components automatic
- integrate with the existing `ttk` CLI so customers learn one tool
- keep the React-specific surface optional — non-React customers should not
  pay a cost for it

## Non-Goals

- shipping a styled component system that locks every game into the same
  visual identity
- supporting non-React UI runtimes in the first version
- modeling animation systems, sound, or asset pipelines
- replacing or wrapping `tabletop-engine`'s state model — the library reads
  from it, it does not redefine it

## Why A UI Library At All

The Splendor example proves the point: rendering the engine's state tree as
React is straightforward, but interaction logic is not.

Implementing one game required solving:

- "this element is selectable for the active discovery step"
- "this element has been picked and contributes to a pending command"
- "the command is partially specified — show a confirm bar with running
  status"
- "the command is fully specified — enable confirm"
- "selectable elements need a breathing highlight that does not fight the
  underlying card art"

These problems are **not Splendor-specific**. Every command in every boardgame
that uses iterative discovery has the same shape. Solving them once in a
shared library means:

- the agent does not have to re-derive them per game
- the designer does not have to debug them per game
- visual quality across games converges instead of diverging

## Library Shape

### Hooks (npm-distributed)

Hooks expose a stable, versioned API that:

- subscribes to the live game view from the engine client
- exposes ergonomic slice selectors
- exposes the command/discovery state machine
- handles selection accumulation and confirmation

Initial hook surface:

```ts
import {
  useGameState,
  useDiscovery,
  useSelectable,
  useActiveCommand,
} from "@tabletop-kit/ui";

const bank = useGameState((s) => s.board.bank);
const discovery = useDiscovery();
const gemSelectability = useSelectable("gem", color);
```

Hooks are pure logic. They do not render anything. They can stabilize and
reach `1.0` independent of any visual choices.

### Components (CLI-scaffolded)

Components are React source files that get copied into the customer's repo
when they run:

```bash
ttk ui add token-pile
ttk ui add card
ttk ui add command-bar
```

Each component is opinionated about behavior and minimal about styling. They
import their logic from the hooks package, so customers can restyle freely
without re-implementing selection, discovery, or confirmation.

Initial component vocabulary:

- `Selectable` — wraps any element with `selectable | selected | none` state
  and a breathing highlight
- `TokenPile` — gem/cube/cardboard-token in a bank or player area
- `Card` — face-up card with art, cost, and ribbon slots
- `Deck` — face-down pile with a count
- `Tile` — placed object on the board (noble, achievement, etc.)
- `PlayerArea` — own-vs-opponent layout for a single player's tokens, cards,
  and reserved zone
- `CommandBar` — sticky bottom bar with cancel/confirm and discovery status
- `ActionList` — sidebar of available command types

This list is the starting set, not the final list. New primitives are added
when a second game needs the same pattern a first game already needed.

## Why Hybrid (Hooks Imported, Components Copied)

The two halves have different stability and ownership requirements.

**Hooks**:

- API needs to be stable and versionable
- customers should not modify them
- bug fixes should reach all customers cleanly

**Components**:

- visuals will be customized per game (a Splendor card looks nothing like a
  Wingspan card)
- interaction patterns will sometimes need per-game overrides
- the agent benefits from being able to read the source it composes
- customers benefit from owning the code they ship

Shipping components shadcn-style means the customer's repo always contains
the source of every visual they render. The agent can inspect that source
to understand how to compose primitives. The designer can edit it without
forking a package.

Shipping hooks via npm means selection/discovery/confirmation logic stays
canonical across games. A bug in the discovery state machine is fixed once,
and `bun update @tabletop-kit/ui` reaches every customer.

## Why The Same Package

The copied components will import their logic from the hooks package:

```tsx
// src/components/ui/token-pile.tsx (scaffolded)
import { useSelectable } from "@tabletop-kit/ui";

export function TokenPile({ color, count, target }) {
  const state = useSelectable("token", target);
  // ...
}
```

If hooks and components shipped as separate packages, customers could end up
with hooks `v2` and components scaffolded against the `v1` hook API. Bundling
them in one package makes that drift impossible: scaffolding `@tabletop-kit/ui ui
add token-pile` always pulls source that targets the same version of
`@tabletop-kit/ui` the customer already has installed.

Tradeoff: hooks cannot independently version vs. components. This is
acceptable because component churn is mostly **additive** — adding new
primitives — and additive changes do not require a hooks bump.

## Why Bundle Into `ttk`

Customers already use `ttk` to generate engine types and protocol
artifacts. Adding UI scaffolding to the same CLI gives them one tool to
learn:

```bash
ttk init
ttk generate types
ttk ui add token-pile
```

For an agent, this is even more important: one CLI surface to know means one
set of capabilities to plan against, not two.

The React-specific dependencies of the `ui` subcommand should be **lazy** or
**peer**: a non-React customer running `ttk generate types` should
not pay a React install cost. This is an implementation constraint on the
CLI plugin layout, not a product compromise.

## Code Organization In The Customer Repo

A typical customer repo after running `ttk ui add ...` for a few
primitives:

```text
my-game/
  tabletop.config.ts
  src/
    engine/
      ...                       # game logic authored by the customer/agent
    components/
      ui/                       # copied from @tabletop-kit/ui
        selectable.tsx
        token-pile.tsx
        card.tsx
        command-bar.tsx
      board/                    # game-specific composition
        gem-bank.tsx
        development-market.tsx
        noble-strip.tsx
    app.tsx
  package.json                  # depends on "@tabletop-kit/ui"
```

The `components/ui/` directory is owned by the customer once it is scaffolded.
The `@tabletop-kit/ui` npm package owns nothing in their tree except the import
target for hooks.

## State Management Stance

The library should not impose a global store like Redux. The engine already
owns the state machine; the client just renders the latest view. The
recommended pattern:

- `useGameState(selector)` reads slices from a small internal store fed by
  the WebSocket view stream
- ephemeral UI state (hover, drag, in-flight discovery picks) lives in the
  hooks that own it (e.g. `useDiscovery`) or in the component that owns it
- there is no encouraged pattern for game logic in the client — that
  belongs in the engine

This keeps the agent's job of "render this slice with these primitives"
mechanical: it never has to invent a state-management strategy.

## Open Questions

- **Registry location.** shadcn fetches component source from a hosted JSON
  registry. The first version of `ttk ui add` could read from a
  registry directory bundled into the npm package itself, avoiding a network
  hop. Decide before shipping.
- **Theming.** Splendor's CSS uses raw color tokens. The library should
  probably ship with a default token set that components reference, but
  whether that is a CSS variables file, a Tailwind preset, or both is
  unresolved.
- **Asset slots.** Cards and nobles have art. The component prop shape for
  art assets (URL? React node? slot prop?) needs a deliberate first answer
  so the agent does not have to invent one per game.
- **Update flow.** Once components are copied, fixing a bug in the canonical
  source is straightforward; propagating that fix to existing customer
  repos is not. shadcn's answer is "the user does it manually." We may want
  a `ttk ui diff` command that surfaces drift, but it is not
  required for v1.

## Recommendation

Build `@tabletop-kit/ui` as a single npm package that exposes hooks via normal
imports and ships component source through a `ttk ui add`
subcommand. Treat the hooks API as the stable, versioned surface and the
components as canonical-but-customer-owned source. Start the component
vocabulary from the patterns the Splendor example already needed, and grow
it only when a second game produces real demand.

This gives the future agent a small, learnable target to generate against,
gives designers code they can read and edit, and gives `tabletop-kernel` a
coherent end-to-end story from rulebook to playable digital game.
