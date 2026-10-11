import { describe, expect, it } from "vitest";
import { executor } from "../src/game.ts";

describe("battle dice", () => {
  it("are not correlated from one die to the next", () => {
    const faces: number[] = [];
    for (let seed = 0; seed < 40; seed++) {
      let state = executor.createInitialState({
        seed: `dice-${seed}`,
        players: ["p1", "p2", "p3"],
      });
      const g = state.game;
      const me = g.active;
      const rival = g.order.find((id) => id !== me)!;
      const at = g.pieces.find(
        (p) => p.owner === me && p.kind === "ship",
      )!.system;
      for (const p of g.pieces.filter((x) => x.owner === rival).slice(0, 2))
        p.system = at;
      for (let i = 0; i < 4; i++)
        g.pieces.push({
          id: `extra-${i}`,
          owner: me,
          kind: "ship",
          system: at,
          damaged: false,
        });
      Object.assign(g, {
        phase: "actions",
        suit: "aggression",
        pips: 3,
        prelude: false,
        lead: [
          {
            id: "aggression-2",
            suit: "aggression",
            rank: 2,
            pips: 3,
            ambition: "tyrant",
          },
        ],
      });
      const result = executor.executeCommand(state, {
        type: "act",
        actorId: me,
        input: { op: "battle", system: at, target: rival, skirmish: 6 },
      });
      expect(result.ok).toBe(true);
      if (result.ok) state = result.state;
      faces.push(...(state.game.rolls[0]?.dice.map((d) => d.face) ?? []));
    }
    let same = 0;
    for (let i = 1; i < faces.length; i++)
      if (faces[i] === faces[i - 1]) same++;
    expect(faces.length).toBeGreaterThan(200);
    expect(same / (faces.length - 1)).toBeLessThan(0.3);
    for (let f = 0; f < 6; f++)
      expect(faces.filter((x) => x === f).length).toBeGreaterThan(
        faces.length / 12,
      );
  });
});
