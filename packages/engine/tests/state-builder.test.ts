import { expect, test } from "bun:test";
import {
  assertSchemaValue,
  createCommandFactory,
  createGameExecutor,
  createStageFactory,
  defineGameState,
  GameDefinitionBuilder,
  t,
} from "../src/index";
import type { SingleActivePlayerStageDefinition } from "../src/types/progression";
import { compileStateFacadeDefinition } from "../src/state-facade/compile";
import { hydrateStateFacade } from "../src/state-facade/hydrate";

class CounterStateClass {
  value = 0;

  increment(amount = 1): void {
    this.value += amount;
  }
}

const CounterState = defineGameState()
  .model({
    value: t.number(),
  })
  .stateClass(CounterStateClass)
  .build();

class PlayerStateClass {
  id = "";
  hand: string[] = [];
  counter = new CounterStateClass();

  draw(cardId: string): void {
    this.hand.push(cardId);
  }
}

const PlayerState = defineGameState()
  .model({
    id: t.string(),
    hand: t.array(t.string()),
    counter: t.state(CounterState),
  })
  .stateClass(PlayerStateClass)
  .visibility((v) => [
    v.ownedBy("id"),
    v.field("hand").visibleToSelf({
      hidden: {
        schema: t.object({ count: t.number() }),
        derive: (hand) => ({ count: hand.length }),
      },
    }),
  ])
  .build();

class RootStateClass {
  players: Record<string, PlayerStateClass> = {};
  deck: string[] = [];

  drawFor(playerId: string): void {
    const player = this.players[playerId];
    const card = this.deck.shift();

    if (!player || !card) {
      throw new Error("cannot_draw");
    }

    player.draw(card);
  }
}

const RootState = defineGameState()
  .model({
    players: t.record(t.string(), t.state(PlayerState)),
    deck: t.array(t.string()),
  })
  .stateClass(RootStateClass)
  .build();

function createCounterGame() {
  const defineCommand = createCommandFactory<RootStateClass>();
  const draw = defineCommand({
    commandId: "draw",
    commandSchema: t.object({}),
  })
    .validate(() => ({ ok: true as const }))
    .execute(({ game, command }) => {
      game.drawFor(command.actorId);
    })
    .build();

  const defineStage = createStageFactory<RootStateClass>();
  const turnStage: SingleActivePlayerStageDefinition<RootStateClass> =
    defineStage("turn")
      .singleActivePlayer()
      .activePlayer(() => "p1")
      .commands([draw])
      .nextStages(() => ({ turnStage }))
      .transition(({ nextStages }) => nextStages.turnStage)
      .build();

  return new GameDefinitionBuilder("builder-game")
    .state(RootState)
    .initialStage(turnStage)
    .setup(({ game }) => {
      game.players = {
        p1: Object.assign(new PlayerStateClass(), {
          id: "p1",
          hand: [],
          counter: Object.assign(new CounterStateClass(), { value: 0 }),
        }),
        p2: Object.assign(new PlayerStateClass(), {
          id: "p2",
          hand: [],
          counter: Object.assign(new CounterStateClass(), { value: 0 }),
        }),
      };
      game.deck = ["c1", "c2"];
    })
    .build();
}

test("hydration exposes nested state classes and guards direct mutation", () => {
  const compiled = compileStateFacadeDefinition(RootState);
  const backing = {
    players: {
      p1: {
        id: "p1",
        hand: [],
        counter: { value: 0 },
      },
    },
    deck: ["c1"],
  };

  const root = hydrateStateFacade<typeof RootState>(compiled, backing);
  root.drawFor("p1");

  expect(root.players.p1?.hand).toEqual(["c1"]);
  expect(root.players.p1?.counter).toBeInstanceOf(CounterStateClass);

  expect(() => {
    root.deck = [];
  }).toThrow("direct_state_mutation_not_allowed:deck");

  const readonlyRoot = hydrateStateFacade<typeof RootState>(compiled, backing, {
    readonly: true,
  });

  expect(() => {
    readonlyRoot.drawFor("p1");
  }).toThrow("readonly_state_facade_mutation");
});

test("executor executes commands and projects visible state", () => {
  const game = createCounterGame();
  const executor = createGameExecutor(game);
  const initialState = executor.createInitialState("seed");
  const result = executor.executeCommand(initialState, {
    type: "draw",
    actorId: "p1",
    input: {},
  });

  expect(result.ok).toBeTrue();

  if (!result.ok) {
    return;
  }

  expect(result.state.game.players.p1?.hand).toEqual(["c1"]);

  const selfView = executor.getView(result.state, {
    kind: "player",
    playerId: "p1",
  });
  const otherView = executor.getView(result.state, {
    kind: "player",
    playerId: "p2",
  });

  expect(selfView.game.players.p1?.hand).toEqual(["c1"]);
  expect(otherView.game.players.p1?.hand).toEqual({
    __hidden: true,
    value: { count: 1 },
  });
  expect(() =>
    assertSchemaValue(game.visibleStateSchema, selfView),
  ).not.toThrow();
});

test("setup input is validated and passed to setup", () => {
  class SetupStateClass {
    playerIds: string[] = [];
  }

  const SetupState = defineGameState()
    .model({
      playerIds: t.array(t.string()),
    })
    .stateClass(SetupStateClass)
    .build();

  const defineStage = createStageFactory<SetupStateClass>();
  const stage = defineStage("bootstrap").automatic().build();
  const executor = createGameExecutor(
    new GameDefinitionBuilder("setup-game")
      .state(SetupState)
      .initialStage(stage)
      .setupInput(t.object({ playerIds: t.array(t.string()) }))
      .setup(({ game, input }) => {
        game.playerIds = input.playerIds;
      })
      .build(),
  );

  expect(() =>
    executor.createInitialState(
      { playerIds: [1] as unknown as string[] },
      "seed",
    ),
  ).toThrow("invalid_schema_value");

  const state = executor.createInitialState({ playerIds: ["p1"] }, "seed");
  expect(state.game.playerIds).toEqual(["p1"]);
});
