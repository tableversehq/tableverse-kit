import type {
  Static,
  TBoolean,
  TNumber,
  TSchema,
  TString,
} from "@sinclair/typebox";
import type { GameStateClass } from "../state-facade/metadata";

export const fieldKind = Symbol("tabletop-engine.schema-field-kind");

export type StateFieldTargetFactory = () => GameStateClass;

export type NumberFieldType = TNumber & {
  readonly [fieldKind]: "number";
  kind: "number";
};

export type StringFieldType = TString & {
  readonly [fieldKind]: "string";
  kind: "string";
};

export type BooleanFieldType = TBoolean & {
  readonly [fieldKind]: "boolean";
  kind: "boolean";
};

export interface NestedStateFieldType {
  readonly [fieldKind]: "state";
  kind: "state";
  target: StateFieldTargetFactory;
}

// Recursive field composition still needs broad defaults internally.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ArrayFieldType<TItem = any> = TSchema & {
  readonly static: ArraySchemaStatic<TItem>;
  readonly [fieldKind]: "array";
  kind: "array";
  item: TItem;
};

export type RecordFieldType<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TKey = any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TValue = any,
> = TSchema & {
  readonly static: RecordSchemaStatic<TKey, TValue>;
  readonly [fieldKind]: "record";
  kind: "record";
  key: TKey;
  value: TValue;
};

export type ObjectFieldType<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TProperties extends Record<string, any> = Record<string, any>,
> = TSchema & {
  // TypeBox's `static` field is phantom compile-time metadata. It is used for
  // type extraction only and is not expected to exist on schema objects at runtime.
  readonly static: ObjectSchemaStatic<TProperties>;
  readonly [fieldKind]: "object";
  kind: "object";
  properties: TProperties;
};

// Recursive field composition still needs broad defaults internally.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OptionalFieldType<TItem = any> = TSchema & {
  readonly static: OptionalSchemaStatic<TItem>;
  readonly [fieldKind]: "optional";
  kind: "optional";
  item: TItem;
};

export type PrimitiveFieldType =
  | NumberFieldType
  | StringFieldType
  | BooleanFieldType;

export type SerializableFieldType =
  | PrimitiveFieldType
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | ArrayFieldType<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | RecordFieldType<any, any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | ObjectFieldType<Record<string, any>>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | OptionalFieldType<any>;

export type FieldType = SerializableFieldType | NestedStateFieldType;

type FieldStatic<TField> = TField extends { readonly [fieldKind]: "number" }
  ? number
  : TField extends { readonly [fieldKind]: "string" }
    ? string
    : TField extends { readonly [fieldKind]: "boolean" }
      ? boolean
      : TField extends { readonly [fieldKind]: "array"; item: infer TItem }
        ? ArraySchemaStatic<TItem>
        : TField extends {
              readonly [fieldKind]: "record";
              key: infer TKey;
              value: infer TValue;
            }
          ? RecordSchemaStatic<TKey, TValue>
          : TField extends {
                readonly [fieldKind]: "object";
                properties: infer TProperties extends Record<string, unknown>;
              }
            ? ObjectSchemaStatic<TProperties>
            : TField extends {
                  readonly [fieldKind]: "optional";
                  item: infer TItem;
                }
              ? OptionalSchemaStatic<TItem>
              : TField extends TSchema
                ? Static<TField>
                : never;

type OptionalObjectPropertyKeys<TProperties> = {
  [K in keyof TProperties]-?: TProperties[K] extends {
    readonly [fieldKind]: "optional";
  }
    ? K
    : never;
}[keyof TProperties];

type RequiredObjectPropertyKeys<TProperties> = Exclude<
  keyof TProperties,
  OptionalObjectPropertyKeys<TProperties>
>;

export type ArraySchemaStatic<TItem> = FieldStatic<TItem>[];

export type RecordSchemaStatic<TKey, TValue> = Record<
  FieldStatic<TKey> extends string | number | symbol
    ? FieldStatic<TKey>
    : string,
  FieldStatic<TValue>
>;

export type ObjectSchemaStatic<TProperties> = {
  [K in RequiredObjectPropertyKeys<TProperties>]: FieldStatic<TProperties[K]>;
} & {
  [K in OptionalObjectPropertyKeys<TProperties>]?: TProperties[K] extends {
    readonly [fieldKind]: "optional";
    item: infer TItem;
  }
    ? FieldStatic<TItem>
    : never;
};

export type OptionalSchemaStatic<TItem> = FieldStatic<TItem> | undefined;

export type SerializableFieldStatic<TField extends SerializableFieldType> =
  TField extends NumberFieldType
    ? number
    : TField extends StringFieldType
      ? string
      : TField extends BooleanFieldType
        ? boolean
        : TField extends ArrayFieldType<infer TItem>
          ? ArraySchemaStatic<TItem>
          : TField extends RecordFieldType<infer TKey, infer TValue>
            ? RecordSchemaStatic<TKey, TValue>
            : TField extends ObjectFieldType<infer TProperties>
              ? ObjectSchemaStatic<TProperties>
              : TField extends OptionalFieldType<infer TItem>
                ? OptionalSchemaStatic<TItem>
                : never;
