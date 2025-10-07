/**
 * UI Styles - Centralized CSS definitions
 * All Shadow DOM styles in one place
 */

export const BUBBLE_STYLES = `
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :host {
    --bg-primary: rgba(15, 23, 42, 0.95);
    --bg-secondary: rgba(30, 41, 59, 0.9);
    --accent-blue: #3b82f6;
    --accent-green: #10b981;
    --text-primary: rgba(248, 250, 252, 0.95);
    --text-secondary: rgba(226, 232, 240, 0.6);
    --border: rgba(148, 163, 184, 0.2);
  }

  .bubble {
    width: 420px;
    background: var(--bg-primary);
    backdrop-filter: blur(24px) saturate(180%);
    border-radius: 12px;
    border: 1px solid var(--border);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: var(--text-primary);
    animation: slideInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    overflow: hidden;
  }

  @keyframes slideInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Top Bar */
  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    background: rgba(15, 23, 42, 0.6);
  }

  .left-section {
    display: flex;
    align-items: center;
    gap: 12px;
    position: relative;
  }

  .logo {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  .engine-selector {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .engine-selector:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(148, 163, 184, 0.3);
  }

  .status-indicator {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent-green);
    animation: pulse 2s ease-in-out infinite;
  }

  .status-indicator.offline {
    background: #ef4444;
    animation: none;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .engine-name {
    font-size: 12px;
    font-weight: 500;
  }

  .dropdown-arrow {
    font-size: 10px;
    opacity: 0.6;
    transition: transform 0.2s;
  }

  .engine-selector.open .dropdown-arrow {
    transform: rotate(180deg);
  }

  /* Engine Dropdown */
  .engine-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 120px;
    background: rgba(30, 41, 59, 0.98);
    backdrop-filter: blur(12px);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    display: none;
    z-index: 100;
    animation: dropdownSlideIn 0.2s ease-out;
  }

  @keyframes dropdownSlideIn {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .engine-dropdown.open {
    display: block;
  }

  .engine-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    cursor: pointer;
    transition: background 0.15s;
    font-size: 12px;
  }

  .engine-option:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .engine-option.disabled {
    cursor: not-allowed;
    opacity: 0.55;
    pointer-events: auto;
  }

  .engine-option:first-child {
    border-radius: 6px 6px 0 0;
  }

  .engine-option:last-child {
    border-radius: 0 0 6px 6px;
  }

  .engine-option-name {
    font-weight: 500;
  }

  .engine-check {
    opacity: 0;
    color: var(--accent-green);
    font-size: 14px;
  }

  .engine-option.selected .engine-check {
    opacity: 1;
  }

  .engine-option-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .engine-status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #6b7280;
  }

  .engine-status-dot.available {
    background: var(--accent-green);
  }

  .right-section {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .icon-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid transparent;
    background: transparent;
    border-radius: 6px;
    cursor: pointer;
    color: var(--text-secondary);
    transition: all 0.15s;
  }

  .icon-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-primary);
    border-color: var(--border);
  }

  .icon-btn.active {
    background: var(--accent-blue);
    color: white;
    border-color: var(--accent-blue);
  }

  .icon-btn svg {
    width: 16px;
    height: 16px;
  }

  /* Context Tags */
  .context-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 8px;
  }

  .context-tags:empty {
    display: none;
  }

  .context-tag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    background: rgba(59, 130, 246, 0.15);
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-radius: 6px;
    font-size: 11px;
    font-weight: 500;
    color: #93c5fd;
    animation: scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes scaleIn {
    from {
      opacity: 0;
      transform: scale(0.8);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .context-tag.screenshot {
    background: rgba(16, 185, 129, 0.15);
    border-color: rgba(16, 185, 129, 0.3);
    color: #6ee7b7;
  }

  .tag-label {
    cursor: pointer;
  }

  .tag-remove {
    width: 14px;
    height: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    cursor: pointer;
    font-size: 10px;
    opacity: 0.6;
    transition: all 0.15s;
  }

  .tag-remove:hover {
    opacity: 1;
    background: rgba(255, 255, 255, 0.1);
  }

  /* Inline Element Tags (inside contenteditable) */
  .inline-element-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    background: rgba(59, 130, 246, 0.25);
    border: 1px solid rgba(59, 130, 246, 0.4);
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    color: #93c5fd;
    cursor: default;
    user-select: none;
    margin: 0 2px;
    vertical-align: middle;
  }

  .inline-tag-remove {
    font-size: 9px;
    opacity: 0.7;
    margin-left: 2px;
  }

  .inline-tag-remove:hover {
    opacity: 1;
  }

  /* Input Container */
  .input-container {
    padding: 16px;
    position: relative;
  }

  .input-wrapper {
    position: relative;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    transition: all 0.15s;
  }

  .input-wrapper:focus-within {
    border-color: var(--accent-blue);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .input-field {
    width: 100%;
    min-height: 80px;
    max-height: 200px;
    padding: 12px 48px 12px 12px;
    background: transparent;
    border: none;
    color: var(--text-primary);
    font-size: 13px;
    font-family: inherit;
    line-height: 1.5;
    outline: none;
    overflow-y: auto;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .input-field:empty:before {
    content: attr(data-placeholder);
    color: var(--text-secondary);
    pointer-events: none;
  }

  .send-btn {
    position: absolute;
    right: 8px;
    bottom: 8px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--accent-blue);
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
    color: white;
  }

  .send-btn:hover:not(:disabled) {
    background: #2563eb;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  }

  .send-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .send-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .send-btn svg {
    width: 16px;
    height: 16px;
  }

  /* Loading Overlay */
  .loading-overlay {
    position: absolute;
    inset: 0;
    display: none;
    align-items: center;
    justify-content: center;
    background: rgba(15, 23, 42, 0.9);
    backdrop-filter: blur(4px);
    border-radius: 8px;
    animation: fadeIn 0.2s;
  }

  .loading-overlay.active {
    display: flex;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .loading-content {
    text-align: center;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid rgba(59, 130, 246, 0.2);
    border-top-color: var(--accent-blue);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 8px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .loading-text {
    font-size: 12px;
    color: var(--text-secondary);
  }

  /* Status Message */
  .status-message {
    padding: 12px 16px;
    border-top: 1px solid var(--border);
    font-size: 12px;
    display: none;
    align-items: center;
    gap: 8px;
    animation: slideDown 0.2s;
    position: relative;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .status-message.active {
    display: flex;
  }

  .status-message.success {
    background: rgba(16, 185, 129, 0.1);
    color: var(--accent-green);
  }

  .status-message.error {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }

  #status-text {
    flex: 1;
  }

  .status-close {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 16px;
    color: inherit;
    opacity: 0.6;
    transition: all 0.15s;
  }

  .status-close:hover {
    opacity: 1;
    background: rgba(255, 255, 255, 0.1);
  }

  /* Drag Handle */
  .drag-handle {
    cursor: move;
    user-select: none;
  }

  .bubble.dragging {
    transition: none !important;
    pointer-events: none;
  }

  .bubble.dragging * {
    pointer-events: none;
  }
`;

export const GLOBAL_STYLES = `
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes scaleIn {
    from {
      opacity: 0;
      transform: scale(0.8);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  @keyframes slideDown {
    from {
      transform: translateY(-100%);
    }
    to {
      transform: translateY(0);
    }
  }
  /* Global cursor helpers for selection modes */
  html.lumi-element-cursor, body.lumi-element-cursor { cursor: pointer !important; }
  html.lumi-screenshot-cursor, body.lumi-screenshot-cursor { cursor: crosshair !important; }
`;
