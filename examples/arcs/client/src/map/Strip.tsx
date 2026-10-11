import { AnimatePresence, motion } from "motion/react";
import type { Game } from "../client.ts";
import { key, type Target } from "../model/flow.ts";
import { SUIT_INFO, cap, playerColor, playerName } from "../model/text.ts";
import { actionArt } from "../ui/Card.tsx";
import type { Geometry } from "./geometry.ts";

const CARD_W = 160;
const CARD_H = (CARD_W * 1039) / 744;
const STEP = 60;

export interface Peek {
  src: string;
  rect: DOMRect;
}

function SlotLabel({
  x,
  y,
  h,
  text,
}: {
  x: number;
  y: number;
  h: number;
  text: string;
}) {
  return (
    <text
      className="slot-label"
      transform={`translate(${x},${y + h / 2}) rotate(-90)`}
      textAnchor="middle"
    >
      {text}
    </text>
  );
}

function CardBackArt({ w, h }: { w: number; h: number }) {
  return (
    <g>
      <rect
        width={w}
        height={h}
        rx={7}
        fill="#221d33"
        stroke="#8a7240"
        strokeWidth={2}
      />
      <rect
        x={8}
        y={8}
        width={w - 16}
        height={h - 16}
        rx={4}
        fill="none"
        stroke="#8a7240"
        strokeOpacity={0.5}
      />
      <text x={w / 2} y={h / 2 + 5} className="card-back-text">
        ARCS
      </text>
    </g>
  );
}

export function Strip({
  g,
  geo,
  targets,
  onPick,
  onPeek,
}: {
  g: Game;
  geo: Geometry;
  targets: Map<string, Target>;
  onPick(key: string): void;
  onPeek(p: Peek | null): void;
}) {
  const x0 = geo.strip.x,
    w = geo.strip.w;
  const cardX = x0 + w - CARD_W - 4;
  const lead = g.played.find((p) => p.mode === "lead");
  const followers = g.played.filter((p) => p.mode !== "lead");
  const followTop = 120;
  const followH = CARD_H + STEP * 2 + 16;
  const leadTop = followTop + followH + 46;
  const leadH = CARD_H + 16;
  const declared = g.markers.some((m) => m.ambition) && g.declared;

  const tagText = (card: Game["played"][number]) => cap(card.mode);
  const tagWidth = (card: Game["played"][number]) =>
    tagText(card).length * 7.6 + 16;
  const cardImage = (
    card: Game["played"][number],
    cx: number,
    cy: number,
    i: number,
  ) => {
    const k = key.played(card.card.id);
    const t = targets.get(k);
    const color = playerColor(g, card.owner);
    return (
      <motion.g
        key={`${card.owner}-${card.card.id}-${i}`}
        initial={{ opacity: 0, x: 60, scale: 0.8 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: -40 }}
        transition={{
          type: "spring",
          stiffness: 240,
          damping: 24,
          delay: 0.05,
        }}
        className={`strip-card ${t ? "target" : ""}`}
        role={t ? "button" : undefined}
        aria-label={
          card.mode === "copy"
            ? `${playerName(g, card.owner)} copied face down`
            : `${playerName(g, card.owner)} ${card.mode}: ${SUIT_INFO[card.card.suit]?.name} ${card.card.rank}`
        }
        onClick={(e) => {
          if (!t) return;
          e.stopPropagation();
          onPick(k);
        }}
        onMouseEnter={(e) => {
          if (card.mode !== "copy")
            onPeek({
              src: actionArt(card.card.id),
              rect: e.currentTarget.getBoundingClientRect(),
            });
        }}
        onMouseLeave={() => onPeek(null)}
      >
        <title>{`${playerName(g, card.owner)} · ${cap(card.mode)}`}</title>
        <g transform={`translate(${cx},${cy})`}>
          {t && (
            <rect
              x={-6}
              y={-6}
              width={CARD_W + 12}
              height={CARD_H + 12}
              rx={10}
              className="target-ring"
            />
          )}
          {card.mode === "copy" ? (
            <CardBackArt w={CARD_W} h={CARD_H} />
          ) : (
            <image
              href={actionArt(card.card.id)}
              width={CARD_W}
              height={CARD_H}
              preserveAspectRatio="xMidYMid slice"
            />
          )}
          <rect
            width={CARD_W}
            height={CARD_H}
            rx={7}
            fill="none"
            stroke={color}
            strokeWidth={3}
          />
          <g transform={`translate(${CARD_W - 4},${8})`}>
            <rect
              x={-tagWidth(card)}
              y={0}
              width={tagWidth(card)}
              height={20}
              rx={5}
              fill="#0b0c12"
              stroke={color}
              strokeWidth={1.5}
            />
            <text
              x={-tagWidth(card) / 2}
              y={14}
              className="strip-tag"
              style={{ fill: color }}
            >
              {tagText(card)}
            </text>
          </g>
          {card.mode === "lead" && declared && g.leadRank === 0 && (
            <g transform="translate(26,30)">
              <circle r={21} fill="#e9e0c9" stroke="#3b3627" strokeWidth={2} />
              <text y={8} className="zero-marker">
                0
              </text>
            </g>
          )}
        </g>
      </motion.g>
    );
  };

  return (
    <g className="strip" aria-label="Cards played this round">
      <rect
        x={x0}
        y={followTop - 30}
        width={w}
        height={leadTop + leadH - followTop + 104}
        rx={12}
        fill="#121118"
        stroke="#c9b98f"
        strokeOpacity={0.45}
        strokeWidth={1.5}
      />
      <text x={x0 + w / 2} y={followTop - 8} className="strip-title">
        Round {g.round}
      </text>
      <rect
        x={cardX - 6}
        y={followTop - 4}
        width={CARD_W + 12}
        height={followH}
        rx={9}
        className="slot-outline"
      />
      <SlotLabel
        x={x0 + 12}
        y={followTop}
        h={followH}
        text="SURPASS · COPY · PIVOT"
      />
      <AnimatePresence>
        {followers.map((c, i) =>
          cardImage(c, cardX, followTop + 4 + i * STEP, i),
        )}
      </AnimatePresence>
      <rect
        x={cardX - 6}
        y={leadTop - 4}
        width={CARD_W + 12}
        height={leadH}
        rx={9}
        className="slot-outline"
      />
      <SlotLabel x={x0 + 12} y={leadTop} h={leadH} text="LEAD" />
      <AnimatePresence>
        {lead && cardImage(lead, cardX, leadTop + 4, 0)}
      </AnimatePresence>
      {!lead && (
        <text
          x={cardX + CARD_W / 2}
          y={leadTop + leadH / 2}
          className="slot-empty"
        >
          no lead yet
        </text>
      )}
      <g transform={`translate(${x0 + w / 2},${leadTop + leadH + 34})`}>
        <circle
          r={16}
          fill={declared ? "#2a2416" : "#141318"}
          stroke="#c9b98f"
          strokeOpacity={0.6}
        />
        <text
          y={6}
          className="zero-marker small"
          style={{ fill: declared ? "#f3d58f" : "#6f6a5d" }}
        >
          0
        </text>
        <text y={34} className="strip-note">
          {declared ? "ambition declared" : "no ambition declared"}
        </text>
      </g>
    </g>
  );
}
