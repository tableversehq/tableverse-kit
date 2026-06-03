import type { GameEvent } from "./event";
import type { Command } from "./command";
import type { CanonicalState } from "./state";

export interface Snapshot<State extends CanonicalState = CanonicalState> {
  version: 1;
  state: State;
}

export interface ReplayRecord<
  State extends CanonicalState = CanonicalState,
  TCommandInput extends Command = Command,
  Ev extends GameEvent = GameEvent,
> {
  initialSnapshot: Snapshot<State>;
  commands: TCommandInput[];
  events: Ev[];
  checkpoints: Snapshot<State>[];
}
