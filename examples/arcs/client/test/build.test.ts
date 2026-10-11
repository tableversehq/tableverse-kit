import { describe, expect, it } from "vitest";
import { executor } from "arcs-engine";
import { verbFlow } from "../src/model/actions.ts";
import { isStep, type Ctx } from "../src/model/flow.ts";
import { hydrate } from "../src/model/hydrate.ts";

describe("build targets", () => {
  it("offer a full planet only for a ship at your own starport", () => {
    const state = executor.createInitialState({
      seed: "build",
      players: ["p1", "p2", "p3"],
    });
    const g = state.game;
    const me = g.active;
    Object.assign(g, {
      phase: "actions",
      suit: "construction",
      pips: 3,
      prelude: false,
      lead: [
        {
          id: "construction-2",
          suit: "construction",
          rank: 2,
          pips: 3,
          ambition: "tyrant",
        },
      ],
    });
    const port = g.pieces.find((p) => p.owner === me && p.kind === "starport")!;
    const planet = g.systems.find((s) => s.id === port.system)!;
    while (
      g.pieces.filter((p) => p.system === planet.id && p.kind !== "ship")
        .length < planet.slots
    )
      g.pieces.push({
        id: `filler-${g.pieces.length}`,
        owner: me,
        kind: "city",
        system: planet.id,
        damaged: false,
      });
    const view = executor.getView(state, { kind: "player", playerId: me }).game;
    const ctx: Ctx = { view, base: hydrate(view), me };
    const flow = verbFlow(ctx, "build", { source: "pip" });
    const kinds = flow.run({ system: planet.id });
    expect(isStep(kinds) && kinds.choices?.map((c) => c.value)).toEqual([
      "ship",
    ]);
  });
});
