import type { GameState } from "arcs-engine/state";
import type { Game, Input } from "../client.ts";
import { attempt } from "./oracle.ts";
import { RESOURCE_INFO } from "./text.ts";

export type Answer = string | number | string[];
export type Answers = Record<string, Answer>;

export interface Target {
  key: string;
  value: string;
  label: string;
  detail?: string;
}

export interface Choice {
  value: string;
  label: string;
  detail?: string;
  tone?: "primary" | "danger" | "quiet";
  disabled?: string;
}

export interface Param {
  id: string;
  label: string;
  min: number;
  max: number;
  value: number;
  color?: string;
}

export interface Step {
  id: string;
  prompt: string;
  detail?: string;
  targets?: Target[];
  choices?: Choice[];
  params?: Param[];
  multi?: { min: number; max: number; confirm: string };
  confirm?: string;
  tokens?: { value: string; resource: string }[];
  highlight?: string[];
}

export type Outcome = Step | { input: Input; then?: Input[] };

export interface Flow {
  id: string;
  label: string;
  hint?: string;
  run(a: Answers): Outcome;
}

export interface Ctx {
  view: Game;
  base: GameState;
  me: string;
}

export const isStep = (o: Outcome): o is Step => !("input" in o);

export const key = {
  system: (id: string) => `system:${id}`,
  piece: (id: string) => `piece:${id}`,
  court: (id: string) => `court:${id}`,
  hand: (id: string) => `hand:${id}`,
  played: (id: string) => `played:${id}`,
  resource: (player: string, slot: number) => `resource:${player}:${slot}`,
  guild: (player: string, card: string) => `guild:${player}:${card}`,
  die: (index: number) => `die:${index}`,
  player: (id: string) => `player:${id}`,
};

export function str(a: Answers, id: string): string | undefined {
  const v = a[id];
  return typeof v === "string" ? v : undefined;
}

export function num(a: Answers, id: string, fallback: number): number {
  const v = a[id];
  return typeof v === "number" ? v : fallback;
}

export function list(a: Answers, id: string): string[] {
  const v = a[id];
  return Array.isArray(v) ? v : [];
}

export function tryInput(ctx: Ctx, input: Input) {
  return attempt(ctx.base, ctx.me, input);
}

export function ok(ctx: Ctx, input: Input): boolean {
  return tryInput(ctx, input).ok;
}

export function effects(ctx: Ctx, input: Input): string | undefined {
  const trial = tryInput(ctx, input);
  if (!trial.ok) return undefined;
  const before = ctx.base.player(ctx.me),
    after = trial.after.player(ctx.me);
  const parts: string[] = [];
  const count = (rs: string[]) =>
    rs.reduce<Record<string, number>>((m, r) => {
      if (r) m[r] = (m[r] ?? 0) + 1;
      return m;
    }, {});
  const pending = trial.after.pending.find(
    (p) => p.kind === "resources" && p.actor === ctx.me,
  );
  const gainedAfter = count([...after.resources, ...(pending?.data ?? [])]),
    had = count(before.resources);
  for (const [r, n] of Object.entries(gainedAfter)) {
    const diff = n - (had[r] ?? 0);
    if (diff > 0) parts.push(`+${diff} ${RESOURCE_INFO[r]?.name ?? r}`);
  }
  const captives = after.captives.length - before.captives.length;
  if (captives > 0)
    parts.push(`captures ${captives} agent${captives > 1 ? "s" : ""}`);
  const trophies = after.trophies.length - before.trophies.length;
  if (trophies > 0) parts.push(`+${trophies} trophy`);
  const guilds = after.guilds.filter((c) => !before.guilds.includes(c));
  if (guilds.length) parts.push("gain the card");
  const placed = trial.after.pieces.filter(
    (p) => !ctx.base.pieces.some((q) => q.id === p.id),
  );
  if (placed.some((p) => p.damaged))
    parts.push("placed damaged — rival control");
  return parts.join(" · ") || undefined;
}
