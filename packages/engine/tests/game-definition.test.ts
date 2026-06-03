import { expect, test } from "bun:test";
import { createGameExecutor } from "../src/runtime/game-executor";
import { GameDefinitionBuilder } from "../src/game-definition";
import { createCommandFactory } from "../src/command-factory";
import { createStageFactory } from "../src/stage-factory";
import { assertSchemaValue } from "../src/runtime/validation";
import type { SingleActivePlayerStageDefinition } from "../src/types/progression";
import {
  configureVisibility,
  field,
  GameState,
  t,
} from "../src/state-facade/metadata";

const emptyCommandSchema = t.object({});

function createTestStage<TGameState extends GameState>(id: string) {
  return createStageFactory<TGameState>()(id);
}

class TestHandState extends GameState {
  @field(t.number())
  size = 0;
}

class TestRootState extends GameState {
  @field(t.number())
  score = 0;

  @field(t.state(() => TestHandState))
  hand!: TestHandState;
}

class UndecoratedChildState {
  cards!: number[];
}

class BrokenRootState extends GameState {
  @field(t.state(() => UndecoratedChildState as never))
  child!: UndecoratedChildState;
}

class TestCardState extends GameState {
  @field(t.string())
  id = "";
}

class TestCollectionRootState extends GameState {
  @field(t.array(t.state(() => TestCardState)))
  cards: TestCardState[] = [];
}

class VisibleToSelfWithoutOwnerRootState extends GameState {
  @field(t.array(t.number()))
  hiddenCards: number[] = [];
}

class OwnedPlayerStateWithoutId extends GameState {
  @field(t.number())
  score = 0;
}

class VisibilityFieldTypoRootState extends GameState {
  @field(t.array(t.number()))
  hiddenCards: number[] = [];
}

configureVisibility(VisibleToSelfWithoutOwnerRootState, ({ field }) => ({
  fields: [field.hiddenCards.visibleToSelf()],
}));

configureVisibility(OwnedPlayerStateWithoutId, ({ field }) => ({
  ownedBy: field.score as never,
}));

configureVisibility(VisibilityFieldTypoRootState, ({ field }) => ({
  fields: [
    ((field as unknown as { cardz: { hidden(): unknown } }).cardz.hidden() ??
      undefined) as never,
  ],
}));

class ScoreRootState extends GameState {
  @field(t.number())
  score = 0;
}

class MismatchedDefaultRootState extends GameState {
  @field(t.number())
  name = "";
}

class MismatchedStringDefaultRootState extends GameState {
  @field(t.string())
  name = 123 as never;
}

class MismatchedBooleanDefaultRootState extends GameState {
  @field(t.boolean())
  enabled = "yes" as never;
}

class MismatchedArrayDefaultRootState extends GameState {
  @field(t.array(t.number()))
  values = "not-an-array" as never;
}

class MismatchedRecordDefaultRootState extends GameState {
  @field(t.record(t.string(), t.number()))
  scores = 123 as never;
}

class MismatchedRecordKeyDefaultRootState extends GameState {
  @field(t.record(t.number(), t.string()))
  scores = {
    abc: "not-a-number-key",
  } as never;
}

class MismatchedObjectDefaultRootState extends GameState {
  @field(
    t.object({
      label: t.string(),
    }),
  )
  config = 123 as never;
}

class MismatchedStateDefaultRootState extends GameState {
  @field(t.state(() => TestHandState))
  hand = 123 as never;
}

class UndeclaredDefaultRootState extends GameState {
  @field(t.number())
  score = 0;

  cache = "not canonical";
}

test("GameDefinitionBuilder preserves the supplied configuration", () => {
  const gameEndStage = createTestStage<ScoreRootState>("gameEnd")
    .automatic()
    .build();

  const game = new GameDefinitionBuilder("test-game")
    .rootState(ScoreRootState)
    .initialStage(gameEndStage)
    .build();

  expect(game.name).toBe("test-game");
  expect(game.defaultCanonicalGameState).toEqual({
    score: 0,
  });
  expect(game.commands).toEqual({});
});

test("GameDefinitionBuilder preserves setup input schema in the built game", () => {
  const game = new GameDefinitionBuilder("setup-input-game")
    .rootState(ScoreRootState)
    .setupInput(
      t.object({
        playerIds: t.array(t.string()),
      }),
    )
    .initialStage(
      createTestStage<ScoreRootState>("gameEnd").automatic().build(),
    )
    .build();

  expect(game.setupInputSchema?.kind).toBe("object");
  expect(
    game.setupInputSchema && "playerIds" in game.setupInputSchema.properties,
  ).toBeTrue();
});

test("GameDefinitionBuilder rejects non-object setup input schemas at runtime", () => {
  expect(() =>
    new GameDefinitionBuilder("invalid-runtime-setup-input-game")
      .rootState(ScoreRootState)
      .setupInput(t.string() as never)
      .initialStage(
        createTestStage<ScoreRootState>("gameEnd").automatic().build(),
      )
      .build(),
  ).toThrow("setup_input_schema_must_be_object");
});

test("GameDefinitionBuilder rejects field defaults that do not match their schema", () => {
  expect(() =>
    new GameDefinitionBuilder("mismatched-default-game")
      .rootState(MismatchedDefaultRootState)
      .initialStage(
        createTestStage<MismatchedDefaultRootState>("gameEnd")
          .automatic()
          .build(),
      )
      .build(),
  ).toThrow("invalid_default_field_value:MismatchedDefaultRootState.name:/");
});

test("GameDefinitionBuilder rejects string defaults with non-string values", () => {
  expect(() =>
    new GameDefinitionBuilder("mismatched-string-default-game")
      .rootState(MismatchedStringDefaultRootState)
      .initialStage(
        createTestStage<MismatchedStringDefaultRootState>("gameEnd")
          .automatic()
          .build(),
      )
      .build(),
  ).toThrow(
    "invalid_default_field_value:MismatchedStringDefaultRootState.name:/",
  );
});

test("GameDefinitionBuilder rejects boolean defaults with non-boolean values", () => {
  expect(() =>
    new GameDefinitionBuilder("mismatched-boolean-default-game")
      .rootState(MismatchedBooleanDefaultRootState)
      .initialStage(
        createTestStage<MismatchedBooleanDefaultRootState>("gameEnd")
          .automatic()
          .build(),
      )
      .build(),
  ).toThrow(
    "invalid_default_field_value:MismatchedBooleanDefaultRootState.enabled:/",
  );
});

test("GameDefinitionBuilder rejects array defaults with non-array values", () => {
  expect(() =>
    new GameDefinitionBuilder("mismatched-array-default-game")
      .rootState(MismatchedArrayDefaultRootState)
      .initialStage(
        createTestStage<MismatchedArrayDefaultRootState>("gameEnd")
          .automatic()
          .build(),
      )
      .build(),
  ).toThrow(
    "invalid_default_field_shape:MismatchedArrayDefaultRootState.values:array",
  );
});

test("GameDefinitionBuilder rejects record defaults with non-object values", () => {
  expect(() =>
    new GameDefinitionBuilder("mismatched-record-default-game")
      .rootState(MismatchedRecordDefaultRootState)
      .initialStage(
        createTestStage<MismatchedRecordDefaultRootState>("gameEnd")
          .automatic()
          .build(),
      )
      .build(),
  ).toThrow(
    "invalid_default_field_shape:MismatchedRecordDefaultRootState.scores:object",
  );
});

test("GameDefinitionBuilder rejects record defaults with invalid keys", () => {
  expect(() =>
    new GameDefinitionBuilder("mismatched-record-key-default-game")
      .rootState(MismatchedRecordKeyDefaultRootState)
      .initialStage(
        createTestStage<MismatchedRecordKeyDefaultRootState>("gameEnd")
          .automatic()
          .build(),
      )
      .build(),
  ).toThrow(
    "invalid_default_record_key:MismatchedRecordKeyDefaultRootState.scores:abc:number",
  );
});

test("GameDefinitionBuilder rejects object defaults with non-object values", () => {
  expect(() =>
    new GameDefinitionBuilder("mismatched-object-default-game")
      .rootState(MismatchedObjectDefaultRootState)
      .initialStage(
        createTestStage<MismatchedObjectDefaultRootState>("gameEnd")
          .automatic()
          .build(),
      )
      .build(),
  ).toThrow(
    "invalid_default_field_shape:MismatchedObjectDefaultRootState.config:object",
  );
});

test("GameDefinitionBuilder rejects nested state defaults with non-object values", () => {
  expect(() =>
    new GameDefinitionBuilder("mismatched-state-default-game")
      .rootState(MismatchedStateDefaultRootState)
      .initialStage(
        createTestStage<MismatchedStateDefaultRootState>("gameEnd")
          .automatic()
          .build(),
      )
      .build(),
  ).toThrow(
    "invalid_default_field_shape:MismatchedStateDefaultRootState.hand:object",
  );
});

test("GameDefinitionBuilder rejects initialized public state properties without field metadata", () => {
  expect(() =>
    new GameDefinitionBuilder("undeclared-default-game")
      .rootState(UndeclaredDefaultRootState)
      .initialStage(
        createTestStage<UndeclaredDefaultRootState>("gameEnd")
          .automatic()
          .build(),
      )
      .build(),
  ).toThrow("undeclared_state_field_value:UndeclaredDefaultRootState.cache");
});

test("GameDefinitionBuilder compiles stage command references into the command map shape", () => {
  const defineCommand = createCommandFactory<ScoreRootState>();
  const incrementScoreCommand = defineCommand({
    commandId: "increment_score",
    commandSchema: emptyCommandSchema,
  })
    .validate(() => {
      return { ok: true as const };
    })
    .execute(({ game }) => {
      game.score += 1;
    })
    .build();
  const decrementScoreCommand = defineCommand({
    commandId: "decrement_score",
    commandSchema: emptyCommandSchema,
  })
    .validate(() => {
      return { ok: true as const };
    })
    .execute(({ game }) => {
      game.score -= 1;
    })
    .build();
  const scoreTurnStage = createScoreTurnStage();

  function createScoreTurnStage(): SingleActivePlayerStageDefinition<ScoreRootState> {
    return createTestStage<ScoreRootState>("scoreTurn")
      .singleActivePlayer()
      .activePlayer(() => "player-1")
      .commands([incrementScoreCommand, decrementScoreCommand])
      .nextStages(() => ({ scoreTurnStage }))
      .transition(({ nextStages }) => nextStages.scoreTurnStage)
      .build();
  }

  const game = new GameDefinitionBuilder("list-builder-game")
    .rootState(ScoreRootState)
    .initialStage(scoreTurnStage)
    .build();

  expect(Object.keys(game.commands)).toEqual([
    "increment_score",
    "decrement_score",
  ]);
  expect(game.commands.increment_score).toBe(incrementScoreCommand);
  expect(game.commands.decrement_score).toBe(decrementScoreCommand);
});

test("GameDefinitionBuilder compiles multi-active stage command references into the command map shape", () => {
  const defineCommand = createCommandFactory<ScoreRootState>();
  const submitVoteCommand = defineCommand({
    commandId: "submit_vote",
    commandSchema: emptyCommandSchema,
  })
    .validate(() => {
      return { ok: true as const };
    })
    .execute(({ game }) => {
      game.score += 1;
    })
    .build();
  const gameEndStage = createTestStage<ScoreRootState>("gameEnd")
    .automatic()
    .build();
  const voteStage = createTestStage<ScoreRootState>("voteStage")
    .multiActivePlayer()
    .memory(
      t.object({
        submittedByPlayerId: t.record(t.string(), t.boolean()),
      }),
      () => ({
        submittedByPlayerId: {} as Record<string, true>,
      }),
    )
    .activePlayers(({ memory }) => {
      return ["player-1", "player-2"].filter((playerId) => {
        return memory.submittedByPlayerId[playerId] !== true;
      });
    })
    .commands([submitVoteCommand])
    .onSubmit(({ command, execute, memory }) => {
      memory.submittedByPlayerId[command.actorId] = true;
      execute(command);
    })
    .isComplete(({ memory }) => {
      return Object.keys(memory.submittedByPlayerId).length === 2;
    })
    .nextStages(() => ({
      gameEndStage,
    }))
    .transition(({ nextStages }) => nextStages.gameEndStage)
    .build();

  const game = new GameDefinitionBuilder("multi-active-list-builder-game")
    .rootState(ScoreRootState)
    .initialStage(voteStage)
    .build();

  expect(Object.keys(game.commands)).toEqual(["submit_vote"]);
  expect(game.commands.submit_vote).toBe(submitVoteCommand);
});

test("GameDefinitionBuilder assembles runtimeStateSchema with multi-active memory shape", () => {
  const defineCommand = createCommandFactory<ScoreRootState>();
  const defineStage = createStageFactory<ScoreRootState>();
  const submitVoteCommand = defineCommand({
    commandId: "submit_vote",
    commandSchema: emptyCommandSchema,
  })
    .validate(() => {
      return { ok: true as const };
    })
    .execute(() => {})
    .build();
  const gameEndStage = defineStage("gameEnd").automatic().build();
  const voteStage = defineStage("voteStage")
    .multiActivePlayer()
    .memory(
      t.object({
        submittedByPlayerId: t.record(t.string(), t.boolean()),
      }),
      () => ({
        submittedByPlayerId: {} as Record<string, true>,
      }),
    )
    .activePlayers(() => ["player-1", "player-2"])
    .commands([submitVoteCommand])
    .onSubmit(() => {})
    .isComplete(() => false)
    .nextStages(() => ({
      gameEndStage,
    }))
    .transition(({ nextStages }) => nextStages.gameEndStage)
    .build();

  const game = new GameDefinitionBuilder("runtime-state-schema-game")
    .rootState(ScoreRootState)
    .initialStage(voteStage)
    .build();

  expect(game.runtimeStateSchema).toBeDefined();

  expect(() =>
    assertSchemaValue(game.runtimeStateSchema, {
      progression: {
        currentStage: {
          id: "voteStage",
          kind: "multiActivePlayer",
          activePlayerIds: ["player-1", "player-2"],
          memory: {
            submittedByPlayerId: {
              "player-1": true,
            },
          },
        },
        lastActingStage: null,
      },
      rng: {
        seed: "seed",
        cursor: 0,
      },
      history: {
        entries: [],
      },
    }),
  ).not.toThrow();

  expect(() =>
    assertSchemaValue(game.runtimeStateSchema, {
      progression: {
        currentStage: {
          id: "voteStage",
          kind: "multiActivePlayer",
          activePlayerIds: ["player-1", "player-2"],
          memory: {
            submittedByPlayerId: {
              "player-1": "yes",
            },
          },
        },
        lastActingStage: null,
      },
      rng: {
        seed: "seed",
        cursor: 0,
      },
      history: {
        entries: [],
      },
    }),
  ).toThrow("invalid_schema_value");
});

test("GameDefinitionBuilder accepts factory-defined commands through stages only", () => {
  const defineCommand = createCommandFactory<ScoreRootState>();

  const incrementScoreCommand = defineCommand({
    commandId: "increment_score",
    commandSchema: emptyCommandSchema,
  })
    .validate(() => {
      return { ok: true as const };
    })
    .execute(({ game }) => {
      game.score += 1;
    })
    .build();

  const decrementScoreCommand = defineCommand({
    commandId: "decrement_score",
    commandSchema: emptyCommandSchema,
  })
    .validate(() => {
      return { ok: true as const };
    })
    .execute(({ game }) => {
      game.score -= 1;
    })
    .build();
  const gameEndStage = createTestStage<ScoreRootState>("gameEnd")
    .automatic()
    .build();
  const scoreTurnStage = createScoreTurnStage();

  function createScoreTurnStage(): SingleActivePlayerStageDefinition<ScoreRootState> {
    return createTestStage<ScoreRootState>("scoreTurn")
      .singleActivePlayer()
      .activePlayer(() => "player-1")
      .commands([incrementScoreCommand, decrementScoreCommand])
      .nextStages(() => ({
        scoreTurnStage,
        gameEndStage,
      }))
      .transition(({ nextStages }) => {
        return nextStages.gameEndStage ?? nextStages.scoreTurnStage;
      })
      .build();
  }

  const game = new GameDefinitionBuilder("factory-list-builder-game")
    .rootState(ScoreRootState)
    .initialStage(scoreTurnStage)
    .build();

  expect(Object.keys(game.commands)).toEqual([
    "increment_score",
    "decrement_score",
  ]);
  expect(Object.keys(game.stages)).toEqual(["scoreTurn", "gameEnd"]);
});

test("GameDefinitionBuilder rejects duplicate command ids across reachable stages", () => {
  const defineCommand = createCommandFactory<ScoreRootState>();
  const incrementScoreCommand = defineCommand({
    commandId: "increment_score",
    commandSchema: emptyCommandSchema,
  })
    .validate(() => {
      return { ok: true as const };
    })
    .execute(({ game }) => {
      game.score += 1;
    })
    .build();
  const duplicateIncrementScoreCommand = defineCommand({
    commandId: "increment_score",
    commandSchema: emptyCommandSchema,
  })
    .validate(() => {
      return { ok: true as const };
    })
    .execute(({ game }) => {
      game.score += 2;
    })
    .build();
  const gameEndStage = createTestStage<ScoreRootState>("gameEnd")
    .automatic()
    .build();
  const scoreTurnStage = createTestStage<ScoreRootState>("scoreTurn")
    .singleActivePlayer()
    .activePlayer(() => "player-1")
    .commands([incrementScoreCommand])
    .nextStages(() => ({
      gameEndStage,
    }))
    .transition(({ nextStages }) => nextStages.gameEndStage)
    .build();
  const bonusTurnStage = createBonusTurnStage();

  function createBonusTurnStage(): SingleActivePlayerStageDefinition<ScoreRootState> {
    return createTestStage<ScoreRootState>("bonusTurn")
      .singleActivePlayer()
      .activePlayer(() => "player-2")
      .commands([duplicateIncrementScoreCommand])
      .nextStages(() => ({ bonusTurnStage }))
      .transition(({ nextStages }) => nextStages.bonusTurnStage)
      .build();
  }
  const rootStage = createTestStage<ScoreRootState>("root")
    .automatic()
    .nextStages(() => ({
      scoreTurnStage,
      bonusTurnStage,
    }))
    .transition(({ nextStages }) => nextStages.scoreTurnStage)
    .build();
  void bonusTurnStage;

  expect(() =>
    new GameDefinitionBuilder("duplicate-command-game")
      .rootState(ScoreRootState)
      .initialStage(rootStage)
      .build(),
  ).toThrow("duplicate_command_id:increment_score");
});

test("GameDefinitionBuilder only accepts commands created by the command factory through stages", () => {
  const legacyCommand = {
    commandId: "legacy",
    commandSchema: emptyCommandSchema,
    validate: () => ({ ok: true as const }),
    execute: ({ game }: { game: { score: number } }) => {
      game.score += 1;
    },
  };

  const builder = new GameDefinitionBuilder("legacy-command-game").rootState(
    ScoreRootState,
  );

  const turnStage = createTurnStage();

  function createTurnStage(): SingleActivePlayerStageDefinition<ScoreRootState> {
    return createTestStage<ScoreRootState>("turn")
      .singleActivePlayer()
      .activePlayer(() => "player-1")
      .commands([
        // @ts-expect-error commands must be created by createCommandFactory
        legacyCommand,
      ])
      .nextStages(() => ({ turnStage }))
      .transition(({ nextStages }) => nextStages.turnStage)
      .build();
  }

  builder.initialStage(turnStage);
});

test("createGameExecutor creates initial stage-machine runtime state", () => {
  const gameEndStage = createTestStage<ScoreRootState>("gameEnd")
    .automatic()
    .build();
  const playerTurnStage = createPlayerTurnStage();

  function createPlayerTurnStage(): SingleActivePlayerStageDefinition<ScoreRootState> {
    return createTestStage<ScoreRootState>("playerTurn")
      .singleActivePlayer()
      .activePlayer(() => "player-1")
      .nextStages(() => ({
        playerTurnStage,
        gameEndStage,
      }))
      .commands([])
      .transition(({ nextStages }) => {
        return nextStages.playerTurnStage;
      })
      .build();
  }
  const game = new GameDefinitionBuilder("progression-game")
    .rootState(ScoreRootState)
    .initialStage(playerTurnStage)
    .build();

  const gameExecutor = createGameExecutor(game);
  const state = gameExecutor.createInitialState("seed-123");

  expect(state.runtime.progression.currentStage).toEqual({
    id: "playerTurn",
    kind: "activePlayer",
    activePlayerId: "player-1",
  });
});

test("GameDefinitionBuilder builds the same game definition shape", () => {
  const gameEndStage = createTestStage<ScoreRootState>("gameEnd")
    .automatic()
    .build();
  const game = new GameDefinitionBuilder("builder-game")
    .rootState(ScoreRootState)
    .initialStage(gameEndStage)
    .build();

  expect(game.name).toBe("builder-game");
  expect(game.defaultCanonicalGameState).toEqual({
    score: 0,
  });
  expect(game.commands).toEqual({});
});

test("GameDefinitionBuilder compiles reachable root state metadata", () => {
  const game = new GameDefinitionBuilder("root-state-game")
    .rootState(TestRootState)
    .initialStage(createTestStage<TestRootState>("gameEnd").automatic().build())
    .build();

  expect(game.stateFacade?.root).toBe(TestRootState);
  expect(game.stateFacade?.states[TestRootState.name]?.fields.score?.kind).toBe(
    "number",
  );
  expect(game.stateFacade?.states[TestRootState.name]?.fields.hand?.kind).toBe(
    "state",
  );
  expect(game.stateFacade?.states[TestHandState.name]?.fields.size?.kind).toBe(
    "number",
  );
});

test("GameDefinitionBuilder rejects nested state targets that do not extend GameState", () => {
  expect(() =>
    new GameDefinitionBuilder("broken-root-state-game")
      .rootState(BrokenRootState)
      .initialStage(
        createTestStage<BrokenRootState>("gameEnd").automatic().build(),
      )
      .build(),
  ).toThrow("state_field_target_must_extend_game_state:UndecoratedChildState");
});

test("GameDefinitionBuilder compiles nested state references inside array field types", () => {
  const game = new GameDefinitionBuilder("collection-root-state-game")
    .rootState(TestCollectionRootState)
    .initialStage(
      createTestStage<TestCollectionRootState>("gameEnd").automatic().build(),
    )
    .build();

  expect(game.stateFacade?.root).toBe(TestCollectionRootState);
  expect(
    game.stateFacade?.states[TestCollectionRootState.name]?.fields.cards,
  ).toMatchObject({
    kind: "array",
    item: {
      kind: "state",
    },
  });
  expect(
    game.stateFacade?.states[TestCollectionRootState.name]?.fields.cards?.kind,
  ).toBe("array");
  expect(game.stateFacade?.states[TestCardState.name]?.fields.id?.kind).toBe(
    "string",
  );
});

test("GameDefinitionBuilder rejects visibleToSelf fields without a player-owned ancestor", () => {
  expect(() =>
    new GameDefinitionBuilder("visible-to-self-without-owner-game")
      .rootState(VisibleToSelfWithoutOwnerRootState)
      .initialStage(
        createTestStage<VisibleToSelfWithoutOwnerRootState>("gameEnd")
          .automatic()
          .build(),
      )
      .build(),
  ).toThrow("visible_to_self_requires_owned_player_ancestor:hiddenCards");
});

test("GameDefinitionBuilder rejects owned player states without a string id field", () => {
  expect(() =>
    new GameDefinitionBuilder("owned-player-without-id-game")
      .rootState(OwnedPlayerStateWithoutId)
      .initialStage(
        createTestStage<OwnedPlayerStateWithoutId>("gameEnd")
          .automatic()
          .build(),
      )
      .build(),
  ).toThrow(
    "owned_by_field_requires_string_field:OwnedPlayerStateWithoutId:score",
  );
});

test("GameDefinitionBuilder rejects unknown configured visibility fields", () => {
  expect(() =>
    new GameDefinitionBuilder("visibility-field-typo-game")
      .rootState(VisibilityFieldTypoRootState)
      .initialStage(
        createTestStage<VisibilityFieldTypoRootState>("gameEnd")
          .automatic()
          .build(),
      )
      .build(),
  ).toThrow("visibility_field_not_found:VisibilityFieldTypoRootState:cardz");
});
