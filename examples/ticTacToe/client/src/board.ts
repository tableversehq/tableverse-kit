const SVG_NS = "http://www.w3.org/2000/svg";

const CELLS_PER_SIDE = 3;

const CELL_SPAN = 100;

export interface BoardView {
  cells: readonly string[];
  winningLine: readonly number[];
  interactive: boolean;
}

export interface Board {
  element: HTMLElement;
  update(view: BoardView): void;
}

function createElement(
  name: string,
  attributes: Record<string, string>,
): SVGElement {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, value);
  }
  return element;
}

function createMark(mark: string): SVGElement {
  const svg = createElement("svg", {
    viewBox: "0 0 100 100",
    class: `mark mark-${mark.toLowerCase()}`,
    "aria-hidden": "true",
  });

  if (mark === "O") {
    svg.append(
      createElement("circle", {
        cx: "50",
        cy: "50",
        r: "30",
        pathLength: "100",
      }),
    );
    return svg;
  }

  svg.append(
    createElement("line", {
      x1: "25",
      y1: "25",
      x2: "75",
      y2: "75",
      pathLength: "100",
    }),
    createElement("line", {
      x1: "75",
      y1: "25",
      x2: "25",
      y2: "75",
      pathLength: "100",
    }),
  );
  return svg;
}

function labelFor(cell: number, mark: string): string {
  return mark === "" ? `Cell ${cell + 1}, empty` : `Cell ${cell + 1}, ${mark}`;
}

function centerOf(cell: number): { x: number; y: number } {
  return {
    x: (cell % CELLS_PER_SIDE) * CELL_SPAN + CELL_SPAN / 2,
    y: Math.floor(cell / CELLS_PER_SIDE) * CELL_SPAN + CELL_SPAN / 2,
  };
}

export function createBoard(onPlace: (cell: number) => void): Board {
  const element = document.createElement("div");
  element.className = "board";

  const grid = document.createElement("div");
  grid.className = "grid";
  element.append(grid);

  const side = CELLS_PER_SIDE * CELL_SPAN;
  const overlay = createElement("svg", {
    viewBox: `0 0 ${side} ${side}`,
    class: "win-line",
    "aria-hidden": "true",
  });
  const stroke = createElement("line", { pathLength: "100" });
  overlay.append(stroke);
  element.append(overlay);

  const buttons: HTMLButtonElement[] = [];
  const painted: string[] = [];

  function cellAt(index: number): HTMLButtonElement {
    const existing = buttons[index];
    if (existing) {
      return existing;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cell";
    button.addEventListener("click", () => onPlace(index));
    buttons[index] = button;
    painted[index] = "";
    grid.append(button);
    return button;
  }

  return {
    element,
    update(view) {
      view.cells.forEach((mark, index) => {
        const button = cellAt(index);
        const winning = view.winningLine.includes(index);

        if (painted[index] !== mark) {
          painted[index] = mark;
          button.replaceChildren(...(mark === "" ? [] : [createMark(mark)]));
        }

        button.setAttribute("aria-label", labelFor(index, mark));
        button.classList.toggle("winning", winning);
        button.disabled = !view.interactive || mark !== "";
      });

      const [first] = view.winningLine;
      const last = view.winningLine[view.winningLine.length - 1];
      if (first === undefined || last === undefined) {
        element.classList.remove("has-winner");
        return;
      }

      const from = centerOf(first);
      const to = centerOf(last);
      stroke.setAttribute("x1", String(from.x));
      stroke.setAttribute("y1", String(from.y));
      stroke.setAttribute("x2", String(to.x));
      stroke.setAttribute("y2", String(to.y));
      element.classList.add("has-winner");
    },
  };
}
