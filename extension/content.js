(function () {
  'use strict';

  /**
   * EventBus - Simple publish/subscribe event system
   * Enables loose coupling between modules
   */

  class EventBus {
    constructor() {
      this.listeners = new Map();
    }

    /**
     * Subscribe to an event
     * @param {string} event - Event name (supports namespaces like 'element:selected')
     * @param {Function} callback - Handler function
     * @returns {Function} Unsubscribe function
     */
    on(event, callback) {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, []);
      }
      
      this.listeners.get(event).push(callback);
      
      // Return unsubscribe function
      return () => this.off(event, callback);
    }

    /**
     * Subscribe to an event (one-time)
     * @param {string} event - Event name
     * @param {Function} callback - Handler function
     */
    once(event, callback) {
      const onceCallback = (...args) => {
        callback(...args);
        this.off(event, onceCallback);
      };
      
      this.on(event, onceCallback);
    }

    /**
     * Unsubscribe from an event
     * @param {string} event - Event name
     * @param {Function} callback - Handler function to remove
     */
    off(event, callback) {
      if (!this.listeners.has(event)) return;
      
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      
      if (index > -1) {
        callbacks.splice(index, 1);
      }
      
      // Clean up empty listener arrays
      if (callbacks.length === 0) {
        this.listeners.delete(event);
      }
    }

    /**
     * Emit an event
     * @param {string} event - Event name
     * @param {...any} args - Arguments to pass to handlers
     */
    emit(event, ...args) {
      if (!this.listeners.has(event)) return;
      
      const callbacks = this.listeners.get(event).slice(); // Clone to prevent modification during iteration
      
      // Error isolation: one handler error doesn't affect others
      callbacks.forEach(callback => {
        try {
          callback(...args);
        } catch (error) {
          console.error(`[EventBus] Error in handler for event "${event}":`, error);
        }
      });
    }

    /**
     * Remove all listeners for an event (or all events if no event specified)
     * @param {string} [event] - Event name (optional)
     */
    clear(event) {
      if (event) {
        this.listeners.delete(event);
      } else {
        this.listeners.clear();
      }
    }

    /**
     * Get listener count for an event
     * @param {string} event - Event name
     * @returns {number} Number of listeners
     */
    listenerCount(event) {
      return this.listeners.has(event) ? this.listeners.get(event).length : 0;
    }
  }

  /**
   * StateManager - Centralized state management with observer pattern
   * Manages all application state and notifies listeners on changes
   */

  class StateManager {
    constructor(eventBus) {
      this.eventBus = eventBus;
      
      // Initial state structure
      this.state = {
        ui: {
          mode: 'idle', // 'idle' | 'element' | 'screenshot'
          dockOpen: false,
          dockWidth: 420,
          dockTab: 'chat',
          dockState: 'normal', // 'normal' | 'compact' | 'expanded'
          theme: 'light', // 'light' | 'dark' | 'auto'
          viewport: {
            enabled: true,
            preset: 'responsive',
            logical: { width: 1280, height: 800 },
            fit: 'width',
            scale: 1,
            mode: 'center',
            auto: true,
            useIframeStage: false
          }
        },
        selection: {
          elements: [],
          screenshots: [],
          hoveredElement: null
        },
        sessions: {
          currentId: null,
          list: []
        },
        wysiwyg: {
          active: false,
          pending: null, // { index, changes }
          edits: [], // [{ index, selector, changes, summary? }]
          hasDiffs: false
        },
        engine: {
          current: 'codex',
          available: {
            codex: false,
            claude: false
          },
          serverHealthy: false,
          restored: false // Flag to prevent overwriting user selection
        },
        processing: {
          active: false,
          stage: null
        },
        projects: {
          allowed: true,
          current: null,
          list: []
        }
      };
      
      // Subscribers for specific state paths
      this.subscribers = new Map();
    }

    /**
     * Get current state or specific path
     * @param {string} [path] - Dot-separated path (e.g., 'ui.dockOpen')
     * @returns {any} State value
     */
    get(path) {
      if (!path) return this.state;
      
      return this._getNestedValue(this.state, path);
    }

    /**
     * Update state at specific path
     * @param {string} path - Dot-separated path
     * @param {any} value - New value
     * @param {boolean} [silent=false] - Skip notifications if true
     */
    set(path, value, silent = false) {
      const oldValue = this.get(path);
      
      // Only update if value actually changed
      if (oldValue === value) return;
      
      this._setNestedValue(this.state, path, value);
      
      if (!silent) {
        this._notify(path, value, oldValue);
      }
    }

    /**
     * Update multiple state paths at once
     * @param {Object} updates - Object with path: value pairs
     */
    batch(updates) {
      Object.entries(updates).forEach(([path, value]) => {
        this.set(path, value, true); // Silent updates
      });
      
      // Single notification for all changes
      this.eventBus.emit('state:batch-update', updates);
    }

    /**
     * Subscribe to state changes at specific path
     * @param {string} path - Dot-separated path
     * @param {Function} callback - Called with (newValue, oldValue)
     * @returns {Function} Unsubscribe function
     */
    subscribe(path, callback) {
      if (!this.subscribers.has(path)) {
        this.subscribers.set(path, []);
      }
      
      this.subscribers.get(path).push(callback);
      
      // Return unsubscribe function
      return () => {
        const callbacks = this.subscribers.get(path);
        if (callbacks) {
          const index = callbacks.indexOf(callback);
          if (index > -1) {
            callbacks.splice(index, 1);
          }
        }
      };
    }

    /**
     * Get state snapshot (deep clone for debugging)
     * @returns {Object} Cloned state
     */
    snapshot() {
      return JSON.parse(JSON.stringify(this.state));
    }

    /**
     * Reset state to initial values
     */
    reset() {
      const oldState = this.snapshot();
      
      this.state = {
        ui: {
          mode: 'idle',
          dockOpen: false,
          dockWidth: 420,
          dockTab: 'chat',
          dockState: 'normal',
          theme: 'light'
        },
        selection: {
          elements: [],
          screenshots: [],
          hoveredElement: null
        },
        sessions: {
          currentId: null,
          list: []
        },
        wysiwyg: {
          active: false,
          pending: null,
          edits: [],
          hasDiffs: false
        },
        engine: {
          current: 'codex',
          available: {
            codex: false,
            claude: false
          },
          serverHealthy: false,
          restored: false
        },
        processing: {
          active: false,
          stage: null
        },
        projects: {
          allowed: true,
          current: null,
          list: []
        }
      };
      
      this.eventBus.emit('state:reset', this.state, oldState);
    }

    // Private methods

    _getNestedValue(obj, path) {
      return path.split('.').reduce((current, key) => {
        return current?.[key];
      }, obj);
    }

    _setNestedValue(obj, path, value) {
      const keys = path.split('.');
      const lastKey = keys.pop();
      
      const target = keys.reduce((current, key) => {
        if (!(key in current)) {
          current[key] = {};
        }
        return current[key];
      }, obj);
      
      target[lastKey] = value;
    }

    _notify(path, newValue, oldValue) {
      // Notify specific path subscribers
      if (this.subscribers.has(path)) {
        this.subscribers.get(path).forEach(callback => {
          try {
            callback(newValue, oldValue);
          } catch (error) {
            console.error(`[StateManager] Error in subscriber for "${path}":`, error);
          }
        });
      }
      
      // Emit global state change event
      this.eventBus.emit('state:change', { path, newValue, oldValue });
      
      // Emit specific state change event
      this.eventBus.emit(`state:${path}`, newValue, oldValue);
    }
  }

  /**
   * UI Styles - Global CSS definitions
   */

  const GLOBAL_STYLES = `
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
  html.lumi-element-cursor, body.lumi-element-cursor { cursor: crosshair !important; }
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

  const TOKENS_CSS = ":root {\n  --dock-bg: #ffffff;\n  --dock-stroke: rgba(0,0,0,0.08);\n  --dock-fg: #111111;\n  --dock-fg-2: #5F6368;\n  --accent: #3B82F6;\n  --success: #10B981;\n  --error: #EF4444;\n  --on-accent: #ffffff;\n  --on-strong: #ffffff;\n  --shadow: 0 4px 12px rgba(0,0,0,0.05);\n  --radius-panel: 18px;\n  --radius-chip: 8px;\n}\n:root.dark-dock {\n  --dock-bg: #161618;\n  --dock-stroke: rgba(255,255,255,0.12);\n  --dock-fg: #F5F5F7;\n  --dock-fg-2: #B0B3B8;\n  --accent: #60A5FA;\n  --success: #34D399;\n  --error: #F87171;\n  --on-accent: #ffffff;\n  --on-strong: #ffffff;\n  --shadow: 0 6px 16px rgba(0,0,0,0.35);\n  --radius-panel: 18px;\n  --radius-chip: 8px;\n}\n";

  /**
   * DOM Utilities
   */

  /**
   * Get CSS selector for an element
   */
  function getElementSelector(element) {
    if (!element) return '';

    // Prefer id when available
    if (element.id) return `#${CSS.escape(element.id)}`;

    const parts = [];
    const tag = element.tagName ? element.tagName.toLowerCase() : '*';
    parts.push(tag);

    // Use up to 2 class names for specificity
    const classes = Array.from(element.classList || []).slice(0, 2);
    classes.forEach(cls => parts.push(`.${CSS.escape(cls)}`));

    let selector = parts.join('');

    // If selector without nth-child uniquely identifies element, return early
    try {
      if (element.ownerDocument?.querySelectorAll(selector).length === 1) {
        return selector;
      }
    } catch (_) {
      // Fall through if invalid selector
    }

    // Otherwise, include :nth-of-type and parent context to ensure uniqueness
    const position = getNthOfType(element);
    selector = `${selector}:nth-of-type(${position})`;

    const parent = element.parentElement;
    if (parent && parent !== document.body && parent !== document.documentElement) {
      const parentSelector = getElementSelector(parent);
      if (parentSelector) {
        selector = `${parentSelector} > ${selector}`;
      }
    }

    return selector;
  }

  function getNthOfType(element) {
    if (!element || !element.parentElement) return 1;
    const tagName = element.tagName;
    if (!tagName) return 1;
    let index = 1;
    let sibling = element.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === tagName) {
        index += 1;
      }
      sibling = sibling.previousElementSibling;
    }
    return index;
  }

  /**
   * Get human-readable element name
   */
  function readableElementName(element) {
    if (!element) return 'element';
    if (element.id) return `#${element.id}`;
    // className can be an SVGAnimatedString or object; normalize to string safely
    let classStr = '';
    try {
      const raw = element.className;
      classStr = typeof raw === 'string' ? raw : (raw && typeof raw.baseVal === 'string' ? raw.baseVal : '');
    } catch (_) { classStr = ''; }
    const firstClass = classStr.split(' ').filter(Boolean)[0];
    if (firstClass) return `${element.tagName.toLowerCase()}.${firstClass}`;
    return element.tagName.toLowerCase();
  }

  /**
   * Get computed style summary for an element
   */
  function getComputedStyleSummary(element) {
    const computed = window.getComputedStyle(element);
    return {
      display: computed.display,
      position: computed.position,
      width: computed.width,
      height: computed.height,
      backgroundColor: computed.backgroundColor,
      color: computed.color,
      fontSize: computed.fontSize,
      fontWeight: computed.fontWeight,
      lineHeight: computed.lineHeight,
      fontFamily: computed.fontFamily,
      padding: computed.padding,
      margin: computed.margin,
      border: computed.border,
      borderRadius: computed.borderRadius,
      boxShadow: computed.boxShadow,
      paddingTop: computed.paddingTop,
      paddingRight: computed.paddingRight,
      paddingBottom: computed.paddingBottom,
      paddingLeft: computed.paddingLeft,
      marginTop: computed.marginTop,
      marginRight: computed.marginRight,
      marginBottom: computed.marginBottom,
      marginLeft: computed.marginLeft,
      cssVars: collectCSSVariables(computed)
    };
  }

  /**
   * Check if element should be ignored for selection
   */
  function shouldIgnoreElement(element) {
    if (!element) return true;
    
    // Ignore LUMI's own elements
    if (element.closest('#lumi-bubble-container') || 
        element.closest('#lumi-top-banner') ||
        element.closest('#lumi-dock-root') ||
        element.closest('#lumi-interaction-bubble') ||
        element.closest('#dock-edit-modal') ||
        element.id === 'dock-edit-overlay' ||
        element.id === 'lumi-dock-launcher' ||
        element.closest('#lumi-controls-overlay') ||
        element.classList?.contains('lumi-highlight') ||
        element.classList?.contains('lumi-screenshot-overlay') ||
        element.classList?.contains('lumi-highlight-pen')) {
      return true;
    }
    // Ignore clicks inside Shadow DOM hosted by the dock
    try {
      const root = element.getRootNode && element.getRootNode();
      if (root && root.host && root.host.id === 'lumi-dock-root') return true;
    } catch (_) {}
    
    const tag = element.tagName && element.tagName.toLowerCase();
    if (tag === 'html' || tag === 'body') return true;
    
    return false;
  }

  function getElementClassList(element) {
    if (!element || !element.classList) return [];
    return Array.from(element.classList);
  }

  function getElementDataset(element) {
    if (!element || !element.dataset) return {};
    return { ...element.dataset };
  }

  function getAncestorTrail(element, limit = 4) {
    const trail = [];
    let current = element?.parentElement || null;
    while (current && trail.length < limit) {
      const tag = current.tagName ? current.tagName.toLowerCase() : 'unknown';
      const item = { tag };
      if (current.id) item.id = current.id;
      const firstClass = current.classList?.[0];
      if (firstClass) item.class = firstClass;
      const nth = getNthOfType(current);
      item.nth = nth;
      trail.push(item);
      current = current.parentElement;
    }
    return trail;
  }

  function detectFrameworkSignatures() {
    const frameworks = {
      react: !!window.__REACT_DEVTOOLS_GLOBAL_HOOK__ || !!document.querySelector('[data-reactroot], [data-reactid]'),
      vue: !!window.__VUE_DEVTOOLS_GLOBAL_HOOK__ || !!document.querySelector('[data-v-app], [data-v-]'),
      tailwind: detectTailwind(),
      cssModules: detectCssModules(),
      cssInJs: detectCssInJs()
    };

    const styleStrategy = determineStyleStrategy(frameworks);

    return { frameworks, styleStrategy };
  }

  function detectTailwind() {
    if (document.querySelector('link[href*="tailwind"], script[src*="tailwind"]')) return true;
    if (document.querySelector('style[data-tailwind]')) return true;
    const candidates = ['bg-', 'text-', 'px-', 'py-', 'mx-', 'my-', 'rounded-', 'shadow-', 'grid-cols-'];
    return candidates.some(prefix => document.querySelector(`[class*="${prefix}"]`));
  }

  function detectCssModules() {
    const elements = document.querySelectorAll('[class]');
    const pattern = /_[a-z0-9]{4,}$/i;
    let matches = 0;
    let inspected = 0;
    for (const el of elements) {
      inspected += 1;
      for (const cls of el.classList) {
        if (pattern.test(cls)) {
          matches += 1;
          if (matches >= 3) {
            return true;
          }
        }
      }
      if (matches >= 3 || inspected >= 400) break;
    }
    return false;
  }

  function detectCssInJs() {
    if (document.querySelector('style[data-styled]')) return true;
    if (document.querySelector('style[data-emotion]')) return true;
    if (document.querySelector('style[data-css]')) return true;
    return false;
  }

  function determineStyleStrategy(frameworks) {
    if (frameworks.tailwind) return 'tailwind';
    if (frameworks.cssModules) return 'css-modules';
    if (frameworks.cssInJs) return 'css-in-js';
    return 'css';
  }

  function collectCSSVariables(computed) {
    const vars = [];
    if (!computed) return vars;
    for (let i = 0; i < computed.length; i += 1) {
      const prop = computed[i];
      if (prop && prop.startsWith('--')) {
        vars.push({ name: prop, value: computed.getPropertyValue(prop) });
      }
    }
    return vars;
  }

  /**
   * HighlightManager - Manage hover/selection halos and screenshot overlays
   */

  class HighlightManager {
    constructor(eventBus = null, rootDocument = document, rootWindow = window) {
      this.eventBus = eventBus;
      this.doc = rootDocument || document;
      this.win = rootWindow || window;
      this.hoverHighlight = null;
      this.selectionHighlights = [];
      this.selectionElements = [];
      this.selectionListeners = new Map();
      this.screenshotOverlay = null;
      this._mo = null;
      this._onScroll = this.updateAllPositions.bind(this);
      this._onResize = this.updateAllPositions.bind(this);
      this._raf = null;
      this._extraScrollEl = null;
    }

    showHover(element) {
      this.hideHover();
      const bbox = element.getBoundingClientRect();
      const halo = this.doc.createElement('div');
      halo.className = 'lumi-highlight lumi-hover';
      halo.style.cssText = this.buildHaloStyle(bbox, element);
      // Hover halo must never intercept pointer events; clicks should go to the page element
      halo.style.pointerEvents = 'none';
      this.doc.body.appendChild(halo);
      this.hoverHighlight = halo;
    }

    hideHover() {
      if (this.hoverHighlight) {
        this.hoverHighlight.remove();
        this.hoverHighlight = null;
      }
    }

    addSelection(element, index = null) {
      const bbox = element.getBoundingClientRect();
      const halo = this.doc.createElement('div');
      halo.className = 'lumi-highlight lumi-selected';
      halo.style.cssText = this.buildHaloStyle(bbox, element);

      // Subtle fill layer (only on hover)
      const fill = this.doc.createElement('div');
      fill.style.cssText = `
      position:absolute; inset:0; border-radius:inherit;
      background: color-mix(in srgb, var(--accent) 6%, transparent);
      pointer-events:none; opacity:0; transition: opacity 120ms ease;
    `;
      halo.appendChild(fill);

      // Inline edit affordance (top-right pill)
      const action = this.doc.createElement('button');
      action.type = 'button';
      action.setAttribute('aria-label', 'Edit');
      action.style.cssText = `
      position:absolute; top:-10px; right:-10px; 
      padding:4px 8px; border-radius:999px; border:1px solid var(--dock-stroke);
      background: var(--dock-bg); color: var(--dock-fg);
      font-size:11px; line-height:1; pointer-events:auto; cursor:pointer;
      box-shadow: var(--shadow); display:none;
    `;
      action.textContent = 'Edit';
      action.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = resolveIndex();
        if (this.eventBus && typeof idx === 'number') {
          this.eventBus.emit('edit:open', { index: idx, element });
        }
      });
      halo.appendChild(action);

      const resolveIndex = () => {
        const current = this.selectionElements.indexOf(element);
        if (current >= 0) return current;
        return typeof index === 'number' ? index : 0;
      };

      // Element label (top-left, subtle)
      const label = this.doc.createElement('div');
      label.style.cssText = `
      position:absolute; top:-10px; left:0; transform: translateY(-100%);
      padding:0 6px; font-size:10px; line-height:16px; height:16px; border-radius:8px;
      color: var(--dock-fg-2); background: color-mix(in srgb, var(--dock-bg) 80%, transparent);
      pointer-events:none; white-space:nowrap; box-shadow:none; border:none;
    `;
      label.textContent = this.readable(element);
      halo.appendChild(label);

      halo.addEventListener('mouseenter', () => {
        action.style.display = 'inline-flex';
        fill.style.opacity = '1';
        if (this.eventBus) {
          this.eventBus.emit('interaction:hover', { element, index: resolveIndex() });
        }
      });
      halo.addEventListener('mouseleave', () => {
        action.style.display = 'none';
        fill.style.opacity = '0';
        if (this.eventBus) {
          this.eventBus.emit('interaction:leave', { element, index: resolveIndex() });
        }
      });

      halo.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const idx = resolveIndex();
        if (this.eventBus && typeof idx === 'number') {
          this.eventBus.emit('edit:open', { index: idx, element });
        }
      });

      this.doc.body.appendChild(halo);
      const nextIndex = this.selectionHighlights.push(halo) - 1;
      this.selectionElements.push(element);

      const onEnter = () => {
        if (this.eventBus) {
          this.eventBus.emit('interaction:hover', { element, index: resolveIndex() });
        }
      };
      const onLeave = () => {
        if (this.eventBus) {
          this.eventBus.emit('interaction:leave', { element, index: resolveIndex() });
        }
      };
      element.addEventListener('mouseenter', onEnter);
      element.addEventListener('mouseleave', onLeave);
      this.selectionListeners.set(element, { onEnter, onLeave });

      halo.dataset.index = String(nextIndex);
      this.ensureObservers();
      return nextIndex;
    }

    removeSelection(index) {
      const highlight = this.selectionHighlights[index];
      if (highlight) {
        highlight.remove();
      }
      this.selectionHighlights.splice(index, 1);

      const element = this.selectionElements[index];
      if (element) {
        const handlers = this.selectionListeners.get(element);
        if (handlers) {
          element.removeEventListener('mouseenter', handlers.onEnter);
          element.removeEventListener('mouseleave', handlers.onLeave);
          this.selectionListeners.delete(element);
        }
      }
      this.selectionElements.splice(index, 1);

      this.selectionHighlights.forEach((halo, idx) => {
        halo.dataset.index = String(idx);
      });
    }

    clearAllSelections() {
      this.selectionHighlights.forEach(h => h.remove());
      this.selectionHighlights = [];
      this.selectionElements.forEach((element) => {
        const handlers = this.selectionListeners.get(element);
        if (handlers) {
          element.removeEventListener('mouseenter', handlers.onEnter);
          element.removeEventListener('mouseleave', handlers.onLeave);
        }
      });
      this.selectionElements = [];
      this.selectionListeners.clear();
      this.teardownObservers();
    }

    showScreenshotOverlay(bbox) {
      this.hideScreenshotOverlay();
      const overlay = document.createElement('div');
      overlay.className = 'lumi-screenshot-overlay';
      overlay.style.cssText = `
      position: absolute;
      left: ${bbox.left}px;
      top: ${bbox.top}px;
      width: ${bbox.width}px;
      height: ${bbox.height}px;
      border: 2px dashed var(--accent);
      background: color-mix(in srgb, var(--accent) 14%, transparent);
      pointer-events: none;
      z-index: 2147483645;
    `;
      document.body.appendChild(overlay);
      this.screenshotOverlay = overlay;
    }

    updateScreenshotOverlay(bbox) {
      if (!this.screenshotOverlay) {
        this.showScreenshotOverlay(bbox);
        return;
      }
      this.screenshotOverlay.style.left = `${bbox.left}px`;
      this.screenshotOverlay.style.top = `${bbox.top}px`;
      this.screenshotOverlay.style.width = `${bbox.width}px`;
      this.screenshotOverlay.style.height = `${bbox.height}px`;
    }

    hideScreenshotOverlay() {
      if (this.screenshotOverlay) {
        this.screenshotOverlay.remove();
        this.screenshotOverlay = null;
      }
    }

    clearAll() {
      this.hideHover();
      this.clearAllSelections();
      this.hideScreenshotOverlay();
    }

    buildHaloStyle(bbox, element) {
      const computed = window.getComputedStyle(element);
      const radius = computed.borderRadius || '14px';
      return `
      position: absolute;
      top: ${bbox.top + window.scrollY}px;
      left: ${bbox.left + window.scrollX}px;
      width: ${bbox.width}px;
      height: ${bbox.height}px;
      pointer-events: auto;
      z-index: 2147483645;
      border-radius: ${radius};
      box-shadow: 0 0 0 2px var(--accent);
      background: transparent;
      cursor: pointer;
      transition: box-shadow 0.15s ease;
    `;
    }

    penSVG() { return ''; }

    readable(el) {
      try {
        if (!el) return 'element';
        if (el.id) return `#${el.id}`;
        const cls = el.classList && el.classList[0];
        const tag = (el.tagName || 'element').toLowerCase();
        return cls ? `${tag}.${cls}` : tag;
      } catch (_) { return 'element'; }
    }

    ensureObservers() {
      if (this._mo) return;
      this._mo = new MutationObserver(() => this.scheduleUpdate());
      try { this._mo.observe(this.doc.body, { attributes: true, childList: true, subtree: true }); } catch (_) {}
      this.win.addEventListener('scroll', this._onScroll, true);
      this.win.addEventListener('resize', this._onResize, true);
      if (this._extraScrollEl) {
        try { this._extraScrollEl.addEventListener('scroll', this._onScroll, { passive: true }); } catch (_) {}
      }
    }

    teardownObservers() {
      if (this._mo) { try { this._mo.disconnect(); } catch (_) {} this._mo = null; }
      this.win.removeEventListener('scroll', this._onScroll, true);
      this.win.removeEventListener('resize', this._onResize, true);
      if (this._extraScrollEl) {
        try { this._extraScrollEl.removeEventListener('scroll', this._onScroll); } catch (_) {}
      }
      if (this._raf) { this.win.cancelAnimationFrame ? this.win.cancelAnimationFrame(this._raf) : cancelAnimationFrame(this._raf); this._raf = null; }
    }

    setExtraScrollContainer(el) {
      if (this._extraScrollEl && this._extraScrollEl !== el) {
        try { this._extraScrollEl.removeEventListener('scroll', this._onScroll); } catch (_) {}
      }
      this._extraScrollEl = el || null;
      // If observers are active, attach immediately
      if (this._extraScrollEl && this._mo) {
        try { this._extraScrollEl.addEventListener('scroll', this._onScroll, { passive: true }); } catch (_) {}
      }
    }

    scheduleUpdate() {
      if (this._raf) return;
      const raf = this.win.requestAnimationFrame || requestAnimationFrame;
      this._raf = raf(() => {
        this._raf = null;
        this.updateAllPositions();
      });
    }

    updateAllPositions() {
      if (!this.selectionHighlights.length) return;
      this.selectionHighlights.forEach((halo, idx) => {
        const el = this.selectionElements[idx];
        if (!halo || !el || !el.getBoundingClientRect) return;
        const r = el.getBoundingClientRect();
        halo.style.top = (r.top + this.win.scrollY) + 'px';
        halo.style.left = (r.left + this.win.scrollX) + 'px';
        halo.style.width = r.width + 'px';
        halo.style.height = r.height + 'px';
        // keep radius in sync if element style changed
        try { halo.style.borderRadius = this.win.getComputedStyle(el).borderRadius || '14px'; } catch (_) {}
      });
    }
  }

  /**
   * ElementSelector - Handle element selection mode
   */


  class ElementSelector {
    constructor(eventBus, stateManager, highlightManager, topBanner, rootDocument = document, rootWindow = window) {
      this.eventBus = eventBus;
      this.stateManager = stateManager;
      this.highlightManager = highlightManager;
      this.topBanner = topBanner;
      this.doc = rootDocument || document;
      this.win = rootWindow || window;
      this.isActive = false;
      this._blockers = [];
      
      // Bind methods
      this.handleMouseMove = this.handleMouseMove.bind(this);
      this.handleClick = this.handleClick.bind(this);
    }

    // Local helper: whether text content can be edited safely (leaf nodes only)
    canEditText(el) {
      try {
        if (!el) return false;
        const tag = (el.tagName || '').toLowerCase();
        if (['input','textarea','img','video','canvas','svg'].includes(tag)) return false;
        return el.childElementCount === 0;
      } catch (_) { return false; }
    }

    activate() {
      if (this.isActive) return;
      
      this.isActive = true;
      this.stateManager.set('ui.mode', 'element');
      
      this.topBanner.update('Click to select element');
      
      this.doc.addEventListener('mousemove', this.handleMouseMove, true);
      this.doc.addEventListener('click', this.handleClick, true);
      // Block page interactions while picking
      const block = (e) => { e.preventDefault(); e.stopPropagation(); };
      ['pointerdown','mousedown','mouseup','click','dblclick','contextmenu'].forEach(evt => {
        this.doc.addEventListener(evt, block, true);
        this._blockers.push({ evt, block });
      });
      this.doc.documentElement.classList.add('lumi-element-cursor');
      this.doc.body.classList.add('lumi-element-cursor');
      
      this.eventBus.emit('element-mode:activated');
    }

    deactivate() {
      if (!this.isActive) return;
      
      this.isActive = false;
      this.stateManager.set('ui.mode', 'idle');
      this.stateManager.set('ui.dockState', 'normal');
      
      this.topBanner.hide();
      this.highlightManager.hideHover();
      
      this.doc.removeEventListener('mousemove', this.handleMouseMove, true);
      this.doc.removeEventListener('click', this.handleClick, true);
      // Remove blockers
      this._blockers.forEach(({evt, block}) => {
        this.doc.removeEventListener(evt, block, true);
      });
      this._blockers = [];
      this.doc.documentElement.classList.remove('lumi-element-cursor');
      this.doc.body.classList.remove('lumi-element-cursor');
      
      this.eventBus.emit('element-mode:deactivated');
    }

    handleMouseMove(e) {
      if (!this.isActive || shouldIgnoreElement(e.target)) return;
      
      const hoveredElement = this.stateManager.get('selection.hoveredElement');
      if (hoveredElement !== e.target) {
        this.stateManager.set('selection.hoveredElement', e.target);
        this.highlightManager.showHover(e.target);
      }
    }

    handleClick(e) {
      if (!this.isActive || shouldIgnoreElement(e.target)) return;

      e.preventDefault();
      e.stopPropagation();

      // UX: element mode is additive by default
      const element = e.target;
      this.addElement(element);
    }

    addElement(element) {
      const elements = this.stateManager.get('selection.elements');
      
      // Check if already selected
      const exists = elements.some(item => item.element === element);
      if (exists) return;
      
      const selector = getElementSelector(element);
      const bbox = element.getBoundingClientRect();
      
      // Capture a baseline snapshot for Reset semantics across multiple edits
      const baselineInline = {
        color: element.style.color,
        backgroundColor: element.style.backgroundColor,
        fontSize: element.style.fontSize,
        fontWeight: element.style.fontWeight,
        lineHeight: element.style.lineHeight,
        paddingTop: element.style.paddingTop,
        paddingRight: element.style.paddingRight,
        paddingBottom: element.style.paddingBottom,
        paddingLeft: element.style.paddingLeft,
        borderRadius: element.style.borderRadius,
        boxShadow: element.style.boxShadow
      };

      const item = {
        element,
        selector,
        tagName: element.tagName.toLowerCase(),
        bbox: {
          top: bbox.top + this.win.scrollY,
          left: bbox.left + this.win.scrollX,
          width: bbox.width,
          height: bbox.height
        },
        baseline: {
          text: this.canEditText(element) ? element.textContent : null,
          inline: baselineInline
        }
      };
      
      const updated = [...elements, item];
      this.stateManager.set('selection.elements', updated);

      this.highlightManager.addSelection(element, updated.length - 1);
      this.eventBus.emit('element:selected', item);

      // Exit element mode after each selection for clarity
      this.deactivate();
    }

    clearSelections() {
      this.stateManager.set('selection.elements', []);
      this.highlightManager.clearAllSelections();
      this.eventBus.emit('selections:cleared');
    }
  }

  /**
   * ScreenshotSelector - Handle screenshot selection mode
   */

  class ScreenshotSelector {
    constructor(eventBus, stateManager, highlightManager, topBanner, chromeBridge) {
      this.eventBus = eventBus;
      this.stateManager = stateManager;
      this.highlightManager = highlightManager;
      this.topBanner = topBanner;
      this.chromeBridge = chromeBridge;
      this.isActive = false;
      this.screenshotStart = null;
      this.overlay = null;
      
      // Bind methods
      this.handleMouseDown = this.handleMouseDown.bind(this);
      this.handleMouseMove = this.handleMouseMove.bind(this);
      this.handleMouseUp = this.handleMouseUp.bind(this);
    }

    activate() {
      if (this.isActive) return;
      
      this.isActive = true;
      this.stateManager.set('ui.mode', 'screenshot');
      
      this.topBanner.update('Drag to select area for screenshot');
      
      this._createOverlay();
      if (this.overlay) {
        this.overlay.addEventListener('mousedown', this.handleMouseDown, true);
      } else {
        // Fallback: keep old behavior if overlay creation fails
        document.addEventListener('mousedown', this.handleMouseDown, true);
      }
      document.documentElement.classList.add('lumi-screenshot-cursor');
      document.body.classList.add('lumi-screenshot-cursor');
      
      this.eventBus.emit('screenshot-mode:activated');
    }

    deactivate() {
      if (!this.isActive) return;
      
      this.isActive = false;
      this.stateManager.set('ui.mode', 'idle');
      this.stateManager.set('ui.dockState', 'normal');
      
      this.topBanner.hide();
      this.highlightManager.hideScreenshotOverlay();
      
      if (this.overlay) {
        this.overlay.removeEventListener('mousedown', this.handleMouseDown, true);
        this.overlay.remove();
        this.overlay = null;
      } else {
        document.removeEventListener('mousedown', this.handleMouseDown, true);
      }
      document.removeEventListener('mousemove', this.handleMouseMove, true);
      document.removeEventListener('mouseup', this.handleMouseUp, true);
      document.documentElement.classList.remove('lumi-screenshot-cursor');
      document.body.classList.remove('lumi-screenshot-cursor');
      
      this.eventBus.emit('screenshot-mode:deactivated');
    }

    handleMouseDown(e) {
      if (!this.isActive) return;
      e.preventDefault();
      e.stopPropagation();

      this.screenshotStart = {
        x: e.clientX,
        y: e.clientY
      };
      
      document.addEventListener('mousemove', this.handleMouseMove, true);
      document.addEventListener('mouseup', this.handleMouseUp, true);
    }

    handleMouseMove(e) {
      if (!this.screenshotStart) return;
      
      const current = {
        x: e.clientX,
        y: e.clientY
      };
      
      const bbox = {
        left: Math.min(this.screenshotStart.x, current.x) + window.scrollX,
        top: Math.min(this.screenshotStart.y, current.y) + window.scrollY,
        width: Math.abs(current.x - this.screenshotStart.x),
        height: Math.abs(current.y - this.screenshotStart.y)
      };
      
      this.highlightManager.updateScreenshotOverlay(bbox);
    }

    handleMouseUp(e) {
      if (!this.screenshotStart) return;

      e.preventDefault();
      e.stopPropagation();

      const end = {
        x: e.clientX,
        y: e.clientY
      };
      
      const bbox = {
        left: Math.min(this.screenshotStart.x, end.x) + window.scrollX,
        top: Math.min(this.screenshotStart.y, end.y) + window.scrollY,
        width: Math.abs(end.x - this.screenshotStart.x),
        height: Math.abs(end.y - this.screenshotStart.y)
      };
      
      // Minimum size check
      if (bbox.width > 20 && bbox.height > 20) {
        this.captureScreenshot(bbox);
      }
      
      this.highlightManager.hideScreenshotOverlay();
      this.screenshotStart = null;
      
      document.removeEventListener('mousemove', this.handleMouseMove, true);
      document.removeEventListener('mouseup', this.handleMouseUp, true);
      
      this.deactivate();
    }

    async captureScreenshot(bbox) {
      try {
        const dataUrl = await this.chromeBridge.captureScreenshot();
        
        // Support accumulating screenshots; prefer array if present
        const existing = this.stateManager.get('selection.screenshots');
        const next = Array.isArray(existing) ? existing.slice() : [];
        next.push({ dataUrl, bbox, id: Date.now(), createdAt: Date.now() });
        this.stateManager.set('selection.screenshots', next);
        
        this.eventBus.emit('screenshot:captured', { dataUrl, bbox });
      } catch (error) {
        console.error('[ScreenshotSelector] Failed to capture:', error);
        this.eventBus.emit('screenshot:error', error);
      }
    }

    _createOverlay() {
      try {
        const overlay = document.createElement('div');
        overlay.className = 'lumi-screenshot-mask';
        overlay.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 2147483645;
        cursor: crosshair;
        background: transparent;
      `;
        const suppress = (event) => {
          event.preventDefault();
          event.stopPropagation();
        };
        ['click', 'contextmenu', 'auxclick'].forEach(evt => {
          overlay.addEventListener(evt, suppress, true);
        });
        document.body.appendChild(overlay);
        this.overlay = overlay;
      } catch (error) {
        console.error('[ScreenshotSelector] Failed to create overlay:', error);
        this.overlay = null;
      }
    }
  }

  /**
   * EngineManager - Manage AI engine selection and availability
   * Fixes: Engine selection being overwritten by health check
   */

  class EngineManager {
    constructor(eventBus, stateManager, chromeBridge) {
      this.eventBus = eventBus;
      this.stateManager = stateManager;
      this.chromeBridge = chromeBridge;
    }

    async init() {
      console.log('[EngineManager] Initializing...');
      
      // Initialize availability to unknown state (will be updated by HealthChecker)
      this.stateManager.set('engine.available', { codex: false, claude: false });
      
      // Load saved engine preference
      const stored = await this.chromeBridge.storageGet(['engine']);
      console.log('[EngineManager] Stored engine:', stored.engine);
      
      if (stored.engine && (stored.engine === 'codex' || stored.engine === 'claude')) {
        console.log('[EngineManager] Restoring saved engine:', stored.engine);
        this.selectEngine(stored.engine, true); // silent = true, no save
        this.stateManager.set('engine.restored', true);
      } else {
        console.log('[EngineManager] No saved engine, using default: codex');
        this.stateManager.set('engine.restored', true);
      }
      
      const currentEngine = this.stateManager.get('engine.current');
      console.log('[EngineManager] Initialized with engine:', currentEngine);
      this.eventBus.emit('engine:initialized', currentEngine);
    }

    selectEngine(engine, silent = false) {
      if (engine !== 'codex' && engine !== 'claude') {
        console.error('[EngineManager] Invalid engine:', engine);
        return;
      }
      
      console.log('[EngineManager] Selecting engine:', engine, 'silent:', silent);
      this.stateManager.set('engine.current', engine);
      
      // Persist to storage
      if (!silent) {
        console.log('[EngineManager] Saving engine to storage:', engine);
        this.chromeBridge.storageSet({ engine });
      }
      
      this.eventBus.emit('engine:selected', engine);
    }

    updateAvailability(codex, claude) {
      // Only update availability if engine has been restored from storage
      // This prevents health check from overwriting user selection during initialization
      const restored = this.stateManager.get('engine.restored');

      console.log('[EngineManager] updateAvailability called:', { codex, claude, restored });

      if (!restored) {
        console.log('[EngineManager] Still initializing, skipping availability update');
        return;
      }

      const previous = this.stateManager.get('engine.available') || {};
      const next = {
        codex: !!codex,
        claude: !!claude
      };

      if (previous.codex === next.codex && previous.claude === next.claude) {
        console.log('[EngineManager] Availability unchanged, skipping state update');
        return;
      }

      // Update as a whole object so subscribers to 'engine.available' fire
      this.stateManager.set('engine.available', next);

      console.log('[EngineManager] Engine availability updated:', next);
      this.eventBus.emit('engine:availability-updated', next);
    }

    getCurrentEngine() {
      return this.stateManager.get('engine.current');
    }

    getAvailableEngines() {
      return this.stateManager.get('engine.available');
    }

    isEngineAvailable(engine) {
      const available = this.getAvailableEngines();
      return !!available[engine];
    }
  }

  /**
   * HealthChecker - Periodic server health checks
   * Detects CLI availability and updates engine status
   */

  class HealthChecker {
    constructor(eventBus, stateManager, chromeBridge, engineManager) {
      this.eventBus = eventBus;
      this.stateManager = stateManager;
      this.chromeBridge = chromeBridge;
      this.engineManager = engineManager;
      this.intervalId = null;
      this.isRunning = false;
    }

    start(interval = 10000) {
      if (this.isRunning) return;
      
      this.isRunning = true;
      
      // Initial check
      this.checkOnce();
      
      // Periodic checks
      this.intervalId = setInterval(() => {
        this.checkOnce();
      }, interval);
      
      this.eventBus.emit('health-checker:started');
    }

    stop() {
      if (!this.isRunning) return;
      
      this.isRunning = false;
      
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
      
      this.eventBus.emit('health-checker:stopped');
    }

    async checkOnce() {
      try {
        const result = await this.chromeBridge.checkServerHealth();

        this.stateManager.set('engine.serverHealthy', result.healthy);

        // Server /health returns { status, version, uptime, config: { workingDirectory, cliCapabilities } }
        // Background forwards it as { healthy, config: <that object> }
        // Support both shapes defensively.
        const rawConfig = result?.config || null;
        const capsContainer = rawConfig?.cliCapabilities ? rawConfig : rawConfig?.config;
        const caps = capsContainer?.cliCapabilities || null;
        const projects = Array.isArray(rawConfig?.projects)
          ? rawConfig.projects
          : Array.isArray(rawConfig?.config?.projects)
            ? rawConfig.config.projects
            : [];
        const host = window.location?.host || '';
        const projectMatch = resolveProject(projects, window.location?.href);
        const projectAllowed = projects.length === 0 || !!projectMatch?.project;

        this.stateManager.batch({
          'projects.allowed': projectAllowed,
          'projects.current': projectMatch?.project || null,
          'projects.list': projects
        });

        if (!projectAllowed) {
          this.eventBus.emit('projects:blocked', {
            host,
            projects
          });
        } else {
          this.eventBus.emit('projects:allowed', {
            host,
            project: projectMatch?.project || null
          });
        }

        if (result.healthy && caps) {
          const codexAvailable = !!(caps.codex && caps.codex.available);
          const claudeAvailable = !!(caps.claude && caps.claude.available);

          // Update engine availability through EngineManager (respects init state)
          this.engineManager.updateAvailability(codexAvailable, claudeAvailable);
        } else if (result.healthy) {
          // Server healthy but no capabilities payload; keep previous availability
          const prev = this.engineManager.getAvailableEngines() || {};
          this.engineManager.updateAvailability(!!prev.codex, !!prev.claude);
        } else {
          // Server not healthy
          this.engineManager.updateAvailability(false, false);
        }

        this.eventBus.emit('health-check:completed', {
          healthy: result.healthy,
          config: result.config
        });
      } catch (error) {
        console.error('[HealthChecker] Check failed:', error);
        this.stateManager.set('engine.serverHealthy', false);
        this.engineManager.updateAvailability(false, false);
        
        this.eventBus.emit('health-check:error', error);
        this.stateManager.batch({
          'projects.allowed': false,
          'projects.current': null
        });
      }
    }
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function hostMatches(pattern, host) {
    if (!pattern || !host) return false;
    const normalizedPattern = pattern.trim().toLowerCase();
    const normalizedHost = host.trim().toLowerCase();
    if (!normalizedPattern.includes('*')) {
      return normalizedPattern === normalizedHost;
    }
    const regex = new RegExp('^' + normalizedPattern.split('*').map(escapeRegex).join('.*') + '$');
    return regex.test(normalizedHost);
  }

  function resolveProject(projects, pageUrl) {
    if (!Array.isArray(projects) || projects.length === 0) {
      return { project: null };
    }

    try {
      const url = new URL(pageUrl);
      const host = url.host.toLowerCase();
      let best = null;
      let bestScore = -Infinity;
      for (const project of projects) {
        if (!project || project.enabled === false) continue;
        const hosts = Array.isArray(project.hosts) ? project.hosts : [];
        for (const pattern of hosts) {
          if (!hostMatches(pattern, host)) continue;
          const normalized = String(pattern).trim().toLowerCase();
          const wildcards = (normalized.match(/\*/g) || []).length;
          const nonWildcardLen = normalized.replace(/\*/g, '').length;
          const exact = normalized === host ? 1 : 0;
          const score = exact * 10000 + nonWildcardLen - wildcards * 10;
          if (score > bestScore) {
            bestScore = score;
            best = project;
          }
        }
      }
      return { project: best };
    } catch (error) {
      return { project: null };
    }
  }

  /**
   * ChromeBridge - Abstraction layer for Chrome extension APIs
   * Provides safe wrappers for all Chrome API calls
   */

  class ChromeBridge {
    constructor(eventBus) {
      this.eventBus = eventBus;
      this.runtimeWarningEmitted = false;
      this.loggedErrors = new Set();
      this.contextInvalidatedWarned = false;
      this.recentRuntimeFailure = false;
      this.runtimeInvalidated = false;
    }

    /**
     * Check if runtime APIs are available
     */
    isRuntimeAvailable() {
      return !this.runtimeInvalidated &&
        typeof chrome !== 'undefined' &&
        !!chrome.runtime &&
        typeof chrome.runtime.sendMessage === 'function';
    }

    /**
     * Check if storage APIs are available
     */
    isStorageAvailable() {
      return this.isRuntimeAvailable() && typeof chrome.storage !== 'undefined' && !!chrome.storage.local;
    }

    /**
     * Send message to background script (safe wrapper)
     */
    sendMessage(message, callback) {
      try {
        if (this.runtimeInvalidated) {
          if (callback) callback(undefined);
          return;
        }
        if (!this.isRuntimeAvailable()) {
          if (!this.runtimeWarningEmitted) {
            console.warn('[ChromeBridge] Chrome runtime not available');
            this.runtimeWarningEmitted = true;
          }
          this.recentRuntimeFailure = true;
          if (callback) callback(undefined);
          return;
        }
        chrome.runtime.sendMessage(message, (response) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            if (!this.loggedErrors.has(lastError.message)) {
              console.warn('[ChromeBridge] Message failed:', lastError.message, message?.type || message);
              this.loggedErrors.add(lastError.message);
            }
            this.recentRuntimeFailure = true;
            if (callback) callback(undefined);
            return;
          }
          this.recentRuntimeFailure = false;
          if (callback) callback(response);
        });
      } catch (err) {
        this.handleRuntimeError(err);
        if (callback) callback(undefined);
      }
    }

    /**
     * Capture screenshot of visible tab
     */
    captureScreenshot() {
      return new Promise((resolve, reject) => {
        this.sendMessage({ type: 'CAPTURE_SCREENSHOT' }, (response) => {
          if (response && response.dataUrl) {
            resolve(response.dataUrl);
          } else {
            reject(new Error(response?.error || 'Screenshot capture failed'));
          }
        });
      });
    }

    /**
     * Check server health
     */
    checkServerHealth() {
      return new Promise((resolve) => {
        this.sendMessage({ type: 'CHECK_SERVER' }, (response) => {
          resolve({
            healthy: response?.healthy || false,
            config: response?.config || null
          });
        });
      });
    }

    /**
     * Send execution request to server
     */
    executeOnServer(engine, context, screenshot = null) {
      return new Promise((resolve, reject) => {
        this.sendMessage({
          type: 'SEND_TO_SERVER',
          payload: { engine, context, screenshot }
        }, (response) => {
          if (response && response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        });
      });
    }

    /**
     * Stream execution request to server
     */
    executeStreamOnServer(engine, context, streamId) {
      return new Promise((resolve, reject) => {
        this.sendMessage({
          type: 'EXECUTE_STREAM',
          payload: { engine, context, streamId }
        }, (response) => {
          if (response && response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        });
      });
    }

    /**
     * Get from storage
     */
    storageGet(keys) {
      return new Promise((resolve) => {
        if (!this.isStorageAvailable()) {
          console.warn('[ChromeBridge] Storage API not available, returning empty object');
          resolve({});
          return;
        }

        try {
          chrome.storage.local.get(keys, (result) => {
            resolve(result || {});
          });
        } catch (error) {
          console.warn('[ChromeBridge] Failed to read storage:', error);
          resolve({});
        }
      });
    }

    /**
     * Set to storage
     */
    storageSet(items) {
      return new Promise((resolve) => {
        if (!this.isStorageAvailable()) {
          console.warn('[ChromeBridge] Storage API not available, skipping write');
          resolve();
          return;
        }

        try {
          chrome.storage.local.set(items, () => {
            resolve();
          });
        } catch (error) {
          console.warn('[ChromeBridge] Failed to write storage:', error);
          resolve();
        }
      });
    }

    /**
     * Listen for messages from background
     */
    onMessage(callback) {
      if (!this.isRuntimeAvailable()) {
        console.warn('[ChromeBridge] Cannot register runtime listener; runtime unavailable');
        return;
      }

      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        let result;
        try {
          result = callback(message, sender, sendResponse);
        } catch (error) {
          console.error('[ChromeBridge] onMessage handler error:', error);
        }

        // If the handler explicitly returns true we respect it; otherwise we only return true
        // when we know a previous runtime call failed, so Chrome keeps the channel open for the retry.
        if (result === true) {
          return true;
        }

        return this.recentRuntimeFailure;
      });
    }

    handleRuntimeError(err) {
      if (!err || typeof err.message !== 'string') {
        console.warn('[ChromeBridge] Runtime context error:', err);
        return;
      }

      if (err.message.includes('Extension context invalidated')) {
        this.runtimeInvalidated = true;
        if (!this.contextInvalidatedWarned) {
          console.debug('[ChromeBridge] Extension context invalidated (page reload or extension restart).');
          this.contextInvalidatedWarned = true;
        }
        return;
      }

      console.warn('[ChromeBridge] Runtime context invalidated:', err.message);
    }
  }

  /**
   * ServerClient - Handle server communication
   */


  class ServerClient {
    constructor(chromeBridge) {
      this.chromeBridge = chromeBridge;
    }

    async execute(engine, intent, elements, screenshot, pageInfo, screenshots = [], edits = []) {
      const context = this.buildContext(intent, elements, screenshot, pageInfo, screenshots, edits);
      
      try {
        const result = await this.chromeBridge.executeOnServer(
          engine,
          context,
          screenshot?.dataUrl
        );
        
        return result;
      } catch (error) {
        console.error('[ServerClient] Execution failed:', error);
        throw error;
      }
    }

    async executeStream(engine, intent, elements, screenshot, pageInfo, screenshots = [], edits = [], streamId) {
      const context = this.buildContext(intent, elements, screenshot, pageInfo, screenshots, edits);

      try {
        await this.chromeBridge.executeStreamOnServer(
          engine,
          context,
          streamId
        );
        return { ok: true };
      } catch (error) {
        console.error('[ServerClient] Stream execution failed:', error);
        throw error;
      }
    }

    buildContext(intent, elements, screenshot, pageInfo, screenshots = [], edits = []) {
      const context = {
        intent,
        pageUrl: pageInfo.url,
        pageTitle: pageInfo.title,
        selectionMode: elements.length > 0 ? 'element' : 'screenshot',
        viewport: { width: window.innerWidth, height: window.innerHeight }
      };

      const { frameworks, styleStrategy } = detectFrameworkSignatures();
      context.meta = { frameworks, styleStrategy };

      const tagMap = {};

      // Elements → tag mapping and rich context
      if (Array.isArray(elements) && elements.length > 0) {
        context.elements = elements.map((item, idx) => {
          const tag = `@element${idx + 1}`;
          tagMap[tag] = { type: 'element', index: idx };
          const el = item.element;
          return {
            tag,
            index: idx + 1,
            selector: item.selector,
            tagName: el?.tagName,
            className: el?.className,
            classList: getElementClassList(el),
            dataset: getElementDataset(el),
            ancestors: getAncestorTrail(el),
            id: el?.id,
            outerHTML: el?.outerHTML,
            textContent: getElementText(el),
            computedStyle: getComputedStyleSummary(el),
            bbox: item.bbox,
            baseline: item.baseline || null,
            edited: !!item.edited
          };
        });
        context.elementCount = context.elements.length;
      }

      // Screenshots → tag mapping
      if (Array.isArray(screenshots) && screenshots.length > 0) {
        context.screenshots = screenshots.map((s, i) => {
          const tag = `@screenshot${i + 1}`;
          tagMap[tag] = { type: 'screenshot', index: i };
          return {
            tag,
            index: i + 1,
            bbox: s.bbox,
            dataUrl: s.dataUrl,
            id: s.id,
            createdAt: s.createdAt
          };
        });
      }
      if (screenshot) {
        // Legacy single-shot field for CLI image path flow
        context.screenshot = screenshot.dataUrl || screenshot;
      }

      // Include WYSIWYG edits with before/after derived from baseline
      if (Array.isArray(edits) && edits.length) {
        const elementByIndex = (i) => (context.elements || [])[i] || null;
        context.edits = edits.map(e => {
          const el = elementByIndex(e.index);
          const base = el?.baseline || {};
          const diffs = Object.entries(e.changes || {}).map(([prop, after]) => {
            const before = (base.inline && base.inline[prop] !== undefined)
              ? base.inline[prop]
              : (prop === 'text' && typeof base.text === 'string' ? base.text : 'unset');
            return { property: prop, before, after };
          });
          return {
            tag: el?.tag || `@element${(e.index ?? 0) + 1}`,
            selector: e.selector,
            diffs,
            summary: e.summary
          };
        });
      }

      context.tagMap = tagMap;
      return context;
    }
  }

  function getElementText(element) {
    if (!element) return '';
    const text = (element.textContent || '').trim();
    return text.length > 400 ? text.slice(0, 400) + '…' : text;
  }

  const DOCK_STYLES = `
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
    color: var(--text-secondary);
  }
  .assistant-result .result-body {
    font-size: 13px;
    color: var(--text);
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
    color: var(--text-secondary);
  }
  .assistant-result .result-file-row {
    font-size: 12px;
    color: var(--text);
  }
  .assistant-result .result-file-meta {
    font-size: 11px;
    color: var(--text-secondary);
    margin-left: 4px;
  }
  .assistant-timeline {
    margin-top: 6px;
  }
  .timeline-feed {
    margin: 0;
    padding-left: 0;
    list-style-type: none;
    color: var(--text);
    font-size: 13px;
  }
  .timeline-feed .timeline-item {
    margin: 8px 0;
    padding-left: 12px;
    border-left: 1px solid transparent;
    color: var(--text);
    transition: border-color 0.2s ease;
  }
  .timeline-feed .timeline-item:hover {
    border-left-color: var(--border);
  }
  .timeline-placeholder {
    font-size: 12px;
    color: var(--text-secondary);
    font-style: italic;
  }
  .feed-header {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
    margin-bottom: 6px;
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
    margin-top: 12px;
    font-size: 13px;
    color: var(--text);
  }
  .assistant-summary .summary-meta {
    font-size: 11px;
    color: var(--text-secondary);
    margin-bottom: 6px;
    opacity: 0.7;
  }
  .assistant-summary .summary-title {
    font-weight: 400;
    margin-bottom: 4px;
    font-size: 13px;
  }
  .assistant-summary .summary-body {
    color: var(--text);
    font-weight: 400;
    font-size: 13px;
    line-height: 1.6;
  }
  .timeline-toggle {
    background: transparent;
    border: none;
    color: var(--text-secondary);
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
    background: color-mix(in srgb, var(--text-secondary) 18%, transparent);
    animation: dock-skeleton 1.4s ease infinite;
  }
  .assistant-result .spinner {
    width: 14px;
    height: 14px;
    border-radius: 7px;
    border: 2px solid color-mix(in srgb, var(--text-secondary) 35%, transparent);
    border-top-color: var(--text-secondary);
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
    color: var(--text-secondary);
    font-style: italic;
  }
  .raw-logs {
    margin-top: 8px;
    font-size: 12px;
  }
  .raw-logs summary {
    cursor: pointer;
    color: var(--text-secondary);
  }
  .raw-logs-body {
    margin-top: 6px;
    padding: 10px;
    border: 1px solid var(--border);
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
    color: var(--text-secondary);
    cursor: pointer;
  }
  .diff-body {
    margin-top: 6px;
    border: 1px solid var(--border);
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
    color: color-mix(in srgb, var(--success) 60%, var(--text));
  }
  .diff-line.del {
    background: color-mix(in srgb, var(--error) 12%, transparent);
    color: color-mix(in srgb, var(--error) 60%, var(--text));
  }
  .diff-line.ctx {
    color: var(--text-secondary);
  }
  
  /* Thinking section */
  .msg .thinking-summary {
    color: var(--text-tertiary);
    font-style: italic;
  }
  .msg .thinking-content {
    padding-top: 8px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-secondary);
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

  .msg.user .bubble {
    font-size: 13px;
    line-height: 1.6;
    color: var(--text);
  }

  /* History */
  .history-list { display: flex; flex-direction: column; gap: 18px; }
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
    padding: 16px 20px;
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

  function escapeHtml(str = '') {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Minimal Markdown renderer to DOM nodes (safe subset, no HTML injection)
  // Supports: headings, paragraphs, code fences, inline code, bold, italic, links, lists

  function renderMarkdown(markdown, doc = document) {
    const frag = doc.createDocumentFragment();
    if (!markdown || typeof markdown !== 'string') return frag;

    const blocks = splitIntoBlocks(markdown);
    blocks.forEach((blk) => {
      if (blk.type === 'code') {
        const pre = doc.createElement('pre');
        pre.className = 'md-code';
        const code = doc.createElement('code');
        if (blk.lang) code.dataset.lang = blk.lang;
        code.textContent = blk.text;
        pre.appendChild(code);
        frag.appendChild(pre);
        return;
      }
      if (blk.type === 'list') {
        const ul = doc.createElement('ul');
        ul.className = 'md-list';
        blk.items.forEach((item) => {
          const li = doc.createElement('li');
          applyInline(li, item, doc);
          ul.appendChild(li);
        });
        frag.appendChild(ul);
        return;
      }
      if (blk.type === 'heading') {
        const level = Math.min(6, Math.max(1, blk.level));
        const el = doc.createElement('h' + level);
        el.className = 'md-h';
        applyInline(el, blk.text, doc);
        frag.appendChild(el);
        return;
      }
      const p = doc.createElement('p');
      p.className = 'md-p';
      applyInline(p, blk.text, doc);
      frag.appendChild(p);
    });
    return frag;
  }

  function splitIntoBlocks(md) {
    const lines = md.replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      // Fenced code block
      const fence = line.match(/^```\s*([a-zA-Z0-9_-]+)?\s*$/);
      if (fence) {
        const lang = fence[1] || '';
        let j = i + 1;
        const buf = [];
        while (j < lines.length && !/^```\s*$/.test(lines[j])) {
          buf.push(lines[j]);
          j++;
        }
        out.push({ type: 'code', lang, text: buf.join('\n') });
        i = j + 1;
        continue;
      }
      // Heading
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        out.push({ type: 'heading', level: h[1].length, text: h[2] || '' });
        i++;
        continue;
      }
      // List (only bullets for simplicity)
      if (/^\s*[-*+]\s+/.test(line)) {
        const items = [];
        let j = i;
        while (j < lines.length && /^\s*[-*+]\s+/.test(lines[j])) {
          items.push(lines[j].replace(/^\s*[-*+]\s+/, ''));
          j++;
        }
        out.push({ type: 'list', items });
        i = j;
        continue;
      }
      // Blank lines → paragraph separators
      if (!line.trim()) {
        i++;
        continue;
      }
      // Paragraph: collect until blank line or other block
      const buf = [line];
      let j = i + 1;
      while (j < lines.length && lines[j].trim() && !/^```/.test(lines[j]) && !/^(#{1,6})\s+/.test(lines[j]) && !/^\s*[-*+]\s+/.test(lines[j])) {
        buf.push(lines[j]);
        j++;
      }
      out.push({ type: 'paragraph', text: buf.join('\n') });
      i = j;
    }
    return out;
  }

  function applyInline(el, text, doc) {
    // Tokenize inline: code `..`, strong **..**, em *..*, links [text](url)
    const tokens = tokenizeInline(text);
    tokens.forEach(t => {
      if (t.type === 'text') {
        el.appendChild(doc.createTextNode(t.value));
      } else if (t.type === 'code') {
        const n = doc.createElement('code');
        n.className = 'md-code-inline';
        n.textContent = t.value;
        el.appendChild(n);
      } else if (t.type === 'strong') {
        const n = doc.createElement('strong');
        n.textContent = t.value;
        el.appendChild(n);
      } else if (t.type === 'em') {
        const n = doc.createElement('em');
        n.textContent = t.value;
        el.appendChild(n);
      } else if (t.type === 'link') {
        const a = doc.createElement('a');
        a.href = t.href;
        a.textContent = t.text || t.href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        el.appendChild(a);
      }
    });
  }

  function tokenizeInline(text) {
    const out = [];
    let i = 0;
    const s = String(text || '');
    while (i < s.length) {
      // code
      if (s[i] === '`') {
        const j = s.indexOf('`', i + 1);
        if (j > i + 1) {
          out.push({ type: 'code', value: s.slice(i + 1, j) });
          i = j + 1;
          continue;
        }
      }
      // strong **
      if (s[i] === '*' && s[i + 1] === '*') {
        const j = s.indexOf('**', i + 2);
        if (j > i + 2) {
          out.push({ type: 'strong', value: s.slice(i + 2, j) });
          i = j + 2;
          continue;
        }
      }
      // em *
      if (s[i] === '*') {
        const j = s.indexOf('*', i + 1);
        if (j > i + 1) {
          out.push({ type: 'em', value: s.slice(i + 1, j) });
          i = j + 1;
          continue;
        }
      }
      // link [text](url)
      if (s[i] === '[') {
        const j = s.indexOf(']', i + 1);
        if (j > i + 1 && s[j + 1] === '(') {
          const k = s.indexOf(')', j + 2);
          if (k > j + 2) {
            const text = s.slice(i + 1, j);
            const href = s.slice(j + 2, k);
            out.push({ type: 'link', text, href });
            i = k + 1;
            continue;
          }
        }
      }
      // plain
      out.push({ type: 'text', value: s[i] });
      i++;
    }
    return out;
  }

  /**
   * Client-side timeline builder for streaming updates
   * Ported from server/parse/index.js to allow real-time UI updates
   */

  const EntryKind = {
      THINKING: 'thinking',
      COMMAND: 'command',
      FILE_CHANGE: 'file-change',
      TEST: 'test',
      FINAL: 'final-message',
      ERROR: 'error'
  };

  const EntryStatus = {
      DONE: 'done',
      FAILED: 'failed'
  };

  function stripFileCount(text = '') {
      try {
          return String(text).replace(/Updated\s+\d+\s+file(s)?\.?/gi, '').trim();
      } catch (_) {
          return text;
      }
  }

  /**
   * Build a linear, chronological timeline from Chunk[]
   * @param {Array} chunks raw chunk array
   * @param {Object} timing optional timing info { durationMs?: number }
   * @returns {{ summary: any, timeline: any[] }}
   */
  function buildTimelineFromChunks(chunks = [], timing = {}) {
      const entries = [];
      const chunkArray = Array.isArray(chunks) ? chunks : [];
      let counter = 0;
      const nextId = (kind) => `${kind || 'entry'}_${++counter}`;

      // Helper to detect command types
      const isTestCommand = (cmd = '') => /(?:npm|pnpm|yarn)\s+test\b|pytest\b|go test\b/i.test(cmd);

      // Iterate chunks sequentially
      for (let i = 0; i < chunkArray.length; i++) {
          const c = chunkArray[i];
          if (!c) continue;

          if (c.type === 'thinking') {
              if (c.text || c.resultSummary) {
                  entries.push({
                      id: nextId(EntryKind.THINKING),
                      kind: EntryKind.THINKING,
                      status: EntryStatus.DONE,
                      title: c.text || 'Thinking...',
                      body: c.resultSummary || undefined,
                      sourceChunkIds: c.id ? [c.id] : undefined
                  });
              }
          } else if (c.type === 'run') {
              // Look ahead for logs/errors associated with this run
              const logs = [];
              let status = EntryStatus.DONE;
              let errorMsg = null;

              // Consume subsequent logs/errors until next non-log chunk
              let j = i + 1;
              while (j < chunkArray.length) {
                  const next = chunkArray[j];
                  if (next.type === 'log') {
                      if (next.text) logs.push(next.text);
                      j++;
                  } else if (next.type === 'error' && next.runId === c.id) {
                      // Error specifically linked to this run
                      status = EntryStatus.FAILED;
                      errorMsg = next.text;
                      j++;
                  } else {
                      break;
                  }
              }
              // Advance main loop
              i = j - 1;

              const kind = isTestCommand(c.cmd) ? EntryKind.TEST : EntryKind.COMMAND;
              entries.push({
                  id: nextId(kind),
                  kind,
                  status,
                  title: c.cmd || 'Run command',
                  body: errorMsg ? `${errorMsg}\n${logs.join('\n')}` : logs.join('\n'),
                  sourceChunkIds: c.id ? [c.id] : undefined
              });

          } else if (c.type === 'edit') {
              // Aggregate consecutive edits
              const files = [c.file];
              const sourceIds = c.id ? [c.id] : [];

              let j = i + 1;
              while (j < chunkArray.length) {
                  const next = chunkArray[j];
                  if (next.type === 'edit') {
                      files.push(next.file);
                      if (next.id) sourceIds.push(next.id);
                      j++;
                  } else {
                      break;
                  }
              }
              i = j - 1;

              const uniqueFiles = Array.from(new Set(files.filter(Boolean)));
              entries.push({
                  id: nextId(EntryKind.FILE_CHANGE),
                  kind: EntryKind.FILE_CHANGE,
                  status: EntryStatus.DONE,
                  title: uniqueFiles.length === 1
                      ? `Edited ${uniqueFiles[0]}`
                      : `Edited ${uniqueFiles.length} files`,
                  files: uniqueFiles,
                  sourceChunkIds: sourceIds
              });

          } else if (c.type === 'result') {
              if (c.resultSummary || c.text) {
                  entries.push({
                      id: nextId(EntryKind.FINAL),
                      kind: EntryKind.FINAL,
                      status: EntryStatus.DONE,
                      title: 'Result',
                      body: stripFileCount(c.resultSummary || c.text || ''),
                      sourceChunkIds: c.id ? [c.id] : undefined
                  });
              }
          } else if (c.type === 'error') {
              // Standalone error (not consumed by run)
              entries.push({
                  id: nextId(EntryKind.ERROR),
                  kind: EntryKind.ERROR,
                  status: EntryStatus.FAILED,
                  title: 'Error',
                  body: c.message || c.text || '',
                  sourceChunkIds: c.id ? [c.id] : undefined
              });
          }
      }

      // --- TurnSummary Generation (Metadata) ---

      const hasError = entries.some((e) => e.status === EntryStatus.FAILED || e.kind === EntryKind.ERROR);
      const testEntries = entries.filter((e) => e.kind === EntryKind.TEST);

      let testsStatus = null; // Default to null (don't show)
      if (testEntries.length) {
          // If any test command failed, we consider tests failed
          const anyTestFailed = testEntries.some(e => e.status === EntryStatus.FAILED);
          testsStatus = anyTestFailed ? 'failed' : 'passed';
      }

      let status = 'success';
      if (hasError) status = 'failed';

      entries.filter((e) => e.kind === EntryKind.COMMAND || e.kind === EntryKind.TEST).length;
      const editEntries = entries.filter((e) => e.kind === EntryKind.FILE_CHANGE);
      new Set(editEntries.flatMap(e => e.files || [])).size;

      // Title Heuristic - simplified to reduce noise
      let title = null;
      // Only show title if it adds value beyond "Ran command"
      if (hasError) title = 'Execution failed';
      else if (testsStatus === 'failed') title = 'Tests failed';

      const summary = {
          status,
          title,
          meta: {
              durationMs: typeof timing.durationMs === 'number' ? timing.durationMs : undefined,
              testsStatus
          },
          bullets: []
      };

      // Extract bullets from final result or edits
      const finalEntry = entries.findLast(e => e.kind === EntryKind.FINAL);
      if (finalEntry && finalEntry.body) {
          summary.bullets.push(finalEntry.body.slice(0, 200));
      }

      return { summary, timeline: entries };
  }

  class DockRoot {
    constructor(eventBus, stateManager) {
      this.eventBus = eventBus;
      this.stateManager = stateManager;
      this.host = null;
      this.shadow = null;
      this.activeTab = 'chat';
      this.chatMessages = [];
      this.renameState = null;
      this.handle = null;
      this.handleDragState = null;
      this.editorEl = null;
      this.toggleBtn = null;
      this.toggleIcon = null;
      this.launcher = null;
      this.savedRange = null;
      this.captureSelection = this.captureSelection.bind(this);
      this._renderTimer = null;
    }

    updateTheme() {
      try {
        const mode = this.stateManager.get('ui.theme') || 'light';
        const dock = this.shadow && this.shadow.getElementById('dock');
        if (!dock) return;
        if (mode === 'dark') dock.classList.add('dark'); else dock.classList.remove('dark');
      } catch (_) { }
    }

    reflectMode(mode) {
      try {
        const select = this.shadow.getElementById('select-btn');
        const shot = this.shadow.getElementById('shot-btn');
        if (select) select.classList.toggle('active', mode === 'element');
        if (shot) shot.classList.toggle('active', mode === 'screenshot');
      } catch (_) { }
    }

    mount() {
      if (this.host) return;
      this.host = document.createElement('div');
      this.host.id = 'lumi-dock-root';
      this.host.style.cssText = 'position: fixed; top: 0; right: 0; height: 100vh; width: 420px; z-index: 2147483646; display: none;';
      this.shadow = this.host.attachShadow({ mode: 'open' });
      this.shadow.innerHTML = this.renderHTML();
      document.body.appendChild(this.host);

      // Apply initial layout (no squeeze until shown)
      this.applySqueeze(false);

      // Remove compact handle – prefer close + launcher orb UX
      this.createLauncher();
      this.bind();
      this.renderChips(this.stateManager.get('selection.elements') || []);
      this.renderBody();
      this.updateSendState();
    }

    renderHTML() {
      return `
      <style>${DOCK_STYLES}</style>
      <div class="dock" id="dock">
        <div class="header">
          <div class="project" id="project-name">Lumi — Demo Project</div>
          <div class="header-actions">
            <button class="header-btn header-theme" id="theme-toggle" title="Toggle Theme" aria-label="Toggle Theme">
              <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path data-icon="sun" d="M12 4V2m0 20v-2m8-8h2M2 12h2m12.95 6.95l1.41 1.41M4.64 4.64l1.41 1.41m0 12.9l-1.41 1.41m12.9-12.9l1.41-1.41"/>
                <circle data-icon="sun" cx="12" cy="12" r="3.5"></circle>
                <path data-icon="moon" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" style="display:none"/>
              </svg>
            </button>
            <button class="header-btn header-settings" id="gear" title="Open Settings" aria-label="Open Settings">
              <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3.5"></circle>
                <path d="M4.8 9.5l-1.5 2.6a1 1 0 0 0 .4 1.4l1.6.9a8 8 0 0 0 0 1.2l-1.6.9a1 1 0 0 0-.4 1.4l1.5 2.6a1 1 0 0 0 1.3.4l1.6-.9c.4.3.8.6 1.2.8l.1 1.8a1 1 0 0 0 1 .9h3a1 1 0 0 0 1-.9l.1-1.8c.4-.2.8-.5 1.2-.8l1.6.9a1 1 0 0 0 1.3-.4l1.5-2.6a1 1 0 0 0-.4-1.4l-1.6-.9c.1-.4.1-.8 0-1.2l1.6-.9a1 1 0 0 0 .4-1.4l-1.5-2.6a1 1 0 0 0-1.3-.4l-1.6.9c-.4-.3-.8-.6-1.2-.8L13 4.1a1 1 0 0 0-1-.9h-3a1 1 0 0 0-1 .9l-.1 1.8c-.4.2-.8.5-1.2.8l-1.6-.9a1 1 0 0 0-1.3.4z"></path>
              </svg>
            </button>
            <button class="header-btn header-close" id="dock-close" title="Close Dock" aria-label="Close Dock">
              <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 6l12 12M18 6l-12 12"></path>
              </svg>
            </button>
          </div>
        </div>
        <nav class="tabs" id="tabs">
          <button class="tab" data-tab="chat">Chat</button>
          <button class="tab" data-tab="history">History</button>
        </nav>
        <div class="body">
          <div id="chat-pane" class="chat-list view-active"></div>
          <div id="history-pane" class="history-list view-hidden"></div>
        </div>
        <div class="footer">
          <div class="composer-top" id="composer">
            <div class="editor" id="composer-editor" contenteditable="true" data-placeholder="Describe anything you want"></div>
          </div>
          <div class="toolbar">
            <div class="engine" id="engine">
              <span class="dot" id="engine-light"></span>
              <select id="engine-select">
                <option value="codex">Codex</option>
                <option value="claude">Claude Code</option>
              </select>
            </div>
            <div class="actions">
              <button class="icon" id="select-btn" title="Element Select" aria-label="Element Select">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M4 3l8 18 2-7 7-2z"></path>
                </svg>
              </button>
              <button class="icon" id="shot-btn" title="Screenshot" aria-label="Screenshot">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="2"></rect>
                  <path d="M7 13l3-3 5 6 3-4"></path>
                  <circle cx="9" cy="9" r="1.5"></circle>
                </svg>
              </button>
              <button class="icon" id="new-session-btn" title="New Session" aria-label="New Session">＋</button>
              <button class="send" id="send-btn" title="Send" aria-label="Send" disabled>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M22 2L11 13"></path>
                  <path d="M22 2L15 22l-4-9-9-4z"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    }

    bind() {
      this.chatPane = this.shadow.getElementById('chat-pane');
      this.historyPane = this.shadow.getElementById('history-pane');
      this.tabsEl = this.shadow.getElementById('tabs');
      this.editorEl = this.shadow.getElementById('composer-editor');
      this.inputEl = this.editorEl;
      this.sendBtn = this.shadow.getElementById('send-btn');
      this.engineSelect = this.shadow.getElementById('engine-select');
      this.engineShell = this.shadow.getElementById('engine');
      this.projectLabel = this.shadow.getElementById('project-name');
      this.toggleCollapse = null;
      this.toggleExpand = null;

      const settingsBtn = this.shadow.getElementById('gear');
      this.toggleBtn = null;
      settingsBtn.addEventListener('click', () => this.eventBus.emit('settings:open'));
      // collapse/expand removed

      const themeBtn = this.shadow.getElementById('theme-toggle');
      const reflectThemeIcon = () => {
        const mode = this.stateManager.get('ui.theme') || 'light';
        const svg = themeBtn && themeBtn.querySelector('svg');
        if (!svg) return;
        svg.querySelectorAll('[data-icon="sun"]').forEach(n => n.style.display = (mode === 'dark') ? 'none' : 'block');
        const moon = svg.querySelector('[data-icon="moon"]');
        if (moon) moon.style.display = (mode === 'dark') ? 'block' : 'none';
        themeBtn.title = mode === 'dark' ? 'Light Mode' : 'Dark Mode';
      };
      if (themeBtn) themeBtn.addEventListener('click', () => {
        const cur = this.stateManager.get('ui.theme') || 'light';
        const next = cur === 'dark' ? 'light' : 'dark';
        this.stateManager.set('ui.theme', next);
        this.eventBus.emit('theme:set', next);
        reflectThemeIcon();
      });
      reflectThemeIcon();
      try {
        this.stateManager.subscribe('ui.theme', () => {
          reflectThemeIcon();
          this.updateTheme();
        });
        this.stateManager.subscribe('ui.mode', (mode) => this.reflectMode(mode));
      } catch (_) { }

      // Apply theme and mode on mount
      this.updateTheme();
      this.reflectMode(this.stateManager.get('ui.mode'));

      const closeBtn = this.shadow.getElementById('dock-close');
      closeBtn.addEventListener('click', () => {
        this.stateManager.set('ui.dockOpen', false);
        this.setVisible(false);
        try { this.eventBus.emit('bubble:close'); } catch (_) { }
      });

      this.tabsEl.addEventListener('click', (e) => {
        const tab = e.target.closest('.tab');
        if (!tab) return;
        this.setTab(tab.dataset.tab);
      });

      this.shadow.getElementById('select-btn').addEventListener('click', () => this.eventBus.emit('mode:toggle-element'));
      this.shadow.getElementById('shot-btn').addEventListener('click', () => this.eventBus.emit('mode:toggle-screenshot'));
      this.shadow.getElementById('new-session-btn').addEventListener('click', () => this.eventBus.emit('session:create'));

      // Ensure immediate UI switch to Chat when creating/resuming sessions
      try {
        this.eventBus.on('session:create', () => this.setTab('chat'));
        this.eventBus.on('session:resume', () => this.setTab('chat'));
      } catch (_) { }

      this.engineSelect.addEventListener('change', () => {
        const value = this.engineSelect.value === 'claude' ? 'claude' : 'codex';
        this.eventBus.emit('engine:select', value);
      });

      this.editorEl.addEventListener('input', () => {
        this.updatePlaceholder();
        this.eventBus.emit('input:changed');
        this.updateSendState();
        this.captureSelection();
        this.reconcileSelectionWithChips();
      });
      this.editorEl.addEventListener('keydown', (e) => {
        // Remove adjacent chip via Backspace/Delete
        if (e.key === 'Backspace' || e.key === 'Delete') {
          const sel = this.getSelection();
          if (sel && sel.rangeCount && this.editorEl.contains(sel.anchorNode)) {
            const range = sel.getRangeAt(0);
            const removeChip = (chip) => {
              if (!chip || !chip.classList || !chip.classList.contains('chip')) return false;
              const idx = Number(chip.dataset.index || '-1');
              if (idx >= 0) {
                e.preventDefault();
                e.stopPropagation();
                this.removeElementAt(idx);
                this.captureSelection();
                this.updateSendState();
                return true;
              }
              return false;
            };
            const isEmptyText = (n) => n && n.nodeType === Node.TEXT_NODE && /^\s*$/.test(n.textContent || '');
            let node = range.startContainer;
            // If selection spans multiple nodes, prefer default behavior
            if (!range.collapsed) return;
            if (e.key === 'Backspace') {
              // When at start of a text node, look left to previous sibling
              if (node.nodeType === Node.TEXT_NODE && range.startOffset === 0) {
                let prev = node.previousSibling;
                while (isEmptyText(prev)) prev = prev && prev.previousSibling;
                if (removeChip(prev)) return;
              }
              // If in element node with an offset, check prior child
              if (node.nodeType === Node.ELEMENT_NODE) {
                const idx = Math.max(0, range.startOffset - 1);
                let prev = node.childNodes[idx] || node.childNodes[idx - 1] || node.previousSibling;
                while (isEmptyText(prev)) prev = prev && prev.previousSibling;
                if (removeChip(prev)) return;
              }
            } else if (e.key === 'Delete') {
              if (node.nodeType === Node.TEXT_NODE && range.startOffset >= (node.textContent || '').length) {
                let next = node.nextSibling;
                while (isEmptyText(next)) next = next && next.nextSibling;
                if (removeChip(next)) return;
              }
              if (node.nodeType === Node.ELEMENT_NODE) {
                let next = node.childNodes[range.startOffset] || node.nextSibling;
                while (isEmptyText(next)) next = next && next.nextSibling;
                if (removeChip(next)) return;
              }
            }
          }
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          this.eventBus.emit('submit:requested');
        }
      });
      this.editorEl.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text');
        document.execCommand('insertText', false, text);
        this.captureSelection();
      });
      this.editorEl.addEventListener('mouseup', this.captureSelection);
      this.editorEl.addEventListener('keyup', this.captureSelection);
      this.editorEl.addEventListener('focus', this.captureSelection);
      this.editorEl.addEventListener('blur', () => {
        this.sanitizeEditor();
        this.captureSelection();
        this.reconcileSelectionWithChips();
      });

      this.sendBtn.addEventListener('click', () => this.eventBus.emit('submit:requested'));

      this.historyPane.addEventListener('click', (event) => this.handleHistoryClick(event));

      // State subscriptions
      this.stateManager.subscribe('engine.current', (engine) => this.updateEngine(engine));
      this.stateManager.subscribe('engine.available', () => this.updateEngineAvailability());
      this.stateManager.subscribe('selection.elements', (elements) => this.renderChips(elements || []));
      this.stateManager.subscribe('selection.screenshots', () => this.renderChips(this.stateManager.get('selection.elements') || []));
      this.stateManager.subscribe('ui.dockTab', (tab) => this.setTab(tab, true));
      this.stateManager.subscribe('ui.dockOpen', (open) => this.setVisible(open !== false));
      // Keep state wired, but collapse/expand is disabled; always enforce 'normal'
      this.stateManager.subscribe('ui.dockState', () => this.updateDockState('normal'));
      this.stateManager.subscribe('processing.active', () => this.updateSendState());
      this.stateManager.subscribe('wysiwyg.hasDiffs', () => this.updateSendState());
      this.stateManager.subscribe('projects.allowed', () => this.updateSendState());
      this.stateManager.subscribe('projects.current', (project) => this.updateProjectName(project));

      this.updateEngine(this.stateManager.get('engine.current'));
      this.updateEngineAvailability();
      this.activeTab = this.stateManager.get('ui.dockTab') || 'chat';
      this.setTab(this.activeTab, true);
      this.setVisible(this.stateManager.get('ui.dockOpen') !== false);
      this.updateDockState(this.stateManager.get('ui.dockState') || 'normal');
      this.updateProjectName(this.stateManager.get('projects.current'));
      this.updatePlaceholder();
      this.updateTheme();

      // Live updates for session changes (ensure History/UI refresh immediately)
      const scheduleRender = () => {
        if (this._renderTimer) return;
        this._renderTimer = setTimeout(() => {
          this._renderTimer = null;
          const tab = this.stateManager.get('ui.dockTab') || this.activeTab;
          if (tab === 'history') this.renderHistory(); else this.renderChat();
        }, 100);
      };
      this.stateManager.subscribe('sessions.list', scheduleRender);
      // Switch session should re-render immediately to avoid stale content flash
      this.stateManager.subscribe('sessions.currentId', () => {
        const tab = this.stateManager.get('ui.dockTab') || this.activeTab;
        if (tab === 'history') this.renderHistory(); else this.renderChat();
      });

      // Prepare screenshot preview containers
      this.ensureShotPreviewContainers();
    }

    applySqueeze(isOpen) {
      // Overlay mode: do not squeeze page (user feedback: squeeze was too strong)
      try {
        const html = document.documentElement;
        const body = document.body;
        html.style.paddingRight = '0px';
        body.style.paddingRight = '0px';
      } catch (_) { }
    }

    updateDockState(state) {
      const dock = this.shadow.getElementById('dock');
      if (!dock) return;
      dock.classList.remove('compact');
      const dockWidth = '420px';

      if (this.host) {
        this.host.style.pointerEvents = 'auto';
        this.host.style.transition = 'width 0.2s cubic-bezier(0.22, 1, 0.36, 1)';
        this.host.style.width = dockWidth;
      }

      // Update squeeze based on compact state
      const isOpen = this.stateManager.get('ui.dockOpen') !== false;
      if (isOpen) this.applySqueeze(false);

      // Hide Dock surface entirely in compact; use handle instead
      dock.style.display = 'flex';

      // Hide collapse/expand affordances completely
      if (this.toggleBtn) this.toggleBtn.style.display = 'none';
      if (this.toggleCollapse) this.toggleCollapse.style.display = 'none';
      if (this.toggleExpand) this.toggleExpand.style.display = 'none';
    }

    setVisible(isOpen) {
      if (!this.host) return;
      this.host.style.display = isOpen ? 'block' : 'none';

      // Overlay mode, no squeeze
      this.applySqueeze(false);

      if (this.handle) {
        const state = this.stateManager.get('ui.dockState');
        this.handle.style.display = isOpen && state === 'compact' ? 'flex' : 'none';
      }
      if (this.launcher) {
        this.launcher.style.display = isOpen ? 'none' : 'flex';
      }
    }

    setTab(name, fromState = false) {
      if (!name) return;
      this.activeTab = name;
      Array.from(this.tabsEl.querySelectorAll('.tab')).forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === name);
      });
      if (!fromState) {
        this.stateManager.set('ui.dockTab', name);
        // Defer render to allow any related state (e.g., sessions.currentId) to commit first
        setTimeout(() => this.renderBody(), 0);
      } else {
        this.renderBody();
      }
    }

    renderBody() {
      const tab = this.stateManager.get('ui.dockTab') || this.activeTab;
      if (tab === 'history') {
        this.chatPane.classList.add('view-hidden');
        this.chatPane.classList.remove('view-active');
        this.historyPane.classList.remove('view-hidden');
        this.historyPane.classList.add('view-active');
        this.renderHistory();
      } else {
        this.historyPane.classList.add('view-hidden');
        this.historyPane.classList.remove('view-active');
        this.chatPane.classList.remove('view-hidden');
        this.chatPane.classList.add('view-active');
        this.renderChat();
      }
    }

    renderChat() {
      if (!this.chatPane) return;
      const pane = this.chatPane;
      pane.innerHTML = '';
      const sessions = this.stateManager.get('sessions.list') || [];
      const currentId = this.stateManager.get('sessions.currentId');
      const session = sessions.find(s => s.id === currentId) || sessions[0];
      if (!session || session.transcript.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'chat-empty';
        empty.textContent = 'Start by selecting elements or typing a message.';
        pane.appendChild(empty);
        return;
      }
      session.transcript.forEach(msg => {
        pane.appendChild(this.renderChatMessage(msg));
      });
    }

    renderChatMessage(msg) {
      if (msg.role === 'assistant') {
        return this.renderAssistantMessage(msg);
      }
      // User message: no avatar, simple style
      const item = document.createElement('div');
      item.className = 'msg user';
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.textContent = msg.text;
      item.appendChild(bubble);
      return item;
    }

    renderAssistantMessage(msg) {
      const doc = this.shadow?.ownerDocument || document;
      const item = doc.createElement('div');
      item.className = 'msg assistant';

      const state = this.getAssistantState(msg);
      const header = doc.createElement('div');
      header.className = 'feed-header';
      const label = doc.createElement('span');
      let labelText = 'Finished';
      if (state === 'queued' || state === 'streaming') {
        labelText = 'Working';
        label.className = 'working-label';
        label.textContent = labelText;
        const dots = doc.createElement('span');
        dots.className = 'working-dots';
        dots.textContent = '...';
        label.appendChild(dots);
      } else if (state === 'done-error') {
        labelText = 'Finished with issues';
        label.textContent = labelText;
      } else {
        label.textContent = labelText;
      }
      header.appendChild(label);
      let toggleBtn = null;

      const timeline = this.renderAssistantTimeline(msg, state);
      if (timeline && (state === 'done' || state === 'done-error')) {
        toggleBtn = doc.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'timeline-toggle';
        toggleBtn.textContent = '▸';
        header.appendChild(toggleBtn);
      }
      item.appendChild(header);

      if (timeline) {
        item.appendChild(timeline);
        if (toggleBtn) {
          const body = timeline.querySelector('.timeline-body');
          const setOpen = (open) => {
            timeline.classList.toggle('timeline-open', open);
            if (body) body.style.display = open ? 'block' : 'none';
            toggleBtn.textContent = open ? '▾' : '▸';
          };
          setOpen(state === 'streaming');
          toggleBtn.addEventListener('click', () => setOpen(!timeline.classList.contains('timeline-open')));
        }
      }

      const summary = this.renderAssistantSummary(msg);
      if (summary) item.appendChild(summary);

      return item;
    }

    renderAssistantSummary(msg) {
      const doc = this.shadow?.ownerDocument || document;
      const result = msg.result || {};
      const turnSummary = msg.turnSummary || null;
      const resultChunks = Array.isArray(msg.chunks) ? msg.chunks : [];

      const stripFileCount = (text = '') =>
        String(text).replace(/Updated\s+\d+\s+file(s)?\.?/gi, '').trim();

      const title = turnSummary?.title
        || stripFileCount(result.title)
        || stripFileCount(resultChunks.find((c) => c?.type === 'result' && c.resultSummary)?.resultSummary)
        || '';
      const description = (() => {
        if (turnSummary && Array.isArray(turnSummary.bullets) && turnSummary.bullets.length) {
          return stripFileCount(turnSummary.bullets[0]);
        }
        let text =
          stripFileCount(result.description) ||
          stripFileCount(resultChunks.find((c) => c?.type === 'result' && c.text)?.text) ||
          stripFileCount(msg.text) ||
          '';
        return text || '';
      })();

      const container = doc.createElement('div');
      container.className = 'assistant-summary';

      // Meta line (duration / tests only)
      if (turnSummary?.meta) {
        const metaLine = doc.createElement('div');
        metaLine.className = 'summary-meta';
        const parts = [];
        if (typeof turnSummary.meta.durationMs === 'number') parts.push(this.formatDuration(turnSummary.meta.durationMs));
        if (turnSummary.meta.testsStatus) parts.push(`tests ${turnSummary.meta.testsStatus}`);

        const text = parts.filter(Boolean).join(' · ');
        if (text) {
          metaLine.textContent = text;
          container.appendChild(metaLine);
        }
      }

      if (msg.streaming && !msg.done) {
        container.appendChild(this.renderResultSkeleton(doc));
        return container;
      }

      if (title) {
        const titleEl = doc.createElement('div');
        titleEl.className = 'summary-title';
        titleEl.textContent = title;
        container.appendChild(titleEl);
      }
      if (description) {
        const desc = doc.createElement('div');
        desc.className = 'summary-body';
        // Render markdown when present
        if (/```|^#\s/m.test(description)) {
          desc.appendChild(renderMarkdown(description, doc));
        } else {
          desc.textContent = description;
        }
        container.appendChild(desc);
      }
      return container;
    }

    renderAssistantTimeline(msg, state) {
      let timelineEntries = Array.isArray(msg.timelineEntries) ? msg.timelineEntries : [];
      const chunks = Array.isArray(msg.chunks) ? msg.chunks : [];

      // If no server-provided entries yet (streaming), build them client-side
      if (timelineEntries.length === 0 && chunks.length > 0) {
        const built = buildTimelineFromChunks(chunks);
        if (built && built.timeline) {
          timelineEntries = built.timeline;
        }
      }

      const hasTimeline = timelineEntries.length > 0 || chunks.length > 0;
      if (!hasTimeline && state === 'done') return null;
      const doc = this.shadow?.ownerDocument || document;
      const wrapper = doc.createElement('div');
      wrapper.className = 'assistant-timeline';
      if (state === 'done' || state === 'done-error') {
        wrapper.classList.add('collapsed');
      }
      const body = doc.createElement('div');
      body.className = 'timeline-body';
      if (state === 'streaming') {
        body.style.display = 'block';
        wrapper.classList.add('timeline-open');
      } else {
        body.style.display = 'none';
      }
      if (timelineEntries.length) {
        body.appendChild(this.renderTimelineEntries(timelineEntries));
      } else if (chunks.length) {
        // fallback to old chunks rendering
        body.appendChild(this.renderTimeline(chunks));
      } else {
        const placeholder = doc.createElement('div');
        placeholder.className = 'timeline-placeholder';
        placeholder.textContent = 'Execution events will appear here once processing begins.';
        body.appendChild(placeholder);
      }
      // Raw logs removed per user request
      wrapper.appendChild(body);
      return wrapper;
    }

    getAssistantState(msg) {
      const hasChunks = Array.isArray(msg.chunks) && msg.chunks.length > 0;
      if (msg.streaming && !hasChunks) return 'queued';
      if (msg.streaming && hasChunks) return 'streaming';
      if (msg.applied === false) return 'done-error';
      return 'done';
    }

    createStatusIcon(doc, state, msg) {
      const span = doc.createElement('span');
      span.className = 'icon';
      // Keep status text only; icons intentionally minimal
      if (state === 'done-error') {
        span.textContent = '!';
      }
      return span;
    }

    renderResultSkeleton(doc) {
      const skeleton = doc.createElement('div');
      skeleton.className = 'result-skeleton';
      for (let i = 0; i < 2; i++) {
        const line = doc.createElement('div');
        line.className = 'result-skeleton-line';
        skeleton.appendChild(line);
      }
      return skeleton;
    }

    createSpinner(doc) {
      const spinner = doc.createElement('span');
      spinner.className = 'spinner';
      spinner.setAttribute('aria-hidden', 'true');
      return spinner;
    }

    formatDuration(ms) {
      if (!ms || Number.isNaN(ms)) return '';
      if (ms < 1000) return `${ms}ms`;
      const seconds = ms / 1000;
      if (seconds < 60) return `${seconds.toFixed(1)}s`;
      const minutes = Math.floor(seconds / 60);
      const remain = seconds % 60;
      return `${minutes}m ${remain.toFixed(0)}s`;
    }

    renderTimeline(chunks = []) {
      const doc = this.shadow?.ownerDocument || document;
      const list = doc.createElement('ul');
      list.className = 'timeline-feed';
      let logShown = 0;
      chunks.forEach((c) => {
        if (!c || typeof c !== 'object') return;
        if (c.type === 'edit' && (!c.file || c.file === 'unknown')) return;
        const row = doc.createElement('li');
        row.className = 'timeline-item';
        row.style.whiteSpace = 'pre-wrap';
        row.style.lineHeight = '1.5';
        let text = '';
        switch (c.type) {
          case 'thinking':
            text = `Thinking: ${c.text || ''}`;
            break;
          case 'run':
            text = `Run: ${c.cmd || ''}`;
            break;
          case 'edit': {
            const meta = [];
            if (typeof c.added === 'number') meta.push(`+${c.added}`);
            if (typeof c.removed === 'number') meta.push(`-${c.removed}`);
            text = `Edited ${c.file || 'file'} ${meta.join(' ')}`.trim();
            break;
          }
          case 'log':
            if (logShown >= 12) return;
            logShown++;
            text = c.text || '';
            break;
          case 'result':
            text = c.resultSummary || c.text || '';
            break;
          case 'error':
            text = `Error: ${c.message || c.text || ''}`;
            break;
          default:
            text = c.text || '';
        }
        row.textContent = escapeHtml(String(text));
        if (c.type === 'edit' && c.diff) {
          row.appendChild(this.renderDiffDetails(doc, c.diff));
        }
        list.appendChild(row);
      });
      return list;
    }

    renderRawLogs(chunks = []) {
      const doc = this.shadow?.ownerDocument || document;
      const details = doc.createElement('details');
      details.className = 'raw-logs';
      const summary = doc.createElement('summary');
      summary.textContent = 'View raw logs';
      details.appendChild(summary);
      const pre = doc.createElement('pre');
      pre.className = 'raw-logs-body';
      const lines = [];
      chunks.forEach((c) => {
        if (!c || typeof c !== 'object') return;
        if (c.type === 'log' && c.text) lines.push(c.text);
        else if (c.type === 'run' && c.cmd) lines.push(`[run] ${c.cmd}`);
        else if (c.type === 'error' && (c.text || c.message)) lines.push(`[error] ${c.text || c.message}`);
      });
      pre.textContent = lines.join('\n');
      details.appendChild(pre);
      return details;
    }

    renderTimelineEntries(entries = []) {
      const doc = this.shadow?.ownerDocument || document;
      const container = doc.createElement('div');
      container.className = 'timeline-entries';

      const list = doc.createElement('ul');
      list.className = 'timeline-feed';

      entries.forEach((e) => {
        const li = doc.createElement('li');
        li.className = 'timeline-item';
        li.style.whiteSpace = 'pre-wrap';
        li.style.lineHeight = '1.5';

        // No icon - minimalist design

        const text = doc.createElement('span');
        text.textContent = e.title || e.summary || '';
        li.appendChild(text);

        if (e.body && e.body !== e.title) {
          const details = doc.createElement('details');
          details.className = 'timeline-item-details';
          const summary = doc.createElement('summary');
          summary.textContent = 'Show output';
          summary.style.cursor = 'pointer';
          summary.style.opacity = '0.7';
          summary.style.fontSize = '0.9em';
          summary.style.marginTop = '4px';
          details.appendChild(summary);

          const detailBody = doc.createElement('div');
          detailBody.className = 'timeline-item-body';
          detailBody.textContent = e.body;
          detailBody.style.marginTop = '4px';
          detailBody.style.padding = '8px';
          detailBody.style.background = 'var(--bg-subtle, rgba(0,0,0,0.03))';
          detailBody.style.borderRadius = '4px';
          detailBody.style.fontFamily = 'monospace';
          detailBody.style.fontSize = '0.9em';
          detailBody.style.overflowX = 'auto';
          details.appendChild(detailBody);

          li.appendChild(details);
        }

        list.appendChild(li);
      });

      container.appendChild(list);
      return container;
    }



    renderEntryIcon(doc, kind) {
      const span = doc.createElement('span');
      span.className = 'timeline-icon';
      switch (kind) {
        case 'thinking': span.textContent = '💭'; break;
        case 'command': span.textContent = '›'; break;
        case 'test': span.textContent = '🧪'; break;
        case 'file-change': span.textContent = '✎'; break;
        case 'final-message': span.textContent = '✓'; break;
        case 'error': span.textContent = '!'; break;
        default: return null;
      }
      return span;
    }

    renderDiffDetails(doc, diffText = '') {
      const details = doc.createElement('details');
      details.className = 'diff-details';
      const summary = doc.createElement('summary');
      summary.textContent = 'Show diff';
      details.appendChild(summary);
      const body = doc.createElement('div');
      body.className = 'diff-body';
      diffText.split(/\r?\n/).forEach((line) => {
        if (line === undefined || line === null) return;
        const row = doc.createElement('div');
        row.className = 'diff-line';
        if (/^\+(?!\+\+)/.test(line)) row.classList.add('add');
        else if (/^-(?!---)/.test(line)) row.classList.add('del');
        else row.classList.add('ctx');
        row.textContent = line || '\u00A0';
        body.appendChild(row);
      });
      details.appendChild(body);
      return details;
    }

    renderHistory() {
      const pane = this.historyPane;
      if (!pane) return;
      pane.innerHTML = '';
      this.renameState = null;

      const newBtn = document.createElement('div');
      newBtn.className = 'history-new';
      newBtn.textContent = '＋ New Session';
      newBtn.addEventListener('click', () => this.eventBus.emit('session:create'));
      pane.appendChild(newBtn);

      const sessions = this.stateManager.get('sessions.list') || [];
      const currentId = this.stateManager.get('sessions.currentId');
      if (!sessions.length) {
        const empty = document.createElement('div');
        empty.className = 'placeholder';
        empty.textContent = 'History remembers your conversations.';
        pane.appendChild(empty);
        return;
      }

      sessions.forEach(session => {
        const row = document.createElement('div');
        row.className = 'history-row' + (session.id === currentId ? ' active' : '');
        row.dataset.sessionId = session.id;

        row.innerHTML = `
        <div class="history-main">
          <div class="history-title">${session.title ? escapeHtml(session.title) : 'Untitled session'}</div>
          <div class="history-meta">${this.timeAgo(session.updatedAt || session.createdAt)} • ${session.msgCount || 0}<span class="status-dot ${session.lastAppliedOk ? 'ok' : ''}"></span></div>
        </div>
        <div class="history-actions">
          <button data-action="rename">Rename</button>
          <button data-action="delete">Delete</button>
        </div>
      `;
        pane.appendChild(row);
      });
    }

    handleHistoryClick(event) {
      const actionBtn = event.target.closest('button[data-action]');
      const row = event.target.closest('.history-row');
      if (!row) return;
      const sessionId = row.dataset.sessionId;
      if (!actionBtn) {
        this.eventBus.emit('session:resume', sessionId);
        return;
      }
      const action = actionBtn.dataset.action;
      if (action === 'rename') {
        if (row.classList.contains('renaming')) return;
        this.startRename(row, sessionId);
      } else if (action === 'delete') {
        if (window.confirm('Delete this session?')) {
          this.eventBus.emit('session:delete', sessionId);
        }
      }
    }

    startRename(row, sessionId) {
      if (!row) return;
      if (this.renameState && this.renameState.cancel) {
        this.renameState.cancel();
      }
      const main = row.querySelector('.history-main');
      const titleEl = row.querySelector('.history-title');
      const metaEl = row.querySelector('.history-meta');
      if (!main || !titleEl) return;

      const current = (titleEl.textContent || '').trim();
      const input = document.createElement('input');
      input.type = 'text';
      input.value = current;
      input.placeholder = 'Session title';
      input.className = 'history-rename';
      input.setAttribute('aria-label', 'Rename session');

      main.insertBefore(input, metaEl || null);
      titleEl.style.display = 'none';
      row.classList.add('renaming');

      let finished = false;

      const cleanup = (text = null) => {
        input.removeEventListener('keydown', onKeyDown);
        input.removeEventListener('blur', onBlur);
        row.classList.remove('renaming');
        if (titleEl) {
          titleEl.style.display = '';
          if (text !== null) {
            titleEl.textContent = text;
          }
        }
        if (input.parentNode) {
          input.parentNode.removeChild(input);
        }
        if (this.renameState && this.renameState.input === input) {
          this.renameState = null;
        }
      };

      const commit = () => {
        if (finished) return;
        finished = true;
        const next = input.value.trim();
        cleanup(next || current);
        if (next && next !== current) {
          this.eventBus.emit('session:rename', { id: sessionId, title: next });
        }
      };

      const cancel = () => {
        if (finished) return;
        finished = true;
        cleanup(current);
      };

      const onKeyDown = (evt) => {
        if (evt.key === 'Enter') {
          evt.preventDefault();
          commit();
        } else if (evt.key === 'Escape') {
          evt.preventDefault();
          cancel();
        }
      };

      const onBlur = () => {
        commit();
      };

      input.addEventListener('keydown', onKeyDown);
      input.addEventListener('blur', onBlur);
      this.renameState = { row, input, titleEl, cancel };
      input.focus();
      input.select();
    }

    updateEngine(engine) {
      if (this.engineSelect) {
        this.engineSelect.value = engine === 'claude' ? 'claude' : 'codex';
      }
      this.updateEngineAvailability();
    }

    updateEngineAvailability() {
      if (!this.engineShell) return;
      const available = this.stateManager.get('engine.available') || {};
      const current = this.stateManager.get('engine.current');
      const dot = this.shadow.getElementById('engine-light');
      const isAvailable = !!available[current];
      this.engineShell.classList.toggle('available', isAvailable);
      if (dot) {
        dot.style.background = '';
      }
    }

    updateProjectName(project) {
      if (!this.projectLabel) return;
      if (project && typeof project === 'object') {
        const name = project.name || project.id || 'Linked Project';
        this.projectLabel.textContent = `Lumi — ${name}`;
      } else {
        this.projectLabel.textContent = 'Lumi — Unmapped Page';
      }
    }

    updateSendState() {
      if (!this.sendBtn) return;
      const elements = this.stateManager.get('selection.elements') || [];
      const screenshots = this.stateManager.get('selection.screenshots') || [];
      const hasContext = elements.length > 0 || screenshots.length > 0;
      const hasIntent = this.getPlainText().trim().length > 0;
      const hasEdits = this.stateManager.get('wysiwyg.hasDiffs')
        || (Array.isArray(elements) && elements.some(e => e && e.edited));
      const isProcessing = this.stateManager.get('processing.active');
      const projectAllowed = this.stateManager.get('projects.allowed');
      this.sendBtn.disabled = !hasContext || !(hasIntent || hasEdits) || isProcessing || projectAllowed === false;
      this.sendBtn.textContent = isProcessing ? 'Sending...' : 'Send';
    }

    getPlainText() {
      if (!this.editorEl) return '';
      let text = '';
      this.editorEl.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          text += node.textContent || '';
        } else if (node.classList?.contains('chip')) {
          // Element chip
          if (node.dataset.index !== undefined) {
            const idx = Number(node.dataset.index);
            text += `[@element${idx + 1}]`;
          }
          // Screenshot chip
          else if (node.dataset.shotId !== undefined) {
            const shots = this.stateManager.get('selection.screenshots') || [];
            const shotIdx = shots.findIndex(s => String(s.id) === node.dataset.shotId);
            if (shotIdx >= 0) {
              text += `[@screenshot${shotIdx + 1}]`;
            }
          }
        }
      });
      return text;
    }

    getInputValue() {
      return this.getPlainText().trim();
    }

    clearInput() {
      if (!this.editorEl) return;
      const nodes = Array.from(this.editorEl.childNodes);
      nodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          node.remove();
        }
      });
      this.updatePlaceholder();
      this.updateSendState();
    }

    focusComposer() {
      if (!this.editorEl) return;
      this.editorEl.focus();
      try {
        if (!this.restoreSelection()) {
          const selection = this.getSelection();
          if (!selection) return;
          const range = document.createRange();
          range.selectNodeContents(this.editorEl);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
          this.savedRange = range.cloneRange();
        }
      } catch (_) {
        // Ignore focus errors
      }
    }

    getShadowRoot() {
      return this.shadow;
    }

    // (compact handle removed)

    createLauncher() {
      if (this.launcher) return;
      const button = document.createElement('button');
      button.id = 'lumi-dock-launcher';
      button.type = 'button';
      button.setAttribute('aria-label', 'Show Lumi Dock');
      button.style.cssText = `
      position: fixed;
      bottom: 28px;
      right: 24px;
      width: 52px;
      height: 52px;
      border-radius: 26px;
      border: 1px solid var(--dock-stroke);
      background: var(--dock-bg);
      box-shadow: var(--shadow);
      color: var(--dock-fg);
      font-size: 18px;
      display: none;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 2147483646;
      user-select: none;
      transition: all 0.2s ease;
    `;
      button.textContent = 'L';
      button.style.fontWeight = '700';
      button.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      button.addEventListener('mouseenter', () => {
        button.style.transform = 'scale(1.05)';
        button.style.boxShadow = 'var(--shadow-lg)';
      });
      button.addEventListener('mouseleave', () => {
        button.style.transform = 'scale(1)';
        button.style.boxShadow = 'var(--shadow)';
      });
      button.addEventListener('click', () => {
        this.stateManager.set('ui.dockOpen', true);
        this.stateManager.set('ui.dockState', 'normal');
      });
      document.body.appendChild(button);
      this.launcher = button;
    }

    // (compact handle removed)

    // (compact handle removed)

    renderChips(elements) {
      this.syncChips(elements);
      this.renderScreenshotChips();
      this.updatePlaceholder();
      this.updateSendState();
    }

    insertChipForElement(item, index) {
      if (!this.editorEl) return;
      const selection = this.ensureCaretSelection();
      const chip = this.createChipElement(item, index);
      const frag = document.createDocumentFragment();
      frag.appendChild(chip);
      frag.appendChild(document.createTextNode('\u00A0'));

      if (selection && selection.rangeCount && this.editorEl.contains(selection.anchorNode)) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(frag);
        const space = chip.nextSibling;
        if (space) {
          const caret = document.createRange();
          caret.setStartAfter(space);
          caret.collapse(true);
          selection.removeAllRanges();
          selection.addRange(caret);
          this.savedRange = caret.cloneRange();
        }
      } else {
        this.editorEl.appendChild(frag);
        this.captureSelection();
      }
      this.updatePlaceholder();
    }

    moveChipToCaret(index) {
      if (!this.editorEl) return false;
      const chip = this.editorEl.querySelector(`.chip[data-index="${index}"]`);
      if (!chip) return false;
      const selection = this.ensureCaretSelection();
      const trailing = chip.nextSibling;
      chip.remove();
      if (trailing && trailing.nodeType === Node.TEXT_NODE && /^\u00A0?$/.test(trailing.textContent || '')) {
        trailing.remove();
      }

      const frag = document.createDocumentFragment();
      frag.appendChild(chip);
      frag.appendChild(document.createTextNode('\u00A0'));

      if (selection && selection.rangeCount && this.editorEl.contains(selection.anchorNode)) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(frag);
        const space = chip.nextSibling;
        if (space) {
          const caret = document.createRange();
          caret.setStartAfter(space);
          caret.collapse(true);
          selection.removeAllRanges();
          selection.addRange(caret);
          this.savedRange = caret.cloneRange();
        }
      } else {
        this.editorEl.appendChild(frag);
        this.captureSelection();
      }
      this.updatePlaceholder();
      return true;
    }

    ensureCaretSelection() {
      if (!this.editorEl) return null;
      if (!this.restoreSelection()) {
        this.focusComposer();
      }
      const selection = this.getSelection();
      if (!selection || !selection.rangeCount || !this.editorEl.contains(selection.anchorNode)) {
        try {
          const range = document.createRange();
          range.selectNodeContents(this.editorEl);
          range.collapse(false);
          const sel = this.getSelection();
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
            this.savedRange = range.cloneRange();
            return sel;
          }
        } catch (_) {
          return selection;
        }
      }
      return selection;
    }

    getSelection() {
      if (this.shadow && typeof this.shadow.getSelection === 'function') {
        const sel = this.shadow.getSelection();
        if (sel) return sel;
      }
      return window.getSelection();
    }

    captureSelection() {
      if (!this.editorEl) return;
      const sel = this.getSelection();
      if (!sel || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      if (!this.editorEl.contains(range.startContainer) || !this.editorEl.contains(range.endContainer)) return;
      this.savedRange = range.cloneRange();
    }

    restoreSelection() {
      if (!this.editorEl || !this.savedRange) return false;
      try {
        const sel = this.getSelection();
        if (!sel) return false;
        sel.removeAllRanges();
        sel.addRange(this.savedRange);
        return true;
      } catch (_) {
        this.savedRange = null;
        return false;
      }
    }

    removeChipForElement(index) {
      if (!this.editorEl) return;
      const chip = this.editorEl.querySelector(`.chip[data-index="${index}"]`);
      if (!chip) return;
      const space = chip.nextSibling;
      chip.remove();
      if (space && space.nodeType === Node.TEXT_NODE && /^\u00A0?$/.test(space.textContent || '')) {
        space.remove();
      }
      this.updateChipIndices(index);
      this.updatePlaceholder();
      this.updateSendState();
    }

    clearChips() {
      if (!this.editorEl) return;
      this.getChipNodes().forEach((chip) => {
        const next = chip.nextSibling;
        chip.remove();
        if (next && next.nodeType === Node.TEXT_NODE && /^\u00A0?$/.test(next.textContent || '')) {
          next.remove();
        }
      });
      this.updatePlaceholder();
      this.updateSendState();
    }

    syncChips(elements) {
      if (!this.editorEl) return;
      const chips = this.getChipNodes();
      // 1) Remove chips whose index is out of range or duplicates for same index
      const seen = new Set();
      chips.forEach((chip) => {
        const idx = Number(chip.dataset.index || '-1');
        const invalid = !(idx >= 0 && idx < elements.length);
        const duplicate = seen.has(idx);
        if (invalid || duplicate) {
          const next = chip.nextSibling;
          chip.remove();
          if (next && next.nodeType === Node.TEXT_NODE && /^\u00A0?$/.test(next.textContent || '')) next.remove();
        } else {
          seen.add(idx);
        }
      });
      // 2) Add chips for any missing indices
      for (let i = 0; i < elements.length; i += 1) {
        if (!this.editorEl.querySelector(`.chip[data-index="${i}"]`)) {
          this.appendChip(elements[i], i);
        }
      }
      // 3) Decorate all according to current state
      const updated = this.getChipNodes();
      updated.forEach((chip) => {
        const idx = Number(chip.dataset.index || '-1');
        const item = elements[idx];
        if (item) this.decorateChip(chip, item, idx);
      });
    }

    createChipElement(item, index) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.dataset.index = String(index);
      chip.contentEditable = 'false';

      const labelBtn = document.createElement('button');
      labelBtn.type = 'button';
      labelBtn.className = 'chip-label';
      labelBtn.addEventListener('click', () => {
        const current = Number(chip.dataset.index || index);
        this.eventBus.emit('context-tag:element-clicked', current);
        this.eventBus.emit('edit:open', { index: current });
      });

      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'x';
      close.textContent = '×';
      close.title = 'Remove';
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        const current = Number(chip.dataset.index || index);
        this.removeElementAt(current);
      });

      chip.appendChild(labelBtn);
      chip.appendChild(close);
      this.decorateChip(chip, item, index);
      return chip;
    }

    createScreenshotChip(shot) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.dataset.shotId = String(shot?.id || Date.now());
      chip.contentEditable = 'false';

      const labelBtn = document.createElement('button');
      labelBtn.type = 'button';
      labelBtn.className = 'chip-label';
      // Provide distinct label like "@shot 1 (WxH)"
      try {
        const shots = this.stateManager.get('selection.screenshots') || [];
        const idx = Math.max(0, shots.findIndex(s => s && s.id === shot.id));
        const n = idx + 1;
        const w = Math.round(shot?.bbox?.width || 0);
        const h = Math.round(shot?.bbox?.height || 0);
        labelBtn.textContent = (w && h) ? `@shot ${n} (${w}×${h})` : `@shot ${n}`;
      } catch (_) {
        labelBtn.textContent = '@shot';
      }
      labelBtn.title = 'Screenshot preview';

      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'x';
      close.textContent = '×';
      close.title = 'Remove Screenshot';
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        const idRaw = chip.dataset.shotId;
        const id = isNaN(Number(idRaw)) ? idRaw : Number(idRaw);
        try { this.eventBus.emit('screenshot:remove', id); } catch (_) { }
      });

      chip.appendChild(labelBtn);
      chip.appendChild(close);
      // Hover preview and click-to-open
      chip.addEventListener('mouseenter', () => this.showShotPreview(shot, chip));
      chip.addEventListener('mouseleave', () => this.hideShotPreview());
      labelBtn.addEventListener('click', (e) => { e.stopPropagation(); this.openShotLightbox(shot); });
      return chip;
    }

    appendChip(item, index) {
      if (!this.editorEl) return;
      const chip = this.createChipElement(item, index);
      this.editorEl.appendChild(chip);
      this.editorEl.appendChild(document.createTextNode('\u00A0'));
    }

    renderScreenshotChips() {
      if (!this.editorEl) return;
      // Remove existing screenshot chips
      this.editorEl.querySelectorAll('.chip[data-shot-id]').forEach(n => n.remove());
      const shots = this.stateManager.get('selection.screenshots') || [];
      shots.forEach((shot) => {
        const chip = this.createScreenshotChip(shot);
        this.editorEl.appendChild(chip);
        this.editorEl.appendChild(document.createTextNode('\u00A0'));
      });
    }

    getChipNodes() {
      if (!this.editorEl) return [];
      return Array.from(this.editorEl.querySelectorAll('.chip'));
    }

    // If user manually deletes chips in the editor (e.g., Backspace), reconcile selection accordingly
    reconcileSelectionWithChips() {
      try {
        const chips = this.getChipNodes();
        const present = new Set(chips.map((c) => Number(c.dataset.index || '-1')).filter((i) => i >= 0));
        const elements = (this.stateManager.get('selection.elements') || []);
        if (!elements.length) return;
        const toRemove = [];
        for (let i = 0; i < elements.length; i += 1) {
          if (!present.has(i)) toRemove.push(i);
        }
        if (!toRemove.length) return;
        // Remove from highest to lowest to keep indices consistent
        toRemove.sort((a, b) => b - a).forEach((idx) => this.eventBus.emit('element:removed', idx));
      } catch (_) { }
    }

    decorateChip(chip, item, index) {
      if (!chip || !item) return;
      chip.dataset.index = String(index);
      chip.classList.toggle('edited', !!item.edited);
      chip.title = item.diffSummary || '';
      const labelBtn = chip.querySelector('.chip-label') || chip.querySelector('button');
      if (labelBtn) {
        const label = item.element ? readableElementName(item.element) : 'element';
        labelBtn.textContent = '@' + label;
      }
    }

    updateChipIndices(startIndex = 0) {
      const chips = this.getChipNodes();
      for (let i = startIndex; i < chips.length; i += 1) {
        chips[i].dataset.index = String(i);
      }
    }

    updatePlaceholder() {
      if (!this.editorEl) return;
      const hasContent = this.editorEl.textContent.trim().length > 0 || this.getChipNodes().length > 0;
      this.editorEl.classList.toggle('has-content', hasContent);
    }

    // Screenshot preview helpers
    ensureShotPreviewContainers() {
      if (!this.shadow) return;
      const dock = this.shadow.getElementById('dock');
      if (!dock) return;
      if (!this.shotTooltip) {
        const tip = document.createElement('div');
        tip.id = 'shot-tooltip';
        tip.style.cssText = 'position:absolute; display:none; z-index:10000; padding:6px; border:1px solid var(--border); background: var(--surface); box-shadow: var(--shadow-lg); border-radius: 10px;';
        const img = document.createElement('img');
        img.style.cssText = 'display:block; max-width:200px; max-height:140px; border-radius:6px;';
        tip.appendChild(img);
        dock.appendChild(tip);
        this.shotTooltip = tip;
        this.shotTooltipImg = img;
      }
      if (!this.shotLightbox) {
        const overlay = document.createElement('div');
        overlay.id = 'shot-lightbox';
        overlay.style.cssText = 'position:absolute; inset:0; z-index:10000; display:none; background: color-mix(in srgb, var(--dock-fg) 20%, transparent); align-items:center; justify-content:center;';
        const box = document.createElement('div');
        box.style.cssText = 'position:relative; max-width: calc(100% - 32px); max-height: calc(100% - 32px); padding:12px; background: var(--surface); border:1px solid var(--border); border-radius:12px; box-shadow: var(--shadow-lg); display:flex; align-items:center; justify-content:center;';
        const img = document.createElement('img');
        img.style.cssText = 'max-width:100%; max-height:80vh; display:block; border-radius:8px;';
        const close = document.createElement('button');
        close.textContent = '×';
        close.title = 'Close';
        close.style.cssText = 'position:absolute; top:8px; right:8px; width:28px; height:28px; border-radius:14px; border:1px solid var(--border); background: var(--surface); color: var(--text-secondary); cursor:pointer;';
        close.addEventListener('click', () => this.hideShotLightbox());
        box.appendChild(close);
        box.appendChild(img);
        overlay.appendChild(box);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) this.hideShotLightbox(); });
        dock.appendChild(overlay);
        this.shotLightbox = overlay;
        this.shotLightboxImg = img;
      }
    }

    showShotPreview(shot, anchorEl) {
      try { this.ensureShotPreviewContainers(); } catch (_) { }
      if (!this.shotTooltip || !this.shotTooltipImg) return;
      this.shotTooltipImg.src = shot.dataUrl;
      const chipRect = anchorEl.getBoundingClientRect();
      const dock = this.shadow.getElementById('dock');
      const dockRect = dock ? dock.getBoundingClientRect() : { top: 0, left: 0, width: window.innerWidth };
      const top = Math.max(8, chipRect.top - dockRect.top - 8 - 140);
      const left = Math.min(dockRect.width - 220, Math.max(8, chipRect.left - dockRect.left));
      this.shotTooltip.style.top = `${top}px`;
      this.shotTooltip.style.left = `${left}px`;
      this.shotTooltip.style.display = 'block';
    }

    hideShotPreview() {
      if (this.shotTooltip) this.shotTooltip.style.display = 'none';
    }

    openShotLightbox(shot) {
      try { this.ensureShotPreviewContainers(); } catch (_) { }
      if (!this.shotLightbox || !this.shotLightboxImg) return;
      this.shotLightboxImg.src = shot.dataUrl;
      this.shotLightbox.style.display = 'flex';
    }

    hideShotLightbox() {
      if (this.shotLightbox) this.shotLightbox.style.display = 'none';
    }

    sanitizeEditor() {
      if (!this.editorEl) return;
      const nodes = Array.from(this.editorEl.childNodes);
      nodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'DIV') {
          const text = document.createTextNode(node.textContent || '');
          this.editorEl.replaceChild(text, node);
        }
      });
      this.updatePlaceholder();
    }

    removeElementAt(index) {
      const list = (this.stateManager.get('selection.elements') || []).slice();
      if (index < 0 || index >= list.length) return;
      try { this.eventBus.emit('element:pre-remove', { index, snapshot: list[index] }); } catch (_) { }
      list.splice(index, 1);
      this.stateManager.set('selection.elements', list);
      this.eventBus.emit('element:removed', index);
    }

    timeAgo(ts) {
      if (!ts) return 'Just now';
      const diff = Date.now() - ts;
      const m = Math.floor(diff / 60000);
      if (m < 60) return m <= 1 ? 'Just now' : `${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h ago`;
      const d = Math.floor(h / 24);
      if (d < 7) return `${d}d ago`;
      return new Date(ts).toLocaleDateString();
    }
  }

  let __dockThemeMode = 'auto'; // 'auto' | 'light' | 'dark'

  function applyDockThemeAuto() {
    try {
      if (__dockThemeMode !== 'auto') return; // respect manual override
      const parseRGB = (str) => {
        if (!str) return null;
        const m = String(str).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
        return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
      };
      const luminance = ([r, g, b]) => {
        const s = [r, g, b]
          .map((v) => v / 255)
          .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
        return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
      };
      const bodyBg = getComputedStyle(document.body).backgroundColor;
      const rgb = parseRGB(bodyBg);
      const preferDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
      const isDark = rgb ? luminance(rgb) < 0.5 : preferDark;
      document.documentElement.classList.toggle('dark-dock', !!isDark);
    } catch (_) {
      // best effort only
    }
  }

  function setDockThemeMode(mode = 'auto') {
    __dockThemeMode = (mode === 'dark' || mode === 'light') ? mode : 'auto';
    if (__dockThemeMode === 'dark') {
      try { document.documentElement.classList.add('dark-dock'); } catch (_) {}
      return 'dark';
    }
    if (__dockThemeMode === 'light') {
      try { document.documentElement.classList.remove('dark-dock'); } catch (_) {}
      return 'light';
    }
    applyDockThemeAuto();
    return 'auto';
  }

  /**
   * ElementSchema - Derive control schema for the Property Panel
   */


  function describeChanges(changes) {
    if (!changes) return 'Edited';
    const friendly = {
      text: 'Text',
      color: 'Text Color',
      backgroundColor: 'Background',
      fontSize: 'Font Size',
      fontWeight: 'Font Weight',
      lineHeight: 'Line Height',
      borderRadius: 'Radius',
      padding: 'Padding',
      paddingTop: 'Padding Top',
      paddingRight: 'Padding Right',
      paddingBottom: 'Padding Bottom',
      paddingLeft: 'Padding Left',
      boxShadow: 'Shadow'
    };
    const keys = Object.keys(changes);
    if (!keys.length) return 'Edited';
    const labels = keys.map(key => friendly[key] || key);
    return Array.from(new Set(labels)).join(', ');
  }

  const SHADOW_PRESETS = {
    none: 'none',
    soft: '0 6px 18px color-mix(in srgb, var(--dock-fg) 12%, transparent)',
    medium: '0 12px 28px color-mix(in srgb, var(--dock-fg) 16%, transparent)',
    deep: '0 24px 44px color-mix(in srgb, var(--dock-fg) 20%, transparent)'
  };

  class DockEditModal {
    constructor(eventBus, stateManager, mountRoot) {
      this.eventBus = eventBus;
      this.stateManager = stateManager;
      this.mountRoot = mountRoot || document.body;
      this.container = null;
      this.backdrop = null;
      this.form = null;
      this.targets = [];
      this.indices = [];
      this.base = null;
      this.inline = null;
      this.current = {};
      this.bodyScrollLocked = false;
      // Preview-level history (undo before Apply)
      this.previewHistory = [];
      this.lastPreviewState = {};
    }

    mount() {
      if (this.container) return;
      this.backdrop = document.createElement('div');
      this.backdrop.id = 'dock-edit-overlay';
      this.backdrop.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      left: auto;
      right: 0; /* Pin to the right edge to align with Dock */
      width: 420px; /* updated dynamically in open() */
      box-sizing: border-box;
      background: color-mix(in srgb, var(--dock-fg, #0f172a) 22%, transparent);
      backdrop-filter: blur(8px);
      z-index: 2147483647;
      display: none;
      `;
      this.backdrop.addEventListener('click', () => this.close(true));

      this.container = document.createElement('div');
      this.container.id = 'dock-edit-modal';
      this.container.style.cssText = `
      position: fixed;
      right: 24px;
      top: 72px;
      width: 360px;
      text-align: left;
      box-sizing: border-box;
      background: var(--dock-bg);
      backdrop-filter: blur(24px);
      border-radius: var(--radius-panel, 18px);
      border: 1px solid var(--dock-stroke);
      box-shadow: var(--shadow);
      padding: 20px 22px;
      display: none; /* hidden by default; becomes flex on open() */
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: var(--dock-fg);
      max-height: calc(100vh - 144px);
      overflow: hidden;
      flex-direction: column;
    `;

      this.container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-shrink:0;">
        <div id="dock-edit-title" style="font-weight:600;font-size:14px;">Edit</div>
        <button id="dock-edit-close" style="border:none;background:transparent;font-size:18px;cursor:pointer;color:var(--dock-fg-2);">×</button>
      </div>
      <div id="dock-edit-scroll" style="flex:1;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;padding-right:4px;min-height:0;">
        <form id="dock-edit-form" class="dock-edit-form" style="display:flex;flex-direction:column;gap:14px;"></form>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px;flex-shrink:0;">
        <button type="button" id="dock-edit-undo" class="dock-edit-btn" style="border:1px solid var(--dock-stroke);background:color-mix(in srgb, var(--dock-bg) 94%, transparent);border-radius:12px;padding:6px 12px;color:var(--dock-fg-2);">Undo</button>
        <button type="button" id="dock-edit-apply" class="dock-edit-apply" style="border:1px solid var(--dock-stroke);background:var(--surface, color-mix(in srgb, var(--dock-bg) 96%, transparent));border-radius:12px;padding:6px 12px;color:var(--dock-fg);">Apply</button>
      </div>
    `;

      this.form = this.container.querySelector('#dock-edit-form');
      this.scrollContainer = this.container.querySelector('#dock-edit-scroll');
      this.container.querySelector('#dock-edit-close').addEventListener('click', () => this.close(true));
      this.undoBtn = this.container.querySelector('#dock-edit-undo');
      if (this.undoBtn) this.undoBtn.addEventListener('click', () => { try { this.eventBus.emit('wysiwyg:undo'); } catch (_) {} });
      this.container.querySelector('#dock-edit-apply').addEventListener('click', () => this.applyChanges());

      // Prevent scroll events from bubbling to page
      this.container.addEventListener('wheel', (e) => {
        e.stopPropagation();
      }, { passive: true });

      // Keyboard: Cmd/Ctrl+Z for Undo while modal is open
      this.container.addEventListener('keydown', (e) => {
        const isUndo = (e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z');
        if (isUndo) {
          e.preventDefault();
          try { this.eventBus.emit('wysiwyg:undo'); } catch (_) {}
        }
      });
      
      // Ensure scroll only happens within modal
      if (this.scrollContainer) {
        this.scrollContainer.addEventListener('wheel', (e) => {
          const { scrollTop, scrollHeight, clientHeight } = this.scrollContainer;
          const isScrollingUp = e.deltaY < 0;
          const isScrollingDown = e.deltaY > 0;
          const isAtTop = scrollTop === 0;
          const isAtBottom = scrollTop + clientHeight >= scrollHeight;
          
          if ((isAtTop && isScrollingUp) || (isAtBottom && isScrollingDown)) {
            e.preventDefault();
          }
          e.stopPropagation();
        }, { passive: false });
      }

      if (!this.mountRoot) return;
      this.mountRoot.appendChild(this.backdrop);
      this.mountRoot.appendChild(this.container);
      this.updateUndoAvailability();
    }

    open({ index, element } = {}) {
      this.mount();
      const selection = this.stateManager.get('selection.elements') || [];
      if (!Array.isArray(selection) || selection.length === 0) return;

      let indices = [];
      if (typeof index === 'number' && selection[index]) {
        indices = [index];
      } else if (element) {
        const found = selection.findIndex(item => item.element === element);
        if (found >= 0) indices = [found];
      }
      if (!indices.length) {
        indices = selection.map((_, i) => i);
      }

      this.indices = indices;
      this.targets = indices
        .map((i) => {
          const item = selection[i];
          return item && item.element ? { element: item.element, selector: item.selector } : null;
        })
        .filter(Boolean);

      if (!this.targets.length) return;

      this.current = {};
      this.collectBase();
      this.renderForm();
      this.stateManager.set('wysiwyg.pending', null);
      this.stateManager.set('wysiwyg.active', true);
      // Reset preview history every time modal opens
      this.previewHistory = [];
      this.lastPreviewState = {};
      if (!this.bodyScrollLocked) {
        document.body.classList.add('lumi-scroll-lock');
        this.bodyScrollLocked = true;
      }
      // Ensure overlay only covers Dock area
      this.positionOverlay();
      this.backdrop.style.display = 'block';
      this.container.style.display = 'flex';
    }

    close(cancel = false) {
      if (!this.container) return;
      if (cancel) {
        this.restoreBase();
      }
      this.backdrop.style.display = 'none';
      this.container.style.display = 'none';
      window.removeEventListener('resize', this._onResize);
      this.form.innerHTML = '';
      this.current = {};
      this.targets = [];
      this.indices = [];
      this.stateManager.set('wysiwyg.pending', null);
      this.stateManager.set('wysiwyg.active', false);
      if (this.bodyScrollLocked) {
        document.body.classList.remove('lumi-scroll-lock');
        this.bodyScrollLocked = false;
      }
    }

    getVar(name) {
      try {
        const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return v || '';
      } catch (_) { return ''; }
    }

    positionOverlay() {
      try {
        // Measure dock host rect for precise alignment
        const host = document.getElementById('lumi-dock-root');
        const rect = host ? host.getBoundingClientRect() : null;
        const fallbackWidth = this.stateManager.get('ui.dockWidth') || 420;
        const hasVisibleDock = !!rect && rect.width >= 40 && rect.right > 0;

        const dockWidth = Math.round(hasVisibleDock ? rect.width : fallbackWidth);
        if (hasVisibleDock) {
          // Pin overlay exactly over visible dock area
          const dockLeft = Math.max(0, Math.round(rect.left));
          this.backdrop.style.left = dockLeft + 'px';
          this.backdrop.style.right = '';
          this.backdrop.style.width = dockWidth + 'px';
        } else {
          // Dock hidden: fallback to right-anchored overlay (avoid jumping to left)
          this.backdrop.style.left = '';
          this.backdrop.style.right = '0px';
          this.backdrop.style.width = dockWidth + 'px';
        }

        // Ensure modal fits within dock area
        const maxModal = Math.max(260, dockWidth - 48);
        const modalWidth = Math.min(360, maxModal);
        this.container.style.width = modalWidth + 'px';
        this.container.style.right = '24px';
      } catch (_) {}
      if (!this._onResize) {
        this._onResize = () => this.positionOverlay();
      }
      window.addEventListener('resize', this._onResize, { passive: true });
    }

    collectBase() {
      const base = {
        text: null,
        color: null,
        backgroundColor: null,
        fontSize: null,
        fontWeight: null,
        lineHeight: null,
        paddingTop: null,
        paddingRight: null,
        paddingBottom: null,
        paddingLeft: null,
        borderRadius: null,
        boxShadow: null
      };
      const inline = [];
      this.targets.forEach(({ element }) => {
        const style = window.getComputedStyle(element);
        const entry = {
          text: element.textContent,
          color: style.color,
          backgroundColor: style.backgroundColor,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
          paddingTop: style.paddingTop,
          paddingRight: style.paddingRight,
          paddingBottom: style.paddingBottom,
          paddingLeft: style.paddingLeft,
          borderRadius: style.borderRadius,
          boxShadow: style.boxShadow,
          inline: {
            color: element.style.color,
            backgroundColor: element.style.backgroundColor,
            fontSize: element.style.fontSize,
            fontWeight: element.style.fontWeight,
            lineHeight: element.style.lineHeight,
            paddingTop: element.style.paddingTop,
            paddingRight: element.style.paddingRight,
            paddingBottom: element.style.paddingBottom,
            paddingLeft: element.style.paddingLeft,
            borderRadius: element.style.borderRadius,
            boxShadow: element.style.boxShadow
          }
        };
        inline.push(entry);
        Object.keys(base).forEach((key) => {
          if (base[key] === null) {
            base[key] = entry[key];
          } else if (base[key] !== entry[key]) {
            base[key] = 'mixed';
          }
        });
      });
      this.base = base;
      this.inline = inline;
    }

    restoreBase() {
      // Restore to the snapshot from when the modal was opened (non-destructive cancel)
      this.targets.forEach(({ element }, idx) => {
        const data = this.inline[idx];
        if (!data) return;
        // Only restore text for text-only elements
        if (this.canEditText(element)) {
          element.textContent = data.text;
        }
        element.style.color = data.inline.color;
        element.style.backgroundColor = data.inline.backgroundColor;
        element.style.fontSize = data.inline.fontSize;
        element.style.fontWeight = data.inline.fontWeight;
        element.style.lineHeight = data.inline.lineHeight;
        element.style.paddingTop = data.inline.paddingTop;
        element.style.paddingRight = data.inline.paddingRight;
        element.style.paddingBottom = data.inline.paddingBottom;
        element.style.paddingLeft = data.inline.paddingLeft;
        element.style.borderRadius = data.inline.borderRadius;
        element.style.boxShadow = data.inline.boxShadow;
      });
    }

    restoreBaseline() {
      // Restore to the original baseline captured at selection-time (spanning multiple edits)
      const selection = this.stateManager.get('selection.elements') || [];
      this.targets.forEach(({ element }, idx) => {
        const index = this.indices[idx];
        const selItem = selection && typeof index === 'number' ? selection[index] : null;
        const base = selItem && selItem.baseline ? selItem.baseline : null;
        if (!base) return;
        const inline = base.inline || {};
        // Only restore text for text-only elements
        if (this.canEditText(element) && base.text !== null && base.text !== undefined) {
          element.textContent = base.text;
        }
        element.style.color = inline.color || '';
        element.style.backgroundColor = inline.backgroundColor || '';
        element.style.fontSize = inline.fontSize || '';
        element.style.fontWeight = inline.fontWeight || '';
        element.style.lineHeight = inline.lineHeight || '';
        element.style.paddingTop = inline.paddingTop || '';
        element.style.paddingRight = inline.paddingRight || '';
        element.style.paddingBottom = inline.paddingBottom || '';
        element.style.paddingLeft = inline.paddingLeft || '';
        element.style.borderRadius = inline.borderRadius || '';
        element.style.boxShadow = inline.boxShadow || '';
      });
    }

    renderForm() {
      const base = this.base;
      const form = this.form;
      form.innerHTML = '';

      const title = this.container.querySelector('#dock-edit-title');
      if (this.targets.length > 1) {
        title.textContent = `${this.targets.length} elements selected`;
      } else {
        const el = this.targets[0].element;
        title.textContent = readableElementName(el);
      }

      // Text field only for single, text-only elements
      const allowText = this.targets.length === 1 && this.canEditText(this.targets[0].element);
      if (allowText) {
        form.appendChild(this.renderTextField('Text', 'text', base.text));
      }
      form.appendChild(this.renderColorField('Text Color', 'color', base.color));
      form.appendChild(this.renderColorField('Background', 'backgroundColor', base.backgroundColor));
      form.appendChild(this.renderNumberField('Font Size (px)', 'fontSize', base.fontSize, { unit: 'px' }));
      form.appendChild(this.renderSelectField('Font Weight', 'fontWeight', base.fontWeight, ['300','400','500','600','700']));
      form.appendChild(this.renderNumberField('Line Height', 'lineHeight', base.lineHeight));

      form.appendChild(this.renderPaddingGroup(base));
      form.appendChild(this.renderNumberField('Border Radius (px)', 'borderRadius', base.borderRadius, {unit:'px'}));
      form.appendChild(this.renderShadowField(base.boxShadow));
    }

    canEditText(element) {
      try {
        if (!element) return false;
        const tag = (element.tagName || '').toLowerCase();
        if (['input','textarea','img','video','canvas','svg'].includes(tag)) return false;
        // Only when there are no element children (text-only nodes)
        return element.childElementCount === 0;
      } catch (_) { return false; }
    }

    renderTextField(label, key, value) {
      const wrapper = document.createElement('label');
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.gap = '6px';
      wrapper.style.textAlign = 'left';
      wrapper.innerHTML = `<span style="font-size:12px;color:var(--dock-fg-2);">${label}</span>`;
      const textarea = document.createElement('textarea');
      textarea.style.fontSize = '13px';
      textarea.style.padding = '8px 10px';
      textarea.style.border = '1px solid var(--dock-stroke)';
      textarea.style.borderRadius = '10px';
      textarea.style.background = 'color-mix(in srgb, var(--dock-bg) 96%, transparent)';
      textarea.style.color = 'var(--dock-fg)';
      textarea.style.resize = 'vertical';
      textarea.value = value === 'mixed' ? '' : (value || '');
      textarea.placeholder = value === 'mixed' ? 'Mixed' : '';
      textarea.addEventListener('input', () => {
        if (value === 'mixed' && !textarea.value.trim()) {
          delete this.current[key];
        } else {
          this.current[key] = textarea.value;
        }
        this.preview();
      });
      wrapper.appendChild(textarea);
      return wrapper;
    }

    renderColorField(label, key, value) {
      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.gap = '6px';
      wrapper.style.textAlign = 'left';
      wrapper.innerHTML = `<span style="font-size:12px;color:var(--dock-fg-2);">${label}</span>`;
      const input = document.createElement('input');
      input.type = 'color';
      input.value = this.toHex(value === 'mixed' ? (this.getVar('--dock-fg-2') || 'gray') : value);
      input.style.background = 'var(--surface, color-mix(in srgb, var(--dock-bg) 96%, transparent))';
      input.style.color = 'var(--dock-fg)';
      input.addEventListener('input', () => {
        this.current[key] = input.value;
        this.preview();
      });
      wrapper.appendChild(input);
      return wrapper;
    }

    renderNumberField(label, key, value, opts = {}) {
      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.gap = '6px';
      wrapper.style.textAlign = 'left';
      wrapper.innerHTML = `<span style="font-size:12px;color:var(--dock-fg-2);">${label}</span>`;
      const input = document.createElement('input');
      input.type = 'number';
      input.style.padding = '6px 10px';
      input.style.border = '1px solid var(--dock-stroke)';
      input.style.borderRadius = '10px';
      input.style.background = 'color-mix(in srgb, var(--dock-bg) 96%, transparent)';
      input.style.color = 'var(--dock-fg)';
      input.step = opts.step || '1';
      if (value !== 'mixed' && value !== null) {
        input.value = this.parseNumeric(value, opts.unit);
      } else {
        input.placeholder = 'Mixed';
      }
      input.addEventListener('input', () => {
        if (input.value === '') {
          delete this.current[key];
        } else {
          const unit = opts.unit || '';
          this.current[key] = unit ? `${input.value}${unit}` : input.value;
        }
        this.preview();
      });
      wrapper.appendChild(input);
      return wrapper;
    }

    renderSelectField(label, key, value, options) {
      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.gap = '6px';
      wrapper.style.textAlign = 'left';
      wrapper.innerHTML = `<span style="font-size:12px;color:var(--dock-fg-2);">${label}</span>`;
      const select = document.createElement('select');
      select.style.padding = '6px 10px';
      select.style.border = '1px solid var(--dock-stroke)';
      select.style.borderRadius = '10px';
      select.style.background = 'color-mix(in srgb, var(--dock-bg) 96%, transparent)';
      select.style.color = 'var(--dock-fg)';
      select.innerHTML = `<option value="">Mixed</option>` + options.map(opt => `<option value="${opt}">${opt}</option>`).join('');
      if (value && value !== 'mixed') {
        select.value = value.replace(/[^0-9]/g, '') || value;
      }
      select.addEventListener('change', () => {
        if (!select.value) {
          delete this.current[key];
        } else {
          this.current[key] = select.value;
        }
        this.preview();
      });
      wrapper.appendChild(select);
      return wrapper;
    }

    renderPaddingGroup(base) {
      const wrapper = document.createElement('div');
      wrapper.style.textAlign = 'left';
      wrapper.innerHTML = `<span style="font-size:12px;color:var(--dock-fg-2);">Padding (px)</span>`;
      const grid = document.createElement('div');
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
      grid.style.gap = '10px';

      ['Top','Right','Bottom','Left'].forEach(side => {
        const key = `padding${side}`;
        const cell = this.renderNumberField(side, key, base[key], { unit: 'px' });
        grid.appendChild(cell);
      });
      wrapper.appendChild(grid);
      return wrapper;
    }

    renderShadowField(value) {
      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.gap = '6px';
      wrapper.style.textAlign = 'left';
      wrapper.innerHTML = `<span style="font-size:12px;color:var(--dock-fg-2);">Shadow</span>`;
      const select = document.createElement('select');
      select.style.padding = '6px 10px';
      select.style.border = '1px solid var(--dock-stroke)';
      select.style.borderRadius = '10px';
      select.style.background = 'color-mix(in srgb, var(--dock-bg) 96%, transparent)';
      select.innerHTML = `
      <option value="none">None</option>
      <option value="soft">Soft</option>
      <option value="medium">Medium</option>
      <option value="deep">Deep</option>
    `;
      const matched = Object.entries(SHADOW_PRESETS).find(([key, preset]) => preset === value);
      select.value = matched ? matched[0] : 'none';
      select.addEventListener('change', () => {
        const preset = SHADOW_PRESETS[select.value] || 'none';
        this.current.boxShadow = preset;
        this.preview();
      });
      wrapper.appendChild(select);
      return wrapper;
    }

    preview() {
      const changes = this.current;
      // Compute trimmed current state (keys with non-empty values)
      const trimmed = {};
      Object.entries(changes || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          trimmed[key] = value;
        }
      });
      // Determine changed keys vs last preview state
      const changedKeys = Object.keys(trimmed).filter(k => this.lastPreviewState[k] !== trimmed[k]);
      // If keys removed (no longer present), also treat as change to clear styles
      Object.keys(this.lastPreviewState).forEach((k) => {
        if (!Object.prototype.hasOwnProperty.call(trimmed, k)) changedKeys.push(k);
      });
      // Record a preview step before applying
      if (changedKeys.length) {
        const step = { prevByIndex: new Map(), keys: Array.from(new Set(changedKeys)) };
        this.targets.forEach((t, i) => {
          const idx = this.indices[i];
          const el = t.element;
          const prev = {};
          step.keys.forEach((key) => {
            if (key === 'text') {
              if (this.canEditText(el)) prev.text = el.textContent;
            } else {
              prev[key] = el.style[key] || '';
            }
          });
          step.prevByIndex.set(idx, prev);
        });
        this.previewHistory.push(step);
        this.lastPreviewState = { ...trimmed };
      }
      this.targets.forEach(({ element }) => {
        if (changes.text !== undefined && this.canEditText(element)) {
          element.textContent = changes.text;
        }
        if (changes.color !== undefined) element.style.color = changes.color;
        if (changes.backgroundColor !== undefined) element.style.backgroundColor = changes.backgroundColor;
        if (changes.fontSize !== undefined) element.style.fontSize = this.withUnit(changes.fontSize, 'px');
        if (changes.fontWeight !== undefined) element.style.fontWeight = changes.fontWeight;
        if (changes.lineHeight !== undefined) element.style.lineHeight = changes.lineHeight;
        if (changes.paddingTop !== undefined) element.style.paddingTop = this.withUnit(changes.paddingTop, 'px');
        if (changes.paddingRight !== undefined) element.style.paddingRight = this.withUnit(changes.paddingRight, 'px');
        if (changes.paddingBottom !== undefined) element.style.paddingBottom = this.withUnit(changes.paddingBottom, 'px');
        if (changes.paddingLeft !== undefined) element.style.paddingLeft = this.withUnit(changes.paddingLeft, 'px');
        if (changes.borderRadius !== undefined) element.style.borderRadius = this.withUnit(changes.borderRadius, 'px');
        if (changes.boxShadow !== undefined) element.style.boxShadow = changes.boxShadow;
      });
      this.syncPending();
      this.updateUndoAvailability();
    }

    undoPreviewStep() {
      if (!this.previewHistory || this.previewHistory.length === 0) return false;
      const step = this.previewHistory.pop();
      if (!step) return false;
      // Revert values per target
      this.targets.forEach((t, i) => {
        const idx = this.indices[i];
        const prev = step.prevByIndex.get(idx) || {};
        const el = t.element;
        step.keys.forEach((key) => {
          if (key === 'text') {
            if (this.canEditText(el) && Object.prototype.hasOwnProperty.call(prev, 'text')) {
              el.textContent = prev.text;
            }
          } else {
            const val = prev[key];
            el.style[key] = val || '';
          }
        });
      });
      // Reset current and last preview snapshot to reflect DOM after revert
      this.current = {};
      this.lastPreviewState = {};
      // Refresh controls from DOM
      this.collectBase();
      this.renderForm();
      this.syncPending();
      this.updateUndoAvailability();
      return true;
    }

    isOpen() {
      return !!this.container && this.container.style.display === 'flex';
    }

    resetChanges() {
      // Reset to original page state (baseline), even across multiple edit sessions
      this.restoreBaseline();
      this.current = {};
      // Re-collect base from the now-restored DOM so controls reflect baseline
      this.collectBase();
      this.renderForm();
      this.syncPending();
      this.updateUndoAvailability();
    }

    applyChanges() {
      if (!this.targets.length) return;
      const changes = { ...this.current };
      // Remove text change if not applicable
      if (Object.prototype.hasOwnProperty.call(changes, 'text')) {
        const allow = this.targets.length === 1 && this.canEditText(this.targets[0].element);
        if (!allow) delete changes.text;
      }
      // Trim empty/undefined changes
      Object.keys(changes).forEach(key => {
        if (changes[key] === undefined || changes[key] === null || changes[key] === '') delete changes[key];
      });
      const hasDiff = Object.keys(changes).length > 0;
      const summary = describeChanges(changes) || 'Edited';
      this.targets.forEach(({ selector }, idx) => {
        const index = this.indices[idx];
        this.eventBus.emit('wysiwyg:apply', {
          index,
          selector,
          changes,
          summary
        });
      });
      // Only auto-close when there are effective diffs
      if (hasDiff) this.close();
      this.updateUndoAvailability();
    }

    updateUndoAvailability() {
      try {
        if (!this.undoBtn) return;
        const canUndo = Array.isArray(this.previewHistory) && this.previewHistory.length > 0;
        this.undoBtn.disabled = !canUndo;
        this.undoBtn.style.opacity = canUndo ? '1' : '0.5';
        this.undoBtn.style.cursor = canUndo ? 'pointer' : 'not-allowed';
      } catch (_) {}
    }

    parseNumeric(value, unit) {
      if (!value || value === 'mixed') return '';
      if (unit === 'px') {
        const match = String(value).match(/-?\d+(?:\.\d+)?/);
        return match ? match[0] : '';
      }
      if (String(value).endsWith('px')) return value.replace('px', '');
      return value;
    }

    withUnit(value, unit) {
      if (value === undefined || value === null || value === '') return '';
      if (String(value).endsWith(unit)) return value;
      return `${value}${unit}`;
    }

    toHex(color) {
      const fallback = this.getVar('--dock-fg') || 'black';
      if (!color) return fallback;
      if (color.startsWith('#')) return color.length === 7 ? color : fallback;
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.fillStyle = color;
      const computed = ctx.fillStyle;
      return /^#/.test(computed) ? computed : fallback;
    }

    syncPending() {
      if (!this.indices.length || this.indices.length !== 1) {
        this.stateManager.set('wysiwyg.pending', null);
        return;
      }
      const trimmed = {};
      Object.entries(this.current || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          trimmed[key] = value;
        }
      });
      if (Object.keys(trimmed).length) {
        this.stateManager.set('wysiwyg.pending', {
          index: this.indices[0],
          changes: trimmed
        });
      } else {
        this.stateManager.set('wysiwyg.pending', null);
      }
    }
  }

  /**
   * StyleApplier - Injects and manages scoped style rules for WYSIWYG edits
   */

  const SHEET_ID = 'lumi-style-sheet';

  class StyleApplier {
    constructor(eventBus) {
      this.eventBus = eventBus;
      this.sheet = null;
      this.ruleMap = new Map(); // key -> { selector, property, value }
    }

    ensureSheet() {
      if (this.sheet) return this.sheet;
      let styleEl = document.getElementById(SHEET_ID);
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = SHEET_ID;
        styleEl.dataset.lumi = 'styles';
        document.head.appendChild(styleEl);
      }
      this.sheet = styleEl.sheet;
      return this.sheet;
    }

    apply(element, property, value, context = {}) {
      if (!element || !property) return;
      const sheet = this.ensureSheet();
      const selector = this.getSelectorForElement(element, context);
      const key = this.getRuleKey(selector, property, context);

      const ruleBody = `${property}: ${value};`;
      const cssRule = `${selector} { ${ruleBody} }`;

      this.removeRule(key);
      try {
        const index = sheet.cssRules.length;
        sheet.insertRule(cssRule, index);
        this.ruleMap.set(key, { index, selector, property, value, context });
      } catch (error) {
        console.warn('[StyleApplier] Failed to insert rule', cssRule, error);
      }
    }

    remove(element, property, context = {}) {
      if (!element || !property) return;
      const selector = this.getSelectorForElement(element, context);
      const key = this.getRuleKey(selector, property, context);
      this.removeRule(key);
    }

    clear() {
      const sheet = this.ensureSheet();
      while (sheet.cssRules.length) {
        sheet.deleteRule(sheet.cssRules.length - 1);
      }
      this.ruleMap.clear();
    }

    export() {
      const rules = [];
      this.ruleMap.forEach((entry) => {
        const { selector, property, value, context } = entry;
        rules.push({ selector, property, value, context });
      });
      return rules;
    }

    getSelectorForElement(element, context = {}) {
      const { index } = context;
      if (!element.dataset.lumiId) {
        element.dataset.lumiId = this.generateId(element, index);
      }
      const baseSelector = `[data-lumi-id="${element.dataset.lumiId}"]`;

      const { breakpoint, state } = context;
      let selector = baseSelector;

      if (state) {
        selector = `${selector}:${state}`;
      }

      if (breakpoint) {
        return `@media ${breakpoint} { ${selector}`;
      }

      return selector;
    }

    getRuleKey(selector, property, context = {}) {
      const scope = context.breakpoint ? context.breakpoint : 'default';
      const state = context.state || 'default';
      return `${scope}|${state}|${selector}|${property}`;
    }

    removeRule(key) {
      if (!this.ruleMap.has(key)) return;
      const entry = this.ruleMap.get(key);
      const sheet = this.ensureSheet();
      if (entry.index !== undefined && sheet.cssRules[entry.index]) {
        sheet.deleteRule(entry.index);
      } else {
        // fallback: search by selector/property
        for (let i = sheet.cssRules.length - 1; i >= 0; i -= 1) {
          const rule = sheet.cssRules[i];
          if (rule.selectorText === entry.selector && rule.style && rule.style[entry.property] !== undefined) {
            sheet.deleteRule(i);
          }
        }
      }
      this.ruleMap.delete(key);
    }

    generateId(element, index) {
      const base = element.tagName ? element.tagName.toLowerCase() : 'node';
      const random = Math.random().toString(36).slice(2, 7);
      return `${base}-${index !== undefined ? index : 'x'}-${random}`;
    }
  }

  /**
   * StyleHistory - Tracks committed style changes for undo/redo
   */

  class StyleHistory {
    constructor(limit = 200) {
      this.limit = limit;
      this.stack = [];
      this.position = -1;
    }

    push(change) {
      if (!change) return;
      if (this.position < this.stack.length - 1) {
        this.stack = this.stack.slice(0, this.position + 1);
      }
      this.stack.push(change);
      if (this.stack.length > this.limit) {
        this.stack.shift();
      } else {
        this.position += 1;
      }
    }

    undo() {
      if (this.position < 0) return null;
      const change = this.stack[this.position];
      this.position -= 1;
      return change;
    }

    redo() {
      if (this.position >= this.stack.length - 1) return null;
      this.position += 1;
      return this.stack[this.position];
    }

    clear() {
      this.stack = [];
      this.position = -1;
    }

    get canUndo() {
      return this.position >= 0;
    }

    get canRedo() {
      return this.position < this.stack.length - 1;
    }

    // Find the most recent entry (<= current position) for a given index
    lastForIndex(index) {
      if (typeof index !== 'number') return null;
      for (let i = this.position; i >= 0; i -= 1) {
        const entry = this.stack[i];
        if (entry && entry.index === index) return entry;
      }
      return null;
    }
  }

  // Shared helpers for deriving timeline chunks from plain stdout/stderr

  function isNoisyConsoleLine(t) {
    try {
      const s = String(t || '').trim();
      if (!s) return true;
      if (/^nvm is not compatible with the "npm_config_prefix"/i.test(s)) return true;
      if (/^Run `unset npm_config_prefix`/i.test(s)) return true;
      if (/^OpenAI Codex v[0-9.]+/i.test(s)) return true;
      if (/^-{4,}$/.test(s)) return true;
      if (/^workdir:/i.test(s)) return true;
      if (/^model:/i.test(s)) return true;
      if (/^provider:/i.test(s)) return true;
      if (/^approval:/i.test(s)) return true;
      if (/^sandbox:/i.test(s)) return true;
      if (/^reasoning effort:/i.test(s)) return true;
      if (/^reasoning summaries:/i.test(s)) return true;
      if (/^session id:/i.test(s)) return true;
      if (/^GET \/health\b/i.test(s)) return true;
      if (/^Reading prompt from stdin\.\.\./i.test(s)) return true;
      if (/^tokens used$/i.test(s)) return true;
      if (/^Execute completed in \d+ms:/i.test(s)) return true;
      if (/^user$/i.test(s)) return true;
      if (/^\[@(element|screenshot)\d+\]/i.test(s)) return true;
      if (/^#\s+User Intent\b/.test(s)) return true;
      if (/^#\s+Context Reference Map\b/.test(s)) return true;
      if (/^#\s+Detailed Element Context\b/.test(s)) return true;
      if (/^#\s+Instructions\b/.test(s)) return true;
      if (/^#\s+Selection Area\b/.test(s)) return true;
      if (/^##\s+Selected Elements\b/.test(s)) return true;
      if (/^##\s+Screenshots\b/.test(s)) return true;
      if (/^- Page:\s+/i.test(s)) return true;
      if (/^- Title:\s+/i.test(s)) return true;
      if (/^- Selection Mode:\s+/i.test(s)) return true;
      if (/^- \*\*@element[0-9]+\*\*/i.test(s)) return true;
      if (/^- The user's intent may reference tags like /i.test(s)) return true;
      if (/^- Use the Reference Map above/i.test(s)) return true;
      if (/^- Apply changes ONLY to the referenced elements/i.test(s)) return true;
      if (/^- For WYSIWYG edits, apply the exact before→after changes shown/i.test(s)) return true;
      if (/^- Modify files directly; maintain code quality and accessibility/i.test(s)) return true;
      if (/^<details>$/i.test(s)) return true;
      if (/^<\/details>$/i.test(s)) return true;
      if (/^<summary>/.test(s)) return true;
      if (/^<\/summary>/.test(s)) return true;
      if (/^HTML$/.test(s)) return true;
      if (/^Styles$/.test(s)) return true;
      if (/^[{}]$/.test(s)) return true;
      if (/^\"[^"]+\":\s+/.test(s)) return true;
      if (/^[0-9,]+$/.test(s)) return true;
      if (/^```/.test(s)) return true;
      return false;
    } catch (_) {
      return false;
    }
  }

  function deriveChunksFromText(stdout = '', stderr = '') {
    const chunks = [];
    const pushLog = (stream, text) => {
      if (text && text.trim()) chunks.push({ type: 'log', stream, text: text.trim() });
    };
    const lines = (String(stderr || '') + '\n' + String(stdout || '')).split(/\r?\n/);
    let expectRunNext = false;
    let thinkingNext = false;
    lines.forEach((raw) => {
      const line = String(raw || '').replace(/\r$/, '');
      const t = line.trim();
      if (!t) return;
      if (isNoisyConsoleLine(t)) return;
      if (/^thinking$/i.test(t)) { thinkingNext = true; return; }
      if (/^exec$/i.test(t)) { expectRunNext = true; return; }
      {
        const diff = t.match(/^diff --git a\/(.+?) b\/(.+)/);
        if (diff && diff[2]) {
          chunks.push({ type: 'edit', file: diff[2].trim() });
          return;
        }
      }
      if (thinkingNext) {
        const m = t.match(/^\*\*(.+)\*\*$/);
        const text = (m && m[1]) ? m[1].trim() : t;
        thinkingNext = false;
        if (/^Preparing final message summary$/i.test(text)) return;
        chunks.push({ type: 'thinking', text });
        return;
      }
      if (expectRunNext) {
        chunks.push({ type: 'run', cmd: t });
        expectRunNext = false;
        return;
      }
      if (/^(bash\s+-lc\s+)/i.test(t)) { chunks.push({ type: 'run', cmd: t }); return; }
      // edit 事件仅在能识别出具体文件时生成；unknown 不进入用户可见 timeline
      if (/^(file update|apply_patch\()/i.test(t)) { return; }
      {
        const m = t.match(/^(M|A|D)\s+(.+)/);
        if (m) { chunks.push({ type: 'edit', file: m[2].trim() }); return; }
      }
      if (/^\*\*\* Begin Patch/.test(t)) { return; }
      pushLog('mixed', t);
    });
    return chunks;
  }

  class RestoreHelper {
    constructor() {
      this.savedScroll = { x: 0, y: 0 };
    }

    saveScroll() {
      this.savedScroll = { x: window.pageXOffset || 0, y: window.pageYOffset || 0 };
    }

    restoreScroll() {
      try { window.scrollTo(this.savedScroll.x, this.savedScroll.y); } catch (_) {}
    }

    restoreOriginalPage(wrapper, root, anchor) {
      console.log('[LUMI] restore step 1 ok');
      const body = document.body;
      if (wrapper) {
        const nodes = Array.from(wrapper.childNodes);
        nodes.forEach((node) => {
          if (anchor && anchor.parentNode) {
            anchor.parentNode.insertBefore(node, anchor);
          } else {
            body.appendChild(node);
          }
        });
      }
      console.log('[LUMI] restore step 2 ok');
      if (root) {
        try { root.remove(); console.log('[LUMI] restore step 3 ok'); } catch (_) {}
      }
      if (anchor) {
        try { anchor.remove(); console.log('[LUMI] restore step 4 ok'); } catch (_) {}
      }
      this.restoreScroll();
      console.log('[LUMI] restore step 5 ok (scroll restored)');
    }
  }

  const TOPBAR_HEIGHT = 56;
  const TOPBAR_MARGIN = 12;
  const SCALE_MIN = 0.25;
  const SCALE_MAX = 2;

  const PRESETS = {
    responsive: { width: 1280, height: 800 },
    mobile: { width: 428, height: 926 },   // iPhone 16 Pro Max
    pad: { width: 1024, height: 1366 },    // iPad Pro 12.9
    laptop: { width: 1280, height: 800 }   // MacBook Air
  };

  class ViewportController {
    constructor(eventBus, stateManager) {
      this.eventBus = eventBus;
      this.stateManager = stateManager;
      this.enabled = false;

      this.root = null;
      this.canvas = null;
      this.stageFrame = null;
      this.contentWrapper = null; // Actual DOM container (inline mode)
      this.anchor = null;
      this.iframe = null;

      this.stageMode = 'inline';
      this.stageFallback = 'none';

      this.restoreHelper = new RestoreHelper();
      this.htmlPrevStyle = null;
      this.bodyPrevStyle = null;
      this.stylesSaved = false;

      this._listeners = [];
      this._iframeFallbackTimer = null;
    }

    init() {
      this.eventBus.on('viewport:toggle', (enabled) => this.setEnabled(!!enabled));
      this.eventBus.on('viewport:preset', (name) => this.setPreset(name));
      this.eventBus.on('viewport:fit', (mode) => this.setFit(mode));
      this.eventBus.on('viewport:scale', (value) => this.setScale(value));
      this.eventBus.on('viewport:zoom', (value) => this.setZoom(value));
      this.eventBus.on('viewport:resize', (payload) => this.setLogical(payload));

      try {
        this.stateManager.subscribe('ui.viewport.mode', () => this.layout());
        this.stateManager.subscribe('ui.viewport.scale', () => this.layout());
        this.stateManager.subscribe('ui.viewport.logical', () => this.layout());
        this.stateManager.subscribe('ui.dockWidth', () => this.layout());
        this.stateManager.subscribe('ui.dockOpen', () => this.layout());
        this.stateManager.subscribe('ui.viewport.useIframeStage', () => {
          if (!this.enabled) return;
          this.applyStageMode(true);
        });
      } catch (_) {}
    }

    getStageInfo() {
      return {
        mode: this.stageMode,
        fallback: this.stageFallback,
        enabled: this.enabled
      };
    }

    setEnabled(enabled) {
      if (this.enabled === enabled) return;
      this.stateManager.set('ui.viewport.enabled', enabled);
      if (enabled) {
        this.enable();
      } else {
        this.disable();
      }
    }

    enable() {
      if (this.enabled) return;
      this.enabled = true;
      this.restoreHelper.saveScroll();
      this.saveInlineStyles();
      this.mountViewport();
      this.registerListeners();
      this.applyStageMode(true);
      this.layout();
    }

    disable() {
      if (!this.enabled) return;
      this.enabled = false;
      this.unregisterListeners();

      const wrapper = this.contentWrapper;
      const root = this.root;
      const anchor = this.anchor;

      this.teardownIframe();
      this.contentWrapper = null;
      this.stageFrame = null;
      this.canvas = null;
      this.root = null;
      this.anchor = null;
      this.stageMode = 'inline';
      this.stageFallback = 'none';

      this.restoreHelper.restoreOriginalPage(wrapper, root, anchor);
      this.restoreInlineStyles();
    }

    saveInlineStyles() {
      if (this.stylesSaved) return;
      const html = document.documentElement;
      const body = document.body;
      this.htmlPrevStyle = html.getAttribute('style');
      this.bodyPrevStyle = body.getAttribute('style');
      this.stylesSaved = true;
    }

    restoreInlineStyles() {
      if (!this.stylesSaved) return;
      const html = document.documentElement;
      const body = document.body;
      if (this.htmlPrevStyle === null) html.removeAttribute('style'); else html.setAttribute('style', this.htmlPrevStyle);
      if (this.bodyPrevStyle === null) body.removeAttribute('style'); else body.setAttribute('style', this.bodyPrevStyle);
      this.stylesSaved = false;
    }

    mountViewport() {
      if (this.root) return;
      const body = document.body;

      const anchor = document.createElement('div');
      anchor.id = 'lumi-viewport-anchor';
      anchor.style.cssText = 'display:none!important;';
      body.insertBefore(anchor, body.firstChild);
      this.anchor = anchor;

      const root = document.createElement('div');
      root.id = 'lumi-viewport-root';
      body.appendChild(root);

      const canvas = document.createElement('div');
      canvas.id = 'lumi-viewport-canvas';
      canvas.style.cssText = 'position:absolute; inset:0; overflow:auto; pointer-events:auto;';
      root.appendChild(canvas);

      const stageFrame = document.createElement('div');
      stageFrame.id = 'lumi-viewport-stage';
      stageFrame.style.cssText = 'position:absolute; top:0; left:0; transform-origin: top left;';
      canvas.appendChild(stageFrame);

      const inlineWrapper = document.createElement('div');
      inlineWrapper.id = 'lumi-viewport-inline';
      inlineWrapper.style.cssText = 'position:relative; width:100%; height:100%;';
      stageFrame.appendChild(inlineWrapper);

      this.root = root;
      this.canvas = canvas;
      this.stageFrame = stageFrame;
      this.contentWrapper = inlineWrapper;

      this.wrapDom();
    }

    wrapDom() {
      if (!this.contentWrapper) return;
      const body = document.body;
      let child = body.firstChild;
      while (child) {
        const next = child.nextSibling;
        if (this.shouldMoveNode(child)) {
          this.contentWrapper.appendChild(child);
        }
        child = next;
      }
    }

    shouldMoveNode(node) {
      if (!node) return false;
      if (node === this.anchor) return false;
      if (node.id && node.id.startsWith('lumi-')) return false;
      if (node.nodeType === Node.COMMENT_NODE) return false;
      return true;
    }

    registerListeners() {
      this.unregisterListeners();
      this._listeners = [];
      const add = (target, event, handler, options) => {
        if (!target || !handler) return;
        target.addEventListener(event, handler, options);
        this._listeners.push(() => target.removeEventListener(event, handler, options));
      };

      this._onResize = () => this.layout();
      add(window, 'resize', this._onResize, { passive: true });

      this._onCanvasScroll = () => this.eventBus.emit('viewport:scrolled');
      add(this.canvas, 'scroll', this._onCanvasScroll, { passive: true });

      this._onWheel = (e) => {
        if (!this.canvas) return;
        if (e.ctrlKey) {
          const current = this.stateManager.get('ui.viewport.scale') || 1;
          const factor = Math.exp(-e.deltaY * 0.002);
          const next = Math.min(SCALE_MAX, Math.max(SCALE_MIN, current * factor));
          const rect = this.canvas.getBoundingClientRect();
          const cx = e.clientX - rect.left + this.canvas.scrollLeft;
          const cy = e.clientY - rect.top + this.canvas.scrollTop;
          const contentX = cx / current;
          const contentY = cy / current;
          this.setZoom(next);
          const nx = contentX * next;
          const ny = contentY * next;
          this.canvas.scrollLeft = Math.max(0, nx - (e.clientX - rect.left));
          this.canvas.scrollTop = Math.max(0, ny - (e.clientY - rect.top));
          e.preventDefault();
        } else if (e.shiftKey) {
          this.canvas.scrollLeft += e.deltaY;
          e.preventDefault();
        }
      };
      add(this.canvas, 'wheel', this._onWheel, { passive: false });

      this._dragging = false;
      this._dragLast = { x: 0, y: 0 };

      this._onPointerDown = (e) => {
        if (e.button !== 0 || !e.isPrimary) return;
        if (this.isSpacePressed()) {
          this._dragging = true;
          this._dragLast = { x: e.clientX, y: e.clientY };
          this.canvas.style.cursor = 'grabbing';
          e.preventDefault();
        }
      };
      this._onPointerMove = (e) => {
        if (!this._dragging) return;
        const dx = e.clientX - this._dragLast.x;
        const dy = e.clientY - this._dragLast.y;
        this._dragLast = { x: e.clientX, y: e.clientY };
        this.canvas.scrollLeft -= dx;
        this.canvas.scrollTop -= dy;
      };
      this._onPointerUp = () => {
        if (!this._dragging) return;
        this._dragging = false;
        this.canvas.style.cursor = '';
      };
      add(this.canvas, 'pointerdown', this._onPointerDown, { passive: false });
      add(window, 'pointermove', this._onPointerMove, { passive: true });
      add(window, 'pointerup', this._onPointerUp, { passive: true });
    }

    unregisterListeners() {
      if (!this._listeners) return;
      this._listeners.forEach((dispose) => {
        try { dispose(); } catch (_) {}
      });
      this._listeners = [];
      this._dragging = false;
      if (this.canvas) this.canvas.style.cursor = '';
    }

    applyStageMode(force = false) {
      const useIframe = !!this.stateManager.get('ui.viewport.useIframeStage');
      const desired = useIframe ? 'iframe' : 'inline';
      if (!force && desired === this.stageMode && (desired !== 'iframe' || this.stageFallback === 'none')) return;
      if (desired === 'iframe') {
        this.mountIframeStage();
      } else {
        this.mountInlineStage();
      }
    }

    mountInlineStage(fallback = 'none') {
      this.stageMode = 'inline';
      this.stageFallback = fallback;
      this.teardownIframe();
      if (this.contentWrapper) this.contentWrapper.style.display = 'block';
    }

    mountIframeStage() {
      if (!this.stageFrame) return;
      if (!this.contentWrapper) return;
      this.contentWrapper.style.display = 'none';
      this.teardownIframe();
      if (this._iframeFallbackTimer) {
        clearTimeout(this._iframeFallbackTimer);
        this._iframeFallbackTimer = null;
      }

      const iframe = document.createElement('iframe');
      iframe.id = 'lumi-viewport-iframe';
      iframe.name = 'lumi-viewport-iframe';
      iframe.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; border:0; background:#fff;';
      iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms allow-pointer-lock');
      this.stageFrame.appendChild(iframe);
      this.iframe = iframe;
      this.stageMode = 'iframe';
      this.stageFallback = 'pending';
      console.log('[LUMI] mounting iframe stage...');

      // Show a lightweight loader overlay for smoothness
      const loader = document.createElement('div');
      loader.id = 'lumi-viewport-loading';
      loader.style.cssText = 'position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none;';
      const spinner = document.createElement('div');
      spinner.style.cssText = 'width:20px;height:20px;border-radius:10px;border:2px solid rgba(0,0,0,0.15);border-top-color: rgba(0,0,0,0.45);animation: lumi-spin 0.8s linear infinite;';
      loader.appendChild(spinner);
      const style = document.createElement('style');
      style.textContent = '@keyframes lumi-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}';
      loader.appendChild(style);
      this.stageFrame.appendChild(loader);

      this._iframeFallbackTimer = setTimeout(() => this.handleIframeFallback('timeout'), 2000);
      iframe.addEventListener('load', () => {
        if (!iframe.contentWindow || !iframe.contentDocument) {
          this.handleIframeFallback('noContentWindow');
          return;
        }
        if (this._iframeFallbackTimer) {
          clearTimeout(this._iframeFallbackTimer);
          this._iframeFallbackTimer = null;
        }
        this.stageFallback = 'none';
        console.log('[LUMI] iframe load ok');
        try { loader.remove(); } catch (_) {}
        // Emit ready event to allow outer code to bind selectors/highlights inside the frame
        try { this.eventBus.emit('viewport:iframe-ready', { iframe }); } catch (_) {}
      }, { once: true });

      try {
        iframe.src = this.buildIframeSrc(window.location.href);
      } catch (error) {
        if (this._iframeFallbackTimer) {
          clearTimeout(this._iframeFallbackTimer);
          this._iframeFallbackTimer = null;
        }
        this.handleIframeFallback('exception');
      }
    }

    buildIframeSrc(href) {
      try {
        const url = new URL(href);
        // Tag the URL so our content script can detect and avoid bootstrapping inside the stage
        url.searchParams.set('_lumi_vp', '1');
        return url.toString();
      } catch (_) {
        // Fallback: append a marker safely
        if (href.includes('?')) return href + '&_lumi_vp=1';
        if (href.includes('#')) return href.replace('#', '?_lumi_vp=1#');
        return href + '?_lumi_vp=1';
      }
    }

    teardownIframe() {
      if (!this.iframe) return;
      try { this.iframe.remove(); } catch (_) {}
      this.iframe = null;
      if (this._iframeFallbackTimer) {
        clearTimeout(this._iframeFallbackTimer);
        this._iframeFallbackTimer = null;
      }
    }

    handleIframeFallback(reason) {
      if (this.stageMode !== 'iframe') return;
      if (this._iframeFallbackTimer) {
        clearTimeout(this._iframeFallbackTimer);
        this._iframeFallbackTimer = null;
      }
      console.warn(`[LUMI] iframe blocked -> fallback to inline (reason: ${reason})`);
      try { this.eventBus.emit('viewport:iframe-fallback', { reason }); } catch (_) {}
      this.mountInlineStage(reason);
    }

    setPreset(name) {
      const key = PRESETS[name] ? name : 'responsive';
      const logical = PRESETS[key];
      this.stateManager.batch({
        'ui.viewport.preset': key,
        'ui.viewport.logical': logical
      });
      this.layout();
    }

    setFit(mode) {
      const m = mode || 'width';
      this.stateManager.set('ui.viewport.fit', m);
      const dockWidth = this.stateManager.get('ui.dockWidth') || 420;
      const hasBar = this.stateManager.get('ui.dockOpen') !== false;
      const topOffset = hasBar ? (TOPBAR_HEIGHT + TOPBAR_MARGIN) : 0;
      const availW = Math.max(320, window.innerWidth - dockWidth);
      const availH = Math.max(320, window.innerHeight - topOffset);
      const logical = this.stateManager.get('ui.viewport.logical') || { width: 1280, height: 800 };
      let fitScale = availW / Math.max(1, logical.width);
      if (m === 'screen') fitScale = Math.min(fitScale, availH / Math.max(1, logical.height));
      fitScale = Math.min(1, Math.max(SCALE_MIN, fitScale));
      this.stateManager.batch({ 'ui.viewport.scale': fitScale, 'ui.viewport.auto': true });
      console.log(`[LUMI] fit=${m} auto=true available=${availW}x${availH} logical=${logical.width}x${logical.height} scale=${fitScale.toFixed(3)}`);
      this.layout();
    }

    setScale(value) {
      const v = Math.max(SCALE_MIN, Math.min(SCALE_MAX, Number(value) || 1));
      this.stateManager.batch({ 'ui.viewport.scale': v, 'ui.viewport.auto': false });
      this.layout();
    }

    setLogical({ width, height }) {
      const w = Math.max(200, Number(width) || 1280);
      const h = Math.max(200, Number(height) || 800);
      this.stateManager.batch({ 'ui.viewport.logical': { width: w, height: h }, 'ui.viewport.auto': true });
      this.layout();
    }

    setZoom(value) {
      if (value === 'auto' || value === 'fit') {
        this.stateManager.set('ui.viewport.auto', true);
        this.recomputeScale();
        this.layout();
        return;
      }
      const v = Math.max(SCALE_MIN, Math.min(SCALE_MAX, Number(value) || 1));
      this.stateManager.batch({ 'ui.viewport.scale': v, 'ui.viewport.auto': false });
      this.layout();
    }

    recomputeScale() {
      if (!this.enabled) return;
      const auto = !!this.stateManager.get('ui.viewport.auto');
      if (!auto) return;
      try {
        const dockWidth = this.stateManager.get('ui.dockWidth') || 420;
        const hasBar = this.stateManager.get('ui.dockOpen') !== false;
        const topOffset = hasBar ? (TOPBAR_HEIGHT + TOPBAR_MARGIN) : 0;
        const availW = Math.max(320, window.innerWidth - dockWidth);
        const availH = Math.max(320, window.innerHeight - topOffset);
        const logical = this.stateManager.get('ui.viewport.logical') || { width: 1280, height: 800 };
        const fit = this.stateManager.get('ui.viewport.fit') || 'width';
        const scale = this.computeScale(availW, availH, logical, fit);
        this.stateManager.set('ui.viewport.scale', scale);
        console.log(`[LUMI] fit=${fit} auto=true available=${availW}x${availH} logical=${logical.width}x${logical.height} scale=${scale.toFixed(3)}`);
      } catch (error) {
        console.warn('[LUMI] recomputeScale failed', error);
      }
    }

    computeScale(availW, availH, logical, fit) {
      const W = Math.max(1, Number(logical?.width) || 1280);
      const H = Math.max(1, Number(logical?.height) || 800);
      if (fit === 'screen') return Math.min(availW / W, availH / H);
      return availW / W;
    }

    layout() {
      this.recomputeScale();
      if (!this.canvas || !this.stageFrame || !this.contentWrapper) return;
      const dockWidth = this.stateManager.get('ui.dockWidth') || 420;
      const align = this.stateManager.get('ui.viewport.mode') || 'center';
      const hasBar = this.stateManager.get('ui.dockOpen') !== false;
      const scale = this.stateManager.get('ui.viewport.scale') || 1;
      const logical = this.stateManager.get('ui.viewport.logical') || { width: 1280, height: 800 };

      const topOffset = hasBar ? (TOPBAR_HEIGHT + TOPBAR_MARGIN) : 0;
      this.root.style.cssText = `position: fixed; left: 0; right: ${dockWidth}px; top: ${topOffset}px; bottom: 0; z-index: 2147483643;`;
      this.canvas.style.cssText = 'position:absolute; inset:0; overflow:auto; pointer-events:auto;';

      this.stageFrame.style.position = 'absolute';
      this.stageFrame.style.width = logical.width + 'px';
      this.stageFrame.style.height = logical.height + 'px';
      this.stageFrame.style.transformOrigin = 'top left';
      this.stageFrame.style.transform = `scale(${scale})`;
      this.stageFrame.style.transition = 'transform 0.12s ease, left 0.12s ease';

      const canvasRect = this.canvas.getBoundingClientRect();
      const canvasWidth = Math.max(0, canvasRect.width);
      const scaledW = Math.round(logical.width * scale);
      const leftOffset = align === 'center' && scaledW <= canvasWidth ? Math.max(0, Math.floor((canvasWidth - scaledW) / 2)) : 0;
      this.stageFrame.style.left = leftOffset + 'px';
      this.stageFrame.style.top = '0px';

      const scaledH = Math.round(Math.max(1, logical.height) * scale);
      this.ensureSpacer(scaledW, scaledH);
    }

    ensureSpacer(width, height) {
      if (!this.canvas) return;
      let spacer = this.canvas.querySelector('#lumi-viewport-spacer');
      if (!spacer) {
        spacer = document.createElement('div');
        spacer.id = 'lumi-viewport-spacer';
        spacer.style.position = 'absolute';
        spacer.style.zIndex = '-1';
        this.canvas.appendChild(spacer);
      }
      spacer.style.width = width + 'px';
      spacer.style.height = height + 'px';
    }

    isSpacePressed() {
      try { return window.__lumiSpacePressed === true; } catch (error) { return false; }
    }
  }

  // TopViewportBar - scaffolding (M0)
  // Minimal, hidden by default; will render simple controls in M1.

  class TopViewportBar {
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
        .bar { position: relative; height: 56px; display: flex; align-items: center; gap: 10px; padding: 0 16px;
          background: var(--dock-bg);
          border-bottom: 1px solid var(--dock-stroke);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: var(--dock-fg);
        }
        select, input { font-size: 12px; border: 1px solid var(--dock-stroke); border-radius: 8px; background: var(--surface, color-mix(in srgb, var(--dock-bg) 96%, transparent)); color: var(--dock-fg); padding: 4px 8px; }
        .btn { height: 32px; padding: 0 10px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid transparent; border-radius: 10px; background: transparent; color: var(--dock-fg); opacity: 0.7; cursor: pointer; }
        .btn:hover { opacity: 1; border-color: var(--dock-stroke); }
        .btn:active { transform: scale(0.98); }
        .spacer { flex: 1; }
        .field { display: inline-flex; align-items: center; gap: 6px; }
        .dim { width: 72px; }
        .label { color: var(--dock-fg); opacity: 0.65; }
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
      try { this.stateManager.subscribe('ui.dockWidth', (w) => { if (this.host) this.host.style.right = (w || 420) + 'px'; }); } catch (_) {}
      try { this.host.style.right = (this.stateManager.get('ui.dockWidth') || 420) + 'px'; } catch (_) {}
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
      try { this.stateManager.subscribe('ui.viewport.scale', reflectZoom); } catch (_) {}
      try { this.stateManager.subscribe('ui.viewport.auto', reflectZoom); } catch (_) {}
      // No explicit reflow toggle; iframe stage is default
      const syncDims = () => {
        const logical = this.stateManager.get('ui.viewport.logical') || { width: 1440 };
        if (w) w.value = String(logical.width);
      };
      try { this.stateManager.subscribe('ui.viewport.logical', syncDims); } catch (_) {}
      syncDims();

      // Only Responsive allows editing width
      const syncPreset = () => {
        const p = this.stateManager.get('ui.viewport.preset') || 'responsive';
        if (w) w.disabled = p !== 'responsive';
        if (preset) preset.value = p;
      };
      try { this.stateManager.subscribe('ui.viewport.preset', syncPreset); } catch (_) {}
      syncPreset();
    }
  }

  /**
   * LUMI Content Script v3.1 - Modular Architecture
   * Main orchestrator for all modules
   */

  // Anti-recursive guard: if inside a LUMI viewport iframe, skip bootstrapping
  let __LUMI_SKIP_BOOTSTRAP__ = false;
  try {
    const url = new URL(window.location.href);
    __LUMI_SKIP_BOOTSTRAP__ = url.searchParams.has('_lumi_vp') || window.name === 'lumi-viewport-iframe';
    if (__LUMI_SKIP_BOOTSTRAP__) {
      try { window.LUMI_INJECTED = true; } catch (_) {}
      console.info('[LUMI] Skipping bootstrap inside viewport iframe');
    }
  } catch (_) {}

  console.info('[LUMI] host', window.location.host, 'inject=true');
  if (__LUMI_SKIP_BOOTSTRAP__) ; else if (window.LUMI_INJECTED) {
    console.warn('[LUMI] Content script already injected, skipping bootstrap');
  } else {
    window.LUMI_INJECTED = true;
    bootstrap();
  }

  function bootstrap() {
    // Initialize core systems
    const eventBus = new EventBus();
    const stateManager = new StateManager(eventBus);
    const chromeBridge = new ChromeBridge(eventBus);
    const serverClient = new ServerClient(chromeBridge);

    // Expose for DevTools-driven experiments in M1 (no UI yet)
    try {
      window.__lumiEventBus = eventBus;
      // Debug flag: _lumi_debug=1 or localStorage LUMI_DEBUG=1
      (function(){
        try {
          const u = new URL(window.location.href);
          if (u.searchParams.get('_lumi_debug') === '1') window.__LUMI_DEBUG = true;
          if (localStorage.getItem('LUMI_DEBUG') === '1') window.__LUMI_DEBUG = true;
        } catch (_) {}
      })();
    } catch (_) {}

    // If the script is accidentally loaded in page context (no runtime), bail out early
    if (!chromeBridge.isRuntimeAvailable()) {
      console.warn('[LUMI] Chrome runtime not available in this context; skipping init');
      return;
    }

    // Initialize UI
    // TopBanner removed; provide no-op API to keep calls harmless
    const topBanner = { update: () => {}, hide: () => {}, setRightOffset: () => {} };
    let dockRoot = null;
    let editModal = null;
    // InteractionBubble removed for a simpler UX
    const styleApplier = new StyleApplier(eventBus);
    const styleHistory = new StyleHistory();

    // Initialize selection helpers (instantiated after UI mounts)
    const highlightManager = new HighlightManager(eventBus);
    let highlightManagerFrame = null;
    let elementSelector = null;
    let elementSelectorFrame = null;
    let screenshotSelector = null;
    let pendingElementMode = false;

    // Initialize engine & health
    const engineManager = new EngineManager(eventBus, stateManager, chromeBridge);
    const healthChecker = new HealthChecker(eventBus, stateManager, chromeBridge, engineManager);
    const activeStreams = new Map();
    const pendingStreamResults = new Map();

    // Viewport scaffolding (reflow toggle supported)
    const viewportController = new ViewportController(eventBus, stateManager);
    viewportController.init();
    const viewportBar = new TopViewportBar(eventBus, stateManager);
    stateManager.set('ui.viewport.useIframeStage', false);

    ensureDefaultSession();

    function ensureDefaultSession() {
      const sessions = stateManager.get('sessions.list') || [];
      if (!Array.isArray(sessions) || sessions.length === 0) {
        const id = generateSessionId();
        const session = {
          id,
          title: 'New Session',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          msgCount: 0,
          lastAppliedOk: false,
          transcript: [],
          snapshotTokens: [],
          manualTitle: false
        };
        stateManager.batch({
          'sessions.list': [session],
          'sessions.currentId': id
        });
        return;
      }

      const currentId = stateManager.get('sessions.currentId');
      if (!currentId) {
        stateManager.set('sessions.currentId', sessions[0].id);
      }
    }

    function generateSessionId() {
      return 's' + Math.random().toString(36).slice(2);
    }

    function selectionToTokens() {
      const elements = stateManager.get('selection.elements') || [];
      return elements.map((item, idx) => {
        const el = item.element;
        const base = el.id || item.selector || `el-${idx}`;
        return {
          id: base,
          label: '@' + readableElementName(el),
          selector: item.selector
        };
      });
    }

    function updateSessionById(id, mutator) {
      const list = (stateManager.get('sessions.list') || []).map(session => {
        if (session.id !== id) return session;
        const updated = {
          ...session,
          transcript: Array.isArray(session.transcript) ? session.transcript.slice() : [],
          snapshotTokens: Array.isArray(session.snapshotTokens) ? session.snapshotTokens.slice() : []
        };
        mutator(updated);
        updated.msgCount = updated.transcript.length;
        return updated;
      });
      stateManager.set('sessions.list', list);
    }

    function appendMessage(sessionId, message) {
      const msg = { ...message };
      if (!msg.id) msg.id = 'm' + Math.random().toString(36).slice(2);
      updateSessionById(sessionId, (session) => {
        session.transcript.push({ ...msg, timestamp: msg.timestamp || Date.now() });
        session.updatedAt = Date.now();
        // Auto-generate title from first user message (first 20 chars)
        if (msg.role === 'user' && session.transcript.length === 1 && msg.text) {
          const text = msg.text.trim();
          session.title = text.length > 20 ? text.slice(0, 20) + '...' : text;
          session.manualTitle = false;
        }
        if (msg.role === 'assistant' && typeof msg.applied === 'boolean') {
          session.lastAppliedOk = !!msg.applied;
        }
      });
      // Persist after each message append
      persistSessions();
      return msg.id;
    }

    function updateMessage(sessionId, messageId, mutator) {
      const list = (stateManager.get('sessions.list') || []).map(session => {
        if (session.id !== sessionId) return session;
        const updated = {
          ...session,
          transcript: Array.isArray(session.transcript) ? session.transcript.map(m => ({ ...m })) : []
        };
        const idx = updated.transcript.findIndex(m => m && m.id === messageId);
        if (idx >= 0) {
          const m = { ...updated.transcript[idx] };
          try { mutator(m); } catch (_) {}
          applyAutoSummary(m);
          updated.transcript[idx] = m;
          updated.updatedAt = Date.now();
        }
        return updated;
      });
      stateManager.set('sessions.list', list);
      persistSessions();
    }

    function applyAutoSummary(msg) {
      try {
        if (msg.role !== 'assistant') return;
        const chunks = Array.isArray(msg.chunks) ? msg.chunks : [];
        const resultChunk = chunks.find((c) => c && c.type === 'result' && (c.resultSummary || c.text));
        const editChunks = chunks.filter((c) => c && c.type === 'edit' && c.file);
        const runChunk = chunks.find((c) => c && c.type === 'run' && c.cmd);

        const summary = msg?.result?.summary;
        const summaryTitle = typeof summary === 'string' ? summary : summary?.title;
        const summaryDescription = typeof summary === 'string' ? '' : summary?.description;

        let title = msg?.result?.title || summaryTitle || '';
        if (!title) {
          if (resultChunk?.resultSummary) title = resultChunk.resultSummary;
          else if (editChunks.length === 1) title = `Edited ${editChunks[0].file}`;
          else if (editChunks.length > 1) title = `Edited ${editChunks[0].file} and ${editChunks.length - 1} more`;
          else if (runChunk?.cmd) title = `Ran ${runChunk.cmd}`;
        }

        let description = msg?.result?.description || summaryDescription || '';
        if (!description) {
          if (resultChunk?.text) description = resultChunk.text;
          else if (editChunks.length) description = `Updated ${editChunks.length} file${editChunks.length > 1 ? 's' : ''}.`;
          else if (runChunk?.cmd) description = `Executed ${runChunk.cmd}.`;
        }

        if (!msg.result) msg.result = {};
        if (title) msg.result.title = title;
        if (description) msg.result.description = description;
      } catch (_) {
        // ignore auto summary errors
      }
    }

    function applyResultToMessage(msg, result = {}) {
      msg.streaming = false;
      msg.done = true;
      msg.applied = !!result.success;

      if (result && result.turnSummary) {
        msg.turnSummary = result.turnSummary;
      }
      if (Array.isArray(result?.timelineEntries)) {
        msg.timelineEntries = result.timelineEntries;
      }

      if (result && result.lumiResult) {
        msg.result = result.lumiResult;
      } else if (typeof result?.output === 'string' && result.output.trim()) {
        msg.text = result.output.trim();
      } else if (typeof result?.message === 'string' && result.message.trim()) {
        msg.text = result.message.trim();
      } else if (typeof result?.error === 'string' && result.error.trim()) {
        msg.text = result.error.trim();
      } else if (!msg.text) {
        msg.text = result.success ? 'Done' : (result.error || 'Request failed');
      }

      if (Array.isArray(result?.chunks) && result.chunks.length) {
        msg.chunks = result.chunks.slice();
      } else if (!Array.isArray(msg.chunks) || msg.chunks.length === 0) {
        try {
          const fallbackChunks = deriveChunksFromText(result.output || '', result.stderr || '');
          if (Array.isArray(fallbackChunks) && fallbackChunks.length) {
            msg.chunks = fallbackChunks;
          }
        } catch (_) {
          // ignore fallback errors
        }
      }

      if (msg.turnSummary) {
        if (!msg.result) msg.result = {};
        if (!msg.result.title && msg.turnSummary.title) {
          msg.result.title = msg.turnSummary.title;
        }
        if (!msg.result.description) {
          const bullet = Array.isArray(msg.turnSummary.bullets) && msg.turnSummary.bullets.length
            ? msg.turnSummary.bullets[0]
            : null;
          if (bullet) msg.result.description = bullet;
        }
      }
    }

    function handleStreamChunk(payload = {}) {
      const { streamId, chunk } = payload;
      if (!streamId || !chunk) return;
      const meta = activeStreams.get(streamId);
      if (!meta) return;
      const { sessionId, messageId } = meta;
      updateMessage(sessionId, messageId, (msg) => {
        if (!Array.isArray(msg.chunks)) msg.chunks = [];
        msg.chunks.push(chunk);
        msg.streaming = true;
        msg.done = false;
        if (chunk.type === 'result') {
          if (!msg.result) msg.result = {};
          if (chunk.resultSummary && !msg.result.title) msg.result.title = chunk.resultSummary;
          if (chunk.text && !msg.result.description) msg.result.description = chunk.text;
        }
      });
    }

    function handleStreamDone(payload = {}) {
      const { streamId, result = {} } = payload;
      const meta = activeStreams.get(streamId);
      if (meta) {
        const { sessionId, messageId } = meta;
        updateMessage(sessionId, messageId, (msg) => {
          applyResultToMessage(msg, result || {});
        });
        activeStreams.delete(streamId);
      }
      const pending = pendingStreamResults.get(streamId);
      if (pending) {
        pending.resolve(result || {});
        pendingStreamResults.delete(streamId);
      }
    }

    function handleStreamError(payload = {}) {
      const { streamId, error } = payload;
      const meta = activeStreams.get(streamId);
      if (meta) {
        const { sessionId, messageId } = meta;
        updateMessage(sessionId, messageId, (msg) => {
          msg.streaming = false;
          msg.done = true;
          msg.applied = false;
          msg.text = error || 'Stream failed';
        });
      }
      const pending = pendingStreamResults.get(streamId);
      if (pending) {
        // Keep stream promise unresolved until done arrives unless we have no meta.
        if (!meta) {
          pending.reject(new Error(error || 'Stream failed'));
          pendingStreamResults.delete(streamId);
        }
      }
    }

    // Inject global styles
    function injectGlobalStyles() {
      const s1 = document.createElement('style');
      s1.textContent = TOKENS_CSS;
      document.head.appendChild(s1);
      const s2 = document.createElement('style');
      s2.textContent = GLOBAL_STYLES;
      document.head.appendChild(s2);
    }

    // Event bindings
    function bindEvents() {
      // Helper: setup selection/highlights inside viewport iframe (kept local to avoid scope issues)
      function setupIframeSelectionLocal(iframe) {
        if (!iframe || !iframe.contentDocument || !iframe.contentWindow) return;
        // Clean previous
        if (highlightManagerFrame) {
          try { highlightManagerFrame.clearAll(); } catch (_) {}
        }
        // Inject tokens/global styles for consistent visuals/cursors inside the frame
        try {
          const head = iframe.contentDocument.head || iframe.contentDocument.documentElement;
          const s1 = iframe.contentDocument.createElement('style');
          s1.textContent = TOKENS_CSS;
          head.appendChild(s1);
          const s2 = iframe.contentDocument.createElement('style');
          s2.textContent = GLOBAL_STYLES;
          head.appendChild(s2);
        } catch (_) {}
        highlightManagerFrame = new HighlightManager(eventBus, iframe.contentDocument, iframe.contentWindow);
        elementSelectorFrame = new ElementSelector(eventBus, stateManager, highlightManagerFrame, topBanner, iframe.contentDocument, iframe.contentWindow);
        // Activate correct selector depending on mode
        const mode = stateManager.get('ui.mode');
        if (mode === 'element' || pendingElementMode) {
          pendingElementMode = false;
          try { elementSelector.deactivate(); } catch (_) {}
          try { elementSelectorFrame.activate(); } catch (_) {}
        }
        // Rebind highlights into the active document to avoid duplicates/drift
        rebindHighlightsToActive();
      }

      function rebindHighlightsToActive() {
        const elements = stateManager.get('selection.elements') || [];
        try { highlightManager.clearAllSelections(); } catch (_) {}
        try { highlightManagerFrame && highlightManagerFrame.clearAllSelections(); } catch (_) {}
        const useIframe = !!stateManager.get('ui.viewport.useIframeStage');
        const mgr = (useIframe && highlightManagerFrame) ? highlightManagerFrame : highlightManager;
        elements.forEach((item, idx) => { try { mgr.addSelection(item.element, idx); } catch (_) {} });
      }
      function summarizeChanges(changes) {
        try {
          const keys = Object.keys(changes || {});
          if (!keys.length) return 'Edited';
          return keys.slice(0, 6).join(', ');
        } catch (_) {
          return 'Edited';
        }
      }
      function refreshElementHighlights() {
        const useIframe = !!stateManager.get('ui.viewport.useIframeStage');
        try { highlightManager.clearAllSelections(); } catch (_) {}
        try { highlightManagerFrame && highlightManagerFrame.clearAllSelections(); } catch (_) {}
        const mgr = (useIframe && highlightManagerFrame) ? highlightManagerFrame : highlightManager;
        const elements = stateManager.get('selection.elements') || [];
        elements.forEach((item, idx) => { try { mgr.addSelection(item.element, idx); } catch (_) {} });
      }

      // Selection events
      eventBus.on('element:selected', (item) => {
        const elements = stateManager.get('selection.elements') || [];
        const index = elements.findIndex((e) => e && e.element === item.element);
        if (dockRoot && index >= 0) {
          // Prefer moving existing chip to caret; otherwise insert once
          const moved = dockRoot.moveChipToCaret(index);
          if (!moved) {
            dockRoot.insertChipForElement(elements[index], index);
          }
          // Ensure chips are fully synced regardless of caret state
          try { dockRoot.renderChips(stateManager.get('selection.elements') || []); } catch (_) {}
          try { dockRoot.updateSendState(); } catch (_) {}
        }
        // no-op (bubble removed)
        stateManager.set('ui.dockState', 'normal');
        // Do not insert plain-text tokens into Dock input; chips reflect selection state.
      });

      // Legacy 'element:remove' handler removed (Bubble deprecated)

      // Revert DOM to baseline when chip/tag is removed
      eventBus.on('element:pre-remove', ({ index, snapshot }) => {
        try {
          if (!snapshot || !snapshot.element) return;
          const el = snapshot.element;
          // 1) Revert edited properties tracked in wysiwyg.edits for this index
          const edits = stateManager.get('wysiwyg.edits') || [];
          const entry = edits.find(e => e && e.index === index);
          if (entry && entry.changes) {
            Object.keys(entry.changes).forEach((prop) => {
              if (prop === 'text') return; // handled by baseline
              // If baseline provides a value, restore it; else remove inline style
              const base = snapshot.baseline && snapshot.baseline.inline ? snapshot.baseline.inline[prop] : undefined;
              if (base === undefined || base === null || base === '') {
                try { el.style[prop] = ''; } catch (_) {}
              } else {
                try { el.style[prop] = base; } catch (_) {}
              }
            });
          }
          // 2) Restore text content only for leaf nodes with a string baseline
          if (snapshot.baseline && typeof snapshot.baseline.text === 'string') {
            try { el.textContent = snapshot.baseline.text; } catch (_) {}
          }
          // 3) Restore key inline properties from baseline to guarantee full reset
          const baseInline = (snapshot.baseline && snapshot.baseline.inline) || {};
          Object.entries(baseInline).forEach(([prop, value]) => {
            try { el.style[prop] = value || ''; } catch (_) {}
          });
        } catch (_) { /* ignore */ }
      });

      eventBus.on('element:removed', (removedIndex) => {
        // Reindex or drop edits tied to the removed element
        const edits = (stateManager.get('wysiwyg.edits') || []).slice();
        const adjusted = [];
        edits.forEach((e) => {
          if (typeof e.index !== 'number') return;
          if (e.index === removedIndex) return; // drop
          if (e.index > removedIndex) {
            adjusted.push({ ...e, index: e.index - 1 });
          } else {
            adjusted.push(e);
          }
        });
        const hasDiffs = adjusted.length > 0;
        stateManager.batch({
          'wysiwyg.edits': adjusted,
          'wysiwyg.hasDiffs': hasDiffs
        });
        // Also clear the edited flag on remaining selection items to avoid stale flags
        const elements = stateManager.get('selection.elements') || [];
        elements.forEach((item, idx) => {
          item.edited = adjusted.some(e => e.index === idx);
          if (!item.edited) delete item.diffSummary;
        });
        stateManager.set('selection.elements', elements, true);
        if (dockRoot) {
          dockRoot.removeChipForElement(removedIndex);
          dockRoot.renderChips(elements);
          dockRoot.updateSendState();
        }
        // no-op (bubble removed)
        stateManager.set('ui.dockState', 'normal');
        refreshElementHighlights();
        if (!elements.length && editModal) {
          editModal.close();
          // no-op (bubble removed)
        }
      });

      eventBus.on('selection:clear', () => {
        try { highlightManager.clearAll(); } catch (_) {}
        try { highlightManagerFrame && highlightManagerFrame.clearAll(); } catch (_) {}
        if (dockRoot) {
          dockRoot.clearChips();
          dockRoot.updateSendState();
        }
        if (editModal) editModal.close();
        // no-op (bubble removed)
        stateManager.set('ui.dockState', 'normal');
      });

      eventBus.on('screenshot:captured', () => {
        if (dockRoot) {
          try { dockRoot.renderChips(stateManager.get('selection.elements') || []); } catch (_) {}
          dockRoot.updateSendState();
        }
        const shots = stateManager.get('selection.screenshots') || [];
        const last = shots[shots.length - 1];
        if (last) {
          // Previously showed a confirm bubble; keep selection and return to normal state
          stateManager.set('ui.dockState', 'normal');
        }
      });

      eventBus.on('screenshot:removed', () => {
        if (dockRoot) {
          try { dockRoot.renderChips(stateManager.get('selection.elements') || []); } catch (_) {}
          dockRoot.updateSendState();
        }
      });

      // Remove a specific screenshot by id
      eventBus.on('screenshot:remove', (id) => {
        const list = (stateManager.get('selection.screenshots') || []).slice();
        const idx = list.findIndex(s => s && (s.id === id));
        if (idx >= 0) {
          list.splice(idx, 1);
          stateManager.set('selection.screenshots', list);
          eventBus.emit('screenshot:removed', id);
        }
      });

      eventBus.on('screenshot:error', (error) => {
        const message = error?.message || 'Screenshot capture failed';
        topBanner.update(message);
        setTimeout(() => topBanner.hide(), 2200);
      });

      eventBus.on('session:create', () => {
        const tokens = selectionToTokens();
        const titleSource = dockRoot ? dockRoot.getInputValue() : '';
        const id = generateSessionId();
        const session = {
          id,
          title: titleSource.trim() || 'New Session',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          msgCount: 0,
          lastAppliedOk: false,
          transcript: [],
          snapshotTokens: tokens,
          manualTitle: !!titleSource.trim()
        };
        const list = [session, ...(stateManager.get('sessions.list') || [])];
        stateManager.batch({
          'sessions.list': list,
          'sessions.currentId': id,
          'ui.dockTab': 'chat'
        });
        persistSessions();
        if (dockRoot) dockRoot.clearInput();
      });

      eventBus.on('session:resume', (id) => {
        const sessions = stateManager.get('sessions.list') || [];
        if (!sessions.some(s => s.id === id)) return;
        stateManager.batch({
          'sessions.currentId': id,
          'ui.dockTab': 'chat'
        });
        persistSessions();
      });

      eventBus.on('session:rename', ({ id, title }) => {
        const value = (title || '').trim();
        if (!value) return;
        updateSessionById(id, (session) => {
          session.title = value;
          session.updatedAt = Date.now();
          session.manualTitle = true;
        });
        persistSessions();
      });

      eventBus.on('session:delete', (id) => {
        const list = (stateManager.get('sessions.list') || []).filter(session => session.id !== id);
        stateManager.set('sessions.list', list);
        const currentId = stateManager.get('sessions.currentId');
        if (currentId === id) {
          const nextId = list[0]?.id || null;
          const currentTab = stateManager.get('ui.dockTab') || 'chat';
          const updates = {
            'sessions.currentId': nextId
          };
          if (currentTab !== 'history') {
            updates['ui.dockTab'] = nextId ? 'chat' : 'history';
          }
          stateManager.batch(updates);
          if (!nextId) ensureDefaultSession();
        }
        persistSessions();
      });

      // Context tag click events (stage-aware highlight refresh)
      eventBus.on('context-tag:element-clicked', (index) => {
        const elements = stateManager.get('selection.elements') || [];
        const item = elements[index];
        if (!item) return;
        try { item.element.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
        // Clear both managers to avoid duplicate halos across documents
        try { highlightManager.clearAllSelections(); } catch (_) {}
        try { highlightManagerFrame && highlightManagerFrame.clearAllSelections(); } catch (_) {}
        const useIframe = !!stateManager.get('ui.viewport.useIframeStage');
        const mgr = (useIframe && highlightManagerFrame) ? highlightManagerFrame : highlightManager;
        elements.forEach((entry, idx) => { try { mgr.addSelection(entry.element, idx); } catch (_) {} });
      });

      eventBus.on('edit:open', (payload = {}) => {
        if (!editModal) return;
        try { highlightManager.hideHover(); } catch (_) {}
        try { highlightManagerFrame && highlightManagerFrame.hideHover(); } catch (_) {}
        const selection = stateManager.get('selection.elements') || [];
        if (!Array.isArray(selection) || selection.length === 0) return;
        let idx = typeof payload.index === 'number' ? payload.index : -1;
        if (idx < 0 && payload.element) {
          idx = selection.findIndex(item => item.element === payload.element);
        }
        if (idx < 0) idx = 0;
        const target = selection[idx];
        if (!target || !target.element) return;
        try {
          target.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (_) {
          // ignore scroll failures
        }
        // Ensure dock is visible so modal can align to it
        if (stateManager.get('ui.dockOpen') === false) {
          stateManager.set('ui.dockOpen', true);
        }
        editModal.open({ index: idx, element: target.element });
        stateManager.set('ui.dockState', 'normal');
      });

      eventBus.on('interaction:hover', ({ element, index }) => {
        // Always show edit bubble on hover if dock is open and not in active selection mode
        if (stateManager.get('ui.dockOpen') === false) return;
        const mode = stateManager.get('ui.mode');
        if (mode === 'element' || mode === 'screenshot') return; // suppress while in active picking modes
        const elements = stateManager.get('selection.elements') || [];
        if (typeof index !== 'number' || index < 0) return;
        const match = elements[index];
        if (!match || match.element !== element) return;
        // no-op (bubble removed)
      });
      eventBus.on('interaction:leave', () => {
        const mode = stateManager.get('ui.mode');
        // Only hide if not in selection mode
        if (mode === 'element' || mode === 'screenshot') return;
        // no-op (bubble removed)
      });

      // Mode toggle events
      eventBus.on('mode:toggle-element', () => {
        const currentMode = stateManager.get('ui.mode');
        const useIframe = !!stateManager.get('ui.viewport.useIframeStage');
        if (currentMode === 'element') {
          try { elementSelector.deactivate(); } catch (_) {}
          try { elementSelectorFrame && elementSelectorFrame.deactivate(); } catch (_) {}
          return;
        }
        // Switching into element mode
        if (screenshotSelector) screenshotSelector.deactivate();

        // Prefer iframe stage when ready; otherwise fall back to top document immediately
        const viewportEnabled = !!stateManager.get('ui.viewport.enabled');
        if (useIframe && viewportEnabled && elementSelectorFrame) {
          elementSelectorFrame.activate();
        } else {
          // Immediate fallback to ensure user can select without waiting
          try { elementSelector.activate(); } catch (_) {}
          // If iframe stage is desired but not ready, arm a one-shot auto-activation when it becomes ready
          pendingElementMode = !!useIframe;
        }
      });

      eventBus.on('mode:toggle-screenshot', () => {
        if (!elementSelector || !screenshotSelector) return;
        const currentMode = stateManager.get('ui.mode');

        if (currentMode === 'screenshot') {
          screenshotSelector.deactivate();
          // no-op (bubble removed)
        } else {
          elementSelector.deactivate();
          screenshotSelector.activate();
        }
      });

      // Stage lifecycle: bind iframe hooks for selection/highlights in true responsive mode
      eventBus.on('viewport:iframe-ready', ({ iframe }) => {
        try {
          setupIframeSelectionLocal(iframe);
        } catch (err) {
          console.warn('[LUMI] Failed to setup iframe selection:', err);
        }
      });
      eventBus.on('viewport:iframe-fallback', () => {
        if (pendingElementMode) {
          pendingElementMode = false;
          try { elementSelector.activate(); } catch (_) {}
        }
        // Rebind highlights to top document after fallback
        try { rebindHighlightsToActive(); } catch (_) {}
      });

      // Dock events (legacy bubble hooks mapped to dock)
      eventBus.on('bubble:close', () => {
        stateManager.set('ui.dockOpen', false);
        if (dockRoot) dockRoot.setVisible(false);
        if (elementSelector) elementSelector.deactivate();
        if (screenshotSelector) screenshotSelector.deactivate();
        highlightManager.clearAll();
        // no-op (bubble removed)
        if (editModal) editModal.close();
        // Also clear selection context to prevent lingering highlights/actions
        stateManager.batch({
          'selection.elements': [],
          'selection.screenshots': []
        });
        // Disable viewport and hide bar, restoring DOM 1:1
        try {
          viewportController.setEnabled(false);
          viewportBar.setVisible(false);
        } catch (_) {}
      });

      eventBus.on('bubble:toggle', () => {
        const isOpen = stateManager.get('ui.dockOpen') !== false;
        stateManager.set('ui.dockOpen', !isOpen);
        if (!isOpen && dockRoot) {
          dockRoot.setVisible(true);
          dockRoot.focusComposer();
          // Interaction bubble removed
        }
        if (isOpen) {
          if (elementSelector) elementSelector.deactivate();
          if (screenshotSelector) screenshotSelector.deactivate();
          highlightManager.clearAll();
          // no-op (bubble removed)
          if (editModal) editModal.close();
        }
      });

      // Engine events
      eventBus.on('engine:select', (engine) => {
        console.log('[Content] Engine select requested:', engine);
        if (!engineManager.isEngineAvailable(engine)) {
          const message = engine === 'claude'
            ? 'Claude CLI not detected. Please install Claude Code CLI to enable.'
            : 'Codex CLI not detected. Please install Codex CLI to enable.';
          topBanner.update(message);
          setTimeout(() => topBanner.hide(), 2200);
          return;
        }
        // Switch engine and update UI immediately for responsiveness
        engineManager.selectEngine(engine);
        // Dock reflects engine via state subscription
      });

      eventBus.on('engine:selected', (engine) => {
        console.log('[Content] Engine selected, updating UI:', engine);
      });

      eventBus.on('engine:availability-updated', ({ codex, claude }) => {
        console.log('[Content] Engine availability event received:', { codex, claude });
        // Bubble hidden; Dock can reflect status; errors routed via TopBanner
        const current = engineManager.getCurrentEngine();
        if (!engineManager.isEngineAvailable(current)) {
          const fallback = codex ? 'codex' : claude ? 'claude' : null;
          if (fallback && fallback !== current) {
            console.log('[Content] Current engine unavailable, falling back to:', fallback);
            engineManager.selectEngine(fallback);
            const message = current === 'claude'
              ? 'Claude CLI not detected. Switched back to Codex.'
              : 'Codex CLI not detected. Switched back to Claude.';
            topBanner.update(message);
            setTimeout(() => topBanner.hide(), 2200);
          } else {
            const message = current === 'claude'
              ? 'Claude CLI not detected. Please install Claude Code CLI to enable.'
              : 'Codex CLI not detected. Please install Codex CLI to enable.';
            topBanner.update(message);
            setTimeout(() => topBanner.hide(), 2200);
          }
        }
      });

      // State subscription: Update UI when engine state changes
      stateManager.subscribe('engine.current', (newEngine, oldEngine) => {
        console.log('[Content] Engine state changed:', oldEngine, '->', newEngine);
        // Dock updates engine label; Bubble hidden
      });

      // Keep TopBanner width aligned with Dock squeeze
      const alignTopBanner = () => {
        const open = stateManager.get('ui.dockOpen') !== false;
        const state = stateManager.get('ui.dockState');
        const offset = open && state !== 'compact' ? 420 : 0;
        try { topBanner.setRightOffset(offset + 'px'); } catch (_) {}
      };
      stateManager.subscribe('ui.dockOpen', alignTopBanner);
      stateManager.subscribe('ui.dockState', alignTopBanner);

      // Input events
      eventBus.on('input:changed', () => {
        if (dockRoot) dockRoot.updateSendState();
      });

      // WYSIWYG events (M1 scaffolding)
      eventBus.on('wysiwyg:apply', (payload = {}) => {
        const { index, changes, summary } = payload;
        const elements = stateManager.get('selection.elements');
        if (!Array.isArray(elements) || typeof index !== 'number' || !elements[index]) {
          console.warn('[LUMI] wysiwyg:apply ignored: invalid index');
          return;
        }
        const selector = elements[index].selector;
        const edits = (stateManager.get('wysiwyg.edits') || []).slice();
        // Replace existing entry for this index, if any
        const next = edits.filter(e => e.index !== index);
        const entry = {
          index,
          selector,
          changes: { ...(changes || {}) },
          summary: summary || summarizeChanges(changes)
        };
        next.push(entry);
        // Apply styles via StyleApplier and record history
        const element = elements[index].element;
        const context = { index };
        const committed = {};
        const prev = {};
        Object.entries(changes || {}).forEach(([prop, value]) => {
          if (prop === 'text') {
            if (canEditText(element)) {
              try { prev[prop] = element.textContent; } catch (_) {}
              element.textContent = value;
              committed[prop] = value;
            }
            return;
          }
          try { prev[prop] = element.style[prop] || ''; } catch (_) { prev[prop] = ''; }
          styleApplier.apply(element, prop, value, context);
          committed[prop] = value;
        });
        if (Object.keys(committed).length) {
          styleHistory.push({ index, selector, changes: committed, prev });
        }

        // Mark element
        elements[index].edited = true;
        elements[index].diffSummary = entry.summary;
        stateManager.batch({
          'selection.elements': elements,
          'wysiwyg.edits': next,
          'wysiwyg.hasDiffs': next.length > 0,
          'wysiwyg.pending': null,
          'wysiwyg.active': false
        });
        if (dockRoot) {
          dockRoot.updateSendState();
          try { dockRoot.renderChips(stateManager.get('selection.elements') || []); } catch (_) {}
        }
        try { highlightManager.updateAllPositions(); } catch (_) {}
        try { highlightManagerFrame && highlightManagerFrame.updateAllPositions(); } catch (_) {}
      });

      // Undo: prefer preview-level undo when modal is open; fallback to applied edits
      eventBus.on('wysiwyg:undo', () => {
        if (editModal && typeof editModal.isOpen === 'function' && editModal.isOpen()) {
          if (typeof editModal.undoPreviewStep === 'function' && editModal.undoPreviewStep()) {
            return;
          }
        }
        const last = styleHistory.undo();
        if (!last) {
          topBanner.update('Nothing to undo');
          setTimeout(() => topBanner.hide(), 1400);
          return;
        }
        const { index, selector, changes, prev } = last;
        const elements = stateManager.get('selection.elements') || [];
        let target = elements[index]?.element || null;
        if (!target && selector) {
          try { target = document.querySelector(selector); } catch (_) {}
        }
        if (!target) return;
        const context = { index };
        // Revert properties
        Object.entries(changes || {}).forEach(([prop, value]) => {
          if (prop === 'text') {
            if (canEditText(target)) {
              const back = prev && Object.prototype.hasOwnProperty.call(prev, 'text') ? prev.text : '';
              target.textContent = back;
            }
            return;
          }
          const back = prev && Object.prototype.hasOwnProperty.call(prev, prop) ? prev[prop] : '';
          if (back === '' || back === undefined || back === null) {
            styleApplier.remove(target, prop, context);
          } else {
            styleApplier.apply(target, prop, back, context);
          }
        });

        // Update wysiwyg.edits to reflect the latest effective change for this index (if any)
        const edits = (stateManager.get('wysiwyg.edits') || []).slice();
        const remaining = edits.filter(e => e.index !== index);
        const prevEntry = styleHistory.lastForIndex(index);
        if (prevEntry && prevEntry.changes && Object.keys(prevEntry.changes).length) {
          remaining.push({
            index,
            selector: prevEntry.selector || selector,
            changes: prevEntry.changes,
            summary: prevEntry.summary || summarizeChanges(prevEntry.changes)
          });
        }

        // Reconcile edited flag against baseline snapshot
        const items = stateManager.get('selection.elements') || [];
        const item = items[index];
        if (item && item.element) {
          const base = item.baseline || {};
          let stillEdited = false;
          // Compare text
          try {
            if (base.text !== null && base.text !== undefined && canEditText(item.element)) {
              if ((item.element.textContent || '') !== (base.text || '')) stillEdited = true;
            }
          } catch (_) {}
          const keys = Object.keys(base.inline || {});
          for (const k of keys) {
            try {
              const cur = item.element.style[k] || '';
              const orig = base.inline[k] || '';
              if (cur !== orig) { stillEdited = true; break; }
            } catch (_) {}
          }
          item.edited = stillEdited;
          if (!stillEdited) {
            delete item.diffSummary;
          } else if (prevEntry) {
            item.diffSummary = prevEntry.summary || summarizeChanges(prevEntry.changes || {});
          }
        }

        stateManager.batch({
          'selection.elements': elements,
          'wysiwyg.edits': remaining,
          'wysiwyg.hasDiffs': remaining.length > 0
        });

        if (dockRoot) {
          try { dockRoot.renderChips(stateManager.get('selection.elements') || []); } catch (_) {}
          dockRoot.updateSendState();
        }
      });

      eventBus.on('wysiwyg:reset', () => {
        const pending = stateManager.get('wysiwyg.pending');
        if (pending && pending.index !== undefined) {
          const elements = stateManager.get('selection.elements');
          const item = elements[pending.index];
          if (item && item.element) {
            Object.entries(pending.changes || {}).forEach(([prop, value]) => {
              if (prop === 'text') {
                if (canEditText(item.element)) item.element.textContent = value;
              } else {
                styleApplier.remove(item.element, prop, { index: pending.index });
              }
            });
          }
        }
        stateManager.set('wysiwyg.pending', null);
      });

      eventBus.on('wysiwyg:clear', () => {
        const elements = stateManager.get('selection.elements');
        elements.forEach(el => { delete el.edited; delete el.diffSummary; });
        stateManager.batch({
          'selection.elements': elements,
          'wysiwyg.edits': [],
          'wysiwyg.hasDiffs': false,
          'wysiwyg.pending': null
        });
        if (dockRoot) dockRoot.updateSendState();
        if (editModal) editModal.close();
      });

      // Submit event
      eventBus.on('submit:requested', async () => {
        let intent = dockRoot ? dockRoot.getInputValue() : '';
        const elements = stateManager.get('selection.elements');
        const screenshots = stateManager.get('selection.screenshots') || [];
        const projectAllowed = stateManager.get('projects.allowed');

        const edits = stateManager.get('wysiwyg.edits') || [];
        const hasEdits = stateManager.get('wysiwyg.hasDiffs') || edits.length > 0 || (elements || []).some(e => e?.edited);

        if (projectAllowed === false) {
          const message = 'LUMI is not configured for this site. Open Settings to map it to a project before submitting.';
          topBanner.update(message);
          setTimeout(() => topBanner.hide(), 2200);
          return;
        }

        if ((elements.length === 0 && screenshots.length === 0)) {
          topBanner.update('Please select an element or capture a screenshot first');
          setTimeout(() => topBanner.hide(), 2200);
          return;
        }

        if (!intent && !hasEdits) {
          topBanner.update('Please type your instructions or apply edits first');
          setTimeout(() => topBanner.hide(), 2200);
          return;
        }

        if (!intent && hasEdits) {
          intent = 'Apply the following WYSIWYG edits to the selected elements.';
        }

        const engine = engineManager.getCurrentEngine();
        if (!engineManager.isEngineAvailable(engine)) {
          const message = engine === 'claude'
            ? 'Claude CLI not detected. Please install Claude Code CLI to enable.'
            : 'Codex CLI not detected. Please install Codex CLI to enable.';
          topBanner.update(message);
          setTimeout(() => topBanner.hide(), 2200);
          return;
        }

        const sessionId = stateManager.get('sessions.currentId');
        // Pretty-print intent for transcript by replacing tokens with readable labels
        const prettyIntent = (() => {
          try {
            const str = String(intent || '');
            const arr = Array.isArray(elements) ? elements : [];
            const shots = screenshots || [];
            return str.replace(/\[@(element|screenshot)(\d+)\]/g, (m, type, num) => {
              const idx = Math.max(0, Number(num) - 1);
              if (type === 'element' && arr[idx] && arr[idx].element) {
                const el = arr[idx].element;
                const label = readableElementName(el);
                return '@' + label;
              }
              if (type === 'screenshot' && shots[idx]) {
                const s = shots[idx];
                const w = Math.round(s?.bbox?.width || 0);
                const h = Math.round(s?.bbox?.height || 0);
                return (w && h) ? `@shot ${idx + 1} (${w}×${h})` : `@shot ${idx + 1}`;
              }
              return m;
            });
          } catch (_) {
            return String(intent || '');
          }
        })();

        if (sessionId && intent && intent.trim()) {
          appendMessage(sessionId, {
            id: 'm' + Math.random().toString(36).slice(2),
            role: 'user',
            text: prettyIntent.trim()
          });
          // Clear typed text immediately after sending for a clean slate
          try { if (dockRoot) dockRoot.clearInput(); } catch (_) {}
        }

        stateManager.set('processing.active', true);

        // M0: append a placeholder assistant message to indicate processing
        let streamMsgId = null;
        if (sessionId) {
          try {
            streamMsgId = appendMessage(sessionId, {
              role: 'assistant',
              streaming: true,
              done: false,
              chunks: []
            });
          } catch (_) {}
        }

        // Build context snapshot
        const pageInfo = { url: window.location.href, title: document.title };
        const lastScreenshot = screenshots.length ? screenshots[screenshots.length - 1] : null;
        const reqElements = elements;
        const reqScreenshots = screenshots;
        const reqEdits = edits;

        // Clear context immediately for a cleaner UX during processing
        try { highlightManager.clearAll(); } catch (_) {}
        try { highlightManagerFrame && highlightManagerFrame.clearAll(); } catch (_) {}
        stateManager.batch({
          'selection.elements': [],
          'selection.screenshots': [],
          'wysiwyg.pending': null,
          'wysiwyg.edits': [],
          'wysiwyg.hasDiffs': false
        });
        try { dockRoot && dockRoot.clearChips(); } catch (_) {}
        try { dockRoot && dockRoot.updateSendState(); } catch (_) {}

        try {
          let result = null;
          let usedStream = false;
          const streamId = streamMsgId ? ('st' + Math.random().toString(36).slice(2)) : null;
          const canUseStream = engine === 'codex';

          if (streamId && sessionId && canUseStream) {
            activeStreams.set(streamId, { sessionId, messageId: streamMsgId });
            const streamPromise = new Promise((resolve, reject) => {
              pendingStreamResults.set(streamId, { resolve, reject });
            });
            try {
              await serverClient.executeStream(
                engine,
                intent,
                reqElements,
                lastScreenshot,
                pageInfo,
                reqScreenshots,
                reqEdits,
                streamId
              );
              usedStream = true;
              result = await streamPromise;
            } catch (err) {
              console.error('[Content] Stream execution failed:', err);
              activeStreams.delete(streamId);
              pendingStreamResults.delete(streamId);
              result = usedStream ? { success: false, error: err?.message || 'Stream failed' } : null;
            }
          }

          if (!result && !usedStream) {
            result = await serverClient.execute(
              engine,
              intent,
              reqElements,
              lastScreenshot,
              pageInfo,
              reqScreenshots,
              reqEdits
            );
          }

          if (sessionId) {
            if (!usedStream) {
              if (streamMsgId) {
                updateMessage(sessionId, streamMsgId, (msg) => applyResultToMessage(msg, result || {}));
              } else {
                const mid = appendMessage(sessionId, { role: 'assistant' });
                updateMessage(sessionId, mid, (msg) => applyResultToMessage(msg, result || {}));
              }
            }
            updateSessionById(sessionId, (session) => {
              session.snapshotTokens = selectionToTokens();
            });
          }

          if (result?.success) {
            topBanner.update('Success! Changes applied.');
            setTimeout(() => topBanner.hide(), 2200);
            if (dockRoot) dockRoot.clearInput();

            stateManager.batch({
              'selection.elements': [],
              'selection.screenshots': [],
              'wysiwyg.edits': [],
              'wysiwyg.hasDiffs': false,
              'wysiwyg.pending': null
            });
            try { styleHistory.clear(); } catch (_) {}
            if (dockRoot) dockRoot.updateSendState();
            highlightManager.clearAll();
            if (editModal) editModal.close();
          } else if (result) {
            topBanner.update(result.error || 'Request failed');
            setTimeout(() => topBanner.hide(), 2200);
          }
        } catch (error) {
          console.error('[Content] Submit failed:', error);
          topBanner.update('Network error: ' + error.message);
          setTimeout(() => topBanner.hide(), 2200);
          if (sessionId && streamMsgId) {
            updateMessage(sessionId, streamMsgId, (msg) => {
              msg.streaming = false;
              msg.done = true;
              msg.applied = false;
              msg.text = 'Network error: ' + error.message;
            });
          }
        } finally {
          stateManager.set('processing.active', false);
          if (dockRoot) dockRoot.updateSendState();
        }
      });

      // Health check events
      eventBus.on('health:server-status-changed', (isHealthy) => {
        topBanner.update(isHealthy ? '' : 'Local server unavailable');
        if (!isHealthy) setTimeout(() => topBanner.hide(), 2200);
      });

      eventBus.on('health:capabilities-updated', ({ codex, claude }) => {
        console.log('[Content] Engine capabilities updated:', { codex, claude });
      });

      // Context clear
      eventBus.on('context:clear', () => {
        stateManager.batch({
          'selection.elements': [],
          'selection.screenshots': []
        });
        if (dockRoot) dockRoot.updateSendState();
        try { highlightManager.clearAll(); } catch (_) {}
        try { highlightManagerFrame && highlightManagerFrame.clearAll(); } catch (_) {}
        if (editModal) editModal.close();
      });

      eventBus.on('projects:blocked', ({ host }) => {
        if (stateManager.get('ui.dockOpen') !== false) {
          topBanner.update('LUMI is not configured for this page. Open Settings to map it to a project.');
        }
        if (dockRoot) dockRoot.updateSendState();
      });

      eventBus.on('projects:allowed', () => {
        topBanner.hide();
        if (dockRoot) dockRoot.updateSendState();
      });

      // Top banner notifications
      eventBus.on('notify:error', (message) => {
        topBanner.update(message);
        setTimeout(() => topBanner.hide(), 2200);
      });
    }
    function canEditText(el) {
      try {
        if (!el) return false;
        const tag = (el.tagName || '').toLowerCase();
        if (['input','textarea','img','video','canvas','svg'].includes(tag)) return false;
        return el.childElementCount === 0;
      } catch (_) { return false; }
    }

    // Keyboard shortcuts
    function setupKeyboardShortcuts() {
      document.addEventListener('keydown', (e) => {
        // track space pressed for panning
        if (e.key === ' ') { try { window.__lumiSpacePressed = true; } catch (_) {} }
        // Ignore if typing in input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
          // Allow Cmd+Enter for submit
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            eventBus.emit('submit:requested');
            e.preventDefault();
          }
          return;
        }

        // Esc: Close dock or deactivate mode
        if (e.key === 'Escape') {
          const isDockOpen = stateManager.get('ui.dockOpen') !== false;
          const mode = stateManager.get('ui.mode');

          if (mode !== 'idle') {
            if (elementSelector) elementSelector.deactivate();
            if (screenshotSelector) screenshotSelector.deactivate();
          } else if (isDockOpen) {
            eventBus.emit('bubble:close');
          }
          e.preventDefault();
        }

        // Cmd+E: Toggle element mode
        if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
          eventBus.emit('mode:toggle-element');
          e.preventDefault();
        }

        // Cmd+S: Toggle screenshot mode
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
          eventBus.emit('mode:toggle-screenshot');
          e.preventDefault();
        }

        // Viewport Mode: Ctrl/Cmd+Shift+V toggle
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'v' || e.key === 'V')) {
          const on = !!stateManager.get('ui.viewport.enabled');
          eventBus.emit('viewport:toggle', !on);
          e.preventDefault();
        }
        // Viewport Scale: Ctrl/Cmd+Shift+= or -
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === '+' || e.key === '=')) {
          const cur = stateManager.get('ui.viewport.scale') || 1;
          eventBus.emit('viewport:scale', Math.min(2, cur + 0.1));
          e.preventDefault();
        }
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === '-' || e.key === '_')) {
          const cur = stateManager.get('ui.viewport.scale') || 1;
          eventBus.emit('viewport:scale', Math.max(0.25, cur - 0.1));
          e.preventDefault();
        }

        // Cmd+K: Clear context
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
          eventBus.emit('context:clear');
          e.preventDefault();
        }

        // Ctrl/Cmd + Alt + 0 : emergency viewport restore
        if ((e.metaKey || e.ctrlKey) && e.altKey && e.key === '0') {
          eventBus.emit('viewport:toggle', false);
          e.preventDefault();
        }
      });
      document.addEventListener('keyup', (e) => {
        if (e.key === ' ') { try { window.__lumiSpacePressed = false; } catch (_) {} }
      });
    }

    // Initialize application
    async function init() {
      console.log('[LUMI] Initializing...');

      injectGlobalStyles();
      // Manual theming only; auto detection disabled

      // Restore sessions before mounting UI
      await restoreSessions();

      // Mount UI components
      // No top banner UI
      dockRoot = new DockRoot(eventBus, stateManager);
      dockRoot.mount();
      // Mount Edit Modal inside Dock's ShadowRoot to avoid page CSS leakage (e.g., Google/Baidu resets)
      try {
        const mount = dockRoot && typeof dockRoot.getShadowRoot === 'function' ? dockRoot.getShadowRoot() : document.body;
        editModal = new DockEditModal(eventBus, stateManager, mount);
      } catch (_) {
        editModal = new DockEditModal(eventBus, stateManager, document.body);
      }
      editModal.mount();
      // Interaction bubble removed

      // ControlsOverlay currently disabled; use highlight pen modal instead

      // Initialize selectors after UI is ready
      elementSelector = new ElementSelector(eventBus, stateManager, highlightManager, topBanner, document, window);
      screenshotSelector = new ScreenshotSelector(eventBus, stateManager, highlightManager, topBanner, chromeBridge);

      // Bind all events (after UI is mounted)
      bindEvents();

      // Setup keyboard shortcuts
      setupKeyboardShortcuts();

      // Theme: manual only, default light (no persistence)
      try {
        stateManager.set('ui.theme', 'light');
        setDockThemeMode('light');
      } catch (_) {}

      // Apply initial viewport visibility, synced with dock state
      try {
        const enabled = !!stateManager.get('ui.viewport.enabled');
        const dockOpen = stateManager.get('ui.dockOpen') !== false;
        const on = enabled && dockOpen; // viewport should follow dock on refresh
        viewportController.setEnabled(on);
        viewportBar.mount();
        viewportBar.setVisible(on);
        stateManager.set('ui.viewport.enabled', on);
      } catch (_) {}

      // Keep highlight layer in sync with viewport canvas scroll (inline stage)
      try {
        const syncScrollTarget = () => {
          const el = viewportController && viewportController.canvas;
          const on = !!stateManager.get('ui.viewport.enabled');
          highlightManager.setExtraScrollContainer(on ? el : null);
        };
        eventBus.on('viewport:toggle', (on) => {
          viewportController.setEnabled(on);
          viewportBar.setVisible(on);
          setTimeout(syncScrollTarget, 0);
        });
        eventBus.on('viewport:preset', (name) => viewportController.setPreset(name));
        eventBus.on('viewport:fit', (mode) => viewportController.setFit(mode));
        eventBus.on('viewport:scale', (value) => viewportController.setScale(value));
        eventBus.on('viewport:zoom', (value) => viewportController.setZoom(value));
        syncScrollTarget();
      } catch (_) {}

      // Viewport follows dock visibility (they work together as one unit)
      try {
        stateManager.subscribe('ui.dockOpen', (open) => {
          const on = open !== false;
          viewportBar.setVisible(on);
          viewportController.setEnabled(on);  // Sync viewport controller with dock
          eventBus.emit('viewport:toggle', on);
          persistUIState();  // Persist when dock open/close state changes
        });
        stateManager.subscribe('ui.theme', (mode) => {
          try { setDockThemeMode(mode); } catch (_) {}
          try { viewportBar.setTheme(mode); } catch (_) {}
        });
      } catch (_) {}

      // (moved into bindEvents scope as setupIframeSelectionLocal)

      // Listen for background messages (toggle only)
      chromeBridge.onMessage((message) => {
        if (!message || !message.type) return;
        if (message.type === 'TOGGLE_BUBBLE') {
          eventBus.emit('bubble:toggle');
          try {
            const open = stateManager.get('ui.dockOpen') !== false;
            if (open) eventBus.emit('viewport:toggle', true);
          } catch (_) {}
          return;
        }
        if (message.type === 'STREAM_CHUNK') {
          handleStreamChunk(message);
          return;
        }
        if (message.type === 'STREAM_DONE') {
          handleStreamDone(message);
          return;
        }
        if (message.type === 'STREAM_ERROR') {
          handleStreamError(message);
        }
      });

      // Initialize engine (restore saved preference)
      await engineManager.init();

      // Start health checker
      healthChecker.start();

      // Runtime self-check (non-fatal)
      try {
        (function selfCheck(){
          const get = (p) => stateManager.get(p);
          const need = (cond, msg) => { if (!cond) console.error('[LUMI SelfCheck]', msg); };
          const p = get('ui.viewport.preset');
          need(['responsive','mobile','pad','laptop'].includes(p), 'Unknown preset: '+p);
          const logical = get('ui.viewport.logical')||{};
          need(logical.width>0 && logical.height>0, 'Logical size invalid');
          const auto = get('ui.viewport.auto');
          const scale = get('ui.viewport.scale');
          need((auto || (scale>=0.25 && scale<=2)), 'Scale out of range or auto mis-set');
          const bar = document.getElementById('lumi-viewport-bar-root');
          need(!!bar, 'TopViewportBar not mounted');
          const stage = document.getElementById('lumi-viewport-stage');
          need(!!stage, 'Viewport stage missing');
          const stageInfo = viewportController?.getStageInfo?.() || { mode: 'unknown', fallback: 'n/a', enabled: stateManager.get('ui.viewport.enabled') };
          console.info(`[LUMI] preset=${p} ${logical.width}x${logical.height} scale=${scale} mode=${stageInfo.mode} (fallback:${stageInfo.fallback || 'none'}) enabled=${stageInfo.enabled}`);
          console.info('[LUMI SelfCheck] done');
        })();
      } catch (_) {}

      console.log('[LUMI] Initialized successfully');
    }

    // Persist/restore sessions (simplified: host-only key to avoid race conditions)
    function getSessionsKey() {
      const host = window.location.host;
      return `lumi.sessions:${host}`;
    }
    
    async function restoreSessions() {
      try {
        const key = getSessionsKey();
        console.log('[LUMI] Restoring sessions from key:', key);
        const data = await chromeBridge.storageGet([key]);
        const payload = data && data[key];
        console.log('[LUMI] Restored payload:', payload);

        if (!payload || !Array.isArray(payload.list) || !payload.list.length) {
          console.log('[LUMI] No sessions to restore');
          return;
        }

        const normalizedList = payload.list.map((session) => {
          if (!Array.isArray(session?.transcript)) return session;
          const transcript = session.transcript.map((m) => {
            if (!m || m.role !== 'assistant') return m;
            if (m.streaming && !m.done) {
              return {
                ...m,
                streaming: false,
                done: true,
                applied: typeof m.applied === 'boolean' ? m.applied : false,
                text: m.text || 'Request was interrupted before completion.'
              };
            }
            return m;
          });
          return { ...session, transcript };
        });

        stateManager.batch({
          'sessions.list': normalizedList,
          'sessions.currentId': payload.currentId || payload.list[0]?.id
        });
        console.log('[LUMI] Sessions restored:', payload.list.length, 'sessions');
      } catch (err) {
        console.error('[LUMI] Restore sessions failed:', err);
      }
    }
    
    function persistSessions() {
      try {
        const key = getSessionsKey();
        const list = stateManager.get('sessions.list') || [];
        const currentId = stateManager.get('sessions.currentId');
        const payload = { list, currentId, t: Date.now() };
        
        console.log('[LUMI] Persisting sessions to key:', key, 'count:', list.length);
        chromeBridge.storageSet({ [key]: payload });
      } catch (err) {
        console.error('[LUMI] Persist sessions failed:', err);
      }
    }
    
    // Persist UI state (dock open/close)
    function persistUIState() {
      try {
        const host = window.location.host;
        const dockOpen = stateManager.get('ui.dockOpen');
        chromeBridge.storageSet({
          [`lumi.ui.state:${host}`]: { dockOpen, t: Date.now() }
        });
      } catch (err) {
        console.error('[LUMI] Persist UI state failed:', err);
      }
    }

    // Start the application
    init().catch(error => {
      console.error('[LUMI] Initialization failed:', error);
    });
  }

})();
//# sourceMappingURL=content.js.map
