import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const defaultTemplateDir = fileURLToPath(
  new URL("../templates/default", import.meta.url),
);

const emittedNames: Record<string, string> = {
  _gitignore: ".gitignore",
  _npmrc: ".npmrc",
  "_package.json": "package.json",
  "_tsconfig.json": "tsconfig.json",
};

export const TRACKED_PACKAGES = ["cli", "config", "client", "engine"] as const;

export type TrackedPackage = (typeof TRACKED_PACKAGES)[number];

export interface ScaffoldOptions {
  targetDir: string;
  projectName: string;
  versions: Record<TrackedPackage, string>;
  templateDir?: string;
}

export async function scaffold(options: ScaffoldOptions): Promise<void> {
  await copyTree(
    options.templateDir ?? defaultTemplateDir,
    options.targetDir,
    options,
  );
}

async function copyTree(
  sourceDir: string,
  destinationDir: string,
  options: ScaffoldOptions,
): Promise<void> {
  await mkdir(destinationDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = join(sourceDir, entry.name);
    const destinationPath = join(
      destinationDir,
      emittedNames[entry.name] ?? entry.name,
    );

    if (entry.isDirectory()) {
      await copyTree(sourcePath, destinationPath, options);
    } else {
      const contents = await readFile(sourcePath, "utf8");
      await writeFile(destinationPath, substitute(contents, options));
    }
  }
}

function substitute(contents: string, options: ScaffoldOptions): string {
  let result = contents.replaceAll("{{projectName}}", options.projectName);
  for (const pkg of TRACKED_PACKAGES) {
    result = result.replaceAll(`{{${pkg}Version}}`, options.versions[pkg]);
  }
  return result;
}
