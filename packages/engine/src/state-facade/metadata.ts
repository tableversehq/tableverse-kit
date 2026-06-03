export abstract class GameState {
  declare protected readonly __tabletopGameStateBrand: never;
}

export type GameStateClass<TState extends GameState = GameState> = new (
  ...args: unknown[]
) => TState;

type Constructor<TState extends object = object> = new (
  ...args: unknown[]
) => TState;

import { assertSerializableSchema, t } from "../schema";
import type {
  FieldType,
  SerializableFieldStatic,
  SerializableFieldType,
} from "../schema";

export { t };

export type VisibilityMode = "hidden" | "visible_to_self";

type StateDataFieldName<TState extends object> = Extract<
  {
    [K in keyof TState]-?: TState[K] extends (...args: never[]) => unknown
      ? never
      : K;
  }[keyof TState],
  string
>;

type StateStringFieldName<TState extends object> = Extract<
  {
    [K in StateDataFieldName<TState>]-?: TState[K] extends string ? K : never;
  }[StateDataFieldName<TState>],
  string
>;

export type VisibilityDeriveOptions = {
  schema?: undefined;
  derive?: undefined;
};

export type VisibilitySchemaOptions<
  TValue = unknown,
  TState extends object = object,
  TSchema extends SerializableFieldType = SerializableFieldType,
> = {
  schema: TSchema;
  derive?: (
    value: TValue,
    state: Readonly<TState>,
  ) => SerializableFieldStatic<TSchema>;
};

export interface HiddenFieldConfig<
  TValue = unknown,
  TState extends object = object,
> {
  mode: "hidden";
  schema?: SerializableFieldType;
  derive?: (value: TValue, state: Readonly<TState>) => unknown;
}

export interface VisibleToSelfFieldConfig<
  TValue = unknown,
  TState extends object = object,
> {
  mode: "visible_to_self";
  schema?: SerializableFieldType;
  derive?: (value: TValue, state: Readonly<TState>) => unknown;
}

export type FieldVisibilityConfig<
  TValue = unknown,
  TState extends object = object,
> =
  | HiddenFieldConfig<TValue, TState>
  | VisibleToSelfFieldConfig<TValue, TState>;

interface VisibilityFieldConfigEntry<
  TFieldName extends string = string,
  TValue = unknown,
  TState extends object = object,
> {
  fieldName: TFieldName;
  visibility: FieldVisibilityConfig<TValue, TState>;
}

type AnyVisibilityFieldConfigEntry<TState extends object> = {
  [K in StateDataFieldName<TState>]: VisibilityFieldConfigEntry<
    K,
    TState[K],
    TState
  >;
}[StateDataFieldName<TState>];

export interface StateMetadata {
  type: "state";
  fields: Record<string, FieldType>;
  fieldVisibility: Record<string, FieldVisibilityConfig>;
  ownedByField?: string;
}

interface VisibilityFieldToken<
  TState extends object,
  TFieldName extends StateDataFieldName<TState>,
> {
  fieldName: TFieldName;
  hidden(): VisibilityFieldConfigEntry<TFieldName, TState[TFieldName], TState>;
  hidden<TSchema extends SerializableFieldType>(
    options: VisibilitySchemaOptions<TState[TFieldName], TState, TSchema>,
  ): VisibilityFieldConfigEntry<TFieldName, TState[TFieldName], TState>;
  visibleToSelf(): VisibilityFieldConfigEntry<
    TFieldName,
    TState[TFieldName],
    TState
  >;
  visibleToSelf<TSchema extends SerializableFieldType>(
    options: VisibilitySchemaOptions<TState[TFieldName], TState, TSchema>,
  ): VisibilityFieldConfigEntry<TFieldName, TState[TFieldName], TState>;
}

export interface VisibilityConfigurationInput<TState extends object = object> {
  ownedBy?: VisibilityFieldToken<TState, StateStringFieldName<TState>>;
  fields?: Array<AnyVisibilityFieldConfigEntry<TState>>;
}

type VisibilityConfigurationBuilder<TState extends object> = {
  field: {
    [K in StateDataFieldName<TState>]: VisibilityFieldToken<TState, K>;
  };
};

const STATE_METADATA = new WeakMap<GameStateClass, StateMetadata>();

function ensureStateMetadata(target: GameStateClass): StateMetadata {
  const existing = STATE_METADATA.get(target);

  if (existing) {
    return existing;
  }

  const created: StateMetadata = {
    type: "state",
    fields: {},
    fieldVisibility: {},
    ownedByField: undefined,
  };
  STATE_METADATA.set(target, created);
  return created;
}

function resolveDecoratorTarget(target: object): GameStateClass {
  const constructor = target.constructor as Constructor;
  assertGameStateClass(constructor);
  return constructor;
}

function assertVisibilityFieldConfig(config: FieldVisibilityConfig): void {
  if (config.schema) {
    assertSerializableSchema(config.schema);

    if (!config.derive) {
      throw new Error("visibility_schema_requires_derive");
    }
  }
}

export function field(fieldType: FieldType): PropertyDecorator {
  return (target, propertyKey) => {
    const metadata = ensureStateMetadata(resolveDecoratorTarget(target));
    metadata.fields[String(propertyKey)] = fieldType;
  };
}

function createHiddenFieldConfig<TValue, TState extends object>(
  options:
    | VisibilityDeriveOptions
    | VisibilitySchemaOptions<TValue, TState> = {},
): HiddenFieldConfig<TValue, TState> {
  const config: HiddenFieldConfig<TValue, TState> = {
    mode: "hidden",
    schema: options.schema,
    derive: options.derive,
  };
  assertVisibilityFieldConfig(config as FieldVisibilityConfig);
  return config;
}

function createVisibleToSelfFieldConfig<TValue, TState extends object>(
  options:
    | VisibilityDeriveOptions
    | VisibilitySchemaOptions<TValue, TState> = {},
): VisibleToSelfFieldConfig<TValue, TState> {
  const config: VisibleToSelfFieldConfig<TValue, TState> = {
    mode: "visible_to_self",
    schema: options.schema,
    derive: options.derive,
  };
  assertVisibilityFieldConfig(config as FieldVisibilityConfig);
  return config;
}

export function configureVisibility<TState extends GameState>(
  target: GameStateClass<TState>,
  config: (
    builder: VisibilityConfigurationBuilder<TState>,
  ) => VisibilityConfigurationInput<TState>,
): void {
  const metadata = ensureStateMetadata(target);
  const resolvedConfig = config(createVisibilityConfigurationBuilder<TState>());
  const configuredFieldEntries = resolvedConfig.fields ?? [];
  const fieldVisibility: Record<string, FieldVisibilityConfig> = {};

  for (const entry of configuredFieldEntries) {
    if (fieldVisibility[entry.fieldName]) {
      throw new Error(`duplicate_visibility_field:${entry.fieldName}`);
    }

    // TValue is erased here: the entry was validated as the correct type for
    // its field by AnyVisibilityFieldConfigEntry; the engine calls derive with
    // the matching runtime value.
    fieldVisibility[entry.fieldName] =
      entry.visibility as FieldVisibilityConfig;
  }

  metadata.ownedByField = resolvedConfig.ownedBy?.fieldName;
  metadata.fieldVisibility = fieldVisibility;
}

function createVisibilityConfigurationBuilder<
  TState extends object,
>(): VisibilityConfigurationBuilder<TState> {
  return {
    field: new Proxy(
      {},
      {
        get(_target, property) {
          const fieldName = String(property);

          return {
            fieldName,
            hidden(
              options?:
                | VisibilityDeriveOptions
                | VisibilitySchemaOptions<unknown, object>,
            ) {
              return {
                fieldName,
                visibility: createHiddenFieldConfig(options),
              };
            },
            visibleToSelf(
              options?:
                | VisibilityDeriveOptions
                | VisibilitySchemaOptions<unknown, object>,
            ) {
              return {
                fieldName,
                visibility: createVisibleToSelfFieldConfig(options),
              };
            },
          };
        },
      },
    ) as VisibilityConfigurationBuilder<TState>["field"],
  };
}

export function getStateMetadata(target: Constructor): StateMetadata {
  assertGameStateClass(target);

  const metadata = STATE_METADATA.get(target);

  if (!metadata) {
    return ensureStateMetadata(target);
  }

  return metadata;
}

function isGameStateClass(target: Constructor): target is GameStateClass {
  return target === GameState || target.prototype instanceof GameState;
}

function assertGameStateClass(
  target: Constructor,
): asserts target is GameStateClass {
  if (!isGameStateClass(target)) {
    throw new Error(
      `state_field_target_must_extend_game_state:${target.name || "anonymous"}`,
    );
  }
}
