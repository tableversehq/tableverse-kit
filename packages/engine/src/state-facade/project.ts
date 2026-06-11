import type { CompiledStateFacadeDefinition } from "./compile";
import type { FieldType } from "../schema";
import type {
  FieldVisibilityEntry,
  AnyGameStateDefinition,
  HiddenValue,
} from "../state/game-state";
import { hydrateStateNode } from "./hydrate";
import type { CanonicalState } from "../types/state";
import type { Viewer, VisibleState } from "../types/visibility";

export function getView<TCanonicalGame extends object>(
  state: CanonicalState<TCanonicalGame>,
  viewer: Viewer,
): VisibleState<TCanonicalGame>;

export function getView<
  TCanonicalGame extends object,
  TVisibleGame extends object,
>(
  state: CanonicalState<TCanonicalGame>,
  viewer: Viewer,
  compiled: CompiledStateFacadeDefinition,
): VisibleState<TVisibleGame>;

export function getView(
  state: CanonicalState<object>,
  viewer: Viewer,
  compiled?: CompiledStateFacadeDefinition,
): VisibleState<object> {
  if (!compiled) {
    return {
      game: structuredClone(state.game),
      progression: structuredClone(state.runtime.progression),
    };
  }

  return {
    game: projectStateNode(compiled, compiled.root, state.game, viewer),
    progression: structuredClone(state.runtime.progression),
  };
}

function projectStateNode(
  compiled: CompiledStateFacadeDefinition,
  state: AnyGameStateDefinition,
  backing: unknown,
  viewer: Viewer,
  ownerPlayerId?: string,
): object {
  if (!backing || typeof backing !== "object" || Array.isArray(backing)) {
    return {};
  }

  const definition = compiled.states.get(state);

  if (!definition) {
    throw new Error(
      `compiled_state_not_found:${state.stateClass.name || "anonymous"}`,
    );
  }

  const nextOwnerPlayerId = definition.ownedByField
    ? readOwnerPlayerId(state, backing, definition.ownedByField)
    : ownerPlayerId;
  const projected: Record<string, unknown> = {};
  let readonlyFacade: object | undefined;

  function getReadonlyFacade(): object {
    if (!readonlyFacade) {
      readonlyFacade = hydrateStateNode(compiled, state, backing as object, {
        readonly: true,
      });
    }

    return readonlyFacade;
  }

  for (const [fieldName, fieldType] of Object.entries(definition.model)) {
    const visibility = getFieldVisibility(definition.visibility, fieldName);
    const fieldValue = (backing as Record<string, unknown>)[fieldName];

    if (
      visibility &&
      shouldHideField(visibility.mode, viewer, nextOwnerPlayerId)
    ) {
      projected[fieldName] = createHiddenValue(
        visibility,
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
      fieldType.target,
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

function getFieldVisibility(
  visibility: readonly { kind: string; fieldName: string }[],
  fieldName: string,
): FieldVisibilityEntry | undefined {
  return visibility.find(
    (entry): entry is FieldVisibilityEntry =>
      entry.kind === "field" && entry.fieldName === fieldName,
  );
}

function shouldHideField(
  visibility: "hidden" | "visibleToSelf",
  viewer: Viewer,
  ownerPlayerId?: string,
): boolean {
  if (visibility === "hidden") {
    return true;
  }

  return !(viewer.kind === "player" && viewer.playerId === ownerPlayerId);
}

function readOwnerPlayerId(
  state: AnyGameStateDefinition,
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
      state.stateClass.name || "anonymous"
    }:${ownedByField}`,
  );
}

function createHiddenValue(
  visibility: FieldVisibilityEntry | undefined,
  value: unknown,
  getReadonlyFacade: () => object,
): HiddenValue | HiddenValue<unknown> {
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
