import { t } from "@tableverse-kit/engine";
import { completeDiscovery, createReturnTokenDiscovery } from "../discovery.ts";
import {
  defineSplendorCommand,
  guardedAvailability,
  guardedValidate,
} from "./shared.ts";

const returnTokensCommandSchema = t.object({
  returnTokens: t.record(t.string(), t.number()),
});

export type ReturnTokensInput = typeof returnTokensCommandSchema.static;

const selectReturnTokenDiscoveryInputSchema = t.object({
  returnTokens: t.optional(t.record(t.string(), t.number())),
});

const selectReturnTokenDiscoveryOutputSchema = t.object({
  color: t.string(),
  selectedCount: t.number(),
  requiredReturnCount: t.number(),
});

const returnTokensCommand = defineSplendorCommand({
  commandId: "return_tokens",
  commandSchema: returnTokensCommandSchema,
})
  .discoverable((step) => [
    step("select_return_token")
      .initial()
      .input(selectReturnTokenDiscoveryInputSchema)
      .output(selectReturnTokenDiscoveryOutputSchema)
      .resolve(({ actorId, game, discovery }) => {
        const draft = discovery.input;
        const player = game.getPlayer(actorId);
        const requiredReturnCount = player.getRequiredReturnCount();
        const returnDiscovery = createReturnTokenDiscovery(
          draft,
          player.tokens,
          requiredReturnCount,
        );

        return (
          returnDiscovery ??
          completeDiscovery({
            returnTokens: draft.returnTokens ?? {},
          })
        );
      })
      .build(),
  ])
  .isAvailable((context) => {
    return guardedAvailability(() => {
      const player = context.game.getPlayer(context.actorId);

      return player.getRequiredReturnCount() > 0;
    });
  })
  .validate(({ game, command }) => {
    return guardedValidate(() => {
      const player = game.getPlayer(command.actorId);
      const requiredReturnCount = player.getRequiredReturnCount();

      if (requiredReturnCount === 0) {
        return { ok: false, reason: "not_in_overflow" };
      }

      if (
        !player.canReturnTokens(command.input.returnTokens, requiredReturnCount)
      ) {
        return { ok: false, reason: "invalid_return_tokens" };
      }

      return { ok: true };
    });
  })
  .execute(({ game, command, emitEvent }) => {
    const player = game.getPlayer(command.actorId);

    player.returnTokensTo(game.bank, command.input.returnTokens);
    emitEvent({
      category: "domain",
      type: "tokens_returned",
      payload: {
        actorId: command.actorId,
        returnTokens: command.input.returnTokens,
      },
    });
  })
  .build();

export { returnTokensCommand };
