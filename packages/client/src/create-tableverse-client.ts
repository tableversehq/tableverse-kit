import type { AnyGameExecutor } from "./client/game-shape.ts";
import type { TableverseClient } from "./client/types.ts";
import { TransportClient } from "./client/client-core.ts";
import { BridgeTransport } from "./bridge/bridge-transport.ts";
import { DevTransport } from "./dev/dev-transport.ts";

const DEFAULT_SERVER_URL = "http://127.0.0.1:5100";

export const DEV_VIEWER_PARAM = "tvk-dev-viewer";
export const DEV_SERVER_PARAM = "tvk-dev-server";

export interface CreateTableverseClientOptions {
  serverUrl?: string;
  viewer?: string;
}

export function createTableverseClient<E extends AnyGameExecutor>(
  options: CreateTableverseClientOptions = {},
): TableverseClient<E> {
  const frameParams = new URLSearchParams(window.location.search);
  const frameViewer = frameParams.get(DEV_VIEWER_PARAM);

  if (frameViewer !== null) {
    return new TransportClient(
      new DevTransport<E>(
        frameParams.get(DEV_SERVER_PARAM) ?? DEFAULT_SERVER_URL,
        { viewer: frameViewer },
      ),
    );
  }

  if (window.parent !== window) {
    return new TransportClient(new BridgeTransport<E>());
  }

  return new TransportClient(
    new DevTransport<E>(options.serverUrl ?? DEFAULT_SERVER_URL, {
      viewer: options.viewer ?? "p1",
    }),
  );
}
