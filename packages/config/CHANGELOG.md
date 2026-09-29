# @tableverse-kit/config

## 0.1.0-beta.2

### Patch Changes

- `publish` names two directories: `publish: { engine: "./engine", frontend: "./client" }`. `buildCommand` and `outDir` are gone — `tvk` reads the frontend's port and build output from the project's own Vite configuration, and a scaffolded project ships no `vite.config.ts`. Update `tableverse.config.ts` to the new shape.
- Updated dependencies
  - @tableverse-kit/engine@0.1.0-beta.1
