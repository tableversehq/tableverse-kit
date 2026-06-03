import type { CanonicalState } from "../types/state";
import type { Snapshot } from "../types/snapshot";

export function createSnapshot<State extends CanonicalState>(
  state: State,
): Snapshot<State> {
  return {
    version: 1,
    state: structuredClone(state),
  };
}

export function restoreSnapshot<State extends CanonicalState>(
  snapshot: Snapshot<State>,
): State {
  return structuredClone(snapshot.state);
}
