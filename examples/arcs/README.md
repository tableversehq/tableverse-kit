# arcs

A digital edition of Arcs for two to four players, built on Tableverse. It is a
npm workspace with two packages:

- **`engine/`** — the rules: state, commands, events, and stage flow, built
  with `@tableverse-kit/engine`. This is what the platform runs.
- **`client/`** — the table, built with React and Vite. It talks to the running
  game through `@tableverse-kit/client`, and uses the engine's rules only to
  preview which moves are legal.

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
decides what it means, and every client receives the resulting view. Arcs has a
single command, `act`, whose `op` names the move (`play`, `tax`, `move`,
`battle`, `choose`, …).

| File                  | What it holds                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engine/src/data.ts`  | Cards, map, setup cards, dice faces                                                                                                                     |
| `engine/src/state.ts` | The game state and its visibility rules                                                                                                                 |
| `engine/src/rules.ts` | Every rule: card play, actions, battle, pending choices, scoring                                                                                        |
| `engine/src/game.ts`  | The turn stage; the active player is whoever owes a decision                                                                                            |
| `client/src/model/`   | The client's view of the rules: hydrating a `GameState` from the view, dry-running candidate commands, and the step-by-step flows behind every decision |
| `client/src/map/`     | The SVG map of the Reach and the animations derived from state changes                                                                                  |
| `client/src/ui/`      | The table: prompt bar, hand, player boards, Court, ambitions, dice, log                                                                                 |

The client imports the engine's rules and dry-runs each candidate command
against a copy of the current view. A candidate that the rules accept glows on
the table; one they reject never appears. The engine still validates every
command it receives. `docs/design/2026-10-08-arcs-ui-redesign.md` describes the
interaction model.

To look at a mid-game table while working on the UI, start a match from the
developer shell and play random legal moves into it:

```sh
npx tsx client/scripts/autoplay.ts http://localhost:5100 120 1
```

## Verify

```sh
npm run typecheck
npm test
```

The client tests include full games played only through the UI's own flows,
which check that every move the table offers is one the engine accepts.

When you are ready to publish, see `tableverse.config.ts` and run
`npx tvk upload`.
