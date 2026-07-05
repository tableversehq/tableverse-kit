import type {
  CanonicalState,
  Command,
  Discovery,
} from "@tableverse-kit/engine";
import { timestampBefore } from "../../lib/time";
import { GameSessionError } from "./errors";
import type {
  CreateGameSessionServiceDeps,
  GameCommandResult,
  GamePlayerSnapshot,
  GamePlayerView,
  GameSessionPlayerSnapshot,
  GameSessionSnapshot,
  GameSessionService,
  GameStartedResult,
} from "./model";

function createPlayerId(index: number) {
  return `player-${index + 1}`;
}

function toEngineCommand(command: unknown, actorId: string): Command {
  if (typeof command !== "object" || command === null) {
    throw GameSessionError.invalidGameCommand("Command must be an object");
  }

  const type = "type" in command ? command.type : undefined;
  const input = "input" in command ? command.input : {};
  if (typeof type !== "string" || type.length === 0) {
    throw GameSessionError.invalidGameCommand("Command type is required");
  }
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw GameSessionError.invalidGameCommand(
      "Command input must be an object",
    );
  }

  return {
    type,
    actorId,
    input: input as Record<string, unknown>,
  };
}

function toEngineDiscovery(discovery: unknown, actorId: string): Discovery {
  if (typeof discovery !== "object" || discovery === null) {
    throw GameSessionError.invalidGameDiscovery("Discovery must be an object");
  }

  const type = "type" in discovery ? discovery.type : undefined;
  const step = "step" in discovery ? discovery.step : undefined;
  const input = "input" in discovery ? discovery.input : {};

  if (typeof type !== "string" || type.length === 0) {
    throw GameSessionError.invalidGameDiscovery("Discovery type is required");
  }

  if (typeof step !== "string" || step.length === 0) {
    throw GameSessionError.invalidGameDiscovery("Discovery step is required");
  }

  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw GameSessionError.invalidGameDiscovery(
      "Discovery input must be an object",
    );
  }

  return {
    type,
    actorId,
    step,
    input: input as Record<string, unknown>,
  };
}

export function createGameSessionService<
  TState extends CanonicalState<object>,
>({
  store,
  gameExecutor,
  rngSeedGenerator,
  clock,
}: CreateGameSessionServiceDeps<TState>): GameSessionService {
  function createPlayerViews(
    state: TState,
    players: GameSessionPlayerSnapshot[],
  ): GamePlayerView[] {
    return players.map((player) => ({
      playerSessionId: player.playerSessionId,
      playerId: player.playerId,
      view: gameExecutor.getView(state, {
        kind: "player",
        playerId: player.playerId,
      }),
      availableCommands: gameExecutor.listAvailableCommands(state, {
        actorId: player.playerId,
      }),
    }));
  }

  function findPlayer(
    gameSession: GameSessionSnapshot<TState>,
    playerSessionId: string,
  ) {
    return gameSession.players.find(
      (candidate) => candidate.playerSessionId === playerSessionId,
    );
  }

  function createPlayerSnapshot(
    gameSession: GameSessionSnapshot<TState>,
    player: GameSessionPlayerSnapshot,
  ): GamePlayerSnapshot {
    return {
      gameSessionId: gameSession.id,
      stateVersion: gameSession.stateVersion,
      playerSessionId: player.playerSessionId,
      playerId: player.playerId,
      view: gameExecutor.getView(gameSession.canonicalState, {
        kind: "player",
        playerId: player.playerId,
      }),
      availableCommands: gameExecutor.listAvailableCommands(
        gameSession.canonicalState,
        {
          actorId: player.playerId,
        },
      ),
    };
  }

  async function loadPlayerSnapshot({
    gameSessionId,
    playerSessionId,
  }: {
    gameSessionId: string;
    playerSessionId: string;
  }): Promise<GamePlayerSnapshot> {
    const gameSession = await store.loadGameSession(gameSessionId);
    if (!gameSession) {
      throw GameSessionError.gameNotFound();
    }

    const player = findPlayer(gameSession, playerSessionId);
    if (!player) {
      throw GameSessionError.gamePlayerNotFound();
    }

    return createPlayerSnapshot(gameSession, player);
  }

  return {
    async createGameSessionFromRoom({
      roomId,
      requestingPlayerSessionId,
    }): Promise<GameStartedResult<TState>> {
      const room = await store.loadRoomForGameStart(roomId);
      if (!room) {
        throw GameSessionError.roomNotFound();
      }
      if (room.hostPlayerSessionId !== requestingPlayerSessionId) {
        throw GameSessionError.roomHostRequired();
      }

      const players = [...room.players]
        .sort((left, right) => left.seatIndex - right.seatIndex)
        .map((player, index) => ({
          playerSessionId: player.playerSessionId,
          playerId: createPlayerId(index),
          seatIndex: player.seatIndex,
          displayName: player.displayName,
        }));
      const canonicalState = gameExecutor.createInitialState(
        { playerIds: players.map((player) => player.playerId) },
        rngSeedGenerator(),
      );
      const gameSession = await store.createGameSession({
        canonicalState,
        players,
      });

      await store.deleteRoom(roomId);

      return {
        gameSessionId: gameSession.id,
        canonicalState: gameSession.canonicalState,
        stateVersion: gameSession.stateVersion,
        players: gameSession.players,
        playerViews: createPlayerViews(
          gameSession.canonicalState,
          gameSession.players,
        ),
      };
    },

    async submitCommand({
      gameSessionId,
      playerSessionId,
      command,
    }): Promise<GameCommandResult> {
      const gameSession = await store.loadGameSession(gameSessionId);
      if (!gameSession) {
        throw GameSessionError.gameNotFound();
      }

      const player = gameSession.players.find(
        (candidate) => candidate.playerSessionId === playerSessionId,
      );
      if (!player) {
        throw GameSessionError.gamePlayerNotFound();
      }

      const result = gameExecutor.executeCommand(
        gameSession.canonicalState,
        toEngineCommand(command, player.playerId),
      );
      if (result.ok === false) {
        return {
          accepted: false,
          stateVersion: gameSession.stateVersion,
          reason: result.reason,
          metadata: result.metadata,
          events: result.events,
        };
      }

      const persisted = await store.persistAcceptedCommandResult({
        gameSessionId,
        canonicalState: result.state,
        stateVersion: gameSession.stateVersion + 1,
      });

      return {
        accepted: true,
        stateVersion: persisted.stateVersion,
        events: result.events,
        playerViews: createPlayerViews(
          persisted.canonicalState,
          persisted.players,
        ),
      };
    },

    async discoverCommand({ gameSessionId, playerSessionId, discovery }) {
      const gameSession = await store.loadGameSession(gameSessionId);
      if (!gameSession) {
        throw GameSessionError.gameNotFound();
      }

      const player = gameSession.players.find(
        (candidate) => candidate.playerSessionId === playerSessionId,
      );
      if (!player) {
        throw GameSessionError.gamePlayerNotFound();
      }

      return gameExecutor.discoverCommand(
        gameSession.canonicalState,
        toEngineDiscovery(discovery, player.playerId),
      );
    },

    async markDisconnected({
      gameSessionId,
      playerSessionId,
    }): Promise<GameSessionSnapshot<TState> | null> {
      return store.markPlayerDisconnected({
        gameSessionId,
        playerSessionId,
        disconnectedAt: clock.now(),
      });
    },

    async markReconnected({ gameSessionId, playerSessionId }) {
      const gameSession = await store.clearPlayerDisconnected({
        gameSessionId,
        playerSessionId,
      });
      if (!gameSession) {
        return null;
      }

      const player = findPlayer(gameSession, playerSessionId);
      return player ? createPlayerSnapshot(gameSession, player) : null;
    },

    async getPlayerSnapshot(input) {
      return loadPlayerSnapshot(input);
    },

    async cleanupExpiredDisconnects({ olderThan }) {
      const expiredPlayers = await store.loadExpiredDisconnectedGamePlayers({
        olderThan,
      });
      const endedGames = [];
      const processedGameIds = new Set<string>();

      for (const expiredPlayer of expiredPlayers) {
        if (processedGameIds.has(expiredPlayer.gameSessionId)) {
          continue;
        }

        const gameSession = await store.loadGameSession(
          expiredPlayer.gameSessionId,
        );
        if (!gameSession) {
          continue;
        }

        const player = findPlayer(gameSession, expiredPlayer.playerSessionId);
        if (!player || !timestampBefore(player.disconnectedAt, olderThan)) {
          continue;
        }

        await store.deleteGameSession(expiredPlayer.gameSessionId);
        processedGameIds.add(expiredPlayer.gameSessionId);
        endedGames.push({
          gameSessionId: expiredPlayer.gameSessionId,
          result: {
            reason: "invalidated" as const,
            message: "A seated player disconnected",
          },
        });
      }

      return endedGames;
    },
  };
}
