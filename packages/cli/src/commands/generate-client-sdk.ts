import { success, type RunResult } from "../lib/command-result.ts";
import {
  describeGameForGeneration,
  hostedMessageNames,
  toJsonSchema,
  type GeneratedCommandDescriptor,
  type HostedMessageNames,
} from "../lib/game-descriptor.ts";
import { createGenerationContext } from "../lib/generation-context.ts";
import { parseCommandArguments } from "../lib/parse-args.ts";
import {
  renderSchemaTypeString,
  renderTypeDeclaration,
} from "../lib/render-typescript.ts";
import { writeOutputFile } from "../lib/write-output.ts";

interface GenerateClientSdkOptions {
  cwd: string;
}

interface DiscoveryStepDescriptor {
  stepId: string;
  inputSchema: unknown;
  outputSchema: unknown;
}

interface DiscoveryDescriptor {
  startStep: string;
  steps: readonly DiscoveryStepDescriptor[];
}

export async function runGenerateClientSdkCommand(
  args: string[],
  options: GenerateClientSdkOptions,
): Promise<RunResult> {
  const parsed = parseCommandArguments(args);
  const context = await createGenerationContext(parsed, {
    cwd: options.cwd,
  });
  const descriptor = describeGameForGeneration(context.game);
  const output = [
    renderTypeDeclaration("VisibleState", toJsonSchema(descriptor.viewSchema)),
    renderCommandTypeAliases(descriptor.commands),
    renderCommandPayloadAliases(descriptor.commands),
    renderHostedMessageTypes(descriptor.commands, hostedMessageNames),
    renderDiscoveryStartHelpers(descriptor.commands),
    renderRuntimeClient(descriptor.commands, hostedMessageNames),
  ].join("\n");
  const outputPath = `${context.outputDirectory}/client-sdk.generated.ts`;

  await writeOutputFile(outputPath, output);

  return success(`generated client sdk:${outputPath}`);
}

function renderCommandTypeAliases(
  commands: Record<string, GeneratedCommandDescriptor>,
): string {
  const aliases = Object.entries(commands).flatMap(([commandId, command]) => {
    const typeName = toPascalCase(commandId);
    const commandRequest = renderCommandRequestType(commandId, command);
    const results = [
      `export type ${typeName}CommandRequest = ${commandRequest};\n`,
    ];

    if (command.discovery) {
      results.push(
        `export type ${typeName}DiscoveryRequest = ${renderDiscoveryRequestType(commandId, command.discovery)};\n`,
        `export type ${typeName}DiscoveryResult = ${renderDiscoveryResultType(command)};\n`,
      );
    }

    return results;
  });

  aliases.push(
    `export type CommandRequest = ${renderUnion(
      Object.keys(commands).map(
        (commandId) => `${toPascalCase(commandId)}CommandRequest`,
      ),
    )};\n`,
    `export type DiscoveryRequest = ${renderUnion(
      Object.entries(commands).flatMap(([commandId, command]) =>
        command.discovery ? [`${toPascalCase(commandId)}DiscoveryRequest`] : [],
      ),
    )};\n`,
    `export type DiscoveryResult = ${renderUnion(
      Object.entries(commands).flatMap(([commandId, command]) =>
        command.discovery ? [`${toPascalCase(commandId)}DiscoveryResult`] : [],
      ),
    )};\n`,
    `export type CommandType = ${renderUnion(
      Object.keys(commands).map((commandId) => JSON.stringify(commandId)),
    )};\n`,
  );

  return aliases.join("\n");
}

function renderCommandPayloadAliases(
  commands: Record<string, GeneratedCommandDescriptor>,
): string {
  const aliases = [
    'export type WithoutActorId<T> = T extends unknown ? Omit<T, "actorId"> : never;\n',
    'export type WithoutType<T> = T extends unknown ? Omit<T, "type"> : never;\n',
    ...Object.keys(commands).flatMap((commandId) => {
      const typeName = toPascalCase(commandId);
      const payloadAliases = [
        `export type ${typeName}CommandPayload = WithoutActorId<${typeName}CommandRequest>;\n`,
      ];

      if (commands[commandId]!.discovery) {
        payloadAliases.push(
          `export type ${typeName}DiscoveryPayload = WithoutActorId<${typeName}DiscoveryRequest>;\n`,
        );
      }

      return payloadAliases;
    }),
  ];

  aliases.push(
    `export type CommandPayload = ${renderUnion(
      Object.keys(commands).map(
        (commandId) => `${toPascalCase(commandId)}CommandPayload`,
      ),
    )};\n`,
    `export type DiscoveryPayload = ${renderUnion(
      Object.entries(commands).flatMap(([commandId, command]) =>
        command.discovery ? [`${toPascalCase(commandId)}DiscoveryPayload`] : [],
      ),
    )};\n`,
  );

  return aliases.join("\n");
}

function renderHostedMessageTypes(
  commands: Record<string, GeneratedCommandDescriptor>,
  messageNames: HostedMessageNames,
): string {
  const discoveryMessageUnion = renderUnion(
    Object.entries(commands).flatMap(([commandId, command]) =>
      command.discovery
        ? [
            `{
  type: ${JSON.stringify(commandId)};
  result: ${toPascalCase(commandId)}DiscoveryResult;
}`,
          ]
        : [],
    ),
  );

  return [
    `export interface GameListAvailableCommandsRequest {
  gameSessionId: string;
}\n`,
    `export interface GameAvailableCommandsMessage {
  type: ${JSON.stringify(messageNames.availableCommands)};
  requestId: string;
  gameSessionId: string;
  availableCommands: CommandType[];
}\n`,
    `export interface GameDiscoverRequest {
  gameSessionId: string;
  discovery: DiscoveryPayload;
}\n`,
    `export type GameDiscoveryResultEnvelope = ${discoveryMessageUnion || "never"};\n`,
    `export interface GameDiscoveryResultMessage {
  type: ${JSON.stringify(messageNames.discoveryResult)};
  requestId: string;
  gameSessionId: string;
  result: GameDiscoveryResultEnvelope | null;
}\n`,
    `export interface GameExecuteRequest {
  gameSessionId: string;
  command: CommandPayload;
}\n`,
    `export type GameExecutionResultMessage =
  | {
      type: ${JSON.stringify(messageNames.executionResult)};
      requestId: string;
      gameSessionId: string;
      accepted: true;
      stateVersion: number;
      events: unknown[];
    }
  | {
      type: ${JSON.stringify(messageNames.executionResult)};
      requestId: string;
      gameSessionId: string;
      accepted: false;
      stateVersion: number;
      reason: string;
      metadata?: unknown;
      events: unknown[];
    };\n`,
    `export interface GameSnapshotMessage {
  type: ${JSON.stringify(messageNames.gameSnapshot)};
  gameSessionId: string;
  stateVersion: number;
  view: VisibleState;
  availableCommands: CommandType[];
  events: unknown[];
}\n`,
    `export interface GameEndedResult {
  reason: "completed" | "invalidated";
  winnerPlayerIds?: string[];
  message?: string;
}\n`,
    `export interface GameEndedMessage {
  type: ${JSON.stringify(messageNames.gameEnded)};
  gameSessionId: string;
  result: GameEndedResult;
}\n`,
    `export interface GameEngineErrorMessage {
  type: ${JSON.stringify(messageNames.error)};
  requestId?: string;
  code: string;
  message?: string;
}\n`,
    `export type GameEngineClientMessage =
  | {
      type: ${JSON.stringify(messageNames.listAvailableCommands)};
      requestId: string;
      gameSessionId: string;
    }
  | {
      type: ${JSON.stringify(messageNames.discover)};
      requestId: string;
      gameSessionId: string;
      discovery: DiscoveryPayload;
    }
  | {
      type: ${JSON.stringify(messageNames.execute)};
      requestId: string;
      gameSessionId: string;
      command: CommandPayload;
    };\n`,
    `export type GameEngineServerMessage =
  | GameAvailableCommandsMessage
  | GameDiscoveryResultMessage
  | GameExecutionResultMessage
  | GameSnapshotMessage
  | GameEndedMessage
  | GameEngineErrorMessage;\n`,
  ].join("\n");
}

function renderDiscoveryStartHelpers(
  commands: Record<string, GeneratedCommandDescriptor>,
): string {
  return Object.entries(commands)
    .flatMap(([commandId, command]) => {
      if (!command.discovery) {
        return [];
      }

      const pascalName = toPascalCase(commandId);
      const camelName = toCamelCase(commandId);
      const startStep = command.discovery.steps.find(
        (step) => step.stepId === command.discovery?.startStep,
      );

      if (!startStep) {
        return [];
      }

      return [
        `export type ${pascalName}DiscoveryStart = {
  step: ${JSON.stringify(startStep.stepId)};
  input: ${renderSchemaTypeString(
    startStep.inputSchema as Record<string, unknown>,
  )};
};\n`,
        ...(hasRequiredProperties(
          startStep.inputSchema as Record<string, unknown>,
        )
          ? []
          : [
              `export const ${camelName}DiscoveryStart = {
  step: ${JSON.stringify(startStep.stepId)},
  input: {},
} satisfies ${pascalName}DiscoveryStart;\n`,
            ]),
      ];
    })
    .join("\n");
}

function renderRuntimeClient(
  commands: Record<string, GeneratedCommandDescriptor>,
  messageNames: HostedMessageNames,
): string {
  const discoverMethodSignatures = Object.entries(commands)
    .flatMap(([commandId, command]) => {
      if (!command.discovery) {
        return [];
      }

      const pascalName = toPascalCase(commandId);

      return [
        `discover${pascalName}(request: { gameSessionId: string } & WithoutType<${pascalName}DiscoveryPayload>): Promise<GameDiscoveryResultMessage>;`,
      ];
    })
    .join("\n  ");

  const executeMethodSignatures = Object.keys(commands)
    .map((commandId) => {
      const pascalName = toPascalCase(commandId);

      return `execute${pascalName}(request: {
    gameSessionId: string;
    input: ${pascalName}CommandPayload["input"];
  }): Promise<GameExecutionResultMessage>;`;
    })
    .join("\n  ");

  const discoverMethods = Object.entries(commands)
    .flatMap(([commandId, command]) => {
      if (!command.discovery) {
        return [];
      }

      const pascalName = toPascalCase(commandId);

      return [
        `discover${pascalName}(request: { gameSessionId: string } & WithoutType<${pascalName}DiscoveryPayload>) {
      const discovery = {
        type: ${JSON.stringify(commandId)},
        step: request.step,
        input: request.input,
      } as ${pascalName}DiscoveryPayload;

      return this.discover({
        gameSessionId: request.gameSessionId,
        discovery,
      });
    },`,
      ];
    })
    .join("\n");

  const executeMethods = Object.keys(commands)
    .map((commandId) => {
      const pascalName = toPascalCase(commandId);
      return `execute${pascalName}(request: {
      gameSessionId: string;
      input: ${pascalName}CommandPayload["input"];
    }) {
      return this.execute({
        gameSessionId: request.gameSessionId,
        command: {
          type: ${JSON.stringify(commandId)},
          input: request.input,
        },
      });
    },`;
    })
    .join("\n");

  return `
export interface GameEngineSocketLike {
  send(data: string): void;
  addEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
  addEventListener(type: "close" | "error", listener: () => void): void;
  removeEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
  removeEventListener(type: "close" | "error", listener: () => void): void;
}

export interface GameEngineClientOptions {
  createRequestId?: () => string;
}

export interface GameEngineClient {
  listAvailableCommands(
    request: GameListAvailableCommandsRequest,
  ): Promise<GameAvailableCommandsMessage>;
  discover(request: GameDiscoverRequest): Promise<GameDiscoveryResultMessage>;
  execute(request: GameExecuteRequest): Promise<GameExecutionResultMessage>;
  ${discoverMethodSignatures}
  ${executeMethodSignatures}
  onGameSnapshot(
    handler: (message: GameSnapshotMessage) => void,
  ): () => void;
  onGameEnded(handler: (message: GameEndedMessage) => void): () => void;
  onDiscoveryResult(
    handler: (message: GameDiscoveryResultMessage) => void,
  ): () => void;
  onExecutionResult(
    handler: (message: GameExecutionResultMessage) => void,
  ): () => void;
  onMessage(handler: (message: GameEngineServerMessage) => void): () => void;
  dispose(): void;
}

export function createGameEngineClient(
  socket: GameEngineSocketLike,
  options: GameEngineClientOptions = {},
): GameEngineClient {
  const pendingAvailableCommands = new Map<
    string,
    {
      resolve: (message: GameAvailableCommandsMessage) => void;
      reject: (error: Error) => void;
    }
  >();
  const pendingDiscovery = new Map<
    string,
    {
      resolve: (message: GameDiscoveryResultMessage) => void;
      reject: (error: Error) => void;
    }
  >();
  const pendingExecution = new Map<
    string,
    {
      resolve: (message: GameExecutionResultMessage) => void;
      reject: (error: Error) => void;
    }
  >();
  const gameSnapshotListeners = new Set<
    (message: GameSnapshotMessage) => void
  >();
  const gameEndedListeners = new Set<(message: GameEndedMessage) => void>();
  const discoveryResultListeners = new Set<
    (message: GameDiscoveryResultMessage) => void
  >();
  const executionResultListeners = new Set<
    (message: GameExecutionResultMessage) => void
  >();
  const messageListeners = new Set<(message: GameEngineServerMessage) => void>();
  let requestCounter = 0;

  const createRequestId =
    options.createRequestId ??
    (() => {
      requestCounter += 1;

      if (
        typeof globalThis.crypto !== "undefined" &&
        typeof globalThis.crypto.randomUUID === "function"
      ) {
        return globalThis.crypto.randomUUID();
      }

      return \`game-engine-request-\${requestCounter}\`;
    });

  const parseIncomingMessage = (raw: unknown): GameEngineServerMessage | null => {
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw) as GameEngineServerMessage;
      } catch {
        return null;
      }
    }

    if (typeof raw === "object" && raw !== null) {
      return raw as GameEngineServerMessage;
    }

    return null;
  };

  const handleMessage = (event: { data: unknown }) => {
    const message = parseIncomingMessage(event.data);

    if (!message) {
      return;
    }

    for (const listener of messageListeners) {
      listener(message);
    }

    switch (message.type) {
      case ${JSON.stringify(messageNames.availableCommands)}: {
        const pending = pendingAvailableCommands.get(message.requestId);
        if (pending) {
          pendingAvailableCommands.delete(message.requestId);
          pending.resolve(message);
        }
        return;
      }

      case ${JSON.stringify(messageNames.discoveryResult)}: {
        for (const listener of discoveryResultListeners) {
          listener(message);
        }
        const pending = pendingDiscovery.get(message.requestId);
        if (pending) {
          pendingDiscovery.delete(message.requestId);
          pending.resolve(message);
        }
        return;
      }

      case ${JSON.stringify(messageNames.executionResult)}: {
        for (const listener of executionResultListeners) {
          listener(message);
        }
        const pending = pendingExecution.get(message.requestId);
        if (pending) {
          pendingExecution.delete(message.requestId);
          pending.resolve(message);
        }
        return;
      }

      case ${JSON.stringify(messageNames.error)}:
        if (!message.requestId) {
          return;
        }

        {
          const error = new Error(message.message ?? message.code);
          const availableCommandsPending = pendingAvailableCommands.get(
            message.requestId,
          );
          if (availableCommandsPending) {
            pendingAvailableCommands.delete(message.requestId);
            availableCommandsPending.reject(error);
            return;
          }

          const discoveryPending = pendingDiscovery.get(message.requestId);
          if (discoveryPending) {
            pendingDiscovery.delete(message.requestId);
            discoveryPending.reject(error);
            return;
          }

          const executionPending = pendingExecution.get(message.requestId);
          if (executionPending) {
            pendingExecution.delete(message.requestId);
            executionPending.reject(error);
          }
        }
        return;

      case ${JSON.stringify(messageNames.gameSnapshot)}:
        for (const listener of gameSnapshotListeners) {
          listener(message);
        }
        return;

      case ${JSON.stringify(messageNames.gameEnded)}:
        for (const listener of gameEndedListeners) {
          listener(message);
        }
        return;
    }
  };

  const handleSocketClosed = () => {
    rejectPendingRequests("Game engine socket closed");
  };

  const handleSocketErrored = () => {
    rejectPendingRequests("Game engine socket errored");
  };

  socket.addEventListener("message", handleMessage);
  socket.addEventListener("close", handleSocketClosed);
  socket.addEventListener("error", handleSocketErrored);

  const send = (message: GameEngineClientMessage) => {
    socket.send(JSON.stringify(message));
  };

  const rejectPendingRequests = (reason: string) => {
    const error = new Error(reason);

    for (const [requestId, pending] of pendingAvailableCommands) {
      pending.reject(error);
      pendingAvailableCommands.delete(requestId);
    }

    for (const [requestId, pending] of pendingDiscovery) {
      pending.reject(error);
      pendingDiscovery.delete(requestId);
    }

    for (const [requestId, pending] of pendingExecution) {
      pending.reject(error);
      pendingExecution.delete(requestId);
    }
  };

  return {
    listAvailableCommands(request) {
      const requestId = createRequestId();
      return new Promise<GameAvailableCommandsMessage>((resolve, reject) => {
        pendingAvailableCommands.set(requestId, { resolve, reject });
        send({
          type: ${JSON.stringify(messageNames.listAvailableCommands)},
          requestId,
          gameSessionId: request.gameSessionId,
        });
      });
    },
    discover(request) {
      const requestId = createRequestId();
      return new Promise<GameDiscoveryResultMessage>((resolve, reject) => {
        pendingDiscovery.set(requestId, { resolve, reject });
        send({
          type: ${JSON.stringify(messageNames.discover)},
          requestId,
          gameSessionId: request.gameSessionId,
          discovery: request.discovery,
        });
      });
    },
    execute(request) {
      const requestId = createRequestId();
      return new Promise<GameExecutionResultMessage>((resolve, reject) => {
        pendingExecution.set(requestId, { resolve, reject });
        send({
          type: ${JSON.stringify(messageNames.execute)},
          requestId,
          gameSessionId: request.gameSessionId,
          command: request.command,
        });
      });
    },
    ${discoverMethods}
    ${executeMethods}
    onGameSnapshot(handler) {
      gameSnapshotListeners.add(handler);
      return () => {
        gameSnapshotListeners.delete(handler);
      };
    },
    onGameEnded(handler) {
      gameEndedListeners.add(handler);
      return () => {
        gameEndedListeners.delete(handler);
      };
    },
    onDiscoveryResult(handler) {
      discoveryResultListeners.add(handler);
      return () => {
        discoveryResultListeners.delete(handler);
      };
    },
    onExecutionResult(handler) {
      executionResultListeners.add(handler);
      return () => {
        executionResultListeners.delete(handler);
      };
    },
    onMessage(handler) {
      messageListeners.add(handler);
      return () => {
        messageListeners.delete(handler);
      };
    },
    dispose() {
      rejectPendingRequests("Game engine client disposed");
      socket.removeEventListener("message", handleMessage);
      socket.removeEventListener("close", handleSocketClosed);
      socket.removeEventListener("error", handleSocketErrored);
      gameSnapshotListeners.clear();
      gameEndedListeners.clear();
      discoveryResultListeners.clear();
      executionResultListeners.clear();
      messageListeners.clear();
    },
  };
}
`;
}

function renderCommandRequestType(
  commandId: string,
  command: GeneratedCommandDescriptor,
): string {
  const commandSchema = toJsonSchema(command.commandSchema);

  return `{
  type: ${JSON.stringify(commandId)};
  actorId: string;
  input: ${renderSchemaTypeString(commandSchema)};
}`;
}

function renderDiscoveryRequestType(
  commandId: string,
  discovery: DiscoveryDescriptor,
): string {
  return renderUnion(
    discovery.steps.map((step) => {
      const inputSchema = toJsonSchema(step.inputSchema);

      return `{
  type: ${JSON.stringify(commandId)};
  actorId: string;
  step: ${JSON.stringify(step.stepId)};
  input: ${renderSchemaTypeString(inputSchema)};
}`;
    }),
  );
}

function renderDiscoveryResultType(command: {
  commandSchema: unknown;
  discovery?: DiscoveryDescriptor;
}): string {
  const discovery = command.discovery;

  if (!discovery) {
    return "never";
  }

  const completeResult = `{
  complete: true;
  input: ${renderSchemaTypeString(toJsonSchema(command.commandSchema))};
}`;

  const stepResults = discovery.steps.map((step) => {
    const outputSchema = toJsonSchema(step.outputSchema);
    const nextOptionType = renderUnion(
      discovery.steps.map((targetStep) => {
        const targetInputSchema = toJsonSchema(targetStep.inputSchema);

        return `{
    id: string;
    output: ${renderSchemaTypeString(outputSchema)};
    nextStep: ${JSON.stringify(targetStep.stepId)};
    nextInput: ${renderSchemaTypeString(targetInputSchema)};
  }`;
      }),
    );

    return `{
  complete: false;
  step: ${JSON.stringify(step.stepId)};
  options: Array<${nextOptionType}>;
}`;
  });

  return renderUnion([...stepResults, completeResult]);
}

function renderUnion(members: string[]): string {
  if (members.length === 0) {
    return "never";
  }

  return members.join("\n  | ");
}

function hasRequiredProperties(schema: Record<string, unknown>): boolean {
  const required = schema.required;
  return Array.isArray(required) && required.length > 0;
}

function toPascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join("");
}

function toCamelCase(value: string): string {
  const pascal = toPascalCase(value);

  return pascal.length === 0
    ? ""
    : `${pascal.charAt(0).toLowerCase()}${pascal.slice(1)}`;
}
