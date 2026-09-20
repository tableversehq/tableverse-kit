# tableverse-kit

Context for an agent working in this repo: what the project is, where its
boundaries are, how the packages fit together, and how to build and verify it.
This file is the single source of truth for that context.

## What this is

`tableverse-kit` is the public, open-source game-authoring SDK for **Tableverse**
(the hosted product). It ships the authoring surface only: you model game state,
define and execute player commands, project hidden information, and hand
Tableverse a single `GameExecutor`. The repo is public so customers can inspect
exactly how their game executes.

The boundary between this repo and the platform is the **`GameExecutor`**. This
repo owns everything needed to author a game and produce that executor.
Tableverse owns everything downstream of it — transport, HTTP/WebSocket servers,
rooms, matchmaking, auth, persistence, deployment, hosting, billing. Those are
not features we're declining to build yet; they are out of charter.

Bring-your-own-server / transport-agnostic usage is **not** a supported path. A
`GameExecutor` is plain enough that a determined user could drive it from their
own transport, but the repo does not document or build toward that.

## Packages

Workspaces are `packages/*` (see `pnpm-workspace.yaml`). Cross-package deps use
`workspace:*`.

Published `@tableverse-kit/*` family:

- **`engine`** (`packages/engine`) — the rules/runtime core. Compiles a game
  definition into a `GameExecutor`. Runtime-agnostic and portable: it runs
  inside the platform's `isolated-vm` sandbox, so it must not depend on
  `@types/node` or any Node/Bun globals. Single entry (`.`); the former
  `engine/config` subpath is gone — publish config now lives in the `config`
  package.
- **`cli`** (`packages/cli`) — the `tvk` command. Local authoring plus the
  platform handoff: `validate`, `dev` (local rules server and frontend), `login` / `logout` /
  `whoami` (platform auth), and `upload` (publish source to Tableverse).
- **`client`** (`packages/client`) — the renderer-agnostic `TableverseClient`
  interface and the `GameShapeOf` type machinery that derives a game's
  view/command/discovery/event shapes from its `GameExecutor`.
  `createTableverseClient` connects a top-level local frontend to `tvk dev` and
  an embedded published frontend to its Tableverse host. The connection choice
  stays inside the package. Thin React hooks (`client/react`) are deferred.
- **`config`** (`packages/config`) — the publish-config contract shared by the
  CLI and platform: `PublishConfig` with an `engine` half (source `root` the
  platform builds into the sandbox bundle) and a `frontend` half (`root`,
  `buildCommand`, `outDir` the platform builds and serves). Both halves are
  source — nothing points at a compiled artifact.
- **`create`** (`packages/create`) — the `create-tableverse` scaffolder.
  `templates/` ships **verbatim** to the generated project (it's in
  `.prettierignore`; formatting it would rewrite emitted files and break
  `{{token}}` placeholders).
- **`docs`** (`packages/docs`) — the Mintlify docs site (`@tableverse-kit/docs`,
  private). MDX pages + `docs.json`. The `mint` CLI is **not** a workspace dep
  (install globally: `npm i -g mint`). MDX is `.prettierignore`d — Prettier
  corrupts fenced code inside Mintlify components. See `packages/docs/AGENTS.md`.

A generated project is the reference consumer layout: `create-tableverse`
scaffolds the project root (CLI and config ownership, publish settings), an
engine workspace, and a client workspace. `packages/create/templates/default` is
that layout in source form.

## Toolchain

Develop and test on the runtime we ship to: **Node.js**, managed with **pnpm
workspaces**.

- **Package manager: pnpm.** Use `pnpm install`, `pnpm run <script>`,
  `pnpm -C <pkg> <script>`, `pnpm -r <script>`, `pnpm exec <bin>`,
  `pnpm dlx <pkg>`. Stick to pnpm; workspaces are declared in
  `pnpm-workspace.yaml` and cross-package deps use the `workspace:*` protocol.
- **Runtime: Node via `tsx`.** Run/watch TypeScript with `tsx <file>` /
  `tsx watch <file>`. The engine's state-authoring facade (`GameState`,
  `@field(...)`) uses **legacy decorators** (`experimentalDecorators` in
  `tsconfig.json`); `tsx` (esbuild) transpiles them, and bare `node`
  type-stripping leaves them in place, so run through `tsx`.
- **Tests: Vitest.** `pnpm test` runs every package; a single package runs
  `vitest run`. Import test APIs from `vitest`
  (`import { describe, it, test, expect } from "vitest"`). Vitest (esbuild)
  honors `experimentalDecorators`, so decorator-based tests work unchanged.
- **Typecheck:** `pnpm exec tsc -b` (project references) or `pnpm -r typecheck`.
- **Lint / format:** `pnpm lint` (ESLint) and `pnpm format` (Prettier), wired
  through Husky + lint-staged on commit.

## Conventions

- Keep `@tableverse-kit/engine` runtime-agnostic and portable — free of Node- or
  Bun-specific globals. It runs inside the platform's `isolated-vm` sandbox
  (a stricter bar than Node), so it stays off `@types/node`. Packages that
  genuinely need Node globals (`cli`, `client`, `terminal`) depend on
  `@types/node` explicitly.
- Prefer standard/Node APIs over runtime-specific ones: `node:crypto`,
  `node:fs`, `fileURLToPath(new URL(".", import.meta.url))` for the current
  directory, and `process.argv[1] === fileURLToPath(import.meta.url)` for the
  "run as main" check.
- **Avoid casting; treat an unavoidable cast as a bug in a dependency.** Type
  assertions (`as`, and especially `as unknown as`) silence the compiler rather
  than satisfy it, so a later change in the thing being cast breaks the code
  silently. Reach for a cast only when there is genuinely no typed path — and
  when you must, recognize that the need is usually a design issue in the code
  being depended on (a missing overload, an unexported type, a signature that
  doesn't accept the value you have). Prefer fixing that underlying type surface
  over papering it with a cast at the call site.
- **Comments are a last resort, not a default.** They drift out of sync with the
  code and mislead both humans and agents; self-explanatory code (clear names,
  small functions, expressive types) is the goal. Reserve a comment for the rare
  thing code cannot express — a non-obvious _why_, a subtle constraint. In
  particular, **do not document behavior on an interface** (e.g. "rejects with
  `X`", "fires on every change"): an interface only constrains types, an
  implementation is free to diverge from the prose, and the comment silently
  becomes a lie.
- **Write affirmatively, for a reader with no memory of past designs.** This
  covers customer-facing docs and code comments alike. Describe what a thing is
  and does right now, and state it directly. Skip definition-by-contrast with an
  earlier or alternative design ("X is not Y", "no longer", "instead of the old
  …", "formerly", "renamed from"): a negation presupposes the reader already
  holds the idea it corrects, and the reader holds none. Prefer "the roster
  arrives as `players`" over "the roster is not setup input".

## Engine internals (`packages/engine/src`)

- `runtime/` — command execution, progression orchestration, runtime events,
  transactional execution against a cloned working state.
- `state/`, `state-facade/` — canonical `{ game, runtime }` state, and the
  class-authored facade (`GameState`, `@field(...)`, `t`) with hydration and
  viewer-specific visibility projection (`getView`, `configureVisibility`,
  `hidden`, `visibleToSelf`).
- `schema/` — the shared runtime schema API `t` (TypeBox-backed).
- `rng/` — deterministic RNG with persisted cursor state.
- `snapshot/`, `replay/`, `testing/` — snapshots, replay helpers, and
  scenario-style test harness support.
- `command-factory.ts`, `stage-factory.ts`, `game-definition.ts` — the
  `GameDefinitionBuilder` / `createGameExecutor` authoring entry points.

## CLI internals (`packages/cli/src`)

- `commands/` — `dev`, `validate`, `upload`, `login`, `logout`, `whoami`.
- `lib/` — config loading, game-descriptor extraction, generation context,
  packaging/upload, platform + auth clients, dev server, arg parsing, output
  helpers. Keep generic generation logic here, not in the engine runtime.
- `shell/` (sibling of `src/`) — the `tvk dev` developer shell, a React +
  Tailwind + shadcn app styled after platform-web. `pnpm -C packages/cli
build:shell` builds it into `dist/shell/`, which the rules server serves and
  the package publishes; `prepack` builds and verifies it. Build it before
  running `tvk dev` from this repo. Its logic lives in `shell/src/lib/` as plain
  TypeScript tested in Node.

## Architectural direction

- Prefer explicit engine semantics over framework magic.
- Keep authoritative canonical state separate from viewer-facing visible state;
  games author against facade classes while the executor persists plain
  canonical data.
- Keep execution deterministic and replayable.
- The engine's output is a `GameExecutor`; transport and hosting live in
  Tableverse, not here. Keep hosted-platform details out of public packages.
- Prefer plain serializable outputs for hosted/client-facing data.
- Preserve the public naming direction (`GameExecutor`, `GameEvent`,
  `GameState`, the scoped `@tableverse-kit/*` family); avoid reintroducing
  vague low-level naming in the consumer API.

## Non-goals and deferrals

Out of charter (platform's job): transport, web-framework integration, auth,
lobby/matchmaking, persistence products, UI rendering, deployment, hosted
protocol contracts, platform SDK generation.

Deferred (not yet built): trigger engine; stack/queue resolution model; richer
event-resolution model distinct from player-facing logs; persistence adapters;
`client/react` hooks; private platform command handoff.

When an architecture decision changes materially, update the design docs in
`docs/design/` (dated `YYYY-MM-DD-*.md`).

## Verification

```bash
pnpm install
pnpm exec tsc -b
pnpm lint
pnpm test                 # every package, via Vitest
```
