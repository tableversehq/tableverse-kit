import type { RNGApi } from "@tabletop-kit/engine";
import { developmentCardsByLevel } from "./data/cards.ts";
import { nobleTiles } from "./data/nobles.ts";
import { SplendorGameState } from "./state.ts";

export function setupSplendorGame(
  game: SplendorGameState,
  rng: RNGApi,
  playerIds: readonly string[],
): void {
  game.initializePlayers(playerIds);
  game.initializeBank(playerIds.length);
  game.resetEndGame();

  for (const level of [1, 2, 3] as const) {
    const deck = [
      ...rng.shuffle(developmentCardsByLevel[level].map((card) => card.id)),
    ];
    game.board.setLevelCards(level, deck.splice(0, 4), deck);
  }

  game.board.setNobles([
    ...rng
      .shuffle(nobleTiles.map((noble) => noble.id))
      .slice(0, playerIds.length + 1),
  ]);
}
