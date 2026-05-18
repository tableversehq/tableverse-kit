import { success, type RunResult } from "../lib/command-result.ts";
import { describeGameForGeneration } from "../lib/game-descriptor.ts";
import { createGenerationContext } from "../lib/generation-context.ts";
import { parseCommandArguments } from "../lib/parse-args.ts";
import { writeOutputFile } from "../lib/write-output.ts";

interface GenerateSchemasOptions {
  cwd: string;
}

export async function runGenerateSchemasCommand(
  args: string[],
  options: GenerateSchemasOptions,
): Promise<RunResult> {
  const parsed = parseCommandArguments(args);
  const context = await createGenerationContext(parsed, {
    cwd: options.cwd,
  });
  const descriptor = describeGameForGeneration(context.game);
  const outputPath = `${context.outputDirectory}/schemas.generated.json`;

  const generated = {
    canonicalState: {
      type: "object",
      properties: {
        game: context.game.canonicalGameStateSchema.schema,
        runtime: context.game.runtimeStateSchema,
      },
      required: ["game", "runtime"],
      additionalProperties: false,
    },
    visibleState: descriptor.viewSchema,
    commands: Object.fromEntries(
      Object.entries(descriptor.commands).map(([commandId, command]) => [
        commandId,
        command.commandSchema.schema,
      ]),
    ),
    discoveries: Object.fromEntries(
      Object.entries(descriptor.commands)
        .filter(([, command]) => command.discovery)
        .map(([commandId, command]) => [
          commandId,
          {
            startStep: command.discovery!.startStep,
            steps: command.discovery!.steps.map((step) => ({
              stepId: step.stepId,
              input: step.inputSchema.schema,
              output: step.outputSchema.schema,
            })),
          },
        ]),
    ),
  };

  await writeOutputFile(outputPath, JSON.stringify(generated, null, 2));

  return success(`generated schemas:${outputPath}`);
}
