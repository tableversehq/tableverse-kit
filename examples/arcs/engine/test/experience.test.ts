import { describe, it, expect } from "vitest";
import type { RNGApi } from "@tableverse-kit/engine";
import { actionDeck, courtCard } from "../src/data.ts";
import { cloneGame } from "../src/rules.ts";
import {
  actionPhase,
  add,
  command,
  court,
  fixture,
  fixedRng,
  own,
} from "./helpers.ts";

function dice(...faces: number[]): RNGApi {
  let index = 0;
  return { ...fixedRng, number: () => ((faces[index++] ?? 5) + 0.1) / 6 };
}
function ownCity(g: ReturnType<typeof fixture>, id = "p1") {
  return g.pieces.find((p) => p.owner === id && p.kind === "city")!;
}

describe("gained resources", () => {
  it("fill the leftmost open slots without asking", () => {
    const g = fixture();
    actionPhase(g, "administration");
    const city = ownCity(g),
      resource = g.system(city.system).resource;
    g.player("p1").resources = ["", "fuel", "", "", "", ""];
    command(g, { op: "tax", target: city.id });
    expect(g.player("p1").resources).toEqual([
      resource,
      "fuel",
      "",
      "",
      "",
      "",
    ]);
    expect(g.pending).toEqual([]);
  });
  it("ask which to keep only when they overflow", () => {
    const g = fixture();
    actionPhase(g, "administration");
    const city = ownCity(g),
      resource = g.system(city.system).resource;
    g.player("p1").resources = ["fuel", "weapon", "relic", "", "", ""];
    command(g, { op: "tax", target: city.id });
    expect(g.pending[0]).toMatchObject({
      kind: "resources",
      actor: "p1",
      data: [resource],
    });
    command(g, {
      op: "choose",
      values: [resource, "weapon", "relic", "", "", ""],
    });
    expect(g.log.at(-1)).toBe("p1 discarded fuel.");
  });
  it("steal by raid straight into an open slot", () => {
    const g = fixture();
    actionPhase(g, "aggression");
    g.pieces = [];
    for (const p of g.players) p.resources = ["", "", "", "", "", ""];
    g.player("p2").resources = ["", "fuel", "", "", "", ""];
    add(g, "p1", "ship", "3g");
    add(g, "p2", "ship", "3g", true);
    command(g, { op: "battle", system: "3g", target: "p2", raid: 1 }, dice(0));
    expect(g.battle[0]?.step).toBe("raid");
    command(g, { op: "raid", slot: 1 });
    expect(g.player("p1").resources[0]).toBe("fuel");
    expect(g.pending).toEqual([]);
    expect(g.log).toContain("p1 stole fuel from p2.");
  });
  it("discard a single overflowing type without asking", () => {
    const g = fixture();
    g.pieces = g.pieces.filter((p) => p.owner !== "p1" || p.kind !== "city");
    g.player("p1").resources = ["fuel", "fuel", "fuel", "", "", ""];
    const before = g.supply.fuel!;
    for (let n = 0; n < 3; n++) command(g, { op: "pass" });
    expect(g.chapter).toBe(2);
    expect(g.player("p1").resources).toEqual(["fuel", "fuel", "", "", "", ""]);
    expect(g.supply.fuel).toBe(before + 1);
    expect(g.log).toContain("p1 discarded fuel.");
  });
});
describe("automatic turn end", () => {
  it("ends the turn when the last pip is spent", () => {
    const g = fixture();
    actionPhase(g);
    g.pips = 1;
    const city = ownCity(g);
    city.damaged = true;
    command(g, { op: "repair", target: city.id });
    expect(g.active).toBe("p2");
    expect(g.phase).toBe("card");
    expect(g.acted).toEqual(["p1"]);
  });
  it("keeps the turn open while pips remain, and end still works early", () => {
    const g = fixture();
    actionPhase(g);
    g.pips = 2;
    const city = ownCity(g);
    city.damaged = true;
    command(g, { op: "repair", target: city.id });
    expect(g.active).toBe("p1");
    command(g, { op: "end" });
    expect(g.active).toBe("p2");
  });
  it("waits for the battle to resolve before ending", () => {
    const g = fixture();
    actionPhase(g, "aggression");
    g.pips = 1;
    g.pieces = [];
    add(g, "p1", "ship", "3g");
    add(g, "p1", "starport", "3.3");
    const d = add(g, "p2", "ship", "3g");
    command(
      g,
      { op: "battle", system: "3g", target: "p2", skirmish: 1 },
      dice(0),
    );
    expect(g.active).toBe("p1");
    command(g, { op: "hit", target: d.id });
    expect(g.battle).toEqual([]);
    expect(g.active).toBe("p2");
  });
  it("asks to regroup when the last pip leaves no ships or ports", () => {
    const g = fixture();
    actionPhase(g);
    g.pips = 1;
    g.pieces = g.pieces.filter((p) => p.owner !== "p1" || p.kind === "city");
    const city = ownCity(g);
    city.damaged = true;
    command(g, { op: "repair", target: city.id });
    expect(g.pending.map((p) => p.kind)).toEqual(["regroup", "finish-turn"]);
    command(g, { op: "choose", system: "3g" });
    expect(g.at("3g", "p1", "ship")).toHaveLength(3);
    expect(g.active).toBe("p2");
    expect(g.pending).toEqual([]);
  });
});
describe("log", () => {
  it("records standard actions with raw ids", () => {
    const g = fixture();
    actionPhase(g, "administration");
    const city = ownCity(g),
      resource = g.system(city.system).resource;
    command(g, { op: "tax", target: city.id });
    command(g, { op: "influence", card: g.court[0]!.id });
    expect(g.log.slice(-2)).toEqual([
      `p1 taxed ${city.system} (+${resource}).`,
      `p1 influenced ${courtCard(g.court[0]!.id).name}.`,
    ]);
  });
  it("notes captured agents, damaged builds, and battle hits", () => {
    const g = fixture();
    actionPhase(g, "administration");
    g.pieces = [];
    const city = add(g, "p2", "city", "3.1");
    add(g, "p1", "ship", "3.1");
    g.supply[g.system("3.1").resource] = 0;
    command(g, { op: "tax", target: city.id });
    expect(g.log.at(-1)).toBe("p1 taxed 3.1, capturing an agent of p2.");
    actionPhase(g);
    add(g, "p2", "ship", "3.3");
    add(g, "p1", "ship", "3.3", true);
    command(g, { op: "build", kind: "city", system: "3.3" });
    expect(g.log.at(-1)).toBe("p1 built a city in 3.3 (damaged).");
    actionPhase(g, "aggression");
    command(
      g,
      { op: "battle", system: "3.1", target: "p2", assault: 1 },
      dice(0),
    );
    command(g, { op: "hit", target: city.id });
    expect(g.log.at(-1)).toBe("p1 damaged p2's city in 3.1.");
  });
  it("credits self-inflicted battle hits to the attacker's own dice", () => {
    const g = fixture();
    actionPhase(g, "aggression");
    g.pieces = [];
    add(g, "p2", "ship", "3.1");
    const mine = add(g, "p1", "ship", "3.1");
    add(g, "p1", "ship", "3.1");
    command(
      g,
      { op: "battle", system: "3.1", target: "p2", assault: 1 },
      dice(1),
    );
    expect(g.battle[0]?.step).toBe("self");
    command(g, { op: "hit", target: mine.id });
    expect(g.log.at(-1)).toBe("p1's own dice damaged their ship in 3.1.");
  });
  it("opens a rearrange window after gaining, until the next action", () => {
    const g = fixture();
    actionPhase(g, "administration");
    g.pips = 2;
    const city = ownCity(g),
      resource = g.system(city.system).resource;
    g.player("p1").resources = ["", "fuel", "", "", "", ""];
    command(g, { op: "tax", target: city.id });
    expect(g.rearrange).toEqual(["p1"]);
    command(g, { op: "arrange", values: ["", "fuel", resource, "", "", ""] });
    expect(g.player("p1").resources).toEqual([
      "",
      "fuel",
      resource,
      "",
      "",
      "",
    ]);
    expect(() =>
      command(g, { op: "arrange", values: ["fuel", "fuel", "", "", "", ""] }),
    ).toThrow("invalid_arrangement");
    command(g, { op: "end" });
    expect(g.rearrange).toEqual([]);
  });
  it("waits for the player when the last action gained a resource", () => {
    const g = fixture();
    actionPhase(g, "administration");
    g.pips = 1;
    const city = ownCity(g);
    g.player("p1").resources = ["", "", "", "", "", ""];
    command(g, { op: "tax", target: city.id });
    expect(g.active).toBe("p1");
    expect(g.rearrange).toEqual(["p1"]);
    command(g, { op: "end" });
    expect(g.active).not.toBe("p1");
  });
  it("refuses rearranging without a fresh gain", () => {
    const g = fixture();
    actionPhase(g);
    expect(() =>
      command(g, { op: "arrange", values: g.player("p1").resources }),
    ).toThrow("rearrange_only_after_gaining");
  });
  it("notes initiative passing", () => {
    const g = fixture();
    command(g, { op: "pass" });
    expect(g.log.at(-1)).toBe("p1 passed initiative to p2.");
  });
  it("keeps the last 200 entries", () => {
    const g = fixture();
    for (let n = 0; n < 250; n++) g.note(`${n}.`);
    expect(g.log).toHaveLength(200);
    expect(g.log[0]).toBe("50.");
  });
});
describe("battle rolls", () => {
  it("keeps the last roll visible after the battle ends", () => {
    const g = fixture();
    actionPhase(g, "aggression");
    g.pieces = [];
    add(g, "p1", "ship", "3g");
    const d = add(g, "p2", "ship", "3g");
    command(
      g,
      { op: "battle", system: "3g", target: "p2", skirmish: 1 },
      dice(0),
    );
    const serial = g.rolls[0]!.serial;
    expect(g.rolls).toEqual([
      {
        serial,
        system: "3g",
        attacker: "p1",
        defender: "p2",
        dice: [{ type: "skirmish", face: 0 }],
      },
    ]);
    command(g, { op: "hit", target: d.id });
    expect(g.battle).toEqual([]);
    expect(g.rolls).toHaveLength(1);
    command(
      g,
      { op: "battle", system: "3g", target: "p2", skirmish: 1 },
      dice(4),
    );
    expect(g.rolls).toHaveLength(1);
    expect(g.rolls[0]!.serial).toBeGreaterThan(serial);
    expect(g.rolls[0]!.dice).toEqual([{ type: "skirmish", face: 4 }]);
  });
  it("updates the roll after Skirmisher rerolls and deep-clones it", () => {
    const g = fixture();
    actionPhase(g, "aggression");
    g.pieces = [];
    add(g, "p1", "ship", "3g");
    add(g, "p1", "ship", "3g");
    add(g, "p2", "ship", "3g");
    own(g, "p1", "skirmishers");
    g.player("p1").resources = ["", "", "", "", "", ""];
    command(
      g,
      { op: "battle", system: "3g", target: "p2", skirmish: 2 },
      dice(5, 5),
    );
    const serial = g.rolls[0]!.serial,
      copy = cloneGame(g);
    command(g, { op: "reroll", ids: ["1"] }, dice(0));
    expect(g.rolls[0]!.dice.map((d) => d.face)).toEqual([5, 0]);
    expect(g.rolls[0]!.serial).toBeGreaterThan(serial);
    expect(copy.rolls[0]!.dice.map((d) => d.face)).toEqual([5, 5]);
  });
});
describe("forced choices", () => {
  it("ransacks the only Court card holding defender agents", () => {
    const g = fixture();
    actionPhase(g, "aggression");
    g.pieces = [];
    for (const p of g.players) p.resources = ["", "", "", "", "", ""];
    add(g, "p1", "ship", "3.1");
    const city = add(g, "p2", "city", "3.1", true);
    court(g, "loyal-engineers", ["p2"]);
    command(
      g,
      { op: "battle", system: "3.1", target: "p2", assault: 1 },
      dice(0),
    );
    command(g, { op: "hit", target: city.id });
    expect(g.pending).toEqual([]);
    expect(g.player("p1").guilds).toContain("loyal-engineers");
  });
  it("picks the only rival for Farseers but leaves the swap to the player", () => {
    const g = fixture(2);
    own(g, "p1", "farseers");
    g.player("p1").hand = [
      actionDeck(2).find((c) => c.id === "construction-4")!,
    ];
    command(g, { op: "play", card: "construction-4", ambition: "warlord" });
    expect(g.pending[0]).toMatchObject({ kind: "farseers-swap", target: "p2" });
    expect(g.player("p1").peek).toEqual(g.player("p2").hand);
  });
  it("skips Vox cards with nothing to choose", () => {
    const song = fixture();
    actionPhase(song, "aggression");
    song.pieces = song.pieces.filter((p) => p.kind !== "city");
    court(song, "song-of-freedom");
    command(song, { op: "secure", card: "song-of-freedom" });
    expect(song.pending).toEqual([]);
    expect(song.courtDeck).toContain("song-of-freedom");
    const struggle = fixture();
    actionPhase(struggle, "aggression");
    court(struggle, "guild-struggle");
    command(struggle, { op: "secure", card: "guild-struggle" });
    expect(struggle.pending).toEqual([]);
    expect(struggle.courtDiscard).toContain("guild-struggle");
    const populist = fixture();
    actionPhase(populist, "aggression");
    for (const m of populist.markers) m.ambition = "tycoon";
    court(populist, "populist-demands");
    command(populist, { op: "secure", card: "populist-demands" });
    expect(populist.pending).toEqual([]);
    expect(populist.courtDiscard).toContain("populist-demands");
  });
});
