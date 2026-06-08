# Game State Builder Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace decorator-based game state authoring with an explicit `defineGameState().model(...).stateClass(...).visibility(...).build()` API that owns canonical, hydrated, and visible state typing from one definition.

**Architecture:** The built `GameState` definition becomes the engine-owned metadata object. State classes become plain developer classes used only for hydrated command/stage/setup logic. Existing canonical, hydration, and projection behavior can be reused, but should consume explicit state definitions instead of class metadata from decorators.

**Tech Stack:** TypeScript, Bun, TypeBox, current `@tabletop-kit/engine` package, Splendor example packages, CLI schema generation.

---

## Constraints

- Do not preserve backward compatibility for `GameState extends`, `@field(...)`, or `configureVisibility(...)`.
- Delete legacy code once the new path works.
- Avoid compatibility shims.
- Avoid excessive custom type aliases. Keep public boundary types; inline one-off internal helper types where that improves readability.
- Keep canonical state plain and serializable.
- Keep command, stage, setup, validation, and discovery logic authored against hydrated state-class instances.
- Make `executor.getView(...)` return the statically inferred visible state type without generated types and without manual `createGameExecutor<...>(...)` generics.

## Current Files To Understand First

- `docs/design/2026-06-08-game-state-builder-authoring.md`
- `packages/engine/src/state-facade/metadata.ts`
- `packages/engine/src/state-facade/compile.ts`
- `packages/engine/src/state-facade/canonical.ts`
- `packages/engine/src/state-facade/hydrate.ts`
- `packages/engine/src/state-facade/project.ts`
- `packages/engine/src/schema/index.ts`
- `packages/engine/src/schema/types.ts`
- `packages/engine/src/game-definition.ts`
- `packages/engine/src/runtime/game-executor.ts`
- `packages/engine/src/types/command.ts`
- `packages/engine/src/types/progression.ts`
- `packages/cli/src/lib/game-descriptor.ts`
- `examples/splendor/engine/src/states/*.ts`
- `examples/splendor/engine/src/game.ts`

## Task 1: Add Type Tests For The New State Builder API

**Files:**

- Modify: `packages/engine/tests/types.test.ts`

**Step 1: Add failing type coverage**

Add a new `test("defineGameState infers canonical hydrated and visible state types", () => { ... })` near the existing state typing tests.

Use this shape:

```ts
class TypedTokenCountsState {
  white = 0;

  totalCount(): number {
    return this.white;
  }
}

const TypedTokenCounts = defineGameState()
  .model({
    white: t.number(),
  })
  .stateClass(TypedTokenCountsState)
  .build();

class TypedPlayerState {
  id = "";
  tokens = new TypedTokenCountsState();
  reservedCardIds: number[] = [];

  canReserveMoreCards(): boolean {
    return this.reservedCardIds.length < 3;
  }
}

const TypedPlayer = defineGameState()
  .model({
    id: t.string(),
    tokens: t.state(TypedTokenCounts),
    reservedCardIds: t.array(t.number()),
  })
  .stateClass(TypedPlayerState)
  .visibility((v) => [
    v.ownedBy("id"),
    v.field("reservedCardIds").visibleToSelf({
      hidden: {
        schema: t.object({ count: t.number() }),
        derive: (cards) => ({ count: cards.length }),
      },
    }),
  ])
  .build();
```

Assert compile-time behavior with existing `expectTypeOf` patterns:

```ts
type Canonical = CanonicalStateOf<typeof TypedPlayer>;
type Hydrated = StateClassOf<typeof TypedPlayer>;
type View = ViewOf<typeof TypedPlayer>;

expectTypeOf<Canonical>().toEqualTypeOf<{
  id: string;
  tokens: { white: number };
  reservedCardIds: number[];
}>();

expectTypeOf<Hydrated>().toEqualTypeOf<TypedPlayerState>();
expectTypeOf<View["reservedCardIds"]>().toEqualTypeOf<
  | number[]
  | {
      __hidden: true;
      value: { count: number };
    }
>();
```

Add a negative structural compatibility check:

```ts
class MissingReservedCardsState {
  id = "";
}

defineGameState()
  .model({
    id: t.string(),
    reservedCardIds: t.array(t.number()),
  })
  // @ts-expect-error stateClass must satisfy model fields
  .stateClass(MissingReservedCardsState);
```

**Step 2: Run the type test**

Run: `bun test --cwd packages/engine tests/types.test.ts`

Expected: FAIL because `defineGameState`, `CanonicalStateOf`, `StateClassOf`, and `ViewOf` do not exist yet.

**Step 3: Commit the failing type test**

```bash
git add packages/engine/tests/types.test.ts
git commit -m "test: specify game state builder typing"
```

## Task 2: Introduce Built Game State Definitions

**Files:**

- Create: `packages/engine/src/state/game-state.ts`
- Modify: `packages/engine/src/schema/types.ts`
- Modify: `packages/engine/src/schema/index.ts`
- Modify: `packages/engine/src/index.ts`

**Step 1: Add the core state definition module**

Create `packages/engine/src/state/game-state.ts`.

Start with public helper types and the builder implementation:

```ts
import type { FieldType, ObjectFieldType, ObjectSchemaStatic } from "../schema";

export type StateClass<TInstance extends object = object> = new () => TInstance;

export type StateModel = Record<string, FieldType>;

export interface GameStateDefinition<
  TModel extends StateModel,
  TStateClass extends object,
  TView extends object = DefaultView<TModel>,
> {
  readonly kind: "gameState";
  readonly model: TModel;
  readonly stateClass: StateClass<TStateClass>;
  readonly visibility: readonly StateVisibilityEntry[];
  readonly __canonical?: CanonicalStateOfModel<TModel>;
  readonly __stateClass?: TStateClass;
  readonly __view?: TView;
}

export type GameState = GameStateDefinition<StateModel, object, object>;
```

Prefer direct names over duplicate aliases. If a helper is only used once inside this file, keep it private.

**Step 2: Add inference helpers**

In the same file:

```ts
export type CanonicalStateOf<TState> = TState extends {
  readonly __canonical?: infer TCanonical;
}
  ? TCanonical
  : never;

export type StateClassOf<TState> = TState extends {
  readonly __stateClass?: infer TStateClass;
}
  ? TStateClass
  : never;

export type ViewOf<TState> = TState extends { readonly __view?: infer TView }
  ? TView
  : never;
```

Add private recursive model extraction from `FieldType`, including nested `GameStateDefinition` for `state` fields.

**Step 3: Add a minimal builder**

Implement:

```ts
export function defineGameState() {
  return new GameStateModelBuilder();
}
```

The first implementation only needs:

- `.model(model)`
- `.stateClass(StateClass)`
- `.build()`

The `.stateClass(...)` method must enforce that the class instance satisfies the model static shape.

**Step 4: Change `t.state(...)`**

In `packages/engine/src/schema/types.ts`, replace `StateFieldTargetFactory = () => GameStateClass` with a direct `GameState` definition target.

In `packages/engine/src/schema/index.ts`, change:

```ts
state(target: GameState): NestedStateFieldType
```

Do not support the old `() => Class` form.

**Step 5: Export the new API**

In `packages/engine/src/index.ts`, export:

- `defineGameState`
- type `GameState`
- type `GameStateDefinition`
- type `CanonicalStateOf`
- type `StateClassOf`
- type `ViewOf`

Do not remove old exports yet in this task.

**Step 6: Run the targeted type test**

Run: `bun test --cwd packages/engine tests/types.test.ts`

Expected: the new builder type test should pass. Other existing tests may still fail after `t.state(...)` changes because legacy callers still pass class factories.

**Step 7: Commit**

```bash
git add packages/engine/src/state/game-state.ts packages/engine/src/schema/types.ts packages/engine/src/schema/index.ts packages/engine/src/index.ts packages/engine/tests/types.test.ts
git commit -m "feat: add game state builder definitions"
```

## Task 3: Port State Compilation To Built Definitions

**Files:**

- Modify: `packages/engine/src/state-facade/compile.ts`
- Modify: `packages/engine/src/state-facade/canonical.ts`
- Modify: `packages/engine/src/state-facade/hydrate.ts`
- Modify: `packages/engine/src/state-facade/project.ts`

**Step 1: Rename only where it reduces confusion**

Do not rename files yet unless it is necessary. It is acceptable for `state-facade/*` to temporarily contain definition-based logic. A later cleanup task can move files if the code settles.

**Step 2: Replace class metadata reads**

Replace `getStateMetadata(target)` with direct reads from `GameStateDefinition.model` and `.visibility`.

Compiled state should key by definition identity or a stable generated id, not by class name. Avoid class-name keys because two state classes can have the same name.

Use a shape like:

```ts
export interface CompiledStateDefinition {
  state: GameState;
  model: Record<string, FieldType>;
  visibility: readonly StateVisibilityEntry[];
  ownedByField?: string;
}

export interface CompiledStateDefinitionGraph {
  root: GameState;
  states: Map<GameState, CompiledStateDefinition>;
}
```

Prefer `Map<GameState, ...>` internally. If CLI needs plain objects, expose a descriptor separately later.

**Step 3: Update canonical schema/default generation**

Change:

```ts
compileCanonicalGameStateSchema(root: GameState)
createDefaultCanonicalGameState(root: GameState)
```

Default state creation should instantiate `root.stateClass` and copy only model fields. Reject extra enumerable own fields by default, preserving the current safety check.

**Step 4: Update hydration**

Change hydration to instantiate `state.stateClass`.

Nested `field.kind === "state"` should hydrate using `field.target`, where `target` is now the built `GameState` definition.

Keep existing mutation-depth protection and readonly behavior.

**Step 5: Update projection**

Projection should traverse `GameStateDefinition.model` and visibility entries. Preserve:

- default public projection
- hidden field projection
- visible-to-self projection
- hidden summary derivation with readonly hydrated state

**Step 6: Add runtime tests**

Modify `packages/engine/tests/state-facade.test.ts` to add new builder-based tests for:

- nested state hydrates to nested state class
- method mutation is allowed inside class methods
- direct property mutation is rejected
- readonly hydrated state rejects mutation
- hidden summary receives the original field value and readonly state instance

**Step 7: Run targeted tests**

Run:

```bash
bun test --cwd packages/engine tests/state-facade.test.ts
bun test --cwd packages/engine tests/game-execution.test.ts
```

Expected: new builder tests pass. Existing legacy tests may fail until migrated.

**Step 8: Commit**

```bash
git add packages/engine/src/state-facade packages/engine/tests/state-facade.test.ts packages/engine/tests/game-execution.test.ts
git commit -m "refactor: compile state definitions from builders"
```

## Task 4: Add Visibility Builder Semantics

**Files:**

- Modify: `packages/engine/src/state/game-state.ts`
- Modify: `packages/engine/src/state-facade/compile.ts`
- Modify: `packages/engine/src/state-facade/project.ts`
- Modify: `packages/engine/tests/types.test.ts`
- Modify: `packages/engine/tests/state-facade.test.ts`
- Modify: `packages/engine/tests/game-execution.test.ts`

**Step 1: Add return-array visibility API**

Implement:

```ts
.visibility((v) => [
  v.ownedBy("id"),
  v.field("reservedCardIds").visibleToSelf({
    hidden: {
      schema: t.object({ count: t.number() }),
      derive: (cards) => ({ count: cards.length }),
    },
  }),
])
```

The field tokens must be derived from `.model(...)`, not from `.stateClass(...)`.

**Step 2: Define minimal public visibility types**

Keep names minimal:

- `StateVisibilityEntry`
- `HiddenValue`
- `Viewer`

Avoid preserving old `FieldVisibilityConfig`, `VisibilityConfigurationInput`, and similar names unless they remain truly useful.

**Step 3: Enforce compile-time field restrictions**

In `packages/engine/tests/types.test.ts`, add:

```ts
defineGameState()
  .model({ id: t.string() })
  .stateClass(
    class {
      id = "";
      nonModel = 1;
    },
  )
  .visibility((v) => [
    // @ts-expect-error visibility fields must come from model fields
    v.field("nonModel").hidden(),
  ]);
```

**Step 4: Enforce runtime validation**

Add tests for:

- duplicate visibility field entries
- `ownedBy(...)` field missing from model
- `ownedBy(...)` field not string
- `visibleToSelf(...)` without owning player ancestor
- summary schema rejects nested `t.state(...)`

**Step 5: Run targeted tests**

Run:

```bash
bun test --cwd packages/engine tests/types.test.ts
bun test --cwd packages/engine tests/state-facade.test.ts
bun test --cwd packages/engine tests/game-execution.test.ts
```

**Step 6: Commit**

```bash
git add packages/engine/src/state/game-state.ts packages/engine/src/state-facade packages/engine/tests
git commit -m "feat: add game state visibility builder"
```

## Task 5: Move Game Definition To Root State Definitions

**Files:**

- Modify: `packages/engine/src/game-definition.ts`
- Modify: `packages/engine/src/runtime/game-executor.ts`
- Modify: `packages/engine/src/runtime/contexts.ts`
- Modify: `packages/engine/src/runtime/validation.ts`
- Modify: `packages/engine/src/runtime/runtime-schema.ts`
- Modify: `packages/engine/src/testing/harness.ts`
- Modify: `packages/engine/src/replay/history.ts`
- Modify: `packages/engine/src/snapshot/snapshot.ts`
- Modify: `packages/engine/src/index.ts`

**Step 1: Replace `.rootState(...)`**

Change the game builder API to:

```ts
new GameDefinitionBuilder("game").state(RootStateDefinition);
```

Delete `.rootState(...)`.

**Step 2: Simplify game definition types**

Keep `GameDefinition`, `GameDefinitionWithSetupInput`, and `GameDefinitionWithoutSetupInput` only if they remain clear public boundary names.

Remove internal duplicated aliases like executor-local `AnyGameDefinition`. Use the exported `GameDefinition` union directly.

Replace `FacadeGameState` naming with `StateClass` or `HydratedState` where the value is the class instance type.

**Step 3: Type executor from root definition**

`createGameExecutor(game)` should infer:

- canonical game state from `CanonicalStateOf<RootState>`
- setup context `game` from `StateClassOf<RootState>`
- command/stage contexts from `StateClassOf<RootState>`
- `getView(...)` return from `ViewOf<RootState>`

The `GameExecutor` interface should become:

```ts
export interface GameExecutor<
  TGameState extends GameState,
  SetupInput extends object | undefined,
  TCommandDefinition,
> {
  createInitialState: CreateInitialStateFn<
    CanonicalStateOf<TGameState>,
    SetupInput
  >;
  getView(
    state: CanonicalState<CanonicalStateOf<TGameState>>,
    viewer: Viewer,
  ): VisibleState<ViewOf<TGameState>>;
}
```

Inline helpers where possible if naming becomes heavier than the type itself.

**Step 4: Update validation**

`validateCanonicalGameState` and `validateCanonicalState` should validate against schemas compiled from root `GameState` definitions.

**Step 5: Run targeted tests**

Run:

```bash
bun test --cwd packages/engine tests/game-definition.test.ts
bun test --cwd packages/engine tests/game-execution.test.ts
bun test --cwd packages/engine tests/types.test.ts
```

Expected: migrated tests pass; unmigrated tests may fail.

**Step 6: Commit**

```bash
git add packages/engine/src packages/engine/tests
git commit -m "refactor: use state definitions in game definitions"
```

## Task 6: Migrate Command And Stage Typing Names

**Files:**

- Modify: `packages/engine/src/types/command.ts`
- Modify: `packages/engine/src/types/progression.ts`
- Modify: `packages/engine/src/command-factory.ts`
- Modify: `packages/engine/src/stage-factory.ts`
- Modify: `packages/engine/src/runtime/game-executor.ts`

**Step 1: Replace base-class constraints**

Replace `extends BaseGameState` constraints with `extends object`.

Use `HydratedState` naming only where it clarifies that the type is the class instance seen by callbacks.

**Step 2: Remove unnecessary default generic aliases**

Audit exported types with defaults like:

```ts
FacadeGameState extends BaseGameState = BaseGameState
```

Keep defaults only where they improve consumer ergonomics. Remove defaults that silently widen callback context to `object` or `Record<string, unknown>`.

**Step 3: Keep command discovery result typing intact**

Do not regress the previous command discovery typing work. Add type assertions that `executor.discoverCommand(...)` returns the concrete command input type from command definitions.

**Step 4: Run type checks**

Run:

```bash
bun test --cwd packages/engine tests/types.test.ts
bunx tsc -b
```

**Step 5: Commit**

```bash
git add packages/engine/src packages/engine/tests/types.test.ts
git commit -m "refactor: simplify command and stage state typing"
```

## Task 7: Migrate Splendor To The New Authoring API

**Files:**

- Modify: `examples/splendor/engine/src/states/token-counts-state.ts`
- Modify: `examples/splendor/engine/src/states/end-game-state.ts`
- Modify: `examples/splendor/engine/src/states/player-state.ts`
- Modify: `examples/splendor/engine/src/states/board-state.ts`
- Modify: `examples/splendor/engine/src/states/game-state.ts`
- Modify: `examples/splendor/engine/src/game.ts`
- Modify: `examples/splendor/engine/README.md`

**Step 1: Remove decorator imports**

Remove `GameState`, `field`, and `configureVisibility` from Splendor state files.

**Step 2: Convert each class**

Each file should export the class and the built state definition.

Example:

```ts
export class TokenCountsState {
  white = 0;
  blue = 0;
  green = 0;
  red = 0;
  black = 0;
  gold = 0;
}

export const TokenCounts = defineGameState()
  .model({
    white: t.number(),
    blue: t.number(),
    green: t.number(),
    red: t.number(),
    black: t.number(),
    gold: t.number(),
  })
  .stateClass(TokenCountsState)
  .build();
```

Use `t.state(TokenCounts)` instead of `t.state(() => TokenCountsState)`.

**Step 3: Move visibility into state definitions**

Convert player and board visibility:

```ts
.visibility((v) => [
  v.ownedBy("id"),
  v.field("reservedCardIds").visibleToSelf({
    hidden: {
      schema: hiddenReservedCardSchema,
      derive: (reservedCardIds) => ({ count: reservedCardIds.length }),
    },
  }),
])
```

**Step 4: Update root game definition**

Change:

```ts
.rootState(SplendorRootState)
```

to:

```ts
.state(SplendorState)
```

**Step 5: Run Splendor tests**

Run:

```bash
bun test --cwd examples/splendor/engine
bun test --cwd examples/splendor/terminal
```

**Step 6: Commit**

```bash
git add examples/splendor/engine examples/splendor/terminal
git commit -m "refactor: migrate splendor to state builder"
```

## Task 8: Migrate CLI Descriptor Generation

**Files:**

- Modify: `packages/cli/src/lib/game-descriptor.ts`
- Modify: `packages/cli/src/lib/generation-context.ts`
- Modify: `packages/cli/src/lib/load-config.ts`
- Modify: `packages/engine/src/config.ts`
- Modify: `packages/cli/tests/fixtures/*.ts`
- Modify: `packages/cli/tests/*.test.ts`

**Step 1: Stop mirroring compiled facade internals**

Remove CLI-local `CompiledStateFacadeDefinition` and `CompiledStateDefinition`.

Expose a stable engine descriptor helper if needed, for example:

```ts
export function describeVisibleStateSchema(root: GameState): TSchema;
```

or expose `game.visibleStateSchema` directly from `GameDefinition`.

Prefer `game.visibleStateSchema` if it keeps CLI simpler.

**Step 2: Update CLI config types**

`BuiltGameDefinition` should include only stable public descriptor fields. Do not require CLI to know internal state graph shapes.

**Step 3: Migrate fixtures**

Update CLI fixture games from decorator state classes to `defineGameState()`.

**Step 4: Run CLI tests**

Run:

```bash
bun test --cwd packages/cli
```

**Step 5: Commit**

```bash
git add packages/cli packages/engine/src/config.ts
git commit -m "refactor: generate descriptors from state definitions"
```

## Task 9: Delete Legacy State Authoring Surface

**Files:**

- Delete or heavily reduce: `packages/engine/src/state-facade/metadata.ts`
- Modify: `packages/engine/src/index.ts`
- Modify: `packages/engine/tests/*.test.ts`
- Modify: `packages/engine/README.md`
- Modify: `README.md`

**Step 1: Remove public exports**

Delete these exports from `packages/engine/src/index.ts`:

- `GameState` base class from old metadata module
- `field`
- `configureVisibility`
- `getStateMetadata`

The name `GameState` should now refer only to the built state definition type.

**Step 2: Delete decorator-specific tests**

Remove tests whose only purpose is decorator metadata behavior:

- decorator requires base class
- undecorated child class rejection
- `configureVisibility` function existence

Do not preserve tests for deleted APIs.

Keep behavior tests by rewriting them to builder API where the behavior still matters.

**Step 3: Remove old metadata module**

If no runtime code imports `state-facade/metadata.ts`, delete it.

If a few low-level types remain useful, move them to `packages/engine/src/state/game-state.ts` or a small internal module with direct names.

**Step 4: Update docs**

Update README examples to use:

```ts
const CounterState = defineGameState()
  .model({ count: t.number() })
  .stateClass(CounterStateClass)
  .build();
```

**Step 5: Run full verification**

Run:

```bash
bun run lint
bunx tsc -b
bun test --cwd packages/engine
bun test --cwd packages/cli
bun test --cwd examples/splendor/engine
bun test --cwd examples/splendor/terminal
```

**Step 6: Commit**

```bash
git add packages/engine packages/cli examples/splendor README.md
git commit -m "refactor: remove legacy decorator state authoring"
```

## Task 10: Final Type And Naming Cleanup

**Files:**

- Modify: `packages/engine/src/**/*.ts`
- Modify: `packages/cli/src/**/*.ts`
- Modify: `examples/splendor/engine/src/**/*.ts`

**Step 1: Search for obsolete names**

Run:

```bash
rg -n "FacadeGameState|BaseGameState|GameStateClass|StateFieldTargetFactory|CompiledStateFacadeDefinition|configureVisibility|@field|extends GameState|rootState\\(" packages examples
```

Expected: no public legacy usage remains. Internal `Compiled...` names should only remain if they describe a real compiled artifact and not leaked CLI shape.

**Step 2: Remove unnecessary custom type names**

For each custom type alias, ask:

- Is it exported?
- Is it reused in multiple files?
- Does it name a domain concept instead of just wrapping one conditional type?

Delete or inline aliases that fail all three checks.

Likely candidates to audit:

- local executor `AnyGameDefinition`
- command/stage accumulator helper names
- schema aliases that only duplicate TypeBox concepts
- CLI descriptor shadow interfaces

Do not collapse public API names that help consumers read their code.

**Step 3: Run full verification**

Run:

```bash
bun run lint
bunx tsc -b
bun test --cwd packages/engine
bun test --cwd packages/cli
bun test --cwd examples/splendor/engine
bun test --cwd examples/splendor/terminal
```

**Step 4: Commit**

```bash
git add packages examples
git commit -m "refactor: simplify state builder type names"
```

## Final Verification

Run the full required suite:

```bash
bun run lint
bunx tsc -b
bun test --cwd packages/engine
bun test --cwd packages/cli
bun test --cwd examples/splendor/engine
bun test --cwd examples/splendor/terminal
```

Expected: all commands pass.

Then inspect the public API:

```bash
rg -n "configureVisibility|@field|extends GameState|rootState\\(" packages examples README.md
```

Expected: no references except historical docs under `docs/design`.

## Suggested Commit Cadence

Commit after each task. Do not wait until the end. This refactor touches types, runtime behavior, tests, examples, and CLI generation; small commits make failures easier to isolate.

## Implementation Notes

- This plan intentionally does not preserve old APIs.
- If migrating all tests at once becomes noisy, temporarily mark legacy tests for deletion and add new builder-first tests for the same behavior.
- Prefer the Splendor example as the API quality benchmark. If the engine API feels awkward in Splendor, adjust the engine API instead of adding Splendor-specific workaround types.
- The new state definition should be the single source of truth for canonical state, hydrated state, and visible state.
