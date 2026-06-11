import type { FieldType, ObjectFieldType } from "../schema";
import type { CanonicalGameState } from "../state-facade/canonical";
import type { GameEvent } from "./event";
import type { RNGApi } from "./rng";
import type { ValidationOutcome } from "./result";
import type { CanonicalState, RuntimeState } from "./state";

export const commandDefinitionBrand = Symbol(
  "tabletop-engine.command-definition",
);

export interface Command<
  Input extends Record<string, unknown> = Record<string, unknown>,
> {
  type: string;
  actorId: string;
  input: Input;
}

type CommandData = Record<string, unknown>;
type DiscoveryData = Record<string, unknown>;

export type CommandFromSchema<TInput extends CommandData = CommandData> =
  Command<TInput>;

export interface Discovery<Input extends DiscoveryData = DiscoveryData> {
  type: string;
  actorId: string;
  step: string;
  input: Input;
}

export type CommandSchema<TInput extends CommandData = CommandData> =
  ObjectFieldType<Record<string, FieldType>> & {
    readonly static: TInput;
  };

export type CommandBuilderBaseConfig<
  TCommandInput extends CommandData = CommandData,
> = {
  commandId: string;
  commandSchema: CommandSchema<TCommandInput>;
};

type CommandLifecycleMethods<
  HydratedState extends object,
  TInput extends CommandData,
> = {
  isAvailable?(context: CommandAvailabilityContext<HydratedState>): boolean;
  validate(
    context: ValidationContext<HydratedState, CommandFromSchema<TInput>>,
  ): ValidationOutcome;
  execute(
    context: ExecuteContext<HydratedState, CommandFromSchema<TInput>>,
  ): void;
};

type CommandDefinitionBrand = {
  readonly [commandDefinitionBrand]: true;
};

export type DiscoveryStepOption<
  TNextInput extends DiscoveryData = DiscoveryData,
  TOutput extends DiscoveryData = DiscoveryData,
  TNextStep extends string = string,
> = {
  id: string;
  output: TOutput;
  nextInput: TNextInput;
  nextStep: TNextStep;
};

export type DiscoveryStepComplete<TCommandInput extends CommandData> = {
  complete: true;
  input: TCommandInput;
};

export type DiscoveryStepResult<
  TNextInput extends DiscoveryData = DiscoveryData,
  TOutput extends DiscoveryData = DiscoveryData,
  TNextStep extends string = string,
  TCommandInput extends CommandData = CommandData,
> =
  | DiscoveryStepOption<TNextInput, TOutput, TNextStep>[]
  | DiscoveryStepComplete<TCommandInput>;

export interface DiscoveryStepContext<
  HydratedState extends object,
  TDiscovery extends DiscoveryData = DiscoveryData,
> extends CommandAvailabilityContext<HydratedState> {
  discovery: Discovery<TDiscovery>;
  input: TDiscovery;
}

export interface DiscoveryStepDefinition<
  HydratedState extends object,
  TStepId extends string = string,
  TInput extends DiscoveryData = DiscoveryData,
  TOutput extends DiscoveryData = DiscoveryData,
  TInitial extends boolean = boolean,
  TResolve extends (
    context: DiscoveryStepContext<HydratedState, TInput>,
  ) => unknown = (
    context: DiscoveryStepContext<HydratedState, TInput>,
  ) => unknown,
> {
  stepId: TStepId;
  initial: TInitial;
  inputSchema: CommandSchema<TInput>;
  outputSchema: CommandSchema<TOutput>;
  resolve: TResolve;
}

export type DiscoveryStepFactory<
  HydratedState extends object = object,
  TCommandInput extends CommandData = CommandData,
  TSteps extends readonly AnyDiscoveryStepDefinition[] =
    readonly AnyDiscoveryStepDefinition[],
> = <TStepId extends string>(
  stepId: TStepId,
) => DiscoveryStepBuilder<HydratedState, TCommandInput, TSteps, TStepId>;

export type DiscoveryStepBuilder<
  HydratedState extends object = object,
  TCommandInput extends CommandData = CommandData,
  TSteps extends readonly AnyDiscoveryStepDefinition[] =
    readonly AnyDiscoveryStepDefinition[],
  TStepId extends string = string,
> = {
  initial(): DiscoveryStepInitialBuilder<
    HydratedState,
    TCommandInput,
    TSteps,
    TStepId
  >;
  input<TNextInput extends DiscoveryData>(
    schema: CommandSchema<TNextInput>,
  ): DiscoveryStepInputBuilder<
    HydratedState,
    TCommandInput,
    TSteps,
    TStepId,
    TNextInput
  >;
};

export type DiscoveryStepInitialBuilder<
  HydratedState extends object = object,
  TCommandInput extends CommandData = CommandData,
  TSteps extends readonly AnyDiscoveryStepDefinition[] =
    readonly AnyDiscoveryStepDefinition[],
  TStepId extends string = string,
> = {
  input<TNextInput extends DiscoveryData>(
    schema: CommandSchema<TNextInput>,
  ): DiscoveryStepInputBuilder<
    HydratedState,
    TCommandInput,
    TSteps,
    TStepId,
    TNextInput,
    true
  >;
};

export type DiscoveryStepInputBuilder<
  HydratedState extends object = object,
  TCommandInput extends CommandData = CommandData,
  TSteps extends readonly AnyDiscoveryStepDefinition[] =
    readonly AnyDiscoveryStepDefinition[],
  TStepId extends string = string,
  TInput extends DiscoveryData = DiscoveryData,
  TInitial extends boolean = false,
> = {
  output<TNextOutput extends DiscoveryData>(
    schema: CommandSchema<TNextOutput>,
  ): DiscoveryStepReadyBuilder<
    HydratedState,
    TCommandInput,
    TSteps,
    TStepId,
    TInput,
    TNextOutput,
    TInitial
  >;
};

export type AnyDiscoveryStepDefinition = {
  stepId: string;
  initial: boolean;
  inputSchema: CommandSchema<DiscoveryData>;
  outputSchema: CommandSchema<DiscoveryData>;
  resolve: unknown;
};

type DiscoveryStepInputForStepId<
  TSteps extends readonly AnyDiscoveryStepDefinition[],
  TStepId extends TSteps[number]["stepId"],
> =
  Extract<TSteps[number], { stepId: TStepId }> extends {
    inputSchema: CommandSchema<infer TInput>;
  }
    ? TInput
    : never;

type ValidatedDiscoveryStepOption<
  TSteps extends readonly AnyDiscoveryStepDefinition[],
  TOutput extends DiscoveryData,
> = {
  [TStepId in TSteps[number]["stepId"]]: DiscoveryStepOption<
    DiscoveryStepInputForStepId<TSteps, TStepId>,
    TOutput,
    TStepId
  >;
}[TSteps[number]["stepId"]];

type ValidatedDiscoveryStepResult<
  TSteps extends readonly AnyDiscoveryStepDefinition[],
  TOutput extends DiscoveryData,
  TCommandInput extends CommandData,
> =
  | ValidatedDiscoveryStepOption<TSteps, TOutput>[]
  | DiscoveryStepComplete<TCommandInput>;

export type DiscoveryStepResolveFn<
  HydratedState extends object,
  TCommandInput extends CommandData,
  TSteps extends readonly AnyDiscoveryStepDefinition[],
  TInput extends DiscoveryData,
  TOutput extends DiscoveryData,
> = (
  context: DiscoveryStepContext<HydratedState, TInput>,
) => ValidatedDiscoveryStepResult<TSteps, TOutput, TCommandInput> | null;

export type DiscoveryStepReadyBuilder<
  HydratedState extends object = object,
  TCommandInput extends CommandData = CommandData,
  TSteps extends readonly AnyDiscoveryStepDefinition[] =
    readonly AnyDiscoveryStepDefinition[],
  TStepId extends string = string,
  TInput extends DiscoveryData = DiscoveryData,
  TOutput extends DiscoveryData = DiscoveryData,
  TInitial extends boolean = false,
> = {
  resolve(
    resolve: DiscoveryStepResolveFn<
      HydratedState,
      TCommandInput,
      TSteps,
      TInput,
      TOutput
    >,
  ): DiscoveryStepResolvedBuilder<
    HydratedState,
    TCommandInput,
    TSteps,
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
};

export type DiscoveryStepResolvedBuilder<
  HydratedState extends object = object,
  TCommandInput extends CommandData = CommandData,
  TSteps extends readonly AnyDiscoveryStepDefinition[] =
    readonly AnyDiscoveryStepDefinition[],
  TStepId extends string = string,
  TInput extends DiscoveryData = DiscoveryData,
  TOutput extends DiscoveryData = DiscoveryData,
  TInitial extends boolean = false,
  TResolve extends DiscoveryStepResolveFn<
    HydratedState,
    TCommandInput,
    TSteps,
    TInput,
    TOutput
  > = DiscoveryStepResolveFn<
    HydratedState,
    TCommandInput,
    TSteps,
    TInput,
    TOutput
  >,
> = {
  build(): DiscoveryStepDefinition<
    HydratedState,
    TStepId,
    TInput,
    TOutput,
    TInitial,
    TResolve
  >;
};

export interface DiscoveryDefinition<
  TSteps extends readonly AnyDiscoveryStepDefinition[] =
    readonly AnyDiscoveryStepDefinition[],
> {
  startStep: string;
  steps: TSteps;
}

export type DiscoverableCommandDefinition<
  HydratedState extends object,
  TCommandInput extends CommandData = CommandData,
  TDiscoveryInput extends DiscoveryData = DiscoveryData,
  TSteps extends readonly AnyDiscoveryStepDefinition[] =
    readonly AnyDiscoveryStepDefinition[],
> = {
  commandId: string;
  commandSchema: CommandSchema<TCommandInput>;
  discovery: DiscoveryDefinition<TSteps>;
  _discoveryInput?: TDiscoveryInput;
} & CommandLifecycleMethods<HydratedState, TCommandInput>;

export type NonDiscoverableCommandDefinition<
  HydratedState extends object,
  TCommandInput extends CommandData = CommandData,
> = {
  commandId: string;
  commandSchema: CommandSchema<TCommandInput>;
  discovery?: never;
} & CommandLifecycleMethods<HydratedState, TCommandInput>;

export type DefinedCommand<
  HydratedState extends object,
  TCommandInput extends CommandData = CommandData,
  TDiscoveryInput extends DiscoveryData = TCommandInput,
  TSteps extends readonly AnyDiscoveryStepDefinition[] =
    readonly AnyDiscoveryStepDefinition[],
> = CommandDefinitionBrand &
  CommandDefinition<HydratedState, TCommandInput, TDiscoveryInput, TSteps>;

export type CommandDefinition<
  HydratedState extends object,
  TCommandInput extends CommandData = CommandData,
  TDiscoveryInput extends DiscoveryData = TCommandInput,
  TSteps extends readonly AnyDiscoveryStepDefinition[] =
    readonly AnyDiscoveryStepDefinition[],
> =
  | DiscoverableCommandDefinition<
      HydratedState,
      TCommandInput,
      TDiscoveryInput,
      TSteps
    >
  | NonDiscoverableCommandDefinition<HydratedState, TCommandInput>;

export type RuntimeCommandDefinition<HydratedState extends object> = {
  commandId: string;
  commandSchema: CommandSchema<Record<string, unknown>>;
  discovery?: DiscoveryDefinition;
  isAvailable?(context: CommandAvailabilityContext<HydratedState>): boolean;
  validate(
    context: ValidationContext<HydratedState, Command>,
  ): ValidationOutcome;
  execute(context: ExecuteContext<HydratedState, Command>): void;
};

export type NonDiscoverableCommandAccumulator<
  HydratedState extends object = object,
  TCommandInput extends CommandData = CommandData,
> = Pick<
  NonDiscoverableCommandDefinition<HydratedState, TCommandInput>,
  "commandId" | "commandSchema"
> &
  Partial<
    Pick<
      NonDiscoverableCommandDefinition<HydratedState, TCommandInput>,
      "isAvailable" | "validate" | "execute"
    >
  >;

export type DiscoverableCommandAccumulator<
  HydratedState extends object = object,
  TCommandInput extends CommandData = CommandData,
  TDiscoveryInput extends DiscoveryData = TCommandInput,
  TSteps extends readonly AnyDiscoveryStepDefinition[] =
    readonly AnyDiscoveryStepDefinition[],
> = Pick<
  DiscoverableCommandDefinition<
    HydratedState,
    TCommandInput,
    TDiscoveryInput,
    TSteps
  >,
  "commandId" | "commandSchema" | "discovery"
> &
  Partial<
    Pick<
      DiscoverableCommandDefinition<
        HydratedState,
        TCommandInput,
        TDiscoveryInput,
        TSteps
      >,
      "isAvailable" | "validate" | "execute"
    >
  >;

export type CommandBuilderAccumulator<
  HydratedState extends object = object,
  TCommandInput extends CommandData = CommandData,
  TDiscoveryInput extends DiscoveryData = TCommandInput,
  THasDiscovery extends boolean = false,
  TSteps extends readonly AnyDiscoveryStepDefinition[] =
    readonly AnyDiscoveryStepDefinition[],
> = THasDiscovery extends true
  ? DiscoverableCommandAccumulator<
      HydratedState,
      TCommandInput,
      TDiscoveryInput,
      TSteps
    >
  : NonDiscoverableCommandAccumulator<HydratedState, TCommandInput>;

type NoBuilderMethod = Record<never, never>;

type OptionalBuilderMethod<
  Enabled extends boolean,
  TMethod,
> = Enabled extends true ? NoBuilderMethod : TMethod;

type BuildCommandInput<
  TCommandInput extends CommandData,
  TDiscoveryInput extends DiscoveryData | never,
  THasDiscovery extends boolean,
> = THasDiscovery extends true ? TDiscoveryInput : TCommandInput;

export type DiscoveryInitialInput<
  TSteps extends readonly AnyDiscoveryStepDefinition[],
> =
  Extract<TSteps[number], { initial: true }> extends {
    inputSchema: CommandSchema<infer TInput>;
  }
    ? TInput
    : never;

type BuildBuilderMethod<
  HydratedState extends object,
  TCommandInput extends CommandData,
  TDiscoveryInput extends DiscoveryData,
  THasDiscovery extends boolean,
  THasValidate extends boolean,
  THasExecute extends boolean,
  TSteps extends readonly AnyDiscoveryStepDefinition[],
> = THasValidate extends true
  ? THasExecute extends true
    ? {
        build(): DefinedCommand<
          HydratedState,
          TCommandInput,
          BuildCommandInput<TCommandInput, TDiscoveryInput, THasDiscovery>,
          TSteps
        >;
      }
    : NoBuilderMethod
  : NoBuilderMethod;

export type CommandBuilder<
  HydratedState extends object = object,
  TCommandInput extends CommandData = CommandData,
  TDiscoveryInput extends DiscoveryData = never,
  TSteps extends readonly AnyDiscoveryStepDefinition[] =
    readonly AnyDiscoveryStepDefinition[],
  THasDiscovery extends boolean = false,
  THasAvailability extends boolean = false,
  THasValidate extends boolean = false,
  THasExecute extends boolean = false,
> = OptionalBuilderMethod<
  THasDiscovery,
  {
    discoverable<
      const TNextSteps extends readonly [
        AnyDiscoveryStepDefinition,
        ...AnyDiscoveryStepDefinition[],
      ],
    >(
      configure: (
        step: DiscoveryStepFactory<HydratedState, TCommandInput>,
      ) => TNextSteps,
    ): CommandBuilder<
      HydratedState,
      TCommandInput,
      DiscoveryInitialInput<TNextSteps>,
      TNextSteps,
      true,
      THasAvailability,
      THasValidate,
      THasExecute
    >;
  }
> &
  OptionalBuilderMethod<
    THasAvailability,
    {
      isAvailable(
        isAvailable: (
          context: CommandAvailabilityContext<HydratedState>,
        ) => boolean,
      ): CommandBuilder<
        HydratedState,
        TCommandInput,
        TDiscoveryInput,
        TSteps,
        THasDiscovery,
        true,
        THasValidate,
        THasExecute
      >;
    }
  > &
  OptionalBuilderMethod<
    THasValidate,
    {
      validate(
        validate: (
          context: ValidationContext<
            HydratedState,
            CommandFromSchema<TCommandInput>
          >,
        ) => ValidationOutcome,
      ): CommandBuilder<
        HydratedState,
        TCommandInput,
        TDiscoveryInput,
        TSteps,
        THasDiscovery,
        THasAvailability,
        true,
        THasExecute
      >;
    }
  > &
  OptionalBuilderMethod<
    THasExecute,
    {
      execute(
        execute: (
          context: ExecuteContext<
            HydratedState,
            CommandFromSchema<TCommandInput>
          >,
        ) => void,
      ): CommandBuilder<
        HydratedState,
        TCommandInput,
        TDiscoveryInput,
        TSteps,
        THasDiscovery,
        THasAvailability,
        THasValidate,
        true
      >;
    }
  > &
  BuildBuilderMethod<
    HydratedState,
    TCommandInput,
    TDiscoveryInput,
    THasDiscovery,
    THasValidate,
    THasExecute,
    TSteps
  >;

export interface InternalValidationContext<
  HydratedState extends object,
  TCommand extends Command = Command,
  TCanonicalGameState extends object = CanonicalGameState<HydratedState>,
> {
  state: CanonicalState<TCanonicalGameState>;
  game: Readonly<HydratedState>;
  runtime: Readonly<RuntimeState>;
  command: TCommand;
}

export type ValidationContext<
  HydratedState extends object,
  TCommand extends Command = Command,
> = {
  game: Readonly<HydratedState>;
  runtime: Readonly<RuntimeState>;
  command: TCommand;
};

export interface InternalCommandAvailabilityContext<
  HydratedState extends object,
  TCanonicalGameState extends object = CanonicalGameState<HydratedState>,
> {
  state: CanonicalState<TCanonicalGameState>;
  game: Readonly<HydratedState>;
  runtime: Readonly<RuntimeState>;
  commandType: string;
  actorId: string;
}

export type CommandAvailabilityContext<HydratedState extends object> = {
  game: Readonly<HydratedState>;
  runtime: Readonly<RuntimeState>;
  commandType: string;
  actorId: string;
};

export interface InternalDiscoveryContext<
  HydratedState extends object,
  TDiscovery extends DiscoveryData = DiscoveryData,
  TCanonicalGameState extends object = CanonicalGameState<HydratedState>,
> extends InternalCommandAvailabilityContext<
  HydratedState,
  TCanonicalGameState
> {
  discovery: Discovery<TDiscovery>;
  input: TDiscovery;
}

export type DiscoveryContext<
  HydratedState extends object,
  TDiscovery extends DiscoveryData = DiscoveryData,
> = CommandAvailabilityContext<HydratedState> & {
  discovery: Discovery<TDiscovery>;
};

export type CommandDiscoveryResult<
  TStep extends string,
  TNextInput extends DiscoveryData,
  TOutput extends DiscoveryData,
  TCommandInput extends CommandData,
  TNextStep extends string,
> =
  | {
      complete: false;
      step: TStep;
      options: Array<DiscoveryStepOption<TNextInput, TOutput, TNextStep>>;
    }
  | {
      complete: true;
      input: TCommandInput;
    };

export type AnyCommandDiscoveryResult = CommandDiscoveryResult<
  string,
  DiscoveryData,
  DiscoveryData,
  CommandData,
  string
>;

type DiscoveryStepOutput<TStep extends AnyDiscoveryStepDefinition> =
  TStep extends {
    outputSchema: CommandSchema<infer TOutput>;
  }
    ? TOutput
    : never;

type CommandDiscoveryOpenResult<
  TSteps extends readonly AnyDiscoveryStepDefinition[],
> = {
  [TStepId in TSteps[number]["stepId"]]: {
    complete: false;
    step: TStepId;
    options: Array<
      ValidatedDiscoveryStepOption<
        TSteps,
        DiscoveryStepOutput<Extract<TSteps[number], { stepId: TStepId }>>
      >
    >;
  };
}[TSteps[number]["stepId"]];

export type CommandDiscoveryResultFor<TDefinition> = TDefinition extends {
  discovery: DiscoveryDefinition<infer TSteps>;
  commandSchema: CommandSchema<infer TCommandInput>;
}
  ?
      | CommandDiscoveryOpenResult<TSteps>
      | {
          complete: true;
          input: TCommandInput;
        }
  : never;

export interface InternalExecuteContext<
  HydratedState extends object,
  TCommand extends Command = Command,
  TCanonicalGameState extends object = CanonicalGameState<HydratedState>,
> extends InternalValidationContext<
  HydratedState,
  TCommand,
  TCanonicalGameState
> {
  game: HydratedState;
  runtime: Readonly<RuntimeState>;
  rng: RNGApi;
  emitEvent(event: GameEvent): void;
}

export type ExecuteContext<
  HydratedState extends object,
  TCommand extends Command = Command,
> = {
  game: HydratedState;
  runtime: Readonly<RuntimeState>;
  command: TCommand;
  rng: RNGApi;
  emitEvent(event: GameEvent): void;
};

export interface InternalCommandDefinition<
  HydratedState extends object,
  TCommandInput extends CommandData = CommandData,
> {
  commandId: string;
  commandSchema: CommandSchema<TCommandInput>;
  discovery?: DiscoveryDefinition;
  isAvailable?(
    context: InternalCommandAvailabilityContext<HydratedState>,
  ): boolean;
  validate(
    context: InternalValidationContext<
      HydratedState,
      CommandFromSchema<TCommandInput>
    >,
  ): ValidationOutcome;
  execute(
    context: InternalExecuteContext<
      HydratedState,
      CommandFromSchema<TCommandInput>
    >,
  ): void;
}
