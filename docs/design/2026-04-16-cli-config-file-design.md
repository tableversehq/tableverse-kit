# CLI Config File Design

## Summary

`ttk` should stop asking developers for a source file path that may or
may not export a game definition in the expected shape.

Instead, the CLI should require a TypeScript config file that explicitly gives
the CLI one concrete `GameDefinition`.

Recommended shape:

```ts
// tabletop.config.ts
import { defineConfig } from "@tabletop-kit/engine/config";
import { createSplendorGame } from "./examples/splendor/engine/src/game";

export default defineConfig({
  game: createSplendorGame(),
  outDir: "./examples/splendor/engine/generated",
});
```

This makes the CLI operate on an explicit built game definition rather than
trying to infer one from a module path and optional export name.

## Why The Current Direction Is Wrong

The current CLI design and implementation were built around:

- `--game <path>`
- optional `--export <name>`
- loading a module and guessing which export is the game definition

That model has several structural problems:

- it makes the CLI reason about source-file layout instead of game artifacts
- it introduces brittle export inference logic
- it forces the CLI to care about factory signatures
- it makes the developer restate something the code already knows: which game
  definition to use

The real artifact-generation boundary is not:

- "a file path that maybe exports a game"

It is:

- "one concrete built `GameDefinition`"

The CLI should reflect that directly.

## Goals

- require one explicit game definition for generation
- stop relying on file-path and export inference
- keep config simple for the common case
- leave expansion policy inside the game package
- make future CLI growth happen through config, not flag explosion

## Non-Goals

- adding an engine-level expansion system
- requiring the CLI to understand expansion combinations
- making the CLI responsible for composing multiple game variants

## Core Model

The config file should provide:

- one concrete `game`
- optionally one `outDir`

Recommended API:

```ts
import { defineConfig } from "@tabletop-kit/engine/config";
import { createMyGame } from "./src/game";

export default defineConfig({
  game: createMyGame(),
  outDir: "./generated",
});
```

The CLI should then:

1. load the config file
2. read the built `game`
3. generate artifacts from that game

This removes the need for:

- `--game`
- `--export`
- module export guessing logic as the main product surface

## Why A Single Game Definition Is Enough

Static artifact generation should operate on one stable game definition.

That includes:

- generated canonical types
- generated visible types
- generated schemas
- generated protocol artifacts
- generated client-facing type surfaces

These artifacts depend on the game definition shape, not on a concrete
session-initialization value.

For example, if a game accepts:

```ts
executor.createInitialState({ playerIds }, rngSeed);
```

the static shape of:

- `players: Record<string, PlayerState>`
- optional expansion fields
- command payloads
- visible-state envelopes

does not require a concrete `playerIds` value in order to be generated.

So the CLI should generate from the game definition alone.

## Expansion Direction

The CLI should not try to model expansions as a first-class concept.

Expansion choice should stay inside the game package.

That means:

- the game package exposes one concrete `GameDefinition`
- setup input can control whether expansion-specific state is populated
- static generation targets the stable superset shape of that game definition

Example:

```ts
class GameState {
  @field(t.optional(t.state(() => CitiesExpansionState)))
  cities?: CitiesExpansionState;

  @field(t.optional(t.state(() => LeadersExpansionState)))
  leaders?: LeadersExpansionState;
}
```

Base-only sessions can then leave:

- `cities`
- `leaders`

as `undefined`.

That is acceptable because the CLI is generating one stable static surface, not
trying to encode every runtime expansion combination as a separate artifact set.

## Config API

First version:

```ts
interface TabletopCliConfig {
  game: GameDefinition;
  outDir?: string;
}
```

and:

```ts
export function defineConfig(config: TabletopCliConfig): TabletopCliConfig;
```

This should stay intentionally small.

The CLI can later extend the config shape for:

- artifact selection presets
- package naming for generated SDKs
- formatting/output options
- validation inputs for snapshot or replay commands

But the starting point should remain:

- one concrete `game`
- one optional output directory

## CLI Usage

Recommended command model:

```bash
ttk generate types
ttk generate schemas
ttk generate protocol
ttk generate client-sdk
ttk validate
```

By default, the CLI should look for:

- `tabletop.config.ts`

Optionally, it can later support:

```bash
ttk generate types --config ./path/to/tabletop.config.ts
```

But the main user-facing model should be config-driven, not path-driven.

## Migration From The Current CLI

Current model:

```bash
ttk generate types --game examples/splendor/engine/src/game.ts
```

Target model:

```bash
ttk generate types
```

with:

```ts
// tabletop.config.ts
export default defineConfig({
  game: createSplendorGame(),
  outDir: "./examples/splendor/engine/generated",
});
```

This means the CLI should eventually remove or de-emphasize:

- `loadGame(...)` as a file/export inference mechanism
- `--game`
- `--export`

Those can remain temporarily as transition paths if needed, but they should no
longer be the primary product surface.

## Implementation Notes

This design implies a new helper package entrypoint, for example:

- `packages/tabletop-engine/src/config.ts`

or a published subpath equivalent:

- `@tabletop-kit/engine/config`

The CLI runtime should:

- load the config module
- read the default export
- validate that `config.game` is a built `GameDefinition`
- resolve `outDir` relative to the config file or current working directory

## Recommendation

Move `ttk` to a config-file-driven model.

The CLI should accept one concrete built game definition through
`tabletop.config.ts` and generate artifacts from that.

This is a better abstraction boundary than:

- source file path loading
- export inference
- factory signature guessing

and it keeps expansion decisions where they belong:

- inside the game package and its setup input model
