<p align="center">
  <img src="assets/LUMI.png" alt="LUMI" width="500" />
</p>

<p align="center">
  Visual Prompt Layer for Coding Agents.
</p>
<p align="center">
  <a href="https://deepwiki.com/heyzgj/lumi"><img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki"></a>
</p>
<p align="center">
  <video src="assets/demo_showcase.mp4" width="700" controls></video>
</p>

## What is Lumi?

Lumi is a Chrome extension that turns your visual edits and annotations into high‑fidelity context for tools like Cursor, Antigravity, Windsurf, Lovable, or your own CLI. Every click and tweak is captured as structured data — DOM diffs, computed styles, and screenshots — so your AI can actually “see” the UI and ship the right code on the first try.

## Key Features

1. **Visual DOM Editor (WYSIWYG)**  
   Click any element to adjust spacing, colors, typography, and layout with live preview. Lumi records every change as a precise DOM/CSS diff.

2. **Intent‑Based Annotation**  
   Draw, highlight, and comment directly on top of the UI. Use it to describe flows, logic changes, and refactors visually.

3. **Universal Context Export**  
   One click “Copy Prompt” exports diffs + screenshots + intent into a portable context block you can drop into Cursor, Claude, Windsurf, Lovable, etc.

4. **Native CLI Integration** *(Optional)*  
   Wire Lumi to your local CLI (e.g. Codex or Claude Code). Send visual context straight from the browser to your terminal, keeping the whole loop in one place.

## Upcoming Features

1. **Real time AI generated preview**  
2. **Support more CLI coding agents like gemini CLI**  


## Requirements

**Core:**
- Node.js 20+
- Chrome 115+

**Optional (for AI Mode):**
- Codex CLI and/or Claude Code
*(Not required if you only plan to use the "Copy Prompt" feature with Cursor/Lovable)*


## Quick Start
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
- **CLI not found** → ensure `codex --version` / `claude --version` work in the same shell; delete `<configDir>/cli-capabilities.json` to refresh detection.
- **"Not configured for this page"** → add the current host in the Projects panel and save.
- **Dock not appearing** → Reload the page and click the launcher orb in the bottom-right corner.

Happy building ❤️