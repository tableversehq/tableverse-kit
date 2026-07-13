# CLI Login + Upload Design (client side)

Status: accepted
Date: 2026-07-12
Scope: the `tvk` CLI in this repo (`packages/cli`).
Platform side: the server endpoints this CLI consumes are specified
separately in the private `tableverse` repo,
`docs/design/2026-07-12-cli-auth-upload-api-contract.md`. That document is the
authoritative contract; this one describes only the client.

## Context

Creators author a game with `tableverse-kit` and need two things from the
platform: a way to **authenticate** (`tvk login`) and a way to **publish** a new
game version (`tvk upload`). Today `tvk` only has offline authoring commands
(`validate`, `generate client-sdk`); it has no notion of an account or of the
platform.

This document covers the **client** half — everything that ships in this
open-source repo. The **server** half (OAuth endpoints, versions/builds
endpoints, the platform-web `/authorize` page) lives in the private `tableverse`
repo and is specified in the contract doc linked above. The CLI is implemented
first, tested against an in-process fake of that contract.

### Why the CLI is open source and holds no secret

The `tvk` CLI is a **public OAuth client**: it ships no client secret. The
loopback PKCE flow (below) is exactly the mechanism that makes a secret-less
public client safe. All authorization is enforced **server-side** on every
request via the platform's JWT access-token guard. Open-sourcing the client
code therefore leaks nothing: "security through obscurity of client code buys
you nothing." This intentionally overrides the earlier `AGENTS.md` charter note
that platform commands must live in private packages — see "Repo charter" below.

## Command surface

Four commands are added to the existing thin dispatcher in
`packages/cli/src/main.ts`. Each returns the existing `RunResult`
(`stdout` / `stderr` / `exitCode`) contract.

| Command      | Purpose                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------- |
| `tvk login`  | Loopback-PKCE browser flow; stores tokens locally.                                        |
| `tvk logout` | Deletes stored tokens; best-effort server-side refresh-token revocation.                  |
| `tvk whoami` | Prints the logged-in account via `GET /me`; the standard "is my auth working?" probe.     |
| `tvk upload` | Packages engine source + frontend bundle, uploads via presigned S3 URLs, polls the build. |

## Login: loopback PKCE

`tvk login` uses the OAuth 2.0 Authorization Code flow with PKCE (RFC 7636) and
a loopback redirect (RFC 8252 §7.3). This is the flow used by `gcloud` and the
Vercel CLI.

### Flow

1. CLI generates a cryptographically random `code_verifier` and `state`, and
   derives `code_challenge = BASE64URL(SHA256(code_verifier))`.
2. CLI binds an HTTP listener on `127.0.0.1:0` (OS-assigned free port). The
   redirect URI is `http://127.0.0.1:<port>/callback`.
3. CLI opens the user's browser to the platform-web authorize page:

   ```
   https://dev.tableverse.io/authorize
     ?response_type=code
     &client_id=tvk-cli
     &redirect_uri=http://127.0.0.1:<port>/callback
     &code_challenge=<challenge>
     &code_challenge_method=S256
     &state=<state>
     &scope=publish
   ```

4. The platform authenticates the user and redirects the browser back to
   `http://127.0.0.1:<port>/callback?code=<code>&state=<state>` (server
   behavior is defined in the contract doc).
5. The CLI's loopback listener receives the request, verifies `state` matches
   the value it generated, and serves a plain "You can close this tab" page.
6. CLI calls `POST /oauth/token` with `grant_type=authorization_code`, the
   `code`, the `code_verifier`, and the `redirect_uri`, and receives
   `{ access_token, refresh_token, expires_in }`.
7. CLI persists the tokens (see "Token storage").

### Headless limitation

The loopback flow requires a browser on the same machine as the CLI. SSH-only
and CI environments are out of scope for this version; a token-paste or
device-code fallback can be added later without changing the client design.

## Token storage and refresh

- **Location:** `~/.config/tableverse/credentials.json`, honoring
  `XDG_CONFIG_HOME` on Linux/macOS and `%APPDATA%\tableverse\credentials.json`
  on Windows. File mode `0600`; parent directory created `0700`.
- **Shape:**

  ```jsonc
  {
    "apiBaseUrl": "https://api-dev.tableverse.io",
    "accessToken": "…",
    "refreshToken": "…",
    "expiresAt": "2026-07-12T18:30:00.000Z",
    "account": { "id": "…", "email": "…" },
  }
  ```

  Entries are keyed by `apiBaseUrl` so a dev and a prod session can coexist.

- **Refresh:** before any authenticated call, `session` checks `expiresAt`. If
  the access token is expired or within a short skew window, the CLI silently
  exchanges the refresh token via `POST /oauth/token`
  (`grant_type=refresh_token`) and rewrites the file. If refresh fails (token
  revoked or expired), the CLI aborts with "session expired, run `tvk login`"
  and a non-zero exit code.
- **At-rest protection:** the first version uses a plaintext `0600` file — the
  approach used in practice by `gh`, `vercel`, and `firebase`. It adds no native
  dependencies and is portable. An OS-keychain backend (macOS Keychain,
  libsecret, Windows Credential Manager) is a possible future upgrade and is
  intentionally out of scope for now.

## Upload: packaging, presigned transport, build polling

`tvk upload` publishes one immutable version consisting of **two** artifacts:
the engine TypeScript source and the pre-built static frontend bundle. The
platform builds the engine artifact server-side; the CLI never ships a pre-built
engine bundle.

### Config additions

`defineConfig` (in `@tableverse-kit/engine/config`) gains an optional `publish`
block:

```ts
defineConfig({
  game,
  publish: {
    slug: "slaylike", // stable platform identity; defaults to slugify(game.name)
    engine: { root: "." }, // engine package source dir to package
    frontend: { dist: "./web/dist" }, // pre-built static frontend to package
  },
});
```

The existing `game` and `outDir` fields are unchanged; `publish` is only
required for `tvk upload`.

### Flow

1. Load config; resolve `publish`. Verify `frontend.dist` exists and is
   non-empty. If not, fail **before any network call** with "frontend bundle
   not found — run your frontend build first."
2. In a temp directory, build two gzipped tarballs and compute each one's
   `sha256`:
   - **engine** = the engine source under `engine.root`, excluding
     `node_modules`, `dist`, `.git`, and other build output (include-list
     driven).
   - **frontend** = the contents of `frontend.dist`.
3. `POST /versions` with `{ slug, engineSha256, frontendSha256 }` →
   `{ versionId, enginePutUrl, frontendPutUrl, expiresAt }`. The two URLs are
   short-lived presigned S3 `PUT` URLs.
4. `PUT` each tarball **directly to its S3 URL** (bytes never transit
   platform-api).
5. `POST /versions/:versionId/build` → `{ buildId }`.
6. Poll `GET /builds/:buildId` every ≈2s (with backoff and an overall timeout)
   until `status` is `ready` or `failed`. Step labels are streamed as they
   arrive (`type-check ✓ bundle ✓ smoke ✓`). On `ready`, print
   `Published <slug>@v<N>`. On `failed`, print the failing step and `logsUrl`
   and exit non-zero.

### Platform endpoints consumed

Full request/response shapes are in the contract doc. The CLI calls:

- `POST /oauth/token` — token exchange and refresh.
- `GET /me` — account for `whoami`.
- `POST /versions` — create a pending version; returns presigned S3 PUT URLs.
- `PUT <presigned S3 URL>` — upload each tarball directly to S3.
- `POST /versions/:versionId/build` — trigger the build.
- `GET /builds/:buildId` — poll build status.

## CLI internal structure

New modules under `packages/cli/src/`, each with a single responsibility:

- `lib/auth/pkce.ts` — `code_verifier` / `code_challenge` / `state` generation
  (via `node:crypto`).
- `lib/auth/loopback-server.ts` — the `127.0.0.1` callback listener; resolves
  with `{ code, state }` or rejects on timeout / mismatch.
- `lib/auth/token-store.ts` — read / write / delete `credentials.json` (`0600`),
  keyed by `apiBaseUrl`.
- `lib/auth/session.ts` — "return a valid access token," performing
  refresh-if-needed. The single entry point authenticated commands call.
- `lib/platform-client.ts` — typed wrapper over the platform HTTP API
  (`token`, `me`, `createVersion`, `startBuild`, `getBuild`). Takes an
  **injectable `fetch`** and `apiBaseUrl`.
- `lib/packaging/tarball.ts` — build the engine / frontend tarballs and compute
  `sha256`.
- `commands/login.ts`, `commands/logout.ts`, `commands/whoami.ts`,
  `commands/upload.ts` — orchestration only; return `RunResult`.

### Testability

The real platform endpoints do not exist yet, so the CLI is built to be tested
in isolation. `platform-client`, the loopback flow, and `upload` accept injected
collaborators: `fetch`, a browser-opener, and a clock. Vitest tests drive each
command against an **in-process fake platform** — a `fetch` stub that implements
the contract, plus a fake S3 `PUT` sink — with no network and deterministic
timing. This validates the CLI now and keeps it honest against the contract
until the server ships.

## Error handling and edge cases

- **Not logged in** (`upload` / `whoami` with no stored token): clean "not
  logged in, run `tvk login`" message and non-zero exit — never a raw 401.
- **Refresh token expired mid-command:** same clean re-login prompt.
- **`state` mismatch or loopback timeout** (user closed the tab; 5-minute cap):
  abort cleanly and free the port.
- **Presigned URL expired between issue and PUT:** surface "upload window
  expired, retry `tvk upload`."
- **Build `failed`:** non-zero exit with the failing step and `logsUrl`.
- **Missing / empty `frontend.dist`:** fail before any network call.
- **Loopback port bind failure:** retry a couple of times, then a clear message.

## Repo charter and cleanup

- **Charter override:** `AGENTS.md` currently states that platform commands
  (`login` / `upload` / `deploy`) must live in private Tableverse-owned
  packages. This design intentionally supersedes that: the CLI is a public OAuth
  client that holds no secret, and all authorization is enforced server-side, so
  the command code is safe to open source. `AGENTS.md` is updated to reflect
  that the open-source CLI may contain platform _client_ code while the platform
  _server_ remains private.
- **Shebang fix:** `packages/cli/src/main.ts` still begins with
  `#!/usr/bin/env bun`, a leftover from the Bun→Node migration. It is corrected
  to `#!/usr/bin/env node` as part of this work.

## Out of scope

- Headless / CI login (no local browser).
- OS-keychain token storage.
- Standalone frontend-only or engine-only publish commands.
- The server-side endpoints (specified in the `tableverse` contract doc).
