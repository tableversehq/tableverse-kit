import { defineEvents, t } from "@tableverse-kit/engine";

export const events = defineEvents({
  scored: t.object({ points: t.number() }),
});
