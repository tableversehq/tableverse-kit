import { expect, test } from "bun:test";
import * as packageExports from "../src/index";

test("package root exports an object", () => {
  expect(packageExports).toBeObject();
  expect(packageExports.GameDefinitionBuilder).toBeDefined();
  expect("defineGame" in packageExports).toBe(false);
  expect(packageExports.createGameExecutor).toBeDefined();
});
