import { createCommandFactory, t } from "@tableverse-kit/engine";
import { events } from "./events.ts";
import { GameState } from "./state.ts";

const defineCommand = createCommandFactory<GameState, typeof events>();

export const score = defineCommand({
  commandId: "score",
  commandSchema: t.object({ points: t.number() }),
})
  .validate(({ command }) =>
    command.input.points > 0
      ? { ok: true as const }
      : { ok: false as const, reason: "points_must_be_positive" },
  )
  .execute(({ game, command, emitEvent }) => {
    game.scores[command.actorId] =
      (game.scores[command.actorId] ?? 0) + command.input.points;
    emitEvent({ type: "scored", payload: { points: command.input.points } });
  })
  .build();
