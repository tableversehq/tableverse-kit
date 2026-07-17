import { chmod, mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CredentialsFileError,
  createFileTokenStore,
  type StoredCredentials,
} from "../../src/lib/auth/token-store.ts";
import { resolveCredentialsPath } from "../../src/lib/auth/paths.ts";

function credentials(apiBaseUrl: string): StoredCredentials {
  return {
    apiBaseUrl,
    accessToken: `access-${apiBaseUrl}`,
    refreshToken: `refresh-${apiBaseUrl}`,
    expiresAt: "2026-07-12T18:30:00.000Z",
    account: { id: "u1", email: "user@example.com" },
  };
}

async function tempFilePath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tvk-token-store-"));

  return join(dir, "nested", "credentials.json");
}

async function fileContaining(content: string): Promise<string> {
  const filePath = await tempFilePath();
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content);

  return filePath;
}

describe("file token store", () => {
  it("returns undefined when no credentials are stored", async () => {
    const store = createFileTokenStore({ filePath: await tempFilePath() });

    expect(await store.read("https://api-dev.tableverse.io")).toBeUndefined();
  });

  it("writes then reads credentials, keyed by apiBaseUrl", async () => {
    const store = createFileTokenStore({ filePath: await tempFilePath() });
    const dev = credentials("https://api-dev.tableverse.io");
    const prod = credentials("https://api.tableverse.io");

    await store.write(dev);
    await store.write(prod);

    expect(await store.read(dev.apiBaseUrl)).toEqual(dev);
    expect(await store.read(prod.apiBaseUrl)).toEqual(prod);
  });

  it("removes an entry and hands back what it removed", async () => {
    const store = createFileTokenStore({ filePath: await tempFilePath() });
    const dev = credentials("https://api-dev.tableverse.io");
    await store.write(dev);

    // The removed entry comes back so a caller can revoke its refresh token
    // without reading the file a second time.
    expect(await store.remove(dev.apiBaseUrl)).toEqual(dev);
    expect(await store.read(dev.apiBaseUrl)).toBeUndefined();
    expect(await store.remove(dev.apiBaseUrl)).toBeUndefined();
  });

  it("leaves other environments alone when removing one", async () => {
    const store = createFileTokenStore({ filePath: await tempFilePath() });
    const dev = credentials("https://api-dev.tableverse.io");
    const prod = credentials("https://api.tableverse.io");
    await store.write(dev);
    await store.write(prod);

    await store.remove(dev.apiBaseUrl);

    expect(await store.read(prod.apiBaseUrl)).toEqual(prod);
  });

  // `/me` may legitimately return a null email (OAuth provider withheld it).
  // Rejecting it here is what strands the user: `login` writes the file, then
  // every command that reads it says "corrupt, delete it and run tvk login" —
  // advice that loops straight back to writing the same file.
  it("round-trips an account with no email", async () => {
    const store = createFileTokenStore({ filePath: await tempFilePath() });
    const entry = {
      ...credentials("https://api-dev.tableverse.io"),
      account: { id: "u_01HX3P9K2M", email: null },
    };

    await store.write(entry);

    expect(await store.read(entry.apiBaseUrl)).toEqual(entry);
  });

  it("rejects a credentials file that is not valid JSON", async () => {
    const store = createFileTokenStore({
      filePath: await fileContaining(
        '{"https://api-dev.tableverse.io": {"acce',
      ),
    });

    await expect(store.read("https://api-dev.tableverse.io")).rejects.toThrow(
      CredentialsFileError,
    );
  });

  it("rejects a credentials file holding a JSON array", async () => {
    const store = createFileTokenStore({
      filePath: await fileContaining("[]"),
    });

    await expect(store.read("https://api-dev.tableverse.io")).rejects.toThrow(
      CredentialsFileError,
    );
  });

  it("rejects an entry that is missing required fields", async () => {
    const store = createFileTokenStore({
      filePath: await fileContaining(
        JSON.stringify({
          "https://api-dev.tableverse.io": { accessToken: "only-this-one" },
        }),
      ),
    });

    await expect(store.read("https://api-dev.tableverse.io")).rejects.toThrow(
      CredentialsFileError,
    );
  });

  it("names the offending file on the error", async () => {
    const filePath = await fileContaining("[]");
    const store = createFileTokenStore({ filePath });

    await expect(
      store.read("https://api-dev.tableverse.io"),
    ).rejects.toMatchObject({ filePath });
  });

  it("writes the credentials file with 0600 permissions", async () => {
    const filePath = await tempFilePath();
    const store = createFileTokenStore({ filePath });
    await store.write(credentials("https://api-dev.tableverse.io"));

    const mode = (await stat(filePath)).mode & 0o777;

    expect(mode).toBe(0o600);
  });

  it("tightens the permissions of a credentials file that already exists", async () => {
    const filePath = await fileContaining("{}");
    await chmod(filePath, 0o644);
    const store = createFileTokenStore({ filePath });

    await store.write(credentials("https://api-dev.tableverse.io"));

    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
  });

  it("tightens the permissions when rewriting the file on remove", async () => {
    const dev = credentials("https://api-dev.tableverse.io");
    const prod = credentials("https://api.tableverse.io");
    const filePath = await fileContaining(
      JSON.stringify({ [dev.apiBaseUrl]: dev, [prod.apiBaseUrl]: prod }),
    );
    await chmod(filePath, 0o644);
    const store = createFileTokenStore({ filePath });

    await store.remove(dev.apiBaseUrl);

    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
  });
});

describe("resolveCredentialsPath", () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  it("honors XDG_CONFIG_HOME on posix", () => {
    const path = resolveCredentialsPath({ XDG_CONFIG_HOME: "/xdg" }, "linux");

    expect(path).toBe("/xdg/tableverse/credentials.json");
  });

  it("uses APPDATA on win32", () => {
    const path = resolveCredentialsPath(
      { APPDATA: "C:\\Users\\me\\AppData\\Roaming" },
      "win32",
    );

    expect(path).toContain("tableverse");
    expect(path).toContain("credentials.json");
  });
});
