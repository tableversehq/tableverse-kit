import { t } from "@tableverse-kit/engine";
import { completeDiscovery, SPLENDOR_DISCOVERY_STEPS } from "../discovery.ts";
import {
  assertDevelopmentLevel,
  guardedAvailability,
  guardedValidate,
  isDevelopmentLevel,
  defineSplendorCommand,
} from "./shared.ts";

const buyFaceUpCardCommandSchema = t.object({
  level: t.number(),
  cardId: t.number(),
});

export type BuyFaceUpCardInput = typeof buyFaceUpCardCommandSchema.static;

const selectFaceUpCardDiscoveryInputSchema = t.object({
  selectedLevel: t.optional(t.number()),
  selectedCardId: t.optional(t.number()),
});

const selectFaceUpCardDiscoveryOutputSchema = t.object({
  level: t.number(),
  cardId: t.number(),
  bonusColor: t.string(),
  prestigePoints: t.number(),
  source: t.string(),
});

const buyFaceUpCardCommand = defineSplendorCommand({
  commandId: "buy_face_up_card",
  commandSchema: buyFaceUpCardCommandSchema,
})
  .discoverable((step) => [
    step("select_face_up_card")
      .initial()
      .input(selectFaceUpCardDiscoveryInputSchema)
      .output(selectFaceUpCardDiscoveryOutputSchema)
      .resolve(({ actorId, game, discovery }) => {
        const draft = discovery.input;
        const player = game.getPlayer(actorId);
        const faceUpEntries = Object.entries(game.board.faceUpByLevel) as Array<
          [string, number[]]
        >;

        if (draft.selectedLevel && draft.selectedCardId) {
          return completeDiscovery({
            level: draft.selectedLevel,
            cardId: draft.selectedCardId,
          });
        }

        return faceUpEntries.flatMap(([level, cardIds]) =>
          cardIds
            .filter((cardId: number) => {
              const card = game.getCard(cardId);

              return player.getAffordablePayment(card) !== null;
            })
            .map((cardId: number) => {
              const card = game.getCard(cardId);

              return {
                id: `${level}:${cardId}`,
                output: {
                  level: Number(level),
                  cardId,
                  bonusColor: card.bonusColor,
                  prestigePoints: card.prestigePoints,
                  source: "face_up",
                },
                nextInput: {
                  ...draft,
                  selectedLevel: Number(level),
                  selectedCardId: cardId,
                },
                nextStep: SPLENDOR_DISCOVERY_STEPS.selectFaceUpCard,
              };
            }),
        );
      })
      .build(),
  ])
  .isAvailable((context) => {
    return guardedAvailability(() => {
      const actorId = context.actorId;
      const game = context.game;
      const player = game.getPlayer(actorId);
      const faceUpEntries = Object.entries(game.board.faceUpByLevel) as Array<
        [string, number[]]
      >;

      return faceUpEntries.some(([level, cardIds]) =>
        cardIds.some((cardId: number) => {
          const card = game.getCard(cardId);

          return (
            card.level === Number(level) &&
            player.getAffordablePayment(card) !== null
          );
        }),
      );
    });
  })
  .validate(({ game, command }) => {
    return guardedValidate(() => {
      const actorId = command.actorId;
      const input = command.input;

      const level = input.level;

      if (!isDevelopmentLevel(level)) {
        return { ok: false, reason: "invalid_level" };
      }

      if (!game.board.faceUpByLevel[level].includes(input.cardId)) {
        return { ok: false, reason: "card_not_face_up" };
      }

      const player = game.getPlayer(actorId);
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
    const level = assertDevelopmentLevel(input.level);
    const player = game.getPlayer(actorId);
    const card = game.getCard(input.cardId);
    const payment = player.getAffordablePayment(card);

    if (!payment) {
      throw new Error("card_not_affordable");
    }

    player.tokens.transferTo(game.bank, payment);
    player.buyCard(card.id);
    game.board.removeFaceUpCard(level, card.id);
    game.board.replenishFaceUpCard(level);
    emitEvent({
      category: "domain",
      type: "card_purchased",
      payload: {
        actorId,
        source: "face_up",
        level,
        cardId: card.id,
        payment,
      },
    });
  })
  .build();

export { buyFaceUpCardCommand };
