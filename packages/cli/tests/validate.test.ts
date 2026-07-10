import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../src/main.ts";

const currentDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = join(currentDir, "..", "..", "..");
const splendorRoot = join(repoRoot, "examples", "splendor", "engine");

describe("validate", () => {
  it("validates a game definition when given only the game module", async () => {
    const result = await run(["validate"], {
      cwd: splendorRoot,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("validated game:splendor");
  });
});
