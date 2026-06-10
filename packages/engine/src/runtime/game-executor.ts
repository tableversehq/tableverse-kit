import type {
  AnyGameDefinition,
  GameDefinitionWithSetupInput,
  GameDefinitionWithoutSetupInput,
} from "../game-definition";
import {
  createCommandAvailabilityContext,
  createDiscoveryContext,
  createExecuteContext,
  createValidationContext,
} from "./contexts";
import {
  createEventCollector,
  createStageEnteredEvent,
  createStageExitedEvent,
} from "./events";
import type {
  Command,
  RuntimeCommandDefinition,
  CommandDefinition,
  CommandDiscoveryResultFor,
  Discovery,
  DiscoveryStepOption,
} from "../types/command";
import type { GameEvent } from "../types/event";
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
import type { CanonicalState, RuntimeState } from "../types/state";
import type { Viewer, VisibleState } from "../types/visibility";
import { createRNGService } from "../rng/service";
import type {
  CanonicalStateOf,
  GameState,
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
  RootState extends GameState,
  SetupInput extends object | undefined = undefined,
  TCommandDefinition = never,
> {
  createInitialState: CreateInitialStateFn<
    CanonicalStateOf<RootState>,
    SetupInput
  >;
  getView(
    state: CanonicalState<CanonicalStateOf<RootState>>,
    viewer: Viewer,
  ): VisibleState<ViewOf<RootState>>;
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

function createCommandGameView<
  RootState extends GameState,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
>(
  game: AnyGameDefinition<RootState, TCommandDefinition>,
  state: CanonicalState<CanonicalStateOf<RootState>>,
  options?: {
    readonly?: boolean;
    allowDirectMutation?: boolean;
  },
): StateClassOf<RootState> {
  return hydrateStateFacade(game.stateFacade, state.game, {
    readonly: options?.readonly ?? false,
    allowDirectMutation: options?.allowDirectMutation ?? false,
  });
}

type CreateInitialStateFn<
  GameData extends object,
  SetupInput extends object | undefined,
> = [SetupInput] extends [undefined]
  ? (rngSeed: string | number) => CanonicalState<GameData>
  : (input: SetupInput, rngSeed: string | number) => CanonicalState<GameData>;

function createInitialRuntimeState<
  RootState extends GameState,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
>(
  game: AnyGameDefinition<RootState, TCommandDefinition>,
  rngSeed: string | number,
): RuntimeState {
  const runtime: RuntimeState = {
    progression: {
      currentStage: {
        id: game.initialStage.id,
        kind: "automatic",
      },
      lastActingStage: null,
    },
    rng: {
      seed: rngSeed,
      cursor: 0,
    },
    history: {
      entries: [],
    },
  };

  return runtime;
}

function initializeGameState<
  RootState extends GameState,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
>(
  game: AnyGameDefinition<RootState, TCommandDefinition>,
  input: object | undefined,
  rngSeed: string | number,
): CanonicalState<CanonicalStateOf<RootState>> {
  if (typeof rngSeed !== "string" && typeof rngSeed !== "number") {
    throw new Error("rng_seed_required");
  }

  if (game.setupInputSchema && input === undefined) {
    throw new Error("setup_input_required");
  }

  if (game.setupInputSchema && input !== undefined) {
    assertSchemaValue(game.setupInputSchema, input);
  }

  const gameState = structuredClone(game.defaultCanonicalGameState);
  const runtime = createInitialRuntimeState(game, rngSeed);
  const rng = createRNGService(runtime.rng);

  validateCanonicalGameState(game, gameState);

  if (game.setupInputSchema) {
    if (input === undefined) {
      throw new Error("setup_input_required");
    }

    game.setup?.({
      game: createCommandGameView(
        game,
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
      input,
    });
  } else {
    game.setup?.({
      game: createCommandGameView(
        game,
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
    });
  }

  validateCanonicalGameState(game, gameState);

  initializeStageMachine(
    {
      game: gameState,
      runtime,
    },
    game,
    rng,
  );

  validateCanonicalState(game, {
    game: gameState,
    runtime,
  });

  return {
    game: gameState,
    runtime,
  };
}

function getCurrentStageDefinition<
  RootState extends GameState,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
>(
  game: AnyGameDefinition<RootState, TCommandDefinition>,
  state: CanonicalState<CanonicalStateOf<RootState>>,
): StageDefinition<StateClassOf<RootState>> | undefined {
  return game.stages[state.runtime.progression.currentStage.id] as
    | StageDefinition<StateClassOf<RootState>>
    | undefined;
}

function resolveStageNextStages<HydratedState extends object>(
  stage: StageDefinition<HydratedState>,
) {
  return stage.nextStages?.() ?? {};
}

function initializeStageMachine<
  RootState extends GameState,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
>(
  state: CanonicalState<CanonicalStateOf<RootState>>,
  game: AnyGameDefinition<RootState, TCommandDefinition>,
  rng: ReturnType<typeof createRNGService>,
): void {
  let currentStage = game.initialStage as
    | StageDefinition<StateClassOf<RootState>>
    | undefined;

  while (currentStage) {
    if (currentStage.kind === "activePlayer") {
      state.runtime.progression.currentStage = {
        id: currentStage.id,
        kind: "activePlayer",
        activePlayerId: currentStage.activePlayer({
          game: createCommandGameView(game, state, { readonly: true }),
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
          game: createCommandGameView(game, state, { readonly: true }),
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
      game: createCommandGameView(game, state, { allowDirectMutation: true }),
      runtime: state.runtime,
      rng,
      emitEvent() {},
    });

    if (!currentStage.transition) {
      return;
    }

    currentStage = currentStage.transition({
      game: createCommandGameView(game, state, { readonly: true }),
      runtime: state.runtime,
      nextStages: resolveStageNextStages(currentStage),
    });
  }
}

function advanceStageMachine<
  RootState extends GameState,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
>(
  state: CanonicalState<CanonicalStateOf<RootState>>,
  game: AnyGameDefinition<RootState, TCommandDefinition>,
  nextStage: StageDefinition<StateClassOf<RootState>>,
  rng: ReturnType<typeof createRNGService>,
  emitEvent: (event: GameEvent) => void,
): void {
  let currentStage: StageDefinition<StateClassOf<RootState>> | undefined =
    nextStage;

  while (currentStage) {
    if (currentStage.kind === "activePlayer") {
      const stageState: StageState = {
        id: currentStage.id,
        kind: "activePlayer",
        activePlayerId: currentStage.activePlayer({
          game: createCommandGameView(game, state, { readonly: true }),
          runtime: state.runtime,
        }),
      };
      state.runtime.progression.currentStage = stageState;
      emitEvent(createStageEnteredEvent(stageState));
      return;
    }

    if (currentStage.kind === "multiActivePlayer") {
      const memory = currentStage.memory();
      const stageState: StageState = {
        id: currentStage.id,
        kind: "multiActivePlayer",
        activePlayerIds: currentStage.activePlayers({
          game: createCommandGameView(game, state, { readonly: true }),
          runtime: state.runtime,
          memory,
        }),
        memory,
      };
      state.runtime.progression.currentStage = stageState;
      emitEvent(createStageEnteredEvent(stageState));
      return;
    }

    const stageState: StageState = {
      id: currentStage.id,
      kind: "automatic",
    };
    state.runtime.progression.currentStage = stageState;
    emitEvent(createStageEnteredEvent(stageState));

    currentStage.run?.({
      game: createCommandGameView(game, state, { allowDirectMutation: true }),
      runtime: state.runtime,
      rng,
      emitEvent,
    });

    if (!currentStage.transition) {
      return;
    }

    emitEvent(createStageExitedEvent(stageState));
    currentStage = currentStage.transition({
      game: createCommandGameView(game, state, { readonly: true }),
      runtime: state.runtime,
      nextStages: resolveStageNextStages(currentStage),
    });
  }
}

export function createGameExecutor<
  RootState extends GameState,
  SetupInput extends object,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
>(
  game: GameDefinitionWithSetupInput<RootState, SetupInput, TCommandDefinition>,
): GameExecutor<RootState, SetupInput, TCommandDefinition>;

export function createGameExecutor<
  RootState extends GameState,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
>(
  game: GameDefinitionWithoutSetupInput<RootState, TCommandDefinition>,
): GameExecutor<RootState, undefined, TCommandDefinition>;

export function createGameExecutor<
  RootState extends GameState,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
>(game: AnyGameDefinition<RootState, TCommandDefinition>) {
  if (game.setupInputSchema) {
    return createGameExecutorWithSetup(game);
  }

  return createGameExecutorWithoutSetup(game);
}

// Factories use `object` for SetupInput internally; the public overloads on
// `createGameExecutor` preserve the caller's concrete SetupInput type.
function createGameExecutorWithSetup<
  RootState extends GameState,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
>(
  game: GameDefinitionWithSetupInput<RootState, object, TCommandDefinition>,
): GameExecutor<RootState, object, TCommandDefinition> {
  return {
    createInitialState(input, rngSeed) {
      return initializeGameState(game, input, rngSeed);
    },
    ...createExecutorMethods(game),
  };
}

function createGameExecutorWithoutSetup<
  RootState extends GameState,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
>(
  game: GameDefinitionWithoutSetupInput<RootState, TCommandDefinition>,
): GameExecutor<RootState, undefined, TCommandDefinition> {
  return {
    createInitialState(rngSeed) {
      return initializeGameState(game, undefined, rngSeed);
    },
    ...createExecutorMethods(game),
  };
}

function createExecutorMethods<
  RootState extends GameState,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
>(
  game: AnyGameDefinition<RootState, TCommandDefinition>,
): Omit<
  GameExecutor<RootState, never, TCommandDefinition>,
  "createInitialState"
> {
  return {
    getView(state, viewer) {
      validateCanonicalState(game, state);
      return getVisibleStateView<
        CanonicalStateOf<RootState>,
        ViewOf<RootState>
      >(state, viewer, game.stateFacade);
    },

    listAvailableCommands(state, options) {
      validateCanonicalState(game, state);
      const currentStageState = state.runtime.progression.currentStage;
      const currentStage = getCurrentStageDefinition(game, state);

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
        .filter((definition) => {
          if (!definition.isAvailable) {
            return true;
          }

          return definition.isAvailable(
            createCommandAvailabilityContext(
              state,
              createCommandGameView(game, state, { readonly: true }),
              definition.commandId,
              options.actorId,
            ),
          );
        })
        .map((definition) => definition.commandId);
    },

    discoverCommand(state, discovery) {
      validateCanonicalState(game, state);
      const currentStage = getCurrentStageDefinition(game, state);

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

      const definition = game.commands[discovery.type];
      if (!definition) {
        return null;
      }

      const discoveryDefinition = definition?.discovery;

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
        definition.isAvailable &&
        !definition.isAvailable(
          createCommandAvailabilityContext(
            state,
            createCommandGameView(game, state, { readonly: true }),
            discovery.type,
            discovery.actorId,
          ),
        )
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

      const discoveryContext = createDiscoveryContext(
        state,
        createCommandGameView(game, state, { readonly: true }),
        discovery,
      );

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
          assertSchemaValue(definition.commandSchema, completion.input);
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
      validateCanonicalState(game, state);
      const definition = game.commands[command.type];

      if (!definition) {
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

      const currentStageState = state.runtime.progression.currentStage;
      const currentStage = getCurrentStageDefinition(game, state);

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

      const validation = definition.validate(
        createValidationContext(
          state,
          createCommandGameView(game, state, { readonly: true }),
          command,
        ),
      );

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

      const workingState = structuredClone(state);
      const collector = createEventCollector();
      const rng = createRNGService(workingState.runtime.rng);

      if (
        currentStage.kind === "activePlayer" &&
        currentStageState.kind === "activePlayer"
      ) {
        executeCommandAgainstState(
          workingState,
          game,
          definition,
          command,
          rng,
          collector.emit,
        );
        workingState.runtime.progression.lastActingStage = {
          id: currentStageState.id,
          kind: "activePlayer",
          activePlayerId: currentStageState.activePlayerId,
        } satisfies SingleActivePlayerStageState;

        const nextCurrentStage = getCurrentStageDefinition(game, workingState);

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
          game,
          nextCurrentStage.transition({
            game: createCommandGameView(game, workingState, { readonly: true }),
            runtime: workingState.runtime,
            command: command as Parameters<
              typeof nextCurrentStage.transition
            >[0]["command"],
            nextStages: resolveStageNextStages(nextCurrentStage),
          }),
          rng,
          collector.emit,
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
          game: createCommandGameView(game, workingState, { readonly: true }),
          runtime: workingState.runtime,
          memory,
          command: command as Parameters<
            typeof currentStage.onSubmit
          >[0]["command"],
          execute: (submittedCommand) => {
            const submittedDefinition = game.commands[submittedCommand.type];

            if (!submittedDefinition) {
              throw new Error(
                `unknown_command_in_multi_active_execute:${submittedCommand.type}`,
              );
            }

            executeCommandAgainstState(
              workingState,
              game,
              submittedDefinition,
              submittedCommand,
              rng,
              collector.emit,
            );
          },
        });

        const nextActivePlayerIds = currentStage.activePlayers({
          game: createCommandGameView(game, workingState, { readonly: true }),
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
            game: createCommandGameView(game, workingState, { readonly: true }),
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
            game,
            currentStage.transition({
              game: createCommandGameView(game, workingState, {
                readonly: true,
              }),
              runtime: workingState.runtime,
              memory,
              nextStages: resolveStageNextStages(currentStage),
            }),
            rng,
            collector.emit,
          );
        }
      }

      validateCanonicalState(game, workingState);

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
  RootState extends GameState,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
>(
  state: CanonicalState<CanonicalStateOf<RootState>>,
  game: AnyGameDefinition<RootState, TCommandDefinition>,
  definition: RuntimeCommandDefinition<StateClassOf<RootState>>,
  command: Command,
  rng: ReturnType<typeof createRNGService>,
  emitEvent: (event: GameEvent) => void,
): void {
  definition.execute(
    createExecuteContext(
      state,
      createCommandGameView(game, state, { allowDirectMutation: true }),
      command,
      rng,
      emitEvent,
    ),
  );

  state.runtime.history.entries.push({
    id: String(state.runtime.history.entries.length + 1),
    commandType: command.type,
    actorId: command.actorId,
  });
}
