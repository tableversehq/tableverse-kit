import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGameExecutor } from "@tabletop-kit/engine";
import { createSplendorGame } from "splendor-example";
import { run } from "../src/main.ts";

const repoRoot = join(import.meta.dir, "..", "..", "..");
const splendorRoot = join(repoRoot, "examples", "splendor", "engine");

describe("validate", () => {
  it("validates a game definition when given only the game module", async () => {
    const result = await run(["validate"], {
      cwd: splendorRoot,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("validated game:splendor");
  });

  it("validates a valid snapshot", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "ttk-validate-"));
    const game = createSplendorGame();
    const executor = createGameExecutor(game);
    const snapshotPath = join(outDir, "snapshot.json");

    await writeFile(
      snapshotPath,
      JSON.stringify(
        executor.createInitialState(
          {
            playerIds: ["player-1", "player-2"],
          },
          "validate-seed",
        ),
        null,
        2,
      ),
      "utf8",
    );

    const result = await run(["validate", "--snapshot", snapshotPath], {
      cwd: splendorRoot,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("validated snapshot");
  });

  it("fails for an invalid snapshot", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "ttk-validate-"));
    const game = createSplendorGame();
    const executor = createGameExecutor(game);
    const invalidSnapshotPath = join(outDir, "invalid-snapshot.json");
    const invalidState = executor.createInitialState(
      {
        playerIds: ["player-1", "player-2"],
      },
      "validate-seed",
    );

    invalidState.game.playerOrder = 123 as never;

    await writeFile(
      invalidSnapshotPath,
      JSON.stringify(invalidState, null, 2),
      "utf8",
    );

    const result = await run(["validate", "--snapshot", invalidSnapshotPath], {
      cwd: splendorRoot,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("invalid_schema_value");
    expect(await readFile(invalidSnapshotPath, "utf8")).toContain("123");
  });
});
