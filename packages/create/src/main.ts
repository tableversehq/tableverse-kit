#!/usr/bin/env node

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scaffold, type TrackedPackage } from "./scaffold.ts";

const usage = `Usage: create-tableverse <directory>

Scaffolds a Tableverse project: an npm workspace with an engine package (your
game's rules) and a client package (the frontend that renders them).`;

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function run(argv: string[]): Promise<RunResult> {
  const [target] = argv;

  if (!target || target === "--help" || target === "-h") {
    return {
      exitCode: target ? 0 : 1,
      stdout: target ? usage : "",
      stderr: target ? "" : usage,
    };
  }

  const targetDir = resolve(process.cwd(), target);

  if (existsSync(targetDir) && (await readdir(targetDir)).length > 0) {
    return { exitCode: 1, stdout: "", stderr: `directory_not_empty:${target}` };
  }

  const projectName = toProjectName(basename(targetDir));
  const versions = await readTableverseVersions();

  await scaffold({
    targetDir,
    projectName,
    versions,
  });

  return { exitCode: 0, stdout: nextSteps(target), stderr: "" };
}

function toProjectName(raw: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "tableverse-game";
}

function isDependencyRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * create-tableverse's own manifest tracks @tableverse-kit/cli, config,
 * client, and engine as devDependencies (workspace:* in this repo) so
 * `pnpm publish` resolves each to its real, independently released version
 * at publish time, pinning every scaffold to whatever version of that
 * package was actually current when this tool was published. Before a
 * publish the range is still the literal workspace:* protocol, so this
 * resolves it by reading the sibling package's own version directly out of
 * the monorepo instead.
 */
async function versionOf(
  pkg: TrackedPackage,
  devDependencies: Record<string, unknown>,
): Promise<string> {
  const dependencyName = `@tableverse-kit/${pkg}`;
  const range = devDependencies[dependencyName];
  if (typeof range !== "string") {
    throw new Error(`create_package_missing_dependency:${dependencyName}`);
  }
  if (!range.startsWith("workspace:")) {
    return `^${range}`;
  }

  const siblingManifestPath = fileURLToPath(
    new URL(`../../${pkg}/package.json`, import.meta.url),
  );
  const siblingManifest: unknown = JSON.parse(
    await readFile(siblingManifestPath, "utf8"),
  );
  if (
    !isDependencyRecord(siblingManifest) ||
    typeof siblingManifest.version !== "string"
  ) {
    throw new Error(`create_package_missing_dependency:${dependencyName}`);
  }
  return `^${siblingManifest.version}`;
}

async function readTableverseVersions(): Promise<
  Record<TrackedPackage, string>
> {
  const manifestPath = fileURLToPath(
    new URL("../package.json", import.meta.url),
  );
  const manifest: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
  const devDependencies =
    isDependencyRecord(manifest) && isDependencyRecord(manifest.devDependencies)
      ? manifest.devDependencies
      : {};

  const [cli, config, client, engine] = await Promise.all([
    versionOf("cli", devDependencies),
    versionOf("config", devDependencies),
    versionOf("client", devDependencies),
    versionOf("engine", devDependencies),
  ]);

  return { cli, config, client, engine };
}

function nextSteps(target: string): string {
  return `Scaffolded ${target}.

Next steps:
  cd ${target}
  npm install
  npm run dev`;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const result = await run(argv);
  if (result.stdout) {
    console.log(result.stdout);
  }
  if (result.stderr) {
    console.error(result.stderr);
  }
  process.exitCode = result.exitCode;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
