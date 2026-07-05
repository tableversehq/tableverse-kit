import { defineGameState, t } from "@tableverse-kit/engine";
import { TOKEN_COLORS, type TokenColor } from "./constants.ts";

export type ReturnTokensPayload = Partial<Record<TokenColor, number>>;

export class TokenCountsState {
  white = 0;

  blue = 0;

  green = 0;

  red = 0;

  black = 0;

  gold = 0;

  static empty(): TokenCountsState {
    const tokens = new TokenCountsState();
    tokens.white = 0;
    tokens.blue = 0;
    tokens.green = 0;
    tokens.red = 0;
    tokens.black = 0;
    tokens.gold = 0;
    return tokens;
  }

  static createBank(playerCount: number): TokenCountsState {
    const gemSupply = TokenCountsState.getGemSupplyPerColor(playerCount);
    const bank = TokenCountsState.empty();

    bank.white = gemSupply;
    bank.blue = gemSupply;
    bank.green = gemSupply;
    bank.red = gemSupply;
    bank.black = gemSupply;
    bank.gold = 5;
    return bank;
  }

  private static getGemSupplyPerColor(playerCount: number): number {
    switch (playerCount) {
      case 2:
        return 4;
      case 3:
        return 5;
      case 4:
        return 7;
      default:
        throw new Error(`unsupported_player_count:${playerCount}`);
    }
  }

  clone(): TokenCountsState {
    const clone = new TokenCountsState();

    for (const color of TOKEN_COLORS) {
      clone[color] = this[color];
    }

    return clone;
  }

  adjustColor(color: TokenColor, amount: number): void {
    this[color] += amount;
  }

  applyDelta(delta: Partial<Record<TokenColor, number>>, multiplier = 1): void {
    for (const color of TOKEN_COLORS) {
      this.adjustColor(color, (delta[color] ?? 0) * multiplier);
    }
  }

  totalCount(): number {
    return TOKEN_COLORS.reduce((total, color) => total + this[color], 0);
  }

  canReturn(
    returnTokens: ReturnTokensPayload | undefined,
    requiredReturnCount: number,
  ): boolean {
    const normalizedReturnTokens = returnTokens ?? {};

    if (
      TOKEN_COLORS.reduce(
        (total, color) => total + (normalizedReturnTokens[color] ?? 0),
        0,
      ) !== requiredReturnCount
    ) {
      return false;
    }

    for (const color of TOKEN_COLORS) {
      const amount = normalizedReturnTokens[color] ?? 0;

      if (!Number.isInteger(amount) || amount < 0 || amount > this[color]) {
        return false;
      }
    }

    return true;
  }

  transferTo(
    target: TokenCountsState,
    delta: Partial<Record<TokenColor, number>>,
  ): void {
    this.applyDelta(delta, -1);
    target.applyDelta(delta, 1);
  }
}

export const TokenCounts = defineGameState()
  .model({
    white: t.number(),
    blue: t.number(),
    green: t.number(),
    red: t.number(),
    black: t.number(),
    gold: t.number(),
  })
  .stateClass(TokenCountsState)
  .build();
