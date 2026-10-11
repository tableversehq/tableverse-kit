import { describe, it, expect } from "vitest";
import { actionDeck, COURT, courtCard } from "../src/data.ts";
import { cloneGame, scoreChapter } from "../src/rules.ts";
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

describe("Court and Guilds", () => {
  it("contains the 25 Guilds and 6 Vox cards with printed raid costs", () => {
    expect(COURT).toHaveLength(31);
    expect(COURT.filter((c) => c.resource)).toHaveLength(25);
    expect(courtCard("elder-broker").cost).toBe(2);
    expect(courtCard("relic-fence").cost).toBe(2);
    expect(courtCard("sworn-guardians").cost).toBe(1);
    expect(courtCard("galactic-bards").cost).toBe(1);
  });
  it("requires a strict plurality, returns loyal agents, and captures rivals", () => {
    const g = fixture();
    actionPhase(g, "aggression");
    court(g, "mining-interest", ["p1", "p2"]);
    expect(() =>
      command(cloneGame(g), { op: "secure", card: "mining-interest" }),
    ).toThrow("need_strict_agent_majority");
    g.court[0]!.agents.push("p1", "p3");
    command(g, { op: "secure", card: "mining-interest" });
    expect(g.player("p1").guilds).toContain("mining-interest");
    expect(g.player("p1").captives).toEqual(["p2", "p3"]);
    expect(g.available("p1", "agent")).toBe(10);
  });
  it("prohibits the Prelude ability of newly secured Guilds while allowing their new actions", () => {
    const g = fixture();
    actionPhase(g);
    court(g, "mining-interest");
    g.player("p1").resources = ["relic", "", "", "", "", ""];
    command(g, {
      op: "secure",
      card: "mining-interest",
      source: "resource",
      resource: "relic",
      slot: 0,
    });
    expect(() =>
      command(cloneGame(g), { op: "guild", card: "mining-interest" }),
    ).toThrow("guild_unavailable_this_prelude");
    command(g, { op: "manufacture" });
    expect(g.player("p1").resources[0]).toBe("material");
    expect(g.pending).toEqual([]);
  });
  it.each([
    "loyal-engineers",
    "loyal-pilots",
    "loyal-marines",
    "loyal-keepers",
    "loyal-empaths",
  ])("%s converts resources and ignores the destination Outrage", (card) => {
    const g = fixture();
    actionPhase(g, "construction");
    own(g, "p1", card);
    const resource = courtCard(card).resource;
    g.player("p1").outrage = [resource, "fuel"];
    g.player("p1").resources = ["fuel", "", "", "", "", ""];
    g.pieces = [];
    const ship = add(g, "p1", "ship", "3.3", true);
    court(g, "relic-fence");
    if (resource === "weapon") command(g, { op: "weapons", slot: 0 });
    else if (resource === "fuel")
      command(g, {
        op: "move",
        source: "resource",
        slot: 0,
        resource,
        ids: [ship.id],
        system: "3g",
      });
    else if (resource === "relic")
      command(g, {
        op: "secure",
        source: "resource",
        slot: 0,
        resource,
        card: "relic-fence",
      });
    else
      command(g, {
        op: "repair",
        source: "resource",
        slot: 0,
        resource,
        target: ship.id,
      });
    expect(g.player("p1").resources[0]).toBe("");
    expect(g.spent).toEqual(["fuel"]);
    expect(g.pips).toBe(4);
  });
  it.each([
    ["mining-interest", "manufacture", "material"],
    ["shipping-interest", "synthesize", "fuel"],
  ])(
    "%s replaces Build and fills selected empty slots",
    (card, op, resource) => {
      const g = fixture();
      actionPhase(g);
      own(g, "p1", card);
      command(g, { op });
      expect(g.player("p1").resources[2]).toBe(resource);
      expect(g.pending).toEqual([]);
      actionPhase(g);
      g.player("p1").resources = ["", "", "", "", "", ""];
      g.supply[resource] = 3;
      command(g, { op: "guild", card, amount: 2 });
      expect(g.pending).toEqual([]);
      expect(g.player("p1").resources.filter(Boolean)).toEqual([
        resource,
        resource,
      ]);
      expect(g.courtDiscard).toContain(card);
    },
  );
  it("Interest steals when supply empties and respects Sworn Guardians", () => {
    const g = fixture();
    actionPhase(g);
    own(g, "p1", "mining-interest");
    g.player("p1").resources = ["", "", "", "", "", ""];
    g.player("p2").resources = ["material", "", "", "", "", ""];
    g.player("p3").resources = ["material", "material", "", "", "", ""];
    g.supply.material = 0;
    own(g, "p2", "sworn-guardians");
    command(g, { op: "guild", card: "mining-interest", amount: 1 });
    expect(() =>
      command(cloneGame(g), { op: "choose", target: "p2", slot: 0 }),
    ).toThrow("protected_by_sworn_guardians");
    command(g, { op: "choose", target: "p3", slot: 1 });
    expect(g.player("p1").resources[0]).toBe("material");
    expect(g.player("p3").resources).toEqual(["material", "", "", "", "", ""]);
  });
  it.each(["material", "fuel"])(
    "%s Cartel counts supply, discards rivals’ resources after scoring, and can steal",
    (resource) => {
      const g = fixture();
      own(g, "p1", `${resource}-cartel`);
      for (const p of g.players) p.resources = ["", "", "", "", "", ""];
      g.supply[resource] = 4;
      g.player("p2").resources[0] = resource;
      expect(g.metric("p1", "tycoon")).toBe(5);
      g.markers[0]!.ambition = "tycoon";
      scoreChapter(g, fixedRng);
      expect(g.player("p1").power).toBe(5);
      expect(g.player("p2").resources[0]).toBe("");
      expect(g.supply[resource]).toBe(5);
      actionPhase(g);
      g.player("p2").resources[0] = resource;
      command(g, {
        op: "guild",
        card: `${resource}-cartel`,
        target: "p2",
        slot: 0,
        kind: "sworn-guardians",
      });
      arrange(g);
      expect(g.player("p1").resources[0]).toBe(resource);
      expect(g.courtDiscard).toContain(`${resource}-cartel`);
    },
  );
  it.each([
    ["admin-union", "administration"],
    ["arms-union", "aggression"],
    ["construction-union", "construction"],
    ["spacing-union", "mobilization"],
  ])("%s claims a played card at round end", (guild, suit) => {
    const g = fixture();
    own(g, "p1", guild);
    g.player("p1").hand = [actionDeck(3).find((c) => c.id === `${suit}-2`)!];
    command(g, { op: "play", card: `${suit}-2` });
    command(g, { op: "guild", card: guild, target: `${suit}-2` });
    command(g, { op: "end" });
    for (let n = 0; n < 2; n++) {
      command(g, {
        op: "play",
        card: g.player(g.active).hand[0]!.id,
        mode: "copy",
      });
      command(g, { op: "end" });
    }
    expect(g.player("p1").hand.map((c) => c.id)).toContain(`${suit}-2`);
    expect(g.courtDiscard).toContain(guild);
    expect(g.chapter).toBe(1);
  });
  it.each([
    "prison-wardens",
    "skirmishers",
    "court-enforcers",
    "loyal-marines",
  ])("%s places up to three ships in a controlled system", (card) => {
    const g = fixture();
    actionPhase(g);
    own(g, "p1", card);
    const s = g.pieces.find((p) => p.owner === "p1")!.system;
    const before = g.at(s, "p1", "ship").length;
    command(g, { op: "guild", card, system: s });
    expect(g.at(s, "p1", "ship")).toHaveLength(before + 3);
    expect(g.courtDiscard).toContain(card);
  });
  it("Prison Wardens executes captives as trophies or returns them for chosen resources", () => {
    const g = fixture();
    actionPhase(g, "administration");
    own(g, "p1", "prison-wardens");
    g.player("p1").captives = ["p2", "p2", "p3"];
    command(g, { op: "execute", values: ["p2", "p3"] });
    expect(g.player("p1").trophies.map((t) => t.owner)).toEqual(["p2", "p3"]);
    g.suit = "construction";
    command(g, { op: "pressgang", values: ["p2"] });
    command(g, { op: "choose", values: ["relic"] });
    expect(g.player("p1").resources[2]).toBe("relic");
    expect(g.pending).toEqual([]);
    expect(g.player("p1").captives).toEqual([]);
  });
  it("Court Enforcers abducts fewer agents than total Weapon icons", () => {
    const g = fixture();
    actionPhase(g, "aggression");
    own(g, "p1", "court-enforcers");
    g.player("p1").resources = ["weapon", "weapon", "", "", "", ""];
    court(g, "relic-fence", ["p1", "p2", "p3"]);
    command(g, { op: "abduct", card: "relic-fence" });
    expect(g.player("p1").captives).toEqual(["p2", "p3"]);
    expect(g.court[0]!.agents).toEqual(["p1"]);
  });
  it("Gatekeepers places one ship per active gate subject to supply", () => {
    const g = fixture();
    actionPhase(g);
    own(g, "p1", "gatekeepers");
    const gates = g.systems.filter((s) => !s.planet);
    command(g, {
      op: "guild",
      card: "gatekeepers",
      ids: gates.map((s) => s.id),
    });
    for (const s of gates)
      expect(g.at(s.id, "p1", "ship").length).toBeGreaterThan(0);
    expect(g.courtDiscard).toContain("gatekeepers");
  });
  it("Lattice Spies seizes only before other actions", () => {
    const g = fixture();
    actionPhase(g, "construction", "p2");
    g.initiative = "p1";
    own(g, "p2", "lattice-spies");
    command(g, { op: "guild", card: "lattice-spies" });
    expect(g.seized).toBe(true);
    expect(g.initiative).toBe("p2");
    const other = fixture();
    actionPhase(other, "construction", "p2");
    own(other, "p2", "lattice-spies");
    other.actionsTaken = 1;
    expect(() =>
      command(other, { op: "guild", card: "lattice-spies" }),
    ).toThrow("spies_before_other_actions");
  });
  it("Farseers inspects and swaps without publicizing cards, and draws from the bottom after discarding", () => {
    const g = fixture();
    own(g, "p1", "farseers");
    g.player("p1").hand = [
      actionDeck(3).find((c) => c.id === "construction-4")!,
      actionDeck(3).find((c) => c.id === "construction-5")!,
    ];
    command(g, { op: "play", card: "construction-4", ambition: "warlord" });
    command(g, { op: "choose", target: "p2" });
    expect(g.player("p1").peek).toEqual(g.player("p2").hand);
    const take = g.player("p2").hand[0]!.id;
    command(g, { op: "choose", card: "construction-5", target: take });
    expect(g.player("p1").hand[0]!.id).toBe(take);
    expect(g.player("p1").peek).toEqual([]);
    g.actionDiscard = [];
    command(g, { op: "guild", card: "farseers", ids: [take] });
    expect(g.player("p1").hand.map((c) => c.id)).toEqual([take]);
    expect(g.courtDiscard).toContain("farseers");
  });
  it("Secret Order keeps the printed lead when declaring Keeper or Empath", () => {
    const g = fixture();
    own(g, "p1", "secret-order");
    g.player("p1").hand = [
      actionDeck(3).find((c) => c.id === "construction-5")!,
    ];
    command(g, { op: "play", card: "construction-5", ambition: "keeper" });
    expect(g.leadRank).toBe(5);
  });
  it("Galactic Bards declares on a pivot without zeroing the lead", () => {
    const g = fixture();
    g.player("p1").hand = [
      actionDeck(3).find((c) => c.id === "construction-2")!,
    ];
    command(g, { op: "play", card: "construction-2" });
    command(g, { op: "end" });
    own(g, "p2", "galactic-bards");
    g.player("p2").hand = [
      actionDeck(3).find((c) => c.id === "administration-6")!,
    ];
    command(g, {
      op: "play",
      card: "administration-6",
      mode: "pivot",
      ambition: "empath",
    });
    expect(g.markers[0]!.ambition).toBe("empath");
    expect(g.leadRank).toBe(2);
  });
  it("Silver-Tongues steals a Guild and permits its Prelude ability immediately", () => {
    const g = fixture();
    actionPhase(g);
    own(g, "p1", "silver-tongues");
    own(g, "p2", "elder-broker");
    command(g, {
      op: "guild",
      card: "silver-tongues",
      target: "p2",
      kind: "elder-broker",
    });
    command(g, { op: "guild", card: "elder-broker" });
    expect(g.pending[0]?.data).toEqual(["material", "fuel", "weapon"]);
  });
  it("Sworn Guardians blocks theft and is buried when stolen itself", () => {
    const g = fixture();
    actionPhase(g);
    own(g, "p1", "silver-tongues");
    own(g, "p2", "sworn-guardians");
    own(g, "p2", "elder-broker");
    expect(() =>
      command(cloneGame(g), {
        op: "guild",
        card: "silver-tongues",
        target: "p2",
        kind: "elder-broker",
      }),
    ).toThrow("protected_by_sworn_guardians");
    command(g, {
      op: "guild",
      card: "silver-tongues",
      target: "p2",
      kind: "sworn-guardians",
    });
    expect(g.player("p1").guilds).not.toContain("sworn-guardians");
    expect(g.courtDeck.at(-1)).toBe("sworn-guardians");
  });
  it("Elder Broker trades independently of its payment slot and ignores theft protection", () => {
    const g = fixture();
    actionPhase(g, "administration");
    own(g, "p1", "elder-broker");
    own(g, "p2", "sworn-guardians");
    g.pieces = [];
    const city = add(g, "p2", "city", "3.1");
    add(g, "p1", "ship", "3.1");
    g.player("p1").resources = ["psionic", "fuel", "", "", "", ""];
    g.player("p2").resources = ["material", "", "", "", "", ""];
    command(g, {
      op: "trade",
      target: city.id,
      source: "resource",
      resource: "psionic",
      slot: 0,
      giveSlot: 1,
    });
    arrange(g);
    arrange(g);
    expect(g.player("p1").resources.filter(Boolean)).toEqual(["material"]);
    expect(g.player("p2").resources.filter(Boolean)).toEqual(["fuel"]);
    expect(g.spent).toEqual(["psionic"]);
    expect(g.taxed).toEqual([]);
  });
  it("Relic Fence discards immediately, ignores Outrage, and is once per turn", () => {
    const g = fixture();
    actionPhase(g);
    own(g, "p1", "relic-fence");
    g.player("p1").resources = ["fuel", "", "", "", "", ""];
    g.player("p1").outrage = ["fuel"];
    const before = g.supply.fuel!;
    command(g, { op: "guild", card: "relic-fence", slot: 0 });
    expect(g.supply.fuel).toBe(before + 1);
    arrange(g);
    expect(() =>
      command(g, { op: "guild", card: "relic-fence", slot: 0 }),
    ).toThrow("once_per_turn");
  });
});
describe("Vox resolution", () => {
  it("Mass Uprising places fresh ships even in rival-controlled systems", () => {
    const g = fixture();
    actionPhase(g, "aggression");
    court(g, "mass-uprising");
    const before = g.pieces.length;
    command(g, { op: "secure", card: "mass-uprising" });
    command(g, { op: "choose", target: "3" });
    expect(g.pieces).toHaveLength(before + 4);
    expect(g.pieces.slice(-4).every((p) => !p.damaged)).toBe(true);
    expect(g.courtDiscard).toContain("mass-uprising");
  });
  it("Populist Demands may declare any ambition without changing the lead", () => {
    const g = fixture();
    actionPhase(g, "aggression");
    court(g, "populist-demands");
    command(g, { op: "secure", card: "populist-demands" });
    command(g, { op: "choose", ambition: "empath" });
    expect(g.markers[0]!.ambition).toBe("empath");
    expect(g.leadRank).toBe(2);
  });
  it("resolves Farseers from a Vox declaration before revealing the replacement Court card", () => {
    const g = fixture();
    actionPhase(g, "aggression");
    own(g, "p1", "farseers");
    court(g, "populist-demands");
    const next = g.courtDeck[0];
    command(g, { op: "secure", card: "populist-demands" });
    command(g, { op: "choose", ambition: "empath" });
    expect(g.court.some((c) => c.id === next)).toBe(false);
    command(g, { op: "choose", target: "p2" });
    command(g, { op: "choose", target: "skip" });
    expect(g.court.some((c) => c.id === next)).toBe(true);
  });
  it("Outrage Spreads affects every player, preserving Loyal cards", () => {
    const g = fixture();
    actionPhase(g, "aggression");
    court(g, "outrage-spreads");
    own(g, "p2", "loyal-engineers");
    command(g, { op: "secure", card: "outrage-spreads" });
    command(g, { op: "choose", resource: "material" });
    for (const p of g.players) expect(p.outrage).toContain("material");
    expect(g.player("p2").guilds).toContain("loyal-engineers");
  });
  it("Song of Freedom returns a controlled city and can seize initiative", () => {
    const g = fixture();
    actionPhase(g, "aggression", "p2");
    g.initiative = "p1";
    court(g, "song-of-freedom", ["p2"]);
    const city = g.pieces.find((p) => p.owner === "p2" && p.kind === "city")!;
    command(g, { op: "secure", card: "song-of-freedom" });
    command(g, { op: "choose", target: city.id, seize: "yes" });
    expect(g.pieces.some((p) => p.id === city.id)).toBe(false);
    expect(g.initiative).toBe("p2");
    expect(g.seized).toBe(true);
    expect(g.player("p2").outrage).toEqual([]);
    expect(g.courtDeck).toContain("song-of-freedom");
  });
  it("Guild Struggle steals and shuffles only Guild discards into the deck", () => {
    const g = fixture();
    actionPhase(g, "aggression");
    court(g, "guild-struggle");
    own(g, "p2", "farseers");
    g.courtDiscard = ["mining-interest", "mass-uprising"];
    g.courtDeck = g.courtDeck.filter((c) => !g.courtDiscard.includes(c));
    command(g, { op: "secure", card: "guild-struggle" });
    command(g, { op: "choose", target: "p2", card: "farseers" });
    expect(g.player("p1").guilds).toContain("farseers");
    expect(g.courtDeck).toContain("mining-interest");
    expect(g.courtDiscard).toEqual(["mass-uprising", "guild-struggle"]);
  });
  it("Call to Action draws the bottom discard and immediately refills the Court", () => {
    const g = fixture();
    actionPhase(g, "aggression");
    court(g, "call-to-action");
    const draw = g.actionDiscard[0]!,
      before = g.player("p1").hand.length;
    command(g, { op: "secure", card: "call-to-action" });
    expect(g.player("p1").hand).toHaveLength(before + 1);
    expect(g.player("p1").hand.at(-1)).toEqual(draw);
    expect(g.pending).toEqual([]);
    expect(g.courtDiscard).toContain("call-to-action");
  });
});
