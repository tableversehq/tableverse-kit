import { useEffect, useRef } from "react";
import { useTTKitContext } from "../client/context.tsx";

export interface UseGameEventsOptions<TEvent = unknown> {
  filter?: (event: TEvent) => boolean;
}

/**
 * Subscribe to the client's event stream for the lifetime of the component.
 *
 * The handler ref is kept current — no stale-closure problem if the handler
 * changes between renders. Each event is delivered exactly once. Events fire
 * after `useGameState` and friends already reflect the post-event view.
 *
 * `TEvent` defaults to `unknown` — pass the event type explicitly
 * (`useGameEvents<SplendorEvent>(handler)`) or use a pre-bound hook from
 * `createGameHooks<G>()`.
 */
export function useGameEvents<TEvent = unknown>(
  handler: (event: TEvent) => void,
  options?: UseGameEventsOptions<TEvent>,
): void {
  const { client } = useTTKitContext();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const filterRef = useRef(options?.filter);
  filterRef.current = options?.filter;

  useEffect(() => {
    return client.onEvent((event) => {
      const filter = filterRef.current;
      if (filter && !filter(event as TEvent)) return;
      handlerRef.current(event as TEvent);
    });
  }, [client]);
}
