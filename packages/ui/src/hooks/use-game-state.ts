import { useRef, useSyncExternalStore } from "react";
import { useTTKitContext } from "../client/context.tsx";

/**
 * Subscribe to a slice of the current view. Throws if no view is loaded yet —
 * use `useGameStateOrNull` from a wrapping component if you need to render
 * before a snapshot arrives.
 *
 * `TView` defaults to `unknown` — pass the view type explicitly
 * (`useGameState<SplendorView>(selector)`) or import a pre-bound hook from
 * `createGameHooks<G>()` to avoid the per-call annotation.
 */
export function useGameState<TView = unknown, TSelected = unknown>(
  selector: (view: TView) => TSelected,
  isEqual: (a: TSelected, b: TSelected) => boolean = Object.is,
): TSelected {
  const { client } = useTTKitContext();
  const cache = useRef<{ selected: TSelected; hasValue: boolean }>({
    selected: undefined as TSelected,
    hasValue: false,
  });

  const getSnapshot = (): TSelected => {
    const view = client.getView();
    if (view === null) {
      throw new Error(
        "useGameState: no view loaded. Use useGameStateOrNull or render a loading state first.",
      );
    }
    const next = selector(view as TView);
    if (cache.current.hasValue && isEqual(cache.current.selected, next)) {
      return cache.current.selected;
    }
    cache.current = { selected: next, hasValue: true };
    return next;
  };

  return useSyncExternalStore(client.subscribe.bind(client), getSnapshot);
}
