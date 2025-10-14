<p align="center">
  <img src="assets/LUMI.png" alt="LUMI" width="400" />
</p>
<p align="center">
  <strong>👀 See it. Click it. Fix it.</strong>
</p>
<p align="center">
  <img src="assets/lumi_screenshot.png" alt="LUMI in Action" width="700" />
</p>

## Overview

**Lumi lets your AI see.**  
For the first time, you don’t have to describe what’s on your screen — you can *show* it.  
Click what you see, say what you want, and Lumi turns your coding agent into a true visual collaborator.

Lumi is a Chrome extension that connects directly to your coding agent (like **Codex** or **Claude Code**) to enable visual, in-browser editing for any web app.  
No more guessing selectors or typing long prompts — just click, speak, and watch your app update instantly.



## Requirements
- Node.js 20+
- Chrome 115+
- At least one CLI: Codex and or Claude Code CLI

## Quick Start
1. **Install & seed config**
   ```bash
   npm run setup
   ```
   Installs dependencies for `extension/` and `server/`, asks where to store `config.json`, and checks that the CLIs are visible on your `$PATH`.

2. **Run the bridge**
   ```bash
   npm run dev
   ```
   The server listens on `http://127.0.0.1:3456` (use `LUMI_PORT=4567 npm run dev` if you need another port).

3. **Build & load the extension**
   ```bash
   npm run build
   ```
   Then load the `extension/` folder as an unpacked extension via `chrome://extensions`.

## Configure

Open the extension Options Page. Here's what you need to know:

### **🔴 Must Configure (Projects)**
This is **the only section you need to change** for basic usage:

**Projects** - Tell LUMI where your code lives and which sites to work with
- Click "Add" and enter:
  - **Name**: Friendly name (e.g., "My Website")
  - **Working Directory**: Full path to your project folder
  - **Hosts**: Your development server URL (e.g., `localhost:3000`)

**Example for a typical React/Next.js project:**
```
Name: "My App"
Working Directory: "/Users/john/Documents/my-react-app"
Hosts: "localhost:3000"
```

### **🟢 Safe to Ignore (For Now)**
These sections work fine with defaults for most users:

**Connection**
- Server URL: `http://127.0.0.1:3456` ✅ (leave as default)
- Default Engine: Codex ✅ (or change to Claude if preferred)

**Codex/Claude Settings**
- Models, permissions, tools ✅ (defaults are good for beginners)
- Only tweak these if you know what you're doing or your AI suggests changes

### **Test Your Setup**
Click the "Test" button - should show "Connected" in green.

**Pro tip:** If you're unsure about any setting, ask your AI assistant! They can explain what each option does and help you find your working directory and host information.

## Daily Use
1. Keep the server running (`npm run dev`).
2. Visit a mapped host and click the LUMI icon to inject the bubble.
3. Select DOM nodes or grab a screenshot, type your instruction, choose an engine, and send.
   - If you capture a screenshot, the server saves it and (for Claude) appends the local path to the prompt so Claude can inspect it.
4. Watch the bubble for status and review the server log (`~/.lumi/server.log`) if anything fails.

## Troubleshooting
- **Port busy** → `lsof -nP -iTCP:3456` then kill the process, or run with a different `LUMI_PORT` and update the Options Page.
- **CLI not found** → ensure `codex --version` / `claude --version` work in the same shell; delete `<configDir>/cli-capabilities.json` to refresh detection.
- **“Not configured for this page”** → add the current host in the Projects panel and save.

Happy building ❤️
