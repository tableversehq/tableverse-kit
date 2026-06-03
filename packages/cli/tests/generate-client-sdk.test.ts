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
      pathToFileURL(join(repoRoot, "packages", "engine", "src", "config.ts"))
        .href,
    )};`,
    `import { t } from ${JSON.stringify(
      pathToFileURL(join(repoRoot, "packages", "engine", "src", "index.ts"))
        .href,
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
    '          startStep: "confirm_selection",',
    "          steps: [",
    "            {",
    '              stepId: "select_gems",',
    "              inputSchema: t.object({",
    "                selectedColor: t.string(),",
    "              }),",
    "              outputSchema: t.object({",
    "                label: t.string(),",
    "                amount: t.number(),",
    "              }),",
    "              resolve: () => [],",
    "            },",
    "            {",
    '              stepId: "confirm_selection",',
    "              inputSchema: t.object({",
    "              }),",
    "              outputSchema: t.object({",
    "                ready: t.boolean(),",
    "              }),",
    "              resolve: () => [],",
    "            },",
    "          ],",
    "        },",
    "      },",
    "      seeded_target: {",
    '        commandId: "seeded_target",',
    "        commandSchema: t.object({",
    "          targetId: t.string(),",
    "        }),",
    "        discovery: {",
    '          startStep: "select_target",',
    "          steps: [",
    "            {",
    '              stepId: "select_target",',
    "              inputSchema: t.object({",
    "                seed: t.string(),",
    "              }),",
    "              outputSchema: t.object({",
    "                targetId: t.string(),",
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

describe("generate client-sdk", () => {
  it("writes a typed client sdk surface for a game", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "ttk-sdk-"));
    await writeCliConfig(cwd);

    const result = await run(
      ["generate", "client-sdk", "--outDir", "generated"],
      {
        cwd,
      },
    );

    expect(result.exitCode).toBe(0);

    const generated = await readFile(
      join(cwd, "generated", "client-sdk.generated.ts"),
      "utf8",
    );

    expect(generated).toContain("export interface VisibleState");
    expect(generated).toContain(
      "export type TakeThreeDistinctGemsCommandRequest =",
    );
    expect(generated).toContain(
      "export type TakeThreeDistinctGemsDiscoveryRequest =",
    );
    expect(generated).toContain(
      "export type TakeThreeDistinctGemsDiscoveryResult =",
    );
    expect(generated).toContain(
      "export type TakeThreeDistinctGemsCommandPayload =",
    );
    expect(generated).toContain(
      "export type TakeThreeDistinctGemsDiscoveryPayload =",
    );
    expect(generated).toContain("export type WithoutActorId<T> =");
    expect(generated).toContain("export type WithoutType<T> =");
    expect(generated).toContain(
      "WithoutActorId<TakeThreeDistinctGemsDiscoveryRequest>",
    );
    expect(generated).toContain(
      "WithoutType<TakeThreeDistinctGemsDiscoveryPayload>",
    );
    expect(generated).toContain(
      "export type TakeThreeDistinctGemsDiscoveryStart =",
    );
    expect(generated).toContain(
      "export const takeThreeDistinctGemsDiscoveryStart =",
    );
    expect(generated).toContain('step: "confirm_selection"');
    expect(generated).toContain(
      "export type TakeThreeDistinctGemsDiscoveryStart = {",
    );
    expect(generated).toContain("export type SeededTargetDiscoveryStart =");
    expect(generated).not.toContain(
      "export const seededTargetDiscoveryStart =",
    );
    expect(generated).toContain("export type CommandRequest =");
    expect(generated).toContain("export type DiscoveryRequest =");
    expect(generated).toContain("export type DiscoveryResult =");
    expect(generated).toContain("step:");
    expect(generated).toContain("output:");
    expect(generated).toContain("nextStep:");
    expect(generated).toContain("nextInput:");
    expect(generated).toContain('nextStep: "select_gems";');
    expect(generated).toContain("selectedColor: string;");
    expect(generated).toContain('nextStep: "confirm_selection";');
    expect(generated).toContain("nextInput: {};");
    expect(generated).toContain("export interface GameEngineClient");
    expect(generated).toContain("export function createGameEngineClient");
    expect(generated).toContain("onGameSnapshot(");
    expect(generated).toContain("onGameEnded(");
    expect(generated).toContain("onDiscoveryResult(");
    expect(generated).toContain("onExecutionResult(");
    expect(generated).toContain("discoverTakeThreeDistinctGems(");
    expect(generated).toContain("executeTakeThreeDistinctGems(");
    expect(generated).toContain("export interface GameEngineErrorMessage");
    expect(generated).toContain("requestId?: string;");
    expect(generated).toContain('type: "game_discover"');
    expect(generated).toContain('type: "game_execute"');
    expect(generated).toContain('type: "game_snapshot"');
    expect(generated).toContain('type: "game_execution_result"');
    expect(generated).toContain('case "error":');
    expect(generated).toContain(".reject(error)");
    expect(generated).toContain(
      'socket.addEventListener("close", handleSocketClosed);',
    );
    expect(generated).toContain(
      'socket.addEventListener("error", handleSocketErrored);',
    );
    expect(generated).toContain(
      'rejectPendingRequests("Game engine socket closed");',
    );
    expect(generated).toContain(
      'rejectPendingRequests("Game engine socket errored");',
    );
    expect(generated).not.toContain("commandType: CommandType;");
  });
});
