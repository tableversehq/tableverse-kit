import {
  createStageFactory,
  GameDefinitionBuilder,
  defineGameState,
  t,
} from "@tableverse-kit/engine";

class SetupFixtureState {
  targetScore = 0;
}

const SetupFixtureGameState = defineGameState()
  .model({ targetScore: t.number() })
  .stateClass(SetupFixtureState)
  .build();

export default function createSetupFixtureGame() {
  const stageFactory = createStageFactory<SetupFixtureState>();

  return new GameDefinitionBuilder("fixture-setup")
    .state(SetupFixtureGameState)
    .players({ min: 2, max: 4 })
    .initialStage(stageFactory("done").automatic().build())
    .setupInput(t.object({ targetScore: t.number({ min: 1 }) }))
    .setup(({ game, input }) => {
      game.targetScore = input.targetScore;
    })
    .build();
}
