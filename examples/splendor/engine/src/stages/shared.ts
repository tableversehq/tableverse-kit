import type { RuntimeState } from "@tabletop-kit/engine";

export function getLastActingPlayerId(runtime: Readonly<RuntimeState>): string {
  const lastActingStage = runtime.progression.lastActingStage;
  const actorId =
    lastActingStage?.kind === "activePlayer"
      ? lastActingStage.activePlayerId
      : undefined;

  if (!actorId) {
    throw new Error("last_acting_player_missing");
  }

  return actorId;
}
