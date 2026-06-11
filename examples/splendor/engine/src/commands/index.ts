import { buyFaceUpCardCommand } from "./buy-face-up-card.ts";
import { buyReservedCardCommand } from "./buy-reserved-card.ts";
import { chooseNobleCommand } from "./choose-noble.ts";
import { reserveDeckCardCommand } from "./reserve-deck-card.ts";
import { reserveFaceUpCardCommand } from "./reserve-face-up-card.ts";
import { returnTokensCommand } from "./return-tokens.ts";
import { takeThreeDistinctGemsCommand } from "./take-three-distinct-gems.ts";
import { takeTwoSameGemsCommand } from "./take-two-same-gems.ts";

export function createCommands() {
  return [
    takeThreeDistinctGemsCommand,
    takeTwoSameGemsCommand,
    reserveFaceUpCardCommand,
    reserveDeckCardCommand,
    buyFaceUpCardCommand,
    buyReservedCardCommand,
  ] as const;
}

export { chooseNobleCommand, returnTokensCommand };

export type { BuyFaceUpCardInput } from "./buy-face-up-card.ts";
export type { BuyReservedCardInput } from "./buy-reserved-card.ts";
export type { ChooseNobleInput } from "./choose-noble.ts";
export type { ReserveDeckCardInput } from "./reserve-deck-card.ts";
export type { ReserveFaceUpCardInput } from "./reserve-face-up-card.ts";
export type { ReturnTokensInput } from "./return-tokens.ts";
export type { TakeThreeDistinctGemsInput } from "./take-three-distinct-gems.ts";
export type { TakeTwoSameGemsInput } from "./take-two-same-gems.ts";
