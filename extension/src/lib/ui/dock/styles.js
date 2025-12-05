export const DOCK_STYLES = `
  * { box-sizing: border-box; }

  .dock.dark {
    /* Dark mode handled by tokens.css via .dark selector */
  }

  .dock {
    position: fixed;
    top: 0;
    right: 0;
    height: 100vh;
    width: 420px;
    background: var(--dock-bg);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    text-align: left;
    border-left: 1px solid var(--dock-stroke);
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: var(--dock-fg);
    z-index: 2147483646;
    transition: width 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), backdrop-filter 0.3s ease;
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
    border-bottom: 1px solid var(--dock-stroke);
  }
  .project {
    font-weight: 600;
    font-size: 13px;
    color: var(--dock-fg);
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
  .header-btn { width:32px;height:32px;border-radius:10px;border:1px solid transparent;background:transparent;color:var(--dock-fg-2);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); }
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
  .header-btn:hover { color: var(--dock-fg); border-color: color-mix(in srgb, var(--dock-fg) 10%, transparent); background: color-mix(in srgb, var(--dock-fg) 5%, transparent); transform: translateY(-1px); }
  .header-btn:active { transform: scale(0.94); }
  .header-btn.header-close { border:1px solid transparent; background: transparent; color: var(--dock-fg-2); font-size:18px; }
  .header-btn.header-close:hover { color: var(--dock-fg); border-color: color-mix(in srgb, var(--dock-fg) 10%, transparent); background: color-mix(in srgb, var(--dock-fg) 5%, transparent); transform: translateY(-1px); }

  .tabs { display:flex; gap:18px; padding:0 16px; height: 44px; align-items:center; border-bottom:1px solid var(--dock-stroke); background: transparent; }
  .tab { flex:0 0 auto; text-align:center; padding:0 2px; min-width:auto; font-size:12px; font-weight:500; color:var(--dock-fg-2); background:transparent; border:none; border-radius:0; cursor:pointer; transition: all 0.2s ease; position:relative; }
  .tab:hover { color:var(--dock-fg); transform: translateY(-1px); }
  .tab::after { content:''; position:absolute; left:20%; right:20%; bottom:-2px; height:2px; background: transparent; border-radius:1px; transition: background 0.2s ease; }
  .tab.active { color:var(--dock-fg); font-weight:600; transform: none; }
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
  #chat-pane.view-active { display: block; }

  /* Chat */
  .chat-list { display: flex; flex-direction: column; gap: 22px; }
  .chat-empty { color: var(--hint); font-size: 13px; text-align: center; padding: 40px 0; }

  /* Amp-style messages: user has border, assistant plain */
  .msg {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    margin-bottom: 8px;
  }
  .msg.assistant {
    background: transparent;
    border: none;
    padding-left: 0;
    padding-top: 16px;
    gap: 4px;
  }
  .msg.user {
    background: color-mix(in srgb, var(--dock-fg) 3%, transparent);
    border: none;
    border-left: 3px solid color-mix(in srgb, var(--dock-fg) 25%, transparent);
    border-radius: 0;
    padding-left: 14px;
    padding-right: 8px;
  }
  
  .msg .summary {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 500;
    font-size: 14px;
    color: var(--dock-fg);
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
    color: var(--dock-fg-2);
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
    color: var(--dock-fg);
  }
  .msg .details-content {
    padding-top: 8px;
    font-size: 13px;
    line-height: 1.6;
    color: var(--dock-fg);
  }
  .assistant-result {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .assistant-result .summary {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .assistant-result .summary .meta {
    margin-left: auto;
    font-size: 12px;
    color: var(--dock-fg-2);
  }
  .assistant-result .result-body {
    font-size: 13px;
    color: var(--dock-fg);
    line-height: 1.6;
  }
  .assistant-result .result-files {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .assistant-result .result-files-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--dock-fg-2);
  }
  .assistant-result .result-file-row {
    font-size: 12px;
    color: var(--dock-fg);
  }
  .assistant-result .result-file-meta {
    font-size: 11px;
    color: var(--dock-fg-2);
    margin-left: 4px;
  }
  .assistant-timeline {
    margin-top: 6px;
  }
  .assistant-timeline.collapsed {
    margin-top: 2px;
  }
  .assistant-timeline + .assistant-summary {
    margin-top: 8px;
  }
  .assistant-timeline.collapsed + .assistant-summary {
    margin-top: 4px;
  }
  .timeline-feed {
    margin: 0;
    padding-left: 0;
    list-style-type: none;
    color: var(--dock-fg);
    font-size: 13px;
  }
  .timeline-feed .timeline-item {
    margin: 8px 0;
    padding-left: 12px;
    border-left: 1px solid transparent;
    color: var(--dock-fg);
    transition: border-color 0.2s ease;
  }
  .timeline-feed .timeline-item:hover {
    border-left-color: var(--dock-stroke);
  }
  .timeline-placeholder {
    font-size: 12px;
    color: var(--dock-fg-2);
    font-style: italic;
  }
  .feed-header {
    font-size: 13px;
    font-weight: 500;
    color: var(--dock-fg-2);
    margin-bottom: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .feed-header .working-label {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .feed-header .working-dots {
    display: inline-block;
    overflow: hidden;
    vertical-align: bottom;
    width: 0;
    animation: dock-dots 1s steps(3, end) infinite;
  }
  .assistant-summary {
    margin-top: 0px;
    font-size: 13px;
    color: var(--dock-fg);
  }
  .assistant-summary .summary-meta {
    font-size: 11px;
    color: var(--dock-fg-2);
    margin-bottom: 6px;
    opacity: 0.7;
  }
  .assistant-summary .summary-title {
    font-weight: 400;
    margin-bottom: 4px;
    font-size: 13px;
  }
  .assistant-summary .summary-body {
    color: var(--dock-fg);
    font-weight: 400;
    font-size: 13px;
    line-height: 1.6;
  }
  .timeline-toggle {
    background: transparent;
    border: none;
    color: var(--dock-fg-2);
    cursor: pointer;
    font-size: 12px;
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  .feed-header:hover .timeline-toggle {
    opacity: 1;
  }
  .assistant-result .result-skeleton {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .assistant-result .result-skeleton-line {
    height: 10px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--dock-fg-2) 18%, transparent);
    animation: dock-skeleton 1.4s ease infinite;
  }
  .assistant-result .spinner {
    width: 14px;
    height: 14px;
    border-radius: 7px;
    border: 2px solid color-mix(in srgb, var(--dock-fg-2) 35%, transparent);
    border-top-color: var(--dock-fg-2);
    display: inline-block;
    animation: dock-spin 0.9s linear infinite;
  }
  .assistant-timeline summary .spinner {
    margin-left: 6px;
    width: 12px;
    height: 12px;
    border-width: 2px;
  }
  .timeline-placeholder {
    font-size: 12px;
    color: var(--dock-fg-2);
    font-style: italic;
  }
  .raw-logs {
    margin-top: 8px;
    font-size: 12px;
  }
  .raw-logs summary {
    cursor: pointer;
    color: var(--dock-fg-2);
  }
  .raw-logs-body {
    margin-top: 6px;
    padding: 10px;
    border: 1px solid var(--dock-stroke);
    border-radius: 8px;
    background: color-mix(in srgb, var(--dock-bg) 94%, transparent);
    max-height: 160px;
    overflow: auto;
    white-space: pre-wrap;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  @keyframes dock-dots {
    0% { width: 0; }
    33% { width: 0.4em; }
    66% { width: 0.8em; }
    100% { width: 1.2em; }
  }
  @keyframes dock-spin {
    to { transform: rotate(360deg); }
  }
  @keyframes dock-skeleton {
    0% { opacity: 0.4; }
    50% { opacity: 0.9; }
    100% { opacity: 0.4; }
  }
  .diff-details {
    margin-top: 6px;
  }
  .diff-details summary {
    font-size: 12px;
    color: var(--dock-fg-2);
    cursor: pointer;
  }
  .diff-body {
    margin-top: 6px;
    border: 1px solid var(--dock-stroke);
    border-radius: 8px;
    background: color-mix(in srgb, var(--dock-bg) 94%, transparent);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    overflow: auto;
  }
  .diff-line {
    padding: 2px 10px;
    white-space: pre-wrap;
  }
  .diff-line.add {
    background: color-mix(in srgb, var(--success) 12%, transparent);
    color: color-mix(in srgb, var(--success) 60%, var(--dock-fg));
  }
  .diff-line.del {
    background: color-mix(in srgb, var(--error) 12%, transparent);
    color: color-mix(in srgb, var(--error) 60%, var(--dock-fg));
  }
  .diff-line.ctx {
    color: var(--dock-fg-2);
  }
  
  /* Thinking section */
  .msg .thinking-summary {
    color: var(--dock-fg-2);
    font-style: italic;
  }
  .msg .thinking-content {
    padding-top: 8px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--dock-fg-2);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    white-space: pre-wrap;
  }
  
  /* File list inside details */
  .msg .file-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 8px;
  }
  .msg .file-item {
    border: 1px solid var(--dock-stroke);
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
    color: var(--dock-fg);
  }
  .msg .file-meta {
    font-size: 11px;
    color: var(--dock-fg-2);
    margin-top: 4px;
  }

  /* Markdown basics inside dock */
  .md-p { margin: 6px 0; }
  .md-h { margin: 10px 0 6px; font-weight: 600; }
  .md-list { padding-left: 18px; margin: 6px 0; }
  .md-code { background: #0f172a0d; border: 1px solid var(--dock-stroke); border-radius: 10px; padding: 10px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; overflow:auto; }
  .md-code-inline { background: #0f172a1a; border: 1px solid var(--dock-stroke); border-radius: 4px; padding: 1px 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  .md a { color: var(--dock-fg); text-decoration: underline; }

  /* Change list (collapsed by default, preview-only) */
  .change-list { display: flex; flex-direction: column; gap: 8px; }
  .change-row { display:flex; align-items:center; justify-content: space-between; gap: 12px; padding: 8px 10px; border: 1px dashed var(--dock-stroke); border-radius: 10px; }
  .change-path { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--dock-fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px; }
  .change-meta { font-size: 12px; color: var(--dock-fg-2); }

  .msg.user .bubble {
    font-size: 13px;
    line-height: 1.6;
    color: var(--dock-fg);
  }

  /* History */
  .history-list { display: flex; flex-direction: column; gap: 16px; }
  .history-new {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 0;
    border-radius: 999px;
    border: none;
    background: transparent;
    font-size: 12px;
    color: var(--dock-fg-2);
    cursor: pointer;
    margin-bottom: 6px;
  }
  .history-new:hover { color: var(--dock-fg); }

  .history-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 20px;
    border: 1px solid var(--dock-stroke);
    border-radius: var(--radius-panel);
    background: var(--surface);
    box-shadow: var(--shadow);
    transition: box-shadow 0.2s ease, border-color 0.2s ease;
  }
  .history-row.active { border-color: color-mix(in srgb, var(--dock-fg) 25%, transparent); box-shadow: var(--shadow-lg); }
  .history-row:hover .history-actions { opacity: 1; }

  .history-main { min-width: 0; }
  .history-title { font-size: 13px; font-weight: 500; color: var(--dock-fg); max-width: 48ch; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .history-meta { margin-top: 4px; font-size: 12px; color: var(--hint); }

  .history-actions { display: flex; gap: 6px; opacity: 0; transition: opacity 0.15s ease; }
  .history-actions button {
    border: 1px solid var(--dock-stroke);
    background: var(--surface);
    padding: 5px 10px;
    border-radius: 999px;
    font-size: 12px;
    color: var(--dock-fg-2);
    cursor: pointer;
  }
  .history-actions button:hover { color: var(--dock-fg); }
  .history-row.renaming .history-actions { opacity: 1; }
  .history-rename {
    width: 100%;
    border: 1px solid var(--dock-stroke);
    border-radius: 12px;
    background: var(--surface);
    padding: 6px 10px;
    font-size: 13px;
    color: var(--dock-fg);
    outline: none;
  }
  .history-rename:focus { border-color: color-mix(in srgb, var(--dock-fg) 25%, transparent); }
  .history-row.renaming .history-meta {
    opacity: 0.6;
  }

  /* Composer */
  .footer { border-top: 1px solid var(--dock-stroke); padding: 12px 18px 16px; display: flex; flex-direction: column; gap: 24px; }

  .composer-top {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    border-radius: 12px;
    border: 1px solid var(--dock-stroke);
    background: var(--surface);
    padding: 10px 14px;
    margin-bottom: 12px; /* adds space before the engine/actions row */
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
    color: var(--dock-fg-2);
    pointer-events: none;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: 1px solid var(--dock-stroke);
    border-radius: var(--radius-chip);
    padding: 2px 8px;
    font-size: 12px;
    color: var(--dock-fg-2);
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
    color: var(--dock-fg-2);
    padding: 4px 12px;
    border-radius: 999px;
    border: 1px solid var(--dock-stroke);
    background: var(--surface);
  }
  .engine .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dock-stroke); }
  .engine.available .dot { background: var(--success); }
  .engine select { border: none; background: transparent; font-size: 12px; color: inherit; outline: none; cursor: pointer; }

  .actions { display: flex; gap: 10px; align-items: center; }
  .icon { width:32px; height:32px; border-radius:16px; border:1px solid var(--dock-stroke); background: var(--surface); color: var(--dock-fg-2); display:grid; place-items:center; cursor:pointer; transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); }
  .icon:hover { background: var(--surface-hover); border-color: color-mix(in srgb, var(--dock-fg) 20%, transparent); transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
  .icon:active { transform: scale(0.94); }
  .icon.active { background: var(--surface-hover); border-color: color-mix(in srgb, var(--dock-fg) 25%, transparent); color: var(--dock-fg); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dock-fg) 10%, transparent); }
  .send {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: var(--dock-fg);
    color: var(--dock-bg);
    display: grid;
    place-items: center;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    position: relative;
    padding: 0;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  }
  .send:hover { transform: translateY(-2px) scale(1.05); box-shadow: 0 6px 16px rgba(0,0,0,0.2); }
  .send:active { transform: scale(0.92); }
  .send:disabled { opacity: 0.3; cursor: not-allowed; transform: none; background: var(--dock-fg-2); }
  
  .send svg {
    transition: opacity 0.2s ease, transform 0.2s ease;
  }
  
  .send.processing svg {
    opacity: 0;
    transform: scale(0.5);
  }
  
  .send.processing::after {
    content: '';
    position: absolute;
    width: 14px;
    height: 14px;
    border: 2px solid var(--dock-bg);
    border-top-color: transparent;
    border-radius: 50%;
    animation: dock-spin 0.8s linear infinite;
  }

  /* New Timeline Styles */
  .timeline-entries {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 8px 0;
    position: relative;
  }
  .timeline-entries::before {
    content: '';
    position: absolute;
    top: 12px;
    bottom: 12px;
    left: 11px; /* Centered relative to 24px icon (12px center) - 1px width = 11px */
    width: 2px;
    background: var(--dock-stroke);
    z-index: 0;
  }

  .timeline-entry {
    display: flex;
    gap: 12px;
    position: relative;
    z-index: 1;
  }

  .timeline-icon {
    flex: 0 0 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--surface);
    border: 1px solid var(--dock-stroke);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--dock-fg-2);
    font-size: 12px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    transition: all 0.2s ease;
    margin-top: 0; /* Ensure no extra margin */
  }

  /* ... status colors ... */

  .timeline-content {
    flex: 1;
    min-width: 0;
    padding-top: 2px; /* Align text with icon center */
  }

  .timeline-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
    padding: 2px 0; /* Remove horizontal padding */
    transition: opacity 0.2s;
  }
  .timeline-header.clickable:hover {
    background: transparent; /* Remove hover background */
    opacity: 0.8; /* Subtle opacity change instead */
  }

  .timeline-title {
    font-size: 13px;
    font-weight: 400;
    color: var(--dock-fg);
    flex: 1; /* Push chevron to right */
  }

  .timeline-body {
    font-size: 13px;
    line-height: 1.5;
    color: var(--dock-fg);
    margin-top: 2px;
    white-space: pre-wrap;
    overflow-wrap: break-word;
    max-width: 100%;
  }

  .timeline-chevron {
    color: var(--dock-fg-2);
    display: flex;
    align-items: center;
    transition: transform 0.2s ease;
    opacity: 0; /* Hidden by default */
  }
  
  .timeline-entry:hover .timeline-chevron,
  .timeline-entry.expanded .timeline-chevron {
    opacity: 1; /* Show on hover or expand */
  }

  .timeline-entry.expanded .timeline-chevron {
    transform: rotate(180deg);
  }

  /* New Details Body Styling */
  .timeline-details-body {
    display: none; /* Hidden by default */
    margin-top: 4px;
    border-radius: 6px;
    background: var(--dock-bg);
    border: 1px solid var(--dock-stroke);
    overflow: hidden;
  }
  
  .timeline-entry.expanded .timeline-details-body {
    display: block; /* Show when expanded */
  }

  .timeline-pre {
    margin: 0;
    padding: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    white-space: pre-wrap;
    overflow-x: auto;
    max-height: 500px;
    color: var(--dock-fg);
    background: transparent; /* Background handled by container */
    border: none; /* Border handled by container */
  }

  /* Summary Body Truncation Fix */
  .summary-body {
    font-size: 13px;
    line-height: 1.5;
    color: var(--dock-fg);
    margin-top: 8px;
    white-space: pre-wrap; /* Ensure wrapping */
    overflow-wrap: break-word; /* Prevent overflow */
    max-width: 100%;
  }

  /* Specific Entry Types */
  .timeline-entry.thinking .timeline-title {
    font-style: italic;
    color: var(--dock-fg); /* Keep title strong for Thinking */
  }

  .timeline-entry.thinking .timeline-body {
    color: var(--dock-fg-2); /* De-emphasize body under Thinking */
  }
  
  .timeline-file-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 4px;
  }
  .timeline-file {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    color: var(--dock-fg);
  }
  .timeline-file-stat {
    font-size: 10px;
    padding: 1px 4px;
    border-radius: 4px;
    background: var(--surface);
    color: var(--dock-fg-2);
  }
  .timeline-file-stat.added { color: var(--success, #10b981); background: color-mix(in srgb, var(--success, #10b981) 10%, transparent); }
  .timeline-file-stat.removed { color: var(--error, #ef4444); background: color-mix(in srgb, var(--error, #ef4444) 10%, transparent); }
`;
