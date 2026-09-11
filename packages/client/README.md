# @tableverse-kit/client

The typed connection between your frontend and a running
[Tableverse](https://github.com/tableversehq) game. It renders no UI and runs no
rules.

Use it from plain TypeScript, React, Vue, Svelte, or any other browser
framework.

```bash
npm install @tableverse-kit/client
```

## Create one typed client

Import the executor as a type from your engine package:

```ts
import { createTableverseClient } from "@tableverse-kit/client";
import type { executor } from "token-race-engine";

type Game = typeof executor;

export const client = createTableverseClient<Game>();
```

That type parameter derives the game view, command inputs, discovery requests,
and events from the executor, so your frontend types follow your rules.

The same construction call works locally and after publishing. A top-level local
page connects to `tvk dev`; a game loaded by Tableverse connects to its host.

## Client methods

| Method                   | Use it to                                                         |
| ------------------------ | ----------------------------------------------------------------- |
| `ready()`                | Wait for the first state snapshot.                                |
| `getStatus()`            | Read `connecting`, `ready`, `reconnecting`, `error`, or `closed`. |
| `getViewerId()`          | Read the player ID assigned to this client.                       |
| `getView()`              | Read the latest viewer-safe state, or `null` before ready.        |
| `getStateVersion()`      | Read the latest snapshot version.                                 |
| `getAvailableCommands()` | Ask which command IDs the viewer may use now.                     |
| `discover(request)`      | Ask the engine for legal choices for a command.                   |
| `execute(command)`       | Submit a typed command.                                           |
| `subscribe(listener)`    | React to snapshots and connection-status changes.                 |
| `onEvent(listener)`      | React to domain and stage events.                                 |
| `dispose()`              | Close the connection and remove listeners.                        |

## Submit a command

```ts
await client.ready();

const result = await client.execute({
  type: "score",
  input: { points: 1 },
});

if (!result.accepted) {
  showError(result.reason ?? "command_rejected");
}
```

The host supplies the authenticated viewer identity, so commands carry no
`actorId`. An accepted response means the rules accepted the command; the
updated view arrives through your subscription.

## Entry points

- `@tableverse-kit/client` — `createTableverseClient`, `TransportError`, and the game-shape types.
- `@tableverse-kit/client/dev` — `TransportClient` and `DevTransport` for driving a local session directly, including from Node by injecting an `SseFactory`.

## Documentation

[Client documentation](https://github.com/tableversehq/tableverse-kit/tree/main/packages/docs/client)
covers local sessions, published games, views, and subscriptions.

## License

[Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)
