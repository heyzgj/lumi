<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img src="assets/LUMI.png" alt="LUMI" width="500" />
</p>

<p align="center">
  Visual Editors for Coding Agents.
</p>
<p align="center">
  <a href="https://deepwiki.com/heyzgj/lumi"><img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki"></a>
</p>
<p align="center">
  <img src="assets/demo_showcase.gif" alt="LUMI DEMO" width="700" />
</p>

## What is Lumi?

Lumi is a Chrome extension that turns your visual edits and annotations into high‑fidelity context for tools like Cursor, Antigravity, Windsurf, Lovable, or your own CLI. Every click and tweak is captured as structured data — DOM diffs, computed styles, and screenshots — so your AI can actually “see” the UI and ship the right code on the first try.

## Key Features

1. **Visual Editor**  
   Click any element to adjust spacing, colors, typography, and layout with live preview. Lumi records every change as a precise DOM/CSS diff.

2. **Annotation Mode**  
   Draw, highlight, and comment directly on top of the UI. Use it to describe flows, logic changes, and refactors visually.

3. **Take Your Context Anywhere**  
   One click “Copy Prompt” exports diffs + screenshots + intent into a portable context block you can drop into Cursor, Claude, Windsurf, Lovable, etc.

4. **Run With Local Agents** 
   Wire Lumi to your local CLI (e.g. Codex or Claude Code). Send visual context straight from the browser to your terminal, keeping the whole loop in one place.

## Upcoming Features

1. **Real time AI generated preview**  
2. **Support more CLI coding agents**  


## Requirements

**Core:**
- Node.js 20+
- Chrome 115+

**Optional (for Chat Mode):**
- One or more supported AI CLIs (see below)

*(Not required if you only plan to use the "Copy Prompt" feature with Cursor/Lovable)*

## Supported Providers

LUMI works with the following AI coding agents:

<details>
<summary><b>OpenAI Codex</b> - <code>codex</code></summary>

### Installation
Follow the official [Codex CLI](https://github.com/openai/codex) installation guide.

### Authentication
Browser-based OAuth login. Just install and run once to authenticate:
```bash
codex --version   # Will prompt to login if needed
```

No API key required for LUMI integration.
</details>

<details>
<summary><b>Claude Code</b> - <code>claude</code></summary>

### Installation
Follow the official [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installation guide.

### Authentication
Browser-based OAuth login. Just install and run once to authenticate:
```bash
claude --version  # Will prompt to login if needed
```

No API key required for LUMI integration.
</details>

<details>
<summary><b>Factory Droid</b> - <code>droid</code> ⚠️ <em>Requires API Key</em></summary>

### Installation
```bash
curl -fsSL https://app.factory.ai/cli | sh
```

See [Droid CLI docs](https://docs.factory.ai/cli/droid-exec/overview) for more details.

### Authentication
Droid's non-interactive mode (`droid exec`) requires an API key:

1. **Get your API key** from [Factory Settings](https://app.factory.ai/settings/api-keys)
2. **Export it in your environment** (before starting LUMI server):
   ```bash
   export FACTORY_API_KEY=fk-...
   ```
3. Then start the server: `npm run dev`

> **Important:** The `FACTORY_API_KEY` must be set in the same terminal session where you run the LUMI server.
</details>


## Quick Start

### Option 1: Download Pre-built Extension (Fastest)

1. Download `lumi-extension.zip` from [Latest Release](https://github.com/heyzgj/lumi/releases/latest)
2. Unzip the file
3. Open Chrome → `chrome://extensions`
4. Enable "Developer mode" (top right)
5. Click "Load unpacked" → Select the unzipped folder

> **Note:** This only includes the extension. For Chat Mode with local CLI agents, you'll also need to run the server (see Option 2 or 3).

### Option 2: One-Command Setup (Recommended for Chat Mode)

```bash
npx create-lumi lumi
cd lumi
```

This will clone, install dependencies, build the extension, and start the server.

**Then load the extension in Chrome:**
1. Open `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked" → select the `extension` folder

### Option 3: Manual Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/heyzgj/lumi
   cd lumi
   ```

2. **Install & seed config**
   ```bash
   npm run setup
   ```
   Installs dependencies for `extension/` and `server/`, asks where to store `config.json`, and checks that the CLIs are visible on your `$PATH`.

3. **Run the server**
   ```bash
   npm run dev
   ```
   The server listens on `http://127.0.0.1:3456` (use `LUMI_PORT=4567 npm run dev` if you need another port).

4. **Build & load the extension**
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
  - **Working Directory**: Full path to your project folder
  - **Hosts**: Your development server URL (e.g., `localhost:3000`)

**Example for a typical React/Next.js project:**
```
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
1. Start Server: npm run dev in your lumi directory.
2. Launch: Visit a mapped host and click the LUMI icon to open the extension.
3. **Workflow:**
   - **Inspect**: Click the Cursor icon to select and edit elements.
   - **Edit directly**: Click any selected element's chip to open the edit modal
   - **Annotate**: Click the Annotation Mode icon to draw overlays and explain intent.
   - **Export**: Click "Copy Prompt" to paste into Cursor/Claude, or "Send" to run via local CLI.

## Troubleshooting
- **Port busy** → `lsof -nP -iTCP:3456` then kill the process, or run with a different `LUMI_PORT` and update the Options Page.
- **CLI not found** → ensure `codex --version` / `claude --version` / `droid --version` work in the same shell; delete `<configDir>/cli-capabilities.json` to refresh detection.
- **Droid not working** → make sure `FACTORY_API_KEY` is exported in the terminal before starting the server.
- **"Not configured for this page"** → add the current host in the Projects panel and save.
- **Dock not appearing** → Reload the page and click the launcher orb in the bottom-right corner.

Happy building ❤️