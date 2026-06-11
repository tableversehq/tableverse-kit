import { expect, test } from "bun:test";
import type {
  CanonicalStateOf,
  CommandDiscoveryResultFor,
  StateClassOf,
  ViewOf,
} from "../src/index";
import {
  createCommandFactory,
  createGameExecutor,
  createStageFactory,
  defineGameState,
  GameDefinitionBuilder,
  t,
} from "../src/index";

type Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends <T>() => T extends TRight ? 1 : 2
    ? true
    : false;

type Assert<T extends true> = T;

test("defineGameState infers canonical hydrated and visible state types", () => {
  class TokenCountsState {
    white = 0;

    totalCount(): number {
      return this.white;
    }
  }

  const TokenCounts = defineGameState()
    .model({
      white: t.number(),
    })
    .stateClass(TokenCountsState)
    .build();

  class PlayerState {
    id = "";
    tokens = new TokenCountsState();
    reservedCardIds: number[] = [];

    canReserveMoreCards(): boolean {
      return this.reservedCardIds.length < 3;
    }
  }

  const Player = defineGameState()
    .model({
      id: t.string(),
      tokens: t.state(TokenCounts),
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

  type Canonical = CanonicalStateOf<typeof Player>;
  type Hydrated = StateClassOf<typeof Player>;
  type View = ViewOf<typeof Player>;

  void (0 as unknown as Assert<
    Equal<
      Canonical,
      {
        id: string;
        tokens: { white: number };
        reservedCardIds: number[];
      }
    >
  >);
  void (0 as unknown as Assert<Equal<Hydrated, PlayerState>>);

  const visibleReservedCards: View["reservedCardIds"] = [1, 2, 3];
  const hiddenReservedCards: Extract<
    View["reservedCardIds"],
    { __hidden: true }
  > = {
    __hidden: true,
    value: { count: 3 },
  };
  const hiddenReservedCardCount: number = hiddenReservedCards.value.count;
  expect(visibleReservedCards).toEqual([1, 2, 3]);
  expect(hiddenReservedCardCount).toBe(3);

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

  expect(Player).toBeDefined();
});

test("executor infers discovery result from command definitions", () => {
  class CounterStateClass {
    count = 0;
  }

  const CounterState = defineGameState()
    .model({
      count: t.number(),
    })
    .stateClass(CounterStateClass)
    .build();

  const defineCommand = createCommandFactory<CounterStateClass>();
  const increment = defineCommand({
    commandId: "increment",
    commandSchema: t.object({
      amount: t.number(),
    }),
  })
    .discoverable((step) => [
      step("select_amount")
        .initial()
        .input(t.object({}))
        .output(t.object({ amount: t.number() }))
        .resolve(() => ({
          complete: true as const,
          input: {
            amount: 1,
          },
        }))
        .build(),
    ])
    .validate(({ command }) => {
      const amount: number = command.input.amount;
      expect(amount).toBeNumber();
      return { ok: true as const };
    })
    .execute(({ game, command }) => {
      game.count += command.input.amount;
    })
    .build();

  const defineStage = createStageFactory<CounterStateClass>();
  const turnStage = defineStage("turn")
    .singleActivePlayer()
    .activePlayer(() => "p1")
    .commands([increment])
    .transition(() => {
      throw new Error("not used by this type test");
    })
    .build();

  const game = new GameDefinitionBuilder("counter")
    .state(CounterState)
    .initialStage(turnStage)
    .build();

  const executor = createGameExecutor(game);
  const state = executor.createInitialState("seed");
  const result = executor.discoverCommand(state, {
    type: "increment",
    actorId: "p1",
    step: "select_amount",
    input: {},
  });

  type DiscoveryResult = CommandDiscoveryResultFor<typeof increment>;
  void (0 as unknown as Assert<Equal<typeof result, DiscoveryResult | null>>);

  if (result?.complete) {
    const amount: number = result.input.amount;
    expect(amount).toBe(1);
  }
});
