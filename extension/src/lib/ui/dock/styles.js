export const DOCK_STYLES = `
  * { box-sizing: border-box; }
  /* Design tokens (light) mapped to legacy variables for minimal churn */
  .dock {
    /* New tokens */
    --dock-bg: rgba(255,255,255,0.88);
    --dock-stroke: rgba(0,0,0,0.08);
    --dock-fg: #111111;
    --dock-fg-2: #5F6368;
    --icon-opacity: 0.9;
    --success: #10B981;
    --shadow: 0 4px 12px rgba(0,0,0,0.05);
    --radius-panel: 18px;
    --radius-chip: 12px;

    /* Bridge to existing variable names used below */
    --glass-bg: var(--dock-bg);
    --glass-border: var(--dock-stroke);
    --surface: color-mix(in srgb, var(--dock-bg) 96%, transparent);
    --surface-hover: color-mix(in srgb, var(--dock-bg) 90%, transparent);
    --text: var(--dock-fg);
    --text-secondary: var(--dock-fg-2);
    --text-tertiary: var(--dock-fg-2);
    --border: var(--dock-stroke);
    --shadow: var(--shadow);
    --shadow-lg: 0 8px 24px rgba(0,0,0,0.08);
  }

  .dock.dark {
    --dock-bg: rgba(22,22,24,0.88);
    --dock-stroke: rgba(255,255,255,0.12);
    --dock-fg: #F5F5F7;
    --dock-fg-2: #B0B3B8;
    --icon-opacity: 1;
    --success: #34D399;
    --shadow: 0 6px 16px rgba(0,0,0,0.35);
    --radius-panel: 18px;
    --radius-chip: 12px;

    /* Bridge overrides */
    --glass-bg: var(--dock-bg);
    --glass-border: var(--dock-stroke);
    --surface: color-mix(in srgb, var(--dock-bg) 96%, transparent);
    --surface-hover: color-mix(in srgb, var(--dock-bg) 90%, transparent);
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
    backdrop-filter: blur(24px);
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
  .dock.compact { width: 56px; backdrop-filter: blur(12px); }
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
    padding: 14px 18px;
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
  .header-btn { width:34px;height:34px;border-radius:10px;border:1px solid transparent;background:transparent;color:var(--text-secondary);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:transform 0.15s ease, background 0.15s ease, border-color 0.15s ease, color 0.15s ease; }
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

  .tabs { display:flex; gap:14px; padding:12px 16px 8px 16px; border-bottom:1px solid var(--border); background:transparent; }
  .tab { flex:0 0 auto; text-align:center; padding:8px 2px; min-width:70px; font-size:12px; font-weight:500; color:var(--text-secondary); background:transparent; border:none; border-radius:0; cursor:pointer; transition: color 0.15s ease; position:relative; }
  .tab:hover { color:var(--text); }
  .tab::after { content:''; position:absolute; left:0; right:0; bottom:-9px; height:2px; background: transparent; border-radius:1px; transition: background 0.2s ease; }
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

  .chat-item { display: flex; gap: 12px; }
  .chat-item.assistant { align-items: flex-start; color: var(--text-secondary); }
  .chat-item.assistant .avatar {
    width: 28px;
    height: 28px;
    border-radius: 14px;
    background: color-mix(in srgb, var(--dock-bg) 80%, transparent);
  }
  .chat-item.assistant .bubble {
    font-size: 13px;
    line-height: 1.55;
    color: var(--text-secondary);
  }
  .chat-item.assistant .summary {
    font-weight: 500;
    color: var(--text-secondary);
  }
  .chat-item.assistant .details {
    margin-top: 4px;
    font-size: 12px;
    color: var(--hint);
  }

  .chat-item.user { justify-content: flex-end; }
  .chat-item.user .bubble {
    max-width: 70%;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 10px 16px;
    font-size: 13px;
    line-height: 1.6;
    color: var(--text);
    box-shadow: var(--shadow);
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
    backdrop-filter: blur(18px);
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
    border-radius: 20px;
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
    background: color-mix(in srgb, var(--dock-bg) 90%, transparent);
    border: 1px solid var(--border);
    border-radius: var(--radius-chip);
    padding: 4px 10px;
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
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--dock-bg) 90%, transparent);
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
    background: color-mix(in srgb, var(--dock-bg) 92%, transparent);
  }
  .engine .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dock-stroke); }
  .engine.available .dot { background: var(--success); }
  .engine select { border: none; background: transparent; font-size: 12px; color: inherit; outline: none; cursor: pointer; }

  .actions { display: flex; gap: 10px; align-items: center; }
  .icon { width:32px; height:32px; border-radius:16px; border:1px solid var(--border); background: color-mix(in srgb, var(--dock-bg) 94%, transparent); color: var(--text-secondary); display:grid; place-items:center; cursor:pointer; transition: background 0.15s ease, border 0.15s ease, transform 0.08s ease; }
  .icon:hover { background: color-mix(in srgb, var(--dock-bg) 88%, transparent); border-color: color-mix(in srgb, var(--dock-fg) 20%, transparent); }
  .icon:active { transform: scale(0.98); }
  .icon.active {
    background: color-mix(in srgb, var(--dock-bg) 84%, transparent);
    border-color: color-mix(in srgb, var(--dock-fg) 25%, transparent);
    color: var(--text);
  }
  .send {
    padding: 6px 18px;
    border-radius: 18px;
    border: 1px solid color-mix(in srgb, var(--accent) 50%, transparent);
    background: var(--accent);
    color: var(--on-accent);
    font-size: 12px;
    cursor: pointer;
  }
  .send:disabled { opacity: 0.5; cursor: not-allowed; }
`;
