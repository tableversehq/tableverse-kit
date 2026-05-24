# Typed GameState Factory Design

## Summary

Replace `configureVisibility(...)` with a typed game-state factory.

The factory keeps class-authored game state as the main authoring model, but
returns a value that carries both runtime metadata and static type information.
That value is passed into `GameDefinitionBuilder.rootState(...)`, allowing
`createGameExecutor(...)` to infer the precise `getView(...)` return type
without generated visible-state types and without explicit generic arguments at
the executor call site.

This design follows the direction raised in
[2026-05-23 Redesigning Game State Authoring](./2026-05-23-redesigning-game-state-authoring)
and addresses the type pressure created by
[2026-05-19 Tabletop UI Hooks Design](./2026-05-19-tabletop-ui-hooks-design.md).

## Problem

The current class-authored state model is good for game logic:

- fields define serializable canonical data
- methods colocate domain behavior with the data they operate on
- the executor persists plain canonical data
- commands and stages work against hydrated facades

The weak point is visible-state typing.

`configureVisibility(...)` stores visibility metadata on the state class as a
side effect. Runtime projection can use that metadata, but TypeScript cannot
derive an exact `getView(...)` return type from it. As a result, UI code needs
one of these undesirable workarounds:

- generated visible-state types
- explicit generics passed through executor or client construction
- casts at the in-process client boundary
- project-local hook factories that still need a manually supplied `View` type

This is especially painful for `@tabletop-kit/ui` because the in-process client
should be able to infer the correct view shape directly from the executor.

## Goals

- Keep state classes as the primary game-state authoring model.
- Rename the public concepts so the value returned by `defineGameState(...)` is
  the `GameState`, and the author-written base class is `StateClass`.
- Drop `configureVisibility(...)` as the primary visibility API.
- Avoid generated types for local in-process UI typing.
- Avoid requiring `createGameExecutor<...>(...)` style generic arguments.
- Avoid developer-authored duplicate view classes for normal hidden-information
  projection.
- Make visibility declarative and small.
- Preserve the default behavior that most fields are public structural
  projections.
- Keep examples agent-friendly and constrained.

## Non-Goals

- Replace class-authored state with a schema-first state DSL.
- Move game logic into separate `StateOps` classes.
- Add hosted platform protocol or SDK generation to the engine.
- Support arbitrary per-field view transformations as the primary API.
- Require developers to restate every public field in a view definition.

## Proposed API

State classes remain ordinary `StateClass` subclasses:

```ts
class SplendorPlayerState extends StateClass {
  @field(t.string())
  id = "";

  @field(t.state(() => TokenCounts))
  tokens!: TokenCountsState;

  @field(t.array(t.number()))
  reservedCardIds: number[] = [];

  @field(t.array(t.number()))
  purchasedCardIds: number[] = [];

  reserveCard(cardId: number) {
    this.reservedCardIds.push(cardId);
  }
}
```

The class is wrapped in a typed `GameState` value:

```ts
const SplendorPlayer = defineGameState(SplendorPlayerState)
  .ownedBy((field) => field.id)
  .view((field) => [field.reservedCardIds.visibleToSelf()]);
```

Fields omitted from `.view(...)` are public by default.

The only primary visibility policies are:

```ts
field.someField.hidden();
field.someField.visibleToSelf();
```

Always-hidden fields are hidden from every viewer:

```ts
const SecretDeck = defineGameState(SecretDeckState).view((field) => [
  field.cardIds.hidden(),
]);
```

Root state is passed as a `GameState` value, not as a raw class:

```ts
const SplendorRoot = defineGameState(SplendorGameState);

const game = new GameDefinitionBuilder("splendor")
  .rootState(SplendorRoot)
  .initialStage(initialStage)
  .build();

const executor = createGameExecutor(game);
const view = executor.getView(state, { kind: "player", playerId: "p1" });
```

`view.game.players.p1.reservedCardIds` is inferred as:

```ts
number[] | { __hidden: true }
```

No generated visible-state type is required for this in-process path.

## Field Projection Rules

Projection is structural by default.

For each field on a state class:

- if the field is not listed in `.view(...)`, it is public
- if the field is `hidden()`, every viewer receives `{ __hidden: true }`
- if the field is `visibleToSelf()`, the owning player receives the raw
  projected field value and other viewers receive `{ __hidden: true }`
- nested state fields are projected through their own `GameState` values
- arrays, records, optionals, and objects recursively project their contents

There is no `public()` entry. Public is the default.

There is no object-keyed visibility map in the primary API. The array form is
kept because the field token already carries the field identity:

```ts
.view((field) => [
  field.reservedCardIds.visibleToSelf(),
])
```

This avoids mistakes such as assigning `field.b.visibleToSelf()` to an `a`
property in an object literal.

Duplicate array entries are rejected at build time:

```ts
.view((field) => [
  field.reservedCardIds.hidden(),
  field.reservedCardIds.visibleToSelf(),
])
```

This should throw a clear error such as:

```txt
duplicate_view_field:SplendorPlayerState.reservedCardIds
```

## Ownership

`visibleToSelf()` requires ownership context.

Ownership is declared on the `GameState` value:

```ts
defineGameState(SplendorPlayerState)
  .ownedBy((field) => field.id)
  .view((field) => [field.reservedCardIds.visibleToSelf()]);
```

The engine validates that:

- the selected ownership field exists
- the ownership field is a string field
- `visibleToSelf()` is only used when the state has an owning player context,
  either directly or through an owning ancestor

## Type Model

The returned `GameState` value carries phantom type information:

```ts
interface GameState<TFacade extends StateClass, TCanonical, TVisible> {
  readonly stateClass: StateClassConstructor<TFacade>;
  readonly metadata: GameStateMetadata;
}
```

The exact shape can differ, but the important part is that `TVisible` is bound
to the visibility entries produced by `.view(...)`.

`GameDefinition` should carry both canonical and visible game state types:

```ts
interface GameDefinition<
  FacadeGameState extends StateClass,
  SetupInput extends object | undefined,
  VisibleGameState extends object,
> {
  // existing runtime fields
}
```

`GameExecutor` should expose the visible type:

```ts
interface GameExecutor<
  CanonicalGameState extends object,
  SetupInput extends object | undefined,
  VisibleGameState extends object,
> {
  getView(
    state: CanonicalState<CanonicalGameState>,
    viewer: Viewer,
  ): VisibleState<VisibleGameState>;
}
```

Then `createInProcessClient(executor, ...)` can infer its `view` type from the
executor instead of asking the developer to pass a generated type bundle.

## Nested State References

Static inference requires nested state references to point at `GameState`
values, not raw state classes.

Preferred:

```ts
@field(t.state(() => TokenCounts))
tokens!: TokenCountsState;

@field(t.record(t.string(), t.state(() => SplendorPlayer)))
players: Record<string, SplendorPlayerState> = {};
```

If nested fields reference raw classes, runtime projection can still work, but
the compiler loses the precise nested visible type. The API should either:

- require `GameState` values in `t.state(...)`, or
- allow raw classes only as a compatibility path that degrades nested visible
  types to the canonical/public shape

The preferred long-term rule is that `t.state(...)` accepts `GameState`, not
`StateClass`. Raw classes should be treated as legacy compatibility only.

## Hydrated Context State

`GameState` values are definition-time metadata. They are not the objects that
game logic manipulates.

Command, setup, discovery, and stage contexts should continue to expose
hydrated `StateClass` instances:

```ts
class SplendorPlayerState extends StateClass {
  reserveCard(cardId: number) {
    this.reservedCardIds.push(cardId);
  }
}

const SplendorPlayer = defineGameState(SplendorPlayerState);

class SplendorRootState extends StateClass {
  @field(
    t.record(
      t.string(),
      t.state(() => SplendorPlayer),
    ),
  )
  players: Record<string, SplendorPlayerState> = {};
}

const SplendorRoot = defineGameState(SplendorRootState);
```

In command code, the hydrated root and nested fields are still class instances:

```ts
execute({ game, command }) {
  const player = game.players[command.actorId];
  player.reserveCard(command.input.cardId);
}
```

Here `game` is `SplendorRootState`, and `player` is `SplendorPlayerState`.
The `GameState` value passed to `t.state(...)` tells the engine how to
serialize, validate, hydrate, and project that field. It also points back to the
underlying `StateClass` constructor so hydration can instantiate the correct
class.

This keeps the authoring split clear:

- definition APIs accept `GameState` values
- persisted executor state remains plain canonical data
- runtime authoring contexts expose hydrated `StateClass` instances
- visible projection uses the `GameState` metadata and returns plain data

For example, a nested state field follows this lifecycle:

1. The property is authored as a `StateClass` instance type.
2. The `@field(...)` schema references a `GameState` value.
3. The canonical state stores the field as plain serializable data.
4. Context hydration replaces the canonical object with an instance of the
   `GameState` value's underlying `StateClass`.
5. Visibility projection uses the same `GameState` value to produce the nested
   visible shape.

Lazy references are still required for nested state fields:

```ts
@field(t.state(() => SplendorPlayer))
player!: SplendorPlayerState;
```

The callback resolves to the `GameState` value when the engine compiles the
game definition.

## Hidden Summaries

Hidden summaries are intentionally left out of the primary design.

The simple v1 visibility surface is:

```ts
hidden();
visibleToSelf();
```

A future design may add summaries back only if the semantics stay obvious. For
example:

```ts
field.deckCardIds.hidden({
  schema: t.object({ count: t.number() }),
  derive: (cardIds) => ({ count: cardIds.length }),
});
```

That would mean every viewer receives:

```ts
{ __hidden: true, value: { count: number } }
```

This should not be mixed into `visibleToSelf()` unless the project explicitly
decides that `visibleToSelf()` also supports a non-owner summary. For now,
avoid that extra mode.

## Why Not View Classes

Developer-authored view classes would make the static type problem easy, but
they duplicate too much normal projection work.

Most visible state is the canonical state with a small number of hidden fields.
Forcing developers to write a separate view class or `deriveView(...)` function
would require restating public fields and would create drift between canonical
state and visible state.

View classes can remain a possible escape hatch for custom non-structural
views, but they should not be the primary authoring model.

## Why Not Schema-First State

A schema-first model such as `defineState({ ... })` would also make type
derivation easier, but it weakens the current state authoring direction.

The project wants state to be broken into identifiable structures with local
business methods. State classes give agents and humans a constrained,
recognizable place to put that behavior. Moving behavior into separate ops
classes makes the project less opinionated and easier to scatter.

## Migration

The migration path should be:

1. Add `StateClass` as the base class for user-authored state classes.
2. Add `defineGameState(...)`, returning the public `GameState` value.
3. Make `t.state(...)` accept `GameState` values.
4. Make `GameDefinitionBuilder.rootState(...)` accept a `GameState` value.
5. Thread the visible game-state type through `GameDefinition`,
   `createGameExecutor(...)`, and `GameExecutor`.
6. Update examples to use `StateClass` and `GameState` terminology.
7. Deprecate `configureVisibility(...)`.
8. Remove `configureVisibility(...)` from the primary docs.

During migration, raw state classes may continue to work with broad
`VisibleState<object>` typing.

## Open Questions

- Should `defineGameState(...)` take the class immediately, or use a staged
  builder such as `defineGameState().stateClass(...)`?
- Should raw state classes remain accepted in `t.state(...)` permanently as a
  compatibility path?
- Should hidden summaries be added in the first implementation or deferred?
- Should `.view(...)` be named `.visibility(...)` to make the intent clearer?

## Decision

Proceed with typed `GameState` values as the replacement for
`configureVisibility(...)`.

The primary authoring experience should be:

```ts
class PlayerState extends StateClass {
  // fields and methods
}

const Player = defineGameState(PlayerState)
  .ownedBy((field) => field.id)
  .view((field) => [field.hand.visibleToSelf(), field.secretDeck.hidden()]);
```

This keeps public fields implicit, makes hidden fields explicit, and gives the
engine a typed value that can carry precise visible-state inference all the way
to `executor.getView(...)` and the in-process UI client.
