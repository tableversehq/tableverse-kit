import {
  PlatformRequestError,
  type PlatformClient,
  type TokenResponse,
} from "../platform-client.ts";
import type { Account } from "../api-schema.ts";
import type { StoredCredentials, TokenStore } from "./token-store.ts";

/** Refresh the access token this many ms before it actually expires. */
const EXPIRY_SKEW_MS = 60 * 1000;

/**
 * `authenticated` carries only the token: callers that want the account ask the
 * platform for it, since a locally cached copy would say nothing about whether
 * the session still works.
 */
export type SessionResult =
  | { status: "authenticated"; accessToken: string }
  | { status: "logged_out" }
  | { status: "expired" };

export function toExpiresAt(now: Date, expiresIn: number): string {
  return new Date(now.getTime() + expiresIn * 1000).toISOString();
}

export function credentialsFromTokens(
  apiBaseUrl: string,
  tokens: TokenResponse,
  account: Account,
  now: Date,
): StoredCredentials {
  return {
    apiBaseUrl,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: toExpiresAt(now, tokens.expiresIn),
    account,
  };
}

/**
 * True only when the platform rejected the refresh token itself — RFC 6749
 * §5.2 specifies 400 `invalid_grant` for a revoked or expired grant. Anything
 * else (transport failure, 5xx) says nothing about whether the session is
 * still good.
 */
function isRefreshRejected(error: unknown): boolean {
  return (
    error instanceof PlatformRequestError &&
    (error.status === 400 || error.status === 401)
  );
}

function isExpired(credentials: StoredCredentials, now: Date): boolean {
  const expiresAt = new Date(credentials.expiresAt).getTime();

  // An unparseable timestamp compares false against everything, which would
  // read as "never expires" and strand the caller on a dead token. Treating it
  // as expired refreshes it, and the refresh rewrites the field.
  if (Number.isNaN(expiresAt)) {
    return true;
  }

  return expiresAt - EXPIRY_SKEW_MS <= now.getTime();
}

/**
 * Returns a valid access token for the configured platform, silently refreshing
 * it when it is expired or near expiry. Never prompts; callers turn
 * `logged_out` / `expired` into a "run `tvk login`" message.
 */
export async function loadSession(deps: {
  apiBaseUrl: string;
  tokenStore: TokenStore;
  client: PlatformClient;
  now: () => Date;
}): Promise<SessionResult> {
  const { apiBaseUrl, tokenStore, client, now } = deps;
  const credentials = await tokenStore.read(apiBaseUrl);

  if (!credentials) {
    return { status: "logged_out" };
  }

  if (!isExpired(credentials, now())) {
    return { status: "authenticated", accessToken: credentials.accessToken };
  }

  let tokens: TokenResponse;

  try {
    tokens = await client.refreshToken({
      refreshToken: credentials.refreshToken,
    });
  } catch (error) {
    if (isRefreshRejected(error)) {
      return { status: "expired" };
    }

    // Offline, DNS failure, a platform outage: the session may well be fine, so
    // reporting it as expired would send the user into a login that also fails.
    throw error;
  }

  const refreshed = credentialsFromTokens(
    apiBaseUrl,
    tokens,
    credentials.account,
    now(),
  );
  // Deliberately outside the catch above: the refresh succeeded and the server
  // has already rotated the token, so a write failure here is a storage problem
  // to report, not an authentication one.
  await tokenStore.write(refreshed);

  return { status: "authenticated", accessToken: refreshed.accessToken };
}
