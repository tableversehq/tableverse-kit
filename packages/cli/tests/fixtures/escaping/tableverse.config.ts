import createFixtureGame from "../game-default.ts";

export default {
  game: createFixtureGame(),
  publish: { engine: "../outside", frontend: "./client" },
};
