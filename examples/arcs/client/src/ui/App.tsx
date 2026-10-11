import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BookOpen, ScrollText, X } from "lucide-react";
import { ReachMap } from "../map/Map.tsx";
import { handOf } from "../model/hydrate.ts";
import { str } from "../model/flow.ts";
import {
  AMBITION_INFO,
  RESOURCE_INFO,
  SUIT_INFO,
  playerColor,
  playerName,
} from "../model/text.ts";
import type { Game } from "../client.ts";
import { Ambitions } from "./Ambitions.tsx";
import { Court } from "./Court.tsx";
import { Hub } from "./Hub.tsx";
import { Hand } from "./Hand.tsx";
import { LogPanel } from "./Log.tsx";
import { PlayerBoard } from "./PlayerBoard.tsx";
import { ActionTray, TurnBanner } from "./Turn.tsx";
import { useTable } from "./useTable.ts";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { AmbitionIcon, ResourceIcon } from "./icons.tsx";

function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose(): void;
  children: React.ReactNode;
}) {
  return (
    <motion.aside
      className="drawer"
      initial={{ x: 420 }}
      animate={{ x: 0 }}
      exit={{ x: 420 }}
      transition={{ type: "spring", stiffness: 300, damping: 32 }}
    >
      <header>
        <h2>{title}</h2>
        <button
          className="btn quiet icon"
          onClick={onClose}
          aria-label={`Close ${title}`}
        >
          <X size={18} />
        </button>
      </header>
      {children}
    </motion.aside>
  );
}

function Reference() {
  return (
    <div className="reference">
      <h3>Your turn</h3>
      <p>
        Play one card. The lead card's pips are your actions. Others then{" "}
        <b>Surpass</b> (same suit, higher number: all pips), <b>Pivot</b> (other
        suit: 1 action) or <b>Copy</b> (face down: 1 lead action).
      </p>
      <h3>Suits</h3>
      <ul>
        {Object.entries(SUIT_INFO).map(([k, s]) => (
          <li key={k}>
            <b style={{ color: s.color }}>{s.name}</b> — {s.verbs}
          </li>
        ))}
      </ul>
      <h3>Prelude: spend resources before your first action</h3>
      <ul>
        {Object.entries(RESOURCE_INFO).map(([k, r]) => (
          <li key={k}>
            <ResourceIcon type={k} size={14} /> <b>{r.name}</b> — {r.spend}
          </li>
        ))}
      </ul>
      <h3>Ambitions — scored at chapter end</h3>
      <ul>
        {Object.entries(AMBITION_INFO).map(([k, a]) => (
          <li key={k}>
            <AmbitionIcon type={k} size={14} /> <b>{a.name}</b> — most{" "}
            {a.counts}
          </li>
        ))}
      </ul>
      <h3>Control</h3>
      <p>
        Most fresh ships in a system controls it. Control lets you tax rival
        cities, stops rival catapults, and damages rival builds.
      </p>
    </div>
  );
}

function ChapterSummary({
  g,
  chapter,
  onClose,
}: {
  g: Game;
  chapter: number;
  onClose(): void;
}) {
  const rank = (place: string) =>
    place === "first" ? 0 : place === "tied first" ? 1 : 2;
  const scores = g.scores
    .filter((s) => s.chapter === chapter)
    .sort(
      (a, b) =>
        a.ambition.localeCompare(b.ambition) || rank(a.place) - rank(b.place),
    );
  return (
    <motion.div
      className="overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="summary"
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{g.winner ? "Final scoring" : `Chapter ${chapter} scored`}</h2>
        {scores.length ? (
          <ul>
            {scores.map((s, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 * i }}
              >
                <AmbitionIcon type={s.ambition} size={20} />
                <span>{AMBITION_INFO[s.ambition]?.name}</span>
                <b style={{ color: playerColor(g, s.player) }}>
                  {playerName(g, s.player)}
                </b>
                <span className="muted">{s.place}</span>
                <b className="gain">+{s.amount}</b>
              </motion.li>
            ))}
          </ul>
        ) : (
          <p className="muted">No ambitions scored Power this chapter.</p>
        )}
        <div className="standings-final">
          {[...g.players]
            .sort((a, b) => b.power - a.power)
            .map((p) => (
              <span key={p.id} style={{ color: playerColor(g, p.id) }}>
                {playerName(g, p.id)} <b>{p.power}</b>
              </span>
            ))}
        </div>
        {g.winner ? (
          <p className="winner" style={{ color: playerColor(g, g.winner) }}>
            {playerName(g, g.winner)} wins the Reach!
          </p>
        ) : null}
        <button className="btn primary" onClick={onClose}>
          {g.winner ? "View the table" : "Continue"}
        </button>
      </motion.div>
    </motion.div>
  );
}

export function App() {
  const t = useTable();
  const g = t.view;
  const base = t.base;
  const [drawer, setDrawer] = useState<"" | "log" | "help">("");
  const [handUp, setHandUp] = useState(false);
  const zone = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: -1, y: -1 });
  useEffect(() => {
    const track = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("pointermove", track);
    return () => window.removeEventListener("pointermove", track);
  }, []);
  useEffect(() => {
    if (!handUp) return;
    const frame = requestAnimationFrame(() => {
      const { x, y } = pointer.current;
      const under = x < 0 ? null : document.elementFromPoint(x, y);
      if (!under || !zone.current?.contains(under)) setHandUp(false);
    });
    return () => cancelAnimationFrame(frame);
  });
  const [focus, setFocus] = useState<string[]>([]);
  const [summary, setSummary] = useState(0);
  const lastChapter = useRef<number | null>(null);
  const wasOver = useRef(false);

  useEffect(() => {
    if (!g) return;
    if (lastChapter.current !== null && g.chapter > lastChapter.current)
      setSummary(lastChapter.current);
    if (g.winner && !wasOver.current) setSummary(g.chapter);
    wasOver.current = !!g.winner;
    lastChapter.current = g.chapter;
  }, [g]);

  if (!g || !base) {
    return (
      <div className="loading">
        <div className="loading-mark">ARCS</div>
        <p>
          {t.status === "error" || t.status === "closed"
            ? "Could not reach the table."
            : "Connecting to the Reach…"}
        </p>
      </div>
    );
  }

  const me = t.me && g.order.includes(t.me) ? t.me : null;
  const meP = g.players.find((p) => p.id === me);
  const order = me
    ? [
        ...g.order.slice(g.order.indexOf(me) + 1),
        ...g.order.slice(0, g.order.indexOf(me)),
      ]
    : g.order;
  const actor = t.sit && t.sit.phase !== "over" ? t.sit.actor : "";
  const handTargets = t.sit?.mine;
  const selectedCard = str(t.answers, "card")?.replace(/^hand:/, "");

  const handKeys = [...t.targets.keys()].some((k) => k.startsWith("hand:"));
  const board = (p: (typeof g.players)[number], mine: boolean) => (
    <PlayerBoard
      key={p.id}
      g={g}
      base={base}
      p={p}
      me={mine}
      actor={actor}
      targets={t.targets}
      picked={t.picked}
      onPick={t.pick}
      variant={mine ? "full" : "compact"}
      onArrange={
        mine && t.sit?.mine && g.rearrange.includes(p.id)
          ? (values) => t.send({ op: "arrange", values })
          : undefined
      }
    />
  );

  return (
    <div
      className={`app ${me ? "" : "spectator"}`}
      onClick={(e) => {
        if (!(e.target instanceof Element)) return;
        if (
          e.target.closest(
            "button, [role=button], a, input, .action-tray, .drawer, .overlay",
          )
        )
          return;
        if (t.flow || t.menu || t.step) t.cancel();
      }}
      style={{ ["--me" as string]: me ? playerColor(g, me) : "#888" }}
    >
      <header className="top">
        <div className="brand">
          <span className="logo">ARCS</span>
          <span className="where">
            Chapter <b>{g.chapter}</b> · Round <b>{g.round}</b>
          </span>
        </div>
        <TurnBanner
          t={t}
          onFocus={setFocus}
          onOpenLog={() => setDrawer("log")}
        />
        <nav className="top-actions">
          <button
            className={`btn quiet icon ${drawer === "log" ? "on" : ""}`}
            onClick={() => setDrawer(drawer === "log" ? "" : "log")}
            aria-label="Game log"
          >
            <ScrollText size={20} />
          </button>
          <button
            className={`btn quiet icon ${drawer === "help" ? "on" : ""}`}
            onClick={() => setDrawer(drawer === "help" ? "" : "help")}
            aria-label="Rules reference"
          >
            <BookOpen size={20} />
          </button>
        </nav>
      </header>

      <aside className="left">
        <ErrorBoundary label="The Court">
          <Court g={g} targets={t.targets} onPick={t.pick} />
        </ErrorBoundary>
        {meP && board(meP, true)}
      </aside>

      <main className="center">
        <ErrorBoundary label="The map">
          <ReachMap
            view={g}
            targets={t.targets}
            picked={t.picked}
            active={!!t.sit?.mine && t.targets.size > 0}
            focus={new Set(focus)}
            effects={t.effects}
            onPick={t.pick}
          >
            <Hub
              g={g}
              me={me}
              targets={t.targets}
              picked={t.picked}
              onPick={t.pick}
            />
          </ReachMap>
        </ErrorBoundary>
        <div className={`dock ${handUp ? "hand-up" : ""}`}>
          <div
            className="dock-zone"
            ref={zone}
            onMouseLeave={() => setHandUp(false)}
          >
            <div className="dock-part tray-part">
              <ActionTray t={t} />
            </div>
            {meP && (
              <div className="dock-part" onMouseEnter={() => setHandUp(true)}>
                <Hand
                  cards={handOf(meP)}
                  targets={handTargets ? t.targets : new Map()}
                  picked={t.picked}
                  selected={selectedCard}
                  dim={!handKeys && !selectedCard}
                  selectable={t.sit?.mine === true && t.sit.phase === "card"}
                  onPick={t.pick}
                />
              </div>
            )}
          </div>
        </div>
      </main>

      <aside className="right">
        <ErrorBoundary label="Ambitions">
          <Ambitions g={g} base={base} me={me} />
        </ErrorBoundary>
        <div className="rivals" aria-label="Rivals">
          {order.map((id) => {
            const p = g.players.find((x) => x.id === id);
            return p ? board(p, false) : null;
          })}
        </div>
      </aside>

      <AnimatePresence>
        {drawer === "log" && (
          <Drawer title="Game log" onClose={() => setDrawer("")}>
            <ErrorBoundary label="The log">
              <LogPanel g={g} onFocus={setFocus} />
            </ErrorBoundary>
          </Drawer>
        )}
        {drawer === "help" && (
          <Drawer title="Rules reference" onClose={() => setDrawer("")}>
            <Reference />
          </Drawer>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {t.error && (
          <motion.div
            className="toast"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={t.clearError}
            role="alert"
          >
            {t.error}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {summary > 0 && (
          <ChapterSummary
            g={g}
            chapter={summary}
            onClose={() => setSummary(0)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
