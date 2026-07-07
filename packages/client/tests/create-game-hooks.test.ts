import { describe, expect, test } from "bun:test";
import { createGameHooks } from "../src/react/create-game-hooks.tsx";
import type { TableverseClient, TableverseGame } from "../src/client/types.ts";

interface FakeView {
  players: Record<string, { score: number }>;
}

interface FakeEvent {
  kind: "card_revealed";
  cardId: number;
}

interface FakeGame extends TableverseGame {
  view: FakeView;
  event: FakeEvent;
}

describe("createGameHooks", () => {
  test("returns a bundle with all expected hooks and the provider", () => {
    const hooks = createGameHooks<FakeGame>();

    expect(typeof hooks.TableverseProvider).toBe("function");
    expect(typeof hooks.useView).toBe("function");
    expect(typeof hooks.useGameEvents).toBe("function");
    expect(typeof hooks.useDiscovery).toBe("function");
    expect(typeof hooks.useSelectable).toBe("function");
    expect(typeof hooks.useTableverseClient).toBe("function");
    expect(typeof hooks.useViewerId).toBe("function");
  });

  test("each createGameHooks call owns a private context", () => {
    // Each factory call must produce its own Provider/hook closures so
    // bundles in the same app cannot accidentally read each other's
    // contexts.
    const a = createGameHooks<FakeGame>();
    const b = createGameHooks<FakeGame>();

    expect(a.useView).not.toBe(b.useView);
    expect(a.useDiscovery).not.toBe(b.useDiscovery);
    expect(a.TableverseProvider).not.toBe(b.TableverseProvider);
  });

  // Type-only assertion: useView's return is typed as G["view"].
  test("useView return is typed from the bundle's G", () => {
    const hooks = createGameHooks<FakeGame>();
    const useView: () => FakeView = hooks.useView;
    void useView;
    // Same for useTableverseClient: TableverseClient<G>.
    const useTableverseClient: () => TableverseClient<FakeGame> =
      hooks.useTableverseClient;
    void useTableverseClient;
    expect(true).toBe(true);
  });
});
