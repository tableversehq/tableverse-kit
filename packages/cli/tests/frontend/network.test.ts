import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  isPortAvailable,
  waitForHttp,
} from "../../src/lib/frontend/network.ts";

let close: (() => Promise<void>) | null = null;

const ipv6Loopback = await new Promise<boolean>((resolve) => {
  const probe = createServer();
  probe.once("error", () => resolve(false));
  probe.listen(0, "::1", () => probe.close(() => resolve(true)));
});

afterEach(async () => {
  await close?.();
  close = null;
});

async function listen(host = "127.0.0.1"): Promise<number> {
  const server = createServer((_req, res) => {
    res.writeHead(200);
    res.end("ok");
  });
  const port = await new Promise<number>((resolve) => {
    server.listen(0, host, () => {
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : 0);
    });
  });
  close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

describe("network", () => {
  it("reports a bound port as unavailable", async () => {
    const port = await listen();

    expect(await isPortAvailable(port, "127.0.0.1")).toBe(false);
  });

  it("reports a free port as available", async () => {
    const port = await listen();
    await close?.();
    close = null;

    expect(await isPortAvailable(port, "127.0.0.1")).toBe(true);
  });

  it("waits until a server answers", async () => {
    const port = await listen();

    await expect(
      waitForHttp(`http://127.0.0.1:${port}`, {
        timeoutMs: 2000,
        intervalMs: 20,
      }),
    ).resolves.toBe(true);
  });

  it.skipIf(!ipv6Loopback)(
    "reports a port bound on the IPv6 loopback as unavailable",
    async () => {
      const port = await listen("::1");

      expect(await isPortAvailable(port, "::1")).toBe(false);
    },
  );

  it("treats an address the host cannot bind as free", async () => {
    expect(await isPortAvailable(5173, "203.0.113.9")).toBe(true);
  });

  it("gives up on a connection that never answers", async () => {
    const idle = createServer();
    await new Promise<void>((resolve) => idle.listen(0, "127.0.0.1", resolve));
    const address = idle.address();
    const port = typeof address === "object" && address ? address.port : 0;
    idle.on("request", () => {});
    close = () => new Promise<void>((resolve) => idle.close(() => resolve()));

    const started = Date.now();
    const answered = await waitForHttp(`http://127.0.0.1:${port}`, {
      timeoutMs: 300,
      intervalMs: 50,
    });

    expect(answered).toBe(false);
    expect(Date.now() - started).toBeLessThan(3000);
  }, 10_000);

  it("stops waiting once aborted", async () => {
    const controller = new AbortController();
    const started = Date.now();
    setTimeout(() => controller.abort(), 50);

    const answered = await waitForHttp("http://127.0.0.1:1", {
      timeoutMs: 10_000,
      intervalMs: 20,
      signal: controller.signal,
    });

    expect(answered).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("gives up when nothing answers", async () => {
    await expect(
      waitForHttp("http://127.0.0.1:1", { timeoutMs: 120, intervalMs: 20 }),
    ).resolves.toBe(false);
  });
});
