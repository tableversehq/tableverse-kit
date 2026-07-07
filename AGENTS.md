# tableverse-kit

## Purpose

`tableverse-kit` is the public open-source game-authoring SDK for Tableverse.

It ships the authoring surface only: you model game state, define and execute
player commands, and project hidden information, then hand Tableverse a single
`GameExecutor`. Everything downstream of that executor — transport, HTTP/
WebSocket servers, rooms, matchmaking, persistence, deployment, hosting — is
Tableverse's job and is out of scope for this repo.

The repo is open and public so customers can inspect exactly how their game
executes and give feedback on the authoring surface. Requests aimed at transport
or standalone hosting are intentionally out of charter, not features we are
declining to build yet.

The repo currently contains the rules/runtime engine, the CLI tooling that
inspects game definitions and generates local artifacts, and reference Splendor
packages that exercise the engine in realistic consumers.

The intended public package family is:

- `@tableverse-kit/engine`
  rules/runtime package that compiles a game into a `GameExecutor`
- `@tableverse-kit/cli`
  local authoring tooling, installed with the `tvk` command
- `@tableverse-kit/client`
  the frontend client. Its React-free root (`@tableverse-kit/client`) ships the
  renderer-agnostic `TableverseClient`, the in-process adapter, and the
  interaction state machine — consumable directly by canvas/WebGL/WASM
  frontends. Thin React hooks live in the optional `@tableverse-kit/client/react`
  entry (`react` is an optional peer dependency). Renamed from the former
  `@tableverse-kit/ui`; the previously planned shadcn-style styled/copy-in
  component kit is cancelled — see
  `docs/design/2026-07-05-frontend-runtime-agnostic-client.md`.

## Platform Boundary

Tableverse Kit is the authoring layer for the hosted product, Tableverse. The
boundary between them is the `GameExecutor`: this repo owns everything needed to
author a game and produce that executor; Tableverse owns everything downstream
of it.

Keep authoring tooling in this repo. Hosting and platform concerns belong to
Tableverse and stay out of this repository, including transport, HTTP/WebSocket
servers, auth, rooms, matchmaking, deployment, upload flows, persistence
products, billing, private hosted protocols, and platform-targeted SDK
generation.

We no longer target transport-agnostic, bring-your-own-server usage as a
supported feature. A `GameExecutor` is plain enough that a determined user can
drive it from their own transport, but that is not a path this repo supports,
documents, or builds toward.

The public CLI may provide authoring commands such as:

```bash
tvk generate types
tvk generate schemas
tvk validate
```

Future platform commands such as `tvk lab deploy` should be implemented in
private Tableverse-owned packages or through a command handoff mechanism.

## Implemented Runtime Surface

`@tableverse-kit/engine` currently supports:

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
  `@tableverse-kit/engine/config`

Protocol descriptors and AsyncAPI generation are no longer engine-owned public
runtime surface. Current generic generation logic lives in the CLI where it is
needed for local artifacts.

## Repo Layout

Important workspace areas:

- `packages/engine`
  source for the published `@tableverse-kit/engine` package
- `packages/cli`
  source for the `@tableverse-kit/cli` package and `tvk` command
- `examples/splendor/engine`
  reference game package built on `@tableverse-kit/engine`
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
- the engine's output is a `GameExecutor`; transport and hosting live in
  Tableverse, not here
- keep hosted platform details out of public packages
- treat examples as real consumer documentation, not throwaway code

## Current Non-Goals

Still out of scope for the public engine package:

- transport-agnostic / bring-your-own-server integration as a supported feature
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
- `@tableverse-kit/client/react` hooks implementation (thin React binding over
  the framework-neutral client; no styled component kit)
- private Tabletop Lab command handoff

## Guidance For Future Work

When editing this repo:

- preserve the public naming direction around `GameExecutor`, `GameEvent`,
  `GameState`, and the scoped `@tableverse-kit/*` package family
- avoid reintroducing vague low-level naming in the consumer-facing API
- the supported contract is the `GameExecutor` handed to Tableverse; keep
  transport out of the engine, but do not build toward bring-your-own-transport
  as a supported path
- prefer plain serializable outputs for hosted/client-facing data
- keep generic generation in `@tableverse-kit/cli`, not in the engine runtime
- keep platform-specific generation, deployment, auth, rooms, and persistence
  outside the public repo
- treat examples as real consumer documentation
- update design docs when architecture decisions change materially

## Verification

Common verification commands:

```bash
bun run lint
bunx tsc -b
bun test --cwd packages/engine
bun test --cwd packages/cli
bun test --cwd examples/splendor/engine
bun test --cwd examples/splendor/terminal
```
