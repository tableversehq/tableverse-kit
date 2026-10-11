import { describe, it, expect } from "vitest";
import type { RNGApi } from "@tableverse-kit/engine";
import { cloneGame } from "../src/rules.ts";
import {
  actionPhase,
  add,
  arrange,
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
function battle() {
  const g = fixture();
  actionPhase(g, "aggression");
  g.pieces = [];
  for (const p of g.players) p.resources = ["", "", "", "", "", ""];
  return g;
}
describe("attacker-resolved combat", () => {
  it("resolves self hits before intercept and defender hits, even after attackers are destroyed", () => {
    const g = battle();
    const a = add(g, "p1", "ship", "3g"),
      d = add(g, "p2", "ship", "3g");
    add(g, "p2", "ship", "3g");
    command(
      g,
      { op: "battle", system: "3g", target: "p2", assault: 1 },
      dice(1),
    );
    expect(g.battle[0]?.step).toBe("self");
    command(g, { op: "hit", target: a.id });
    expect(a.damaged).toBe(true);
    expect(g.battle[0]?.step).toBe("ship");
    command(g, { op: "hit", target: d.id });
    command(g, { op: "hit", target: d.id });
    expect(g.player("p1").trophies.map((p) => p.id)).toEqual([d.id]);
    expect(g.battle).toEqual([]);
    const h = battle();
    const attacker = add(h, "p1", "ship", "3g", true),
      defender = add(h, "p2", "ship", "3g");
    command(
      h,
      { op: "battle", system: "3g", target: "p2", assault: 1 },
      dice(1),
    );
    command(h, { op: "hit", target: attacker.id });
    expect(h.player("p2").trophies).toHaveLength(1);
    command(h, { op: "hit", target: defender.id });
    command(h, { op: "hit", target: defender.id });
    expect(h.player("p1").trophies).toHaveLength(1);
  });
  it("intercepts only once regardless of intercept icons and only counts fresh defenders", () => {
    const g = battle();
    const a = add(g, "p1", "ship", "3g");
    add(g, "p1", "ship", "3g");
    add(g, "p2", "ship", "3g");
    add(g, "p2", "ship", "3g", true);
    command(
      g,
      { op: "battle", system: "3g", target: "p2", raid: 2 },
      dice(5, 5),
    );
    expect(g.battle[0]?.intercept).toBe(1);
    command(g, { op: "hit", target: a.id });
    expect(g.battle).toEqual([]);
    expect(g.player("p2").trophies).toEqual([]);
  });
  it("assigns ship hits to ships before buildings", () => {
    const g = battle();
    add(g, "p1", "ship", "3.3");
    const ship = add(g, "p2", "ship", "3.3", true),
      city = add(g, "p2", "city", "3.3");
    command(
      g,
      { op: "battle", system: "3.3", target: "p2", assault: 1 },
      dice(0),
    );
    expect(() => command(cloneGame(g), { op: "hit", target: city.id })).toThrow(
      "must_hit_ships_first",
    );
    command(g, { op: "hit", target: ship.id });
    command(g, { op: "hit", target: city.id });
    expect(city.damaged).toBe(true);
  });
  it("city destruction provokes Outrage before ransacking and takes rival Court agents as trophies", () => {
    const g = battle();
    add(g, "p1", "ship", "3.1");
    const city = add(g, "p2", "city", "3.1", true);
    g.player("p1").resources = ["material", "", "", "", "", ""];
    own(g, "p1", "mining-interest");
    court(g, "loyal-engineers", ["p1", "p2", "p3"]);
    court(g, "relic-fence", ["p2"]);
    command(
      g,
      { op: "battle", system: "3.1", target: "p2", assault: 1 },
      dice(0),
    );
    command(g, { op: "hit", target: city.id });
    expect(g.player("p1").outrage).toEqual(["material"]);
    expect(g.player("p1").resources[0]).toBe("");
    expect(g.courtDiscard).toContain("mining-interest");
    expect(g.pending[0]?.kind).toBe("ransack");
    command(g, { op: "choose", card: "loyal-engineers" });
    expect(g.player("p1").trophies.map((t) => t.kind)).toEqual([
      "city",
      "agent",
      "agent",
    ]);
    expect(g.player("p1").captives).toEqual([]);
    expect(g.player("p1").guilds).toContain("loyal-engineers");
    expect(g.battle).toEqual([]);
  });
  it("cannot raid after the last attacking ship is destroyed", () => {
    const g = battle();
    const a = add(g, "p1", "ship", "3g", true);
    add(g, "p2", "ship", "3g");
    command(g, { op: "battle", system: "3g", target: "p2", raid: 1 }, dice(0));
    command(g, { op: "hit", target: a.id });
    expect(g.battle).toEqual([]);
  });
  it("spends printed slot costs and can steal Sworn Guardians before another resource", () => {
    const g = battle();
    const a = add(g, "p1", "ship", "3g");
    add(g, "p2", "ship", "3g");
    own(g, "p2", "sworn-guardians");
    g.player("p2").resources = ["relic", "fuel", "", "", "", ""];
    command(g, { op: "battle", system: "3g", target: "p2", raid: 1 }, dice(0));
    command(g, { op: "hit", target: a.id });
    expect(g.battle[0]?.step).toBe("raid");
    expect(() => command(cloneGame(g), { op: "raid", slot: 1 })).toThrow(
      "protected_by_sworn_guardians",
    );
    expect(() => command(cloneGame(g), { op: "raid", slot: 0 })).toThrow(
      "not_enough_raid_keys",
    );
    command(g, { op: "raid", card: "sworn-guardians" });
    expect(g.battle[0]?.keys).toBe(1);
    command(g, { op: "raid", slot: 1 });
    arrange(g);
    expect(g.player("p1").resources).toContain("fuel");
    expect(g.battle).toEqual([]);
  });
  it("Skirmishers rerolls only skirmish dice, limited by Weapon icons", () => {
    const g = battle();
    add(g, "p1", "ship", "3g");
    add(g, "p1", "ship", "3g");
    const d = add(g, "p2", "ship", "3g");
    own(g, "p1", "skirmishers");
    command(
      g,
      { op: "battle", system: "3g", target: "p2", skirmish: 2 },
      dice(5, 5),
    );
    expect(g.battle[0]?.step).toBe("roll");
    expect(() =>
      command(cloneGame(g), { op: "reroll", ids: ["0", "1"] }),
    ).toThrow("invalid_reroll");
    command(g, { op: "reroll", ids: ["1"] }, dice(0));
    expect(g.battle[0]?.dice.map((d) => d.face)).toEqual([5, 0]);
    command(g, { op: "hit", target: d.id });
    expect(d.damaged).toBe(true);
  });
  it("Gatekeepers grants two extra dice only at gates; damaged attackers count", () => {
    const g = battle();
    add(g, "p1", "ship", "3g", true);
    add(g, "p2", "ship", "3g");
    own(g, "p1", "gatekeepers");
    command(
      g,
      { op: "battle", system: "3g", target: "p2", skirmish: 3 },
      dice(5, 5, 5),
    );
    expect(g.battle).toEqual([]);
    expect(g.pips).toBe(3);
  });
  it("allows zero dice but rejects more than six of one type", () => {
    const g = battle();
    for (let n = 0; n < 8; n++) add(g, "p1", "ship", "3g");
    add(g, "p2", "ship", "3g");
    expect(() =>
      command(cloneGame(g), {
        op: "battle",
        system: "3g",
        target: "p2",
        assault: 7,
      }),
    ).toThrow("maximum_six_dice_per_type");
    command(g, { op: "battle", system: "3g", target: "p2" });
    expect(g.battle).toEqual([]);
    expect(g.pips).toBe(3);
  });
});
