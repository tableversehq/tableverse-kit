import { failure, success, type RunResult } from "../lib/command-result.ts";
import { createValidateHelpText } from "../lib/help-text.ts";
import { createGenerationContext } from "../lib/generation-context.ts";
import { isHelpFlag, parseCommandArguments } from "../lib/parse-args.ts";

interface ValidateCommandOptions {
  cwd: string;
}

export async function runValidateCommand(
  args: string[],
  options: ValidateCommandOptions,
): Promise<RunResult> {
  const [firstArg] = args;

  if (isHelpFlag(firstArg)) {
    return success(createValidateHelpText());
  }

  try {
    const parsed = parseCommandArguments(args);
    const context = await createGenerationContext(parsed, {
      cwd: options.cwd,
    });

    return success(`validated game:${context.game.name}`);
  } catch (error) {
    return failure(
      error instanceof Error ? error.message : "validate_command_failed",
    );
  }
}
