import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { access, readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { AnyGameDefinition, GameEvent } from "@tableverse-kit/engine";
import {
  DevSession,
  type CommandRequest,
  type DiscoveryRequest,
} from "./session.ts";

export interface DevServerOptions {
  port?: number;
  frontendUrl?: string;
  shellDirectory?: string;
}

const BUILT_SHELL_DIRECTORY = fileURLToPath(
  new URL("../../../dist/shell/", import.meta.url),
);

const MATCH_ROUTES = new Set([
  "POST /execute",
  "POST /discover",
  "GET /commands",
]);

const SHELL_CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
};

export interface DevServerHandle {
  port: number;
  url: string;
  close(): Promise<void>;
}

interface Connection {
  viewer: string;
  res: ServerResponse;
}

export async function startDevServer(
  game: AnyGameDefinition,
  options: DevServerOptions = {},
): Promise<DevServerHandle> {
  const shellDirectory = resolve(
    options.shellDirectory ?? BUILT_SHELL_DIRECTORY,
  );
  await requireBuiltShell(shellDirectory);

  const session = new DevSession(game);
  const connections = new Set<Connection>();

  const broadcastSnapshots = (): void => {
    for (const connection of connections) {
      writeEvent(
        connection.res,
        "snapshot",
        session.snapshotFor(connection.viewer),
      );
    }
  };

  const broadcastEvents = (events: GameEvent[]): void => {
    for (const event of events) {
      for (const connection of connections) {
        writeEvent(connection.res, "event", event);
      }
    }
  };

  const openStream = (res: ServerResponse, viewer: string): void => {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "access-control-allow-origin": "*",
    });
    res.write("\n");
    const connection: Connection = { viewer, res };
    connections.add(connection);
    if (session.initialized) {
      writeEvent(res, "snapshot", session.snapshotFor(viewer));
    }
    const drop = () => connections.delete(connection);
    res.on("close", drop);
    res.on("error", drop);
  };

  const handleRequest = async (
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> => {
    setCors(res);
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://localhost");

    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (
      method === "GET" &&
      (await serveShellFile(res, shellDirectory, url.pathname))
    ) {
      return;
    }

    if (method === "GET" && url.pathname === "/shell.json") {
      sendJson(res, 200, { frontendUrl: options.frontendUrl ?? null });
      return;
    }

    if (method === "GET" && url.pathname === "/game") {
      sendJson(res, 200, { ...session.describe(), players: session.players });
      return;
    }

    if (method === "POST" && url.pathname === "/reset") {
      session.reset();
      for (const connection of connections) {
        connection.res.end();
      }
      connections.clear();
      res.writeHead(204);
      res.end();
      return;
    }

    if (method === "POST" && url.pathname === "/initialize") {
      const body = (await readJson(req)) as {
        setupInput?: unknown;
        players?: string[];
        seed?: string | number;
      };
      try {
        session.initialize({
          setup: body.setupInput,
          players: body.players,
          seed: body.seed,
        });
      } catch (error) {
        session.reset();
        sendJson(res, 400, {
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }
      broadcastSnapshots();
      sendJson(res, 200, { version: session.version });
      return;
    }

    if (method === "GET" && url.pathname === "/session") {
      openStream(res, viewerFrom(url));
      return;
    }

    if (!MATCH_ROUTES.has(`${method} ${url.pathname}`)) {
      sendJson(res, 404, { error: "not_found" });
      return;
    }

    if (!session.initialized) {
      sendJson(res, 409, { error: "not_initialized" });
      return;
    }

    if (method === "POST" && url.pathname === "/execute") {
      const body = (await readJson(req)) as {
        viewer: string;
        command: CommandRequest;
      };
      const outcome = session.execute(body.viewer, body.command);
      sendJson(res, 200, outcome.result);
      if (outcome.result.accepted) {
        broadcastSnapshots();
        broadcastEvents(outcome.events);
      }
      return;
    }

    if (method === "POST" && url.pathname === "/discover") {
      const body = (await readJson(req)) as {
        viewer: string;
        request: DiscoveryRequest;
      };
      sendJson(res, 200, session.discover(body.viewer, body.request));
      return;
    }

    if (method === "GET" && url.pathname === "/commands") {
      sendJson(res, 200, session.availableCommands(viewerFrom(url)));
    }
  };

  const server = createServer((req, res) => {
    void handleRequest(req, res).catch(() => {
      sendJson(res, 500, { error: "internal_error" });
    });
  });

  const port = await listen(server, options.port ?? 5100);
  return {
    port,
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        for (const connection of connections) {
          connection.res.end();
        }
        server.close(() => resolve());
      }),
  };
}

async function requireBuiltShell(shellDirectory: string): Promise<void> {
  try {
    await access(join(shellDirectory, "index.html"));
  } catch {
    throw new Error(
      `The tvk dev shell is not built in ${shellDirectory}. Run \`pnpm -C packages/cli build:shell\`.`,
    );
  }
}

async function serveShellFile(
  res: ServerResponse,
  shellDirectory: string,
  pathname: string,
): Promise<boolean> {
  let relativePath: string;
  try {
    relativePath =
      pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  } catch {
    return false;
  }

  const filePath = resolve(shellDirectory, relativePath);
  const contentType = SHELL_CONTENT_TYPES[extname(filePath)];
  if (!filePath.startsWith(`${shellDirectory}${sep}`) || !contentType) {
    return false;
  }

  let body: Buffer;
  try {
    body = await readFile(filePath);
  } catch {
    return false;
  }
  res.writeHead(200, { "content-type": contentType });
  res.end(body);
  return true;
}

function viewerFrom(url: URL): string {
  return url.searchParams.get("viewer") ?? "p1";
}

function writeEvent(res: ServerResponse, name: string, data: unknown): void {
  if (res.writableEnded) {
    return;
  }
  try {
    res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    // Stream closed between the guard and the write; the connection's close /
    // error handler removes it from the broadcast set.
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) {
    return;
  }
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
  });
  res.end(JSON.stringify(body));
}

function setCors(res: ServerResponse): void {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw.length > 0 ? JSON.parse(raw) : {};
}

function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        resolve(address.port);
      } else {
        reject(new Error("dev_server_no_address"));
      }
    });
  });
}
