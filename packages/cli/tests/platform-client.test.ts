import { describe, expect, it, vi } from "vitest";
import { credentialsFromTokens } from "../src/lib/auth/session.ts";
import {
  createPlatformClient,
  PlatformRequestError,
  PlatformResponseError,
  type FetchLike,
} from "../src/lib/platform-client.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeClient(fetchImpl: FetchLike) {
  return createPlatformClient({
    apiBaseUrl: "https://api-dev.example.test",
    clientId: "tvk-cli",
    fetch: fetchImpl,
  });
}

describe("platform client response validation", () => {
  it("rejects a /me response missing a required field", async () => {
    const client = makeClient(
      vi.fn<FetchLike>(async () => jsonResponse({ id: "u1" })),
    );

    await expect(client.me({ accessToken: "a" })).rejects.toThrow(
      PlatformResponseError,
    );
  });

  it("rejects a /me response whose field is the wrong type", async () => {
    const client = makeClient(
      vi.fn<FetchLike>(async () => jsonResponse({ id: 42, email: "a@b.c" })),
    );

    await expect(client.me({ accessToken: "a" })).rejects.toMatchObject({
      endpoint: "/me",
    });
  });

  it("accepts a /me response with a null email", async () => {
    const client = makeClient(
      vi.fn<FetchLike>(async () => jsonResponse({ id: "u1", email: null })),
    );

    await expect(client.me({ accessToken: "a" })).resolves.toEqual({
      id: "u1",
      email: null,
    });
  });

  it("accepts responses carrying fields the CLI does not know about", async () => {
    const client = makeClient(
      vi.fn<FetchLike>(async () =>
        jsonResponse({
          access_token: "a",
          refresh_token: "r",
          expires_in: 3600,
          token_type: "Bearer",
          some_future_field: true,
        }),
      ),
    );

    await expect(client.refreshToken({ refreshToken: "r" })).resolves.toEqual({
      accessToken: "a",
      refreshToken: "r",
      expiresIn: 3600,
    });
  });

  it("rejects a token response whose expires_in is not a number", async () => {
    const client = makeClient(
      vi.fn<FetchLike>(async () =>
        jsonResponse({
          access_token: "a",
          refresh_token: "r",
          expires_in: "3600",
        }),
      ),
    );

    await expect(
      client.refreshToken({ refreshToken: "r" }),
    ).rejects.toMatchObject({ endpoint: "/oauth/token" });
  });
});

describe("wire format does not leak into the file format", () => {
  it("stores only the account fields the file format defines", async () => {
    const client = makeClient(
      vi.fn<FetchLike>(async () =>
        jsonResponse({
          id: "u1",
          email: "a@b.c",
          displayName: "a field the CLI does not model",
        }),
      ),
    );

    const account = await client.me({ accessToken: "a" });

    const credentials = credentialsFromTokens(
      "https://api-dev.example.test",
      { accessToken: "a", refreshToken: "r", expiresIn: 3600 },
      account,
      new Date("2026-07-12T18:00:00.000Z"),
    );

    expect(credentials.account).toEqual({ id: "u1", email: "a@b.c" });
  });
});

describe("platform client", () => {
  it("exchanges an authorization code and maps the snake_case response", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({
        access_token: "a",
        refresh_token: "r",
        expires_in: 3600,
      }),
    );

    const tokens = await makeClient(fetchImpl).exchangeAuthorizationCode({
      code: "c",
      codeVerifier: "v",
      redirectUri: "http://127.0.0.1:1/callback",
    });

    expect(tokens).toEqual({
      accessToken: "a",
      refreshToken: "r",
      expiresIn: 3600,
    });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api-dev.example.test/oauth/token");
    expect(JSON.parse(String(init?.body))).toEqual({
      grant_type: "authorization_code",
      code: "c",
      code_verifier: "v",
      redirect_uri: "http://127.0.0.1:1/callback",
      client_id: "tvk-cli",
    });
  });

  it("posts the refresh token to /auth/logout", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse({ ok: true }));

    await makeClient(fetchImpl).logout({ refreshToken: "r" });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api-dev.example.test/auth/logout");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ refreshToken: "r" });
  });

  it("creates a version from one project source and its build config", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({
        versionId: "version-1",
        versionNumber: 2,
        putUrls: {
          projectSource: {
            url: "https://storage.example/project",
            headers: { "x-checksum": "digest" },
          },
        },
        expiresAt: "2026-08-26T00:00:00.000Z",
      }),
    );

    const result = await makeClient(fetchImpl).createVersion({
      accessToken: "tok",
      gameId: "game-1",
      projectSourceSha256: "a".repeat(64),
      projectSourceSizeBytes: 123,
      buildConfig: {
        engine: { root: "./engine" },
        frontend: {
          root: "./client",
          buildCommand: "npm run build",
          outDir: "dist",
        },
      },
      metadata: {
        setupInputSchema: null,
        minPlayers: 2,
        maxPlayers: 4,
      },
    });

    expect(result.putUrls.projectSource.url).toBe(
      "https://storage.example/project",
    );
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api-dev.example.test/versions");
    expect(JSON.parse(String(init?.body))).toEqual({
      gameId: "game-1",
      projectSourceSha256: "a".repeat(64),
      projectSourceSizeBytes: 123,
      buildConfig: {
        engine: { root: "./engine" },
        frontend: {
          root: "./client",
          buildCommand: "npm run build",
          outDir: "dist",
        },
      },
      metadata: {
        setupInputSchema: null,
        minPlayers: 2,
        maxPlayers: 4,
      },
    });
  });

  it("sends the bearer token for /me", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({ id: "u1", email: "user@example.com" }),
    );

    const account = await makeClient(fetchImpl).me({ accessToken: "tok" });

    expect(account).toEqual({ id: "u1", email: "user@example.com" });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api-dev.example.test/me");
    expect((init?.headers as Record<string, string>).authorization).toBe(
      "Bearer tok",
    );
  });

  it("throws PlatformRequestError with the status on a non-2xx response", async () => {
    const client = makeClient(async () => jsonResponse({}, 401));

    await expect(client.me({ accessToken: "tok" })).rejects.toMatchObject({
      status: 401,
      endpoint: "/me",
    });
    await expect(client.me({ accessToken: "tok" })).rejects.toBeInstanceOf(
      PlatformRequestError,
    );
  });
});
