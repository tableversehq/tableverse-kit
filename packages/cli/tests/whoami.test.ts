import { describe, expect, it, vi } from "vitest";
import { runWhoamiCommand } from "../src/commands/whoami.ts";
import { PlatformRequestError } from "../src/lib/platform-client.ts";
import {
  TEST_CONFIG,
  createFakeClient,
  createMemoryTokenStore,
  createTestContext,
  storedCredentials,
} from "./auth/fakes.ts";

const EXPIRED = "Session expired. Run `tvk login`.";

describe("tvk whoami", () => {
  it("prints the account email for a valid session", async () => {
    const result = await runWhoamiCommand(
      [],
      createTestContext({
        tokenStore: createMemoryTokenStore([storedCredentials()]),
        client: createFakeClient({
          me: async () => ({ id: "u1", email: "me@example.com" }),
        }),
      }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("me@example.com");
  });

  // `/me` returns `email: null` for an OAuth account whose provider withheld
  // an email — legal per the platform contract. Printing "null" is useless, and
  // rejecting it locks that user out of the CLI entirely.
  it("falls back to the account id when the account has no email", async () => {
    const result = await runWhoamiCommand(
      [],
      createTestContext({
        tokenStore: createMemoryTokenStore([storedCredentials()]),
        client: createFakeClient({
          me: async () => ({ id: "u_01HX3P9K2M", email: null }),
        }),
      }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("u_01HX3P9K2M");
  });

  it("fails cleanly when not logged in", async () => {
    const result = await runWhoamiCommand([], createTestContext());

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("Not logged in. Run `tvk login`.");
  });

  it("refreshes an expired access token, then reports the account", async () => {
    const tokenStore = createMemoryTokenStore([
      storedCredentials({ expiresAt: "2026-07-12T17:00:00.000Z" }),
    ]);
    const refreshToken = vi.fn(async () => ({
      accessToken: "refreshed-access",
      refreshToken: "refreshed-refresh",
      expiresIn: 3600,
    }));

    const result = await runWhoamiCommand(
      [],
      createTestContext({
        tokenStore,
        client: createFakeClient({ refreshToken }),
      }),
    );

    expect(result.exitCode).toBe(0);
    expect(refreshToken).toHaveBeenCalledOnce();

    const stored = await tokenStore.read(TEST_CONFIG.apiBaseUrl);
    expect(stored).toMatchObject({
      accessToken: "refreshed-access",
      expiresAt: "2026-07-12T19:00:00.000Z",
    });
  });

  it("prompts re-login when the refresh token is rejected", async () => {
    const result = await runWhoamiCommand(
      [],
      createTestContext({
        tokenStore: createMemoryTokenStore([
          storedCredentials({ expiresAt: "2026-07-12T17:00:00.000Z" }),
        ]),
        client: createFakeClient({
          refreshToken: async () => {
            throw new PlatformRequestError(401, "/oauth/token");
          },
        }),
      }),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("Session expired. Run `tvk login`.");
  });

  it("treats an unparseable expiresAt as expired, refreshing and repairing it", async () => {
    const tokenStore = createMemoryTokenStore([
      storedCredentials({ expiresAt: "garbage" }),
    ]);
    const refreshToken = vi.fn(async () => ({
      accessToken: "refreshed-access",
      refreshToken: "refreshed-refresh",
      expiresIn: 3600,
    }));

    const result = await runWhoamiCommand(
      [],
      createTestContext({
        tokenStore,
        client: createFakeClient({ refreshToken }),
      }),
    );

    expect(result.exitCode).toBe(0);
    expect(refreshToken).toHaveBeenCalledOnce();

    // The bad timestamp is replaced on disk, so the file heals itself rather
    // than needing the user to delete it.
    const stored = await tokenStore.read(TEST_CONFIG.apiBaseUrl);
    expect(stored?.expiresAt).toBe("2026-07-12T19:00:00.000Z");
  });

  it("surfaces a network failure during refresh instead of claiming the session expired", async () => {
    const result = await runWhoamiCommand(
      [],
      createTestContext({
        tokenStore: createMemoryTokenStore([
          storedCredentials({ expiresAt: "2026-07-12T17:00:00.000Z" }),
        ]),
        client: createFakeClient({
          refreshToken: async () => {
            throw new TypeError("fetch failed");
          },
        }),
      }),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).not.toBe(EXPIRED);
    // Names the deployment it could not reach, rather than "fetch failed".
    expect(result.stderr).toContain(TEST_CONFIG.apiBaseUrl);
  });

  it("surfaces a platform outage during refresh instead of claiming the session expired", async () => {
    const result = await runWhoamiCommand(
      [],
      createTestContext({
        tokenStore: createMemoryTokenStore([
          storedCredentials({ expiresAt: "2026-07-12T17:00:00.000Z" }),
        ]),
        client: createFakeClient({
          refreshToken: async () => {
            throw new PlatformRequestError(500, "/oauth/token");
          },
        }),
      }),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).not.toBe(EXPIRED);
  });

  it("surfaces a failure to store refreshed credentials rather than blaming the session", async () => {
    const result = await runWhoamiCommand(
      [],
      createTestContext({
        tokenStore: {
          read: async () =>
            storedCredentials({ expiresAt: "2026-07-12T17:00:00.000Z" }),
          write: async () => {
            throw new Error("EACCES: permission denied");
          },
          remove: async () => undefined,
        },
      }),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("EACCES");
  });

  it("returns a failure instead of throwing when the credentials file cannot be read", async () => {
    const result = await runWhoamiCommand(
      [],
      createTestContext({
        tokenStore: {
          read: async () => {
            throw new SyntaxError("Unterminated string in JSON at position 45");
          },
          write: async () => {},
          remove: async () => undefined,
        },
      }),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBeTruthy();
  });

  it("prompts re-login when /me returns 401", async () => {
    const result = await runWhoamiCommand(
      [],
      createTestContext({
        tokenStore: createMemoryTokenStore([storedCredentials()]),
        client: createFakeClient({
          me: async () => {
            throw new PlatformRequestError(401, "/me");
          },
        }),
      }),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("Session expired. Run `tvk login`.");
  });
});
