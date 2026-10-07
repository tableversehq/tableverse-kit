import { Value } from "@sinclair/typebox/value";
import type {
  AnyGameDefinition,
  GameDefinitionWithSetupInput,
  GameDefinitionWithoutSetupInput,
} from "../game-definition";
import {
  createEventCollector,
  createStageEnteredEvent,
  createStageExitedEvent,
} from "./events";
import type {
  Command,
  CommandAvailabilityContext,
  RuntimeCommandDefinition,
  CommandDefinition,
  CommandDiscoveryResultFor,
  Discovery,
  DiscoveryStepContext,
  DiscoveryStepOption,
  RuntimeExecuteContext,
  ValidationContext,
} from "../types/command";
import type { EmittableEvent, GameEvent } from "../types/event";
import type { EventRegistry, EmptyEventRegistry } from "../events/registry";
import type {
  MultiActivePlayerStageState,
  SingleActivePlayerStageState,
  StageDefinition,
  StageState,
} from "../types/progression";
import type {
  ExecutionFailure,
  ExecutionResult,
  ExecutionSuccess,
} from "../types/result";
import type { CanonicalState, MatchInit, RuntimeState } from "../types/state";
import type { Viewer, VisibleState } from "../types/visibility";
import { createRNGService } from "../rng/service";
import type {
  CanonicalStateOf,
  AnyGameStateDefinition,
  StateClassOf,
  ViewOf,
} from "../state/game-state";
import { hydrateStateFacade } from "../state-facade/hydrate";
import { getView as getVisibleStateView } from "../state-facade/project";
import {
  assertSchemaValue,
  validateCanonicalGameState,
  validateCanonicalState,
} from "./validation";

export interface GameExecutor<
  RootState extends AnyGameStateDefinition,
  SetupInput extends object | undefined = undefined,
  TCommandDefinition = never,
  TEventRegistry extends EventRegistry = EmptyEventRegistry,
> {
  createInitialState: CreateInitialStateFn<
    CanonicalStateOf<RootState>,
    SetupInput
  >;
  readonly __eventDefinitions: TEventRegistry;
  getView(
    state: CanonicalState<CanonicalStateOf<RootState>>,
    viewer: Viewer,
  ): VisibleState<ViewOf<RootState>>;
  isGameEnded(state: CanonicalState<CanonicalStateOf<RootState>>): boolean;
  listAvailableCommands(
    state: CanonicalState<CanonicalStateOf<RootState>>,
    options: {
      actorId: string;
    },
  ): string[];
  discoverCommand(
    state: CanonicalState<CanonicalStateOf<RootState>>,
    discovery: Discovery,
  ): CommandDiscoveryResultFor<TCommandDefinition> | null;
  executeCommand(
    state: CanonicalState<CanonicalStateOf<RootState>>,
    command: Command,
  ): ExecutionResult<CanonicalState<CanonicalStateOf<RootState>>>;
}

/**
 * Structural upper bound for any game's executor, for dynamic hosts (a host that
 * loads arbitrary bundles and calls through this type). `createInitialState` is
 * overridden to one uniform, cast-free signature — a single `init` object whose
 * `setup` is optional — so the host builds one argument for every game and lets the
 * runtime validate `setup` against the schema. The precise, setup-gated signature
 * lives on the concrete `GameExecutor<...>` for statically-typed callers.
 */
export type AnyGameExecutor = Omit<
  GameExecutor<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >,
  "createInitialState"
> & {
  createInitialState(init: MatchInit & { setup?: unknown }): CanonicalState;
};

/**
 * Wraps the raw event collector with the author-facing `emitEvent`: it stamps
 * `category: "domain"` and validates the type/payload against the gameDefinition's event
 * registry. Every emitted event must be declared; an undeclared `type` throws.
 * This backs the compile-time contract at runtime (defense against untrusted
 * bundled code that bypasses the types).
 */
function createDomainEmit(
  rawEmit: (event: GameEvent) => void,
  eventDefinitions: EventRegistry,
): (event: EmittableEvent) => void {
  return ({ type, payload }) => {
    const schema = eventDefinitions[type];
    if (!schema) {
      throw new Error(`unknown_event_type:${type}`);
    }
    assertSchemaValue(schema, payload);
    rawEmit({ category: "domain", type, payload });
  };
}

function createCommandGameView<
  RootState extends AnyGameStateDefinition,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
>(
  gameDefinition: AnyGameDefinition<RootState, TCommandDefinition>,
  state: CanonicalState<CanonicalStateOf<RootState>>,
  options?: {
    readonly?: boolean;
    allowDirectMutation?: boolean;
  },
): StateClassOf<RootState> {
  return hydrateStateFacade(gameDefinition.stateFacade, state.game, {
    readonly: options?.readonly ?? false,
    allowDirectMutation: options?.allowDirectMutation ?? false,
  });
}

// The `createInitialState` input: host-authoritative facts (`MatchInit`) plus the
// developer-defined `setup`, in one object. The type gates `setup` on whether the
// game declares a setup schema — required when it does, absent when it does not —
// so a statically-typed caller cannot forget it, while the runtime signature stays
// a single object for the dynamic host (see `AnyGameExecutor`).
type CreateInitialStateInput<SetupInput extends object | undefined> = [
  SetupInput,
] extends [undefined]
  ? MatchInit
  : MatchInit & { setup: SetupInput };

type CreateInitialStateFn<
  GameState extends object,
  SetupInput extends object | undefined,
> = (init: CreateInitialStateInput<SetupInput>) => CanonicalState<GameState>;

function createInitialRuntimeState<
  RootState extends AnyGameStateDefinition,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
>(
  gameDefinition: AnyGameDefinition<RootState, TCommandDefinition>,
  rngSeed: string | number,
  players: string[],
): RuntimeState {
  const runtime: RuntimeState = {
    progression: {
      currentStage: {
        id: gameDefinition.initialStage.id,
        kind: "automatic",
      },
      lastActingStage: null,
    },
    rng: {
      seed: rngSeed,
      cursor: 0,
    },
    players: [...players],
    history: {
      entries: [],
    },
  };

  return runtime;
}

function initializeGameState<
  RootState extends AnyGameStateDefinition,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
>(
  gameDefinition: AnyGameDefinition<RootState, TCommandDefinition>,
  init: MatchInit & { setup?: object },
): CanonicalState<CanonicalStateOf<RootState>> {
  const { seed, players } = init;
  const input = init.setup;

  if (typeof seed !== "string" && typeof seed !== "number") {
    throw new Error("rng_seed_required");
  }

  if (
    !Array.isArray(players) ||
    players.length === 0 ||
    !players.every((player) => typeof player === "string" && player.length > 0)
  ) {
    throw new Error("players_required");
  }

  if (new Set(players).size !== players.length) {
    throw new Error("players_not_unique");
  }

  if (
    players.length < gameDefinition.playerBounds.min ||
    players.length > gameDefinition.playerBounds.max
  ) {
    throw new Error("players_out_of_bounds");
  }

  if (gameDefinition.setupInputSchema && input === undefined) {
    throw new Error("setup_input_required");
  }

  if (gameDefinition.setupInputSchema && input !== undefined) {
    assertSchemaValue(gameDefinition.setupInputSchema, input);
  }

  const gameState = Value.Clone(gameDefinition.defaultCanonicalGameState);
  const runtime = createInitialRuntimeState(gameDefinition, seed, players);
  const rng = createRNGService(runtime.rng);

  validateCanonicalGameState(gameDefinition, gameState);

  if (gameDefinition.setupInputSchema) {
    if (input === undefined) {
      throw new Error("setup_input_required");
    }

    gameDefinition.setup?.({
      game: createCommandGameView(
        gameDefinition,
        {
          game: gameState,
          runtime,
        },
        {
          allowDirectMutation: true,
        },
      ),
      runtime,
      rng,
      players: runtime.players,
      input,
    });
  } else {
    gameDefinition.setup?.({
      game: createCommandGameView(
        gameDefinition,
        {
          game: gameState,
          runtime,
        },
        {
          allowDirectMutation: true,
        },
      ),
      runtime,
      rng,
      players: runtime.players,
    });
  }

  validateCanonicalGameState(gameDefinition, gameState);

  initializeStageMachine(
    {
      game: gameState,
      runtime,
    },
    gameDefinition,
    rng,
  );

  validateCanonicalState(gameDefinition, {
    game: gameState,
    runtime,
  });

  return {
    game: gameState,
    runtime,
  };
}

function getCurrentStageDefinition<
  RootState extends AnyGameStateDefinition,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
>(
  gameDefinition: AnyGameDefinition<RootState, TCommandDefinition>,
  state: CanonicalState<CanonicalStateOf<RootState>>,
): StageDefinition<StateClassOf<RootState>> | undefined {
  return gameDefinition.stages[state.runtime.progression.currentStage.id] as
    | StageDefinition<StateClassOf<RootState>>
    | undefined;
}

function resolveStageNextStages<HydratedState extends object>(
  stage: StageDefinition<HydratedState>,
) {
  return stage.nextStages?.() ?? {};
}

function initializeStageMachine<
  RootState extends AnyGameStateDefinition,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
>(
  state: CanonicalState<CanonicalStateOf<RootState>>,
  gameDefinition: AnyGameDefinition<RootState, TCommandDefinition>,
  rng: ReturnType<typeof createRNGService>,
): void {
  let currentStage = gameDefinition.initialStage as
    | StageDefinition<StateClassOf<RootState>>
    | undefined;

  while (currentStage) {
    if (currentStage.kind === "activePlayer") {
      state.runtime.progression.currentStage = {
        id: currentStage.id,
        kind: "activePlayer",
        activePlayerId: currentStage.activePlayer({
          game: createCommandGameView(gameDefinition, state, {
            readonly: true,
          }),
          runtime: state.runtime,
        }),
      };
      return;
    }

    if (currentStage.kind === "multiActivePlayer") {
      const memory = currentStage.memory();
      state.runtime.progression.currentStage = {
        id: currentStage.id,
        kind: "multiActivePlayer",
        activePlayerIds: currentStage.activePlayers({
          game: createCommandGameView(gameDefinition, state, {
            readonly: true,
          }),
          runtime: state.runtime,
          memory,
        }),
        memory,
      };
      return;
    }

    state.runtime.progression.currentStage = {
      id: currentStage.id,
      kind: "automatic",
    };

    currentStage.run?.({
      game: createCommandGameView(gameDefinition, state, {
        allowDirectMutation: true,
      }),
      runtime: state.runtime,
      rng,
      emitEvent() {},
    });

    if (!currentStage.transition) {
      return;
    }

    currentStage = currentStage.transition({
      game: createCommandGameView(gameDefinition, state, { readonly: true }),
      runtime: state.runtime,
      nextStages: resolveStageNextStages(currentStage),
    });
  }
}

function advanceStageMachine<
  RootState extends AnyGameStateDefinition,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
>(
  state: CanonicalState<CanonicalStateOf<RootState>>,
  gameDefinition: AnyGameDefinition<RootState, TCommandDefinition>,
  nextStage: StageDefinition<StateClassOf<RootState>>,
  rng: ReturnType<typeof createRNGService>,
  rawEmit: (event: GameEvent) => void,
  domainEmit: (event: EmittableEvent) => void,
): void {
  let currentStage: StageDefinition<StateClassOf<RootState>> | undefined =
    nextStage;

  while (currentStage) {
    if (currentStage.kind === "activePlayer") {
      const stageState: StageState = {
        id: currentStage.id,
        kind: "activePlayer",
        activePlayerId: currentStage.activePlayer({
          game: createCommandGameView(gameDefinition, state, {
            readonly: true,
          }),
          runtime: state.runtime,
        }),
      };
      state.runtime.progression.currentStage = stageState;
      rawEmit(createStageEnteredEvent(stageState));
      return;
    }

    if (currentStage.kind === "multiActivePlayer") {
      const memory = currentStage.memory();
      const stageState: StageState = {
        id: currentStage.id,
        kind: "multiActivePlayer",
        activePlayerIds: currentStage.activePlayers({
          game: createCommandGameView(gameDefinition, state, {
            readonly: true,
          }),
          runtime: state.runtime,
          memory,
        }),
        memory,
      };
      state.runtime.progression.currentStage = stageState;
      rawEmit(createStageEnteredEvent(stageState));
      return;
    }

    const stageState: StageState = {
      id: currentStage.id,
      kind: "automatic",
    };
    state.runtime.progression.currentStage = stageState;
    rawEmit(createStageEnteredEvent(stageState));

    currentStage.run?.({
      game: createCommandGameView(gameDefinition, state, {
        allowDirectMutation: true,
      }),
      runtime: state.runtime,
      rng,
      emitEvent: domainEmit,
    });

    if (!currentStage.transition) {
      return;
    }

    rawEmit(createStageExitedEvent(stageState));
    currentStage = currentStage.transition({
      game: createCommandGameView(gameDefinition, state, { readonly: true }),
      runtime: state.runtime,
      nextStages: resolveStageNextStages(currentStage),
    });
  }
}

export function createGameExecutor<
  RootState extends AnyGameStateDefinition,
  SetupInput extends object,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
  TEventRegistry extends EventRegistry = EmptyEventRegistry,
>(
  gameDefinition: GameDefinitionWithSetupInput<
    RootState,
    SetupInput,
    TCommandDefinition,
    TEventRegistry
  >,
): GameExecutor<RootState, SetupInput, TCommandDefinition, TEventRegistry>;

export function createGameExecutor<
  RootState extends AnyGameStateDefinition,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
  TEventRegistry extends EventRegistry = EmptyEventRegistry,
>(
  gameDefinition: GameDefinitionWithoutSetupInput<
    RootState,
    TCommandDefinition,
    TEventRegistry
  >,
): GameExecutor<RootState, undefined, TCommandDefinition, TEventRegistry>;

export function createGameExecutor(
  gameDefinition: AnyGameDefinition,
): AnyGameExecutor;

export function createGameExecutor<
  RootState extends AnyGameStateDefinition,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
  TEventRegistry extends EventRegistry = EmptyEventRegistry,
>(
  gameDefinition: AnyGameDefinition<
    RootState,
    TCommandDefinition,
    TEventRegistry
  >,
) {
  if (gameDefinition.setupInputSchema) {
    return createGameExecutorWithSetup(gameDefinition);
  }

  return createGameExecutorWithoutSetup(gameDefinition);
}

// Factories use `object` for SetupInput internally; the public overloads on
// `createGameExecutor` preserve the caller's concrete SetupInput type.
function createGameExecutorWithSetup<
  RootState extends AnyGameStateDefinition,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
  TEventRegistry extends EventRegistry = EmptyEventRegistry,
>(
  gameDefinition: GameDefinitionWithSetupInput<
    RootState,
    object,
    TCommandDefinition,
    TEventRegistry
  >,
): GameExecutor<RootState, object, TCommandDefinition, TEventRegistry> {
  return {
    createInitialState(init) {
      return initializeGameState(gameDefinition, init);
    },
    ...createExecutorMethods(gameDefinition),
  };
}

function createGameExecutorWithoutSetup<
  RootState extends AnyGameStateDefinition,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
  TEventRegistry extends EventRegistry = EmptyEventRegistry,
>(
  gameDefinition: GameDefinitionWithoutSetupInput<
    RootState,
    TCommandDefinition,
    TEventRegistry
  >,
): GameExecutor<RootState, undefined, TCommandDefinition, TEventRegistry> {
  return {
    createInitialState(init) {
      return initializeGameState(gameDefinition, init);
    },
    ...createExecutorMethods(gameDefinition),
  };
}

function createExecutorMethods<
  RootState extends AnyGameStateDefinition,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
  TEventRegistry extends EventRegistry = EmptyEventRegistry,
>(
  gameDefinition: AnyGameDefinition<
    RootState,
    TCommandDefinition,
    TEventRegistry
  >,
): Omit<
  GameExecutor<RootState, never, TCommandDefinition, TEventRegistry>,
  "createInitialState"
> {
  return {
    __eventDefinitions: gameDefinition.__eventDefinitions,

    getView(state, viewer) {
      validateCanonicalState(gameDefinition, state);
      return getVisibleStateView<
        CanonicalStateOf<RootState>,
        ViewOf<RootState>
      >(state, viewer, gameDefinition.stateFacade);
    },

    // The stage machine parks here for good: an automatic stage accepts no
    // commands, and without a transition nothing can move it on.
    isGameEnded(state) {
      validateCanonicalState(gameDefinition, state);
      const currentStage = getCurrentStageDefinition(gameDefinition, state);
      return currentStage?.kind === "automatic" && !currentStage.transition;
    },

    listAvailableCommands(state, options) {
      validateCanonicalState(gameDefinition, state);
      const currentStageState = state.runtime.progression.currentStage;
      const currentStage = getCurrentStageDefinition(gameDefinition, state);

      if (!currentStage) {
        return [];
      }

      if (
        currentStage.kind === "activePlayer" &&
        currentStageState.kind === "activePlayer"
      ) {
        if (options.actorId !== currentStageState.activePlayerId) {
          return [];
        }
      } else if (
        currentStage.kind === "multiActivePlayer" &&
        currentStageState.kind === "multiActivePlayer"
      ) {
        if (!currentStageState.activePlayerIds.includes(options.actorId)) {
          return [];
        }
      } else {
        return [];
      }

      return currentStage.commands
        .filter((commandDefinition) => {
          if (!commandDefinition.isAvailable) {
            return true;
          }

          return commandDefinition.isAvailable({
            game: createCommandGameView(gameDefinition, state, {
              readonly: true,
            }),
            runtime: state.runtime,
            commandType: commandDefinition.commandId,
            actorId: options.actorId,
          } satisfies CommandAvailabilityContext<StateClassOf<RootState>>);
        })
        .map((commandDefinition) => commandDefinition.commandId);
    },

    discoverCommand(state, discovery) {
      validateCanonicalState(gameDefinition, state);
      const currentStage = getCurrentStageDefinition(gameDefinition, state);

      if (
        !currentStage ||
        (currentStage.kind !== "activePlayer" &&
          currentStage.kind !== "multiActivePlayer") ||
        !isActorAllowedInCurrentStage(
          state.runtime.progression.currentStage,
          discovery.actorId,
        ) ||
        !currentStage.commands.some(
          (command) => command.commandId === discovery.type,
        )
      ) {
        return null;
      }

      const commandDefinition = gameDefinition.commands[discovery.type];
      if (!commandDefinition) {
        return null;
      }

      const discoveryDefinition = commandDefinition?.discovery;

      if (
        typeof discovery.actorId !== "string" ||
        discovery.actorId.length === 0
      ) {
        return null;
      }

      if (
        typeof discovery.input !== "object" ||
        discovery.input === null ||
        Array.isArray(discovery.input)
      ) {
        return null;
      }

      if (
        commandDefinition.isAvailable &&
        !commandDefinition.isAvailable({
          game: createCommandGameView(gameDefinition, state, {
            readonly: true,
          }),
          runtime: state.runtime,
          commandType: discovery.type,
          actorId: discovery.actorId,
        } satisfies CommandAvailabilityContext<StateClassOf<RootState>>)
      ) {
        return null;
      }

      if (!discoveryDefinition) {
        return null;
      }

      const step = discoveryDefinition.steps.find(
        (candidate) => candidate.stepId === discovery.step,
      );

      if (!step) {
        return null;
      }

      try {
        assertSchemaValue(step.inputSchema, discovery.input);
      } catch {
        return null;
      }

      const discoveryContext = {
        game: createCommandGameView(gameDefinition, state, { readonly: true }),
        runtime: state.runtime,
        commandType: discovery.type,
        actorId: discovery.actorId,
        discovery,
        input: discovery.input,
      } satisfies DiscoveryStepContext<StateClassOf<RootState>>;

      const result = (
        step.resolve as (context: typeof discoveryContext) => unknown
      )(discoveryContext);

      if (!result) {
        return null;
      }

      if (!Array.isArray(result)) {
        if (
          typeof result !== "object" ||
          result === null ||
          (result as { complete?: unknown }).complete !== true
        ) {
          return null;
        }

        const completion = result as {
          complete: true;
          input: Record<string, unknown>;
        };

        try {
          assertSchemaValue(commandDefinition.commandSchema, completion.input);
        } catch {
          return null;
        }

        return {
          complete: true,
          input: completion.input,
        } as CommandDiscoveryResultFor<TCommandDefinition>;
      }

      const discoveryOptions: Array<DiscoveryStepOption> = [];

      for (const option of result) {
        try {
          assertSchemaValue(step.outputSchema, option.output);
        } catch {
          return null;
        }

        let nextStepDefinition:
          | (typeof discoveryDefinition.steps)[number]
          | undefined;

        if (
          typeof option.nextStep !== "string" ||
          option.nextStep.length === 0 ||
          !(nextStepDefinition = discoveryDefinition.steps.find(
            (candidate) => candidate.stepId === option.nextStep,
          ))
        ) {
          return null;
        }

        try {
          assertSchemaValue(nextStepDefinition.inputSchema, option.nextInput);
        } catch {
          return null;
        }

        discoveryOptions.push({
          ...option,
        });
      }

      return {
        complete: false,
        step: discovery.step,
        options: discoveryOptions,
      } as CommandDiscoveryResultFor<TCommandDefinition>;
    },

    executeCommand(state, command) {
      validateCanonicalState(gameDefinition, state);
      const commandDefinition = gameDefinition.commands[command.type];

      if (!commandDefinition) {
        const failure: ExecutionFailure<
          CanonicalState<CanonicalStateOf<RootState>>
        > = {
          ok: false,
          state,
          reason: "unknown_command",
          metadata: { commandType: command.type },
          events: [],
        };

        return failure;
      }

      if (typeof command.actorId !== "string" || command.actorId.length === 0) {
        const failure: ExecutionFailure<
          CanonicalState<CanonicalStateOf<RootState>>
        > = {
          ok: false,
          state,
          reason: "missing_actor_id",
          metadata: { commandType: command.type },
          events: [],
        };

        return failure;
      }

      if (
        typeof command.input !== "object" ||
        command.input === null ||
        Array.isArray(command.input)
      ) {
        const failure: ExecutionFailure<
          CanonicalState<CanonicalStateOf<RootState>>
        > = {
          ok: false,
          state,
          reason: "missing_command_input",
          metadata: { commandType: command.type },
          events: [],
        };

        return failure;
      }

      try {
        assertSchemaValue(commandDefinition.commandSchema, command.input);
      } catch {
        const failure: ExecutionFailure<
          CanonicalState<CanonicalStateOf<RootState>>
        > = {
          ok: false,
          state,
          reason: "invalid_command_input",
          metadata: { commandType: command.type },
          events: [],
        };

        return failure;
      }

      const currentStageState = state.runtime.progression.currentStage;
      const currentStage = getCurrentStageDefinition(gameDefinition, state);

      if (
        !currentStage ||
        (currentStage.kind !== "activePlayer" &&
          currentStage.kind !== "multiActivePlayer")
      ) {
        return {
          ok: false,
          state,
          reason: "stage_not_accepting_commands",
          metadata: { stageId: state.runtime.progression.currentStage.id },
          events: [],
        } satisfies ExecutionFailure<
          CanonicalState<CanonicalStateOf<RootState>>
        >;
      }

      if (!isActorAllowedInCurrentStage(currentStageState, command.actorId)) {
        return {
          ok: false,
          state,
          reason: "not_active_player",
          metadata: {
            stageId: currentStage.id,
            activePlayerId:
              currentStageState.kind === "activePlayer"
                ? currentStageState.activePlayerId
                : null,
            activePlayerIds:
              currentStageState.kind === "multiActivePlayer"
                ? currentStageState.activePlayerIds
                : null,
          },
          events: [],
        } satisfies ExecutionFailure<
          CanonicalState<CanonicalStateOf<RootState>>
        >;
      }

      if (
        !currentStage.commands.some(
          (candidate) => candidate.commandId === command.type,
        )
      ) {
        return {
          ok: false,
          state,
          reason: "command_not_allowed_in_stage",
          metadata: {
            stageId: currentStage.id,
            commandType: command.type,
          },
          events: [],
        } satisfies ExecutionFailure<
          CanonicalState<CanonicalStateOf<RootState>>
        >;
      }

      const validation = commandDefinition.validate({
        game: createCommandGameView(gameDefinition, state, { readonly: true }),
        runtime: state.runtime,
        command,
      } satisfies ValidationContext<StateClassOf<RootState>, Command>);

      if (validation.ok === false) {
        const failure: ExecutionFailure<
          CanonicalState<CanonicalStateOf<RootState>>
        > = {
          ok: false,
          state,
          reason: validation.reason,
          metadata: validation.metadata,
          events: [],
        };

        return failure;
      }

      const workingState = Value.Clone(state);
      const collector = createEventCollector();
      const domainEmit = createDomainEmit(
        collector.emit,
        gameDefinition.eventDefinitions,
      );
      const rng = createRNGService(workingState.runtime.rng);

      if (
        currentStage.kind === "activePlayer" &&
        currentStageState.kind === "activePlayer"
      ) {
        executeCommandAgainstState(
          workingState,
          gameDefinition,
          commandDefinition,
          command,
          rng,
          domainEmit,
        );
        workingState.runtime.progression.lastActingStage = {
          id: currentStageState.id,
          kind: "activePlayer",
          activePlayerId: currentStageState.activePlayerId,
        } satisfies SingleActivePlayerStageState;

        const nextCurrentStage = getCurrentStageDefinition(
          gameDefinition,
          workingState,
        );

        if (!nextCurrentStage || nextCurrentStage.kind !== "activePlayer") {
          throw new Error(
            "active_player_stage_required_after_command_execution",
          );
        }

        collector.emit(
          createStageExitedEvent(workingState.runtime.progression.currentStage),
        );

        advanceStageMachine(
          workingState,
          gameDefinition,
          nextCurrentStage.transition({
            game: createCommandGameView(gameDefinition, workingState, {
              readonly: true,
            }),
            runtime: workingState.runtime,
            command: command as Parameters<
              typeof nextCurrentStage.transition
            >[0]["command"],
            nextStages: resolveStageNextStages(nextCurrentStage),
          }),
          rng,
          collector.emit,
          domainEmit,
        );
      } else if (
        currentStage.kind === "multiActivePlayer" &&
        currentStageState.kind === "multiActivePlayer"
      ) {
        const memory = (
          workingState.runtime.progression
            .currentStage as MultiActivePlayerStageState<object>
        ).memory;

        currentStage.onSubmit({
          game: createCommandGameView(gameDefinition, workingState, {
            readonly: true,
          }),
          runtime: workingState.runtime,
          memory,
          command: command as Parameters<
            typeof currentStage.onSubmit
          >[0]["command"],
          execute: (submittedCommand) => {
            const submittedDefinition =
              gameDefinition.commands[submittedCommand.type];

            if (!submittedDefinition) {
              throw new Error(
                `unknown_command_in_multi_active_execute:${submittedCommand.type}`,
              );
            }

            executeCommandAgainstState(
              workingState,
              gameDefinition,
              submittedDefinition,
              submittedCommand,
              rng,
              domainEmit,
            );
          },
        });

        const nextActivePlayerIds = currentStage.activePlayers({
          game: createCommandGameView(gameDefinition, workingState, {
            readonly: true,
          }),
          runtime: workingState.runtime,
          memory,
        });

        workingState.runtime.progression.currentStage = {
          id: currentStage.id,
          kind: "multiActivePlayer",
          activePlayerIds: nextActivePlayerIds,
          memory,
        } satisfies MultiActivePlayerStageState;

        if (
          currentStage.isComplete({
            game: createCommandGameView(gameDefinition, workingState, {
              readonly: true,
            }),
            runtime: workingState.runtime,
            memory,
          })
        ) {
          workingState.runtime.progression.lastActingStage = {
            id: currentStage.id,
            kind: "multiActivePlayer",
            activePlayerIds: nextActivePlayerIds,
            memory,
          } satisfies MultiActivePlayerStageState<object>;

          collector.emit(
            createStageExitedEvent(
              workingState.runtime.progression.currentStage,
            ),
          );

          advanceStageMachine(
            workingState,
            gameDefinition,
            currentStage.transition({
              game: createCommandGameView(gameDefinition, workingState, {
                readonly: true,
              }),
              runtime: workingState.runtime,
              memory,
              nextStages: resolveStageNextStages(currentStage),
            }),
            rng,
            collector.emit,
            domainEmit,
          );
        }
      }

      validateCanonicalState(gameDefinition, workingState);

      const success: ExecutionSuccess<
        CanonicalState<CanonicalStateOf<RootState>>
      > = {
        ok: true,
        state: workingState,
        events: collector.list(),
      };

      return success;
    },
  };
}

function isActorAllowedInCurrentStage(
  currentStageState: StageState,
  actorId: string,
): boolean {
  if (currentStageState.kind === "activePlayer") {
    return actorId === currentStageState.activePlayerId;
  }

  if (currentStageState.kind === "multiActivePlayer") {
    return currentStageState.activePlayerIds.includes(actorId);
  }

  return false;
}

function executeCommandAgainstState<
  RootState extends AnyGameStateDefinition,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
>(
  state: CanonicalState<CanonicalStateOf<RootState>>,
  gameDefinition: AnyGameDefinition<RootState, TCommandDefinition>,
  commandDefinition: RuntimeCommandDefinition<StateClassOf<RootState>>,
  command: Command,
  rng: ReturnType<typeof createRNGService>,
  emitEvent: (event: EmittableEvent) => void,
): void {
  commandDefinition.execute({
    game: createCommandGameView(gameDefinition, state, {
      allowDirectMutation: true,
    }),
    runtime: state.runtime,
    command,
    rng,
    emitEvent,
  } satisfies RuntimeExecuteContext<StateClassOf<RootState>>);

  state.runtime.history.entries.push({
    id: String(state.runtime.history.entries.length + 1),
    commandType: command.type,
    actorId: command.actorId,
  });
}
