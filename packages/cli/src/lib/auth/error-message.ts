import {
  PlatformRequestError,
  PlatformResponseError,
} from "../platform-client.ts";
import type { PlatformConfig } from "../platform-config.ts";
import {
  AuthorizationError,
  type AuthorizationFailure,
} from "./loopback-authorize.ts";
import { CredentialsFileError } from "./token-store.ts";

/** The command being run, so advice can name it instead of guessing `login`. */
export type AuthCommand = "login" | "logout" | "whoami";

export interface AuthErrorContext {
  config: PlatformConfig;
  command: AuthCommand;
}

const AUTHORIZATION_MESSAGES: Record<AuthorizationFailure, string> = {
  denied: "Authorization was denied in the browser",
  state_mismatch:
    "The browser returned a response that did not match this login attempt, so it was rejected",
  missing_code: "The browser returned without an authorization code",
  timed_out: "Timed out waiting for authorization to finish in the browser",
  listener_failed:
    "Could not open a local port to receive the browser redirect",
};

function describeCredentialsFile(
  error: CredentialsFileError,
  command: AuthCommand,
): string {
  // Deleting the file *is* logging out, so logout should not send the user to
  // `tvk login` to accomplish what they already asked for.
  const advice =
    command === "logout"
      ? "Delete that file to clear your credentials."
      : "Delete that file and run `tvk login`.";

  return [
    `Your saved credentials could not be read — ${error.detail}:`,
    `  ${error.filePath}`,
    advice,
  ].join("\n");
}

function describePlatformRequest(
  error: PlatformRequestError,
  retry: string,
): string {
  if (error.status >= 500) {
    return `The platform returned an error (HTTP ${error.status}). Try again shortly.`;
  }

  if (error.status === 401 || error.status === 403) {
    return "The platform rejected the request as unauthorized. Run `tvk login` to authenticate.";
  }

  return `The platform rejected the request to ${error.endpoint} (HTTP ${error.status}). ${retry}`;
}

/**
 * Turns the errors an auth command can fail with into something worth printing.
 * The identifiers these errors carry (`authorization_timed_out`,
 * `platform_request_failed:/oauth/token:400`) are for us, not for the person
 * who just wanted to log in.
 */
export function describeAuthError(
  error: unknown,
  { config, command }: AuthErrorContext,
): string {
  const retry = `Run \`tvk ${command}\` to try again.`;

  if (error instanceof CredentialsFileError) {
    return describeCredentialsFile(error, command);
  }

  if (error instanceof AuthorizationError) {
    const detail = error.detail ? ` (${error.detail})` : "";

    return `${AUTHORIZATION_MESSAGES[error.reason]}${detail}. ${retry}`;
  }

  // fetch rejects with TypeError for any network-level failure (WHATWG fetch
  // §5). Match the message too: a plain TypeError is far more likely to be a
  // bug of ours, and mislabelling that as "offline" would send the user to
  // check their wifi over a broken build.
  if (error instanceof TypeError && /fetch failed/i.test(error.message)) {
    return [
      `Could not reach the platform at ${config.apiBaseUrl}.`,
      "Check your network connection, or set TABLEVERSE_API_URL if you meant a different deployment.",
    ].join("\n");
  }

  // The CLI and the platform disagree about the wire format. Nothing the user
  // did caused it and nothing they can do locally will fix it, so point at the
  // two things that might: a newer CLI, or telling us.
  if (error instanceof PlatformResponseError) {
    return [
      `The platform at ${config.apiBaseUrl} returned a response tvk did not understand (${error.endpoint}).`,
      "Update tvk to the latest version; if it still happens, please report it.",
    ].join("\n");
  }

  if (error instanceof PlatformRequestError) {
    return describePlatformRequest(error, retry);
  }

  return error instanceof Error ? error.message : String(error);
}
