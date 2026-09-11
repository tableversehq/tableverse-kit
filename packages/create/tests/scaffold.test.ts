import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check, getFileInfo } from "prettier";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { scaffold } from "../src/scaffold.ts";
import { run } from "../src/main.ts";

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "tvk-create-"));
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)));
    } else {
      files.push(path);
    }
  }
  return files;
}

describe("scaffold", () => {
  test("emits template files with underscore-prefixed names restored", async () => {
    const target = join(workspace, "game");
    await scaffold({
      targetDir: target,
      projectName: "my-game",
      versions: {
        cli: "^1.2.3",
        config: "^1.2.4",
        client: "^1.2.5",
        engine: "^1.2.6",
      },
    });

    const names = (await collectFiles(target)).map((path) =>
      path.slice(target.length + 1),
    );

    expect(names).toContain("package.json");
    expect(names).toContain(".gitignore");
    expect(names).toContain("engine/package.json");
    expect(names).toContain("engine/tsconfig.json");
    expect(names).toContain("engine/src/game.ts");
    expect(names).toContain("tableverse.config.ts");
    expect(names).toContain("client/package.json");
    expect(names).toContain("client/tsconfig.json");
    expect(names).toContain("client/src/main.ts");
    expect(names).not.toContain("_package.json");
    expect(names).not.toContain("_gitignore");
    expect(names).not.toContain("engine/_tsconfig.json");
  });

  // `packages/create/templates` is Prettier-ignored, so the repo's own format
  // check never reaches the template. This reaches the project it emits.
  test("emits a project Prettier already considers formatted", async () => {
    const target = join(workspace, "game");
    await scaffold({
      targetDir: target,
      projectName: "my-game",
      versions: {
        cli: "^1.2.3",
        config: "^1.2.4",
        client: "^1.2.5",
        engine: "^1.2.6",
      },
    });

    const unformatted: string[] = [];
    for (const path of await collectFiles(target)) {
      const { inferredParser } = await getFileInfo(path);
      if (inferredParser === null) {
        continue;
      }
      const source = await readFile(path, "utf8");
      if (!(await check(source, { filepath: path }))) {
        unformatted.push(path.slice(target.length + 1));
      }
    }

    expect(unformatted).toEqual([]);
  });

  test("substitutes the project name and version tokens", async () => {
    const target = join(workspace, "game");
    await scaffold({
      targetDir: target,
      projectName: "my-game",
      versions: {
        cli: "^1.2.3",
        config: "^1.2.4",
        client: "^1.2.5",
        engine: "^1.2.6",
      },
    });

    const rootManifest = JSON.parse(
      await readFile(join(target, "package.json"), "utf8"),
    );
    expect(rootManifest.name).toBe("my-game");
    expect(rootManifest.devDependencies["@tableverse-kit/cli"]).toBe("^1.2.3");
    expect(rootManifest.devDependencies["@tableverse-kit/config"]).toBe(
      "^1.2.4",
    );
    expect(rootManifest.workspaces).toEqual(["engine", "client"]);
    expect(rootManifest.scripts.dev).toBe("tvk dev");
    expect(rootManifest.scripts.build).toBe("npm run build --workspace=client");
    expect(rootManifest.scripts.typecheck).toBe(
      "npm run typecheck --workspaces --if-present",
    );

    const configSource = await readFile(
      join(target, "tableverse.config.ts"),
      "utf8",
    );
    expect(configSource).toContain('from "./engine/src/game.ts"');
    expect(configSource).toContain('engine: { root: "./engine" }');
    expect(configSource).toContain('root: "./client"');
    expect(configSource).toContain('buildCommand: "npm run build"');

    const clientManifest = JSON.parse(
      await readFile(join(target, "client", "package.json"), "utf8"),
    );
    expect(clientManifest.name).toBe("my-game-client");
    expect(clientManifest.dependencies["@tableverse-kit/client"]).toBe(
      "^1.2.5",
    );
    expect(clientManifest.devDependencies["my-game-engine"]).toBe("0.0.0");

    const engineManifest = JSON.parse(
      await readFile(join(target, "engine", "package.json"), "utf8"),
    );
    expect(engineManifest.dependencies["@tableverse-kit/engine"]).toBe(
      "^1.2.6",
    );
  });

  test("creates one client that selects its connection", async () => {
    const target = join(workspace, "game");
    await scaffold({
      targetDir: target,
      projectName: "my-game",
      versions: {
        cli: "^1.2.3",
        config: "^1.2.4",
        client: "^1.2.5",
        engine: "^1.2.6",
      },
    });

    const clientSource = await readFile(
      join(target, "client", "src", "main.ts"),
      "utf8",
    );
    expect(clientSource).toContain("createTableverseClient<Game>()");
  });

  test("leaves no unresolved placeholder tokens", async () => {
    const target = join(workspace, "game");
    await scaffold({
      targetDir: target,
      projectName: "my-game",
      versions: {
        cli: "^1.2.3",
        config: "^1.2.4",
        client: "^1.2.5",
        engine: "^1.2.6",
      },
    });

    for (const path of await collectFiles(target)) {
      const contents = await readFile(path, "utf8");
      expect(contents).not.toContain("{{");
    }
  });
});

describe("run", () => {
  test("loads the TypeScript entry through tsx", async () => {
    const launcher = await readFile(
      new URL("../bin/create-tableverse.js", import.meta.url),
      "utf8",
    );

    expect(launcher.startsWith("#!/usr/bin/env node\n")).toBe(true);
    expect(launcher).toContain('import "tsx";');
    expect(launcher).toContain('import("../src/main.ts")');
  });

  test("scaffolds into a named directory and derives the project slug", async () => {
    const result = await run([join(workspace, "My Cool Game")]);

    expect(result.exitCode).toBe(0);
    const manifest = JSON.parse(
      await readFile(join(workspace, "My Cool Game", "package.json"), "utf8"),
    );
    expect(manifest.name).toBe("my-cool-game");
    expect(result.stdout).toContain("npm install");
    expect(result.stdout).toContain("npm run dev");
  });

  test("refuses a non-empty target directory", async () => {
    const target = join(workspace, "occupied");
    await run([target]);

    const second = await run([target]);
    expect(second.exitCode).toBe(1);
    expect(second.stderr).toContain("directory_not_empty");
  });

  test("prints usage and fails when no directory is given", async () => {
    const result = await run([]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Usage");
  });
});
