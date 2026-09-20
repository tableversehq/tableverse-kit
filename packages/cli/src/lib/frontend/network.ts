import { lookup } from "node:dns/promises";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";

export interface WaitOptions {
  timeoutMs: number;
  intervalMs: number;
  signal?: AbortSignal;
}

export async function isPortAvailable(
  port: number,
  host: string,
): Promise<boolean> {
  const addresses = await lookup(host, { all: true });
  const probes = await Promise.all(
    addresses.map(({ address }) => isAddressFree(port, address)),
  );
  return probes.every(Boolean);
}

const UNAVAILABLE_CODES = new Set(["EADDRINUSE", "EACCES"]);

function isAddressFree(port: number, address: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", (error) => {
      resolve(!UNAVAILABLE_CODES.has(errorCode(error) ?? ""));
    });
    probe.listen(port, address, () => {
      probe.close(() => resolve(true));
    });
  });
}

function errorCode(error: unknown): string | undefined {
  return error instanceof Error &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}

export async function waitForHttp(
  url: string,
  options: WaitOptions,
): Promise<boolean> {
  const deadline = Date.now() + options.timeoutMs;

  while (Date.now() < deadline && !options.signal?.aborted) {
    try {
      await fetch(url, { signal: attemptSignal(deadline, options.signal) });
      return true;
    } catch {
      try {
        await delay(options.intervalMs, undefined, { signal: options.signal });
      } catch {
        return false;
      }
    }
  }

  return false;
}

function attemptSignal(deadline: number, caller?: AbortSignal): AbortSignal {
  const remaining = AbortSignal.timeout(Math.max(deadline - Date.now(), 1));
  return caller ? AbortSignal.any([remaining, caller]) : remaining;
}
