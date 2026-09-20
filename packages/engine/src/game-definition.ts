import type {
  RuntimeCommandDefinition,
  CommandDefinition,
} from "./types/command";
import type {
  CommandDefinitionsFromStageDefinition,
  StageDefinition,
  StageDefinitionMap,
} from "./types/progression";
import type { RuntimeState } from "./types/state";
import type { RNGApi } from "./types/rng";
import {
  compileStateFacadeDefinition,
  type CompiledStateFacadeDefinition,
} from "./state-facade/compile";
import {
  compileCanonicalGameStateSchema,
  createDefaultCanonicalGameState,
} from "./state-facade/canonical";
import { compileVisibleStateSchema } from "./state-facade/view-schema";
import {
  compileProgressionStateSchema,
  compileRuntimeStateSchema,
} from "./runtime/runtime-schema";
import { assertSchemaValue } from "./runtime/validation";
import type {
  CanonicalStateOf,
  AnyGameStateDefinition,
  StateClassOf,
} from "./state/game-state";
import type { FieldType, ObjectFieldType, ObjectSchemaStatic } from "./schema";
import type { EventRegistry, EmptyEventRegistry } from "./events/registry";
import type { TSchema } from "@sinclair/typebox";

type CommandDefinitionMap<HydratedState extends object> = Record<
  string,
  RuntimeCommandDefinition<HydratedState>
>;

type SetupInputFromSchema<
  TSchema extends ObjectFieldType<Record<string, FieldType>> | undefined,
> =
  TSchema extends ObjectFieldType<infer TProperties>
    ? ObjectSchemaStatic<TProperties>
    : undefined;

export interface PlayerBounds {
  min: number;
  max: number;
}

export interface GameSetupContextWithoutInput<HydratedState extends object> {
  game: HydratedState;
  runtime: RuntimeState;
  rng: RNGApi;
  players: readonly string[];
}

export interface GameSetupContextWithInput<
  HydratedState extends object,
  SetupInput extends object,
> {
  game: HydratedState;
  runtime: RuntimeState;
  rng: RNGApi;
  players: readonly string[];
  input: SetupInput;
}

interface BaseGameDefinition<
  RootState extends AnyGameStateDefinition,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
  TEventRegistry extends EventRegistry = EmptyEventRegistry,
> {
  name: string;
  playerBounds: PlayerBounds;
  rootState: RootState;
  commands: CommandDefinitionMap<StateClassOf<RootState>>;
  stateFacade: CompiledStateFacadeDefinition;
  canonicalGameStateSchema: ObjectFieldType<Record<string, FieldType>>;
  visibleStateSchema: TSchema;
  runtimeStateSchema: TSchema;
  defaultCanonicalGameState: CanonicalStateOf<RootState>;
  initialStage: StageDefinition<StateClassOf<RootState>>;
  stages: Record<string, StageDefinition<StateClassOf<RootState>>>;
  eventDefinitions: EventRegistry;
  readonly __commandDefinitions: TCommandDefinition;
  readonly __eventDefinitions: TEventRegistry;
}

export interface GameDefinitionWithoutSetupInput<
  RootState extends AnyGameStateDefinition,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
  TEventRegistry extends EventRegistry = EmptyEventRegistry,
> extends BaseGameDefinition<RootState, TCommandDefinition, TEventRegistry> {
  setupInputSchema?: undefined;
  setup?: (
    context: GameSetupContextWithoutInput<StateClassOf<RootState>>,
  ) => void;
}

export interface GameDefinitionWithSetupInput<
  RootState extends AnyGameStateDefinition,
  SetupInput extends object,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
  TEventRegistry extends EventRegistry = EmptyEventRegistry,
> extends BaseGameDefinition<RootState, TCommandDefinition, TEventRegistry> {
  setupInputSchema: ObjectFieldType<Record<string, FieldType>>;
  setup?(
    context: GameSetupContextWithInput<StateClassOf<RootState>, SetupInput>,
  ): void;
}

export type GameDefinition<
  RootState extends AnyGameStateDefinition = AnyGameStateDefinition,
  SetupInput extends object | undefined = object | undefined,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>> =
    CommandDefinition<StateClassOf<RootState>>,
  TEventRegistry extends EventRegistry = EmptyEventRegistry,
> = [SetupInput] extends [undefined]
  ? GameDefinitionWithoutSetupInput<
      RootState,
      TCommandDefinition,
      TEventRegistry
    >
  : GameDefinitionWithSetupInput<
      RootState,
      Extract<SetupInput, object>,
      TCommandDefinition,
      TEventRegistry
    >;

export type AnyGameDefinition<
  RootState extends AnyGameStateDefinition = AnyGameStateDefinition,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>> =
    CommandDefinition<StateClassOf<RootState>>,
  TEventRegistry extends EventRegistry = EventRegistry,
> =
  | GameDefinitionWithoutSetupInput<
      RootState,
      TCommandDefinition,
      TEventRegistry
    >
  | GameDefinitionWithSetupInput<
      RootState,
      object,
      TCommandDefinition,
      TEventRegistry
    >;

export class GameDefinitionBuilder<
  RootState extends AnyGameStateDefinition = AnyGameStateDefinition,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>> = never,
  TEventRegistry extends EventRegistry = EmptyEventRegistry,
> {
  private readonly name: string;
  private playerBounds?: PlayerBounds;
  private rootStateDefinition?: RootState;
  private initialStageDefinition?: StageDefinition<StateClassOf<RootState>>;
  private eventDefinitionsRegistry: EventRegistry = {};

  constructor(name: string) {
    this.name = name;
  }

  players(playerBounds: PlayerBounds): this {
    this.playerBounds = validatePlayerBounds(playerBounds);
    return this;
  }

  state<NextRootState extends AnyGameStateDefinition>(
    rootState: NextRootState,
  ): GameDefinitionBuilder<NextRootState, never, TEventRegistry> {
    this.rootStateDefinition = rootState as unknown as RootState;
    return this as unknown as GameDefinitionBuilder<
      NextRootState,
      never,
      TEventRegistry
    >;
  }

  events<NextRegistry extends EventRegistry>(
    registry: NextRegistry,
  ): GameDefinitionBuilder<RootState, TCommandDefinition, NextRegistry> {
    this.eventDefinitionsRegistry = registry;
    return this as unknown as GameDefinitionBuilder<
      RootState,
      TCommandDefinition,
      NextRegistry
    >;
  }

  initialStage<InitialStage extends StageDefinition<StateClassOf<RootState>>>(
    initialStage: InitialStage,
  ): GameDefinitionBuilder<
    RootState,
    CommandDefinitionsFromStageDefinition<InitialStage>,
    TEventRegistry
  > {
    this.initialStageDefinition = initialStage;
    return this as unknown as GameDefinitionBuilder<
      RootState,
      CommandDefinitionsFromStageDefinition<InitialStage>,
      TEventRegistry
    >;
  }

  setupInput<TSchema extends ObjectFieldType<Record<string, FieldType>>>(
    schema: TSchema,
  ): GameDefinitionBuilderWithSetupInput<
    RootState,
    Extract<SetupInputFromSchema<TSchema>, object>,
    TCommandDefinition,
    TEventRegistry
  > {
    if (schema.kind !== "object") {
      throw new Error("setup_input_schema_must_be_object");
    }

    return new GameDefinitionBuilderWithSetupInput(
      this.name,
      schema,
      this.rootStateDefinition,
      this.initialStageDefinition,
      undefined,
      this.eventDefinitionsRegistry,
      this.playerBounds,
    );
  }

  setup(
    setup: (
      context: GameSetupContextWithoutInput<StateClassOf<RootState>>,
    ) => void,
  ): GameDefinitionBuilderWithoutSetupInput<
    RootState,
    TCommandDefinition,
    TEventRegistry
  > {
    return new GameDefinitionBuilderWithoutSetupInput(
      this.name,
      this.rootStateDefinition,
      this.initialStageDefinition,
      setup,
      this.eventDefinitionsRegistry,
      this.playerBounds,
    );
  }

  build(): GameDefinitionWithoutSetupInput<
    RootState,
    TCommandDefinition,
    TEventRegistry
  > {
    const base = assembleBaseDefinition<
      RootState,
      TCommandDefinition,
      TEventRegistry
    >(
      this.name,
      this.rootStateDefinition,
      this.initialStageDefinition,
      this.eventDefinitionsRegistry,
      requirePlayerBounds(this.playerBounds),
    );
    return {
      ...base,
      setupInputSchema: undefined,
      setup: undefined,
    };
  }
}

export class GameDefinitionBuilderWithoutSetupInput<
  RootState extends AnyGameStateDefinition,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>> = never,
  TEventRegistry extends EventRegistry = EmptyEventRegistry,
> {
  private readonly name: string;
  private playerBounds?: PlayerBounds;
  private rootStateDefinition?: RootState;
  private initialStageDefinition?: StageDefinition<StateClassOf<RootState>>;
  private setupCallback?: (
    context: GameSetupContextWithoutInput<StateClassOf<RootState>>,
  ) => void;
  private eventDefinitionsRegistry: EventRegistry;

  constructor(
    name: string,
    rootState: RootState | undefined,
    initialStage: StageDefinition<StateClassOf<RootState>> | undefined,
    setup:
      | ((
          context: GameSetupContextWithoutInput<StateClassOf<RootState>>,
        ) => void)
      | undefined,
    eventDefinitions: EventRegistry = {},
    playerBounds?: PlayerBounds,
  ) {
    this.name = name;
    this.rootStateDefinition = rootState;
    this.initialStageDefinition = initialStage;
    this.setupCallback = setup;
    this.eventDefinitionsRegistry = eventDefinitions;
    this.playerBounds = playerBounds;
  }

  players(playerBounds: PlayerBounds): this {
    this.playerBounds = validatePlayerBounds(playerBounds);
    return this;
  }

  state<NextRootState extends AnyGameStateDefinition>(
    rootState: NextRootState,
  ): GameDefinitionBuilderWithoutSetupInput<
    NextRootState,
    never,
    TEventRegistry
  > {
    this.rootStateDefinition = rootState as unknown as RootState;
    return this as unknown as GameDefinitionBuilderWithoutSetupInput<
      NextRootState,
      never,
      TEventRegistry
    >;
  }

  events<NextRegistry extends EventRegistry>(
    registry: NextRegistry,
  ): GameDefinitionBuilderWithoutSetupInput<
    RootState,
    TCommandDefinition,
    NextRegistry
  > {
    this.eventDefinitionsRegistry = registry;
    return this as unknown as GameDefinitionBuilderWithoutSetupInput<
      RootState,
      TCommandDefinition,
      NextRegistry
    >;
  }

  initialStage<InitialStage extends StageDefinition<StateClassOf<RootState>>>(
    initialStage: InitialStage,
  ): GameDefinitionBuilderWithoutSetupInput<
    RootState,
    CommandDefinitionsFromStageDefinition<InitialStage>,
    TEventRegistry
  > {
    this.initialStageDefinition = initialStage;
    return this as unknown as GameDefinitionBuilderWithoutSetupInput<
      RootState,
      CommandDefinitionsFromStageDefinition<InitialStage>,
      TEventRegistry
    >;
  }

  setup(
    setup: (
      context: GameSetupContextWithoutInput<StateClassOf<RootState>>,
    ) => void,
  ): this {
    this.setupCallback = setup;
    return this;
  }

  build(): GameDefinitionWithoutSetupInput<
    RootState,
    TCommandDefinition,
    TEventRegistry
  > {
    const base = assembleBaseDefinition<
      RootState,
      TCommandDefinition,
      TEventRegistry
    >(
      this.name,
      this.rootStateDefinition,
      this.initialStageDefinition,
      this.eventDefinitionsRegistry,
      requirePlayerBounds(this.playerBounds),
    );
    return {
      ...base,
      setupInputSchema: undefined,
      setup: this.setupCallback,
    };
  }
}

export class GameDefinitionBuilderWithSetupInput<
  RootState extends AnyGameStateDefinition,
  SetupInput extends object,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>> = never,
  TEventRegistry extends EventRegistry = EmptyEventRegistry,
> {
  private readonly name: string;
  private playerBounds?: PlayerBounds;
  private readonly setupInputSchema: ObjectFieldType<Record<string, FieldType>>;
  private rootStateDefinition?: RootState;
  private initialStageDefinition?: StageDefinition<StateClassOf<RootState>>;
  private setupCallback?: (
    context: GameSetupContextWithInput<StateClassOf<RootState>, SetupInput>,
  ) => void;
  private eventDefinitionsRegistry: EventRegistry;

  constructor(
    name: string,
    setupInputSchema: ObjectFieldType<Record<string, FieldType>>,
    rootState: RootState | undefined,
    initialStage: StageDefinition<StateClassOf<RootState>> | undefined,
    setup:
      | ((
          context: GameSetupContextWithInput<
            StateClassOf<RootState>,
            SetupInput
          >,
        ) => void)
      | undefined,
    eventDefinitions: EventRegistry = {},
    playerBounds?: PlayerBounds,
  ) {
    this.name = name;
    this.setupInputSchema = setupInputSchema;
    this.rootStateDefinition = rootState;
    this.initialStageDefinition = initialStage;
    this.setupCallback = setup;
    this.eventDefinitionsRegistry = eventDefinitions;
    this.playerBounds = playerBounds;
  }

  players(playerBounds: PlayerBounds): this {
    this.playerBounds = validatePlayerBounds(playerBounds);
    return this;
  }

  state<NextRootState extends AnyGameStateDefinition>(
    rootState: NextRootState,
  ): GameDefinitionBuilderWithSetupInput<
    NextRootState,
    SetupInput,
    never,
    TEventRegistry
  > {
    this.rootStateDefinition = rootState as unknown as RootState;
    return this as unknown as GameDefinitionBuilderWithSetupInput<
      NextRootState,
      SetupInput,
      never,
      TEventRegistry
    >;
  }

  events<NextRegistry extends EventRegistry>(
    registry: NextRegistry,
  ): GameDefinitionBuilderWithSetupInput<
    RootState,
    SetupInput,
    TCommandDefinition,
    NextRegistry
  > {
    this.eventDefinitionsRegistry = registry;
    return this as unknown as GameDefinitionBuilderWithSetupInput<
      RootState,
      SetupInput,
      TCommandDefinition,
      NextRegistry
    >;
  }

  initialStage<InitialStage extends StageDefinition<StateClassOf<RootState>>>(
    initialStage: InitialStage,
  ): GameDefinitionBuilderWithSetupInput<
    RootState,
    SetupInput,
    CommandDefinitionsFromStageDefinition<InitialStage>,
    TEventRegistry
  > {
    this.initialStageDefinition = initialStage;
    return this as unknown as GameDefinitionBuilderWithSetupInput<
      RootState,
      SetupInput,
      CommandDefinitionsFromStageDefinition<InitialStage>,
      TEventRegistry
    >;
  }

  setup(
    setup: (
      context: GameSetupContextWithInput<StateClassOf<RootState>, SetupInput>,
    ) => void,
  ): this {
    this.setupCallback = setup;
    return this;
  }

  build(): GameDefinitionWithSetupInput<
    RootState,
    SetupInput,
    TCommandDefinition,
    TEventRegistry
  > {
    const base = assembleBaseDefinition<
      RootState,
      TCommandDefinition,
      TEventRegistry
    >(
      this.name,
      this.rootStateDefinition,
      this.initialStageDefinition,
      this.eventDefinitionsRegistry,
      requirePlayerBounds(this.playerBounds),
    );
    return {
      ...base,
      setupInputSchema: this.setupInputSchema,
      setup: this.setupCallback,
    };
  }
}

function assembleBaseDefinition<
  RootState extends AnyGameStateDefinition,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
  TEventRegistry extends EventRegistry = EmptyEventRegistry,
>(
  name: string,
  rootState: RootState | undefined,
  initialStage: StageDefinition<StateClassOf<RootState>> | undefined,
  eventDefinitions: EventRegistry,
  playerBounds: PlayerBounds,
): BaseGameDefinition<RootState, TCommandDefinition, TEventRegistry> {
  if (!rootState) {
    throw new Error("root_state_required");
  }

  if (!initialStage) {
    throw new Error("initial_stage_required");
  }

  const stages = collectReachableStages(initialStage);
  const commands = compileCommandMapFromStages(stages);
  const stateFacade = compileStateFacadeDefinition(rootState);
  const canonicalGameStateSchema = compileCanonicalGameStateSchema(rootState);
  const progressionStateSchema = compileProgressionStateSchema(stages);
  const visibleStateSchema = compileVisibleStateSchema(
    stateFacade,
    progressionStateSchema,
  );
  const runtimeStateSchema = compileRuntimeStateSchema(stages);
  const defaultCanonicalGameState = createDefaultCanonicalGameState(rootState);
  assertSchemaValue(canonicalGameStateSchema, defaultCanonicalGameState);

  return {
    name,
    playerBounds,
    rootState,
    commands,
    stateFacade,
    canonicalGameStateSchema,
    visibleStateSchema,
    runtimeStateSchema,
    defaultCanonicalGameState,
    initialStage,
    stages,
    eventDefinitions,
    __commandDefinitions: undefined as unknown as TCommandDefinition,
    __eventDefinitions: undefined as unknown as TEventRegistry,
  };
}

function validatePlayerBounds(playerBounds: PlayerBounds): PlayerBounds {
  if (
    !Number.isInteger(playerBounds.min) ||
    !Number.isInteger(playerBounds.max) ||
    playerBounds.min < 1 ||
    playerBounds.max < playerBounds.min
  ) {
    throw new Error("invalid_player_bounds");
  }

  return { ...playerBounds };
}

function requirePlayerBounds(
  playerBounds: PlayerBounds | undefined,
): PlayerBounds {
  if (!playerBounds) {
    throw new Error("player_bounds_required");
  }

  return playerBounds;
}

function collectReachableStages<HydratedState extends object>(
  initialStage: StageDefinition<HydratedState>,
): Record<string, StageDefinition<HydratedState>> {
  const stages: Record<string, StageDefinition<HydratedState>> = {};
  const stack = [initialStage];

  while (stack.length > 0) {
    const stage = stack.pop()!;
    const existing = stages[stage.id];

    if (existing) {
      if (existing !== stage) {
        throw new Error(`duplicate_stage_id:${stage.id}`);
      }

      continue;
    }

    stages[stage.id] = stage;

    for (const nextStage of Object.values(resolveNextStages(stage))) {
      stack.push(nextStage);
    }
  }

  return stages;
}

function resolveNextStages<HydratedState extends object>(
  stage: StageDefinition<HydratedState>,
): StageDefinitionMap<HydratedState> {
  return stage.nextStages?.() ?? {};
}

function compileCommandMapFromStages<HydratedState extends object>(
  stages: Record<string, StageDefinition<HydratedState>>,
): CommandDefinitionMap<HydratedState> {
  const commandMap: CommandDefinitionMap<HydratedState> = {};
  for (const stage of Object.values(stages)) {
    if (stage.kind === "activePlayer" || stage.kind === "multiActivePlayer") {
      for (const command of stage.commands) {
        const existing = commandMap[command.commandId];

        if (existing && existing !== command) {
          throw new Error(`duplicate_command_id:${command.commandId}`);
        }

        commandMap[command.commandId] = command;
      }
    }
  }

  return commandMap;
}
