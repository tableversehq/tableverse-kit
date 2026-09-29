# @tableverse-kit/cli

## 0.1.0-beta.3

### Patch Changes

- `tvk upload` sends Tableverse the engine and frontend roots only. Tableverse builds the frontend with the project's own Vite and resolves its output directory there.
- `tvk dev` serves a developer shell at the rules server's address. Choose the seats, seed, and setup input for a match, then play every seat from one browser: the shell frames your frontend with a button per seat, a Reset that deals a fresh match, and an Exit that returns to the form. The setup form is built from your game's setup input schema, so it collects the same fields players see. Game frontends need no code for this.
- `tvk` loads the `.env` beside your `tableverse.config.ts`, so `TABLEVERSE_API_URL` and `TABLEVERSE_WEB_URL` can point the CLI at another deployment without exporting them each time. Variables already set in the environment win over the file.
- `publish` names two directories: `publish: { engine: "./engine", frontend: "./client" }`. `buildCommand` and `outDir` are gone — `tvk` reads the frontend's port and build output from the project's own Vite configuration, and a scaffolded project ships no `vite.config.ts`. Update `tableverse.config.ts` to the new shape.
- Updated dependencies
- Updated dependencies
  - @tableverse-kit/config@0.1.0-beta.2
  - @tableverse-kit/engine@0.1.0-beta.1

## 0.1.0-beta.2

### Patch Changes

- `tvk dev` seats a roster that matches the player count your game declares, so a client that names no players starts the match. Scaffolded projects keep the rules-server URL on screen when the frontend starts.
- The CLI reaches the production platform by default. `TABLEVERSE_API_URL` and `TABLEVERSE_WEB_URL` point it at another deployment.
