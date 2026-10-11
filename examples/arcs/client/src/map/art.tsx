import type { ReactNode } from "react";
import { RESOURCE_INFO } from "../model/text.ts";
import { CX, CY } from "./geometry.ts";

export const WEDGE_COLORS: Record<string, string> = {
  material: "#5f7088",
  fuel: "#b8901f",
  weapon: "#c4552a",
  relic: "#25918c",
  psionic: "#9c3b86",
};

function seeded(text: string) {
  let s = 0;
  for (const ch of text) s = (s * 31 + ch.charCodeAt(0)) % 2147483647;
  s = s || 7;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function MapDefs({ reach }: { reach: number }) {
  return (
    <defs>
      <radialGradient id="space" cx="50%" cy="50%" r="75%">
        <stop offset="0%" stopColor="#1b1726" />
        <stop offset="60%" stopColor="#0e0c14" />
        <stop offset="100%" stopColor="#060509" />
      </radialGradient>
      <radialGradient id="ring-fill" cx="50%" cy="50%" r="50%">
        <stop offset="40%" stopColor="#2a2830" />
        <stop offset="100%" stopColor="#141318" />
      </radialGradient>
      {Object.entries(WEDGE_COLORS).map(([r, c]) => (
        <radialGradient
          key={r}
          id={`wedge-${r}`}
          gradientUnits="userSpaceOnUse"
          cx={CX}
          cy={CY}
          r={reach}
        >
          <stop offset="0.25" stopColor={c} stopOpacity={0.05} />
          <stop offset="0.62" stopColor={c} stopOpacity={0.5} />
          <stop offset="0.85" stopColor={c} stopOpacity={0.32} />
          <stop offset="1" stopColor={c} stopOpacity={0.12} />
        </radialGradient>
      ))}
      <filter id="paint" x="0" y="0" width="100%" height="100%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.008 0.02"
          numOctaves="4"
          seed="9"
          result="noise"
        />
        <feColorMatrix
          in="noise"
          type="matrix"
          values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.5 0.1"
          result="alpha"
        />
        <feComposite in="SourceGraphic" in2="alpha" operator="in" />
      </filter>
      <filter id="grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.9"
          numOctaves="2"
          seed="3"
        />
        <feColorMatrix
          type="matrix"
          values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.6 -0.25"
        />
      </filter>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="4" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="7" />
      </filter>
      <radialGradient id="shade" cx="30%" cy="28%" r="85%">
        <stop offset="0%" stopColor="#fff" stopOpacity={0.12} />
        <stop offset="55%" stopColor="#000" stopOpacity={0} />
        <stop offset="100%" stopColor="#000" stopOpacity={0.7} />
      </radialGradient>
    </defs>
  );
}

function strokes(
  id: string,
  resource: string,
  cx: number,
  cy: number,
  r: number,
): ReactNode[] {
  const rand = seeded(id);
  const out: ReactNode[] = [];
  const c = RESOURCE_INFO[resource]?.color ?? "#aaa";
  if (resource === "fuel") {
    const bands = 7;
    for (let i = 0; i < bands; i++) {
      const y = cy - r + ((i + 0.5) * 2 * r) / bands + (rand() - 0.5) * 6;
      const amp = 2 + rand() * 5;
      const pts: string[] = [];
      for (let x = -r; x <= r; x += 8)
        pts.push(`${cx + x},${y + Math.sin((x / r) * (2 + rand())) * amp}`);
      out.push(
        <path
          key={`b${i}`}
          d={`M${pts.join(" L")}`}
          stroke={c}
          strokeWidth={1.5 + rand() * 2.5}
          fill="none"
          opacity={0.45 + rand() * 0.45}
        />,
      );
    }
    out.push(
      <ellipse
        key="spot"
        cx={cx + r * 0.25}
        cy={cy + r * 0.2}
        rx={r * 0.22}
        ry={r * 0.11}
        fill="none"
        stroke={c}
        strokeWidth={2}
        opacity={0.8}
      />,
    );
  } else if (resource === "weapon") {
    for (let i = 0; i < 4; i++) {
      const bx = cx + (rand() - 0.5) * r * 1.2,
        by = cy + (rand() - 0.5) * r * 1.2;
      const blob: string[] = [];
      const br = r * (0.12 + rand() * 0.18);
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        const rr = br * (0.6 + rand() * 0.6);
        blob.push(`${bx + Math.cos(a) * rr},${by + Math.sin(a) * rr}`);
      }
      out.push(
        <path
          key={`l${i}`}
          d={`M${blob.join(" L")} Z`}
          fill={c}
          opacity={0.35 + rand() * 0.3}
        />,
      );
    }
    for (let i = 0; i < 6; i++) {
      let x = cx + (rand() - 0.5) * r * 1.6,
        y = cy + (rand() - 0.5) * r * 1.6;
      const pts = [`${x},${y}`];
      const dir = rand() * Math.PI * 2;
      for (let k = 0; k < 5; k++) {
        x += Math.cos(dir + (rand() - 0.5) * 1.4) * 9;
        y += Math.sin(dir + (rand() - 0.5) * 1.4) * 9;
        pts.push(`${x},${y}`);
      }
      out.push(
        <path
          key={`c${i}`}
          d={`M${pts.join(" L")}`}
          stroke={c}
          strokeWidth={2}
          fill="none"
          opacity={0.9}
          strokeLinejoin="round"
        />,
      );
    }
  } else if (resource === "material") {
    for (let i = 0; i < 8; i++) {
      const x = cx + (rand() - 0.5) * r * 1.5,
        y = cy + (rand() - 0.5) * r * 1.5,
        cr = r * (0.06 + rand() * 0.16);
      out.push(
        <circle
          key={`k${i}`}
          cx={x}
          cy={y}
          r={cr}
          stroke={c}
          strokeWidth={1.6}
          fill="none"
          opacity={0.85}
        />,
      );
      out.push(
        <circle
          key={`kk${i}`}
          cx={x + cr * 0.25}
          cy={y + cr * 0.25}
          r={cr * 0.6}
          stroke={c}
          strokeWidth={1}
          fill="none"
          opacity={0.5}
        />,
      );
    }
    for (let i = 0; i < 3; i++) {
      const y = cy + (rand() - 0.5) * r;
      out.push(
        <path
          key={`r${i}`}
          d={`M${cx - r},${y} Q${cx},${y + (rand() - 0.5) * 30} ${cx + r},${y + (rand() - 0.5) * 20}`}
          stroke={c}
          strokeWidth={1.2}
          fill="none"
          opacity={0.5}
        />,
      );
    }
  } else if (resource === "relic") {
    for (let i = 1; i <= 4; i++)
      out.push(
        <circle
          key={`o${i}`}
          cx={cx + (rand() - 0.5) * 6}
          cy={cy + (rand() - 0.5) * 6}
          r={(r * i) / 4.6}
          stroke={c}
          strokeWidth={i % 2 ? 2 : 1}
          fill="none"
          opacity={0.75}
          strokeDasharray={i === 3 ? "6 5" : undefined}
        />,
      );
    for (let i = 0; i < 3; i++) {
      const a = rand() * Math.PI * 2;
      const x = cx + Math.cos(a) * r * 0.55,
        y = cy + Math.sin(a) * r * 0.55,
        s = 5 + rand() * 4;
      out.push(
        <path
          key={`s${i}`}
          d={`M${x},${y - s} L${x + s * 0.3},${y - s * 0.3} L${x + s},${y} L${x + s * 0.3},${y + s * 0.3} L${x},${y + s} L${x - s * 0.3},${y + s * 0.3} L${x - s},${y} L${x - s * 0.3},${y - s * 0.3} Z`}
          fill={c}
          opacity={0.9}
        />,
      );
    }
  } else {
    for (let arm = 0; arm < 2; arm++) {
      const pts: string[] = [];
      const off = arm * Math.PI + rand();
      for (let t = 0; t < 4.2; t += 0.15) {
        const rr = (t / 4.2) * r * 0.95;
        pts.push(
          `${cx + Math.cos(t * 1.6 + off) * rr},${cy + Math.sin(t * 1.6 + off) * rr * 0.85}`,
        );
      }
      out.push(
        <path
          key={`sp${arm}`}
          d={`M${pts.join(" L")}`}
          stroke={c}
          strokeWidth={2.2}
          fill="none"
          opacity={0.85}
        />,
      );
    }
    for (let i = 0; i < 10; i++)
      out.push(
        <circle
          key={`d${i}`}
          cx={cx + (rand() - 0.5) * r * 1.6}
          cy={cy + (rand() - 0.5) * r * 1.6}
          r={1 + rand() * 2}
          fill={c}
          opacity={0.8}
        />,
      );
  }
  return out;
}

export function PlanetArt({
  id,
  resource,
  cx,
  cy,
  r,
  dim,
}: {
  id: string;
  resource: string;
  cx: number;
  cy: number;
  r: number;
  dim?: boolean;
}) {
  const c = RESOURCE_INFO[resource]?.color ?? "#aaa";
  const clip = `clip-${id.replace(".", "-")}`;
  return (
    <g opacity={dim ? 0.25 : 1}>
      <circle
        cx={cx}
        cy={cy}
        r={r + 8}
        fill={c}
        opacity={0.18}
        filter="url(#soft)"
      />
      <clipPath id={clip}>
        <circle cx={cx} cy={cy} r={r} />
      </clipPath>
      <circle cx={cx} cy={cy} r={r} fill="#0d0c12" />
      <circle cx={cx} cy={cy} r={r} fill={c} opacity={0.16} />
      <g clipPath={`url(#${clip})`}>{strokes(id, resource, cx, cy, r)}</g>
      <circle cx={cx} cy={cy} r={r} fill="url(#shade)" />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={c}
        strokeWidth={2.4}
        opacity={0.95}
      />
      <circle
        cx={cx + 1.5}
        cy={cy - 1}
        r={r + 2}
        fill="none"
        stroke={c}
        strokeWidth={0.8}
        opacity={0.45}
      />
      {resource === "fuel" && (
        <ellipse
          cx={cx}
          cy={cy + 4}
          rx={r * 1.45}
          ry={r * 0.32}
          fill="none"
          stroke={c}
          strokeWidth={1.6}
          opacity={0.6}
          transform={`rotate(-14 ${cx} ${cy})`}
        />
      )}
    </g>
  );
}
