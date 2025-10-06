# LUMI Server

Local HTTP server that bridges the Chrome extension with AI CLIs (Codex/Claude).

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd server
npm install
```

### 2. Configure (Optional)

Create `~/.lumi/config.json`:

```json
{
  "workingDirectory": "/path/to/your/project",
  "codexModel": "gpt-5-codex",
  "codexApprovals": "read-only",
  "codexDisableNetwork": true,
  "claudeOutputFormat": "json",
  "claudeTools": ["TextEditor", "Read"]
}
```

If not configured, server will use current directory as working directory.

### 3. Start Server

```bash
npm start
```

Server will run on `http://127.0.0.1:3456`

### 4. Test Server

```bash
npm test
```

### 5. Install as Service (Auto-start on boot)

```bash
npm run install-service
```

---

## 📖 Usage

### Manual Start

```bash
cd server
npm start
```

Or with dev mode (shows console output):

```bash
npm run dev
```

### Auto-start (Service)

After installing the service, it will automatically start on system boot.

**macOS:**
```bash
# Start
launchctl start com.lumi.server

# Stop
launchctl stop com.lumi.server

# Status
launchctl list | grep lumi

# View logs
tail -f ~/.lumi/server.log
```

**Linux:**
```bash
# Start
systemctl --user start lumi-server

# Stop
systemctl --user stop lumi-server

# Status
systemctl --user status lumi-server

# View logs
journalctl --user -u lumi-server -f
```

### Uninstall Service

```bash
npm run uninstall-service
```

---

## 🔧 Configuration

Configuration file: `~/.lumi/config.json`

| Option | Description | Default |
|--------|-------------|---------|
| `workingDirectory` | Project directory for CLI execution | Current directory |
| `codexModel` | Codex model to use | `gpt-5-codex` |
| `codexApprovals` | Approval level: `auto`, `read-only`, `full` | `read-only` |
| `codexDisableNetwork` | Disable network access | `true` |
| `claudeOutputFormat` | Claude output format | `json` |
| `claudeTools` | Allowed tools for Claude | `["TextEditor", "Read"]` |

---

## 📡 API Endpoints

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime": 123.45,
  "config": {
    "workingDirectory": "/path/to/project",
    "cliCapabilities": { ... }
  }
}
```

### GET /capabilities

Get CLI capabilities.

**Response:**
```json
{
  "cliCapabilities": {
    "codex": {
      "available": true,
      "version": "codex-cli 0.41.0",
      "supportsImage": true
    },
    "claude": {
      "available": true,
      "version": "1.0.67 (Claude Code)"
    }
  }
}
```

### POST /execute

Execute AI CLI.

**Request:**
```json
{
  "engine": "codex",
  "context": {
    "intent": "Make the text blue",
    "pageUrl": "https://example.com",
    "pageTitle": "Example",
    "selectionMode": "element",
    "element": { ... },
    "screenshot": "data:image/png;base64,..."
  }
}
```

**Response:**
```json
{
  "success": true,
  "output": "...",
  "engine": "codex",
  "duration": 15230,
  "timestamp": 1696507200000
}
```

---

## 📝 Logs

Log files are stored in `~/.lumi/`:

- `server.log` - Main server log
- `server-stdout.log` - Service stdout (when running as service)
- `server-stderr.log` - Service stderr (when running as service)

**View logs:**
```bash
# Main log
tail -f ~/.lumi/server.log

# Service logs (macOS)
tail -f ~/.lumi/server-stdout.log
tail -f ~/.lumi/server-stderr.log

# Service logs (Linux)
journalctl --user -u lumi-server -f
```

---

## 🐛 Troubleshooting

### Server won't start

**Check if port is in use:**
```bash
lsof -i :3456
```

**Use different port:**
```bash
LUMI_PORT=3457 npm start
```

### CLIs not detected

**Check PATH:**
```bash
which codex
which claude
```

**Verify CLI works:**
```bash
codex --version
claude --version
```

**Clear cache and restart:**
```bash
rm ~/.lumi/cli-capabilities.json
npm start
```

### Permission denied

**Make scripts executable:**
```bash
chmod +x server.js
chmod +x install-service.js
```

### Service won't start (Linux)

**Enable lingering:**
```bash
sudo loginctl enable-linger $USER
```

**Check systemd status:**
```bash
systemctl --user status lumi-server
```

---

## 🔒 Security

- Server binds to `127.0.0.1` (localhost only) - not accessible from network
- CORS enabled for Chrome extension origins only
- CLI execution uses spawn (no shell injection)
- Screenshot files auto-deleted after use
- No arbitrary code execution - AI output treated as data

---

## 📊 Performance

- Request timeout: 60 seconds
- Screenshot size limit: 10MB
- CLI execution timeout: 60 seconds
- Auto-restart on crash (when running as service)

---

## 🔄 Updates

**Update server:**
```bash
cd server
git pull  # or download new version
npm install
npm run uninstall-service
npm run install-service
```

---

## ❓ FAQ

**Q: Do I need to keep terminal open?**  
A: No, after installing as service, it runs in background.

**Q: Can I run multiple instances?**  
A: Yes, use different ports with `LUMI_PORT` environment variable.

**Q: Does it work on Windows?**  
A: Yes, but service installation is manual (see install-service.js output).

**Q: Can others use this?**  
A: Yes! Just share the server/ directory and installation instructions.

**Q: Where are screenshots stored?**  
A: Temporarily in `~/.lumi/screenshot_*.png`, auto-deleted after use.

---

## 📦 Distribution

To share with others:

1. Package the server directory:
   ```bash
   tar -czf lumi-server.tar.gz server/
   ```

2. Share with instructions:
   - Extract archive
   - Run `npm install`
   - Run `npm start` or `npm run install-service`
   - Configure in `~/.lumi/config.json`

---

**Need help?** Check the main [README.md](../README.md) or open an issue.

