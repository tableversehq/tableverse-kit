import { LogOutIcon, RotateCcwIcon } from "lucide-react";
import { useState } from "react";
import type { GameInfo } from "../lib/api.ts";
import { buildFrameUrl } from "../lib/frame-url.ts";
import { Brand } from "./logo-cube.tsx";
import { Button } from "./ui/button.tsx";

interface GameScreenProps {
  game: GameInfo;
  frontendUrl: string;
  serverUrl: string;
  players: string[];
  onReset: () => Promise<void>;
  onExit: () => Promise<void>;
}

export function GameScreen({
  game,
  frontendUrl,
  serverUrl,
  players,
  onReset,
  onExit,
}: GameScreenProps) {
  const [seat, setSeat] = useState(players[0] ?? "p1");
  const [dealt, setDealt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await action();
      after?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-soft bg-bg-raised px-4 py-2">
        <Brand />
        <span className="font-heading text-sm font-semibold">{game.name}</span>
        <div
          role="group"
          aria-label="Seat"
          className="flex flex-wrap items-center gap-1"
        >
          {players.map((player) => (
            <Button
              key={player}
              size="sm"
              variant={player === seat ? "default" : "outline"}
              aria-pressed={player === seat}
              onClick={() => setSeat(player)}
            >
              {player}
            </Button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {error ? (
            <span role="alert" className="text-sm text-destructive">
              {error}
            </span>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => run(onReset, () => setDealt((count) => count + 1))}
          >
            <RotateCcwIcon data-icon="inline-start" />
            Reset
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => run(onExit)}
          >
            <LogOutIcon data-icon="inline-start" />
            Exit game
          </Button>
        </div>
      </header>
      <iframe
        key={dealt}
        title={`${game.name} as ${seat}`}
        src={buildFrameUrl({ frontendUrl, serverUrl, viewer: seat })}
        className="min-h-0 w-full flex-1 border-0 bg-background"
      />
    </div>
  );
}
