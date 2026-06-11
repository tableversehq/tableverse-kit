import { defineGameState, t } from "@tabletop-kit/engine";

export class SplendorEndGameState {
  triggeredByPlayerId!: string;

  endsAfterPlayerId!: string;

  static create(
    triggeredByPlayerId: string,
    endsAfterPlayerId: string,
  ): SplendorEndGameState {
    const endGame = new SplendorEndGameState();
    endGame.triggeredByPlayerId = triggeredByPlayerId;
    endGame.endsAfterPlayerId = endsAfterPlayerId;
    return endGame;
  }
}

export const SplendorEndGame = defineGameState()
  .model({
    triggeredByPlayerId: t.string(),
    endsAfterPlayerId: t.string(),
  })
  .stateClass(SplendorEndGameState)
  .build();
