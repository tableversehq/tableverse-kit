import type { RNGApi } from "@tableverse-kit/engine";

function mix(n: number): number {
  let h = Math.floor(n * 4294967296) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// The platform RNG's consecutive draws are strongly correlated; a finalizer
// decorrelates them while keeping every draw deterministic.
export function whiten(rng: RNGApi): RNGApi {
  const number = () => mix(rng.number());
  const roll = (sides: number) => 1 + Math.floor(number() * sides);
  return {
    number,
    die: (sides: number, count?: number) =>
      count === undefined
        ? roll(sides)
        : Array.from({ length: count }, () => roll(sides)),
    shuffle: <T>(items: readonly T[]): T[] => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(number() * (i + 1));
        const a = out[i],
          b = out[j];
        if (a === undefined || b === undefined) continue;
        out[i] = b;
        out[j] = a;
      }
      return out;
    },
  };
}
