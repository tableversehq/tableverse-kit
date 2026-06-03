import { expect, test } from "bun:test";
import * as tabletopEngine from "../src";

const { createCommandFactory, t } = tabletopEngine;

class TurnCommandState extends tabletopEngine.GameState {
  turns = 0;
}

class ScoreCommandState extends tabletopEngine.GameState {
  score = 0;
}

class CounterCommandState extends tabletopEngine.GameState {
  counter = 0;
}

test("chained builder supports non-discoverable commands", () => {
  const defineCommand = createCommandFactory<TurnCommandState>();
  const passTurnSchema = t.object({});

  const command = defineCommand({
    commandId: "pass_turn",
    commandSchema: passTurnSchema,
  })
    .validate(({ game, command }) => {
      void game.turns;
      void command.input;
      return { ok: true as const };
    })
    .execute(({ game, command }) => {
      void command.input;
      game.turns += 1;
    })
    .build();

  expect(command.commandId).toBe("pass_turn");
  expect(command.commandSchema).toBe(passTurnSchema);
  expect(command.validate).toBeFunction();
  expect(command.execute).toBeFunction();
  expect("discoverySchema" in command).toBeFalse();
  expect("discover" in command).toBeFalse();
});

test("chained builder supports step-authored discovery", () => {
  const defineCommand = createCommandFactory<ScoreCommandState>();
  const commandSchema = t.object({
    amount: t.number(),
  });
  const selectAmountInputSchema = t.object({});
  const selectAmountOutputSchema = t.object({
    label: t.string(),
    amount: t.number(),
  });

  const command = defineCommand({
    commandId: "gain_score",
    commandSchema,
  })
    .discoverable((step) => [
      step("select_amount")
        .initial()
        .input(selectAmountInputSchema)
        .output(selectAmountOutputSchema)
        .resolve(() => [
          {
            id: "one",
            output: {
              label: "One",
              amount: 1,
            },
            nextInput: {
              amount: 1,
            },
            nextStep: "select_amount",
          },
        ])
        .build(),
    ])
    .isAvailable(({ game, runtime, actorId, commandType }) => {
      expect(typeof game.score).toBe("number");
      void runtime;
      void actorId;
      expect(commandType).toBe("gain_score");
      return true;
    })
    .validate(({ command }) => {
      expect(command.input?.amount).toBeNumber();
      return { ok: true as const };
    })
    .execute(({ game, command }) => {
      game.score += command.input?.amount ?? 0;
    })
    .build();

  expect(command.commandId).toBe("gain_score");
  expect(command.commandSchema).toBe(commandSchema);
  expect(command.discovery).toBeDefined();
  expect(command.discovery?.startStep).toBe("select_amount");
  expect(command.discovery?.steps).toHaveLength(1);
  expect(command.discovery?.steps[0]?.stepId).toBe("select_amount");
  expect(command.discovery?.steps[0]?.inputSchema).toBe(
    selectAmountInputSchema,
  );
  expect(command.discovery?.steps[0]?.outputSchema).toBe(
    selectAmountOutputSchema,
  );
  expect(command.discovery?.steps[0]?.resolve).toBeFunction();
  expect("discoverySchema" in command).toBeFalse();
  expect("discover" in command).toBeFalse();
});

test("chained builder supports ordered discovery steps and completion", () => {
  const defineCommand = createCommandFactory<CounterCommandState>();

  const incrementSchema = t.object({
    amount: t.number(),
  });
  const selectAmountInputSchema = t.object({});
  const selectAmountOutputSchema = t.object({
    amount: t.number(),
  });
  const selectTargetInputSchema = t.object({
    amount: t.number(),
  });
  const selectTargetOutputSchema = t.object({
    targetId: t.string(),
  });

  const discoverableCommand = defineCommand({
    commandId: "increment_with_discovery",
    commandSchema: incrementSchema,
  })
    .discoverable((step) => [
      step("select_amount")
        .initial()
        .input(selectAmountInputSchema)
        .output(selectAmountOutputSchema)
        .resolve(() => [
          {
            id: "one",
            output: {
              amount: 1,
            },
            nextInput: {
              amount: 1,
            },
            nextStep: "select_target",
          },
        ])
        .build(),
      step("select_target")
        .input(selectTargetInputSchema)
        .output(selectTargetOutputSchema)
        .resolve(() => ({
          complete: true as const,
          input: {
            amount: 1,
          },
        }))
        .build(),
    ])
    .validate(({ command }) => {
      void command.input?.amount;
      return { ok: true as const };
    })
    .execute(({ game, command }) => {
      game.counter += command.input?.amount ?? 0;
    })
    .build();

  const mixedOrderCommand = defineCommand({
    commandId: "increment_mixed_order",
    commandSchema: incrementSchema,
  })
    .isAvailable(() => true)
    .discoverable((step) => [
      step("select_amount")
        .initial()
        .input(selectAmountInputSchema)
        .output(selectAmountOutputSchema)
        .resolve(() => ({
          complete: true as const,
          input: {
            amount: 1,
          },
        }))
        .build(),
    ])
    .validate(({ command }) => {
      void command.input?.amount;
      return { ok: true as const };
    })
    .execute(({ game, command }) => {
      game.counter += command.input?.amount ?? 0;
    })
    .build();

  expect(discoverableCommand.commandId).toBe("increment_with_discovery");
  expect(mixedOrderCommand.commandId).toBe("increment_mixed_order");
  expect(discoverableCommand.discovery?.startStep).toBe("select_amount");
  expect(discoverableCommand.discovery?.steps[0]?.initial).toBeTrue();
  expect(discoverableCommand.discovery?.steps[1]?.initial).toBeFalse();
});

test("chained builder supports callback-scoped built discovery steps", () => {
  const defineCommand = createCommandFactory<ScoreCommandState>();
  const commandSchema = t.object({
    amount: t.number(),
  });
  const selectAmountInputSchema = t.object({});
  const selectAmountOutputSchema = t.object({
    label: t.string(),
    amount: t.number(),
  });

  const command = defineCommand({
    commandId: "gain_score_with_explicit_step",
    commandSchema,
  })
    .discoverable((step) => [
      step("select_amount")
        .initial()
        .input(selectAmountInputSchema)
        .output(selectAmountOutputSchema)
        .resolve(() => [
          {
            id: "one",
            output: {
              label: "One",
              amount: 1,
            },
            nextInput: {
              amount: 1,
            },
            nextStep: "select_amount",
          },
        ])
        .build(),
    ])
    .validate(({ command }) => {
      expect(command.input?.amount).toBeNumber();
      return { ok: true as const };
    })
    .execute(({ game, command }) => {
      game.score += command.input?.amount ?? 0;
    })
    .build();

  expect(command.discovery?.startStep).toBe("select_amount");
  expect(command.discovery?.steps[0]?.stepId).toBe("select_amount");
});

test("chained builder rejects callback discovery steps without an initial step", () => {
  const defineCommand = createCommandFactory<ScoreCommandState>();
  const commandSchema = t.object({
    amount: t.number(),
  });

  expect(() =>
    defineCommand({
      commandId: "gain_score_missing_initial_step",
      commandSchema,
    })
      .discoverable((step) => [
        step("select_amount")
          .input(t.object({}))
          .output(
            t.object({
              amount: t.number(),
            }),
          )
          .resolve(() => [
            {
              id: "one",
              output: {
                amount: 1,
              },
              nextInput: {},
              nextStep: "select_amount" as const,
            },
          ])
          .build(),
      ])
      .validate(() => ({ ok: true as const }))
      .execute(() => {})
      .build(),
  ).toThrow("command_builder_missing_initial_discovery_step");
});

test("chained builder rejects duplicate callback initial discovery steps", () => {
  const defineCommand = createCommandFactory<ScoreCommandState>();
  const commandSchema = t.object({
    amount: t.number(),
  });

  expect(() =>
    defineCommand({
      commandId: "gain_score_duplicate_initial_step",
      commandSchema,
    })
      .discoverable((step) => [
        step("select_amount")
          .initial()
          .input(t.object({}))
          .output(
            t.object({
              amount: t.number(),
            }),
          )
          .resolve(() => [
            {
              id: "one",
              output: {
                amount: 1,
              },
              nextInput: {
                amount: 1,
              },
              nextStep: "select_target",
            },
          ])
          .build(),
        step("select_target")
          .initial()
          .input(
            t.object({
              amount: t.number(),
            }),
          )
          .output(
            t.object({
              confirmed: t.boolean(),
            }),
          )
          .resolve(() => ({
            complete: true as const,
            input: {
              amount: 1,
            },
          }))
          .build(),
      ])
      .validate(() => ({ ok: true as const }))
      .execute(() => {})
      .build(),
  ).toThrow("command_builder_duplicate_initial_discovery_step");
});

test("chained builder still rejects duplicate callback discovery step ids", () => {
  const defineCommand = createCommandFactory<ScoreCommandState>();
  const commandSchema = t.object({
    amount: t.number(),
  });

  expect(() =>
    defineCommand({
      commandId: "gain_score_duplicate_explicit_step_id",
      commandSchema,
    })
      .discoverable((step) => [
        step("select_amount")
          .initial()
          .input(t.object({}))
          .output(
            t.object({
              amount: t.number(),
            }),
          )
          .resolve(() => [
            {
              id: "one",
              output: {
                amount: 1,
              },
              nextInput: {
                amount: 1,
              },
              nextStep: "select_amount",
            },
          ])
          .build(),
        step("select_amount")
          .input(
            t.object({
              amount: t.number(),
            }),
          )
          .output(
            t.object({
              confirmed: t.boolean(),
            }),
          )
          .resolve(() => ({
            complete: true as const,
            input: {
              amount: 1,
            },
          }))
          .build(),
      ])
      .validate(() => ({ ok: true as const }))
      .execute(() => {})
      .build(),
  ).toThrow("duplicate_discovery_step_id:select_amount");
});
