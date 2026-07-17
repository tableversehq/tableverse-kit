import type { AuthContext } from "../lib/auth/context.ts";
import { describeAuthError } from "../lib/auth/error-message.ts";
import { credentialsFromTokens } from "../lib/auth/session.ts";
import { failure, success, type RunResult } from "../lib/command-result.ts";
import { createLoginHelpText } from "../lib/help-text.ts";
import { isHelpFlag } from "../lib/parse-args.ts";
import type { PlatformConfig } from "../lib/platform-config.ts";

function buildAuthorizeUrl(
  config: PlatformConfig,
  challenge: string,
  state: string,
  redirectUri: string,
): string {
  let url: URL;

  try {
    url = new URL(`${config.webBaseUrl}/authorize`);
  } catch {
    // `new URL` only says "Invalid URL". The value is user-supplied, so name
    // the variable that carries it and what it was set to.
    throw new Error(
      `TABLEVERSE_WEB_URL is not a valid URL: ${config.webBaseUrl}`,
    );
  }

  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "publish");

  return url.toString();
}

export async function runLoginCommand(
  args: string[],
  ctx: AuthContext,
): Promise<RunResult> {
  const [firstArg] = args;

  if (isHelpFlag(firstArg)) {
    return success(createLoginHelpText());
  }

  if (firstArg !== undefined) {
    return failure(`unexpected_positional_argument:${firstArg}`);
  }

  try {
    // Credentials are only written at the end of the flow, so read the store
    // first: it is the one step that can fail on state we already have. Left
    // until the write, a corrupt file would surface only after the user had
    // finished authorizing, and the token the platform just issued would be
    // discarded. Fail before the browser, not after it.
    await ctx.tokenStore.read(ctx.config.apiBaseUrl);

    const { verifier, challenge, state } = ctx.pkce();

    const { code, redirectUri } = await ctx.authorize({
      expectedState: state,
      buildAuthorizeUrl: (uri) =>
        buildAuthorizeUrl(ctx.config, challenge, state, uri),
    });

    const tokens = await ctx.client.exchangeAuthorizationCode({
      code,
      codeVerifier: verifier,
      redirectUri,
    });

    const account = await ctx.client.me({ accessToken: tokens.accessToken });

    await ctx.tokenStore.write(
      credentialsFromTokens(ctx.config.apiBaseUrl, tokens, account, ctx.now()),
    );

    return success(`Logged in as ${account.email ?? account.id}`);
  } catch (error) {
    return failure(
      describeAuthError(error, { config: ctx.config, command: "login" }),
    );
  }
}
