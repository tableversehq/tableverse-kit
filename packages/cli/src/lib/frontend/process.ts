import { spawn } from "node:child_process";
import { FRONTEND_DEV_COMMAND } from "./commands.ts";

export interface FrontendProcess {
  exitCode: Promise<number>;
  stop(): void;
}

interface FrontendCommand {
  executable: string;
  args: readonly string[];
}

const STOP_SIGNALS = ["SIGINT", "SIGTERM"] as const;

/**
 * The frontend's dev script reaches its server through a shell, so a signal to
 * the script alone leaves that server holding the port. Leading its own process
 * group lets one signal reach the whole tree.
 */
export function startFrontend(
  root: string,
  command: FrontendCommand = FRONTEND_DEV_COMMAND,
): FrontendProcess {
  const child = spawn(command.executable, [...command.args], {
    cwd: root,
    stdio: "inherit",
    detached: true,
  });

  let stopping = false;
  const stop = (): void => {
    if (stopping || child.pid === undefined || child.exitCode !== null) {
      return;
    }
    stopping = true;
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill();
    }
  };

  const forward = (): void => {
    stop();
  };
  for (const signal of STOP_SIGNALS) {
    process.on(signal, forward);
  }

  const exitCode = new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      resolve(stopping ? 0 : (code ?? (signal ? 1 : 0)));
    });
  }).finally(() => {
    for (const signal of STOP_SIGNALS) {
      process.off(signal, forward);
    }
  });

  return { exitCode, stop };
}
