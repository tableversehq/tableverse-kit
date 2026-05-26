export {
  createGameHooks,
  type GameHooks,
  type SelectableState,
  type TTKitProviderProps,
  type UseDiscoveryResult,
  type UseGameEventsOptions,
  type UseSelectableResult,
} from "./client/create-game-hooks.tsx";
export type { DiscoveryStatus } from "./client/discovery-state.ts";
export type {
  CommandPayload,
  DiscoveryPayload,
  DiscoveryResult,
  ExecutionResult,
  TTKitClient,
  TTKitGame,
} from "./client/types.ts";

export {
  createInProcessClient,
  type CreateInProcessClientOptions,
  type InProcessClient,
} from "./adapters/in-process.ts";
