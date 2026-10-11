import { useEffect, useRef } from "react";
import type { Game } from "../client.ts";
import {
  RESOURCE_INFO,
  playerColor,
  playerName,
  systemName,
} from "../model/text.ts";
import { ResourceIcon } from "./icons.tsx";

const WORDS =
  /\b(tycoon|tyrant|warlord|keeper|empath|administration|aggression|construction|mobilization)\b/g;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function LogLine({
  g,
  text,
  onFocus,
}: {
  g: Game;
  text: string;
  onFocus(systems: string[]): void;
}) {
  const ids = [...g.order].sort((a, b) => b.length - a.length).map(escape);
  const pattern = new RegExp(
    `(${[...ids.map((id) => `\\b${id}\\b`), "\\b\\dg\\b", "\\b\\d\\.\\d\\b", ...Object.keys(RESOURCE_INFO).map((r) => `\\b${r}\\b`)].join("|")})`,
    "g",
  );
  const parts = text.split(pattern);
  const systems = parts.filter((x) => /^\d(g|\.\d)$/.test(x));
  return (
    <span
      className="log-line"
      onMouseEnter={() => onFocus(systems)}
      onMouseLeave={() => onFocus([])}
    >
      {parts.map((part, i) => {
        if (g.order.includes(part))
          return (
            <b key={i} className="who" style={{ color: playerColor(g, part) }}>
              {playerName(g, part)}
            </b>
          );
        if (/^\d(g|\.\d)$/.test(part))
          return (
            <span key={i} className="where">
              {systemName(g, part)}
            </span>
          );
        if (RESOURCE_INFO[part])
          return (
            <span key={i} className="what">
              <ResourceIcon type={part} size={13} />
              {RESOURCE_INFO[part]?.name}
            </span>
          );
        return (
          <span key={i}>
            {part.replace(WORDS, (w) => w.charAt(0).toUpperCase() + w.slice(1))}
          </span>
        );
      })}
    </span>
  );
}

export function LogPanel({
  g,
  onFocus,
}: {
  g: Game;
  onFocus(systems: string[]): void;
}) {
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [g.log.length]);
  return (
    <ol className="log-panel" aria-label="Game log">
      {g.log.map((line, i) => (
        <li key={i}>
          <LogLine g={g} text={line} onFocus={onFocus} />
        </li>
      ))}
      <li ref={end} aria-hidden />
    </ol>
  );
}
