import { expect, test } from "bun:test";
import {
  createCommandFactory,
  createGameExecutor,
  field,
  GameDefinitionBuilder,
  t,
} from "../src/index";
import { GameState } from "../src/state-facade/metadata";
import { createSelfLoopingTurnStage } from "./helpers/stages";

class RandomDeckRootState extends GameState {
  @field(t.number())
  roll = 0;

  @field(t.number())
  value = 0;

  @field(t.array(t.string()))
  deck = ["a", "b", "c"];

  sampleRandomness(value: number, roll: number, deck: string[]) {
    this.value = value;
    this.roll = roll;
    this.deck = deck;
  }
}

class RandomValueRootState extends GameState {
  @field(t.number())
  value = 0;

  setValue(value: number) {
    this.value = value;
  }
}

test("game executor rng is deterministic for the same seed and command sequence", () => {
  const defineCommand = createCommandFactory<RandomDeckRootState>();
  const emptyCommandSchema = t.object({});
  const sampleRandomnessCommand = defineCommand({
    commandId: "sample_randomness",
    commandSchema: emptyCommandSchema,
  })
    .validate(() => ({ ok: true as const }))
    .execute(({ game, rng }) => {
      game.sampleRandomness(
        rng.number(),
        rng.die(6) as number,
        rng.shuffle(game.deck),
      );
    })
    .build();

  const game = new GameDefinitionBuilder("rng-game")
    .rootState(RandomDeckRootState)
    .initialStage(createSelfLoopingTurnStage([sampleRandomnessCommand]))
    .build();

  const gameExecutorA = createGameExecutor(game);
  const gameExecutorB = createGameExecutor(game);

  const initialA = gameExecutorA.createInitialState("seed-123");
  const initialB = gameExecutorB.createInitialState("seed-123");

  const resultA = gameExecutorA.executeCommand(initialA, {
    type: "sample_randomness",
    actorId: "player-1",
    input: {},
  });
  const resultB = gameExecutorB.executeCommand(initialB, {
    type: "sample_randomness",
    actorId: "player-1",
    input: {},
  });

  expect(resultA.ok).toBe(true);
  expect(resultB.ok).toBe(true);
  expect(resultA.state.game).toEqual(resultB.state.game);
  expect(resultA.state.runtime.rng.cursor).toBe(
    resultB.state.runtime.rng.cursor,
  );
});

test("game executor rng cursor advances when randomness is consumed", () => {
  const defineCommand = createCommandFactory<RandomValueRootState>();
  const emptyCommandSchema = t.object({});
  const sampleRandomnessCommand = defineCommand({
    commandId: "sample_randomness",
    commandSchema: emptyCommandSchema,
  })
    .validate(() => ({ ok: true as const }))
    .execute(({ game, rng }) => {
      game.setValue(rng.number());
    })
    .build();

  const game = new GameDefinitionBuilder("rng-game")
    .rootState(RandomValueRootState)
    .initialStage(createSelfLoopingTurnStage([sampleRandomnessCommand]))
    .build();

  const gameExecutor = createGameExecutor(game);
  const initialState = gameExecutor.createInitialState("seed-123");
  const result = gameExecutor.executeCommand(initialState, {
    type: "sample_randomness",
    actorId: "player-1",
    input: {},
  });

  expect(result.ok).toBe(true);
  expect(initialState.runtime.rng.cursor).toBe(0);
  expect(result.state.runtime.rng.cursor).toBe(1);
});
