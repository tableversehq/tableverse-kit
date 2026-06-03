import { expect, test } from "bun:test";
import { createCommandFactory } from "../src/command-factory";
import { createStageFactory } from "../src/stage-factory";
import { createGameExecutor } from "../src/runtime/game-executor";
import { GameDefinitionBuilder } from "../src/game-definition";
import {
  configureVisibility,
  field,
  GameState,
  t,
} from "../src/state-facade/metadata";
import {
  createSelfLoopingTurnStage,
  createTerminalStage,
} from "./helpers/stages";
import type { SingleActivePlayerStageDefinition } from "../src/types/progression";

const emptyCommandSchema = t.object({});
const amountCommandSchema = t.object({
  amount: t.optional(t.number()),
});
const playCardCommandSchema = t.object({
  cardId: t.optional(t.number()),
});
const selectAmountInputSchema = t.object({});
const selectAmountOutputSchema = t.object({
  amount: t.number(),
  label: t.string(),
});
const confirmAmountInputSchema = t.object({
  amount: t.number(),
});
const confirmAmountOutputSchema = t.object({});
const selectCardInputSchema = t.object({
  cardId: t.number(),
});
const selectCardOutputSchema = t.object({
  cardId: t.number(),
});

class CounterStateFacade extends GameState {
  @field(t.number())
  value = 0;

  increment(amount: number) {
    this.value += amount;
  }
}

class RootCounterStateFacade extends GameState {
  @field(t.state(() => CounterStateFacade))
  counter!: CounterStateFacade;

  setCounterValue(value: number) {
    this.counter.value = value;
  }

  incrementCounter(amount: number) {
    this.counter.increment(amount);
  }

  hasCounterValueAtLeast(minimum: number) {
    return this.counter.value >= minimum;
  }
}

class DefaultChildState extends GameState {
  @field(t.number())
  count = 2;
}

class DefaultRootState extends GameState {
  @field(t.array(t.string()))
  names = ["alpha"];

  @field(t.optional(t.string()))
  label?: string;

  @field(t.state(() => DefaultChildState))
  child!: DefaultChildState;
}

class ExplicitNestedDefaultRootState extends GameState {
  @field(t.state(() => DefaultChildState))
  child = Object.assign(new DefaultChildState(), { count: 5 });
}

class MissingRequiredDefaultRootState extends GameState {
  @field(t.array(t.string()))
  names!: string[];
}

class NullNestedDefaultRootState extends GameState {
  @field(t.state(() => DefaultChildState))
  child: DefaultChildState | null = null;
}

class OptionalNestedDefaultRootState extends GameState {
  @field(t.optional(t.state(() => DefaultChildState)))
  child?: DefaultChildState;
}

class VisiblePlayerState extends GameState {
  @field(t.string())
  id = "";

  @field(t.array(t.string()))
  hand: string[] = [];

  @field(t.number())
  score = 0;
}

const hiddenCountSchema = t.object({
  count: t.number(),
});

const hiddenHandSchema = t.object({
  count: t.number(),
  score: t.number(),
});

class VisibleSummaryPlayerState extends GameState {
  @field(t.string())
  id = "";

  @field(t.array(t.string()))
  hand: string[] = [];

  @field(t.number())
  score = 0;
}

class VisibleSummaryRootState extends GameState {
  @field(
    t.record(
      t.string(),
      t.state(() => VisibleSummaryPlayerState),
    ),
  )
  players: Record<string, VisibleSummaryPlayerState> = {};

  replacePlayers(players: Record<string, VisibleSummaryPlayerState>) {
    this.players = players;
  }
}

class VisibleRootState extends GameState {
  @field(
    t.record(
      t.string(),
      t.state(() => VisiblePlayerState),
    ),
  )
  players: Record<string, VisiblePlayerState> = {};

  replacePlayers(players: Record<string, VisiblePlayerState>) {
    this.players = players;
  }
}

class HiddenDeckState extends GameState {
  @field(t.array(t.string()))
  cards: string[] = [];

  setCards(cards: string[]) {
    this.cards = cards;
  }
}

class HiddenSummaryDeckState extends GameState {
  @field(t.array(t.string()))
  cards: string[] = [];

  setCards(cards: string[]) {
    this.cards = cards;
  }
}

class HiddenSummaryDeckRootState extends GameState {
  @field(t.state(() => HiddenSummaryDeckState))
  deck!: HiddenSummaryDeckState;

  setDeckCards(cards: string[]) {
    this.deck.setCards(cards);
  }
}

class HiddenDeckRootState extends GameState {
  @field(t.state(() => HiddenDeckState))
  deck!: HiddenDeckState;

  setDeckCards(cards: string[]) {
    this.deck.setCards(cards);
  }
}

class PlainCounterRootState extends GameState {
  @field(t.number())
  counter = 0;

  incrementCounter(amount = 1) {
    this.counter += amount;
  }

  decrementCounter(amount = 1) {
    this.counter -= amount;
  }
}

configureVisibility(VisiblePlayerState, ({ field }) => ({
  ownedBy: field.id,
  fields: [field.hand.visibleToSelf()],
}));

configureVisibility(VisibleSummaryPlayerState, ({ field }) => ({
  ownedBy: field.id,
  fields: [
    field.hand.visibleToSelf({
      schema: hiddenHandSchema,
      derive(hand, player) {
        return {
          count: hand.length,
          score: player.score,
        };
      },
    }),
  ],
}));

configureVisibility(HiddenDeckState, ({ field }) => ({
  fields: [field.cards.hidden()],
}));

configureVisibility(HiddenSummaryDeckState, ({ field }) => ({
  fields: [
    field.cards.hidden({
      schema: hiddenCountSchema,
      derive(cards) {
        return {
          count: cards.length,
        };
      },
    }),
  ],
}));

class CanPlayRootState extends GameState {
  @field(t.boolean())
  canPlay = true;
}

class EnergyRootState extends GameState {
  @field(t.number())
  energy = 1;

  spendEnergy(amount = 1) {
    this.energy -= amount;
  }
}

class InvalidSetupScoreRootState extends GameState {
  @field(t.number())
  score = 0;

  assignInvalidScore(value: unknown) {
    this.score = value as number;
  }
}

class InvalidExecutionScoreRootState extends GameState {
  @field(t.number())
  score = 0;

  assignInvalidScore() {
    this.score = "not a number" as never as number;
  }
}

class NumericActionsRootState extends GameState {
  @field(t.number())
  actions = 0;

  @field(t.number())
  cleaned = 0;

  recordAction(amount = 1) {
    this.actions += amount;
  }

  recordCleanup(amount = 1) {
    this.cleaned += amount;
  }
}

class StringActionsRootState extends GameState {
  @field(t.array(t.string()))
  actions: string[] = [];

  recordAction(value: string) {
    this.actions.push(value);
  }
}

test("createGameExecutor hydrates decorated state facades for execution", () => {
  const defineCommand = createCommandFactory<RootCounterStateFacade>();
  const commands = {
    increment_counter: defineCommand({
      commandId: "increment_counter",
      commandSchema: amountCommandSchema,
    })
      .validate(() => ({ ok: true as const }))
      .execute(({ game, command }) => {
        const amount =
          typeof command.input.amount === "number" ? command.input.amount : 1;

        (game as RootCounterStateFacade).incrementCounter(amount);
      })
      .build(),
  };
  const game = new GameDefinitionBuilder("facade-counter-game")
    .rootState(RootCounterStateFacade)
    .initialStage(createSelfLoopingTurnStage(Object.values(commands)))
    .build();

  const executor = createGameExecutor(game);
  const initialState = executor.createInitialState("seed-123");
  const result = executor.executeCommand(initialState, {
    type: "increment_counter",
    actorId: "player-1",
    input: {
      amount: 3,
    },
  });

  expect(initialState.game.counter.value).toBe(0);
  expect(result.ok).toBe(true);
  expect(result.state.game.counter.value).toBe(3);
});

test("executeCommand rejects successful commands that produce invalid canonical state", () => {
  const defineCommand = createCommandFactory<InvalidExecutionScoreRootState>();
  const assignInvalidCommand = defineCommand({
    commandId: "assign_invalid",
    commandSchema: emptyCommandSchema,
  })
    .validate(() => ({ ok: true as const }))
    .execute(({ game }) => {
      game.assignInvalidScore();
    })
    .build();
  const game = new GameDefinitionBuilder("invalid-execution-state-game")
    .rootState(InvalidExecutionScoreRootState)
    .initialStage(createSelfLoopingTurnStage([assignInvalidCommand]))
    .build();
  const executor = createGameExecutor(game);
  const initialState = executor.createInitialState("seed-123");

  expect(() =>
    executor.executeCommand(initialState, {
      type: "assign_invalid",
      actorId: "player-1",
      input: {},
    }),
  ).toThrow("invalid_schema_value");
});

test("createGameExecutor can project viewer-safe visible state", () => {
  const game = new GameDefinitionBuilder("visible-state-game")
    .rootState(RootCounterStateFacade)
    .setup(({ game }) => {
      game.setCounterValue(2);
    })
    .initialStage(createTerminalStage())
    .build();

  const executor = createGameExecutor(game) as {
    createInitialState(rngSeed: string | number): {
      game: { counter: { value: number } };
      runtime: {
        progression: unknown;
        rng: unknown;
        history: unknown;
      };
    };
    getView(
      state: unknown,
      viewer: { kind: "spectator" } | { kind: "player"; playerId: string },
    ): unknown;
  };
  const state = executor.createInitialState("seed-123");
  const visibleState = executor.getView(state, {
    kind: "spectator",
  }) as {
    game: { counter: { value: number } };
    progression: unknown;
    rng?: unknown;
    history?: unknown;
  };

  expect(visibleState.game.counter.value).toBe(2);
  expect(visibleState.progression).toBeDefined();
  expect("rng" in visibleState).toBe(false);
  expect("history" in visibleState).toBe(false);
});

test("createInitialState synthesizes canonical game state from rootState defaults", () => {
  const game = new GameDefinitionBuilder("default-root-state-game")
    .rootState(DefaultRootState)
    .initialStage(createTerminalStage())
    .build();

  const executor = createGameExecutor(game);
  const state = executor.createInitialState("seed-123");

  expect(state.game).toEqual({
    names: ["alpha"],
    label: undefined,
    child: {
      count: 2,
    },
  });
});

test("createInitialState respects explicit nested state initializers", () => {
  const game = new GameDefinitionBuilder("explicit-nested-root-state-game")
    .rootState(ExplicitNestedDefaultRootState)
    .initialStage(createTerminalStage())
    .build();

  const executor = createGameExecutor(game);
  const state = executor.createInitialState("seed-123");

  expect(state.game).toEqual({
    child: {
      count: 5,
    },
  });
});

test("createInitialState leaves missing optional nested state fields undefined", () => {
  const game = new GameDefinitionBuilder("optional-nested-root-state-game")
    .rootState(OptionalNestedDefaultRootState)
    .initialStage(createTerminalStage())
    .build();

  const executor = createGameExecutor(game);
  const state = executor.createInitialState("seed-123");

  expect(state.game).toEqual({
    child: undefined,
  });
});

test("createInitialState rejects invalid canonical game state produced by setup", () => {
  const game = new GameDefinitionBuilder("invalid-setup-state-game")
    .rootState(InvalidSetupScoreRootState)
    .setup(({ game }) => {
      game.assignInvalidScore("bad");
    })
    .initialStage(createTerminalStage())
    .build();

  const executor = createGameExecutor(game);

  expect(() => executor.createInitialState("seed-123")).toThrow(
    "invalid_schema_value",
  );
});

test("createInitialState rejects invalid runtime state produced by stage initialization", () => {
  const defineStage = createStageFactory<PlainCounterRootState>();
  const gameEndStage = defineStage("gameEnd").automatic().build();
  const invalidPlayerTurnStage = defineStage("playerTurn")
    .singleActivePlayer()
    .activePlayer(() => 1 as never as string)
    .commands([])
    .nextStages(() => ({
      gameEndStage,
    }))
    .transition(({ nextStages }) => nextStages.gameEndStage)
    .build();
  const game = new GameDefinitionBuilder("invalid-runtime-state-game")
    .rootState(PlainCounterRootState)
    .initialStage(invalidPlayerTurnStage)
    .build();

  const executor = createGameExecutor(game);

  expect(() => executor.createInitialState("seed-123")).toThrow(
    "invalid_schema_value",
  );
});

test("createInitialState rejects missing rng seed", () => {
  const game = new GameDefinitionBuilder("missing-rng-seed-game")
    .rootState(PlainCounterRootState)
    .initialStage(createTerminalStage())
    .build();
  const executor = createGameExecutor(game);

  expect(() => executor.createInitialState(undefined as never)).toThrow(
    "rng_seed_required",
  );
});

test("createInitialState validates setup input against the declared schema", () => {
  const game = new GameDefinitionBuilder("invalid-setup-input-game")
    .rootState(PlainCounterRootState)
    .setupInput(
      t.object({
        playerIds: t.array(t.string()),
      }),
    )
    .setup(() => {})
    .initialStage(createTerminalStage())
    .build();
  const executor = createGameExecutor(game);

  expect(() =>
    executor.createInitialState(
      {
        playerIds: [1, 2],
      } as never,
      "seed-123",
    ),
  ).toThrow("invalid_schema_value");
});

test("GameDefinitionBuilder fails when a required non-optional field has no default", () => {
  expect(() =>
    new GameDefinitionBuilder("missing-required-root-state-game")
      .rootState(MissingRequiredDefaultRootState)
      .initialStage(createTerminalStage())
      .build(),
  ).toThrow();
});

test("GameDefinitionBuilder fails when a non-optional nested state defaults to null", () => {
  expect(() =>
    new GameDefinitionBuilder("null-nested-root-state-game")
      .rootState(NullNestedDefaultRootState)
      .initialStage(createTerminalStage())
      .build(),
  ).toThrow();
});

test("createGameExecutor projects visibleToSelf fields for the owner only", () => {
  const game = new GameDefinitionBuilder("private-hand-game")
    .rootState(VisibleRootState)
    .setup(({ game }) => {
      game.replacePlayers({
        p1: {
          id: "p1",
          hand: ["a", "b"],
          score: 3,
        } as VisiblePlayerState,
        p2: {
          id: "p2",
          hand: ["x"],
          score: 2,
        } as VisiblePlayerState,
      });
    })
    .initialStage(createTerminalStage())
    .build();

  const executor = createGameExecutor(game) as {
    createInitialState(rngSeed: string | number): unknown;
    getView(
      state: unknown,
      viewer: { kind: "spectator" } | { kind: "player"; playerId: string },
    ): {
      game: {
        players: Record<
          string,
          {
            id: string;
            score: number;
            hand: string[] | { __hidden: true; value?: unknown };
          }
        >;
      };
      progression: unknown;
    };
  };
  const state = executor.createInitialState("seed-123");
  const visibleForP1 = executor.getView(state, {
    kind: "player",
    playerId: "p1",
  });
  const visibleForSpectator = executor.getView(state, {
    kind: "spectator",
  });

  expect(visibleForP1.game.players.p1?.hand).toEqual(["a", "b"]);
  expect(visibleForP1.game.players.p2?.hand).toEqual({
    __hidden: true,
  });
  expect(visibleForSpectator.game.players.p1?.hand).toEqual({
    __hidden: true,
  });
  expect(visibleForSpectator.game.players.p2?.hand).toEqual({
    __hidden: true,
  });
});

test("createGameExecutor projects hidden fields for every viewer", () => {
  const game = new GameDefinitionBuilder("hidden-deck-game")
    .rootState(HiddenDeckRootState)
    .setup(({ game }) => {
      game.setDeckCards(["a", "b", "c"]);
    })
    .initialStage(createTerminalStage())
    .build();

  const executor = createGameExecutor(game) as {
    createInitialState(rngSeed: string | number): unknown;
    getView(
      state: unknown,
      viewer: { kind: "spectator" } | { kind: "player"; playerId: string },
    ): {
      game: {
        deck: {
          cards: { __hidden: true; value?: unknown };
        };
      };
    };
  };
  const state = executor.createInitialState("seed-123");
  const visibleForPlayer = executor.getView(state, {
    kind: "player",
    playerId: "p1",
  });
  const visibleForSpectator = executor.getView(state, {
    kind: "spectator",
  });

  expect(visibleForPlayer.game.deck.cards).toEqual({
    __hidden: true,
  });
  expect(visibleForSpectator.game.deck.cards).toEqual({
    __hidden: true,
  });
});

test("createGameExecutor projects hidden schema values for hidden fields", () => {
  const game = new GameDefinitionBuilder("hidden-summary-deck-game")
    .rootState(HiddenSummaryDeckRootState)
    .setup(({ game }) => {
      game.setDeckCards(["a", "b", "c"]);
    })
    .initialStage(createTerminalStage())
    .build();

  const executor = createGameExecutor(game) as {
    createInitialState(rngSeed: string | number): unknown;
    getView(
      state: unknown,
      viewer: { kind: "spectator" } | { kind: "player"; playerId: string },
    ): {
      game: {
        deck: {
          cards: { __hidden: true; value?: { count: number } };
        };
      };
    };
  };
  const state = executor.createInitialState("seed-123");
  const visibleForPlayer = executor.getView(state, {
    kind: "player",
    playerId: "p1",
  });

  expect(visibleForPlayer.game.deck.cards).toEqual({
    __hidden: true,
    value: {
      count: 3,
    },
  });
});

test("createGameExecutor projects hidden schema values for visibleToSelf fields", () => {
  const game = new GameDefinitionBuilder("private-hand-summary-game")
    .rootState(VisibleSummaryRootState)
    .setup(({ game }) => {
      game.replacePlayers({
        p1: {
          id: "p1",
          hand: ["a", "b"],
          score: 3,
        } as VisibleSummaryPlayerState,
        p2: {
          id: "p2",
          hand: ["x"],
          score: 2,
        } as VisibleSummaryPlayerState,
      });
    })
    .initialStage(createTerminalStage())
    .build();

  const executor = createGameExecutor(game) as {
    createInitialState(rngSeed: string | number): unknown;
    getView(
      state: unknown,
      viewer: { kind: "spectator" } | { kind: "player"; playerId: string },
    ): {
      game: {
        players: Record<
          string,
          {
            id: string;
            score: number;
            hand:
              | string[]
              | { __hidden: true; value?: { count: number; score: number } };
          }
        >;
      };
      progression: unknown;
    };
  };
  const state = executor.createInitialState("seed-123");
  const visibleForP1 = executor.getView(state, {
    kind: "player",
    playerId: "p1",
  });
  const visibleForP2 = executor.getView(state, {
    kind: "player",
    playerId: "p2",
  });

  expect(visibleForP1.game.players.p1?.hand).toEqual(["a", "b"]);
  expect(visibleForP1.game.players.p2?.hand).toEqual({
    __hidden: true,
    value: {
      count: 1,
      score: 2,
    },
  });
  expect(visibleForP2.game.players.p1?.hand).toEqual({
    __hidden: true,
    value: {
      count: 2,
      score: 3,
    },
  });
});

test("createGameExecutor rejects owned player projection when id is empty", () => {
  const game = new GameDefinitionBuilder("invalid-player-owner-game")
    .rootState(VisibleRootState)
    .setup(({ game }) => {
      game.replacePlayers({
        p1: {
          id: "",
          hand: ["a", "b"],
          score: 3,
        } as VisiblePlayerState,
      });
    })
    .initialStage(createTerminalStage())
    .build();

  const executor = createGameExecutor(game);
  const state = executor.createInitialState("seed-123");

  expect(() =>
    executor.getView(state, {
      kind: "spectator",
    }),
  ).toThrow(
    "owned_by_field_requires_non_empty_string_value:VisiblePlayerState:id",
  );
});

test("availability and discovery contexts hydrate readonly decorated state facades", () => {
  const defineCommand = createCommandFactory<RootCounterStateFacade>();
  const commands = {
    increment_counter: defineCommand({
      commandId: "increment_counter",
      commandSchema: amountCommandSchema,
    })
      .discoverable((step) => [
        step("select_amount")
          .initial()
          .input(selectAmountInputSchema)
          .output(selectAmountOutputSchema)
          .resolve(({ discovery, game, input }) => {
            expect(discovery.step).toBe("select_amount");
            expect(discovery.input).toEqual(input);

            if ((game as RootCounterStateFacade).hasCounterValueAtLeast(2)) {
              return [
                {
                  id: "two",
                  output: {
                    amount: 2,
                    label: "Two",
                  },
                  nextInput: {
                    amount: 2,
                  },
                  nextStep: "confirm_amount",
                },
              ];
            }

            return [
              {
                id: "one",
                output: {
                  amount: 1,
                  label: "One",
                },
                nextInput: {
                  amount: 1,
                },
                nextStep: "confirm_amount",
              },
            ];
          })
          .build(),
        step("confirm_amount")
          .input(confirmAmountInputSchema)
          .output(confirmAmountOutputSchema)
          .resolve(({ discovery, input }) => {
            expect(discovery.step).toBe("confirm_amount");
            expect(input).toEqual({
              amount: 2,
            });

            return {
              complete: true as const,
              input,
            };
          })
          .build(),
      ])
      .isAvailable(({ game }) =>
        (game as RootCounterStateFacade).hasCounterValueAtLeast(1),
      )
      .validate(() => ({ ok: true as const }))
      .execute(({ game, command }) => {
        const amount =
          typeof command.input.amount === "number" ? command.input.amount : 1;

        (game as RootCounterStateFacade).incrementCounter(amount);
      })
      .build(),
  };
  const game = new GameDefinitionBuilder("readonly-facade-discovery-game")
    .rootState(RootCounterStateFacade)
    .setup(({ game }) => {
      game.setCounterValue(2);
    })
    .initialStage(createSelfLoopingTurnStage(Object.values(commands)))
    .build();

  const executor = createGameExecutor(game);
  const initialState = executor.createInitialState("seed-123");

  expect(
    executor.listAvailableCommands(initialState, { actorId: "player-1" }),
  ).toEqual(["increment_counter"]);
  expect(
    executor.discoverCommand(initialState, {
      type: "increment_counter",
      actorId: "player-1",
      step: "select_amount",
      input: {},
    }),
  ).toMatchObject({
    complete: false,
    step: "select_amount",
    options: [
      {
        id: "two",
        output: {
          amount: 2,
          label: "Two",
        },
        nextInput: {
          amount: 2,
        },
        nextStep: "confirm_amount",
      },
    ],
  });
  expect(
    executor.discoverCommand(initialState, {
      type: "increment_counter",
      actorId: "player-1",
      step: "confirm_amount",
      input: {
        amount: 2,
      },
    }),
  ).toEqual({
    complete: true,
    input: {
      amount: 2,
    },
  });
  expect(initialState.game.counter.value).toBe(2);
});

test("readonly decorated facades reject mutation during validation", () => {
  const defineCommand = createCommandFactory<RootCounterStateFacade>();
  const commands = {
    increment_counter: defineCommand({
      commandId: "increment_counter",
      commandSchema: emptyCommandSchema,
    })
      .validate(({ game }) => {
        (game as RootCounterStateFacade).incrementCounter(1);
        return { ok: true as const };
      })
      .execute(() => {})
      .build(),
  };
  const game = new GameDefinitionBuilder("readonly-facade-validation-game")
    .rootState(RootCounterStateFacade)
    .initialStage(createSelfLoopingTurnStage(Object.values(commands)))
    .build();

  const executor = createGameExecutor(game);
  const initialState = executor.createInitialState("seed-123");

  expect(() =>
    executor.executeCommand(initialState, {
      type: "increment_counter",
      actorId: "player-1",
      input: {},
    }),
  ).toThrow("readonly_state_facade_mutation:value");
  expect(initialState.game.counter.value).toBe(0);
});

test("createGameExecutor creates initial state and commits successful commands", () => {
  const defineCommand = createCommandFactory<PlainCounterRootState>();
  const commands = {
    increment_counter: defineCommand({
      commandId: "increment_counter",
      commandSchema: amountCommandSchema,
    })
      .validate(() => ({ ok: true as const }))
      .execute(({ game, command, emitEvent }) => {
        const amount =
          typeof command.input.amount === "number" ? command.input.amount : 1;

        game.incrementCounter(amount);
        emitEvent({
          category: "domain",
          type: "counter_incremented",
          payload: { amount },
        });
      })
      .build(),
    decrement_counter: defineCommand({
      commandId: "decrement_counter",
      commandSchema: emptyCommandSchema,
    })
      .validate(({ game }) =>
        game.counter > 0
          ? { ok: true as const }
          : {
              ok: false as const,
              reason: "counter_is_zero",
            },
      )
      .execute(({ game }) => {
        game.decrementCounter();
      })
      .build(),
  };
  const game = new GameDefinitionBuilder("counter-game")
    .rootState(PlainCounterRootState)
    .initialStage(createSelfLoopingTurnStage(Object.values(commands)))
    .build();

  const gameExecutor = createGameExecutor(game);
  const initialState = gameExecutor.createInitialState("test-seed");
  const success = gameExecutor.executeCommand(initialState, {
    type: "increment_counter",
    actorId: "player-1",
    input: { amount: 2 },
  });

  expect(initialState.game.counter).toBe(0);
  expect(initialState.runtime.rng.seed).toBe("test-seed");
  expect(success.ok).toBe(true);
  expect(success.state.game.counter).toBe(2);
  expect(success.events).toHaveLength(3);
  expect(success.events[0]?.type).toBe("counter_incremented");
});

test("createGameExecutor returns unchanged state for validation failures", () => {
  const defineCommand = createCommandFactory<PlainCounterRootState>();
  const commands = {
    decrement_counter: defineCommand({
      commandId: "decrement_counter",
      commandSchema: emptyCommandSchema,
    })
      .validate(({ game }) =>
        game.counter > 0
          ? { ok: true as const }
          : {
              ok: false as const,
              reason: "counter_is_zero",
              metadata: { minimum: 1 },
            },
      )
      .execute(({ game }) => {
        game.decrementCounter();
      })
      .build(),
  };
  const game = new GameDefinitionBuilder("counter-game")
    .rootState(PlainCounterRootState)
    .initialStage(createSelfLoopingTurnStage(Object.values(commands)))
    .build();

  const gameExecutor = createGameExecutor(game);
  const initialState = gameExecutor.createInitialState("seed-123");
  const failure = gameExecutor.executeCommand(initialState, {
    type: "decrement_counter",
    actorId: "player-1",
    input: {},
  });

  expect(failure.ok).toBe(false);

  if (failure.ok) {
    throw new Error("expected validation failure");
  }

  expect(failure.state).toBe(initialState);
  expect(failure.state.game.counter).toBe(0);
  expect(failure.reason).toBe("counter_is_zero");
  expect(failure.metadata).toEqual({ minimum: 1 });
  expect(failure.events).toHaveLength(0);
});

test("createGameExecutor rejects commands missing actorId at runtime", () => {
  const defineCommand = createCommandFactory<PlainCounterRootState>();
  const commands = {
    increment_counter: defineCommand({
      commandId: "increment_counter",
      commandSchema: emptyCommandSchema,
    })
      .validate(() => ({ ok: true as const }))
      .execute(({ game }) => {
        game.incrementCounter();
      })
      .build(),
  };
  const game = new GameDefinitionBuilder("missing-actor-game")
    .rootState(PlainCounterRootState)
    .initialStage(createSelfLoopingTurnStage(Object.values(commands)))
    .build();

  const executor = createGameExecutor(game);
  const initialState = executor.createInitialState("seed-123");
  const result = executor.executeCommand(initialState, {
    type: "increment_counter",
    input: {},
  } as never);

  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error("expected missing actorId failure");
  }

  expect(result.reason).toBe("missing_actor_id");
});

test("createGameExecutor rejects commands missing input at runtime", () => {
  const defineCommand = createCommandFactory<PlainCounterRootState>();
  const commands = {
    increment_counter: defineCommand({
      commandId: "increment_counter",
      commandSchema: emptyCommandSchema,
    })
      .validate(() => ({ ok: true as const }))
      .execute(({ game }) => {
        game.incrementCounter();
      })
      .build(),
  };
  const game = new GameDefinitionBuilder("missing-input-game")
    .rootState(PlainCounterRootState)
    .initialStage(createSelfLoopingTurnStage(Object.values(commands)))
    .build();

  const executor = createGameExecutor(game);
  const initialState = executor.createInitialState("seed-123");
  const result = executor.executeCommand(initialState, {
    type: "increment_counter",
    actorId: "player-1",
  } as never);

  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error("expected missing input failure");
  }

  expect(result.reason).toBe("missing_command_input");
});

test("createGameExecutor rejects discovery missing input at runtime", () => {
  const defineCommand = createCommandFactory<CanPlayRootState>();
  const commands = {
    play_card: defineCommand({
      commandId: "play_card",
      commandSchema: playCardCommandSchema,
    })
      .discoverable((step) => [
        step("select_card")
          .initial()
          .input(selectCardInputSchema)
          .output(selectCardOutputSchema)
          .resolve(() => [
            {
              id: "card-1",
              output: {
                cardId: 1,
              },
              nextInput: {
                cardId: 1,
              },
              nextStep: "select_card",
            },
          ])
          .build(),
      ])
      .validate(() => ({ ok: true as const }))
      .execute(() => {})
      .build(),
  };
  const game = new GameDefinitionBuilder("missing-discovery-input-game")
    .rootState(CanPlayRootState)
    .initialStage(createSelfLoopingTurnStage(Object.values(commands)))
    .build();

  const executor = createGameExecutor(game);
  const initialState = executor.createInitialState("seed-123");
  const result = executor.discoverCommand(initialState, {
    type: "play_card",
    actorId: "player-1",
    step: "select_card",
    input: {},
  } as never);

  expect(result).toBeNull();
});

test("initial automatic stages run before the initial state is returned", () => {
  const defineStage = createStageFactory<RootCounterStateFacade>();
  const gameEndStage = defineStage("gameEnd").automatic().build();
  const bootstrapStage = defineStage("bootstrap")
    .automatic()
    .run(({ game }) => {
      game.incrementCounter(2);
    })
    .nextStages(() => ({
      gameEndStage,
    }))
    .transition(({ nextStages }) => nextStages.gameEndStage)
    .build();

  const game = new GameDefinitionBuilder("bootstrap-stage-game")
    .rootState(RootCounterStateFacade)
    .initialStage(bootstrapStage)
    .build();

  const executor = createGameExecutor(game);
  const initialState = executor.createInitialState("seed-123");

  expect(initialState.game.counter.value).toBe(2);
  expect(initialState.runtime.progression.currentStage).toEqual({
    id: "gameEnd",
    kind: "automatic",
  });
  expect(initialState.runtime.progression.lastActingStage).toBeNull();
});

test("single-active stages reject commands from inactive players", () => {
  const defineCommand = createCommandFactory<NumericActionsRootState>();
  const defineStage = createStageFactory<NumericActionsRootState>();
  const takeActionCommand = defineCommand({
    commandId: "take_action",
    commandSchema: emptyCommandSchema,
  })
    .validate(() => ({ ok: true as const }))
    .execute(({ game }) => {
      game.recordAction();
    })
    .build();
  const playerTurnStage = createPlayerTurnStage();

  function createPlayerTurnStage(): SingleActivePlayerStageDefinition<NumericActionsRootState> {
    return defineStage("playerTurn")
      .singleActivePlayer()
      .activePlayer(() => "player-1")
      .commands([takeActionCommand])
      .nextStages(() => ({ playerTurnStage }))
      .transition(({ nextStages }) => nextStages.playerTurnStage)
      .build();
  }

  const game = new GameDefinitionBuilder("inactive-player-stage-game")
    .rootState(NumericActionsRootState)
    .initialStage(playerTurnStage)
    .build();

  const executor = createGameExecutor(game);
  const initialState = executor.createInitialState("seed-123");
  const result = executor.executeCommand(initialState, {
    type: "take_action",
    actorId: "player-2",
    input: {},
  });

  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error("expected inactive-player rejection");
  }

  expect(result.reason).toBe("not_active_player");
});

test("multi-active stages stay active until completion and recompute active players from memory", () => {
  const defineCommand = createCommandFactory<StringActionsRootState>();
  const defineStage = createStageFactory<StringActionsRootState>();
  const submitActionCommand = defineCommand({
    commandId: "submit_action",
    commandSchema: t.object({
      value: t.string(),
    }),
  })
    .validate(() => ({ ok: true as const }))
    .execute(({ game, command }) => {
      game.recordAction(command.input.value);
    })
    .build();
  const gameEndStage = defineStage("gameEnd").automatic().build();
  const coordinatedStage = defineStage("coordinatedStage")
    .multiActivePlayer()
    .memory(
      t.object({
        submittedByPlayerId: t.record(t.string(), t.string()),
      }),
      () => ({
        submittedByPlayerId: {} as Record<string, string>,
      }),
    )
    .activePlayers(({ memory }) => {
      return ["player-1", "player-2"].filter((playerId) => {
        return memory.submittedByPlayerId[playerId] === undefined;
      });
    })
    .commands([submitActionCommand])
    .onSubmit(({ command, execute, memory }) => {
      memory.submittedByPlayerId[command.actorId] = command.input.value;
      execute(command);
    })
    .isComplete(({ memory }) => {
      return Object.keys(memory.submittedByPlayerId).length === 2;
    })
    .nextStages(() => ({
      gameEndStage,
    }))
    .transition(({ nextStages, memory }) => {
      expect(memory.submittedByPlayerId).toEqual({
        "player-1": "first",
        "player-2": "second",
      });
      return nextStages.gameEndStage;
    })
    .build();

  const game = new GameDefinitionBuilder("multi-active-game")
    .rootState(StringActionsRootState)
    .initialStage(coordinatedStage)
    .build();

  const executor = createGameExecutor(game);
  const initialState = executor.createInitialState("seed-123");

  expect(initialState.runtime.progression.currentStage).toEqual({
    id: "coordinatedStage",
    kind: "multiActivePlayer",
    activePlayerIds: ["player-1", "player-2"],
    memory: {
      submittedByPlayerId: {},
    },
  });

  const afterFirstSubmission = executor.executeCommand(initialState, {
    type: "submit_action",
    actorId: "player-1",
    input: {
      value: "first",
    },
  });

  expect(afterFirstSubmission.ok).toBe(true);

  if (!afterFirstSubmission.ok) {
    throw new Error("expected first multi-active submission to succeed");
  }

  expect(afterFirstSubmission.state.game.actions).toEqual(["first"]);
  expect(afterFirstSubmission.state.runtime.progression.currentStage).toEqual({
    id: "coordinatedStage",
    kind: "multiActivePlayer",
    activePlayerIds: ["player-2"],
    memory: {
      submittedByPlayerId: {
        "player-1": "first",
      },
    },
  });

  const inactiveResult = executor.executeCommand(afterFirstSubmission.state, {
    type: "submit_action",
    actorId: "player-1",
    input: {
      value: "duplicate",
    },
  });

  expect(inactiveResult.ok).toBe(false);

  if (inactiveResult.ok) {
    throw new Error("expected inactive multi-active submission rejection");
  }

  expect(inactiveResult.reason).toBe("not_active_player");

  const afterSecondSubmission = executor.executeCommand(
    afterFirstSubmission.state,
    {
      type: "submit_action",
      actorId: "player-2",
      input: {
        value: "second",
      },
    },
  );

  expect(afterSecondSubmission.ok).toBe(true);

  if (!afterSecondSubmission.ok) {
    throw new Error("expected second multi-active submission to succeed");
  }

  expect(afterSecondSubmission.state.game.actions).toEqual(["first", "second"]);
  expect(afterSecondSubmission.state.runtime.progression.currentStage).toEqual({
    id: "gameEnd",
    kind: "automatic",
  });
  expect(
    afterSecondSubmission.state.runtime.progression.lastActingStage,
  ).toEqual({
    id: "coordinatedStage",
    kind: "multiActivePlayer",
    activePlayerIds: [],
    memory: {
      submittedByPlayerId: {
        "player-1": "first",
        "player-2": "second",
      },
    },
  });
});

test("successful stage-machine commands transition through automatic stages and emit stage events", () => {
  const defineCommand = createCommandFactory<NumericActionsRootState>();
  const defineStage = createStageFactory<NumericActionsRootState>();
  const takeActionCommand = defineCommand({
    commandId: "take_action",
    commandSchema: emptyCommandSchema,
  })
    .validate(() => ({ ok: true as const }))
    .execute(({ game, emitEvent }) => {
      game.recordAction();
      emitEvent({
        category: "domain",
        type: "action_taken",
        payload: { amount: 1 },
      });
    })
    .build();
  const gameEndStage = defineStage("gameEnd").automatic().build();
  const cleanupStage = defineStage("cleanup")
    .automatic()
    .run(({ game, emitEvent }) => {
      game.recordCleanup();
      emitEvent({
        category: "runtime",
        type: "cleanup_ran",
        payload: { cleaned: game.cleaned },
      });
    })
    .nextStages(() => ({
      gameEndStage,
    }))
    .transition(({ nextStages }) => nextStages.gameEndStage)
    .build();
  const playerTurnStage = defineStage("playerTurn")
    .singleActivePlayer()
    .activePlayer(() => "player-1")
    .commands([takeActionCommand])
    .nextStages(() => ({
      cleanupStage,
    }))
    .transition(({ nextStages }) => nextStages.cleanupStage)
    .build();

  const game = new GameDefinitionBuilder("stage-transition-game")
    .rootState(NumericActionsRootState)
    .initialStage(playerTurnStage)
    .build();

  const executor = createGameExecutor(game);
  const initialState = executor.createInitialState("seed-123");
  const result = executor.executeCommand(initialState, {
    type: "take_action",
    actorId: "player-1",
    input: {},
  });

  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error("expected stage-machine transition");
  }

  expect(result.state.game).toMatchObject({
    actions: 1,
    cleaned: 1,
  });
  expect(result.state.runtime.progression.currentStage).toEqual({
    id: "gameEnd",
    kind: "automatic",
  });
  expect(result.state.runtime.progression.lastActingStage).toEqual({
    id: "playerTurn",
    kind: "activePlayer",
    activePlayerId: "player-1",
  });
  expect(result.events.map((event) => event.type)).toEqual([
    "action_taken",
    "stage_exited",
    "stage_entered",
    "cleanup_ran",
    "stage_exited",
    "stage_entered",
  ]);
  expect(result.events[2]).toMatchObject({
    category: "runtime",
    type: "stage_entered",
    payload: {
      stageId: "cleanup",
      kind: "automatic",
    },
  });
  expect(result.events[5]).toMatchObject({
    category: "runtime",
    type: "stage_entered",
    payload: {
      stageId: "gameEnd",
      kind: "automatic",
    },
  });
});

test("automatic stages hydrate decorated state facades during run", () => {
  const defineStage = createStageFactory<RootCounterStateFacade>();
  const gameEndStage = defineStage("gameEnd").automatic().build();
  const cleanupStage = defineStage("cleanup")
    .automatic()
    .run(({ game }) => {
      game.incrementCounter(3);
    })
    .nextStages(() => ({
      gameEndStage,
    }))
    .transition(({ nextStages }) => nextStages.gameEndStage)
    .build();

  const game = new GameDefinitionBuilder("automatic-facade-game")
    .rootState(RootCounterStateFacade)
    .initialStage(cleanupStage)
    .build();

  const executor = createGameExecutor(game);
  const initialState = executor.createInitialState("seed-123");

  expect(initialState.game.counter.value).toBe(3);
  expect(initialState.runtime.progression.currentStage).toEqual({
    id: "gameEnd",
    kind: "automatic",
  });
  expect(initialState.runtime.progression.lastActingStage).toBeNull();
});

test("game executor can list available commands through per-command availability hooks", () => {
  const defineCommand = createCommandFactory<EnergyRootState>();
  const commands = {
    pass_turn: defineCommand({
      commandId: "pass_turn",
      commandSchema: emptyCommandSchema,
    })
      .isAvailable(() => true)
      .validate(() => ({ ok: true as const }))
      .execute(() => {})
      .build(),
    spend_energy: defineCommand({
      commandId: "spend_energy",
      commandSchema: emptyCommandSchema,
    })
      .isAvailable(({ game }) => game.energy > 0)
      .validate(({ game }) =>
        game.energy > 0
          ? { ok: true as const }
          : { ok: false as const, reason: "no_energy" },
      )
      .execute(({ game }) => {
        game.spendEnergy();
      })
      .build(),
    impossible_action: defineCommand({
      commandId: "impossible_action",
      commandSchema: emptyCommandSchema,
    })
      .isAvailable(() => false)
      .validate(() => ({ ok: true as const }))
      .execute(() => {})
      .build(),
  };
  const game = new GameDefinitionBuilder("availability-game")
    .rootState(EnergyRootState)
    .initialStage(createSelfLoopingTurnStage(Object.values(commands)))
    .build();

  const gameExecutor = createGameExecutor(game);
  const initialState = gameExecutor.createInitialState("seed-123");

  expect(
    gameExecutor.listAvailableCommands(initialState, { actorId: "player-1" }),
  ).toEqual(["pass_turn", "spend_energy"]);

  const nextState = gameExecutor.executeCommand(initialState, {
    type: "spend_energy",
    actorId: "player-1",
    input: {},
  });

  expect(nextState.ok).toBe(true);

  if (!nextState.ok) {
    throw new Error("expected spending energy to succeed");
  }

  expect(
    gameExecutor.listAvailableCommands(nextState.state, {
      actorId: "player-1",
    }),
  ).toEqual(["pass_turn"]);
});

test("game executor can discover the next semantic options for a command", () => {
  const defineCommand = createCommandFactory<CanPlayRootState>();
  const commands = {
    play_card: defineCommand({
      commandId: "play_card",
      commandSchema: playCardCommandSchema,
    })
      .discoverable((step) => [
        step("select_card")
          .initial()
          .input(selectAmountInputSchema)
          .output(selectCardOutputSchema)
          .resolve(() => [
            {
              id: "card-1",
              output: {
                cardId: 1,
              },
              nextInput: {
                cardId: 1,
              },
              nextStep: "select_target",
            },
            {
              id: "card-2",
              output: {
                cardId: 2,
              },
              nextInput: {
                cardId: 2,
              },
              nextStep: "select_target",
            },
          ])
          .build(),
        step("select_target")
          .input(selectCardInputSchema)
          .output(
            t.object({
              targetId: t.number(),
            }),
          )
          .resolve(({ input }) => ({
            complete: true as const,
            input: {
              cardId: input.cardId,
            },
          }))
          .build(),
      ])
      .isAvailable(({ game }) => game.canPlay)
      .validate(() => ({ ok: true as const }))
      .execute(() => {})
      .build(),
  };
  const game = new GameDefinitionBuilder("discovery-game")
    .rootState(CanPlayRootState)
    .initialStage(createSelfLoopingTurnStage(Object.values(commands)))
    .build();

  const gameExecutor = createGameExecutor(game);
  const initialState = gameExecutor.createInitialState("seed-123");
  const firstStep = gameExecutor.discoverCommand(initialState, {
    type: "play_card",
    actorId: "player-1",
    step: "select_card",
    input: {},
  });
  const secondStep = gameExecutor.discoverCommand(initialState, {
    type: "play_card",
    actorId: "player-1",
    step: "select_target",
    input: {
      cardId: 2,
    },
  });

  expect(firstStep).toMatchObject({
    complete: false,
    step: "select_card",
  });
  if (!firstStep || firstStep.complete) {
    throw new Error("expected_incomplete_discovery");
  }
  expect(firstStep.options).toHaveLength(2);
  expect(secondStep).toMatchObject({
    complete: true,
    input: {
      cardId: 2,
    },
  });
  expect(firstStep?.complete).toBe(false);
  if (!firstStep || firstStep.complete) {
    throw new Error("expected_incomplete_discovery");
  }
  expect(firstStep.options).toEqual([
    {
      id: "card-1",
      output: {
        cardId: 1,
      },
      nextInput: {
        cardId: 1,
      },
      nextStep: "select_target",
    },
    {
      id: "card-2",
      output: {
        cardId: 2,
      },
      nextInput: {
        cardId: 2,
      },
      nextStep: "select_target",
    },
  ]);
});

test("createGameExecutor rejects invalid discovery results for step-authored commands", () => {
  const defineCommand = createCommandFactory<CanPlayRootState>();
  const commands = {
    invalid_output: defineCommand({
      commandId: "invalid_output",
      commandSchema: playCardCommandSchema,
    })
      .discoverable((step) => [
        step("select_card")
          .initial()
          .input(selectAmountInputSchema)
          .output(selectCardOutputSchema)
          .resolve(() => [
            {
              id: "card-1",
              output: {
                cardId: "bad",
              } as never,
              nextInput: {
                cardId: 1,
              },
              nextStep: "select_card",
            },
          ])
          .build(),
      ])
      .validate(() => ({ ok: true as const }))
      .execute(() => {})
      .build(),
    invalid_completion: defineCommand({
      commandId: "invalid_completion",
      commandSchema: playCardCommandSchema,
    })
      .discoverable((step) => [
        step("select_target")
          .initial()
          .input(selectCardInputSchema)
          .output(t.object({ targetId: t.number() }))
          .resolve(() => ({
            complete: true as const,
            input: {
              cardId: "bad",
            } as never,
          }))
          .build(),
      ])
      .validate(() => ({ ok: true as const }))
      .execute(() => {})
      .build(),
    malformed_completion: defineCommand({
      commandId: "malformed_completion",
      commandSchema: playCardCommandSchema,
    })
      .discoverable((step) => [
        step("select_target")
          .initial()
          .input(selectCardInputSchema)
          .output(t.object({ targetId: t.number() }))
          .resolve(
            () =>
              ({
                complete: false as const,
                input: {
                  cardId: 2,
                },
              }) as never,
          )
          .build(),
      ])
      .validate(() => ({ ok: true as const }))
      .execute(() => {})
      .build(),
    missing_next_step: defineCommand({
      commandId: "missing_next_step",
      commandSchema: playCardCommandSchema,
    })
      .discoverable((step) => [
        step("select_card")
          .initial()
          .input(selectAmountInputSchema)
          .output(selectCardOutputSchema)
          .resolve(() => [
            {
              id: "card-1",
              output: {
                cardId: 1,
              },
              nextInput: {
                cardId: 1,
              },
            } as never,
          ])
          .build(),
      ])
      .validate(() => ({ ok: true as const }))
      .execute(() => {})
      .build(),
    undeclared_next_step: defineCommand({
      commandId: "undeclared_next_step",
      commandSchema: playCardCommandSchema,
    })
      .discoverable((step) => [
        step("select_card")
          .initial()
          .input(selectAmountInputSchema)
          .output(selectCardOutputSchema)
          .resolve(() => [
            {
              id: "card-1",
              output: {
                cardId: 1,
              },
              nextInput: {
                cardId: 1,
              },
              nextStep: "missing_step",
            },
          ])
          .build(),
      ])
      .validate(() => ({ ok: true as const }))
      .execute(() => {})
      .build(),
    invalid_next_input: defineCommand({
      commandId: "invalid_next_input",
      commandSchema: playCardCommandSchema,
    })
      .discoverable((step) => [
        step("select_card")
          .initial()
          .input(selectAmountInputSchema)
          .output(selectCardOutputSchema)
          .resolve(() => [
            {
              id: "card-1",
              output: {
                cardId: 1,
              },
              nextInput: {
                amount: "bad",
              } as never,
              nextStep: "select_target",
            },
          ])
          .build(),
        step("select_target")
          .input(selectCardInputSchema)
          .output(t.object({ targetId: t.number() }))
          .resolve(() => [])
          .build(),
      ])
      .validate(() => ({ ok: true as const }))
      .execute(() => {})
      .build(),
  };
  const game = new GameDefinitionBuilder("invalid-step-discovery-game")
    .rootState(CanPlayRootState)
    .initialStage(createSelfLoopingTurnStage(Object.values(commands)))
    .build();

  const executor = createGameExecutor(game);
  const initialState = executor.createInitialState("seed-123");

  expect(
    executor.discoverCommand(initialState, {
      type: "invalid_output",
      actorId: "player-1",
      step: "select_card",
      input: {},
    }),
  ).toBeNull();
  expect(
    executor.discoverCommand(initialState, {
      type: "invalid_completion",
      actorId: "player-1",
      step: "select_target",
      input: {
        cardId: 2,
      },
    }),
  ).toBeNull();
  expect(
    executor.discoverCommand(initialState, {
      type: "malformed_completion",
      actorId: "player-1",
      step: "select_target",
      input: {
        cardId: 2,
      },
    }),
  ).toBeNull();
  expect(
    executor.discoverCommand(initialState, {
      type: "missing_next_step",
      actorId: "player-1",
      step: "select_card",
      input: {},
    }),
  ).toBeNull();
  expect(
    executor.discoverCommand(initialState, {
      type: "undeclared_next_step",
      actorId: "player-1",
      step: "select_card",
      input: {},
    }),
  ).toBeNull();
  expect(
    executor.discoverCommand(initialState, {
      type: "invalid_next_input",
      actorId: "player-1",
      step: "select_card",
      input: {},
    }),
  ).toBeNull();
});

test("executor APIs reject invalid incoming canonical state", () => {
  const defineCommand = createCommandFactory<PlainCounterRootState>();
  const incrementCounterCommand = defineCommand({
    commandId: "increment_counter",
    commandSchema: amountCommandSchema,
  })
    .discoverable((step) => [
      step("pick_amount")
        .initial()
        .input(amountCommandSchema)
        .output(
          t.object({
            amount: t.number(),
          }),
        )
        .resolve(() => [
          {
            id: "one",
            output: {
              amount: 1,
            },
            nextInput: {
              amount: 1,
            },
            nextStep: "pick_amount",
          },
        ])
        .build(),
    ])
    .validate(() => ({ ok: true as const }))
    .execute(({ game, command }) => {
      const amount =
        typeof command.input.amount === "number" ? command.input.amount : 1;

      game.incrementCounter(amount);
    })
    .build();
  const game = new GameDefinitionBuilder("invalid-canonical-state-apis-game")
    .rootState(PlainCounterRootState)
    .initialStage(createSelfLoopingTurnStage([incrementCounterCommand]))
    .build();

  const executor = createGameExecutor(game);
  const initialState = executor.createInitialState("seed-123");
  const invalidGameState = {
    game: {
      counter: "bad",
    },
    runtime: initialState.runtime,
  } as never;
  const stateWithUndeclaredGameField = {
    game: {
      ...initialState.game,
      cache: "not canonical",
    },
    runtime: initialState.runtime,
  } as never;
  const invalidRuntimeState = {
    game: initialState.game,
    runtime: {
      ...initialState.runtime,
      progression: {
        ...initialState.runtime.progression,
        currentStage: {
          ...initialState.runtime.progression.currentStage,
          activePlayerId: 1,
        },
      },
    },
  } as never;

  expect(() =>
    executor.getView(invalidGameState, {
      kind: "spectator",
    }),
  ).toThrow("invalid_schema_value");
  expect(() =>
    executor.getView(stateWithUndeclaredGameField, {
      kind: "spectator",
    }),
  ).toThrow("invalid_schema_value");
  expect(() =>
    executor.listAvailableCommands(invalidRuntimeState, {
      actorId: "player-1",
    }),
  ).toThrow("invalid_schema_value");
  expect(() =>
    executor.discoverCommand(invalidRuntimeState, {
      type: "increment_counter",
      actorId: "player-1",
      step: "pick_amount",
      input: {},
    }),
  ).toThrow("invalid_schema_value");
  expect(() =>
    executor.executeCommand(invalidGameState, {
      type: "increment_counter",
      actorId: "player-1",
      input: {},
    }),
  ).toThrow("invalid_schema_value");
});
