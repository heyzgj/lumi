/**
 * UI Styles - Centralized CSS definitions
 * Ethereal Minimalism inspired theme
 */

export const BUBBLE_STYLES = `
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :host {
    --surface-primary: rgba(255, 255, 255, 0.58);
    --surface-elevated: rgba(255, 255, 255, 0.78);
    --surface-muted: rgba(244, 246, 248, 0.65);
    --surface-dark: rgba(26, 27, 28, 0.55);
    --surface-border: rgba(227, 232, 239, 0.65);
    --surface-border-strong: rgba(206, 213, 222, 0.9);
    --shadow-color: rgba(15, 23, 42, 0.22);
    --text-primary: #1f2933;
    --text-secondary: #5d6774;
    --text-muted: #95a3b3;
    --accent-gradient: linear-gradient(135deg, #4EE6C1, #6EB8FF);
    --accent-glow: rgba(78, 230, 193, 0.22);
    --accent-active: #4EE6C1;
    --danger: #f87171;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  .bubble {
    position: relative;
    width: 430px;
    border-radius: 28px;
    border: 1px solid var(--surface-border);
    background: var(--surface-primary);
    backdrop-filter: blur(28px) saturate(160%);
    box-shadow: 0 32px 120px var(--shadow-color);
    overflow: hidden;
    color: var(--text-primary);
    animation: bubbleEnter 480ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .bubble::before {
    content: '';
    position: absolute;
    top: -160px;
    right: -140px;
    width: 360px;
    height: 320px;
    background: var(--accent-gradient);
    opacity: 0.38;
    filter: blur(120px);
    pointer-events: none;
    transform: rotate(8deg);
  }

  .bubble::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 28px;
    background: linear-gradient(155deg, rgba(255,255,255,0.55), rgba(255,255,255,0.1));
    opacity: 0.28;
    pointer-events: none;
  }

  @keyframes bubbleEnter {
    0% {
      opacity: 0;
      transform: translateY(18px) scale(0.96);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .bubble > * {
    position: relative;
    z-index: 2;
  }

  .bubble-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px 6px;
    cursor: grab;
  }

  .bubble-header:active {
    cursor: grabbing;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .brand-mark {
    width: 34px;
    height: 34px;
    border-radius: 14px;
    background: rgba(255,255,255,0.55);
    border: 1px solid rgba(227,232,239,0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    color: var(--text-muted);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.4);
  }

  .logo {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.32em;
    text-transform: uppercase;
    color: var(--text-secondary);
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .engine-selector {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.6);
    background: linear-gradient(150deg, rgba(255,255,255,0.75), rgba(231,241,255,0.55));
    box-shadow: 0 12px 28px rgba(110, 184, 255, 0.24);
    color: var(--text-primary);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }

  .engine-selector:hover {
    transform: translateY(-1px);
    box-shadow: 0 16px 34px rgba(110, 184, 255, 0.28);
  }

  .engine-selector.open {
    box-shadow: 0 18px 40px rgba(110, 184, 255, 0.32);
  }

  .status-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent-active);
    box-shadow: 0 0 0 4px rgba(78, 230, 193, 0.18);
    animation: pulse 2.4s ease-in-out infinite;
  }

  .status-indicator.offline {
    background: var(--danger);
    box-shadow: none;
    animation: none;
  }

  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(0.85); opacity: 0.6; }
  }

  .engine-name {
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  .dropdown-arrow {
    font-size: 10px;
    opacity: 0.5;
    transition: transform 0.2s ease;
  }

  .engine-selector.open .dropdown-arrow {
    transform: rotate(180deg);
  }

  .close-btn {
    width: 34px;
    height: 34px;
    border-radius: 14px;
    border: 1px solid var(--surface-border);
    background: rgba(255,255,255,0.45);
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.18s ease;
  }

  .close-btn:hover {
    color: var(--text-primary);
    transform: translateY(-1px);
    box-shadow: 0 12px 28px rgba(31, 41, 51, 0.18);
  }

  .engine-dropdown {
    position: absolute;
    margin-top: 12px;
    right: 24px;
    min-width: 160px;
    border-radius: 18px;
    background: rgba(247, 249, 251, 0.92);
    border: 1px solid var(--surface-border-strong);
    box-shadow: 0 22px 60px rgba(15, 23, 42, 0.24);
    backdrop-filter: blur(26px);
    display: none;
    overflow: hidden;
    animation: dropdownSlide 200ms ease;
    z-index: 11;
  }

  @keyframes dropdownSlide {
    from { opacity: 0; transform: translateY(-10px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  .engine-dropdown.open {
    display: block;
  }

  .engine-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .engine-option + .engine-option {
    border-top: 1px solid rgba(227, 232, 239, 0.6);
  }

  .engine-option:hover {
    background: rgba(110, 184, 255, 0.08);
  }

  .engine-option.disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .engine-option-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .engine-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(148, 163, 184, 0.7);
  }

  .engine-status-dot.available {
    background: var(--accent-active);
  }

  .engine-check {
    opacity: 0;
    color: var(--accent-active);
  }

  .engine-option.selected .engine-check {
    opacity: 1;
  }

  .context-zone {
    padding: 0 24px 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .control-strip {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .strip-title {
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .control-group {
    display: flex;
    gap: 10px;
  }

  .context-scroll {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    padding-bottom: 4px;
    scrollbar-width: thin;
  }

  .context-scroll::-webkit-scrollbar {
    height: 6px;
  }

  .context-scroll::-webkit-scrollbar-thumb {
    background: rgba(180, 190, 205, 0.4);
    border-radius: 999px;
  }

  .context-tag {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 144px;
    padding: 10px 12px;
    border-radius: 18px;
    border: 1px solid rgba(206, 213, 222, 0.65);
    background: rgba(255, 255, 255, 0.72);
    box-shadow: 0 10px 22px rgba(31, 41, 51, 0.08);
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }

  .context-tag:hover {
    transform: translateY(-2px);
    box-shadow: 0 14px 28px rgba(31, 41, 51, 0.12);
  }

  .context-tag.screenshot {
    background: rgba(78, 230, 193, 0.18);
    border-color: rgba(78, 230, 193, 0.45);
    color: #13715f;
  }

  .tag-label {
    cursor: pointer;
  }

  .tag-remove {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: rgba(148, 163, 184, 0.25);
    color: rgba(82, 95, 113, 0.9);
    font-size: 11px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .tag-remove:hover {
    background: rgba(148, 163, 184, 0.35);
  }

  .input-shell {
    padding: 0 24px 24px;
  }

  .dock-btn {
    width: 38px;
    height: 38px;
    border-radius: 18px;
    border: 1px solid rgba(206, 213, 222, 0.75);
    background: rgba(255,255,255,0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    cursor: pointer;
    transition: transform 0.18s, box-shadow 0.18s, color 0.18s;
    box-shadow: 0 12px 24px rgba(31, 41, 51, 0.12);
  }

  .dock-btn:hover {
    transform: translateY(-1px);
    color: var(--text-primary);
    box-shadow: 0 16px 32px rgba(31, 41, 51, 0.16);
  }

  .dock-btn.active {
    background: var(--accent-gradient);
    color: #0b1720;
    border-color: transparent;
    box-shadow: 0 16px 34px rgba(110, 184, 255, 0.28);
  }

  .dock-btn svg {
    width: 16px;
    height: 16px;
  }

  .input-wrapper {
    position: relative;
    padding: 18px 70px 18px 18px;
    border-radius: 22px;
    border: 1px solid var(--surface-border-strong);
    background: linear-gradient(165deg, rgba(255,255,255,0.92), rgba(241,245,250,0.78));
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.5), 0 22px 40px rgba(15, 23, 42, 0.12);
    transition: border 0.2s ease, box-shadow 0.2s ease;
  }

  .input-wrapper:focus-within {
    border-color: rgba(110, 184, 255, 0.7);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.65), 0 24px 48px rgba(110, 184, 255, 0.18);
  }

  .input-field {
    min-height: 96px;
    max-height: 220px;
    overflow-y: auto;
    outline: none;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 14px;
    line-height: 1.66;
    letter-spacing: 0.01em;
  }

  .input-field:empty:before {
    content: attr(data-placeholder);
    color: var(--text-muted);
    pointer-events: none;
  }

  .inline-element-tag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    border-radius: 12px;
    border: 1px solid rgba(110, 184, 255, 0.6);
    background: rgba(110, 184, 255, 0.25);
    color: #0b2441;
    font-size: 12px;
    font-weight: 600;
    user-select: none;
    margin: 0 3px;
  }

  .inline-tag-remove {
    font-size: 10px;
    cursor: pointer;
    opacity: 0.7;
  }

  .inline-tag-remove:hover {
    opacity: 1;
  }

  .send-btn {
    position: absolute;
    right: 14px;
    bottom: 14px;
    width: 46px;
    height: 46px;
    border-radius: 50%;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #0b1720;
    cursor: pointer;
    background: var(--accent-gradient);
    box-shadow: 0 18px 34px rgba(110, 184, 255, 0.35);
    animation: breathe 4.2s ease-in-out infinite;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }

  .send-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 22px 42px rgba(110, 184, 255, 0.4);
  }

  .send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    animation: none;
  }

  @keyframes breathe {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.06); }
  }

  .loading-overlay {
    position: absolute;
    inset: 0;
    border-radius: 22px;
    background: rgba(247, 249, 251, 0.84);
    backdrop-filter: blur(14px);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
  }

  .loading-overlay.active {
    opacity: 1;
    pointer-events: all;
  }

  .spinner {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 3px solid rgba(110, 184, 255, 0.2);
    border-top-color: rgba(110, 184, 255, 0.85);
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .status-footer {
    padding: 0 24px 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .status-message {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 16px;
    border: 1px solid rgba(206, 213, 222, 0.7);
    background: rgba(255,255,255,0.75);
    color: var(--text-secondary);
    font-size: 13px;
    opacity: 0;
    transform: translateY(6px);
    transition: opacity 0.2s ease, transform 0.2s ease;
  }

  .status-message.active {
    opacity: 1;
    transform: translateY(0);
  }

  .status-message.success {
    background: rgba(78, 230, 193, 0.18);
    border-color: rgba(78, 230, 193, 0.45);
    color: #13715f;
  }

  .status-message.error {
    background: rgba(248, 113, 113, 0.18);
    border-color: rgba(248, 113, 113, 0.45);
    color: #a52525;
  }

  .status-message.info {
    background: rgba(237, 241, 247, 0.75);
    border-color: rgba(206, 213, 222, 0.75);
    color: var(--text-secondary);
  }

  .status-icon {
    font-size: 12px;
  }

  .status-close {
    border: none;
    background: transparent;
    color: rgba(82, 95, 113, 0.6);
    cursor: pointer;
    font-size: 14px;
    transition: color 0.2s ease;
  }

  .status-close:hover {
    color: var(--text-primary);
  }

  /* Responsive */
  @media (max-width: 520px) {
    .bubble {
      width: min(100vw - 32px, 420px);
    }

    .control-dock {
      right: 24px;
    }
  }
`;

export const GLOBAL_STYLES = `
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes scaleIn {
    from { opacity: 0; transform: scale(0.9); }
    to { opacity: 1; transform: scale(1); }
  }

  @keyframes slideDown {
    from { transform: translateY(-100%); }
    to { transform: translateY(0); }
  }

  html.lumi-element-cursor,
  body.lumi-element-cursor {
    cursor: pointer !important;
  }

  html.lumi-screenshot-cursor,
  body.lumi-screenshot-cursor {
    cursor: crosshair !important;
  }
`;
