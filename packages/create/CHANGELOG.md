# create-tableverse

## 0.1.0-beta.3

### Patch Changes

- `publish` names two directories: `publish: { engine: "./engine", frontend: "./client" }`. `buildCommand` and `outDir` are gone — `tvk` reads the frontend's port and build output from the project's own Vite configuration, and a scaffolded project ships no `vite.config.ts`. Update `tableverse.config.ts` to the new shape.

## 0.1.0-beta.2

### Patch Changes

- `tvk dev` seats a roster that matches the player count your game declares, so a client that names no players starts the match. Scaffolded projects keep the rules-server URL on screen when the frontend starts.

## 0.1.0-beta.1

### Patch Changes

- fcfa3b2: Fix create-tableverse scaffolds pinning a stale, lockstep version instead of each package's real current version
