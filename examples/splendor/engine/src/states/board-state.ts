import { configureVisibility, field, GameState, t } from "@tabletop-kit/engine";
import type { DevelopmentLevel } from "../data/types.ts";

const hiddenDeckSchema = t.object({
  1: t.number(),
  2: t.number(),
  3: t.number(),
});

export class SplendorBoardState extends GameState {
  @field(t.record(t.number(), t.array(t.number())))
  faceUpByLevel: Record<DevelopmentLevel, number[]> = {
    1: [],
    2: [],
    3: [],
  };

  @field(t.record(t.number(), t.array(t.number())))
  deckByLevel: Record<DevelopmentLevel, number[]> = {
    1: [],
    2: [],
    3: [],
  };

  @field(t.array(t.number()))
  nobleIds: number[] = [];

  static createEmpty(): SplendorBoardState {
    const board = new SplendorBoardState();
    board.faceUpByLevel = {
      1: [],
      2: [],
      3: [],
    };
    board.deckByLevel = {
      1: [],
      2: [],
      3: [],
    };
    board.nobleIds = [];
    return board;
  }

  setLevelCards(
    level: DevelopmentLevel,
    faceUpCardIds: number[],
    deckCardIds: number[],
  ): void {
    this.faceUpByLevel[level] = faceUpCardIds;
    this.deckByLevel[level] = deckCardIds;
  }

  setNobles(nobleIds: number[]): void {
    this.nobleIds = nobleIds;
  }

  removeFaceUpCard(level: DevelopmentLevel, cardId: number): void {
    this.faceUpByLevel[level] = this.faceUpByLevel[level].filter(
      (faceUpCardId) => faceUpCardId !== cardId,
    );
  }

  replenishFaceUpCard(level: DevelopmentLevel): void {
    const nextCardId = this.deckByLevel[level].shift();

    if (nextCardId !== undefined) {
      this.faceUpByLevel[level].push(nextCardId);
    }
  }

  reserveDeckCard(level: DevelopmentLevel): number {
    const cardId = this.deckByLevel[level].shift();

    if (cardId === undefined) {
      throw new Error("deck_empty");
    }

    return cardId;
  }

  removeNoble(nobleId: number): void {
    this.nobleIds = this.nobleIds.filter(
      (currentNobleId) => currentNobleId !== nobleId,
    );
  }
}

configureVisibility(SplendorBoardState, ({ field }) => ({
  fields: [
    field.deckByLevel.hidden({
      schema: hiddenDeckSchema,
      derive(deckByLevel) {
        return {
          1: deckByLevel[1]?.length ?? 0,
          2: deckByLevel[2]?.length ?? 0,
          3: deckByLevel[3]?.length ?? 0,
        };
      },
    }),
  ],
}));
