import { AMBITIONS } from "arcs-engine/data";
import type { GameState } from "arcs-engine/state";
import type { Game } from "../client.ts";
import { AMBITION_INFO, playerColor, playerName } from "../model/text.ts";
import { AmbitionIcon } from "./icons.tsx";
import { Tip } from "./Tip.tsx";

export function projectedPower(
  g: Game,
  base: GameState,
  ambition: string,
): Record<string, number> {
  const markers = g.markers.filter((m) => m.ambition === ambition);
  const out: Record<string, number> = {};
  const ranks = g.order.map((id) => ({ id, value: base.metric(id, ambition) }));
  if (g.order.length === 2)
    ranks.push({ id: "neutral", value: g.neutral[ambition] ?? 0 });
  for (const id of g.order) {
    const value = base.metric(id, ambition);
    if (!value || !markers.length) continue;
    const higher = ranks.filter((r) => r.value > value).length,
      tied = ranks.filter((r) => r.value === value).length;
    const cities = base.available(id, "city");
    if (higher === 0 && tied === 1)
      out[id] =
        markers.reduce((n, m) => n + m.first, 0) +
        (cities === 0 ? 5 : cities === 1 ? 2 : 0);
    else if (higher === 0 || (higher === 1 && tied === 1))
      out[id] = markers.reduce((n, m) => n + m.second, 0);
  }
  return out;
}

function Marker({
  first,
  second,
  flipped,
}: {
  first: number;
  second: number;
  flipped: boolean;
}) {
  return (
    <span
      className={`marker ${flipped ? "flipped" : ""}`}
      title={`${first} Power for first, ${second} for second`}
    >
      <b>{first}</b>
      <small>{second}</small>
    </span>
  );
}

export function Ambitions({
  g,
  base,
  me,
}: {
  g: Game;
  base: GameState;
  me: string | null;
}) {
  const goal = 39 - 3 * g.order.length;
  const available = g.markers
    .filter((m) => !m.ambition)
    .sort((a, b) => b.first - a.first);
  return (
    <section className="ambitions" aria-label="Ambitions and Power">
      <div className="tracks">
        <Tip
          content={`Chapter ${g.chapter} of 5. The game ends after chapter 5, or when someone reaches ${goal} Power.`}
        >
          <div
            className="chapter-track"
            aria-label={`Chapter ${g.chapter} of 5`}
          >
            {[1, 2, 3, 4, 5].map((c) => (
              <span
                key={c}
                className={
                  c === g.chapter ? "now" : c < g.chapter ? "past" : ""
                }
              >
                {c}
              </span>
            ))}
          </div>
        </Tip>
        <span className="grow" />
        <Tip
          content={
            available.length
              ? `The next declared ambition takes the ${available[0]?.first}/${available[0]?.second} marker: first place earns ${available[0]?.first} Power, second ${available[0]?.second}.`
              : "All ambition markers are declared this chapter."
          }
        >
          <span className="available">
            {available.map((m, i) => (
              <Marker key={i} {...m} />
            ))}
            {!available.length && <span className="muted">all declared</span>}
          </span>
        </Tip>
      </div>
      <div className="power-track" aria-label="Power">
        <div className="power-rail">
          {g.players.map((p, i) => (
            <Tip
              key={p.id}
              content={`${playerName(g, p.id)}: ${p.power} Power`}
            >
              <span
                className="power-pip"
                style={{
                  left: `${Math.min(100, (p.power / goal) * 100)}%`,
                  background: playerColor(g, p.id),
                  top: 2 + i * 4,
                }}
              />
            </Tip>
          ))}
          <span className="goal">{goal}</span>
        </div>
      </div>
      <ul className="ambition-list">
        {AMBITIONS.map((a) => {
          const markers = g.markers.filter((m) => m.ambition === a);
          const values = g.order
            .map((id) => ({ id, v: base.metric(id, a) }))
            .sort((x, y) => y.v - x.v);
          const proj = projectedPower(g, base, a);
          const neutral = g.order.length === 2 ? (g.neutral[a] ?? 0) : 0;
          return (
            <li key={a} className={markers.length ? "declared" : ""}>
              <Tip
                content={
                  <div>
                    <b>{AMBITION_INFO[a]?.name}</b>
                    <p>
                      Most {AMBITION_INFO[a]?.counts} at chapter end.{" "}
                      {markers.length
                        ? `Declared: first place earns ${markers.reduce((n, m) => n + m.first, 0)} Power, second ${markers.reduce((n, m) => n + m.second, 0)}.`
                        : "Not declared this chapter, so it scores nothing yet."}
                    </p>
                  </div>
                }
              >
                <span className="amb-name">
                  <AmbitionIcon type={a} size={22} />
                  {AMBITION_INFO[a]?.name}
                </span>
              </Tip>
              <span className="standings">
                {values.map(({ id, v }) => (
                  <Tip
                    key={id}
                    content={`${playerName(g, id)}: ${v} ${AMBITION_INFO[a]?.counts}${proj[id] ? ` → +${proj[id]} Power if scored now` : ""}`}
                  >
                    <span className={`standing ${id === me ? "me" : ""}`}>
                      <span
                        className="pill"
                        style={{ background: playerColor(g, id) }}
                      >
                        {v}
                      </span>
                      {proj[id] ? <b className="proj">+{proj[id]}</b> : null}
                    </span>
                  </Tip>
                ))}
                {neutral > 0 && (
                  <Tip content="Neutral (2-player): these resources count as a third player.">
                    <span className="standing neutral">
                      <span className="pill">{neutral}</span>
                    </span>
                  </Tip>
                )}
              </span>
              <span className="amb-markers">
                {markers.map((m, i) => (
                  <Marker key={i} {...m} />
                ))}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
