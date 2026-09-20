import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FrontendToolchainError,
  frontendUrl,
  reachableHost,
  resolveFrontendToolchain,
} from "../../src/lib/frontend/vite-config.ts";

const fixtures = fileURLToPath(
  new URL("../fixtures/frontend/", import.meta.url),
);

describe("resolveFrontendToolchain", () => {
  it("falls back to Vite's own port and output directory", async () => {
    const root = join(fixtures, "default");

    const toolchain = await resolveFrontendToolchain(root);

    expect(toolchain.port).toBe(5173);
    expect(toolchain.host).toBe("localhost");
    expect(toolchain.outDir).toBe(join(root, "dist"));
  });

  it("reads the values the project configured", async () => {
    const root = join(fixtures, "custom");

    const toolchain = await resolveFrontendToolchain(root);

    expect(toolchain.port).toBe(5399);
    expect(toolchain.host).toBe("127.0.0.1");
    expect(toolchain.outDir).toBe(join(root, "out", "web"));
  });

  it("names the directory when the project has no Vite", async () => {
    const root = tmpdir();
    const resolver = {
      resolveViteEntry: () => {
        throw new Error("MODULE_NOT_FOUND");
      },
    };

    await expect(resolveFrontendToolchain(root, resolver)).rejects.toThrow(
      `frontend_vite_not_found:${root}`,
    );
  });

  it("names the directory when the resolved module is not Vite", async () => {
    const root = join(fixtures, "default");
    const resolver = {
      resolveViteEntry: () =>
        fileURLToPath(new URL("./not-vite.mjs", import.meta.url)),
    };

    await expect(resolveFrontendToolchain(root, resolver)).rejects.toThrow(
      FrontendToolchainError,
    );
  });
});

describe("reachableHost", () => {
  it("reaches a frontend listening on every interface through localhost", () => {
    for (const configured of [undefined, false, true, "0.0.0.0", "::"]) {
      expect(reachableHost(configured)).toBe("localhost");
    }
  });

  it("keeps a host the project named", () => {
    expect(reachableHost("192.168.1.20")).toBe("192.168.1.20");
  });
});

describe("frontendUrl", () => {
  it("builds an address from a host name", () => {
    expect(frontendUrl({ host: "localhost", port: 5173 })).toBe(
      "http://localhost:5173",
    );
  });

  it("brackets an IPv6 host", () => {
    expect(frontendUrl({ host: "::1", port: 5173 })).toBe("http://[::1]:5173");
  });
});
