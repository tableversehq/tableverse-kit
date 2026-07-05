# splendor-example

Workspace consumer package for implementing the base Splendor game on top of
`@tableverse-kit/engine`.

The example currently exercises:

- official Splendor setup for 2-4 players
- root-state authoring through `defineGameState(...).stateClass(...)`
- command validation and execution for the base turn actions
- `t` model metadata for root and nested board/bank state objects
- engine-managed turn progression lifecycle
- noble claiming and endgame handling through turn lifecycle hooks
