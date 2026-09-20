import type { TSchema, Static } from "@sinclair/typebox";
import type { SerializedSetupSchema } from "@tableverse-kit/engine";
import { Value } from "@sinclair/typebox/value";
import { MeResponseSchema, type MeResponse } from "./api/me.ts";
import { OAuthTokenResponseSchema } from "./api/oauth-token.ts";
import {
  GameResponseSchema,
  ListGamesResponseSchema,
  type GameResponse,
  type ListGamesResponse,
} from "./api/games.ts";
import {
  CreateVersionResponseSchema,
  StartBuildResponseSchema,
  type CreateVersionResponse,
  type PresignedUpload,
  type StartBuildResponse,
} from "./api/versions.ts";

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface BuildConfig {
  engine: { root: string };
  frontend: { root: string; buildCommand: string; outDir: string };
}

export interface CreateVersionInput {
  accessToken: string;
  gameId: string;
  projectSourceSha256: string;
  projectSourceSizeBytes: number;
  buildConfig: BuildConfig;
  metadata: {
    setupInputSchema: SerializedSetupSchema | null;
    minPlayers: number;
    maxPlayers: number;
  };
}

export interface PlatformClient {
  exchangeAuthorizationCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<TokenResponse>;
  refreshToken(input: { refreshToken: string }): Promise<TokenResponse>;
  logout(input: { refreshToken: string }): Promise<void>;
  me(input: { accessToken: string }): Promise<MeResponse>;
  listGames(input: { accessToken: string }): Promise<ListGamesResponse>;
  createGame(input: {
    accessToken: string;
    name: string;
  }): Promise<GameResponse>;
  getGame(input: {
    accessToken: string;
    gameId: string;
  }): Promise<GameResponse>;
  createVersion(input: CreateVersionInput): Promise<CreateVersionResponse>;
  startBuild(input: {
    accessToken: string;
    versionId: string;
  }): Promise<StartBuildResponse>;
  uploadArtifact(input: {
    target: PresignedUpload;
    body: Uint8Array;
  }): Promise<void>;
}

export type FetchLike = typeof fetch;

export class ArtifactUploadError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`artifact_upload_failed:${status}`);
    this.name = "ArtifactUploadError";
    this.status = status;
  }
}

export class PlatformRequestError extends Error {
  readonly status: number;
  readonly endpoint: string;

  constructor(status: number, endpoint: string) {
    super(`platform_request_failed:${endpoint}:${status}`);
    this.name = "PlatformRequestError";
    this.status = status;
    this.endpoint = endpoint;
  }
}

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

function parseResponse<T extends TSchema>(
  schema: T,
  body: unknown,
  endpoint: string,
): Static<T> {
  if (!Value.Check(schema, body)) {
    const at = Value.Errors(schema, body).First()?.path;

    throw new PlatformResponseError(endpoint, at === "" ? undefined : at);
  }

  return body;
}

function toTokenResponse(
  raw: Static<typeof OAuthTokenResponseSchema>,
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
      parseResponse(OAuthTokenResponseSchema, await response.json(), endpoint),
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

      return parseResponse(MeResponseSchema, await response.json(), endpoint);
    },

    async listGames({ accessToken }) {
      const endpoint = "/games";
      const response = await fetchImpl(`${apiBaseUrl}${endpoint}`, {
        headers: { authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw new PlatformRequestError(response.status, endpoint);
      }

      return parseResponse(
        ListGamesResponseSchema,
        await response.json(),
        endpoint,
      );
    },

    async createGame({ accessToken, name }) {
      const endpoint = "/games";
      const response = await fetchImpl(`${apiBaseUrl}${endpoint}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        throw new PlatformRequestError(response.status, endpoint);
      }

      return parseResponse(GameResponseSchema, await response.json(), endpoint);
    },

    async getGame({ accessToken, gameId }) {
      const endpoint = `/games/${gameId}`;
      const response = await fetchImpl(`${apiBaseUrl}${endpoint}`, {
        headers: { authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw new PlatformRequestError(response.status, endpoint);
      }

      return parseResponse(GameResponseSchema, await response.json(), endpoint);
    },

    async createVersion({ accessToken, ...body }) {
      const endpoint = "/versions";
      const response = await fetchImpl(`${apiBaseUrl}${endpoint}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new PlatformRequestError(response.status, endpoint);
      }

      return parseResponse(
        CreateVersionResponseSchema,
        await response.json(),
        endpoint,
      );
    },

    async startBuild({ accessToken, versionId }) {
      const endpoint = `/versions/${versionId}/build`;
      const response = await fetchImpl(`${apiBaseUrl}${endpoint}`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw new PlatformRequestError(response.status, endpoint);
      }

      return parseResponse(
        StartBuildResponseSchema,
        await response.json(),
        endpoint,
      );
    },

    async uploadArtifact({ target, body }) {
      const response = await fetchImpl(target.url, {
        method: "PUT",
        headers: target.headers,
        body,
      });

      if (!response.ok) {
        throw new ArtifactUploadError(response.status);
      }
    },
  };
}
