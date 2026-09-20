import { resolve } from "node:path";
import { failure, success, type RunResult } from "../lib/command-result.ts";
import { createDevHelpText } from "../lib/help-text.ts";
import { isHelpFlag } from "../lib/parse-args.ts";
import { loadConfig } from "../lib/load-config.ts";
import { startDevServer } from "../lib/dev-server/server.ts";
import {
  startFrontend,
  type FrontendProcess,
} from "../lib/frontend/process.ts";
import {
  frontendUrl as buildFrontendUrl,
  resolveFrontendToolchain,
} from "../lib/frontend/vite-config.ts";
import { isPortAvailable, waitForHttp } from "../lib/frontend/network.ts";

const FRONTEND_READY_TIMEOUT_MS = 30_000;
const FRONTEND_POLL_INTERVAL_MS = 100;

interface DevCommandOptions {
  cwd: string;
}

export interface DevCommandRuntime {
  startServer: typeof startDevServer;
  runFrontend(root: string): FrontendProcess;
  resolveToolchain: typeof resolveFrontendToolchain;
  isPortAvailable: typeof isPortAvailable;
  waitForHttp: typeof waitForHttp;
  emit(line: string): void;
}

interface ParsedDevArgs {
  port?: number;
}

type FrontendEnd =
  | { kind: "exited"; code: number }
  | { kind: "failed"; message: string };

interface FrontendPolled {
  kind: "polled";
  answered: boolean;
}

export async function runDevCommand(
  args: string[],
  options: DevCommandOptions,
  runtime: DevCommandRuntime = defaultRuntime,
): Promise<RunResult> {
  if (isHelpFlag(args[0])) {
    return success(createDevHelpText());
  }

  try {
    const parsed = parseDevArgs(args);
    const config = await loadConfig({ cwd: options.cwd });
    if (!config.publish) {
      return failure("tvk dev needs publish.frontend in tableverse.config.ts.");
    }

    const frontendRoot = resolve(
      config.configDirectory,
      config.publish.frontend,
    );
    const toolchain = await runtime.resolveToolchain(frontendRoot);
    const frontendUrl = buildFrontendUrl(toolchain);

    if (!(await runtime.isPortAvailable(toolchain.port, toolchain.host))) {
      return failure(
        `Port ${toolchain.port} is in use. Free it, or set server.port in the frontend's vite.config.ts.`,
      );
    }

    const server = await runtime.startServer(config.game, {
      port: parsed.port,
      frontendUrl,
    });

    let frontend: FrontendProcess | undefined;
    const waiting = new AbortController();
    try {
      frontend = runtime.runFrontend(frontendRoot);
      const frontendEnd = settleFrontend(frontend.exitCode);
      const polled = runtime
        .waitForHttp(frontendUrl, {
          timeoutMs: FRONTEND_READY_TIMEOUT_MS,
          intervalMs: FRONTEND_POLL_INTERVAL_MS,
          signal: waiting.signal,
        })
        .then((answered): FrontendPolled => ({ kind: "polled", answered }));

      const first = await Promise.race([polled, frontendEnd]);
      if (first.kind === "failed") {
        return failure(`The frontend could not start: ${first.message}`);
      }
      if (first.kind === "exited") {
        return failure(`frontend_dev_exited:${first.code}`);
      }
      if (!first.answered) {
        return failure(`The frontend did not answer at ${frontendUrl}.`);
      }

      runtime.emit(`tvk dev is ready at ${server.url}`);
      const end = await frontendEnd;
      if (end.kind === "failed") {
        return failure(`The frontend stopped: ${end.message}`);
      }
      return end.code === 0
        ? success("")
        : failure(`frontend_dev_exited:${end.code}`);
    } finally {
      waiting.abort();
      frontend?.stop();
      await server.close();
    }
  } catch (error) {
    return failure(
      error instanceof Error ? error.message : "dev_command_failed",
    );
  }
}

function settleFrontend(exitCode: Promise<number>): Promise<FrontendEnd> {
  return exitCode.then(
    (code): FrontendEnd => ({ kind: "exited", code }),
    (error: unknown): FrontendEnd => ({
      kind: "failed",
      message: error instanceof Error ? error.message : String(error),
    }),
  );
}

function parseDevArgs(args: string[]): ParsedDevArgs {
  const parsed: ParsedDevArgs = {};

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];

    if (flag === "--port" && value) {
      const port = Number.parseInt(value, 10);
      if (Number.isNaN(port)) {
        throw new Error(`invalid_port:${value}`);
      }
      parsed.port = port;
      index += 1;
    } else {
      throw new Error(`unknown_flag:${flag}`);
    }
  }

  return parsed;
}

const defaultRuntime: DevCommandRuntime = {
  startServer: startDevServer,
  resolveToolchain: resolveFrontendToolchain,
  isPortAvailable,
  waitForHttp,
  runFrontend: startFrontend,
  emit: (line) => console.log(line),
};
