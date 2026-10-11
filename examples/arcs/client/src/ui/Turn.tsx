import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Minus, Plus } from "lucide-react";
import type { Game } from "../client.ts";
import type { Global } from "../model/situation.ts";
import { actorLabel } from "../model/situation.ts";
import {
  SUIT_INFO,
  VERB_BLOCKED,
  VERB_INFO,
  playerColor,
} from "../model/text.ts";
import { ResourceIcon } from "./icons.tsx";
import { LogLine } from "./Log.tsx";
import { Tip } from "./Tip.tsx";
import type { Table } from "./useTable.ts";

function Stepper({
  label,
  value,
  min,
  max,
  color,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  color?: string;
  onChange(v: number): void;
}) {
  return (
    <span
      className="stepper"
      style={color ? { ["--sc" as string]: color } : undefined}
    >
      <span className="stepper-label">{label}</span>
      <button
        aria-label={`Fewer ${label}`}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        <Minus size={16} />
      </button>
      <b aria-live="polite">{value}</b>
      <button
        aria-label={`More ${label}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus size={16} />
      </button>
    </span>
  );
}

function Pips({ g }: { g: Game }) {
  const color = SUIT_INFO[g.suit]?.color ?? "#ddd";
  return (
    <Tip
      content={`${g.pips} action${g.pips === 1 ? "" : "s"} left on your card`}
    >
      <span className="pips">
        {Array.from({ length: g.pips }, (_, i) => (
          <span key={i} className="pip" style={{ background: color }} />
        ))}
      </span>
    </Tip>
  );
}

export function TurnBanner({
  t,
  onFocus,
  onOpenLog,
}: {
  t: Table;
  onFocus(systems: string[]): void;
  onOpenLog(): void;
}) {
  const { view: g, sit } = t;
  if (!g || !sit) return <div className="turn-banner" />;
  const latest = g.log.at(-1);
  return (
    <div
      className={`turn-banner ${sit.mine ? "mine" : ""}`}
      style={{ ["--ac" as string]: playerColor(g, sit.actor) }}
    >
      <span className="whose-dot" />
      <div className="whose">
        <b>
          {sit.mine && sit.phase === "pending" && sit.actor !== g.active
            ? "Your decision"
            : actorLabel(g, sit, t.me)}
        </b>
        <small>{sit.doing.replace(/^./, (c) => c.toUpperCase())}</small>
      </div>
      {sit.phase === "actions" && <Pips g={g} />}
      {latest && (
        <button
          className="latest"
          onClick={onOpenLog}
          title="Open the game log"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={g.log.length}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
            >
              <LogLine g={g} text={latest} onFocus={onFocus} />
            </motion.span>
          </AnimatePresence>
        </button>
      )}
    </div>
  );
}

export function ActionTray({ t }: { t: Table }) {
  const { view: g, sit, step } = t;
  const [asking, setAsking] = useState<Global | null>(null);
  useEffect(() => setAsking(null), [t.version]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAsking(null);
        t.cancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [t]);
  if (!g || !sit || !sit.mine) return null;
  const runGlobal = (gl: Global) =>
    gl.confirm ? setAsking(gl) : t.runGlobal(gl);
  const root = sit.phase === "actions" && !t.flow;

  let prompt: ReactNode = null;
  let controls: ReactNode = null;
  if (asking) {
    prompt = asking.confirm;
    controls = (
      <>
        <button
          className="btn primary"
          onClick={() => {
            t.runGlobal(asking);
            setAsking(null);
          }}
        >
          {asking.label}
        </button>
        <button className="btn quiet" onClick={() => setAsking(null)}>
          Keep playing
        </button>
      </>
    );
  } else if (t.menu) {
    prompt = "Which action?";
    controls = (
      <>
        {t.menu.entries.map((e) => (
          <button
            key={e.flow.id}
            className="btn primary"
            onClick={() => t.start(e.flow, { [e.stepId]: e.target.value })}
          >
            {e.target.label}
            {e.target.detail && <small>{e.target.detail}</small>}
          </button>
        ))}
        <button className="btn quiet" onClick={t.cancel}>
          Cancel
        </button>
      </>
    );
  } else if (step) {
    prompt = (
      <>
        {step.prompt}
        {step.detail && <small>{step.detail}</small>}
      </>
    );
    controls = (
      <>
        {step.params?.map((p) => (
          <Stepper
            key={p.id}
            label={p.label}
            value={p.value}
            min={p.min}
            max={p.max}
            color={p.color}
            onChange={(v) => t.setParam(p.id, v)}
          />
        ))}
        {step.choices?.map((c) => (
          <button
            key={c.value}
            className={`btn ${c.tone ?? "primary"} ${step.multi && t.picked.has(c.value) ? "on" : ""}`}
            onClick={() => t.choose(c.value)}
            disabled={!!c.disabled}
          >
            <span className="btn-main">
              {step.tokens ? (
                <ResourceIcon
                  type={
                    step.tokens.find((x) => x.value === c.value)?.resource ?? ""
                  }
                  size={20}
                />
              ) : null}
              {c.label}
            </span>
            {c.disabled ? (
              <small>{c.disabled}</small>
            ) : (
              c.detail && <small>{c.detail}</small>
            )}
          </button>
        ))}
        {step.multi && (
          <button
            className="btn primary"
            disabled={
              t.picked.size < step.multi.min || t.picked.size > step.multi.max
            }
            onClick={t.confirm}
          >
            {step.multi.confirm}
            <small>
              {t.picked.size}/
              {step.multi.min === step.multi.max
                ? step.multi.max
                : `${step.multi.min}–${step.multi.max}`}{" "}
              chosen
            </small>
          </button>
        )}
        {step.confirm && (
          <button className="btn primary" onClick={t.confirm}>
            {step.confirm}
          </button>
        )}
        {step.targets &&
          !step.targets.length &&
          !step.choices?.length &&
          !step.params?.length && (
            <span className="muted">Nothing to choose here.</span>
          )}
      </>
    );
  } else if (root) {
    prompt = (
      <Tip
        content={
          g.prelude
            ? "Click anything glowing on the map, the Court or a board, or pick an action. Prelude: before your first action you may spend glowing resources or use guild cards."
            : "Click anything glowing on the map, the Court or a board, or pick an action."
        }
      >
        <span>
          {g.pips === 0
            ? "Rearrange your resources, then click Done"
            : "Your move"}
          {g.prelude ? <small className="inline">prelude open</small> : null}
          {g.pips > 0 && t.me && g.rearrange.includes(t.me) ? (
            <small className="inline">drag resources to rearrange</small>
          ) : null}
        </span>
      </Tip>
    );
    controls = sit.verbs.map((v) => (
      <Tip
        key={v.verb}
        content={
          v.available
            ? v.flow.hint
            : (VERB_BLOCKED[v.verb] ??
              `${VERB_INFO[v.verb]?.name} is not possible right now`)
        }
      >
        <button
          className="btn verb"
          disabled={!v.available}
          onClick={() => t.start(v.flow)}
        >
          {v.flow.label}
        </button>
      </Tip>
    ));
  }

  return (
    <motion.div
      className="action-tray"
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      style={{ ["--ac" as string]: playerColor(g, sit.actor) }}
      aria-label="Your choices"
    >
      <motion.div
        key={`${t.version}-${step?.id ?? ""}-${step?.prompt ?? ""}-${t.menu ? "menu" : ""}-${asking ? "ask" : ""}`}
        className="tray-body"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
      >
        {prompt && <div className="tray-prompt">{prompt}</div>}
        <div className="tray-controls">
          {controls}
          {!asking &&
            sit.globals.map((gl) => (
              <button
                key={gl.id}
                className={`btn ${gl.tone} global`}
                onClick={() => runGlobal(gl)}
                disabled={t.busy}
              >
                {gl.label}
              </button>
            ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
