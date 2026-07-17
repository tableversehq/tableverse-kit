import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { AccountSchema } from "../api-schema.ts";

const StoredCredentialsSchema = Type.Object({
  apiBaseUrl: Type.String(),
  accessToken: Type.String(),
  refreshToken: Type.String(),
  /** ISO-8601 timestamp at which the access token expires. */
  expiresAt: Type.String(),
  account: AccountSchema,
});

export type StoredCredentials = Static<typeof StoredCredentialsSchema>;

export interface TokenStore {
  read(apiBaseUrl: string): Promise<StoredCredentials | undefined>;
  write(credentials: StoredCredentials): Promise<void>;
  /**
   * Removes the entry for `apiBaseUrl` and resolves with what was removed, or
   * `undefined` if there was nothing. Returning the entry lets a caller revoke
   * the token it held without reading the file a second time.
   */
  remove(apiBaseUrl: string): Promise<StoredCredentials | undefined>;
}

/** The on-disk shape: a map keyed by `apiBaseUrl` so dev and prod coexist. */
const CredentialsFileSchema = Type.Record(
  Type.String(),
  StoredCredentialsSchema,
);

type CredentialsFile = Static<typeof CredentialsFileSchema>;

/** The credentials file exists but does not hold what we wrote. */
export class CredentialsFileError extends Error {
  readonly filePath: string;
  readonly detail: string;

  constructor(filePath: string, detail: string, options?: { cause?: unknown }) {
    super(`credentials_file_invalid:${filePath}:${detail}`, options);
    this.name = "CredentialsFileError";
    this.filePath = filePath;
    this.detail = detail;
  }
}

/**
 * The credentials file is user-writable and outlives any single version of the
 * CLI, so its contents are untrusted input: validate before handing it to
 * callers that will read tokens off it.
 */
function parseCredentialsFile(filePath: string, raw: string): CredentialsFile {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new CredentialsFileError(filePath, "not valid JSON", {
      cause: error,
    });
  }

  if (!Value.Check(CredentialsFileSchema, parsed)) {
    // `path` is a JSON pointer, empty at the root. Keep it only when it points
    // somewhere: on its own it reads as punctuation, not as a reason.
    const at = Value.Errors(CredentialsFileSchema, parsed).First()?.path;

    throw new CredentialsFileError(
      filePath,
      at ? `unexpected contents at ${at}` : "unexpected contents",
    );
  }

  return parsed;
}

async function readFileMap(filePath: string): Promise<CredentialsFile> {
  let raw: string;

  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }

    throw error;
  }

  return parseCredentialsFile(filePath, raw);
}

/**
 * Writes via a fresh temp file and an atomic rename. `writeFile`'s `mode` only
 * applies when it *creates* a file, so writing in place would put a new refresh
 * token into an existing world-readable file and only tighten it afterwards.
 * The temp file is created 0600, so the token is never on disk unprotected, and
 * the rename means a crash mid-write leaves the old file rather than a
 * truncated one.
 */
async function writeFileMap(
  filePath: string,
  map: CredentialsFile,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });

  // Same directory, so the rename stays on one filesystem and is atomic.
  const tempPath = `${filePath}.${process.pid}.tmp`;

  try {
    await writeFile(tempPath, `${JSON.stringify(map, null, 2)}\n`, {
      mode: 0o600,
    });
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true });

    throw error;
  }
}

export function createFileTokenStore(options: {
  filePath: string;
}): TokenStore {
  const { filePath } = options;

  return {
    async read(apiBaseUrl) {
      const map = await readFileMap(filePath);

      return map[apiBaseUrl];
    },

    async write(credentials) {
      const map = await readFileMap(filePath);
      map[credentials.apiBaseUrl] = credentials;

      await writeFileMap(filePath, map);
    },

    async remove(apiBaseUrl) {
      const map = await readFileMap(filePath);
      const removed = map[apiBaseUrl];

      if (!removed) {
        return undefined;
      }

      delete map[apiBaseUrl];
      await writeFileMap(filePath, map);

      return removed;
    },
  };
}
