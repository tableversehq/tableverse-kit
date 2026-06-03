import type { Command } from "../types/command";
import type { ExecutionResult } from "../types/result";
import type { CanonicalState } from "../types/state";

export interface ScenarioResult<
  State extends CanonicalState = CanonicalState,
  TCommandInput extends Command = Command,
> {
  initialState: State;
  finalState: State;
  commands: TCommandInput[];
  results: ExecutionResult<State>[];
}

export function runScenario<
  State extends CanonicalState = CanonicalState,
  TCommandInput extends Command = Command,
>(
  gameExecutor: {
    createInitialState(...args: unknown[]): State;
    executeCommand(
      state: State,
      command: TCommandInput,
    ): ExecutionResult<State>;
  },
  commands: TCommandInput[],
  ...initialStateArgs: unknown[]
): ScenarioResult<State, TCommandInput> {
  const initialState = gameExecutor.createInitialState(...initialStateArgs);
  let currentState = initialState;
  const results: ExecutionResult<State>[] = [];

  for (const command of commands) {
    const result = gameExecutor.executeCommand(currentState, command);
    results.push(result);
    currentState = result.state;
  }

  return {
    initialState,
    finalState: currentState,
    commands,
    results,
  };
}
