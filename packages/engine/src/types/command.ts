import type { FieldType, ObjectFieldType } from "../schema";
import type { CanonicalGameState } from "../state-facade/canonical";
import type { GameState as BaseGameState } from "../state-facade/metadata";
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
  FacadeGameState extends BaseGameState,
  TInput extends CommandData,
> = {
  isAvailable?(context: CommandAvailabilityContext<FacadeGameState>): boolean;
  validate(
    context: ValidationContext<FacadeGameState, CommandFromSchema<TInput>>,
  ): ValidationOutcome;
  execute(
    context: ExecuteContext<FacadeGameState, CommandFromSchema<TInput>>,
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
  FacadeGameState extends BaseGameState,
  TDiscovery extends DiscoveryData = DiscoveryData,
> extends CommandAvailabilityContext<FacadeGameState> {
  discovery: Discovery<TDiscovery>;
  input: TDiscovery;
}

export interface DiscoveryStepDefinition<
  FacadeGameState extends BaseGameState,
  TStepId extends string = string,
  TInput extends DiscoveryData = DiscoveryData,
  TOutput extends DiscoveryData = DiscoveryData,
  TInitial extends boolean = boolean,
  TResolve extends (
    context: DiscoveryStepContext<FacadeGameState, TInput>,
  ) => unknown = (
    context: DiscoveryStepContext<FacadeGameState, TInput>,
  ) => unknown,
> {
  stepId: TStepId;
  initial: TInitial;
  inputSchema: CommandSchema<TInput>;
  outputSchema: CommandSchema<TOutput>;
  resolve: TResolve;
}

export type DiscoveryStepFactory<
  FacadeGameState extends BaseGameState = BaseGameState,
  TCommandInput extends CommandData = CommandData,
  TSteps extends readonly AnyDiscoveryStepDefinition[] =
    readonly AnyDiscoveryStepDefinition[],
> = <TStepId extends string>(
  stepId: TStepId,
) => DiscoveryStepBuilder<FacadeGameState, TCommandInput, TSteps, TStepId>;

export type DiscoveryStepBuilder<
  FacadeGameState extends BaseGameState = BaseGameState,
  TCommandInput extends CommandData = CommandData,
  TSteps extends readonly AnyDiscoveryStepDefinition[] =
    readonly AnyDiscoveryStepDefinition[],
  TStepId extends string = string,
> = {
  initial(): DiscoveryStepInitialBuilder<
    FacadeGameState,
    TCommandInput,
    TSteps,
    TStepId
  >;
  input<TNextInput extends DiscoveryData>(
    schema: CommandSchema<TNextInput>,
  ): DiscoveryStepInputBuilder<
    FacadeGameState,
    TCommandInput,
    TSteps,
    TStepId,
    TNextInput
  >;
};

export type DiscoveryStepInitialBuilder<
  FacadeGameState extends BaseGameState = BaseGameState,
  TCommandInput extends CommandData = CommandData,
  TSteps extends readonly AnyDiscoveryStepDefinition[] =
    readonly AnyDiscoveryStepDefinition[],
  TStepId extends string = string,
> = {
  input<TNextInput extends DiscoveryData>(
    schema: CommandSchema<TNextInput>,
  ): DiscoveryStepInputBuilder<
    FacadeGameState,
    TCommandInput,
    TSteps,
    TStepId,
    TNextInput,
    true
  >;
};

export type DiscoveryStepInputBuilder<
  FacadeGameState extends BaseGameState = BaseGameState,
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
    FacadeGameState,
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
  FacadeGameState extends BaseGameState,
  TCommandInput extends CommandData,
  TSteps extends readonly AnyDiscoveryStepDefinition[],
  TInput extends DiscoveryData,
  TOutput extends DiscoveryData,
> = (
  context: DiscoveryStepContext<FacadeGameState, TInput>,
) => ValidatedDiscoveryStepResult<TSteps, TOutput, TCommandInput> | null;

export type DiscoveryStepReadyBuilder<
  FacadeGameState extends BaseGameState = BaseGameState,
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
      FacadeGameState,
      TCommandInput,
      TSteps,
      TInput,
      TOutput
    >,
  ): DiscoveryStepResolvedBuilder<
    FacadeGameState,
    TCommandInput,
    TSteps,
    TStepId,
    TInput,
    TOutput,
    TInitial,
    DiscoveryStepResolveFn<
      FacadeGameState,
      TCommandInput,
      TSteps,
      TInput,
      TOutput
    >
  >;
};

export type DiscoveryStepResolvedBuilder<
  FacadeGameState extends BaseGameState = BaseGameState,
  TCommandInput extends CommandData = CommandData,
  TSteps extends readonly AnyDiscoveryStepDefinition[] =
    readonly AnyDiscoveryStepDefinition[],
  TStepId extends string = string,
  TInput extends DiscoveryData = DiscoveryData,
  TOutput extends DiscoveryData = DiscoveryData,
  TInitial extends boolean = false,
  TResolve extends DiscoveryStepResolveFn<
    FacadeGameState,
    TCommandInput,
    TSteps,
    TInput,
    TOutput
  > = DiscoveryStepResolveFn<
    FacadeGameState,
    TCommandInput,
    TSteps,
    TInput,
    TOutput
  >,
> = {
  build(): DiscoveryStepDefinition<
    FacadeGameState,
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
  FacadeGameState extends BaseGameState,
  TCommandInput extends CommandData = CommandData,
  TDiscoveryInput extends DiscoveryData = DiscoveryData,
  TSteps extends readonly AnyDiscoveryStepDefinition[] =
    readonly AnyDiscoveryStepDefinition[],
> = {
  commandId: string;
  commandSchema: CommandSchema<TCommandInput>;
  discovery: DiscoveryDefinition<TSteps>;
  _discoveryInput?: TDiscoveryInput;
} & CommandLifecycleMethods<FacadeGameState, TCommandInput>;

export type NonDiscoverableCommandDefinition<
  FacadeGameState extends BaseGameState,
  TCommandInput extends CommandData = CommandData,
> = {
  commandId: string;
  commandSchema: CommandSchema<TCommandInput>;
  discovery?: never;
} & CommandLifecycleMethods<FacadeGameState, TCommandInput>;

export type DefinedCommand<
  FacadeGameState extends BaseGameState,
  TCommandInput extends CommandData = CommandData,
  TDiscoveryInput extends DiscoveryData = TCommandInput,
  TSteps extends readonly AnyDiscoveryStepDefinition[] =
    readonly AnyDiscoveryStepDefinition[],
> = CommandDefinitionBrand &
  CommandDefinition<FacadeGameState, TCommandInput, TDiscoveryInput, TSteps>;

export type CommandDefinition<
  FacadeGameState extends BaseGameState,
  TCommandInput extends CommandData = CommandData,
  TDiscoveryInput extends DiscoveryData = TCommandInput,
  TSteps extends readonly AnyDiscoveryStepDefinition[] =
    readonly AnyDiscoveryStepDefinition[],
> =
  | DiscoverableCommandDefinition<
      FacadeGameState,
      TCommandInput,
      TDiscoveryInput,
      TSteps
    >
  | NonDiscoverableCommandDefinition<FacadeGameState, TCommandInput>;

export type RuntimeCommandDefinition<FacadeGameState extends BaseGameState> = {
  commandId: string;
  commandSchema: CommandSchema<Record<string, unknown>>;
  discovery?: DiscoveryDefinition;
  isAvailable?(context: CommandAvailabilityContext<FacadeGameState>): boolean;
  validate(
    context: ValidationContext<FacadeGameState, Command>,
  ): ValidationOutcome;
  execute(context: ExecuteContext<FacadeGameState, Command>): void;
};

export type NonDiscoverableCommandAccumulator<
  FacadeGameState extends BaseGameState = BaseGameState,
  TCommandInput extends CommandData = CommandData,
> = Pick<
  NonDiscoverableCommandDefinition<FacadeGameState, TCommandInput>,
  "commandId" | "commandSchema"
> &
  Partial<
    Pick<
      NonDiscoverableCommandDefinition<FacadeGameState, TCommandInput>,
      "isAvailable" | "validate" | "execute"
    >
  >;

export type DiscoverableCommandAccumulator<
  FacadeGameState extends BaseGameState = BaseGameState,
  TCommandInput extends CommandData = CommandData,
  TDiscoveryInput extends DiscoveryData = TCommandInput,
  TSteps extends readonly AnyDiscoveryStepDefinition[] =
    readonly AnyDiscoveryStepDefinition[],
> = Pick<
  DiscoverableCommandDefinition<
    FacadeGameState,
    TCommandInput,
    TDiscoveryInput,
    TSteps
  >,
  "commandId" | "commandSchema" | "discovery"
> &
  Partial<
    Pick<
      DiscoverableCommandDefinition<
        FacadeGameState,
        TCommandInput,
        TDiscoveryInput,
        TSteps
      >,
      "isAvailable" | "validate" | "execute"
    >
  >;

export type CommandBuilderAccumulator<
  FacadeGameState extends BaseGameState = BaseGameState,
  TCommandInput extends CommandData = CommandData,
  TDiscoveryInput extends DiscoveryData = TCommandInput,
  THasDiscovery extends boolean = false,
  TSteps extends readonly AnyDiscoveryStepDefinition[] =
    readonly AnyDiscoveryStepDefinition[],
> = THasDiscovery extends true
  ? DiscoverableCommandAccumulator<
      FacadeGameState,
      TCommandInput,
      TDiscoveryInput,
      TSteps
    >
  : NonDiscoverableCommandAccumulator<FacadeGameState, TCommandInput>;

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
  FacadeGameState extends BaseGameState,
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
          FacadeGameState,
          TCommandInput,
          BuildCommandInput<TCommandInput, TDiscoveryInput, THasDiscovery>,
          TSteps
        >;
      }
    : NoBuilderMethod
  : NoBuilderMethod;

export type CommandBuilder<
  FacadeGameState extends BaseGameState = BaseGameState,
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
        step: DiscoveryStepFactory<FacadeGameState, TCommandInput>,
      ) => TNextSteps,
    ): CommandBuilder<
      FacadeGameState,
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
          context: CommandAvailabilityContext<FacadeGameState>,
        ) => boolean,
      ): CommandBuilder<
        FacadeGameState,
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
            FacadeGameState,
            CommandFromSchema<TCommandInput>
          >,
        ) => ValidationOutcome,
      ): CommandBuilder<
        FacadeGameState,
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
            FacadeGameState,
            CommandFromSchema<TCommandInput>
          >,
        ) => void,
      ): CommandBuilder<
        FacadeGameState,
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
    FacadeGameState,
    TCommandInput,
    TDiscoveryInput,
    THasDiscovery,
    THasValidate,
    THasExecute,
    TSteps
  >;

export interface InternalValidationContext<
  FacadeGameState extends BaseGameState,
  TCommand extends Command = Command,
> {
  state: CanonicalState<CanonicalGameState<FacadeGameState>>;
  game: Readonly<FacadeGameState>;
  runtime: Readonly<RuntimeState>;
  command: TCommand;
}

export type ValidationContext<
  FacadeGameState extends BaseGameState,
  TCommand extends Command = Command,
> = {
  game: Readonly<FacadeGameState>;
  runtime: Readonly<RuntimeState>;
  command: TCommand;
};

export interface InternalCommandAvailabilityContext<
  FacadeGameState extends BaseGameState,
> {
  state: CanonicalState<CanonicalGameState<FacadeGameState>>;
  game: Readonly<FacadeGameState>;
  runtime: Readonly<RuntimeState>;
  commandType: string;
  actorId: string;
}

export type CommandAvailabilityContext<FacadeGameState extends BaseGameState> =
  {
    game: Readonly<FacadeGameState>;
    runtime: Readonly<RuntimeState>;
    commandType: string;
    actorId: string;
  };

export interface InternalDiscoveryContext<
  FacadeGameState extends BaseGameState,
  TDiscovery extends DiscoveryData = DiscoveryData,
> extends InternalCommandAvailabilityContext<FacadeGameState> {
  discovery: Discovery<TDiscovery>;
  input: TDiscovery;
}

export type DiscoveryContext<
  FacadeGameState extends BaseGameState,
  TDiscovery extends DiscoveryData = DiscoveryData,
> = CommandAvailabilityContext<FacadeGameState> & {
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
  FacadeGameState extends BaseGameState,
  TCommand extends Command = Command,
> extends InternalValidationContext<FacadeGameState, TCommand> {
  game: FacadeGameState;
  runtime: Readonly<RuntimeState>;
  rng: RNGApi;
  emitEvent(event: GameEvent): void;
}

export type ExecuteContext<
  FacadeGameState extends BaseGameState,
  TCommand extends Command = Command,
> = {
  game: FacadeGameState;
  runtime: Readonly<RuntimeState>;
  command: TCommand;
  rng: RNGApi;
  emitEvent(event: GameEvent): void;
};

export interface InternalCommandDefinition<
  FacadeGameState extends BaseGameState,
  TCommandInput extends CommandData = CommandData,
> {
  commandId: string;
  commandSchema: CommandSchema<TCommandInput>;
  discovery?: DiscoveryDefinition;
  isAvailable?(
    context: InternalCommandAvailabilityContext<FacadeGameState>,
  ): boolean;
  validate(
    context: InternalValidationContext<
      FacadeGameState,
      CommandFromSchema<TCommandInput>
    >,
  ): ValidationOutcome;
  execute(
    context: InternalExecuteContext<
      FacadeGameState,
      CommandFromSchema<TCommandInput>
    >,
  ): void;
}
