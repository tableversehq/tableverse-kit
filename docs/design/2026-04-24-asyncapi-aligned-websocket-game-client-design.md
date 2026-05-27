# AsyncAPI-Aligned WebSocket Game Client Design

## Purpose

Define the next direction for `ttk generate client-sdk`.

The generated artifact should no longer stop at type aliases. It should
generate a small runtime client for the engine-scoped hosted gameplay protocol.

This client should feel closer to Eden in ergonomics, while remaining anchored
to `tabletop-engine`'s AsyncAPI generation as the canonical protocol contract.

## Goals

The generated client should cover only engine-scoped gameplay interaction:

- list available commands
- discover command input
- execute command
- receive player-visible game updates
- receive game-end payloads

The generated client should not cover hosting product concerns:

- room creation or joining
- player-session creation
- reconnect policy
- host transfer
- lobby state
- non-engine room lifecycle events

## Source Of Truth

The generated client must align with `tabletop-engine` AsyncAPI generation.

This means:

- the engine's protocol model remains the canonical definition
- AsyncAPI is the stable external contract
- the CLI-generated client is an opinionated implementation of that contract
- custom generators can target the same AsyncAPI output and remain aligned

The CLI must not invent a parallel ad hoc protocol that is not representable by
the engine's AsyncAPI surface.

## Why The Current Output Is Not Enough

The current generated `client-sdk.generated.ts` is mostly a type artifact:

- visible state type
- command request types
- discovery request/result types
- helper aliases

That is useful, but it is not a client.

For hosted online play, the web package should not need to hand-author the
engine-specific WebSocket request/response layer for every game. That layer is
stable enough to generate.

## Transport Direction

For hosted gameplay, player-originated engine requests should use WebSocket.

This is already the chosen direction for the online Splendor host:

- room and session APIs remain outside engine scope
- live gameplay requests and engine updates flow through the live socket

Because the hosted server proactively pushes visible state, the generated client
does not need a `getView()` request method.

Instead, the generated client should expose:

- request methods for gameplay actions
- event handlers for pushed engine events

## Generated Client Shape

The generated file should export a runtime factory:

```ts
const client = createGameEngineClient(socket);
```

For now, `gameEngineClient` is an acceptable consumer-facing name. The factory
name should be:

```ts
createGameEngineClient(...)
```

The returned object should expose:

- `listAvailableCommands(...)`
- per-command `discoverXxx(...)`
- per-command `executeXxx(...)`
- `onGameSnapshot(...)`
- `onGameEnded(...)`
- `onDiscoveryResult(...)`
- `onExecutionResult(...)`

Each event handler should return an unsubscribe function.

Example shape:

```ts
const client = createGameEngineClient(socket);

const offSnapshot = client.onGameSnapshot((event) => {
  // update UI state
});

const offEnded = client.onGameEnded((event) => {
  // show end screen
});

await client.listAvailableCommands({
  gameSessionId,
  actorId,
});

await client.discoverTakeThreeDistinctGems({
  gameSessionId,
  actorId,
  step: "select_gem_color",
  input: {},
});

await client.executeTakeThreeDistinctGems({
  gameSessionId,
  actorId,
  input: {
    colors: ["white", "blue", "green"],
  },
});
```

## Request Methods

The generated client should expose one generic request method per engine
operation internally:

- list available commands
- discover command
- execute command

On top of that, it should generate per-command convenience methods for
ergonomics.

This gives both:

- a compact runtime implementation
- ergonomic application code

### Generic Methods

The generic methods should look roughly like:

```ts
client.listAvailableCommands(request);
client.discover(request);
client.execute(request);
```

### Per-Command Methods

The generated client should also include command-specific helpers:

```ts
client.discoverTakeThreeDistinctGems(request);
client.executeTakeThreeDistinctGems(request);
```

The per-command methods are wrappers over the generic methods, not separate
transport implementations.

## Event Handlers

The generated client should expose separate event hooks instead of only a
single catch-all subscription function.

This is the right ergonomic direction because client applications often need
distinct logic for:

- state reconciliation
- transition animations
- discovery UI
- execution acknowledgements
- end-of-game behavior

Required handlers:

- `onGameSnapshot(...)`
- `onGameEnded(...)`
- `onDiscoveryResult(...)`
- `onExecutionResult(...)`

Optional low-level escape hatch:

- `onMessage(...)`

The low-level hook is useful, but it should be secondary to the event-specific
handlers.

## Correlation Model

WebSocket request methods must use request ids.

Client-originated engine requests should include a generated `requestId`.
Server responses to those requests should include the matching `requestId`.

This allows the generated client to:

- resolve the correct promise for `listAvailableCommands(...)`
- resolve the correct promise for `discover...(...)`
- resolve the correct promise for `execute...(...)`
- keep event handlers separate from one-off request/response promises

Without request ids, the generated client would have to guess which response
belongs to which request. That is not acceptable once multiple in-flight engine
requests are possible.

## Canonical Engine-Scoped Messages

The engine-scoped hosted protocol should be defined independently from room and
session messages.

At minimum, the canonical message set should support:

Client-to-server:

- `game_list_available_commands`
- `game_discover`
- `game_execute`

Server-to-client:

- `game_available_commands`
- `game_discovery_result`
- `game_execution_result`
- `game_snapshot`
- `game_ended`

Request/response messages should include `requestId`.
Push-only messages such as `game_snapshot` and `game_ended` do not need one.

## Relationship To AsyncAPI

If the current AsyncAPI output does not yet model these messages clearly enough,
the AsyncAPI generation must be extended before or alongside client generation.

The generated runtime client should be a direct projection of the protocol
surface, not a freehand wrapper over server implementation details.

That means the protocol model needs to represent:

- engine-scoped WebSocket message names
- request/response pairs
- pushed engine events
- request correlation
- command-specific payload schemas
- discovery request/result payload schemas

## Relationship To Eden

The desired ergonomics are Eden-like:

- pass in a connection target
- get back a small typed client object
- call typed methods directly
- attach typed event handlers directly

However, the implementation source of truth should not mirror Eden exactly.

Eden works primarily from framework-level type inference over `App extends
Elysia<...>`.

For `tabletop-engine`, the better source of truth is the protocol descriptor
and AsyncAPI surface, because:

- the engine is transport-agnostic
- custom generators should remain possible
- the generated client must stay aligned with the formal protocol contract

So the goal is:

- Eden-like ergonomics
- AsyncAPI-driven generation

Not:

- reimplement Eden's exact type-only framework coupling

## Runtime Input To The Generated Client

The generated client should accept an existing WebSocket-like transport instead
of owning room/session connection setup.

For example:

```ts
const client = createGameEngineClient(socket);
```

This keeps connection ownership outside the engine client and matches the design
boundary that room and session concerns belong to the host application.

The runtime factory may later support a URL-based convenience constructor, but
that should not be the initial required shape.

## Out Of Scope

Still out of scope for the generated engine client:

- room lifecycle APIs
- lobby APIs
- reconnect policy
- anonymous session creation
- host transfer behavior
- server deployment decisions
- frontend state-management decisions

## Consequences

This design implies follow-up work in both the engine and the CLI:

1. extend engine protocol/AsyncAPI generation to model the hosted engine-scoped
   WebSocket contract precisely
2. update CLI generation to emit:
   - types
   - a runtime WebSocket client factory
   - per-command request helpers
   - typed event hooks
3. update the Splendor hosted server to align its engine-scoped live messages
   with that canonical protocol
4. replace the web package's hand-authored engine message handling with the
   generated client

## Direction Summary

The correct next client-sdk direction is:

- keep AsyncAPI as the source of truth
- generate an Eden-like runtime client for engine-scoped WebSocket gameplay
- generate per-command convenience methods and per-event handler APIs
- keep room/session/lobby APIs out of scope
