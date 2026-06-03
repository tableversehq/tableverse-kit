import {
  type FieldVisibilityConfig,
  type GameStateClass,
  getStateMetadata,
} from "./metadata";
import type { FieldType } from "../schema";

export interface CompiledStateDefinition {
  type: GameStateClass;
  fields: Record<string, FieldType>;
  fieldVisibility: Record<string, FieldVisibilityConfig>;
  ownedByField?: string;
}

export interface CompiledStateFacadeDefinition {
  root: GameStateClass;
  states: Record<string, CompiledStateDefinition>;
}

export function compileStateFacadeDefinition(
  root: GameStateClass,
): CompiledStateFacadeDefinition {
  const states: Record<string, CompiledStateDefinition> = {};
  const visited = new Set<GameStateClass>();

  visitState(root, states, visited, false);

  return {
    root,
    states,
  };
}

function visitState(
  target: GameStateClass,
  states: Record<string, CompiledStateDefinition>,
  visited: Set<GameStateClass>,
  hasOwningPlayerAncestor: boolean,
): void {
  if (visited.has(target)) {
    return;
  }

  const metadata = getStateMetadata(target);
  validateVisibilityFields(target, metadata.fields, metadata.fieldVisibility);
  validateOwnedByField(target, metadata.fields, metadata.ownedByField);
  validateVisibleFieldOwnership(
    metadata.fieldVisibility,
    hasOwningPlayerAncestor || metadata.ownedByField !== undefined,
  );
  visited.add(target);
  states[target.name] = {
    type: target,
    fields: {
      ...metadata.fields,
    },
    fieldVisibility: {
      ...metadata.fieldVisibility,
    },
    ownedByField: metadata.ownedByField,
  };

  for (const field of Object.values(metadata.fields)) {
    visitNestedFieldTargets(
      field,
      states,
      visited,
      hasOwningPlayerAncestor || metadata.ownedByField !== undefined,
    );
  }
}

function visitNestedFieldTargets(
  field: FieldType,
  states: Record<string, CompiledStateDefinition>,
  visited: Set<GameStateClass>,
  hasOwningPlayerAncestor: boolean,
): void {
  if (field.kind === "state") {
    visitNestedStateTarget(
      field.target(),
      states,
      visited,
      hasOwningPlayerAncestor,
    );
    return;
  }

  if (field.kind === "array") {
    visitNestedFieldTargets(
      field.item,
      states,
      visited,
      hasOwningPlayerAncestor,
    );
    return;
  }

  if (field.kind === "record") {
    visitNestedFieldTargets(
      field.value,
      states,
      visited,
      hasOwningPlayerAncestor,
    );
    return;
  }

  if (field.kind === "object") {
    for (const nestedField of Object.values(field.properties)) {
      visitNestedFieldTargets(
        nestedField,
        states,
        visited,
        hasOwningPlayerAncestor,
      );
    }
    return;
  }

  if (field.kind === "optional") {
    visitNestedFieldTargets(
      field.item,
      states,
      visited,
      hasOwningPlayerAncestor,
    );
  }
}

function visitNestedStateTarget(
  nestedTarget: GameStateClass,
  states: Record<string, CompiledStateDefinition>,
  visited: Set<GameStateClass>,
  hasOwningPlayerAncestor: boolean,
): void {
  getStateMetadata(nestedTarget);
  visitState(nestedTarget, states, visited, hasOwningPlayerAncestor);
}

function validateOwnedByField(
  target: GameStateClass,
  fields: Record<string, FieldType>,
  ownedByField: string | undefined,
) {
  if (!ownedByField) {
    return;
  }

  if (!(ownedByField in fields)) {
    throw new Error(
      `owned_by_field_not_found:${target.name || "anonymous"}:${ownedByField}`,
    );
  }

  if (fields[ownedByField]?.kind !== "string") {
    throw new Error(
      `owned_by_field_requires_string_field:${target.name || "anonymous"}:${ownedByField}`,
    );
  }
}

function validateVisibilityFields(
  target: GameStateClass,
  fields: Record<string, FieldType>,
  fieldVisibility: Record<string, FieldVisibilityConfig>,
) {
  for (const fieldName of Object.keys(fieldVisibility)) {
    if (!(fieldName in fields)) {
      throw new Error(
        `visibility_field_not_found:${target.name || "anonymous"}:${fieldName}`,
      );
    }
  }
}

function validateVisibleFieldOwnership(
  fieldVisibility: Record<string, FieldVisibilityConfig>,
  hasOwningPlayerAncestor: boolean,
) {
  for (const [fieldName, visibility] of Object.entries(fieldVisibility)) {
    if (visibility.mode === "visible_to_self" && !hasOwningPlayerAncestor) {
      throw new Error(
        `visible_to_self_requires_owned_player_ancestor:${fieldName}`,
      );
    }
  }
}
