---
"@tableverse-kit/cli": patch
"@tableverse-kit/config": patch
"create-tableverse": patch
---

`publish` names two directories: `publish: { engine: "./engine", frontend: "./client" }`. `buildCommand` and `outDir` are gone — `tvk` reads the frontend's port and build output from the project's own Vite configuration, and a scaffolded project ships no `vite.config.ts`. Update `tableverse.config.ts` to the new shape.
