export function createRootHelpText(): string {
  return ["tabletop-cli", "", "Commands:", "  generate", "  validate"].join(
    "\n",
  );
}

export function createGenerateHelpText(): string {
  return [
    "tabletop-cli generate",
    "",
    "Targets:",
    "  types",
    "  schemas",
    "  client-sdk",
    "",
    "Optional flags:",
    "  --config <path>",
    "  --outDir <path>",
  ].join("\n");
}

export function createValidateHelpText(): string {
  return [
    "tabletop-cli validate",
    "",
    "Optional flags:",
    "  --config <path>",
    "  --snapshot <path>",
  ].join("\n");
}
