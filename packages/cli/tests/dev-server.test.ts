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
import {
  startDevServer,
  type DevServerHandle,
} from "../src/lib/dev-server/server.ts";
import { nodeSse } from "./support/node-sse.ts";

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

afterEach(async () => {
  await handle?.close();
  handle = undefined;
});

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
  handle = await startDevServer(game, { port: 0 });
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

test("dev client connects to a game that seats two players without passing a roster", async () => {
  handle = await startDevServer(twoPlayerGame, { port: 0 });
  const client = new TransportClient(
    new DevTransport<Executor>(handle.url, { viewer: "p1", sse: nodeSse }),
  );

  await client.ready();
  expect(client.getStatus()).toBe("ready");
  expect(client.getView()).not.toBeNull();

  client.dispose();
});
