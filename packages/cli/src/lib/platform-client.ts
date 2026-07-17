import type { TSchema, Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
  AccountSchema,
  RawTokenResponseSchema,
  type Account,
} from "./api-schema.ts";

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  /** Lifetime of the access token in seconds. */
  expiresIn: number;
}

export interface PlatformClient {
  exchangeAuthorizationCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<TokenResponse>;
  refreshToken(input: { refreshToken: string }): Promise<TokenResponse>;
  logout(input: { refreshToken: string }): Promise<void>;
  me(input: { accessToken: string }): Promise<Account>;
}

export type FetchLike = typeof fetch;

export class PlatformRequestError extends Error {
  readonly status: number;
  readonly endpoint: string;

  // Fields are assigned rather than declared as constructor parameter
  // properties: those are TypeScript-only syntax that Node's type stripping
  // cannot transform, and `bin` points straight at the TypeScript entry.
  constructor(status: number, endpoint: string) {
    super(`platform_request_failed:${endpoint}:${status}`);
    this.name = "PlatformRequestError";
    this.status = status;
    this.endpoint = endpoint;
  }
}

/**
 * The platform answered, but not with anything this CLI recognises. Distinct
 * from `PlatformRequestError` (the platform said no, and we understood it):
 * this means the CLI and the platform disagree about the wire format, which is
 * ours to report, not the user's to fix.
 */
export class PlatformResponseError extends Error {
  readonly endpoint: string;
  readonly at?: string;

  constructor(endpoint: string, at?: string) {
    super(`platform_response_invalid:${endpoint}${at ? `:${at}` : ""}`);
    this.name = "PlatformResponseError";
    this.endpoint = endpoint;
    this.at = at;
  }
}

/**
 * Checks a decoded response body against what the CLI requires of it. Without
 * this a bad field would be cast away silently and only surface much later —
 * an unreadable credentials file, or `undefined` somewhere far from the cause.
 */
function parseResponse<T extends TSchema>(
  schema: T,
  body: unknown,
  endpoint: string,
): Static<T> {
  if (!Value.Check(schema, body)) {
    // A JSON pointer to the first offending field; empty at the root, where it
    // reads as punctuation rather than a location.
    const at = Value.Errors(schema, body).First()?.path;

    throw new PlatformResponseError(endpoint, at === "" ? undefined : at);
  }

  return body;
}

function toTokenResponse(
  raw: Static<typeof RawTokenResponseSchema>,
): TokenResponse {
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token,
    expiresIn: raw.expires_in,
  };
}

export function createPlatformClient(options: {
  apiBaseUrl: string;
  clientId: string;
  fetch: FetchLike;
}): PlatformClient {
  const { apiBaseUrl, clientId, fetch: fetchImpl } = options;

  async function postToken(
    body: Record<string, string>,
  ): Promise<TokenResponse> {
    const endpoint = "/oauth/token";
    const response = await fetchImpl(`${apiBaseUrl}${endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, client_id: clientId }),
    });

    if (!response.ok) {
      throw new PlatformRequestError(response.status, endpoint);
    }

    return toTokenResponse(
      parseResponse(RawTokenResponseSchema, await response.json(), endpoint),
    );
  }

  return {
    exchangeAuthorizationCode({ code, codeVerifier, redirectUri }) {
      return postToken({
        grant_type: "authorization_code",
        code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
      });
    },

    refreshToken({ refreshToken }) {
      return postToken({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      });
    },

    async logout({ refreshToken }) {
      const endpoint = "/auth/logout";
      const response = await fetchImpl(`${apiBaseUrl}${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        throw new PlatformRequestError(response.status, endpoint);
      }
    },

    async me({ accessToken }) {
      const endpoint = "/me";
      const response = await fetchImpl(`${apiBaseUrl}${endpoint}`, {
        headers: { authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw new PlatformRequestError(response.status, endpoint);
      }

      return parseResponse(AccountSchema, await response.json(), endpoint);
    },
  };
}
