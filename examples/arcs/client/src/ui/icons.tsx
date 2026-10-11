import { DICE } from "arcs-engine/data";
import { RESOURCE_INFO } from "../model/text.ts";

function ResourcePath({ type }: { type: string }) {
  if (type === "material")
    return (
      <g strokeLinejoin="round">
        <path
          d="M12,3 L20,7.5 L12,12 L4,7.5 Z"
          fill="currentColor"
          opacity={0.95}
        />
        <path
          d="M4,7.5 L12,12 L12,21 L4,16.5 Z"
          fill="currentColor"
          opacity={0.7}
        />
        <path
          d="M20,7.5 L12,12 L12,21 L20,16.5 Z"
          fill="currentColor"
          opacity={0.5}
        />
      </g>
    );
  if (type === "fuel")
    return (
      <g>
        <path
          d="M6,5 C6,3.5 18,3.5 18,5 L18,19 C18,20.5 6,20.5 6,19 Z"
          fill="currentColor"
        />
        <path
          d="M6,9 C9,10 15,10 18,9 M6,15 C9,16 15,16 18,15"
          stroke="#0b0d12"
          strokeWidth={1.3}
          fill="none"
          opacity={0.6}
        />
      </g>
    );
  if (type === "weapon")
    return (
      <g fill="currentColor">
        <path d="M12,2 L14.2,8.6 L21,7 L16.4,12 L21,17 L14.2,15.4 L12,22 L9.8,15.4 L3,17 L7.6,12 L3,7 L9.8,8.6 Z" />
        <circle cx={12} cy={12} r={2.6} fill="#0b0d12" opacity={0.5} />
      </g>
    );
  if (type === "relic")
    return (
      <g fill="currentColor">
        <circle
          cx={12}
          cy={12}
          r={9.5}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
        />
        <path d="M12,4 L14,10 L20,12 L14,14 L12,20 L10,14 L4,12 L10,10 Z" />
      </g>
    );
  if (type === "psionic")
    return (
      <g>
        <path
          d="M2.5,12 C6,6 18,6 21.5,12 C18,18 6,18 2.5,12 Z"
          fill="currentColor"
        />
        <circle cx={12} cy={12} r={3.4} fill="#0b0d12" opacity={0.75} />
        <circle cx={13} cy={11} r={1} fill="currentColor" />
      </g>
    );
  return <circle cx={12} cy={12} r={6} fill="currentColor" opacity={0.3} />;
}

export function ResourceIcon({
  type,
  size = 18,
  title,
}: {
  type: string;
  size?: number;
  title?: string;
}) {
  return (
    <svg
      className="resource-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ color: RESOURCE_INFO[type]?.color ?? "#777" }}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <ResourcePath type={type} />
    </svg>
  );
}

export function AmbitionIcon({
  type,
  size = 22,
}: {
  type: string;
  size?: number;
}) {
  if (type === "tycoon")
    return (
      <span
        className="ambition-icon pair"
        style={{ width: size, height: size }}
      >
        <ResourceIcon type="fuel" size={size * 0.62} />
        <ResourceIcon type="material" size={size * 0.62} />
      </span>
    );
  if (type === "keeper") return <ResourceIcon type="relic" size={size} />;
  if (type === "empath") return <ResourceIcon type="psionic" size={size} />;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className="ambition-icon"
      aria-hidden
    >
      {type === "tyrant" ? (
        <g fill="none" stroke="#e9dcc0" strokeWidth={2.2}>
          <circle cx={8} cy={14} r={5} />
          <circle cx={16} cy={9} r={5} />
          <path d="M11,11.5 L13,11" />
        </g>
      ) : (
        <path
          fill="#ff9b52"
          d="M12,1.5 L14,8 L20,4.5 L16.5,10.5 L23,12 L16.5,13.8 L19.5,20 L13.5,16.2 L12,22.5 L10.2,16.2 L4,20 L7.5,13.8 L1,12 L7.5,10.5 L4,4.5 L10,8 Z"
        />
      )}
    </svg>
  );
}

const DIE_COLORS: Record<string, string> = {
  assault: "#c73a31",
  skirmish: "#2f78c4",
  raid: "#d48a1f",
};

function Symbol({ kind, x, y }: { kind: string; x: number; y: number }) {
  if (kind === "self")
    return (
      <path
        transform={`translate(${x},${y})`}
        d="M0,-5 C3,-1 3.5,1 3.5,2.5 A3.5,3.5 0 0 1 -3.5,2.5 C-3.5,1 -3,-1 0,-5 Z"
        fill="#fff"
      />
    );
  if (kind === "ship")
    return (
      <path
        transform={`translate(${x},${y}) scale(0.42)`}
        d="M0,-11 L3,-3 L11,0 L3,3 L0,11 L-3,3 L-11,0 L-3,-3 Z"
        fill="#fff"
      />
    );
  if (kind === "building")
    return (
      <path
        transform={`translate(${x},${y}) scale(0.42)`}
        d="M0,-11 L2.5,-5 L8,-8 L5,-2.5 L11,0 L5,2.5 L8,8 L2.5,5 L0,11 L-2.5,5 L-8,8 L-5,2.5 L-11,0 L-5,-2.5 L-8,-8 L-2.5,-5 Z"
        fill="#ffe2a8"
      />
    );
  if (kind === "keys")
    return (
      <g
        transform={`translate(${x},${y})`}
        stroke="#fff"
        strokeWidth={1.4}
        fill="none"
      >
        <circle cx={-2.5} cy={0} r={2.2} />
        <path d="M-0.3,0 L4.5,0 M3,0 L3,2 M4.5,0 L4.5,2" />
      </g>
    );
  return (
    <circle cx={x} cy={y} r={4} fill="none" stroke="#fff" strokeWidth={1.5} />
  );
}

export function Die({
  type,
  face,
  size = 34,
  selected,
}: {
  type: string;
  face: number;
  size?: number;
  selected?: boolean;
}) {
  const f = DICE[type]?.[face];
  const marks: string[] = [];
  if (f) {
    for (let i = 0; i < f.self; i++) marks.push("self");
    for (let i = 0; i < f.ship; i++) marks.push("ship");
    for (let i = 0; i < f.building; i++) marks.push("building");
    for (let i = 0; i < f.keys; i++) marks.push("keys");
    if (f.intercept) marks.push("intercept");
  }
  const spots: [number, number][][] = [
    [],
    [[0, 0]],
    [
      [-5, -5],
      [5, 5],
    ],
    [
      [-6, -6],
      [6, -6],
      [0, 6],
    ],
    [
      [-6, -6],
      [6, -6],
      [-6, 6],
      [6, 6],
    ],
  ];
  const layout = spots[Math.min(marks.length, 4)] ?? [];
  return (
    <svg
      width={size}
      height={size}
      viewBox="-16 -16 32 32"
      className={`die ${selected ? "selected" : ""}`}
      aria-label={`${type} die: ${marks.join(", ") || "blank"}`}
    >
      <rect
        x={-15}
        y={-15}
        width={30}
        height={30}
        rx={6}
        fill={DIE_COLORS[type] ?? "#555"}
        stroke="#0b0d12"
        strokeWidth={1.5}
      />
      {marks.slice(0, 4).map((m, i) => (
        <Symbol
          key={i}
          kind={m}
          x={layout[i]?.[0] ?? 0}
          y={layout[i]?.[1] ?? 0}
        />
      ))}
    </svg>
  );
}

export function DieChip({ type }: { type: string }) {
  return <span className="die-chip" style={{ background: DIE_COLORS[type] }} />;
}
