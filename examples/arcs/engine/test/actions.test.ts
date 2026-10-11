import { describe, it, expect } from "vitest";
import { actionDeck } from "../src/data.ts";
import {
  cloneGame,
  outrage,
  scoreChapter,
  stabilizeAgents,
} from "../src/rules.ts";
import {
  actionPhase,
  add,
  arrange,
  command,
  fixture,
  fixedRng,
  own,
} from "./helpers.ts";

describe("resource and action timing", () => {
  it("allows spending an outraged resource without effect and withholds it until Prelude ends", () => {
    const g = fixture();
    actionPhase(g);
    g.player("p1").resources = ["fuel", "", "", "", "", ""];
    g.player("p1").outrage = ["fuel"];
    const before = g.supply.fuel!;
    command(g, { op: "spend", slot: 0 });
    expect(g.supply.fuel).toBe(before);
    expect(g.spent).toEqual(["fuel"]);
    expect(g.pips).toBe(4);
    command(g, { op: "end" });
    expect(g.supply.fuel).toBe(before + 1);
  });
  it("rejects resource actions after spending an action pip", () => {
    const g = fixture();
    actionPhase(g);
    const city = g.pieces.find((p) => p.owner === "p1" && p.kind === "city")!;
    city.damaged = true;
    command(g, { op: "repair", target: city.id });
    expect(() => command(g, { op: "spend", slot: 0 })).toThrow(
      "resources_only_in_prelude",
    );
  });
  it("captures an agent when taxing a rival city with an empty resource supply", () => {
    const g = fixture();
    actionPhase(g, "administration");
    const city = g.pieces.find((p) => p.owner === "p2" && p.kind === "city")!;
    g.pieces = g.pieces.filter(
      (p) => p.system !== city.system || p.kind !== "ship",
    );
    add(g, "p1", "ship", city.system);
    g.supply[g.system(city.system).resource] = 0;
    command(g, { op: "tax", target: city.id });
    expect(g.player("p1").captives).toEqual(["p2"]);
    expect(g.pending).toHaveLength(0);
  });
  it("opens the printed slots, and accepts only owned resources in open slots", () => {
    const g = fixture();
    g.pieces = [];
    expect(g.capacity("p1")).toBe(2);
    add(g, "p1", "city", "1.1");
    expect(g.capacity("p1")).toBe(3);
    add(g, "p1", "city", "1.2");
    expect(g.capacity("p1")).toBe(4);
    add(g, "p1", "city", "1.3");
    expect(g.capacity("p1")).toBe(6);
    g.player("p1").resources = ["fuel", "", "", "", "", ""];
    g.pending = [
      {
        kind: "resources",
        actor: "p1",
        target: "",
        count: 0,
        data: ["weapon"],
      },
    ];
    expect(() =>
      command(cloneGame(g), {
        op: "choose",
        values: ["relic", "weapon", "", "", "", ""],
      }),
    ).toThrow("resource_not_available");
    command(g, { op: "choose", values: ["", "", "", "", "fuel", "weapon"] });
    expect(g.player("p1").resources[5]).toBe("weapon");
  });
  it("discards overflow and cannot voluntarily discard resources while slots are free", () => {
    const g = fixture();
    g.pieces = [];
    g.player("p1").resources = ["fuel", "material", "", "", "", ""];
    g.pending = [
      {
        kind: "resources",
        actor: "p1",
        target: "",
        count: 0,
        data: ["weapon"],
      },
    ];
    const before = g.supply.material!;
    expect(() =>
      command(cloneGame(g), {
        op: "choose",
        values: ["weapon", "", "", "", "", ""],
      }),
    ).toThrow("fill_available_resource_slots");
    command(g, { op: "choose", values: ["weapon", "fuel", "", "", "", ""] });
    expect(g.supply.material).toBe(before + 1);
  });
  it("places buildings damaged under rival control and repairs anywhere", () => {
    const g = fixture();
    actionPhase(g);
    g.pieces = [];
    add(g, "p1", "ship", "3.3", true);
    add(g, "p2", "ship", "3.3");
    command(g, { op: "build", kind: "city", system: "3.3" });
    const city = g.pieces.at(-1)!;
    expect(city.damaged).toBe(true);
    command(g, { op: "repair", target: city.id });
    expect(city.damaged).toBe(false);
  });
  it("can build at a newly built port, with one ship per port per turn", () => {
    const g = fixture();
    actionPhase(g);
    g.pieces = [];
    add(g, "p1", "ship", "3.3");
    command(g, { op: "build", kind: "starport", system: "3.3" });
    const port = g.pieces.at(-1)!;
    command(g, { op: "build", kind: "ship", system: "3.3", target: port.id });
    expect(g.at("3.3", "p1", "ship")).toHaveLength(2);
    expect(() =>
      command(g, { op: "build", kind: "ship", system: "3.3", target: port.id }),
    ).toThrow("starport_already_built");
  });
  it("permits a build when the piece supply is empty, without creating extra pieces", () => {
    const g = fixture();
    actionPhase(g);
    g.pieces = [];
    const port = add(g, "p1", "starport", "3.3");
    for (let i = 0; i < 15; i++) add(g, "p1", "ship", "3.3");
    command(g, { op: "build", kind: "ship", system: "3.3", target: port.id });
    expect(g.at("3.3", "p1", "ship")).toHaveLength(15);
    expect(g.pips).toBe(3);
  });
  it("cannot use weapons to turn fuel or psionic actions into battle", () => {
    const g = fixture();
    actionPhase(g, "construction");
    g.player("p1").resources = ["weapon", "fuel", "", "", "", ""];
    command(g, { op: "weapons", slot: 0 });
    expect(g.weapons).toBe(true);
    expect(() =>
      command(g, {
        op: "battle",
        source: "resource",
        slot: 1,
        resource: "fuel",
      }),
    ).toThrow("action_not_allowed_by_payment");
  });
  it("reserves agents for Outrage, replacing placeholders as agents return", () => {
    const g = fixture();
    g.court[0]!.agents = Array.from({ length: 10 }, () => "p1");
    outrage(g, "p1", "fuel");
    expect(g.player("p1").outrageAgents).toEqual([]);
    g.court[0]!.agents.pop();
    stabilizeAgents(g);
    expect(g.player("p1").outrageAgents).toEqual(["fuel"]);
    expect(g.available("p1", "agent")).toBe(0);
  });
  it("keeps Loyal guilds through repeated Outrage but discards matching ordinary guilds", () => {
    const g = fixture();
    own(g, "p1", "loyal-engineers");
    own(g, "p1", "mining-interest");
    g.player("p1").resources = ["material", "fuel", "", "", "", ""];
    outrage(g, "p1", "material");
    expect(g.player("p1").guilds).toEqual(["loyal-engineers"]);
    expect(g.courtDiscard).toContain("mining-interest");
    g.player("p1").resources[0] = "material";
    outrage(g, "p1", "material");
    expect(g.player("p1").resources[0]).toBe("");
    expect(g.player("p1").outrage).toEqual(["material"]);
  });
});
describe("movement", () => {
  it("catapults with drop-offs, backtracking, and a final planet", () => {
    const g = fixture();
    actionPhase(g, "mobilization");
    g.pieces = [];
    add(g, "p1", "starport", "3.3");
    const ships = [add(g, "p1", "ship", "3.3"), add(g, "p1", "ship", "3.3")];
    command(g, { op: "move", ids: ships.map((s) => s.id), system: "3g" });
    expect(g.pending[0]?.kind).toBe("catapult");
    command(g, { op: "choose", ids: [ships[0]!.id], system: "2g" });
    command(g, { op: "choose", ids: [ships[0]!.id], system: "3g" });
    command(g, { op: "choose", ids: [ships[0]!.id], system: "3.1" });
    expect(ships.map((s) => s.system)).toEqual(["3.1", "3g"]);
    expect(g.pending).toEqual([]);
    expect(g.pips).toBe(3);
  });
  it("stops in a rival-controlled gate based on control before arrival", () => {
    const g = fixture();
    actionPhase(g, "mobilization");
    g.pieces = [];
    add(g, "p1", "starport", "3.3");
    const ships = [add(g, "p1", "ship", "3.3"), add(g, "p1", "ship", "3.3")];
    add(g, "p2", "ship", "3g");
    command(g, { op: "move", ids: ships.map((s) => s.id), system: "3g" });
    expect(g.control("3g")).toBe("p1");
    expect(g.pending).toEqual([]);
  });
  it("cannot catapult from a controlled rival port", () => {
    const g = fixture();
    actionPhase(g, "mobilization");
    g.pieces = [];
    add(g, "p2", "starport", "3.3");
    const ship = add(g, "p1", "ship", "3.3");
    command(g, { op: "move", ids: [ship.id], system: "3g" });
    expect(g.pending).toEqual([]);
  });
  it("regroups at turn end when all loyal ships and ports are gone", () => {
    const g = fixture();
    actionPhase(g);
    g.pieces = g.pieces.filter((p) => p.owner !== "p1" || p.kind === "city");
    command(g, { op: "end" });
    expect(g.pending[0]?.kind).toBe("regroup");
    command(g, { op: "choose", system: "3g" });
    expect(g.at("3g", "p1", "ship")).toHaveLength(3);
    expect(g.active).toBe("p2");
  });
});
describe("chapters and initiative", () => {
  it("awards initiative to the highest surpass, not the last surpass", () => {
    const g = fixture();
    g.players.forEach((p) => (p.hand = []));
    g.player("p1").hand = [
      actionDeck(3).find((c) => c.id === "construction-2")!,
      actionDeck(3).find((c) => c.id === "mobilization-2")!,
    ];
    g.player("p2").hand = [
      actionDeck(3).find((c) => c.id === "construction-6")!,
    ];
    g.player("p3").hand = [
      actionDeck(3).find((c) => c.id === "construction-4")!,
    ];
    for (const rank of [2, 6, 4]) {
      command(g, { op: "play", card: `construction-${rank}`, mode: "surpass" });
      command(g, { op: "end" });
    }
    expect(g.initiative).toBe("p2");
    expect(g.phase).toBe("card");
    command(g, { op: "pass" });
    expect(g.initiative).toBe("p1");
  });
  it("automatically seizes with a seven and prevents a second seize", () => {
    const g = fixture(4);
    g.player("p1").hand = [
      actionDeck(4).find((c) => c.id === "construction-2")!,
    ];
    command(g, { op: "play", card: "construction-2" });
    command(g, { op: "end" });
    g.player("p2").hand = [
      actionDeck(4).find((c) => c.id === "construction-7")!,
    ];
    command(g, { op: "play", card: "construction-7", mode: "surpass" });
    expect(g.seized).toBe(true);
    expect(g.initiative).toBe("p2");
    command(g, { op: "end" });
    const hand = g.player("p3").hand;
    expect(() =>
      command(g, {
        op: "play",
        card: hand[0]!.id,
        mode: "copy",
        seize: hand[1]!.id,
      }),
    ).toThrow("invalid_seize_card");
  });
  it("ends a chapter when all players with cards pass consecutively", () => {
    const g = fixture();
    for (let n = 0; n < 3; n++) command(g, { op: "pass" });
    expect(g.chapter).toBe(2);
    expect(g.markers.map((m) => [m.first, m.second])).toEqual([
      [5, 3],
      [3, 2],
      [5, 2],
    ]);
  });
  it("scores a city bonus once per ambition even with stacked markers", () => {
    const g = fixture();
    for (const p of g.players) p.resources = ["", "", "", "", "", ""];
    g.player("p1").resources[0] = "relic";
    for (let n = 0; n < 4; n++) add(g, "p1", "city", "3.3");
    g.markers[0]!.ambition = "keeper";
    g.markers[1]!.ambition = "keeper";
    scoreChapter(g, fixedRng);
    expect(g.player("p1").power).toBe(13);
  });
  it("does not reward a second-place tie", () => {
    const g = fixture();
    for (const p of g.players) p.resources = ["relic", "", "", "", "", ""];
    g.player("p1").resources[1] = "relic";
    g.markers[0]!.ambition = "keeper";
    scoreChapter(g, fixedRng);
    expect(g.players.map((p) => p.power)).toEqual([5, 0, 0]);
  });
  it("returns trophies only when Warlord scores and closes covered slots", () => {
    const g = fixture();
    g.pieces = [];
    g.player("p2").trophies = [
      { id: "trophy", owner: "p1", kind: "city", system: "", damaged: true },
    ];
    g.player("p1").resources = ["fuel", "material", "weapon", "", "", ""];
    expect(g.capacity("p1")).toBe(3);
    g.markers[0]!.ambition = "warlord";
    scoreChapter(g, fixedRng);
    expect(g.player("p2").trophies).toEqual([]);
    expect(g.capacity("p1")).toBe(2);
    expect(g.pending[0]?.kind).toBe("resources");
    arrange(g);
    expect(g.player("p1").resources.filter(Boolean)).toHaveLength(2);
  });
  it("mulligans once and preserves a twenty-card deck", () => {
    const g = fixture(2);
    g.pending = [
      { kind: "mulligan", actor: "p2", target: "", count: 0, data: [] },
    ];
    const old = g.player("p2").hand.map((c) => c.id);
    command(g, { op: "choose", target: "redraw" });
    expect(g.player("p2").hand).toHaveLength(6);
    expect(g.player("p2").hand.every((c) => !old.includes(c.id))).toBe(true);
    expect(
      new Set(
        [...g.players.flatMap((p) => p.hand), ...g.actionDiscard].map(
          (c) => c.id,
        ),
      ).size,
    ).toBe(20);
    expect(g.pending).toEqual([]);
  });
});
