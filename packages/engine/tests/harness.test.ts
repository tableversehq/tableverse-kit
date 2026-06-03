import { expect, test } from "bun:test";
import {
  createCommandFactory,
  createGameExecutor,
  field,
  GameDefinitionBuilder,
  runScenario,
  t,
} from "../src/index";
import { GameState } from "../src/state-facade/metadata";
import { createSelfLoopingTurnStage } from "./helpers/stages";

class HarnessCounterRootState extends GameState {
  @field(t.number())
  counter = 0;

  incrementCounter(amount = 1) {
    this.counter += amount;
  }
}

test("runScenario applies commands in order and returns per-command results", () => {
  const defineCommand = createCommandFactory<HarnessCounterRootState>();
  const incrementCommandSchema = t.object({
    amount: t.optional(t.number()),
  });
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

  const game = new GameDefinitionBuilder("counter-game")
    .rootState(HarnessCounterRootState)
    .initialStage(createSelfLoopingTurnStage([incrementCounterCommand]))
    .build();

  const gameExecutor = createGameExecutor(game);
  const scenario = runScenario(
    gameExecutor,
    [
      { type: "increment_counter", actorId: "player-1", input: { amount: 2 } },
      { type: "increment_counter", actorId: "player-1", input: { amount: 3 } },
    ],
    "seed-123",
  );

  expect(scenario.initialState.game.counter).toBe(0);
  expect(scenario.finalState.game.counter).toBe(5);
  expect(scenario.results).toHaveLength(2);
  expect(scenario.results[0]?.ok).toBe(true);
  expect(scenario.results[1]?.ok).toBe(true);
});
