import { defineConfig } from "@tabletop-kit/engine/config";
import { createFixtureGame } from "./game-named.ts";

export default defineConfig({
  game: createFixtureGame(),
  outDir: "./custom-generated",
});
