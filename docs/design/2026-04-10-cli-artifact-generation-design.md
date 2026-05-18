# CLI Artifact Generation Design

## Summary

Add a new workspace package at `packages/cli` that turns runtime-authored game
metadata into generated developer artifacts.

The CLI package and command names should be:

- package: `@tabletop-kit/cli`
- command: `tt-kit`

The CLI exists to solve a structural limitation in the current engine:

- runtime metadata derived from `@field(...)`,
  `configureVisibility(...)`, progression stages, and command definitions is
  exact at runtime
- TypeScript cannot derive equally exact static helper types from decorator
  metadata alone

Rather than weakening the state-authoring DX or adding increasingly awkward
type-level approximations inside `tabletop-engine`, the workspace should provide
a dedicated generator package that loads a game definition and emits exact,
checked artifacts.

This CLI is a workspace tool, not part of the core runtime package.

## Goals

- keep the current colocated decorator-based game authoring model
- generate exact canonical and visible state types from engine-owned runtime
  metadata
- generate machine-readable schema and protocol artifacts from the same runtime
  source of truth
- generate a typed client SDK surface for hosted or frontend consumers
- provide validation commands for game definitions, snapshots, and generated
  artifacts

## Non-Goals

- replacing the `tabletop-engine` runtime package
- introducing a second handwritten schema source of truth
- requiring game packages to stop using decorators
- solving hosting, transport, auth, or deployment concerns

## Package Placement

The CLI should be implemented as a new workspace package:

- `packages/cli`

Reasons:

- it is a first-class workspace tool, not engine runtime logic
- it can depend on `tabletop-engine` internals without bloating the runtime
  package surface
- it can target any game package in the monorepo
- it can later be published independently if that becomes useful

The package name and command surface should follow the same separation:

- runtime library: `@tabletop-kit/engine`
- workspace CLI package: `@tabletop-kit/cli`
- workspace CLI command: `tt-kit`

The CLI package should depend on:

- `@tabletop-kit/engine`

It should reuse engine-owned compilation, schema, protocol, and validation
artifacts rather than reimplementing them independently.

## Package Structure

High-level package structure:

- `packages/cli/package.json`
- `packages/cli/tsconfig.json`
- `packages/cli/src/main.ts`
- `packages/cli/src/commands/`
- `packages/cli/src/lib/`

Suggested command files:

- `packages/cli/src/commands/generate-types.ts`
- `packages/cli/src/commands/generate-schemas.ts`
- `packages/cli/src/commands/generate-protocol.ts`
- `packages/cli/src/commands/generate-client-sdk.ts`
- `packages/cli/src/commands/validate.ts`

Suggested shared helpers:

- `packages/cli/src/lib/parse-args.ts`
- `packages/cli/src/lib/load-config.ts`
- `packages/cli/src/lib/write-output.ts`
- `packages/cli/src/lib/generation-context.ts`

The first version should use a small internal command router rather than an
external CLI framework.

## Core Model

The CLI loads a config file, reads one explicit built game definition, and
materializes artifacts from engine-owned runtime metadata.

The runtime metadata already exists today in forms such as:

- compiled canonical game schema
- compiled runtime schema
- compiled visible state schema
- command and discovery schemas
- stage definitions and command maps
- protocol descriptors

The CLI should treat those runtime artifacts as the source of truth and emit
developer-facing files from them.

## Primary Commands

The first version should support these command groups:

### 1. `generate types`

Generates exact TypeScript artifacts for a game package.

Expected outputs include:

- full canonical `{ game, runtime }` state type
- full visible `{ game, progression }` state type
- command input and discovery payload types when useful

This command exists primarily to remove manual types like
`examples/splendor/terminal/src/types.ts`.

### 2. `generate schemas`

Generates machine-readable schema artifacts for:

- full canonical state
- full visible state
- command payloads
- discovery payloads

These artifacts can later support validation tooling, frontend consumers, and
external services.

### 3. `generate protocol`

Generates protocol descriptor artifacts, including AsyncAPI-compatible outputs,
from the built game definition.

This is a materialized form of the protocol information the engine already
knows.

### 4. `generate client-sdk`

Generates a typed client SDK surface for a single game.

This should include:

- canonical and visible state types
- command request types
- discovery request and response types
- small helper wrappers for common hosted interaction patterns

The first version does not need to generate a transport implementation. It only
needs to generate the typed interface layer that a frontend or service can use.

### 5. `validate`

Validates a game definition and optionally external artifacts such as:

- snapshots
- replay records
- generated files

This command should reuse engine validation and generated schemas rather than
invent a second validation model.

## Inputs

The CLI should take a config file that provides one explicit built
`GameDefinition`.

High-level example:

```ts
// tabletop.config.ts
import { defineConfig } from "@tabletop-kit/engine/config";
import { createSplendorGame } from "./examples/splendor/engine/src/game";

export default defineConfig({
  game: createSplendorGame(),
  outDir: "./examples/splendor/engine/generated",
});
```

Then:

```bash
tt-kit generate types
tt-kit generate schemas
tt-kit generate client-sdk
tt-kit validate
```

If needed later, the CLI can support:

- `--config <path>`
- generation presets
- validation-specific inputs

## Outputs

Generated artifacts should live near the consuming game package, not inside the
engine package.

Suggested structure:

- `examples/splendor/engine/generated/`

Possible outputs:

- `canonical-state.generated.d.ts`
- `visible-state.generated.d.ts`
- `schemas.generated.json`
- `protocol.generated.json`
- `client-sdk.generated.ts`

The exact filenames can change, but generated outputs should be:

- deterministic
- easy to diff in PRs
- clearly machine-generated

## Generation Pipeline

High-level pipeline:

1. load the CLI config file
2. read the built game definition from config
3. read engine-owned compiled artifacts from the built game
4. transform those artifacts into the requested generated output
5. write generated files into the target output folder

The CLI should not ask game authors to restate schema information in a second
file.

## Type Generation Strategy

Type generation is the main reason this CLI exists.

The CLI should not rely on the in-engine helper types being exact enough. It
should instead emit concrete generated type definitions from the runtime schema
artifacts the engine already builds.

This solves several current problems at once:

- exact full canonical state type generation
- exact full visible state type generation
- removal of manual visible-state type authoring in example frontends
- avoidance of decorator-type reflection hacks in the engine itself

## Client SDK Strategy

The client SDK should be a typed consumer layer, not a network framework.

For the first version, the SDK should generate:

- state types
- command and discovery types
- typed envelopes for common hosted-style operations

It may later generate transport clients, but that should not block the initial
design.

This SDK generation is valuable because it creates a standard, engine-owned
frontend integration pattern for future games.

## Relationship To Engine Runtime

The CLI should reuse runtime artifacts already built by `tabletop-engine`
instead of reimplementing engine logic.

That means:

- the engine remains the authority on runtime semantics
- the CLI becomes the authority on materializing developer artifacts from those
  runtime semantics

This keeps responsibilities clean:

- `@tabletop-kit/engine`
  execution and metadata authority
- `packages/cli`
  generated artifact authority

## Existing Engine Surface To Remove

The engine previously carried awkward canonical helper types whose main purpose
was compensating for decorator metadata not being visible to TypeScript.

Those helpers:

- `CanonicalStateOf<TGame>`
- `CanonicalGameStateOf<TGame>`
- `CanonicalDataFromFacade<TFacade>`

should be treated as legacy cleanup targets and removed from the engine surface.

The intended direction is:

- local canonical inference should come directly from normal game/executor type
  flow
- generated `VisibleState` types and generated client SDKs remain valuable for
  client-facing workflows
- the CLI should not depend on those old in-engine canonical helper types

The runtime validation and schema compilation logic should stay in the engine.
Only the awkward static-type approximation layer should disappear.

## Future Expansion

The CLI can later grow to support:

- richer snapshot and replay validation
- generated frontend integration scaffolds
- AI-oriented artifact bundles for automated game consumers
- static docs or manifest generation

Those should build on the same artifact pipeline rather than introduce separate
metadata systems.
