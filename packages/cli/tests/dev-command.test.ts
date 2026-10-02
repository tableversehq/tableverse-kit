import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FRONTEND_DEV_COMMAND } from "../src/lib/frontend/commands.ts";
import { runDevCommand, type DevCommandRuntime } from "../src/commands/dev.ts";

const currentDir = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = join(currentDir, "fixtures", "project");

function pendingUntilAborted(
  signal: AbortSignal | undefined,
): Promise<boolean> {
  return new Promise((resolve) => {
    signal?.addEventListener("abort", () => resolve(false));
  });
}

function createRuntime(
  overrides: Partial<DevCommandRuntime> = {},
): DevCommandRuntime {
  return {
    startServer: async () => ({
      port: 5100,
      url: "http://localhost:5100",
      close: async () => {},
    }),
    runFrontend: () => ({ exitCode: Promise.resolve(0), stop: () => {} }),
    resolveToolchain: async () => ({
      port: 5173,
      host: "localhost",
      outDir: "/tmp/dist",
    }),
    isPortAvailable: async () => true,
    waitForHttp: async () => true,
    emit: () => {},
    ...overrides,
  };
}

describe("tvk dev", () => {
  it("starts the frontend through npm and keeps its startup quiet", () => {
    expect(FRONTEND_DEV_COMMAND).toEqual({
      executable: "npm",
      args: ["run", "--silent", "dev", "--", "--logLevel", "warn"],
    });
  });

  it("frames the frontend and announces the shell once it answers", async () => {
    const output: string[] = [];
    const waited: string[] = [];
    const probed: [number, string][] = [];
    let frontendRoot: string | undefined;
    let framed: string | undefined;
    let serverClosed = false;
    let stopFrontend = () => {};

    const runtime = createRuntime({
      startServer: async (_game, options) => {
        framed = options?.frontendUrl;
        return {
          port: 5100,
          url: "http://localhost:5100",
          close: async () => {
            serverClosed = true;
          },
        };
      },
      runFrontend: (root) => {
        frontendRoot = root;
        return {
          exitCode: new Promise<number>((resolve) => {
            stopFrontend = () => resolve(0);
          }),
          stop: () => {},
        };
      },
      waitForHttp: async (url) => {
        waited.push(url);
        return true;
      },
      emit: (line) => {
        output.push(line);
        stopFrontend();
      },
      isPortAvailable: async (port, host) => {
        probed.push([port, host]);
        return true;
      },
    });

    const result = await runDevCommand([], { cwd: projectRoot }, runtime);

    expect(result.exitCode).toBe(0);
    expect(frontendRoot).toBe(join(projectRoot, "web"));
    expect(probed).toEqual([[5173, "localhost"]]);
    expect(framed).toBe("http://localhost:5173");
    expect(waited).toEqual(["http://localhost:5173"]);
    expect(serverClosed).toBe(true);
    expect(output.at(-1)).toBe(
      [
        "",
        "  Your game is ready!",
        "",
        "  Open http://localhost:5100 in your browser.",
        "  Press Ctrl+C to stop.",
      ].join("\n"),
    );
  });

  it("closes the rules server when the frontend cannot be spawned", async () => {
    let serverClosed = false;
    const runtime = createRuntime({
      startServer: async () => ({
        port: 5100,
        url: "http://localhost:5100",
        close: async () => {
          serverClosed = true;
        },
      }),
      runFrontend: () => {
        throw new Error("spawn EACCES");
      },
    });

    const result = await runDevCommand([], { cwd: projectRoot }, runtime);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("spawn EACCES");
    expect(serverClosed).toBe(true);
  });

  it("refuses to start when the frontend port is taken", async () => {
    const runtime = createRuntime({
      isPortAvailable: async () => false,
      startServer: async () => {
        throw new Error("server must not start");
      },
    });

    const result = await runDevCommand([], { cwd: projectRoot }, runtime);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("5173");
  });

  it("stops the frontend when it never answers", async () => {
    let stopped = false;
    const runtime = createRuntime({
      waitForHttp: async () => false,
      runFrontend: () => ({
        exitCode: new Promise<number>(() => {}),
        stop: () => {
          stopped = true;
        },
      }),
    });

    const result = await runDevCommand([], { cwd: projectRoot }, runtime);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("http://localhost:5173");
    expect(stopped).toBe(true);
  });

  it("frames a frontend the project serves on an IPv6 host", async () => {
    let framed: string | undefined;
    const runtime = createRuntime({
      resolveToolchain: async () => ({
        port: 5173,
        host: "::1",
        outDir: "/tmp/dist",
      }),
      startServer: async (_game, options) => {
        framed = options?.frontendUrl;
        return {
          port: 5100,
          url: "http://localhost:5100",
          close: async () => {},
        };
      },
    });

    await runDevCommand([], { cwd: projectRoot }, runtime);

    expect(framed).toBe("http://[::1]:5173");
  });

  it("reports a frontend that cannot start and closes the server", async () => {
    let serverClosed = false;
    let stopped = false;
    const runtime = createRuntime({
      startServer: async () => ({
        port: 5100,
        url: "http://localhost:5100",
        close: async () => {
          serverClosed = true;
        },
      }),
      runFrontend: () => ({
        exitCode: new Promise<number>((_resolve, reject) => {
          setTimeout(() => reject(new Error("spawn npm ENOENT")), 0);
        }),
        stop: () => {
          stopped = true;
        },
      }),
      waitForHttp: async (_url, options) => pendingUntilAborted(options.signal),
    });

    const result = await runDevCommand([], { cwd: projectRoot }, runtime);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("spawn npm ENOENT");
    expect(serverClosed).toBe(true);
    expect(stopped).toBe(true);
  });

  it("reports a frontend that exits before it answers", async () => {
    let waitAborted = false;
    const runtime = createRuntime({
      runFrontend: () => ({
        exitCode: new Promise<number>((resolve) => {
          setTimeout(() => resolve(1), 0);
        }),
        stop: () => {},
      }),
      waitForHttp: async (_url, options) => {
        const answered = await pendingUntilAborted(options.signal);
        waitAborted = true;
        return answered;
      },
    });

    const result = await runDevCommand([], { cwd: projectRoot }, runtime);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("frontend_dev_exited:1");
    await expect.poll(() => waitAborted).toBe(true);
  });

  it("requires a configured frontend", async () => {
    const result = await runDevCommand(
      [],
      { cwd: join(currentDir, "fixtures") },
      createRuntime(),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("publish.frontend");
  });
});
