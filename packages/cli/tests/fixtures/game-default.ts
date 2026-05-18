import {
  createStageFactory,
  field,
  GameState,
  GameDefinitionBuilder,
  t,
} from "@tabletop-kit/engine";

class FixtureState extends GameState {
  @field(t.number())
  value = 1;
}

export default function createFixtureGame() {
  const stageFactory = createStageFactory<FixtureState>();

  return new GameDefinitionBuilder("fixture-default")
    .rootState(FixtureState)
    .initialStage(stageFactory("done").automatic().build())
    .build();
}
