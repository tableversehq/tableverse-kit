import type { RNGApi } from "@tableverse-kit/engine";
import { actionDeck, courtCard } from "../src/data.ts";
import type { Input } from "../src/input.ts";
import { applyInput, place, setupGame } from "../src/rules.ts";
import { GameState } from "../src/state.ts";

export const fixedRng: RNGApi = {
  number: () => 0.5,
  die: () => 1,
  shuffle: (items) => [...items],
};
export function seededRng(seed: number): RNGApi {
  let cursor = seed;
  const number = () => {
    cursor = (Math.imul(cursor, 1664525) + 1013904223) >>> 0;
    return cursor / 4294967296;
  };
  return {
    number,
    die: () => 1,
    shuffle: (items) => {
      const copy = [...items];
      for (let n = copy.length - 1; n > 0; n--) {
        const index = Math.floor(number() * (n + 1));
        const value = copy[n]!;
        copy[n] = copy[index]!;
        copy[index] = value;
      }
      return copy;
    },
  };
}
export function fixture(players = 3): GameState {
  const g = new GameState();
  setupGame(
    g,
    Array.from({ length: players }, (_, n) => `p${n + 1}`),
    fixedRng,
  );
  g.pending = [];
  return g;
}
export function actionPhase(
  g: GameState,
  suit = "construction",
  actor = "p1",
): void {
  g.active = actor;
  g.leader = actor;
  g.phase = "actions";
  g.suit = suit;
  g.pips = 4;
  g.prelude = true;
  g.lead = [actionDeck(4).find((c) => c.id === `${suit}-2`)!];
  g.leadRank = 2;
}
export function command(g: GameState, input: Input, rng = fixedRng): void {
  applyInput(g, g.pending[0]?.actor ?? g.active, input, rng);
}
export function arrange(g: GameState): void {
  const pending = g.pending[0];
  if (pending?.kind !== "resources") return;
  const p = g.player(pending.actor),
    all = [...p.resources.filter(Boolean), ...pending.data];
  const values = all.slice(0, g.capacity(p.id));
  while (values.length < 6) values.push("");
  command(g, { op: "choose", values });
}
export function own(g: GameState, id: string, card: string): void {
  courtCard(card);
  g.court = g.court.filter((c) => c.id !== card);
  g.courtDeck = g.courtDeck.filter((c) => c !== card);
  g.courtDiscard = g.courtDiscard.filter((c) => c !== card);
  for (const p of g.players) p.guilds = p.guilds.filter((c) => c !== card);
  g.player(id).guilds.push(card);
}
export function court(g: GameState, card: string, agents = ["p1"]): void {
  courtCard(card);
  g.court = g.court.filter((c) => c.id !== card);
  g.courtDeck = g.courtDeck.filter((c) => c !== card);
  g.courtDiscard = g.courtDiscard.filter((c) => c !== card);
  for (const p of g.players) p.guilds = p.guilds.filter((c) => c !== card);
  g.court.unshift({ id: card, agents });
}
export function add(
  g: GameState,
  owner: string,
  kind: string,
  system: string,
  damaged = false,
) {
  place(g, owner, kind, system, damaged);
  return g.pieces.at(-1)!;
}
