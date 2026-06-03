# splendor-example

Workspace consumer package for implementing the base Splendor game on top of
`@tabletop-kit/engine`.

The example currently exercises:

- official Splendor setup for 2-4 players
- root-state facade authoring through `rootState(SplendorGameStateFacade)`
- command validation and execution for the base turn actions
- `@field(t...)` metadata for root and nested board/bank facade objects
- engine-managed turn progression lifecycle
- noble claiming and endgame handling through turn lifecycle hooks
