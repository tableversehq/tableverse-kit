// Optional React binding over the neutral client. Importing this entry pulls in
// React (an optional peer dependency); the package root does not.
export {
  createGameHooks,
  type GameHooks,
  type TableverseProviderProps,
  type UseDiscoveryResult,
  type UseGameEventsOptions,
  type UseSelectableResult,
} from "./create-game-hooks.tsx";

// Re-exported for convenience so React consumers of the hooks can name the
// selection types without reaching into the neutral root. The canonical home
// is "@tableverse-kit/client".
export type {
  SelectableResult,
  SelectableState,
} from "../client/selectable.ts";
