export interface BuiltGameDefinition {
  name: string;
  commands: object;
  canonicalGameStateSchema: object;
  runtimeStateSchema: object;
}

export interface TabletopCliConfig<
  TGame extends BuiltGameDefinition = BuiltGameDefinition,
> {
  game: TGame;
  outDir?: string;
}

export function defineConfig(config: TabletopCliConfig): TabletopCliConfig {
  return config;
}
