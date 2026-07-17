import type { AuthContext } from "../lib/auth/context.ts";
import { describeAuthError } from "../lib/auth/error-message.ts";
import { loadSession } from "../lib/auth/session.ts";
import { failure, success, type RunResult } from "../lib/command-result.ts";
import { createWhoamiHelpText } from "../lib/help-text.ts";
import { isHelpFlag } from "../lib/parse-args.ts";
import { PlatformRequestError } from "../lib/platform-client.ts";

const LOGGED_OUT_MESSAGE = "Not logged in. Run `tvk login`.";
const EXPIRED_MESSAGE = "Session expired. Run `tvk login`.";

export async function runWhoamiCommand(
  args: string[],
  ctx: AuthContext,
): Promise<RunResult> {
  const [firstArg] = args;

  if (isHelpFlag(firstArg)) {
    return success(createWhoamiHelpText());
  }

  if (firstArg !== undefined) {
    return failure(`unexpected_positional_argument:${firstArg}`);
  }

  try {
    const session = await loadSession({
      apiBaseUrl: ctx.config.apiBaseUrl,
      tokenStore: ctx.tokenStore,
      client: ctx.client,
      now: ctx.now,
    });

    if (session.status === "logged_out") {
      return failure(LOGGED_OUT_MESSAGE);
    }

    if (session.status === "expired") {
      return failure(EXPIRED_MESSAGE);
    }

    const account = await ctx.client.me({ accessToken: session.accessToken });

    // An OAuth provider may withhold the email, and printing "null" would name
    // nobody. The id always identifies the account and keeps this one stable
    // line of stdout that a script can read.
    return success(account.email ?? account.id);
  } catch (error) {
    if (error instanceof PlatformRequestError && error.status === 401) {
      return failure(EXPIRED_MESSAGE);
    }

    return failure(
      describeAuthError(error, { config: ctx.config, command: "whoami" }),
    );
  }
}
