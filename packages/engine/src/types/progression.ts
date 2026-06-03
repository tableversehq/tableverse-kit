import type { Command, DefinedCommand } from "./command";
import type { GameEvent } from "./event";
import type { RNGApi } from "./rng";
import type { FieldType, ObjectFieldType } from "../schema";
import type { GameState as BaseGameState } from "../state-facade/metadata";
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

export type StageDefinitionMap<FacadeGameState extends BaseGameState> = Record<
  string,
  StageDefinition<FacadeGameState>
>;

export type StageDefinitionResolver<
  FacadeGameState extends BaseGameState,
  NextStages extends StageDefinitionMap<FacadeGameState> =
    StageDefinitionMap<FacadeGameState>,
> = () => NextStages;

type CommandFromDefinition<Definition> =
  Definition extends DefinedCommand<
    BaseGameState,
    infer Input extends Record<string, unknown>,
    Record<string, unknown>
  >
    ? Command<Input>
    : never;

export type CommandsFromDefinitions<Definitions extends readonly unknown[]> =
  CommandFromDefinition<Definitions[number]>;

export type CommandDefinitionsFromStageDefinition<TStage> =
  TStage extends SingleActivePlayerStageDefinition<
    infer TGameState,
    infer Commands,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >
    ? Commands extends readonly DefinedCommand<TGameState>[]
      ? Commands[number]
      : never
    : TStage extends MultiActivePlayerStageDefinition<
          infer TGameState,
          object,
          infer Commands,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          any
        >
      ? Commands extends readonly DefinedCommand<TGameState>[]
        ? Commands[number]
        : never
      : never;

export interface SingleActivePlayerSelectionContext<
  GameState extends BaseGameState,
> {
  game: Readonly<GameState>;
  runtime: Readonly<RuntimeState>;
}

export interface SingleActivePlayerTransitionContext<
  GameState extends BaseGameState,
  TCommand extends Command = Command,
  NextStages extends StageDefinitionMap<GameState> =
    StageDefinitionMap<GameState>,
> {
  game: Readonly<GameState>;
  runtime: Readonly<RuntimeState>;
  command: TCommand;
  nextStages: Readonly<NextStages>;
}

export interface AutomaticStageRunContext<GameState extends BaseGameState> {
  game: GameState;
  runtime: Readonly<RuntimeState>;
  rng: RNGApi;
  emitEvent(event: GameEvent): void;
}

export interface AutomaticStageTransitionContext<
  GameState extends BaseGameState,
  NextStages extends StageDefinitionMap<GameState> =
    StageDefinitionMap<GameState>,
> {
  game: Readonly<GameState>;
  runtime: Readonly<RuntimeState>;
  nextStages: Readonly<NextStages>;
}

export interface MultiActivePlayerMemoryContext<
  GameState extends BaseGameState,
  Memory extends object = object,
> {
  game: Readonly<GameState>;
  runtime: Readonly<RuntimeState>;
  memory: Memory;
}

export interface MultiActivePlayerSubmitContext<
  GameState extends BaseGameState,
  Memory extends object = object,
  TCommand extends Command = Command,
> extends MultiActivePlayerMemoryContext<GameState, Memory> {
  command: TCommand;
  execute(command: TCommand): void;
}

export interface MultiActivePlayerTransitionContext<
  GameState extends BaseGameState,
  Memory extends object = object,
  NextStages extends StageDefinitionMap<GameState> =
    StageDefinitionMap<GameState>,
> extends MultiActivePlayerMemoryContext<GameState, Memory> {
  nextStages: Readonly<NextStages>;
}

export interface SingleActivePlayerStageDefinition<
  GameState extends BaseGameState,
  Commands extends readonly DefinedCommand<GameState>[] =
    readonly DefinedCommand<GameState>[],
  NextStages extends StageDefinitionMap<GameState> =
    StageDefinitionMap<GameState>,
> extends StageDefinitionBrand {
  id: string;
  kind: "activePlayer";
  activePlayer(context: SingleActivePlayerSelectionContext<GameState>): string;
  commands: Commands;
  nextStages?: StageDefinitionResolver<GameState, NextStages>;
  transition(
    context: SingleActivePlayerTransitionContext<
      GameState,
      CommandsFromDefinitions<Commands>,
      NextStages
    >,
  ):
    | SingleActivePlayerStageDefinition<GameState>
    | NextStages[keyof NextStages];
}

export interface AutomaticStageDefinition<
  GameState extends BaseGameState,
  NextStages extends StageDefinitionMap<GameState> =
    StageDefinitionMap<GameState>,
> extends StageDefinitionBrand {
  id: string;
  kind: "automatic";
  run?(context: AutomaticStageRunContext<GameState>): void;
  nextStages?: StageDefinitionResolver<GameState, NextStages>;
  transition?(
    context: AutomaticStageTransitionContext<GameState, NextStages>,
  ): AutomaticStageDefinition<GameState> | NextStages[keyof NextStages];
}

export interface MultiActivePlayerStageDefinition<
  GameState extends BaseGameState,
  Memory extends object = object,
  Commands extends readonly DefinedCommand<GameState>[] =
    readonly DefinedCommand<GameState>[],
  NextStages extends StageDefinitionMap<GameState> =
    StageDefinitionMap<GameState>,
> extends StageDefinitionBrand {
  id: string;
  kind: "multiActivePlayer";
  memorySchema: ObjectFieldType<Record<string, FieldType>>;
  memory(): Memory;
  activePlayers(
    context: MultiActivePlayerMemoryContext<GameState, Memory>,
  ): string[];
  commands: Commands;
  onSubmit(
    context: MultiActivePlayerSubmitContext<
      GameState,
      Memory,
      CommandsFromDefinitions<Commands>
    >,
  ): void;
  isComplete(
    context: MultiActivePlayerMemoryContext<GameState, Memory>,
  ): boolean;
  nextStages?: StageDefinitionResolver<GameState, NextStages>;
  transition(
    context: MultiActivePlayerTransitionContext<GameState, Memory, NextStages>,
  ): MultiActivePlayerStageDefinition<GameState> | NextStages[keyof NextStages];
}

export type StageDefinition<GameState extends BaseGameState> =
  | SingleActivePlayerStageDefinition<GameState>
  | AutomaticStageDefinition<GameState>
  | MultiActivePlayerStageDefinition<GameState>;
