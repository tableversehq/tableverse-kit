import type { Command } from "../types/command";
import type { GameEvent } from "../types/event";
import type { ExecutionResult } from "../types/result";
import type { CanonicalState } from "../types/state";
import type { ReplayRecord, Snapshot } from "../types/snapshot";
import { restoreSnapshot } from "../snapshot/snapshot";

export function createReplayRecord<
  State extends CanonicalState = CanonicalState,
  TCommandInput extends Command = Command,
  Ev extends GameEvent = GameEvent,
>(initialSnapshot: Snapshot<State>): ReplayRecord<State, TCommandInput, Ev> {
  return {
    initialSnapshot,
    commands: [],
    events: [],
    checkpoints: [],
  };
}

export function appendReplayStep<
  State extends CanonicalState = CanonicalState,
  TCommandInput extends Command = Command,
  Ev extends GameEvent = GameEvent,
>(
  record: ReplayRecord<State, TCommandInput, Ev>,
  command: TCommandInput,
  result: ExecutionResult<State>,
): ReplayRecord<State, TCommandInput, Ev> {
  return {
    ...record,
    commands: [...record.commands, command],
    events: [...record.events, ...(result.events as Ev[])],
  };
}

export function replayRecord<
  State extends CanonicalState = CanonicalState,
  TCommandInput extends Command = Command,
>(
  gameExecutor: {
    executeCommand(
      state: State,
      command: TCommandInput,
    ): ExecutionResult<State>;
  },
  record: ReplayRecord<State, TCommandInput>,
): State {
  let state = restoreSnapshot(record.initialSnapshot);

  for (const command of record.commands) {
    state = gameExecutor.executeCommand(state, command).state;
  }

  return state;
}
