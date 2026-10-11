export const SUITS = [
  "administration",
  "aggression",
  "construction",
  "mobilization",
];
export const RESOURCES = ["material", "fuel", "weapon", "relic", "psionic"];
export const AMBITIONS = ["tycoon", "tyrant", "warlord", "keeper", "empath"];
export const ACTIONS: Record<string, string[]> = {
  administration: ["tax", "repair", "influence"],
  aggression: ["battle", "move", "secure"],
  construction: ["build", "repair"],
  mobilization: ["move", "influence"],
};
export interface ActionCard {
  id: string;
  suit: string;
  rank: number;
  pips: number;
  ambition: string;
}
export function actionDeck(players: number): ActionCard[] {
  return SUITS.flatMap((suit) =>
    Array.from({ length: players === 4 ? 7 : 5 }, (_, i) => {
      const rank = i + (players === 4 ? 1 : 2);
      const pips =
        suit === "aggression"
          ? [3, 3, 2, 2, 2, 2, 1][rank - 1]
          : suit === "administration"
            ? [4, 4, 3, 3, 3, 2, 1][rank - 1]
            : [4, 4, 3, 3, 2, 2, 1][rank - 1];
      return {
        id: `${suit}-${rank}`,
        suit,
        rank,
        pips: pips ?? 0,
        ambition: rank === 7 ? "any" : (AMBITIONS[rank - 2] ?? ""),
      };
    }),
  );
}
export interface CourtCard {
  id: string;
  name: string;
  resource: string;
  cost: number;
  text: string;
}
const courtData: [string, string, number, string][] = [
  [
    "Loyal Engineers",
    "material",
    3,
    "Keep through Outrage. Spend any resource as Material, ignoring Material Outrage.",
  ],
  [
    "Mining Interest",
    "material",
    2,
    "Manufacture (Build): gain 1 Material. Prelude: discard to fill empty slots with Material; steal if the supply empties.",
  ],
  [
    "Material Cartel",
    "material",
    2,
    "Count the Material supply for Tycoon. After scoring, rivals discard Material. Prelude: discard to steal 1 Material.",
  ],
  [
    "Admin Union",
    "material",
    2,
    "Prelude: claim a face-up Administration card. At round end take it into your hand and discard this.",
  ],
  [
    "Construction Union",
    "material",
    2,
    "Prelude: claim a face-up Construction card. At round end take it into your hand and discard this.",
  ],
  [
    "Fuel Cartel",
    "fuel",
    2,
    "Count the Fuel supply for Tycoon. After scoring, rivals discard Fuel. Prelude: discard to steal 1 Fuel.",
  ],
  [
    "Loyal Pilots",
    "fuel",
    3,
    "Keep through Outrage. Spend any resource as Fuel, ignoring Fuel Outrage.",
  ],
  [
    "Gatekeepers",
    "fuel",
    2,
    "Battle in a gate: collect up to 2 extra dice. Prelude: discard to place 1 ship in each gate.",
  ],
  [
    "Shipping Interest",
    "fuel",
    2,
    "Synthesize (Build): gain 1 Fuel. Prelude: discard to fill empty slots with Fuel; steal if the supply empties.",
  ],
  [
    "Spacing Union",
    "fuel",
    2,
    "Prelude: claim a face-up Mobilization card. At round end take it into your hand and discard this.",
  ],
  [
    "Arms Union",
    "weapon",
    2,
    "Prelude: claim a face-up Aggression card. At round end take it into your hand and discard this.",
  ],
  [
    "Prison Wardens",
    "weapon",
    2,
    "Pressgang (Build): return captives for resources. Execute (Influence): move captives to trophies. Prelude: discard to place 3 ships in a controlled system.",
  ],
  [
    "Skirmishers",
    "weapon",
    2,
    "Battle: reroll skirmish dice up to your Weapon icons. Prelude: discard to place 3 ships in a controlled system.",
  ],
  [
    "Court Enforcers",
    "weapon",
    2,
    "Abduct (Battle): capture all rival agents from a court card with fewer rival agents than your Weapon icons. Prelude: discard to place 3 ships in a controlled system.",
  ],
  [
    "Loyal Marines",
    "weapon",
    3,
    "Keep through Outrage. Spend any resource as Weapons, ignoring Weapon Outrage. Prelude: discard to place 3 ships in a controlled system.",
  ],
  [
    "Lattice Spies",
    "psionic",
    2,
    "Prelude, before other actions: discard to seize initiative, if it has not been seized.",
  ],
  [
    "Farseers",
    "psionic",
    2,
    "Declare an ambition: inspect a rival hand and optionally swap one card. Prelude: discard this and hand cards to draw that many cards, including this card, from the bottom of the action discard.",
  ],
  [
    "Secret Order",
    "psionic",
    2,
    "When declaring Keeper or Empath, keep the lead card’s number.",
  ],
  [
    "Loyal Empaths",
    "psionic",
    3,
    "Keep through Outrage. Spend any resource as Psionic, ignoring Psionic Outrage.",
  ],
  [
    "Silver-Tongues",
    "psionic",
    2,
    "Prelude: discard to steal a Guild card or resource.",
  ],
  [
    "Loyal Keepers",
    "relic",
    3,
    "Keep through Outrage. Spend any resource as Relics, ignoring Relic Outrage.",
  ],
  [
    "Sworn Guardians",
    "relic",
    1,
    "Rivals cannot steal your resources or other Guild cards. If stolen, bury this card.",
  ],
  [
    "Elder Broker",
    "relic",
    2,
    "Trade (Tax): swap a resource with a rival city you control, taking its planet type and giving a type they lack. Prelude: discard to gain Material, Fuel, and Weapon.",
  ],
  [
    "Relic Fence",
    "relic",
    2,
    "Prelude, once per turn: discard a resource to gain a Relic.",
  ],
  [
    "Galactic Bards",
    "relic",
    1,
    "When Surpassing or Pivoting, declare your card’s ambition if none was declared this round. Keep the lead card’s number.",
  ],
  [
    "Mass Uprising",
    "",
    0,
    "When secured: place one ship in each system of a chosen cluster. Discard this.",
  ],
  [
    "Populist Demands",
    "",
    0,
    "When secured: optionally declare any available ambition. Discard this.",
  ],
  [
    "Outrage Spreads",
    "",
    0,
    "When secured: optionally choose a resource; every player provokes that Outrage. Discard this.",
  ],
  [
    "Song of Freedom",
    "",
    0,
    "When secured: optionally return a city you control and optionally seize initiative. Shuffle this into the Court deck.",
  ],
  [
    "Guild Struggle",
    "",
    0,
    "When secured: optionally steal a Guild card. Shuffle discarded Guild cards into the Court deck, then discard this.",
  ],
  [
    "Call to Action",
    "",
    0,
    "When secured: draw the bottom action discard. Discard this.",
  ],
];
export const COURT: CourtCard[] = courtData.map(
  ([name, resource, cost, text]) => ({
    id: name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-"),
    name,
    resource,
    cost,
    text,
  }),
);
export function courtCard(id: string): CourtCard {
  const card = COURT.find((c) => c.id === id);
  if (!card) throw new Error("unknown_court_card");
  return card;
}
export interface MapSystem {
  id: string;
  cluster: number;
  planet: number;
  resource: string;
  slots: number;
  x: number;
  y: number;
  neighbors: string[];
}
const planets: [string, number][][] = [
  [
    ["weapon", 2],
    ["fuel", 1],
    ["material", 2],
  ],
  [
    ["psionic", 1],
    ["weapon", 1],
    ["relic", 2],
  ],
  [
    ["material", 1],
    ["fuel", 1],
    ["weapon", 2],
  ],
  [
    ["relic", 2],
    ["fuel", 2],
    ["material", 1],
  ],
  [
    ["weapon", 1],
    ["relic", 1],
    ["psionic", 2],
  ],
  [
    ["material", 1],
    ["fuel", 2],
    ["psionic", 1],
  ],
];
export function makeMap(blocked: number[]): MapSystem[] {
  const clusters = [1, 2, 3, 4, 5, 6].filter((c) => !blocked.includes(c));
  const systems = clusters.flatMap((cluster, index) => {
    const angle = ((-90 + (cluster - 1) * 60) * Math.PI) / 180;
    const gate: MapSystem = {
      id: `${cluster}g`,
      cluster,
      planet: 0,
      resource: "",
      slots: 0,
      x: 500 + 154 * Math.cos(angle),
      y: 410 + 144 * Math.sin(angle),
      neighbors: [
        `${clusters[(index + clusters.length - 1) % clusters.length]}g`,
        `${clusters[(index + 1) % clusters.length]}g`,
        ...[1, 2, 3].map((p) => `${cluster}.${p}`),
      ],
    };
    return [
      gate,
      ...(planets[cluster - 1] ?? []).map(([resource, slots], i) => {
        const a = angle + ((i - 1) * 19 * Math.PI) / 180;
        return {
          id: `${cluster}.${i + 1}`,
          cluster,
          planet: i + 1,
          resource,
          slots,
          x: 500 + 337 * Math.cos(a),
          y: 410 + 312 * Math.sin(a),
          neighbors: [
            gate.id,
            ...[i, i + 2]
              .filter((p) => p >= 1 && p <= 3)
              .map((p) => `${cluster}.${p}`),
          ],
        };
      }),
    ];
  });
  for (const [a, b] of [
    ["2.3", "3.1"],
    ["5.3", "6.1"],
  ]) {
    const from = systems.find((s) => s.id === a),
      to = systems.find((s) => s.id === b);
    if (from && to) {
      from.neighbors.push(to.id);
      to.neighbors.push(from.id);
    }
  }
  return systems;
}
export interface SetupCard {
  id: string;
  players: number;
  blocked: number[];
  positions: string[][];
}
export const SETUPS: SetupCard[] = [
  {
    id: "2-players-mix-up-1",
    players: 2,
    blocked: [2, 5],
    positions: [
      ["4.2", "3.2", "1g", "6.1"],
      ["6.3", "3.3", "4g", "1.2"],
    ],
  },
  {
    id: "2-players-mix-up-2",
    players: 2,
    blocked: [1, 4],
    positions: [
      ["5.2", "2.1", "3g", "6.2"],
      ["2.2", "6.1", "5g", "3.3"],
    ],
  },
  {
    id: "2-players-homelands",
    players: 2,
    blocked: [1, 4],
    positions: [
      ["5.1", "6.1", "5g", "5.3"],
      ["3.3", "3.1", "3g", "2.1"],
    ],
  },
  {
    id: "2-players-frontiers",
    players: 2,
    blocked: [1, 6],
    positions: [
      ["5.3", "4.3", "3g", "3.3"],
      ["3.1", "5.1", "5g", "4.1"],
    ],
  },
  {
    id: "3-players-mix-up",
    players: 3,
    blocked: [1, 4],
    positions: [
      ["3.3", "5.2", "2g"],
      ["5.3", "2.1", "3g"],
      ["2.3", "3.1", "5g"],
    ],
  },
  {
    id: "3-players-homelands",
    players: 3,
    blocked: [5, 6],
    positions: [
      ["2.3", "3.2", "3g"],
      ["1.3", "2.1", "2g"],
      ["1.1", "4.3", "4g"],
    ],
  },
  {
    id: "3-players-frontiers",
    players: 3,
    blocked: [2, 3],
    positions: [
      ["1.3", "4.3", "6g"],
      ["5.3", "1.2", "5g"],
      ["4.2", "6.1", "1g"],
    ],
  },
  {
    id: "3-players-core-conflict",
    players: 3,
    blocked: [3, 6],
    positions: [
      ["1.3", "2.2", "1g"],
      ["2.3", "1.2", "2g"],
      ["1.1", "2.1", "4g"],
    ],
  },
  {
    id: "4-players-mix-up-1",
    players: 4,
    blocked: [3],
    positions: [
      ["4.1", "6.3", "1g"],
      ["4.3", "5.3", "6g"],
      ["5.1", "1.3", "4g"],
      ["6.1", "1.1", "5g"],
    ],
  },
  {
    id: "4-players-mix-up-2",
    players: 4,
    blocked: [4],
    positions: [
      ["5.3", "3.1", "2g"],
      ["3.3", "5.2", "1g"],
      ["2.3", "1.3", "3g"],
      ["1.1", "2.1", "5g"],
    ],
  },
  {
    id: "4-players-mix-up-3",
    players: 4,
    blocked: [6],
    positions: [
      ["3.3", "5.2", "1g"],
      ["1.1", "3.1", "2g"],
      ["1.3", "4.3", "3g"],
      ["4.1", "2.2", "5g"],
    ],
  },
  {
    id: "4-players-frontiers",
    players: 4,
    blocked: [5],
    positions: [
      ["1.3", "3.2", "2g"],
      ["2.3", "6.3", "3g"],
      ["4.2", "2.1", "6g"],
      ["1.1", "6.1", "4g"],
    ],
  },
];
export interface DieFace {
  self: number;
  ship: number;
  building: number;
  keys: number;
  intercept: boolean;
}
const face = (
  self = 0,
  ship = 0,
  building = 0,
  keys = 0,
  intercept = false,
): DieFace => ({ self, ship, building, keys, intercept });
export const DICE: Record<string, DieFace[]> = {
  assault: [
    face(0, 2),
    face(1, 2),
    face(0, 1, 0, 0, true),
    face(1, 1),
    face(1, 1),
    face(),
  ],
  skirmish: [face(0, 1), face(0, 1), face(0, 1), face(), face(), face()],
  raid: [
    face(0, 0, 0, 2, true),
    face(1, 0, 0, 1),
    face(0, 0, 1, 1),
    face(1, 0, 1),
    face(1, 0, 1),
    face(0, 0, 0, 0, true),
  ],
};
export const RAID_COSTS = [3, 1, 1, 2, 1, 3];
