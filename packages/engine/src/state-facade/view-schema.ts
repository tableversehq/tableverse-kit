import { Type, type TSchema } from "@sinclair/typebox";
import type { FieldType, SerializableFieldType } from "../schema";
import type { StateVisibilityEntry } from "../state/game-state";
import type {
  CompiledStateDefinition,
  CompiledStateFacadeDefinition,
} from "./compile";

export function compileVisibleStateSchema(
  compiled: CompiledStateFacadeDefinition,
): TSchema {
  return Type.Object({
    game: inferStateViewSchema(compiled, compiled.root),
    progression: progressionStateSchema,
  });
}

function inferStateViewSchema(
  compiled: CompiledStateFacadeDefinition,
  stateDefinition: CompiledStateFacadeDefinition["root"],
): TSchema {
  const state = compiled.states.get(stateDefinition);

  if (!state) {
    throw new Error(
      `compiled_state_not_found:${stateDefinition.stateClass.name || "anonymous"}`,
    );
  }

  return Type.Object(
    Object.fromEntries(
      Object.entries(state.model).map(([fieldName, fieldType]) => {
        const fieldVisibility = findFieldVisibility(state, fieldName);

        return [
          fieldName,
          inferFieldViewSchema(compiled, fieldType, fieldVisibility),
        ];
      }),
    ),
  );
}

function inferFieldViewSchema(
  compiled: CompiledStateFacadeDefinition,
  fieldType: FieldType,
  fieldVisibility: StateVisibilityEntry | undefined,
): TSchema {
  const visibleSchema = inferVisibleFieldSchema(compiled, fieldType);
  const hiddenSchema = inferHiddenEnvelopeSchema(
    fieldVisibility?.kind === "field" ? fieldVisibility.schema : undefined,
  );

  if (fieldVisibility?.kind !== "field") {
    return visibleSchema;
  }

  if (fieldVisibility.mode === "hidden") {
    return hiddenSchema;
  }

  return Type.Union([visibleSchema, hiddenSchema]);
}

function inferVisibleFieldSchema(
  compiled: CompiledStateFacadeDefinition,
  fieldType: FieldType,
): TSchema {
  if (fieldType.kind === "state") {
    return inferStateViewSchema(compiled, fieldType.target);
  }

  if (fieldType.kind === "array") {
    return Type.Array(inferVisibleFieldSchema(compiled, fieldType.item));
  }

  if (fieldType.kind === "record") {
    return Type.Record(
      inferRecordKeySchema(fieldType.key),
      inferVisibleFieldSchema(compiled, fieldType.value),
    );
  }

  if (fieldType.kind === "object") {
    return Type.Object(
      Object.fromEntries(
        Object.entries(fieldType.properties).map(([key, nestedField]) => [
          key,
          inferVisibleFieldSchema(compiled, nestedField),
        ]),
      ),
    );
  }

  if (fieldType.kind === "optional") {
    return Type.Optional(inferVisibleFieldSchema(compiled, fieldType.item));
  }

  return toTypeBoxSchema(fieldType);
}

function findFieldVisibility(
  state: CompiledStateDefinition,
  fieldName: string,
): StateVisibilityEntry | undefined {
  return state.visibility.find(
    (entry) => entry.kind === "field" && entry.fieldName === fieldName,
  );
}

function inferRecordKeySchema(fieldType: FieldType): TSchema {
  if (fieldType.kind === "string") {
    return fieldType;
  }

  return Type.String();
}

function toTypeBoxSchema(schema: SerializableFieldType | FieldType): TSchema {
  if (schema.kind === "state") {
    return Type.Unknown();
  }

  return schema;
}

function inferHiddenEnvelopeSchema(schema?: SerializableFieldType): TSchema {
  if (!schema) {
    return hiddenEnvelopeSchema;
  }

  return Type.Object({
    __hidden: Type.Literal(true),
    value: toTypeBoxSchema(schema),
  });
}

const hiddenEnvelopeSchema = Type.Object({
  __hidden: Type.Literal(true),
});

const progressionSegmentSchema = Type.Object({
  id: Type.String(),
  kind: Type.Optional(Type.String()),
  parentId: Type.Optional(Type.String()),
  childIds: Type.Array(Type.String()),
  active: Type.Boolean(),
  ownerId: Type.Optional(Type.String()),
});

const progressionStateSchema = Type.Object({
  current: Type.Union([Type.String(), Type.Null()]),
  rootId: Type.Union([Type.String(), Type.Null()]),
  segments: Type.Record(Type.String(), progressionSegmentSchema),
});
