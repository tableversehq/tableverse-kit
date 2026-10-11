import { AnimatePresence, motion } from "motion/react";
import type { ActionCard } from "arcs-engine/data";
import { key, type Target } from "../model/flow.ts";
import { AMBITION_INFO, SUIT_INFO } from "../model/text.ts";
import { CardImage, actionArt } from "./Card.tsx";

export function Hand({
  cards,
  targets,
  picked,
  selected,
  dim,
  selectable,
  onPick,
}: {
  cards: ActionCard[];
  targets: Map<string, Target>;
  picked: Set<string>;
  selected?: string;
  dim: boolean;
  selectable: boolean;
  onPick(key: string): void;
}) {
  const sorted = [...cards].sort(
    (a, b) => a.suit.localeCompare(b.suit) || a.rank - b.rank,
  );
  return (
    <div className={`hand ${dim ? "dim" : ""}`} aria-label="Your hand">
      <AnimatePresence initial={false}>
        {sorted.map((c, i) => {
          const k = key.hand(c.id);
          const t = targets.get(k);
          const isSel = selected === c.id || picked.has(k);
          const mid = (sorted.length - 1) / 2;
          return (
            <motion.div
              key={c.id}
              className="hand-slot"
              layout
              initial={{ y: 80, opacity: 0 }}
              animate={{
                y: isSel ? -26 : 0,
                opacity: 1,
                rotate: (i - mid) * 2.2,
              }}
              exit={{ y: -160, opacity: 0, scale: 0.7 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              style={{ zIndex: isSel ? 50 : i }}
            >
              <CardImage
                src={actionArt(c.id)}
                alt={`${SUIT_INFO[c.suit]?.name} ${c.rank}`}
                label={`${SUIT_INFO[c.suit]?.name} ${c.rank}, ${c.pips} pips${c.ambition && c.ambition !== "any" ? `, ${AMBITION_INFO[c.ambition]?.name}` : c.ambition === "any" ? ", any ambition" : ""}`}
                zoom={!isSel}
                zoomAbove
                className={`action-card ${t ? "target" : ""} ${isSel ? "selected" : ""}`}
                onClick={t || selectable ? () => onPick(k) : undefined}
              >
                {t?.detail && <span className="card-hint">{t.detail}</span>}
              </CardImage>
            </motion.div>
          );
        })}
      </AnimatePresence>
      {!cards.length && <div className="hand-empty">No cards in hand</div>}
    </div>
  );
}
