import { describe, expect, test } from "vitest";
import { executor } from "../templates/default/engine/src/index.ts";

type State = ReturnType<typeof executor.createInitialState>;

const SEATS = ["p1", "p2"];

function start(): State {
  return executor.createInitialState({ seed: "template", players: SEATS });
}

function place(state: State, actorId: string, cell: number) {
  return executor.executeCommand(state, {
    type: "place",
    actorId,
    input: { cell },
  });
}

function rejectionOf(result: ReturnType<typeof place>): string {
  return result.ok ? "" : result.reason;
}

function playing(
  state: State,
  moves: readonly (readonly [string, number])[],
): State {
  let current = state;
  for (const [actorId, cell] of moves) {
    const result = place(current, actorId, cell);
    expect(result.ok).toBe(true);
    current = result.state;
  }
  return current;
}

function gameOf(state: State) {
  return executor.getView(state, { kind: "player", playerId: "p1" }).game;
}

function stageOf(state: State) {
  return executor.getView(state, { kind: "player", playerId: "p1" }).progression
    .currentStage;
}

describe("the scaffolded game", () => {
  test("deals X to the first seat and O to the second", () => {
    const game = gameOf(start());

    expect(game.marks).toEqual({ p1: "X", p2: "O" });
    expect(game.board).toEqual(["", "", "", "", "", "", "", "", ""]);
    expect(game.outcome).toBe("playing");
  });

  test("X moves first and the turn alternates", () => {
    let state = start();
    expect(stageOf(state)).toEqual({
      id: "turn",
      kind: "activePlayer",
      activePlayerId: "p1",
    });

    state = playing(state, [["p1", 0]]);
    expect(stageOf(state)).toEqual({
      id: "turn",
      kind: "activePlayer",
      activePlayerId: "p2",
    });
  });

  test("refuses a move from the seat that is not to play", () => {
    const result = place(start(), "p2", 0);

    expect(result.ok).toBe(false);
    expect(rejectionOf(result)).toBe("not_active_player");
  });

  test("refuses a cell that is already taken", () => {
    const state = playing(start(), [["p1", 4]]);
    const result = place(state, "p2", 4);

    expect(result.ok).toBe(false);
    expect(rejectionOf(result)).toBe("cell_already_taken");
  });

  test("refuses a cell outside the board", () => {
    expect(place(start(), "p1", 9).ok).toBe(false);
    expect(place(start(), "p1", -1).ok).toBe(false);
  });

  test.each([
    [
      "a row",
      [
        ["p1", 0],
        ["p2", 3],
        ["p1", 1],
        ["p2", 4],
        ["p1", 2],
      ],
      [0, 1, 2],
    ],
    [
      "a column",
      [
        ["p1", 0],
        ["p2", 1],
        ["p1", 3],
        ["p2", 2],
        ["p1", 6],
      ],
      [0, 3, 6],
    ],
    [
      "a diagonal",
      [
        ["p1", 0],
        ["p2", 1],
        ["p1", 4],
        ["p2", 2],
        ["p1", 8],
      ],
      [0, 4, 8],
    ],
  ] as const)("awards the win for %s", (_label, moves, winningLine) => {
    const state = playing(start(), [...moves]);
    const game = gameOf(state);

    expect(game.outcome).toBe("won");
    expect(game.winner).toBe("p1");
    expect(game.winningLine).toEqual(winningLine);
  });

  test("lets the second seat win too", () => {
    const state = playing(start(), [
      ["p1", 1],
      ["p2", 0],
      ["p1", 2],
      ["p2", 3],
      ["p1", 5],
      ["p2", 6],
    ]);
    const game = gameOf(state);

    expect(game.outcome).toBe("won");
    expect(game.winner).toBe("p2");
    expect(game.winningLine).toEqual([0, 3, 6]);
  });

  test("calls a full board with no line a draw", () => {
    const state = playing(start(), [
      ["p1", 0],
      ["p2", 1],
      ["p1", 2],
      ["p2", 4],
      ["p1", 3],
      ["p2", 5],
      ["p1", 7],
      ["p2", 6],
      ["p1", 8],
    ]);
    const game = gameOf(state);

    expect(game.outcome).toBe("drawn");
    expect(game.winner).toBe("");
    expect(game.winningLine).toEqual([]);
  });

  test("comes to rest once the game is decided", () => {
    const state = playing(start(), [
      ["p1", 0],
      ["p2", 3],
      ["p1", 1],
      ["p2", 4],
      ["p1", 2],
    ]);

    expect(stageOf(state)).toEqual({ id: "gameOver", kind: "automatic" });
    expect(executor.listAvailableCommands(state, { actorId: "p1" })).toEqual(
      [],
    );
    expect(place(state, "p2", 5).ok).toBe(false);
  });

  test("never rests in the stage that decides the outcome", () => {
    const state = playing(start(), [["p1", 0]]);

    expect(stageOf(state).id).not.toBe("resolve");
  });
});
