export const DOCK_STYLES = `
  * { box-sizing: border-box; }
  /* Design tokens (light) mapped to legacy variables for minimal churn */
  .dock {
    /* New tokens */
    --dock-bg: #ffffff;
    --dock-stroke: rgba(0,0,0,0.08);
    --dock-fg: #111111;
    --dock-fg-2: #5F6368;
    --icon-opacity: 0.9;
    --success: #10B981;
    --shadow: 0 4px 12px rgba(0,0,0,0.05);
    --radius-panel: 18px;
    --radius-chip: 8px;
    --header-height: 56px;

    /* Bridge to existing variable names used below */
    --glass-bg: var(--dock-bg);
    --glass-border: var(--dock-stroke);
    /* Solid surfaces derived from base to avoid background bleed */
    --surface: #f7f7f8;
    --surface-hover: #f0f0f3;
    --text: var(--dock-fg);
    --text-secondary: var(--dock-fg-2);
    --text-tertiary: var(--dock-fg-2);
    --border: var(--dock-stroke);
    --shadow: var(--shadow);
    --shadow-lg: 0 8px 24px rgba(0,0,0,0.08);
  }

  .dock.dark {
    --dock-bg: #161618;
    --dock-stroke: rgba(255,255,255,0.12);
    --dock-fg: #F5F5F7;
    --dock-fg-2: #B0B3B8;
    --icon-opacity: 1;
    --success: #34D399;
    --shadow: 0 6px 16px rgba(0,0,0,0.35);
    --radius-panel: 18px;
    --radius-chip: 8px;

    /* Bridge overrides */
    --glass-bg: var(--dock-bg);
    --glass-border: var(--dock-stroke);
    --surface: #1e1f22;
    --surface-hover: #232528;
    --text: var(--dock-fg);
    --text-secondary: var(--dock-fg-2);
    --text-tertiary: var(--dock-fg-2);
    --border: var(--dock-stroke);
    --shadow: var(--shadow);
    --shadow-lg: 0 8px 24px rgba(0,0,0,0.5);
  }

  .dock {
    position: fixed;
    top: 0;
    right: 0;
    height: 100vh;
    width: 420px;
    background: var(--glass-bg);
    text-align: left;
    border-left: 1px solid var(--glass-border);
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: var(--text);
    z-index: 2147483646;
    transition: width 0.2s cubic-bezier(0.22, 1, 0.36, 1), backdrop-filter 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .dock.compact { width: 56px; }
  .dock.compact .project { display: none; }
  .dock.compact .tabs,
  .dock.compact .body,
  .dock.compact .composer-top,
  .dock.compact .engine,
  .dock.compact .send { display: none !important; }
  .dock.compact .header { justify-content: center; padding: 8px; }
  .dock.compact .toolbar { justify-content: center; }
  .dock.compact .actions { flex-direction: column; gap: 8px; }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--header-height);
    padding: 0 18px;
    border-bottom: 1px solid var(--glass-border);
  }
  .project {
    font-weight: 600;
    font-size: 13px;
    color: var(--text);
    max-width: 260px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .header-btn { width:32px;height:32px;border-radius:10px;border:1px solid transparent;background:transparent;color:var(--text-secondary);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:transform 0.15s ease, background 0.15s ease, border-color 0.15s ease, color 0.15s ease; }
  .header-btn svg {
    width: 18px;
    height: 18px;
    stroke: currentColor;
    stroke-width: 1.5;
    transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .header-btn.header-toggle svg.collapsed {
    transform: scaleX(-1);
  }
  .header-btn:hover { color: var(--text); border-color: color-mix(in srgb, var(--dock-fg) 20%, transparent); }
  .header-btn:active { transform: scale(0.98); }
  .header-btn.header-close { border:1px solid transparent; background: transparent; color: var(--text-secondary); font-size:18px; }
  .header-btn.header-close:hover { color: var(--text); border-color: color-mix(in srgb, var(--dock-fg) 20%, transparent); }

  .tabs { display:flex; gap:18px; padding:0 16px; height: 44px; align-items:center; border-bottom:1px solid var(--border); background: var(--glass-bg); }
  .tab { flex:0 0 auto; text-align:center; padding:0 2px; min-width:auto; font-size:12px; font-weight:500; color:var(--text-secondary); background:transparent; border:none; border-radius:0; cursor:pointer; transition: color 0.15s ease; position:relative; }
  .tab:hover { color:var(--text); }
  .tab::after { content:''; position:absolute; left:20%; right:20%; bottom:-2px; height:2px; background: transparent; border-radius:1px; transition: background 0.2s ease; }
  .tab.active { color:var(--text); font-weight:600; }
  .tab.active::after { background: color-mix(in srgb, var(--dock-fg) 28%, transparent); }
  .tab:focus-visible { outline:none; }

  .body {
    flex: 1;
    padding: 18px 22px;
    overflow-y: auto;
  }
  .placeholder { color: var(--hint); font-size: 13px; text-align: center; padding: 32px 0; }

  #chat-pane.view-hidden,
  #history-pane.view-hidden { display: none; }
  #chat-pane.view-active,
  #history-pane.view-active { display: block; }

  /* Chat */
  .chat-list { display: flex; flex-direction: column; gap: 20px; }
  .chat-empty { color: var(--hint); font-size: 13px; text-align: center; padding: 40px 0; }

  /* Windsurf-style messages: no avatar, left border for status */
  .msg {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: var(--surface);
    border-radius: 8px;
    border-left: 3px solid transparent;
    margin-bottom: 8px;
  }
  .msg.assistant.success { border-left-color: var(--success); }
  .msg.assistant.error { border-left-color: #EF4444; }
  
  .msg .summary {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 500;
    font-size: 14px;
    color: var(--text);
  }
  .msg .summary .icon {
    font-size: 16px;
  }
  .msg .summary .text {
    flex: 1;
  }
  
  .msg details {
    margin-top: 4px;
    cursor: pointer;
  }
  .msg details summary {
    padding: 6px 0;
    color: var(--text-secondary);
    font-size: 13px;
    user-select: none;
    list-style: none;
  }
  .msg details summary::-webkit-details-marker { display: none; }
  .msg details summary::before {
    content: '▼ ';
    display: inline-block;
    margin-right: 4px;
    font-size: 10px;
    transition: transform 0.15s;
  }
  .msg details[open] summary::before {
    transform: rotate(180deg);
  }
  .msg details summary:hover {
    color: var(--text);
  }
  .msg .details-content {
    padding-top: 8px;
    font-size: 13px;
    line-height: 1.6;
    color: var(--text);
  }
  
  /* File list inside details */
  .msg .file-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 8px;
  }
  .msg .file-item {
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 12px;
    background: var(--glass-bg);
  }
  .msg .file-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }
  .msg .file-icon {
    font-size: 14px;
  }
  .msg .file-name {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    color: var(--text);
  }
  .msg .file-meta {
    font-size: 11px;
    color: var(--text-secondary);
    margin-top: 4px;
  }

  /* Markdown basics inside dock */
  .md-p { margin: 6px 0; }
  .md-h { margin: 10px 0 6px; font-weight: 600; }
  .md-list { padding-left: 18px; margin: 6px 0; }
  .md-code { background: #0f172a0d; border: 1px solid var(--border); border-radius: 10px; padding: 10px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; overflow:auto; }
  .md-code-inline { background: #0f172a1a; border: 1px solid var(--border); border-radius: 4px; padding: 1px 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  .md a { color: var(--text); text-decoration: underline; }

  /* Change list (collapsed by default, preview-only) */
  .change-list { display: flex; flex-direction: column; gap: 8px; }
  .change-row { display:flex; align-items:center; justify-content: space-between; gap: 12px; padding: 8px 10px; border: 1px dashed var(--border); border-radius: 10px; }
  .change-path { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px; }
  .change-meta { font-size: 12px; color: var(--text-secondary); }

  .msg.user {
    background: var(--glass-bg);
    border-left: 3px solid #3B82F6;
  }
  .msg.user .bubble {
    font-size: 13px;
    line-height: 1.6;
    color: var(--text);
  }

  /* History */
  .history-list { display: flex; flex-direction: column; gap: 14px; }
  .history-new {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 0;
    border-radius: 999px;
    border: none;
    background: transparent;
    font-size: 12px;
    color: var(--text-secondary);
    cursor: pointer;
    margin-bottom: 6px;
  }
  .history-new:hover { color: var(--text); }

  .history-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 18px;
    border: 1px solid var(--border);
    border-radius: var(--radius-panel);
    background: var(--surface);
    box-shadow: var(--shadow);
    transition: box-shadow 0.2s ease, border-color 0.2s ease;
  }
  .history-row.active { border-color: color-mix(in srgb, var(--dock-fg) 25%, transparent); box-shadow: var(--shadow-lg); }
  .history-row:hover .history-actions { opacity: 1; }

  .history-main { min-width: 0; }
  .history-title { font-size: 13px; font-weight: 500; color: var(--text); max-width: 48ch; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .history-meta { margin-top: 4px; font-size: 12px; color: var(--hint); display: flex; align-items: center; gap: 6px; }
  .status-dot { width: 6px; height: 6px; border-radius: 3px; background: var(--dock-stroke); }
  .status-dot.ok { background: var(--success); }

  .history-actions { display: flex; gap: 6px; opacity: 0; transition: opacity 0.15s ease; }
  .history-actions button {
    border: 1px solid var(--border);
    background: var(--surface);
    padding: 5px 10px;
    border-radius: 999px;
    font-size: 12px;
    color: var(--text-secondary);
    cursor: pointer;
  }
  .history-actions button:hover { color: var(--text); }
  .history-row.renaming .history-actions { opacity: 1; }
  .history-rename {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    padding: 6px 10px;
    font-size: 13px;
    color: var(--text);
    outline: none;
  }
  .history-rename:focus { border-color: color-mix(in srgb, var(--dock-fg) 25%, transparent); }
  .history-row.renaming .history-meta {
    opacity: 0.6;
  }

  /* Composer */
  .footer { border-top: 1px solid var(--glass-border); padding: 12px 18px 16px; display: flex; flex-direction: column; gap: 10px; }

  .composer-top {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: var(--surface);
    padding: 10px 14px;
    cursor: text;
  }
  .composer-top .editor {
    flex: 1;
    min-height: 24px;
    outline: none;
    font-size: 13px;
    line-height: 1.6;
    cursor: text;
    white-space: pre-wrap;
    word-break: break-word;
    text-align: left;
  }
  .composer-top .editor:empty:before {
    content: attr(data-placeholder);
    color: var(--text-secondary);
    pointer-events: none;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius-chip);
    padding: 2px 8px;
    font-size: 12px;
    color: var(--text-secondary);
  }
  .chip.edited::after {
    content: '';
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--success);
    box-shadow: 0 0 0 1px var(--surface);
  }
  .chip button { border: none; background: transparent; padding: 0; cursor: pointer; color: inherit; }
  .chip .x { margin-left: 4px; opacity: 0.7; }
  .chip .x:hover { opacity: 1; }

  .input { flex: 1; min-width: 160px; outline: none; font-size: 13px; line-height: 1.6; }
  .input:empty:before { content: attr(data-placeholder); color: var(--hint); }

  .toolbar { display: flex; align-items: center; justify-content: space-between; }
  .engine {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--text-secondary);
    padding: 4px 12px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
  }
  .engine .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dock-stroke); }
  .engine.available .dot { background: var(--success); }
  .engine select { border: none; background: transparent; font-size: 12px; color: inherit; outline: none; cursor: pointer; }

  .actions { display: flex; gap: 10px; align-items: center; }
  .icon { width:32px; height:32px; border-radius:16px; border:1px solid var(--border); background: var(--surface); color: var(--text-secondary); display:grid; place-items:center; cursor:pointer; transition: background 0.15s ease, border 0.15s ease, transform 0.08s ease; }
  .icon:hover { background: var(--surface-hover); border-color: color-mix(in srgb, var(--dock-fg) 20%, transparent); }
  .icon:active { transform: scale(0.98); }
  .icon.active { background: var(--surface-hover); border-color: color-mix(in srgb, var(--dock-fg) 25%, transparent); color: var(--text); }
  .send {
    padding: 6px 14px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--accent) 50%, transparent);
    background: var(--accent);
    color: var(--on-accent);
    font-size: 12px;
    cursor: pointer;
  }
  .send:disabled { opacity: 0.5; cursor: not-allowed; }
`;
