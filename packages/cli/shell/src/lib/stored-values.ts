import type { FormValues } from "./setup-input.ts";

export interface StoredValues {
  seats: number;
  seed: string;
  setup: FormValues;
}

export interface ValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY_PREFIX = "tvk-dev:setup:";

export function loadStoredValues(
  store: ValueStore,
  game: string,
): StoredValues | null {
  try {
    const raw = store.getItem(KEY_PREFIX + game);
    if (raw === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return isStoredValues(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveStoredValues(
  store: ValueStore,
  game: string,
  values: StoredValues,
): boolean {
  try {
    store.setItem(KEY_PREFIX + game, JSON.stringify(values));
    return true;
  } catch {
    return false;
  }
}

function isStoredValues(value: unknown): value is StoredValues {
  return (
    isRecord(value) &&
    typeof value.seats === "number" &&
    typeof value.seed === "string" &&
    isRecord(value.setup) &&
    Object.values(value.setup).every(
      (entry) => typeof entry === "string" || typeof entry === "boolean",
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
