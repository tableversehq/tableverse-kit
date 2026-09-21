#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { runDevCommand } from "./commands/dev.ts";
import { createAuthContext } from "./lib/auth/context.ts";
import { runLoginCommand } from "./commands/login.ts";
import { runLogoutCommand } from "./commands/logout.ts";
import { runUploadCommand } from "./commands/upload.ts";
import { runValidateCommand } from "./commands/validate.ts";
import { runWhoamiCommand } from "./commands/whoami.ts";
import { createUploadContext } from "./lib/upload/context.ts";
import { failure, success, type RunResult } from "./lib/command-result.ts";
import { createRootHelpText } from "./lib/help-text.ts";
import { isHelpFlag } from "./lib/parse-args.ts";
import { loadProjectEnv } from "./lib/project-env.ts";

interface RunOptions {
  cwd?: string;
}

export async function run(
  argv: string[],
  options: RunOptions = {},
): Promise<RunResult> {
  const [command, ...args] = argv;

  if (!command || isHelpFlag(command)) {
    return success(createRootHelpText());
  }

  if (command === "validate") {
    return runValidateCommand(args, {
      cwd: options.cwd ?? process.cwd(),
    });
  }

  if (command === "dev") {
    return runDevCommand(args, {
      cwd: options.cwd ?? process.cwd(),
    });
  }

  if (command === "login") {
    return runLoginCommand(args, createAuthContext());
  }

  if (command === "logout") {
    return runLogoutCommand(args, createAuthContext());
  }

  if (command === "whoami") {
    return runWhoamiCommand(args, createAuthContext());
  }

  if (command === "upload") {
    return runUploadCommand(args, createUploadContext());
  }

  return failure(`unknown_command:${command}`);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadProjectEnv(process.cwd());
  const result = await run(argv);

  if (result.stdout) {
    console.log(result.stdout);
  }

  if (result.stderr) {
    console.error(result.stderr);
  }

  process.exitCode = result.exitCode;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
