import type { TSchema } from "@sinclair/typebox";
import type { CommandSchema, AnyGameDefinition } from "@tableverse-kit/engine";

export interface GeneratedDiscoveryStepDescriptor {
  stepId: string;
  inputSchema: CommandSchema<Record<string, unknown>>;
  outputSchema: CommandSchema<Record<string, unknown>>;
}

export interface GeneratedDiscoveryDescriptor {
  startStep: string;
  steps: readonly GeneratedDiscoveryStepDescriptor[];
}

interface SourceDiscoveryStepDescriptor {
  stepId: string;
  inputSchema: unknown;
  outputSchema: unknown;
  resolve?: unknown;
}

interface SourceDiscoveryDescriptor {
  startStep: string;
  steps: readonly SourceDiscoveryStepDescriptor[];
}

export interface GeneratedCommandDescriptor {
  commandId: string;
  commandSchema: CommandSchema<Record<string, unknown>>;
  discovery?: GeneratedDiscoveryDescriptor;
}

export interface GeneratedGameDescriptor {
  name: string;
  commands: Record<string, GeneratedCommandDescriptor>;
  viewSchema: TSchema;
}

export const hostedMessageNames = {
  listAvailableCommands: "game_list_available_commands",
  availableCommands: "game_available_commands",
  discover: "game_discover",
  discoveryResult: "game_discovery_result",
  execute: "game_execute",
  executionResult: "game_execution_result",
  gameSnapshot: "game_snapshot",
  gameEnded: "game_ended",
  error: "error",
} as const;

export type HostedMessageNames = typeof hostedMessageNames;

export function toJsonSchema(schema: unknown): Record<string, unknown> {
  const candidate =
    isObjectRecord(schema) && isObjectRecord(schema.schema)
      ? schema.schema
      : schema;

  if (!isObjectRecord(candidate)) {
    throw new Error("invalid_json_schema");
  }

  return candidate;
}

export function describeGameForGeneration(
  game: AnyGameDefinition,
): GeneratedGameDescriptor {
  const commands: Record<string, GeneratedCommandDescriptor> = {};

  for (const [commandId, command] of Object.entries(game.commands)) {
    if (!command.commandSchema) {
      throw new Error(`command_payload_schema_required:${commandId}`);
    }

    const discovery = command.discovery
      ? normalizeDiscoveryDescriptor(commandId, command.discovery)
      : undefined;

    commands[commandId] = {
      commandId,
      commandSchema: command.commandSchema,
      discovery,
    };
  }

  return {
    name: game.name,
    commands,
    viewSchema: game.visibleStateSchema,
  };
}

function normalizeDiscoveryDescriptor(
  commandId: string,
  discovery: SourceDiscoveryDescriptor,
): GeneratedDiscoveryDescriptor {
  if (!Array.isArray(discovery.steps) || discovery.steps.length === 0) {
    throw new Error(`command_discovery_steps_required:${commandId}`);
  }

  const normalizedSteps: GeneratedDiscoveryStepDescriptor[] = [];
  const knownStepIds = new Set<string>();

  for (const [index, step] of discovery.steps.entries()) {
    if (!isObjectRecord(step)) {
      throw new Error(`command_discovery_step_invalid:${commandId}:${index}`);
    }

    if (typeof step.stepId !== "string" || step.stepId.length === 0) {
      throw new Error(
        `command_discovery_step_missing_step_id:${commandId}:${index}`,
      );
    }

    if (knownStepIds.has(step.stepId)) {
      throw new Error(
        `command_discovery_duplicate_step_id:${commandId}:${step.stepId}`,
      );
    }
    knownStepIds.add(step.stepId);

    const inputSchema = step.inputSchema;
    const outputSchema = step.outputSchema;

    if (!isCommandSchema(inputSchema)) {
      throw new Error(
        `command_discovery_step_missing_input_schema:${commandId}:${index}`,
      );
    }

    if (!isCommandSchema(outputSchema)) {
      throw new Error(
        `command_discovery_step_missing_output_schema:${commandId}:${index}`,
      );
    }

    if (typeof step.resolve !== "function") {
      throw new Error(
        `command_discovery_step_missing_resolve:${commandId}:${index}`,
      );
    }

    normalizedSteps.push({
      stepId: step.stepId,
      inputSchema,
      outputSchema,
    });
  }

  if (
    typeof discovery.startStep !== "string" ||
    discovery.startStep.length === 0 ||
    !knownStepIds.has(discovery.startStep)
  ) {
    throw new Error(`command_discovery_unknown_start_step:${commandId}`);
  }

  return {
    startStep: discovery.startStep,
    steps: normalizedSteps,
  };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCommandSchema(
  value: unknown,
): value is CommandSchema<Record<string, unknown>> {
  return isObjectRecord(value);
}
