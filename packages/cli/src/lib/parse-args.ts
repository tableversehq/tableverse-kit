export function isHelpFlag(value: string | undefined): boolean {
  return value === "--help" || value === "-h";
}

export interface ParsedCommandArguments {
  configPath?: string;
  outDir?: string;
}

const supportedFlags = new Set(["--config", "--outDir"]);
const deprecatedFlags = new Set(["--game", "--export"]);

export function parseCommandArguments(args: string[]): ParsedCommandArguments {
  const flags = new Map<string, string>();

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];

    if (!current?.startsWith("--")) {
      throw new Error(`unexpected_positional_argument:${current}`);
    }

    if (deprecatedFlags.has(current)) {
      throw new Error(`deprecated_flag:${current}`);
    }

    if (!supportedFlags.has(current)) {
      throw new Error(`unknown_flag:${current}`);
    }

    const next = args[index + 1];

    if (!next || next.startsWith("--")) {
      throw new Error(`missing_flag_value:${current}`);
    }

    flags.set(current, next);
    index += 1;
  }

  return {
    configPath: flags.get("--config"),
    outDir: flags.get("--outDir"),
  };
}
