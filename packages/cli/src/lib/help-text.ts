export function createRootHelpText(): string {
  return [
    "tvk",
    "",
    "Commands:",
    "  validate",
    "  dev",
    "  login",
    "  logout",
    "  whoami",
    "  upload",
  ].join("\n");
}

export function createValidateHelpText(): string {
  return "tvk validate";
}

export function createDevHelpText(): string {
  return [
    "tvk dev",
    "",
    "Start the local rules server and frontend.",
    "",
    "Optional flags:",
    "  --port <number>",
  ].join("\n");
}

const ENVIRONMENT_HELP = [
  "Environment:",
  "  TABLEVERSE_API_URL   platform-api base URL (default https://api.tableverse.io)",
  "  TABLEVERSE_WEB_URL   platform-web base URL (default https://tableverse.io)",
];

export function createLoginHelpText(): string {
  return [
    "tvk login",
    "",
    "Authenticate with the Tableverse platform in your browser.",
    "Credentials are stored per API base URL, so separate environments do not",
    "overwrite each other.",
    "",
    ...ENVIRONMENT_HELP,
  ].join("\n");
}

export function createLogoutHelpText(): string {
  return [
    "tvk logout",
    "",
    "Revoke the stored refresh token and remove local credentials.",
    "",
    ...ENVIRONMENT_HELP,
  ].join("\n");
}

export function createWhoamiHelpText(): string {
  return [
    "tvk whoami",
    "",
    "Print the currently logged-in account.",
    "",
    ...ENVIRONMENT_HELP,
  ].join("\n");
}

export function createUploadHelpText(): string {
  return [
    "tvk upload",
    "",
    "Package the project source and publish a new game version.",
    "On the first upload of an unlinked project, you are asked to create a new",
    "game or pick an existing one; the choice is saved to .tableverse/game.json.",
    "In a non-interactive shell, set TABLEVERSE_GAME_ID instead.",
    "",
    ...ENVIRONMENT_HELP,
    "  TABLEVERSE_GAME_ID                 publish to this game id, overriding the link",
  ].join("\n");
}
