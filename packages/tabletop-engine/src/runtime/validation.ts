import { Value } from "@sinclair/typebox/value";
import type { TSchema } from "@sinclair/typebox";
import type {
  GameDefinitionWithSetupInput,
  GameDefinitionWithoutSetupInput,
} from "../game-definition";
import type { CanonicalGameState } from "../state-facade/canonical";
import type { GameState as BaseGameState } from "../state-facade/metadata";
import type { CommandDefinition } from "../types/command";
import type { CanonicalState, RuntimeState } from "../types/state";

export function assertSchemaValue(schema: TSchema, value: unknown): void {
  if (Value.Check(schema, value)) {
    return;
  }

  const firstError = Value.Errors(schema, value).First();
  const errorPath = firstError?.path || "/";
  throw new Error(`invalid_schema_value:${errorPath}`);
}

export function validateCanonicalGameState<
  FacadeGameState extends BaseGameState,
  TCommandDefinition extends CommandDefinition<FacadeGameState>,
>(
  game:
    | GameDefinitionWithoutSetupInput<FacadeGameState, TCommandDefinition>
    | GameDefinitionWithSetupInput<FacadeGameState, object, TCommandDefinition>,
  gameState: CanonicalGameState<FacadeGameState>,
): void {
  assertSchemaValue(game.canonicalGameStateSchema, gameState);
}

export function validateRuntimeState<
  FacadeGameState extends BaseGameState,
  TCommandDefinition extends CommandDefinition<FacadeGameState>,
>(
  game:
    | GameDefinitionWithoutSetupInput<FacadeGameState, TCommandDefinition>
    | GameDefinitionWithSetupInput<FacadeGameState, object, TCommandDefinition>,
  runtimeState: RuntimeState,
): void {
  assertSchemaValue(game.runtimeStateSchema, runtimeState);
}

export function validateCanonicalState<
  FacadeGameState extends BaseGameState,
  TCommandDefinition extends CommandDefinition<FacadeGameState>,
>(
  game:
    | GameDefinitionWithoutSetupInput<FacadeGameState, TCommandDefinition>
    | GameDefinitionWithSetupInput<FacadeGameState, object, TCommandDefinition>,
  state: CanonicalState<CanonicalGameState<FacadeGameState>>,
): void {
  validateCanonicalGameState(game, state.game);
  validateRuntimeState(game, state.runtime);
}
