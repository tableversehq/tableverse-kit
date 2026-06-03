import { nextRandomNumber } from "./prng";
import type { RNGApi, RNGState } from "../types/rng";

export function createRNGService(state: RNGState): RNGApi {
  const next = () => {
    const value = nextRandomNumber(state.seed, state.cursor);
    state.cursor += 1;
    return value;
  };

  return {
    number() {
      return next();
    },

    die(sides, count) {
      const roll = () => Math.floor(next() * sides) + 1;

      if (count === undefined) {
        return roll();
      }

      return Array.from({ length: count }, () => roll());
    },

    shuffle(items) {
      const shuffled = [...items];

      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(next() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [
          shuffled[swapIndex] as (typeof shuffled)[number],
          shuffled[index] as (typeof shuffled)[number],
        ];
      }

      return shuffled;
    },
  };
}
