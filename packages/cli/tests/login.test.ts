import { describe, expect, it, vi } from "vitest";
import { runLoginCommand } from "../src/commands/login.ts";
import {
  AuthorizationError,
  type AuthorizeFn,
} from "../src/lib/auth/loopback-authorize.ts";
import { PlatformRequestError } from "../src/lib/platform-client.ts";
import { CredentialsFileError } from "../src/lib/auth/token-store.ts";
import {
  TEST_CONFIG,
  createFakeClient,
  createMemoryTokenStore,
  createTestContext,
} from "./auth/fakes.ts";

const REDIRECT_URI = "http://127.0.0.1:5555/callback";

describe("tvk login", () => {
  // An account with no email must still be storable and nameable, or `login`
  // "succeeds" while writing a file that every later command rejects.
  it("names the account by id, and stores it, when it has no email", async () => {
    const tokenStore = createMemoryTokenStore();

    const result = await runLoginCommand(
      [],
      createTestContext({
        tokenStore,
        authorize: async () => ({
          code: "auth-code",
          redirectUri: "http://127.0.0.1:5555/callback",
        }),
        client: createFakeClient({
          me: async () => ({ id: "u_01HX3P9K2M", email: null }),
        }),
      }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("Logged in as u_01HX3P9K2M");
    expect(await tokenStore.read(TEST_CONFIG.apiBaseUrl)).toMatchObject({
      account: { id: "u_01HX3P9K2M", email: null },
    });
  });

  it("runs the PKCE flow, exchanges the code, and stores credentials", async () => {
    const tokenStore = createMemoryTokenStore();
    const exchangeAuthorizationCode = vi.fn(async () => ({
      accessToken: "fresh-access",
      refreshToken: "fresh-refresh",
      expiresIn: 3600,
    }));

    const result = await runLoginCommand(
      [],
      createTestContext({
        tokenStore,
        client: createFakeClient({ exchangeAuthorizationCode }),
        authorize: async () => ({
          code: "auth-code",
          redirectUri: REDIRECT_URI,
        }),
      }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("Logged in as user@example.com");

    expect(exchangeAuthorizationCode).toHaveBeenCalledWith({
      code: "auth-code",
      codeVerifier: "verifier-123",
      redirectUri: REDIRECT_URI,
    });

    const stored = await tokenStore.read(TEST_CONFIG.apiBaseUrl);
    expect(stored).toMatchObject({
      accessToken: "fresh-access",
      refreshToken: "fresh-refresh",
      expiresAt: "2026-07-12T19:00:00.000Z",
    });
  });

  it("builds an authorize URL with PKCE, loopback redirect, and publish scope", async () => {
    let authorizeUrl = "";
    const authorize: AuthorizeFn = async ({ buildAuthorizeUrl }) => {
      authorizeUrl = buildAuthorizeUrl(REDIRECT_URI);
      return { code: "auth-code", redirectUri: REDIRECT_URI };
    };

    await runLoginCommand([], createTestContext({ authorize }));

    const url = new URL(authorizeUrl);
    expect(url.origin + url.pathname).toBe(
      "https://dev.tableverse.io/authorize",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("tvk-cli");
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(url.searchParams.get("code_challenge")).toBe("challenge-abc");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("state-xyz");
    expect(url.searchParams.get("scope")).toBe("publish");
  });

  it("prints login help for --help without starting the flow", async () => {
    const authorize = vi.fn<AuthorizeFn>();

    const result = await runLoginCommand(
      ["--help"],
      createTestContext({ authorize }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("tvk login");
    expect(authorize).not.toHaveBeenCalled();
  });

  // The credentials file is only written at the very end, so without an upfront
  // check a corrupt file is discovered after the user has completed the whole
  // browser flow — and the refresh token the server just issued is discarded.
  it("rejects a corrupt credentials file before opening the browser", async () => {
    const authorize = vi.fn<AuthorizeFn>();

    const result = await runLoginCommand(
      [],
      createTestContext({
        authorize,
        tokenStore: {
          read: async () => {
            throw new CredentialsFileError(
              "/home/u/.config/tableverse/credentials.json",
              "unexpected contents",
            );
          },
          write: async () => {},
          remove: async () => undefined,
        },
      }),
    );

    expect(result.exitCode).toBe(1);
    expect(authorize).not.toHaveBeenCalled();
    expect(result.stderr).toContain(
      "/home/u/.config/tableverse/credentials.json",
    );
  });

  it("explains an authorization denial without leaking the internal identifier", async () => {
    const result = await runLoginCommand(
      [],
      createTestContext({
        authorize: async () => {
          throw new AuthorizationError("denied", "access_denied");
        },
      }),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("denied");
    expect(result.stderr).toContain("access_denied");
    expect(result.stderr).not.toContain("authorization_denied:");
  });

  it("names the offending variable when TABLEVERSE_WEB_URL is not a URL", async () => {
    const result = await runLoginCommand(
      [],
      createTestContext({
        config: { ...TEST_CONFIG, webBaseUrl: "not-a-url" },
        authorize: async ({ buildAuthorizeUrl }) => ({
          code: "c",
          redirectUri: buildAuthorizeUrl(REDIRECT_URI),
        }),
      }),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("TABLEVERSE_WEB_URL");
    expect(result.stderr).toContain("not-a-url");
  });

  it("explains a browser timeout in a sentence", async () => {
    const result = await runLoginCommand(
      [],
      createTestContext({
        authorize: async () => {
          throw new AuthorizationError("timed_out");
        },
      }),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("tvk login");
    expect(result.stderr).not.toContain("authorization_timed_out");
  });

  it("explains a rejected token exchange rather than printing the raw request id", async () => {
    const result = await runLoginCommand(
      [],
      createTestContext({
        authorize: async () => ({ code: "c", redirectUri: REDIRECT_URI }),
        client: createFakeClient({
          exchangeAuthorizationCode: async () => {
            throw new PlatformRequestError(400, "/oauth/token");
          },
        }),
      }),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).not.toContain("platform_request_failed:");
  });
});
