import { useDiscovery, type UseDiscoveryResult } from "./use-discovery.ts";

export type SelectableState =
  | "idle"
  | "selectable"
  | "selected"
  | "unselectable";

type DiscoveryPickOption = UseDiscoveryResult["trail"][number];

export interface UseSelectableResult {
  state: SelectableState;
  onClick: () => void;
  option: DiscoveryPickOption | null;
}

/**
 * Bind a UI element to the active discovery. Returns whether the element is
 * currently a valid pick, whether it has already been picked in this flow,
 * and an onClick that commits the pick.
 *
 * `slot` is the discovery step id (e.g. "gem", "card"). `target` is the
 * value that uniquely identifies this element within the slot — compared
 * against `option.output` fields by deep equality.
 */
export function useSelectable(
  slot: string,
  target: unknown,
): UseSelectableResult {
  const discovery = useDiscovery();

  const alreadyPicked = discovery.trail.some((option) =>
    optionMatchesTarget(option, target),
  );

  if (alreadyPicked) {
    return { state: "selected", onClick: noop, option: null };
  }

  if (discovery.open === null) {
    return { state: "idle", onClick: noop, option: null };
  }

  if (discovery.open.step !== slot) {
    return { state: "unselectable", onClick: noop, option: null };
  }

  const matching = discovery.open.options.find((option) =>
    optionMatchesTarget(option, target),
  );

  if (!matching) {
    return { state: "unselectable", onClick: noop, option: null };
  }

  return {
    state: "selectable",
    option: matching,
    onClick: () => discovery.pick(matching),
  };
}

function optionMatchesTarget(
  option: DiscoveryPickOption,
  target: unknown,
): boolean {
  if (target === undefined || target === null) {
    return false;
  }
  const output = option.output;
  if (typeof target !== "object") {
    for (const value of Object.values(output)) {
      if (value === target) return true;
    }
    return false;
  }
  return shallowMatch(output, target as Record<string, unknown>);
}

function shallowMatch(
  output: Record<string, unknown>,
  target: Record<string, unknown>,
): boolean {
  for (const key of Object.keys(target)) {
    if (output[key] !== target[key]) return false;
  }
  return true;
}

function noop(): void {}
