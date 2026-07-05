import type { GameEvent, VisibleState } from "@tableverse-kit/engine";
import type {
  CommandRequest as SplendorGeneratedCommandRequest,
  DiscoveryRequest as SplendorGeneratedDiscoveryRequest,
  DiscoveryResult as SplendorGeneratedDiscoveryResult,
  SplendorGeneratedVisibleState,
} from "splendor-example";

export type SplendorVisibleGame = SplendorGeneratedVisibleState["game"];
export type SplendorVisibleState = VisibleState<SplendorVisibleGame>;
export type SplendorVisiblePlayer = SplendorVisibleGame["players"][string];
export type SplendorTerminalCommand = SplendorGeneratedCommandRequest;
export type SplendorTerminalDiscoveryRequest =
  SplendorGeneratedDiscoveryRequest;
export type SplendorTerminalDiscoveryResult = SplendorGeneratedDiscoveryResult;
export type SplendorTerminalDiscoveryOption = Extract<
  SplendorTerminalDiscoveryResult,
  { complete: false }
>["options"][number];
export type SplendorTerminalOpenDiscovery = Extract<
  SplendorTerminalDiscoveryResult,
  { complete: false }
>;

export interface SessionActivity {
  command: SplendorTerminalCommand | null;
  events: GameEvent[];
  summary: string | null;
  error: string | null;
}

export interface MenuOption<T> {
  label: string;
  value: T;
}
