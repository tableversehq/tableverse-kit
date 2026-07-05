# Tableverse Kit

Open-source TypeScript toolkit for authoring digital tabletop and board-game
implementations that run on [Tableverse](https://github.com/tableversehq).

Tableverse Kit helps you model game state, validate and execute player commands,
project hidden information per viewer, and generate local TypeScript and schema
artifacts from your game definition.

You author your rules and hand Tableverse a single `GameExecutor` — that is the
whole entrypoint to your game's backend. Tableverse hosts the game and runs the
servers, transport, rooms, and persistence for you, so you never wire up an HTTP
or WebSocket server yourself. (The engine stays plain enough that you _can_ drive
a `GameExecutor` from your own transport, but that is no longer a supported,
first-class path.)

## Packages

- [`@tableverse-kit/engine`](./packages/engine)
  rules/runtime engine that compiles your game into a `GameExecutor` for Tableverse
- [`@tableverse-kit/cli`](./packages/cli)
  local tooling package that installs the `tvk` command
- `@tableverse-kit/ui`
  planned UI package for reusable hooks and scaffolded components

## Install

```bash
bun add @tableverse-kit/engine
bun add -d @tableverse-kit/cli
```

or:

```bash
npm install @tableverse-kit/engine
npm install --save-dev @tableverse-kit/cli
```

## Engine

`@tableverse-kit/engine` provides the runtime building blocks for a board-game
rules package:

- `GameDefinitionBuilder`
- `createGameExecutor(...)`
- command validation, execution, availability, and discovery
- stage/progression lifecycle orchestration
- deterministic RNG
- explicit state definitions with `defineGameState(...)`, plain state classes,
  and `t`
- hidden-information projection with `getView(...)`
- visibility configuration through the state builder
- snapshots, replay helpers, and scenario testing

Example state definition:

```ts
import { defineGameState, t } from "@tableverse-kit/engine";

class CounterState {
  value = 0;

  increment() {
    this.value += 1;
  }
}

const Counter = defineGameState()
  .model({
    value: t.number(),
  })
  .stateClass(CounterState)
  .build();
```

## CLI

`@tableverse-kit/cli` installs the `tvk` command.

```bash
tvk generate types
tvk generate schemas
tvk generate client-sdk
tvk validate
```

The CLI reads `tableverse.config.ts` from your project:

```ts
import { defineConfig } from "@tableverse-kit/engine/config";
import { createGame } from "./src/game";

export default defineConfig({
  game: createGame(),
  outDir: "./generated",
});
```

## Examples

- [`examples/splendor/engine`](./examples/splendor/engine)
  reference Splendor game built on the engine
- [`examples/splendor/terminal`](./examples/splendor/terminal)
  terminal client for local gameplay and command discovery loops
- [`examples/splendor/server`](./examples/splendor/server) and
  [`examples/splendor/web`](./examples/splendor/web)
  full-stack reference app for the Splendor example

## Local Development

```bash
bun install
bun run lint
bunx tsc -b
bun test --cwd packages/engine
bun test --cwd packages/cli
```

Additional useful checks:

```bash
bun test --cwd examples/splendor/engine
bun test --cwd examples/splendor/terminal
```
