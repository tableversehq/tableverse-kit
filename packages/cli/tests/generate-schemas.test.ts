import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { run } from "../src/main.ts";

const repoRoot = join(import.meta.dir, "..", "..", "..");

async function writeCliConfig(cwd: string): Promise<void> {
  const configFile = join(cwd, "tabletop.config.ts");
  const configSource = [
    `import { defineConfig } from ${JSON.stringify(
      pathToFileURL(
        join(repoRoot, "packages", "tabletop-engine", "src", "config.ts"),
      ).href,
    )};`,
    `import { t } from ${JSON.stringify(
      pathToFileURL(
        join(repoRoot, "packages", "tabletop-engine", "src", "index.ts"),
      ).href,
    )};`,
    "",
    "export default defineConfig({",
    "  game: {",
    '    name: "cli-fixture",',
    "    canonicalGameStateSchema: t.object({",
    "      score: t.number(),",
    "    }),",
    "    runtimeStateSchema: t.object({",
    "      phase: t.string(),",
    "    }),",
    "    commands: {",
    "      take_three_distinct_gems: {",
    '        commandId: "take_three_distinct_gems",',
    "        commandSchema: t.object({",
    "          colors: t.array(t.string()),",
    "        }),",
    "        discovery: {",
    '          startStep: "select_gems",',
    "          steps: [",
    "            {",
    '              stepId: "select_gems",',
    "              inputSchema: t.object({",
    "              }),",
    "              outputSchema: t.object({",
    "                label: t.string(),",
    "                amount: t.number(),",
    "              }),",
    "              resolve: () => [],",
    "            },",
    "          ],",
    "        },",
    "      },",
    "    },",
    "  },",
    "});",
    "",
  ].join("\n");

  await writeFile(configFile, configSource, "utf8");
}

describe("generate schemas", () => {
  it("writes schema artifacts for a game", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "tt-kit-schemas-"));
    await writeCliConfig(cwd);

    const result = await run(["generate", "schemas", "--outDir", "generated"], {
      cwd,
    });

    expect(result.exitCode).toBe(0);

    const generated = JSON.parse(
      await readFile(join(cwd, "generated", "schemas.generated.json"), "utf8"),
    ) as {
      canonicalState: { properties: Record<string, unknown> };
      visibleState: { properties: Record<string, unknown> };
      commands: Record<string, unknown>;
      discoveries: Record<
        string,
        {
          steps?: unknown[];
        }
      >;
    };

    expect(generated.canonicalState.properties.game).toBeDefined();
    expect(generated.canonicalState.properties.runtime).toBeDefined();
    expect(generated.visibleState.properties.game).toBeDefined();
    expect(generated.visibleState.properties.progression).toBeDefined();
    expect(generated.commands.take_three_distinct_gems).toBeDefined();
    const discovery = generated.discoveries.take_three_distinct_gems;
    expect(discovery).toBeDefined();
    expect(discovery?.steps).toBeDefined();
    expect(discovery?.steps?.[0]).toMatchObject({
      input: { type: "object" },
      output: { type: "object" },
    });
  });
});
