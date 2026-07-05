import type {
  CanonicalState,
  AnyCommandDiscoveryResult,
  Command,
  Discovery,
  ExecutionResult,
  GameEvent,
  Viewer,
} from "@tableverse-kit/engine";
import type { Clock } from "../../lib/clock";
import type { RoomSnapshot } from "../room";
import type { GameEndedPayload } from "../websocket";

/** A player mapped into an active game session. */
export interface GameSessionPlayerSnapshot {
  playerSessionId: string;
  playerId: string;
  seatIndex: number;
  displayName: string;
  disconnectedAt: Date | null;
}

/** Point-in-time view of a game session: canonical state, version, and players. */
export interface GameSessionSnapshot<
  TState extends CanonicalState<object> = CanonicalState<object>,
> {
  id: string;
  canonicalState: TState;
  stateVersion: number;
  players: GameSessionPlayerSnapshot[];
}

export interface CreateGameSessionInput<
  TState extends CanonicalState<object> = CanonicalState<object>,
> {
  canonicalState: TState;
  players: Array<Omit<GameSessionPlayerSnapshot, "disconnectedAt">>;
}

/**
 * Persistence layer for active game sessions.
 * Handles creation from a room, command persistence, and cleanup.
 */
export interface GameSessionStore<
  TState extends CanonicalState<object> = CanonicalState<object>,
> {
  /** Load the room snapshot needed to initialize a game (players + host check). */
  loadRoomForGameStart(roomId: string): Promise<RoomSnapshot | null>;
  /** Persist a new game session with its initial state and player mappings. */
  createGameSession(
    input: CreateGameSessionInput<TState>,
  ): Promise<GameSessionSnapshot<TState>>;
  /** Load a game session by id. Returns null if not found. */
  loadGameSession(
    gameSessionId: string,
  ): Promise<GameSessionSnapshot<TState> | null>;
  /** Persist the new canonical state and bumped version after an accepted command. */
  persistAcceptedCommandResult(input: {
    gameSessionId: string;
    canonicalState: TState;
    stateVersion: number;
  }): Promise<GameSessionSnapshot<TState>>;
  /** Delete the originating room after a game session is created. */
  deleteRoom(roomId: string): Promise<void>;
  /** Delete a game session (e.g. after invalidation). */
  deleteGameSession(gameSessionId: string): Promise<void>;
  /** Record a player disconnect timestamp. Returns null if session not found. */
  markPlayerDisconnected(input: {
    gameSessionId: string;
    playerSessionId: string;
    disconnectedAt: Date;
  }): Promise<GameSessionSnapshot<TState> | null>;
  /** Clear a player disconnect timestamp. Returns null if session not found. */
  clearPlayerDisconnected(input: {
    gameSessionId: string;
    playerSessionId: string;
  }): Promise<GameSessionSnapshot<TState> | null>;
  /** Find disconnected game players whose grace window has expired. */
  loadExpiredDisconnectedGamePlayers(input: {
    olderThan: Date;
  }): Promise<Array<{ gameSessionId: string; playerSessionId: string }>>;
}

/**
 * Adapter around the @tableverse-kit/engine executor.
 * Provides game creation, command execution, and per-player view generation.
 */
export interface HostedGameExecutor<TState extends CanonicalState<object>> {
  /** Create the initial canonical state for a new game. */
  createInitialState(
    input: { playerIds: string[] },
    rngSeed: string | number,
  ): TState;
  /** Execute a player command against the current state. */
  executeCommand(state: TState, command: Command): ExecutionResult<TState>;
  /** Return the currently available command types for a player. */
  listAvailableCommands(state: TState, options: { actorId: string }): string[];
  /** Resolve the next discovery step for a player command flow. */
  discoverCommand(
    state: TState,
    discovery: Discovery,
  ): AnyCommandDiscoveryResult | null;
  /** Generate a player-specific view of the game state (hides opponent hands, etc.). */
  getView(state: TState, viewer: Viewer): unknown;
}

export interface CreateGameSessionServiceDeps<
  TState extends CanonicalState<object>,
> {
  store: GameSessionStore<TState>;
  gameExecutor: HostedGameExecutor<TState>;
  rngSeedGenerator: () => string | number;
  clock: Clock;
}

export interface CreateGameSessionFromRoomInput {
  roomId: string;
  requestingPlayerSessionId: string;
}

export interface GameStartedResult<
  TState extends CanonicalState<object> = CanonicalState<object>,
> {
  gameSessionId: string;
  canonicalState: TState;
  stateVersion: number;
  players: GameSessionPlayerSnapshot[];
  playerViews: GamePlayerView[];
}

export interface SubmitGameCommandInput {
  gameSessionId: string;
  playerSessionId: string;
  command: unknown;
}

export interface DiscoverGameCommandInput {
  gameSessionId: string;
  playerSessionId: string;
  discovery: unknown;
}

/** A player's filtered view of the game state. */
export interface GamePlayerView {
  playerSessionId: string;
  playerId: string;
  view: unknown;
  availableCommands: string[];
}

/** Player-specific game snapshot sent when a client reconnects or subscribes. */
export interface GamePlayerSnapshot extends GamePlayerView {
  gameSessionId: string;
  stateVersion: number;
}

export type GameCommandResult =
  | {
      accepted: true;
      stateVersion: number;
      events: GameEvent[];
      playerViews: GamePlayerView[];
    }
  | {
      accepted: false;
      stateVersion: number;
      reason: string;
      metadata?: unknown;
      events: GameEvent[];
    };

export type GameDiscoveryResult = AnyCommandDiscoveryResult | null;

export interface MarkDisconnectedInput {
  gameSessionId: string;
  playerSessionId: string;
}

export interface GameEndedResult {
  gameSessionId: string;
  result: GameEndedPayload;
}

/**
 * Application-level game session service.
 * Manages creating game sessions from rooms, processing player commands, and handling disconnects.
 */
export interface GameSessionService {
  /** Initialize a new game session from a room's player roster and transition the room to "starting". */
  createGameSessionFromRoom(
    input: CreateGameSessionFromRoomInput,
  ): Promise<GameStartedResult>;
  /** Validate and execute a player's command against the current game state. */
  submitCommand(input: SubmitGameCommandInput): Promise<GameCommandResult>;
  /** Resolve the next discovery step for a player's command flow. */
  discoverCommand(
    input: DiscoverGameCommandInput,
  ): Promise<GameDiscoveryResult>;
  /** Record a player disconnect without invalidating during the grace window. */
  markDisconnected(
    input: MarkDisconnectedInput,
  ): Promise<GameSessionSnapshot | null>;
  /** Clear a disconnect marker and return the latest player-specific snapshot. */
  markReconnected(
    input: MarkDisconnectedInput,
  ): Promise<GamePlayerSnapshot | null>;
  /** Return the latest player-specific snapshot for reconnect subscription recovery. */
  getPlayerSnapshot(input: MarkDisconnectedInput): Promise<GamePlayerSnapshot>;
  /** Invalidate games whose disconnected player grace window has expired. */
  cleanupExpiredDisconnects(input: {
    olderThan: Date;
  }): Promise<GameEndedResult[]>;
}
