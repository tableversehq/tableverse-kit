import { Type, type Static } from "@sinclair/typebox";

/**
 * What the CLI *requires* of the platform's responses.
 *
 * Deliberately narrower than the platform's own contract, which lives in the
 * private `@tableverse/api-contracts` and cannot be depended on here: it is
 * unpublished, so a released `@tableverse-kit/cli` could never resolve it.
 * These schemas are therefore a second statement of the same wire format, and
 * a contract test on the platform side is what keeps them honest.
 *
 * Narrow is also the right shape independent of that. TypeBox objects admit
 * unknown properties, so validating only the fields the CLI reads lets the
 * platform add fields without breaking a CLI that is already in someone's
 * hands. Requiring a field here is a promise the platform must keep forever;
 * only require what is actually read.
 */

export const AccountSchema = Type.Object({
  id: Type.String(),
  /**
   * Null when no account backing this user carries an email — an OAuth
   * provider that withheld it. The platform contract has always allowed this.
   */
  email: Type.Union([Type.String(), Type.Null()]),
});

export type Account = Static<typeof AccountSchema>;

/**
 * `POST /oauth/token`. The platform also returns `token_type: "Bearer"`, which
 * is not required here because nothing reads it.
 */
export const RawTokenResponseSchema = Type.Object({
  access_token: Type.String(),
  refresh_token: Type.String(),
  expires_in: Type.Number(),
});

export type RawTokenResponse = Static<typeof RawTokenResponseSchema>;
