import type { GameEvent } from "./event";
import type { CanonicalState } from "./state";

export interface ValidationResult {
  ok: true;
}

export interface ValidationError {
  ok: false;
  reason: string;
  metadata?: unknown;
}

export type ValidationOutcome = ValidationResult | ValidationError;

export interface ExecutionSuccess<
  State extends CanonicalState = CanonicalState,
> {
  ok: true;
  state: State;
  events: GameEvent[];
}

export interface ExecutionFailure<
  State extends CanonicalState = CanonicalState,
> {
  ok: false;
  state: State;
  reason: string;
  metadata?: unknown;
  events: GameEvent[];
}

export type ExecutionResult<State extends CanonicalState = CanonicalState> =
  | ExecutionSuccess<State>
  | ExecutionFailure<State>;
