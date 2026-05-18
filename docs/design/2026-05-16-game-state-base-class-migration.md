# GameState Base Class Migration

## Context

State facades are currently identified with `@State()` plus `@field(...)`
decorators:

```ts
@State()
class PlayerState {
  @field(t.string())
  id = "";
}
```

The current `@State()` decorator is only a metadata marker. It calls
`ensureStateMetadata(...)` for the class constructor. Field, visibility,
canonical-state, hydration, projection, and protocol behavior are driven by the
metadata collected from `@field(...)`, `configureVisibility(...)`, and
`t.state(...)`.

That means the class decorator is not carrying unique runtime behavior. It only
proves that a constructor has an entry in the metadata `WeakMap`.

## Current Code Findings

- `@State()` does not validate constructor shape beyond the TypeScript
  `ClassDecorator` target. It casts the target to `StateClass`.
- `@field(...)` already creates state metadata through the property decorator
  target constructor, so classes with fields can have metadata even without
  `@State()`.
- `compileStateFacadeDefinition(...)` uses `getStateMetadata(root)` and follows
  nested state references from `field.kind === "state"`.
- `createDefaultCanonicalGameState(...)`, canonical schema compilation,
  hydration, visibility projection, protocol descriptor generation, and AsyncAPI
  generation all depend on explicit field metadata.
- Existing in-repo state classes do not rely on another base class, so changing
  them to `extends GameState` is mechanically feasible.
- The migration would touch the engine tests and Splendor state classes, but it
  does not conflict with a current inheritance hierarchy.

## Recommendation

Replace `@State()` with an exported abstract base class named `GameState`.

```ts
class PlayerState extends GameState {
  @field(t.string())
  id = "";
}
```

This is better engineering for the current direction of the engine:

- It gives state facades a real runtime identity through `instanceof GameState`.
- It gives TypeScript a stronger constraint than `object` or a fake constructor
  alias.
- It avoids accepting arbitrary decorated functions/classes as state classes.
- It removes decorator-order ambiguity from the state-class marker.
- It makes root and nested state validation clearer:
  `state class must extend GameState`, not `state class must have metadata`.

The main tradeoff is TypeScript single inheritance. If a future consumer needs
state facades to extend their own framework base class, `@State()` is more
flexible. That is not a current repository requirement, and the engine is moving
toward explicit semantics over framework magic, so the base class is the better
default.

## Why `t.state(...)` Still Stays

`instanceof GameState` can identify a runtime object after an instance exists.
It cannot replace `t.state(...)`.

The engine needs nested state metadata before runtime values are available:

- canonical schema compilation needs to know nested state targets
- default canonical state creation auto-instantiates missing nested states
- hydration needs to know which plain-object fields should become facade
  instances
- visibility projection needs to recurse through nested state fields
- protocol and AsyncAPI generation need to describe view schemas
- optional, array, record, and object fields may contain nested state without
  any default instance to inspect
- lazy `() => ChildState` references allow circular state graphs

Because TypeScript property types are erased at runtime, this cannot be inferred
from `child: ChildState` or `children: ChildState[]`. `t.state(() => ChildState)`
remains the explicit schema graph edge.

## Migration Plan

1. Add `GameState`.

   ```ts
   export abstract class GameState {
     declare protected readonly __tabletopGameStateBrand: never;
   }
   ```

   The protected brand makes `GameState` nominal at compile time while emitting
   no runtime field. The class itself provides the runtime `instanceof` target.

2. Replace `StateClass` with `GameStateClass`.

   ```ts
   export type GameStateClass<TState extends GameState = GameState> = new (
     ...args: unknown[]
   ) => TState;
   ```

   Use this type for root states, nested state targets, compiled state
   definitions, canonical state creation, hydration, projection, and protocol
   traversal.

3. Change facade generics that represent authored game state from
   `extends object` to `extends GameState`.

   This should apply to `GameDefinition`, `GameDefinitionBuilder.rootState`,
   command contexts, stage definitions, executor-facing game definitions, and
   state-facade helper functions where the generic means "developer-authored
   facade state".

4. Keep metadata storage, but change what it proves.

   Metadata should still live in a `WeakMap<GameStateClass, StateMetadata>`
   because fields and visibility need storage. `getStateMetadata(...)` should
   first assert that the target extends `GameState`, then return existing
   metadata or create empty metadata for valid empty state classes.

5. Update decorators.

   `@field(...)` remains required for persisted fields. It should verify that
   the property decorator target belongs to a `GameState` subclass before
   writing metadata.

   `@State()` should be removed from in-repo usage. Since the package is not
   published yet, we do not need a compatibility layer unless we want a smaller
   transition. If kept temporarily, it should be a deprecated no-op that only
   validates the target extends `GameState`.

6. Update `t.state(...)`.

   Keep the API, but type its target factory as `() => GameStateClass`. During
   state graph compilation, reject any target that does not extend `GameState`
   with an error like:

   ```txt
   state_field_target_must_extend_game_state:ChildState
   ```

7. Update consumers.

   Replace:

   ```ts
   import { State, field, t } from "@tabletop-kit/engine";

   @State()
   class SplendorPlayerState {
     ...
   }
   ```

   with:

   ```ts
   import { GameState, field, t } from "@tabletop-kit/engine";

   class SplendorPlayerState extends GameState {
     ...
   }
   ```

8. Update docs and tests.

   Replace `@State()` examples in active docs and README files. Historical
   design docs can remain historical unless they are currently presented as
   guidance.

## Expected Codebase Changes

- `packages/tabletop-engine/src/state-facade/metadata.ts`
  - export `GameState`
  - export `GameStateClass`
  - remove or deprecate `State`
  - make metadata APIs validate `GameState` inheritance

- `packages/tabletop-engine/src/schema/types.ts`
  - change `StateFieldTargetFactory` to return `GameStateClass`

- `packages/tabletop-engine/src/game-definition.ts`
  - require root facade state to extend `GameState`
  - carry that constraint through `GameDefinition` and `GameDefinitionBuilder`

- `packages/tabletop-engine/src/state-facade/*`
  - replace `StateClass` with `GameStateClass`
  - update nested state validation errors

- `packages/tabletop-engine/src/types/*`, command factory, stage factory, and
  runtime contexts
  - update generic constraints where they mean facade game state

- `examples/splendor/engine/src/states/*`
  - replace `@State()` with `extends GameState`

- `packages/tabletop-engine/tests/*`
  - replace test state decorators with inheritance
  - update tests that assert undecorated nested state errors to assert missing
    `GameState` inheritance instead

## Verification

Run:

```bash
bunx tsc -b --force
bun test --cwd packages/tabletop-engine
bun test --cwd examples/splendor/engine
bun test --cwd examples/splendor/terminal
```

Run `bun run lint` if the migration touches linted source beyond type-only
changes.

## Decision

Use `GameState` as the state facade marker and runtime identity.

Keep `@field(...)`, `configureVisibility(...)`, and `t.state(...)` because they
describe field-level schema, visibility, and nested state graph structure that a
base class cannot infer.
