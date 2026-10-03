import { defineEvents, t } from "@tableverse-kit/engine";

export const events = defineEvents({
  marked: t.object({
    cell: t.number(),
    mark: t.string({ enum: ["X", "O"] }),
    playerId: t.string(),
  }),
  ended: t.object({
    outcome: t.string({ enum: ["won", "drawn"] }),
    winner: t.string(),
    winningLine: t.array(t.number()),
  }),
});
