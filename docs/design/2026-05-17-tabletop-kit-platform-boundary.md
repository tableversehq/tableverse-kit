# Tabletop Kit And Tabletop Lab Boundary

## Context

The project is growing beyond `tabletop-engine`.

The open-source surface is expected to include:

- a rules/runtime engine
- a UI component library
- generic local developer tooling
- documentation for building games with those packages

Separately, the future hosted product, tentatively named **Tabletop Lab**, should
support platform workflows such as:

- uploading game engine code and UI code
- deploying games to managed infrastructure
- generating a platform-targeted client SDK
- running hosted rooms, auth, persistence, matchmaking, and deployment

These two concerns should not live in the same GitHub repository if platform
implementation details must remain private.

## Decision

Use a public/private split:

```txt
public:  tabletop-kit
private: tabletop-lab
```

`tabletop-kit` is the open-source framework for building tabletop games.
`tabletop-lab` is the hosted platform for deploying and running them.

The public packages should not be branded as Tabletop Lab dev-kit packages,
because they should remain useful outside the hosted platform. A developer
should be able to use the engine and UI library on their own server, in a local
desktop app, or in a Steam-published game without adopting Tabletop Lab.

## Repository Structure

Public repository:

```txt
tabletop-kit/
  packages/
    tabletop-engine/
    tabletop-ui/
    tabletop-cli/
```

Private repository:

```txt
tabletop-lab/
  packages/
    platform-cli/
    platform-protocol/
    platform-sdk-generator/
    deploy-client/
  apps/
    platform-api/
    platform-web/
  workers/
    build-deploy/
```

The exact package names can change, but the ownership boundary should not:

- generic engine, UI, and local tooling belong in the public repo
- hosted protocol, deploy, upload, platform SDK generation, auth, rooms,
  persistence, billing, and infrastructure belong in the private repo

## CLI Boundary

The public CLI should stay open source, but it should only own generic tooling:

```txt
tabletop generate types
tabletop ui add <component>
tabletop validate
```

Platform-specific commands should be private:

```txt
tabletop lab login
tabletop lab deploy
tabletop lab generate-sdk
```

The public CLI may expose a plugin mechanism or command handoff point, but the
actual platform command implementation should live in the private Tabletop Lab
repo.

This keeps the public CLI inspectable and useful without leaking platform
protocols or deployment internals.

## AsyncAPI And Client SDK Generation

AsyncAPI should no longer be treated as a core `tabletop-engine` feature or as
the source of truth for client SDK generation.

The earlier direction treated AsyncAPI as a public hosted protocol contract.
That created the wrong coupling:

- the engine started describing API shapes instead of only game rules
- client SDK generation became constrained by a general-purpose protocol format
- platform product decisions leaked into the open engine package
- the generated SDK appeared more universal than it actually was

The new direction is:

```txt
game definition
  -> platform-owned descriptor
  -> platform client SDK
```

not:

```txt
game definition
  -> AsyncAPI document
  -> client SDK
```

The platform descriptor should be private and owned by Tabletop Lab. It can
include the exact request/response/message shapes needed by the hosted platform.
The SDK generator can consume that descriptor directly.

AsyncAPI can be removed unless there is a real external consumer. If it returns
later, it should be an optional export derived from the platform descriptor, not
the primary architecture.

## Engine Boundary

`tabletop-engine` should remain transport-agnostic.

It should define:

- game definition authoring
- command validation and execution
- stage/progression behavior
- canonical state and runtime state
- deterministic RNG
- state facade hydration
- visibility projection
- schemas needed by the rules runtime
- replay, snapshots, and test harnesses

It should not define:

- hosted API message names
- WebSocket protocol contracts
- deployment bundle shape
- platform SDK generation
- auth, rooms, matchmaking, billing, or persistence products

The engine may still expose enough structured metadata for generic tooling to
inspect a game definition, but platform-specific protocol generation should not
live in the engine package.

## Documentation Structure

The docs should become a single public **Tabletop Kit** documentation site,
rather than separate sites for engine and UI.

Recommended top-level structure:

```txt
Tabletop Kit Docs
  Introduction
  Quickstart
  Concepts

Engine
  Game Definition
  GameState
  Commands
  Stages
  Runtime State
  Visibility
  Replay And Snapshots
  API Reference

UI
  Components
  Board Layouts
  Player Panels
  Tokens And Cards
  Theming
  Installation

CLI
  Generate Types
  Add UI Components
  Project Config

Guides
  Build A Local Game
  Use Your Own Server
  Build With Tabletop UI
```

Tabletop Lab docs should be separate or clearly marked:

```txt
Tabletop Lab
  Deploy A Game
  Generate Platform SDK
  Upload UI
  Hosted Rooms
```

If Tabletop Lab docs include proprietary implementation details, they should
live in the private repo or a separate private docs site. If they are
public-facing product docs, they may live in the same Mintlify site as a clearly
labeled platform section.

## Naming

Use **Tabletop Kit** for the public open-source framework.

Use **Tabletop Lab** for the hosted platform.

Avoid naming the public repo `tabletop-lab-dev-kit`, because that implies the
open-source packages are only for the hosted platform. The intended positioning
is:

> Tabletop Kit is the open-source framework for building tabletop game engines
> and UIs. Tabletop Lab is the hosted platform for deploying them.

## Consequences

This decision means some existing code and docs should be revisited:

- `tabletop-engine` protocol and AsyncAPI exports should be removed, moved, or
  deprecated as platform-specific.
- CLI commands that generate hosted protocol artifacts or hosted client SDKs
  should move out of the public CLI core.
- Existing design docs that call AsyncAPI the source of truth are historical and
  superseded by this decision.
- The standalone engine docs site should migrate toward a broader Tabletop Kit
  documentation structure when UI and CLI docs become first-class.

## Current Recommendation

Do not immediately delete every protocol-related file without a migration pass.
First separate the concepts:

1. Keep `tabletop-engine` focused on rules/runtime.
2. Move hosted protocol and platform SDK generation behind private Tabletop Lab
   ownership.
3. Keep only generic type/schema generation in the public CLI.
4. Remove AsyncAPI if no concrete external consumer remains after the split.
