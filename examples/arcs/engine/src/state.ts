import {
  defineGameState,
  t,
  type SerializableFieldStatic,
} from "@tableverse-kit/engine";
import { courtCard, type ActionCard, type MapSystem } from "./data.ts";

export const actionCardSchema = t.object({
  id: t.string(),
  suit: t.string(),
  rank: t.number(),
  pips: t.number(),
  ambition: t.string(),
});
export const pieceSchema = t.object({
  id: t.string(),
  owner: t.string(),
  kind: t.string(),
  system: t.string(),
  damaged: t.boolean(),
});
export type Piece = SerializableFieldStatic<typeof pieceSchema>;
export const markerSchema = t.object({
  first: t.number(),
  second: t.number(),
  flipped: t.boolean(),
  ambition: t.string(),
});
export const courtSchema = t.object({
  id: t.string(),
  agents: t.array(t.string()),
});
const pendingSchema = t.object({
  kind: t.string(),
  actor: t.string(),
  target: t.string(),
  count: t.number(),
  data: t.array(t.string()),
});
export type Pending = SerializableFieldStatic<typeof pendingSchema>;
const dieSchema = t.object({ type: t.string(), face: t.number() });
const battleSchema = t.object({
  system: t.string(),
  attacker: t.string(),
  defender: t.string(),
  step: t.string(),
  self: t.number(),
  intercept: t.number(),
  ship: t.number(),
  building: t.number(),
  keys: t.number(),
  rerolled: t.boolean(),
  dice: t.array(dieSchema),
});
export type Battle = SerializableFieldStatic<typeof battleSchema>;
const rollSchema = t.object({
  serial: t.number(),
  system: t.string(),
  attacker: t.string(),
  defender: t.string(),
  dice: t.array(dieSchema),
});
export type Roll = SerializableFieldStatic<typeof rollSchema>;
export class PlayerState {
  id = "";
  hand: ActionCard[] = [];
  resources: string[] = ["", "", "", "", "", ""];
  guilds: string[] = [];
  power = 0;
  outrage: string[] = [];
  outrageAgents: string[] = [];
  trophies: Piece[] = [];
  captives: string[] = [];
  peek: ActionCard[] = [];
  color = 0;
}
const playerState = defineGameState()
  .model({
    id: t.string(),
    hand: t.array(actionCardSchema),
    resources: t.array(t.string()),
    guilds: t.array(t.string()),
    power: t.number(),
    outrage: t.array(t.string()),
    outrageAgents: t.array(t.string()),
    trophies: t.array(pieceSchema),
    captives: t.array(t.string()),
    peek: t.array(actionCardSchema),
    color: t.number(),
  })
  .stateClass(PlayerState)
  .visibility((v) => [
    v.ownedBy("id"),
    v.field("hand").visibleToSelf({
      hidden: {
        schema: t.object({ count: t.number() }),
        derive: (hand) => ({ count: hand.length }),
      },
    }),
    v.field("peek").visibleToSelf(),
  ])
  .build();
export class GameState {
  order: string[] = [];
  players: PlayerState[] = [];
  systems: MapSystem[] = [];
  pieces: Piece[] = [];
  court: { id: string; agents: string[] }[] = [];
  courtDeck: string[] = [];
  courtDiscard: string[] = [];
  actionDiscard: ActionCard[] = [];
  facedown: ActionCard[] = [];
  supply: Record<string, number> = {};
  neutral: Record<string, number> = {};
  chapter = 1;
  round = 1;
  initiative = "";
  active = "";
  leader = "";
  phase = "card";
  setup = "";
  lead: ActionCard[] = [];
  leadRank = 0;
  played: { owner: string; card: ActionCard; mode: string }[] = [];
  acted: string[] = [];
  passed: string[] = [];
  seized = false;
  declared = false;
  pips = 0;
  suit = "";
  prelude = true;
  weapons = false;
  taxed: string[] = [];
  built: string[] = [];
  acquired: string[] = [];
  used: string[] = [];
  spent: string[] = [];
  unions: { owner: string; guild: string; card: string }[] = [];
  markers = [
    { first: 5, second: 3, flipped: false, ambition: "" },
    { first: 3, second: 2, flipped: false, ambition: "" },
    { first: 2, second: 0, flipped: false, ambition: "" },
  ];
  pending: Pending[] = [];
  battle: Battle[] = [];
  rolls: Roll[] = [];
  log: string[] = [];
  winner = "";
  serial = 0;
  actionsTaken = 0;
  rearrange: string[] = [];
  scores: {
    chapter: number;
    ambition: string;
    player: string;
    amount: number;
    place: string;
  }[] = [];
  player(id: string): PlayerState {
    const p = this.players.find((p) => p.id === id);
    if (!p) throw new Error("unknown_player");
    return p;
  }
  system(id: string): MapSystem {
    const s = this.systems.find((s) => s.id === id);
    if (!s) throw new Error("unknown_system");
    return s;
  }
  has(id: string, card: string): boolean {
    return this.player(id).guilds.includes(card);
  }
  at(system: string, owner?: string, kind?: string): Piece[] {
    return this.pieces.filter(
      (p) =>
        p.system === system &&
        (!owner || p.owner === owner) &&
        (!kind || p.kind === kind),
    );
  }
  control(system: string): string {
    const counts = this.order
      .map((id) => ({
        id,
        n: this.at(system, id, "ship").filter((p) => !p.damaged).length,
      }))
      .sort((a, b) => b.n - a.n);
    return counts[0] && counts[0].n > 0 && counts[0].n !== (counts[1]?.n ?? 0)
      ? counts[0].id
      : "";
  }
  available(id: string, kind: string): number {
    const max = kind === "ship" ? 15 : kind === "agent" ? 10 : 5;
    let used =
      this.pieces.filter((p) => p.owner === id && p.kind === kind).length +
      this.players.reduce(
        (n, p) =>
          n +
          p.trophies.filter((t) => t.owner === id && t.kind === kind).length,
        0,
      );
    if (kind === "agent")
      used +=
        this.court.reduce(
          (n, c) => n + c.agents.filter((a) => a === id).length,
          0,
        ) +
        this.players.reduce(
          (n, p) => n + p.captives.filter((a) => a === id).length,
          0,
        ) +
        this.player(id).outrageAgents.length;
    return Math.max(0, max - used);
  }
  capacity(id: string): number {
    return [6, 6, 6, 4, 3, 2][this.available(id, "city")] ?? 2;
  }
  icons(id: string, resource: string): number {
    const p = this.player(id);
    return (
      p.resources.filter((r) => r === resource).length +
      p.guilds.filter((c) => courtCard(c).resource === resource).length
    );
  }
  metric(id: string, ambition: string): number {
    const p = this.player(id);
    if (ambition === "tyrant") return p.captives.length;
    if (ambition === "warlord") return p.trophies.length;
    if (ambition === "tycoon")
      return (
        this.icons(id, "material") +
        this.icons(id, "fuel") +
        (this.has(id, "material-cartel") ? (this.supply.material ?? 0) : 0) +
        (this.has(id, "fuel-cartel") ? (this.supply.fuel ?? 0) : 0)
      );
    return this.icons(id, ambition === "keeper" ? "relic" : "psionic");
  }
  note(text: string): void {
    this.log.push(text);
    if (this.log.length > 200) this.log.shift();
  }
  turnOrder(): string[] {
    const start = this.order.indexOf(this.initiative);
    return [...this.order.slice(start), ...this.order.slice(0, start)];
  }
}
export const gameState = defineGameState()
  .model({
    order: t.array(t.string()),
    players: t.array(t.state(playerState)),
    systems: t.array(
      t.object({
        id: t.string(),
        cluster: t.number(),
        planet: t.number(),
        resource: t.string(),
        slots: t.number(),
        x: t.number(),
        y: t.number(),
        neighbors: t.array(t.string()),
      }),
    ),
    pieces: t.array(pieceSchema),
    court: t.array(courtSchema),
    courtDeck: t.array(t.string()),
    courtDiscard: t.array(t.string()),
    actionDiscard: t.array(actionCardSchema),
    facedown: t.array(actionCardSchema),
    supply: t.record(t.string(), t.number()),
    neutral: t.record(t.string(), t.number()),
    chapter: t.number(),
    round: t.number(),
    initiative: t.string(),
    active: t.string(),
    leader: t.string(),
    phase: t.string(),
    setup: t.string(),
    lead: t.array(actionCardSchema),
    leadRank: t.number(),
    played: t.array(
      t.object({ owner: t.string(), card: actionCardSchema, mode: t.string() }),
    ),
    acted: t.array(t.string()),
    passed: t.array(t.string()),
    seized: t.boolean(),
    declared: t.boolean(),
    pips: t.number(),
    suit: t.string(),
    prelude: t.boolean(),
    weapons: t.boolean(),
    taxed: t.array(t.string()),
    built: t.array(t.string()),
    acquired: t.array(t.string()),
    used: t.array(t.string()),
    spent: t.array(t.string()),
    unions: t.array(
      t.object({ owner: t.string(), guild: t.string(), card: t.string() }),
    ),
    markers: t.array(markerSchema),
    pending: t.array(pendingSchema),
    battle: t.array(battleSchema),
    rolls: t.array(rollSchema),
    log: t.array(t.string()),
    winner: t.string(),
    serial: t.number(),
    actionsTaken: t.number(),
    rearrange: t.array(t.string()),
    scores: t.array(
      t.object({
        chapter: t.number(),
        ambition: t.string(),
        player: t.string(),
        amount: t.number(),
        place: t.string(),
      }),
    ),
  })
  .stateClass(GameState)
  .visibility((v) => [
    v.field("courtDeck").hidden({
      schema: t.object({ count: t.number() }),
      derive: (d) => ({ count: d.length }),
    }),
    v.field("actionDiscard").hidden(),
    v.field("facedown").hidden(),
  ])
  .build();
