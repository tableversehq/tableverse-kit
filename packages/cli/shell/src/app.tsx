import { useEffect, useState } from "react";
import {
  discardMatch,
  fetchFrontendUrl,
  fetchGame,
  startMatch,
  type GameInfo,
  type MatchValues,
} from "./lib/api.ts";
import { GameScreen } from "./components/game-screen.tsx";
import { Brand } from "./components/logo-cube.tsx";
import { SetupScreen } from "./components/setup-screen.tsx";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert.tsx";
import { Spinner } from "./components/ui/spinner.tsx";

type Screen =
  | { kind: "loading" }
  | { kind: "unavailable"; message: string }
  | { kind: "setup"; game: GameInfo; frontendUrl: string }
  | {
      kind: "playing";
      game: GameInfo;
      frontendUrl: string;
      match: MatchValues;
    };

const serverUrl = window.location.origin;

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: "loading" });

  useEffect(() => {
    let current = true;
    Promise.all([fetchGame(serverUrl), fetchFrontendUrl(serverUrl)]).then(
      ([game, frontendUrl]) => {
        if (current) {
          setScreen({ kind: "setup", game, frontendUrl });
        }
      },
      (reason: unknown) => {
        if (current) {
          setScreen({
            kind: "unavailable",
            message: reason instanceof Error ? reason.message : String(reason),
          });
        }
      },
    );
    return () => {
      current = false;
    };
  }, []);

  switch (screen.kind) {
    case "loading":
      return (
        <main className="flex h-full items-center justify-center">
          <Spinner className="size-6 text-muted-foreground" />
        </main>
      );
    case "unavailable":
      return (
        <main className="flex min-h-full items-center justify-center px-4">
          <div className="grid w-full max-w-md gap-4">
            <Brand />
            <Alert variant="destructive">
              <AlertTitle>The shell could not reach tvk dev</AlertTitle>
              <AlertDescription>{screen.message}</AlertDescription>
            </Alert>
          </div>
        </main>
      );
    case "setup":
      return (
        <SetupScreen
          game={screen.game}
          onStart={async (match) => {
            await startMatch(serverUrl, match);
            setScreen({ ...screen, kind: "playing", match });
          }}
        />
      );
    case "playing":
      return (
        <GameScreen
          game={screen.game}
          frontendUrl={screen.frontendUrl}
          serverUrl={serverUrl}
          players={screen.match.players}
          onReset={() => startMatch(serverUrl, screen.match)}
          onExit={async () => {
            await discardMatch(serverUrl);
            setScreen({
              kind: "setup",
              game: screen.game,
              frontendUrl: screen.frontendUrl,
            });
          }}
        />
      );
  }
}
