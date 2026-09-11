import { describe, expect, it } from "vitest";
import { createLoopbackAuthorize } from "../../src/lib/auth/loopback-authorize.ts";

/** Builds an authorize URL that round-trips the loopback redirect + state. */
function buildAuthorizeUrl(state: string) {
  return (redirectUri: string) => {
    const url = new URL("https://dev.example.test/authorize");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    return url.toString();
  };
}

/** A fake browser that hits the loopback callback with the given query. */
function callbackBrowser(query: (state: string) => Record<string, string>) {
  return async (authorizeUrl: string) => {
    const url = new URL(authorizeUrl);
    const redirect = new URL(url.searchParams.get("redirect_uri")!);
    const state = url.searchParams.get("state")!;

    for (const [key, value] of Object.entries(query(state))) {
      redirect.searchParams.set(key, value);
    }

    await fetch(redirect.toString());
  };
}

describe("loopback authorize", () => {
  it("resolves with the authorization code from the callback", async () => {
    const authorize = createLoopbackAuthorize({
      emit: () => {},
      openBrowser: callbackBrowser((state) => ({ code: "the-code", state })),
    });

    const result = await authorize({
      expectedState: "st",
      buildAuthorizeUrl: buildAuthorizeUrl("st"),
    });

    expect(result.code).toBe("the-code");
    expect(result.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
  });

  it("rejects when the callback state does not match", async () => {
    const authorize = createLoopbackAuthorize({
      emit: () => {},
      openBrowser: callbackBrowser(() => ({ code: "x", state: "wrong" })),
    });

    await expect(
      authorize({
        expectedState: "st",
        buildAuthorizeUrl: buildAuthorizeUrl("st"),
      }),
    ).rejects.toThrow("authorization_state_mismatch");
  });

  // buildAuthorizeUrl is caller-supplied and runs inside the server's `listen`
  // callback, so a throw there escapes the Promise entirely unless routed
  // through finish(). Reachable in production via a malformed
  // TABLEVERSE_WEB_URL, which makes login.ts's `new URL(...)` throw.
  it("rejects instead of crashing when buildAuthorizeUrl throws", async () => {
    const authorize = createLoopbackAuthorize({
      emit: () => {},
      openBrowser: async () => {},
    });

    await expect(
      authorize({
        expectedState: "st",
        buildAuthorizeUrl: () => {
          throw new TypeError("Invalid URL");
        },
      }),
    ).rejects.toThrow("Invalid URL");
  });

  it("rejects when the provider returns an error", async () => {
    const authorize = createLoopbackAuthorize({
      emit: () => {},
      openBrowser: callbackBrowser((state) => ({
        error: "access_denied",
        state,
      })),
    });

    await expect(
      authorize({
        expectedState: "st",
        buildAuthorizeUrl: buildAuthorizeUrl("st"),
      }),
    ).rejects.toThrow("authorization_denied:access_denied");
  });
});
