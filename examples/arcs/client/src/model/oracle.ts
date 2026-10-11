import { applyInput, cloneGame } from "arcs-engine/rules";
import type { GameState } from "arcs-engine/state";
import type { Input } from "../client.ts";

const previewRng: Parameters<typeof applyInput>[3] = {
  number: () => 0.5,
  die: (sides, count) =>
    count === undefined ? 1 : Array.from({ length: count }, () => 1),
  shuffle: (items) => [...items],
};

export type Trial =
  | { ok: true; after: GameState }
  | { ok: false; reason: string };

const cache = new WeakMap<GameState, Map<string, Trial>>();

export function attempt(base: GameState, actor: string, input: Input): Trial {
  let memo = cache.get(base);
  if (!memo) {
    memo = new Map();
    cache.set(base, memo);
  }
  const key = `${actor}|${JSON.stringify(input)}`;
  const known = memo.get(key);
  if (known) return known;
  let trial: Trial;
  try {
    const after = cloneGame(base);
    applyInput(after, actor, input, previewRng);
    trial = { ok: true, after };
  } catch (error) {
    trial = {
      ok: false,
      reason: error instanceof Error ? error.message : "invalid_move",
    };
  }
  memo.set(key, trial);
  return trial;
}

export const legal = (base: GameState, actor: string, input: Input) =>
  attempt(base, actor, input).ok;
