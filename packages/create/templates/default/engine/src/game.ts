import {
  createGameExecutor,
  createStageFactory,
  GameDefinitionBuilder,
  type AutomaticStageDefinition,
  type SingleActivePlayerStageDefinition,
} from "@tableverse-kit/engine";
import { place } from "./commands.ts";
import { events } from "./events.ts";
import { GameState, gameState } from "./state.ts";

const defineStage = createStageFactory<GameState, typeof events>();

const gameOver: AutomaticStageDefinition<GameState> = defineStage("gameOver")
  .automatic()
  .build();

const resolve: AutomaticStageDefinition<GameState> = defineStage("resolve")
  .automatic()
  .run(({ game, emitEvent }) => {
    const completed = game.completedLine();

    if (completed) {
      game.outcome = "won";
      game.winner = game.seatWithMark(completed.mark);
      game.winningLine = [...completed.cells];
      emitEvent({
        type: "ended",
        payload: {
          outcome: "won",
          winner: game.winner,
          winningLine: game.winningLine,
        },
      });
      return;
    }

    if (game.isFull()) {
      game.outcome = "drawn";
      emitEvent({
        type: "ended",
        payload: { outcome: "drawn", winner: "", winningLine: [] },
      });
    }
  })
  .nextStages(() => ({ turn, gameOver }))
  .transition(({ game, nextStages }) =>
    game.outcome === "playing" ? nextStages.turn : nextStages.gameOver,
  )
  .build();

const turn: SingleActivePlayerStageDefinition<GameState> = defineStage("turn")
  .singleActivePlayer()
  .activePlayer(({ game }) => game.seatToPlay())
  .commands([place])
  .nextStages(() => ({ resolve }))
  .transition(({ nextStages }) => nextStages.resolve)
  .build();

export const game = new GameDefinitionBuilder("{{projectName}}")
  .state(gameState)
  .events(events)
  .players({ min: 2, max: 2 })
  .setup(({ game, players }) => {
    game.players = [...players];
    game.marks = Object.fromEntries(
      players.map((playerId, seat) => [playerId, seat === 0 ? "X" : "O"]),
    );
    game.board = GameState.emptyBoard();
    game.outcome = "playing";
    game.winner = "";
    game.winningLine = [];
  })
  .initialStage(turn)
  .build();

export const executor = createGameExecutor(game);
