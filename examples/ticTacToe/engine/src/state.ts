import { defineGameState, t } from "@tableverse-kit/engine";

export const BOARD_SIZE = 9;

export const EMPTY_CELL = "";

export const WINNING_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export type Mark = "X" | "O";

export interface CompletedLine {
  mark: Mark;
  cells: readonly number[];
}

export class GameState {
  players: string[] = [];

  marks: Record<string, string> = {};

  board: string[] = [];

  outcome = "playing";

  winner = "";

  winningLine: number[] = [];

  static emptyBoard(): string[] {
    return Array.from({ length: BOARD_SIZE }, () => EMPTY_CELL);
  }

  markOf(playerId: string): Mark {
    return this.marks[playerId] === "O" ? "O" : "X";
  }

  placedCount(): number {
    return this.board.filter((cell) => cell !== EMPTY_CELL).length;
  }

  markToPlay(): Mark {
    return this.placedCount() % 2 === 0 ? "X" : "O";
  }

  seatWithMark(mark: Mark): string {
    return this.players.find((playerId) => this.marks[playerId] === mark) ?? "";
  }

  seatToPlay(): string {
    return this.seatWithMark(this.markToPlay());
  }

  isCellOpen(cell: number): boolean {
    return this.board[cell] === EMPTY_CELL;
  }

  isFull(): boolean {
    return this.board.every((cell) => cell !== EMPTY_CELL);
  }

  completedLine(): CompletedLine | null {
    for (const cells of WINNING_LINES) {
      const [first] = cells;
      const mark = first === undefined ? EMPTY_CELL : this.board[first];
      if (
        (mark === "X" || mark === "O") &&
        cells.every((cell) => this.board[cell] === mark)
      ) {
        return { mark, cells };
      }
    }
    return null;
  }
}

export const gameState = defineGameState()
  .model({
    players: t.array(t.string()),
    marks: t.record(t.string(), t.string({ enum: ["X", "O"] })),
    board: t.array(t.string({ enum: [EMPTY_CELL, "X", "O"] })),
    outcome: t.string({ enum: ["playing", "won", "drawn"] }),
    winner: t.string(),
    winningLine: t.array(t.number({ min: 0, max: BOARD_SIZE - 1 })),
  })
  .stateClass(GameState)
  .build();
