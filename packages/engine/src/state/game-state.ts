import { assertSerializableSchema } from "../schema";
import type {
  ArrayFieldType,
  BooleanFieldType,
  FieldType,
  NumberFieldType,
  ObjectFieldType,
  ObjectSchemaStatic,
  OptionalFieldType,
  RecordFieldType,
  SerializableFieldStatic,
  SerializableFieldType,
  StringFieldType,
} from "../schema";

export type StateClass<TInstance extends object = object> = new () => TInstance;

export type StateModel = Record<string, FieldType>;

export type HiddenValue<TValue = never> = [TValue] extends [never]
  ? {
      __hidden: true;
    }
  : {
      __hidden: true;
      value: TValue;
    };

export interface OwnedByVisibilityEntry<TFieldName extends string = string> {
  kind: "ownedBy";
  fieldName: TFieldName;
}

export interface FieldVisibilityEntry<
  TFieldName extends string = string,
  TMode extends "hidden" | "visibleToSelf" = "hidden" | "visibleToSelf",
  TFieldValue = unknown,
  TStateClass extends object = object,
  TView = HiddenValue,
> {
  kind: "field";
  fieldName: TFieldName;
  mode: TMode;
  schema?: SerializableFieldType;
  derive?: (value: TFieldValue, state: Readonly<TStateClass>) => unknown;
  readonly __view?: TView;
}

export type StateVisibilityEntry =
  | OwnedByVisibilityEntry
  // Visibility entries are runtime metadata; field-specific static types are
  // preserved on the tuple returned from `.visibility(...)`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | FieldVisibilityEntry<string, "hidden" | "visibleToSelf", any, any, any>;

export interface GameStateDefinition<
  TCanonical extends object,
  TStateClass extends object,
  TView extends object,
> {
  readonly kind: "gameState";
  readonly model: StateModel;
  readonly stateClass: StateClass<TStateClass>;
  readonly visibility: readonly StateVisibilityEntry[];
  readonly __canonical?: TCanonical;
  readonly __stateClass?: TStateClass;
  readonly __view?: TView;
}

export type AnyGameStateDefinition = GameStateDefinition<
  object,
  object,
  object
>;

export type CanonicalStateOf<TState> =
  TState extends GameStateDefinition<infer TCanonical, object, object>
    ? TCanonical
    : never;

export type StateClassOf<TState> =
  TState extends GameStateDefinition<object, infer TStateClass, object>
    ? TStateClass
    : never;

export type ViewOf<TState> =
  TState extends GameStateDefinition<object, object, infer TView>
    ? TView
    : never;

type CanonicalStateOfModel<TModel extends StateModel> = {
  -readonly [K in keyof TModel]: CanonicalFieldValue<TModel[K]>;
};

type CanonicalFieldValue<TField> = TField extends NumberFieldType
  ? number
  : TField extends StringFieldType
    ? string
    : TField extends BooleanFieldType
      ? boolean
      : TField extends ArrayFieldType<infer TItem>
        ? CanonicalFieldValue<TItem>[]
        : TField extends RecordFieldType<infer TKey, infer TValue>
          ? Record<RecordKeyValue<TKey>, CanonicalFieldValue<TValue>>
          : TField extends ObjectFieldType<infer TProperties>
            ? ObjectSchemaStatic<TProperties>
            : TField extends OptionalFieldType<infer TItem>
              ? CanonicalFieldValue<TItem> | undefined
              : TField extends { kind: "state"; target: infer TState }
                ? CanonicalStateOf<TState>
                : never;

type RecordKeyValue<TKey> =
  CanonicalFieldValue<TKey> extends string | number | symbol
    ? CanonicalFieldValue<TKey>
    : string;

type DefaultView<TModel extends StateModel> = {
  -readonly [K in keyof TModel]: DefaultViewField<TModel[K]>;
};

type DefaultViewField<TField> = TField extends NumberFieldType
  ? number
  : TField extends StringFieldType
    ? string
    : TField extends BooleanFieldType
      ? boolean
      : TField extends ArrayFieldType<infer TItem>
        ? DefaultViewField<TItem>[]
        : TField extends RecordFieldType<infer TKey, infer TValue>
          ? Record<RecordKeyValue<TKey>, DefaultViewField<TValue>>
          : TField extends ObjectFieldType<infer TProperties>
            ? ObjectSchemaStatic<TProperties>
            : TField extends OptionalFieldType<infer TItem>
              ? DefaultViewField<TItem> | undefined
              : TField extends { kind: "state"; target: infer TState }
                ? ViewOf<TState>
                : never;

type StateDataFieldName<TModel extends StateModel> = Extract<
  keyof TModel,
  string
>;

type StateStringFieldName<TModel extends StateModel> = Extract<
  {
    [K in keyof TModel]-?: CanonicalFieldValue<TModel[K]> extends string
      ? K
      : never;
  }[keyof TModel],
  string
>;

type FieldViewForEntry<TEntry> =
  TEntry extends FieldVisibilityEntry<
    string,
    "hidden" | "visibleToSelf",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any,
    infer TView
  >
    ? TView
    : never;

type FieldNamesFromEntries<TEntries extends readonly StateVisibilityEntry[]> =
  Extract<TEntries[number], { kind: "field" }>["fieldName"];

type ApplyVisibility<
  TModel extends StateModel,
  TEntries extends readonly StateVisibilityEntry[],
> = Omit<DefaultView<TModel>, FieldNamesFromEntries<TEntries>> & {
  [TEntry in Extract<
    TEntries[number],
    { kind: "field" }
  > as TEntry["fieldName"]]: FieldViewForEntry<TEntry>;
};

export function defineGameState(): GameStateModelBuilder {
  return new GameStateModelBuilder();
}

export class GameStateModelBuilder {
  model<const TModel extends StateModel>(
    model: TModel,
  ): GameStateClassBuilder<TModel> {
    return new GameStateClassBuilder(model);
  }
}

export class GameStateClassBuilder<TModel extends StateModel> {
  constructor(private readonly stateModel: TModel) {}

  stateClass<TStateClass extends CanonicalStateOfModel<TModel>>(
    stateClass: StateClass<TStateClass>,
  ): GameStateVisibilityBuilder<TModel, TStateClass, readonly []> {
    return new GameStateVisibilityBuilder(this.stateModel, stateClass, []);
  }
}

export class GameStateVisibilityBuilder<
  TModel extends StateModel,
  TStateClass extends object,
  TEntries extends readonly StateVisibilityEntry[],
> {
  constructor(
    private readonly stateModel: TModel,
    private readonly stateClassConstructor: StateClass<TStateClass>,
    private readonly visibilityEntries: TEntries,
  ) {}

  visibility<const TNextEntries extends readonly StateVisibilityEntry[]>(
    configure: (
      builder: VisibilityBuilder<TModel, TStateClass>,
    ) => TNextEntries,
  ): GameStateVisibilityBuilder<TModel, TStateClass, TNextEntries> {
    return new GameStateVisibilityBuilder(
      this.stateModel,
      this.stateClassConstructor,
      configure(createVisibilityBuilder<TModel, TStateClass>()),
    );
  }

  build(): GameStateDefinition<
    CanonicalStateOfModel<TModel>,
    TStateClass,
    ApplyVisibility<TModel, TEntries>
  > {
    validateVisibilityEntries(this.stateModel, this.visibilityEntries);

    return {
      kind: "gameState",
      model: this.stateModel,
      stateClass: this.stateClassConstructor,
      visibility: this.visibilityEntries,
    } satisfies GameStateDefinition<
      CanonicalStateOfModel<TModel>,
      TStateClass,
      ApplyVisibility<TModel, TEntries>
    >;
  }
}

interface VisibilityBuilder<
  TModel extends StateModel,
  TStateClass extends object,
> {
  ownedBy<TFieldName extends StateStringFieldName<TModel>>(
    fieldName: TFieldName,
  ): OwnedByVisibilityEntry<TFieldName>;
  field<TFieldName extends StateDataFieldName<TModel>>(
    fieldName: TFieldName,
  ): VisibilityFieldBuilder<TFieldName, TModel[TFieldName], TStateClass>;
}

interface VisibilityFieldBuilder<
  TFieldName extends string,
  TField extends FieldType,
  TStateClass extends object,
> {
  hidden(): FieldVisibilityEntry<
    TFieldName,
    "hidden",
    CanonicalFieldValue<TField>,
    TStateClass,
    HiddenValue
  >;
  hidden<TSchema extends SerializableFieldType>(options: {
    schema: TSchema;
    derive: (
      value: CanonicalFieldValue<TField>,
      state: Readonly<TStateClass>,
    ) => SerializableFieldStatic<TSchema>;
  }): FieldVisibilityEntry<
    TFieldName,
    "hidden",
    CanonicalFieldValue<TField>,
    TStateClass,
    HiddenValue<SerializableFieldStatic<TSchema>>
  >;
  visibleToSelf(options?: {
    hidden?: undefined;
  }): FieldVisibilityEntry<
    TFieldName,
    "visibleToSelf",
    CanonicalFieldValue<TField>,
    TStateClass,
    CanonicalFieldValue<TField> | HiddenValue
  >;
  visibleToSelf<TSchema extends SerializableFieldType>(options: {
    hidden: {
      schema: TSchema;
      derive: (
        value: CanonicalFieldValue<TField>,
        state: Readonly<TStateClass>,
      ) => SerializableFieldStatic<TSchema>;
    };
  }): FieldVisibilityEntry<
    TFieldName,
    "visibleToSelf",
    CanonicalFieldValue<TField>,
    TStateClass,
    CanonicalFieldValue<TField> | HiddenValue<SerializableFieldStatic<TSchema>>
  >;
}

function createVisibilityBuilder<
  TModel extends StateModel,
  TStateClass extends object,
>(): VisibilityBuilder<TModel, TStateClass> {
  return {
    ownedBy(fieldName) {
      return {
        kind: "ownedBy",
        fieldName,
      };
    },
    field(fieldName) {
      return createVisibilityFieldBuilder<
        typeof fieldName,
        TModel[typeof fieldName],
        TStateClass
      >(fieldName);
    },
  };
}

function createVisibilityFieldBuilder<
  TFieldName extends string,
  TField extends FieldType,
  TStateClass extends object,
>(
  fieldName: TFieldName,
): VisibilityFieldBuilder<TFieldName, TField, TStateClass> {
  return new VisibilityFieldBuilderImpl<TFieldName, TField, TStateClass>(
    fieldName,
  );
}

class VisibilityFieldBuilderImpl<
  TFieldName extends string,
  TField extends FieldType,
  TStateClass extends object,
> implements VisibilityFieldBuilder<TFieldName, TField, TStateClass> {
  constructor(private readonly fieldName: TFieldName) {}

  hidden(): FieldVisibilityEntry<
    TFieldName,
    "hidden",
    CanonicalFieldValue<TField>,
    TStateClass,
    HiddenValue
  >;
  hidden<TSchema extends SerializableFieldType>(options: {
    schema: TSchema;
    derive: (
      value: CanonicalFieldValue<TField>,
      state: Readonly<TStateClass>,
    ) => SerializableFieldStatic<TSchema>;
  }): FieldVisibilityEntry<
    TFieldName,
    "hidden",
    CanonicalFieldValue<TField>,
    TStateClass,
    HiddenValue<SerializableFieldStatic<TSchema>>
  >;
  hidden(options?: {
    schema: SerializableFieldType;
    derive: (
      value: CanonicalFieldValue<TField>,
      state: Readonly<TStateClass>,
    ) => unknown;
  }): FieldVisibilityEntry<
    TFieldName,
    "hidden",
    CanonicalFieldValue<TField>,
    TStateClass,
    HiddenValue | HiddenValue<unknown>
  > {
    if (options) {
      assertSerializableSchema(options.schema);
    }

    return {
      kind: "field",
      fieldName: this.fieldName,
      mode: "hidden",
      schema: options?.schema,
      derive: options?.derive,
    };
  }

  visibleToSelf(options?: {
    hidden?: undefined;
  }): FieldVisibilityEntry<
    TFieldName,
    "visibleToSelf",
    CanonicalFieldValue<TField>,
    TStateClass,
    CanonicalFieldValue<TField> | HiddenValue
  >;
  visibleToSelf<TSchema extends SerializableFieldType>(options: {
    hidden: {
      schema: TSchema;
      derive: (
        value: CanonicalFieldValue<TField>,
        state: Readonly<TStateClass>,
      ) => SerializableFieldStatic<TSchema>;
    };
  }): FieldVisibilityEntry<
    TFieldName,
    "visibleToSelf",
    CanonicalFieldValue<TField>,
    TStateClass,
    CanonicalFieldValue<TField> | HiddenValue<SerializableFieldStatic<TSchema>>
  >;
  visibleToSelf(options?: {
    hidden?: {
      schema: SerializableFieldType;
      derive: (
        value: CanonicalFieldValue<TField>,
        state: Readonly<TStateClass>,
      ) => unknown;
    };
  }): FieldVisibilityEntry<
    TFieldName,
    "visibleToSelf",
    CanonicalFieldValue<TField>,
    TStateClass,
    CanonicalFieldValue<TField> | HiddenValue | HiddenValue<unknown>
  > {
    if (options?.hidden) {
      assertSerializableSchema(options.hidden.schema);
    }

    return {
      kind: "field",
      fieldName: this.fieldName,
      mode: "visibleToSelf",
      schema: options?.hidden?.schema,
      derive: options?.hidden?.derive,
    };
  }
}

function validateVisibilityEntries(
  model: StateModel,
  entries: readonly StateVisibilityEntry[],
): void {
  const configuredFields = new Set<string>();

  for (const entry of entries) {
    if (!(entry.fieldName in model)) {
      throw new Error(`visibility_field_not_found:${entry.fieldName}`);
    }

    if (entry.kind === "field") {
      if (configuredFields.has(entry.fieldName)) {
        throw new Error(`duplicate_visibility_field:${entry.fieldName}`);
      }
      configuredFields.add(entry.fieldName);
    }

    if (entry.kind === "ownedBy" && model[entry.fieldName]?.kind !== "string") {
      throw new Error(
        `owned_by_field_requires_string_field:${entry.fieldName}`,
      );
    }
  }
}
