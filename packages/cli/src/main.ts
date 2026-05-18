#!/usr/bin/env bun

import { runGenerateCommand } from "./commands/generate.ts";
import { runValidateCommand } from "./commands/validate.ts";
import { failure, success, type RunResult } from "./lib/command-result.ts";
import { createRootHelpText } from "./lib/help-text.ts";
import { isHelpFlag } from "./lib/parse-args.ts";

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

  if (command === "generate") {
    return runGenerateCommand(args, {
      cwd: options.cwd ?? process.cwd(),
    });
  }

  if (command === "validate") {
    return runValidateCommand(args, {
      cwd: options.cwd ?? process.cwd(),
    });
  }

  return failure(`unknown_command:${command}`);
}

if (import.meta.main) {
  const result = await run(process.argv.slice(2));

  if (result.stdout) {
    console.log(result.stdout);
  }

  if (result.stderr) {
    console.error(result.stderr);
  }

  process.exitCode = result.exitCode;
}
