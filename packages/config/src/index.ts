import type { AnyGameDefinition } from "@tableverse-kit/engine";

export interface PublishConfig {
  engine: string;
  frontend: string;
}

export interface TableverseConfig {
  game: AnyGameDefinition;
  outDir?: string;
  publish?: PublishConfig;
}

export function defineConfig(config: TableverseConfig): TableverseConfig {
  return config;
}
