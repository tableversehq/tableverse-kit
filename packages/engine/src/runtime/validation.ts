import { Value } from "@sinclair/typebox/value";
import type { TSchema } from "@sinclair/typebox";
import type { AnyGameDefinition } from "../game-definition";
import type {
  CanonicalStateOf,
  AnyGameStateDefinition,
  StateClassOf,
} from "../state/game-state";
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
  RootState extends AnyGameStateDefinition,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
>(
  game: AnyGameDefinition<RootState, TCommandDefinition>,
  gameState: CanonicalStateOf<RootState>,
): void {
  assertSchemaValue(game.canonicalGameStateSchema, gameState);
}

export function validateRuntimeState<
  RootState extends AnyGameStateDefinition,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
>(
  game: AnyGameDefinition<RootState, TCommandDefinition>,
  runtimeState: RuntimeState,
): void {
  assertSchemaValue(game.runtimeStateSchema, runtimeState);
}

export function validateCanonicalState<
  RootState extends AnyGameStateDefinition,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
>(
  game: AnyGameDefinition<RootState, TCommandDefinition>,
  state: CanonicalState<CanonicalStateOf<RootState>>,
): void {
  validateCanonicalGameState(game, state.game);
  validateRuntimeState(game, state.runtime);
}
