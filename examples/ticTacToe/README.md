# tictactoe

A Tableverse project scaffolded with `create-tableverse`. It ships a playable
two-player tic-tac-toe game for you to replace with your own. It is an npm
workspace with two packages:

- **`engine/`** — your game's rules: state, commands, events, and stage flow,
  built with `@tableverse-kit/engine`. This is what the platform runs.
- **`client/`** — the frontend that renders the game, built with Vite. It talks
  to the rules through `@tableverse-kit/client` and never runs the engine
  itself.

## Develop

```sh
npm install
```

Start the local rules server, the frontend, and the developer shell:

```sh
npm run dev
```

Open the address it prints, `http://localhost:5100`. It asks how many seats to
deal, a seed, and any setup input your game declares, then frames your frontend
with a button per seat so you can play every player from one browser. **Reset**
deals a fresh match on the same parameters and **Exit game** returns to the form.

## How the game fits together

A move travels in one direction: the frontend sends a command, the engine
decides what it means, and every client receives the resulting view.

| File                     | What it holds                                                       |
| ------------------------ | ------------------------------------------------------------------- |
| `engine/src/state.ts`    | The board, the seat-to-mark mapping, and the rules for reading them |
| `engine/src/commands.ts` | `place`, the only move a player can make                            |
| `engine/src/events.ts`   | `marked` and `ended`, which clients can listen for                  |
| `engine/src/game.ts`     | The stages: whose turn it is, and when the game is over             |
| `client/src/main.ts`     | Connects to the rules, renders the status, sends moves              |
| `client/src/board.ts`    | The nine cells and the winning line                                 |
| `client/src/styles.css`  | The look, including light and dark                                  |

The stage flow is the part worth reading first. `turn` lets the seated player
run `place`, then hands control to `resolve`, which decides whether the game
continues:

```text
turn ──place──> resolve ──┬─ still playing ──> turn
                          └─ won or drawn ───> gameOver
```

`gameOver` declares no transition, which is how a game comes to rest. Because
`resolve` owns that decision, a new command cannot forget to check for a winner.

Your client never trusts itself: it renders `client.getView()` and sends
commands, and the engine rejects anything illegal. Try clicking a taken cell, or
a cell when it is not your turn.

## Make it yours

1. Rewrite `engine/src/state.ts` for the state your game needs.
2. Replace `place` in `engine/src/commands.ts` with your own moves.
3. Adjust the stages in `engine/src/game.ts`, and `players` for your seat count.
4. Rebuild `client/src` to render it.

Run `npm run typecheck` as you go. When you are ready to publish, see
`tableverse.config.ts` and run `npx tvk upload`.
