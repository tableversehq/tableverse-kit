import type { FieldType } from "../schema";
import type {
  AnyGameStateDefinition,
  StateVisibilityEntry,
} from "../state/game-state";

export interface CompiledStateDefinition {
  state: AnyGameStateDefinition;
  model: Record<string, FieldType>;
  visibility: readonly StateVisibilityEntry[];
  ownedByField?: string;
}

export interface CompiledStateFacadeDefinition {
  root: AnyGameStateDefinition;
  states: Map<AnyGameStateDefinition, CompiledStateDefinition>;
}

export function compileStateFacadeDefinition(
  root: AnyGameStateDefinition,
): CompiledStateFacadeDefinition {
  const states = new Map<AnyGameStateDefinition, CompiledStateDefinition>();

  visitState(root, states, false);

  return {
    root,
    states,
  };
}

function visitState(
  state: AnyGameStateDefinition,
  states: Map<AnyGameStateDefinition, CompiledStateDefinition>,
  hasOwningPlayerAncestor: boolean,
): void {
  if (states.has(state)) {
    return;
  }

  const ownedByField = validateAndReadOwnedByField(state);
  validateVisibilityFields(state);
  validateVisibleFieldOwnership(
    state.visibility,
    hasOwningPlayerAncestor || ownedByField !== undefined,
  );

  states.set(state, {
    state,
    model: {
      ...state.model,
    },
    visibility: state.visibility,
    ownedByField,
  });

  for (const field of Object.values(state.model)) {
    visitNestedFieldTargets(
      field,
      states,
      hasOwningPlayerAncestor || ownedByField !== undefined,
    );
  }
}

function visitNestedFieldTargets(
  field: FieldType,
  states: Map<AnyGameStateDefinition, CompiledStateDefinition>,
  hasOwningPlayerAncestor: boolean,
): void {
  if (field.kind === "state") {
    visitState(field.target, states, hasOwningPlayerAncestor);
    return;
  }

  if (field.kind === "array") {
    visitNestedFieldTargets(field.item, states, hasOwningPlayerAncestor);
    return;
  }

  if (field.kind === "record") {
    visitNestedFieldTargets(field.value, states, hasOwningPlayerAncestor);
    return;
  }

  if (field.kind === "object") {
    for (const nestedField of Object.values(field.properties)) {
      visitNestedFieldTargets(nestedField, states, hasOwningPlayerAncestor);
    }
    return;
  }

  if (field.kind === "optional") {
    visitNestedFieldTargets(field.item, states, hasOwningPlayerAncestor);
  }
}

function validateAndReadOwnedByField(
  state: AnyGameStateDefinition,
): string | undefined {
  const ownedByEntries = state.visibility.filter(
    (entry) => entry.kind === "ownedBy",
  );

  if (ownedByEntries.length === 0) {
    return undefined;
  }

  if (ownedByEntries.length > 1) {
    throw new Error("duplicate_owned_by_field");
  }

  const ownedByField = ownedByEntries[0]!.fieldName;

  if (!(ownedByField in state.model)) {
    throw new Error(`owned_by_field_not_found:${ownedByField}`);
  }

  if (state.model[ownedByField]?.kind !== "string") {
    throw new Error(`owned_by_field_requires_string_field:${ownedByField}`);
  }

  return ownedByField;
}

function validateVisibilityFields(state: AnyGameStateDefinition): void {
  const configuredFields = new Set<string>();

  for (const entry of state.visibility) {
    if (!(entry.fieldName in state.model)) {
      throw new Error(`visibility_field_not_found:${entry.fieldName}`);
    }

    if (entry.kind !== "field") {
      continue;
    }

    if (configuredFields.has(entry.fieldName)) {
      throw new Error(`duplicate_visibility_field:${entry.fieldName}`);
    }

    configuredFields.add(entry.fieldName);
  }
}

function validateVisibleFieldOwnership(
  visibility: readonly StateVisibilityEntry[],
  hasOwningPlayerAncestor: boolean,
): void {
  for (const entry of visibility) {
    if (
      entry.kind === "field" &&
      entry.mode === "visibleToSelf" &&
      !hasOwningPlayerAncestor
    ) {
      throw new Error(
        `visible_to_self_requires_owned_player_ancestor:${entry.fieldName}`,
      );
    }
  }
}
