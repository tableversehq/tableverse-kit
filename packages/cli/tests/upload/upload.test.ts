import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import createFixtureGame from "../fixtures/game-default.ts";
import { runUploadCommand } from "../../src/commands/upload.ts";
import type { UploadContext } from "../../src/lib/upload/context.ts";
import type { LoadedCliConfig } from "../../src/lib/load-config.ts";
import type { PresignedUpload } from "../../src/lib/api/versions.ts";
import type { CreateVersionInput } from "../../src/lib/platform-client.ts";
import { PlatformRequestError } from "../../src/lib/platform-client.ts";
import {
  FIXED_NOW,
  TEST_CONFIG,
  createFakeClient,
  createMemoryTokenStore,
  storedCredentials,
} from "../auth/fakes.ts";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true })));
});

async function setupProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tvk-upload-proj-"));
  dirs.push(root);

  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ private: true, workspaces: ["engine", "web"] }),
  );
  await writeFile(join(root, "package-lock.json"), "{}");
  for (const pkg of ["engine", "web"]) {
    await mkdir(join(root, pkg), { recursive: true });
    await writeFile(join(root, pkg, "package.json"), "{}");
    await writeFile(join(root, pkg, "index.ts"), `export const ${pkg} = 1;`);
  }
  return root;
}

function loadedConfig(root: string, withPublish = true): LoadedCliConfig {
  return {
    game: createFixtureGame(),
    publish: withPublish
      ? {
          engine: { root: "engine" },
          frontend: {
            root: "web",
            buildCommand: "npm run build",
            outDir: "dist",
          },
        }
      : undefined,
    configFilePath: join(root, "tableverse.config.ts"),
    configDirectory: root,
  };
}

function game() {
  return {
    id: "game-123",
    name: "Slaylike",
    urlName: null,
    currentVersionNumber: null,
    createdAt: "t",
    updatedAt: "t",
  };
}

function target(name: string): PresignedUpload {
  return {
    url: `https://sink.example/${name}`,
    headers: { "x-amz-checksum-sha256": "z" },
  };
}

interface Harness {
  ctx: UploadContext;
  emitted: string[];
  uploads: { url: string; size: number }[];
  opened: string[];
  versionInput: () => CreateVersionInput | undefined;
}

function harness(
  root: string,
  overrides: {
    context?: Partial<UploadContext>;
    client?: Parameters<typeof createFakeClient>[0];
  } = {},
): Harness {
  const emitted: string[] = [];
  const uploads: { url: string; size: number }[] = [];
  const opened: string[] = [];
  let versionInput: CreateVersionInput | undefined;

  const client = createFakeClient({
    getGame: async () => game(),
    createVersion: async (input) => {
      versionInput = input;
      return {
        versionId: "v1",
        versionNumber: 4,
        putUrls: {
          projectSource: target("project"),
        },
        expiresAt: "t",
      };
    },
    uploadArtifact: async ({ target: t, body }) => {
      uploads.push({ url: t.url, size: body.length });
    },
    startBuild: async () => ({ buildId: "b1" }),
    ...overrides.client,
  });

  const ctx: UploadContext = {
    config: TEST_CONFIG,
    tokenStore: createMemoryTokenStore([storedCredentials()]),
    client,
    now: () => FIXED_NOW,
    cwd: root,
    env: { TABLEVERSE_GAME_ID: "game-123" },
    loadConfig: async () => loadedConfig(root),
    interactive: true,
    linkPrompt: async () => {
      throw new Error("linkPrompt_not_stubbed");
    },
    openBrowser: async (url) => {
      opened.push(url);
    },
    emit: (line) => emitted.push(line),
    ...overrides.context,
  };

  return { ctx, emitted, uploads, opened, versionInput: () => versionInput };
}

describe("tvk upload", () => {
  it("packages and uploads the project source with its build config", async () => {
    const root = await setupProject();
    const h = harness(root);

    const result = await runUploadCommand([], h.ctx);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "https://dev.example.test/studio/games/game-123/deployments/b1?v=4",
    );

    expect(h.uploads).toHaveLength(1);

    const input = h.versionInput()!;
    expect(input.gameId).toBe("game-123");
    expect(input.projectSourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(input.buildConfig).toEqual({
      engine: { root: "engine" },
      frontend: {
        root: "web",
        buildCommand: "npm run build",
        outDir: "dist",
      },
    });
    expect(input.metadata).toEqual({
      setupInputSchema: null,
      minPlayers: 2,
      maxPlayers: 5,
    });
    expect(h.uploads[0]).toEqual({
      url: "https://sink.example/project",
      size: input.projectSourceSizeBytes,
    });
  });

  it("shows the resolved target before packaging", async () => {
    const root = await setupProject();
    const h = harness(root);

    await runUploadCommand([], h.ctx);

    expect(h.emitted[0]).toBe("Publishing to Slaylike (game-123)");
  });

  it("opens the deployment dashboard and exits once the build starts", async () => {
    const root = await setupProject();
    const h = harness(root);

    const result = await runUploadCommand([], h.ctx);

    const dashboardUrl =
      "https://dev.example.test/studio/games/game-123/deployments/b1?v=4";
    expect(result.exitCode).toBe(0);
    expect(h.opened).toEqual([dashboardUrl]);
    expect(result.stdout).toContain(dashboardUrl);
  });

  it("prints the dashboard URL without opening a browser when non-interactive", async () => {
    const root = await setupProject();
    const h = harness(root, {
      context: { interactive: false },
    });

    const result = await runUploadCommand([], h.ctx);

    expect(result.exitCode).toBe(0);
    expect(h.opened).toEqual([]);
    expect(result.stdout).toContain(
      "https://dev.example.test/studio/games/game-123/deployments/b1?v=4",
    );
    expect(h.emitted).not.toContain(
      "Build started — opening the deployment dashboard in your browser…",
    );
  });

  it("still succeeds when the browser cannot be opened", async () => {
    const root = await setupProject();
    const h = harness(root, {
      context: {
        openBrowser: async () => {
          throw new Error("no display");
        },
      },
    });

    const result = await runUploadCommand([], h.ctx);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "https://dev.example.test/studio/games/game-123/deployments/b1?v=4",
    );
  });

  it("refuses to auto-create when unlinked and non-interactive", async () => {
    const root = await setupProject();
    const created: string[] = [];
    const h = harness(root, {
      context: { env: {}, interactive: false },
      client: {
        listGames: async () => ({ games: [] }),
        createGame: async ({ name }) => {
          created.push(name);
          return { ...game(), name };
        },
      },
    });

    const result = await runUploadCommand([], h.ctx);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("TABLEVERSE_GAME_ID");
    expect(created).toHaveLength(0);
    expect(h.uploads).toHaveLength(0);
  });

  it("creates a game on first run when the developer chooses to", async () => {
    const root = await setupProject();
    const created: string[] = [];
    const h = harness(root, {
      context: {
        env: {},
        interactive: true,
        linkPrompt: async () => ({ action: "create", name: "Splendor" }),
      },
      client: {
        listGames: async () => ({ games: [] }),
        createGame: async ({ name }) => {
          created.push(name);
          return { ...game(), id: "new-game", name };
        },
        getGame: async () => ({ ...game(), id: "new-game", name: "Splendor" }),
      },
    });

    const result = await runUploadCommand([], h.ctx);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "https://dev.example.test/studio/games/new-game/deployments/b1?v=4",
    );
    expect(created).toEqual(["Splendor"]);
    const link = JSON.parse(
      await readFile(join(root, ".tableverse", "game.json"), "utf8"),
    );
    expect(link).toEqual({ gameId: "new-game" });
    expect(h.versionInput()!.gameId).toBe("new-game");
  });

  it("binds to an existing game when the developer picks one", async () => {
    const root = await setupProject();
    const created: string[] = [];
    const existing = { ...game(), id: "old-game", name: "Older" };
    const h = harness(root, {
      context: {
        env: {},
        interactive: true,
        linkPrompt: async ({ games }) => ({
          action: "pick",
          gameId: games[0]!.id,
        }),
      },
      client: {
        listGames: async () => ({ games: [existing] }),
        createGame: async ({ name }) => {
          created.push(name);
          return { ...game(), name };
        },
      },
    });

    const result = await runUploadCommand([], h.ctx);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "https://dev.example.test/studio/games/old-game/deployments/b1?v=4",
    );
    expect(created).toHaveLength(0);
    const link = JSON.parse(
      await readFile(join(root, ".tableverse", "game.json"), "utf8"),
    );
    expect(link).toEqual({ gameId: "old-game" });
  });

  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  // Root bypasses directory permissions, so writeGameLink would not fail there.
  it.skipIf(isRoot)(
    "warns against a duplicate when saving the link fails after create",
    async () => {
      const root = await setupProject();
      const h = harness(root, {
        context: {
          env: {},
          interactive: true,
          linkPrompt: async () => ({ action: "create", name: "Fresh" }),
        },
        client: {
          listGames: async () => ({ games: [] }),
          createGame: async ({ name }) => ({ ...game(), id: "new-game", name }),
        },
      });

      // The project reads as unlinked before its read-only root rejects mkdir.
      await chmod(root, 0o500);
      const result = await runUploadCommand([], h.ctx);
      await chmod(root, 0o700);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("TABLEVERSE_GAME_ID=new-game");
      expect(result.stderr).toContain("duplicate game");
      expect(h.uploads).toHaveLength(0);
    },
  );

  it("fails when the project has no publish config", async () => {
    const root = await setupProject();
    const h = harness(root, {
      context: { loadConfig: async () => loadedConfig(root, false) },
    });

    const result = await runUploadCommand([], h.ctx);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("publish");
  });

  it("fails before any network call when the project root has no lockfile", async () => {
    const root = await setupProject();
    await rm(join(root, "package-lock.json"));
    const h = harness(root);

    const result = await runUploadCommand([], h.ctx);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("lockfile");
    expect(h.versionInput()).toBeUndefined();
  });

  it("fails before any network call when the project root has no package.json", async () => {
    const root = await setupProject();
    await rm(join(root, "package.json"));
    const h = harness(root);

    const result = await runUploadCommand([], h.ctx);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("package.json");
    expect(h.versionInput()).toBeUndefined();
  });

  it("refuses to publish a tree that carries credential material", async () => {
    const root = await setupProject();
    await writeFile(join(root, "engine", "server.pem"), "-----BEGIN KEY-----");
    const h = harness(root);

    const result = await runUploadCommand([], h.ctx);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("server.pem");
    expect(h.uploads).toHaveLength(0);
  });

  it("skips a local .env and publishes, naming what it skipped", async () => {
    const root = await setupProject();
    await writeFile(join(root, "engine", ".env"), "SECRET=1");
    const h = harness(root);

    const result = await runUploadCommand([], h.ctx);

    expect(result.exitCode).toBe(0);
    expect(h.uploads).toHaveLength(1);
    expect(h.emitted).toContain("Skipped local env files: engine/.env");
  });

  it("uses the config directory as the project root from a child directory", async () => {
    const root = await setupProject();
    const h = harness(root, {
      context: {
        cwd: join(root, "web"),
        env: {},
        interactive: true,
        linkPrompt: async () => ({ action: "create", name: "Nested" }),
      },
      client: {
        listGames: async () => ({ games: [] }),
        createGame: async ({ name }) => ({
          ...game(),
          id: "nested-game",
          name,
        }),
      },
    });

    const result = await runUploadCommand([], h.ctx);

    expect(result.exitCode).toBe(0);
    expect(
      JSON.parse(
        await readFile(join(root, ".tableverse", "game.json"), "utf8"),
      ),
    ).toEqual({ gameId: "nested-game" });
  });

  it("tells a file-linked project to delete game.json on a 403", async () => {
    const root = await setupProject();
    await mkdir(join(root, ".tableverse"), { recursive: true });
    await writeFile(
      join(root, ".tableverse", "game.json"),
      JSON.stringify({ gameId: "game-123" }),
    );
    const h = harness(root, {
      context: { env: {} },
      client: {
        getGame: async () => {
          throw new PlatformRequestError(403, "/games/game-123");
        },
      },
    });

    const result = await runUploadCommand([], h.ctx);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(".tableverse/game.json");
    expect(result.stderr).toContain("publish it as your own");
  });

  it("tells an env-linked project to fix TABLEVERSE_GAME_ID on a 403", async () => {
    const root = await setupProject();
    const h = harness(root, {
      context: { env: { TABLEVERSE_GAME_ID: "game-123" } },
      client: {
        getGame: async () => {
          throw new PlatformRequestError(403, "/games/game-123");
        },
      },
    });

    const result = await runUploadCommand([], h.ctx);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("TABLEVERSE_GAME_ID");
    expect(result.stderr).not.toContain(".tableverse/game.json");
  });

  it("reports a logged-out session without reaching the platform", async () => {
    const root = await setupProject();
    const h = harness(root, {
      context: { tokenStore: createMemoryTokenStore() },
    });

    const result = await runUploadCommand([], h.ctx);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("Not logged in. Run `tvk login`.");
  });

  it("prints help without doing anything", async () => {
    const root = await setupProject();
    const h = harness(root);

    const result = await runUploadCommand(["--help"], h.ctx);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("tvk upload");
    expect(h.uploads).toHaveLength(0);
  });
});
