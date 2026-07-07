// Neutral core — no React. Safe to import from a canvas/WebGL/WASM frontend.
// React hooks live in the optional "@tableverse-kit/client/react" entry.
export type {
  CommandPayload,
  DiscoveryPayload,
  DiscoveryResult,
  ExecutionResult,
  TableverseClient,
  TableverseGame,
} from "./client/types.ts";

export {
  createInProcessClient,
  type CreateInProcessClientOptions,
  type InProcessClient,
} from "./adapters/in-process.ts";

// Interaction state machine — framework-neutral. A canvas/WebGL/WASM game drives
// discovery/selection with these directly; the React hooks project them onto
// React's render model.
export {
  DiscoveryState,
  type CommandInputOf,
  type DiscoveryStateSnapshot,
  type DiscoveryStatus,
  type OpenSnapshotResult,
  type PickOptionOf,
} from "./client/discovery-state.ts";
export {
  selectable,
  type SelectableResult,
  type SelectableState,
} from "./client/selectable.ts";
