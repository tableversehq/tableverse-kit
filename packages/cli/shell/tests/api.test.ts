import { describe, expect, it } from "vitest";
import { isGameInfo } from "../src/lib/api.ts";

const game = {
  name: "splendor",
  playerBounds: { min: 2, max: 4 },
  players: ["p1", "p2"],
  setupInputSchema: {
    kind: "object",
    fields: {
      targetScore: { kind: "number", min: 1 },
      variant: { kind: "string", enum: ["classic", "quick"], optional: true },
      board: { kind: "object", fields: { wrap: { kind: "boolean" } } },
      decks: { kind: "array", item: { kind: "string" } },
      handicaps: { kind: "record", value: { kind: "number" } },
    },
  },
};

describe("isGameInfo", () => {
  it("accepts the rules server's game description", () => {
    expect(isGameInfo(game)).toBe(true);
    expect(isGameInfo({ ...game, setupInputSchema: null })).toBe(true);
  });

  it("rejects a setup field of an unknown kind", () => {
    expect(
      isGameInfo({
        ...game,
        setupInputSchema: {
          kind: "object",
          fields: { when: { kind: "date" } },
        },
      }),
    ).toBe(false);
  });

  it("rejects an enum whose values do not match the field kind", () => {
    expect(
      isGameInfo({
        ...game,
        setupInputSchema: {
          kind: "object",
          fields: { size: { kind: "number", enum: ["large"] } },
        },
      }),
    ).toBe(false);
  });

  it("rejects a description without player bounds", () => {
    expect(isGameInfo({ name: "splendor", setupInputSchema: null })).toBe(
      false,
    );
  });
});
