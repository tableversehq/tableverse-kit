# @tableverse-kit/engine

Reusable runtime engine package for tabletop and board-game rules engines.

## Current scope

This package currently provides:

- canonical `{ game, runtime }` state types
- command definitions with `validate` and `execute`
- state metadata via `defineGameState(...)`, plain state classes, and `t`
- `.state(...)` authoring on `GameDefinitionBuilder`
- hydrated state facades for command execution, validation, availability, and discovery
- transactional command execution
- nested progression definitions with engine-managed lifecycle resolution
- semantic event collection
- deterministic RNG primitives
- snapshot and replay helpers
- a small scenario-style test harness
- viewer-specific visible state projection

## Intentional deferrals

The current package does **not** yet implement:

- a first-class public internal-step abstraction
- rich trigger resolution beyond the current skeleton
- richer stack / queue resolution models
- persistence adapters

## Scripts

```bash
bun run test
bun run typecheck
```

## State facade authoring

Games can continue to persist and execute against plain canonical state while
authoring against a root facade class.

```ts
import {
  createCommandFactory,
  createStageFactory,
  defineGameState,
  GameDefinitionBuilder,
  t,
} from "@tableverse-kit/engine";

class CounterState {
  value!: number;

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

const defineCommand = createCommandFactory<CounterState>();
const increment = defineCommand({
  commandId: "increment",
  commandSchema: t.object({}),
})
  .validate(() => ({ ok: true }))
  .execute(({ game }) => {
    game.increment();
  })
  .build();
const turnStage = createStageFactory<CounterState>()("turn")
  .singleActivePlayer()
  .activePlayer(() => "player-1")
  .commands([increment])
  .nextStages(() => ({ turnStage }))
  .transition(({ nextStages }) => nextStages.turnStage)
  .build();

const game = new GameDefinitionBuilder("counter")
  .state(Counter)
  .initialStage(turnStage)
  .build();
```

The executor still returns plain canonical state. The facade is a temporary
execution-time authoring layer over a cloned working copy.
