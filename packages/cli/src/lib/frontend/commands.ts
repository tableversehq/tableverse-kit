export const FRONTEND_DEV_COMMAND: Readonly<{
  executable: string;
  args: readonly string[];
}> = {
  executable: "npm",
  args: ["run", "dev"],
};
