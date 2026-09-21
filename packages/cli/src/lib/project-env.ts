import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const CONFIG_NAME = "tableverse.config.ts";
const ENV_NAME = ".env";

/**
 * Values set in the environment win over the file, so a one-off
 * `TABLEVERSE_API_URL=… tvk upload` still overrides a project's `.env`.
 */
export function loadProjectEnv(cwd: string): void {
  const envFile = findProjectEnvFile(cwd);
  if (envFile) {
    process.loadEnvFile(envFile);
  }
}

export function findProjectEnvFile(cwd: string): string | null {
  let directory = resolve(cwd);

  for (;;) {
    if (existsSync(resolve(directory, CONFIG_NAME))) {
      const envFile = resolve(directory, ENV_NAME);
      return existsSync(envFile) ? envFile : null;
    }

    const parent = dirname(directory);
    if (parent === directory) {
      return null;
    }
    directory = parent;
  }
}
