# tabletop-kit

## Purpose

`tabletop-kit` is the public open-source toolkit for building digital tabletop
and board-game implementations.

The repo currently contains the reusable rules/runtime engine, the generic CLI
tooling that can inspect game definitions and generate local artifacts, and
reference Splendor packages that exercise the engine in realistic consumers.

The intended public package family is:

- `@tabletop-kit/engine`
  transport-agnostic rules/runtime package
- `@tabletop-kit/cli`
  generic local developer tooling, installed with the `ttk` command
- `@tabletop-kit/ui`
  planned UI package for hooks and scaffolded components

## Platform Boundary

Tabletop Kit is separate from the future hosted product, Tabletop Lab.

Keep public, generic, reusable tooling in this repo. Hosted platform concerns
belong outside this repository, including auth, rooms, matchmaking,
deployment, upload flows, persistence products, billing, private hosted
protocols, and platform-targeted SDK generation.

The public CLI may provide generic commands such as:

```bash
ttk generate types
ttk generate schemas
ttk validate
```

Future platform commands such as `ttk lab deploy` should be implemented in
private Tabletop Lab-owned packages or through a command handoff mechanism.

## Implemented Runtime Surface

`@tabletop-kit/engine` currently supports:

- canonical `{ game, runtime }` state
- `GameDefinitionBuilder`
- `createGameExecutor(...)`
- command validation, execution, availability, and discovery
- deterministic RNG with persisted cursor state
- progression definition, normalization, and lifecycle hooks
- transactional execution against a cloned working state
- class-authored state facades via `GameState`, `@field(...)`, and `t`
- viewer-specific state projection through `getView(...)`
- visibility configuration through `configureVisibility(...)`, `hidden(...)`,
  and `visibleToSelf(...)`
- snapshots, replay helpers, and scenario-style test harness support
- config-file-driven artifact generation support through
  `@tabletop-kit/engine/config`

Protocol descriptors and AsyncAPI generation are no longer engine-owned public
runtime surface. Current generic generation logic lives in the CLI where it is
needed for local artifacts.

## Repo Layout

Important workspace areas:

- `packages/tabletop-engine`
  source for the published `@tabletop-kit/engine` package
- `packages/cli`
  source for the `@tabletop-kit/cli` package and `ttk` command
- `examples/splendor/engine`
  reference game package built on `@tabletop-kit/engine`
- `examples/splendor/terminal`
  terminal client for exercising command discovery and hosted-style gameplay
  locally
- `examples/splendor/server` and `examples/splendor/web`
  experimental hosted Splendor reference app
- `docs/design`
  current design decisions and historical design records

Inside the engine package:

- `src/runtime`
  command execution, progression orchestration, runtime events, transactions
- `src/state-facade`
  facade metadata, compilation, hydration, and visibility projection
- `src/schema`
  shared runtime schema API `t`

Inside the CLI package:

- `src/commands`
  `generate` and `validate` command implementations
- `src/lib`
  config loading, game descriptor extraction, rendering, argument parsing, and
  output helpers

## Current Architectural Direction

Prefer explicit engine semantics over framework magic.

That currently means:

- keep authoritative canonical state separate from viewer-facing visible state
- let games author logic against facade classes while the executor still
  persists plain canonical data
- keep execution deterministic and replayable
- colocate runtime schemas with the game code that owns them
- keep transport decisions outside the core runtime
- keep hosted platform details out of public packages
- treat examples as real consumer documentation, not throwaway code

## Current Non-Goals

Still out of scope for the public engine package:

- web framework integration
- auth, lobby, matchmaking, or hosting product decisions
- persistence product decisions
- UI rendering concerns
- deployment assumptions
- hosted protocol contracts or platform SDK generation

## Active Deferrals

The following are intentionally not complete yet:

- trigger engine
- stack / queue resolution model
- richer event-resolution model distinct from player-facing logs
- persistence adapters
- `@tabletop-kit/ui` package implementation
- private Tabletop Lab command handoff

## Guidance For Future Work

When editing this repo:

- preserve the public naming direction around `GameExecutor`, `GameEvent`,
  `GameState`, and the scoped `@tabletop-kit/*` package family
- avoid reintroducing vague low-level naming in the consumer-facing API
- keep the engine transport-agnostic even when adding tooling metadata
- prefer plain serializable outputs for hosted/client-facing data
- keep generic generation in `@tabletop-kit/cli`, not in the engine runtime
- keep platform-specific generation, deployment, auth, rooms, and persistence
  outside the public repo
- treat examples as real consumer documentation
- update design docs when architecture decisions change materially

## Verification

Common verification commands:

```bash
bun run lint
bunx tsc -b
bun test --cwd packages/tabletop-engine
bun test --cwd packages/cli
bun test --cwd examples/splendor/engine
bun test --cwd examples/splendor/terminal
```
