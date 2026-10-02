import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { startFrontend } from "../../src/lib/frontend/process.ts";

let stop: (() => void) | null = null;

afterEach(() => {
  stop?.();
  stop = null;
});

async function answers(port: number): Promise<boolean> {
  return fetch(`http://127.0.0.1:${port}`).then(
    () => true,
    () => false,
  );
}

async function waitFor(check: () => Promise<boolean>): Promise<boolean> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await check()) {
      return true;
    }
    await delay(100);
  }
  return false;
}

describe("startFrontend", () => {
  it("stops a server started by a grandchild process", async () => {
    const port = 5412;
    const frontend = startFrontend(process.cwd(), {
      executable: "sh",
      args: [
        "-c",
        `node -e 'require("node:http").createServer((q,r)=>r.end("ok")).listen(${port},"127.0.0.1")'`,
      ],
    });
    stop = frontend.stop;

    expect(await waitFor(() => answers(port))).toBe(true);

    frontend.stop();

    expect(await waitFor(async () => !(await answers(port)))).toBe(true);
  }, 20_000);

  it("reports a frontend that exits on its own", async () => {
    const frontend = startFrontend(process.cwd(), {
      executable: "sh",
      args: ["-c", "exit 3"],
    });
    stop = frontend.stop;

    await expect(frontend.exitCode).resolves.toBe(3);
  }, 10_000);

  it("reports a stop as an ordinary end", async () => {
    const frontend = startFrontend(process.cwd(), {
      executable: "sh",
      args: ["-c", "sleep 30"],
    });
    stop = frontend.stop;

    frontend.stop();

    await expect(frontend.exitCode).resolves.toBe(0);
  }, 10_000);

  it("passes the quiet flags through npm to the dev script", async () => {
    const project = await mkdtemp(join(tmpdir(), "tvk-frontend-"));
    try {
      await writeFile(
        join(project, "package.json"),
        JSON.stringify({
          name: "argv-probe",
          private: true,
          scripts: { dev: "node record.mjs" },
        }),
      );
      await writeFile(
        join(project, "record.mjs"),
        [
          'import { writeFile } from "node:fs/promises";',
          'await writeFile("argv.json", JSON.stringify(process.argv.slice(2)));',
        ].join("\n"),
      );

      const frontend = startFrontend(project);
      stop = frontend.stop;

      await expect(frontend.exitCode).resolves.toBe(0);
      const argv: unknown = JSON.parse(
        await readFile(join(project, "argv.json"), "utf8"),
      );
      expect(argv).toEqual(["--logLevel", "warn"]);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  }, 30_000);
});
