import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { executor } from "arcs-engine";
import type { Input } from "arcs-engine/input";

const bridge = vi.hoisted(() => ({
  getView: vi.fn(),
  getStatus: () => "ready",
  getViewerId: vi.fn(),
  getStateVersion: vi.fn(),
  subscribe: vi.fn(),
  ready: () => Promise.resolve(),
  execute: vi.fn(),
}));
vi.mock("@tableverse-kit/client", () => ({
  createTableverseClient: () => bridge,
}));

const { App } = await import("../src/ui/App.tsx");

type State = ReturnType<typeof executor.createInitialState>;
let state: State;
let viewer: string;
let version: number;
const listeners = new Set<() => void>();
let views = new Map<number, unknown>();

function publish() {
  version++;
  const view = executor.getView(state, { kind: "player", playerId: viewer });
  views = new Map([[version, view]]);
  for (const l of listeners) l();
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  state = executor.createInitialState({
    seed: "ui-test",
    players: ["p1", "p2", "p3"],
  });
  viewer = state.game.active;
  version = 0;
  bridge.getViewerId.mockImplementation(() => viewer);
  bridge.getView.mockImplementation(() => views.get(version) ?? null);
  bridge.getStateVersion.mockImplementation(() => version);
  bridge.subscribe.mockImplementation((l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  });
  bridge.execute.mockImplementation(
    async (command: { type: "act"; input: Input }) => {
      const result = executor.executeCommand(state, {
        ...command,
        actorId: viewer,
      });
      if (result.ok) {
        state = result.state;
        publish();
      }
      return {
        accepted: result.ok,
        reason: result.ok ? undefined : "rejected",
      };
    },
  );
  publish();
});

afterEach(() => {
  cleanup();
  listeners.clear();
  vi.unstubAllGlobals();
});

function hand(suit: string) {
  const p = state.game.players.find((x) => x.id === viewer)!;
  return p.hand.find((c) => c.suit === suit) ?? p.hand[0]!;
}

async function lead(suit: string) {
  const user = userEvent.setup();
  const card = hand(suit);
  const name = `${suit.charAt(0).toUpperCase()}${suit.slice(1)} ${card.rank}`;
  await user.click(
    screen.getByRole("button", { name: new RegExp(`^${name},`) }),
  );
  await user.click(await screen.findByRole("button", { name: /^Lead/ }));
  const declare = screen.queryByRole("button", { name: "Don't declare" });
  if (declare) await user.click(declare);
  await waitFor(() => expect(state.game.phase).toBe("actions"));
  return { user, card };
}

describe("Arcs table", () => {
  it("shows whose turn it is and the full table", () => {
    render(<App />);
    expect(screen.getAllByText("Your turn").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("region", { name: "Map of the Reach" }),
    ).toBeTruthy();
    expect(screen.getByRole("region", { name: "The Court" })).toBeTruthy();
    expect(screen.getByLabelText("Your hand")).toBeTruthy();
    expect(screen.getByText("Lead a card")).toBeTruthy();
  });

  it("leads a card from the hand and offers actions on the board", async () => {
    render(<App />);
    const p = state.game.players.find((x) => x.id === viewer)!;
    const suit = p.hand.find((c) => c.suit === "administration")
      ? "administration"
      : p.hand[0]!.suit;
    const { card } = await lead(suit);
    expect(state.game.lead[0]?.id).toBe(card.id);
    expect(await screen.findByText("Your move")).toBeTruthy();
  });

  it("influences the Court by clicking a glowing card", async () => {
    state.game.players
      .find((x) => x.id === viewer)!
      .hand.push({
        id: "mobilization-1",
        suit: "mobilization",
        rank: 1,
        pips: 4,
        ambition: "",
      });
    publish();
    render(<App />);
    const { user } = await lead("mobilization");
    const court = state.game.court[0]!;
    const section = screen.getByRole("region", { name: "The Court" });
    await user.click(
      within(section).getAllByRole("button", { name: /^Influence/ })[0]!,
    );
    await waitFor(() =>
      expect(state.game.court.find((c) => c.id === court.id)!.agents).toContain(
        viewer,
      ),
    );
  });

  it("rearranges resources by dragging after a tax", async () => {
    const p = state.game.players.find((x) => x.id === viewer)!;
    p.hand.push({
      id: "administration-1",
      suit: "administration",
      rank: 1,
      pips: 4,
      ambition: "",
    });
    const taxed = state.game.pieces.find(
      (x) => x.owner === viewer && x.kind === "city",
    )!;
    const planet = state.game.systems.find(
      (x) => x.id === taxed.system,
    )!.resource;
    const other = ["fuel", "relic", "psionic"].find((r) => r !== planet)!;
    p.resources = ["", other, "", "", "", ""];
    publish();
    render(<App />);
    await lead("administration");
    const city = state.game.pieces.find(
      (x) => x.owner === viewer && x.kind === "city",
    )!;
    fireEvent.click(screen.getAllByRole("button", { name: / city in / })[0]!);
    await waitFor(() => expect(state.game.rearrange).toContain(viewer));
    expect(city).toBeTruthy();
    const mine = document.querySelector(".board.full .slots");
    if (!(mine instanceof HTMLElement))
      throw new Error("own board not rendered");
    const slots = within(mine).getAllByRole("button");
    const own = state.game.players.find((x) => x.id === viewer)!.resources;
    const from = own.indexOf(other);
    const to = own.findIndex(
      (r, i) => !r && !slots[i]?.classList.contains("covered"),
    );
    const before = [
      ...state.game.players.find((x) => x.id === viewer)!.resources,
    ];
    fireEvent.dragStart(slots[from]!);
    fireEvent.dragOver(slots[to]!);
    fireEvent.drop(slots[to]!);
    await waitFor(() =>
      expect(
        state.game.players.find((x) => x.id === viewer)!.resources[to],
      ).toBe(before[from]),
    );
  });

  it("plans battle damage privately and sends it only on confirm", async () => {
    const g = state.game;
    const rival = g.order.find((id) => id !== viewer)!;
    g.pieces = g.pieces.filter((x) => x.system !== "1.1");
    for (let i = 0; i < 4; i++)
      g.pieces.push({
        id: `atk-${i}`,
        owner: viewer,
        kind: "ship",
        system: g.pieces.find((x) => x.owner === viewer)!.system,
        damaged: false,
      });
    const at = g.pieces.find((x) => x.id === "atk-0")!.system;
    for (let i = 0; i < 3; i++)
      g.pieces.push({
        id: `def-${i}`,
        owner: rival,
        kind: "ship",
        system: at,
        damaged: false,
      });
    Object.assign(g, {
      phase: "actions",
      suit: "aggression",
      pips: 3,
      prelude: false,
      lead: [
        {
          id: "aggression-2",
          suit: "aggression",
          rank: 2,
          pips: 3,
          ambition: "tyrant",
        },
      ],
    });
    let rolled = false;
    for (let seed = 0; seed < 40 && !rolled; seed++) {
      const trial = executor.executeCommand(
        { ...state, rng: { ...state.rng, seed: `battle-${seed}` } },
        {
          type: "act",
          actorId: viewer,
          input: { op: "battle", system: at, target: rival, assault: 4 },
        },
      );
      if (
        trial.ok &&
        trial.state.game.battle[0] &&
        trial.state.game.battle[0].step !== "roll"
      ) {
        state = trial.state;
        rolled = true;
      }
    }
    expect(rolled).toBe(true);
    publish();
    render(<App />);
    bridge.execute.mockClear();
    const user = userEvent.setup();
    for (
      let i = 0;
      i < 20 && !screen.queryByRole("button", { name: /^Confirm/ });
      i++
    ) {
      const target = document.querySelector(".fleet.target, .building.target");
      const done = screen.queryByRole("button", { name: /^Finish battle/ });
      if (target) fireEvent.click(target);
      else if (done) await user.click(done);
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(bridge.execute).not.toHaveBeenCalled();
    expect(state.game.battle.length).toBe(1);
    await user.click(screen.getByRole("button", { name: /^Confirm/ }));
    await waitFor(() => expect(state.game.battle.length).toBe(0));
    expect(bridge.execute.mock.calls.length).toBeGreaterThan(0);
  });

  it("moves a fleet: origin, then destination", async () => {
    state.game.players
      .find((x) => x.id === viewer)!
      .hand.push({
        id: "mobilization-1",
        suit: "mobilization",
        rank: 1,
        pips: 4,
        ambition: "",
      });
    publish();
    render(<App />);
    const { user } = await lead("mobilization");
    await user.click(screen.getByRole("button", { name: "Move" }));
    const origins = screen.getAllByRole("button", { name: /^Move from / });
    await user.click(origins[0]!);
    const dests = await screen.findAllByRole("button", {
      name: /^Move \d+ → /,
    });
    const label = dests[0]!.getAttribute("aria-label")!;
    const before = state.game.pieces.map((x) => x.system).join();
    await user.click(dests[0]!);
    await waitFor(() =>
      expect(state.game.pieces.map((x) => x.system).join()).not.toBe(before),
    );
    expect(state.game.log.some((l) => l.includes("moved"))).toBe(true);
    expect(label).toMatch(/→/);
  });

  it("shows other seats who is acting instead of offering moves", () => {
    viewer = state.game.order.find((id) => id !== state.game.active)!;
    publish();
    render(<App />);
    expect(screen.getByText(/'s turn/)).toBeTruthy();
    expect(screen.queryByText("Lead a card")).toBeNull();
  });
});
