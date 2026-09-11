import type { AnyGameExecutor, GameShapeOf } from "../client/game-shape.ts";
import type { ExecutionResult } from "../client/types.ts";
import type { Transport, TransportHandlers } from "../client/transport.ts";
import { TransportError } from "../client/lifecycle.ts";
import {
  assertDiscoveryResult,
  assertEventEnvelope,
  assertSnapshotEnvelope,
  parseCommandList,
  parseExecutionResult,
} from "../client/message-validation.ts";

export interface SseConnection {
  addMessageListener(type: string, listener: (data: string) => void): void;
  setErrorListener(listener: (reconnecting: boolean) => void): void;
  close(): void;
}

export type SseFactory = (url: string) => SseConnection;

export interface DevTransportOptions {
  viewer: string;
  setupInput?: unknown;
  // The authoritative roster and seed the dev server hands the engine's init
  // contract.
  players?: string[];
  seed?: string | number;
  sse?: SseFactory;
}

export class DevTransport<E extends AnyGameExecutor> implements Transport<E> {
  readonly #baseUrl: string;
  readonly #viewer: string;
  readonly #setupInput: unknown;
  readonly #players: string[] | undefined;
  readonly #seed: string | number | undefined;
  readonly #sse: SseFactory;
  #connection: SseConnection | null = null;

  constructor(baseUrl: string, options: DevTransportOptions) {
    this.#baseUrl = baseUrl.replace(/\/$/, "");
    this.#viewer = options.viewer;
    this.#setupInput = options.setupInput;
    this.#players = options.players;
    this.#seed = options.seed;
    this.#sse = options.sse ?? browserSse;
  }

  connect(handlers: TransportHandlers<E>): void {
    void this.#start(handlers);
  }

  async execute(command: GameShapeOf<E>["command"]): Promise<ExecutionResult> {
    return parseExecutionResult(
      await this.#post("/execute", { viewer: this.#viewer, command }),
    );
  }

  async discover(
    request: GameShapeOf<E>["discovery"]["payload"],
  ): Promise<GameShapeOf<E>["discovery"]["result"]> {
    const result = await this.#post("/discover", {
      viewer: this.#viewer,
      request,
    });
    assertDiscoveryResult(result);
    return result as GameShapeOf<E>["discovery"]["result"];
  }

  async listAvailableCommands(): Promise<readonly string[]> {
    const url = `${this.#baseUrl}/commands?viewer=${encodeURIComponent(this.#viewer)}`;
    const response = await this.#fetch(url);
    return parseCommandList(await response.json());
  }

  close(): void {
    this.#connection?.close();
    this.#connection = null;
  }

  async #start(handlers: TransportHandlers<E>): Promise<void> {
    try {
      await this.#fetch(`${this.#baseUrl}/initialize`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          setupInput: this.#setupInput,
          players: this.#players,
          seed: this.#seed,
        }),
      });
    } catch (error) {
      handlers.onError(
        error instanceof TransportError ? error.reason : "connection_lost",
      );
      return;
    }
    this.#openStream(handlers);
  }

  #openStream(handlers: TransportHandlers<E>): void {
    const url = `${this.#baseUrl}/session?viewer=${encodeURIComponent(this.#viewer)}`;
    const connection = this.#sse(url);
    this.#connection = connection;

    connection.addMessageListener("snapshot", (data) => {
      try {
        const raw: unknown = JSON.parse(data);
        assertSnapshotEnvelope(raw);
        handlers.onSnapshot({
          viewerId: raw.viewerId,
          version: raw.version,
          view: raw.view as GameShapeOf<E>["view"],
        });
      } catch {
        handlers.onError("server_error");
      }
    });

    connection.addMessageListener("event", (data) => {
      try {
        const raw: unknown = JSON.parse(data);
        assertEventEnvelope(raw);
        handlers.onEvent(raw as GameShapeOf<E>["event"]);
      } catch {
        handlers.onError("server_error");
      }
    });

    connection.setErrorListener((reconnecting) => {
      if (reconnecting) {
        handlers.onReconnecting();
      } else {
        handlers.onError("connection_lost");
      }
    });
  }

  async #post(path: string, body: unknown): Promise<unknown> {
    const response = await this.#fetch(`${this.#baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.json();
  }

  async #fetch(input: string, init?: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(input, init);
    } catch {
      throw new TransportError("connection_lost");
    }
    if (!response.ok) {
      throw new TransportError("server_error");
    }
    return response;
  }
}

const browserSse: SseFactory = (url) => {
  const source = new EventSource(url);
  return {
    addMessageListener: (type, listener) => {
      source.addEventListener(type, (event) => {
        listener((event as MessageEvent).data as string);
      });
    },
    setErrorListener: (listener) => {
      source.onerror = () => {
        listener(source.readyState !== EventSource.CLOSED);
      };
    },
    close: () => {
      source.close();
    },
  };
};
