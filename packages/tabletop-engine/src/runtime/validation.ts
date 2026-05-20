import { Value } from "@sinclair/typebox/value";
import type { TSchema } from "@sinclair/typebox";
import type { GameDefinition } from "../game-definition";
import type { CanonicalGameState } from "../state-facade/canonical";
import type { GameState as BaseGameState } from "../state-facade/metadata";
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
  SetupInput extends object | undefined,
>(
  game: GameDefinition<FacadeGameState, SetupInput>,
  gameState: CanonicalGameState<FacadeGameState>,
): void {
  assertSchemaValue(game.canonicalGameStateSchema, gameState);
}

export function validateRuntimeState<
  FacadeGameState extends BaseGameState,
  SetupInput extends object | undefined,
>(
  game: GameDefinition<FacadeGameState, SetupInput>,
  runtimeState: RuntimeState,
): void {
  assertSchemaValue(game.runtimeStateSchema, runtimeState);
}

export function validateCanonicalState<
  FacadeGameState extends BaseGameState,
  SetupInput extends object | undefined,
>(
  game: GameDefinition<FacadeGameState, SetupInput>,
  state: CanonicalState<CanonicalGameState<FacadeGameState>>,
): void {
  validateCanonicalGameState(game, state.game);
  validateRuntimeState(game, state.runtime);
}
