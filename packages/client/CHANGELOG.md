# @tableverse-kit/client

## 0.1.0-beta.3

### Patch Changes

- `tvk dev` serves a developer shell at the rules server's address. Choose the seats, seed, and setup input for a match, then play every seat from one browser: the shell frames your frontend with a button per seat, a Reset that deals a fresh match, and an Exit that returns to the form. The setup form is built from your game's setup input schema, so it collects the same fields players see. Game frontends need no code for this.
- Updated dependencies
  - @tableverse-kit/engine@0.1.0-beta.1

## 0.1.0-beta.2

### Patch Changes

- `tvk dev` seats a roster that matches the player count your game declares, so a client that names no players starts the match. Scaffolded projects keep the rules-server URL on screen when the frontend starts.
