import type { AuthContext } from "../../src/lib/auth/context.ts";
import type { Account } from "../../src/lib/api-schema.ts";
import type {
  StoredCredentials,
  TokenStore,
} from "../../src/lib/auth/token-store.ts";
import type { PlatformConfig } from "../../src/lib/platform-config.ts";
import type {
  PlatformClient,
  TokenResponse,
} from "../../src/lib/platform-client.ts";

export const TEST_CONFIG: PlatformConfig = {
  apiBaseUrl: "https://api-dev.tableverse.io",
  webBaseUrl: "https://dev.tableverse.io",
  clientId: "tvk-cli",
};

export const FIXED_NOW = new Date("2026-07-12T18:00:00.000Z");

export function defaultTokens(): TokenResponse {
  return {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresIn: 3600,
  };
}

export function defaultAccount(): Account {
  return { id: "u1", email: "user@example.com" };
}

export function createMemoryTokenStore(
  seed: StoredCredentials[] = [],
): TokenStore {
  const map = new Map<string, StoredCredentials>(
    seed.map((entry) => [entry.apiBaseUrl, entry]),
  );

  return {
    async read(apiBaseUrl) {
      return map.get(apiBaseUrl);
    },
    async write(credentials) {
      map.set(credentials.apiBaseUrl, credentials);
    },
    async remove(apiBaseUrl) {
      const removed = map.get(apiBaseUrl);
      map.delete(apiBaseUrl);

      return removed;
    },
  };
}

export function createFakeClient(
  overrides: Partial<PlatformClient> = {},
): PlatformClient {
  return {
    exchangeAuthorizationCode:
      overrides.exchangeAuthorizationCode ?? (async () => defaultTokens()),
    refreshToken: overrides.refreshToken ?? (async () => defaultTokens()),
    logout: overrides.logout ?? (async () => {}),
    me: overrides.me ?? (async () => defaultAccount()),
  };
}

/**
 * Builds a complete `AuthContext` of fakes. Commands take a total context, so
 * this is how a test overrides only what it cares about without any field
 * falling back to a real collaborator.
 */
export function createTestContext(
  overrides: Partial<AuthContext> = {},
): AuthContext {
  return {
    config: TEST_CONFIG,
    tokenStore: createMemoryTokenStore(),
    client: createFakeClient(),
    // Interactive and therefore never implicit: a test that reaches the browser
    // flow must say what the browser does.
    authorize: async () => {
      throw new Error("authorize_not_stubbed");
    },
    pkce: () => ({
      verifier: "verifier-123",
      challenge: "challenge-abc",
      state: "state-xyz",
    }),
    now: () => FIXED_NOW,
    ...overrides,
  };
}

export function storedCredentials(
  overrides: Partial<StoredCredentials> = {},
): StoredCredentials {
  return {
    apiBaseUrl: TEST_CONFIG.apiBaseUrl,
    accessToken: "stored-access",
    refreshToken: "stored-refresh",
    expiresAt: "2026-07-12T19:00:00.000Z",
    account: defaultAccount(),
    ...overrides,
  };
}
