import type { Game } from "../client.ts";
import { parseSystem } from "./geometry.ts";

type At = [number, number];

export type MapEffect =
  | {
      id: string;
      type: "flight";
      owner: string;
      from: At;
      to: At;
      count: number;
    }
  | { id: string; type: "spawn" | "destroy" | "hit"; owner: string; at: At };

let serial = 0;

export function diffMap(prev: Game | null, next: Game): MapEffect[] {
  if (!prev) return [];
  const out: MapEffect[] = [];
  const before = new Map(prev.pieces.map((p) => [p.id, p]));
  const after = new Map(next.pieces.map((p) => [p.id, p]));
  const flights = new Map<
    string,
    { owner: string; from: string; to: string; count: number }
  >();
  for (const p of next.pieces) {
    const old = before.get(p.id);
    if (!old) {
      out.push({
        id: `fx${++serial}`,
        type: "spawn",
        owner: p.owner,
        at: parseSystem(p.system),
      });
      continue;
    }
    if (old.system !== p.system) {
      const k = `${p.owner}|${old.system}|${p.system}`;
      const f = flights.get(k) ?? {
        owner: p.owner,
        from: old.system,
        to: p.system,
        count: 0,
      };
      f.count++;
      flights.set(k, f);
    } else if (!old.damaged && p.damaged) {
      out.push({
        id: `fx${++serial}`,
        type: "hit",
        owner: p.owner,
        at: parseSystem(p.system),
      });
    }
  }
  for (const p of prev.pieces)
    if (!after.has(p.id) && p.system)
      out.push({
        id: `fx${++serial}`,
        type: "destroy",
        owner: p.owner,
        at: parseSystem(p.system),
      });
  for (const f of flights.values())
    out.push({
      id: `fx${++serial}`,
      type: "flight",
      owner: f.owner,
      from: parseSystem(f.from),
      to: parseSystem(f.to),
      count: f.count,
    });
  const spawns = out.filter((e) => e.type === "spawn");
  return spawns.length > 12 ? out.filter((e) => e.type !== "spawn") : out;
}
