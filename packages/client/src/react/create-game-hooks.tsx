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
} from "../client/discovery-state.ts";
import { selectable, type SelectableState } from "../client/selectable.ts";
import type { TableverseClient, TableverseGame } from "../client/types.ts";

export interface TableverseProviderProps<G extends TableverseGame> {
  client: TableverseClient<G>;
  children: ReactNode;
}

export interface UseDiscoveryResult<G extends TableverseGame> {
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

export interface UseSelectableResult<G extends TableverseGame> {
  state: SelectableState;
  onClick: () => void;
  option: PickOptionOf<G> | null;
}

export interface UseGameEventsOptions<TEvent> {
  filter?: (event: TEvent) => boolean;
}

export interface GameHooks<G extends TableverseGame> {
  readonly TableverseProvider: (props: TableverseProviderProps<G>) => ReactNode;
  readonly useView: () => G["view"];
  readonly useGameEvents: (
    handler: (event: G["event"]) => void,
    options?: UseGameEventsOptions<G["event"]>,
  ) => void;
  readonly useDiscovery: () => UseDiscoveryResult<G>;
  readonly useSelectable: (
    discoveryStep: string,
    isTarget: (option: PickOptionOf<G>) => boolean,
  ) => UseSelectableResult<G>;
  readonly useTableverseClient: () => TableverseClient<G>;
  readonly useViewerId: () => string;
}

interface BundleContextValue<G extends TableverseGame> {
  client: TableverseClient<G>;
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
 * import { createGameHooks } from "@tableverse-kit/client/react";
 * import type { SplendorGame } from "./generated-types";
 *
 * export const {
 *   TableverseProvider,
 *   useView,
 *   useDiscovery,
 *   useGameEvents,
 *   useSelectable,
 *   useTableverseClient,
 *   useViewerId,
 * } = createGameHooks<SplendorGame>();
 * ```
 *
 * `G` is required — there is no fallback. This is the only entry point
 * for the hooks layer; standalone hooks are not exported.
 */
export function createGameHooks<G extends TableverseGame>(): GameHooks<G> {
  const BundleContext = createContext<BundleContextValue<G> | null>(null);

  function useBundleContext(): BundleContextValue<G> {
    const value = useContext(BundleContext);
    if (value === null) {
      throw new Error(
        "Hook called outside the TableverseProvider returned by this createGameHooks() bundle.",
      );
    }
    return value;
  }

  function TableverseProvider({
    client,
    children,
  }: TableverseProviderProps<G>): ReactNode {
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

  function useView(): G["view"] {
    const { client } = useBundleContext();
    const getSnapshot = (): G["view"] => {
      const view = client.getView();
      if (view === null) {
        throw new Error(
          "useView: no view loaded. Render a loading state at a parent boundary before mounting this hook.",
        );
      }
      return view;
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
    isTarget: (option: PickOptionOf<G>) => boolean,
  ): UseSelectableResult<G> {
    const discovery = useDiscovery();
    const { state, option } = selectable(discovery, discoveryStep, isTarget);

    if (state === "selectable" && option !== null) {
      return { state, option, onClick: () => discovery.pick(option) };
    }
    return { state, option: null, onClick: noop };
  }

  function useTableverseClient(): TableverseClient<G> {
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
    TableverseProvider,
    useView,
    useGameEvents,
    useDiscovery,
    useSelectable,
    useTableverseClient,
    useViewerId,
  };
}

function noop(): void {}
