import { afterEach, describe, expect, test, vi } from "vitest";

const connections = vi.hoisted(() => ({
  hosted: 0,
  local: new Array<{ baseUrl: string; options: unknown }>(),
}));

vi.mock("../src/bridge/bridge-transport.ts", () => ({
  BridgeTransport: class {
    constructor() {
      connections.hosted += 1;
    }

    connect(): void {}
    close(): void {}
  },
}));

vi.mock("../src/dev/dev-transport.ts", () => ({
  DevTransport: class {
    constructor(baseUrl: string, options: unknown) {
      connections.local.push({ baseUrl, options });
    }

    connect(): void {}
    close(): void {}
  },
}));

import { createTableverseClient } from "../src/index.ts";

class LocalWindow {
  readonly parent = this;
  readonly location = { search: "" };
}

class HostedWindow {
  readonly parent = {};
  readonly location = { search: "" };
}

class FramedDevWindow {
  readonly parent = {};
  readonly location = {
    search: "?tvk-dev-viewer=p2&tvk-dev-server=http%3A%2F%2F127.0.0.1%3A5123",
  };
}

afterEach(() => {
  connections.hosted = 0;
  connections.local.length = 0;
  vi.unstubAllGlobals();
});

describe("createTableverseClient", () => {
  test("connects a top-level page to the default local server", () => {
    vi.stubGlobal("window", new LocalWindow());

    const client = createTableverseClient();

    expect(connections.hosted).toBe(0);
    expect(connections.local).toEqual([
      {
        baseUrl: "http://127.0.0.1:5100",
        options: { viewer: "p1" },
      },
    ]);
    client.dispose();
  });

  test("passes local session options through the same constructor", () => {
    vi.stubGlobal("window", new LocalWindow());

    const client = createTableverseClient({
      serverUrl: "http://127.0.0.1:5200",
      viewer: "p2",
    });

    expect(connections.local).toEqual([
      {
        baseUrl: "http://127.0.0.1:5200",
        options: { viewer: "p2" },
      },
    ]);
    client.dispose();
  });

  test("seats a framed page at the viewer named by the frame URL", () => {
    vi.stubGlobal("window", new FramedDevWindow());

    const client = createTableverseClient();

    expect(connections.hosted).toBe(0);
    expect(connections.local).toEqual([
      {
        baseUrl: "http://127.0.0.1:5123",
        options: { viewer: "p2" },
      },
    ]);
    client.dispose();
  });

  test("connects an embedded page to its Tableverse host", () => {
    vi.stubGlobal("window", new HostedWindow());

    const client = createTableverseClient();

    expect(connections.hosted).toBe(1);
    expect(connections.local).toHaveLength(0);
    client.dispose();
  });
});
