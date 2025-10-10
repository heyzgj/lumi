# LUMI Server

The server is a small Express app that receives context from the LUMI Chrome extension and runs Codex or Claude Code inside the mapped project directory.

## Install
```bash
npm run setup        # from repo root (recommended)
# or
cd server && npm install
```

## Run
```bash
npm run dev          # logs to stdout
# or
npm start            # production mode
```
Use `LUMI_PORT=4567 npm run dev` to change the port. Logs live in `<configDir>/server.log` (default `~/.lumi`).

## Configuration
Settings are stored in `<configDir>/config.json`. Example:
```json
{
  "defaultEngine": "codex",
  "codex": { "model": "gpt-5-codex-high", "sandbox": "workspace-write" },
  "claude": { "model": "claude-sonnet-4.5", "outputFormat": "json" },
  "projects": [
    {
      "id": "marketing",
      "name": "Marketing",
      "workingDirectory": "/Users/you/projects/marketing",
      "hosts": ["localhost:3000", "*.staging.example.com"]
    }
  ]
}
```
The Options Page writes to this file via `POST /config`, so you rarely need to edit it by hand. Screenshots are saved in the same directory as `screenshot_<timestamp>.png` and cleaned up after each request.

## Endpoints
| Method | Path        | Notes                                   |
|--------|-------------|-----------------------------------------|
| GET    | `/health`   | Status + CLI capabilities + config.     |
| GET    | `/capabilities` | Same info without uptime/metadata.       |
| POST   | `/config`   | Merge and persist settings.             |
| POST   | `/execute`  | Run Codex/Claude for the given context. |

When a project mapping exists, `/execute` chooses the working directory based on the page host. If nothing matches, it returns `NO_PROJECT_MATCH` and the extension blocks the request.

## Tips
- Restart the server after updating global CLI installations.
- Clear `<configDir>/cli-capabilities.json` to force capability re-detection.
- Use `npm run uninstall-service` if you previously installed the service and want to stop it from auto-starting.

That’s it.
