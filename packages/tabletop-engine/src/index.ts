export {
  GameDefinitionBuilder,
  GameDefinitionBuilderWithoutSetupInput,
  GameDefinitionBuilderWithSetupInput,
} from "./game-definition";
export { createCommandFactory } from "./command-factory";
export { createStageFactory } from "./stage-factory";
export { createGameExecutor } from "./runtime/game-executor";
export { assertSchemaValue } from "./runtime/validation";
export { t } from "./schema";
export {
  configureVisibility,
  field,
  GameState,
  getStateMetadata,
} from "./state-facade/metadata";
export {
  appendReplayStep,
  createReplayRecord,
  replayRecord,
} from "./replay/history";
export { createSnapshot, restoreSnapshot } from "./snapshot/snapshot";
export { runScenario } from "./testing/harness";

export type {
  GameDefinition,
  GameDefinitionWithSetupInput,
  GameDefinitionWithoutSetupInput,
  GameSetupContextWithInput,
  GameSetupContextWithoutInput,
} from "./game-definition";
export type { GameExecutor } from "./runtime/game-executor";
export type {
  ArraySchemaStatic,
  ArrayFieldType,
  FieldType,
  NumberFieldType,
  ObjectSchemaStatic,
  ObjectFieldType,
  OptionalSchemaStatic,
  OptionalFieldType,
  RecordSchemaStatic,
  RecordFieldType,
  SerializableFieldStatic,
  SerializableFieldType,
  StringFieldType,
} from "./schema";
export type {
  CommandAvailabilityContext,
  AnyCommandDiscoveryResult,
  AnyDiscoveryStepDefinition,
  CommandSchema,
  CommandDiscoveryResult,
  Command,
  Discovery,
  DiscoveryDefinition,
  DiscoveryStepContext,
  DiscoveryStepDefinition,
  DiscoveryStepOption,
  DiscoveryStepResolveFn,
  DiscoveryStepResult,
  CommandFromSchema,
  DiscoveryContext,
  DefinedCommand,
  ExecuteContext,
  ValidationContext,
} from "./types/command";
export type { CommandFactory } from "./command-factory";
export type {
  AutomaticStageBuilder,
  MultiActivePlayerStageBuilder,
  SingleActivePlayerStageBuilder,
  StageFactory,
} from "./stage-factory";
export type { GameEvent } from "./types/event";
export type {
  ExecutionFailure,
  ExecutionResult,
  ExecutionSuccess,
  ValidationError,
  ValidationOutcome,
  ValidationResult,
} from "./types/result";
export type {
  CanonicalState,
  HistoryEntry,
  HistoryState,
  RuntimeState,
} from "./types/state";
export type {
  HiddenValue,
  PlayerViewer,
  SpectatorViewer,
  Viewer,
  VisibleState,
} from "./types/visibility";
export type {
  AutomaticStageDefinition,
  AutomaticStageState,
  MultiActivePlayerMemoryContext,
  MultiActivePlayerStageDefinition,
  MultiActivePlayerStageState,
  MultiActivePlayerSubmitContext,
  MultiActivePlayerTransitionContext,
  ProgressionState,
  SingleActivePlayerSelectionContext,
  SingleActivePlayerStageState,
  SingleActivePlayerStageDefinition,
  SingleActivePlayerTransitionContext,
  StageState,
  StageDefinition,
  StageDefinitionMap,
} from "./types/progression";
export type { RNGApi, RNGState } from "./types/rng";
export type { ReplayRecord, Snapshot } from "./types/snapshot";
