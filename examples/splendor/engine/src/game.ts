import {
  createGameExecutor,
  GameDefinitionBuilder,
  t,
} from "@tabletop-kit/engine";
import { setupSplendorGame } from "./setup.ts";
import { SplendorGame as SplendorRootState } from "./state.ts";
import { createSplendorStages } from "./stages/index.ts";

export function createSplendorGame() {
  const { initialStage } = createSplendorStages();

  return new GameDefinitionBuilder("splendor")
    .state(SplendorRootState)
    .setupInput(
      t.object({
        playerIds: t.array(t.string()),
      }),
    )
    .setup(({ game, rng, input }) => {
      if (input.playerIds.length < 2 || input.playerIds.length > 4) {
        throw new Error("splendor_requires_2_to_4_players");
      }

      setupSplendorGame(game, rng, input.playerIds);
    })
    .initialStage(initialStage)
    .build();
}

export function createSplendorExecutor() {
  return createGameExecutor(createSplendorGame());
}

export type SplendorExecutor = ReturnType<typeof createSplendorExecutor>;
export type SplendorState = ReturnType<SplendorExecutor["createInitialState"]>;
