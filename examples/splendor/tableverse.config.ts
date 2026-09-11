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
