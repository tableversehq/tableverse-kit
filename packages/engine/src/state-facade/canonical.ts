import { Value } from "@sinclair/typebox/value";
import type { TSchema } from "@sinclair/typebox";
import { t, type FieldType, type ObjectFieldType } from "../schema";
import {
  getStateMetadata,
  type GameState,
  type GameStateClass,
} from "./metadata";

type NonFunctionPropertyKeys<TObject> = {
  [K in keyof TObject]: TObject[K] extends (...args: never[]) => unknown
    ? never
    : K;
}[keyof TObject];

// Compile-time view of a facade state as canonical plain data, omitting methods.
export type CanonicalGameState<TState> = TState extends readonly (infer TItem)[]
  ? CanonicalGameState<TItem>[]
  : TState extends object
    ? {
        [K in NonFunctionPropertyKeys<TState>]: CanonicalGameState<TState[K]>;
      }
    : TState;

export function compileCanonicalGameStateSchema(
  root: GameStateClass,
): ObjectFieldType<Record<string, FieldType>> {
  const metadata = getStateMetadata(root);

  return t.object(
    Object.fromEntries(
      Object.entries(metadata.fields).map(([fieldName, field]) => [
        fieldName,
        compileFieldSchema(field),
      ]),
    ),
  );
}

export function createDefaultCanonicalGameState<TState extends GameState>(
  root: GameStateClass<TState>,
): CanonicalGameState<TState> {
  return createCanonicalStateObject(
    root,
    new root(),
  ) as CanonicalGameState<TState>;
}

function createCanonicalStateObject(
  target: GameStateClass,
  source: object,
): object {
  const metadata = getStateMetadata(target);
  const stateName = target.name || "anonymous";

  for (const fieldName of Object.keys(source)) {
    if (metadata.fields[fieldName] === undefined) {
      throw new Error(`undeclared_state_field_value:${stateName}.${fieldName}`);
    }
  }

  return Object.fromEntries(
    Object.entries(metadata.fields).map(([fieldName, field]) => [
      fieldName,
      createCanonicalFieldValue(
        field,
        (source as Record<string, unknown>)[fieldName],
        {
          stateName,
          fieldName,
        },
      ),
    ]),
  );
}

function compileFieldSchema(field: FieldType): FieldType {
  if (field.kind === "state") {
    return compileCanonicalGameStateSchema(field.target());
  }

  if (field.kind === "array") {
    return t.array(compileFieldSchema(field.item));
  }

  if (field.kind === "record") {
    return t.record(field.key, compileFieldSchema(field.value));
  }

  if (field.kind === "object") {
    return t.object(
      Object.fromEntries(
        Object.entries(field.properties).map(([key, value]) => [
          key,
          compileFieldSchema(value),
        ]),
      ),
    );
  }

  if (field.kind === "optional") {
    return t.optional(compileFieldSchema(field.item));
  }

  return field;
}

function createCanonicalFieldValue(
  field: FieldType,
  value: unknown,
  path: {
    stateName: string;
    fieldName: string;
  },
): unknown {
  return assertDefaultFieldSchema(
    field,
    createUncheckedCanonicalFieldValue(field, value, path),
    path,
  );
}

function createUncheckedCanonicalFieldValue(
  field: FieldType,
  value: unknown,
  path: {
    stateName: string;
    fieldName: string;
  },
): unknown {
  if (field.kind === "state") {
    const source = value === undefined ? new (field.target())() : value;
    assertDefaultFieldObject(source, path, "object");
    return createCanonicalStateObject(field.target(), source as object);
  }

  if (field.kind === "optional") {
    if (value === undefined) {
      return undefined;
    }

    return createCanonicalFieldValue(field.item, value, path);
  }

  if (value === undefined) {
    throw new Error(
      `missing_default_field_value:${path.stateName}.${path.fieldName}`,
    );
  }

  if (field.kind === "array") {
    if (!Array.isArray(value)) {
      throwInvalidDefaultFieldShape(path, "array");
    }

    return value.map((item) =>
      createCanonicalFieldValue(field.item, item, path),
    );
  }

  if (field.kind === "record") {
    assertDefaultFieldObject(value, path, "object");
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => {
        assertDefaultRecordKey(field.key, key, path);
        return [key, createCanonicalFieldValue(field.value, item, path)];
      }),
    );
  }

  if (field.kind === "object") {
    assertDefaultFieldObject(value, path, "object");
    return Object.fromEntries(
      Object.entries(field.properties).map(([key, nestedField]) => [
        key,
        createCanonicalFieldValue(
          nestedField,
          (value as Record<string, unknown>)[key],
          {
            stateName: `${path.stateName}.${path.fieldName}`,
            fieldName: key,
          },
        ),
      ]),
    );
  }

  return structuredClone(value);
}

function assertDefaultFieldSchema(
  field: FieldType,
  value: unknown,
  path: {
    stateName: string;
    fieldName: string;
  },
): unknown {
  if (field.kind === "optional" && value === undefined) {
    return value;
  }

  const schema = compileFieldSchema(field) as TSchema;

  if (Value.Check(schema, value)) {
    return value;
  }

  const firstError = Value.Errors(schema, value).First();
  const errorPath = firstError?.path || "/";
  throw new Error(
    `invalid_default_field_value:${path.stateName}.${path.fieldName}:${errorPath}`,
  );
}

function assertDefaultRecordKey(
  keyField: FieldType,
  key: string,
  path: {
    stateName: string;
    fieldName: string;
  },
): void {
  if (keyField.kind === "number" && !isNumericRecordKey(key)) {
    throwInvalidDefaultRecordKey(path, key, "number");
  }

  if (keyField.kind === "boolean" && key !== "true" && key !== "false") {
    throwInvalidDefaultRecordKey(path, key, "boolean");
  }
}

function isNumericRecordKey(key: string): boolean {
  if (key.trim() === "") {
    return false;
  }

  return Number.isFinite(Number(key));
}

function assertDefaultFieldObject(
  value: unknown,
  path: {
    stateName: string;
    fieldName: string;
  },
  expected: "object",
): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throwInvalidDefaultFieldShape(path, expected);
  }
}

function throwInvalidDefaultFieldShape(
  path: {
    stateName: string;
    fieldName: string;
  },
  expected: "array" | "object",
): never {
  throw new Error(
    `invalid_default_field_shape:${path.stateName}.${path.fieldName}:${expected}`,
  );
}

function throwInvalidDefaultRecordKey(
  path: {
    stateName: string;
    fieldName: string;
  },
  key: string,
  expected: "number" | "boolean",
): never {
  throw new Error(
    `invalid_default_record_key:${path.stateName}.${path.fieldName}:${key}:${expected}`,
  );
}
