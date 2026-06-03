import { expect, test } from "bun:test";
import {
  appendReplayStep,
  createCommandFactory,
  createGameExecutor,
  field,
  GameDefinitionBuilder,
  createReplayRecord,
  createSnapshot,
  replayRecord,
  restoreSnapshot,
  t,
} from "../src/index";
import { GameState } from "../src/state-facade/metadata";
import { createSelfLoopingTurnStage } from "./helpers/stages";

class ReplayRootState extends GameState {
  @field(t.number())
  counter = 0;

  @field(t.number())
  value = 0;

  incrementCounter(amount = 1) {
    this.counter += amount;
  }

  setValue(value: number) {
    this.value = value;
  }
}

test("snapshots restore canonical state and replay reproduces final state", () => {
  const defineCommand = createCommandFactory<ReplayRootState>();
  const incrementCommandSchema = t.object({
    amount: t.optional(t.number()),
  });
  const emptyCommandSchema = t.object({});
  const incrementCounterCommand = defineCommand({
    commandId: "increment_counter",
    commandSchema: incrementCommandSchema,
  })
    .validate(() => ({ ok: true as const }))
    .execute(({ game, command }) => {
      const amount =
        typeof command.input.amount === "number" ? command.input.amount : 1;

      game.incrementCounter(amount);
    })
    .build();
  const sampleRandomnessCommand = defineCommand({
    commandId: "sample_randomness",
    commandSchema: emptyCommandSchema,
  })
    .validate(() => ({ ok: true as const }))
    .execute(({ game, rng }) => {
      game.setValue(rng.number());
    })
    .build();

  const game = new GameDefinitionBuilder("replay-game")
    .rootState(ReplayRootState)
    .initialStage(
      createSelfLoopingTurnStage([
        incrementCounterCommand,
        sampleRandomnessCommand,
      ]),
    )
    .build();

  const gameExecutor = createGameExecutor(game);
  const initialState = gameExecutor.createInitialState("seed-123");
  const initialSnapshot = createSnapshot(initialState);
  const restoredInitialState = restoreSnapshot(initialSnapshot);
  let replay = createReplayRecord(initialSnapshot);

  const firstCommand = {
    type: "increment_counter",
    actorId: "player-1",
    input: { amount: 2 },
  } as const;
  const secondCommand = {
    type: "sample_randomness",
    actorId: "player-1",
    input: {},
  } as const;

  const firstResult = gameExecutor.executeCommand(
    restoredInitialState,
    firstCommand,
  );
  replay = appendReplayStep(replay, firstCommand, firstResult);

  const secondResult = gameExecutor.executeCommand(
    firstResult.state,
    secondCommand,
  );
  replay = appendReplayStep(replay, secondCommand, secondResult);

  const replayedState = replayRecord(gameExecutor, replay);

  expect(restoredInitialState).toEqual(initialState);
  expect(replay.commands).toHaveLength(2);
  expect(replay.events).toHaveLength(4);
  expect(replayedState).toEqual(secondResult.state);
});

test("replay rejects invalid canonical state restored from snapshot", () => {
  const defineCommand = createCommandFactory<ReplayRootState>();
  const incrementCounterCommand = defineCommand({
    commandId: "increment_counter",
    commandSchema: t.object({}),
  })
    .validate(() => ({ ok: true as const }))
    .execute(({ game }) => {
      game.incrementCounter(1);
    })
    .build();

  const game = new GameDefinitionBuilder("invalid-replay-game")
    .rootState(ReplayRootState)
    .initialStage(createSelfLoopingTurnStage([incrementCounterCommand]))
    .build();
  const gameExecutor = createGameExecutor(game);
  const initialState = gameExecutor.createInitialState("seed-123");
  const invalidSnapshot = createSnapshot({
    game: {
      counter: "bad",
      value: 0,
    },
    runtime: initialState.runtime,
  } as never);
  const replay = createReplayRecord(invalidSnapshot);
  replay.commands.push({
    type: "increment_counter",
    actorId: "player-1",
    input: {},
  });

  expect(() => replayRecord(gameExecutor, replay)).toThrow(
    "invalid_schema_value",
  );
});
