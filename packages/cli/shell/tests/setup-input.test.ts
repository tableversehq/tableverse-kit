import type { SerializedSetupSchema } from "@tableverse-kit/engine";
import { describe, expect, it } from "vitest";
import {
  SetupInputError,
  buildSetupInput,
  humanize,
} from "../src/lib/setup-input.ts";

const schema: SerializedSetupSchema = {
  kind: "object",
  fields: {
    targetScore: { kind: "number", min: 1 },
    variant: { kind: "string", enum: ["classic", "quick"] },
    nickname: { kind: "string", optional: true },
    expansions: { kind: "boolean" },
    board: {
      kind: "object",
      fields: {
        rows: { kind: "number" },
        wrap: { kind: "boolean", optional: true },
      },
    },
    decks: { kind: "array", item: { kind: "string" } },
    handicaps: { kind: "record", value: { kind: "number" }, optional: true },
  },
};

const complete = {
  targetScore: "15",
  variant: "quick",
  expansions: true,
  "board.rows": "4",
  decks: '["base", "promo"]',
};

describe("buildSetupInput", () => {
  it("converts every field kind into its value", () => {
    expect(buildSetupInput(schema, complete)).toEqual({
      targetScore: 15,
      variant: "quick",
      expansions: true,
      board: { rows: 4 },
      decks: ["base", "promo"],
    });
  });

  it("omits optional fields left empty", () => {
    const input = buildSetupInput(schema, {
      ...complete,
      nickname: "",
    });

    expect(input).not.toHaveProperty("nickname");
    expect(input).not.toHaveProperty("handicaps");
  });

  it("keeps optional fields that were filled in", () => {
    const input = buildSetupInput(schema, {
      ...complete,
      nickname: "ada",
      handicaps: '{"p2": 3}',
    });

    expect(input).toMatchObject({ nickname: "ada", handicaps: { p2: 3 } });
  });

  it("reads an unticked boolean as false", () => {
    expect(
      buildSetupInput(schema, { ...complete, expansions: false }),
    ).toMatchObject({ expansions: false });
  });

  it("names a required field left empty", () => {
    const missing = { ...complete, targetScore: "" };

    expect(() => buildSetupInput(schema, missing)).toThrow(
      new SetupInputError("Target Score is required."),
    );
  });

  it("names a nested required field left empty", () => {
    const missing = { ...complete, "board.rows": "" };

    expect(() => buildSetupInput(schema, missing)).toThrow(
      new SetupInputError("Rows is required."),
    );
  });

  it("rejects a number that does not parse", () => {
    expect(() =>
      buildSetupInput(schema, { ...complete, targetScore: "lots" }),
    ).toThrow(new SetupInputError("Target Score must be a number."));
  });

  it("rejects JSON that does not parse", () => {
    expect(() =>
      buildSetupInput(schema, { ...complete, decks: "[base" }),
    ).toThrow(new SetupInputError("Decks must be valid JSON."));
  });
});

describe("humanize", () => {
  it("spaces camel case and separators", () => {
    expect(humanize("targetScore")).toBe("Target Score");
    expect(humanize("max_hand-size")).toBe("Max hand size");
  });
});
