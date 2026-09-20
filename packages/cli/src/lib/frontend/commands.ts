export const FRONTEND_DEV_COMMAND: Readonly<{
  executable: string;
  args: readonly string[];
}> = {
  executable: "npm",
  args: ["run", "dev"],
};

export const FRONTEND_BUILD_COMMAND = "npm run build";
