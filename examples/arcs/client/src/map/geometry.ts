export const CX = 600;
export const CY = 500;
export const TOP = 28;
export const HEIGHT = 944;
export const RING_IN = 104;
export const RING_OUT = 204;
export const PLANET_R = 46;
const PLANET_DIST = [392, 420, 392];
const STRIP_W = 186;
const STRIP_GAP = 24;
const MARGIN = 74;

const rad = (deg: number) => (deg * Math.PI) / 180;

export const clusterAngle = (cluster: number) => -90 + (cluster - 1) * 60;

export function systemAngle(cluster: number, planet: number): number {
  return planet
    ? clusterAngle(cluster) + (planet - 2) * 20
    : clusterAngle(cluster);
}

export function parseSystem(id: string): [number, number] {
  if (id.endsWith("g")) return [Number(id.slice(0, -1)), 0];
  const [c, p] = id.split(".");
  return [Number(c), Number(p)];
}

export interface Point {
  x: number;
  y: number;
}

export interface Geometry {
  stretch: number;
  ringStretch: number;
  view: { x: number; y: number; w: number; h: number };
  strip: { x: number; w: number };
  polar(angleDeg: number, r: number, stretch?: number): Point;
  ring(angleDeg: number, r: number): Point;
  systemCenter(cluster: number, planet: number): Point;
  fleetAnchor(cluster: number, planet: number): Point;
  fleetAngle(cluster: number, planet: number): number;
}

const MID = PLANET_DIST[1] ?? 420;

const SIDE = STRIP_W + STRIP_GAP + 8;

export function viewWidth(stretch: number): number {
  return SIDE + 2 * (MID * stretch + MARGIN);
}

export function stretchFor(aspect: number): number {
  const s = (aspect * HEIGHT - SIDE - 2 * MARGIN) / (2 * MID);
  return Math.min(1.5, Math.max(0.86, s));
}

export function makeGeometry(stretch: number): Geometry {
  const ringStretch = Math.max(1, stretch * 0.9);
  const left = CX - (MID * stretch + MARGIN);
  const strip = { x: left - STRIP_GAP - STRIP_W, w: STRIP_W };
  const view = { x: strip.x - 8, y: TOP, w: viewWidth(stretch), h: HEIGHT };
  const polar = (angleDeg: number, r: number, s = stretch): Point => ({
    x: CX + r * s * Math.cos(rad(angleDeg)),
    y: CY + r * Math.sin(rad(angleDeg)),
  });
  const ring = (angleDeg: number, r: number) => polar(angleDeg, r, ringStretch);
  return {
    stretch,
    ringStretch,
    view,
    strip,
    polar,
    ring,
    systemCenter(cluster, planet) {
      if (!planet) return ring(clusterAngle(cluster), (RING_IN + RING_OUT) / 2);
      return polar(
        systemAngle(cluster, planet),
        PLANET_DIST[planet - 1] ?? 400,
      );
    },
    fleetAnchor(cluster, planet) {
      if (!planet) return ring(clusterAngle(cluster), RING_OUT - 34);
      return polar(
        systemAngle(cluster, planet),
        (PLANET_DIST[planet - 1] ?? 400) - 92,
      );
    },
    fleetAngle(cluster, planet) {
      return planet ? systemAngle(cluster, planet) : clusterAngle(cluster);
    },
  };
}

export function wedgePath(
  geo: Geometry,
  centerDeg: number,
  halfWidth: number,
  r0: number,
  r1: number,
): string {
  const pts: string[] = [];
  for (let i = 0; i <= 8; i++) {
    const p = geo.ring(centerDeg - halfWidth + (2 * halfWidth * i) / 8, r0);
    pts.push(`${p.x},${p.y}`);
  }
  for (let i = 8; i >= 0; i--) {
    const p = geo.polar(centerDeg - halfWidth + (2 * halfWidth * i) / 8, r1);
    pts.push(`${p.x},${p.y}`);
  }
  return `M${pts.join(" L")} Z`;
}

export function ringSegment(
  geo: Geometry,
  centerDeg: number,
  halfWidth: number,
  r0: number,
  r1: number,
): string {
  const steps = 18;
  const outer: string[] = [],
    inner: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = centerDeg - halfWidth + (2 * halfWidth * i) / steps;
    const o = geo.ring(a, r1),
      n = geo.ring(a, r0);
    outer.push(`${o.x},${o.y}`);
    inner.unshift(`${n.x},${n.y}`);
  }
  return `M${outer.join(" L")} L${inner.join(" L")} Z`;
}

export function crack(
  geo: Geometry,
  angleDeg: number,
  r0: number,
  r1: number,
  seed: number,
): string[] {
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const main: string[] = [];
  const branches: string[] = [];
  for (let r = r0; r <= r1; r += 11) {
    const a = angleDeg + (rand() - 0.5) * 2.2;
    const p = geo.polar(a, r);
    main.push(`${p.x},${p.y}`);
    if (rand() < 0.12 && r > r0 + 40) {
      const dir = rand() < 0.5 ? -1 : 1;
      const len = 30 + rand() * 60;
      const pts = [`${p.x},${p.y}`];
      for (let k = 1; k <= 3; k++) {
        const q = geo.polar(
          a + dir * k * (1.5 + rand() * 2.5),
          r + (len * k) / 3,
        );
        pts.push(`${q.x},${q.y}`);
      }
      branches.push(`M${pts.join(" L")}`);
    }
  }
  return [`M${main.join(" L")}`, ...branches];
}

export function groupOffsets(
  geo: Geometry,
  count: number,
  spread: number,
  angleDeg: number,
  rowStep: number,
  perRow = 3,
) {
  const tangent = rad(angleDeg + 90),
    radial = rad(angleDeg);
  const cols = Math.min(count, perRow);
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / cols),
      col = i % cols;
    const inRow = Math.min(cols, count - row * cols);
    const t = (col - (inRow - 1) / 2) * spread,
      r = row * rowStep;
    return {
      dx: t * Math.cos(tangent) + r * Math.cos(radial) * geo.stretch,
      dy: t * Math.sin(tangent) + r * Math.sin(radial),
    };
  });
}
