import type { ProgressionState } from "./progression";

export interface PlayerViewer {
  kind: "player";
  playerId: string;
}

export interface SpectatorViewer {
  kind: "spectator";
}

export type Viewer = PlayerViewer | SpectatorViewer;

export interface HiddenValue<TValue = unknown> {
  __hidden: true;
  value?: TValue;
}

export interface VisibleState<TVisibleGame extends object = object> {
  game: TVisibleGame;
  progression: ProgressionState;
}
