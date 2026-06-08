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
import { compileRuntimeStateSchema } from "./runtime/runtime-schema";
import { assertSchemaValue } from "./runtime/validation";
import type {
  CanonicalStateOf,
  GameState,
  StateClassOf,
} from "./state/game-state";
import type { FieldType, ObjectFieldType, ObjectSchemaStatic } from "./schema";
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

export interface GameSetupContextWithoutInput<HydratedState extends object> {
  game: HydratedState;
  runtime: RuntimeState;
  rng: RNGApi;
}

export interface GameSetupContextWithInput<
  HydratedState extends object,
  SetupInput extends object,
> {
  game: HydratedState;
  runtime: RuntimeState;
  rng: RNGApi;
  input: SetupInput;
}

interface BaseGameDefinition<
  RootState extends GameState,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
> {
  name: string;
  rootState: RootState;
  commands: CommandDefinitionMap<StateClassOf<RootState>>;
  stateFacade: CompiledStateFacadeDefinition;
  canonicalGameStateSchema: ObjectFieldType<Record<string, FieldType>>;
  visibleStateSchema: TSchema;
  runtimeStateSchema: TSchema;
  defaultCanonicalGameState: CanonicalStateOf<RootState>;
  initialStage: StageDefinition<StateClassOf<RootState>>;
  stages: Record<string, StageDefinition<StateClassOf<RootState>>>;
  readonly __commandDefinitions: TCommandDefinition;
}

export interface GameDefinitionWithoutSetupInput<
  RootState extends GameState,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
> extends BaseGameDefinition<RootState, TCommandDefinition> {
  setupInputSchema?: undefined;
  setup?: (
    context: GameSetupContextWithoutInput<StateClassOf<RootState>>,
  ) => void;
}

export interface GameDefinitionWithSetupInput<
  RootState extends GameState,
  SetupInput extends object,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
> extends BaseGameDefinition<RootState, TCommandDefinition> {
  setupInputSchema: ObjectFieldType<Record<string, FieldType>>;
  setup?: (
    context: GameSetupContextWithInput<StateClassOf<RootState>, SetupInput>,
  ) => void;
}

export type GameDefinition<
  RootState extends GameState = GameState,
  SetupInput extends object | undefined = object | undefined,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>> =
    CommandDefinition<StateClassOf<RootState>>,
> = [SetupInput] extends [undefined]
  ? GameDefinitionWithoutSetupInput<RootState, TCommandDefinition>
  : GameDefinitionWithSetupInput<
      RootState,
      Extract<SetupInput, object>,
      TCommandDefinition
    >;

export type AnyGameDefinition<
  RootState extends GameState = GameState,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>> =
    CommandDefinition<StateClassOf<RootState>>,
> =
  | GameDefinitionWithoutSetupInput<RootState, TCommandDefinition>
  | GameDefinitionWithSetupInput<RootState, object, TCommandDefinition>;

export class GameDefinitionBuilder<
  RootState extends GameState = GameState,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>> = never,
> {
  private readonly name: string;
  private rootStateDefinition?: RootState;
  private initialStageDefinition?: StageDefinition<StateClassOf<RootState>>;

  constructor(name: string) {
    this.name = name;
  }

  state<NextRootState extends GameState>(
    rootState: NextRootState,
  ): GameDefinitionBuilder<NextRootState, never> {
    this.rootStateDefinition = rootState as unknown as RootState;
    return this as unknown as GameDefinitionBuilder<NextRootState, never>;
  }

  initialStage<InitialStage extends StageDefinition<StateClassOf<RootState>>>(
    initialStage: InitialStage,
  ): GameDefinitionBuilder<
    RootState,
    CommandDefinitionsFromStageDefinition<InitialStage>
  > {
    this.initialStageDefinition = initialStage;
    return this as unknown as GameDefinitionBuilder<
      RootState,
      CommandDefinitionsFromStageDefinition<InitialStage>
    >;
  }

  setupInput<TSchema extends ObjectFieldType<Record<string, FieldType>>>(
    schema: TSchema,
  ): GameDefinitionBuilderWithSetupInput<
    RootState,
    Extract<SetupInputFromSchema<TSchema>, object>,
    TCommandDefinition
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
    );
  }

  setup(
    setup: (
      context: GameSetupContextWithoutInput<StateClassOf<RootState>>,
    ) => void,
  ): GameDefinitionBuilderWithoutSetupInput<RootState, TCommandDefinition> {
    return new GameDefinitionBuilderWithoutSetupInput(
      this.name,
      this.rootStateDefinition,
      this.initialStageDefinition,
      setup,
    );
  }

  build(): GameDefinitionWithoutSetupInput<RootState, TCommandDefinition> {
    const base = assembleBaseDefinition<RootState, TCommandDefinition>(
      this.name,
      this.rootStateDefinition,
      this.initialStageDefinition,
    );
    return {
      ...base,
      setupInputSchema: undefined,
      setup: undefined,
    };
  }
}

export class GameDefinitionBuilderWithoutSetupInput<
  RootState extends GameState,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>> = never,
> {
  private readonly name: string;
  private rootStateDefinition?: RootState;
  private initialStageDefinition?: StageDefinition<StateClassOf<RootState>>;
  private setupCallback?: (
    context: GameSetupContextWithoutInput<StateClassOf<RootState>>,
  ) => void;

  constructor(
    name: string,
    rootState: RootState | undefined,
    initialStage: StageDefinition<StateClassOf<RootState>> | undefined,
    setup:
      | ((
          context: GameSetupContextWithoutInput<StateClassOf<RootState>>,
        ) => void)
      | undefined,
  ) {
    this.name = name;
    this.rootStateDefinition = rootState;
    this.initialStageDefinition = initialStage;
    this.setupCallback = setup;
  }

  state<NextRootState extends GameState>(
    rootState: NextRootState,
  ): GameDefinitionBuilderWithoutSetupInput<NextRootState, never> {
    this.rootStateDefinition = rootState as unknown as RootState;
    return this as unknown as GameDefinitionBuilderWithoutSetupInput<
      NextRootState,
      never
    >;
  }

  initialStage<InitialStage extends StageDefinition<StateClassOf<RootState>>>(
    initialStage: InitialStage,
  ): GameDefinitionBuilderWithoutSetupInput<
    RootState,
    CommandDefinitionsFromStageDefinition<InitialStage>
  > {
    this.initialStageDefinition = initialStage;
    return this as unknown as GameDefinitionBuilderWithoutSetupInput<
      RootState,
      CommandDefinitionsFromStageDefinition<InitialStage>
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

  build(): GameDefinitionWithoutSetupInput<RootState, TCommandDefinition> {
    const base = assembleBaseDefinition<RootState, TCommandDefinition>(
      this.name,
      this.rootStateDefinition,
      this.initialStageDefinition,
    );
    return {
      ...base,
      setupInputSchema: undefined,
      setup: this.setupCallback,
    };
  }
}

export class GameDefinitionBuilderWithSetupInput<
  RootState extends GameState,
  SetupInput extends object,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>> = never,
> {
  private readonly name: string;
  private readonly setupInputSchema: ObjectFieldType<Record<string, FieldType>>;
  private rootStateDefinition?: RootState;
  private initialStageDefinition?: StageDefinition<StateClassOf<RootState>>;
  private setupCallback?: (
    context: GameSetupContextWithInput<StateClassOf<RootState>, SetupInput>,
  ) => void;

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
  ) {
    this.name = name;
    this.setupInputSchema = setupInputSchema;
    this.rootStateDefinition = rootState;
    this.initialStageDefinition = initialStage;
    this.setupCallback = setup;
  }

  state<NextRootState extends GameState>(
    rootState: NextRootState,
  ): GameDefinitionBuilderWithSetupInput<NextRootState, SetupInput, never> {
    this.rootStateDefinition = rootState as unknown as RootState;
    return this as unknown as GameDefinitionBuilderWithSetupInput<
      NextRootState,
      SetupInput,
      never
    >;
  }

  initialStage<InitialStage extends StageDefinition<StateClassOf<RootState>>>(
    initialStage: InitialStage,
  ): GameDefinitionBuilderWithSetupInput<
    RootState,
    SetupInput,
    CommandDefinitionsFromStageDefinition<InitialStage>
  > {
    this.initialStageDefinition = initialStage;
    return this as unknown as GameDefinitionBuilderWithSetupInput<
      RootState,
      SetupInput,
      CommandDefinitionsFromStageDefinition<InitialStage>
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
    TCommandDefinition
  > {
    const base = assembleBaseDefinition<RootState, TCommandDefinition>(
      this.name,
      this.rootStateDefinition,
      this.initialStageDefinition,
    );
    return {
      ...base,
      setupInputSchema: this.setupInputSchema,
      setup: this.setupCallback,
    };
  }
}

function assembleBaseDefinition<
  RootState extends GameState,
  TCommandDefinition extends CommandDefinition<StateClassOf<RootState>>,
>(
  name: string,
  rootState: RootState | undefined,
  initialStage: StageDefinition<StateClassOf<RootState>> | undefined,
): BaseGameDefinition<RootState, TCommandDefinition> {
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
  const visibleStateSchema = compileVisibleStateSchema(stateFacade);
  const runtimeStateSchema = compileRuntimeStateSchema(stages);
  const defaultCanonicalGameState = createDefaultCanonicalGameState(rootState);
  assertSchemaValue(canonicalGameStateSchema, defaultCanonicalGameState);

  return {
    name,
    rootState,
    commands,
    stateFacade,
    canonicalGameStateSchema,
    visibleStateSchema,
    runtimeStateSchema,
    defaultCanonicalGameState,
    initialStage,
    stages,
    __commandDefinitions: undefined as unknown as TCommandDefinition,
  };
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
