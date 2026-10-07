import "./styles.css";
import { createTableverseClient } from "@tableverse-kit/client";
import type { executor } from "{{projectName}}-engine";
import { createBoard } from "./board.ts";

type Game = typeof executor;

type View = NonNullable<ReturnType<typeof client.getView>>;

const client = createTableverseClient<Game>();

const app = document.querySelector<HTMLElement>("#app");

const status = document.createElement("p");
status.className = "status";

const notice = document.createElement("p");
notice.className = "notice";

const seat = document.createElement("p");
seat.className = "seat";

const board = createBoard((cell) => {
  void place(cell);
});

async function place(cell: number): Promise<void> {
  try {
    const result = await client.execute({ type: "place", input: { cell } });
    notice.textContent = result.accepted ? "" : humanize(result.reason);
  } catch {
    notice.textContent = "";
  }
}

function humanize(reason: string | undefined): string {
  const words = (reason ?? "move_rejected").replace(/_/g, " ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}.`;
}

function activeSeat(view: View): string {
  const stage = view.progression.currentStage;
  return stage.kind === "activePlayer" ? stage.activePlayerId : "";
}

function markFor(view: View, playerId: string): string {
  return view.game.marks[playerId] ?? "";
}

function statusFor(view: View, viewerId: string | null): string {
  const { outcome, winner } = view.game;

  if (outcome === "won") {
    return winner === viewerId
      ? "You win"
      : `${markFor(view, winner)} wins this game`;
  }

  if (outcome === "drawn") {
    return "A draw";
  }

  const active = activeSeat(view);
  return active === viewerId
    ? "Your turn"
    : `Waiting for ${markFor(view, active)}`;
}

function seatFor(view: View, viewerId: string | null): string {
  const mark = viewerId === null ? "" : markFor(view, viewerId);
  return mark === "" ? "Watching" : `You are ${mark}`;
}

function render(): void {
  const view = client.getView();

  if (view === null) {
    status.textContent = "";
    seat.textContent = "";
    notice.textContent = "";
    board.update({ cells: [], winningLine: [], interactive: false });
    return;
  }

  const viewerId = client.getViewerId();
  status.textContent = statusFor(view, viewerId);
  seat.textContent = seatFor(view, viewerId);
  notice.textContent = "";
  board.update({
    cells: view.game.board,
    winningLine: view.game.winningLine,
    interactive:
      view.game.outcome === "playing" && activeSeat(view) === viewerId,
  });
}

if (app) {
  const game = document.createElement("section");
  game.className = "game";
  game.append(status, board.element, seat, notice);
  app.replaceChildren(game);
  client.subscribe(render);
  render();
}
