import {
  createGameExecutor,
  createStageFactory,
  GameDefinitionBuilder,
  type SingleActivePlayerStageDefinition,
} from "@tableverse-kit/engine";
import { score } from "./commands.ts";
import { events } from "./events.ts";
import { GameState, gameState } from "./state.ts";

const defineStage = createStageFactory<GameState, typeof events>();

const turn: SingleActivePlayerStageDefinition<GameState> = defineStage("turn")
  .singleActivePlayer()
  // The roster comes from the match's init contract; the first seat acts.
  .activePlayer(({ runtime }) => runtime.players[0]!)
  .commands([score])
  .nextStages(() => ({ turn }))
  .transition(({ nextStages }) => nextStages.turn)
  .build();

export const game = new GameDefinitionBuilder("splendor")
  .state(gameState)
  .events(events)
  .players({ min: 2, max: 4 })
  // Copy the authoritative roster into game state so `getView` exposes it (and a
  // per-seat score) to every client.
  .setup(({ game, players }) => {
    game.players = [...players];
    game.scores = Object.fromEntries(players.map((playerId) => [playerId, 0]));
  })
  .initialStage(turn)
  .build();

export const executor = createGameExecutor(game);
