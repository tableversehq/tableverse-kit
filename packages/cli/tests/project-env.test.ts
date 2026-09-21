import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findProjectEnvFile } from "../src/lib/project-env.ts";

const made: string[] = [];

afterEach(async () => {
  await Promise.all(
    made.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function project(options: { env?: boolean; config?: boolean }) {
  const root = await mkdtemp(join(tmpdir(), "tvk-env-"));
  made.push(root);
  if (options.config !== false) {
    await writeFile(join(root, "tableverse.config.ts"), "export default {};");
  }
  if (options.env) {
    await writeFile(join(root, ".env"), "TABLEVERSE_API_URL=http://local\n");
  }
  await mkdir(join(root, "client"), { recursive: true });
  return root;
}

describe("findProjectEnvFile", () => {
  it("finds the file beside the project's config", async () => {
    const root = await project({ env: true });

    expect(findProjectEnvFile(root)).toBe(join(root, ".env"));
  });

  it("finds it from a directory inside the project", async () => {
    const root = await project({ env: true });

    expect(findProjectEnvFile(join(root, "client"))).toBe(join(root, ".env"));
  });

  it("finds nothing when the project has no file", async () => {
    const root = await project({ env: false });

    expect(findProjectEnvFile(root)).toBeNull();
  });

  it("finds nothing outside a project", async () => {
    const root = await project({ env: true, config: false });

    expect(findProjectEnvFile(root)).toBeNull();
  });
});
