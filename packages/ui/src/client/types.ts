import type {
  AnyCommandDiscoveryResult,
  Command,
  Discovery,
} from "@tabletop-kit/engine";

/**
 * Client-side command payload. The engine's `Command` carries `actorId`,
 * which the adapter fills in from the active viewer — UI consumers must
 * not author it.
 */
export type CommandPayload = Omit<Command, "actorId">;

/**
 * Client-side discovery payload. Same actorId story as `CommandPayload`.
 */
export type DiscoveryPayload = Omit<Discovery, "actorId">;

/**
 * Discovery result union — open (more options to pick) or complete
 * (ready to confirm). Re-exported from the engine for hooks consumers.
 */
export type DiscoveryResult = AnyCommandDiscoveryResult;

export interface TTKitGame {
  view: unknown;
  event: unknown;
  command: CommandPayload;
  discovery: {
    payload: DiscoveryPayload;
    result: DiscoveryResult;
  };
}

export interface ExecutionResult {
  accepted: boolean;
  reason?: string;
}

export interface TTKitClient<G extends TTKitGame> {
  readonly viewerId: string;

  getView(): G["view"] | null;
  getAvailableCommands(): Promise<readonly string[]>;
  getStateVersion(): number | null;

  subscribe(listener: () => void): () => void;
  onEvent(listener: (event: G["event"]) => void): () => void;

  discover(
    request: G["discovery"]["payload"],
  ): Promise<G["discovery"]["result"]>;
  execute(command: G["command"]): Promise<ExecutionResult>;

  dispose(): void;
}
