# Game state builder authoring

## Problem

The current state facade design asks one construct to do too much. A state class
is both the developer's place for game logic and the engine's source of runtime
metadata through `@field(...)` decorators and `configureVisibility(...)`.

That creates a blurry boundary:

- the engine needs a serializable model shape, nested-state metadata, canonical
  validation, hydration, and view projection
- the developer needs a normal class with methods, helpers, invariants, and
  readable game logic
- UI and in-process clients need `executor.getView(...)` to return a concrete
  static type without generated types or manual generics

The root issue is type ownership. Runtime visibility configuration can project
state correctly, but the projected view type does not naturally flow from the
state authoring API into the game definition, executor, UI hooks, and in-process
client.

## Direction

Move runtime type notation out of the class and into an explicit state builder.

The builder should own the engine-facing state definition:

```ts
const Player = defineGameState()
  .model({
    id: t.string(),
    reservedCardIds: t.array(t.number()),
  })
  .stateClass(PlayerState)
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

The state class should be ordinary developer code:

```ts
class PlayerState {
  id = "";
  reservedCardIds: number[] = [];

  canReserveMoreCards(): boolean {
    return this.reservedCardIds.length < 3;
  }

  reserveCard(cardId: number): void {
    this.reservedCardIds.push(cardId);
  }
}
```

This creates a sharper split:

- `model(...)` declares the serializable canonical fields the engine persists
  and validates
- `stateClass(...)` supplies the hydrated class used by command, stage, setup,
  and derived-visibility logic
- `visibility(...)` declares viewer-specific projection policy
- `build()` returns the engine `GameState` definition

The class is no longer the metadata container. It only needs to be structurally
compatible with the model. Extra methods are allowed. Extra non-model fields may
exist on the class, but the engine does not persist or project them unless they
are declared in `model(...)`.

## Naming

Use these terms consistently:

- `GameState`: the engine definition returned by `defineGameState().build()`
- `StateClass`: the developer-authored class passed to `.stateClass(...)`
- canonical state: the plain serializable data stored in `{ game, runtime }`
- hydrated state: a class instance produced from canonical data for game logic
- visible state: the plain viewer-facing state returned by `executor.getView()`

Nested state fields should reference `GameState` definitions, not classes:

```ts
const TokenCounts = defineGameState()
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

const Player = defineGameState()
  .model({
    id: t.string(),
    tokens: t.state(TokenCounts),
    reservedCardIds: t.array(t.number()),
  })
  .stateClass(PlayerState)
  .build();
```

`t.state(...)` accepts `TokenCounts`, the built `GameState` definition. The
engine uses that definition to know both the canonical nested shape and the
`TokenCountsState` class to hydrate.

## Type Flow

The builder should make one state definition carry all three important types:

```ts
type GameStateDefinition<TModel, TStateClass, TView = DefaultView<TModel>> = {
  model: RuntimeModel<TModel>;
  stateClass: StateClass<TStateClass>;
  view: ViewDefinition<TStateClass, TView>;
};
```

The exact implementation can differ, but the public behavior should be:

- `CanonicalOf<typeof Player>` is inferred from `.model(...)`
- `StateClassOf<typeof Player>` is inferred from `.stateClass(...)`
- `ViewOf<typeof Player>` is inferred from `.visibility(...)`

Then a game definition can carry the root state definition:

```ts
const SplendorGame = defineGame()
  .state(SplendorState)
  .commands(commands)
  .build();

const executor = createGameExecutor(SplendorGame);

const view = executor.getView(state, {
  kind: "player",
  playerId: "p1",
});
```

`view.game` should be statically typed from `ViewOf<typeof SplendorState>`
without generated types and without `createGameExecutor<...>(...)`.

## State Class Compatibility

`.stateClass(...)` should reject a class whose instances do not have the model
fields.

For example, this should fail:

```ts
class BadPlayerState {
  id = "";
}

defineGameState()
  .model({
    id: t.string(),
    reservedCardIds: t.array(t.number()),
  })
  .stateClass(BadPlayerState);
```

The class is missing `reservedCardIds`. The builder should require
`InstanceType<typeof BadPlayerState>` to extend the model's static shape.

This check is structural. The class does not need to extend an engine base class
unless we later decide a base class is useful for common helpers. Avoid requiring
inheritance just to attach metadata.

## Hydration

Canonical state remains plain serializable data. Runtime logic should receive
hydrated state-class instances.

For nested state, hydration should follow the `GameState` definitions from the
model:

```ts
class CombatGameStateClass {
  players: Record<string, PlayerState> = {};

  dealDamage(playerId: string, amount: number): void {
    this.players[playerId]?.reduceHealth(amount);
  }
}

class PlayerState {
  health = 10;

  reduceHealth(amount: number): void {
    this.health = Math.max(this.health - amount, 0);
  }
}

const Player = defineGameState()
  .model({ health: t.number() })
  .stateClass(PlayerState)
  .build();

const Game = defineGameState()
  .model({
    players: t.record(t.string(), t.state(Player)),
  })
  .stateClass(CombatGameStateClass)
  .build();
```

Even though the model field is `t.state(Player)`, command execution should see
`game.players[playerId]` as `PlayerState`. That preserves the developer's normal
method-call workflow while keeping the model boundary engine-owned.

Hydration should be deterministic and should only populate model fields. It
should not serialize or restore arbitrary class-private state unless that state
is declared in the model.

## Visibility

Visibility should stay declarative and should produce static view types.

Public fields use default projection. Fields configured as hidden or
visible-to-self are the only fields whose public view differs from their model
shape.

Example:

```ts
const Player = defineGameState()
  .model({
    id: t.string(),
    reservedCardIds: t.array(t.number()),
    purchasedCardIds: t.array(t.number()),
  })
  .stateClass(PlayerState)
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

For the owning player, `reservedCardIds` is `number[]`. For other viewers, it is
the hidden summary `{ __hidden: true, value: { count: number } }`.

The callback should receive typed field tokens derived from `model(...)`, not
from the class. That prevents configuring non-model fields and keeps projection
limited to serializable engine-owned data.

The return-array style remains preferable to mutation-only callbacks:

```ts
.visibility((v) => [
  v.ownedBy("id"),
  v.field("reservedCardIds").visibleToSelf(...),
])
```

The array is explicit, easy to validate for duplicate field entries, and easier
to type-check than a builder mutated by side effect. A mutation-style callback
can be considered later as syntax sugar if the implementation remains simple.

## Full Example

```ts
import {
  defineCommand,
  defineGame,
  defineGameState,
  t,
} from "@tabletop-kit/engine";

class TokenCountsState {
  white = 0;
  blue = 0;
  green = 0;
  red = 0;
  black = 0;
  gold = 0;

  totalCount(): number {
    return (
      this.white + this.blue + this.green + this.red + this.black + this.gold
    );
  }
}

const TokenCounts = defineGameState()
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

class PlayerState {
  id = "";
  tokens = new TokenCountsState();
  reservedCardIds: number[] = [];
  purchasedCardIds: number[] = [];

  canReserveMoreCards(): boolean {
    return this.reservedCardIds.length < 3;
  }

  reserveCard(cardId: number): void {
    this.reservedCardIds.push(cardId);
  }
}

const Player = defineGameState()
  .model({
    id: t.string(),
    tokens: t.state(TokenCounts),
    reservedCardIds: t.array(t.number()),
    purchasedCardIds: t.array(t.number()),
  })
  .stateClass(PlayerState)
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

class SplendorStateClass {
  playerOrder: string[] = [];
  players: Record<string, PlayerState> = {};

  currentPlayer(): PlayerState {
    return this.players[this.playerOrder[0]];
  }
}

const SplendorState = defineGameState()
  .model({
    playerOrder: t.array(t.string()),
    players: t.record(t.string(), t.state(Player)),
  })
  .stateClass(SplendorStateClass)
  .build();

const reserveCard = defineCommand({
  input: t.object({ cardId: t.number() }),
  execute({ game, input }) {
    const player = game.currentPlayer();

    if (!player.canReserveMoreCards()) {
      throw new Error("cannot_reserve_more_cards");
    }

    player.reserveCard(input.cardId);
  },
});

export const splendorGame = defineGame()
  .state(SplendorState)
  .commands([reserveCard])
  .build();
```

The command uses normal class methods. The game definition still exposes an
engine-owned state model. `createGameExecutor(splendorGame)` can infer
canonical state, hydrated command context, and visible state from the same root
definition.

## Migration Implications

This direction would eventually replace:

- `class X extends GameState` as the metadata carrier
- `@field(...)` decorators as the canonical model declaration
- standalone `configureVisibility(...)`

Existing class-authored state can migrate incrementally:

1. Move `@field(...)` declarations into `.model(...)`.
2. Remove `extends GameState` if no base helpers are needed.
3. Pass the class to `.stateClass(...)`.
4. Move `configureVisibility(...)` into `.visibility(...)`.
5. Update nested `t.state(() => Class)` fields to `t.state(BuiltGameState)`.

The migration should preserve command/stage authoring against hydrated class
instances. That is the main reason this design remains practical for existing
Splendor code.

## Open Questions

- Should `.visibility(...)` support mutation-style syntax as an additional
  convenience, or should return-array syntax be the only API?
- Should the builder require `.stateClass(...)`, or allow model-only state for
  simple games?
- Should model fields allow class fields with narrower literal types, or require
  exact assignability to the schema static type?
- Should custom full-state view overrides exist, or should visibility remain
  field-oriented until a concrete need appears?
