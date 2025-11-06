/**
 * UI Styles - Global CSS definitions
 */

export const GLOBAL_STYLES = `
  /* Dock design tokens at document root for cross-surface components */
  :root {
    --dock-bg: rgba(255,255,255,0.88);
    --dock-stroke: rgba(0,0,0,0.08);
    --dock-fg: #111111;
    --dock-fg-2: #5F6368;
    --icon-opacity: 0.9;
    --success: #10B981;
    --accent: #3B82F6;
    --error: #EF4444;
    --on-accent: #ffffff;
    --on-strong: #ffffff;
    --shadow: 0 4px 12px rgba(0,0,0,0.05);
    --radius-panel: 18px;
    --radius-chip: 12px;
  }
  :root.dark-dock {
    --dock-bg: rgba(22,22,24,0.88);
    --dock-stroke: rgba(255,255,255,0.12);
    --dock-fg: #F5F5F7;
    --dock-fg-2: #B0B3B8;
    --icon-opacity: 1;
    --success: #34D399;
    --accent: #60A5FA;
    --error: #F87171;
    --on-accent: #ffffff;
    --on-strong: #ffffff;
    --shadow: 0 6px 16px rgba(0,0,0,0.35);
    --radius-panel: 18px;
    --radius-chip: 12px;
  }
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
  html.lumi-screenshot-cursor *, body.lumi-screenshot-cursor * {
    cursor: crosshair !important;
  }
  html.lumi-overlay-dragging, body.lumi-overlay-dragging {
    user-select: none !important;
  }
  body.lumi-scroll-lock {
    overflow: hidden !important;
  }
`;
