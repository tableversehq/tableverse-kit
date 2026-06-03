import { expect, test } from "bun:test";
import * as visibilityMetadata from "../src/state-facade/metadata";
import {
  configureVisibility,
  field,
  GameState,
  getStateMetadata,
  t,
} from "../src/state-facade/metadata";
import { compileStateFacadeDefinition } from "../src/state-facade/compile";
import { hydrateStateFacade } from "../src/state-facade/hydrate";

class HandState extends GameState {
  @field(t.number())
  size!: number;
}

class PlayerState extends GameState {
  @field(t.number())
  health!: number;

  @field(t.state(() => HandState))
  hand!: HandState;

  dealDamage(amount: number) {
    this.health -= amount;
  }
}

class TypedHandState extends GameState {
  @field(t.number())
  size!: number;
}

class TypedPlayerState extends GameState {
  @field(t.number())
  health!: number;

  @field(t.state(() => TypedHandState))
  hand!: TypedHandState;

  @field(t.array(t.string()))
  tags!: string[];
}

class CardStateFacade extends GameState {
  @field(t.string())
  id!: string;

  rename(nextId: string) {
    this.id = nextId;
  }
}

class CardCollectionStateFacade extends GameState {
  @field(t.array(t.state(() => CardStateFacade)))
  cards!: CardStateFacade[];
}

const hiddenCountSchema = t.object({
  count: t.number(),
});

class SummaryVisibilityPlayerState extends GameState {
  @field(t.string())
  id!: string;

  @field(t.array(t.string()))
  cards!: string[];
}

class SummaryVisibilityDeckState extends GameState {
  @field(t.array(t.string()))
  cards!: string[];
}

configureVisibility(SummaryVisibilityPlayerState, ({ field }) => ({
  ownedBy: field.id,
  fields: [
    field.cards.visibleToSelf({
      schema: hiddenCountSchema,
      derive(cards) {
        return {
          count: cards.length,
        };
      },
    }),
  ],
}));

configureVisibility(SummaryVisibilityDeckState, ({ field }) => ({
  fields: [
    field.cards.hidden({
      schema: hiddenCountSchema,
      derive(cards) {
        return {
          count: cards.length,
        };
      },
    }),
  ],
}));

test("state decorators capture scalar and nested state metadata", () => {
  const handMetadata = getStateMetadata(HandState);
  const playerMetadata = getStateMetadata(PlayerState);
  const handField = playerMetadata.fields.hand;

  expect(handMetadata.type).toBe("state");
  expect(handMetadata.fields.size?.kind).toBe("number");
  expect(playerMetadata.type).toBe("state");
  expect(playerMetadata.fields.health?.kind).toBe("number");
  expect(handField?.kind).toBe("state");

  if (!handField || handField.kind !== "state") {
    throw new Error("expected nested state field metadata");
  }

  expect(handField.target()).toBe(HandState);
});

class BaseClassHandState extends GameState {
  @field(t.number())
  size!: number;
}

class BaseClassPlayerState extends GameState {
  @field(t.number())
  health!: number;

  @field(t.state(() => BaseClassHandState))
  hand!: BaseClassHandState;
}

class NonGameStateChild {
  size!: number;
}

class InvalidBaseClassPlayerState extends GameState {
  @field(t.state(() => NonGameStateChild as never))
  hand!: NonGameStateChild;
}

test("GameState subclasses compile without State decorator", () => {
  const compiled = compileStateFacadeDefinition(BaseClassPlayerState);

  expect(compiled.root).toBe(BaseClassPlayerState);
  expect(compiled.states.BaseClassPlayerState?.fields.health?.kind).toBe(
    "number",
  );
  expect(compiled.states.BaseClassHandState?.fields.size?.kind).toBe("number");
});

test("nested state targets must extend GameState", () => {
  expect(() =>
    compileStateFacadeDefinition(InvalidBaseClassPlayerState),
  ).toThrow("state_field_target_must_extend_game_state:NonGameStateChild");
});

test("field decorator captures composable runtime field type metadata", () => {
  const playerMetadata = getStateMetadata(TypedPlayerState);
  const handMetadata = getStateMetadata(TypedHandState);
  const handField = playerMetadata.fields.hand;
  const tagsField = playerMetadata.fields.tags;

  expect(playerMetadata.type).toBe("state");
  expect(playerMetadata.fields.health?.kind).toBe("number");
  expect(handMetadata.fields.size?.kind).toBe("number");
  expect(handField?.kind).toBe("state");

  if (!handField || handField.kind !== "state") {
    throw new Error("expected nested state runtime field type");
  }

  expect(handField.target()).toBe(TypedHandState);
  expect(tagsField).toMatchObject({
    kind: "array",
    item: {
      kind: "string",
    },
  });
});

test("mutable state facades allow mutation through state methods but reject direct field writes", () => {
  const compiled = compileStateFacadeDefinition(PlayerState);
  const backing = {
    health: 10,
    hand: {
      size: 3,
    },
  };
  const facade = hydrateStateFacade<PlayerState>(compiled, backing);

  facade.dealDamage(2);

  expect(backing.health).toBe(8);
  expect(() => {
    facade.health = 1;
  }).toThrow("direct_state_mutation_not_allowed:health");
  expect(backing.health).toBe(8);
});

test("state facades lazily hydrate nested state arrays", () => {
  const compiled = compileStateFacadeDefinition(CardCollectionStateFacade);
  const backing = {
    cards: [{ id: "starter-card" }],
  };
  const facade = hydrateStateFacade<CardCollectionStateFacade>(
    compiled,
    backing,
  );

  expect(facade.cards[0]).toBeInstanceOf(CardStateFacade);

  facade.cards[0]?.rename("renamed-card");

  expect(backing.cards[0]?.id).toBe("renamed-card");
});

test("state facade metadata exports visibility configuration api", () => {
  expect(
    typeof (visibilityMetadata as Record<string, unknown>).configureVisibility,
  ).toBe("function");
});

test("configureVisibility captures hidden visibility schema metadata", () => {
  const playerMetadata = getStateMetadata(SummaryVisibilityPlayerState);
  const deckMetadata = getStateMetadata(SummaryVisibilityDeckState);

  expect(playerMetadata.fieldVisibility.cards).toMatchObject({
    mode: "visible_to_self",
    schema: hiddenCountSchema,
  });
  expect(
    playerMetadata.fieldVisibility.cards?.derive?.(["a", "b"], {
      id: "p1",
      cards: ["a", "b"],
    }),
  ).toEqual({
    count: 2,
  });
  expect(playerMetadata.ownedByField).toBe("id");

  expect(deckMetadata.fieldVisibility.cards).toMatchObject({
    mode: "hidden",
    schema: hiddenCountSchema,
  });
  expect(
    deckMetadata.fieldVisibility.cards?.derive?.(["a"], {
      cards: ["a"],
    }),
  ).toEqual({
    count: 1,
  });
});

test("configureVisibility rejects schema visibility without derive", () => {
  expect(() => {
    class MissingHiddenDeriveState extends GameState {
      @field(t.array(t.string()))
      cards!: string[];
    }

    configureVisibility(MissingHiddenDeriveState, ({ field }) => ({
      fields: [
        field.cards.hidden({
          schema: hiddenCountSchema,
        } as never),
      ],
    }));
  }).toThrow("visibility_schema_requires_derive");
});

test("state facade metadata exports the shared runtime schema api", () => {
  expect(typeof (visibilityMetadata as Record<string, unknown>).t).toBe(
    "object",
  );
});
