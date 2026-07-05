import type {
  AutomaticStageDefinition,
  DefinedCommand,
  SingleActivePlayerStageDefinition,
  StageFactory,
} from "@tableverse-kit/engine";
import type { SplendorGameState } from "../state.ts";
import { getLastActingPlayerId } from "./shared.ts";

interface CreatePlayerTurnStageOptions {
  defineStage: StageFactory<SplendorGameState>;
  commands: readonly DefinedCommand<SplendorGameState>[];
  getResolveNobleStage: () => AutomaticStageDefinition<SplendorGameState>;
  getCheckVictoryConditionStage: () => AutomaticStageDefinition<SplendorGameState>;
  getReturnExcessiveTokensStage: () => SingleActivePlayerStageDefinition<SplendorGameState>;
}

export function createPlayerTurnStage<
  const TCommands extends readonly DefinedCommand<SplendorGameState>[],
>({
  defineStage,
  commands,
  getResolveNobleStage,
  getCheckVictoryConditionStage,
  getReturnExcessiveTokensStage,
}: CreatePlayerTurnStageOptions & {
  commands: TCommands;
}): SingleActivePlayerStageDefinition<SplendorGameState, TCommands> {
  return defineStage("playerTurn")
    .singleActivePlayer()
    .activePlayer(({ game, runtime }) => {
      const previousActorId = runtime.progression.lastActingStage
        ? getLastActingPlayerId(runtime)
        : null;

      return previousActorId
        ? game.getNextPlayerId(previousActorId)
        : game.playerOrder[0]!;
    })
    .commands(commands)
    .nextStages(() => ({
      resolveNobleStage: getResolveNobleStage(),
      checkVictoryConditionStage: getCheckVictoryConditionStage(),
      returnExcessiveTokensStage: getReturnExcessiveTokensStage(),
    }))
    .transition(({ game, command, nextStages }) => {
      const actor = game.getPlayer(command.actorId);

      if (actor.getRequiredReturnCount() > 0) {
        return nextStages.returnExcessiveTokensStage;
      }

      return command.type === "buy_face_up_card" ||
        command.type === "buy_reserved_card"
        ? nextStages.resolveNobleStage
        : nextStages.checkVictoryConditionStage;
    })
    .build();
}
