import type {
  AutomaticStageDefinition,
  StageFactory,
} from "@tabletop-kit/engine";
import type { SplendorGameState } from "../state.ts";

interface CreateGameEndStageOptions {
  defineStage: StageFactory<SplendorGameState>;
}

export function createGameEndStage({
  defineStage,
}: CreateGameEndStageOptions): AutomaticStageDefinition<SplendorGameState> {
  return defineStage("gameEnd").automatic().build();
}
