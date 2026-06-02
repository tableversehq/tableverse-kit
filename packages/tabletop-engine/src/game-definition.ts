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

export interface GameSetupContext<
  FacadeGameState extends GameState,
  SetupInput extends object | undefined = undefined,
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
  setup?: (context: GameSetupContext<FacadeGameState, undefined>) => void;
}

export interface GameDefinitionWithSetupInput<
  FacadeGameState extends GameState,
  SetupInput extends object,
  TCommandDefinition extends CommandDefinition<FacadeGameState>,
> extends BaseGameDefinition<FacadeGameState, TCommandDefinition> {
  setupInputSchema: ObjectFieldType<Record<string, FieldType>>;
  setup?: (context: GameSetupContext<FacadeGameState, SetupInput>) => void;
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

interface GameDefinitionBuilderState<
  FacadeGameState extends GameState = GameState,
  SetupInput extends object | undefined = undefined,
> {
  name: string;
  rootState?: GameStateClass<FacadeGameState>;
  setupInputSchema?: ObjectFieldType<Record<string, FieldType>>;
  initialStage?: StageDefinition<FacadeGameState>;
  setup?: (context: GameSetupContext<FacadeGameState, SetupInput>) => void;
}

export class GameDefinitionBuilder<
  FacadeGameState extends GameState = GameState,
  SetupInput extends object | undefined = undefined,
  TCommandDefinition extends CommandDefinition<FacadeGameState> = never,
> {
  private readonly config: GameDefinitionBuilderState<
    FacadeGameState,
    SetupInput
  >;

  constructor(name: string) {
    this.config = {
      name,
    };
  }

  rootState<NextFacadeGameState extends GameState>(
    rootState: GameStateClass<NextFacadeGameState>,
  ): GameDefinitionBuilder<NextFacadeGameState, SetupInput, never> {
    this.config.rootState =
      rootState as unknown as GameStateClass<FacadeGameState>;
    return this as unknown as GameDefinitionBuilder<
      NextFacadeGameState,
      SetupInput,
      never
    >;
  }

  setupInput<TSchema extends ObjectFieldType<Record<string, FieldType>>>(
    schema: TSchema,
  ): GameDefinitionBuilder<
    FacadeGameState,
    SetupInputFromSchema<TSchema>,
    TCommandDefinition
  > {
    if (schema.kind !== "object") {
      throw new Error("setup_input_schema_must_be_object");
    }

    this.config.setupInputSchema = schema;
    return this as unknown as GameDefinitionBuilder<
      FacadeGameState,
      SetupInputFromSchema<TSchema>,
      TCommandDefinition
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

  build(): GameDefinition<FacadeGameState, SetupInput, TCommandDefinition> {
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

    const baseDefinition: BaseGameDefinition<
      FacadeGameState,
      TCommandDefinition
    > = {
      name: this.config.name,
      commands,
      stateFacade,
      canonicalGameStateSchema,
      runtimeStateSchema,
      defaultCanonicalGameState,
      initialStage: this.config.initialStage,
      stages,
      __commandDefinitions: undefined as unknown as TCommandDefinition,
    };

    // Irreducible construction-boundary assertion: TS can't prove
    // `setupInputSchema` presence corresponds to the static `SetupInput`
    // parameter, and `setup`'s contravariance over a generic `SetupInput`
    // blocks a cast-free union return. Quarantined here so everything
    // downstream stays cast-free.
    if (this.config.setupInputSchema) {
      return {
        ...baseDefinition,
        setupInputSchema: this.config.setupInputSchema,
        setup: this.config.setup,
      } as GameDefinition<FacadeGameState, SetupInput, TCommandDefinition>;
    }

    return {
      ...baseDefinition,
      setupInputSchema: undefined,
      setup: this.config.setup,
    } as GameDefinition<FacadeGameState, SetupInput, TCommandDefinition>;
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
