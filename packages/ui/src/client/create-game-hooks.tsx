import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  DiscoveryState,
  type CommandInputOf,
  type DiscoveryStatus,
  type OpenSnapshotResult,
  type PickOptionOf,
} from "./discovery-state.ts";
import type { TTKitClient, TTKitGame } from "./types.ts";

export interface TTKitProviderProps<G extends TTKitGame> {
  client: TTKitClient<G>;
  children: ReactNode;
}

export interface UseDiscoveryResult<G extends TTKitGame> {
  activeCommandType: string | null;
  open: OpenSnapshotResult<G> | null;
  trail: ReadonlyArray<PickOptionOf<G>>;
  pendingInput: CommandInputOf<G> | null;
  status: DiscoveryStatus;
  error: string | null;
  start: (payload: G["discovery"]["payload"]) => void;
  pick: (option: PickOptionOf<G>) => void;
  confirm: () => void;
  cancel: () => void;
}

export type SelectableState =
  | "idle"
  | "selectable"
  | "selected"
  | "unselectable";

export interface UseSelectableResult<G extends TTKitGame> {
  state: SelectableState;
  onClick: () => void;
  option: PickOptionOf<G> | null;
}

export interface UseGameEventsOptions<TEvent> {
  filter?: (event: TEvent) => boolean;
}

export interface GameHooks<G extends TTKitGame> {
  readonly TTKitProvider: (props: TTKitProviderProps<G>) => ReactNode;
  readonly useGameState: <TSelected>(
    selector: (view: G["view"]) => TSelected,
  ) => TSelected;
  readonly useGameEvents: (
    handler: (event: G["event"]) => void,
    options?: UseGameEventsOptions<G["event"]>,
  ) => void;
  readonly useDiscovery: () => UseDiscoveryResult<G>;
  readonly useSelectable: (
    discoveryStep: string,
    target: unknown,
  ) => UseSelectableResult<G>;
  readonly useTTKitClient: () => TTKitClient<G>;
  readonly useViewerId: () => string;
}

interface BundleContextValue<G extends TTKitGame> {
  client: TTKitClient<G>;
  discovery: DiscoveryState<G>;
}

/**
 * Returns a Provider + hook bundle pre-bound to the game shape `G`. The
 * bundle owns a private React context, so two `createGameHooks` calls in
 * the same app are independent — hooks from bundle A only read from
 * bundle A's Provider.
 *
 * Typical usage at the app boundary:
 *
 * ```ts
 * // src/game.ts
 * import { createGameHooks } from "@tabletop-kit/ui";
 * import type { SplendorGame } from "./generated-types";
 *
 * export const {
 *   TTKitProvider,
 *   useGameState,
 *   useDiscovery,
 *   useGameEvents,
 *   useSelectable,
 *   useTTKitClient,
 *   useViewerId,
 * } = createGameHooks<SplendorGame>();
 * ```
 *
 * `G` is required — there is no fallback. This is the only entry point
 * for the hooks layer; standalone hooks are not exported.
 */
export function createGameHooks<G extends TTKitGame>(): GameHooks<G> {
  const BundleContext = createContext<BundleContextValue<G> | null>(null);

  function useBundleContext(): BundleContextValue<G> {
    const value = useContext(BundleContext);
    if (value === null) {
      throw new Error(
        "Hook called outside the TTKitProvider returned by this createGameHooks() bundle.",
      );
    }
    return value;
  }

  function TTKitProvider({
    client,
    children,
  }: TTKitProviderProps<G>): ReactNode {
    const value = useMemo<BundleContextValue<G>>(
      () => ({
        client,
        discovery: new DiscoveryState<G>(client),
      }),
      [client],
    );

    useEffect(() => {
      return () => {
        client.dispose();
      };
    }, [client]);

    return (
      <BundleContext.Provider value={value}>{children}</BundleContext.Provider>
    );
  }

  function useGameState<TSelected>(
    selector: (view: G["view"]) => TSelected,
  ): TSelected {
    const { client } = useBundleContext();
    const getSnapshot = (): TSelected => {
      const view = client.getView();
      if (view === null) {
        throw new Error(
          "useGameState: no view loaded. Render a loading state at a parent boundary before mounting this hook.",
        );
      }
      return selector(view);
    };
    return useSyncExternalStore(client.subscribe.bind(client), getSnapshot);
  }

  function useGameEvents(
    handler: (event: G["event"]) => void,
    options?: UseGameEventsOptions<G["event"]>,
  ): void {
    const { client } = useBundleContext();
    const handlerRef = useRef(handler);
    handlerRef.current = handler;
    const filterRef = useRef(options?.filter);
    filterRef.current = options?.filter;

    useEffect(() => {
      return client.onEvent((event) => {
        const filter = filterRef.current;
        if (filter && !filter(event)) return;
        handlerRef.current(event);
      });
    }, [client]);
  }

  function useDiscovery(): UseDiscoveryResult<G> {
    const { discovery } = useBundleContext();

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

    return { ...snapshot, ...actions };
  }

  function useSelectable(
    discoveryStep: string,
    target: unknown,
  ): UseSelectableResult<G> {
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

    if (discovery.open.step !== discoveryStep) {
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

  function useTTKitClient(): TTKitClient<G> {
    return useBundleContext().client;
  }

  function useViewerId(): string {
    const { client } = useBundleContext();
    return useSyncExternalStore(
      client.subscribe.bind(client),
      () => client.viewerId,
    );
  }

  return {
    TTKitProvider,
    useGameState,
    useGameEvents,
    useDiscovery,
    useSelectable,
    useTTKitClient,
    useViewerId,
  };
}

function optionMatchesTarget(option: unknown, target: unknown): boolean {
  if (!isRecord(option)) return false;
  const output = option.output;
  if (!isRecord(output)) return false;

  if (!isRecord(target)) {
    if (target === undefined || target === null) return false;
    return Object.values(output).some((value) => value === target);
  }

  return Object.keys(target).every((key) => output[key] === target[key]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function noop(): void {}
