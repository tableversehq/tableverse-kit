import { resolve } from "node:path";
import type { AnyGameDefinition } from "@tableverse-kit/engine";
import { loadConfig } from "./load-config.ts";
import type { ParsedCommandArguments } from "./parse-args.ts";

export interface GenerationContext {
  game: AnyGameDefinition;
  configFilePath: string;
  outputDirectory: string;
}

interface CreateGenerationContextOptions {
  cwd: string;
}

export async function createGenerationContext(
  args: ParsedCommandArguments,
  options: CreateGenerationContextOptions,
): Promise<GenerationContext> {
  const config = await loadConfig({
    cwd: options.cwd,
    configPath: args.configPath,
  });

  return {
    game: config.game,
    configFilePath: config.configFilePath,
    outputDirectory: args.outDir
      ? resolve(options.cwd, args.outDir)
      : config.outDir
        ? resolve(config.configDirectory, config.outDir)
        : resolve(config.configDirectory, "generated"),
  };
}
