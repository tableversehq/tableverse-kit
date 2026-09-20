import { createRequire } from "node:module";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface FrontendToolchain {
  port: number;
  host: string;
  outDir: string;
}

export class FrontendToolchainError extends Error {
  readonly root: string;

  constructor(root: string) {
    super(`frontend_vite_not_found:${root}`);
    this.name = "FrontendToolchainError";
    this.root = root;
  }
}

interface ResolvedViteConfig {
  server: { port?: number; host?: string | boolean };
  build: { outDir: string };
}

interface ViteModule {
  resolveConfig(
    inline: { root: string },
    command: "serve" | "build",
  ): Promise<ResolvedViteConfig>;
}

export interface ViteResolver {
  resolveViteEntry(root: string): string;
}

const DEFAULT_PORT = 5173;
const LOCALHOST = "localhost";
const WILDCARD_HOSTS = new Set(["0.0.0.0", "::"]);

const nodeViteResolver: ViteResolver = {
  resolveViteEntry: (root) => createRequire(`${root}/`).resolve("vite"),
};

export async function resolveFrontendToolchain(
  root: string,
  resolver: ViteResolver = nodeViteResolver,
): Promise<FrontendToolchain> {
  const vite = await importVite(root, resolver);
  const serve = await vite.resolveConfig({ root }, "serve");
  const build = await vite.resolveConfig({ root }, "build");
  const outDir = build.build.outDir;

  return {
    port: serve.server.port ?? DEFAULT_PORT,
    host: reachableHost(serve.server.host),
    outDir: isAbsolute(outDir) ? outDir : resolve(root, outDir),
  };
}

export function reachableHost(
  configured: string | boolean | undefined,
): string {
  if (typeof configured !== "string" || WILDCARD_HOSTS.has(configured)) {
    return LOCALHOST;
  }
  return configured;
}

export function frontendUrl(address: { host: string; port: number }): string {
  const host = address.host.includes(":") ? `[${address.host}]` : address.host;
  return `http://${host}:${address.port}`;
}

async function importVite(
  root: string,
  resolver: ViteResolver,
): Promise<ViteModule> {
  let entry: string;
  try {
    entry = resolver.resolveViteEntry(root);
  } catch {
    throw new FrontendToolchainError(root);
  }

  const module: unknown = await import(pathToFileURL(entry).href);
  if (!isViteModule(module)) {
    throw new FrontendToolchainError(root);
  }
  return module;
}

function isViteModule(value: unknown): value is ViteModule {
  return (
    !!value &&
    typeof value === "object" &&
    "resolveConfig" in value &&
    typeof value.resolveConfig === "function"
  );
}
