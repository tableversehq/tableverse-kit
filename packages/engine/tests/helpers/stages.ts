import { createStageFactory } from "../../src/stage-factory";
import type { DefinedCommand } from "../../src/types/command";
import type {
  AutomaticStageDefinition,
  SingleActivePlayerStageDefinition,
} from "../../src/types/progression";

export function createTerminalStage<HydratedState extends object>(
  id = "gameEnd",
): AutomaticStageDefinition<HydratedState> {
  return createStageFactory<HydratedState>()(id).automatic().build();
}

export function createSelfLoopingTurnStage<HydratedState extends object>(
  commands: readonly DefinedCommand<HydratedState>[],
  options?: {
    id?: string;
    activePlayerId?: string;
  },
): SingleActivePlayerStageDefinition<HydratedState> {
  const defineStage = createStageFactory<HydratedState>();
  const turnStage = createTurnStage();

  return turnStage;

  function createTurnStage(): SingleActivePlayerStageDefinition<HydratedState> {
    return defineStage(options?.id ?? "turn")
      .singleActivePlayer()
      .activePlayer(() => options?.activePlayerId ?? "player-1")
      .commands(commands)
      .nextStages(() => ({ turnStage }))
      .transition(({ nextStages }) => nextStages.turnStage)
      .build();
  }
}
