import type { AnyGameDefinition } from "@tabletop-kit/engine";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
interface LoadConfigOptions {
  cwd: string;
  configPath?: string;
}

interface RuntimeCliConfig {
  game: AnyGameDefinition;
  outDir?: string;
}

export interface LoadedCliConfig {
  game: AnyGameDefinition;
  outDir?: string;
  configFilePath: string;
  configDirectory: string;
}

export async function loadConfig(
  options: LoadConfigOptions,
): Promise<LoadedCliConfig> {
  const configFilePath = options.configPath
    ? resolve(options.cwd, options.configPath)
    : resolve(options.cwd, "tabletop.config.ts");
  const module = (await import(pathToFileURL(configFilePath).href)) as {
    default?: unknown;
  };
  const config = module.default;

  if (!isCliConfig(config)) {
    throw new Error("invalid_cli_config");
  }

  return {
    ...config,
    configFilePath,
    configDirectory: dirname(configFilePath),
  };
}

function isCliConfig(value: unknown): value is RuntimeCliConfig {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (!("game" in value) || !isGameDefinition(value.game)) {
    return false;
  }

  return (
    !("outDir" in value) ||
    value.outDir === undefined ||
    typeof value.outDir === "string"
  );
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
