import { useState } from "react";
import { motion } from "motion/react";
import { Crown, Hand as HandIcon } from "lucide-react";
import { RAID_COSTS } from "arcs-engine/data";
import type { GameState } from "arcs-engine/state";
import type { Game, PlayerView } from "../client.ts";
import { key, type Target } from "../model/flow.ts";
import { handCount } from "../model/hydrate.ts";
import {
  RESOURCE_INFO,
  courtName,
  playerColor,
  playerName,
} from "../model/text.ts";
import { CardImage, courtArt } from "./Card.tsx";
import { PieceIcon } from "./glyphs.tsx";
import { ResourceIcon } from "./icons.tsx";
import { Tip } from "./Tip.tsx";

const COUNTS_TOWARD: Record<string, string> = {
  material: "Tycoon",
  fuel: "Tycoon",
  relic: "Keeper",
  psionic: "Empath",
};

interface Props {
  g: Game;
  base: GameState;
  p: PlayerView;
  me: boolean;
  actor: string;
  targets: Map<string, Target>;
  picked: Set<string>;
  onPick(key: string): void;
  variant: "full" | "compact";
  onArrange?: (values: string[]) => void;
}

function ResourceTip({
  r,
  slot,
  covered,
  outraged,
  owner,
  target,
}: {
  r: string;
  slot: number;
  covered: boolean;
  outraged: boolean;
  owner: string;
  target?: Target;
}) {
  if (covered)
    return (
      <div>
        <b>Covered slot</b>
        <p>A city sits here. Build cities to open more resource slots.</p>
      </div>
    );
  const info = RESOURCE_INFO[r];
  return (
    <div>
      <b>
        {r ? (
          <>
            <ResourceIcon type={r} size={16} /> {info?.name}
          </>
        ) : (
          "Empty slot"
        )}
      </b>
      {r && (
        <p>
          <span className="tip-label">Prelude:</span> spend it to{" "}
          {info?.spend.replace(/^./, (c) => c.toLowerCase())}.
          {outraged && (
            <span className="tip-warn">
              {" "}
              {owner} is Outraged by {info?.name} and cannot spend it.
            </span>
          )}
        </p>
      )}
      {r && (
        <p>
          <span className="tip-label">Ambition:</span>{" "}
          {COUNTS_TOWARD[r]
            ? `counts toward ${COUNTS_TOWARD[r]}.`
            : "counts toward no ambition."}
        </p>
      )}
      <p>
        <span className="tip-label">Raid cost:</span> {RAID_COSTS[slot]} key
        {RAID_COSTS[slot] === 1 ? "" : "s"} for an attacker to steal what sits
        here.
      </p>
      {target && (
        <p className="tip-action">
          Click: {target.label}
          {target.detail ? ` — ${target.detail}` : ""}
        </p>
      )}
    </div>
  );
}

function Slots({
  g,
  base,
  p,
  targets,
  picked,
  onPick,
  onArrange,
}: Omit<Props, "me" | "actor" | "variant">) {
  const cap = base.capacity(p.id);
  const [dragging, setDragging] = useState(-1);
  const [over, setOver] = useState(-1);
  const drop = (to: number) => {
    const from = dragging;
    setDragging(-1);
    setOver(-1);
    if (!onArrange || from < 0 || from === to || to >= cap) return;
    const values = [...p.resources];
    [values[from], values[to]] = [values[to] ?? "", values[from] ?? ""];
    onArrange(values);
  };
  return (
    <div
      className={`slots ${onArrange ? "arranging" : ""}`}
      aria-label={`${playerName(g, p.id)} resources`}
    >
      {p.resources.map((r, slot) => {
        const k = key.resource(p.id, slot);
        const t = targets.get(k);
        const covered = slot >= cap;
        const outraged = !!r && p.outrage.includes(r);
        return (
          <Tip
            key={slot}
            content={
              <ResourceTip
                r={r}
                slot={slot}
                covered={covered}
                outraged={outraged}
                owner={playerName(g, p.id)}
                target={t}
              />
            }
          >
            <button
              className={`slot-token ${covered ? "covered" : ""} ${t ? "target" : ""} ${picked.has(k) ? "picked" : ""} ${over === slot && !covered ? "drop-over" : ""} ${dragging === slot ? "dragging" : ""}`}
              onClick={() => t && onPick(k)}
              draggable={!!onArrange && !!r}
              onDragStart={(e) => {
                if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
                setDragging(slot);
              }}
              onDragEnd={() => {
                setDragging(-1);
                setOver(-1);
              }}
              onDragOver={(e) => {
                if (!onArrange || dragging < 0 || covered) return;
                e.preventDefault();
                setOver(slot);
              }}
              onDragLeave={() => setOver((o) => (o === slot ? -1 : o))}
              onDrop={(e) => {
                e.preventDefault();
                drop(slot);
              }}
              aria-disabled={!t}
              aria-label={
                t
                  ? t.label
                  : r
                    ? RESOURCE_INFO[r]?.name
                    : covered
                      ? "Covered slot"
                      : "Empty slot"
              }
            >
              {r ? (
                <motion.span
                  key={r}
                  initial={{ scale: 0.2, y: -20 }}
                  animate={{ scale: 1, y: 0 }}
                  className={`slot-resource ${outraged ? "outraged" : ""}`}
                >
                  <ResourceIcon type={r} size={26} />
                </motion.span>
              ) : covered ? (
                <PieceIcon kind="city" color="#4a4a56" size={20} />
              ) : null}
              <span className="raid-cost">{RAID_COSTS[slot]}</span>
            </button>
          </Tip>
        );
      })}
    </div>
  );
}

function Tally({ g, ids, kind }: { g: Game; ids: string[]; kind: string }) {
  const counts = g.order
    .map((o) => ({ o, n: ids.filter((x) => x === o).length }))
    .filter((x) => x.n);
  if (!counts.length) return <span className="muted">none</span>;
  return (
    <>
      {counts.map(({ o, n }) => (
        <span key={o} className="tally-item">
          <PieceIcon kind={kind} color={playerColor(g, o)} size={20} />
          {n > 1 ? `×${n}` : ""}
        </span>
      ))}
    </>
  );
}

export function PlayerBoard({
  g,
  base,
  p,
  me,
  actor,
  targets,
  picked,
  onPick,
  variant,
  onArrange,
}: Props) {
  const color = playerColor(g, p.id);
  const name = playerName(g, p.id);
  const cities = base.available(p.id, "city");
  const bonus = cities === 0 ? 5 : cities === 1 ? 2 : 0;
  const pk = key.player(p.id);
  const pt = targets.get(pk);
  const isActor = actor === p.id;
  const winner = me ? "you win" : `${name} wins`;
  const supply: [string, number, string][] = [
    [
      "city",
      cities,
      `Cities left to build: ${cities}. Building cities opens resource slots, and the last two add bonus Power when ${winner} an ambition outright.`,
    ],
    [
      "starport",
      base.available(p.id, "starport"),
      "Starports left to build. Ships are built at starports, and fleets leaving one may Catapult.",
    ],
    ["ship", base.available(p.id, "ship"), "Ships in supply, ready to build."],
    [
      "agent",
      base.available(p.id, "agent"),
      "Agents in supply, used to Influence the Court.",
    ],
  ];
  const trophyOwners = g.order.filter((o) =>
    p.trophies.some((t) => t.owner === o),
  );
  return (
    <section
      className={`board ${variant} ${isActor ? "acting" : ""} ${pt ? "target" : ""}`}
      style={{ ["--pc" as string]: color }}
      aria-label={`${name} player board`}
      onClick={pt ? () => onPick(pk) : undefined}
    >
      <header>
        <span className="swatch" />
        <strong>{name}</strong>
        {me && <span className="you">you</span>}
        {g.initiative === p.id && (
          <Tip
            content={
              g.seized
                ? "Holds the initiative, seized this round."
                : "Holds the initiative: leads the round and may declare an ambition."
            }
          >
            <span className="initiative">
              <Crown size={18} />
            </span>
          </Tip>
        )}
        {isActor && !me && <span className="acting-tag">acting</span>}
        <span className="grow" />
        <Tip
          content={`${handCount(p)} action card${handCount(p) === 1 ? "" : "s"} in hand`}
        >
          <span className="hand-count">
            <HandIcon size={17} /> {handCount(p)}
          </span>
        </Tip>
        <Tip
          content={`${p.power} Power. The game ends at ${39 - 3 * g.order.length} Power, or after chapter 5.`}
        >
          <motion.span
            key={p.power}
            className="power"
            initial={{ scale: 1.8 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 12 }}
          >
            {p.power}
          </motion.span>
        </Tip>
      </header>
      {onArrange && (
        <div className="arrange-hint">
          Drag resources between slots: the number on each slot is how many keys
          a raider needs to steal it.
        </div>
      )}
      <Slots
        g={g}
        base={base}
        p={p}
        targets={targets}
        picked={picked}
        onPick={onPick}
        onArrange={onArrange}
      />
      <div className="supply">
        {supply.map(([kind, n, tip]) => (
          <Tip key={kind} content={tip}>
            <span className="supply-item">
              <PieceIcon kind={kind} color={color} size={24} />
              {n}
            </span>
          </Tip>
        ))}
        {bonus > 0 && (
          <Tip
            content={`Winning an ambition outright earns +${bonus} bonus Power.`}
          >
            <span className="bonus">+{bonus} per win</span>
          </Tip>
        )}
      </div>
      {(me ||
        p.captives.length > 0 ||
        p.trophies.length > 0 ||
        p.outrage.length > 0) && (
        <div className="spoils">
          <Tip content="Captives: rival agents taken by taxing their cities or securing Court cards. They count toward Tyrant.">
            <span className="spoil">
              <small>Captives</small>
              <Tally g={g} ids={p.captives} kind="agent" />
            </span>
          </Tip>
          <Tip content="Trophies: rival pieces destroyed in battle. They count toward Warlord.">
            <span className="spoil">
              <small>Trophies</small>
              {trophyOwners.length ? (
                trophyOwners.map((o) => {
                  const mine = p.trophies.filter((t) => t.owner === o);
                  return (
                    <span key={o} className="tally-item">
                      <PieceIcon
                        kind={mine[0]?.kind ?? "ship"}
                        color={playerColor(g, o)}
                        size={20}
                      />
                      {mine.length > 1 ? `×${mine.length}` : ""}
                    </span>
                  );
                })
              ) : (
                <span className="muted">none</span>
              )}
            </span>
          </Tip>
          {p.outrage.length > 0 && (
            <Tip
              content={`Outraged: ${p.outrage.map((r) => RESOURCE_INFO[r]?.name).join(", ")}. Outraged resources cannot be spent.`}
            >
              <span className="spoil">
                <small>Outrage</small>
                {p.outrage.map((r) => (
                  <span key={r} className="outrage-chip">
                    <ResourceIcon type={r} size={16} />
                  </span>
                ))}
              </span>
            </Tip>
          )}
        </div>
      )}
      {p.guilds.length > 0 && (
        <div className="guilds">
          {p.guilds.map((c) => {
            const k = key.guild(p.id, c);
            const t = targets.get(k);
            return (
              <CardImage
                key={c}
                src={courtArt(c)}
                alt={courtName(c)}
                zoomWidth={420}
                className={`guild-card ${t ? "target" : ""} ${g.acquired.includes(c) && g.active === p.id ? "fresh" : ""}`}
                onClick={t ? () => onPick(k) : undefined}
                label={t ? t.label : courtName(c)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
