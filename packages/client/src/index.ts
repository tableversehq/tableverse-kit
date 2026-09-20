export type {
  AnyGameExecutor,
  GameShapeOf,
  SetupInputOf,
} from "./client/game-shape.ts";
export type {
  DiscoveryResult,
  ExecutionResult,
  TableverseClient,
} from "./client/types.ts";
export type {
  ConnectionStatus,
  TransportErrorReason,
} from "./client/lifecycle.ts";
export { TransportError } from "./client/lifecycle.ts";
export {
  createTableverseClient,
  DEV_SERVER_PARAM,
  DEV_VIEWER_PARAM,
  type CreateTableverseClientOptions,
} from "./create-tableverse-client.ts";
