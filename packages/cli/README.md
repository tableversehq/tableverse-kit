# @tableverse-kit/cli

The `tvk` command. It runs your game locally and hands finished source to
[Tableverse](https://github.com/tableversehq).

The `create-tableverse` scaffold installs it in your project root. To add it to
an existing project:

```bash
npm install --save-dev @tableverse-kit/cli
```

Then run it from the project root, or any directory below it:

```bash
npx tvk --help
```

## Commands

| Command        | Purpose                                                |
| -------------- | ------------------------------------------------------ |
| `tvk validate` | Load and validate the game definition.                 |
| `tvk dev`      | Start the local rules server and frontend.             |
| `tvk login`    | Sign in to Tableverse in your browser.                 |
| `tvk whoami`   | Print the signed-in account.                           |
| `tvk logout`   | Revoke and remove the saved login.                     |
| `tvk upload`   | Package the project source and start a platform build. |

Use `--help` after any command to see its current options:

```bash
npx tvk upload --help
```

## Config file

`tvk validate`, `tvk dev`, and `tvk upload` search the current directory and its
parents for `tableverse.config.ts`:

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

`tvk validate` works without `publish`. `tvk dev` uses `publish.frontend.root`
to start the frontend. `tvk upload` packages the project root and sends the
publish settings to Tableverse.

## Recommended checks

Run TypeScript before CLI validation. The CLI loads the built definition, while
TypeScript catches mistakes in code paths that may not run during definition
assembly.

```bash
npm run typecheck
npx tvk validate
```

## Environment

| Variable             | Effect                                                              |
| -------------------- | ------------------------------------------------------------------- |
| `TABLEVERSE_API_URL` | Platform API base URL. Defaults to `https://api-dev.tableverse.io`. |
| `TABLEVERSE_WEB_URL` | Platform web base URL. Defaults to `https://dev.tableverse.io`.     |
| `TABLEVERSE_GAME_ID` | Upload to this game ID, overriding the saved link.                  |

Credentials are stored per API base URL, so separate environments keep separate
logins. `tvk upload` saves the game identity it links to in
`.tableverse/game.json`.

## Documentation

[CLI documentation](https://github.com/tableversehq/tableverse-kit/tree/main/packages/docs/cli)
covers the dev server, upload, and configuration in full.

## License

[Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)
