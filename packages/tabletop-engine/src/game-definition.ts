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
  type CanonicalGameState,
} from "./state-facade/canonical";
import { compileRuntimeStateSchema } from "./runtime/runtime-schema";
import { assertSchemaValue } from "./runtime/validation";
import type { GameState, GameStateClass } from "./state-facade/metadata";
import type { FieldType, ObjectFieldType, ObjectSchemaStatic } from "./schema";
import type { TSchema } from "@sinclair/typebox";

type CommandDefinitionMap<FacadeGameState extends GameState> = Record<
  string,
  RuntimeCommandDefinition<FacadeGameState>
>;

type SetupInputFromSchema<
  TSchema extends ObjectFieldType<Record<string, FieldType>> | undefined,
> =
  TSchema extends ObjectFieldType<infer TProperties>
    ? ObjectSchemaStatic<TProperties>
    : undefined;

export interface GameSetupContextWithoutInput<
  FacadeGameState extends GameState,
> {
  game: FacadeGameState;
  runtime: RuntimeState;
  rng: RNGApi;
}

export interface GameSetupContextWithInput<
  FacadeGameState extends GameState,
  SetupInput extends object,
> {
  game: FacadeGameState;
  runtime: RuntimeState;
  rng: RNGApi;
  input: SetupInput;
}

interface BaseGameDefinition<
  FacadeGameState extends GameState,
  TCommandDefinition extends CommandDefinition<FacadeGameState>,
> {
  name: string;
  commands: CommandDefinitionMap<FacadeGameState>;
  stateFacade: CompiledStateFacadeDefinition;
  canonicalGameStateSchema: ObjectFieldType<Record<string, FieldType>>;
  runtimeStateSchema: TSchema;
  defaultCanonicalGameState: CanonicalGameState<FacadeGameState>;
  initialStage: StageDefinition<FacadeGameState>;
  stages: Record<string, StageDefinition<FacadeGameState>>;
  readonly __commandDefinitions: TCommandDefinition;
}

export interface GameDefinitionWithoutSetupInput<
  FacadeGameState extends GameState,
  TCommandDefinition extends CommandDefinition<FacadeGameState>,
> extends BaseGameDefinition<FacadeGameState, TCommandDefinition> {
  setupInputSchema?: undefined;
  setup?: (context: GameSetupContextWithoutInput<FacadeGameState>) => void;
}

export interface GameDefinitionWithSetupInput<
  FacadeGameState extends GameState,
  SetupInput extends object,
  TCommandDefinition extends CommandDefinition<FacadeGameState>,
> extends BaseGameDefinition<FacadeGameState, TCommandDefinition> {
  setupInputSchema: ObjectFieldType<Record<string, FieldType>>;
  setup?: (
    context: GameSetupContextWithInput<FacadeGameState, SetupInput>,
  ) => void;
}

export type GameDefinition<
  FacadeGameState extends GameState,
  SetupInput extends object | undefined,
  TCommandDefinition extends CommandDefinition<FacadeGameState>,
> = [SetupInput] extends [undefined]
  ? GameDefinitionWithoutSetupInput<FacadeGameState, TCommandDefinition>
  : GameDefinitionWithSetupInput<
      FacadeGameState,
      Extract<SetupInput, object>,
      TCommandDefinition
    >;

export class GameDefinitionBuilder<
  FacadeGameState extends GameState = GameState,
  TCommandDefinition extends CommandDefinition<FacadeGameState> = never,
> {
  private readonly name: string;
  private rootStateClass?: GameStateClass<FacadeGameState>;
  private initialStageDefinition?: StageDefinition<FacadeGameState>;

  constructor(name: string) {
    this.name = name;
  }

  rootState<NextFacadeGameState extends GameState>(
    rootState: GameStateClass<NextFacadeGameState>,
  ): GameDefinitionBuilder<NextFacadeGameState, never> {
    this.rootStateClass =
      rootState as unknown as GameStateClass<FacadeGameState>;
    return this as unknown as GameDefinitionBuilder<NextFacadeGameState, never>;
  }

  initialStage<InitialStage extends StageDefinition<FacadeGameState>>(
    initialStage: InitialStage,
  ): GameDefinitionBuilder<
    FacadeGameState,
    CommandDefinitionsFromStageDefinition<InitialStage>
  > {
    this.initialStageDefinition = initialStage;
    return this as unknown as GameDefinitionBuilder<
      FacadeGameState,
      CommandDefinitionsFromStageDefinition<InitialStage>
    >;
  }

  setupInput<TSchema extends ObjectFieldType<Record<string, FieldType>>>(
    schema: TSchema,
  ): GameDefinitionBuilderWithSetupInput<
    FacadeGameState,
    Extract<SetupInputFromSchema<TSchema>, object>,
    TCommandDefinition
  > {
    if (schema.kind !== "object") {
      throw new Error("setup_input_schema_must_be_object");
    }

    return new GameDefinitionBuilderWithSetupInput(
      this.name,
      schema,
      this.rootStateClass,
      this.initialStageDefinition,
      undefined,
    );
  }

  setup(
    setup: (context: GameSetupContextWithoutInput<FacadeGameState>) => void,
  ): GameDefinitionBuilderWithoutSetupInput<
    FacadeGameState,
    TCommandDefinition
  > {
    return new GameDefinitionBuilderWithoutSetupInput(
      this.name,
      this.rootStateClass,
      this.initialStageDefinition,
      setup,
    );
  }

  build(): GameDefinitionWithoutSetupInput<
    FacadeGameState,
    TCommandDefinition
  > {
    const base = assembleBaseDefinition<FacadeGameState, TCommandDefinition>(
      this.name,
      this.rootStateClass,
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
  FacadeGameState extends GameState,
  TCommandDefinition extends CommandDefinition<FacadeGameState> = never,
> {
  private readonly name: string;
  private rootStateClass?: GameStateClass<FacadeGameState>;
  private initialStageDefinition?: StageDefinition<FacadeGameState>;
  private setupCallback?: (
    context: GameSetupContextWithoutInput<FacadeGameState>,
  ) => void;

  constructor(
    name: string,
    rootState: GameStateClass<FacadeGameState> | undefined,
    initialStage: StageDefinition<FacadeGameState> | undefined,
    setup:
      | ((context: GameSetupContextWithoutInput<FacadeGameState>) => void)
      | undefined,
  ) {
    this.name = name;
    this.rootStateClass = rootState;
    this.initialStageDefinition = initialStage;
    this.setupCallback = setup;
  }

  rootState<NextFacadeGameState extends GameState>(
    rootState: GameStateClass<NextFacadeGameState>,
  ): GameDefinitionBuilderWithoutSetupInput<NextFacadeGameState, never> {
    this.rootStateClass =
      rootState as unknown as GameStateClass<FacadeGameState>;
    return this as unknown as GameDefinitionBuilderWithoutSetupInput<
      NextFacadeGameState,
      never
    >;
  }

  initialStage<InitialStage extends StageDefinition<FacadeGameState>>(
    initialStage: InitialStage,
  ): GameDefinitionBuilderWithoutSetupInput<
    FacadeGameState,
    CommandDefinitionsFromStageDefinition<InitialStage>
  > {
    this.initialStageDefinition = initialStage;
    return this as unknown as GameDefinitionBuilderWithoutSetupInput<
      FacadeGameState,
      CommandDefinitionsFromStageDefinition<InitialStage>
    >;
  }

  setup(
    setup: (context: GameSetupContextWithoutInput<FacadeGameState>) => void,
  ): this {
    this.setupCallback = setup;
    return this;
  }

  build(): GameDefinitionWithoutSetupInput<
    FacadeGameState,
    TCommandDefinition
  > {
    const base = assembleBaseDefinition<FacadeGameState, TCommandDefinition>(
      this.name,
      this.rootStateClass,
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
  FacadeGameState extends GameState,
  SetupInput extends object,
  TCommandDefinition extends CommandDefinition<FacadeGameState> = never,
> {
  private readonly name: string;
  private readonly setupInputSchema: ObjectFieldType<Record<string, FieldType>>;
  private rootStateClass?: GameStateClass<FacadeGameState>;
  private initialStageDefinition?: StageDefinition<FacadeGameState>;
  private setupCallback?: (
    context: GameSetupContextWithInput<FacadeGameState, SetupInput>,
  ) => void;

  constructor(
    name: string,
    setupInputSchema: ObjectFieldType<Record<string, FieldType>>,
    rootState: GameStateClass<FacadeGameState> | undefined,
    initialStage: StageDefinition<FacadeGameState> | undefined,
    setup:
      | ((
          context: GameSetupContextWithInput<FacadeGameState, SetupInput>,
        ) => void)
      | undefined,
  ) {
    this.name = name;
    this.setupInputSchema = setupInputSchema;
    this.rootStateClass = rootState;
    this.initialStageDefinition = initialStage;
    this.setupCallback = setup;
  }

  rootState<NextFacadeGameState extends GameState>(
    rootState: GameStateClass<NextFacadeGameState>,
  ): GameDefinitionBuilderWithSetupInput<
    NextFacadeGameState,
    SetupInput,
    never
  > {
    this.rootStateClass =
      rootState as unknown as GameStateClass<FacadeGameState>;
    return this as unknown as GameDefinitionBuilderWithSetupInput<
      NextFacadeGameState,
      SetupInput,
      never
    >;
  }

  initialStage<InitialStage extends StageDefinition<FacadeGameState>>(
    initialStage: InitialStage,
  ): GameDefinitionBuilderWithSetupInput<
    FacadeGameState,
    SetupInput,
    CommandDefinitionsFromStageDefinition<InitialStage>
  > {
    this.initialStageDefinition = initialStage;
    return this as unknown as GameDefinitionBuilderWithSetupInput<
      FacadeGameState,
      SetupInput,
      CommandDefinitionsFromStageDefinition<InitialStage>
    >;
  }

  setup(
    setup: (
      context: GameSetupContextWithInput<FacadeGameState, SetupInput>,
    ) => void,
  ): this {
    this.setupCallback = setup;
    return this;
  }

  build(): GameDefinitionWithSetupInput<
    FacadeGameState,
    SetupInput,
    TCommandDefinition
  > {
    const base = assembleBaseDefinition<FacadeGameState, TCommandDefinition>(
      this.name,
      this.rootStateClass,
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
  FacadeGameState extends GameState,
  TCommandDefinition extends CommandDefinition<FacadeGameState>,
>(
  name: string,
  rootState: GameStateClass<FacadeGameState> | undefined,
  initialStage: StageDefinition<FacadeGameState> | undefined,
): BaseGameDefinition<FacadeGameState, TCommandDefinition> {
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
  const runtimeStateSchema = compileRuntimeStateSchema(stages);
  const defaultCanonicalGameState = createDefaultCanonicalGameState(rootState);
  assertSchemaValue(canonicalGameStateSchema, defaultCanonicalGameState);

  return {
    name,
    commands,
    stateFacade,
    canonicalGameStateSchema,
    runtimeStateSchema,
    defaultCanonicalGameState,
    initialStage,
    stages,
    __commandDefinitions: undefined as unknown as TCommandDefinition,
  };
}

function collectReachableStages<FacadeGameState extends GameState>(
  initialStage: StageDefinition<FacadeGameState>,
): Record<string, StageDefinition<FacadeGameState>> {
  const stages: Record<string, StageDefinition<FacadeGameState>> = {};
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

function resolveNextStages<FacadeGameState extends GameState>(
  stage: StageDefinition<FacadeGameState>,
): StageDefinitionMap<FacadeGameState> {
  return stage.nextStages?.() ?? {};
}

function compileCommandMapFromStages<FacadeGameState extends GameState>(
  stages: Record<string, StageDefinition<FacadeGameState>>,
): CommandDefinitionMap<FacadeGameState> {
  const commandMap: CommandDefinitionMap<FacadeGameState> = {};
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
