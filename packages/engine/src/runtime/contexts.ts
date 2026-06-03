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
import type { CanonicalGameState } from "../state-facade/canonical";
import type { GameState as BaseGameState } from "../state-facade/metadata";

export function createValidationContext<
  FacadeGameState extends BaseGameState,
  TCommandInput extends Command,
>(
  state: CanonicalState<CanonicalGameState<FacadeGameState>>,
  game: Readonly<FacadeGameState>,
  command: TCommandInput,
): InternalValidationContext<FacadeGameState, TCommandInput> {
  return {
    state,
    game,
    runtime: state.runtime,
    command,
  };
}

export function createCommandAvailabilityContext<
  FacadeGameState extends BaseGameState,
>(
  state: CanonicalState<CanonicalGameState<FacadeGameState>>,
  game: Readonly<FacadeGameState>,
  commandType: string,
  actorId: string,
): InternalCommandAvailabilityContext<FacadeGameState> {
  return {
    state,
    game,
    runtime: state.runtime,
    commandType,
    actorId,
  };
}

export function createDiscoveryContext<
  FacadeGameState extends BaseGameState,
  TDiscoveryInput extends Record<string, unknown>,
>(
  state: CanonicalState<CanonicalGameState<FacadeGameState>>,
  game: Readonly<FacadeGameState>,
  discovery: Discovery<TDiscoveryInput>,
): InternalDiscoveryContext<FacadeGameState, TDiscoveryInput> {
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
  FacadeGameState extends BaseGameState,
  TCommandInput extends Command,
>(
  state: CanonicalState<CanonicalGameState<FacadeGameState>>,
  game: FacadeGameState,
  command: TCommandInput,
  rng: RNGApi,
  emitEvent: (event: GameEvent) => void,
): InternalExecuteContext<FacadeGameState, TCommandInput> {
  return {
    state,
    command,
    game,
    runtime: state.runtime,
    rng,
    emitEvent,
  };
}
