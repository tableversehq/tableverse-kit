import { expect, test } from "vitest";
import {
  createCommandFactory,
  createGameExecutor,
  createStageFactory,
  defineGameState,
  GameDefinitionBuilder,
  t,
} from "../src/index";
import type {
  AutomaticStageDefinition,
  SingleActivePlayerStageDefinition,
} from "../src/types/progression";
import { createTerminalStage } from "./helpers/stages";

class RootStateClass {
  moves = 0;
}

const RootState = defineGameState()
  .model({ moves: t.number() })
  .stateClass(RootStateClass)
  .build();

const defineCommand = createCommandFactory<RootStateClass>();
const advance = defineCommand({
  commandId: "advance",
  commandSchema: t.object({}),
})
  .validate(() => ({ ok: true as const }))
  .execute(({ game }) => {
    game.moves += 1;
  })
  .build();

const MOVES_TO_FINISH = 2;

// A game that plays a fixed number of turns and then parks on a terminal stage,
// mirroring how a real game resolves into its end state.
function createCountdownGame() {
  const defineStage = createStageFactory<RootStateClass>();
  const over = createTerminalStage<RootStateClass>("over");

  const resolve: AutomaticStageDefinition<RootStateClass> = defineStage(
    "resolve",
  )
    .automatic()
    .nextStages(() => ({ turn, over }))
    .transition(({ game, nextStages }) =>
      game.moves >= MOVES_TO_FINISH ? nextStages.over : nextStages.turn,
    )
    .build();

  const turn: SingleActivePlayerStageDefinition<RootStateClass> = defineStage(
    "turn",
  )
    .singleActivePlayer()
    .activePlayer(({ runtime }) => runtime.players[0]!)
    .commands([advance])
    .nextStages(() => ({ resolve }))
    .transition(({ nextStages }) => nextStages.resolve)
    .build();

  return new GameDefinitionBuilder("countdown")
    .state(RootState)
    .players({ min: 1, max: 2 })
    .initialStage(turn)
    .setup(() => {})
    .build();
}

const executor = createGameExecutor(createCountdownGame());

function startMatch() {
  return executor.createInitialState({ seed: "seed", players: ["a", "b"] });
}

function advanceOnce(state: ReturnType<typeof startMatch>) {
  const result = executor.executeCommand(state, {
    type: "advance",
    actorId: "a",
    input: {},
  });
  if (!result.ok) {
    throw new Error(`advance was refused: ${result.reason}`);
  }
  return result.state;
}

test("a match in play has not ended", () => {
  const state = startMatch();

  expect(executor.isGameEnded(state)).toBe(false);
});

test("a match that has not reached its terminal stage has not ended", () => {
  const state = advanceOnce(startMatch());

  expect(state.runtime.progression.currentStage.id).toBe("turn");
  expect(executor.isGameEnded(state)).toBe(false);
});

test("a match parked on a terminal stage has ended", () => {
  let state = startMatch();
  for (let move = 0; move < MOVES_TO_FINISH; move += 1) {
    state = advanceOnce(state);
  }

  expect(state.runtime.progression.currentStage).toEqual({
    id: "over",
    kind: "automatic",
  });
  expect(executor.isGameEnded(state)).toBe(true);
});

test("an ended match accepts no further commands", () => {
  let state = startMatch();
  for (let move = 0; move < MOVES_TO_FINISH; move += 1) {
    state = advanceOnce(state);
  }

  const result = executor.executeCommand(state, {
    type: "advance",
    actorId: "a",
    input: {},
  });

  expect(result.ok).toBe(false);
  expect(result.ok ? null : result.reason).toBe("stage_not_accepting_commands");
  expect(executor.listAvailableCommands(state, { actorId: "a" })).toEqual([]);
});
