import type {
  AutomaticStageDefinition,
  SingleActivePlayerStageDefinition,
  StageFactory,
} from "@tableverse-kit/engine";
import type { SplendorGameState } from "../state.ts";
import { getLastActingPlayerId } from "./shared.ts";

interface CreateCheckVictoryConditionStageOptions {
  defineStage: StageFactory<SplendorGameState>;
  getGameEndStage: () => AutomaticStageDefinition<SplendorGameState>;
  getPlayerTurnStage: () => SingleActivePlayerStageDefinition<SplendorGameState>;
}

export function createCheckVictoryConditionStage({
  defineStage,
  getGameEndStage,
  getPlayerTurnStage,
}: CreateCheckVictoryConditionStageOptions): AutomaticStageDefinition<SplendorGameState> {
  return defineStage("checkVictoryCondition")
    .automatic()
    .run(({ game, runtime, emitEvent }) => {
      game.resolveTurnEnd(getLastActingPlayerId(runtime), emitEvent);
    })
    .nextStages(() => ({
      gameEndStage: getGameEndStage(),
      playerTurnStage: getPlayerTurnStage(),
    }))
    .transition(({ game, nextStages }) => {
      return game.winnerIds
        ? nextStages.gameEndStage
        : nextStages.playerTurnStage;
    })
    .build();
}
