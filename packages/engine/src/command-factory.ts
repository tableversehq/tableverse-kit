import type {
  CommandBuilder,
  CommandBuilderAccumulator,
  CommandBuilderBaseConfig,
  CommandSchema,
  DefinedCommand,
  DiscoverableCommandAccumulator,
  DiscoverableCommandDefinition,
  DiscoveryDefinition,
  DiscoveryInitialInput,
  DiscoveryStepBuilder,
  DiscoveryStepContext,
  DiscoveryStepInitialBuilder,
  DiscoveryStepInputBuilder,
  DiscoveryStepDefinition,
  DiscoveryStepResolveFn,
  DiscoveryStepReadyBuilder,
  DiscoveryStepResolvedBuilder,
  NonDiscoverableCommandAccumulator,
  NonDiscoverableCommandDefinition,
  AnyDiscoveryStepDefinition,
} from "./types/command";
import { commandDefinitionBrand as brand } from "./types/command";
import { assertSerializableSchema } from "./schema";

export interface CommandFactory<HydratedState extends object> {
  <TCommandInput extends Record<string, unknown>>(
    config: CommandBuilderBaseConfig<TCommandInput>,
  ): CommandBuilder<HydratedState, TCommandInput>;
}

type DiscoveryStepAccumulator = {
  stepId: string;
  initial: boolean;
  inputSchema?: CommandSchema<Record<string, unknown>>;
  outputSchema?: CommandSchema<Record<string, unknown>>;
  resolve?: (...args: unknown[]) => unknown;
};

function createDiscoveryStepBuilder<
  HydratedState extends object,
  TCommandInput extends Record<string, unknown>,
  TStepId extends string,
  TSteps extends readonly DiscoveryStepDefinition<object>[] =
    readonly DiscoveryStepDefinition<object>[],
>(
  stepId: TStepId,
): DiscoveryStepBuilder<HydratedState, TCommandInput, TSteps, TStepId> {
  const stepState: DiscoveryStepAccumulator = {
    stepId,
    initial: false,
  };

  function createResolvedBuilder<
    TInput extends Record<string, unknown>,
    TOutput extends Record<string, unknown>,
    TInitial extends boolean,
  >(): DiscoveryStepResolvedBuilder<
    HydratedState,
    TCommandInput,
    TSteps,
    TStepId,
    TInput,
    TOutput,
    TInitial
  > {
    return {
      build() {
        if (!stepState.inputSchema) {
          throw new Error(
            `command_builder_missing_discovery_input_schema:${stepState.stepId}`,
          );
        }

        if (!stepState.outputSchema) {
          throw new Error(
            `command_builder_missing_discovery_output_schema:${stepState.stepId}`,
          );
        }

        if (!stepState.resolve) {
          throw new Error(
            `command_builder_missing_discovery_resolve:${stepState.stepId}`,
          );
        }

        return {
          stepId: stepState.stepId as TStepId,
          initial: stepState.initial as TInitial,
          inputSchema: stepState.inputSchema,
          outputSchema: stepState.outputSchema,
          resolve: stepState.resolve,
        } as unknown as DiscoveryStepDefinition<
          HydratedState,
          TStepId,
          TInput,
          TOutput,
          TInitial,
          DiscoveryStepResolveFn<
            HydratedState,
            TCommandInput,
            TSteps,
            TInput,
            TOutput
          >
        >;
      },
    };
  }

  function createReadyBuilder<
    TInput extends Record<string, unknown>,
    TOutput extends Record<string, unknown>,
    TInitial extends boolean,
  >(): DiscoveryStepReadyBuilder<
    HydratedState,
    TCommandInput,
    TSteps,
    TStepId,
    TInput,
    TOutput,
    TInitial
  > {
    return {
      resolve(resolve) {
        stepState.resolve = resolve as (...args: unknown[]) => unknown;
        return createResolvedBuilder<TInput, TOutput, TInitial>();
      },
    };
  }

  function createInputBuilder<
    TInitial extends boolean,
    TInput extends Record<string, unknown>,
  >(): DiscoveryStepInputBuilder<
    HydratedState,
    TCommandInput,
    TSteps,
    TStepId,
    TInput,
    TInitial
  > {
    return {
      output<TNextOutput extends Record<string, unknown>>(
        schema: CommandSchema<TNextOutput>,
      ) {
        assertSerializableSchema(schema);
        stepState.outputSchema = schema;
        return createReadyBuilder<TInput, TNextOutput, TInitial>();
      },
    };
  }

  function createStepBuilder(): DiscoveryStepBuilder<
    HydratedState,
    TCommandInput,
    TSteps,
    TStepId
  > {
    return {
      initial() {
        stepState.initial = true;
        return createInitialBuilder();
      },

      input<TNextInput extends Record<string, unknown>>(
        schema: CommandSchema<TNextInput>,
      ) {
        assertSerializableSchema(schema);
        stepState.inputSchema = schema;
        return createInputBuilder<false, TNextInput>();
      },
    };
  }

  function createInitialBuilder(): DiscoveryStepInitialBuilder<
    HydratedState,
    TCommandInput,
    TSteps,
    TStepId
  > {
    return {
      input<TNextInput extends Record<string, unknown>>(
        schema: CommandSchema<TNextInput>,
      ) {
        assertSerializableSchema(schema);
        stepState.inputSchema = schema;
        return createInputBuilder<true, TNextInput>();
      },
    };
  }

  return createStepBuilder();
}

export function createCommandFactory<HydratedState extends object>() {
  function brandCommandDefinition<
    TCommandInput extends Record<string, unknown>,
    TDiscoveryInput extends Record<string, unknown> = TCommandInput,
    TSteps extends readonly AnyDiscoveryStepDefinition[] =
      readonly AnyDiscoveryStepDefinition[],
  >(
    definition:
      | NonDiscoverableCommandDefinition<HydratedState, TCommandInput>
      | DiscoverableCommandDefinition<
          HydratedState,
          TCommandInput,
          TDiscoveryInput,
          TSteps
        >,
  ): DefinedCommand<HydratedState, TCommandInput, TDiscoveryInput, TSteps> {
    return Object.defineProperty(definition, brand, {
      value: true,
      enumerable: false,
      configurable: false,
      writable: false,
    }) as DefinedCommand<HydratedState, TCommandInput, TDiscoveryInput, TSteps>;
  }

  function finalizeDiscoveryDefinition<
    TSteps extends readonly DiscoveryStepDefinition<
      HydratedState,
      string,
      Record<string, unknown>,
      Record<string, unknown>,
      boolean,
      (
        context: DiscoveryStepContext<HydratedState, Record<string, unknown>>,
      ) => unknown
    >[],
  >(steps: TSteps): DiscoveryDefinition<TSteps> {
    if (steps.length === 0) {
      throw new Error("command_builder_missing_discovery_step");
    }

    const seenStepIds = new Set<string>();
    let initialStepId: string | null = null;

    for (const step of steps) {
      if (seenStepIds.has(step.stepId)) {
        throw new Error(`duplicate_discovery_step_id:${step.stepId}`);
      }
      seenStepIds.add(step.stepId);

      if (step.initial) {
        if (initialStepId !== null) {
          throw new Error("command_builder_duplicate_initial_discovery_step");
        }
        initialStepId = step.stepId;
      }
    }

    if (initialStepId === null) {
      throw new Error("command_builder_missing_initial_discovery_step");
    }

    return {
      startStep: initialStepId,
      steps,
    };
  }

  function createBuilder<
    TCommandInput extends Record<string, unknown>,
    TDiscoveryInput extends Record<string, unknown> = TCommandInput,
    TSteps extends readonly AnyDiscoveryStepDefinition[] =
      readonly AnyDiscoveryStepDefinition[],
    THasDiscovery extends boolean = false,
    THasAvailability extends boolean = false,
    THasValidate extends boolean = false,
    THasExecute extends boolean = false,
  >(
    accumulator: CommandBuilderAccumulator<
      HydratedState,
      TCommandInput,
      TDiscoveryInput,
      THasDiscovery,
      TSteps
    >,
  ): CommandBuilder<
    HydratedState,
    TCommandInput,
    TDiscoveryInput,
    TSteps,
    THasDiscovery,
    THasAvailability,
    THasValidate,
    THasExecute
  > {
    return {
      discoverable<
        const TNextSteps extends readonly [
          DiscoveryStepDefinition<object>,
          ...DiscoveryStepDefinition<object>[],
        ],
      >(
        configure: (
          step: <TStepId extends string>(
            stepId: TStepId,
          ) => DiscoveryStepBuilder<
            HydratedState,
            TCommandInput,
            readonly AnyDiscoveryStepDefinition[],
            TStepId
          >,
        ) => TNextSteps,
      ) {
        function discoveryStepFactory<TStepId extends string>(stepId: TStepId) {
          return createDiscoveryStepBuilder<
            HydratedState,
            TCommandInput,
            TStepId
          >(stepId);
        }

        const steps = configure(discoveryStepFactory);
        const discovery = finalizeDiscoveryDefinition(steps);

        const nextAccumulator = {
          ...accumulator,
          discovery,
        } as DiscoverableCommandAccumulator<
          HydratedState,
          TCommandInput,
          DiscoveryInitialInput<TNextSteps>,
          TNextSteps
        >;

        return createBuilder<
          TCommandInput,
          DiscoveryInitialInput<TNextSteps>,
          TNextSteps,
          true,
          THasAvailability,
          THasValidate,
          THasExecute
        >(nextAccumulator);
      },

      isAvailable(isAvailable) {
        const nextAccumulator = {
          ...accumulator,
          isAvailable,
        } as CommandBuilderAccumulator<
          HydratedState,
          TCommandInput,
          TDiscoveryInput,
          THasDiscovery,
          TSteps
        >;

        return createBuilder<
          TCommandInput,
          TDiscoveryInput,
          TSteps,
          THasDiscovery,
          true,
          THasValidate,
          THasExecute
        >(nextAccumulator);
      },

      validate(validate) {
        const nextAccumulator = {
          ...accumulator,
          validate,
        } as CommandBuilderAccumulator<
          HydratedState,
          TCommandInput,
          TDiscoveryInput,
          THasDiscovery,
          TSteps
        >;

        return createBuilder<
          TCommandInput,
          TDiscoveryInput,
          TSteps,
          THasDiscovery,
          THasAvailability,
          true,
          THasExecute
        >(nextAccumulator);
      },

      execute(execute) {
        const nextAccumulator = {
          ...accumulator,
          execute,
        } as CommandBuilderAccumulator<
          HydratedState,
          TCommandInput,
          TDiscoveryInput,
          THasDiscovery,
          TSteps
        >;

        return createBuilder<
          TCommandInput,
          TDiscoveryInput,
          TSteps,
          THasDiscovery,
          THasAvailability,
          THasValidate,
          true
        >(nextAccumulator);
      },

      build() {
        if (!accumulator.validate) {
          throw new Error("command_builder_missing_validate");
        }

        if (!accumulator.execute) {
          throw new Error("command_builder_missing_execute");
        }

        return brandCommandDefinition({
          ...accumulator,
          validate: accumulator.validate,
          execute: accumulator.execute,
        } as
          | NonDiscoverableCommandDefinition<HydratedState, TCommandInput>
          | DiscoverableCommandDefinition<
              HydratedState,
              TCommandInput,
              TDiscoveryInput,
              TSteps
            >);
      },
    } as CommandBuilder<
      HydratedState,
      TCommandInput,
      TDiscoveryInput,
      TSteps,
      THasDiscovery,
      THasAvailability,
      THasValidate,
      THasExecute
    >;
  }

  function defineCommand<TCommandInput extends Record<string, unknown>>(
    config: CommandBuilderBaseConfig<TCommandInput>,
  ): CommandBuilder<HydratedState, TCommandInput> {
    assertSerializableSchema(config.commandSchema);

    return createBuilder({
      commandId: config.commandId,
      commandSchema: config.commandSchema,
    } satisfies NonDiscoverableCommandAccumulator<
      HydratedState,
      TCommandInput
    >);
  }

  return defineCommand;
}
