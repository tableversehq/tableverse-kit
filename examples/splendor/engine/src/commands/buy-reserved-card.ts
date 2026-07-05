import { t } from "@tableverse-kit/engine";
import { completeDiscovery, SPLENDOR_DISCOVERY_STEPS } from "../discovery.ts";
import {
  defineSplendorCommand,
  guardedAvailability,
  guardedValidate,
} from "./shared.ts";

const buyReservedCardCommandSchema = t.object({
  cardId: t.number(),
});

export type BuyReservedCardInput = typeof buyReservedCardCommandSchema.static;

const selectReservedCardDiscoveryInputSchema = t.object({
  selectedCardId: t.optional(t.number()),
});

const selectReservedCardDiscoveryOutputSchema = t.object({
  cardId: t.number(),
  level: t.number(),
  bonusColor: t.string(),
  prestigePoints: t.number(),
  source: t.string(),
});

const buyReservedCardCommand = defineSplendorCommand({
  commandId: "buy_reserved_card",
  commandSchema: buyReservedCardCommandSchema,
})
  .discoverable((step) => [
    step("select_reserved_card")
      .initial()
      .input(selectReservedCardDiscoveryInputSchema)
      .output(selectReservedCardDiscoveryOutputSchema)
      .resolve(({ actorId, game, discovery }) => {
        const draft = discovery.input;
        const player = game.getPlayer(actorId);

        if (draft.selectedCardId) {
          return completeDiscovery({
            cardId: draft.selectedCardId,
          });
        }

        return player.reservedCardIds
          .filter((cardId: number) => {
            const card = game.getCard(cardId);

            return player.getAffordablePayment(card) !== null;
          })
          .map((cardId: number) => {
            const card = game.getCard(cardId);

            return {
              id: String(cardId),
              output: {
                cardId,
                level: card.level,
                bonusColor: card.bonusColor,
                prestigePoints: card.prestigePoints,
                source: "reserved",
              },
              nextInput: {
                ...draft,
                selectedCardId: cardId,
              },
              nextStep: SPLENDOR_DISCOVERY_STEPS.selectReservedCard,
            };
          });
      })
      .build(),
  ])
  .isAvailable((context) => {
    return guardedAvailability(() => {
      const actorId = context.actorId;
      const game = context.game;
      const player = game.getPlayer(actorId);

      return player.reservedCardIds.some((cardId: number) => {
        const card = game.getCard(cardId);

        return player.getAffordablePayment(card) !== null;
      });
    });
  })
  .validate(({ game, command }) => {
    return guardedValidate(() => {
      const actorId = command.actorId;
      const input = command.input;
      const player = game.getPlayer(actorId);

      if (!player.reservedCardIds.includes(input.cardId)) {
        return { ok: false, reason: "card_not_reserved" };
      }

      const card = game.getCard(input.cardId);

      if (!player.getAffordablePayment(card)) {
        return { ok: false, reason: "card_not_affordable" };
      }

      return { ok: true };
    });
  })
  .execute(({ game, command, emitEvent }) => {
    const actorId = command.actorId;
    const input = command.input;
    const player = game.getPlayer(actorId);
    const card = game.getCard(input.cardId);
    const payment = player.getAffordablePayment(card);

    if (!payment) {
      throw new Error("card_not_affordable");
    }

    player.tokens.transferTo(game.bank, payment);
    player.removeReservedCard(card.id);
    player.buyCard(card.id);
    emitEvent({
      category: "domain",
      type: "card_purchased",
      payload: {
        actorId,
        source: "reserved",
        cardId: card.id,
        payment,
      },
    });
  })
  .build();

export { buyReservedCardCommand };
