import { readFile } from "node:fs/promises";
import { assertSchemaValue } from "@tableverse-kit/engine";
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
    const messages = [`validated game:${context.game.name}`];

    if (parsed.snapshotPath) {
      const snapshot = JSON.parse(
        await readFile(parsed.snapshotPath, "utf8"),
      ) as {
        game: unknown;
        runtime: unknown;
      };

      assertSchemaValue(context.game.canonicalGameStateSchema, snapshot.game);
      assertSchemaValue(context.game.runtimeStateSchema, snapshot.runtime);
      messages.push(`validated snapshot:${parsed.snapshotPath}`);
    }

    return success(messages.join("\n"));
  } catch (error) {
    return failure(
      error instanceof Error ? error.message : "validate_command_failed",
    );
  }
}
