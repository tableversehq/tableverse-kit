import { describe, it, expect } from "vitest";
import { executor } from "../src/game.ts";
import {
  actionDeck,
  AMBITIONS,
  COURT,
  RESOURCES,
  SETUPS,
  makeMap,
} from "../src/data.ts";
import type { Input } from "../src/input.ts";
import { applyInput, cloneGame } from "../src/rules.ts";
import { GameState } from "../src/state.ts";
import { fixedRng, seededRng } from "./helpers.ts";

function choices(g: GameState): Input[] {
  const id = g.pending[0]?.actor ?? g.active,
    p = g.player(id),
    pending = g.pending[0],
    b = g.battle[0];
  if (pending) {
    const target = g.players.find((p) => p.id !== id)!;
    switch (pending.kind) {
      case "mulligan":
        return [
          { op: "choose", target: "redraw" },
          { op: "choose", target: "keep" },
        ];
      case "resources": {
        const all = [...p.resources.filter(Boolean), ...pending.data].slice(
          0,
          g.capacity(id),
        );
        while (all.length < 6) all.push("");
        return [{ op: "choose", values: all }];
      }
      case "catapult":
        return [{ op: "choose", target: "done" }];
      case "regroup":
        return g.systems
          .filter((s) => !s.planet)
          .map((s) => ({ op: "choose", system: s.id }));
      case "ransack":
        return g.court
          .filter((c) => c.agents.includes(pending.target))
          .map((c) => ({ op: "choose", card: c.id }));
      case "farseers-rival":
        return [{ op: "choose", target: target.id }];
      case "farseers-swap":
        return [{ op: "choose", target: "skip" }];
      case "interest":
        return [
          { op: "choose" },
          ...g.players
            .filter((p) => p.id !== id)
            .flatMap((p) =>
              p.resources.flatMap((r, slot) =>
                r === pending.target
                  ? [{ op: "choose", target: p.id, slot }]
                  : [],
              ),
            ),
        ];
      case "pressgang-resources":
        return [
          {
            op: "choose",
            values: Array.from(
              { length: pending.count },
              (_, n) => RESOURCES[n % 5]!,
            ),
          },
        ];
      case "mass-uprising": {
        const systems = g.systems.filter(
          (s) => s.cluster === g.systems[0]!.cluster,
        );
        return [
          {
            op: "choose",
            target: String(systems[0]!.cluster),
            ids: systems.slice(0, g.available(id, "ship")).map((s) => s.id),
          },
        ];
      }
      case "populist-demands":
        return [
          ...AMBITIONS.map((ambition) => ({ op: "choose", ambition })),
          { op: "choose", target: "skip" },
        ];
      case "outrage-spreads":
        return RESOURCES.map((resource) => ({ op: "choose", resource }));
      case "song-of-freedom":
        return [
          ...g.pieces
            .filter((p) => p.kind === "city" && g.control(p.system) === id)
            .map((p) => ({ op: "choose", target: p.id })),
          { op: "choose", target: "skip" },
        ];
      case "guild-struggle":
        return [
          ...g.players
            .filter((p) => p.id !== id)
            .flatMap((p) =>
              p.guilds.map((card) => ({ op: "choose", target: p.id, card })),
            ),
          { op: "choose", target: "skip" },
        ];
      default:
        throw new Error(`Unresolved automatic choice ${pending.kind}`);
    }
  }
  if (b) {
    if (b.step === "roll") return [{ op: "reroll", ids: [] }];
    if (b.step === "raid")
      return [
        ...g.player(b.defender).guilds.map((card) => ({ op: "raid", card })),
        ...g
          .player(b.defender)
          .resources.flatMap((r, slot) => (r ? [{ op: "raid", slot }] : [])),
        { op: "done" },
      ];
    return g.at(b.system).map((p) => ({ op: "hit", target: p.id }));
  }
  if (g.phase === "card") {
    if (!p.hand.length) return [{ op: "pass" }];
    return p.hand.flatMap((c) => {
      const mode = !g.lead.length
        ? "lead"
        : c.suit === g.lead[0]?.suit && c.rank > g.leadRank
          ? "surpass"
          : c.suit !== g.lead[0]?.suit
            ? "pivot"
            : "copy";
      const ambition =
        (!g.lead.length ||
          (p.guilds.includes("galactic-bards") &&
            mode !== "copy" &&
            !g.declared)) &&
        g.markers.some((m) => !m.ambition)
          ? c.ambition === "any"
            ? "tycoon"
            : c.ambition
          : "";
      return [{ op: "play", card: c.id, mode, ambition }];
    });
  }
  const inputs: Input[] = [];
  for (const slot of p.resources.flatMap((r, slot) => (r ? [slot] : []))) {
    if (p.resources[slot] === "weapon") inputs.push({ op: "weapons", slot });
  }
  for (const c of g.court)
    inputs.push(
      { op: "secure", card: c.id },
      { op: "influence", card: c.id },
      { op: "abduct", card: c.id },
    );
  for (const piece of g.pieces) {
    if (piece.damaged) inputs.push({ op: "repair", target: piece.id });
    if (piece.kind === "city") inputs.push({ op: "tax", target: piece.id });
    if (piece.kind === "starport")
      inputs.push({
        op: "build",
        kind: "ship",
        system: piece.system,
        target: piece.id,
      });
  }
  for (const s of g.systems) {
    for (const kind of ["city", "starport"])
      inputs.push({ op: "build", kind, system: s.id });
    const ships = g.at(s.id, id, "ship");
    if (ships.length) {
      for (const dest of s.neighbors)
        inputs.push({ op: "move", ids: ships.map((p) => p.id), system: dest });
      for (const rival of g.players.filter((p) => p.id !== id))
        inputs.push(
          {
            op: "battle",
            system: s.id,
            target: rival.id,
            assault: Math.min(3, ships.length),
          },
          {
            op: "battle",
            system: s.id,
            target: rival.id,
            raid: Math.min(3, ships.length),
          },
        );
    }
  }
  inputs.push(
    { op: "manufacture" },
    { op: "synthesize" },
    { op: "execute", values: p.captives },
    { op: "pressgang", values: p.captives },
  );
  const resourceInputs = p.resources.flatMap((r, slot) =>
    r
      ? inputs.map((i) => ({ ...i, source: "resource", slot, resource: r }))
      : [],
  );
  for (const card of p.guilds) {
    inputs.push(
      { op: "guild", card },
      { op: "guild", card, slot: 0 },
      { op: "guild", card, ids: [] },
    );
    for (const s of g.systems) inputs.push({ op: "guild", card, system: s.id });
    for (const played of g.played)
      inputs.push({ op: "guild", card, target: played.card.id });
    for (const rival of g.players.filter((p) => p.id !== id)) {
      for (let slot = 0; slot < 6; slot++)
        inputs.push({ op: "guild", card, target: rival.id, slot });
      for (const kind of rival.guilds)
        inputs.push({ op: "guild", card, target: rival.id, kind });
    }
  }
  return [...inputs, ...resourceInputs, { op: "end" }];
}

function conserved(g: GameState): void {
  for (const resource of RESOURCES) {
    const blocked =
      g.order.length === 2
        ? makeMap([]).filter(
            (s) =>
              s.planet &&
              SETUPS.find((s) => s.id === g.setup)!.blocked.includes(
                s.cluster,
              ) &&
              s.resource === resource,
          ).length
        : 0;
    const total =
      (g.supply[resource] ?? 0) +
      blocked +
      g.players.reduce(
        (n, p) => n + p.resources.filter((r) => r === resource).length,
        0,
      ) +
      g.spent.filter((r) => r === resource).length +
      g.pending
        .filter((p) => p.kind === "resources")
        .reduce((n, p) => n + p.data.filter((r) => r === resource).length, 0);
    expect(total, `${resource} conservation`).toBe(5);
    expect(g.supply[resource]).toBeGreaterThanOrEqual(0);
  }
  const cards = [
    ...g.players.flatMap((p) => p.hand),
    ...g.actionDiscard,
    ...g.facedown,
    ...g.played.filter((p) => p.mode !== "copy").map((p) => p.card),
  ];
  if (!g.winner) {
    expect(cards).toHaveLength(actionDeck(g.order.length).length);
    expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
  }
  const resolving = new Set(
    g.pending.filter((p) => p.kind === "refill").map((p) => p.target),
  );
  const courtCards = [
    ...g.court.filter((c) => !resolving.has(c.id)).map((c) => c.id),
    ...g.courtDeck,
    ...g.courtDiscard,
    ...g.players.flatMap((p) => p.guilds),
    ...g.unions.map((u) => u.guild),
  ];
  for (const p of g.pending.filter((p) => resolving.has(p.kind)))
    if (!courtCards.includes(p.kind)) courtCards.push(p.kind);
  expect(courtCards).toHaveLength(COURT.length);
  expect(new Set(courtCards).size).toBe(COURT.length);
  for (const p of g.players) {
    for (const [kind, max] of [
      ["ship", 15],
      ["city", 5],
      ["starport", 5],
      ["agent", 10],
    ] satisfies [string, number][]) {
      const pieces =
        g.pieces.filter((x) => x.owner === p.id && x.kind === kind).length +
        g.players.reduce(
          (n, player) =>
            n +
            player.trophies.filter((t) => t.owner === p.id && t.kind === kind)
              .length,
          0,
        );
      const agents =
        kind === "agent"
          ? p.outrageAgents.length +
            g.players.reduce(
              (n, player) =>
                n + player.captives.filter((c) => c === p.id).length,
              0,
            ) +
            g.court.reduce(
              (n, c) => n + c.agents.filter((a) => a === p.id).length,
              0,
            )
          : 0;
      expect(pieces + agents).toBeLessThanOrEqual(max);
      expect(g.available(p.id, kind) + pieces + agents).toBe(max);
    }
    expect(p.resources).toHaveLength(6);
  }
  expect(new Set(g.pieces.map((p) => p.id)).size).toBe(g.pieces.length);
}

describe("complete seeded games through the Tableverse executor", () => {
  it.each([2, 3, 4])(
    "finishes %i-player games with conserved components and no stuck choices",
    (players) => {
      for (let seed = 1; seed <= 8; seed++) {
        let state = executor.createInitialState({
          seed: `full-${players}-${seed}`,
          players: Array.from({ length: players }, (_, n) => `p${n + 1}`),
        });
        const random = seededRng(seed),
          seen = new Set<string>();
        let steps = 0;
        while (!state.game.winner && steps < 1200) {
          const g = cloneGame(Object.assign(new GameState(), state.game));
          conserved(g);
          expect(
            g.phase === "actions" &&
              g.pips === 0 &&
              !g.prelude &&
              !g.pending.length &&
              !g.battle.length &&
              !g.rearrange.includes(g.active),
            "spent turn left open",
          ).toBe(false);
          const id = g.pending[0]?.actor ?? g.active,
            candidates = random.shuffle(choices(g));
          if (
            g.phase === "actions" &&
            !g.pending.length &&
            !g.battle.length &&
            g.pips > 0
          )
            candidates.sort(
              (a, b) => Number(a.op === "end") - Number(b.op === "end"),
            );
          const input = candidates.find((i) => {
            try {
              applyInput(cloneGame(g), id, i, fixedRng);
              return true;
            } catch {
              return false;
            }
          });
          expect(
            input,
            `seed ${seed}, step ${steps}, phase ${g.phase}, pending ${g.pending[0]?.kind}, battle ${g.battle[0]?.step}`,
          ).toBeDefined();
          if (!input) throw new Error("No legal command");
          seen.add(input.op);
          const before = JSON.stringify(state);
          const result = executor.executeCommand(state, {
            type: "act",
            actorId: id,
            input,
          });
          expect(
            result.ok,
            `${JSON.stringify(input)}: ${JSON.stringify(result)}`,
          ).toBe(true);
          expect(JSON.stringify(state)).toBe(before);
          state = result.state;
          steps++;
        }
        expect(
          state.game.winner,
          `seed ${seed}: exceeded ${steps} steps`,
        ).not.toBe("");
        expect(state.game.chapter).toBeLessThanOrEqual(5);
        expect(seen.has("play")).toBe(true);
        conserved(cloneGame(Object.assign(new GameState(), state.game)));
      }
    },
    30000,
  );
});
