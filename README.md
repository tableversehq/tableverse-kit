# tableverse-kit

Open-source TypeScript toolkit for authoring board games that run on
[Tableverse](https://github.com/tableversehq).

You write two things: an **engine** package holding your rules, and a **client**
package holding the interface your players see. The engine compiles to a single
`GameExecutor`, and that executor is the whole handoff — Tableverse hosts the
game and runs the servers, rooms, transport, and persistence.

```text
engine source → GameExecutor → Tableverse
                          ↘ typed client → your frontend
```

## Quick start

```bash
npm create tableverse my-game
cd my-game
npm install
npm run dev
```

The scaffold ships a playable scoring command and a plain TypeScript frontend.
`npm run dev` starts the local rules server and the frontend together.

## Packages

| Package                                       | Purpose                                                             |
| --------------------------------------------- | ------------------------------------------------------------------- |
| [`@tableverse-kit/engine`](./packages/engine) | State, commands, stages, hidden information, and the `GameExecutor` |
| [`@tableverse-kit/client`](./packages/client) | Renderer-agnostic typed client for your frontend                    |
| [`@tableverse-kit/cli`](./packages/cli)       | The `tvk` command: validate, dev server, auth, upload               |
| [`@tableverse-kit/config`](./packages/config) | `defineConfig` for `tableverse.config.ts`                           |
| [`create-tableverse`](./packages/create)      | Project scaffolder                                                  |
| [`@tableverse-kit/docs`](./packages/docs)     | The documentation site (private)                                    |

## Install into an existing project

The packages are in beta, and the default install gives you the current beta:

```bash
npm install @tableverse-kit/engine
npm install --save-dev @tableverse-kit/cli @tableverse-kit/config
npm install @tableverse-kit/client
```

Every package ships TypeScript source. Run the CLI through its `tvk` binary,
which loads TypeScript for you, and build your frontend with a bundler that
compiles TypeScript from dependencies (Vite does this out of the box).

## Documentation

Full documentation lives in [`packages/docs`](./packages/docs):

- [Quick start](./packages/docs/quick-start/introduction.mdx) — scaffold, build, preview, and upload a first game
- [Engine](./packages/docs/engine/overview.mdx) — state, commands, stages, visibility, executor, testing
- [Client](./packages/docs/client/overview.mdx) — local sessions, published games, views and subscriptions
- [CLI](./packages/docs/cli/overview.mdx) — dev server, upload, configuration

## Develop this repo

Requires Node.js and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm exec tsc -b
pnpm lint
pnpm test
```

`AGENTS.md` carries the full project context: charter, package boundaries,
toolchain, and conventions.

## License

[Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)
