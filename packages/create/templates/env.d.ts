interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly VITE_TVK_DEV_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "vite" {
  export function defineConfig(config: unknown): unknown;
}

declare module "*.css" {}
