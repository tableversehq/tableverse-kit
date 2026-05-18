import { failure, success, type RunResult } from "../lib/command-result.ts";
import { createGenerateHelpText } from "../lib/help-text.ts";
import { isHelpFlag } from "../lib/parse-args.ts";
import { runGenerateClientSdkCommand } from "./generate-client-sdk.ts";
import { runGenerateSchemasCommand } from "./generate-schemas.ts";
import { runGenerateTypesCommand } from "./generate-types.ts";

interface GenerateCommandOptions {
  cwd: string;
}

export async function runGenerateCommand(
  args: string[],
  options: GenerateCommandOptions,
): Promise<RunResult> {
  const [target] = args;

  if (!target || isHelpFlag(target)) {
    return success(createGenerateHelpText());
  }

  try {
    if (target === "schemas") {
      return await runGenerateSchemasCommand(args.slice(1), options);
    }

    if (target === "types") {
      return await runGenerateTypesCommand(args.slice(1), options);
    }

    if (target === "client-sdk") {
      return await runGenerateClientSdkCommand(args.slice(1), options);
    }
  } catch (error) {
    return failure(
      error instanceof Error ? error.message : "generate_command_failed",
    );
  }

  return failure(`unknown_generate_target:${target}`);
}
