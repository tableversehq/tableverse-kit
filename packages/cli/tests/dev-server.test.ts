import { afterEach, expect, test } from "vitest";
import {
  createCommandFactory,
  createGameExecutor,
  createStageFactory,
  defineEvents,
  defineGameState,
  GameDefinitionBuilder,
  type SingleActivePlayerStageDefinition,
  t,
} from "@tableverse-kit/engine";
import {
  DevTransport,
  type GameShapeOf,
  type TableverseClient,
  TransportClient,
} from "@tableverse-kit/client/dev";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  startDevServer,
  type DevServerHandle,
  type DevServerOptions,
} from "../src/lib/dev-server/server.ts";
import { nodeSse } from "./support/node-sse.ts";
import createSetupFixtureGame from "./fixtures/game-setup.ts";

class DemoState {
  count = 0;
}

const events = defineEvents({ scored: t.object({ points: t.number() }) });

function buildGame(playerBounds: { min: number; max: number }) {
  const state = defineGameState()
    .model({ count: t.number() })
    .stateClass(DemoState)
    .build();

  const define = createCommandFactory<DemoState, typeof events>();
  const score = define({
    commandId: "score",
    commandSchema: t.object({ n: t.number() }),
  })
    .validate(() => ({ ok: true as const }))
    .execute(({ game, command, emitEvent }) => {
      game.count += command.input.n;
      emitEvent({ type: "scored", payload: { points: command.input.n } });
    })
    .build();

  const defineStage = createStageFactory<DemoState, typeof events>();
  const turn: SingleActivePlayerStageDefinition<DemoState> = defineStage("turn")
    .singleActivePlayer()
    .activePlayer(() => "p1")
    .commands([score])
    .nextStages(() => ({ turn }))
    .transition(({ nextStages }) => nextStages.turn)
    .build();

  return new GameDefinitionBuilder("demo")
    .state(state)
    .events(events)
    .players(playerBounds)
    .initialStage(turn)
    .build();
}

const game = buildGame({ min: 1, max: 8 });
const twoPlayerGame = buildGame({ min: 2, max: 4 });
const executor = createGameExecutor(game);
type Executor = typeof executor;

let handle: DevServerHandle | undefined;

const fixtureShell = fileURLToPath(
  new URL("./fixtures/shell/", import.meta.url),
);

function serve(
  game: Parameters<typeof startDevServer>[0],
  options: DevServerOptions = {},
): Promise<DevServerHandle> {
  return startDevServer(game, {
    port: 0,
    shellDirectory: fixtureShell,
    ...options,
  });
}

afterEach(async () => {
  await handle?.close();
  handle = undefined;
});

async function startMatch(url: string, players: string[]): Promise<void> {
  const response = await fetch(`${url}/initialize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ players }),
  });
  expect(response.status).toBe(200);
}

function nextNotification(client: TableverseClient<Executor>): Promise<void> {
  return new Promise((resolve) => {
    const off = client.subscribe(() => {
      off();
      resolve();
    });
  });
}

async function waitUntil(
  predicate: () => boolean,
  timeoutMs = 2000,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("condition not met before timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test("game builds a runnable executor", () => {
  expect(executor.executeCommand).toBeTypeOf("function");
});

test("dev client connects, executes, and receives snapshots + events over the wire", async () => {
  handle = await serve(game, { port: 0 });
  await startMatch(handle.url, ["p1"]);
  const client = new TransportClient(
    new DevTransport<Executor>(handle.url, { viewer: "p1", sse: nodeSse }),
  );

  await client.ready();
  expect(client.getStatus()).toBe("ready");
  expect(client.getViewerId()).toBe("p1");
  expect(client.getView()).not.toBeNull();
  expect(client.getStateVersion()).toBe(1);

  const received: GameShapeOf<Executor>["event"][] = [];
  client.onEvent((event) => {
    received.push(event);
  });

  const notified = nextNotification(client);
  const result = await client.execute({ type: "score", input: { n: 2 } });
  expect(result.accepted).toBe(true);

  await notified;
  expect(client.getStateVersion()).toBe(2);

  await waitUntil(() => received.length > 0);
  expect(received.some((event) => event.type === "scored")).toBe(true);

  await expect(client.getAvailableCommands()).resolves.toContain("score");

  client.dispose();
});

test("dev client connects to a game that seats two players", async () => {
  handle = await serve(twoPlayerGame, { port: 0 });
  await startMatch(handle.url, ["p1", "p2"]);
  const client = new TransportClient(
    new DevTransport<Executor>(handle.url, { viewer: "p1", sse: nodeSse }),
  );

  await client.ready();
  expect(client.getStatus()).toBe("ready");
  expect(client.getView()).not.toBeNull();

  client.dispose();
});

test("a client connecting before the match reports no view", async () => {
  handle = await serve(twoPlayerGame, { port: 0 });
  const client = new TransportClient(
    new DevTransport<Executor>(handle.url, { viewer: "p1", sse: nodeSse }),
  );

  expect(client.getView()).toBeNull();

  client.dispose();
});

test("binds loopback only", async () => {
  handle = await serve(twoPlayerGame, { port: 0 });

  expect(handle.url.startsWith("http://127.0.0.1:")).toBe(true);
});

test("serves the game description before a match exists", async () => {
  handle = await serve(twoPlayerGame, { port: 0 });

  const response = await fetch(`${handle.url}/game`);
  const body: unknown = await response.json();

  expect(response.status).toBe(200);
  expect(body).toEqual({
    name: "demo",
    playerBounds: { min: 2, max: 4 },
    setupInputSchema: null,
    players: ["p1", "p2"],
  });
});

test("resets a match back to uninitialized", async () => {
  handle = await serve(twoPlayerGame, { port: 0 });
  await startMatch(handle.url, ["p1", "p2"]);

  const reset = await fetch(`${handle.url}/reset`, { method: "POST" });
  const commands = await fetch(`${handle.url}/commands?viewer=p1`);

  expect(reset.status).toBe(204);
  expect(commands.status).toBe(409);
});

test("ends open streams when the match is discarded", async () => {
  handle = await serve(twoPlayerGame);
  await startMatch(handle.url, ["p1", "p2"]);
  const stream = await fetch(`${handle.url}/session?viewer=p1`);
  const reader = stream.body!.getReader();
  await reader.read();

  await fetch(`${handle.url}/reset`, { method: "POST" });

  const drained = await reader.read();
  expect(drained.done).toBe(true);
});

test("serves the built shell and the frontend address", async () => {
  handle = await serve(twoPlayerGame, {
    frontendUrl: "http://127.0.0.1:5173",
  });

  const page = await fetch(`${handle.url}/`);
  const script = await fetch(`${handle.url}/assets/app.js`);
  const shellConfig = await fetch(`${handle.url}/shell.json`);

  expect(page.headers.get("content-type")).toContain("text/html");
  expect(await page.text()).toContain("tvk dev fixture");
  expect(script.headers.get("content-type")).toContain("javascript");
  expect(await script.text()).toContain('"fixture"');
  expect(await shellConfig.json()).toEqual({
    frontendUrl: "http://127.0.0.1:5173",
  });
});

test("answers 404 for a shell file that does not exist", async () => {
  handle = await serve(twoPlayerGame);

  const response = await fetch(`${handle.url}/assets/missing.js`);

  expect(response.status).toBe(404);
});

test("serves nothing outside the shell directory", async () => {
  handle = await serve(twoPlayerGame);

  const response = await fetch(`${handle.url}/..%2f..%2fdev-server.test.ts`);

  expect(response.status).toBe(404);
});

test("refuses to start without a built shell", async () => {
  const empty = await mkdtemp(join(tmpdir(), "tvk-shell-"));

  await expect(
    startDevServer(twoPlayerGame, { port: 0, shellDirectory: empty }),
  ).rejects.toThrow("build:shell");
});

test("answers a rejected setup input with the engine's reason", async () => {
  handle = await serve(createSetupFixtureGame(), { port: 0 });

  const response = await fetch(`${handle.url}/initialize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      players: ["p1", "p2"],
      setupInput: { targetScore: 0 },
    }),
  });
  const body: unknown = await response.json();
  const commands = await fetch(`${handle.url}/commands?viewer=p1`);

  expect(response.status).toBe(400);
  expect(body).toEqual({ error: expect.stringMatching(/.+/) });
  expect(commands.status).toBe(409);
});
