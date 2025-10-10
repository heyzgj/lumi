# LUMI

LUMI is a toolkit that lets you describe UI edits in the browser and apply them locally through AI CLIs.

- **Chrome extension** – injects a bubble UI into any page so you can select DOM nodes or capture screenshots, type your instructions, and send the request.
- **Local server** – receives the request, builds a prompt, and calls the Codex or Claude Code CLI inside the target project directory.

The extension and server talk over `http://127.0.0.1:3456`. Nothing is uploaded to the cloud unless your CLI does it.

## Requirements

- Node.js 20+ (18 works but 20 is recommended)
- Chrome 115+
- At least one CLI: `codex` (OpenAI Codex CLI) and/or `claude` (Claude Code CLI)

## Quick Start

1. **Install everything**
   ```bash
   npm run setup
   ```
   The script installs dependencies for `extension/` and `server/`, asks where to store config (`~/.lumi` or `./.lumi`), creates `config.json`, and checks whether `codex` / `claude` are on your `$PATH`.

2. **Start the bridge**
   ```bash
   npm run dev
   ```
   The server listens on `http://127.0.0.1:3456`. Use `LUMI_PORT=4567 npm run dev` to change the port.

3. **Build the extension**
   ```bash
   npm run build
   ```
   Then load `extension/` as an unpacked extension via `chrome://extensions` (Developer Mode → “Load unpacked”).

4. **Configure the extension**
   On first load Chrome opens the Options Page automatically:
   - Enter the server URL (defaults to `http://127.0.0.1:3456`).
   - Choose a default engine (Codex or Claude).
   - In **Projects** add one row per local project: provide a working directory and the host patterns it applies to (supports wildcards such as `*.localhost:3000`). Pages not matched by any project cannot submit requests.
   - Adjust Codex / Claude flags if needed.
   - Click **Test Connection**, then **Save Settings**.

5. **Use it**
   - Visit one of the mapped hosts.
   - Click the LUMI icon to inject the bubble.
   - Select elements or capture a screenshot, describe the change, pick an engine, and press **Send**.
   - The server runs the CLI in your mapped working directory. On success the bubble shows a confirmation and clears the context.

## Daily Workflow

```bash
# 1) Halting server previously? CTRL+C.
# 2) Start server (keep this terminal open)
npm run dev

# 3) Optional: rebuild extension when you edit source
npm run build
# Refresh the extension in chrome://extensions
```

If you change the server port or move a project folder, update the Options Page and click **Save Settings** so the background worker can sync the new config to the server.

## Development

```bash
npm run setup           # install deps + seed config
npm run dev             # run the bridge (server)
npm run build           # rollup build for the extension
npm run test --prefix extension
npm run test --prefix server
npm run package:extension  # optional helper
```

Source layout:

- `extension/src/` – modular content script + UI components
- `extension/options.*` – Options Page assets
- `server/server.js` – Express server & CLI runner
- `docs/` – product notes, PRD, UI specs

## Configuration File

The server keeps settings in `<configDir>/config.json` (default `~/.lumi/config.json`). Example:

```json
{
  "defaultEngine": "codex",
  "serverUrl": "http://127.0.0.1:3456",
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
      "name": "Marketing Site",
      "workingDirectory": "/Users/you/projects/marketing",
      "hosts": ["localhost:3000", "*.staging.example.com"]
    }
  ]
}
```

The Options Page is the easiest way to edit this file; it writes through to the server using `POST /config`.

## Troubleshooting

- **`EADDRINUSE 127.0.0.1:3456`** – another process is on the port. Run `lsof -nP -iTCP:3456` and kill it, or start LUMI with `LUMI_PORT=4567` and update the Options Page.
- **Bubble says “not configured for this page”** – add the current host to a project in the Options Page and save.
- **CLI not detected** – make sure `codex --version` / `claude --version` succeed in a terminal. Clear `~/.lumi/cli-capabilities.json` if detection gets stuck.
- **Changes not applied** – check the server logs in `~/.lumi/server.log`. The response from `/execute` is also shown in the bubble.

## License

MIT (planned). Add a `LICENSE` file before distributing.
