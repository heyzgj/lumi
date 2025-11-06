/**
 * UI Styles - Global CSS definitions
 */

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
