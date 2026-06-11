import {
  createSplendorExecutor,
  type SplendorExecutor,
  type SplendorState,
} from "splendor-example";
import type {
  SessionActivity,
  SplendorTerminalCommand,
  SplendorTerminalDiscoveryRequest,
  SplendorTerminalDiscoveryResult,
} from "./types.ts";

export const DEFAULT_PLAYER_IDS = ["you", "bot-1", "bot-2", "bot-3"] as const;

export class SplendorTerminalSession {
  private state: SplendorState;
  private activity: SessionActivity = {
    command: null,
    events: [],
    summary: null,
    error: null,
  };

  constructor(
    private readonly gameExecutor: SplendorExecutor,
    initialState: SplendorState,
    private readonly viewerId: string,
  ) {
    this.state = initialState;
  }

  getVisibleState() {
    return this.gameExecutor.getView(this.state, {
      kind: "player",
      playerId: this.viewerId,
    });
  }

  getActivity() {
    return this.activity;
  }

  getActivePlayerId() {
    const currentStage = this.getVisibleState().progression.currentStage;

    if (currentStage.kind !== "activePlayer") {
      return null;
    }

    return currentStage.activePlayerId;
  }

  isFinished() {
    return this.getVisibleState().game.winnerIds !== undefined;
  }

  getWinnerIds() {
    return this.getVisibleState().game.winnerIds;
  }

  listAvailableCommands(actorId: string) {
    return this.gameExecutor.listAvailableCommands(this.state, { actorId });
  }

  discoverCommand(discovery: SplendorTerminalDiscoveryRequest) {
    return this.gameExecutor.discoverCommand(
      this.state,
      discovery,
    ) as SplendorTerminalDiscoveryResult | null;
  }

  executeCommand(
    command: SplendorTerminalCommand,
    summary: string | null = null,
  ) {
    const result = this.gameExecutor.executeCommand(this.state, command);

    if (result.ok) {
      this.state = result.state;
      this.activity = {
        command,
        events: result.events,
        summary,
        error: null,
      };

      return result;
    }

    this.activity = {
      command: null,
      events: [],
      summary: null,
      error: result.reason,
    };
    return result;
  }
}

export function createLocalSplendorSession(options?: {
  seed?: string | number;
}) {
  const gameExecutor = createSplendorExecutor();
  const initialState = gameExecutor.createInitialState(
    {
      playerIds: [...DEFAULT_PLAYER_IDS],
    },
    options?.seed ?? "splendor-terminal-seed",
  );

  return new SplendorTerminalSession(gameExecutor, initialState, "you");
}
