import { describe, expect, it } from "vitest";
import {
  loadStoredValues,
  saveStoredValues,
  type ValueStore,
} from "../src/lib/stored-values.ts";

function memoryStore(initial: Record<string, string> = {}): ValueStore {
  const entries = new Map(Object.entries(initial));
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
}

const values = { seats: 3, seed: "demo", setup: { targetScore: "15" } };

describe("stored values", () => {
  it("returns what was saved for the same game", () => {
    const store = memoryStore();

    saveStoredValues(store, "splendor", values);

    expect(loadStoredValues(store, "splendor")).toEqual(values);
    expect(loadStoredValues(store, "other")).toBeNull();
  });

  it("ignores an entry that is not the stored shape", () => {
    const store = memoryStore({
      "tvk-dev:setup:splendor": JSON.stringify({ seats: "three" }),
    });

    expect(loadStoredValues(store, "splendor")).toBeNull();
  });

  it("ignores an entry that is not JSON", () => {
    const store = memoryStore({ "tvk-dev:setup:splendor": "{" });

    expect(loadStoredValues(store, "splendor")).toBeNull();
  });

  it("carries on when the store refuses access", () => {
    const store: ValueStore = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };

    expect(() => saveStoredValues(store, "splendor", values)).not.toThrow();
    expect(loadStoredValues(store, "splendor")).toBeNull();
  });
});
