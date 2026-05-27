# Tabletop Kit As Framework

## Summary

`@tabletop-kit/engine` and `@tabletop-kit/ui` are not two independent
libraries that happen to be co-located. The hooks layer of the UI library
is deeply coupled to the engine's model — commands, discovery, events,
viewer-projected views. Together they form a framework for building
Tabletop Kit boardgames.

This is an intentional decision, and this doc captures it so future
contributors do not try to "decouple hooks from engine" thinking it is an
improvement.

The decoupled boundary stays at one specific layer: the **components**.
This doc fixes where the framework boundary sits and what crosses it.

## Decision

Tabletop Kit is marketed and structured as a framework, with one
deliberate decoupled boundary:

- **Engine + hooks form the framework.** The hooks read the engine's
  view tree, drive its command/discovery state machine, and consume its
  event stream. Their value comes from being engine-aware.
- **Components do not import the engine, the client, or the hooks.**
  They are dumb React: take props, render markup, fire callbacks.
- **The `TTKitClient<G>` interface is engine-shaped**, but
  hand-implementable. The interface itself does not require the engine
  to be present at runtime; an in-process adapter calls it, a Lab
  codegen module emits an implementation, a customer can author one.

The hooks layer ships in `@tabletop-kit/ui` as part of the public
framework. The component layer ships in `@tabletop-kit/ui` as
copy-into-tree source via `ttk ui add`, and is reusable independent
of the framework.

## Why coupling at the hooks layer is correct

The decision to couple hooks to the engine is not a default; it is the
reasoned answer to "what does this layer have to know to do its job?"

### The hooks' value comes from engine awareness

- `useSelectable(slot, target)` answers "is this thing selectable right
  now?" That answer depends on the engine's discovery protocol — which
  step is open, which options exist, which picks are already
  accumulated. Strip away engine awareness and `useSelectable` collapses
  to `() => "selectable"`.
- `useDiscovery()` owns the discovery state machine. The state machine
  is the engine's, not React's.
- `useGameEvents(handler)` reads the engine's event stream. Without an
  engine emitting events, there is no stream.
- `useGameState(selector)` is the only hook that could plausibly be
  generic over any state-tree library. Splitting it off to support a
  hypothetical "Tabletop Kit UI hooks against my own engine" user buys
  nothing for any real customer.

A library that exposed only `useGameState` would be a thin
`useSyncExternalStore` wrapper. The thing customers and the agent want
is the rest.

### Decoupling would be cosmetic, not real

The "couple via an adapter interface, not directly" pattern only buys
real flexibility when two distinct backends actually exist. They do not
here. The engine's protocol (commands, discovery, events, views) is the
substrate every Tabletop Kit game is built on. Pretending the hooks are
swappable against a hypothetical alternative engine adds API surface for
a customer who does not exist.

If a future engine arrives, decoupling can happen then, against real
shapes. Designing today for an imaginary second engine produces a
worse design for the real one.

### The target audience benefits from a framework

The customers are:

- **Game designers using Tabletop Kit to ship a digital boardgame.**
  They want the whole stack to work together.
- **Tabletop Lab platform customers.** They want one decision, not
  three.
- **The agent.** It learns one vocabulary, not three loosely-coupled
  ones. Engine commands map to hook calls map to component props. The
  closer the layers are, the smaller and more reliable the agent's
  output.

For all three audiences, "framework" is a feature, not a tax.

## Why the components stay decoupled

Components do not justify the same coupling and are kept out of it.

- A `Card` takes `state: "selectable" | "selected" | "none"` and an
  `onClick`. It does not import the engine. It does not import the
  hooks. It does not know `TTKitClient` exists.
- The hooks produce the `state` and `onClick`. A customer who wants to
  use the components with their own state model authors their own hooks
  returning the same prop shapes.
- This mirrors shadcn/ui: the `<Card>` is unopinionated React; only the
  hooks that orchestrate it know about Radix.

The components are therefore reusable independent of the framework. If
someone wants a `TokenPile` rendered against state they hand-managed,
they can. The cost of producing the props is theirs; the cost of
producing the markup is the library's.

## Concretely, what crosses the framework boundary

Going from engine to UI:

- `TView`, `TEvent`, `TCommandPayload`, `TDiscoveryPayload`,
  `TDiscoveryResult` — types emitted by `ttk generate types`.
- The `TTKitClient<G>` interface — implemented either by the in-process
  adapter, the Tabletop Lab WS codegen, or customer code.
- Engine events arriving via `onEvent`.
- Snapshots arriving via `subscribe`.

Going from UI to engine (through the client):

- `discover(payload)` calls.
- `execute(command)` calls.

Nothing else flows. The engine does not know about React. The components
do not know about the engine. The hooks know about both, by design.

## What this means in practice

- `@tabletop-kit/ui` may freely import engine types via
  `@tabletop-kit/engine`. It is not a violation; they are framework
  halves, not independent libraries.
- The `TTKitClient<G>` interface is engine-shaped on purpose.
  Refactoring it to be "engine-agnostic" would dilute its job.
- The components in the registry must remain prop-driven. A component
  that imports `useGameState` or `useDiscovery` directly is a smell —
  composition belongs in the game's `components/board/` directory, not
  in `components/ui/`.
- The Provider, hooks, and adapters live in `packages/ui/src/`. The
  registry source for components lives in
  `packages/ui/registry-source/` and never imports from
  `packages/ui/src/hooks/` — only from the `@tabletop-kit/ui` public
  exports a customer would see.

## What this means for marketing

The public positioning is:

> Tabletop Kit is a **framework** for building tabletop and boardgame
> implementations. It includes a deterministic rules engine, a React UI
> hooks layer that consumes the engine's state and command model, and a
> copy-into-tree component library.

Not:

> Tabletop Kit is a collection of independent libraries you can mix
> with your own engine.

The first is honest about what we ship and matches the value
proposition. The second invites questions ("can I use my own engine?")
the framework is not designed to answer.

## Consequences

- The `@tabletop-kit/ui` package has a peer dependency on
  `@tabletop-kit/engine`. This is intentional and not subject to
  refactoring.
- The hooks doc
  ([2026-05-19](./2026-05-19-tabletop-ui-hooks-design.md)) is the
  authoritative source for the engine-shaped client interface and the
  hook surface.
- The stack-and-onboarding doc
  ([2026-05-18](./2026-05-18-tabletop-ui-stack-and-onboarding.md))
  references this doc when describing the components-vs-hooks
  separation.
- Future proposals to "decouple hooks from engine" should cite this
  doc and explain what changed in the customer landscape to justify
  reopening the decision.
