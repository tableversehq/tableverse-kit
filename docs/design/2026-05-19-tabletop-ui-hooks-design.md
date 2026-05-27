# Tabletop UI Hooks Design

## Summary

This doc fixes the hooks half of `@tabletop-kit/ui`. It enumerates the
problems hooks solve, defines the `TTKitClient` interface they read from,
and specifies each hook's signature, behavior, and intended use.

It supersedes the hooks sketch in the
[2026-05-01 Tabletop UI Library Design](./2026-05-01-tabletop-ui-library-design.md)
and slots under the
[2026-05-18 Tabletop UI Stack And Onboarding](./2026-05-18-tabletop-ui-stack-and-onboarding.md)
doc as the "what hooks ship in v1" specification.

It also depends on the framework decision in the
[2026-05-19 Tabletop Kit As Framework](./2026-05-19-tabletop-kit-as-framework.md)
doc: the hooks layer is deliberately engine-coupled, and the
`TTKitClient` interface is engine-shaped.

It is intended to be detailed enough to serve as a system prompt for the
boardgame-implementation agent.

## Substrate

Two facts hold across every game built on Tabletop Kit:

1. **The engine produces a state tree.** Whatever facade classes the game
   author writes, what crosses the boundary into UI is a plain JSON-shaped
   object representing all information visible to the current viewer.
2. **The state tree changes over time.** Each accepted command produces a
   new tree. The UI re-renders against the new tree.

Two facts that **do not** hold across every deployment:

1. **Transport is not fixed.** A single-player offline game has no
   network — the engine runs in the same JavaScript context as the UI. A
   hosted multiplayer game runs the engine on a server and pushes views
   over WebSocket. The hooks must work for both without code changes in
   either the components or the hooks themselves.
2. **Command construction is not always async.** Discovery, validation,
   and execution might resolve synchronously (in-process) or
   asynchronously (over the wire). The hooks must not bake in either
   assumption.

The hooks layer's job is to encode everything that is universal across
games and transport-independent across deployments, while remaining honest
that it only works against the Tabletop Kit engine model.

## What hooks must not do

- **No network protocol.** Hooks do not know about WebSocket, HTTP, or any
  specific transport. They consume a `TTKitClient` interface; how that
  interface is implemented is the consumer's problem.
- **No room / lobby / matchmaking.** That is a Tabletop Lab platform
  concern and lives outside the public package. Hooks start at "we have a
  live game session"; they end at "the player committed a command."
- **No authentication, persistence, or session tokens.**
- **No assumption that there is exactly one viewer in a tree.** A
  Provider serves one viewer at a time, but observer apps may mount two
  Providers with two different clients.
- **No global state library imposed on the customer.** No Redux, no
  Zustand exported to the customer. The internal store is private.

## The TTKitClient interface

Every hook reads from one object satisfying:

```ts
export interface TTKitGame {
  view: unknown;
  event: unknown;
  command: unknown;
  discovery: {
    payload: unknown;
    result: unknown;
  };
}

export interface TTKitClient<G extends TTKitGame> {
  // Identity — fixed for the lifetime of the client.
  readonly viewerId: string;

  // Current snapshot. null before the first snapshot arrives.
  getView(): G["view"] | null;
  getAvailableCommands(): readonly string[];
  getStateVersion(): number | null;

  // Coarse subscription. Fires when any of (view, availableCommands,
  // stateVersion) change.
  subscribe(listener: () => void): () => void;

  // Event stream. See "Ordering contract" below.
  onEvent(listener: (event: G["event"]) => void): () => void;

  // Commands. Implementations may resolve sync (in-process) or async
  // (over wire); the interface does not care.
  discover(
    request: G["discovery"]["payload"],
  ): Promise<G["discovery"]["result"]>;
  execute(command: G["command"]): Promise<ExecutionResult>;

  // Cleanup.
  dispose(): void;
}

export interface ExecutionResult {
  accepted: boolean;
  reason?: string;
}
```

`G` is the per-game type bundle. Customers register it once (see
"Generic typing" below) and every hook resolves its types automatically.

### Why one bundled generic

All five inner types are produced together from a single game
definition. They travel together; pairing `SplendorView` with
`WingspanCommand` is nonsense. Bundling them lets:

- Codegen emit one type alias per game (`export type SplendorGame = { ... }`).
- Module augmentation register the game with one statement.
- Hook signatures stay quiet — no per-call generic parameters.

### Ordering contract

When a new snapshot arrives, the implementation guarantees this order:

1. Internal state updates — `getView()`, `getAvailableCommands()`, and
   `getStateVersion()` now reflect the new snapshot.
2. `subscribe()` listeners fire.
3. `onEvent()` listeners fire, in event order, for each event in the
   snapshot.

Consequence: a component reacting to an event via `useGameEvents` sees
the post-event view via `useGameState`. Toasts, animations, and side
effects do not have to look at stale state.

### Mapping to WebSocket transport

The interface is transport-agnostic, but Tabletop Lab will implement it
over WebSocket. The mapping is mechanical:

| Interface member         | WS implementation                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `viewerId`               | fixed at connection auth time                                                                                       |
| `getView()`              | cached `game_snapshot.view`                                                                                         |
| `getAvailableCommands()` | cached `game_snapshot.availableCommands`                                                                            |
| `getStateVersion()`      | cached `game_snapshot.stateVersion`                                                                                 |
| `subscribe(l)`           | fires when any `game_snapshot` arrives                                                                              |
| `onEvent(l)`             | per event in `game_snapshot.events` and `game_execution_result.events`, deduped by `(stateVersion, eventIndex)`     |
| `discover(req)`          | send `discover` envelope with internal requestId, await matching `game_discovery_result`, return unwrapped `result` |
| `execute(cmd)`           | send `execute` envelope, await matching `game_execution_result`, return `{ accepted, reason? }`                     |
| `dispose()`              | close socket, reject pending promises                                                                               |

requestId correlation, envelopes, and JSON encoding stay private to the
codegen-emitted module. UI consumers never see them.

### Implementations that ship

| Implementation                                              | Where                        | Used for                                                                                                   |
| ----------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `createInProcessClient(executor, { viewerId })`             | `@tabletop-kit/ui`           | Single-player offline games; engine runs in the browser.                                                   |
| Codegen factory (e.g. `createSplendorClient(socket, opts)`) | Private Tabletop Lab codegen | Hosted multiplayer games. Codegen targets `TTKitClient<G>` directly — no separate adapter.                 |
| Custom                                                      | Customer code                | Any other transport (HTTP polling, IPC, custom WS, gRPC). Customer implements `TTKitClient<G>` themselves. |

`@tabletop-kit/ui` ships only the in-process implementation. The
generated Tabletop Lab factory lives in the private repo. Third-party
adapters live in customer code.

## Provider

A single Provider injects the client into the React tree:

```tsx
import { TTKitProvider } from "@tabletop-kit/ui";

<TTKitProvider client={client}>
  <App />
</TTKitProvider>;
```

The Provider takes ownership of subscription. It calls
`client.subscribe(...)` once, fans updates out to consumers via
`useSyncExternalStore`, and calls `dispose()` on unmount.

There is no client-creation logic inside the Provider. The customer
constructs the client externally and hands it in. This keeps the Provider
transport-agnostic and lets tests pass a fake client.

## Problems and hooks

Each subsection below states a problem, why it repeats across games, and
the hook that solves it.

### Problem 1 — Re-rendering on state change without re-rendering everything

Every component reads from the same large view tree. Naive React would
either re-render the entire tree on every snapshot (job-killing in a game
with a dozen player areas and forty cards) or force each component to
re-implement its own slice + memo logic.

**Hook: `useGameState(selector, isEqual?)`**

```ts
function useGameState<T>(
  selector: (view: View) => T,
  isEqual?: (a: T, b: T) => boolean,
): T;
```

`View` resolves from the registered game type (see "Generic typing").
Reads the current view through the selector, re-renders only when the
selector's output changes by `isEqual` (default `Object.is`). Internally
a `useSyncExternalStore` over the Provider's snapshot. Throws if called
before a view is loaded.

```tsx
function GemBank() {
  const bank = useGameState((view) => view.board.bank);
  return (
    <div className="gem-bank">
      {Object.entries(bank).map(([color, count]) => (
        <TokenPile key={color} color={color} count={count} />
      ))}
    </div>
  );
}
```

Why it repeats: every game has dozens of "this component cares about a
specific slice" reads. Without a hook, every consumer rolls its own
selector.

### Problem 2 — Knowing whether the view is loaded yet

The first render happens before any snapshot has arrived (over wire) or
been constructed (in-process). Components need a non-throwing way to ask.

**Hook: `useGameStateOrNull(selector?)`**

```ts
function useGameStateOrNull(): View | null;
function useGameStateOrNull<T>(selector: (view: View) => T): T | null;
```

Same as `useGameState` but returns `null` when no view is loaded yet.
Top-level "is the game ready?" checks use this; deeper consumers use
`useGameState` and let it throw.

```tsx
function GameRoot() {
  const view = useGameStateOrNull();
  if (!view) return <LoadingScreen />;
  return <Board />;
}
```

Why it repeats: the top-level readiness check exists once per game; the
slice reads inside the tree are always inside it.

### Problem 3 — The discovery state machine

Most commands have multi-step input construction. "Take three distinct
gems" requires three gem picks. "Buy a card" requires picking a card and
possibly returning excess tokens. The engine's discovery protocol expresses
this as a state machine: open → pick option → open with new options → … →
complete → confirm.

Every game has this. The state machine shape is the same every time —
only the option payloads differ.

**Hook: `useDiscovery()`**

```ts
function useDiscovery(): {
  // What the player is currently building.
  activeCommandType: string | null;

  // The current open discovery, if any. Contains options to display.
  open: OpenDiscovery | null;

  // Picks made so far in this discovery flow.
  trail: ReadonlyArray<PickedOption>;

  // Final, executable input once discovery is complete.
  pendingInput: Command["input"] | null;

  // Status flags.
  status: "idle" | "discovering" | "ready_to_confirm" | "executing" | "error";
  error: string | null;

  // Actions.
  start(commandType: string, input?: unknown): void;
  pick(option: PickOption): void;
  confirm(): void;
  cancel(): void;
};
```

The hook owns the state machine. It calls `client.discover(...)` to
advance and `client.execute(...)` to confirm. On rejection it surfaces
the error via `status: "error"` + `error`.

```tsx
function CommandBar() {
  const d = useDiscovery();

  if (d.status === "idle") return null;

  return (
    <div className="command-bar">
      <span>{d.activeCommandType}</span>
      {d.status === "ready_to_confirm" && (
        <button onClick={() => d.confirm()}>Confirm</button>
      )}
      <button onClick={() => d.cancel()}>Cancel</button>
      {d.error && <span className="error">{d.error}</span>}
    </div>
  );
}

function ActionList() {
  const d = useDiscovery();
  const available = useGameState((v) => v.runtime.availableCommands);
  return (
    <ul>
      {available.map((cmd) => (
        <li key={cmd}>
          <button disabled={d.status !== "idle"} onClick={() => d.start(cmd)}>
            {cmd}
          </button>
        </li>
      ))}
    </ul>
  );
}
```

Why it repeats: every game with discovery-based commands needs the same
"track active command, accumulate picks, confirm or cancel" loop.

### Problem 4 — Knowing whether a specific element is selectable right now

A blue gem token rendered on the board has to know:

- Is there an active command that wants gem picks?
- Is the current open discovery step accepting gem picks?
- Is _blue_ among the options at this step?
- Has blue already been picked in this discovery flow?

This is the load-bearing problem the hooks layer exists to solve. Without
it, every selectable component re-derives ~10 lines of cross-cutting state
checks, and every game gets them subtly wrong.

**Hook: `useSelectable(slot, target)`**

```ts
type SelectableState = "selectable" | "selected" | "unselectable" | "idle";

function useSelectable(
  slot: string,
  target: unknown,
): {
  state: SelectableState;
  onClick: () => void;
  // The matching option, if state === "selectable". Useful for previews.
  option: PickOption | null;
};
```

`slot` is the discovery step identifier (e.g. `"gem"`, `"card"`,
`"noble"`). `target` is the value uniquely identifying this element
within that slot (e.g. `"blue"`, `cardId`, `nobleId`).

Internally the hook:

1. Reads `useDiscovery().open`.
2. If `open` is null or `open.step !== slot`, returns `state: "idle"`.
3. Searches `open.options` for a matching `target`.
4. If found: returns `state: "selectable"` and an `onClick` that calls
   `discovery.pick(option)`.
5. Otherwise: returns `state: "unselectable"` (there is an open discovery
   that does not accept this target).
6. If the target is already in `discovery.trail` for this flow, returns
   `state: "selected"`.

```tsx
function Gem({ color }: { color: GemColor }) {
  const { state, onClick } = useSelectable("gem", color);
  return (
    <button
      onClick={onClick}
      disabled={state === "unselectable" || state === "idle"}
      data-state={state}
      className="gem"
    >
      {color}
    </button>
  );
}
```

Why it repeats: every game has selectable visual primitives. Encoding the
selectability derivation in a hook means every component is dumb about it.

### Problem 5 — Reacting to discrete events, not state shape

Some UI behavior triggers on _events_, not on the shape of the new view.
"Player X bought card Y" is an event. The view will reflect that Y is no
longer on the board, but the _fact of the purchase_ — for a toast, an
animation, a sound — is event-shaped.

State-based subscription is the wrong tool: by the time the view shows
"card Y is gone," the moment to show "Player X bought Y!" has already
passed, and you cannot tell from the new view alone who acted.

**Hook: `useGameEvents(handler, options?)`**

```ts
function useGameEvents(
  handler: (event: Event) => void,
  options?: { filter?: (event: Event) => boolean },
): void;
```

Subscribes to the client's event stream for the lifetime of the
component. Each event is delivered exactly once. The handler is the
latest one passed to the hook (no stale closure).

Per the ordering contract, the handler is called _after_ the view has
been updated, so handlers can call other hooks' read APIs and see
consistent post-event state.

```tsx
function PurchaseToasts() {
  useGameEvents((event) => {
    if (event.type === "card_bought") {
      toast.show(`Player bought ${event.cardId}`);
    }
  });
  return null;
}
```

Why it repeats: every game wants side-effects (sounds, toasts, brief
animations) tied to specific events. Hand-rolled "diff the previous view
against the current view" code is brittle and game-specific.

### Problem 6 — Knowing who the viewer is (with pass-and-play handled automatically)

Components need to ask "am I the active player?" or "is this my hand?"
That question requires both the engine's notion of "active player" (in
the view) and the client's notion of "who am I."

For local multi-player, the viewer rotates with the turn order — P1
acts, the screen passes to P2, and so on. Tabletop Kit handles this
automatically: the in-process adapter aligns the viewer with the new
active player after every successful `execute`. Customers do not call
a setter; there is no setter to call.

**Hook: `useViewerId()`**

```ts
function useViewerId(): string;
```

Subscribes to viewer changes; re-renders when the adapter rotates to
the next active player.

### Automatic viewer alignment (in-process adapter)

After every successful `execute`, `createInProcessClient` reads
`state.runtime.progression.currentStage`. If it is a single-active-
player stage, the viewer is set to that player. The change happens
inside the same `execute` tick — one snapshot reflects the new state,
the new available commands, and the new viewer.

```ts
createInProcessClient(executor, {
  viewerId: "p1",
  initialState,
});
```

No option to disable. The three supported modes — local single-player,
local pass-and-play, and hosted (online) — all want the same behavior:

- **Local single-player**: the active player never changes, so the
  alignment is a no-op.
- **Local pass-and-play**: alignment rotates viewers automatically; no
  customer code needed.
- **Hosted online**: uses the Lab WS adapter, which authenticates a
  single viewer per connection and does not implement local alignment.

Alignment is skipped for `automatic` and `multiActivePlayer` stages
(no single active player to align to) and is a no-op when the new
active player matches the current viewer (no spurious notify).

### `useViewerId` vs reading `currentStage` from view

These answer different questions and can diverge:

- `useViewerId()` — _whose perspective the UI is currently rendering._
  Drives `useGameState` projection, `useSelectable` actor checks, hand
  zone visibility.
- `useGameState((v) => v.runtime.progression.currentStage)` — _whose
  turn it is per the rules._ Game-logic state.

In local in-process, they coincide most of the time (alignment keeps
them in sync). They diverge during `automatic` / `multiActivePlayer`
stages, in the hosted adapter (viewer fixed, active player moves), and
in the brief window during stage transitions.

```tsx
function MyHand() {
  const viewerId = useViewerId();
  const hand = useGameState((v) => v.players[viewerId]?.hand ?? []);
  return <Hand cards={hand} />;
}

function TurnIndicator() {
  const viewerId = useViewerId();
  const activeId = useGameState((v) => v.game.activePlayerId);
  return <span>{activeId === viewerId ? "Your turn" : "Opponent's turn"}</span>;
}
```

Why it repeats: every viewer-aware UI needs this. Reading it through a
hook (not from the view) keeps it disconnected from view-shape variation
across games.

### Problem 7 — Escape hatch when the hook surface isn't enough

Occasionally a component needs something the hooks don't expose: a
one-off command outside the discovery flow, a custom subscription, raw
access to the client for an integration test.

**Hook: `useTTKitClient()`**

```ts
function useTTKitClient(): TTKitClient<RegisteredGame>;
```

Returns the raw client object. Intended as an escape hatch, not a
default tool. Component code that reaches for `useTTKitClient` should be
reviewed for whether the missing hook is worth adding.

```tsx
function DebugPanel() {
  const client = useTTKitClient();
  return (
    <button onClick={() => console.log(client.getView())}>
      Dump current view
    </button>
  );
}
```

Why it repeats: any opinionated API has escape hatches. Naming the
escape hatch is better than hiding it.

## Minimum hook surface

The complete hook export from `@tabletop-kit/ui` for v1:

```ts
export {
  TTKitProvider,
  useGameState,
  useGameStateOrNull,
  useDiscovery,
  useSelectable,
  useGameEvents,
  useViewerId,
  useTTKitClient,
};
```

Eight exports (one Provider + seven hooks). Each hook solves a problem
that recurs across every game. None is sugar over another.

Hooks deliberately **not** included in v1, with reasoning:

- `useActiveCommand` — redundant with `useDiscovery().activeCommandType`.
- `useAvailableCommands` — already a slice of the view; use
  `useGameState((v) => v.runtime.availableCommands)`.
- `useStateVersion` — read via `useTTKitClient().getStateVersion()` if
  needed. Promotion to its own hook waits for a real use case.
- `useDragSource` / `useDropTarget` — these belong in the second-wave
  hooks once the dnd-kit integration lands per the
  [stack and onboarding doc](./2026-05-18-tabletop-ui-stack-and-onboarding.md#dnd-kit-opt-in-per-component).
  They will be additive and won't change the surface above.

## Generic typing

The hook signatures above use `View`, `Event`, `Command`, etc. as if
they were ambient. They are, via module augmentation:

```ts
// game-specific augmentation, in the consumer's repo
import type { SplendorGame } from "splendor-example/game-types";

declare module "@tabletop-kit/ui" {
  interface TTKitGameRegistry {
    game: SplendorGame;
  }
}
```

`SplendorGame` is one type alias emitted by `ttk generate types`:

```ts
export type SplendorGame = {
  view: SplendorView;
  event: SplendorEvent;
  command: SplendorCommandPayload;
  discovery: {
    payload: SplendorDiscoveryPayload;
    result: SplendorDiscoveryResult;
  };
};
```

After augmentation:

- `useGameState((v) => v.board.bank)` types `v` as `SplendorView`.
- `useGameEvents((e) => …)` types `e` as `SplendorEvent`.
- `useTTKitClient()` returns `TTKitClient<SplendorGame>`.

The agent emits this single augmentation file once per generated game
project. Every hook call is type-safe afterward.

## Adapters

### `createInProcessClient` — ships in `@tabletop-kit/ui`

For single-player offline games. Wraps a `GameExecutor` directly. All
methods resolve synchronously; subscribers fire immediately after each
successful execution.

```ts
import { createGameExecutor } from "@tabletop-kit/engine";
import { createInProcessClient, TTKitProvider } from "@tabletop-kit/ui";

const executor = createGameExecutor({
  definition: splendorDefinition,
  initialState: setupSplendor({ playerCount: 1 }),
});

const client = createInProcessClient(executor, { viewerId: "p1" });

createRoot(document.getElementById("root")!).render(
  <TTKitProvider client={client}>
    <App />
  </TTKitProvider>,
);
```

### Tabletop Lab codegen — ships in private Lab repo

For games consuming Tabletop Lab's hosted multiplayer. The Lab codegen
emits a factory that returns `TTKitClient<G>` directly. UI consumers
never see envelopes, requestIds, or message routing.

```ts
import { createSplendorClient } from "@tabletop-lab/client/splendor";
import { TTKitProvider } from "@tabletop-kit/ui";

const socket = new WebSocket(LAB_URL);
const client = createSplendorClient(socket, {
  gameSessionId,
  viewerId,
  authToken,
});

createRoot(document.getElementById("root")!).render(
  <TTKitProvider client={client}>
    <App />
  </TTKitProvider>,
);
```

### Custom — customer-authored

For any other transport. Customer implements `TTKitClient<G>` directly.
Approximately 100–200 LOC for a competent implementation; the engine's
protocol shape is the load-bearing complexity, not the interface.

## Worked example — same components, two deployments

A single `<Board />` works in both single-player and multiplayer. Only
the client construction differs.

```tsx
// components/board.tsx — game-specific, not in @tabletop-kit/ui
import {
  useGameState,
  useGameEvents,
  useDiscovery,
  useViewerId,
} from "@tabletop-kit/ui";

export function Board() {
  const viewerId = useViewerId();
  const phase = useGameState((v) => v.game.phase);
  const discovery = useDiscovery();

  useGameEvents((event) => {
    if (event.type === "card_bought") {
      toast.show(`${event.playerId} bought a card`);
    }
  });

  return (
    <div data-phase={phase} data-discovering={discovery.status}>
      <GemBank />
      <DevelopmentMarket />
      <PlayerArea playerId={viewerId} />
      <CommandBar />
      <ActionList />
    </div>
  );
}
```

```tsx
// single-player/main.tsx
const client = createInProcessClient(executor, { viewerId: "p1" });
render(
  <TTKitProvider client={client}>
    <Board />
  </TTKitProvider>,
);
```

```tsx
// multiplayer/main.tsx — uses private Lab codegen
const client = createSplendorClient(socket, {
  gameSessionId,
  viewerId,
  authToken,
});
render(
  <TTKitProvider client={client}>
    <Board />
  </TTKitProvider>,
);
```

No transport assumption leaks into `Board`, `GemBank`, `CommandBar`, or
any component the agent generates.

## Out of scope for v1

- **Layout / position animation between snapshots.** Card flips, token
  movement, pile collapse. Likely a future hook
  `useLayoutAnimation(slot, target)` that exposes the previous position
  for layoutId-style animations. Defer until a real game needs it.
- **Optimistic state.** All commands are pessimistic in v1: `status:
"executing"` until the client confirms. Optimistic application is a
  future hook concern, not a v1 one.
- **Replay scrubbing.** A `useReplayCursor()` style hook for stepping
  through snapshot history. The engine supports replay; surfacing it in
  hooks is a separate doc.
- **Multi-viewer in one tree.** Observer mode showing two player
  perspectives simultaneously. Two `<TTKitProvider>` instances with two
  clients already works; a dedicated hook is unneeded.
- **Connection / reconnect lifecycle UI.** No `client.status`,
  `useConnectionStatus()`, or `onError` stream in v1. The in-process
  case can't fail catastrophically; hosted-platform reconnect UI is
  Lab-side.

## Open questions

- **Pessimistic by default, but how long is `"executing"` allowed to
  block?** A 5-second WebSocket round-trip with no feedback is a bad
  experience. The hook should probably expose elapsed time and let the
  CommandBar decide when to show a stronger spinner. Resolve before the
  Splendor port.
- **Should `useGameEvents` deliver only events since mount, or all events
  ever?** Mount-onward is the safer default but means hot-reload loses
  history. Open until a real use case forces a choice.
- **`pick(option)` argument shape.** Passing the entire option object is
  fragile (objects from snapshots are not referentially stable). A more
  durable API is `pick(option.id)` or `pick({ slot, target })`. Decide
  with the first concrete discovery integration.
- **Top-level busy signal.** Whether `useDiscovery().status` is enough,
  or a separate `useIsBusy()` is justified for "any command in flight."

## Consequences

- `@tabletop-kit/ui` exports `TTKitClient<G extends TTKitGame>` as its
  primary engine-shaped, transport-agnostic interface.
- One adapter ships in the public package: `createInProcessClient`. The
  Tabletop Lab WS factory ships from private Lab codegen targeting the
  same interface natively.
- Components written against the seven hooks above run unchanged on
  single-player offline, Tabletop Lab multiplayer, and any
  customer-authored transport.
- The CLI's `ttk generate types` is responsible for emitting the
  per-game `G` bundle (see
  [stack and onboarding doc](./2026-05-18-tabletop-ui-stack-and-onboarding.md)).
  The legacy `ttk generate client-sdk` surface is private going
  forward; envelope types and WS implementation move into the Lab repo
  with codegen targeting `TTKitClient<G>` directly.
- The `TTKitGameRegistry` module augmentation pattern becomes the
  canonical way to type-bind hooks to a specific game. The agent emits
  this declaration once per generated game project.
