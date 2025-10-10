# LUMI Server

LUMI Server bridges the Chrome extension to local AI CLIs (Codex / Claude Code). It receives context from the browser, builds a prompt, and runs the selected CLI in the mapped project directory.

## Requirements

- Node.js 20+
- At least one CLI in `$PATH`: `codex` and/or `claude`

## Install & Run

```bash
# from the repo root (recommended)
npm run setup

# or just inside server/
cd server
npm install
```

Start the server in dev mode (logs to stdout):
```bash
npm run dev
```

Run it in production mode:
```bash
npm start
```

Change the port:
```bash
LUMI_PORT=4567 npm run dev
```

Stop with `Ctrl+C`. When the server quits it exits cleanly.

### Optional: run as a background service (macOS/Linux)
```bash
npm run install-service   # register user service
npm run uninstall-service # remove it
```
Logs live in `<configDir>/server.log` (default `~/.lumi/server.log`).

## Configuration

Settings are stored in `<configDir>/config.json` (the location is chosen during `npm run setup`; defaults to `~/.lumi`). Example:

```json
{
  "defaultEngine": "codex",
  "codex": {
    "model": "gpt-5-codex-high",
    "sandbox": "workspace-write",
    "approvals": "never"
  },
  "claude": {
    "model": "claude-sonnet-4.5",
    "tools": ["TextEditor", "Read"],
    "outputFormat": "json",
    "permissionMode": "acceptEdits"
  },
  "projects": [
    {
      "id": "marketing",
      "name": "Marketing",
      "workingDirectory": "/Users/you/projects/marketing",
      "hosts": ["localhost:3000", "*.staging.example.com"],
      "enabled": true
    }
  ]
}
```

Use the extension’s Options Page to edit this file—it sends the new config via `POST /config` so you don’t need to restart.

### How projects work
- Each project entry maps one or more host patterns to a working directory.
- Patterns support `*` wildcards (e.g., `*.example.com`).
- When the extension submits a request, the server selects the matching project and runs the CLI with `cwd = workingDirectory`.
- If no project matches and at least one project is defined, the server rejects the request with `NO_PROJECT_MATCH` so the extension blocks the submission.
- If you leave `projects` empty, all pages fall back to `workingDirectory`.

## API

| Method | Path        | Description                                   |
|--------|-------------|-----------------------------------------------|
| GET    | `/health`   | Returns server status, CLI capabilities, and project config. |
| GET    | `/capabilities` | Same as above without uptime info.            |
| POST   | `/config`   | Merge and persist configuration changes.      |
| POST   | `/execute`  | Execute Codex / Claude with the provided context. |

Example health response:
```json
{
  "status": "ok",
  "version": "1.1.0",
  "config": {
    "workingDirectory": "/Users/you/projects/marketing",
    "codex": { "model": "gpt-5-codex-high" },
    "claude": { "model": "claude-sonnet-4.5" },
    "projects": [ ... ]
  },
  "cliCapabilities": {
    "codex": { "available": true, "supportsModel": true },
    "claude": { "available": true, "supportsOutputFormat": true }
  }
}
```

## Troubleshooting

- **Port already in use** – run `lsof -nP -iTCP:3456`. Kill the old process or launch with a different `LUMI_PORT`.
- **CLI not detected** – verify `codex --version` / `claude --version`. Clear `configDir/cli-capabilities.json` if detection is stale.
- **Project mismatch** – make sure the page host appears in the project’s `hosts` list (wildcards permitted) and that the project is enabled.
- **Permission errors on macOS/Linux services** – ensure the service script is executable (`chmod +x install-service.js`) and rerun `npm run install-service`.

## Logs

- `server.log` – all requests and CLI stdout/stderr (truncated).
- Temporary screenshots are saved as `screenshot_<timestamp>.png` under `<configDir>` and removed after each run.

## Development

```bash
npm run dev --prefix server  # run server with live logs
npm test --prefix server     # execute test harness
```

The implementation lives entirely in `server.js`. Key helpers:
- `resolveProjectForUrl` – chooses the working directory for each request
- `executeCodex` / `executeClaude` – build CLI args and run the command
- `detectCLI` – caches CLI capabilities for 24 hours

Happy hacking!
