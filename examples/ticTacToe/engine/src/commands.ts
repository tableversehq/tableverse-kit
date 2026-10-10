import { createCommandFactory, t } from "@tableverse-kit/engine";
import { events } from "./events.ts";
import { BOARD_SIZE, GameState } from "./state.ts";

const defineCommand = createCommandFactory<GameState, typeof events>();

export const place = defineCommand({
  commandId: "place",
  commandSchema: t.object({
    cell: t.number({ min: 0, max: BOARD_SIZE - 1 }),
  }),
})
  .validate(({ game, command }) =>
    game.isCellOpen(command.input.cell)
      ? { ok: true }
      : { ok: false, reason: "cell_already_taken" },
  )
  .execute(({ game, command, emitEvent }) => {
    const mark = game.markOf(command.actorId);
    game.board[command.input.cell] = mark;
    emitEvent({
      type: "marked",
      payload: { cell: command.input.cell, mark, playerId: command.actorId },
    });
  })
  .build();
