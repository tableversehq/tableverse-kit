import { t, type ObjectSchemaStatic } from "@tableverse-kit/engine";
export const inputSchema = t.object({
  op: t.string(),
  card: t.optional(t.string()),
  mode: t.optional(t.string()),
  ambition: t.optional(t.string()),
  seize: t.optional(t.string()),
  target: t.optional(t.string()),
  system: t.optional(t.string()),
  kind: t.optional(t.string()),
  source: t.optional(t.string()),
  resource: t.optional(t.string()),
  slot: t.optional(t.number()),
  giveSlot: t.optional(t.number()),
  amount: t.optional(t.number()),
  ids: t.optional(t.array(t.string())),
  values: t.optional(t.array(t.string())),
  assault: t.optional(t.number()),
  skirmish: t.optional(t.number()),
  raid: t.optional(t.number()),
});
export type Input = ObjectSchemaStatic<typeof inputSchema.properties>;
