import { Type, type TSchema } from "@sinclair/typebox";
import type {
  ArrayFieldType,
  BooleanFieldType,
  FieldType,
  NestedStateFieldType,
  NumberFieldType,
  ObjectFieldType,
  OptionalFieldType,
  PrimitiveFieldType,
  RecordFieldType,
  StateFieldTargetFactory,
  StringFieldType,
} from "./types";
import { fieldKind } from "./types";

export type {
  ArraySchemaStatic,
  ArrayFieldType,
  BooleanFieldType,
  FieldType,
  NestedStateFieldType,
  NumberFieldType,
  ObjectSchemaStatic,
  ObjectFieldType,
  OptionalSchemaStatic,
  OptionalFieldType,
  PrimitiveFieldType,
  RecordSchemaStatic,
  SerializableFieldStatic,
  RecordFieldType,
  SerializableFieldType,
  StateFieldTargetFactory,
  StringFieldType,
} from "./types";

function toTypeBoxSchema(field: FieldType): TSchema {
  if (field.kind === "state") {
    return Type.Unknown();
  }

  // Serializable fields are constructed by `t` as TypeBox schemas with engine
  // metadata attached, so they can be passed directly to TypeBox consumers.
  return field as TSchema;
}

export function assertSerializableSchema(
  schema:
    | FieldType
    | {
        kind: "object";
        properties: Record<string, FieldType>;
      },
): void {
  if (schema.kind === "state") {
    throw new Error("state_field_not_allowed_in_serializable_schema");
  }

  if (schema.kind === "array") {
    assertSerializableSchema(schema.item as FieldType);
    return;
  }

  if (schema.kind === "record") {
    assertSerializableSchema(schema.value as FieldType);
    return;
  }

  if (schema.kind === "object") {
    for (const nestedField of Object.values(schema.properties)) {
      assertSerializableSchema(nestedField as FieldType);
    }
    return;
  }

  if (schema.kind === "optional") {
    assertSerializableSchema(schema.item as FieldType);
  }
}

export const t = {
  number(): NumberFieldType {
    return Object.assign(Type.Number(), {
      [fieldKind]: "number" as const,
      kind: "number" as const,
    });
  },

  string(): StringFieldType {
    return Object.assign(Type.String(), {
      [fieldKind]: "string" as const,
      kind: "string" as const,
    });
  },

  boolean(): BooleanFieldType {
    return Object.assign(Type.Boolean(), {
      [fieldKind]: "boolean" as const,
      kind: "boolean" as const,
    });
  },

  object<TProperties extends Record<string, FieldType>>(
    properties: TProperties,
  ): ObjectFieldType<TProperties> {
    return Object.assign(
      Type.Object(
        Object.fromEntries(
          Object.entries(properties).map(([key, value]) => [
            key,
            toTypeBoxSchema(value),
          ]),
        ),
        { additionalProperties: false },
      ),
      {
        [fieldKind]: "object" as const,
        kind: "object" as const,
        properties,
      },
      // The runtime object is a TypeBox schema plus engine metadata. The cast
      // supplies TypeBox-style phantom `static` metadata for compile-time use.
    ) as unknown as ObjectFieldType<TProperties>;
  },

  optional<TItem extends FieldType>(item: TItem): OptionalFieldType<TItem> {
    return Object.assign(Type.Optional(toTypeBoxSchema(item)), {
      [fieldKind]: "optional" as const,
      kind: "optional" as const,
      item,
    }) as unknown as OptionalFieldType<TItem>;
  },

  state(target: StateFieldTargetFactory): NestedStateFieldType {
    return {
      [fieldKind]: "state",
      kind: "state",
      target,
    };
  },

  array<TItem extends FieldType>(item: TItem): ArrayFieldType<TItem> {
    return Object.assign(Type.Array(toTypeBoxSchema(item)), {
      [fieldKind]: "array" as const,
      kind: "array" as const,
      item,
    }) as ArrayFieldType<TItem>;
  },

  record<TKey extends PrimitiveFieldType, TValue extends FieldType>(
    key: TKey,
    value: TValue,
  ): RecordFieldType<TKey, TValue> {
    return Object.assign(
      Type.Record(toTypeBoxRecordKeySchema(key), toTypeBoxSchema(value)),
      {
        [fieldKind]: "record" as const,
        kind: "record" as const,
        key,
        value,
      },
    ) as unknown as RecordFieldType<TKey, TValue>;
  },
};

function toTypeBoxRecordKeySchema(key: PrimitiveFieldType): TSchema {
  if (key.kind === "string") {
    return key;
  }

  return Type.String();
}
