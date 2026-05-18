import { success, type RunResult } from "../lib/command-result.ts";
import {
  describeGameForGeneration,
  toJsonSchema,
} from "../lib/game-descriptor.ts";
import { createGenerationContext } from "../lib/generation-context.ts";
import { parseCommandArguments } from "../lib/parse-args.ts";
import { renderTypeDeclaration } from "../lib/render-typescript.ts";
import { writeOutputFile } from "../lib/write-output.ts";

interface GenerateTypesOptions {
  cwd: string;
}

export async function runGenerateTypesCommand(
  args: string[],
  options: GenerateTypesOptions,
): Promise<RunResult> {
  const parsed = parseCommandArguments(args);
  const context = await createGenerationContext(parsed, {
    cwd: options.cwd,
  });
  const descriptor = describeGameForGeneration(context.game);
  const canonicalOutputPath = `${context.outputDirectory}/canonical-state.generated.d.ts`;
  const visibleOutputPath = `${context.outputDirectory}/visible-state.generated.d.ts`;
  const canonicalSchema = {
    type: "object",
    properties: {
      game: toJsonSchema(context.game.canonicalGameStateSchema),
      runtime: toJsonSchema(context.game.runtimeStateSchema),
    },
    required: ["game", "runtime"],
  } as const;

  await writeOutputFile(
    canonicalOutputPath,
    renderTypeDeclaration("CanonicalState", canonicalSchema),
  );
  await writeOutputFile(
    visibleOutputPath,
    renderTypeDeclaration("VisibleState", descriptor.viewSchema),
  );

  return success(`generated types:${context.outputDirectory}`);
}
