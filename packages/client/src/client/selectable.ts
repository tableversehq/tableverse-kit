import type {
  DiscoveryStateSnapshot,
  PickOptionOf,
} from "./discovery-state.ts";
import type { TableverseGame } from "./types.ts";

/**
 * Selection state of a candidate option within the current discovery flow.
 * Framework-neutral — the React `useSelectable` hook is a thin projection of
 * `selectable()` below.
 */
export type SelectableState =
  | "idle"
  | "selectable"
  | "selected"
  | "unselectable";

export interface SelectableResult<G extends TableverseGame> {
  readonly state: SelectableState;
  /** The matching open option when `state === "selectable"`, otherwise null. */
  readonly option: PickOptionOf<G> | null;
}

/**
 * Pure decision table over a discovery snapshot. Given the current snapshot, a
 * discovery step, and a predicate identifying the target option, report whether
 * that target is idle / selectable / already selected / unselectable, and
 * surface the option to pick when selectable.
 *
 * No React and no side effects: a renderer wires `result.option` to
 * `DiscoveryState.pick` however it likes — a click handler, a raycast hit, a
 * keypress. This is the framework-neutral core the React `useSelectable` hook
 * projects onto React's render model.
 */
export function selectable<G extends TableverseGame>(
  snapshot: DiscoveryStateSnapshot<G>,
  discoveryStep: string,
  isTarget: (option: PickOptionOf<G>) => boolean,
): SelectableResult<G> {
  if (snapshot.trail.some(isTarget)) {
    return { state: "selected", option: null };
  }
  if (snapshot.open === null) {
    return { state: "idle", option: null };
  }
  if (snapshot.open.step !== discoveryStep) {
    return { state: "unselectable", option: null };
  }
  const matching = snapshot.open.options.find(isTarget);
  if (!matching) {
    return { state: "unselectable", option: null };
  }
  return { state: "selectable", option: matching };
}
