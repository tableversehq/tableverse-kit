import type { CanonicalState, GameExecutor } from "@tabletop-kit/engine";
import type { TTKitClient, TTKitGame } from "../client/types.ts";

export interface CreateInProcessClientOptions<GameState extends object> {
  viewerId: string;
  initialState: CanonicalState<GameState>;
}

/**
 * In-process implementation of TTKitClient. Wraps a GameExecutor; runs the
 * engine in the same JavaScript context as the UI. All async methods resolve
 * synchronously through Promise.resolve, so single-player games never wait
 * on a network.
 *
 * The customer constructs the initial state externally (typically with
 * `executor.createInitialState(...)`, or by restoring a snapshot / starting
 * a replay) and hands it in. The adapter owns the running-game phase: state
 * mutation, subscriber notification, event fan-out.
 *
 * `G` defaults to the unparameterized `TTKitGame` shape; pass `G`
 * explicitly to get typed view/event/command shapes, or use the
 * `createGameHooks<G>()` factory to bind the type once across the app.
 * `GameState` and `SetupInput` are inferred from the `executor` argument.
 */
export function createInProcessClient<
  G extends TTKitGame,
  GameState extends object,
  SetupInput extends object | undefined = undefined,
>(
  executor: GameExecutor<GameState, SetupInput>,
  options: CreateInProcessClientOptions<GameState>,
): TTKitClient<G> {
  let state = options.initialState;
  let version = 0;
  let currentViewerId = options.viewerId;
  const subscribers = new Set<() => void>();
  const eventListeners = new Set<(event: G["event"]) => void>();
  let disposed = false;

  const notifySubscribers = (): void => {
    for (const listener of subscribers) listener();
  };

  const emitEvents = (events: ReadonlyArray<G["event"]>): void => {
    for (const event of events) {
      for (const listener of eventListeners) {
        listener(event);
      }
    }
  };

  const ensureLive = (): void => {
    if (disposed) {
      throw new Error("createInProcessClient: client has been disposed");
    }
  };

  // After every successful execute, align the viewer with the new active
  // player so local pass-and-play works automatically. No-op for
  // single-player (active player is always the same), and skipped for
  // automatic / multi-active-player stages where there is no single
  // active player to switch to.
  const alignViewerWithActivePlayer = (
    nextState: CanonicalState<GameState>,
  ): void => {
    const stage = nextState.runtime.progression.currentStage;
    if (stage.kind !== "activePlayer") return;
    if (stage.activePlayerId === currentViewerId) return;
    currentViewerId = stage.activePlayerId;
  };

  return {
    get viewerId() {
      return currentViewerId;
    },

    getView() {
      if (disposed) return null;
      return executor.getView(state, {
        kind: "player",
        playerId: currentViewerId,
      });
    },

    async getAvailableCommands() {
      if (disposed) return [];
      return executor.listAvailableCommands(state, {
        actorId: currentViewerId,
      });
    },

    getStateVersion() {
      return disposed ? null : version;
    },

    subscribe(listener) {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },

    onEvent(listener) {
      eventListeners.add(listener);
      return () => {
        eventListeners.delete(listener);
      };
    },

    async discover(payload) {
      ensureLive();
      const { type, step, input } = payload;
      const result = executor.discoverCommand(state, {
        type,
        actorId: currentViewerId,
        step,
        input,
      });
      if (result === null) {
        throw new Error(`discover: command "${type}" has no discovery defined`);
      }
      return result;
    },

    async execute(command) {
      ensureLive();
      const { type, input } = command;
      const result = executor.executeCommand(state, {
        type,
        actorId: currentViewerId,
        input,
      });

      if (!result.ok) {
        return { accepted: false, reason: result.reason };
      }

      state = result.state;
      version += 1;
      alignViewerWithActivePlayer(state);
      notifySubscribers();
      emitEvents(result.events);
      return { accepted: true };
    },

    dispose() {
      disposed = true;
      subscribers.clear();
      eventListeners.clear();
    },
  };
}

/**
 * Convenience: shape the executor type so callers don't have to fight
 * generics. The runtime cost is zero; this is only a type assertion helper.
 */
export type InProcessClient<G extends TTKitGame> = TTKitClient<G>;
