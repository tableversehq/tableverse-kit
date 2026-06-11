import type {
  Command,
  Discovery,
  InternalCommandAvailabilityContext,
  InternalDiscoveryContext,
  InternalExecuteContext,
  InternalValidationContext,
} from "../types/command";
import type { GameEvent } from "../types/event";
import type { CanonicalState } from "../types/state";
import type { RNGApi } from "../types/rng";

export function createValidationContext<
  CanonicalGameState extends object,
  HydratedState extends object,
  TCommandInput extends Command,
>(
  state: CanonicalState<CanonicalGameState>,
  game: Readonly<HydratedState>,
  command: TCommandInput,
): InternalValidationContext<HydratedState, TCommandInput, CanonicalGameState> {
  return {
    state,
    game,
    runtime: state.runtime,
    command,
  };
}

export function createCommandAvailabilityContext<
  CanonicalGameState extends object,
  HydratedState extends object,
>(
  state: CanonicalState<CanonicalGameState>,
  game: Readonly<HydratedState>,
  commandType: string,
  actorId: string,
): InternalCommandAvailabilityContext<HydratedState, CanonicalGameState> {
  return {
    state,
    game,
    runtime: state.runtime,
    commandType,
    actorId,
  };
}

export function createDiscoveryContext<
  CanonicalGameState extends object,
  HydratedState extends object,
  TDiscoveryInput extends Record<string, unknown>,
>(
  state: CanonicalState<CanonicalGameState>,
  game: Readonly<HydratedState>,
  discovery: Discovery<TDiscoveryInput>,
): InternalDiscoveryContext<
  HydratedState,
  TDiscoveryInput,
  CanonicalGameState
> {
  return {
    ...createCommandAvailabilityContext(
      state,
      game,
      discovery.type,
      discovery.actorId,
    ),
    discovery,
    input: discovery.input,
  };
}

export function createExecuteContext<
  CanonicalGameState extends object,
  HydratedState extends object,
  TCommandInput extends Command,
>(
  state: CanonicalState<CanonicalGameState>,
  game: HydratedState,
  command: TCommandInput,
  rng: RNGApi,
  emitEvent: (event: GameEvent) => void,
): InternalExecuteContext<HydratedState, TCommandInput, CanonicalGameState> {
  return {
    state,
    command,
    game,
    runtime: state.runtime,
    rng,
    emitEvent,
  };
}
