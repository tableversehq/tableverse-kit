import { createStageFactory } from "@tableverse-kit/engine";
import { createCommands } from "../commands/index.ts";
import type { SplendorGameState } from "../state.ts";
import { createCheckVictoryConditionStage } from "./check-victory-condition.ts";
import { createChooseNobleStage } from "./choose-noble.ts";
import { createGameEndStage } from "./game-end.ts";
import { createPlayerTurnStage } from "./player-turn.ts";
import { createResolveNobleStage } from "./resolve-noble.ts";
import { createReturnExcessiveTokensStage } from "./return-excessive-tokens.ts";

export function createSplendorStages() {
  const defineStage = createStageFactory<SplendorGameState>();
  const commands = createCommands();

  const gameEndStage = createGameEndStage({
    defineStage,
  });

  const chooseNobleStage = createChooseNobleStage({
    defineStage,
    getCheckVictoryConditionStage: () => checkVictoryConditionStage,
  });

  const resolveNobleStage = createResolveNobleStage({
    defineStage,
    getChooseNobleStage: () => chooseNobleStage,
    getCheckVictoryConditionStage: () => checkVictoryConditionStage,
  });

  const checkVictoryConditionStage = createCheckVictoryConditionStage({
    defineStage,
    getGameEndStage: () => gameEndStage,
    getPlayerTurnStage: () => playerTurnStage,
  });

  const returnExcessiveTokensStage = createReturnExcessiveTokensStage({
    defineStage,
    getCheckVictoryConditionStage: () => checkVictoryConditionStage,
  });

  const playerTurnStage = createPlayerTurnStage({
    defineStage,
    commands,
    getResolveNobleStage: () => resolveNobleStage,
    getCheckVictoryConditionStage: () => checkVictoryConditionStage,
    getReturnExcessiveTokensStage: () => returnExcessiveTokensStage,
  });

  return {
    initialStage: playerTurnStage,
  };
}
