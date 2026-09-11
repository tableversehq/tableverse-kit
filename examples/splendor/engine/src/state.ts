import { defineGameState, t } from "@tableverse-kit/engine";

export class GameState {
  players: string[] = [];

  scores: Record<string, number> = {};
}

export const gameState = defineGameState()
  .model({
    players: t.array(t.string()),
    scores: t.record(t.string(), t.number()),
  })
  .stateClass(GameState)
  .build();
