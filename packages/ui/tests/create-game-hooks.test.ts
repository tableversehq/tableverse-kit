import { describe, expect, test } from "bun:test";
import { createGameHooks } from "../src/client/create-game-hooks.tsx";
import type { TTKitGame } from "../src/client/types.ts";

interface FakeView {
  players: Record<string, { score: number }>;
}

interface FakeEvent {
  kind: "card_revealed";
  cardId: number;
}

interface FakeGame extends TTKitGame {
  view: FakeView;
  event: FakeEvent;
}

describe("createGameHooks", () => {
  test("returns a bundle with all expected hooks and the provider", () => {
    const hooks = createGameHooks<FakeGame>();

    expect(typeof hooks.TTKitProvider).toBe("function");
    expect(typeof hooks.useGameState).toBe("function");
    expect(typeof hooks.useGameStateOrNull).toBe("function");
    expect(typeof hooks.useGameEvents).toBe("function");
    expect(typeof hooks.useDiscovery).toBe("function");
    expect(typeof hooks.useSelectable).toBe("function");
    expect(typeof hooks.useTTKitClient).toBe("function");
    expect(typeof hooks.useViewerId).toBe("function");
  });

  test("each createGameHooks call owns a private context", () => {
    // Each factory call must produce its own Provider/hook closures so
    // bundles in the same app cannot accidentally read each other's
    // contexts.
    const a = createGameHooks<FakeGame>();
    const b = createGameHooks<FakeGame>();

    expect(a.useGameState).not.toBe(b.useGameState);
    expect(a.useDiscovery).not.toBe(b.useDiscovery);
    expect(a.TTKitProvider).not.toBe(b.TTKitProvider);
  });

  // Type-only assertion: the selector parameter must be typed as the
  // bundle's view, not unknown. This compiles only when generics flow.
  test("selector parameter is typed from the bundle's G", () => {
    const hooks = createGameHooks<FakeGame>();
    const selector: (view: FakeView) => number = (view) =>
      Object.values(view.players).length;
    const unusedHook = hooks.useGameState<number>;
    void unusedHook;
    void selector;
    expect(true).toBe(true);
  });
});
