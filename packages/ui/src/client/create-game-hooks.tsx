import type { DiscoveryStepOption } from "@tabletop-kit/engine";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { DiscoveryState, type DiscoveryStatus } from "./discovery-state.ts";
import type { TTKitClient, TTKitGame } from "./types.ts";

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

export interface TTKitProviderProps<G extends TTKitGame> {
  client: TTKitClient<G>;
  children: ReactNode;
}

export interface UseDiscoveryResult<G extends TTKitGame> {
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

interface UseGameStateOrNullOf<G extends TTKitGame> {
  (): G["view"] | null;
  <TSelected>(
    selector: (view: G["view"]) => TSelected,
    isEqual?: (a: TSelected, b: TSelected) => boolean,
  ): TSelected | null;
}

export interface GameHooks<G extends TTKitGame> {
  readonly TTKitProvider: (props: TTKitProviderProps<G>) => ReactNode;
  readonly useGameState: <TSelected>(
    selector: (view: G["view"]) => TSelected,
    isEqual?: (a: TSelected, b: TSelected) => boolean,
  ) => TSelected;
  readonly useGameStateOrNull: UseGameStateOrNullOf<G>;
  readonly useGameEvents: (
    handler: (event: G["event"]) => void,
    options?: UseGameEventsOptions<G["event"]>,
  ) => void;
  readonly useDiscovery: () => UseDiscoveryResult<G>;
  readonly useSelectable: (
    slot: string,
    target: unknown,
  ) => UseSelectableResult<G>;
  readonly useTTKitClient: () => TTKitClient<G>;
  readonly useViewerId: () => string;
}

interface BundleContextValue<G extends TTKitGame> {
  client: TTKitClient<G>;
  discovery: DiscoveryState;
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
 *   useGameStateOrNull,
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
        // DiscoveryState is structurally typed against payload/result
        // shapes shared by all games at runtime; the bundle's typed
        // client widens cleanly via the never-cast.
        discovery: new DiscoveryState(client as never),
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
    isEqual: (a: TSelected, b: TSelected) => boolean = Object.is,
  ): TSelected {
    const { client } = useBundleContext();
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
      const next = selector(view);
      if (cache.current.hasValue && isEqual(cache.current.selected, next)) {
        return cache.current.selected;
      }
      cache.current = { selected: next, hasValue: true };
      return next;
    };

    return useSyncExternalStore(client.subscribe.bind(client), getSnapshot);
  }

  function useGameStateOrNullImpl<TSelected>(
    selector?: (view: G["view"]) => TSelected,
    isEqual: (a: TSelected, b: TSelected) => boolean = Object.is,
  ): TSelected | G["view"] | null {
    const { client } = useBundleContext();
    const cache = useRef<{
      selected: TSelected | G["view"] | null;
      hasValue: boolean;
    }>({
      selected: null,
      hasValue: false,
    });

    const getSnapshot = (): TSelected | G["view"] | null => {
      const view = client.getView();
      if (view === null) {
        if (cache.current.hasValue && cache.current.selected === null) {
          return cache.current.selected;
        }
        cache.current = { selected: null, hasValue: true };
        return null;
      }
      const next = selector ? selector(view) : view;
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
  const useGameStateOrNull = useGameStateOrNullImpl as UseGameStateOrNullOf<G>;

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

    return { ...snapshot, ...actions } as unknown as UseDiscoveryResult<G>;
  }

  function useSelectable(
    slot: string,
    target: unknown,
  ): UseSelectableResult<G> {
    const discovery = useDiscovery();

    const alreadyPicked = discovery.trail.some((option) =>
      optionMatchesTarget(option as DiscoveryStepOption, target),
    );

    if (alreadyPicked) {
      return { state: "selected", onClick: noop, option: null };
    }

    if (discovery.open === null) {
      return { state: "idle", onClick: noop, option: null };
    }

    const open = discovery.open as unknown as {
      step: string;
      options: ReadonlyArray<PickOptionOf<G>>;
    };
    if (open.step !== slot) {
      return { state: "unselectable", onClick: noop, option: null };
    }

    const matching = open.options.find((option) =>
      optionMatchesTarget(option as DiscoveryStepOption, target),
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
    useGameStateOrNull,
    useGameEvents,
    useDiscovery,
    useSelectable,
    useTTKitClient,
    useViewerId,
  };
}

function optionMatchesTarget(
  option: DiscoveryStepOption,
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
