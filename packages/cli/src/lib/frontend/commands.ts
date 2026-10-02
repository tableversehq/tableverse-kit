/**
 * `--silent` drops npm's script header and `--logLevel warn` drops Vite's
 * startup banner, so the only address the terminal offers is the shell's.
 * Warnings and errors still reach the terminal at this level.
 */
export const FRONTEND_DEV_COMMAND: Readonly<{
  executable: string;
  args: readonly string[];
}> = {
  executable: "npm",
  args: ["run", "--silent", "dev", "--", "--logLevel", "warn"],
};
