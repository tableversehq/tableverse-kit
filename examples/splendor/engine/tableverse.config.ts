import { defineConfig } from "@tableverse-kit/engine/config";
import { createSplendorGame } from "./src/game.ts";

export default defineConfig({
  game: createSplendorGame(),
  outDir: "./generated",
});
