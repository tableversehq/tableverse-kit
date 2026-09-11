import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { openBrowser, resolveOpenCommand } from "../src/lib/browser.ts";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

/** A stand-in for the ChildProcess `spawn` hands back. */
function fakeChild(): EventEmitter & { unref: () => void } {
  return Object.assign(new EventEmitter(), { unref: () => {} });
}

describe("openBrowser", () => {
  // `spawn` reports a missing opener by emitting 'error' on a later tick, after
  // openBrowser's promise has already resolved — so the caller's `.catch()`
  // cannot see it, and an 'error' with no listener is thrown by EventEmitter,
  // which for us means an uncaught exception that kills the CLI mid-login.
  it("survives an opener that cannot be spawned", async () => {
    const child = fakeChild();
    vi.mocked(spawn).mockReturnValue(child as never);

    await openBrowser("https://dev.example.test/authorize");

    expect(() =>
      child.emit(
        "error",
        Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }),
      ),
    ).not.toThrow();
  });
});

describe("resolveOpenCommand", () => {
  const URL = "https://dev.example.test/authorize";

  it("defers to the platform's default https handler", () => {
    expect(resolveOpenCommand(URL, "linux")).toEqual({
      command: "xdg-open",
      args: [URL],
    });
    expect(resolveOpenCommand(URL, "darwin")).toEqual({
      command: "open",
      args: [URL],
    });
    expect(resolveOpenCommand(URL, "win32")).toEqual({
      command: "cmd",
      args: ["/c", "start", "", URL],
    });
  });

  // The URL reaches the opener as an argv entry, never through a shell, so a
  // hostile TABLEVERSE_WEB_URL cannot smuggle in a command.
  it("passes the url as a single argument", () => {
    const { args } = resolveOpenCommand(
      "https://x.io/a?b=1&c=$(whoami)",
      "linux",
    );

    expect(args).toEqual(["https://x.io/a?b=1&c=$(whoami)"]);
  });
});
