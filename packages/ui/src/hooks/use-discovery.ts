import { useMemo, useSyncExternalStore } from "react";
import { useTTKitContext } from "../client/context.tsx";
import type { DiscoveryStatus } from "../client/discovery-state.ts";
import type { TTKitGame } from "../client/types.ts";

type OpenResultOf<G extends TTKitGame> = Extract<
  G["discovery"]["result"],
  { complete: false }
>;

type PickOptionOf<G extends TTKitGame> =
  OpenResultOf<G> extends { options: ReadonlyArray<infer O> } ? O : never;

type CompleteResultOf<G extends TTKitGame> = Extract<
  G["discovery"]["result"],
  { complete: true }
>;

type CommandInputOf<G extends TTKitGame> =
  CompleteResultOf<G> extends { input: infer I } ? I : never;

type DiscoveryPayloadOf<G extends TTKitGame> = G["discovery"]["payload"];

export interface UseDiscoveryResult<G extends TTKitGame = TTKitGame> {
  activeCommandType: string | null;
  open: OpenResultOf<G> | null;
  trail: ReadonlyArray<PickOptionOf<G>>;
  pendingInput: CommandInputOf<G> | null;
  status: DiscoveryStatus;
  error: string | null;
  start: (payload: DiscoveryPayloadOf<G>) => void;
  pick: (option: PickOptionOf<G>) => void;
  confirm: () => void;
  cancel: () => void;
}

/**
 * `G` defaults to the unparameterized `TTKitGame` shape; pass the game's
 * full shape (`useDiscovery<SplendorGame>()`) or use a pre-bound hook from
 * `createGameHooks<G>()` for typed `open` / `trail` / `pendingInput` and
 * typed `start` / `pick` parameters.
 */
export function useDiscovery<
  G extends TTKitGame = TTKitGame,
>(): UseDiscoveryResult<G> {
  const { discovery } = useTTKitContext();

  const snapshot = useSyncExternalStore(
    discovery.subscribe.bind(discovery),
    discovery.getSnapshot.bind(discovery),
  );

  const actions = useMemo(
    () => ({
      start: discovery.start.bind(discovery),
      pick: discovery.pick.bind(discovery),
      confirm: discovery.confirm.bind(discovery),
      cancel: discovery.cancel.bind(discovery),
    }),
    [discovery],
  );

  return { ...snapshot, ...actions } as unknown as UseDiscoveryResult<G>;
}
