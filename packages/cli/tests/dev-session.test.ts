import { describe, expect, it } from "vitest";
import { DevSession } from "../src/lib/dev-server/session.ts";
import createFixtureGame from "./fixtures/game-default.ts";
import createSetupFixtureGame from "./fixtures/game-setup.ts";

describe("DevSession", () => {
  it("describes the game before a match exists", () => {
    const session = new DevSession(createFixtureGame());

    const description = session.describe();

    expect(description.name).toBe(createFixtureGame().name);
    expect(description.playerBounds).toEqual({ min: 2, max: 5 });
    expect(description.setupInputSchema).toBeNull();
    expect(session.initialized).toBe(false);
  });

  it("seats the smallest roster the game accepts by default", () => {
    const session = new DevSession(createFixtureGame());

    expect(session.players).toEqual(["p1", "p2"]);
  });

  it("reports the seated roster once a match exists", () => {
    const session = new DevSession(createFixtureGame());

    session.initialize({ players: ["a", "b"] });

    expect(session.players).toEqual(["a", "b"]);
  });

  it("starts a new match on every initialize", () => {
    const session = new DevSession(createFixtureGame());

    session.initialize({ players: ["a", "b"], seed: "one" });
    const firstVersion = session.version;
    session.initialize({ players: ["c", "d"], seed: "two" });

    expect(session.players).toEqual(["c", "d"]);
    expect(session.version).toBe(firstVersion);
  });

  it("returns to uninitialized on reset", () => {
    const session = new DevSession(createFixtureGame());

    session.initialize({ players: ["a", "b"] });
    session.reset();

    expect(session.initialized).toBe(false);
    expect(session.players).toEqual(["p1", "p2"]);
  });

  it("describes setup input in its serialized form", () => {
    const session = new DevSession(createSetupFixtureGame());

    expect(session.describe().setupInputSchema).toEqual({
      kind: "object",
      fields: { targetScore: { kind: "number", min: 1 } },
    });
  });
});
