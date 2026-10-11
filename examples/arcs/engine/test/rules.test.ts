import { describe, expect, it } from "vitest";
import { executor } from "../src/game.ts";
import { actionDeck, DICE, makeMap, SETUPS } from "../src/data.ts";
import {
  applyInput,
  cloneGame,
  place,
  scoreChapter,
  setupGame,
} from "../src/rules.ts";
import { GameState } from "../src/state.ts";
import type { RNGApi } from "@tableverse-kit/engine";
const rng: RNGApi = {
  number: () => 0.5,
  die: () => 1,
  shuffle: (items) => [...items],
};
function state(n = 3) {
  const g = new GameState();
  setupGame(
    g,
    Array.from({ length: n }, (_, i) => `p${i + 1}`),
    rng,
  );
  g.pending = [];
  return g;
}
function act(
  g: GameState,
  input: Parameters<typeof applyInput>[2],
  id = g.pending[0]?.actor ?? g.active,
) {
  applyInput(g, id, input, rng);
}
function lead(g: GameState, suit = "construction", rank = 2) {
  const c = actionDeck(4).find((c) => c.suit === suit && c.rank === rank)!;
  g.player(g.active).hand = [c];
  act(g, { op: "play", card: c.id });
}

describe("official components and setup", () => {
  it("has the printed card ranks, suit-specific pips, and six faces per die", () => {
    expect(actionDeck(2)).toHaveLength(20);
    expect(actionDeck(4)).toHaveLength(28);
    expect(
      actionDeck(4)
        .slice(0, 7)
        .map((c) => c.pips),
    ).toEqual([4, 4, 3, 3, 3, 2, 1]);
    expect(
      actionDeck(4)
        .slice(7, 14)
        .map((c) => c.pips),
    ).toEqual([3, 3, 2, 2, 2, 2, 1]);
    expect(Object.values(DICE).map((d) => d.length)).toEqual([6, 6, 6]);
  });
  it("includes both cross-cluster planet borders and path-marker adjacency", () => {
    const m = makeMap([1, 4]);
    expect(m.find((s) => s.id === "2.3")?.neighbors).toContain("3.1");
    expect(m.find((s) => s.id === "5.3")?.neighbors).toContain("6.1");
    expect(m.find((s) => s.id === "6g")?.neighbors).toContain("2g");
  });
  it("all twelve setup cards place buildings on planets and ships in active systems", () => {
    for (const setup of SETUPS) {
      const m = makeMap(setup.blocked);
      expect(setup.positions).toHaveLength(setup.players);
      for (const positions of setup.positions) {
        expect(positions).toHaveLength(setup.players === 2 ? 4 : 3);
        positions.forEach((id, index) => {
          const s = m.find((s) => s.id === id);
          expect(s).toBeDefined();
          if (index < 2) expect(s?.planet).toBeGreaterThan(0);
        });
      }
    }
  });
  it.each([2, 3, 4])(
    "deals six private cards and finite pieces to %i players",
    (n) => {
      const g = state(n);
      for (const p of g.players) {
        expect(p.hand).toHaveLength(6);
        expect(
          g.pieces.filter((x) => x.owner === p.id && x.kind === "ship"),
        ).toHaveLength(n === 2 ? 10 : 8);
        expect(p.resources.filter(Boolean)).toHaveLength(2);
        expect(g.capacity(p.id)).toBe(3);
      }
      expect(g.court).toHaveLength(n === 2 ? 3 : 4);
    },
  );
});
describe("SDK contract", () => {
  it("hides opponent hands, deck order, and RNG from spectators", () => {
    const s = executor.createInitialState({
      seed: "privacy",
      players: ["a", "b", "c"],
    });
    const own = executor.getView(s, { kind: "player", playerId: "a" }),
      other = executor.getView(s, { kind: "player", playerId: "b" }),
      spectator = executor.getView(s, { kind: "spectator" });
    expect(
      Array.isArray(own.game.players.find((p) => p.id === "a")?.hand),
    ).toBe(true);
    expect(other.game.players.find((p) => p.id === "a")?.hand).toEqual({
      __hidden: true,
      value: { count: 6 },
    });
    expect(spectator.game.courtDeck).toMatchObject({ __hidden: true });
    expect(spectator).not.toHaveProperty("runtime");
  });
  it("rejects out-of-turn and malformed moves without changing canonical state", () => {
    const s = executor.createInitialState({
      seed: "authority",
      players: ["a", "b", "c"],
    });
    const active = s.game.active,
      other = s.game.order.find((id) => id !== active)!;
    const before = JSON.stringify(s);
    const bad = executor.executeCommand(s, {
      type: "act",
      actorId: other,
      input: { op: "play", card: "construction-2" },
    });
    expect(bad.ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });
  it("replays the same seed identically", () => {
    expect(
      executor.createInitialState({ seed: "repeat", players: ["a", "b", "c"] }),
    ).toEqual(
      executor.createInitialState({ seed: "repeat", players: ["a", "b", "c"] }),
    );
  });
});
describe("turn rules", () => {
  it("declaring sets the lead rank to zero without reducing pips", () => {
    const g = state();
    g.player(g.active).hand = [
      actionDeck(3).find((c) => c.id === "construction-4")!,
    ];
    act(g, { op: "play", card: "construction-4", ambition: "warlord" });
    expect(g.leadRank).toBe(0);
    expect(g.pips).toBe(3);
    expect(g.markers[0]?.ambition).toBe("warlord");
  });
  it("surpasses the lead, not the last played card", () => {
    const g = state();
    lead(g, "construction", 2);
    act(g, { op: "end" });
    g.player(g.active).hand = [
      actionDeck(3).find((c) => c.id === "construction-6")!,
    ];
    act(g, { op: "play", card: "construction-6", mode: "surpass" });
    act(g, { op: "end" });
    g.player(g.active).hand = [
      actionDeck(3).find((c) => c.id === "construction-4")!,
    ];
    act(g, { op: "play", card: "construction-4", mode: "surpass" });
    expect(g.pips).toBe(3);
  });
  it("does not disclose the identity of copied or sacrificed cards", () => {
    const g = state();
    lead(g);
    act(g, { op: "end" });
    const p = g.player(g.active),
      [c, extra] = p.hand;
    act(g, { op: "play", card: c!.id, mode: "copy", seize: extra!.id });
    expect(g.played.at(-1)?.card.id).toBe("hidden");
    expect(g.facedown).toHaveLength(2);
    expect(g.seized).toBe(true);
  });
  it("returns spent resources only when Prelude ends", () => {
    const g = state();
    lead(g);
    const p = g.player(g.active);
    p.resources[0] = "material";
    const before = g.supply.material;
    const city = g.pieces.find((x) => x.owner === p.id && x.kind === "city")!;
    city.damaged = true;
    act(g, {
      op: "repair",
      target: city.id,
      source: "resource",
      resource: "material",
      slot: 0,
    });
    expect(g.supply.material).toBe(before);
    expect(g.pips).toBe(4);
    city.damaged = true;
    act(g, { op: "repair", target: city.id });
    expect(g.supply.material).toBe((before ?? 0) + 1);
    expect(g.prelude).toBe(false);
  });
  it("limits taxation and starport construction per physical piece", () => {
    const g = state();
    lead(g, "administration");
    const city = g.pieces.find(
      (p) => p.owner === g.active && p.kind === "city",
    )!;
    act(g, { op: "tax", target: city.id });
    g.pending = [];
    expect(() => act(g, { op: "tax", target: city.id })).toThrow(
      "city_already_taxed",
    );
  });
  it("preserves all nested original state during command preflight", () => {
    const g = state(),
      before = JSON.stringify(g),
      copy = cloneGame(g);
    lead(copy);
    expect(JSON.stringify(g)).toBe(before);
  });
});
describe("combat and scoring", () => {
  it("control counts fresh ships and ties are uncontrolled", () => {
    const g = state(),
      s = g.systems[0]!.id;
    g.pieces = [];
    place(g, "p1", "ship", s);
    place(g, "p2", "ship", s);
    expect(g.control(s)).toBe("");
    g.pieces[1]!.damaged = true;
    expect(g.control(s)).toBe("p1");
  });
  it("prevents raiding a fleet while the defender has a building elsewhere", () => {
    const g = state();
    lead(g, "aggression");
    const s = g.systems[0]!.id;
    place(g, "p1", "ship", s);
    place(g, "p2", "ship", s);
    expect(() =>
      act(g, { op: "battle", system: s, target: "p2", raid: 1 }),
    ).toThrow("raid_requires_defending_buildings");
  });
  it("pays tied first place as second place and never rewards zero holdings", () => {
    const g = state();
    for (const p of g.players) p.resources = ["", "", "", "", "", ""];
    g.players[0]!.resources[0] = "relic";
    g.players[1]!.resources[0] = "relic";
    g.markers[0]!.ambition = "keeper";
    scoreChapter(g, rng);
    expect(g.players.map((p) => p.power)).toEqual([3, 3, 0]);
  });
  it("uses the two-player neutral holdings when scoring", () => {
    const g = state(2);
    for (const p of g.players) p.resources = ["", "", "", "", "", ""];
    g.players[0]!.resources[0] = "relic";
    g.neutral.keeper = 2;
    g.markers[0]!.ambition = "keeper";
    scoreChapter(g, rng);
    expect(g.players[0]!.power).toBe(3);
  });
  it("ends at the player-count threshold and breaks ties in initiative order", () => {
    const g = state();
    g.players[0]!.power = 30;
    g.players[1]!.power = 30;
    g.initiative = "p2";
    scoreChapter(g, rng);
    expect(g.winner).toBe("p2");
  });
});
