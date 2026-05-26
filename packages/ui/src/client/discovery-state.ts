import type { DiscoveryStepOption } from "@tabletop-kit/engine";
import type { CommandPayload, TTKitClient, TTKitGame } from "./types.ts";

export type DiscoveryStatus =
  | "idle"
  | "discovering"
  | "ready_to_confirm"
  | "executing"
  | "error";

export type OpenResultOf<G extends TTKitGame> = Extract<
  G["discovery"]["result"],
  { complete: false }
>;

export type CompleteResultOf<G extends TTKitGame> = Extract<
  G["discovery"]["result"],
  { complete: true }
>;

/**
 * Per-G pick-option type. Intersected with the engine's
 * `DiscoveryStepOption` so consumers can rely on `id`/`output`/
 * `nextInput`/`nextStep` even when TS can't fully resolve the
 * `Extract<...>` in a generic context.
 */
export type PickOptionOf<G extends TTKitGame> = (OpenResultOf<G> extends {
  options: ReadonlyArray<infer O>;
}
  ? O
  : never) &
  DiscoveryStepOption;

export type CommandInputOf<G extends TTKitGame> = CompleteResultOf<G>["input"];

/**
 * `open` carries a `step: string` and a `ReadonlyArray<PickOptionOf<G>>`
 * of next options. We rebuild the shape via `Omit` rather than
 * intersecting so the `options` field is the per-G option type (not the
 * engine base) even in a generic-G context.
 */
export type OpenSnapshotResult<G extends TTKitGame> = Omit<
  OpenResultOf<G>,
  "options"
> & {
  step: string;
  options: Array<PickOptionOf<G>>;
};

export interface DiscoveryStateSnapshot<G extends TTKitGame> {
  /** Command type id being discovered (e.g. "take_three_gems"). Null when idle. */
  readonly activeCommandType: string | null;
  /**
   * Current open step — the engine's `{ complete: false, step, options }`
   * result waiting on the next pick. Null between flows, once the picked
   * input is assembled (pendingInput populated), or while executing.
   */
  readonly open: OpenSnapshotResult<G> | null;
  /** Options picked so far in this flow, in pick order. */
  readonly trail: ReadonlyArray<PickOptionOf<G>>;
  /**
   * Assembled command input ready to send to `execute()`. Populated when
   * discovery returns `{ complete: true }`; null before then.
   */
  readonly pendingInput: CommandInputOf<G> | null;
  readonly status: DiscoveryStatus;
  readonly error: string | null;
}

function createIdleSnapshot<G extends TTKitGame>(): DiscoveryStateSnapshot<G> {
  return {
    activeCommandType: null,
    open: null,
    trail: [],
    pendingInput: null,
    status: "idle",
    error: null,
  };
}

/**
 * Pure (non-React) discovery state machine.
 *
 * Owns the "active command + accumulated picks + pending input" flow that
 * useDiscovery exposes. Drives client.discover and client.execute, surfaces
 * results through a single `subscribe`-style observer interface so the
 * React hook can plug it into useSyncExternalStore.
 *
 * `G` must be passed explicitly — the factory binds it to the bundle's
 * game shape; tests use `<TTKitGame>` for the structural-default case.
 */
export class DiscoveryState<G extends TTKitGame> {
  private snapshot: DiscoveryStateSnapshot<G> = createIdleSnapshot<G>();
  private readonly listeners = new Set<() => void>();
  private flowId = 0;

  constructor(
    private readonly client: Pick<TTKitClient<G>, "discover" | "execute">,
  ) {}

  getSnapshot(): DiscoveryStateSnapshot<G> {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(payload: G["discovery"]["payload"]): void {
    const flow = ++this.flowId;
    this.setSnapshot({
      activeCommandType: payload.type,
      open: null,
      trail: [],
      pendingInput: null,
      status: "discovering",
      error: null,
    });
    void this.runDiscover(flow, payload);
  }

  pick(option: PickOptionOf<G>): void {
    const current = this.snapshot;
    if (
      current.status !== "discovering" ||
      current.activeCommandType === null
    ) {
      return;
    }
    const flow = ++this.flowId;
    this.setSnapshot({
      ...current,
      trail: [...current.trail, option],
      status: "discovering",
    });
    // The engine guarantees that picking an option from an open result
    // produces a valid next-step payload; TS can't see the constructed
    // shape extends G["discovery"]["payload"] in a generic context.
    void this.runDiscover(flow, {
      type: current.activeCommandType,
      step: option.nextStep,
      input: option.nextInput,
    });
  }

  confirm(): void {
    const current = this.snapshot;
    if (
      current.status !== "ready_to_confirm" ||
      current.activeCommandType === null ||
      current.pendingInput === null
    ) {
      return;
    }
    const flow = ++this.flowId;
    const command = {
      type: current.activeCommandType,
      input: current.pendingInput,
    };
    this.setSnapshot({ ...current, status: "executing" });
    void this.runExecute(flow, command);
  }

  cancel(): void {
    this.flowId++;
    this.setSnapshot(createIdleSnapshot<G>());
  }

  private async runDiscover(
    flow: number,
    payload: G["discovery"]["payload"],
  ): Promise<void> {
    try {
      const result = await this.client.discover(payload);
      if (this.flowId !== flow) return;

      if (result.complete) {
        this.setSnapshot({
          ...this.snapshot,
          open: null,
          pendingInput: result.input,
          status: "ready_to_confirm",
        });
      } else if (isOpenResult<G>(result)) {
        this.setSnapshot({
          ...this.snapshot,
          open: result,
          status: "discovering",
        });
      }
    } catch (error) {
      if (this.flowId !== flow) return;
      this.setSnapshot({
        ...this.snapshot,
        status: "error",
        error: errorMessage(error),
      });
    }
  }

  private async runExecute(
    flow: number,
    command: CommandPayload,
  ): Promise<void> {
    try {
      const result = await this.client.execute(command);
      if (this.flowId !== flow) return;

      if (result.accepted) {
        this.setSnapshot(createIdleSnapshot<G>());
      } else {
        this.setSnapshot({
          ...this.snapshot,
          status: "error",
          error: result.reason ?? "execution_rejected",
        });
      }
    } catch (error) {
      if (this.flowId !== flow) return;
      this.setSnapshot({
        ...this.snapshot,
        status: "error",
        error: errorMessage(error),
      });
    }
  }

  private setSnapshot(next: DiscoveryStateSnapshot<G>): void {
    this.snapshot = next;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

// Replaces TS's inline discriminated-union narrowing on result.complete,
// which fails to unify with OpenSnapshotResult<G> because of the
// conditional-on-generic-indexed-access inside it. The predicate just
// declares the narrowed type; the runtime check is the same.
function isOpenResult<G extends TTKitGame>(
  result: G["discovery"]["result"],
): result is OpenSnapshotResult<G> {
  return result.complete === false;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "unknown_error";
}
