import type { GameEvent } from "@tabletop-kit/engine";
import { field, GameState, t } from "@tabletop-kit/engine";
import { developmentCardsById } from "../data/cards.ts";
import { nobleTilesById } from "../data/nobles.ts";
import type { CardCost, DevelopmentCard, NobleTile } from "../data/types.ts";
import { type GemTokenColor } from "./constants.ts";
import { SplendorBoardState } from "./board-state.ts";
import { SplendorEndGameState } from "./end-game-state.ts";
import { SplendorPlayerState } from "./player-state.ts";
import { TokenCountsState } from "./token-counts-state.ts";

const TOKEN_COLOR_MAP = {
  White: "white",
  Blue: "blue",
  Green: "green",
  Red: "red",
  Black: "black",
} as const satisfies Record<keyof CardCost, GemTokenColor>;

export class SplendorGameState extends GameState {
  @field(t.array(t.string()))
  playerOrder: string[] = [];

  @field(
    t.record(
      t.string(),
      t.state(() => SplendorPlayerState),
    ),
  )
  players: Record<string, SplendorPlayerState> = {};

  @field(t.state(() => TokenCountsState))
  bank!: TokenCountsState;

  @field(t.state(() => SplendorBoardState))
  board!: SplendorBoardState;

  @field(t.optional(t.state(() => SplendorEndGameState)))
  endGame?: SplendorEndGameState;

  @field(t.optional(t.array(t.string())))
  winnerIds?: string[];

  static createInitial(playerIds: readonly string[]): SplendorGameState {
    const game = new SplendorGameState();
    game.playerOrder = [...playerIds];
    game.players = Object.fromEntries(
      playerIds.map((playerId) => [
        playerId,
        SplendorPlayerState.create(playerId),
      ]),
    ) as Record<string, SplendorPlayerState>;
    game.bank = TokenCountsState.empty();
    game.board = SplendorBoardState.createEmpty();
    game.endGame = undefined;
    game.winnerIds = undefined;
    return game;
  }

  initializePlayers(playerIds: readonly string[]): void {
    this.playerOrder = [...playerIds];
    this.players = Object.fromEntries(
      playerIds.map((playerId) => [
        playerId,
        SplendorPlayerState.create(playerId),
      ]),
    ) as Record<string, SplendorPlayerState>;
  }

  initializeBank(playerCount: number): void {
    this.bank = TokenCountsState.createBank(playerCount);
  }

  resetEndGame(): void {
    this.endGame = undefined;
    this.winnerIds = undefined;
  }

  getPlayer(playerId: string): SplendorPlayerState {
    const player = this.players[playerId];

    if (!player) {
      throw new Error(`unknown_player:${playerId}`);
    }

    return player;
  }

  getCard(cardId: number): DevelopmentCard {
    const card = developmentCardsById[cardId];

    if (!card) {
      throw new Error(`unknown_card:${cardId}`);
    }

    return card;
  }

  getNextPlayerId(playerId: string): string {
    const index = this.playerOrder.indexOf(playerId);

    if (index === -1) {
      throw new Error(`unknown_player:${playerId}`);
    }

    return this.playerOrder[(index + 1) % this.playerOrder.length]!;
  }

  getLastPlayerId(): string {
    const lastPlayerId = this.playerOrder[this.playerOrder.length - 1];

    if (!lastPlayerId) {
      throw new Error("player_order_empty");
    }

    return lastPlayerId;
  }

  getEligibleNobles(player: SplendorPlayerState): NobleTile[] {
    const discounts = player.getDiscounts();

    return this.board.nobleIds
      .map((nobleId) => nobleTilesById[nobleId])
      .filter((noble): noble is NobleTile => noble !== undefined)
      .filter((noble) =>
        Object.keys(TOKEN_COLOR_MAP).every((costColor) => {
          const colorKey = costColor as keyof CardCost;
          return discounts[colorKey] >= noble.requirements[colorKey];
        }),
      );
  }

  resolveNobleVisit(
    player: SplendorPlayerState,
    chosenNobleId?: number,
  ): number | null {
    const eligibleNobles = this.getEligibleNobles(player);

    if (eligibleNobles.length === 0) {
      return null;
    }

    if (eligibleNobles.length === 1) {
      const noble = eligibleNobles[0]!;
      player.claimNoble(noble.id);
      this.board.removeNoble(noble.id);
      return noble.id;
    }

    if (!chosenNobleId) {
      throw new Error("chosen_noble_required");
    }

    const chosenNoble = eligibleNobles.find(
      (noble) => noble.id === chosenNobleId,
    );

    if (!chosenNoble) {
      throw new Error("invalid_chosen_noble");
    }

    player.claimNoble(chosenNoble.id);
    this.board.removeNoble(chosenNoble.id);
    return chosenNoble.id;
  }

  resolveTurnEnd(actorId: string, emitEvent: (event: GameEvent) => void): void {
    const player = this.getPlayer(actorId);

    if (!this.endGame && player.getScore() >= 15) {
      this.endGame = SplendorEndGameState.create(
        actorId,
        this.getLastPlayerId(),
      );

      emitEvent({
        category: "runtime",
        type: "end_game_triggered",
        payload: {
          actorId,
          endsAfterPlayerId: this.endGame.endsAfterPlayerId,
        },
      });
    }

    if (this.endGame && actorId === this.endGame.endsAfterPlayerId) {
      this.finalizeWinners();
      emitEvent({
        category: "runtime",
        type: "game_finished",
        payload: {
          winnerIds: this.winnerIds,
        },
      });
    }
  }

  private finalizeWinners(): void {
    const players = Object.values(this.players);
    const highestScore = Math.max(
      ...players.map((player) => player.getScore()),
    );
    const highestScorers = players.filter(
      (player) => player.getScore() === highestScore,
    );
    const fewestPurchasedCards = Math.min(
      ...highestScorers.map((player) => player.purchasedCardIds.length),
    );

    this.winnerIds = highestScorers
      .filter(
        (player) => player.purchasedCardIds.length === fewestPurchasedCards,
      )
      .map((player) => player.id);
  }
}
