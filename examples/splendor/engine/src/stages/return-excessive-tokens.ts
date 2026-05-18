import type {
  AutomaticStageDefinition,
  SingleActivePlayerStageDefinition,
  StageFactory,
} from "@tabletop-kit/engine";
import { returnTokensCommand } from "../commands/index.ts";
import type { SplendorGameState } from "../state.ts";
import { getLastActingPlayerId } from "./shared.ts";

interface CreateReturnExcessiveTokensStageOptions {
  defineStage: StageFactory<SplendorGameState>;
  getCheckVictoryConditionStage: () => AutomaticStageDefinition<SplendorGameState>;
}

export function createReturnExcessiveTokensStage({
  defineStage,
  getCheckVictoryConditionStage,
}: CreateReturnExcessiveTokensStageOptions): SingleActivePlayerStageDefinition<SplendorGameState> {
  return defineStage("returnExcessiveTokens")
    .singleActivePlayer()
    .activePlayer(({ runtime }) => {
      return getLastActingPlayerId(runtime);
    })
    .commands([returnTokensCommand])
    .nextStages(() => ({
      checkVictoryConditionStage: getCheckVictoryConditionStage(),
    }))
    .transition(({ nextStages }) => {
      return nextStages.checkVictoryConditionStage;
    })
    .build();
}
