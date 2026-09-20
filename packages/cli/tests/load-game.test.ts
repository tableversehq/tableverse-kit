import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGenerationContext } from "../src/lib/generation-context.ts";
import { loadConfig } from "../src/lib/load-config.ts";

const currentDir = fileURLToPath(new URL(".", import.meta.url));

describe("createGenerationContext", () => {
  it("resolves the output directory from a default config file", async () => {
    const context = await createGenerationContext({
      cwd: resolve(currentDir, "fixtures"),
    });

    expect(context.game.name).toBe("fixture-default");
    expect(context.outputDirectory).toBe(
      resolve(currentDir, "fixtures", "generated-from-config"),
    );
  });

  it("resolves the output directory from a child directory", async () => {
    const context = await createGenerationContext({
      cwd: resolve(currentDir, "fixtures", "nested"),
    });

    expect(context.game.name).toBe("fixture-default");
    expect(context.outputDirectory).toBe(
      resolve(currentDir, "fixtures", "generated-from-config"),
    );
  });
});

describe("loadConfig", () => {
  it("loads the default tableverse.config.ts from cwd", async () => {
    const config = await loadConfig({
      cwd: resolve(currentDir, "fixtures"),
    });

    expect(config.game.name).toBe("fixture-default");
  });

  it("finds tableverse.config.ts from a child directory", async () => {
    const config = await loadConfig({
      cwd: resolve(currentDir, "fixtures", "nested"),
    });

    expect(config.game.name).toBe("fixture-default");
    expect(config.configDirectory).toBe(resolve(currentDir, "fixtures"));
  });

  it("normalizes publish settings for the platform build", async () => {
    const config = await loadConfig({
      cwd: resolve(currentDir, "fixtures", "publish", "nested"),
    });

    expect(config.publish).toEqual({
      engine: "./engine",
      frontend: "./client",
    });
  });

  it("rejects a publish directory that escapes the project", async () => {
    await expect(
      loadConfig({ cwd: resolve(currentDir, "fixtures", "escaping") }),
    ).rejects.toThrow("invalid_cli_config");
  });

  it("rejects invalid config files", async () => {
    await expect(
      loadConfig({
        cwd: resolve(currentDir, "fixtures", "invalid"),
      }),
    ).rejects.toThrow("invalid_cli_config");
  });
});
