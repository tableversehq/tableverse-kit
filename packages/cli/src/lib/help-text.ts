export function createRootHelpText(): string {
  return ["tt-kit", "", "Commands:", "  generate", "  validate"].join("\n");
}

export function createGenerateHelpText(): string {
  return [
    "tt-kit generate",
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
    "tt-kit validate",
    "",
    "Optional flags:",
    "  --config <path>",
    "  --snapshot <path>",
  ].join("\n");
}
