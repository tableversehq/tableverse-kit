import { describe, expect, it, vi } from "vitest";
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
    apiBaseUrl: "https://api-dev.tableverse.io",
    clientId: "tvk-cli",
    fetch: fetchImpl,
  });
}

// The platform's real contract lives in a private repo the CLI cannot depend
// on, so these schemas are a second statement of it and can drift. Validating
// at the boundary means drift is reported here, against the endpoint that
// caused it, instead of silently entering the token store and resurfacing
// later as "your credentials file is corrupt".
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

  // Null email is legal per the platform contract, so validation must not be
  // the thing that rejects it.
  it("accepts a /me response with a null email", async () => {
    const client = makeClient(
      vi.fn<FetchLike>(async () => jsonResponse({ id: "u1", email: null })),
    );

    await expect(client.me({ accessToken: "a" })).resolves.toEqual({
      id: "u1",
      email: null,
    });
  });

  // Requiring only what we read is what lets the platform add fields without
  // breaking a CLI that is already released.
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
    expect(url).toBe("https://api-dev.tableverse.io/oauth/token");
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
    expect(url).toBe("https://api-dev.tableverse.io/auth/logout");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ refreshToken: "r" });
  });

  it("sends the bearer token for /me", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({ id: "u1", email: "user@example.com" }),
    );

    const account = await makeClient(fetchImpl).me({ accessToken: "tok" });

    expect(account).toEqual({ id: "u1", email: "user@example.com" });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api-dev.tableverse.io/me");
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
