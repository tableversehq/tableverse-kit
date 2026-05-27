# Tabletop UI Stack And Onboarding

## Summary

This doc fixes the concrete shape of `@tabletop-kit/ui` v1: which CLI surface
ships it, where its registry lives, what stack it sits on (Tailwind, Radix,
dnd-kit, Sonner), how customers onboard, and how they customize.

It supersedes the implementation-level open questions in the
[2026-05-01 Tabletop UI Library Design](./2026-05-01-tabletop-ui-library-design.md),
which remains the authoritative doc for the library's _philosophy_ (hooks vs.
components split, why a UI library exists, the initial component vocabulary).
This doc is the authoritative one for _how it is built and shipped_.

It is intended to be detailed enough to serve as a system prompt for the
boardgame-implementation agent that will eventually consume Tabletop Kit.

## Context

The 2026-05-01 design fixed:

- `@tabletop-kit/ui` is a single hybrid npm package — hooks imported, components
  scaffolded into the customer's tree via `ttk ui add`.
- The component vocabulary starts at `Selectable`, `TokenPile`, `Card`, `Deck`,
  `Tile`, `PlayerArea`, `CommandBar`, `ActionList`.
- The package is bundled into the existing `ttk` CLI, not a separate one.

What it left open:

- Whether to port `shadcn/ui`'s CLI or build a minimal one.
- Whether to support multiple frameworks (Next, Astro, TanStack Start,
  React Router, Vite) or just one.
- Whether to use a hosted registry or a bundled one.
- Theming format (CSS variables, Tailwind preset, both).
- Which primitives library to wrap (Radix, Base UI, none).
- Drag-and-drop support.
- The customization model — edit copied source vs. wrap.

This doc closes all of those.

## Decision Summary

1. **Don't port shadcn's CLI.** Build a minimal `ttk ui` subcommand inside
   the existing `@tabletop-kit/cli`. Target ~500 LOC, not the ~30 files
   shadcn ships.
2. **Bundle the registry inside the `@tabletop-kit/ui` npm tarball.** No
   hosted registry, no network fetch. `ttk ui add` reads from
   `node_modules/@tabletop-kit/ui/registry/<name>.json`.
3. **Support exactly one scaffold: Vite + React + Tailwind v4.** Every other
   framework uses the manual install path documented in the website.
4. **Tailwind v4 is a hard requirement.** Ship a CSS-first preset; no JS
   Tailwind config required.
5. **Use Radix UI** for the small subset of registry entries that need
   accessible widget semantics (Dialog, Tooltip, Popover, DropdownMenu,
   ScrollArea). **Do not use Base UI.** **Use Sonner** for toasts.
6. **dnd-kit is opt-in per component.** Only drag-aware registry entries
   list it as a dep. Selection and drag are two input modalities for the
   same `useDiscovery` state machine.
7. **Customization model: edit copied source for visual changes, build new
   components for game-specific composition, never wrap to preset props.**
8. **`@tabletop-kit/ui` is a framework half, not an independent library.**
   The hooks layer is intentionally coupled to `@tabletop-kit/engine`; the
   components layer is intentionally decoupled. See the
   [framework boundary section](#framework-boundary) below.

## Framework Boundary

Tabletop Kit is structured and marketed as a framework. The engine and the
hooks layer of the UI library are not independent things; they are two
halves of one framework, joined at the `TTKitClient<G>` interface defined
in the [2026-05-19 hooks design](./2026-05-19-tabletop-ui-hooks-design.md).

The framework decision is recorded in full in the
[2026-05-19 Tabletop Kit As Framework](./2026-05-19-tabletop-kit-as-framework.md)
doc. The short version:

- **Engine + hooks are coupled.** The hooks read engine views, drive the
  engine's discovery state machine, and consume the engine's event stream.
  Their value comes from being engine-aware; decoupling them would strip
  that value.
- **Components are decoupled.** They take props (`state`, `onClick`) and
  render markup. They do not import the engine, the hooks, or
  `TTKitClient`. A customer can use the components with their own state
  source by authoring hooks that return the same prop shapes.
- **The `TTKitClient<G>` interface is engine-shaped but
  hand-implementable.** In-process, Tabletop Lab codegen, and custom
  customer transports all target the same interface.

This boundary informs a few things in this doc:

- `@tabletop-kit/ui` is allowed (encouraged) to import engine types from
  `@tabletop-kit/engine`. This is not a violation of any abstraction.
- Components in the registry must remain prop-driven. A component that
  imports `useGameState` or `useDiscovery` directly is a smell —
  game-specific composition belongs in the customer's
  `components/board/` directory, not in the registry.
- The customization model below ("edit copied source") applies only to
  components. Hooks are versioned API surface and must not be patched in
  the customer's tree.

## CLI Surface

The CLI lives in `packages/cli` and is exposed by the existing `ttk`
binary. New subcommands:

```bash
ttk ui init                     # bootstrap UI in an existing project
ttk ui add <component>...       # copy component source into the tree
ttk ui list                     # list available components
ttk ui diff [component]         # (deferred) show drift vs. registry source
```

### `ttk ui init`

Runs inside any existing React + Vite repo (or any repo where Tailwind v4 can
be installed). It:

1. Installs `@tabletop-kit/ui`, `tailwindcss@^4`, and the React peer deps if
   missing.
2. Writes `tabletop-ui.json` to the project root with:
   - `componentsDir` (default `src/components/ui`)
   - `boardComponentsDir` (default `src/components/board`)
   - `alias` (default `@/components/ui`)
   - `cssEntry` (default `src/index.css`)
   - `iconLibrary` (default `lucide-react`)
3. Prepends two `@import` lines to `cssEntry`:

   ```css
   @import "@tabletop-kit/ui/styles/preset.css";
   @import "@tabletop-kit/ui/styles/tokens.css";
   ```

4. Creates an empty `src/styles/theme.css` for the user's per-game token
   overrides and adds an `@import` for it after the two preset imports.
5. Prints next-step instructions, including the manual-install fallback for
   non-Vite setups.

`init` must be idempotent. Re-running it on an already-initialized project
should produce no diff.

### `ttk ui add <component>`

1. Resolves the component name against
   `node_modules/@tabletop-kit/ui/registry/<name>.json`.
2. Recursively resolves and installs `registryDependencies` first.
3. Writes every `files[].content` to `<componentsDir>/<file>`.
4. Runs `bun add` (or detected package manager) for every package listed in
   `dependencies`.
5. Prints a summary listing files created and packages installed.

If a target file already exists, prompt for overwrite unless `--yes` is
passed. Never silently overwrite customer-edited source.

### `ttk ui list`

Reads every JSON file in `node_modules/@tabletop-kit/ui/registry/` and prints
name, description, and category. Used by humans for discovery and by the
agent for capability planning.

### Lazy loading

The `ui` subcommand's dependencies (React-aware parsing, file scaffolding)
must be lazy-loaded so users running `ttk generate types` on a
non-React project pay no React install cost. This is an implementation
constraint on `packages/cli/src/commands/ui/`, not a product compromise.

## Registry Storage

The registry is bundled into the `@tabletop-kit/ui` npm package. There is no
hosted registry, no `REGISTRY_URL`, no auth flow.

### Source layout in `packages/ui`

```text
packages/ui/
  src/
    hooks/
      use-game-state.ts
      use-selectable.ts
      use-discovery.ts
      use-active-command.ts
      use-drag-source.ts             # plumbs dnd-kit into useDiscovery
      use-drop-target.ts
    index.ts                          # re-exports hooks only
  styles/
    tokens.css                        # CSS variables
    preset.css                        # @import "tailwindcss" + @theme + keyframes
  registry-source/                    # canonical .tsx component source
    selectable.tsx
    token-pile.tsx
    card.tsx
    deck.tsx
    tile.tsx
    player-area.tsx
    command-bar.tsx
    action-list.tsx
    draggable.tsx
    drop-zone.tsx
    hand.tsx
    board-slot.tsx
  registry-meta/                      # one JSON per component
    selectable.json
    token-pile.json
    ...
  scripts/
    build-registry.ts                 # emits dist/registry/<name>.json
  dist/                               # built artifacts (gitignored)
    index.js                          # hooks build
    index.d.ts
    registry/
      selectable.json
      ...
    styles/
      tokens.css
      preset.css
```

### Registry JSON schema

Each `registry-meta/<name>.json` is hand-authored and looks like:

```json
{
  "name": "card",
  "description": "Face-up card with art, cost ribbon, and selectable state.",
  "category": "game-primitive",
  "type": "registry:ui",
  "dependencies": ["@radix-ui/react-tooltip"],
  "registryDependencies": ["selectable"],
  "files": [{ "source": "card.tsx", "target": "card.tsx" }]
}
```

The build script reads the source file referenced by each `files[].source`,
inlines its contents under `files[].content`, and emits the merged JSON to
`dist/registry/<name>.json`. The CLI never reads from `registry-source/` or
`registry-meta/` at runtime; only `dist/registry/`.

### Categories

- `game-primitive` — `Selectable`, `TokenPile`, `Card`, `Deck`, `Tile`,
  `PlayerArea`. Bespoke; no Radix or dnd-kit dependency.
- `ui-chrome` — `CommandBar`, `ActionList`, `Tooltip` wrappers, `Toast`
  wrappers. Use Radix and Sonner.
- `interaction` — `Draggable`, `DropZone`, `Hand`, `BoardSlot`. Use dnd-kit.

The agent should reach for `game-primitive` entries by default and only use
`interaction` entries when the rulebook genuinely calls for drag gestures.

## Stack Choices

### Tailwind v4 (hard requirement)

- Declare `"tailwindcss": "^4"` in `peerDependencies`. v3 must produce a
  clear error, not silent breakage.
- Ship `styles/preset.css` containing `@import "tailwindcss"`, the `@theme`
  block extending Tailwind with our color/animation tokens, all keyframes,
  and any `@utility` definitions.
- Ship `styles/tokens.css` containing CSS variables only. Customers
  override variables in their own stylesheet (`src/styles/theme.css`) to
  reskin a game; they do not edit `tokens.css` or `preset.css`.
- All animation keyframes live in `preset.css`. Copied components reference
  them by utility class (e.g. `animate-tt-breathe`). Never define
  `@keyframes` inside a copied component file — that produces duplicate
  definitions across components.
- Ship a minimal default palette: grayscale plus one neutral accent. Games
  define their own palette in `theme.css`. Do not ship per-game palettes.

There is no "Tailwind optional" mode. Headless + styled is 2× maintenance
for a hypothetical audience. Customers on stacks that cannot use Tailwind v4
are not supported in v1.

### Radix UI (selective)

Used only on components that need accessible widget semantics. One Radix
peer dep per registry entry that needs it; never a blanket import.

| Component       | Radix package                                          |
| --------------- | ------------------------------------------------------ |
| `CommandBar`    | `@radix-ui/react-alert-dialog` (confirm modal variant) |
| `ActionList`    | `@radix-ui/react-dropdown-menu`                        |
| `Card` (hover)  | `@radix-ui/react-tooltip`                              |
| `Tile` (reveal) | `@radix-ui/react-popover`                              |
| `Hand`          | `@radix-ui/react-scroll-area`                          |

Do not introduce Base UI alongside Radix. Two focus-management
implementations in one tree is the failure mode to avoid. Reconsider in
2027 if a specific Radix limitation forces it.

Game primitives (`Selectable`, `TokenPile`, `Card`'s body, `Deck`, `Tile`'s
body, `PlayerArea`) are bespoke. Radix has no primitive for any of them and
wrapping them in `<Primitive.Root>`/`<Primitive.Item>` ceremony adds API
surface without buying accessibility.

### Sonner (for toasts)

Toasts live in `Toast` / `ToastViewport` registry entries that wrap
`sonner`. shadcn already moved to Sonner; the agent's training data is
likely to assume it.

### dnd-kit (opt-in per component)

- Use `@dnd-kit/core` and `@dnd-kit/sortable` (the stable line). Do not
  adopt `@dnd-kit/react` (the rewrite) in v1 — it is still moving.
- Only drag-aware registry entries (`Draggable`, `DropZone`, `Hand`,
  `BoardSlot`) list dnd-kit as a dep. Customers who only build click-driven
  games install zero dnd-kit bytes.
- Wire `KeyboardSensor` on by default in every drag-aware registry
  component. Keyboard playability is a non-negotiable differentiator.
- The agent defaults to click-based selection. It reaches for drag-aware
  components only when the rulebook says "place" or "drag" — Carcassonne
  tile placement, drafting games, deckbuilders with card-to-play-area
  motion. Splendor stays click-only.

### Hooks-side integration

dnd-kit components must not commit picks directly to dnd-kit state. They
must go through the same discovery hooks as `Selectable`:

```ts
useDiscovery()
  -> low-level: commitPick(slot, target), cancel(), confirm()

useSelectable(slot, target)
  -> click adapter; calls commitPick on click

useDragSource(target) + useDropTarget(slot)
  -> drag adapter; calls commitPick on successful drop
```

Two input adapters, one state machine. A game where the user can both
click-to-pick _and_ drag-to-pick should produce identical commands either
way.

## Onboarding Paths

### Path 1 — Existing project (primary)

```bash
cd my-game
bun add @tabletop-kit/cli @tabletop-kit/ui
bunx ttk ui init
bunx ttk ui add card token-pile command-bar
```

Works in any React + Vite repo. The `init` step writes `tabletop-ui.json`,
appends the two CSS imports, installs Tailwind v4 if missing.

### Path 2 — New project (phase 2, deferred)

```bash
bun create @tabletop-kit/app my-game
```

Clones one canonical Vite + React + Tailwind v4 + Tabletop Kit Engine
template from `packages/create-app/template/`. Internally runs
`ttk ui init`. Do not build this until paths 1 and the manual-install
docs are stable.

### Path 3 — Manual install

A documentation page listing exactly what `ttk ui init` does, plus a
"copy the source" link per component. This is the escape hatch for users
on Next, Astro, TanStack Start, React Router, or any other framework.

The manual-install page is also the **agent's reference**: when generating
code for a non-Vite stack, the agent consults this page to know what files
to write and what deps to add.

### Frameworks explicitly not scaffolded in v1

Next, Astro, TanStack Start, React Router, Laravel, Remix. They all work
via the manual-install path. Add a dedicated scaffold only when a real
customer asks. No speculative scaffolding.

## Customization Model

The customer owns every file under `<componentsDir>` after it is
scaffolded. The library owns nothing in their tree except the import
target for hooks and the CSS files imported from `node_modules`.

### Hard rule: hooks are not customer-owned

`@tabletop-kit/ui`'s exported hooks (`useGameState`, `useSelectable`,
`useDiscovery`, `useActiveCommand`, `useDragSource`, `useDropTarget`) are
versioned API surface. Customers must not patch them. Bug fixes to hooks
propagate via `bun update @tabletop-kit/ui`.

The agent should never reach for monkey-patching a hook. If a hook is
wrong, the fix lands in `packages/ui/src/hooks/`, not in the customer's
tree.

### Edit copied source when changing what a primitive _is_

- Splendor's `Card` becomes a square gem-cost card with a ribbon → edit
  `src/components/ui/card.tsx`.
- Wingspan's `Card` becomes a wide bird card with a food slot → edit
  `src/components/ui/card.tsx`.
- `TokenPile` becomes a hex grid instead of a stack → edit
  `src/components/ui/token-pile.tsx`.

Visual changes go in the copied file. Tailwind classes, JSX structure,
art slots, layout — all fair game. The discovery state machine cannot
break because it does not live in the component file.

### Build a new component for game-specific composition

Compositions of primitives belong in a separate directory:

```text
src/components/
  ui/                  # copied from @tabletop-kit/ui — edited freely
    card.tsx
    token-pile.tsx
    deck.tsx
  board/               # game-specific composition — new files
    development-market.tsx     # 3×4 grid of Cards with a Deck
    noble-strip.tsx            # row of Tiles
    gem-bank.tsx               # five TokenPiles in Splendor color order
```

`board/` components import from `ui/`. The agent generates `board/`
components per game; it never duplicates `ui/` source under a renamed
file.

### Do not wrap purely to preset props

If every `Card` in your game needs `variant="parchment"` and
`art={…}`, change the default in the copied `card.tsx`. A
`PreSetCard` wrapper is pure indirection.

### Exception: same primitive used differently in one tree

A single repo rendering five mini-games each with a distinct `Card`
style cannot edit one shared `card.tsx`. In that case, wrap the copied
primitive per game. This is rare; default to edit-source.

### Updates after editing

Most upstream fixes are hook fixes, which propagate via `bun update`
without touching the customer's tree. Component-source bug fixes
require manual rebase. `ttk ui diff` (deferred) will surface drift;
until then, manual rebase is the answer — matching shadcn's posture.

## Build Order

Implement in this order. Do not start step _n_ until step _n-1_ lands.

1. **Hooks skeleton.** `packages/ui/src/hooks/` with `useGameState`,
   `useSelectable`, `useDiscovery`, `useActiveCommand`. Pure logic, no
   rendering, no registry. Lets the API stabilize independent of the
   CLI work.
2. **Registry build script.** `bun run build:registry` reads
   `registry-source/` and `registry-meta/`, emits
   `dist/registry/<name>.json`. Add to `prepublishOnly`.
3. **`ttk ui init` and `ttk ui add`.** New `packages/cli/src/commands/ui/`
   directory. Lazy-loaded.
4. **First three components.** `Selectable`, `TokenPile`, `CommandBar`.
   These cover the discovery/confirmation pattern Splendor needs.
5. **Port Splendor web** in `examples/splendor/web` to consume the new
   components. This is the validation step. If porting needs a primitive
   that does not exist yet, that primitive is the next thing to add.
6. **`useDragSource`/`useDropTarget` hooks + `Draggable`/`Hand`** components.
   Validate against a second example game that genuinely needs drag.
7. **`bun create @tabletop-kit/app` template.** Only after steps 1–6 are
   stable. Skip this for v1 if not needed.

## Non-Goals

The following are explicitly out of scope for v1:

- Multi-framework scaffolds (Next, Astro, TanStack Start, React Router,
  Laravel).
- Hosted registry / `REGISTRY_URL` / OAuth.
- MCP server inside `ttk ui`. The agent calls the CLI as a shell
  command in v1.
- Multiple style packs (shadcn ships `new-york` and `default`). One
  canonical style; per-game customization happens in copied source.
- Theme presets beyond a single default token set.
- `ttk ui diff` / drift detection.
- Asset pipeline. Card art, token sprites, board images — out of scope.
- Animation system beyond Tailwind keyframes.
- Sound, music, asset preloading.

## Open Questions

These are deliberate deferrals; resolve before they block work.

- **Asset slot shape.** Cards and nobles take art. Whether the prop is a
  URL, a React node, or a slot prop is unresolved. The first concrete
  use in the Splendor port is the forcing function.
- **Hand layout primitive.** Fan-out vs. linear vs. stacked is unresolved.
  Pick after a second game with a meaningful hand zone.
- **Hidden information primitive.** Peek-at-own-card and reveal-on-event
  flows need a shared primitive. Shape unresolved until two games need it.
- **Animation policy for state transitions.** Card flips, token movement,
  pile collapse. Out of scope for v1, but the agent will eventually
  generate them and we should decide where they live (hook? component?
  CSS-only?).

## Consequences

- `packages/ui` becomes a real package with hooks, CSS, registry source,
  and a build script. The current empty scaffold is replaced.
- `packages/cli` grows a `ui/` command directory with lazy-loaded
  React-aware code paths.
- The `@tabletop-kit/ui` published tarball must include `dist/index.js`,
  `dist/index.d.ts`, `dist/registry/*.json`, and `dist/styles/*.css`.
  Confirm `files` in `package.json` covers all four.
- Splendor web (`examples/splendor/web`) is the v1 reference consumer.
  Treat it as documentation: regressions there are blocking for v1.
- `tabletop-ui.json` is the v1 customer-side config file. It is owned by
  the customer; the CLI reads it, never overwrites it after `init`.
- The agent's future system prompt should embed the _Customization Model_
  and _Stack Choices_ sections of this doc verbatim. The build order and
  open questions are for human implementers and should not be in the
  agent's prompt.
