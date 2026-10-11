import {
  createTableverseClient,
  type GameShapeOf,
} from "@tableverse-kit/client";
import type { executor } from "arcs-engine";

type Shape = GameShapeOf<typeof executor>;

export const client = createTableverseClient<typeof executor>();
export type Client = typeof client;
export type View = Shape["view"];
export type Game = View["game"];
export type PlayerView = Game["players"][number];
export type PieceView = Game["pieces"][number];
export type SystemView = Game["systems"][number];
export type { Input } from "arcs-engine/input";
