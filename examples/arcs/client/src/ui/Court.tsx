import { AnimatePresence, motion } from "motion/react";
import type { Game } from "../client.ts";
import { key, type Target } from "../model/flow.ts";
import { courtDeckCount } from "../model/hydrate.ts";
import { courtName, playerColor, playerName } from "../model/text.ts";
import { CardImage, courtArt } from "./Card.tsx";
import { PieceIcon } from "./glyphs.tsx";

export function Court({
  g,
  targets,
  onPick,
}: {
  g: Game;
  targets: Map<string, Target>;
  onPick(key: string): void;
}) {
  return (
    <section className="court" aria-label="The Court">
      <h2>
        The Court <span className="muted">· {courtDeckCount(g)} in deck</span>
      </h2>
      <div className="court-row">
        <AnimatePresence initial={false}>
          {g.court.map((c) => {
            const k = key.court(c.id);
            const t = targets.get(k);
            const counts = g.order
              .map((o) => ({ o, n: c.agents.filter((a) => a === o).length }))
              .filter((x) => x.n);
            return (
              <motion.div
                key={c.id}
                className="court-slot"
                layout
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, y: -40, scale: 0.8 }}
              >
                <CardImage
                  src={courtArt(c.id)}
                  alt={courtName(c.id)}
                  label={t ? t.label : courtName(c.id)}
                  zoomWidth={420}
                  className={`court-card ${t ? "target" : ""}`}
                  onClick={t ? () => onPick(k) : undefined}
                >
                  {t?.detail && <span className="card-hint">{t.detail}</span>}
                </CardImage>
                <div className="court-name">{courtName(c.id)}</div>
                <div
                  className="agents"
                  aria-label={
                    counts
                      .map((x) => `${x.n} ${playerName(g, x.o)}`)
                      .join(", ") || "No agents"
                  }
                >
                  {counts.map(({ o, n }) => (
                    <motion.span
                      key={o}
                      className="agent-stack"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                    >
                      <PieceIcon
                        kind="agent"
                        color={playerColor(g, o)}
                        size={20}
                      />
                      <b>{n}</b>
                    </motion.span>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </section>
  );
}
