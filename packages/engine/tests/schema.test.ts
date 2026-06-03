import { expect, test } from "bun:test";
import { createCommandFactory } from "../src/command-factory";
import {
  configureVisibility,
  field,
  GameState,
  getStateMetadata,
  t,
} from "../src/state-facade/metadata";
import { assertSerializableSchema } from "../src/schema";
import { assertSchemaValue } from "../src/runtime/validation";
import type { CommandSchema } from "../src/types/command";

type ExtendedSchemaApi = typeof t & {
  object: (properties: Record<string, unknown>) => unknown;
  optional: (item: unknown) => unknown;
  array: (item: unknown) => unknown;
  record: (key: unknown, value: unknown) => unknown;
};

class ObjectFieldState extends GameState {
  @field(
    (t as ExtendedSchemaApi).object({
      count: t.number(),
      label: (t as ExtendedSchemaApi).optional(t.string()),
    }) as never,
  )
  summary!: {
    count: number;
    label?: string;
  };
}

test("schema api exposes shared object and optional builders", () => {
  const schemaApi = t as Partial<ExtendedSchemaApi>;

  expect(typeof schemaApi.object).toBe("function");
  expect(typeof schemaApi.optional).toBe("function");
});

test("schema static types can be derived directly from the schema object", () => {
  const commandSchema = (t as ExtendedSchemaApi).object({
    amount: (t as ExtendedSchemaApi).optional(t.number()),
  }) as {
    static: {
      amount?: number;
    };
  };

  const withAmount: typeof commandSchema.static = {
    amount: 2,
  };
  const withoutAmount: typeof commandSchema.static = {};

  expect(commandSchema).toBeDefined();
  expect(withAmount.amount).toBe(2);
  expect(withoutAmount.amount).toBeUndefined();
});

test("serializable fields are TypeBox schemas with engine metadata", () => {
  const numberField = t.number();
  const objectField = t.object({
    count: numberField,
  });

  expect(numberField).toMatchObject({
    type: "number",
    kind: "number",
  });
  expect("schema" in numberField).toBe(false);

  expect(objectField).toMatchObject({
    type: "object",
    kind: "object",
    properties: {
      count: numberField,
    },
  });
  expect(objectField.properties.count).toBe(numberField);
  expect("schema" in objectField).toBe(false);
});

test("state metadata can consume object schemas through field decorators", () => {
  const metadata = getStateMetadata(ObjectFieldState);

  expect(metadata.fields.summary).toMatchObject({
    kind: "object",
    properties: {
      count: {
        kind: "number",
      },
      label: {
        kind: "optional",
        item: {
          kind: "string",
        },
      },
    },
  });
});

class NestedSerializableChildState extends GameState {
  @field(t.number())
  count!: number;
}

test("serializable schema validation rejects nested state fields", () => {
  expect(() =>
    assertSerializableSchema(
      (t as ExtendedSchemaApi).object({
        child: t.state(() => NestedSerializableChildState),
      }) as never,
    ),
  ).toThrow("state_field_not_allowed_in_serializable_schema");
  expect(() =>
    assertSerializableSchema(
      (t as ExtendedSchemaApi).array(
        t.state(() => NestedSerializableChildState),
      ) as never,
    ),
  ).toThrow("state_field_not_allowed_in_serializable_schema");
  expect(() =>
    assertSerializableSchema(
      (t as ExtendedSchemaApi).optional(
        t.state(() => NestedSerializableChildState),
      ) as never,
    ),
  ).toThrow("state_field_not_allowed_in_serializable_schema");
  expect(() =>
    assertSerializableSchema(
      (t as ExtendedSchemaApi).record(
        t.string(),
        t.state(() => NestedSerializableChildState),
      ) as never,
    ),
  ).toThrow("state_field_not_allowed_in_serializable_schema");
});

test("schema value validation rejects invalid nested values", () => {
  const runtimeSchema = t.object({
    count: t.number(),
    label: t.optional(t.string()),
    names: t.array(t.string()),
    scores: t.record(t.string(), t.number()),
    summary: t.object({
      active: t.boolean(),
    }),
  });

  expect(() =>
    assertSchemaValue(runtimeSchema, {
      count: 1,
      names: ["alpha", "beta"],
      scores: {
        p1: 3,
      },
      summary: {
        active: true,
      },
    }),
  ).not.toThrow();

  expect(() =>
    assertSchemaValue(runtimeSchema, {
      count: "one",
      names: ["alpha", "beta"],
      scores: {
        p1: 3,
      },
      summary: {
        active: true,
      },
    }),
  ).toThrow("invalid_schema_value");

  expect(() =>
    assertSchemaValue(runtimeSchema, {
      count: 1,
      names: ["alpha", 2],
      scores: {
        p1: 3,
      },
      summary: {
        active: true,
      },
    }),
  ).toThrow("invalid_schema_value");

  expect(() =>
    assertSchemaValue(runtimeSchema, {
      count: 1,
      names: ["alpha"],
      scores: {
        p1: "three",
      },
      summary: {
        active: true,
      },
    }),
  ).toThrow("invalid_schema_value");

  expect(() =>
    assertSchemaValue(runtimeSchema, {
      count: 1,
      names: ["alpha"],
      scores: {
        p1: 3,
      },
      summary: {
        active: true,
        extra: "invalid",
      },
    }),
  ).toThrow("invalid_schema_value");
});

test("command schemas reject nested state transport fields at definition time", () => {
  const defineCommand = createCommandFactory<GameState>();
  const invalidTransportSchema = (t as ExtendedSchemaApi).object({
    child: t.state(() => NestedSerializableChildState),
  }) as never as CommandSchema<{
    child: {
      count: number;
    };
  }>;

  expect(() =>
    defineCommand({
      commandId: "invalid_command",
      commandSchema: invalidTransportSchema,
    }),
  ).toThrow("state_field_not_allowed_in_serializable_schema");
});

test("discovery schemas reject nested state transport fields at definition time", () => {
  const defineCommand = createCommandFactory<GameState>();
  const invalidTransportSchema = (t as ExtendedSchemaApi).object({
    child: t.state(() => NestedSerializableChildState),
  }) as never as CommandSchema<{
    child: {
      count: number;
    };
  }>;

  expect(() =>
    defineCommand({
      commandId: "invalid_discovery_command",
      commandSchema: t.object({}),
    }).discoverable((step) => [
      step("invalid_step")
        .initial()
        .input(invalidTransportSchema)
        .output(t.object({}))
        .resolve(() => [])
        .build(),
    ]),
  ).toThrow("state_field_not_allowed_in_serializable_schema");
});

test("visibility schemas reject nested state transport fields", () => {
  expect(() => {
    class InvalidHiddenSummaryState extends GameState {
      @field(t.array(t.number()))
      cards!: number[];
    }

    configureVisibility(InvalidHiddenSummaryState, ({ field }) => ({
      fields: [
        field.cards.hidden({
          schema: (t as ExtendedSchemaApi).object({
            child: t.state(() => NestedSerializableChildState),
          }) as never,
          derive() {
            return {
              child: {
                count: 1,
              },
            };
          },
        } as never),
      ],
    }));

    return InvalidHiddenSummaryState;
  }).toThrow("state_field_not_allowed_in_serializable_schema");

  expect(() => {
    class InvalidVisibleToSelfSummaryState extends GameState {
      @field(t.string())
      id!: string;

      @field(t.array(t.number()))
      cards!: number[];
    }

    configureVisibility(InvalidVisibleToSelfSummaryState, ({ field }) => ({
      ownedBy: field.id,
      fields: [
        field.cards.visibleToSelf({
          schema: (t as ExtendedSchemaApi).object({
            child: t.state(() => NestedSerializableChildState),
          }) as never,
          derive() {
            return {
              child: {
                count: 1,
              },
            };
          },
        } as never),
      ],
    }));

    return InvalidVisibleToSelfSummaryState;
  }).toThrow("state_field_not_allowed_in_serializable_schema");
});
