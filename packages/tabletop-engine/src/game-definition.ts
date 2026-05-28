import type { CommandDefinition } from "./types/command";
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
  CommandDefinition<FacadeGameState>
>;

type SetupInputFromSchema<
  TSchema extends ObjectFieldType<Record<string, FieldType>> | undefined,
> =
  TSchema extends ObjectFieldType<infer TProperties>
    ? ObjectSchemaStatic<TProperties>
    : undefined;

export interface GameSetupContext<
  FacadeGameState extends GameState,
  SetupInput extends object | undefined = undefined,
> {
  game: FacadeGameState;
  runtime: RuntimeState;
  rng: RNGApi;
  input: SetupInput;
}

export interface GameDefinition<
  FacadeGameState extends GameState,
  SetupInput extends object | undefined = undefined,
  CommandDefinitions = CommandDefinition<FacadeGameState>,
> {
  name: string;
  commands: CommandDefinitionMap<FacadeGameState>;
  stateFacade: CompiledStateFacadeDefinition;
  canonicalGameStateSchema: ObjectFieldType<Record<string, FieldType>>;
  runtimeStateSchema: TSchema;
  setupInputSchema?: ObjectFieldType<Record<string, FieldType>>;
  defaultCanonicalGameState: CanonicalGameState<FacadeGameState>;
  initialStage: StageDefinition<FacadeGameState>;
  stages: Record<string, StageDefinition<FacadeGameState>>;
  setup?: (context: GameSetupContext<FacadeGameState, SetupInput>) => void;
  readonly __commandDefinitions: CommandDefinitions;
}

interface GameDefinitionBuilderState<
  FacadeGameState extends GameState = GameState,
  SetupInput extends object | undefined = undefined,
  CommandDefinitions = CommandDefinition<FacadeGameState>,
> extends Partial<
  Omit<
    GameDefinition<FacadeGameState, SetupInput, CommandDefinitions>,
    | "commands"
    | "stateFacade"
    | "canonicalGameStateSchema"
    | "runtimeStateSchema"
    | "defaultCanonicalGameState"
    | "stages"
    | "setup"
    | "__commandDefinitions"
  >
> {
  name: string;
  rootState?: GameStateClass<FacadeGameState>;
  initialStage?: StageDefinition<FacadeGameState>;
  setup?: (context: GameSetupContext<FacadeGameState, SetupInput>) => void;
}

export class GameDefinitionBuilder<
  FacadeGameState extends GameState = GameState,
  SetupInput extends object | undefined = undefined,
  CommandDefinitions = CommandDefinition<FacadeGameState>,
> {
  private readonly config: GameDefinitionBuilderState<
    FacadeGameState,
    SetupInput,
    CommandDefinitions
  >;

  constructor(name: string) {
    this.config = {
      name,
    };
  }

  rootState<NextFacadeGameState extends GameState>(
    rootState: GameStateClass<NextFacadeGameState>,
  ): GameDefinitionBuilder<NextFacadeGameState, SetupInput> {
    this.config.rootState =
      rootState as unknown as GameStateClass<FacadeGameState>;
    return this as unknown as GameDefinitionBuilder<
      NextFacadeGameState,
      SetupInput
    >;
  }

  setupInput<TSchema extends ObjectFieldType<Record<string, FieldType>>>(
    schema: TSchema,
  ): GameDefinitionBuilder<
    FacadeGameState,
    SetupInputFromSchema<TSchema>,
    CommandDefinitions
  > {
    if (schema.kind !== "object") {
      throw new Error("setup_input_schema_must_be_object");
    }

    this.config.setupInputSchema = schema;
    return this as unknown as GameDefinitionBuilder<
      FacadeGameState,
      SetupInputFromSchema<TSchema>,
      CommandDefinitions
    >;
  }

  initialStage<InitialStage extends StageDefinition<FacadeGameState>>(
    initialStage: InitialStage,
  ): GameDefinitionBuilder<
    FacadeGameState,
    SetupInput,
    CommandDefinitionsFromStageDefinition<InitialStage>
  > {
    this.config.initialStage = initialStage;
    return this as unknown as GameDefinitionBuilder<
      FacadeGameState,
      SetupInput,
      CommandDefinitionsFromStageDefinition<InitialStage>
    >;
  }

  build(): GameDefinition<FacadeGameState, SetupInput, CommandDefinitions> {
    if (!this.config.rootState) {
      throw new Error("root_state_required");
    }

    if (!this.config.initialStage) {
      throw new Error("initial_stage_required");
    }

    const stages = collectReachableStages(this.config.initialStage);
    const commands = compileCommandMapFromStages(stages);
    const stateFacade = compileStateFacadeDefinition(this.config.rootState);
    const canonicalGameStateSchema = compileCanonicalGameStateSchema(
      this.config.rootState,
    );
    const runtimeStateSchema = compileRuntimeStateSchema(stages);
    const defaultCanonicalGameState = createDefaultCanonicalGameState(
      this.config.rootState,
    );
    assertSchemaValue(canonicalGameStateSchema, defaultCanonicalGameState);

    return {
      name: this.config.name,
      commands,
      stateFacade,
      canonicalGameStateSchema,
      runtimeStateSchema,
      setupInputSchema: this.config.setupInputSchema,
      defaultCanonicalGameState,
      initialStage: this.config.initialStage,
      stages,
      setup: this.config.setup,
      __commandDefinitions: undefined as CommandDefinitions,
    };
  }

  setup(
    setup: (context: GameSetupContext<FacadeGameState, SetupInput>) => void,
  ): this {
    this.config.setup = setup;
    return this;
  }
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
