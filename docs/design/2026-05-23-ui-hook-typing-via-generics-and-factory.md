# UI hook typing via generics and factory

## Summary

Replace the current `TTKitGameRegistry` module-augmentation pattern with
two explicit typing paths on `@tabletop-kit/ui`:

1. **Per-hook generics** — each hook accepts a type argument that
   defaults to the unparameterized `TTKitGame` shape, letting devs
   annotate the type at the call site (`useGameState<SplendorView>(...)`).
2. **Factory bundle** — `createGameHooks<G>()` returns a pre-typed
   bundle (`{ TTKitProvider, useGameState, useDiscovery, ... }`) for
   devs who want app-wide typing without per-call generics.

Both paths coexist. The registry interface is removed.

## Why the registry pattern doesn't pull its weight

Today, the only way a dev gets typed hooks is module augmentation:

```ts
declare module "@tabletop-kit/ui" {
  interface TTKitGameRegistry {
    game: { view: SplendorView; event: SplendorEvent; ... };
  }
}
```

Problems:

- **Invisible plumbing.** The link from `useGameState((view) => ...)`
  to the augmented type is not traceable by Go-to-definition. An
  AI agent or human investigating "why is `view` typed `unknown` here"
  must know to look for a `declare module` block elsewhere in the
  project.
- **Global by construction.** A host app cannot register two games
  with different types in the same compilation unit. This blocks
  multi-game hosts and split-bundle dev tools.
- **All-or-nothing.** The augmented interface demands all four shapes
  (`view`, `event`, `command`, `discovery`) even when the dev only
  cares about `view`. Missing fields collapse the whole thing back to
  `unknown`.
- **Unfamiliar idiom.** Most React libraries (tanstack-query, zustand,
  jotai, react-query) use either per-hook generics or a factory.
  Module augmentation is rare and surprising.

## Proposed API

### Per-hook generics

Each hook is parameterized by the relevant slice of the game shape, with
sensible defaults that surface as `unknown` (the truth) rather than
silently masking missing types:

```ts
// Base shape — unchanged from today.
export interface TTKitGame {
  view: unknown;
  event: unknown;
  command: CommandPayload;
  discovery: { payload: DiscoveryPayload; result: DiscoveryResult };
}

export function useGameState<TView = unknown, TSelected = unknown>(
  selector: (view: TView) => TSelected,
  isEqual?: (a: TSelected, b: TSelected) => boolean,
): TSelected;

export function useGameStateOrNull<TView = unknown, TSelected = unknown>(
  selector: (view: TView | null) => TSelected,
  isEqual?: (a: TSelected, b: TSelected) => boolean,
): TSelected;

export function useDiscovery<
  G extends TTKitGame = TTKitGame,
>(): UseDiscoveryResult<G>;

export function useGameEvents<TEvent = unknown>(
  listener: (event: TEvent) => void,
  options?: UseGameEventsOptions,
): void;

export function useSelectable<G extends TTKitGame = TTKitGame>(
  slot: string,
  target: unknown,
): UseSelectableResult<G>;

export function useTTKitClient<
  G extends TTKitGame = TTKitGame,
>(): TTKitClient<G>;
```

Notes:

- `useViewerId` stays untyped — it returns `string`, no game shape needed.
- `UseDiscoveryResult` and `UseSelectableResult` become generic over `G`
  so the `open`/`trail`/`pendingInput` shapes track the dev's
  discovery types.

### Factory bundle

For devs who don't want to repeat the generic at every call site:

```ts
import { createGameHooks } from "@tabletop-kit/ui";
import type { SplendorGame } from "./generated-types";

export const {
  TTKitProvider,
  useGameState,
  useGameStateOrNull,
  useDiscovery,
  useGameEvents,
  useSelectable,
  useTTKitClient,
  useViewerId,
} = createGameHooks<SplendorGame>();
```

The factory binds `G = SplendorGame` once. Downstream imports pull from
the project-local file (`./game-hooks`) and need no per-call generics.

The factory is a thin wrapper — the actual hooks already do all the
work, the factory just pre-binds generic arguments. Implementation:
the factory returns references to the generic hooks, type-narrowed.

### `TTKitClient`, `createInProcessClient`, `TTKitProvider`

These already take a `G extends TTKitGame` generic. The only change is
the default: it flips from `RegisteredGame` to `TTKitGame`. Callers
that want typing either pass `G` explicitly or use the factory bundle.

## What goes away

- `TTKitGameRegistry` interface — removed from `client/types.ts`.
- `RegisteredGame` type — removed.
- All `RegisteredGame` references in hooks, context, and adapter —
  replaced by `TTKitGame` (the unparameterized base).
- Re-export of `TTKitGameRegistry` from `index.ts`.

## Migration

This is a public-API change. There are no current consumers of
`TTKitGameRegistry` in this repo (grep confirms), so no migration of
existing app code is needed. The Splendor example does not augment
the registry today, so it gains nothing from the removal and nothing
breaks.

Future consumer migration (if any external project augments the
registry): replace the `declare module` block with either
`createGameHooks<G>()` in a project-local file, or per-call generics
at hook usage sites.

## Trade-offs

- **Pro: discoverability.** Type plumbing lives in dev-authored code,
  not module augmentation. Go-to-definition works.
- **Pro: multi-game support.** Two factory calls = two typed hook
  bundles in the same project.
- **Pro: standard React idiom.** Matches tanstack-query, zustand, etc.
- **Pro: explicit failure mode.** Without augmentation today, hooks
  silently return `unknown`-shaped views. With per-hook generics
  defaulting to `unknown`, the dev sees the same `unknown` but the
  fix is obvious (annotate or use factory) rather than hidden.
- **Con: small extra indirection.** Devs using the factory import
  hooks from a project-local file (`./game-hooks`) rather than
  directly from `@tabletop-kit/ui`. Devs using per-call generics
  repeat the type at each call site.
- **Con: still requires the dev to obtain the right `View` type.**
  This doc does not solve the typed-`getView()` problem; it only
  improves how the type is plumbed once obtained. Codegen remains
  the path to producing `SplendorView`.

## Out of scope

- How the `View` type is produced (codegen vs. derived vs. authored).
  That is a separate, unresolved problem documented in
  [2026-05-23-redesigning-game-state-authoring](./2026-05-23-redesigning-game-state-authoring).
- The `executor.getView()` return type. The adapter still passes
  through whatever the executor returns; the cast at the boundary
  (`G["view"]`) stays as-is.

## Implementation plan

Small commits on a feature branch:

1. Generalize hook signatures to accept generics with `TTKitGame`/
   `unknown` defaults. Update call sites in `use-discovery.ts`,
   `use-selectable.ts`, `use-game-state.ts`, `use-game-state-or-null.ts`,
   `use-game-events.ts`, `use-ttkit-client.ts`.
2. Update `TTKitProvider`, `TTKitContextValue`, `createInProcessClient`
   to default `G` to `TTKitGame` instead of `RegisteredGame`.
3. Remove `TTKitGameRegistry` and `RegisteredGame` from
   `client/types.ts` and `index.ts`.
4. Add `createGameHooks<G>()` factory in
   `packages/ui/src/client/create-game-hooks.ts`. Export from
   `index.ts`.
5. Tests: keep existing tests passing (they use the structural
   `TTKitGame` shape directly). Add a small factory test that asserts
   the bundle's hooks are typed against the passed `G`.
6. Update the Splendor example app to use the factory (single
   migration to validate the dev experience end-to-end).
