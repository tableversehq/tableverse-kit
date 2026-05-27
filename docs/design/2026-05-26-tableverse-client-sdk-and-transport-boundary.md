# Tableverse Client SDK And Transport Boundary

## Context

The hosted product (Tableverse) embeds uploaded React games inside a
sandboxed iframe controlled by the platform shell. The iframe communicates
with the parent shell over `postMessage`, and the parent shell talks to the
authoritative backend (HTTP + WebSocket). Uploaded frontend code never
receives long-lived platform credentials and never opens a direct
WebSocket. Locally, creators develop with `ttk dev`, where the engine runs
in-process in the same browser tab and there is no parent shell.

The open-source side already defines:

- `TTKitClient<G>` — the transport-agnostic interface every client
  implementation conforms to (in `packages/ui/src/client/types.ts`).
- `createInProcessClient` — the only existing implementation, which wraps
  a `GameExecutor` and runs the engine in the same JS context as the UI
  (in `packages/ui/src/adapters/in-process.ts`).
- `createGameHooks<G>()` — a factory that returns a Provider plus hook
  bundle pre-bound to the game shape `G`. Hooks only consume a
  `TTKitClient<G>`; they never assume how it was constructed.

The open question this document resolves is: who instantiates the right
`TTKitClient<G>` in dev vs. production, and where does the dev-vs-prod
decision live?

## Decisions

### 1. `TTKitClient<G>` remains the only client boundary

Every client implementation — in-process, postMessage, or a future
3rd-party transport — implements `TTKitClient<G>`. The hooks layer in
`@tabletop-kit/ui` continues to consume it generically. Nothing
transport-specific leaks into the OSS UI package.

### 2. `createInProcessClient` stays in `@tabletop-kit/ui` and stays open source

The in-process client is useful to many consumers, not just Tableverse:

- `ttk dev` (creator's local dev loop)
- 3rd-party hosts that want to embed the engine in their own product
- single-player offline builds (Electron, Steam, etc.)
- tests and fixtures

A separate `@tabletop-kit/client-in-process` package was considered and
rejected. The motivating concern was dependency hygiene — keeping
`@tabletop-kit/ui` from forcing every consumer to install
`@tabletop-kit/engine`. That concern is already addressed by `import type`
usage in `adapters/in-process.ts`: engine references are type-erased at
runtime, so a peer dependency on `@tabletop-kit/engine` is sufficient.
Fragmenting the package for hypothetical tree-shaking is premature.

### 3. A private `@tableverse/client` SDK ships `createTableverseClient<G>()`

The Tableverse platform repo (`tableverse-lab` or equivalent private
repo) owns a new package, `@tableverse/client`, with a single entry
point:

```ts
import { createTableverseClient } from "@tableverse/client";

const client = createTableverseClient<MyGame>({
  definition: myGameDefinition,
  viewerId,
  initialState,
});
```

Internally, `createTableverseClient` returns either:

- an in-process client (delegating to `createInProcessClient` from
  `@tabletop-kit/ui`) when the bundle is built for local dev, or
- a postMessage-bridged client (private implementation that talks to the
  parent shell over `window.postMessage`) when the bundle is built for
  the Tableverse iframe.

The creator's app code is identical in both cases. The platform shell is
responsible for validating origin, message schema, room id, player
identity, rate limits, and command envelopes on the receiving side.

### 4. Dev vs. production is decided at build time, not runtime

`createTableverseClient` does **not** sniff `window.parent !== window`,
look at the URL, or otherwise inspect the runtime environment. Runtime
detection is rejected for two reasons:

- it is fragile (iframes appear in dev tools, embedded previews, and
  tests), and
- it prevents bundlers from tree-shaking the unused path. A production
  bundle that statically eliminates the dev branch must not include
  `@tabletop-kit/engine` or `createInProcessClient`.

The dev-vs-prod choice should be expressible as a statically known
condition. Options the SDK can use, in rough preference order:

- `process.env.NODE_ENV === "production"` guard, with `ttk dev` and the
  iframe build pipeline setting `NODE_ENV` accordingly. Standard
  esbuild/Vite/Bun behavior strips the dead branch.
- Conditional `exports` in `@tableverse/client`'s `package.json` keyed
  off a custom condition the CLI sets.
- Two separate import subpaths (`@tableverse/client/dev`,
  `@tableverse/client/prod`) with the CLI aliasing the bare
  `@tableverse/client` to one of them.

The exact mechanism is left open (see Ambiguities below). What is fixed
is that the dev branch must be statically dead in the production bundle.

### 5. Split methods by call-time vs. push-time, not by "query vs. mutation"

The `TTKitClient<G>` interface is intentionally mixed. The right split is
**whether the call itself crosses the iframe/network boundary**, not
whether the call reads or writes:

- **Async (boundary-crossing at call time):** `discover`, `execute`,
  `getAvailableCommands`. These trigger an RPC over the bridge when
  invoked. The parent (or the engine behind it) is the only authority
  that can answer them, and the client has no cached form to read from.
- **Sync (resolved against a local mirror at call time):** `getView`,
  `getStateVersion`, `viewerId`, `subscribe`, `onEvent`. These either
  return a value that was last set by an inbound push (`getView`,
  `getStateVersion`, `viewerId`) or register a callback that future
  pushes will invoke (`subscribe`, `onEvent`). No I/O happens at call
  time.

`getAvailableCommands` is async because it has no useful local form. The
in-process adapter computes it from canonical state via
`executor.listAvailableCommands(...)`; the postMessage client doesn't
hold canonical state and would have to RPC the parent. Pre-computing the
full list on every state change and shipping it alongside each view push
was considered and rejected — it forces engine work on the server per
state change for data the UI may not need, and bloats the bridge
payload.

The sync set is what makes `useSyncExternalStore` viable: `getSnapshot`
must return synchronously, and `subscribe` must be a sync registration
that fires whenever the snapshot changes. The local-mirror pattern lets
the postMessage client satisfy that contract — the parent pushes view
snapshots eagerly on every state change, the client caches them, hooks
read the cache.

### 6. In-process keeps `getAvailableCommands` cheap

Making `getAvailableCommands` async on the interface costs the in-process
adapter nothing functional. The implementation becomes:

```ts
async getAvailableCommands() {
  if (disposed) return [];
  return executor.listAvailableCommands(state, { actorId: currentViewerId });
}
```

Same engine call, wrapped in `Promise.resolve`-equivalent. No hook in
the OSS layer currently calls `getAvailableCommands` (the discovery
flow goes through `discover`, which is already async), so this is an
interface-level breaking change without an immediate hook rewrite. A
future `useAvailableCommands()` would be a `useState` + `useEffect`
hook driven by view-change subscriptions, not `useSyncExternalStore`.

### 7. 3rd-party transports remain a first-class path

Anyone building on `@tabletop-kit` without using the Tableverse platform
implements `TTKitClient<G>` directly. They never import
`@tableverse/client`. The OSS surface is unchanged; the private SDK is
a curated DX layer for Tableverse-hosted games specifically.

## Architecture

```txt
@tabletop-kit/ui (OSS)
  - createGameHooks<G>()
  - TTKitClient<G> interface
  - createInProcessClient    <-- shared by ttk dev, 3rd parties, offline

@tabletop-kit/engine (OSS)
  - GameExecutor, schemas, runtime

@tableverse/client (PRIVATE)
  - createTableverseClient<G>()
      dev build  -> wraps createInProcessClient
      prod build -> postMessage-bridged client
```

Dev flow:

```txt
React SPA (Vite/Bun via ttk dev)
  └─ createTableverseClient({ definition, viewerId, initialState })
       └─ createInProcessClient(executor, ...)   // dev branch
            └─ engine runs in-process
```

Production flow:

```txt
Tableverse iframe (sandboxed, served by play.tableverse.com)
  └─ createTableverseClient({ ...ignored prod fields })
       └─ postMessage client                      // prod branch
            └─ parent shell
                 └─ platform WebSocket / API
```

## Ambiguities And Deferred Choices

### A. Init-arg asymmetry

The dev path needs `definition`, `viewerId`, and `initialState`. The
production path needs none of them — the parent shell owns the executor
and identity. Two ways to express this:

- **(a) Unified signature, prod ignores.** Caller always passes the dev
  fields; the prod branch reads only what it needs. Simpler DX, but the
  prod bundle technically references types/values it never uses.
- **(b) Conditional signature by env.** Type narrows by build target.
  Cleaner but requires either runtime branching at the call site or a
  conditional type that depends on `process.env.NODE_ENV`, which TS does
  not model.

Preferred default is (a), with prod fields typed optional. To revisit
when the postMessage client implementation lands.

### B. Build-time selection mechanism

Three viable mechanisms (listed in decision 4). The choice depends on:

- which bundlers `ttk dev` and the iframe build pipeline use,
- whether `@tableverse/client` is published as ESM-only with strict
  conditional exports,
- whether app-level consumers ever import `@tableverse/client` from
  non-bundled contexts (e.g., a Node test harness).

Deferred until the iframe build pipeline is scoped.

### C. How much defaulting should `ttk dev` do

`createTableverseClient({ definition })` could be a one-liner in dev if
the CLI injects sensible defaults for `viewerId` (e.g., `"local-dev"`)
and `initialState` (call `executor.createInitialState(...)` automatically
with a default seed). The cost is more magic in the dev path; the
benefit is a near-zero-config local dev experience.

Open question: does `ttk dev` rig these defaults via the SDK, via a
companion `defineDevConfig` helper, or do creators wire them
themselves? Likely worth a separate, narrower DX-focused doc once the
postMessage client exists and the dev/prod skeletons are real.

### D. Reusable "local mirror" abstraction

Both the in-process and the postMessage clients maintain a local mirror
of the view. The in-process client updates the mirror after every
`executeCommand`. The postMessage client updates it on inbound bridge
messages from the parent.

The shape is similar enough that a small `ClientMirror<G>` helper —
storing the current view + a Set of subscribers + a notify method —
could be shared. Or the duplication could be tolerated for now, since
there are only two implementations and they diverge in update source.

Not blocking. To decide when the second implementation is written and
we can see how much actually overlaps.

### E. Eviction / cleanup on `dispose`

The postMessage client must coordinate cleanup with the parent shell
(unregister subscriptions, close the bridge channel). The exact
handshake — graceful close message, timeout, parent-initiated dispose —
is not specified here. Deferred to the postMessage protocol design doc.

## Non-Goals

- This document does not specify the postMessage wire protocol (message
  names, schemas, versioning, error envelopes). That belongs in a
  separate Tableverse-private design doc.
- This document does not redesign the hooks layer. `createGameHooks<G>()`
  and its consumers are taken as given.
- The only `TTKitClient<G>` change this document proposes is making
  `getAvailableCommands` async. The rest of the interface is unchanged.
- This document does not address authentication, room scoping, or
  capability tokens for the production transport. Those are platform
  concerns owned by Tableverse.

## Consequences

- `@tabletop-kit/ui` continues to ship `createInProcessClient`. No
  package fragmentation.
- A new private `@tableverse/client` package will be created in the
  Tableverse-private repo. It depends on `@tabletop-kit/ui` and
  `@tabletop-kit/engine` (the dev branch needs them; the prod branch
  references neither at runtime once tree-shaken).
- `TTKitClient<G>` gains one breaking change: `getAvailableCommands`
  becomes `Promise<...>`. The in-process adapter wraps the existing
  sync executor call in a Promise; no current hook consumes
  `getAvailableCommands`, so the change is localized to the adapter,
  the interface, and any 3rd-party implementers.
- The remaining interface contract — sync `getView`/`getStateVersion`/
  `viewerId`, sync local-registration `subscribe`/`onEvent`, async
  `discover`/`execute` — is already what the postMessage client will
  need. The hooks layer needs no changes.
- 3rd-party integrators continue to implement `TTKitClient<G>` directly
  and never touch `@tableverse/client`. They must update their
  implementations to make `getAvailableCommands` async when adopting
  the new interface version.
