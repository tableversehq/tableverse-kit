import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";
import "./styles.css";

const darkScheme = window.matchMedia("(prefers-color-scheme: dark)");
function applyScheme() {
  document.documentElement.classList.toggle("dark", darkScheme.matches);
}
applyScheme();
darkScheme.addEventListener("change", applyScheme);

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
