import { Type, type TSchema } from "@sinclair/typebox";
import type {
  AutomaticStageDefinition,
  MultiActivePlayerStageDefinition,
  SingleActivePlayerStageDefinition,
  StageDefinition,
} from "../types/progression";
import type { GameState as BaseGameState } from "../state-facade/metadata";

const seedSchema = Type.Union([Type.String(), Type.Number()]);

function createAutomaticStageStateSchema(
  stage: AutomaticStageDefinition<BaseGameState>,
): TSchema {
  return Type.Object({
    id: Type.Literal(stage.id),
    kind: Type.Literal("automatic"),
  });
}

function createSingleActivePlayerStageStateSchema(
  stage: SingleActivePlayerStageDefinition<BaseGameState>,
): TSchema {
  return Type.Object({
    id: Type.Literal(stage.id),
    kind: Type.Literal("activePlayer"),
    activePlayerId: Type.String(),
  });
}

function createMultiActivePlayerStageStateSchema(
  stage: MultiActivePlayerStageDefinition<BaseGameState>,
): TSchema {
  return Type.Object({
    id: Type.Literal(stage.id),
    kind: Type.Literal("multiActivePlayer"),
    activePlayerIds: Type.Array(Type.String()),
    memory: stage.memorySchema,
  });
}

function createStageStateSchema(
  stage: StageDefinition<BaseGameState>,
): TSchema {
  switch (stage.kind) {
    case "automatic":
      return createAutomaticStageStateSchema(stage);
    case "activePlayer":
      return createSingleActivePlayerStageStateSchema(stage);
    case "multiActivePlayer":
      return createMultiActivePlayerStageStateSchema(stage);
  }
}

function createUnionSchema(schemas: TSchema[]): TSchema {
  if (schemas.length === 0) {
    return Type.Never();
  }

  if (schemas.length === 1) {
    return schemas[0]!;
  }

  return Type.Union(schemas);
}

export function compileRuntimeStateSchema(
  stages: Record<string, StageDefinition<BaseGameState>>,
): TSchema {
  const stageDefinitions = Object.values(stages);
  const currentStageSchema = createUnionSchema(
    stageDefinitions.map(createStageStateSchema),
  );
  const lastActingStageSchema = createUnionSchema([
    ...stageDefinitions
      .filter((stage) => stage.kind !== "automatic")
      .map(createStageStateSchema),
    Type.Null(),
  ]);

  return Type.Object({
    progression: Type.Object({
      currentStage: currentStageSchema,
      lastActingStage: lastActingStageSchema,
    }),
    rng: Type.Object({
      seed: seedSchema,
      cursor: Type.Number(),
    }),
    history: Type.Object({
      entries: Type.Array(
        Type.Object({
          id: Type.String(),
          commandType: Type.String(),
          actorId: Type.Optional(Type.String()),
        }),
      ),
    }),
  });
}
