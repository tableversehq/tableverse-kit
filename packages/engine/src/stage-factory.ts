import type { DefinedCommand } from "./types/command";
import {
  type CommandsFromDefinitions,
  stageDefinitionBrand,
  type AutomaticStageDefinition,
  type AutomaticStageRunContext,
  type AutomaticStageTransitionContext,
  type MultiActivePlayerMemoryContext,
  type MultiActivePlayerStageDefinition,
  type MultiActivePlayerSubmitContext,
  type MultiActivePlayerTransitionContext,
  type SingleActivePlayerSelectionContext,
  type SingleActivePlayerStageDefinition,
  type SingleActivePlayerTransitionContext,
  type StageDefinitionMap,
  type StageDefinitionResolver,
} from "./types/progression";
import { assertSerializableSchema } from "./schema";
import type { FieldType, ObjectFieldType } from "./schema";

type NoBuilderMethod = Record<never, never>;
type NoNextStages = Record<string, never>;
type TExtractNextStages<Resolver> = Resolver extends () => infer NextStages
  ? NextStages
  : never;

type SingleActivePlayerBuildMethod<
  HydratedState extends object,
  Commands extends readonly DefinedCommand<HydratedState>[],
  NextStages extends StageDefinitionMap<HydratedState>,
  HasActivePlayer extends boolean,
  HasCommands extends boolean,
  HasTransition extends boolean,
> = HasActivePlayer extends true
  ? HasCommands extends true
    ? HasTransition extends true
      ? {
          build(): SingleActivePlayerStageDefinition<
            HydratedState,
            Commands,
            NextStages
          >;
        }
      : NoBuilderMethod
    : NoBuilderMethod
  : NoBuilderMethod;

type AutomaticBuildMethod<
  HydratedState extends object,
  NextStages extends StageDefinitionMap<HydratedState>,
> = {
  build(): AutomaticStageDefinition<HydratedState, NextStages>;
};

type MultiActivePlayerBuildMethod<
  HydratedState extends object,
  Memory extends object,
  Commands extends readonly DefinedCommand<HydratedState>[],
  NextStages extends StageDefinitionMap<HydratedState>,
  HasMemory extends boolean,
  HasActivePlayers extends boolean,
  HasCommands extends boolean,
  HasOnSubmit extends boolean,
  HasIsComplete extends boolean,
  HasNextStages extends boolean,
  HasTransition extends boolean,
> = HasMemory extends true
  ? HasActivePlayers extends true
    ? HasCommands extends true
      ? HasOnSubmit extends true
        ? HasIsComplete extends true
          ? HasNextStages extends true
            ? HasTransition extends true
              ? {
                  build(): MultiActivePlayerStageDefinition<
                    HydratedState,
                    Memory,
                    Commands,
                    NextStages
                  >;
                }
              : NoBuilderMethod
            : NoBuilderMethod
          : NoBuilderMethod
        : NoBuilderMethod
      : NoBuilderMethod
    : NoBuilderMethod
  : NoBuilderMethod;

export type SingleActivePlayerStageBuilder<
  HydratedState extends object,
  Commands extends readonly DefinedCommand<HydratedState>[] =
    readonly DefinedCommand<HydratedState>[],
  NextStages extends StageDefinitionMap<HydratedState> = NoNextStages,
  HasActivePlayer extends boolean = false,
  HasCommands extends boolean = false,
  HasTransition extends boolean = false,
> = {
  activePlayer(
    activePlayer: (
      context: SingleActivePlayerSelectionContext<HydratedState>,
    ) => string,
  ): SingleActivePlayerStageBuilder<
    HydratedState,
    Commands,
    NextStages,
    true,
    HasCommands,
    HasTransition
  >;
  commands<NextCommands extends readonly DefinedCommand<HydratedState>[]>(
    commands: NextCommands,
  ): SingleActivePlayerStageBuilder<
    HydratedState,
    NextCommands,
    NextStages,
    HasActivePlayer,
    true,
    HasTransition
  >;
  nextStages<TNextStages extends StageDefinitionMap<HydratedState>>(
    nextStages: StageDefinitionResolver<HydratedState, TNextStages>,
  ): SingleActivePlayerStageBuilder<
    HydratedState,
    Commands,
    TNextStages,
    HasActivePlayer,
    HasCommands,
    HasTransition
  >;
  transition(
    transition: (
      context: SingleActivePlayerTransitionContext<
        HydratedState,
        CommandsFromDefinitions<Commands>,
        NextStages
      >,
    ) =>
      | SingleActivePlayerStageDefinition<HydratedState>
      | NextStages[keyof NextStages],
  ): SingleActivePlayerStageBuilder<
    HydratedState,
    Commands,
    NextStages,
    HasActivePlayer,
    HasCommands,
    true
  >;
} & SingleActivePlayerBuildMethod<
  HydratedState,
  Commands,
  NextStages,
  HasActivePlayer,
  HasCommands,
  HasTransition
>;

export type AutomaticStageBuilder<
  HydratedState extends object,
  NextStages extends StageDefinitionMap<HydratedState> = NoNextStages,
> = {
  run(
    run: (context: AutomaticStageRunContext<HydratedState>) => void,
  ): AutomaticStageBuilder<HydratedState, NextStages>;
  nextStages<TNextStages extends StageDefinitionMap<HydratedState>>(
    nextStages: StageDefinitionResolver<HydratedState, TNextStages>,
  ): AutomaticStageBuilder<HydratedState, TNextStages>;
  transition(
    transition: (
      context: AutomaticStageTransitionContext<HydratedState, NextStages>,
    ) => AutomaticStageDefinition<HydratedState> | NextStages[keyof NextStages],
  ): AutomaticStageBuilder<HydratedState, NextStages>;
} & AutomaticBuildMethod<HydratedState, NextStages>;

export type MultiActivePlayerStageBuilder<
  HydratedState extends object,
  Memory extends object = Record<string, never>,
  Commands extends readonly DefinedCommand<HydratedState>[] =
    readonly DefinedCommand<HydratedState>[],
  NextStages extends StageDefinitionMap<HydratedState> = NoNextStages,
  HasMemory extends boolean = false,
  HasActivePlayers extends boolean = false,
  HasCommands extends boolean = false,
  HasOnSubmit extends boolean = false,
  HasIsComplete extends boolean = false,
  HasNextStages extends boolean = false,
  HasTransition extends boolean = false,
> = {
  memory<NextMemory extends object>(
    memorySchema: ObjectFieldType<Record<string, FieldType>>,
    memory: () => NextMemory,
  ): MultiActivePlayerStageBuilder<
    HydratedState,
    NextMemory,
    Commands,
    NextStages,
    true,
    HasActivePlayers,
    HasCommands,
    HasOnSubmit,
    HasIsComplete,
    HasNextStages,
    HasTransition
  >;
  activePlayers(
    activePlayers: (
      context: MultiActivePlayerMemoryContext<HydratedState, Memory>,
    ) => string[],
  ): MultiActivePlayerStageBuilder<
    HydratedState,
    Memory,
    Commands,
    NextStages,
    HasMemory,
    true,
    HasCommands,
    HasOnSubmit,
    HasIsComplete,
    HasNextStages,
    HasTransition
  >;
  commands<NextCommands extends readonly DefinedCommand<HydratedState>[]>(
    commands: NextCommands,
  ): MultiActivePlayerStageBuilder<
    HydratedState,
    Memory,
    NextCommands,
    NextStages,
    HasMemory,
    HasActivePlayers,
    true,
    HasOnSubmit,
    HasIsComplete,
    HasNextStages,
    HasTransition
  >;
  onSubmit(
    onSubmit: (
      context: MultiActivePlayerSubmitContext<
        HydratedState,
        Memory,
        CommandsFromDefinitions<Commands>
      >,
    ) => void,
  ): MultiActivePlayerStageBuilder<
    HydratedState,
    Memory,
    Commands,
    NextStages,
    HasMemory,
    HasActivePlayers,
    HasCommands,
    true,
    HasIsComplete,
    HasNextStages,
    HasTransition
  >;
  isComplete(
    isComplete: (
      context: MultiActivePlayerMemoryContext<HydratedState, Memory>,
    ) => boolean,
  ): MultiActivePlayerStageBuilder<
    HydratedState,
    Memory,
    Commands,
    NextStages,
    HasMemory,
    HasActivePlayers,
    HasCommands,
    HasOnSubmit,
    true,
    HasNextStages,
    HasTransition
  >;
  nextStages<TNextStages extends StageDefinitionMap<HydratedState>>(
    nextStages: StageDefinitionResolver<HydratedState, TNextStages>,
  ): MultiActivePlayerStageBuilder<
    HydratedState,
    Memory,
    Commands,
    TNextStages,
    HasMemory,
    HasActivePlayers,
    HasCommands,
    HasOnSubmit,
    HasIsComplete,
    true,
    HasTransition
  >;
  transition(
    transition: (
      context: MultiActivePlayerTransitionContext<
        HydratedState,
        Memory,
        NextStages
      >,
    ) =>
      | MultiActivePlayerStageDefinition<HydratedState>
      | NextStages[keyof NextStages],
  ): MultiActivePlayerStageBuilder<
    HydratedState,
    Memory,
    Commands,
    NextStages,
    HasMemory,
    HasActivePlayers,
    HasCommands,
    HasOnSubmit,
    HasIsComplete,
    HasNextStages,
    true
  >;
} & MultiActivePlayerBuildMethod<
  HydratedState,
  Memory,
  Commands,
  NextStages,
  HasMemory,
  HasActivePlayers,
  HasCommands,
  HasOnSubmit,
  HasIsComplete,
  HasNextStages,
  HasTransition
>;

export interface StageFactory<HydratedState extends object> {
  (id: string): {
    singleActivePlayer(): SingleActivePlayerStageBuilder<HydratedState>;
    automatic(): AutomaticStageBuilder<HydratedState>;
    multiActivePlayer(): MultiActivePlayerStageBuilder<HydratedState>;
  };
}

type SingleActivePlayerAccumulator<
  HydratedState extends object,
  Commands extends readonly DefinedCommand<HydratedState>[],
  NextStages extends StageDefinitionMap<HydratedState>,
> = {
  id: string;
  kind: "activePlayer";
  activePlayer?: (
    context: SingleActivePlayerSelectionContext<HydratedState>,
  ) => string;
  commands?: Commands;
  nextStages?: StageDefinitionResolver<HydratedState, NextStages>;
  transition?: (
    context: SingleActivePlayerTransitionContext<
      HydratedState,
      CommandsFromDefinitions<Commands>,
      NextStages
    >,
  ) =>
    | SingleActivePlayerStageDefinition<HydratedState>
    | NextStages[keyof NextStages];
};

type AutomaticAccumulator<
  HydratedState extends object,
  NextStages extends StageDefinitionMap<HydratedState>,
> = {
  id: string;
  kind: "automatic";
  run?: (context: AutomaticStageRunContext<HydratedState>) => void;
  nextStages?: StageDefinitionResolver<HydratedState, NextStages>;
  transition?: (
    context: AutomaticStageTransitionContext<HydratedState, NextStages>,
  ) => AutomaticStageDefinition<HydratedState> | NextStages[keyof NextStages];
};

type MultiActivePlayerAccumulator<
  HydratedState extends object,
  Memory extends object,
  Commands extends readonly DefinedCommand<HydratedState>[],
  NextStages extends StageDefinitionMap<HydratedState>,
> = {
  id: string;
  kind: "multiActivePlayer";
  memorySchema?: ObjectFieldType<Record<string, FieldType>>;
  memory?: () => Memory;
  activePlayers?: (
    context: MultiActivePlayerMemoryContext<HydratedState, Memory>,
  ) => string[];
  commands?: Commands;
  onSubmit?: (
    context: MultiActivePlayerSubmitContext<
      HydratedState,
      Memory,
      CommandsFromDefinitions<Commands>
    >,
  ) => void;
  isComplete?: (
    context: MultiActivePlayerMemoryContext<HydratedState, Memory>,
  ) => boolean;
  nextStages?: StageDefinitionResolver<HydratedState, NextStages>;
  transition?: (
    context: MultiActivePlayerTransitionContext<
      HydratedState,
      Memory,
      NextStages
    >,
  ) =>
    | MultiActivePlayerStageDefinition<HydratedState>
    | NextStages[keyof NextStages];
};

export function createStageFactory<
  HydratedState extends object,
>(): StageFactory<HydratedState> {
  return (id: string) => {
    return {
      singleActivePlayer() {
        return createSingleActivePlayerBuilder<
          HydratedState,
          readonly DefinedCommand<HydratedState>[],
          NoNextStages
        >({
          id,
          kind: "activePlayer",
        });
      },
      automatic() {
        return createAutomaticBuilder<HydratedState, NoNextStages>({
          id,
          kind: "automatic",
        });
      },
      multiActivePlayer() {
        return createMultiActivePlayerBuilder<
          HydratedState,
          Record<string, never>,
          readonly DefinedCommand<HydratedState>[],
          NoNextStages
        >({
          id,
          kind: "multiActivePlayer",
        });
      },
    };
  };
}

function createSingleActivePlayerBuilder<
  HydratedState extends object,
  Commands extends readonly DefinedCommand<HydratedState>[],
  NextStages extends StageDefinitionMap<HydratedState>,
  HasActivePlayer extends boolean = false,
  HasCommands extends boolean = false,
  HasTransition extends boolean = false,
>(
  accumulator: SingleActivePlayerAccumulator<
    HydratedState,
    Commands,
    NextStages
  >,
): SingleActivePlayerStageBuilder<
  HydratedState,
  Commands,
  NextStages,
  HasActivePlayer,
  HasCommands,
  HasTransition
> {
  return {
    activePlayer(activePlayer) {
      return createSingleActivePlayerBuilder<
        HydratedState,
        Commands,
        NextStages,
        true,
        HasCommands,
        HasTransition
      >({
        ...accumulator,
        activePlayer,
      });
    },
    commands<NextCommands extends readonly DefinedCommand<HydratedState>[]>(
      commands: NextCommands,
    ) {
      return createSingleActivePlayerBuilder<
        HydratedState,
        NextCommands,
        NextStages,
        HasActivePlayer,
        true,
        HasTransition
      >({
        ...accumulator,
        commands,
      });
    },
    nextStages(nextStages) {
      return createSingleActivePlayerBuilder<
        HydratedState,
        Commands,
        TExtractNextStages<typeof nextStages>,
        HasActivePlayer,
        HasCommands,
        HasTransition
      >({
        ...accumulator,
        nextStages,
      } as unknown as SingleActivePlayerAccumulator<
        HydratedState,
        Commands,
        TExtractNextStages<typeof nextStages>
      >);
    },
    transition(transition) {
      return createSingleActivePlayerBuilder<
        HydratedState,
        Commands,
        NextStages,
        HasActivePlayer,
        HasCommands,
        true
      >({
        ...accumulator,
        transition,
      });
    },
    build() {
      if (!accumulator.activePlayer) {
        throw new Error("single_active_player_stage_requires_active_player");
      }

      if (!accumulator.commands) {
        throw new Error("single_active_player_stage_requires_commands");
      }

      if (!accumulator.transition) {
        throw new Error("single_active_player_stage_requires_transition");
      }

      return {
        id: accumulator.id,
        kind: "activePlayer",
        activePlayer: accumulator.activePlayer,
        commands: accumulator.commands,
        nextStages: accumulator.nextStages,
        transition: accumulator.transition,
        [stageDefinitionBrand]: true,
      };
    },
  };
}

function createAutomaticBuilder<
  HydratedState extends object,
  NextStages extends StageDefinitionMap<HydratedState>,
>(
  accumulator: AutomaticAccumulator<HydratedState, NextStages>,
): AutomaticStageBuilder<HydratedState, NextStages> {
  return {
    run(run) {
      return createAutomaticBuilder({
        ...accumulator,
        run,
      });
    },
    nextStages(nextStages) {
      return createAutomaticBuilder<
        HydratedState,
        TExtractNextStages<typeof nextStages>
      >({
        ...accumulator,
        nextStages,
      } as unknown as AutomaticAccumulator<
        HydratedState,
        TExtractNextStages<typeof nextStages>
      >);
    },
    transition(transition) {
      return createAutomaticBuilder({
        ...accumulator,
        transition,
      });
    },
    build() {
      return {
        id: accumulator.id,
        kind: "automatic",
        run: accumulator.run,
        nextStages: accumulator.nextStages,
        transition: accumulator.transition,
        [stageDefinitionBrand]: true,
      };
    },
  };
}

function createMultiActivePlayerBuilder<
  HydratedState extends object,
  Memory extends object,
  Commands extends readonly DefinedCommand<HydratedState>[],
  NextStages extends StageDefinitionMap<HydratedState>,
  HasMemory extends boolean = false,
  HasActivePlayers extends boolean = false,
  HasCommands extends boolean = false,
  HasOnSubmit extends boolean = false,
  HasIsComplete extends boolean = false,
  HasNextStages extends boolean = false,
  HasTransition extends boolean = false,
>(
  accumulator: MultiActivePlayerAccumulator<
    HydratedState,
    Memory,
    Commands,
    NextStages
  >,
): MultiActivePlayerStageBuilder<
  HydratedState,
  Memory,
  Commands,
  NextStages,
  HasMemory,
  HasActivePlayers,
  HasCommands,
  HasOnSubmit,
  HasIsComplete,
  HasNextStages,
  HasTransition
> {
  return {
    memory<NextMemory extends object>(
      memorySchema: ObjectFieldType<Record<string, FieldType>>,
      memory: () => NextMemory,
    ) {
      assertSerializableSchema(memorySchema);

      return createMultiActivePlayerBuilder<
        HydratedState,
        NextMemory,
        Commands,
        NextStages,
        true,
        HasActivePlayers,
        HasCommands,
        HasOnSubmit,
        HasIsComplete,
        HasNextStages,
        HasTransition
      >({
        ...accumulator,
        memorySchema,
        memory,
      } as unknown as MultiActivePlayerAccumulator<
        HydratedState,
        NextMemory,
        Commands,
        NextStages
      >);
    },
    activePlayers(
      activePlayers: (
        context: MultiActivePlayerMemoryContext<HydratedState, Memory>,
      ) => string[],
    ) {
      return createMultiActivePlayerBuilder<
        HydratedState,
        Memory,
        Commands,
        NextStages,
        HasMemory,
        true,
        HasCommands,
        HasOnSubmit,
        HasIsComplete,
        HasNextStages,
        HasTransition
      >({
        ...accumulator,
        activePlayers,
      });
    },
    commands<NextCommands extends readonly DefinedCommand<HydratedState>[]>(
      commands: NextCommands,
    ) {
      return createMultiActivePlayerBuilder<
        HydratedState,
        Memory,
        NextCommands,
        NextStages,
        HasMemory,
        HasActivePlayers,
        true,
        HasOnSubmit,
        HasIsComplete,
        HasNextStages,
        HasTransition
      >({
        ...accumulator,
        commands,
      });
    },
    onSubmit(
      onSubmit: (
        context: MultiActivePlayerSubmitContext<
          HydratedState,
          Memory,
          CommandsFromDefinitions<Commands>
        >,
      ) => void,
    ) {
      return createMultiActivePlayerBuilder<
        HydratedState,
        Memory,
        Commands,
        NextStages,
        HasMemory,
        HasActivePlayers,
        HasCommands,
        true,
        HasIsComplete,
        HasNextStages,
        HasTransition
      >({
        ...accumulator,
        onSubmit,
      });
    },
    isComplete(
      isComplete: (
        context: MultiActivePlayerMemoryContext<HydratedState, Memory>,
      ) => boolean,
    ) {
      return createMultiActivePlayerBuilder<
        HydratedState,
        Memory,
        Commands,
        NextStages,
        HasMemory,
        HasActivePlayers,
        HasCommands,
        HasOnSubmit,
        true,
        HasNextStages,
        HasTransition
      >({
        ...accumulator,
        isComplete,
      });
    },
    nextStages<TNextStages extends StageDefinitionMap<HydratedState>>(
      nextStages: StageDefinitionResolver<HydratedState, TNextStages>,
    ) {
      return createMultiActivePlayerBuilder<
        HydratedState,
        Memory,
        Commands,
        TNextStages,
        HasMemory,
        HasActivePlayers,
        HasCommands,
        HasOnSubmit,
        HasIsComplete,
        true,
        HasTransition
      >({
        ...accumulator,
        nextStages,
      } as unknown as MultiActivePlayerAccumulator<
        HydratedState,
        Memory,
        Commands,
        TNextStages
      >);
    },
    transition(
      transition: (
        context: MultiActivePlayerTransitionContext<
          HydratedState,
          Memory,
          NextStages
        >,
      ) =>
        | MultiActivePlayerStageDefinition<HydratedState>
        | NextStages[keyof NextStages],
    ) {
      return createMultiActivePlayerBuilder<
        HydratedState,
        Memory,
        Commands,
        NextStages,
        HasMemory,
        HasActivePlayers,
        HasCommands,
        HasOnSubmit,
        HasIsComplete,
        HasNextStages,
        true
      >({
        ...accumulator,
        transition,
      });
    },
    build() {
      if (!accumulator.memory) {
        throw new Error("multi_active_player_stage_requires_memory");
      }

      if (!accumulator.memorySchema) {
        throw new Error("multi_active_player_stage_requires_memory_schema");
      }

      if (!accumulator.activePlayers) {
        throw new Error("multi_active_player_stage_requires_active_players");
      }

      if (!accumulator.commands) {
        throw new Error("multi_active_player_stage_requires_commands");
      }

      if (!accumulator.onSubmit) {
        throw new Error("multi_active_player_stage_requires_on_submit");
      }

      if (!accumulator.isComplete) {
        throw new Error("multi_active_player_stage_requires_is_complete");
      }

      if (!accumulator.nextStages) {
        throw new Error("multi_active_player_stage_requires_next_stages");
      }

      if (!accumulator.transition) {
        throw new Error("multi_active_player_stage_requires_transition");
      }

      return {
        id: accumulator.id,
        kind: "multiActivePlayer",
        memorySchema: accumulator.memorySchema,
        memory: accumulator.memory,
        activePlayers: accumulator.activePlayers,
        commands: accumulator.commands,
        onSubmit: accumulator.onSubmit,
        isComplete: accumulator.isComplete,
        nextStages: accumulator.nextStages,
        transition: accumulator.transition,
        [stageDefinitionBrand]: true,
      };
    },
  };
}
