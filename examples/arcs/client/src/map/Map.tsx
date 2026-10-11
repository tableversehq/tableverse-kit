import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { makeMap } from "arcs-engine/data";
import type { Game, PieceView, SystemView } from "../client.ts";
import { key, type Target } from "../model/flow.ts";
import { playerColor, playerName, systemName } from "../model/text.ts";
import { PieceGlyph, ShipGlyph } from "../ui/glyphs.tsx";
import { MapDefs, PlanetArt } from "./art.tsx";
import type { MapEffect } from "./effects.ts";
import {
  CX,
  CY,
  HEIGHT,
  PLANET_R,
  RING_IN,
  RING_OUT,
  clusterAngle,
  crack,
  groupOffsets,
  makeGeometry,
  ringSegment,
  stretchFor,
  systemAngle,
  viewWidth,
  wedgePath,
  type Geometry,
} from "./geometry.ts";
import { Strip, type Peek } from "./Strip.tsx";

export interface MapProps {
  view: Game;
  targets: Map<string, Target>;
  picked: Set<string>;
  active: boolean;
  focus: Set<string>;
  effects: MapEffect[];
  onPick(key: string): void;
  children?: ReactNode;
}

const ALL_SYSTEMS = makeMap([]);
const WALLS = [
  [1, 2],
  [3, 4],
  [4, 5],
  [6, 1],
];

function control(g: Game, system: string): string {
  const counts = g.order
    .map((id) => ({
      id,
      n: g.pieces.filter(
        (p) =>
          p.system === system &&
          p.owner === id &&
          p.kind === "ship" &&
          !p.damaged,
      ).length,
    }))
    .sort((a, b) => b.n - a.n);
  const [first, second] = counts;
  return first && first.n > 0 && first.n !== (second?.n ?? 0) ? first.id : "";
}

function useStars(geo: Geometry) {
  return useMemo(() => {
    let s = 11;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    return Array.from({ length: 340 }, () => ({
      x: geo.view.x + r() * geo.view.w,
      y: geo.view.y + r() * geo.view.h,
      r: r() * 1.3 + 0.2,
      o: r() * 0.6 + 0.15,
    }));
  }, [geo]);
}

function Backdrop({ geo, blocked }: { geo: Geometry; blocked: Set<number> }) {
  const stars = useStars(geo);
  const reach = 1100;
  return (
    <g className="backdrop">
      <rect
        x={geo.view.x}
        y={geo.view.y}
        width={geo.view.w}
        height={geo.view.h}
        fill="url(#space)"
      />
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={s.o} />
      ))}
      <g filter="url(#paint)">
        {ALL_SYSTEMS.filter((s) => s.planet).map((s) => (
          <path
            key={s.id}
            d={wedgePath(
              geo,
              systemAngle(s.cluster, s.planet),
              10,
              RING_OUT,
              reach,
            )}
            fill={blocked.has(s.cluster) ? "#000" : `url(#wedge-${s.resource})`}
          />
        ))}
      </g>
      {ALL_SYSTEMS.filter((s) => s.planet).map((s) => (
        <path
          key={`edge-${s.id}`}
          d={wedgePath(
            geo,
            systemAngle(s.cluster, s.planet),
            10,
            RING_OUT,
            reach,
          )}
          fill={blocked.has(s.cluster) ? "rgba(0,0,0,0.55)" : "none"}
          stroke="#e9dfc4"
          strokeOpacity={0.16}
          strokeWidth={1.2}
        />
      ))}
      <rect
        x={geo.view.x}
        y={geo.view.y}
        width={geo.view.w}
        height={geo.view.h}
        filter="url(#grain)"
        opacity={0.12}
      />
      {WALLS.map(([a]) => {
        const paths = crack(
          geo,
          clusterAngle(a ?? 1) + 30,
          RING_OUT - 2,
          520,
          (a ?? 1) * 37,
        );
        return (
          <g key={a} className="crack">
            {paths.map((d, i) => (
              <path
                key={i}
                d={d}
                stroke="#000"
                strokeOpacity={0.6}
                strokeWidth={i ? 4 : 7}
                fill="none"
                strokeLinejoin="round"
              />
            ))}
            {paths.map((d, i) => (
              <path
                key={`w${i}`}
                d={d}
                stroke="#f4ecd8"
                strokeWidth={i ? 1.6 : 3.4}
                fill="none"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
          </g>
        );
      })}
      <ellipse
        cx={CX}
        cy={CY}
        rx={(RING_OUT + 6) * geo.ringStretch}
        ry={RING_OUT + 6}
        fill="none"
        stroke="#f4ecd8"
        strokeOpacity={0.55}
        strokeWidth={2.5}
      />
      <ellipse
        cx={CX}
        cy={CY}
        rx={RING_IN * geo.ringStretch}
        ry={RING_IN}
        fill="#08070b"
        stroke="#f4ecd8"
        strokeOpacity={0.7}
        strokeWidth={2.5}
      />
      <text x={CX} y={CY + 15} className="map-title">
        ARCS
      </text>
    </g>
  );
}

function OutOfPlay({ geo, blocked }: { geo: Geometry; blocked: Set<number> }) {
  return (
    <g>
      {[...blocked].map((c) => {
        const a = clusterAngle(c);
        const from = geo.ring(a - 25, (RING_IN + RING_OUT) / 2),
          to = geo.ring(a + 25, (RING_IN + RING_OUT) / 2),
          mid = geo.ring(a, RING_OUT + 30);
        const label = geo.polar(a, 300);
        return (
          <g key={c}>
            <path
              d={ringSegment(geo, a, 29.4, RING_IN, RING_OUT)}
              fill="#060508"
              stroke="#f4ecd8"
              strokeOpacity={0.3}
            />
            <path
              d={`M${from.x},${from.y} Q${mid.x},${mid.y} ${to.x},${to.y}`}
              stroke="#c9b98f"
              strokeWidth={12}
              fill="none"
              strokeLinecap="round"
              opacity={0.35}
            />
            <text x={label.x} y={label.y} className="out-of-play">
              OUT OF PLAY
            </text>
          </g>
        );
      })}
      {ALL_SYSTEMS.filter((s) => s.planet && blocked.has(s.cluster)).map(
        (s) => {
          const c = geo.systemCenter(s.cluster, s.planet);
          return (
            <PlanetArt
              key={s.id}
              id={s.id}
              resource={s.resource}
              cx={c.x}
              cy={c.y}
              r={PLANET_R}
              dim
            />
          );
        },
      )}
    </g>
  );
}

function Fleet({
  g,
  geo,
  s,
  ships,
  targets,
  picked,
  onPick,
}: {
  g: Game;
  geo: Geometry;
  s: SystemView;
  ships: PieceView[];
  targets: Map<string, Target>;
  picked: Set<string>;
  onPick(key: string): void;
}) {
  const anchor = geo.fleetAnchor(s.cluster, s.planet);
  const groups = g.order
    .flatMap((owner) =>
      [false, true].map((damaged) => ({
        owner,
        damaged,
        pieces: ships.filter((p) => p.owner === owner && p.damaged === damaged),
      })),
    )
    .filter((x) => x.pieces.length);
  const gate = !s.planet;
  const offsets = groupOffsets(
    geo,
    groups.length,
    gate ? 44 : 36,
    geo.fleetAngle(s.cluster, s.planet),
    gate ? -32 : -32,
    gate ? 4 : 3,
  );
  return (
    <g>
      {groups.map((grp, i) => {
        const o = offsets[i] ?? { dx: 0, dy: 0 };
        const x = anchor.x + o.dx,
          y = anchor.y + o.dy;
        const color = playerColor(g, grp.owner);
        const target = grp.pieces
          .map((p) => key.piece(p.id))
          .find((k) => targets.has(k));
        const isPicked = grp.pieces.some((p) => picked.has(key.piece(p.id)));
        const n = grp.pieces.length;
        const shown = Math.min(n, 3);
        return (
          <motion.g
            key={`${grp.owner}-${grp.damaged}`}
            className={`fleet ${target ? "target" : ""} ${isPicked ? "picked" : ""}`}
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{ opacity: 1, scale: 1, x, y }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            onClick={(e) => {
              if (!target) return;
              e.stopPropagation();
              onPick(target);
            }}
            role={target ? "button" : undefined}
            aria-label={`${n} ${grp.damaged ? "damaged " : ""}${playerName(g, grp.owner)} ship${n > 1 ? "s" : ""} in ${systemName(g, s.id)}`}
          >
            {target && <circle r={24} className="target-ring" />}
            {Array.from({ length: shown }, (_, k) => (
              <ShipGlyph
                key={k}
                color={color}
                damaged={grp.damaged}
                transform={`translate(${(k - (shown - 1) / 2) * 9},${k * -4})`}
                size={1.55}
              />
            ))}
            {n > 1 && (
              <g transform="translate(17,13)">
                <circle
                  r={10.5}
                  fill="#0b0d12"
                  stroke={color}
                  strokeWidth={1.8}
                />
                <text className="count" y={4.5}>
                  {n}
                </text>
              </g>
            )}
          </motion.g>
        );
      })}
    </g>
  );
}

function Buildings({
  g,
  geo,
  s,
  pieces,
  targets,
  picked,
  onPick,
}: {
  g: Game;
  geo: Geometry;
  s: SystemView;
  pieces: PieceView[];
  targets: Map<string, Target>;
  picked: Set<string>;
  onPick(key: string): void;
}) {
  const c = geo.systemCenter(s.cluster, s.planet);
  const xs = s.slots === 1 ? [0] : [-20, 20];
  return (
    <g>
      {xs.map((dx, i) => {
        const piece = pieces[i];
        const x = c.x + dx,
          y = c.y + 6;
        if (!piece)
          return (
            <path
              key={i}
              d={`M${x},${y - 15} L${x + 14},${y + 10} L${x - 14},${y + 10} Z`}
              className="slot"
            />
          );
        const k = key.piece(piece.id);
        const target = targets.has(k);
        return (
          <motion.g
            key={piece.id}
            className={`building ${target ? "target" : ""} ${picked.has(k) ? "picked" : ""}`}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 18 }}
            style={{ x, y }}
            onClick={(e) => {
              if (!target) return;
              e.stopPropagation();
              onPick(k);
            }}
            role={target ? "button" : undefined}
            aria-label={`${playerName(g, piece.owner)} ${piece.damaged ? "damaged " : ""}${piece.kind} in ${systemName(g, s.id)}`}
          >
            {target && <circle r={22} className="target-ring" />}
            <PieceGlyph
              kind={piece.kind}
              color={playerColor(g, piece.owner)}
              damaged={piece.damaged}
              size={1.7}
            />
          </motion.g>
        );
      })}
    </g>
  );
}

function Effects({
  effects,
  g,
  geo,
}: {
  effects: MapEffect[];
  g: Game;
  geo: Geometry;
}) {
  return (
    <AnimatePresence>
      {effects.map((e) => {
        const color = playerColor(g, e.owner);
        if (e.type === "flight") {
          const a = geo.systemCenter(...e.from),
            b = geo.systemCenter(...e.to);
          return (
            <motion.g
              key={e.id}
              initial={{ x: a.x, y: a.y, opacity: 1 }}
              animate={{ x: b.x, y: b.y, opacity: [1, 1, 0] }}
              transition={{ duration: 0.9, ease: "easeInOut" }}
            >
              <ShipGlyph
                color={color}
                size={1.5}
                transform={`rotate(${(Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 90})`}
              />
              {e.count > 1 && (
                <text className="effect-count" x={14} y={-8}>
                  ×{e.count}
                </text>
              )}
            </motion.g>
          );
        }
        const p = geo.systemCenter(...e.at);
        if (e.type === "spawn")
          return (
            <motion.circle
              key={e.id}
              cx={p.x}
              cy={p.y}
              initial={{ r: 10, opacity: 0.9 }}
              animate={{ r: 70, opacity: 0 }}
              transition={{ duration: 1 }}
              fill="none"
              stroke={color}
              strokeWidth={4}
            />
          );
        return (
          <motion.g
            key={e.id}
            initial={{ opacity: 1, scale: 0.4 }}
            animate={{ opacity: 0, scale: 1.8 }}
            transition={{ duration: 1.1 }}
            style={{ x: p.x, y: p.y }}
          >
            <path
              d="M0,-30 L7,-9 L28,-12 L11,3 L22,22 L2,12 L-12,28 L-9,6 L-29,-2 L-9,-8 Z"
              fill={e.type === "destroy" ? "#ff9b52" : "#ffe08a"}
              opacity={0.9}
            />
          </motion.g>
        );
      })}
    </AnimatePresence>
  );
}

function useBox() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1100, h: 820 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize({ w: r.width, h: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, size };
}

export function ReachMap({
  view: g,
  targets,
  picked,
  active,
  focus,
  effects,
  onPick,
  children,
}: MapProps) {
  const { ref, size } = useBox();
  const stretch = stretchFor(size.w / size.h);
  const geo = useMemo(() => makeGeometry(stretch), [stretch]);
  const vw = viewWidth(stretch);
  const scale = Math.min(size.w / vw, size.h / HEIGHT);
  const box = { w: vw * scale, h: HEIGHT * scale };
  const [hover, setHover] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const [peek, setPeek] = useState<Peek | null>(null);
  const blocked = useMemo(() => {
    const live = new Set(g.systems.map((s) => s.cluster));
    return new Set([1, 2, 3, 4, 5, 6].filter((c) => !live.has(c)));
  }, [g.systems]);
  const systemTarget = (s: SystemView) => targets.get(key.system(s.id));
  const pieceTargets = (s: SystemView) =>
    g.pieces.filter((p) => p.system === s.id && targets.has(key.piece(p.id)));
  const pct = (x: number, y: number) => ({
    left: `${((x - geo.view.x) / geo.view.w) * 100}%`,
    top: `${((y - geo.view.y) / geo.view.h) * 100}%`,
  });

  const tipPlacement = (
    c: { x: number; y: number },
    gate: boolean,
    rows: number,
  ) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return { left: 0, top: 0 };
    const sx = (x: number) =>
      rect.left + ((x - geo.view.x) / geo.view.w) * rect.width;
    const sy = (y: number) =>
      rect.top + ((y - geo.view.y) / geo.view.h) * rect.height;
    const w = 250,
      h = 64 + rows * 20;
    const dx = c.x - CX,
      dy = c.y - CY,
      len = Math.hypot(dx, dy) || 1;
    let ux = dx / len,
      uy = dy / len;
    let ax: number, ay: number;
    if (gate) {
      ax = sx(CX + dx * 0.32);
      ay = sy(CY + dy * 0.32);
      ux = 0;
      uy = 0;
    } else {
      const reach = PLANET_R + 16;
      ax = sx(c.x + ux * reach * geo.stretch);
      ay = sy(c.y + uy * reach);
      if (
        (uy < 0 && ay - h < 8) ||
        (uy > 0 && ay + h > window.innerHeight - 8)
      ) {
        uy = 0;
        ux = ux >= 0 ? 1 : -1;
        ax = sx(c.x + ux * reach * 1.4);
        ay = sy(c.y);
      }
    }
    const left = ax - (0.5 - 0.5 * ux) * w,
      top = ay - (0.5 - 0.5 * uy) * h;
    return {
      left: Math.min(Math.max(8, left), window.innerWidth - w - 8),
      top: Math.min(Math.max(8, top), window.innerHeight - h - 8),
      width: w,
    };
  };
  const hovered = g.systems.find((s) => s.id === hover);
  let tip: ReactNode = null;
  if (hovered) {
    const c = geo.systemCenter(hovered.cluster, hovered.planet);
    const t =
      systemTarget(hovered) ??
      (pieceTargets(hovered).length === 1
        ? targets.get(key.piece(pieceTargets(hovered)[0]?.id ?? ""))
        : undefined);
    const ctrl = control(g, hovered.id);
    const here = g.pieces.filter((p) => p.system === hovered.id);
    const rows =
      g.order.filter((id) => here.some((p) => p.owner === id)).length +
      (t ? 2 : 0);
    tip = createPortal(
      <div className="map-tip" style={tipPlacement(c, !hovered.planet, rows)}>
        <strong>{systemName(g, hovered.id)}</strong>
        {hovered.planet ? (
          <span className="muted">
            {" "}
            · {here.filter((p) => p.kind !== "ship").length}/{hovered.slots}{" "}
            building slot{hovered.slots > 1 ? "s" : ""} used
          </span>
        ) : null}
        <div className="muted">
          {ctrl
            ? `${playerName(g, ctrl)} controls`
            : here.length
              ? "No one controls"
              : "Empty"}
        </div>
        {g.order
          .filter((id) => here.some((p) => p.owner === id))
          .map((id) => {
            const mine = here.filter((p) => p.owner === id);
            const ships = mine.filter((p) => p.kind === "ship");
            const dmg = ships.filter((p) => p.damaged).length;
            const blds = mine.filter((p) => p.kind !== "ship");
            return (
              <div key={id} className="tip-row">
                <span
                  className="dot"
                  style={{ background: playerColor(g, id) }}
                />
                {playerName(g, id)}: {ships.length} ship
                {ships.length === 1 ? "" : "s"}
                {dmg ? ` (${dmg} damaged)` : ""}
                {blds
                  .map((b) => ` · ${b.damaged ? "damaged " : ""}${b.kind}`)
                  .join("")}
              </div>
            );
          })}
        {t && (
          <div className="tip-action">
            {t.label}
            {t.detail ? <div className="muted">{t.detail}</div> : null}
          </div>
        )}
      </div>,
      document.body,
    );
  }

  return (
    <div className="map-frame" ref={ref}>
      <div
        className="map-box"
        ref={boxRef}
        style={{ width: box.w, height: box.h }}
      >
        <svg
          viewBox={`${geo.view.x} ${geo.view.y} ${geo.view.w} ${geo.view.h}`}
          className={`reach ${active ? "has-targets" : ""}`}
          role="region"
          aria-label="Map of the Reach"
        >
          <MapDefs reach={700 * stretch} />
          <Backdrop geo={geo} blocked={blocked} />
          <OutOfPlay geo={geo} blocked={blocked} />
          {g.systems.map((s) => {
            const t = systemTarget(s);
            const inner = pieceTargets(s);
            const isPicked = picked.has(key.system(s.id));
            const quiet = active && !t && !inner.length && !isPicked;
            const c = geo.systemCenter(s.cluster, s.planet);
            const ctrl = control(g, s.id);
            const a = clusterAngle(s.cluster);
            const segment = s.planet
              ? ""
              : ringSegment(geo, a, 29.4, RING_IN, RING_OUT);
            const numberAt = geo.ring(a, RING_IN + 22);
            const click = () => {
              if (t) onPick(t.key);
              else if (inner.length === 1 && inner[0])
                onPick(key.piece(inner[0].id));
            };
            return (
              <g
                key={s.id}
                className={`sys ${s.planet ? "planet" : "gate"} ${t ? "target" : ""} ${isPicked ? "picked" : ""} ${quiet ? "quiet" : ""} ${focus.has(s.id) ? "focus" : ""}`}
                onMouseEnter={() => setHover(s.id)}
                onMouseLeave={() => setHover((h) => (h === s.id ? "" : h))}
                onClick={click}
                role={t ? "button" : undefined}
                aria-label={t ? t.label : systemName(g, s.id)}
              >
                {s.planet ? (
                  <>
                    <circle
                      cx={c.x}
                      cy={c.y}
                      r={PLANET_R + 40}
                      className="hit-area"
                    />
                    {ctrl && (
                      <circle
                        cx={c.x}
                        cy={c.y}
                        r={PLANET_R + 7}
                        fill="none"
                        stroke={playerColor(g, ctrl)}
                        strokeWidth={4.5}
                        opacity={0.95}
                      />
                    )}
                    <PlanetArt
                      id={s.id}
                      resource={s.resource}
                      cx={c.x}
                      cy={c.y}
                      r={PLANET_R}
                    />
                    {(t || isPicked) && (
                      <circle
                        cx={c.x}
                        cy={c.y}
                        r={PLANET_R + 14}
                        className="target-ring"
                      />
                    )}
                    <Buildings
                      g={g}
                      geo={geo}
                      s={s}
                      pieces={g.pieces.filter(
                        (p) => p.system === s.id && p.kind !== "ship",
                      )}
                      targets={targets}
                      picked={picked}
                      onPick={onPick}
                    />
                  </>
                ) : (
                  <>
                    <path d={segment} className="gate-segment" />
                    {ctrl && (
                      <path
                        d={ringSegment(geo, a, 27.5, RING_IN + 4, RING_OUT - 4)}
                        fill="none"
                        stroke={playerColor(g, ctrl)}
                        strokeWidth={4}
                        opacity={0.9}
                      />
                    )}
                    {(t || isPicked) && (
                      <path d={segment} className="target-ring" />
                    )}
                    <text
                      x={numberAt.x}
                      y={numberAt.y}
                      className="cluster-number"
                    >
                      {s.cluster}
                    </text>
                  </>
                )}
                <Fleet
                  g={g}
                  geo={geo}
                  s={s}
                  ships={g.pieces.filter(
                    (p) => p.system === s.id && p.kind === "ship",
                  )}
                  targets={targets}
                  picked={picked}
                  onPick={onPick}
                />
              </g>
            );
          })}
          <Strip
            g={g}
            geo={geo}
            targets={targets}
            onPick={onPick}
            onPeek={setPeek}
          />
          <Effects effects={effects} g={g} geo={geo} />
        </svg>
        {children}
        {tip}
      </div>
      {peek &&
        createPortal(
          <div
            className="card-zoom"
            style={{
              left: peek.rect.right + 14,
              top: Math.max(
                10,
                Math.min(peek.rect.top, window.innerHeight - 410),
              ),
            }}
          >
            <img src={peek.src} alt="" />
          </div>,
          document.body,
        )}
    </div>
  );
}
