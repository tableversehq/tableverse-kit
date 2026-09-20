import type {
  SerializedSetupField,
  SerializedSetupSchema,
} from "@tableverse-kit/engine";

export type FieldValue = string | boolean;
export type FormValues = Record<string, FieldValue>;

export class SetupInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SetupInputError";
  }
}

export function buildSetupInput(
  schema: SerializedSetupSchema,
  values: FormValues,
): Record<string, unknown> {
  return buildObject(schema.fields, values, "");
}

export function fieldPath(parent: string, name: string): string {
  return parent ? `${parent}.${name}` : name;
}

export function humanize(name: string): string {
  const spaced = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function buildObject(
  fields: Record<string, SerializedSetupField>,
  values: FormValues,
  parent: string,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).flatMap(([name, field]) => {
      const value = buildField(field, values, fieldPath(parent, name), name);
      return value === undefined ? [] : [[name, value]];
    }),
  );
}

function buildField(
  field: SerializedSetupField,
  values: FormValues,
  path: string,
  name: string,
): unknown {
  if (field.kind === "object") {
    return buildObject(field.fields, values, path);
  }

  const raw = values[path];
  if (raw === undefined || raw === "") {
    if (field.optional) {
      return undefined;
    }
    if (field.kind === "boolean") {
      return false;
    }
    throw new SetupInputError(`${humanize(name)} is required.`);
  }

  if (field.kind === "boolean") {
    return raw === true;
  }

  const text = String(raw);
  if (field.kind === "number") {
    const number = Number(text);
    if (!Number.isFinite(number)) {
      throw new SetupInputError(`${humanize(name)} must be a number.`);
    }
    return number;
  }

  if (field.kind === "array" || field.kind === "record") {
    try {
      const parsed: unknown = JSON.parse(text);
      return parsed;
    } catch {
      throw new SetupInputError(`${humanize(name)} must be valid JSON.`);
    }
  }

  return text;
}
