import { createStageFactory } from "../../src/stage-factory";
import type { DefinedCommand } from "../../src/types/command";
import type {
  AutomaticStageDefinition,
  SingleActivePlayerStageDefinition,
} from "../../src/types/progression";
import type { GameState as BaseGameState } from "../../src/state-facade/metadata";

export function createTerminalStage<GameState extends BaseGameState>(
  id = "gameEnd",
): AutomaticStageDefinition<GameState> {
  return createStageFactory<GameState>()(id).automatic().build();
}

export function createSelfLoopingTurnStage<GameState extends BaseGameState>(
  commands: readonly DefinedCommand<GameState>[],
  options?: {
    id?: string;
    activePlayerId?: string;
  },
): SingleActivePlayerStageDefinition<GameState> {
  const defineStage = createStageFactory<GameState>();
  const turnStage = createTurnStage();

  return turnStage;

  function createTurnStage(): SingleActivePlayerStageDefinition<GameState> {
    return defineStage(options?.id ?? "turn")
      .singleActivePlayer()
      .activePlayer(() => options?.activePlayerId ?? "player-1")
      .commands(commands)
      .nextStages(() => ({ turnStage }))
      .transition(({ nextStages }) => nextStages.turnStage)
      .build();
  }
}
