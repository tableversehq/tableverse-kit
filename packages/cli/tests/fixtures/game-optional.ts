import {
  createStageFactory,
  GameDefinitionBuilder,
  defineGameState,
  t,
} from "@tableverse-kit/engine";

class OptionalFactoryState {
  counter = 0;
}

const OptionalFactoryGameState = defineGameState()
  .model({
    counter: t.number(),
  })
  .stateClass(OptionalFactoryState)
  .build();

export default function createOptionalFixtureGame(
  ...args: [{ verbose?: boolean }?]
) {
  void args;
  const stageFactory = createStageFactory<OptionalFactoryState>();

  return new GameDefinitionBuilder("fixture-optional")
    .state(OptionalFactoryGameState)
    .initialStage(stageFactory("done").automatic().build())
    .build();
}
