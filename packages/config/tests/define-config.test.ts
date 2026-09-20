import {
  GameDefinitionBuilder,
  createStageFactory,
  defineGameState,
  t,
} from "@tableverse-kit/engine";
import { describe, expect, it } from "vitest";
import { defineConfig } from "../src/index.ts";

class SampleState {
  value = 1;
}

const SampleGameState = defineGameState()
  .model({ value: t.number() })
  .stateClass(SampleState)
  .build();

// A real built game, so this test also proves a game definition is assignable
// to `TableverseConfig.game` — the reason the config package can use engine's
// `AnyGameDefinition` directly instead of a hand-rolled structural shape.
function createSampleGame() {
  const stage = createStageFactory<SampleState>();
  return new GameDefinitionBuilder("sample")
    .state(SampleGameState)
    .players({ min: 1, max: 8 })
    .initialStage(stage("done").automatic().build())
    .build();
}

function createSetupInputGame() {
  const stage = createStageFactory<SampleState>();
  return new GameDefinitionBuilder("sample-setup")
    .state(SampleGameState)
    .players({ min: 1, max: 8 })
    .initialStage(stage("done").automatic().build())
    .setupInput(t.object({ startingValue: t.number() }))
    .setup(({ game, input }) => {
      game.value = input.startingValue;
    })
    .build();
}

describe("defineConfig", () => {
  it("returns the config unchanged", () => {
    const config = {
      game: createSampleGame(),
      publish: {
        engine: { root: "." },
        frontend: {
          root: "./web",
          buildCommand: "npm run build",
          outDir: "dist",
        },
      },
    };

    expect(defineConfig(config)).toBe(config);
  });

  it("accepts a minimal config with only a game", () => {
    const result = defineConfig({ game: createSampleGame() });

    expect(result.publish).toBeUndefined();
    expect(result.game.name).toBe("sample");
  });

  it("accepts a game that declares setup input", () => {
    const result = defineConfig({ game: createSetupInputGame() });

    expect(result.game.setupInputSchema).toBeDefined();
  });
});
