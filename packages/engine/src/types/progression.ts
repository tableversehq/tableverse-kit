import type { Command, DefinedCommand } from "./command";
import type { GameEvent } from "./event";
import type { RNGApi } from "./rng";
import type { FieldType, ObjectFieldType } from "../schema";
import type { RuntimeState } from "./state";

export const stageDefinitionBrand = Symbol("tabletop-engine.stage-definition");

interface StageDefinitionBrand {
  readonly [stageDefinitionBrand]: true;
}

export interface SingleActivePlayerStageState {
  id: string;
  kind: "activePlayer";
  activePlayerId: string;
}

export interface AutomaticStageState {
  id: string;
  kind: "automatic";
}

export interface MultiActivePlayerStageState<Memory extends object = object> {
  id: string;
  kind: "multiActivePlayer";
  activePlayerIds: string[];
  memory: Memory;
}

export type StageState =
  | SingleActivePlayerStageState
  | AutomaticStageState
  | MultiActivePlayerStageState;

export interface ProgressionState {
  currentStage: StageState;
  lastActingStage:
    | SingleActivePlayerStageState
    | MultiActivePlayerStageState<object>
    | null;
}

export type StageDefinitionMap<HydratedState extends object> = Record<
  string,
  StageDefinition<HydratedState>
>;

export type StageDefinitionResolver<
  HydratedState extends object,
  NextStages extends StageDefinitionMap<HydratedState> =
    StageDefinitionMap<HydratedState>,
> = () => NextStages;

type CommandFromDefinition<Definition> =
  Definition extends DefinedCommand<
    object,
    infer Input extends Record<string, unknown>,
    Record<string, unknown>
  >
    ? Command<Input>
    : never;

export type CommandsFromDefinitions<Definitions extends readonly unknown[]> =
  CommandFromDefinition<Definitions[number]>;

export type CommandDefinitionsFromStageDefinition<TStage> =
  TStage extends SingleActivePlayerStageDefinition<
    infer THydratedState,
    infer Commands,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >
    ? Commands extends readonly DefinedCommand<THydratedState>[]
      ? Commands[number]
      : never
    : TStage extends MultiActivePlayerStageDefinition<
          infer THydratedState,
          object,
          infer Commands,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          any
        >
      ? Commands extends readonly DefinedCommand<THydratedState>[]
        ? Commands[number]
        : never
      : never;

export interface SingleActivePlayerSelectionContext<
  HydratedState extends object,
> {
  game: Readonly<HydratedState>;
  runtime: Readonly<RuntimeState>;
}

export interface SingleActivePlayerTransitionContext<
  HydratedState extends object,
  TCommand extends Command = Command,
  NextStages extends StageDefinitionMap<HydratedState> =
    StageDefinitionMap<HydratedState>,
> {
  game: Readonly<HydratedState>;
  runtime: Readonly<RuntimeState>;
  command: TCommand;
  nextStages: Readonly<NextStages>;
}

export interface AutomaticStageRunContext<HydratedState extends object> {
  game: HydratedState;
  runtime: Readonly<RuntimeState>;
  rng: RNGApi;
  emitEvent(event: GameEvent): void;
}

export interface AutomaticStageTransitionContext<
  HydratedState extends object,
  NextStages extends StageDefinitionMap<HydratedState> =
    StageDefinitionMap<HydratedState>,
> {
  game: Readonly<HydratedState>;
  runtime: Readonly<RuntimeState>;
  nextStages: Readonly<NextStages>;
}

export interface MultiActivePlayerMemoryContext<
  HydratedState extends object,
  Memory extends object = object,
> {
  game: Readonly<HydratedState>;
  runtime: Readonly<RuntimeState>;
  memory: Memory;
}

export interface MultiActivePlayerSubmitContext<
  HydratedState extends object,
  Memory extends object = object,
  TCommand extends Command = Command,
> extends MultiActivePlayerMemoryContext<HydratedState, Memory> {
  command: TCommand;
  execute(command: TCommand): void;
}

export interface MultiActivePlayerTransitionContext<
  HydratedState extends object,
  Memory extends object = object,
  NextStages extends StageDefinitionMap<HydratedState> =
    StageDefinitionMap<HydratedState>,
> extends MultiActivePlayerMemoryContext<HydratedState, Memory> {
  nextStages: Readonly<NextStages>;
}

export interface SingleActivePlayerStageDefinition<
  HydratedState extends object,
  Commands extends readonly DefinedCommand<HydratedState>[] =
    readonly DefinedCommand<HydratedState>[],
  NextStages extends StageDefinitionMap<HydratedState> =
    StageDefinitionMap<HydratedState>,
> extends StageDefinitionBrand {
  id: string;
  kind: "activePlayer";
  activePlayer(
    context: SingleActivePlayerSelectionContext<HydratedState>,
  ): string;
  commands: Commands;
  nextStages?: StageDefinitionResolver<HydratedState, NextStages>;
  transition(
    context: SingleActivePlayerTransitionContext<
      HydratedState,
      CommandsFromDefinitions<Commands>,
      NextStages
    >,
  ):
    | SingleActivePlayerStageDefinition<HydratedState>
    | NextStages[keyof NextStages];
}

export interface AutomaticStageDefinition<
  HydratedState extends object,
  NextStages extends StageDefinitionMap<HydratedState> =
    StageDefinitionMap<HydratedState>,
> extends StageDefinitionBrand {
  id: string;
  kind: "automatic";
  run?(context: AutomaticStageRunContext<HydratedState>): void;
  nextStages?: StageDefinitionResolver<HydratedState, NextStages>;
  transition?(
    context: AutomaticStageTransitionContext<HydratedState, NextStages>,
  ): AutomaticStageDefinition<HydratedState> | NextStages[keyof NextStages];
}

export interface MultiActivePlayerStageDefinition<
  HydratedState extends object,
  Memory extends object = object,
  Commands extends readonly DefinedCommand<HydratedState>[] =
    readonly DefinedCommand<HydratedState>[],
  NextStages extends StageDefinitionMap<HydratedState> =
    StageDefinitionMap<HydratedState>,
> extends StageDefinitionBrand {
  id: string;
  kind: "multiActivePlayer";
  memorySchema: ObjectFieldType<Record<string, FieldType>>;
  memory(): Memory;
  activePlayers(
    context: MultiActivePlayerMemoryContext<HydratedState, Memory>,
  ): string[];
  commands: Commands;
  onSubmit(
    context: MultiActivePlayerSubmitContext<
      HydratedState,
      Memory,
      CommandsFromDefinitions<Commands>
    >,
  ): void;
  isComplete(
    context: MultiActivePlayerMemoryContext<HydratedState, Memory>,
  ): boolean;
  nextStages?: StageDefinitionResolver<HydratedState, NextStages>;
  transition(
    context: MultiActivePlayerTransitionContext<
      HydratedState,
      Memory,
      NextStages
    >,
  ):
    | MultiActivePlayerStageDefinition<HydratedState>
    | NextStages[keyof NextStages];
}

export type StageDefinition<HydratedState extends object> =
  | SingleActivePlayerStageDefinition<HydratedState>
  | AutomaticStageDefinition<HydratedState>
  | MultiActivePlayerStageDefinition<HydratedState>;
