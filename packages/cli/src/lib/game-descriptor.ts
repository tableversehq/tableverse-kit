import { Type, type TSchema } from "@sinclair/typebox";
import type {
  CommandSchema,
  FieldType,
  GameDefinition,
  GameState,
  SerializableFieldType,
} from "tabletop-engine";

export interface GeneratedDiscoveryStepDescriptor {
  stepId: string;
  inputSchema: CommandSchema<Record<string, unknown>>;
  outputSchema: CommandSchema<Record<string, unknown>>;
}

export interface GeneratedDiscoveryDescriptor {
  startStep: string;
  steps: GeneratedDiscoveryStepDescriptor[];
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

interface CompiledStateFacadeDefinition {
  root: {
    name: string;
  };
  states: Record<string, CompiledStateDefinition>;
}

interface CompiledStateDefinition {
  fields: Record<string, FieldType>;
  fieldVisibility: Record<string, FieldVisibilityConfig>;
}

interface FieldVisibilityConfig {
  mode: VisibilityMode;
  schema?: SerializableFieldType;
}

type VisibilityMode = "hidden" | "visible_to_self";

export function describeGameForGeneration<
  FacadeGameState extends GameState,
  SetupInput extends object | undefined = undefined,
>(game: GameDefinition<FacadeGameState, SetupInput>): GeneratedGameDescriptor {
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
    viewSchema: createVisibleStateSchema(
      game.stateFacade as CompiledStateFacadeDefinition | undefined,
    ),
  };
}

function normalizeDiscoveryDescriptor(
  commandId: string,
  discovery: GeneratedDiscoveryDescriptor,
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

    if (!isObjectRecord(step.inputSchema)) {
      throw new Error(
        `command_discovery_step_missing_input_schema:${commandId}:${index}`,
      );
    }

    if (!isObjectRecord(step.outputSchema)) {
      throw new Error(
        `command_discovery_step_missing_output_schema:${commandId}:${index}`,
      );
    }

    if (typeof (step as { resolve?: unknown }).resolve !== "function") {
      throw new Error(
        `command_discovery_step_missing_resolve:${commandId}:${index}`,
      );
    }

    normalizedSteps.push({
      stepId: step.stepId,
      inputSchema: step.inputSchema,
      outputSchema: step.outputSchema,
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

function createVisibleStateSchema(
  compiled?: CompiledStateFacadeDefinition,
): TSchema {
  return Type.Object({
    game: compiled
      ? inferStateViewSchema(compiled, compiled.root.name)
      : Type.Unknown(),
    progression: progressionStateSchema,
  });
}

function inferStateViewSchema(
  compiled: CompiledStateFacadeDefinition,
  stateName: string,
): TSchema {
  const state = compiled.states[stateName];

  if (!state) {
    throw new Error(`compiled_state_not_found:${stateName}`);
  }

  return Type.Object(
    Object.fromEntries(
      Object.entries(state.fields).map(([fieldName, fieldType]) => {
        const visibility = state.fieldVisibility[fieldName]?.mode;

        return [
          fieldName,
          inferFieldViewSchema(
            compiled,
            fieldType,
            state.fieldVisibility[fieldName],
            visibility,
          ),
        ];
      }),
    ),
  );
}

function inferFieldViewSchema(
  compiled: CompiledStateFacadeDefinition,
  fieldType: FieldType,
  fieldVisibility: FieldVisibilityConfig | undefined,
  visibility?: VisibilityMode,
): TSchema {
  const visibleSchema = inferVisibleFieldSchema(compiled, fieldType);
  const hiddenSchema = inferHiddenEnvelopeSchema(fieldVisibility?.schema);

  if (visibility === "hidden") {
    return hiddenSchema;
  }

  if (visibility === "visible_to_self") {
    return Type.Union([visibleSchema, hiddenSchema]);
  }

  return visibleSchema;
}

function inferVisibleFieldSchema(
  compiled: CompiledStateFacadeDefinition,
  fieldType: FieldType,
): TSchema {
  if (fieldType.kind === "state") {
    return inferStateViewSchema(compiled, fieldType.target().name);
  }

  if (fieldType.kind === "array") {
    return Type.Array(inferVisibleFieldSchema(compiled, fieldType.item));
  }

  if (fieldType.kind === "record") {
    return Type.Record(
      inferRecordKeySchema(fieldType.key),
      inferVisibleFieldSchema(compiled, fieldType.value),
    );
  }

  if (fieldType.kind === "object") {
    return Type.Object(
      Object.fromEntries(
        Object.entries(fieldType.properties).map(([key, nestedField]) => [
          key,
          inferVisibleFieldSchema(compiled, nestedField),
        ]),
      ),
    );
  }

  if (fieldType.kind === "optional") {
    return Type.Optional(inferVisibleFieldSchema(compiled, fieldType.item));
  }

  return toTypeBoxSchema(fieldType);
}

function inferRecordKeySchema(fieldType: FieldType): TSchema {
  if (fieldType.kind === "string") {
    return fieldType;
  }

  return Type.String();
}

function toTypeBoxSchema(schema: SerializableFieldType | FieldType): TSchema {
  if (schema.kind === "state") {
    return Type.Unknown();
  }

  return schema;
}

function inferHiddenEnvelopeSchema(schema?: SerializableFieldType): TSchema {
  if (!schema) {
    return hiddenEnvelopeSchema;
  }

  return Type.Object({
    __hidden: Type.Literal(true),
    value: toTypeBoxSchema(schema),
  });
}

const hiddenEnvelopeSchema = Type.Object({
  __hidden: Type.Literal(true),
});

const progressionSegmentSchema = Type.Object({
  id: Type.String(),
  kind: Type.Optional(Type.String()),
  parentId: Type.Optional(Type.String()),
  childIds: Type.Array(Type.String()),
  active: Type.Boolean(),
  ownerId: Type.Optional(Type.String()),
});

const progressionStateSchema = Type.Object({
  current: Type.Union([Type.String(), Type.Null()]),
  rootId: Type.Union([Type.String(), Type.Null()]),
  segments: Type.Record(Type.String(), progressionSegmentSchema),
});
