import { useRef, useSyncExternalStore } from "react";
import { useTTKitContext } from "../client/context.tsx";

/**
 * Like `useGameState` but returns `null` instead of throwing when no view
 * is loaded yet. `TView` defaults to `unknown` — annotate explicitly or use
 * a pre-bound hook from `createGameHooks<G>()`.
 */
export function useGameStateOrNull<TView = unknown>(): TView | null;
export function useGameStateOrNull<TView, TSelected>(
  selector: (view: TView) => TSelected,
  isEqual?: (a: TSelected, b: TSelected) => boolean,
): TSelected | null;
export function useGameStateOrNull<TView = unknown, TSelected = unknown>(
  selector?: (view: TView) => TSelected,
  isEqual: (a: TSelected, b: TSelected) => boolean = Object.is,
): TSelected | TView | null {
  const { client } = useTTKitContext();
  const cache = useRef<{
    selected: TSelected | TView | null;
    hasValue: boolean;
  }>({
    selected: null,
    hasValue: false,
  });

  const getSnapshot = (): TSelected | TView | null => {
    const view = client.getView();
    if (view === null) {
      if (cache.current.hasValue && cache.current.selected === null) {
        return cache.current.selected;
      }
      cache.current = { selected: null, hasValue: true };
      return null;
    }
    const next = selector ? selector(view as TView) : (view as TView);
    if (
      cache.current.hasValue &&
      cache.current.selected !== null &&
      isEqual(cache.current.selected as TSelected, next as TSelected)
    ) {
      return cache.current.selected;
    }
    cache.current = { selected: next, hasValue: true };
    return next;
  };

  return useSyncExternalStore(client.subscribe.bind(client), getSnapshot);
}
