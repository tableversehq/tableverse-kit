import { createTableverseClient } from "@tableverse-kit/client";
import type { executor } from "splendor-engine";

type Game = typeof executor;

const client = createTableverseClient<Game>();
const app = document.querySelector<HTMLElement>("#app");

const scoreButton = document.createElement("button");
scoreButton.textContent = "Score a point";
scoreButton.addEventListener("click", () => {
  void client.execute({ type: "score", input: { points: 1 } });
});

const view = document.createElement("pre");

function render(): void {
  const state = client.getView();
  view.textContent =
    state === null ? `${client.getStatus()}…` : JSON.stringify(state, null, 2);
}

if (app) {
  app.replaceChildren(scoreButton, view);
  client.subscribe(render);
  render();
}
