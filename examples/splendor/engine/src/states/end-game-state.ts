import { field, GameState, t } from "@tabletop-kit/engine";

export class SplendorEndGameState extends GameState {
  @field(t.string())
  triggeredByPlayerId!: string;

  @field(t.string())
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
