import type {
  AutomaticStageDefinition,
  SingleActivePlayerStageDefinition,
  StageFactory,
} from "@tabletop-kit/engine";
import type { SplendorGameState } from "../state.ts";
import { getLastActingPlayerId } from "./shared.ts";

interface CreateResolveNobleStageOptions {
  defineStage: StageFactory<SplendorGameState>;
  getChooseNobleStage: () => SingleActivePlayerStageDefinition<SplendorGameState>;
  getCheckVictoryConditionStage: () => AutomaticStageDefinition<SplendorGameState>;
}

export function createResolveNobleStage({
  defineStage,
  getChooseNobleStage,
  getCheckVictoryConditionStage,
}: CreateResolveNobleStageOptions): AutomaticStageDefinition<SplendorGameState> {
  return defineStage("resolveNoble")
    .automatic()
    .run(({ game, runtime, emitEvent }) => {
      const actorId = getLastActingPlayerId(runtime);
      const player = game.getPlayer(actorId);
      const eligibleNobles = game.getEligibleNobles(player);

      if (eligibleNobles.length !== 1) {
        return;
      }

      const claimedNobleId = game.resolveNobleVisit(player);

      if (claimedNobleId === null) {
        return;
      }

      emitEvent({
        category: "domain",
        type: "noble_claimed",
        payload: {
          actorId,
          nobleId: claimedNobleId,
        },
      });
    })
    .nextStages(() => ({
      chooseNobleStage: getChooseNobleStage(),
      checkVictoryConditionStage: getCheckVictoryConditionStage(),
    }))
    .transition(({ game, runtime, nextStages }) => {
      const actorId = getLastActingPlayerId(runtime);
      const player = game.getPlayer(actorId);
      const eligibleNobles = game.getEligibleNobles(player);

      return eligibleNobles.length > 1
        ? nextStages.chooseNobleStage
        : nextStages.checkVictoryConditionStage;
    })
    .build();
}
