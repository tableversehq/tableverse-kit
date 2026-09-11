# @tableverse-kit/engine

The rules package for a [Tableverse](https://github.com/tableversehq) game. It
turns your game definition into one `GameExecutor` that Tableverse runs.

Your frontend never imports these rules. It talks to the executor through
[`@tableverse-kit/client`](https://github.com/tableversehq/tableverse-kit/tree/main/packages/client).

```bash
npm install @tableverse-kit/engine
```

## The four parts of a game

- **State** — the saved facts of the game: scores, pieces, decks, player order.
- **Commands** — the actions players attempt, with input validation and execution.
- **Stages** — the current phase, its allowed commands, its active players, and what comes next.
- **Game definition** — state, events, setup, and the initial stage assembled into one game.

## Example

```ts
import {
  createCommandFactory,
  createGameExecutor,
  createStageFactory,
  defineEvents,
  defineGameState,
  GameDefinitionBuilder,
  t,
} from "@tableverse-kit/engine";

class GameState {
  players: string[] = [];
  scores: Record<string, number> = {};
}

const gameState = defineGameState()
  .model({
    players: t.array(t.string()),
    scores: t.record(t.string(), t.number()),
  })
  .stateClass(GameState)
  .build();

const events = defineEvents({
  scored: t.object({ points: t.number() }),
});

const defineCommand = createCommandFactory<GameState, typeof events>();

const score = defineCommand({
  commandId: "score",
  commandSchema: t.object({ points: t.number() }),
})
  .validate(({ command }) =>
    command.input.points > 0
      ? { ok: true as const }
      : { ok: false as const, reason: "points_must_be_positive" },
  )
  .execute(({ game, command, emitEvent }) => {
    game.scores[command.actorId] =
      (game.scores[command.actorId] ?? 0) + command.input.points;
    emitEvent({ type: "scored", payload: { points: command.input.points } });
  })
  .build();

const defineStage = createStageFactory<GameState, typeof events>();

const turn = defineStage("turn")
  .singleActivePlayer()
  .activePlayer(({ runtime }) => runtime.players[0]!)
  .commands([score])
  .nextStages(() => ({ turn }))
  .transition(({ nextStages }) => nextStages.turn)
  .build();

const game = new GameDefinitionBuilder("token-race")
  .state(gameState)
  .events(events)
  .players({ min: 2, max: 4 })
  .setup(({ game, players }) => {
    game.players = [...players];
    game.scores = Object.fromEntries(players.map((id) => [id, 0]));
  })
  .initialStage(turn)
  .build();

export const executor = createGameExecutor(game);
```

## Main exports

- `t` — serializable field and command input schemas.
- `defineGameState` — pairs saved fields with a state class.
- `createCommandFactory` — creates commands for that class.
- `createStageFactory` — creates the flow between player actions.
- `defineEvents` — declares player-facing event payloads.
- `GameDefinitionBuilder` — assembles the game.
- `createGameExecutor` — produces the finished runtime surface.
- `createSnapshot` / `restoreSnapshot`, `createReplayRecord` / `replayRecord` — snapshots and replay.
- `runScenario` — a scenario-style test harness.

## Rules to keep in mind

- Use the provided `rng` for every random choice. `Math.random()` cannot be replayed.
- Store only values described by `t` schemas.
- Put rule changes inside command execution, automatic stages, or setup.
- Treat `game` as read-only in validation, availability, and transition callbacks.
- Use hidden-information rules for secrets, and send each player their own view.

The package runs inside the platform's `isolated-vm` sandbox, so it stays free
of Node and browser globals.

## Documentation

[Engine documentation](https://github.com/tableversehq/tableverse-kit/tree/main/packages/docs/engine) covers state, commands,
stages, game definitions, hidden information, the executor, and testing.

## License

[Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)
