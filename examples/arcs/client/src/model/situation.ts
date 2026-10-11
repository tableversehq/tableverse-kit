import type { Game, Input } from "../client.ts";
import { pipVerbs, preludeFlows, spendFlow } from "./actions.ts";
import { ok, type Ctx, type Flow } from "./flow.ts";
import { SUIT_INFO, courtName, playerName, systemName } from "./text.ts";
import { battleFlow, pendingFlow, playFlow } from "./turn.ts";

export interface Global {
  id: string;
  label: string;
  input: Input;
  confirm?: string;
  tone: "primary" | "quiet" | "danger";
}

export interface Situation {
  actor: string;
  mine: boolean;
  phase: "card" | "actions" | "pending" | "battle" | "over";
  doing: string;
  focus?: Flow;
  verbs: ReturnType<typeof pipVerbs>;
  spend?: Flow;
  preludes: Flow[];
  globals: Global[];
}

const PENDING_TEXT: Record<string, (g: Game, target: string) => string> = {
  mulligan: () => "deciding whether to redraw their hand",
  resources: () => "choosing which resources to keep",
  catapult: (g, t) =>
    `deciding whether to keep moving from ${systemName(g, t)}`,
  regroup: () => "choosing a gate to regroup",
  ransack: () => "ransacking the Court",
  "farseers-rival": () => "choosing a hand to inspect with Farseers",
  "farseers-swap": () => "deciding on a Farseers swap",
  interest: () => "collecting from their Interest",
  "pressgang-resources": () => "choosing Pressgang resources",
  "mass-uprising": () => "resolving Mass Uprising",
  "populist-demands": () => "resolving Populist Demands",
  "outrage-spreads": () => "resolving Outrage Spreads",
  "song-of-freedom": () => "resolving Song of Freedom",
  "guild-struggle": () => "resolving Guild Struggle",
};

const BATTLE_TEXT: Record<string, string> = {
  roll: "deciding on Skirmisher rerolls",
  self: "assigning hits to their own ships",
  intercept: "assigning intercept hits",
  ship: "assigning hits to the defender",
  building: "assigning hits to buildings",
  raid: "raiding",
};

export function situation(
  view: Game,
  ctx: Ctx | undefined,
  viewer: string | null,
): Situation {
  const g = view;
  const p = g.pending[0];
  const b = g.battle[0];
  const actor = p?.actor ?? (b && !p ? b.attacker : g.active);
  const mine = !!ctx && actor === viewer && !g.winner;
  const empty = { verbs: [], preludes: [], globals: [] };
  if (g.winner)
    return {
      actor: g.winner,
      mine: false,
      phase: "over",
      doing: `with ${g.players.find((x) => x.id === g.winner)?.power ?? 0} Power`,
      ...empty,
    };
  if (p) {
    const text =
      PENDING_TEXT[p.kind]?.(g, p.target) ?? `resolving ${courtName(p.kind)}`;
    return {
      actor,
      mine,
      phase: "pending",
      doing: text,
      focus: mine && ctx ? pendingFlow(ctx) : undefined,
      ...empty,
    };
  }
  if (b)
    return {
      actor,
      mine,
      phase: "battle",
      doing: `${BATTLE_TEXT[b.step] ?? "battling"} in ${systemName(g, b.system)}`,
      focus: mine && ctx ? battleFlow(ctx) : undefined,
      ...empty,
    };
  if (g.phase === "card") {
    const globals: Global[] = [];
    if (mine && ctx && ok(ctx, { op: "pass" }))
      globals.push({
        id: "pass",
        label: "Pass initiative",
        input: { op: "pass" },
        confirm: "Pass the initiative to the next player and skip this round?",
        tone: "quiet",
      });
    return {
      actor,
      mine,
      phase: "card",
      doing: g.lead.length
        ? `choosing a card to follow ${SUIT_INFO[g.lead[0]?.suit ?? ""]?.name}`
        : "choosing a card to lead",
      focus: mine && ctx ? playFlow(ctx) : undefined,
      ...empty,
      globals,
    };
  }
  const played = g.played.find((x) => x.owner === actor);
  const verbs = SUIT_INFO[g.suit]?.verbs ?? "";
  const doing = `taking actions · ${g.pips} left${verbs ? ` · ${verbs}` : ""}`;
  if (!mine || !ctx)
    return {
      actor,
      mine,
      phase: "actions",
      doing: played ? doing : "taking actions",
      ...empty,
    };
  const globals: Global[] = [];
  if (ok(ctx, { op: "end" }))
    globals.push({
      id: "end",
      label: g.pips ? "End turn" : "Done",
      input: { op: "end" },
      confirm: g.pips
        ? `End your turn with ${g.pips} action${g.pips > 1 ? "s" : ""} unused?`
        : undefined,
      tone: g.pips ? "quiet" : "primary",
    });
  return {
    actor,
    mine,
    phase: "actions",
    doing,
    verbs: pipVerbs(ctx),
    spend: g.prelude ? spendFlow(ctx) : undefined,
    preludes: preludeFlows(ctx),
    globals,
  };
}

export function actorLabel(
  g: Game,
  s: Situation,
  viewer: string | null,
): string {
  if (s.phase === "over") return `${playerName(g, s.actor)} wins`;
  return s.actor === viewer ? "Your turn" : `${playerName(g, s.actor)}'s turn`;
}
