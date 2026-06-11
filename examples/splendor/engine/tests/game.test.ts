import { expect, test } from "bun:test";
import { createGameExecutor } from "@tabletop-kit/engine";
import { SPLENDOR_DISCOVERY_STEPS } from "../src/discovery.ts";
import { createCommands } from "../src/commands/index.ts";
import { returnTokensCommand } from "../src/commands/return-tokens.ts";
import { createSplendorGame } from "../src/game";
import { SplendorGame, SplendorPlayer } from "../src/state.ts";

const TEST_SEED = "splendor-seed";

function createTestGameExecutor() {
  const game = createSplendorGame();

  return createGameExecutor(game);
}

function createTestInitialState(playerIds: string[]) {
  const gameExecutor = createTestGameExecutor();

  return {
    gameExecutor,
    state: gameExecutor.createInitialState({ playerIds }, TEST_SEED),
  };
}

test("splendor setup follows official 2-player rules", () => {
  const { state } = createTestInitialState(["p1", "p2"]);

  expect(state.game.playerOrder).toEqual(["p1", "p2"]);
  expect(state.game.bank.white).toBe(4);
  expect(state.game.bank.blue).toBe(4);
  expect(state.game.bank.green).toBe(4);
  expect(state.game.bank.red).toBe(4);
  expect(state.game.bank.black).toBe(4);
  expect(state.game.bank.gold).toBe(5);
  expect(state.game.board.faceUpByLevel[1]).toHaveLength(4);
  expect(state.game.board.faceUpByLevel[2]).toHaveLength(4);
  expect(state.game.board.faceUpByLevel[3]).toHaveLength(4);
  expect(state.game.board.nobleIds).toHaveLength(3);
  expect(state.runtime.progression.currentStage).toEqual({
    id: "playerTurn",
    kind: "activePlayer",
    activePlayerId: "p1",
  });
  expect(state.runtime.progression.lastActingStage).toBeNull();
});

test("splendor game definition compiles a root state facade", () => {
  const game = createSplendorGame();

  expect(game.stateFacade?.root).toBe(SplendorGame);
  const rootFields = game.stateFacade?.states.get(SplendorGame)?.model;

  expect(rootFields?.playerOrder?.kind).toBe("array");
  expect(rootFields?.bank?.kind).toBe("state");
  expect(rootFields?.players?.kind).toBe("record");
  if (rootFields?.players?.kind !== "record") {
    throw new Error("expected players to compile as a state record");
  }
  expect(rootFields.players.value.kind).toBe("state");
  expect(game.stateFacade?.states.get(SplendorPlayer)).toBeDefined();
});

test("splendor visible state hides deck contents and opponent reserved cards", () => {
  const { gameExecutor, state } = createTestInitialState(["p1", "p2"]);

  state.game.players.p1!.reservedCardIds = [1, 2];
  state.game.players.p2!.reservedCardIds = [3];
  state.game.board.deckByLevel[1] = [11, 12, 13];
  state.game.board.deckByLevel[2] = [21];
  state.game.board.deckByLevel[3] = [];

  const visibleForP1 = gameExecutor.getView(state, {
    kind: "player",
    playerId: "p1",
  }) as {
    game: {
      players: Record<
        string,
        {
          reservedCardIds:
            | number[]
            | {
                __hidden: true;
                value?: {
                  count: number;
                };
              };
        }
      >;
      board: {
        deckByLevel: {
          __hidden: true;
          value?: Record<number, number>;
        };
      };
    };
  };
  const visibleForP2 = gameExecutor.getView(state, {
    kind: "player",
    playerId: "p2",
  }) as {
    game: {
      players: Record<
        string,
        {
          reservedCardIds:
            | number[]
            | {
                __hidden: true;
                value?: {
                  count: number;
                };
              };
        }
      >;
      board: {
        deckByLevel: {
          __hidden: true;
          value?: Record<number, number>;
        };
      };
    };
  };

  expect(visibleForP1.game.players.p1?.reservedCardIds).toEqual([1, 2]);
  expect(visibleForP1.game.players.p2?.reservedCardIds).toEqual({
    __hidden: true,
    value: {
      count: 1,
    },
  });
  expect(visibleForP2.game.players.p1?.reservedCardIds).toEqual({
    __hidden: true,
    value: {
      count: 2,
    },
  });
  expect(visibleForP1.game.board.deckByLevel).toEqual({
    __hidden: true,
    value: {
      1: 3,
      2: 1,
      3: 0,
    },
  });
});

test("splendor setup follows official 4-player rules", () => {
  const { state } = createTestInitialState(["p1", "p2", "p3", "p4"]);

  expect(state.game.bank.white).toBe(7);
  expect(state.game.bank.blue).toBe(7);
  expect(state.game.bank.green).toBe(7);
  expect(state.game.bank.red).toBe(7);
  expect(state.game.bank.black).toBe(7);
  expect(state.game.bank.gold).toBe(5);
  expect(state.game.board.nobleIds).toHaveLength(5);
});

test("splendor exposes the expected available command families on the opening turn", () => {
  const { gameExecutor, state } = createTestInitialState(["p1", "p2"]);

  expect(gameExecutor.listAvailableCommands(state, { actorId: "p1" })).toEqual([
    "take_three_distinct_gems",
    "take_two_same_gems",
    "reserve_face_up_card",
    "reserve_deck_card",
  ]);
  expect(gameExecutor.listAvailableCommands(state, { actorId: "p2" })).toEqual(
    [],
  );
});

test("splendor exposes buy commands once the active player can afford them", () => {
  const { gameExecutor, state } = createTestInitialState(["p1", "p2"]);

  state.game.players.p1!.tokens.gold = 20;
  state.game.players.p1!.reservedCardIds = [24];

  const availableCommands = gameExecutor.listAvailableCommands(state, {
    actorId: "p1",
  });

  expect(availableCommands).toContain("buy_face_up_card");
  expect(availableCommands).toContain("buy_reserved_card");
});

test("splendor commands declare step-authored discovery flows", () => {
  const commands = createCommands();

  expect(commands).not.toHaveLength(0);

  const takeThreeDistinctGems = commands.find(
    (command) => command.commandId === "take_three_distinct_gems",
  );

  expect(takeThreeDistinctGems?.discovery).toMatchObject({
    startStep: SPLENDOR_DISCOVERY_STEPS.selectGemColor,
  });
  expect(takeThreeDistinctGems?.discovery?.steps).toHaveLength(1);
  expect(takeThreeDistinctGems?.discovery?.steps[0]).toMatchObject({
    stepId: SPLENDOR_DISCOVERY_STEPS.selectGemColor,
  });
});

test("splendor discovers gem color choices for three-distinct take", () => {
  const { gameExecutor, state } = createTestInitialState(["p1", "p2"]);

  const firstStep = gameExecutor.discoverCommand(state, {
    type: "take_three_distinct_gems",
    actorId: "p1",
    step: SPLENDOR_DISCOVERY_STEPS.selectGemColor,
    input: {},
  });
  const secondStep = gameExecutor.discoverCommand(state, {
    type: "take_three_distinct_gems",
    actorId: "p1",
    step: SPLENDOR_DISCOVERY_STEPS.selectGemColor,
    input: {
      selectedColors: ["white", "blue"],
    },
  });
  const thirdStep = gameExecutor.discoverCommand(state, {
    type: "take_three_distinct_gems",
    actorId: "p1",
    step: SPLENDOR_DISCOVERY_STEPS.selectGemColor,
    input: {
      selectedColors: ["white", "blue", "green"],
    },
  });

  expect(firstStep).toMatchObject({
    complete: false,
    step: SPLENDOR_DISCOVERY_STEPS.selectGemColor,
  });
  if (!firstStep || firstStep.complete) {
    throw new Error("expected_incomplete_discovery");
  }
  expect(firstStep.options).toHaveLength(5);
  expect(firstStep.options[0]).toMatchObject({
    id: expect.any(String),
    output: {
      color: expect.any(String),
      selectedCount: 1,
      requiredCount: 3,
    },
    nextInput: {
      selectedColors: [expect.any(String)],
    },
    nextStep: SPLENDOR_DISCOVERY_STEPS.selectGemColor,
  });
  expect(secondStep).toMatchObject({
    complete: false,
    step: SPLENDOR_DISCOVERY_STEPS.selectGemColor,
  });
  if (!secondStep || secondStep.complete) {
    throw new Error("expected_looping_discovery");
  }
  expect(secondStep.options[0]).toMatchObject({
    id: expect.any(String),
    output: {
      color: expect.any(String),
      selectedCount: 3,
      requiredCount: 3,
    },
    nextInput: {
      selectedColors: [
        expect.any(String),
        expect.any(String),
        expect.any(String),
      ],
    },
    nextStep: SPLENDOR_DISCOVERY_STEPS.selectGemColor,
  });
  expect(thirdStep).toMatchObject({
    complete: true,
  });
  if (!thirdStep || !thirdStep.complete) {
    throw new Error("expected_complete_discovery");
  }
  expect(thirdStep.input).toEqual({
    colors: ["white", "blue", "green"],
  });
});

test("splendor buy reserved discovery completes after selecting a card", () => {
  const { gameExecutor, state } = createTestInitialState(["p1", "p2"]);

  state.game.players.p1!.reservedCardIds = [45];
  state.game.players.p1!.tokens.white = 0;
  state.game.players.p1!.tokens.blue = 0;
  state.game.players.p1!.tokens.green = 0;
  state.game.players.p1!.tokens.red = 0;
  state.game.players.p1!.tokens.black = 0;
  state.game.players.p1!.tokens.gold = 20;

  const discovery = gameExecutor.discoverCommand(state, {
    type: "buy_reserved_card",
    actorId: "p1",
    step: SPLENDOR_DISCOVERY_STEPS.selectReservedCard,
    input: {},
  });

  expect(discovery).toMatchObject({
    complete: false,
    step: SPLENDOR_DISCOVERY_STEPS.selectReservedCard,
  });
  if (!discovery || discovery.complete) {
    throw new Error("expected_incomplete_discovery");
  }
  expect(discovery.options[0]).toMatchObject({
    id: "45",
    output: {
      cardId: 45,
      level: expect.any(Number),
      bonusColor: expect.any(String),
      prestigePoints: expect.any(Number),
    },
    nextInput: {
      selectedCardId: 45,
    },
    nextStep: SPLENDOR_DISCOVERY_STEPS.selectReservedCard,
  });

  const completeDiscovery = gameExecutor.discoverCommand(state, {
    type: "buy_reserved_card",
    actorId: "p1",
    step: SPLENDOR_DISCOVERY_STEPS.selectReservedCard,
    input: {
      selectedCardId: 45,
    },
  });

  expect(completeDiscovery).toMatchObject({
    complete: true,
  });
  if (!completeDiscovery || !completeDiscovery.complete) {
    throw new Error("expected_complete_discovery");
  }
  expect(completeDiscovery.input).toEqual({
    cardId: 45,
  });
});

test("taking three distinct gems updates tokens and advances the turn", () => {
  const { gameExecutor, state } = createTestInitialState(["p1", "p2"]);
  const result = gameExecutor.executeCommand(state, {
    type: "take_three_distinct_gems",
    actorId: "p1",
    input: {
      colors: ["white", "blue", "green"],
    },
  });

  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error("expected successful gem-taking command");
  }

  expect(result.state.game.players.p1?.tokens).toMatchObject({
    white: 1,
    blue: 1,
    green: 1,
    red: 0,
    black: 0,
    gold: 0,
  });
  expect(result.state.game.bank).toMatchObject({
    white: 3,
    blue: 3,
    green: 3,
  });
  expect(result.state.runtime.progression.currentStage).toEqual({
    id: "playerTurn",
    kind: "activePlayer",
    activePlayerId: "p2",
  });
  expect(result.state.runtime.progression.lastActingStage).toEqual({
    id: "playerTurn",
    kind: "activePlayer",
    activePlayerId: "p1",
  });
  expect(result.events[0]).toMatchObject({
    category: "domain",
    type: "gems_taken",
  });
  expect(result.events.map((event) => event.type)).toContain("stage_exited");
  expect(result.events.map((event) => event.type)).toContain("stage_entered");
});

test("taking two gems of the same color requires at least four in the bank", () => {
  const { gameExecutor, state } = createTestInitialState(["p1", "p2"]);
  state.game.bank.red = 3;

  const result = gameExecutor.executeCommand(state, {
    type: "take_two_same_gems",
    actorId: "p1",
    input: {
      color: "red",
    },
  });

  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error("expected gem-taking validation to fail");
  }

  expect(result.reason).toBe("not_enough_tokens_for_double_take");
  expect(result.state).toBe(state);
  expect(result.state.game.bank.red).toBe(3);
});

test("taking two gems of the same color rejects invalid gem colors explicitly", () => {
  const { gameExecutor, state } = createTestInitialState(["p1", "p2"]);

  const result = gameExecutor.executeCommand(state, {
    type: "take_two_same_gems",
    actorId: "p1",
    input: {
      color: "purple",
    },
  });

  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error("expected invalid gem color to fail validation");
  }

  expect(result.reason).toBe("invalid_color");
});

test("reserving a deck card rejects invalid development levels explicitly", () => {
  const { gameExecutor, state } = createTestInitialState(["p1", "p2"]);

  const result = gameExecutor.executeCommand(state, {
    type: "reserve_deck_card",
    actorId: "p1",
    input: {
      level: 4,
    },
  });

  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error("expected invalid deck level to fail validation");
  }

  expect(result.reason).toBe("invalid_level");
});

test("reserving a face-up card grants gold and refills the market", () => {
  const { gameExecutor, state } = createTestInitialState(["p1", "p2"]);

  state.game.board.faceUpByLevel[1] = [1, 2, 3, 4];
  state.game.board.deckByLevel[1] = [5, 6];

  const result = gameExecutor.executeCommand(state, {
    type: "reserve_face_up_card",
    actorId: "p1",
    input: {
      level: 1,
      cardId: 1,
    },
  });

  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error("expected reserve command to succeed");
  }

  expect(result.state.game.players.p1?.reservedCardIds).toEqual([1]);
  expect(result.state.game.players.p1?.tokens.gold).toBe(1);
  expect(result.state.game.bank.gold).toBe(4);
  expect(result.state.game.board.faceUpByLevel[1]).toEqual([2, 3, 4, 5]);
  expect(result.state.game.board.deckByLevel[1]).toEqual([6]);
  expect(result.state.runtime.progression.currentStage).toEqual({
    id: "playerTurn",
    kind: "activePlayer",
    activePlayerId: "p2",
  });
  expect(result.state.runtime.progression.lastActingStage).toEqual({
    id: "playerTurn",
    kind: "activePlayer",
    activePlayerId: "p1",
  });
});

test("buying a reserved card uses discounts and can claim a noble automatically", () => {
  const { gameExecutor, state } = createTestInitialState(["p1", "p2"]);

  state.game.board.nobleIds = [1];
  state.game.players.p1!.tokens.white = 0;
  state.game.players.p1!.tokens.blue = 0;
  state.game.players.p1!.tokens.green = 4;
  state.game.players.p1!.tokens.red = 0;
  state.game.players.p1!.tokens.black = 0;
  state.game.players.p1!.tokens.gold = 0;
  state.game.players.p1!.reservedCardIds = [24];
  state.game.players.p1!.purchasedCardIds = [17, 18, 9, 10, 11, 25, 26, 27];
  state.game.players.p1!.nobleIds = [];

  const result = gameExecutor.executeCommand(state, {
    type: "buy_reserved_card",
    actorId: "p1",
    input: {
      cardId: 24,
    },
  });

  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error("expected reserved buy to succeed");
  }

  expect(result.state.game.players.p1?.reservedCardIds).toEqual([]);
  expect(result.state.game.players.p1?.purchasedCardIds).toContain(24);
  expect(result.state.game.players.p1?.tokens.green).toBe(3);
  expect(result.state.game.players.p1?.nobleIds).toEqual([1]);
  expect(result.state.game.board.nobleIds).toEqual([]);
  expect(result.events.map((event) => event.type)).toContain("noble_claimed");
});

test("buying with multiple eligible nobles moves into the choose-noble stage", () => {
  const { gameExecutor, state } = createTestInitialState(["p1", "p2"]);

  state.game.board.nobleIds = [6, 7];
  state.game.players.p1!.tokens.white = 0;
  state.game.players.p1!.tokens.blue = 0;
  state.game.players.p1!.tokens.green = 0;
  state.game.players.p1!.tokens.red = 0;
  state.game.players.p1!.tokens.black = 0;
  state.game.players.p1!.tokens.gold = 1;
  state.game.players.p1!.reservedCardIds = [45];
  state.game.players.p1!.purchasedCardIds = [
    17, 18, 19, 20, 33, 34, 35, 36, 1, 2, 3,
  ];
  state.game.players.p1!.nobleIds = [];

  const result = gameExecutor.executeCommand(state, {
    type: "buy_reserved_card",
    actorId: "p1",
    input: {
      cardId: 45,
    },
  });

  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error("expected reserved buy to succeed");
  }

  expect(result.state.runtime.progression.currentStage).toEqual({
    id: "chooseNoble",
    kind: "activePlayer",
    activePlayerId: "p1",
  });
  expect(result.state.game.players.p1?.nobleIds).toEqual([]);
  expect(result.events.map((event) => event.type)).not.toContain(
    "noble_claimed",
  );
  expect(
    gameExecutor.listAvailableCommands(result.state, {
      actorId: "p1",
    }),
  ).toEqual(["choose_noble"]);
});

test("choosing a noble claims it and then advances to the next player", () => {
  const { gameExecutor, state } = createTestInitialState(["p1", "p2"]);

  state.game.board.nobleIds = [6, 7];
  state.game.players.p1!.tokens.white = 0;
  state.game.players.p1!.tokens.blue = 0;
  state.game.players.p1!.tokens.green = 0;
  state.game.players.p1!.tokens.red = 0;
  state.game.players.p1!.tokens.black = 0;
  state.game.players.p1!.tokens.gold = 1;
  state.game.players.p1!.reservedCardIds = [45];
  state.game.players.p1!.purchasedCardIds = [
    17, 18, 19, 20, 33, 34, 35, 36, 1, 2, 3,
  ];
  state.game.players.p1!.nobleIds = [];

  const buyResult = gameExecutor.executeCommand(state, {
    type: "buy_reserved_card",
    actorId: "p1",
    input: {
      cardId: 45,
    },
  });

  if (!buyResult.ok) {
    throw new Error("expected reserved buy to succeed");
  }

  const chooseResult = gameExecutor.executeCommand(buyResult.state, {
    type: "choose_noble",
    actorId: "p1",
    input: {
      nobleId: 6,
    },
  });

  expect(chooseResult.ok).toBe(true);

  if (!chooseResult.ok) {
    throw new Error("expected choose_noble to succeed");
  }

  expect(chooseResult.state.game.players.p1?.nobleIds).toEqual([6]);
  expect(chooseResult.state.game.board.nobleIds).toEqual([7]);
  expect(chooseResult.state.runtime.progression.currentStage).toEqual({
    id: "playerTurn",
    kind: "activePlayer",
    activePlayerId: "p2",
  });
  expect(chooseResult.events.map((event) => event.type)).toContain(
    "noble_claimed",
  );
});

test("splendor return_tokens command declares the select_return_token discovery step", () => {
  expect(returnTokensCommand.commandId).toBe("return_tokens");
  expect(returnTokensCommand.discovery).toMatchObject({
    startStep: SPLENDOR_DISCOVERY_STEPS.selectReturnToken,
  });
  expect(returnTokensCommand.discovery?.steps).toHaveLength(1);
  expect(returnTokensCommand.discovery?.steps[0]).toMatchObject({
    stepId: SPLENDOR_DISCOVERY_STEPS.selectReturnToken,
  });
});

test("return_tokens is unavailable to a player without overflow", () => {
  const { gameExecutor, state } = createTestInitialState(["p1", "p2"]);

  expect(
    gameExecutor.listAvailableCommands(state, { actorId: "p1" }),
  ).not.toContain("return_tokens");
});

test("playerTurn transition exposes a returnExcessiveTokensStage branch", () => {
  const game = createSplendorGame();
  const playerTurn = game.stages.playerTurn;

  if (!playerTurn || playerTurn.kind !== "activePlayer") {
    throw new Error("expected playerTurn active-player stage");
  }
  const nextStages = playerTurn.nextStages?.() ?? {};

  expect(Object.keys(nextStages)).toContain("returnExcessiveTokensStage");
});

test("returnExcessiveTokens stage exposes only return_tokens to the active player", () => {
  const { gameExecutor, state } = createTestInitialState(["p1", "p2"]);

  state.game.players.p1!.tokens.white = 6;
  state.game.players.p1!.tokens.blue = 6;
  state.runtime.progression.currentStage = {
    id: "returnExcessiveTokens",
    kind: "activePlayer",
    activePlayerId: "p1",
  };

  expect(gameExecutor.listAvailableCommands(state, { actorId: "p1" })).toEqual([
    "return_tokens",
  ]);
});

test("endgame finishes after the final player in turn order and breaks ties by fewest cards", () => {
  const { gameExecutor, state } = createTestInitialState(["p1", "p2"]);

  state.game.players.p1!.tokens.white = 0;
  state.game.players.p1!.tokens.blue = 0;
  state.game.players.p1!.tokens.green = 0;
  state.game.players.p1!.tokens.red = 0;
  state.game.players.p1!.tokens.black = 0;
  state.game.players.p1!.tokens.gold = 7;
  state.game.players.p1!.reservedCardIds = [43];
  state.game.players.p1!.purchasedCardIds = [74, 72, 46, 8];
  state.game.players.p1!.nobleIds = [];
  state.game.players.p2!.tokens.white = 0;
  state.game.players.p2!.tokens.blue = 6;
  state.game.players.p2!.tokens.green = 0;
  state.game.players.p2!.tokens.red = 0;
  state.game.players.p2!.tokens.black = 0;
  state.game.players.p2!.tokens.gold = 0;
  state.game.players.p2!.reservedCardIds = [52];
  state.game.players.p2!.purchasedCardIds = [78, 80, 46];
  state.game.players.p2!.nobleIds = [];

  const firstResult = gameExecutor.executeCommand(state, {
    type: "buy_reserved_card",
    actorId: "p1",
    input: {
      cardId: 43,
    },
  });

  expect(firstResult.ok).toBe(true);

  if (!firstResult.ok) {
    throw new Error("expected first reserved buy to succeed");
  }

  expect(firstResult.state.game.endGame).toEqual({
    triggeredByPlayerId: "p1",
    endsAfterPlayerId: "p2",
  });
  expect(firstResult.state.game.winnerIds).toBeUndefined();
  expect(firstResult.state.runtime.progression.currentStage).toEqual({
    id: "playerTurn",
    kind: "activePlayer",
    activePlayerId: "p2",
  });
  expect(firstResult.state.runtime.progression.lastActingStage).toEqual({
    id: "playerTurn",
    kind: "activePlayer",
    activePlayerId: "p1",
  });

  const secondResult = gameExecutor.executeCommand(firstResult.state, {
    type: "buy_reserved_card",
    actorId: "p2",
    input: {
      cardId: 52,
    },
  });

  expect(secondResult.ok).toBe(true);

  if (!secondResult.ok) {
    throw new Error("expected final reserved buy to succeed");
  }

  expect(secondResult.state.game.players.p1?.purchasedCardIds).toHaveLength(5);
  expect(secondResult.state.game.players.p2?.purchasedCardIds).toHaveLength(4);
  expect(secondResult.state.game.winnerIds).toEqual(["p2"]);
  expect(secondResult.events.map((event) => event.type)).toContain(
    "game_finished",
  );
});

test("taking two same gems with overflow lands the actor in returnExcessiveTokens", () => {
  const { gameExecutor, state } = createTestInitialState(["p1", "p2"]);

  state.game.players.p1!.tokens.white = 9;
  state.game.bank.white = 4;

  const result = gameExecutor.executeCommand(state, {
    type: "take_two_same_gems",
    actorId: "p1",
    input: {
      color: "white",
    },
  });

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("expected take_two to succeed");
  }
  expect(result.state.game.players.p1?.tokens.white).toBe(11);
  expect(result.state.runtime.progression.currentStage).toEqual({
    id: "returnExcessiveTokens",
    kind: "activePlayer",
    activePlayerId: "p1",
  });
});

test("taking three distinct gems with overflow lands the actor in returnExcessiveTokens", () => {
  const { gameExecutor, state } = createTestInitialState(["p1", "p2"]);

  state.game.players.p1!.tokens.white = 4;
  state.game.players.p1!.tokens.blue = 4;

  const result = gameExecutor.executeCommand(state, {
    type: "take_three_distinct_gems",
    actorId: "p1",
    input: {
      colors: ["white", "blue", "green"],
    },
  });

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("expected take_three to succeed");
  }
  expect(result.state.game.players.p1?.tokens).toMatchObject({
    white: 5,
    blue: 5,
    green: 1,
  });
  expect(result.state.runtime.progression.currentStage).toEqual({
    id: "returnExcessiveTokens",
    kind: "activePlayer",
    activePlayerId: "p1",
  });
});

test("reserving a deck card with overflow lands the actor in returnExcessiveTokens", () => {
  const { gameExecutor, state } = createTestInitialState(["p1", "p2"]);

  state.game.players.p1!.tokens.white = 10;

  const result = gameExecutor.executeCommand(state, {
    type: "reserve_deck_card",
    actorId: "p1",
    input: {
      level: 1,
    },
  });

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("expected reserve_deck_card to succeed");
  }
  expect(result.state.game.players.p1?.tokens.gold).toBe(1);
  expect(result.state.runtime.progression.currentStage).toEqual({
    id: "returnExcessiveTokens",
    kind: "activePlayer",
    activePlayerId: "p1",
  });
});

test("reserving a face-up card with overflow lands the actor in returnExcessiveTokens", () => {
  const { gameExecutor, state } = createTestInitialState(["p1", "p2"]);

  state.game.players.p1!.tokens.white = 10;
  const targetCardId = state.game.board.faceUpByLevel[1]![0]!;

  const result = gameExecutor.executeCommand(state, {
    type: "reserve_face_up_card",
    actorId: "p1",
    input: {
      level: 1,
      cardId: targetCardId,
    },
  });

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("expected reserve_face_up_card to succeed");
  }
  expect(result.state.runtime.progression.currentStage).toEqual({
    id: "returnExcessiveTokens",
    kind: "activePlayer",
    activePlayerId: "p1",
  });
});

test("after overflow the active player returns tokens and the turn proceeds to p2", () => {
  const { gameExecutor, state } = createTestInitialState(["p1", "p2"]);

  state.game.players.p1!.tokens.white = 4;
  state.game.players.p1!.tokens.blue = 4;

  const taken = gameExecutor.executeCommand(state, {
    type: "take_three_distinct_gems",
    actorId: "p1",
    input: {
      colors: ["white", "blue", "green"],
    },
  });

  expect(taken.ok).toBe(true);
  if (!taken.ok) {
    throw new Error("expected take_three to succeed");
  }
  expect(taken.state.runtime.progression.currentStage).toMatchObject({
    id: "returnExcessiveTokens",
    activePlayerId: "p1",
  });

  const returned = gameExecutor.executeCommand(taken.state, {
    type: "return_tokens",
    actorId: "p1",
    input: {
      returnTokens: { white: 1 },
    },
  });

  expect(returned.ok).toBe(true);
  if (!returned.ok) {
    throw new Error("expected return_tokens to succeed");
  }
  expect(returned.state.game.players.p1?.tokens).toMatchObject({
    white: 4,
    blue: 5,
    green: 1,
  });
  expect(returned.state.runtime.progression.currentStage).toEqual({
    id: "playerTurn",
    kind: "activePlayer",
    activePlayerId: "p2",
  });
  expect(
    returned.events.some((event) => event.type === "tokens_returned"),
  ).toBe(true);
});
