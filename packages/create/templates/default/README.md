# {{projectName}}

A Tableverse project scaffolded with `create-tableverse`. It is an npm workspace
with two packages:

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

Open the shell at `http://127.0.0.1:5100`. It asks how many seats to deal, a
seed, and any setup input your game declares, then frames your frontend with a
button per seat so you can play every player from one browser. **Reset** deals a
fresh match on the same parameters and **Exit game** returns to the form.

Edit `engine/src` to change the rules and `client/src` to change the UI.
