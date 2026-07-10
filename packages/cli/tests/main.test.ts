import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { run } from "../src/main.ts";

describe("tvk", () => {
  it("can be installed as a Bun executable", async () => {
    const mainSource = readFileSync(
      new URL("../src/main.ts", import.meta.url),
      "utf8",
    );

    expect(mainSource.startsWith("#!/usr/bin/env bun\n")).toBe(true);
  });

  it("prints top-level help for --help", async () => {
    const result = await run(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("tvk");
    expect(result.stdout).toContain("generate");
    expect(result.stdout).toContain("validate");
  });

  it("prints generate help for generate --help", async () => {
    const result = await run(["generate", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("tvk generate");
    expect(result.stdout).toContain("client-sdk");
  });

  it("prints validate help for validate --help", async () => {
    const result = await run(["validate", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("tvk validate");
    expect(result.stdout).toContain("--config");
  });

  it("rejects unknown generate subcommands", async () => {
    const result = await run(["generate", "foo"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("unknown_generate_target:foo");
  });

  it("rejects deprecated game-selection flags", async () => {
    const result = await run([
      "validate",
      "--game",
      "packages/cli/tests/fixtures/game-default.ts",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("deprecated_flag:--game");
  });

  it("rejects unexpected positional arguments after command parsing begins", async () => {
    const result = await run(["generate", "client-sdk", "oops"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("unexpected_positional_argument:oops");
  });
});
