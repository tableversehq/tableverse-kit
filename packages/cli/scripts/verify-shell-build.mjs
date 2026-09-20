import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const shellDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "dist",
  "shell",
);
const indexPath = join(shellDirectory, "index.html");

if (!existsSync(indexPath)) {
  console.error(`The dev shell is not built: ${indexPath} is missing.`);
  process.exit(1);
}

const html = readFileSync(indexPath, "utf8");
const assets = [...html.matchAll(/(?:src|href)="\/([^"]+)"/g)].map(
  (match) => match[1],
);
const missing = assets.filter(
  (asset) => !existsSync(join(shellDirectory, asset)),
);

if (assets.length === 0 || missing.length > 0) {
  console.error(
    assets.length === 0
      ? "The dev shell's index.html references no assets."
      : `The dev shell's index.html references missing assets: ${missing.join(", ")}`,
  );
  process.exit(1);
}

console.log(`Dev shell verified: ${assets.length} assets.`);
