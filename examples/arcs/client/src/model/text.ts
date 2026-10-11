import { courtCard } from "arcs-engine/data";
import type { Game } from "../client.ts";

export const PLAYER_COLORS = ["#ef5b4c", "#4ba3ff", "#f3c53f", "#ece5d6"];
export const PLAYER_NAMES = ["Red", "Blue", "Yellow", "White"];

export const RESOURCE_INFO: Record<
  string,
  { name: string; color: string; spend: string }
> = {
  material: { name: "Material", color: "#a9b8c6", spend: "Build or Repair" },
  fuel: { name: "Fuel", color: "#f2c14e", spend: "Move" },
  weapon: {
    name: "Weapon",
    color: "#f07a3a",
    spend: "Battle with your pips this turn",
  },
  relic: { name: "Relic", color: "#3fc9b8", spend: "Secure" },
  psionic: {
    name: "Psionic",
    color: "#d963b8",
    spend: "Any action on the lead card",
  },
};

export const SUIT_INFO: Record<
  string,
  { name: string; color: string; verbs: string }
> = {
  administration: {
    name: "Administration",
    color: "#b3aa9c",
    verbs: "Tax · Repair · Influence",
  },
  aggression: {
    name: "Aggression",
    color: "#d9443a",
    verbs: "Battle · Move · Secure",
  },
  construction: {
    name: "Construction",
    color: "#ea7333",
    verbs: "Build · Repair",
  },
  mobilization: {
    name: "Mobilization",
    color: "#3aa3b0",
    verbs: "Move · Influence",
  },
};

export const AMBITION_INFO: Record<
  string,
  { name: string; counts: string; rank: number }
> = {
  tycoon: { name: "Tycoon", counts: "Material + Fuel", rank: 2 },
  tyrant: { name: "Tyrant", counts: "Captives", rank: 3 },
  warlord: { name: "Warlord", counts: "Trophies", rank: 4 },
  keeper: { name: "Keeper", counts: "Relics", rank: 5 },
  empath: { name: "Empath", counts: "Psionics", rank: 6 },
};

export const VERB_INFO: Record<string, { name: string; hint: string }> = {
  tax: {
    name: "Tax",
    hint: "Gain a resource from your city, or a rival city you control",
  },
  build: {
    name: "Build",
    hint: "City or starport where you have a piece; ship at your starport",
  },
  repair: { name: "Repair", hint: "Fix one of your damaged pieces anywhere" },
  influence: { name: "Influence", hint: "Place an agent on a Court card" },
  secure: {
    name: "Secure",
    hint: "Take a Court card where you have the most agents",
  },
  move: { name: "Move", hint: "Move ships to an adjacent system" },
  battle: { name: "Battle", hint: "Attack a rival where you have ships" },
  manufacture: {
    name: "Manufacture",
    hint: "Mining Interest — instead of Build, gain 1 Material",
  },
  synthesize: {
    name: "Synthesize",
    hint: "Shipping Interest — instead of Build, gain 1 Fuel",
  },
  pressgang: {
    name: "Pressgang",
    hint: "Prison Wardens — instead of Build, return captives for resources",
  },
  execute: {
    name: "Execute",
    hint: "Prison Wardens — instead of Influence, turn captives into trophies",
  },
  abduct: {
    name: "Abduct",
    hint: "Court Enforcers — instead of Battle, capture rival agents from a Court card",
  },
  trade: {
    name: "Trade",
    hint: "Elder Broker — instead of Tax, swap resources with a rival city you control",
  },
};

export const VERB_BLOCKED: Record<string, string> = {
  tax: "No city to tax: your own, or a rival's where you control the system (once per city per turn).",
  build:
    "Nowhere to build: you need a piece on a planet with a free slot, or a starport that hasn't built this turn.",
  repair: "None of your pieces are damaged.",
  influence: "You have no agents left in your supply.",
  secure: "You don't have more agents than each rival on any Court card.",
  move: "None of your ships can move.",
  battle: "None of your ships share a system with a rival's pieces.",
  manufacture: "The Material supply is empty.",
  synthesize: "The Fuel supply is empty.",
  pressgang: "You have no captives.",
  execute: "You have no captives.",
  abduct: "No Court card has fewer rival agents than your Weapon icons.",
  trade: "No rival city in a system you control can trade.",
};

export function playerName(g: Game, id: string): string {
  if (id === "neutral") return "Neutral";
  const color = g.players.find((p) => p.id === id)?.color;
  return color === undefined ? id : (PLAYER_NAMES[color] ?? id);
}

export function playerColor(g: Game, id: string): string {
  const color = g.players.find((p) => p.id === id)?.color;
  return color === undefined ? "#888" : (PLAYER_COLORS[color] ?? "#888");
}

export function systemName(g: Game, id: string): string {
  const s = g.systems.find((x) => x.id === id);
  if (!s) return id;
  if (!s.planet) return `Gate ${s.cluster}`;
  return `${RESOURCE_INFO[s.resource]?.name ?? s.resource} ${s.cluster}.${s.planet}`;
}

export function courtName(id: string): string {
  try {
    return courtCard(id).name;
  } catch {
    return id;
  }
}

const REASONS: Record<string, string> = {
  not_active_player: "It is not your turn.",
  game_over: "The game is over.",
  play_only_at_start_of_turn: "You already played a card this turn.",
  card_not_in_hand: "That card is not in your hand.",
  choose_play_mode: "Choose how to play the card.",
  must_follow_lead: "A lead card is already down — Surpass, Pivot, or Copy.",
  cannot_surpass: "To Surpass, play the lead suit with a higher number.",
  pivot_must_change_suit: "To Pivot, play a different suit than the lead.",
  invalid_seize_card: "You cannot seize the initiative now.",
  initiative_cannot_be_seized:
    "The initiative was already seized, or is yours.",
  cannot_declare_now: "Only the lead card may declare an ambition.",
  ambition_does_not_match_card: "This card shows a different ambition.",
  no_available_ambition_markers: "All ambition markers are already placed.",
  play_a_card_first: "Play a card first.",
  action_not_allowed_by_payment: "That action is not on your card.",
  no_action_pips: "No action pips left on your card.",
  resources_only_in_prelude:
    "Resources can only be spent before your first card action.",
  resource_cannot_convert: "That resource cannot be spent this way.",
  resource_is_outraged: "That resource is Outraged.",
  choose_a_resource: "Choose a resource.",
  cannot_tax_city: "You can tax your own cities, or rival cities you control.",
  city_already_taxed: "Each city can be taxed once per turn.",
  choose_piece_type: "Choose what to build.",
  build_ships_at_loyal_starport: "Ships are built at your own starports.",
  starport_already_built: "Each starport builds one ship per turn.",
  no_available_building_slot: "No free building slot where you have a piece.",
  choose_damaged_loyal_piece: "Choose one of your damaged pieces.",
  cannot_influence: "Choose a Court card.",
  choose_court_card: "Choose a Court card.",
  need_strict_agent_majority: "You need more agents there than each rival.",
  systems_not_adjacent: "Ships move to an adjacent system.",
  choose_distinct_ships: "Choose ships to move.",
  ships_must_share_origin: "Ships must move together from one system.",
  invalid_battle: "You need ships where the defender has pieces.",
  maximum_six_dice_per_type: "At most 6 dice of each type.",
  too_many_dice: "One die per attacking ship.",
  raid_requires_defending_buildings:
    "Raid dice need defending buildings here (or none anywhere).",
  can_only_pass_initiative:
    "Only the initiative holder may pass before the lead.",
  weapons_only_in_prelude: "Weapons are spent before your first card action.",
  need_weapon_or_loyal_marines:
    "Spend a Weapon (or any resource with Loyal Marines).",
  guild_prelude_only:
    "Guild Prelude actions happen before your first card action.",
  guild_unavailable_this_prelude:
    "Cards secured this Prelude cannot be used yet.",
  spies_before_other_actions:
    "Lattice Spies must be used before other actions.",
  once_per_turn: "Once per turn.",
  required_guild_not_owned: "You need that Guild card.",
  not_enough_weapon_icons: "Not enough Weapon icons.",
  choose_controlled_rival_city: "Choose a rival city you control.",
  invalid_trade: "That trade is not allowed.",
  choose_controlled_system: "Choose a system you control.",
  protected_by_sworn_guardians: "Protected by Sworn Guardians.",
  not_enough_raid_keys: "Not enough keys.",
  must_hit_ships_first: "Hit defending ships before buildings.",
  hit_attacking_ship: "Choose one of your attacking ships.",
  hit_defending_piece: "Choose a defending piece.",
  hit_defending_building: "Choose a defending building.",
  regroup_at_a_gate: "Regroup at a gate.",
  fill_available_resource_slots: "Fill every open resource slot you can.",
  rearrange_only_after_gaining:
    "You can rearrange resources right after gaining one.",
  invalid_arrangement: "Resources can only move between your open slots.",
};

export function explain(reason: string): string {
  return (
    REASONS[reason] ??
    reason.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase()) + "."
  );
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
