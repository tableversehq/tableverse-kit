export function createRootHelpText(): string {
  return ["ttk", "", "Commands:", "  generate", "  validate"].join("\n");
}

export function createGenerateHelpText(): string {
  return [
    "ttk generate",
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
    "ttk validate",
    "",
    "Optional flags:",
    "  --config <path>",
    "  --snapshot <path>",
  ].join("\n");
}
