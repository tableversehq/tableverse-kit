export interface RNGState {
  seed: string | number;
  cursor: number;
}

export interface RNGApi {
  number(): number;
  die(sides: number, count?: number): number | number[];
  shuffle<T>(items: readonly T[]): T[];
}
