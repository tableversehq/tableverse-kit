import type {
  CompiledStateDefinition,
  CompiledStateFacadeDefinition,
} from "./compile";
import type { FieldType } from "../schema";
import type { GameState, GameStateClass } from "./metadata";

export function hydrateStateFacade<TState extends GameState>(
  compiled: CompiledStateFacadeDefinition,
  backing: object,
  options?: {
    readonly?: boolean;
  },
): TState {
  const mutationContext: MutationContext = {
    readonlyMode: options?.readonly ?? false,
    mutationDepth: 0,
  };

  return hydrateStateInstance(
    compiled,
    compiled.root,
    backing,
    mutationContext,
  ) as TState;
}

export function hydrateStateNode<TState extends object>(
  compiled: CompiledStateFacadeDefinition,
  target: GameStateClass,
  backing: object,
  options?: {
    readonly?: boolean;
  },
): TState {
  const mutationContext: MutationContext = {
    readonlyMode: options?.readonly ?? false,
    mutationDepth: 0,
  };

  return hydrateStateInstance(
    compiled,
    target,
    backing,
    mutationContext,
  ) as TState;
}

function hydrateStateInstance(
  compiled: CompiledStateFacadeDefinition,
  target: GameStateClass,
  backing: object,
  mutationContext: MutationContext,
): object {
  const definition = getCompiledStateDefinition(compiled, target);
  const instance = new target();
  const nestedCache = new Map<string, unknown>();

  for (const [fieldName, field] of Object.entries(definition.fields)) {
    if (isPrimitiveDataField(field)) {
      Object.defineProperty(instance, fieldName, {
        enumerable: true,
        configurable: true,
        get() {
          return (backing as Record<string, unknown>)[fieldName];
        },
        set(value: unknown) {
          if (mutationContext.readonlyMode) {
            throw new Error(`readonly_state_facade_mutation:${fieldName}`);
          }
          if (mutationContext.mutationDepth === 0) {
            throw new Error(`direct_state_mutation_not_allowed:${fieldName}`);
          }

          (backing as Record<string, unknown>)[fieldName] = value;
        },
      });
      continue;
    }

    Object.defineProperty(instance, fieldName, {
      enumerable: true,
      configurable: true,
      get() {
        if (nestedCache.has(fieldName)) {
          return nestedCache.get(fieldName);
        }

        const nestedBacking = (backing as Record<string, unknown>)[fieldName];

        const nestedFacade = hydrateFieldValue(
          compiled,
          field,
          nestedBacking,
          mutationContext,
        );
        nestedCache.set(fieldName, nestedFacade);
        return nestedFacade;
      },
      set(value: unknown) {
        if (mutationContext.readonlyMode) {
          throw new Error(`readonly_state_facade_mutation:${fieldName}`);
        }
        if (mutationContext.mutationDepth === 0) {
          throw new Error(`direct_state_mutation_not_allowed:${fieldName}`);
        }

        nestedCache.delete(fieldName);
        (backing as Record<string, unknown>)[fieldName] = value;
      },
    });
  }

  wrapStateMethods(instance, mutationContext);
  return instance;
}

function hydrateFieldValue(
  compiled: CompiledStateFacadeDefinition,
  field: FieldType,
  backing: unknown,
  mutationContext: MutationContext,
): unknown {
  if (
    backing === null ||
    backing === undefined ||
    typeof backing !== "object"
  ) {
    return backing;
  }

  if (field.kind === "state") {
    return hydrateStateInstance(
      compiled,
      field.target(),
      backing,
      mutationContext,
    );
  }

  if (field.kind === "array" && Array.isArray(backing)) {
    return createArrayFacade(compiled, backing, field.item, mutationContext);
  }

  if (field.kind === "record" && !Array.isArray(backing)) {
    return createRecordFacade(compiled, backing, field.value, mutationContext);
  }

  if (field.kind === "object" && !Array.isArray(backing)) {
    return createObjectFacade(
      compiled,
      backing,
      field.properties,
      mutationContext,
    );
  }

  if (field.kind === "optional") {
    return hydrateFieldValue(compiled, field.item, backing, mutationContext);
  }

  return backing;
}

function createArrayFacade(
  compiled: CompiledStateFacadeDefinition,
  backing: unknown[],
  itemType: FieldType,
  mutationContext: MutationContext,
): unknown[] {
  const cache = new Map<string, unknown>();

  return new Proxy(backing, {
    get(target, property, receiver) {
      if (typeof property === "string" && isArrayIndex(property)) {
        if (cache.has(property)) {
          return cache.get(property);
        }

        const value = hydrateFieldValue(
          compiled,
          itemType,
          target[Number(property)],
          mutationContext,
        );
        cache.set(property, value);
        return value;
      }

      const value = Reflect.get(target, property, receiver);

      if (typeof value === "function") {
        return value.bind(receiver);
      }

      return value;
    },

    set(target, property, value, receiver) {
      assertCollectionMutationAllowed(mutationContext, String(property));
      cache.delete(String(property));
      return Reflect.set(target, property, value, receiver);
    },

    deleteProperty(target, property) {
      assertCollectionMutationAllowed(mutationContext, String(property));
      cache.delete(String(property));
      return Reflect.deleteProperty(target, property);
    },

    defineProperty(target, property, descriptor) {
      assertCollectionMutationAllowed(mutationContext, String(property));
      cache.delete(String(property));
      return Reflect.defineProperty(target, property, descriptor);
    },
  });
}

function createRecordFacade(
  compiled: CompiledStateFacadeDefinition,
  backing: object,
  valueType: FieldType,
  mutationContext: MutationContext,
): object {
  const cache = new Map<string, unknown>();

  return new Proxy(backing, {
    get(target, property, receiver) {
      if (typeof property !== "string") {
        return Reflect.get(target, property, receiver);
      }

      if (cache.has(property)) {
        return cache.get(property);
      }

      const value = hydrateFieldValue(
        compiled,
        valueType,
        (target as Record<string, unknown>)[property],
        mutationContext,
      );
      cache.set(property, value);
      return value;
    },

    set(target, property, value, receiver) {
      assertCollectionMutationAllowed(mutationContext, String(property));
      cache.delete(String(property));
      return Reflect.set(target, property, value, receiver);
    },

    deleteProperty(target, property) {
      assertCollectionMutationAllowed(mutationContext, String(property));
      cache.delete(String(property));
      return Reflect.deleteProperty(target, property);
    },

    defineProperty(target, property, descriptor) {
      assertCollectionMutationAllowed(mutationContext, String(property));
      cache.delete(String(property));
      return Reflect.defineProperty(target, property, descriptor);
    },
  });
}

function createObjectFacade(
  compiled: CompiledStateFacadeDefinition,
  backing: object,
  properties: Record<string, FieldType>,
  mutationContext: MutationContext,
): object {
  const cache = new Map<string, unknown>();

  return new Proxy(backing, {
    get(target, property, receiver) {
      if (typeof property !== "string") {
        return Reflect.get(target, property, receiver);
      }

      const propertyType = properties[property];

      if (!propertyType) {
        return Reflect.get(target, property, receiver);
      }

      if (cache.has(property)) {
        return cache.get(property);
      }

      const value = hydrateFieldValue(
        compiled,
        propertyType,
        (target as Record<string, unknown>)[property],
        mutationContext,
      );
      cache.set(property, value);
      return value;
    },

    set(target, property, value, receiver) {
      assertCollectionMutationAllowed(mutationContext, String(property));
      cache.delete(String(property));
      return Reflect.set(target, property, value, receiver);
    },

    deleteProperty(target, property) {
      assertCollectionMutationAllowed(mutationContext, String(property));
      cache.delete(String(property));
      return Reflect.deleteProperty(target, property);
    },

    defineProperty(target, property, descriptor) {
      assertCollectionMutationAllowed(mutationContext, String(property));
      cache.delete(String(property));
      return Reflect.defineProperty(target, property, descriptor);
    },
  });
}

function getCompiledStateDefinition(
  compiled: CompiledStateFacadeDefinition,
  target: GameStateClass,
): CompiledStateDefinition {
  const definition = compiled.states[target.name];

  if (!definition) {
    throw new Error(`compiled_state_not_found:${target.name || "anonymous"}`);
  }

  return definition;
}

interface MutationContext {
  readonlyMode: boolean;
  mutationDepth: number;
}

function isPrimitiveDataField(field: FieldType): boolean {
  return (
    field.kind === "number" ||
    field.kind === "string" ||
    field.kind === "boolean"
  );
}

function isArrayIndex(property: string): boolean {
  return String(Number(property)) === property;
}

function assertCollectionMutationAllowed(
  mutationContext: MutationContext,
  fieldName: string,
) {
  if (mutationContext.readonlyMode) {
    throw new Error(`readonly_state_facade_mutation:${fieldName}`);
  }

  if (mutationContext.mutationDepth === 0) {
    throw new Error(`direct_state_mutation_not_allowed:${fieldName}`);
  }
}

function wrapStateMethods(instance: object, mutationContext: MutationContext) {
  const prototype = Object.getPrototypeOf(instance);

  if (!prototype || prototype === Object.prototype) {
    return;
  }

  const descriptors = Object.getOwnPropertyDescriptors(prototype);

  for (const [methodName, descriptor] of Object.entries(descriptors)) {
    if (
      methodName === "constructor" ||
      typeof descriptor.value !== "function"
    ) {
      continue;
    }

    Object.defineProperty(instance, methodName, {
      enumerable: false,
      configurable: true,
      writable: false,
      value: (...args: unknown[]) => {
        mutationContext.mutationDepth += 1;

        try {
          return descriptor.value.apply(instance, args);
        } finally {
          mutationContext.mutationDepth -= 1;
        }
      },
    });
  }
}
