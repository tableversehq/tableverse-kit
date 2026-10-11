import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import type { Game } from "../client.ts";
import { key, type Target } from "../model/flow.ts";
import { playerColor, playerName, systemName } from "../model/text.ts";
import { Die } from "./icons.tsx";
import { LogLine } from "./Log.tsx";

interface Props {
  g: Game;
  me: string | null;
  targets: Map<string, Target>;
  picked: Set<string>;
  onPick(key: string): void;
}

function battleShown(g: Game): boolean {
  const roll = g.rolls[0];
  if (!roll) return false;
  if (g.battle.length) return true;
  if (roll.attacker === g.active && g.phase === "actions") return true;
  return g.phase === "card" && g.played.some((p) => p.owner === roll.attacker);
}

function Battle({ g, me, targets, picked, onPick }: Props) {
  const roll = g.rolls[0];
  const b = g.battle[0];
  if (!roll) return null;
  const start = g.log.lastIndexOf(
    `${roll.attacker} attacked ${roll.defender} in ${roll.system}.`,
  );
  const outcome =
    start < 0
      ? []
      : g.log
          .slice(start + 1)
          .filter((l) => /damaged|destroyed|stole|ransack|Outrage/.test(l))
          .slice(0, 5);
  const plural = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;
  const steps: [string, string][] = b
    ? [
        ["self", plural(b.self, "hit", "hits") + " on attacker"],
        ["intercept", plural(b.intercept, "intercept hit", "intercept hits")],
        ["ship", plural(b.ship, "hit", "hits") + " on defender"],
        ["building", plural(b.building, "building hit", "building hits")],
        ["raid", plural(b.keys, "key", "keys")],
      ]
    : [];
  return (
    <section aria-label="Battle dice">
      <header className="hub-title">
        <b style={{ color: playerColor(g, roll.attacker) }}>
          {playerName(g, roll.attacker)}
        </b>
        <span className="muted"> attacks </span>
        <b style={{ color: playerColor(g, roll.defender) }}>
          {playerName(g, roll.defender)}
        </b>
        <span className="muted"> in {systemName(g, roll.system)}</span>
      </header>
      <div className="dice-row">
        {roll.dice.map((d, i) => {
          const k = key.die(i);
          const t = targets.get(k);
          return (
            <motion.button
              key={`${roll.serial}-${i}`}
              className={`die-btn ${t ? "target" : ""}`}
              disabled={!t}
              onClick={() => t && onPick(k)}
              initial={{ rotate: -200, scale: 0.2, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              transition={{
                delay: i * 0.07,
                type: "spring",
                stiffness: 200,
                damping: 14,
              }}
            >
              <Die
                type={d.type}
                face={d.face}
                selected={picked.has(k)}
                size={38}
              />
            </motion.button>
          );
        })}
        {!roll.dice.length && <span className="muted">No dice rolled</span>}
      </div>
      {b && b.attacker !== me ? (
        <div className="battle-waiting">
          Waiting for {playerName(g, b.attacker)} to assign damage
        </div>
      ) : b ? (
        <ol className="battle-steps">
          {steps.map(([id, label]) => (
            <li key={id} className={b.step === id ? "now" : ""}>
              {label}
            </li>
          ))}
        </ol>
      ) : (
        <ul className="battle-outcome">
          {outcome.map((line, i) => (
            <li key={i}>
              <LogLine g={g} text={line} onFocus={() => {}} />
            </li>
          ))}
          {!outcome.length && <li className="muted">No pieces were lost.</li>}
        </ul>
      )}
    </section>
  );
}

export function Hub(props: Props) {
  const { g } = props;
  const roll = g.rolls[0];
  const live = g.battle.length > 0;
  const phase = `${roll?.serial ?? -1}:${live ? "live" : "done"}`;
  const [state, setState] = useState({
    phase: "",
    mode: "open" as "open" | "collapsed" | "hidden",
  });
  const mode = state.phase === phase ? state.mode : "open";
  const ref = useRef<HTMLDivElement>(null);
  const shown = battleShown(g);
  const rerolling = live && g.battle[0]?.step === "roll";

  useEffect(() => {
    if (!shown || live || mode === "hidden") return;
    const timer = setTimeout(() => setState({ phase, mode: "hidden" }), 6000);
    return () => clearTimeout(timer);
  }, [shown, live, mode, phase]);

  useEffect(() => {
    if (!shown || mode !== "open" || rerolling) return;
    const onDown = (e: PointerEvent) => {
      if (e.target instanceof Node && ref.current?.contains(e.target)) return;
      setState({ phase, mode: live ? "collapsed" : "hidden" });
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [shown, mode, live, phase, rerolling]);

  if (!shown || !roll || mode === "hidden") return null;
  if (mode === "collapsed" && !rerolling)
    return (
      <div className="hub-anchor">
        <button
          className="hub-pill"
          onClick={() => setState({ phase, mode: "open" })}
        >
          Battle in {systemName(g, roll.system)} · show dice
        </button>
      </div>
    );
  return (
    <div className="hub-anchor">
      <motion.div
        ref={ref}
        className="hub"
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        aria-live="polite"
      >
        <Battle {...props} />
      </motion.div>
    </div>
  );
}
