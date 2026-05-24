import { useTTKitContext } from "../client/context.tsx";
import type { TTKitClient, TTKitGame } from "../client/types.ts";

/**
 * Return the underlying TTKitClient. `G` defaults to the unparameterized
 * `TTKitGame` shape — pass `G` explicitly or use a pre-bound hook from
 * `createGameHooks<G>()` to get typed view/event/command shapes.
 */
export function useTTKitClient<
  G extends TTKitGame = TTKitGame,
>(): TTKitClient<G> {
  return useTTKitContext().client as TTKitClient<G>;
}
