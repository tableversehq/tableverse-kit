import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { UploadContext } from "../lib/upload/context.ts";
import type { GameResponse } from "../lib/api/games.ts";
import { loadSession } from "../lib/auth/session.ts";
import {
  resolveGameLink,
  writeGameLink,
  type ResolvedGameLink,
} from "../lib/link/game-link.ts";
import { hasPackageLock } from "../lib/packaging/lockfile.ts";
import { packSource } from "../lib/packaging/tarball.ts";
import { buildDeploymentUrl } from "../lib/upload/deployment-url.ts";
import {
  EscapingBuildOutputError,
  InaccessibleGameError,
  MissingLockfileError,
  MissingProjectManifestError,
  MissingSourceRootError,
  describeUploadError,
  type SourceLabel,
} from "../lib/upload/errors.ts";
import { PlatformRequestError } from "../lib/platform-client.ts";
import { FRONTEND_BUILD_COMMAND } from "../lib/frontend/commands.ts";
import { failure, success, type RunResult } from "../lib/command-result.ts";
import { createUploadHelpText } from "../lib/help-text.ts";
import { isHelpFlag, rejectCommandArguments } from "../lib/parse-args.ts";
import type { PublishConfig } from "@tableverse-kit/config";
import { serializeSetupSchema } from "@tableverse-kit/engine";

const LOGGED_OUT_MESSAGE = "Not logged in. Run `tvk login`.";
const EXPIRED_MESSAGE = "Session expired. Run `tvk login`.";

async function directoryExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function resolveSourceRoot(
  label: SourceLabel,
  root: string,
  configDirectory: string,
): Promise<string> {
  const absolute = resolve(configDirectory, root);

  if (!(await directoryExists(absolute))) {
    throw new MissingSourceRootError(label, absolute);
  }

  return absolute;
}

async function resolveLinkedGame(
  ctx: UploadContext,
  accessToken: string,
  link: ResolvedGameLink,
): Promise<GameResponse> {
  try {
    return await ctx.client.getGame({ accessToken, gameId: link.gameId });
  } catch (error) {
    if (
      error instanceof PlatformRequestError &&
      (error.status === 403 || error.status === 404)
    ) {
      throw new InaccessibleGameError(link.gameId, link.source);
    }
    throw error;
  }
}

async function establishFirstRunLink(
  ctx: UploadContext,
  accessToken: string,
  defaultName: string,
  projectRoot: string,
): Promise<GameResponse> {
  const { games } = await ctx.client.listGames({ accessToken });
  const decision = await ctx.linkPrompt({ games, defaultName });

  let game: GameResponse;
  if (decision.action === "create") {
    game = await ctx.client.createGame({ accessToken, name: decision.name });
  } else {
    game =
      games.find((candidate) => candidate.id === decision.gameId) ??
      (await ctx.client.getGame({ accessToken, gameId: decision.gameId }));
  }

  try {
    await writeGameLink({ projectRoot, gameId: game.id });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      decision.action === "create"
        ? `Created game ${game.name} (${game.id}), but saving the link failed: ${detail}\n` +
            `Set TABLEVERSE_GAME_ID=${game.id} before re-running \`tvk upload\`, or a retry will create a duplicate game.`
        : `Could not save the project link: ${detail}\n` +
            `Set TABLEVERSE_GAME_ID=${game.id}, or fix the directory and re-run \`tvk upload\`.`,
    );
  }
  ctx.emit(
    decision.action === "create"
      ? `Created game ${game.name} (${game.id}) and linked this directory.`
      : `Linked this directory to ${game.name} (${game.id}).`,
  );
  return game;
}

export async function runUploadCommand(
  args: string[],
  ctx: UploadContext,
): Promise<RunResult> {
  if (isHelpFlag(args[0])) {
    return success(createUploadHelpText());
  }

  try {
    rejectCommandArguments(args);
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }

  let tempDir: string | undefined;
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
    const { accessToken } = session;

    const config = await ctx.loadConfig({ cwd: ctx.cwd });
    const publish: PublishConfig | undefined = config.publish;
    if (!publish) {
      return failure(
        "This project has no `publish` config. Add a `publish` block to tableverse.config.ts before uploading.",
      );
    }

    const projectRoot = config.configDirectory;
    await resolveSourceRoot("engine", publish.engine, projectRoot);
    await resolveSourceRoot("frontend", publish.frontend, projectRoot);
    if (!(await fileExists(join(projectRoot, "package.json")))) {
      throw new MissingProjectManifestError(projectRoot);
    }
    if (!(await hasPackageLock(projectRoot))) {
      throw new MissingLockfileError(projectRoot);
    }
    const frontendRoot = resolve(projectRoot, publish.frontend);
    const toolchain = await ctx.resolveToolchain(frontendRoot);
    if (!isInside(projectRoot, toolchain.outDir)) {
      throw new EscapingBuildOutputError(projectRoot, toolchain.outDir);
    }

    const link = await resolveGameLink({ projectRoot, env: ctx.env });
    let game: GameResponse;
    if (link) {
      game = await resolveLinkedGame(ctx, accessToken, link);
    } else if (!ctx.interactive) {
      return failure(
        [
          "This project is not linked to a game, and there is no terminal to choose one.",
          "Set TABLEVERSE_GAME_ID to publish to a specific game.",
        ].join("\n"),
      );
    } else {
      game = await establishFirstRunLink(
        ctx,
        accessToken,
        config.game.name,
        projectRoot,
      );
    }

    ctx.emit(`Publishing to ${game.name} (${game.id})`);

    tempDir = await mkdtemp(join(tmpdir(), "tvk-upload-"));
    ctx.emit("Packaging source…");
    const frontendOutDir = relative(projectRoot, toolchain.outDir);
    const projectSource = await packSource({
      root: projectRoot,
      outFile: join(tempDir, "project-source.tar.gz"),
      excludeDirs: [frontendOutDir],
    });

    if (projectSource.droppedFiles.length > 0) {
      ctx.emit(
        `Skipped local env files: ${projectSource.droppedFiles.join(", ")}`,
      );
    }

    const version = await ctx.client.createVersion({
      accessToken,
      gameId: game.id,
      projectSourceSha256: projectSource.sha256,
      projectSourceSizeBytes: projectSource.sizeBytes,
      buildConfig: {
        engine: { root: publish.engine },
        frontend: {
          root: publish.frontend,
          buildCommand: FRONTEND_BUILD_COMMAND,
          outDir: relative(frontendRoot, toolchain.outDir),
        },
      },
      metadata: {
        setupInputSchema: serializeSetupSchema(config.game.setupInputSchema),
        minPlayers: config.game.playerBounds.min,
        maxPlayers: config.game.playerBounds.max,
      },
    });

    ctx.emit("Uploading source…");
    await ctx.client.uploadArtifact({
      target: version.putUrls.projectSource,
      body: await readFile(projectSource.path),
    });

    const { buildId } = await ctx.client.startBuild({
      accessToken,
      versionId: version.versionId,
    });

    const dashboardUrl = buildDeploymentUrl({
      webBaseUrl: ctx.config.webBaseUrl,
      gameId: game.id,
      buildId,
      versionNumber: version.versionNumber,
    });
    if (ctx.interactive) {
      ctx.emit(
        "Build started — opening the deployment dashboard in your browser…",
      );
      await ctx.openBrowser(dashboardUrl).catch(() => {});
    }

    return success(
      [
        `Build started for ${game.name} v${version.versionNumber}. Track it at:`,
        `  ${dashboardUrl}`,
      ].join("\n"),
    );
  } catch (error) {
    return failure(describeUploadError(error, ctx.config));
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

function isInside(root: string, candidate: string): boolean {
  const step = relative(root, candidate);
  return step !== "" && !step.startsWith("..") && !isAbsolute(step);
}
