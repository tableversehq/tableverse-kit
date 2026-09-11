# create-tableverse

Scaffolds a [Tableverse](https://github.com/tableversehq) game: an npm workspace
with an engine package holding your rules and a client package holding the
frontend that renders them.

```bash
npm create tableverse token-race
cd token-race
npm install
npm run dev
```

The target directory must be empty. The scaffolder uses the directory name as
the project and game name.

## What you get

```text
token-race/
├── engine/
│   └── src/
│       ├── commands.ts
│       ├── events.ts
│       ├── game.ts
│       └── state.ts
├── client/
│   └── src/main.ts
├── package.json
├── tableverse.config.ts
└── README.md
```

The scaffold is playable before you change anything: `npm run dev` starts the
local rules server and a Vite frontend together, and the starter game has a
working scoring command wired end to end.

Edit `engine/src` for rules and `client/src` for the interface.

## Documentation

[Quick start](https://github.com/tableversehq/tableverse-kit/blob/main/packages/docs/quick-start/create-your-project.mdx)
walks through the scaffold, the first rule change, local preview, and upload.

## License

[Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)
