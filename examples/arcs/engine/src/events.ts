import { defineEvents, t } from "@tableverse-kit/engine";
export const events = defineEvents({
  changed: t.object({
    actor: t.string(),
    action: t.string(),
    chapter: t.number(),
    round: t.number(),
  }),
});
