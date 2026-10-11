import { defineConfig } from "@tableverse-kit/config";
import { game } from "./engine/src/game.ts";

export default defineConfig({
  game,
  publish: {
    engine: "./engine",
    frontend: "./client",
  },
});
