import { configureVisibility, field, GameState, t } from "@tabletop-kit/engine";
import { developmentCardsById } from "../data/cards.ts";
import type { CardCost, DevelopmentCard } from "../data/types.ts";
import { type GemTokenColor } from "./constants.ts";
import {
  type ReturnTokensPayload,
  TokenCountsState,
} from "./token-counts-state.ts";

const TOKEN_COLOR_MAP = {
  White: "white",
  Blue: "blue",
  Green: "green",
  Red: "red",
  Black: "black",
} as const satisfies Record<keyof CardCost, GemTokenColor>;

function getCardOrThrow(cardId: number): DevelopmentCard {
  const card = developmentCardsById[cardId];

  if (!card) {
    throw new Error(`unknown_card:${cardId}`);
  }

  return card;
}

const hiddenReservedCardSchema = t.object({
  count: t.number(),
});

export class SplendorPlayerState extends GameState {
  @field(t.string())
  id = "";

  @field(t.state(() => TokenCountsState))
  tokens!: TokenCountsState;

  @field(t.array(t.number()))
  reservedCardIds: number[] = [];

  @field(t.array(t.number()))
  purchasedCardIds: number[] = [];

  @field(t.array(t.number()))
  nobleIds: number[] = [];

  static create(playerId: string): SplendorPlayerState {
    const player = new SplendorPlayerState();
    player.id = playerId;
    player.tokens = TokenCountsState.empty();
    player.reservedCardIds = [];
    player.purchasedCardIds = [];
    player.nobleIds = [];
    return player;
  }

  clone(): SplendorPlayerState {
    const clone = new SplendorPlayerState();
    clone.id = this.id;
    clone.tokens = this.tokens.clone();
    clone.reservedCardIds = [...this.reservedCardIds];
    clone.purchasedCardIds = [...this.purchasedCardIds];
    clone.nobleIds = [...this.nobleIds];
    return clone;
  }

  getDiscounts(): CardCost {
    const discounts: Record<keyof CardCost, number> = {
      White: 0,
      Blue: 0,
      Green: 0,
      Red: 0,
      Black: 0,
    };

    for (const cardId of this.purchasedCardIds) {
      const card = getCardOrThrow(cardId);
      discounts[card.bonusColor] += 1;
    }

    return discounts;
  }

  getScore(): number {
    const cardScore = this.purchasedCardIds.reduce(
      (total, cardId) => total + getCardOrThrow(cardId).prestigePoints,
      0,
    );

    return cardScore + this.nobleIds.length * 3;
  }

  getTokenCount(): number {
    return this.tokens.totalCount();
  }

  getRequiredReturnCount(limit = 10): number {
    return Math.max(this.getTokenCount() - limit, 0);
  }

  getAffordablePayment(card: DevelopmentCard): TokenCountsState | null {
    const discounts = this.getDiscounts();
    const spend = TokenCountsState.empty();
    let goldNeeded = 0;

    for (const [costColor, tokenColor] of Object.entries(TOKEN_COLOR_MAP)) {
      const colorKey = costColor as keyof CardCost;
      const cost = card.cost[colorKey];
      const discountedCost = Math.max(cost - discounts[colorKey], 0);
      const coloredSpend = Math.min(this.tokens[tokenColor], discountedCost);

      spend[tokenColor] = coloredSpend;
      goldNeeded += discountedCost - coloredSpend;
    }

    if (goldNeeded > this.tokens.gold) {
      return null;
    }

    spend.gold = goldNeeded;
    return spend;
  }

  canReserveMoreCards(): boolean {
    return this.reservedCardIds.length < 3;
  }

  reserveCard(cardId: number): void {
    this.reservedCardIds.push(cardId);
  }

  buyCard(cardId: number): void {
    this.purchasedCardIds.push(cardId);
  }

  removeReservedCard(cardId: number): void {
    this.reservedCardIds = this.reservedCardIds.filter(
      (reservedCardId) => reservedCardId !== cardId,
    );
  }

  claimNoble(nobleId: number): void {
    this.nobleIds.push(nobleId);
  }

  gainGoldFrom(bank: TokenCountsState): boolean {
    if (bank.gold <= 0) {
      return false;
    }

    bank.adjustColor("gold", -1);
    this.tokens.adjustColor("gold", 1);
    return true;
  }

  canReturnTokens(
    returnTokens: ReturnTokensPayload | undefined,
    requiredReturnCount: number,
  ): boolean {
    return this.tokens.canReturn(returnTokens, requiredReturnCount);
  }

  returnTokensTo(
    bank: TokenCountsState,
    returnTokens: ReturnTokensPayload | undefined,
  ): void {
    if (!returnTokens) {
      return;
    }

    this.tokens.transferTo(bank, returnTokens);
  }
}

configureVisibility(SplendorPlayerState, ({ field }) => ({
  ownedBy: field.id,
  fields: [
    field.reservedCardIds.visibleToSelf({
      schema: hiddenReservedCardSchema,
      derive(reservedCardIds) {
        return {
          count: reservedCardIds.length,
        };
      },
    }),
  ],
}));
