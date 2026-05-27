# Tabletop Kit

Open-source TypeScript toolkit for building digital tabletop and board-game
implementations.

Tabletop Kit helps you model game state, validate and execute player commands,
project hidden information per viewer, and generate local TypeScript and schema
artifacts from your game definition.

## Packages

- [`@tabletop-kit/engine`](./packages/tabletop-engine)
  transport-agnostic rules/runtime engine
- [`@tabletop-kit/cli`](./packages/cli)
  local tooling package that installs the `ttk` command
- `@tabletop-kit/ui`
  planned UI package for reusable hooks and scaffolded components

## Install

```bash
bun add @tabletop-kit/engine
bun add -d @tabletop-kit/cli
```

or:

```bash
npm install @tabletop-kit/engine
npm install --save-dev @tabletop-kit/cli
```

## Engine

`@tabletop-kit/engine` provides the runtime building blocks for a board-game
rules package:

- `GameDefinitionBuilder`
- `createGameExecutor(...)`
- command validation, execution, availability, and discovery
- stage/progression lifecycle orchestration
- deterministic RNG
- class-authored state facades with `GameState`, `@field(...)`, and `t`
- hidden-information projection with `getView(...)`
- visibility configuration through `configureVisibility(...)`
- snapshots, replay helpers, and scenario testing

Example state facade:

```ts
import { field, GameState, t } from "@tabletop-kit/engine";

class CounterState extends GameState {
  @field(t.number())
  value = 0;

  increment() {
    this.value += 1;
  }
}
```

## CLI

`@tabletop-kit/cli` installs the `ttk` command.

```bash
ttk generate types
ttk generate schemas
ttk generate client-sdk
ttk validate
```

The CLI reads `tabletop.config.ts` from your project:

```ts
import { defineConfig } from "@tabletop-kit/engine/config";
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
bun test --cwd packages/tabletop-engine
bun test --cwd packages/cli
```

Additional useful checks:

```bash
bun test --cwd examples/splendor/engine
bun test --cwd examples/splendor/terminal
```
