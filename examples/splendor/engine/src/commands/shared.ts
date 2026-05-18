import type {
  CommandFactory,
  DefinedCommand,
  ValidationOutcome,
} from "@tabletop-kit/engine";
import { createCommandFactory } from "@tabletop-kit/engine";
import {
  DEVELOPMENT_LEVELS,
  GEM_TOKEN_COLORS,
  type DevelopmentLevel,
  type GemTokenColor,
  type SplendorGameState,
} from "../state.ts";

export const defineSplendorCommand: CommandFactory<SplendorGameState> =
  createCommandFactory<SplendorGameState>();

export type SplendorCommand = DefinedCommand<SplendorGameState>;

export function isGemTokenColor(value: unknown): value is GemTokenColor {
  return (
    typeof value === "string" &&
    (GEM_TOKEN_COLORS as readonly string[]).includes(value)
  );
}

export function isDevelopmentLevel(value: unknown): value is DevelopmentLevel {
  return (
    typeof value === "number" &&
    (DEVELOPMENT_LEVELS as readonly number[]).includes(value)
  );
}

export function assertGemTokenColor(value: unknown): GemTokenColor {
  if (!isGemTokenColor(value)) {
    throw new Error("invalid_color");
  }

  return value;
}

export function assertDevelopmentLevel(value: unknown): DevelopmentLevel {
  if (!isDevelopmentLevel(value)) {
    throw new Error("invalid_level");
  }

  return value;
}

export function guardedValidate(
  run: () => ValidationOutcome,
): ValidationOutcome {
  try {
    return run();
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "invalid_command",
    };
  }
}

export function guardedAvailability(run: () => boolean): boolean {
  try {
    return run();
  } catch {
    return false;
  }
}
