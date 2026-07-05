export function createRootHelpText(): string {
  return ["tvk", "", "Commands:", "  generate", "  validate"].join("\n");
}

export function createGenerateHelpText(): string {
  return [
    "tvk generate",
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
    "tvk validate",
    "",
    "Optional flags:",
    "  --config <path>",
    "  --snapshot <path>",
  ].join("\n");
}
