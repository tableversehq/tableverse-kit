import type { CompiledStateFacadeDefinition } from "./compile";
import type { FieldType } from "../schema";
import type {
  FieldVisibilityConfig,
  GameStateClass,
  VisibilityMode,
} from "./metadata";
import { hydrateStateNode } from "./hydrate";
import type { CanonicalState } from "../types/state";
import type { HiddenValue, Viewer, VisibleState } from "../types/visibility";

export function getView<TGameState extends object>(
  state: CanonicalState<TGameState>,
  viewer: Viewer,
  compiled?: CompiledStateFacadeDefinition,
): VisibleState<object> {
  if (!compiled) {
    return {
      game: structuredClone(state.game) as object,
      progression: structuredClone(state.runtime.progression),
    };
  }

  return {
    game: projectStateNode(
      compiled,
      compiled.root,
      state.game,
      viewer,
    ) as object,
    progression: structuredClone(state.runtime.progression),
  };
}

function projectStateNode(
  compiled: CompiledStateFacadeDefinition,
  target: GameStateClass,
  backing: unknown,
  viewer: Viewer,
  ownerPlayerId?: string,
): unknown {
  if (!backing || typeof backing !== "object" || Array.isArray(backing)) {
    return {};
  }

  const definition = compiled.states[target.name];

  if (!definition) {
    throw new Error(`compiled_state_not_found:${target.name || "anonymous"}`);
  }

  const nextOwnerPlayerId = definition.ownedByField
    ? readOwnerPlayerId(target, backing, definition.ownedByField)
    : ownerPlayerId;
  const projected: Record<string, unknown> = {};
  let readonlyFacade: object | undefined;

  function getReadonlyFacade(): object {
    if (!readonlyFacade) {
      readonlyFacade = hydrateStateNode(compiled, target, backing as object, {
        readonly: true,
      });
    }

    return readonlyFacade;
  }

  for (const [fieldName, fieldType] of Object.entries(definition.fields)) {
    const visibility = definition.fieldVisibility[fieldName]?.mode;
    const fieldValue = (backing as Record<string, unknown>)[fieldName];

    if (visibility && shouldHideField(visibility, viewer, nextOwnerPlayerId)) {
      projected[fieldName] = createHiddenValue(
        definition.fieldVisibility[fieldName],
        fieldValue,
        getReadonlyFacade,
      );
      continue;
    }

    projected[fieldName] = projectFieldValue(
      compiled,
      fieldType,
      fieldValue,
      viewer,
      nextOwnerPlayerId,
    );
  }

  return projected;
}

function projectFieldValue(
  compiled: CompiledStateFacadeDefinition,
  fieldType: FieldType,
  value: unknown,
  viewer: Viewer,
  ownerPlayerId?: string,
): unknown {
  if (
    value === null ||
    value === undefined ||
    fieldType.kind === "number" ||
    fieldType.kind === "string" ||
    fieldType.kind === "boolean"
  ) {
    return value;
  }

  if (fieldType.kind === "state") {
    return projectStateNode(
      compiled,
      fieldType.target(),
      value,
      viewer,
      ownerPlayerId,
    );
  }

  if (fieldType.kind === "array") {
    if (!Array.isArray(value)) {
      return value;
    }

    return value.map((item) =>
      projectFieldValue(compiled, fieldType.item, item, viewer, ownerPlayerId),
    );
  }

  if (fieldType.kind === "record") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [
        key,
        projectFieldValue(
          compiled,
          fieldType.value,
          entryValue,
          viewer,
          ownerPlayerId,
        ),
      ]),
    );
  }

  if (fieldType.kind === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(fieldType.properties).map(([key, propertyType]) => [
        key,
        projectFieldValue(
          compiled,
          propertyType,
          (value as Record<string, unknown>)[key],
          viewer,
          ownerPlayerId,
        ),
      ]),
    );
  }

  if (fieldType.kind === "optional") {
    return projectFieldValue(
      compiled,
      fieldType.item,
      value,
      viewer,
      ownerPlayerId,
    );
  }

  return value;
}

function shouldHideField(
  visibility: VisibilityMode,
  viewer: Viewer,
  ownerPlayerId?: string,
): boolean {
  if (visibility === "hidden") {
    return true;
  }

  return !(viewer.kind === "player" && viewer.playerId === ownerPlayerId);
}

function readOwnerPlayerId(
  target: GameStateClass,
  backing: unknown,
  ownedByField: string,
): string | undefined {
  const ownerPlayerId =
    backing && typeof backing === "object"
      ? (backing as Record<string, unknown>)[ownedByField]
      : undefined;

  if (typeof ownerPlayerId === "string" && ownerPlayerId.length > 0) {
    return ownerPlayerId;
  }

  throw new Error(
    `owned_by_field_requires_non_empty_string_value:${
      target.name || "anonymous"
    }:${ownedByField}`,
  );
}

function createHiddenValue(
  visibility: FieldVisibilityConfig | undefined,
  value: unknown,
  getReadonlyFacade: () => object,
): HiddenValue {
  const summaryValue = visibility?.derive?.(value, getReadonlyFacade());

  if (summaryValue === undefined) {
    return {
      __hidden: true,
    };
  }

  return {
    __hidden: true,
    value: summaryValue,
  };
}
