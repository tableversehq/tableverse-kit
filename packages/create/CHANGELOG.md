# create-tableverse

## 0.1.0-beta.5

### Patch Changes

- A scaffolded project is a playable two-player tic-tac-toe game. `npm run dev` opens the developer shell on a board you can play from both seats: the engine owns turn order, win and draw detection, and the end of the game, while the frontend renders it in plain TypeScript and CSS with no framework to learn. The README maps each file to the part of the game it holds, so replacing `engine/src` and `client/src` with your own rules and UI is the obvious next step.

## 0.1.0-beta.4

### Patch Changes

- 95f2fb3: `tvk dev` offers one address. The frontend's dev server starts quietly, so the only link on screen is the shell's, `http://localhost:5100` by default, under a short note on how to open and stop it. Frontend warnings and build errors still reach the terminal.

## 0.1.0-beta.3

### Patch Changes

- `publish` names two directories: `publish: { engine: "./engine", frontend: "./client" }`. `buildCommand` and `outDir` are gone — `tvk` reads the frontend's port and build output from the project's own Vite configuration, and a scaffolded project ships no `vite.config.ts`. Update `tableverse.config.ts` to the new shape.

## 0.1.0-beta.2

### Patch Changes

- `tvk dev` seats a roster that matches the player count your game declares, so a client that names no players starts the match. Scaffolded projects keep the rules-server URL on screen when the frontend starts.

## 0.1.0-beta.1

### Patch Changes

- fcfa3b2: Fix create-tableverse scaffolds pinning a stale, lockstep version instead of each package's real current version
