import {
  createGameExecutor,
  createStageFactory,
  GameDefinitionBuilder,
  type SingleActivePlayerStageDefinition,
} from "@tableverse-kit/engine";
import { act } from "./commands.ts";
import { events } from "./events.ts";
import { GameState, gameState } from "./state.ts";
import { setupGame } from "./rules.ts";
import { whiten } from "./random.ts";
const stage = createStageFactory<GameState, typeof events>();
const gameOver = stage("game_over").automatic().build();
const turn: SingleActivePlayerStageDefinition<GameState> = stage("turn")
  .singleActivePlayer()
  .activePlayer(({ game }) => game.pending[0]?.actor ?? game.active)
  .commands([act])
  .nextStages(() => ({ turn, gameOver }))
  .transition(({ game, nextStages }) =>
    game.winner ? nextStages.gameOver : nextStages.turn,
  )
  .build();
export const game = new GameDefinitionBuilder("arcs")
  .state(gameState)
  .events(events)
  .players({ min: 2, max: 4 })
  .setup(({ game, players, rng }) => setupGame(game, players, whiten(rng)))
  .initialStage(turn)
  .build();
export const executor = createGameExecutor(game);
