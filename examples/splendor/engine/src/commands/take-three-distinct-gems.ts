import { t } from "@tableverse-kit/engine";
import { completeDiscovery, SPLENDOR_DISCOVERY_STEPS } from "../discovery.ts";
import {
  assertGemTokenColor,
  guardedAvailability,
  guardedValidate,
  isGemTokenColor,
  defineSplendorCommand,
} from "./shared.ts";

const takeThreeDistinctGemsCommandSchema = t.object({
  colors: t.array(t.string()),
});

export type TakeThreeDistinctGemsInput =
  typeof takeThreeDistinctGemsCommandSchema.static;

const selectGemColorDiscoveryInputSchema = t.object({
  selectedColors: t.optional(t.array(t.string())),
});

const selectGemColorDiscoveryOutputSchema = t.object({
  color: t.string(),
  selectedCount: t.number(),
  requiredCount: t.number(),
});

const takeThreeDistinctGemsCommand = defineSplendorCommand({
  commandId: "take_three_distinct_gems",
  commandSchema: takeThreeDistinctGemsCommandSchema,
})
  .discoverable((step) => [
    step("select_gem_color")
      .initial()
      .input(selectGemColorDiscoveryInputSchema)
      .output(selectGemColorDiscoveryOutputSchema)
      .resolve(({ game, discovery }) => {
        const draft = discovery.input;
        const selectedColors = draft.selectedColors ?? [];

        if (selectedColors.length >= 3) {
          return completeDiscovery({ colors: selectedColors });
        }

        const bankEntries = Object.entries(game.bank) as Array<
          [string, number]
        >;

        return bankEntries
          .filter(
            ([color, count]) =>
              color !== "gold" && count > 0 && !selectedColors.includes(color),
          )
          .map(([color]) => ({
            id: color,
            output: {
              color,
              selectedCount: selectedColors.length + 1,
              requiredCount: 3,
            },
            nextInput: {
              selectedColors: [...selectedColors, color],
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

      return (
        bankEntries.filter(([color, count]) => color !== "gold" && count > 0)
          .length >= 3
      );
    });
  })
  .validate(({ game, command }) => {
    return guardedValidate(() => {
      const input = command.input;

      if (input.colors.length !== 3) {
        return { ok: false, reason: "three_colors_required" };
      }

      const colors = input.colors;

      if (!colors.every((color) => isGemTokenColor(color))) {
        return { ok: false, reason: "invalid_color" };
      }

      const uniqueColors = new Set(colors);

      if (uniqueColors.size !== 3) {
        return { ok: false, reason: "colors_must_be_distinct" };
      }

      for (const color of colors) {
        if (game.bank[color] <= 0) {
          return { ok: false, reason: "token_color_unavailable" };
        }
      }

      return { ok: true };
    });
  })
  .execute(({ game, command, emitEvent }) => {
    const actorId = command.actorId;
    const input = command.input;
    const colors = input.colors;

    if (!colors.every((color) => isGemTokenColor(color))) {
      throw new Error("invalid_color");
    }

    const player = game.getPlayer(actorId);

    for (const rawColor of colors) {
      const color = assertGemTokenColor(rawColor);
      game.bank.adjustColor(color, -1);
      player.tokens.adjustColor(color, 1);
    }

    emitEvent({
      category: "domain",
      type: "gems_taken",
      payload: {
        actorId,
        colors,
      },
    });
  })
  .build();

export { takeThreeDistinctGemsCommand };
