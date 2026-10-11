import { createCommandFactory, type RNGApi } from "@tableverse-kit/engine";
import { inputSchema } from "./input.ts";
import { GameState } from "./state.ts";
import { events } from "./events.ts";
import { applyInput, cloneGame } from "./rules.ts";
import { whiten } from "./random.ts";

const previewRng: RNGApi = {
  number: () => 0.5,
  die: (sides, count) =>
    count === undefined ? 1 : Array.from({ length: count }, () => 1),
  shuffle: (items) => [...items],
};
const defineCommand = createCommandFactory<GameState, typeof events>();
export const act = defineCommand({
  commandId: "act",
  commandSchema: inputSchema,
})
  .validate(({ game, command }) => {
    try {
      applyInput(cloneGame(game), command.actorId, command.input, previewRng);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : "invalid_move",
      };
    }
  })
  .execute(({ game, command, rng, emitEvent }) => {
    applyInput(game, command.actorId, command.input, whiten(rng));
    emitEvent({
      type: "changed",
      payload: {
        actor: command.actorId,
        action: command.input.op,
        chapter: game.chapter,
        round: game.round,
      },
    });
  })
  .build();
