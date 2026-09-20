import type {
  SerializedSetupField,
  SerializedSetupSchema,
} from "@tableverse-kit/engine";

export interface GameInfo {
  name: string;
  playerBounds: { min: number; max: number };
  setupInputSchema: SerializedSetupSchema | null;
}

export interface MatchValues {
  players: string[];
  seed: string;
  setupInput?: Record<string, unknown>;
}

export class ShellRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShellRequestError";
  }
}

export async function fetchFrontendUrl(serverUrl: string): Promise<string> {
  const body = await request(serverUrl, "/shell.json");
  if (!isRecord(body) || typeof body.frontendUrl !== "string") {
    throw new ShellRequestError("tvk dev did not report a frontend address.");
  }
  return body.frontendUrl;
}

export async function fetchGame(serverUrl: string): Promise<GameInfo> {
  const body = await request(serverUrl, "/game");
  if (!isGameInfo(body)) {
    throw new ShellRequestError(
      "tvk dev described the game in an unknown shape.",
    );
  }
  return body;
}

export async function startMatch(
  serverUrl: string,
  values: MatchValues,
): Promise<void> {
  await request(serverUrl, "/initialize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(values),
  });
}

export async function discardMatch(serverUrl: string): Promise<void> {
  await request(serverUrl, "/reset", { method: "POST" });
}

async function request(
  serverUrl: string,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${serverUrl}${path}`, init);
  } catch {
    throw new ShellRequestError("tvk dev is not running.");
  }

  const body: unknown =
    response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    throw new ShellRequestError(
      isRecord(body) && typeof body.error === "string"
        ? body.error
        : `tvk dev answered ${response.status}.`,
    );
  }
  return body;
}

export function isGameInfo(value: unknown): value is GameInfo {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    isRecord(value.playerBounds) &&
    typeof value.playerBounds.min === "number" &&
    typeof value.playerBounds.max === "number" &&
    (value.setupInputSchema === null || isSetupSchema(value.setupInputSchema))
  );
}

function isSetupSchema(value: unknown): value is SerializedSetupSchema {
  return isRecord(value) && value.kind === "object" && isFieldMap(value.fields);
}

function isFieldMap(
  value: unknown,
): value is Record<string, SerializedSetupField> {
  return isRecord(value) && Object.values(value).every(isSetupField);
}

function isSetupField(value: unknown): value is SerializedSetupField {
  if (!isRecord(value) || !isOptionalFlag(value.optional)) {
    return false;
  }
  switch (value.kind) {
    case "number":
      return (
        isOptionalNumber(value.min) &&
        isOptionalNumber(value.max) &&
        (value.enum === undefined ||
          (Array.isArray(value.enum) &&
            value.enum.every((entry) => typeof entry === "number")))
      );
    case "string":
      return (
        isOptionalNumber(value.min) &&
        isOptionalNumber(value.max) &&
        (value.enum === undefined ||
          (Array.isArray(value.enum) &&
            value.enum.every((entry) => typeof entry === "string")))
      );
    case "boolean":
      return true;
    case "object":
      return isFieldMap(value.fields);
    case "array":
      return isSetupField(value.item);
    case "record":
      return isSetupField(value.value);
    default:
      return false;
  }
}

function isOptionalFlag(value: unknown): boolean {
  return value === undefined || typeof value === "boolean";
}

function isOptionalNumber(value: unknown): boolean {
  return value === undefined || typeof value === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
