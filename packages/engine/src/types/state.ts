import type { ProgressionState } from "./progression";
import type { RNGState } from "./rng";

export interface HistoryEntry {
  id: string;
  commandType: string;
  actorId?: string;
}

export interface HistoryState {
  entries: HistoryEntry[];
}

export interface RuntimeState {
  progression: ProgressionState;
  rng: RNGState;
  history: HistoryState;
}

export interface CanonicalState<GameState extends object = object> {
  game: GameState;
  runtime: RuntimeState;
}
