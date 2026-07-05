import { t } from "@tableverse-kit/engine";
import { completeDiscovery, SPLENDOR_DISCOVERY_STEPS } from "../discovery.ts";
import {
  assertGemTokenColor,
  guardedAvailability,
  guardedValidate,
  isGemTokenColor,
  defineSplendorCommand,
} from "./shared.ts";

const takeTwoSameGemsCommandSchema = t.object({
  color: t.string(),
});

export type TakeTwoSameGemsInput = typeof takeTwoSameGemsCommandSchema.static;

const selectGemColorDiscoveryInputSchema = t.object({
  selectedColor: t.optional(t.string()),
});

const selectGemColorDiscoveryOutputSchema = t.object({
  color: t.string(),
  amount: t.number(),
});

const takeTwoSameGemsCommand = defineSplendorCommand({
  commandId: "take_two_same_gems",
  commandSchema: takeTwoSameGemsCommandSchema,
})
  .discoverable((step) => [
    step("select_gem_color")
      .initial()
      .input(selectGemColorDiscoveryInputSchema)
      .output(selectGemColorDiscoveryOutputSchema)
      .resolve(({ game, discovery }) => {
        const draft = discovery.input;

        if (draft.selectedColor) {
          return completeDiscovery({ color: draft.selectedColor });
        }

        const bankEntries = Object.entries(game.bank) as Array<
          [string, number]
        >;

        return bankEntries
          .filter(([color, count]) => color !== "gold" && count >= 4)
          .map(([color]) => ({
            id: color,
            output: {
              color,
              amount: 2,
            },
            nextInput: {
              selectedColor: color,
            },
            nextStep: SPLENDOR_DISCOVERY_STEPS.selectGemColor,
          }));
      })
      .build(),
  ])
  .isAvailable((context) => {
    return guardedAvailability(() => {
      const game = context.game;
      const bankEntries = Object.entries(game.bank) as Array<[string, number]>;

      return bankEntries.some(
        ([color, count]) => color !== "gold" && count >= 4,
      );
    });
  })
  .validate(({ game, command }) => {
    return guardedValidate(() => {
      const input = command.input;

      const color = input.color;

      if (!isGemTokenColor(color)) {
        return { ok: false, reason: "invalid_color" };
      }

      if (game.bank[color] < 4) {
        return { ok: false, reason: "not_enough_tokens_for_double_take" };
      }

      return { ok: true };
    });
  })
  .execute(({ game, command, emitEvent }) => {
    const actorId = command.actorId;
    const input = command.input;
    const color = assertGemTokenColor(input.color);
    const player = game.getPlayer(actorId);

    game.bank.adjustColor(color, -2);
    player.tokens.adjustColor(color, 2);
    emitEvent({
      category: "domain",
      type: "double_gem_taken",
      payload: {
        actorId,
        color,
      },
    });
  })
  .build();

export { takeTwoSameGemsCommand };
