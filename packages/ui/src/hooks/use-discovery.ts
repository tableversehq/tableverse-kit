import { useMemo, useSyncExternalStore } from "react";
import { useTTKitContext } from "../client/context.tsx";
import type { DiscoveryStatus } from "../client/discovery-state.ts";
import type { RegisteredGame, TTKitGame } from "../client/types.ts";

/**
 * Open-discovery variant from the customer's typed result union. With the
 * tightened TTKitGame constraints, G["discovery"]["result"] always extends
 * the engine's CommandDiscoveryResult, so the Extract narrows correctly.
 */
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

type RegisteredOpenResult = OpenResultOf<RegisteredGame>;
type RegisteredPickOption = PickOptionOf<RegisteredGame>;
type RegisteredCommandInput = CommandInputOf<RegisteredGame>;
type RegisteredDiscoveryPayload = DiscoveryPayloadOf<RegisteredGame>;

export interface UseDiscoveryResult {
  activeCommandType: string | null;
  open: RegisteredOpenResult | null;
  trail: ReadonlyArray<RegisteredPickOption>;
  pendingInput: RegisteredCommandInput | null;
  status: DiscoveryStatus;
  error: string | null;
  start: (payload: RegisteredDiscoveryPayload) => void;
  pick: (option: RegisteredPickOption) => void;
  confirm: () => void;
  cancel: () => void;
}

export function useDiscovery(): UseDiscoveryResult {
  const { discovery } = useTTKitContext();

  const snapshot = useSyncExternalStore(
    discovery.subscribe.bind(discovery),
    discovery.getSnapshot.bind(discovery),
  );

  const actions = useMemo<DiscoveryActions>(
    () => ({
      start: discovery.start.bind(discovery),
      pick: discovery.pick.bind(discovery),
      confirm: discovery.confirm.bind(discovery),
      cancel: discovery.cancel.bind(discovery),
    }),
    [discovery],
  );

  return { ...snapshot, ...actions };
}

type DiscoveryActions = Pick<
  UseDiscoveryResult,
  "start" | "pick" | "confirm" | "cancel"
>;
