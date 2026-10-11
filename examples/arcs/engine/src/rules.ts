import type { RNGApi } from "@tableverse-kit/engine";
import {
  ACTIONS,
  AMBITIONS,
  COURT,
  DICE,
  RAID_COSTS,
  RESOURCES,
  SETUPS,
  actionDeck,
  courtCard,
} from "./data.ts";
import { GameState, PlayerState, type Pending, type Piece } from "./state.ts";
import { makeMap } from "./data.ts";
import type { Input } from "./input.ts";

export class RuleError extends Error {}
export function requireRule(value: unknown, reason: string): asserts value {
  if (!value) throw new RuleError(reason);
}
function unique(values: string[]): boolean {
  return new Set(values).size === values.length;
}
function integer(n: number, min = 0, max = 99): boolean {
  return Number.isInteger(n) && n >= min && n <= max;
}
export function ask(
  g: GameState,
  kind: string,
  actor: string,
  target = "",
  count = 0,
  data: string[] = [],
): void {
  g.pending.push({ kind, actor, target, count, data });
}
export function place(
  g: GameState,
  owner: string,
  kind: string,
  system: string,
  damaged = false,
): boolean {
  if (g.available(owner, kind) <= 0) return false;
  g.pieces.push({ id: `piece-${++g.serial}`, owner, kind, system, damaged });
  return true;
}
export function stabilizeAgents(g: GameState): void {
  for (const p of g.players)
    for (const type of p.outrage)
      if (!p.outrageAgents.includes(type) && g.available(p.id, "agent") > 0)
        p.outrageAgents.push(type);
}
function emptySlots(g: GameState, id: string): number[] {
  return g
    .player(id)
    .resources.flatMap((r, slot) =>
      !r && slot < g.capacity(id) ? [slot] : [],
    );
}
export function receive(g: GameState, id: string, resources: string[]): void {
  if (!resources.length) return;
  if (!g.rearrange.includes(id)) g.rearrange.push(id);
  const slots = emptySlots(g, id),
    p = g.player(id);
  if (slots.length < resources.length) {
    ask(g, "resources", id, "", 0, resources);
    return;
  }
  slots.forEach((slot, n) => {
    const r = resources[n];
    if (r) p.resources[slot] = r;
  });
}
export function gain(g: GameState, id: string, resources: string[]): string[] {
  const gained: string[] = [];
  for (const r of resources)
    if ((g.supply[r] ?? 0) > 0) {
      g.supply[r] = (g.supply[r] ?? 0) - 1;
      gained.push(r);
    }
  receive(g, id, gained);
  return gained;
}
function discardResource(g: GameState, id: string, slot: number): string {
  const p = g.player(id),
    r = p.resources[slot];
  requireRule(integer(slot, 0, 5) && r, "choose_a_resource");
  p.resources[slot] = "";
  g.supply[r] = (g.supply[r] ?? 0) + 1;
  return r;
}
function discardGuild(g: GameState, id: string, card: string): void {
  const p = g.player(id);
  requireRule(p.guilds.includes(card), "card_not_owned");
  p.guilds = p.guilds.filter((c) => c !== card);
  g.courtDiscard.push(card);
}
export function outrage(g: GameState, id: string, resource: string): void {
  const p = g.player(id);
  for (let i = 0; i < p.resources.length; i++)
    if (p.resources[i] === resource) discardResource(g, id, i);
  for (const c of [...p.guilds])
    if (courtCard(c).resource === resource && !c.startsWith("loyal-"))
      discardGuild(g, id, c);
  if (!p.outrage.includes(resource)) p.outrage.push(resource);
  stabilizeAgents(g);
  g.note(`${id} provoked ${resource} Outrage.`);
}
function endPrelude(g: GameState): void {
  for (const r of g.spent) g.supply[r] = (g.supply[r] ?? 0) + 1;
  g.spent = [];
  g.prelude = false;
}
function drawAction(g: GameState, id: string, count: number): void {
  g.player(id).hand.push(...g.actionDiscard.splice(0, count));
}
function deal(g: GameState, rng: RNGApi): void {
  const deck = rng.shuffle(actionDeck(g.order.length));
  for (const id of g.turnOrder()) g.player(id).hand = deck.splice(0, 6);
  g.actionDiscard = g.order.length !== 2 ? rng.shuffle(deck) : deck;
  g.facedown = [];
  if (g.order.length === 2) {
    const rival = g.order.find((id) => id !== g.initiative);
    if (rival) ask(g, "mulligan", rival);
  }
}
export function setupGame(
  g: GameState,
  players: readonly string[],
  rng: RNGApi,
): void {
  g.order = [...players];
  g.players = players.map((id, color) =>
    Object.assign(new PlayerState(), { id, color }),
  );
  g.initiative = rng.shuffle(players)[0] ?? "";
  g.active = g.initiative;
  g.leader = g.initiative;
  const setup = rng.shuffle(
    SETUPS.filter((s) => s.players === players.length),
  )[0];
  requireRule(setup, "unsupported_player_count");
  g.setup = setup.id;
  g.systems = makeMap(setup.blocked);
  g.supply = Object.fromEntries(RESOURCES.map((r) => [r, 5]));
  if (players.length === 2)
    for (const s of makeMap([]).filter(
      (s) => s.planet && setup.blocked.includes(s.cluster),
    )) {
      g.supply[s.resource] = (g.supply[s.resource] ?? 0) - 1;
      const a =
        s.resource === "material" || s.resource === "fuel"
          ? "tycoon"
          : s.resource === "weapon"
            ? "warlord"
            : s.resource === "relic"
              ? "keeper"
              : "empath";
      g.neutral[a] = (g.neutral[a] ?? 0) + 1;
    }
  g.turnOrder().forEach((id, index) => {
    const positions = setup.positions[index];
    requireRule(positions, "missing_setup_position");
    positions.forEach((system, i) => {
      for (let n = 0; n < (i < 2 ? 3 : 2); n++) place(g, id, "ship", system);
      if (i < 2) place(g, id, i === 0 ? "city" : "starport", system);
    });
    const p = g.player(id);
    positions.slice(0, 2).forEach((system, slot) => {
      const r = g.system(system).resource;
      p.resources[slot] = r;
      g.supply[r] = (g.supply[r] ?? 0) - 1;
    });
  });
  g.courtDeck = rng.shuffle(COURT.map((c) => c.id));
  g.court = g.courtDeck
    .splice(0, players.length === 2 ? 3 : 4)
    .map((id) => ({ id, agents: [] }));
  deal(g, rng);
  g.note(`Chapter 1 begins. ${g.initiative} has initiative.`);
}
export function declare(
  g: GameState,
  id: string,
  ambition: string,
  zero: boolean,
): void {
  requireRule(AMBITIONS.includes(ambition), "invalid_ambition");
  const marker = [...g.markers]
    .filter((m) => !m.ambition)
    .sort((a, b) => b.first - a.first)[0];
  requireRule(marker, "no_available_ambition_markers");
  marker.ambition = ambition;
  g.declared = true;
  if (
    zero &&
    !(g.has(id, "secret-order") && ["keeper", "empath"].includes(ambition))
  )
    g.leadRank = 0;
  g.note(
    `${id} declared ${ambition} (${marker.first} / ${marker.second} Power).`,
  );
  if (g.has(id, "farseers")) ask(g, "farseers-rival", id);
}
function seize(g: GameState, id: string): void {
  requireRule(g.initiative !== id && !g.seized, "initiative_cannot_be_seized");
  g.initiative = id;
  g.seized = true;
  g.note(`${id} seized initiative.`);
}
function resetTurn(g: GameState): void {
  g.phase = "card";
  g.pips = 0;
  g.suit = "";
  g.prelude = true;
  g.weapons = false;
  g.taxed = [];
  g.built = [];
  g.acquired = [];
  g.used = [];
  g.spent = [];
  g.actionsTaken = 0;
}
function startRound(g: GameState): void {
  g.round++;
  g.leader = g.initiative;
  g.active = g.initiative;
  g.lead = [];
  g.played = [];
  g.acted = [];
  g.seized = false;
  g.declared = false;
  resetTurn(g);
}
export function scoreChapter(g: GameState, rng: RNGApi): void {
  endPrelude(g);
  for (const ambition of AMBITIONS) {
    const markers = g.markers.filter((m) => m.ambition === ambition);
    if (!markers.length) continue;
    const ranks = g.order.map((id) => ({ id, value: g.metric(id, ambition) }));
    if (g.order.length === 2)
      ranks.push({ id: "neutral", value: g.neutral[ambition] ?? 0 });
    ranks.sort((a, b) => b.value - a.value);
    for (const p of g.players) {
      const value = g.metric(p.id, ambition);
      if (!value) continue;
      const higher = ranks.filter((r) => r.value > value).length,
        tied = ranks.filter((r) => r.value === value).length;
      let place = "",
        amount = 0;
      if (higher === 0 && tied === 1) {
        place = "first";
        amount =
          markers.reduce((n, m) => n + m.first, 0) +
          (g.available(p.id, "city") === 0
            ? 5
            : g.available(p.id, "city") === 1
              ? 2
              : 0);
      } else if (higher === 0 || (higher === 1 && tied === 1)) {
        place = higher === 0 ? "tied first" : "second";
        amount = markers.reduce((n, m) => n + m.second, 0);
      }
      if (place) {
        p.power += amount;
        g.scores.push({
          chapter: g.chapter,
          ambition,
          player: p.id,
          amount,
          place,
        });
        g.note(`${p.id}: +${amount} Power for ${ambition} (${place}).`);
      }
    }
  }
  for (const r of ["material", "fuel"]) {
    const owner = g.players.find((p) => p.guilds.includes(`${r}-cartel`));
    if (owner)
      for (const p of g.players.filter((p) => p.id !== owner.id))
        p.resources.forEach((type, i) => {
          if (type === r) discardResource(g, p.id, i);
        });
  }
  const war = g.markers.some((m) => m.ambition === "warlord"),
    tyrant = g.markers.some((m) => m.ambition === "tyrant");
  for (const p of g.players) {
    if (war) {
      p.trophies = [];
    }
    if (tyrant) p.captives = [];
  }
  for (const m of g.markers) m.ambition = "";
  const flip = [...g.markers]
    .filter((m) => !m.flipped)
    .sort((a, b) => a.first - b.first)[0];
  if (flip) {
    flip.flipped = true;
    flip.first += flip.first === 2 ? 3 : 4;
    flip.second = flip.first === 5 ? 2 : flip.first === 7 ? 3 : 4;
  }
  stabilizeAgents(g);
  for (const id of g.turnOrder()) {
    if (g.player(id).resources.some((r, slot) => r && slot >= g.capacity(id)))
      ask(g, "resources", id);
  }
  if (g.pending.length) ask(g, "advance-chapter", g.initiative);
  else advanceChapter(g, rng);
}
function advanceChapter(g: GameState, rng: RNGApi): void {
  if (
    g.chapter === 5 ||
    g.players.some((p) => p.power >= 39 - 3 * g.order.length)
  ) {
    const best = Math.max(...g.players.map((p) => p.power));
    g.winner = g.turnOrder().find((id) => g.player(id).power === best) ?? "";
    g.phase = "over";
    g.note(`${g.winner} wins with ${best} Power.`);
    return;
  }
  g.chapter++;
  g.round = 0;
  g.passed = [];
  startRound(g);
  deal(g, rng);
  g.note(`Chapter ${g.chapter} begins.`);
}
function finishRound(g: GameState, rng: RNGApi): void {
  if (!g.seized) {
    const best = g.played
      .filter((c) => c.mode === "surpass")
      .sort((a, b) => b.card.rank - a.card.rank)[0];
    if (best && best.owner !== g.initiative) {
      g.initiative = best.owner;
      g.note(`${best.owner} took initiative.`);
    }
  }
  for (const claim of g.unions) {
    const played = g.played.find((p) => p.card.id === claim.card);
    if (played) {
      g.player(claim.owner).hand.push(played.card);
      g.played = g.played.filter((p) => p !== played);
    }
    g.courtDiscard.push(claim.guild);
  }
  g.unions = [];
  g.actionDiscard.push(
    ...g.played.filter((p) => p.mode !== "copy").map((p) => p.card),
    ...g.facedown,
  );
  g.facedown = [];
  g.played = [];
  g.lead = [];
  if (g.players.every((p) => !p.hand.length)) {
    scoreChapter(g, rng);
    return;
  }
  startRound(g);
}
function finishTurn(g: GameState, rng: RNGApi): void {
  endPrelude(g);
  g.acted.push(g.active);
  const start = g.order.indexOf(g.leader),
    ordered = [...g.order.slice(start), ...g.order.slice(0, start)];
  const next = ordered.find(
    (id) => !g.acted.includes(id) && g.player(id).hand.length,
  );
  if (next) {
    g.active = next;
    resetTurn(g);
  } else finishRound(g, rng);
}
function endTurn(g: GameState, rng: RNGApi): void {
  const id = g.active;
  if (
    !g.pieces.some(
      (p) => p.owner === id && (p.kind === "ship" || p.kind === "starport"),
    )
  ) {
    ask(g, "regroup", id);
    ask(g, "finish-turn", id);
  } else finishTurn(g, rng);
}
function turnSpent(g: GameState): boolean {
  return (
    g.phase === "actions" &&
    g.pips === 0 &&
    !g.prelude &&
    !g.pending.length &&
    !g.battle.length &&
    !g.winner &&
    !g.rearrange.includes(g.active)
  );
}
function play(g: GameState, id: string, i: Input): void {
  requireRule(g.phase === "card", "play_only_at_start_of_turn");
  const p = g.player(id),
    card = p.hand.find((c) => c.id === i.card);
  requireRule(card, "card_not_in_hand");
  const leading = !g.lead.length,
    mode = leading ? "lead" : (i.mode ?? "");
  requireRule(
    ["lead", "surpass", "copy", "pivot"].includes(mode),
    "choose_play_mode",
  );
  if (!leading) {
    requireRule(mode !== "lead", "must_follow_lead");
    if (mode === "surpass")
      requireRule(
        card.suit === g.lead[0]?.suit && card.rank > g.leadRank,
        "cannot_surpass",
      );
    if (mode === "pivot")
      requireRule(card.suit !== g.lead[0]?.suit, "pivot_must_change_suit");
  }
  const extra = i.seize ? p.hand.find((c) => c.id === i.seize) : undefined;
  if (i.seize)
    requireRule(
      extra && extra !== card && g.initiative !== id && !g.seized,
      "invalid_seize_card",
    );
  p.hand = p.hand.filter((c) => c !== card && c !== extra);
  if (leading) {
    g.lead = [card];
    g.leadRank = card.rank;
  }
  g.suit = mode === "copy" ? (g.lead[0]?.suit ?? "") : card.suit;
  g.pips = mode === "copy" || mode === "pivot" ? 1 : card.pips;
  if (mode === "copy") {
    g.facedown.push(card);
    g.played.push({
      owner: id,
      card: { id: "hidden", rank: 0, pips: 1, suit: "", ambition: "" },
      mode,
    });
  } else g.played.push({ owner: id, card, mode });
  if (extra) {
    g.facedown.push(extra);
    seize(g, id);
  } else if (
    mode === "surpass" &&
    card.rank === 7 &&
    g.initiative !== id &&
    !g.seized
  )
    seize(g, id);
  if (i.ambition) {
    requireRule(
      leading ||
        (g.has(id, "galactic-bards") &&
          ["surpass", "pivot"].includes(mode) &&
          !g.declared),
      "cannot_declare_now",
    );
    requireRule(
      card.ambition === i.ambition || card.ambition === "any",
      "ambition_does_not_match_card",
    );
    declare(g, id, i.ambition, leading);
  }
  g.phase = "actions";
  g.passed = [];
  g.note(
    `${id} ${mode === "lead" ? "led" : mode === "copy" ? "copied" : mode === "pivot" ? "pivoted" : "surpassed"}${mode === "copy" ? "" : ` with ${card.suit} ${card.rank}`}.`,
  );
}
const loyal: Record<string, string> = {
  material: "loyal-engineers",
  fuel: "loyal-pilots",
  weapon: "loyal-marines",
  relic: "loyal-keepers",
  psionic: "loyal-empaths",
};
export function paymentActions(g: GameState, id: string, i: Input): string[] {
  if (!i.source || i.source === "pip")
    return [...(ACTIONS[g.suit] ?? []), ...(g.weapons ? ["battle"] : [])];
  const r = i.resource ?? "";
  if (r === "material") return ["build", "repair"];
  if (r === "fuel") return ["move"];
  if (r === "relic") return ["secure"];
  if (r === "psionic") return ACTIONS[g.lead[0]?.suit ?? ""] ?? [];
  return [];
}
function pay(g: GameState, id: string, i: Input, action: string): void {
  requireRule(g.phase === "actions", "play_a_card_first");
  requireRule(
    paymentActions(g, id, i).includes(action),
    "action_not_allowed_by_payment",
  );
  if (!i.source || i.source === "pip") {
    requireRule(g.pips > 0, "no_action_pips");
    endPrelude(g);
    g.pips--;
  } else {
    requireRule(
      i.source === "resource" && g.prelude,
      "resources_only_in_prelude",
    );
    const slot = i.slot ?? -1,
      r = g.player(id).resources[slot],
      effective = i.resource ?? "";
    requireRule(
      integer(slot, 0, 5) && r && RESOURCES.includes(effective),
      "choose_a_resource",
    );
    const converter = loyal[effective];
    const converted = converter && g.has(id, converter);
    requireRule(r === effective || converted, "resource_cannot_convert");
    requireRule(
      !g.player(id).outrage.includes(effective) || converted,
      "resource_is_outraged",
    );
    g.player(id).resources[slot] = "";
    g.spent.push(r);
  }
  g.actionsTaken++;
}
function findPiece(g: GameState, id: string | undefined): Piece {
  const piece = g.pieces.find((p) => p.id === id);
  requireRule(piece, "choose_a_piece");
  return piece;
}
function refill(g: GameState, index: number): void {
  const id = g.courtDeck.shift();
  if (id) g.court.splice(index, 1, { id, agents: [] });
  else g.court.splice(index, 1);
}
function secure(
  g: GameState,
  id: string,
  card: string,
  rng: RNGApi,
  ransack = false,
): void {
  const index = g.court.findIndex((c) => c.id === card),
    row = g.court[index];
  requireRule(row, "card_not_in_court");
  const p = g.player(id);
  for (const rival of row.agents.filter((a) => a !== id)) {
    if (ransack)
      p.trophies.push({
        id: `agent-${++g.serial}`,
        owner: rival,
        kind: "agent",
        system: "",
        damaged: false,
      });
    else p.captives.push(rival);
  }
  row.agents = [];
  stabilizeAgents(g);
  if (courtCard(card).resource) {
    p.guilds.push(card);
    if (g.prelude) g.acquired.push(card);
    refill(g, index);
  } else {
    ask(g, card, id);
    ask(g, "refill", id, card, index);
  }
  g.note(
    `${id} secured ${courtCard(card).name}${ransack ? " by ransacking the Court" : ""}.`,
  );
}
function canSteal(g: GameState, from: string, card = ""): boolean {
  return !g.has(from, "sworn-guardians") || card === "sworn-guardians";
}
function steal(
  g: GameState,
  id: string,
  from: string,
  card: string,
  slot: number,
): void {
  requireRule(from !== id && g.order.includes(from), "choose_a_rival");
  requireRule(canSteal(g, from, card), "protected_by_sworn_guardians");
  const p = g.player(from);
  if (card) {
    requireRule(p.guilds.includes(card), "guild_not_owned_by_target");
    p.guilds = p.guilds.filter((c) => c !== card);
    if (card === "sworn-guardians") g.courtDeck.push(card);
    else {
      g.player(id).guilds.push(card);
    }
    g.note(`${id} stole ${courtCard(card).name} from ${from}.`);
  } else {
    const r = p.resources[slot];
    requireRule(integer(slot, 0, 5) && r, "choose_a_resource");
    p.resources[slot] = "";
    receive(g, id, [r]);
    g.note(`${id} stole ${r} from ${from}.`);
  }
}
function move(
  g: GameState,
  id: string,
  from: string,
  to: string,
  ids: string[],
  catapult: boolean,
  verb = "moved",
): void {
  requireRule(g.system(from).neighbors.includes(to), "systems_not_adjacent");
  requireRule(ids.length && unique(ids), "choose_distinct_ships");
  const ships = ids.map((p) => findPiece(g, p));
  requireRule(
    ships.every(
      (p) => p.owner === id && p.kind === "ship" && p.system === from,
    ),
    "ships_must_share_origin",
  );
  const control = g.control(to);
  for (const ship of ships) ship.system = to;
  if (catapult && !g.system(to).planet && (!control || control === id))
    ask(g, "catapult", id, to, 0, ids);
  g.note(
    `${id} ${verb} ${ids.length} ship${ids.length === 1 ? "" : "s"} from ${from} to ${to}.`,
  );
}
function roll(g: GameState, id: string, i: Input, rng: RNGApi): void {
  const system = i.system ?? "",
    defender = i.target ?? "";
  g.system(system);
  const ships = g.at(system, id, "ship");
  requireRule(
    ships.length && defender !== id && g.at(system, defender).length,
    "invalid_battle",
  );
  const counts = [i.assault ?? 0, i.skirmish ?? 0, i.raid ?? 0];
  requireRule(
    counts.every((n) => integer(n, 0, 6)),
    "maximum_six_dice_per_type",
  );
  requireRule(
    counts.reduce((a, b) => a + b, 0) <=
      ships.length +
        (g.has(id, "gatekeepers") && !g.system(system).planet ? 2 : 0),
    "too_many_dice",
  );
  if ((i.raid ?? 0) > 0)
    requireRule(
      g.at(system, defender).some((p) => p.kind !== "ship") ||
        !g.pieces.some((p) => p.owner === defender && p.kind !== "ship"),
      "raid_requires_defending_buildings",
    );
  const dice = ["assault", "skirmish", "raid"].flatMap((type, index) =>
    Array.from({ length: counts[index] ?? 0 }, () => ({
      type,
      face: Math.floor(rng.number() * 6),
    })),
  );
  g.battle = [
    {
      system,
      attacker: id,
      defender,
      step: "roll",
      self: 0,
      intercept: 0,
      ship: 0,
      building: 0,
      keys: 0,
      rerolled: false,
      dice,
    },
  ];
  record(g);
  if (
    !g.has(id, "skirmishers") ||
    !dice.some((d) => d.type === "skirmish") ||
    !g.icons(id, "weapon")
  )
    resolveDice(g);
  g.note(`${id} attacked ${defender} in ${system}.`);
}
function record(g: GameState): void {
  const b = g.battle[0];
  if (!b) return;
  g.rolls = [
    {
      serial: ++g.serial,
      system: b.system,
      attacker: b.attacker,
      defender: b.defender,
      dice: b.dice.map((d) => ({ ...d })),
    },
  ];
}
function resolveDice(g: GameState): void {
  const b = g.battle[0];
  if (!b) return;
  let intercept = false;
  for (const die of b.dice) {
    const f = DICE[die.type]?.[die.face];
    if (!f) continue;
    b.self += f.self;
    b.ship += f.ship;
    b.building += f.building;
    b.keys += f.keys;
    intercept ||= f.intercept;
  }
  b.intercept = intercept
    ? g.at(b.system, b.defender, "ship").filter((s) => !s.damaged).length
    : 0;
  b.step = "self";
  advanceBattle(g);
}
function advanceBattle(g: GameState): void {
  const b = g.battle[0];
  if (!b || g.pending.length || b.step === "roll") return;
  if (
    b.step === "self" &&
    (!b.self || !g.at(b.system, b.attacker, "ship").length)
  )
    b.step = "intercept";
  if (
    b.step === "intercept" &&
    (!b.intercept || !g.at(b.system, b.attacker, "ship").length)
  )
    b.step = "ship";
  if (b.step === "ship" && (!b.ship || !g.at(b.system, b.defender).length))
    b.step = "building";
  if (
    b.step === "building" &&
    (!b.building || !g.at(b.system, b.defender).some((p) => p.kind !== "ship"))
  )
    b.step = "raid";
  if (
    b.step === "raid" &&
    (!b.keys || !g.at(b.system, b.attacker, "ship").length)
  )
    g.battle = [];
}
function hit(g: GameState, p: Piece, by: string, step = ""): void {
  const outcome = p.damaged ? "destroyed" : "damaged";
  g.note(
    step === "self"
      ? `${p.owner}'s own dice ${outcome} their ${p.kind} in ${p.system}.`
      : step === "intercept"
        ? `${by} intercepted and ${outcome} ${p.owner}'s ${p.kind} in ${p.system}.`
        : `${by} ${outcome} ${p.owner}'s ${p.kind} in ${p.system}.`,
  );
  if (!p.damaged) {
    p.damaged = true;
    return;
  }
  g.pieces = g.pieces.filter((x) => x.id !== p.id);
  g.player(by).trophies.push({ ...p, system: "" });
  if (p.kind === "city") {
    outrage(g, by, g.system(p.system).resource);
    if (g.court.some((c) => c.agents.includes(p.owner)))
      ask(g, "ransack", by, p.owner);
  }
}
function standard(g: GameState, id: string, i: Input, rng: RNGApi): void {
  const op = i.op;
  pay(g, id, i, op);
  if (op === "tax") {
    const p = findPiece(g, i.target);
    requireRule(
      p.kind === "city" && (p.owner === id || g.control(p.system) === id),
      "cannot_tax_city",
    );
    requireRule(!g.taxed.includes(p.id), "city_already_taxed");
    g.taxed.push(p.id);
    const [gained] = gain(g, id, [g.system(p.system).resource]),
      capture = p.owner !== id && g.available(p.owner, "agent") > 0;
    if (capture) g.player(id).captives.push(p.owner);
    g.note(
      `${id} taxed ${p.system}${gained ? ` (+${gained})` : ""}${capture ? `, capturing an agent of ${p.owner}` : ""}.`,
    );
  } else if (op === "build") {
    const kind = i.kind ?? "",
      system = i.system ?? "";
    const s = g.system(system);
    requireRule(
      ["ship", "city", "starport"].includes(kind),
      "choose_piece_type",
    );
    if (kind === "ship") {
      const port = findPiece(g, i.target);
      requireRule(
        port.kind === "starport" && port.owner === id && port.system === system,
        "build_ships_at_loyal_starport",
      );
      requireRule(!g.built.includes(port.id), "starport_already_built");
      g.built.push(port.id);
    } else
      requireRule(
        g.at(system, id).length &&
          g.at(system).filter((p) => p.kind !== "ship").length < s.slots,
        "no_available_building_slot",
      );
    const c = g.control(system),
      damaged = !!c && c !== id;
    if (place(g, id, kind, system, damaged))
      g.note(
        `${id} built a ${kind} in ${system}${damaged ? " (damaged)" : ""}.`,
      );
  } else if (op === "repair") {
    const p = findPiece(g, i.target);
    requireRule(p.owner === id && p.damaged, "choose_damaged_loyal_piece");
    p.damaged = false;
    g.note(`${id} repaired a ${p.kind} in ${p.system}.`);
  } else if (op === "influence") {
    const c = g.court.find((c) => c.id === i.card);
    requireRule(c, "cannot_influence");
    if (g.available(id, "agent") > 0) c.agents.push(id);
    g.note(`${id} influenced ${courtCard(c.id).name}.`);
  } else if (op === "secure") {
    const c = g.court.find((c) => c.id === i.card);
    requireRule(c, "choose_court_card");
    const own = c.agents.filter((a) => a === id).length;
    requireRule(
      own > 0 &&
        g.order.every(
          (r) => r === id || c.agents.filter((a) => a === r).length < own,
        ),
      "need_strict_agent_majority",
    );
    secure(g, id, c.id, rng);
  } else if (op === "move") {
    const ids = i.ids ?? [],
      first = findPiece(g, ids[0]);
    move(
      g,
      id,
      first.system,
      i.system ?? "",
      ids,
      g.at(first.system, id, "starport").length > 0,
    );
  } else if (op === "battle") roll(g, id, i, rng);
  else throw new RuleError("unknown_action");
}

export function settle(g: GameState, rng: RNGApi): void {
  stabilizeAgents(g);
  for (let n = 0; n < 100; n++) {
    const p = g.pending[0];
    if (p?.kind === "refill") {
      g.pending.shift();
      const index = g.court.findIndex((c) => c.id === p.target);
      if (index >= 0) refill(g, index);
      continue;
    }
    if (p?.kind === "finish-turn") {
      g.pending.shift();
      finishTurn(g, rng);
      continue;
    }
    if (p?.kind === "advance-chapter") {
      g.pending.shift();
      advanceChapter(g, rng);
      continue;
    }
    if (p?.kind === "call-to-action") {
      g.pending.shift();
      drawAction(g, p.actor, 1);
      g.courtDiscard.push(p.kind);
      continue;
    }
    const input = p && forced(g, p);
    if (p && input) {
      const remaining = g.pending.splice(1);
      resolvePending(g, p.actor, input, rng);
      g.pending.push(...remaining);
      continue;
    }
    break;
  }
  advanceBattle(g);
  if (turnSpent(g)) {
    endTurn(g, rng);
    settle(g, rng);
  }
}
function keep(g: GameState, id: string, extra: string[]): string[] {
  const cap = g.capacity(id),
    current = g.player(id).resources,
    values = current.map((r, slot) => (slot < cap ? r : "")),
    pool = [...current.filter((r, slot) => r && slot >= cap), ...extra];
  values.forEach((r, slot) => {
    if (!r && slot < cap) values[slot] = pool.shift() ?? "";
  });
  return values;
}
function stealable(
  g: GameState,
  id: string,
  resource: string,
): { target: string; slot: number }[] {
  return g.players.flatMap((r) =>
    r.id !== id && canSteal(g, r.id)
      ? r.resources.flatMap((x, slot) =>
          x === resource ? [{ target: r.id, slot }] : [],
        )
      : [],
  );
}
function forced(g: GameState, p: Pending): Input | undefined {
  const skip = { op: "choose", target: "skip" };
  if (p.kind === "resources") {
    const all = [...g.player(p.actor).resources.filter(Boolean), ...p.data];
    if (all.length <= g.capacity(p.actor) || new Set(all).size <= 1)
      return { op: "choose", values: keep(g, p.actor, p.data) };
  }
  if (p.kind === "interest") {
    const options = stealable(g, p.actor, p.target);
    if (p.count <= 0 || (g.supply[p.target] ?? 0) > 0 || !options.length)
      return { op: "choose" };
    const [only] = options;
    if (only && options.length === 1) return { op: "choose", ...only };
  }
  if (p.kind === "ransack") {
    const cards = g.court.filter((c) => c.agents.includes(p.target));
    const [only] = cards;
    if (only && cards.length === 1) return { op: "choose", card: only.id };
  }
  if (p.kind === "farseers-rival") {
    const rivals = g.order.filter((id) => id !== p.actor);
    const [only] = rivals;
    if (only && rivals.length === 1) return { op: "choose", target: only };
  }
  if (
    p.kind === "song-of-freedom" &&
    !g.pieces.some((c) => c.kind === "city" && g.control(c.system) === p.actor)
  )
    return skip;
  if (
    p.kind === "guild-struggle" &&
    !g.players.some(
      (r) =>
        r.id !== p.actor && r.guilds.some((card) => canSteal(g, r.id, card)),
    )
  )
    return skip;
  if (p.kind === "populist-demands" && g.markers.every((m) => m.ambition))
    return skip;
  return undefined;
}

function arrange(g: GameState, id: string, values: string[]): void {
  requireRule(g.rearrange.includes(id), "rearrange_only_after_gaining");
  const p = g.player(id),
    cap = g.capacity(id);
  const sorted = (rs: string[]) => rs.filter(Boolean).sort().join(",");
  requireRule(
    values.length === 6 &&
      values.every((r, slot) => !r || slot < cap) &&
      sorted(values) === sorted(p.resources),
    "invalid_arrangement",
  );
  p.resources = [...values];
}
export function applyInput(
  g: GameState,
  id: string,
  i: Input,
  rng: RNGApi,
): void {
  requireRule(!g.winner, "game_over");
  requireRule((g.pending[0]?.actor ?? g.active) === id, "not_active_player");
  if (i.op === "arrange") {
    arrange(g, id, i.values ?? []);
    return;
  }
  g.rearrange = [];
  if (g.pending.length) {
    const remaining = g.pending.splice(1);
    resolvePending(g, id, i, rng);
    g.pending.push(...remaining);
    settle(g, rng);
    return;
  }
  if (g.battle.length) {
    battleInput(g, id, i, rng);
    settle(g, rng);
    return;
  }
  if (i.op === "play") play(g, id, i);
  else if (i.op === "pass") {
    requireRule(
      g.phase === "card" && !g.lead.length && g.initiative === id,
      "can_only_pass_initiative",
    );
    if (!g.passed.includes(id)) g.passed.push(id);
    const withCards = g.order.filter((p) => g.player(p).hand.length);
    if (withCards.every((p) => g.passed.includes(p))) {
      g.note(`${id} passed.`);
      scoreChapter(g, rng);
    } else {
      let index = g.order.indexOf(id);
      do {
        index = (index + 1) % g.order.length;
      } while (!g.player(g.order[index] ?? "").hand.length);
      g.initiative = g.order[index] ?? "";
      g.note(`${id} passed initiative to ${g.initiative}.`);
      startRound(g);
    }
  } else if (i.op === "end") {
    requireRule(g.phase === "actions", "play_a_card_first");
    endTurn(g, rng);
  } else if (i.op === "spend") {
    requireRule(
      g.phase === "actions" && g.prelude,
      "resources_only_in_prelude",
    );
    const slot = i.slot ?? -1,
      resource = g.player(id).resources[slot];
    requireRule(integer(slot, 0, 5) && resource, "choose_a_resource");
    g.player(id).resources[slot] = "";
    g.spent.push(resource);
    g.actionsTaken++;
    g.note(`${id} spent ${resource} without effect.`);
  } else if (i.op === "weapons") {
    requireRule(g.phase === "actions" && g.prelude, "weapons_only_in_prelude");
    const slot = i.slot ?? -1,
      r = g.player(id).resources[slot];
    requireRule(r && integer(slot, 0, 5), "choose_a_resource");
    requireRule(
      r === "weapon" || g.has(id, "loyal-marines"),
      "need_weapon_or_loyal_marines",
    );
    requireRule(
      !g.player(id).outrage.includes("weapon") || g.has(id, "loyal-marines"),
      "resource_is_outraged",
    );
    g.player(id).resources[slot] = "";
    g.spent.push(r);
    g.weapons = true;
    g.actionsTaken++;
    g.note(`${id} spent ${r} to arm for battle.`);
  } else if (i.op === "guild") guildPrelude(g, id, i);
  else if (
    [
      "manufacture",
      "synthesize",
      "pressgang",
      "execute",
      "abduct",
      "trade",
    ].includes(i.op)
  )
    guildAction(g, id, i);
  else standard(g, id, i, rng);
  settle(g, rng);
}

function battleInput(g: GameState, id: string, i: Input, rng: RNGApi): void {
  const b = g.battle[0];
  requireRule(b && id === b.attacker, "battle_attacker_resolves");
  if (b.step === "roll") {
    requireRule(i.op === "reroll", "choose_skirmisher_rerolls");
    const ids = i.ids ?? [];
    requireRule(
      unique(ids) &&
        ids.length <= g.icons(id, "weapon") &&
        ids.every(
          (s) =>
            integer(Number(s), 0, b.dice.length - 1) &&
            b.dice[Number(s)]?.type === "skirmish",
        ),
      "invalid_reroll",
    );
    for (const index of ids) {
      const die = b.dice[Number(index)];
      if (die) die.face = Math.floor(rng.number() * 6);
    }
    b.rerolled = true;
    record(g);
    g.note(
      `${id} rerolled ${ids.length} skirmish ${ids.length === 1 ? "die" : "dice"}.`,
    );
    resolveDice(g);
    return;
  }
  if (b.step === "raid") {
    if (i.op === "done") {
      g.battle = [];
      return;
    }
    requireRule(i.op === "raid", "choose_raid_target");
    const cost = i.card
      ? courtCard(i.card).cost
      : (RAID_COSTS[i.slot ?? -1] ?? 99);
    requireRule(b.keys >= cost, "not_enough_raid_keys");
    steal(g, id, b.defender, i.card ?? "", i.slot ?? -1);
    b.keys -= cost;
    return;
  }
  requireRule(i.op === "hit", "allocate_battle_hits");
  const piece = findPiece(g, i.target);
  requireRule(piece.system === b.system, "piece_outside_battle");
  if (b.step === "self" || b.step === "intercept") {
    requireRule(
      piece.owner === id && piece.kind === "ship",
      "hit_attacking_ship",
    );
    if (b.step === "self") b.self--;
    else b.intercept--;
    hit(g, piece, b.defender, b.step);
  } else {
    requireRule(piece.owner === b.defender, "hit_defending_piece");
    if (b.step === "building") {
      requireRule(piece.kind !== "ship", "hit_defending_building");
      b.building--;
    } else {
      requireRule(
        piece.kind === "ship" || !g.at(b.system, b.defender, "ship").length,
        "must_hit_ships_first",
      );
      b.ship--;
    }
    hit(g, piece, id);
  }
}

function resolvePending(g: GameState, id: string, i: Input, rng: RNGApi): void {
  const p = g.pending.shift();
  requireRule(p, "no_pending_choice");
  const player = g.player(id);
  requireRule(i.op === "choose", "resolve_pending_choice");
  if (p.kind === "mulligan") {
    requireRule(
      ["keep", "redraw"].includes(i.target ?? ""),
      "choose_keep_or_redraw",
    );
    if (i.target === "redraw") {
      const old = player.hand;
      player.hand = g.actionDiscard.splice(0, 6);
      g.actionDiscard.push(...old);
    }
    g.actionDiscard = rng.shuffle(g.actionDiscard);
    g.note(
      `${id} ${i.target === "redraw" ? "redrew" : "kept"} their opening hand.`,
    );
    return;
  }
  if (p.kind === "resources") {
    const all = [...player.resources.filter(Boolean), ...p.data],
      values = i.values ?? [],
      cap = g.capacity(id);
    requireRule(
      values.length === 6 &&
        values.every(
          (r, index) => (!r || RESOURCES.includes(r)) && (!r || index < cap),
        ),
      "invalid_resource_slots",
    );
    const leftovers = [...all];
    for (const r of values.filter(Boolean)) {
      const index = leftovers.indexOf(r);
      requireRule(index >= 0, "resource_not_available");
      leftovers.splice(index, 1);
    }
    requireRule(
      values.filter(Boolean).length === Math.min(all.length, cap),
      "fill_available_resource_slots",
    );
    for (const r of leftovers) g.supply[r] = (g.supply[r] ?? 0) + 1;
    player.resources = [...values];
    if (leftovers.length) g.note(`${id} discarded ${leftovers.join(", ")}.`);
    return;
  }
  if (p.kind === "catapult") {
    if (i.target === "done") return;
    const ids = i.ids ?? [];
    requireRule(
      ids.every((s) => p.data.includes(s)),
      "only_continue_with_moving_ships",
    );
    move(g, id, p.target, i.system ?? "", ids, true, "catapulted");
    return;
  }
  if (p.kind === "regroup") {
    const s = g.system(i.system ?? "");
    requireRule(!s.planet, "regroup_at_a_gate");
    for (let n = 0; n < 3; n++) place(g, id, "ship", s.id);
    g.note(`${id} regrouped in ${s.id}.`);
    return;
  }
  if (p.kind === "ransack") {
    const c = g.court.find((c) => c.id === i.card);
    requireRule(
      c && c.agents.includes(p.target),
      "choose_card_with_defender_agents",
    );
    const rest = g.pending;
    g.pending = [];
    secure(g, id, c.id, rng, true);
    g.pending.push(...rest);
    return;
  }
  if (p.kind === "farseers-rival") {
    requireRule(
      i.target !== id && g.order.includes(i.target ?? ""),
      "choose_a_rival",
    );
    player.peek = [...g.player(i.target ?? "").hand];
    g.pending.unshift({
      kind: "farseers-swap",
      actor: id,
      target: i.target ?? "",
      count: 0,
      data: [],
    });
    return;
  }
  if (p.kind === "farseers-swap") {
    if (i.target !== "skip") {
      const rival = g.player(p.target),
        a = player.hand.find((c) => c.id === i.card),
        b = rival.hand.find((c) => c.id === i.target);
      requireRule(a && b, "choose_cards_to_swap");
      player.hand = player.hand.filter((c) => c !== a);
      rival.hand = rival.hand.filter((c) => c !== b);
      player.hand.push(b);
      rival.hand.push(a);
    }
    player.peek = [];
    return;
  }
  if (p.kind === "interest") {
    if (p.count <= 0) return;
    if ((g.supply[p.target] ?? 0) > 0) {
      g.supply[p.target] = (g.supply[p.target] ?? 0) - 1;
      receive(g, id, [p.target]);
    } else {
      const possible = g.players.some(
        (r) =>
          r.id !== id && canSteal(g, r.id) && r.resources.includes(p.target),
      );
      if (!possible) return;
      requireRule(
        g.player(i.target ?? "").resources[i.slot ?? -1] === p.target,
        "choose_resource_to_steal",
      );
      steal(g, id, i.target ?? "", "", i.slot ?? -1);
    }
    if (p.count > 1) g.pending.push({ ...p, count: p.count - 1 });
    return;
  }
  if (p.kind === "pressgang-resources") {
    const values = i.values ?? [];
    requireRule(
      values.length === p.count && values.every((v) => RESOURCES.includes(v)),
      "choose_one_resource_per_captive",
    );
    const gained = gain(g, id, values);
    g.note(
      `${id} gained ${gained.length ? gained.join(", ") : "nothing"} from pressganged captives.`,
    );
    return;
  }
  if (p.kind === "mass-uprising") {
    const cluster = Number(i.target);
    requireRule(
      g.systems.some((s) => s.cluster === cluster),
      "choose_active_cluster",
    );
    const systems = g.systems.filter((s) => s.cluster === cluster);
    const chosen = i.ids ?? systems.map((s) => s.id);
    requireRule(
      unique(chosen) &&
        chosen.length === Math.min(g.available(id, "ship"), systems.length) &&
        chosen.every((s) => systems.some((x) => x.id === s)),
      "choose_systems_for_available_ships",
    );
    for (const s of chosen) place(g, id, "ship", s);
    g.note(`${id} raised a Mass Uprising in cluster ${cluster}.`);
    g.courtDiscard.push(p.kind);
    return;
  }
  if (p.kind === "populist-demands") {
    if (i.target !== "skip") declare(g, id, i.ambition ?? "", false);
    g.courtDiscard.push(p.kind);
    return;
  }
  if (p.kind === "outrage-spreads") {
    if (i.target !== "skip") {
      requireRule(RESOURCES.includes(i.resource ?? ""), "choose_outrage_type");
      for (const rival of g.turnOrder()) outrage(g, rival, i.resource ?? "");
    }
    g.courtDiscard.push(p.kind);
    return;
  }
  if (p.kind === "song-of-freedom") {
    if (i.target !== "skip") {
      const city = findPiece(g, i.target);
      requireRule(
        city.kind === "city" && g.control(city.system) === id,
        "choose_city_you_control",
      );
      g.pieces = g.pieces.filter((x) => x !== city);
      g.note(`${id} freed ${city.owner}'s city in ${city.system}.`);
      ask(g, "resources", city.owner);
      if (i.seize === "yes") seize(g, id);
    }
    g.courtDeck = rng.shuffle([...g.courtDeck, p.kind]);
    return;
  }
  if (p.kind === "guild-struggle") {
    if (i.target !== "skip") steal(g, id, i.target ?? "", i.card ?? "", -1);
    const guilds = g.courtDiscard.filter((c) => courtCard(c).resource);
    g.courtDiscard = g.courtDiscard.filter((c) => !courtCard(c).resource);
    g.courtDeck = rng.shuffle([...g.courtDeck, ...guilds]);
    g.courtDiscard.push(p.kind);
    return;
  }
  throw new RuleError("unknown_pending_choice");
}

function guildPrelude(g: GameState, id: string, i: Input): void {
  requireRule(g.phase === "actions" && g.prelude, "guild_prelude_only");
  const card = i.card ?? "";
  requireRule(
    g.has(id, card) && !g.acquired.includes(card),
    "guild_unavailable_this_prelude",
  );
  const unions: Record<string, string> = {
    "admin-union": "administration",
    "construction-union": "construction",
    "spacing-union": "mobilization",
    "arms-union": "aggression",
  };
  if (unions[card]) {
    const played = g.played.find(
      (p) =>
        p.card.id === i.target &&
        p.mode !== "copy" &&
        p.card.suit === unions[card],
    );
    requireRule(
      played && !g.unions.some((u) => u.card === played.card.id),
      "choose_unclaimed_faceup_card",
    );
    g.player(id).guilds = g.player(id).guilds.filter((c) => c !== card);
    g.unions.push({ owner: id, guild: card, card: played.card.id });
  } else if (card === "lattice-spies") {
    requireRule(g.actionsTaken === 0, "spies_before_other_actions");
    seize(g, id);
    discardGuild(g, id, card);
  } else if (card === "relic-fence") {
    requireRule(!g.used.includes(card), "once_per_turn");
    discardResource(g, id, i.slot ?? -1);
    g.used.push(card);
    gain(g, id, ["relic"]);
  } else if (card === "elder-broker") {
    discardGuild(g, id, card);
    gain(g, id, ["material", "fuel", "weapon"]);
  } else if (card === "farseers") {
    const ids = i.ids ?? [];
    requireRule(
      unique(ids) &&
        ids.every((c) => g.player(id).hand.some((h) => h.id === c)),
      "choose_hand_cards",
    );
    const discarded = g.player(id).hand.filter((c) => ids.includes(c.id));
    g.player(id).hand = g.player(id).hand.filter((c) => !ids.includes(c.id));
    g.actionDiscard.push(...discarded);
    discardGuild(g, id, card);
    drawAction(g, id, ids.length + 1);
  } else if (
    ["material-cartel", "fuel-cartel", "silver-tongues"].includes(card)
  ) {
    if (card !== "silver-tongues")
      requireRule(
        g.player(i.target ?? "").resources[i.slot ?? -1] ===
          (card === "material-cartel" ? "material" : "fuel"),
        "choose_matching_resource",
      );
    steal(
      g,
      id,
      i.target ?? "",
      card === "silver-tongues" ? (i.kind ?? "") : "",
      i.slot ?? -1,
    );
    discardGuild(g, id, card);
  } else if (card === "mining-interest" || card === "shipping-interest") {
    const resource = card === "mining-interest" ? "material" : "fuel",
      empty = g.capacity(id) - g.player(id).resources.filter(Boolean).length;
    const amount = i.amount ?? empty;
    requireRule(integer(amount, 0, empty), "choose_amount_up_to_empty_slots");
    discardGuild(g, id, card);
    if (amount) ask(g, "interest", id, resource, amount);
  } else if (card === "gatekeepers") {
    const gates = g.systems.filter((s) => !s.planet),
      ids = i.ids ?? gates.map((g) => g.id);
    requireRule(
      unique(ids) &&
        ids.length === Math.min(g.available(id, "ship"), gates.length) &&
        ids.every((s) => gates.some((g) => g.id === s)),
      "choose_gates_for_available_ships",
    );
    discardGuild(g, id, card);
    for (const s of ids) place(g, id, "ship", s);
  } else if (
    [
      "prison-wardens",
      "skirmishers",
      "court-enforcers",
      "loyal-marines",
    ].includes(card)
  ) {
    requireRule(
      g.systems.some((s) => s.id === i.system) &&
        g.control(i.system ?? "") === id,
      "choose_controlled_system",
    );
    discardGuild(g, id, card);
    for (let n = 0; n < 3; n++) place(g, id, "ship", i.system ?? "");
  } else throw new RuleError("guild_has_no_prelude_action");
  g.actionsTaken++;
  g.note(`${id} used ${courtCard(card).name}.`);
}
function guildAction(g: GameState, id: string, i: Input): void {
  const requirements: Record<string, [string, string]> = {
    manufacture: ["mining-interest", "build"],
    synthesize: ["shipping-interest", "build"],
    pressgang: ["prison-wardens", "build"],
    execute: ["prison-wardens", "influence"],
    abduct: ["court-enforcers", "battle"],
    trade: ["elder-broker", "tax"],
  };
  const requirement = requirements[i.op];
  requireRule(
    requirement && g.has(id, requirement[0]),
    "required_guild_not_owned",
  );
  pay(g, id, i, requirement[1]);
  if (i.op === "manufacture" || i.op === "synthesize") {
    const resource = i.op === "manufacture" ? "material" : "fuel",
      [gained] = gain(g, id, [resource]);
    g.note(
      `${id} ${i.op === "manufacture" ? "manufactured" : "synthesized"} ${gained ? resource : "nothing"}.`,
    );
    return;
  }
  if (i.op === "pressgang" || i.op === "execute") {
    const captives = [...g.player(id).captives],
      chosen = i.values ?? [];
    for (const owner of chosen) {
      const index = captives.indexOf(owner);
      requireRule(index >= 0, "captive_not_available");
      captives.splice(index, 1);
    }
    g.player(id).captives = captives;
    if (i.op === "execute")
      for (const owner of chosen)
        g.player(id).trophies.push({
          id: `agent-${++g.serial}`,
          owner,
          kind: "agent",
          system: "",
          damaged: false,
        });
    else if (chosen.length)
      ask(g, "pressgang-resources", id, "", chosen.length);
    g.note(
      `${id} ${i.op === "execute" ? "executed" : "pressganged"} ${chosen.length ? `captives of ${chosen.join(", ")}` : "no captives"}.`,
    );
    return;
  }
  if (i.op === "abduct") {
    const c = g.court.find((c) => c.id === i.card);
    requireRule(c, "choose_court_card");
    const rivals = c.agents.filter((a) => a !== id);
    requireRule(
      rivals.length < g.icons(id, "weapon"),
      "not_enough_weapon_icons",
    );
    g.player(id).captives.push(...rivals);
    c.agents = c.agents.filter((a) => a === id);
    g.note(
      `${id} abducted ${rivals.length} agent${rivals.length === 1 ? "" : "s"} from ${courtCard(c.id).name}.`,
    );
    return;
  }
  if (i.op === "trade") {
    const city = findPiece(g, i.target);
    requireRule(
      city.kind === "city" &&
        city.owner !== id &&
        g.control(city.system) === id,
      "choose_controlled_rival_city",
    );
    const giveSlot = i.giveSlot ?? -1,
      p = g.player(id),
      r = g.player(city.owner),
      give = p.resources[giveSlot],
      take = g.system(city.system).resource,
      slot = r.resources.indexOf(take);
    requireRule(
      integer(giveSlot, 0, 5) &&
        give &&
        !r.resources.includes(give) &&
        !(r.guilds.includes(`${give}-cartel`) && (g.supply[give] ?? 0) > 0) &&
        slot >= 0,
      "invalid_trade",
    );
    p.resources[giveSlot] = "";
    r.resources[slot] = "";
    receive(g, id, [take]);
    receive(g, r.id, [give]);
    g.note(`${id} traded ${give} to ${r.id} for ${take}.`);
  }
}

export function cloneGame(g: GameState): GameState {
  return Object.assign(new GameState(), g, {
    order: [...g.order],
    players: g.players.map((p) =>
      Object.assign(new PlayerState(), p, {
        hand: p.hand.map((c) => ({ ...c })),
        resources: [...p.resources],
        guilds: [...p.guilds],
        outrage: [...p.outrage],
        outrageAgents: [...p.outrageAgents],
        trophies: p.trophies.map((t) => ({ ...t })),
        captives: [...p.captives],
        peek: p.peek.map((c) => ({ ...c })),
      }),
    ),
    systems: g.systems.map((s) => ({ ...s, neighbors: [...s.neighbors] })),
    pieces: g.pieces.map((p) => ({ ...p })),
    court: g.court.map((c) => ({ ...c, agents: [...c.agents] })),
    courtDeck: [...g.courtDeck],
    courtDiscard: [...g.courtDiscard],
    actionDiscard: g.actionDiscard.map((c) => ({ ...c })),
    facedown: g.facedown.map((c) => ({ ...c })),
    supply: { ...g.supply },
    neutral: { ...g.neutral },
    lead: g.lead.map((c) => ({ ...c })),
    played: g.played.map((p) => ({ ...p, card: { ...p.card } })),
    acted: [...g.acted],
    rearrange: [...g.rearrange],
    passed: [...g.passed],
    taxed: [...g.taxed],
    built: [...g.built],
    acquired: [...g.acquired],
    used: [...g.used],
    spent: [...g.spent],
    unions: g.unions.map((u) => ({ ...u })),
    markers: g.markers.map((m) => ({ ...m })),
    pending: g.pending.map((p) => ({ ...p, data: [...p.data] })),
    battle: g.battle.map((b) => ({
      ...b,
      dice: b.dice.map((d) => ({ ...d })),
    })),
    rolls: g.rolls.map((r) => ({ ...r, dice: r.dice.map((d) => ({ ...d })) })),
    log: [...g.log],
    scores: g.scores.map((s) => ({ ...s })),
  });
}
