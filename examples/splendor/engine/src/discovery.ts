import type { DiscoveryStepOption } from "@tableverse-kit/engine";
import {
  TOKEN_COLORS,
  type ReturnTokensPayload,
  type TokenCountsState,
} from "./state.ts";
import type { NobleTile } from "./data/types.ts";

export const SPLENDOR_DISCOVERY_STEPS = {
  selectFaceUpCard: "select_face_up_card",
  selectDeckLevel: "select_deck_level",
  selectReservedCard: "select_reserved_card",
  selectGemColor: "select_gem_color",
  selectReturnToken: "select_return_token",
  selectNoble: "select_noble",
} as const;

export type SplendorDiscoveryStep =
  (typeof SPLENDOR_DISCOVERY_STEPS)[keyof typeof SPLENDOR_DISCOVERY_STEPS];

export interface ReturnTokenDiscoveryOutput extends Record<string, unknown> {
  color: string;
  selectedCount: number;
  requiredReturnCount: number;
}

export interface NobleDiscoveryOutput extends Record<string, unknown> {
  nobleId: number;
  name: string;
  requirements: NobleTile["requirements"];
}

export function completeDiscovery<
  TCommandInput extends Record<string, unknown>,
>(input: TCommandInput) {
  return {
    complete: true as const,
    input,
  };
}

export function createReturnTokenDiscovery<
  TDiscoveryInput extends {
    returnTokens?: ReturnTokensPayload;
  } & Record<string, unknown>,
>(
  input: TDiscoveryInput,
  availableTokens: TokenCountsState,
  requiredReturnCount: number,
): DiscoveryStepOption<TDiscoveryInput, ReturnTokenDiscoveryOutput>[] | null {
  const currentReturnTokens = input.returnTokens ?? {};
  const selectedCount = sumReturnTokens(currentReturnTokens);

  if (selectedCount >= requiredReturnCount) {
    return null;
  }

  return TOKEN_COLORS.filter(
    (color) => availableTokens[color] > (currentReturnTokens[color] ?? 0),
  ).map((color) => ({
    id: color,
    output: {
      color,
      selectedCount: selectedCount + 1,
      requiredReturnCount,
    },
    nextInput: {
      ...input,
      returnTokens: {
        ...currentReturnTokens,
        [color]: (currentReturnTokens[color] ?? 0) + 1,
      },
    },
    nextStep: SPLENDOR_DISCOVERY_STEPS.selectReturnToken,
  }));
}

export function createNobleDiscovery<
  TDiscoveryInput extends {
    chosenNobleId?: number;
  } & Record<string, unknown>,
>(
  input: TDiscoveryInput,
  eligibleNobles: readonly NobleTile[],
): DiscoveryStepOption<TDiscoveryInput, NobleDiscoveryOutput>[] | null {
  if (eligibleNobles.length <= 1) {
    return null;
  }

  return eligibleNobles.map((noble) => ({
    id: String(noble.id),
    output: {
      nobleId: noble.id,
      name: noble.name,
      requirements: noble.requirements,
    },
    nextInput: {
      ...input,
      chosenNobleId: noble.id,
    },
    nextStep: SPLENDOR_DISCOVERY_STEPS.selectNoble,
  }));
}

function sumReturnTokens(tokens: ReturnTokensPayload): number {
  return TOKEN_COLORS.reduce((total, color) => total + (tokens[color] ?? 0), 0);
}
