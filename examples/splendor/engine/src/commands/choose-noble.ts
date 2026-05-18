import { t } from "@tabletop-kit/engine";
import { completeDiscovery, createNobleDiscovery } from "../discovery.ts";
import {
  defineSplendorCommand,
  guardedAvailability,
  guardedValidate,
} from "./shared.ts";

const chooseNobleCommandSchema = t.object({
  nobleId: t.number(),
});

export type ChooseNobleInput = typeof chooseNobleCommandSchema.static;

const selectNobleDiscoveryInputSchema = t.object({
  chosenNobleId: t.optional(t.number()),
});

const nobleRequirementsSchema = t.object({
  White: t.number(),
  Blue: t.number(),
  Black: t.number(),
  Red: t.number(),
  Green: t.number(),
});

const selectNobleDiscoveryOutputSchema = t.object({
  nobleId: t.number(),
  name: t.string(),
  requirements: nobleRequirementsSchema,
});

const chooseNobleCommand = defineSplendorCommand({
  commandId: "choose_noble",
  commandSchema: chooseNobleCommandSchema,
})
  .discoverable((step) => [
    step("select_noble")
      .initial()
      .input(selectNobleDiscoveryInputSchema)
      .output(selectNobleDiscoveryOutputSchema)
      .resolve(({ actorId, discovery, game }) => {
        const draft = discovery.input;
        const player = game.getPlayer(actorId);

        if (draft.chosenNobleId) {
          return completeDiscovery({
            nobleId: draft.chosenNobleId,
          });
        }

        return createNobleDiscovery(draft, game.getEligibleNobles(player));
      })
      .build(),
  ])
  .isAvailable((context) => {
    return guardedAvailability(() => {
      const actorId = context.actorId;
      const player = context.game.getPlayer(actorId);

      return context.game.getEligibleNobles(player).length > 1;
    });
  })
  .validate(({ game, command }) => {
    return guardedValidate(() => {
      const actorId = command.actorId;
      const player = game.getPlayer(actorId);
      const eligibleNobles = game.getEligibleNobles(player);

      if (eligibleNobles.length <= 1) {
        return { ok: false, reason: "noble_choice_not_required" };
      }

      if (!eligibleNobles.some((noble) => noble.id === command.input.nobleId)) {
        return { ok: false, reason: "invalid_chosen_noble" };
      }

      return { ok: true };
    });
  })
  .execute(({ game, command, emitEvent }) => {
    const actorId = command.actorId;
    const player = game.getPlayer(actorId);
    const claimedNobleId = game.resolveNobleVisit(
      player,
      command.input.nobleId,
    );

    if (claimedNobleId === null) {
      throw new Error("noble_choice_not_required");
    }

    emitEvent({
      category: "domain",
      type: "noble_claimed",
      payload: {
        actorId,
        nobleId: claimedNobleId,
      },
    });
  })
  .build();

export { chooseNobleCommand };
