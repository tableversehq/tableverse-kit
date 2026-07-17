import { describe, expect, it, vi } from "vitest";
import { runLogoutCommand } from "../src/commands/logout.ts";
import {
  PlatformRequestError,
  PlatformResponseError,
} from "../src/lib/platform-client.ts";
import { CredentialsFileError } from "../src/lib/auth/token-store.ts";
import {
  TEST_CONFIG,
  createFakeClient,
  createMemoryTokenStore,
  createTestContext,
  storedCredentials,
} from "./auth/fakes.ts";

describe("tvk logout", () => {
  it("revokes the refresh token server-side and clears local credentials", async () => {
    const tokenStore = createMemoryTokenStore([storedCredentials()]);
    const logout = vi.fn(async () => {});

    const result = await runLogoutCommand(
      [],
      createTestContext({ tokenStore, client: createFakeClient({ logout }) }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("Logged out.");
    expect(logout).toHaveBeenCalledWith({ refreshToken: "stored-refresh" });
    expect(await tokenStore.read(TEST_CONFIG.apiBaseUrl)).toBeUndefined();
  });

  it("still clears local credentials when server-side revocation fails", async () => {
    const tokenStore = createMemoryTokenStore([storedCredentials()]);

    const result = await runLogoutCommand(
      [],
      createTestContext({
        tokenStore,
        client: createFakeClient({
          logout: async () => {
            throw new PlatformRequestError(401, "/auth/logout");
          },
        }),
      }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("Logged out.");
    expect(await tokenStore.read(TEST_CONFIG.apiBaseUrl)).toBeUndefined();
  });

  it("reports already logged out without calling the server", async () => {
    const logout = vi.fn(async () => {});

    const result = await runLogoutCommand(
      [],
      createTestContext({ client: createFakeClient({ logout }) }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("Already logged out.");
    expect(logout).not.toHaveBeenCalled();
  });

  // `logout` cannot clear a file it cannot parse, so the message has to tell
  // the user the one thing that does work: delete it.
  it("tells the user how to clear a corrupt credentials file", async () => {
    const result = await runLogoutCommand(
      [],
      createTestContext({
        tokenStore: {
          read: async () => undefined,
          write: async () => {},
          remove: async () => {
            throw new CredentialsFileError(
              "/home/u/.config/tableverse/credentials.json",
              "not valid JSON",
            );
          },
        },
      }),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "/home/u/.config/tableverse/credentials.json",
    );
    expect(result.stderr).toMatch(/delete/i);
    expect(result.stderr).not.toContain("credentials_file_invalid:");
    // Deleting the file *is* logging out, so do not send them to `tvk login`.
    expect(result.stderr).not.toContain("tvk login");
  });

  // A wire-format disagreement is ours, not the user's: never show them the
  // raw identifier, and never tell them to fix their credentials over it.
  it("explains a response it could not understand without leaking the identifier", async () => {
    const result = await runLogoutCommand(
      [],
      createTestContext({
        tokenStore: {
          read: async () => undefined,
          write: async () => {},
          remove: async () => {
            throw new PlatformResponseError("/me", "/email");
          },
        },
      }),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).not.toContain("platform_response_invalid");
    expect(result.stderr).toMatch(/update|report/i);
  });

  it("rejects unexpected positional arguments", async () => {
    const result = await runLogoutCommand(["oops"], createTestContext());

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("unexpected_positional_argument:oops");
  });
});
