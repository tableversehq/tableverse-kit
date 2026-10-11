import { COURT, type ActionCard } from "arcs-engine/data";
import { GameState, PlayerState } from "arcs-engine/state";
import type { Game, PlayerView } from "../client.ts";

interface Hidden {
  __hidden: true;
}

export function isHidden(value: unknown): value is Hidden {
  return typeof value === "object" && value !== null && "__hidden" in value;
}

export function handOf(p: PlayerView): ActionCard[] {
  return isHidden(p.hand) ? [] : p.hand;
}

export function handCount(p: PlayerView): number {
  return isHidden(p.hand) ? (p.hand.value?.count ?? 0) : p.hand.length;
}

export function courtDeckCount(g: Game): number {
  return g.courtDeck.value.count;
}

const unknownCard = (i: number): ActionCard => ({
  id: `unknown-${i}`,
  suit: "",
  rank: 0,
  pips: 0,
  ambition: "",
});

function placeholderCourtDeck(g: Game): string[] {
  const seen = new Set([
    ...g.court.map((c) => c.id),
    ...g.courtDiscard,
    ...g.players.flatMap((p) => p.guilds),
    ...g.unions.map((u) => u.guild),
  ]);
  const unseen = COURT.map((c) => c.id).filter((id) => !seen.has(id));
  const count = courtDeckCount(g);
  return Array.from(
    { length: count },
    (_, i) => unseen[i % Math.max(1, unseen.length)] ?? "call-to-action",
  );
}

export function hydrate(g: Game): GameState {
  const players = g.players.map((p) =>
    Object.assign(new PlayerState(), {
      ...p,
      hand: isHidden(p.hand)
        ? Array.from({ length: handCount(p) }, (_, i) => unknownCard(i))
        : p.hand.map((c) => ({ ...c })),
      peek: isHidden(p.peek) ? [] : p.peek.map((c) => ({ ...c })),
      resources: [...p.resources],
      guilds: [...p.guilds],
      outrage: [...p.outrage],
      outrageAgents: [...p.outrageAgents],
      trophies: p.trophies.map((t) => ({ ...t })),
      captives: [...p.captives],
    }),
  );
  return Object.assign(new GameState(), {
    ...structuredClone({
      ...g,
      courtDeck: [],
      actionDiscard: [],
      facedown: [],
      players: [],
    }),
    players,
    courtDeck: placeholderCourtDeck(g),
    actionDiscard: [],
    facedown: [],
  });
}
