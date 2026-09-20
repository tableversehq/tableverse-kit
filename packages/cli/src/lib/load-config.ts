import type { AnyGameDefinition } from "@tableverse-kit/engine";
import type { PublishConfig } from "@tableverse-kit/config";
import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_CONFIG_NAME = "tableverse.config.ts";

interface LoadConfigOptions {
  cwd: string;
}

interface RuntimeCliConfig {
  game: AnyGameDefinition;
  outDir?: string;
  publish?: PublishConfig;
}

export interface LoadedCliConfig {
  game: AnyGameDefinition;
  outDir?: string;
  publish?: PublishConfig;
  configFilePath: string;
  configDirectory: string;
}

export async function loadConfig(
  options: LoadConfigOptions,
): Promise<LoadedCliConfig> {
  const configFilePath = await findConfigFile(options.cwd);
  const module = (await import(pathToFileURL(configFilePath).href)) as {
    default?: unknown;
  };
  const config = module.default;

  if (!isCliConfig(config)) {
    throw new Error("invalid_cli_config");
  }

  return {
    game: config.game,
    outDir: config.outDir,
    publish: config.publish
      ? {
          engine: normalizeRelativePath(config.publish.engine),
          frontend: normalizeRelativePath(config.publish.frontend),
        }
      : undefined,
    configFilePath,
    configDirectory: dirname(configFilePath),
  };
}

async function findConfigFile(startDirectory: string): Promise<string> {
  let directory = resolve(startDirectory);

  while (true) {
    const candidate = resolve(directory, DEFAULT_CONFIG_NAME);
    try {
      await access(candidate);
      return candidate;
    } catch {
      const parent = dirname(directory);
      if (parent === directory) {
        throw new Error(`tableverse_config_not_found:${startDirectory}`);
      }
      directory = parent;
    }
  }
}

function isCliConfig(value: unknown): value is RuntimeCliConfig {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (!("game" in value) || !isGameDefinition(value.game)) {
    return false;
  }

  if (
    "outDir" in value &&
    value.outDir !== undefined &&
    typeof value.outDir !== "string"
  ) {
    return false;
  }

  return (
    !("publish" in value) ||
    value.publish === undefined ||
    isPublishConfig(value.publish)
  );
}

function isPublishConfig(value: unknown): value is PublishConfig {
  return (
    !!value &&
    typeof value === "object" &&
    "engine" in value &&
    isContainedRelativePath(value.engine) &&
    "frontend" in value &&
    isContainedRelativePath(value.frontend)
  );
}

function isContainedRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return false;
  }

  const path = value.trim().replace(/\\/g, "/");
  if (path.startsWith("/") || /^[a-zA-Z]:/.test(path)) {
    return false;
  }

  let depth = 0;
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      depth -= 1;
      if (depth < 0) {
        return false;
      }
    } else {
      depth += 1;
    }
  }

  return true;
}

function normalizeRelativePath(path: string): string {
  return path.trim().replace(/\\/g, "/");
}

function isGameDefinition(value: unknown): value is AnyGameDefinition {
  if (!value || typeof value !== "object") {
    return false;
  }

  return (
    "name" in value &&
    "commands" in value &&
    "canonicalGameStateSchema" in value &&
    "runtimeStateSchema" in value
  );
}
