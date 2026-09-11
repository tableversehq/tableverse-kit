export interface PlatformConfig {
  /** Base URL of platform-api, e.g. https://api.tableverse.io */
  apiBaseUrl: string;
  /** Base URL of platform-web, e.g. https://tableverse.io */
  webBaseUrl: string;
  /** Public OAuth client id for the CLI. */
  clientId: string;
}

const DEFAULT_API_BASE_URL = "https://api.tableverse.io";
const DEFAULT_WEB_BASE_URL = "https://tableverse.io";
const CLIENT_ID = "tvk-cli";

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

/**
 * Selects the platform environment. The CLI talks to production by default.
 * `TABLEVERSE_API_URL` / `TABLEVERSE_WEB_URL` point it at another deployment —
 * staging, a development environment, or a local platform-api and platform-web.
 */
export function resolvePlatformConfig(
  env: Record<string, string | undefined>,
): PlatformConfig {
  return {
    apiBaseUrl: stripTrailingSlash(
      env.TABLEVERSE_API_URL ?? DEFAULT_API_BASE_URL,
    ),
    webBaseUrl: stripTrailingSlash(
      env.TABLEVERSE_WEB_URL ?? DEFAULT_WEB_BASE_URL,
    ),
    clientId: CLIENT_ID,
  };
}
