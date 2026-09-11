# @tableverse-kit/cli

## 0.1.0-beta.2

### Patch Changes

- `tvk dev` seats a roster that matches the player count your game declares, so a client that names no players starts the match. Scaffolded projects keep the rules-server URL on screen when the frontend starts.
- The CLI reaches the production platform by default. `TABLEVERSE_API_URL` and `TABLEVERSE_WEB_URL` point it at another deployment.
