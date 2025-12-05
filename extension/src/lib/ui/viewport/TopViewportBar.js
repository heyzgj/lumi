// TopViewportBar - scaffolding (M0)
// Minimal, hidden by default; will render simple controls in M1.

export default class TopViewportBar {
  constructor(eventBus, stateManager) {
    this.eventBus = eventBus;
    this.stateManager = stateManager;
    this.host = null;
    this.shadow = null;
    this.visible = false;
  }

  mount() {
    if (this.host) return;
    this.host = document.createElement('div');
    this.host.id = 'lumi-viewport-bar-root';
    this.host.style.cssText = 'position: fixed; left: 0; right: 420px; top: 0; z-index: 2147483646; display: none;';
    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.shadow.innerHTML = `
      <style>
        /* Uses design tokens from :root (see extension/shared/tokens.css) */
        .bar {
          position: relative;
          height: var(--header-height);
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 0 20px;
          background: var(--dock-bg);
          border-bottom: 1px solid var(--dock-stroke);
          box-shadow: var(--shadow);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 13px;
          color: var(--dock-fg);
        }
        select, input { 
          font-size: 12px; 
          border: 1px solid var(--dock-stroke); 
          border-radius: 8px; 
          background: var(--dock-bg);
          color: var(--dock-fg); 
          padding: 6px 10px; 
          outline: none;
          transition: all 0.2s ease;
        }
        select:hover, input:hover {
          background: color-mix(in srgb, var(--dock-bg) 96%, transparent);
          border-color: color-mix(in srgb, var(--dock-fg) 20%, transparent);
        }
        select:focus, input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
        }
        .btn { 
          height: 32px; 
          padding: 0 12px; 
          display: inline-flex; 
          align-items: center; 
          justify-content: center; 
          border: 1px solid transparent; 
          border-radius: 10px; 
          background: transparent; 
          color: var(--dock-fg-2); 
          font-weight: 500;
          cursor: pointer; 
          transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .btn:hover { 
          color: var(--dock-fg); 
          background: color-mix(in srgb, var(--dock-fg) 5%, transparent);
          transform: translateY(-1px);
        }
        .btn:active { 
          transform: scale(0.96); 
        }
        .spacer { flex: 1; }
        .field { display: inline-flex; align-items: center; gap: 8px; }
        .dim { width: 72px; }
        .label { color: var(--dock-fg-2); font-weight: 500; font-size: 12px; }
      </style>
      <div class="bar" id="bar">
        <label class="field"><span class="label">Device</span>
          <select id="preset">
            <option value="responsive" selected>Responsive</option>
            <option value="mobile">Mobile</option>
            <option value="pad">Pad</option>
            <option value="laptop">Laptop</option>
          </select>
        </label>
        <label class="field"><span class="label">W</span><input id="w" class="dim" type="number" min="200" step="1"></label>
        <label class="field"><span class="label">Zoom</span>
          <select id="zoom">
            <option value="auto" selected>Auto</option>
            <option value="2">200%</option>
            <option value="1.5">150%</option>
            <option value="1.25">125%</option>
            <option value="1">100%</option>
            <option value="0.75">75%</option>
            <option value="0.5">50%</option>
          </select>
        </label>
        <button id="fitWidth" class="btn" title="Fit to Width">Fit</button>
        <button id="zoomReset" class="btn" title="Reset to 100%">Reset</button>
        <div class="spacer"></div>
      </div>
    `;
    document.body.appendChild(this.host);
    this.bind();
    // Keep right inset in sync with dock width
    try { this.stateManager.subscribe('ui.dockWidth', (w) => { if (this.host) this.host.style.right = (w || 420) + 'px'; }); } catch (_) { }
    try { this.host.style.right = (this.stateManager.get('ui.dockWidth') || 420) + 'px'; } catch (_) { }
  }

  setVisible(visible) {
    this.visible = !!visible;
    if (!this.host) this.mount();
    this.host.style.display = this.visible ? 'block' : 'none';
  }

  setTheme(mode) {
    // No-op: theme is driven by root tokens via setDockThemeMode
  }

  destroy() {
    if (this.host) { this.host.remove(); this.host = null; this.shadow = null; }
  }

  bind() {
    const $ = (id) => this.shadow && this.shadow.getElementById(id);
    const preset = $('preset');
    const zoom = $('zoom');
    const w = $('w');
    const reset = $('zoomReset');
    const reflectZoom = () => {
      const auto = !!this.stateManager.get('ui.viewport.auto');
      if (zoom) zoom.value = auto ? 'auto' : String(this.stateManager.get('ui.viewport.scale') || 1);
    };

    if (preset) preset.addEventListener('change', () => this.eventBus.emit('viewport:preset', preset.value));
    if (w) w.addEventListener('change', () => this.eventBus.emit('viewport:resize', { width: Number(w.value) || 1280 }));
    const fitBtn = $('fitWidth');
    if (fitBtn) fitBtn.addEventListener('click', () => this.eventBus.emit('viewport:fit', 'width'));
    if (zoom) zoom.addEventListener('change', () => this.eventBus.emit('viewport:zoom', zoom.value));
    if (reset) reset.addEventListener('click', () => this.eventBus.emit('viewport:scale', 1));

    reflectZoom();

    // Reflect external state changes (e.g., fit/preset/resize)
    try { this.stateManager.subscribe('ui.viewport.scale', reflectZoom); } catch (_) { }
    try { this.stateManager.subscribe('ui.viewport.auto', reflectZoom); } catch (_) { }
    // No explicit reflow toggle; iframe stage is default
    const syncDims = () => {
      const logical = this.stateManager.get('ui.viewport.logical') || { width: 1440 };
      if (w) w.value = String(logical.width);
    };
    try { this.stateManager.subscribe('ui.viewport.logical', syncDims); } catch (_) { }
    syncDims();

    // Only Responsive allows editing width
    const syncPreset = () => {
      const p = this.stateManager.get('ui.viewport.preset') || 'responsive';
      if (w) w.disabled = p !== 'responsive';
      if (preset) preset.value = p;
    };
    try { this.stateManager.subscribe('ui.viewport.preset', syncPreset); } catch (_) { }
    syncPreset();
  }
}
