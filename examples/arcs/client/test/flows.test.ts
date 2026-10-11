import { describe, expect, it } from "vitest";
import { executor } from "arcs-engine";
import type { Input } from "arcs-engine/input";
import {
  isStep,
  type Answers,
  type Ctx,
  type Flow,
} from "../src/model/flow.ts";
import { hydrate } from "../src/model/hydrate.ts";
import { attempt } from "../src/model/oracle.ts";
import { situation } from "../src/model/situation.ts";

type State = ReturnType<typeof executor.createInitialState>;

function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function actorOf(state: State): string {
  const g = state.game;
  return g.pending[0]?.actor ?? (g.battle[0] ? g.battle[0].attacker : g.active);
}

function drive(flow: Flow, random: () => number): Input[] | undefined {
  const a: Answers = {};
  for (let i = 0; i < 12; i++) {
    const out = flow.run(a);
    if (!isStep(out)) return [out.input, ...(out.then ?? [])];
    const pick = <T>(xs: T[]) => xs[Math.floor(random() * xs.length)];
    for (const p of out.params ?? [])
      a[p.id] = p.min + Math.floor(random() * (p.max - p.min + 1));
    if (out.multi) {
      const values = [
        ...(out.targets ?? []).map((t) => t.value),
        ...(out.choices ?? []).map((c) => c.value),
      ];
      a[out.id] = values.slice(0, out.multi.min);
      a.go = "yes";
      continue;
    }
    const options = [
      ...(out.targets ?? []).map((t) => t.value),
      ...(out.choices ?? [])
        .filter((c) => c.value !== "cancel" && !c.disabled)
        .map((c) => c.value),
    ];
    if (options.length) a[out.id] = pick(options) ?? "";
    else if (out.confirm) a[out.id] = "yes";
    else return undefined;
  }
  return undefined;
}

function play(players: number, seed: number, maxCommands: number) {
  const ids = Array.from({ length: players }, (_, i) => `p${i + 1}`);
  let state = executor.createInitialState({
    seed: `flows-${seed}`,
    players: ids,
  });
  const random = rng(seed + 11);
  let commands = 0;
  let disagreements = 0;
  let routed = 0;
  while (!state.game.winner && commands < maxCommands) {
    const me = actorOf(state);
    const view = executor.getView(state, { kind: "player", playerId: me });
    const ctx: Ctx = { view: view.game, base: hydrate(view.game), me };
    const sit = situation(view.game, ctx, me);
    expect(sit.mine).toBe(true);
    const flows: Flow[] = sit.focus
      ? [sit.focus]
      : [
          ...sit.verbs.filter((v) => v.available).map((v) => v.flow),
          ...(sit.spend ? [sit.spend] : []),
          ...sit.preludes,
        ];
    let input: Input | undefined;
    let then: Input[] = [];
    for (let tries = 0; tries < 8 && !input; tries++) {
      const end = sit.globals.find((x) => x.id === "end");
      if (end && (random() < 0.15 || !flows.length)) input = end.input;
      else if (flows.length) {
        const candidate = drive(
          flows[Math.floor(random() * flows.length)]!,
          random,
        );
        if (candidate?.[0] && attempt(ctx.base, me, candidate[0]).ok) {
          input = candidate[0];
          then = candidate.slice(1);
        }
      }
    }
    input ??=
      sit.globals.find((x) => x.id === "end")?.input ?? sit.globals[0]?.input;
    if (!input)
      throw new Error(
        `stuck: ${JSON.stringify({ phase: sit.phase, doing: sit.doing })}`,
      );
    const result = executor.executeCommand(state, {
      type: "act",
      actorId: me,
      input,
    });
    if (!result.ok) {
      disagreements++;
      throw new Error(
        `rejected ${JSON.stringify(input)} in ${sit.phase}: ${JSON.stringify(result)}`,
      );
    }
    state = result.state;
    commands++;
    for (const next of then) {
      const followed = executor.executeCommand(state, {
        type: "act",
        actorId: me,
        input: next,
      });
      if (!followed.ok)
        throw new Error(`rejected follow-up ${JSON.stringify(next)}`);
      state = followed.state;
      commands++;
      routed++;
    }
  }
  return { state, commands, disagreements, routed };
}

describe("UI flows drive complete games", () => {
  for (const [players, seed] of [
    [2, 1],
    [3, 2],
    [4, 3],
    [3, 4],
    [4, 5],
  ] as const)
    it(`${players} players, seed ${seed}`, () => {
      const { state, disagreements } = play(players, seed, 4000);
      expect(disagreements).toBe(0);
      expect(state.game.winner).not.toBe("");
    }, 60_000);
  it("plays multi-step catapult routes as one move", () => {
    const routed = [1, 2, 3].reduce(
      (n, seed) => n + play(3, seed + 10, 4000).routed,
      0,
    );
    expect(routed).toBeGreaterThan(0);
  }, 60_000);
});
