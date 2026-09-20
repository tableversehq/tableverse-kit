import { loadConfig, type LoadedCliConfig } from "../load-config.ts";
import {
  createPlatformClient,
  type PlatformClient,
} from "../platform-client.ts";
import {
  resolvePlatformConfig,
  type PlatformConfig,
} from "../platform-config.ts";
import { resolveCredentialsPath } from "../auth/paths.ts";
import { createFileTokenStore, type TokenStore } from "../auth/token-store.ts";
import {
  createInteractiveLinkPrompt,
  type LinkPrompt,
} from "../link/link-prompt.ts";
import { openBrowser, type BrowserOpener } from "../browser.ts";
import { resolveFrontendToolchain } from "../frontend/vite-config.ts";

export interface UploadContext {
  config: PlatformConfig;
  tokenStore: TokenStore;
  client: PlatformClient;
  now: () => Date;
  cwd: string;
  env: Record<string, string | undefined>;
  loadConfig: (options: { cwd: string }) => Promise<LoadedCliConfig>;
  resolveToolchain: typeof resolveFrontendToolchain;
  interactive: boolean;
  linkPrompt: LinkPrompt;
  openBrowser: BrowserOpener;
  emit: (line: string) => void;
}

export function createUploadContext(): UploadContext {
  const config = resolvePlatformConfig(process.env);

  return {
    config,
    now: () => new Date(),
    cwd: process.cwd(),
    env: process.env,
    loadConfig,
    resolveToolchain: resolveFrontendToolchain,
    tokenStore: createFileTokenStore({
      filePath: resolveCredentialsPath(process.env),
    }),
    client: createPlatformClient({
      apiBaseUrl: config.apiBaseUrl,
      clientId: config.clientId,
      fetch,
    }),
    interactive: Boolean(process.stdin.isTTY && process.stderr.isTTY),
    linkPrompt: createInteractiveLinkPrompt(),
    openBrowser,
    emit: (line) => process.stderr.write(`${line}\n`),
  };
}
