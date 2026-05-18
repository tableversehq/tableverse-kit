import type {
  AutomaticStageDefinition,
  SingleActivePlayerStageDefinition,
  StageFactory,
} from "@tabletop-kit/engine";
import { chooseNobleCommand } from "../commands/index.ts";
import type { SplendorGameState } from "../state.ts";
import { getLastActingPlayerId } from "./shared.ts";

interface CreateChooseNobleStageOptions {
  defineStage: StageFactory<SplendorGameState>;
  getCheckVictoryConditionStage: () => AutomaticStageDefinition<SplendorGameState>;
}

export function createChooseNobleStage({
  defineStage,
  getCheckVictoryConditionStage,
}: CreateChooseNobleStageOptions): SingleActivePlayerStageDefinition<SplendorGameState> {
  return defineStage("chooseNoble")
    .singleActivePlayer()
    .activePlayer(({ runtime }) => {
      return getLastActingPlayerId(runtime);
    })
    .commands([chooseNobleCommand])
    .nextStages(() => ({
      checkVictoryConditionStage: getCheckVictoryConditionStage(),
    }))
    .transition(({ nextStages }) => {
      return nextStages.checkVictoryConditionStage;
    })
    .build();
}
