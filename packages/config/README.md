# @tableverse-kit/config

The publish-config contract for a [Tableverse](https://github.com/tableversehq)
project. It gives `tableverse.config.ts` its types, and it is what
[`@tableverse-kit/cli`](https://github.com/tableversehq/tableverse-kit/tree/main/packages/cli)
and the platform read to build your game.

```bash
npm install --save-dev @tableverse-kit/config
```

## Usage

Create `tableverse.config.ts` in your project root and export `defineConfig(...)`
as the default value:

```ts
import { defineConfig } from "@tableverse-kit/config";
import { game } from "./engine/src/game.ts";

export default defineConfig({
  game,
  publish: {
    engine: { root: "./engine" },
    frontend: {
      root: "./client",
      buildCommand: "npm run build",
      outDir: "dist",
    },
  },
});
```

`defineConfig` returns the object unchanged. Its purpose is type checking and
editor completion.

## Fields

| Field     | Required                       | Description                                           |
| --------- | ------------------------------ | ----------------------------------------------------- |
| `game`    | Yes                            | A built game definition from `GameDefinitionBuilder`. |
| `publish` | For `tvk dev` and `tvk upload` | Engine and frontend source build settings.            |

### `publish.engine`

- `root` — the engine workspace directory, relative to the config file. Point it at source; Tableverse creates the sandbox bundle.

### `publish.frontend`

- `root` — the frontend source directory, relative to the config file.
- `buildCommand` — the command run inside that directory on Tableverse.
- `outDir` — the static build output, relative to the frontend root. The CLI excludes it from upload because the platform recreates it.

## Documentation

[Configuration documentation](https://github.com/tableversehq/tableverse-kit/blob/main/packages/docs/cli/configuration.mdx)
covers workspace layout, lockfiles, and config discovery.

## License

[Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)
