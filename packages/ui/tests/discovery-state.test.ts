import { describe, expect, test } from "bun:test";
import type {
  AnyCommandDiscoveryResult,
  DiscoveryStepOption,
} from "@tableverse-kit/engine";
import { DiscoveryState } from "../src/client/discovery-state.ts";
import type { ExecutionResult } from "../src/client/types.ts";

interface FakeClient {
  discover: (request: unknown) => Promise<AnyCommandDiscoveryResult>;
  execute: (command: unknown) => Promise<ExecutionResult>;
}

function fakeClient(overrides: Partial<FakeClient> = {}): FakeClient {
  return {
    discover: () => Promise.reject(new Error("discover not stubbed")),
    execute: () => Promise.reject(new Error("execute not stubbed")),
    ...overrides,
  };
}

function makeOption(
  over: Partial<DiscoveryStepOption> = {},
): DiscoveryStepOption {
  return {
    id: "opt",
    output: {},
    nextInput: {},
    nextStep: "next",
    ...over,
  };
}

function flushMicrotasks(): Promise<void> {
  return Promise.resolve();
}

describe("DiscoveryState", () => {
  test("starts in idle with empty trail", () => {
    const state = new DiscoveryState(fakeClient() as never);
    const snapshot = state.getSnapshot();
    expect(snapshot.status).toBe("idle");
    expect(snapshot.activeCommandType).toBeNull();
    expect(snapshot.open).toBeNull();
    expect(snapshot.trail).toEqual([]);
    expect(snapshot.pendingInput).toBeNull();
  });

  test("start() advances to discovering and stores open result", async () => {
    const open: AnyCommandDiscoveryResult = {
      complete: false,
      step: "gem",
      options: [makeOption({ id: "blue" })],
    };
    const state = new DiscoveryState(
      fakeClient({ discover: () => Promise.resolve(open) }) as never,
    );

    state.start({ type: "take_three_distinct_gems", step: "gem", input: {} });
    expect(state.getSnapshot().status).toBe("discovering");
    expect(state.getSnapshot().activeCommandType).toBe(
      "take_three_distinct_gems",
    );

    await flushMicrotasks();
    expect(state.getSnapshot().open).toEqual(open);
  });

  test("start() forwarding a complete result moves to ready_to_confirm", async () => {
    const complete: AnyCommandDiscoveryResult = {
      complete: true,
      input: { foo: 1 },
    };
    const state = new DiscoveryState(
      fakeClient({ discover: () => Promise.resolve(complete) }) as never,
    );

    state.start({ type: "noop", step: "init", input: {} });
    await flushMicrotasks();

    const snapshot = state.getSnapshot();
    expect(snapshot.status).toBe("ready_to_confirm");
    expect(snapshot.pendingInput).toEqual({ foo: 1 });
    expect(snapshot.open).toBeNull();
  });

  test("pick() advances using option.nextStep and appends to trail", async () => {
    const openOne: AnyCommandDiscoveryResult = {
      complete: false,
      step: "gem",
      options: [makeOption({ id: "blue", nextStep: "gem" })],
    };
    const openTwo: AnyCommandDiscoveryResult = {
      complete: false,
      step: "gem",
      options: [makeOption({ id: "white", nextStep: "gem" })],
    };

    let call = 0;
    const state = new DiscoveryState(
      fakeClient({
        discover: () => Promise.resolve(call++ === 0 ? openOne : openTwo),
      }) as never,
    );

    state.start({ type: "take_three", step: "gem", input: {} });
    await flushMicrotasks();
    const firstPick = openOne.options[0]!;
    state.pick(firstPick);
    await flushMicrotasks();

    const snap = state.getSnapshot();
    expect(snap.trail).toEqual([firstPick]);
    expect(snap.open).toEqual(openTwo);
  });

  test("confirm() calls execute and resets on accept", async () => {
    const calls: unknown[] = [];
    const state = new DiscoveryState(
      fakeClient({
        discover: () => Promise.resolve({ complete: true, input: { x: 1 } }),
        execute: (cmd) => {
          calls.push(cmd);
          return Promise.resolve({ accepted: true });
        },
      }) as never,
    );

    state.start({ type: "do_thing", step: "init", input: {} });
    await flushMicrotasks();
    state.confirm();
    await flushMicrotasks();

    expect(calls).toEqual([{ type: "do_thing", input: { x: 1 } }]);
    expect(state.getSnapshot().status).toBe("idle");
  });

  test("confirm() surfaces rejection reason without resetting", async () => {
    const state = new DiscoveryState(
      fakeClient({
        discover: () => Promise.resolve({ complete: true, input: {} }),
        execute: () =>
          Promise.resolve({ accepted: false, reason: "not_your_turn" }),
      }) as never,
    );

    state.start({ type: "do_thing", step: "init", input: {} });
    await flushMicrotasks();
    state.confirm();
    await flushMicrotasks();

    const snap = state.getSnapshot();
    expect(snap.status).toBe("error");
    expect(snap.error).toBe("not_your_turn");
  });

  test("cancel() returns to idle and ignores in-flight discover replies", async () => {
    let resolve: ((value: AnyCommandDiscoveryResult) => void) | null = null;
    const state = new DiscoveryState(
      fakeClient({
        discover: () =>
          new Promise<AnyCommandDiscoveryResult>((res) => {
            resolve = res;
          }),
      }) as never,
    );

    state.start({ type: "thing", step: "init", input: {} });
    expect(state.getSnapshot().status).toBe("discovering");
    state.cancel();
    expect(state.getSnapshot().status).toBe("idle");

    resolve!({ complete: false, step: "init", options: [] });
    await flushMicrotasks();
    expect(state.getSnapshot().status).toBe("idle");
  });

  test("subscribe() notifies on every snapshot transition", async () => {
    let notifications = 0;
    const state = new DiscoveryState(
      fakeClient({
        discover: () => Promise.resolve({ complete: true, input: {} }),
        execute: () => Promise.resolve({ accepted: true }),
      }) as never,
    );

    const unsubscribe = state.subscribe(() => {
      notifications += 1;
    });

    state.start({ type: "do", step: "init", input: {} });
    await flushMicrotasks();
    state.confirm();
    await flushMicrotasks();

    unsubscribe();
    expect(notifications).toBeGreaterThanOrEqual(4);
  });

  test("rejected discover transitions to error", async () => {
    const state = new DiscoveryState(
      fakeClient({
        discover: () => Promise.reject(new Error("invalid_pick")),
      }) as never,
    );

    state.start({ type: "do", step: "init", input: {} });
    await flushMicrotasks();

    const snap = state.getSnapshot();
    expect(snap.status).toBe("error");
    expect(snap.error).toBe("invalid_pick");
  });

  test("pick() is a no-op while not discovering", () => {
    const state = new DiscoveryState(fakeClient() as never);
    state.pick(makeOption());
    expect(state.getSnapshot().status).toBe("idle");
  });

  test("confirm() is a no-op without a pending input", () => {
    const state = new DiscoveryState(fakeClient() as never);
    state.confirm();
    expect(state.getSnapshot().status).toBe("idle");
  });
});
