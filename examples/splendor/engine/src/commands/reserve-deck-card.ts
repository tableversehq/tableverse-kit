import { t } from "@tabletop-kit/engine";
import { completeDiscovery, SPLENDOR_DISCOVERY_STEPS } from "../discovery.ts";
import {
  assertDevelopmentLevel,
  guardedAvailability,
  guardedValidate,
  isDevelopmentLevel,
  defineSplendorCommand,
} from "./shared.ts";

const reserveDeckCardCommandSchema = t.object({
  level: t.number(),
});

export type ReserveDeckCardInput = typeof reserveDeckCardCommandSchema.static;

const selectDeckLevelDiscoveryInputSchema = t.object({
  selectedLevel: t.optional(t.number()),
});

const selectDeckLevelDiscoveryOutputSchema = t.object({
  level: t.number(),
  cardCount: t.number(),
  source: t.string(),
});

const reserveDeckCardCommand = defineSplendorCommand({
  commandId: "reserve_deck_card",
  commandSchema: reserveDeckCardCommandSchema,
})
  .discoverable((step) => [
    step("select_deck_level")
      .initial()
      .input(selectDeckLevelDiscoveryInputSchema)
      .output(selectDeckLevelDiscoveryOutputSchema)
      .resolve(({ game, discovery }) => {
        const draft = discovery.input;
        const deckEntries = Object.entries(game.board.deckByLevel) as Array<
          [string, number[]]
        >;

        if (draft.selectedLevel) {
          return completeDiscovery({ level: draft.selectedLevel });
        }

        return deckEntries
          .filter(([, cardIds]) => cardIds.length > 0)
          .map(([level, cardIds]) => ({
            id: level,
            output: {
              level: Number(level),
              cardCount: cardIds.length,
              source: "deck",
            },
            nextInput: {
              selectedLevel: Number(level),
            },
            nextStep: SPLENDOR_DISCOVERY_STEPS.selectDeckLevel,
          }));
      })
      .build(),
  ])
  .isAvailable((context) => {
    return guardedAvailability(() => {
      const actorId = context.actorId;
      const game = context.game;
      const player = game.getPlayer(actorId);
      const decks = Object.values(game.board.deckByLevel) as number[][];

      if (!player.canReserveMoreCards()) {
        return false;
      }

      return decks.some((cards) => cards.length > 0);
    });
  })
  .validate(({ game, command }) => {
    return guardedValidate(() => {
      const actorId = command.actorId;
      const input = command.input;
      const player = game.getPlayer(actorId);

      if (!player.canReserveMoreCards()) {
        return { ok: false, reason: "reserved_limit_reached" };
      }

      const level = input.level;

      if (!isDevelopmentLevel(level)) {
        return { ok: false, reason: "invalid_level" };
      }

      if (game.board.deckByLevel[level].length === 0) {
        return { ok: false, reason: "deck_empty" };
      }

      return { ok: true };
    });
  })
  .execute(({ game, command, emitEvent }) => {
    const actorId = command.actorId;
    const input = command.input;
    const level = assertDevelopmentLevel(input.level);
    const player = game.getPlayer(actorId);
    const reservedCardId = game.board.reserveDeckCard(level);

    player.reserveCard(reservedCardId);
    const receivedGold = player.gainGoldFrom(game.bank);
    emitEvent({
      category: "domain",
      type: "card_reserved",
      payload: {
        actorId,
        source: "deck",
        level,
        cardId: reservedCardId,
        receivedGold,
      },
    });
  })
  .build();

export { reserveDeckCardCommand };
