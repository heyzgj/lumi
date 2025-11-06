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
          dockState: 'normal' // 'normal' | 'compact' | 'expanded'
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
          dockState: 'normal'
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
   * TopBanner - Top notification banner for mode hints
   */

  class TopBanner {
    constructor() {
      this.banner = null;
    }

    mount() {
      if (this.banner) return;
      
      this.banner = document.createElement('div');
      this.banner.id = 'lumi-top-banner';
      this.banner.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 2147483646;
      padding: 12px 24px;
      background: var(--accent);
      backdrop-filter: blur(12px);
      color: var(--on-accent);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      font-weight: 500;
      text-align: center;
      box-shadow: var(--shadow);
      display: none;
      animation: slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    `;
      
      document.body.appendChild(this.banner);
    }

    show(message) {
      if (!this.banner) this.mount();
      this.banner.textContent = message;
      this.banner.style.display = 'block';
    }

    hide() {
      if (this.banner) {
        this.banner.style.display = 'none';
      }
    }

    update(message) {
      if (!message) {
        this.hide();
      } else {
        this.show(message);
      }
    }

    destroy() {
      if (this.banner) {
        this.banner.remove();
        this.banner = null;
      }
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

  const TOKENS_CSS = ":root {\n  --dock-bg: rgba(255,255,255,0.88);\n  --dock-stroke: rgba(0,0,0,0.08);\n  --dock-fg: #111111;\n  --dock-fg-2: #5F6368;\n  --accent: #3B82F6;\n  --success: #10B981;\n  --error: #EF4444;\n  --on-accent: #ffffff;\n  --on-strong: #ffffff;\n  --shadow: 0 4px 12px rgba(0,0,0,0.05);\n  --radius-panel: 18px;\n  --radius-chip: 12px;\n}\n:root.dark-dock {\n  --dock-bg: rgba(22,22,24,0.88);\n  --dock-stroke: rgba(255,255,255,0.12);\n  --dock-fg: #F5F5F7;\n  --dock-fg-2: #B0B3B8;\n  --accent: #60A5FA;\n  --success: #34D399;\n  --error: #F87171;\n  --on-accent: #ffffff;\n  --on-strong: #ffffff;\n  --shadow: 0 6px 16px rgba(0,0,0,0.35);\n  --radius-panel: 18px;\n  --radius-chip: 12px;\n}\n";

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
    const firstClass = (element.className || '').split(' ').filter(Boolean)[0];
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
    constructor(eventBus = null) {
      this.eventBus = eventBus;
      this.hoverHighlight = null;
      this.selectionHighlights = [];
      this.selectionElements = [];
      this.selectionListeners = new Map();
      this.screenshotOverlay = null;
    }

    showHover(element) {
      this.hideHover();
      const bbox = element.getBoundingClientRect();
      const halo = document.createElement('div');
      halo.className = 'lumi-highlight lumi-hover';
      halo.style.cssText = this.buildHaloStyle(bbox, element);
      // Hover halo must never intercept pointer events; clicks should go to the page element
      halo.style.pointerEvents = 'none';
      document.body.appendChild(halo);
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
      const halo = document.createElement('div');
      halo.className = 'lumi-highlight lumi-selected';
      halo.style.cssText = this.buildHaloStyle(bbox, element);

      const resolveIndex = () => {
        const current = this.selectionElements.indexOf(element);
        if (current >= 0) return current;
        return typeof index === 'number' ? index : 0;
      };

      halo.addEventListener('mouseenter', () => {
        if (this.eventBus) {
          this.eventBus.emit('interaction:hover', { element, index: resolveIndex() });
        }
      });
      halo.addEventListener('mouseleave', () => {
        if (this.eventBus) {
          this.eventBus.emit('interaction:leave', { element, index: resolveIndex() });
        }
      });

      document.body.appendChild(halo);
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
      pointer-events: none;
      z-index: 2147483645;
      border-radius: ${radius};
      box-shadow: 0 0 0 2px var(--dock-stroke);
      background: transparent;
      cursor: default;
      transition: box-shadow 0.15s ease;
    `;
    }

    penSVG() { return ''; }
  }

  /**
   * ElementSelector - Handle element selection mode
   */


  class ElementSelector {
    constructor(eventBus, stateManager, highlightManager, topBanner) {
      this.eventBus = eventBus;
      this.stateManager = stateManager;
      this.highlightManager = highlightManager;
      this.topBanner = topBanner;
      this.isActive = false;
      
      // Bind methods
      this.handleMouseMove = this.handleMouseMove.bind(this);
      this.handleClick = this.handleClick.bind(this);
    }

    activate() {
      if (this.isActive) return;
      
      this.isActive = true;
      this.stateManager.set('ui.mode', 'element');
      
      this.topBanner.update('Click to select element');
      
      document.addEventListener('mousemove', this.handleMouseMove, true);
      document.addEventListener('click', this.handleClick, true);
      document.documentElement.classList.add('lumi-element-cursor');
      document.body.classList.add('lumi-element-cursor');
      
      this.eventBus.emit('element-mode:activated');
    }

    deactivate() {
      if (!this.isActive) return;
      
      this.isActive = false;
      this.stateManager.set('ui.mode', 'idle');
      this.stateManager.set('ui.dockState', 'normal');
      
      this.topBanner.hide();
      this.highlightManager.hideHover();
      
      document.removeEventListener('mousemove', this.handleMouseMove, true);
      document.removeEventListener('click', this.handleClick, true);
      document.documentElement.classList.remove('lumi-element-cursor');
      document.body.classList.remove('lumi-element-cursor');
      
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
      
      const item = {
        element,
        selector,
        tagName: element.tagName.toLowerCase(),
        bbox: {
          top: bbox.top + window.scrollY,
          left: bbox.left + window.scrollX,
          width: bbox.width,
          height: bbox.height
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
        next.push({ dataUrl, bbox, id: Date.now() });
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

      this.stateManager.batch({
        'engine.available.codex': next.codex,
        'engine.available.claude': next.claude
      });

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
          // Server healthy but no specific capabilities, assume codex available
          this.engineManager.updateAvailability(true, false);
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

    buildContext(intent, elements, screenshot, pageInfo, screenshots = [], edits = []) {
      const context = {
        intent,
        pageUrl: pageInfo.url,
        pageTitle: pageInfo.title,
        selectionMode: elements.length > 0 ? 'element' : 'screenshot',
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        }
      };

      const { frameworks, styleStrategy } = detectFrameworkSignatures();
      context.meta = {
        frameworks,
        styleStrategy
      };
      
      // Add element context - support multiple elements
      if (elements.length > 0) {
        if (elements.length === 1) {
          // Single element - keep original format
          context.element = {
            tagName: elements[0].element.tagName,
            selector: elements[0].selector,
            className: elements[0].element.className,
            classList: getElementClassList(elements[0].element),
            dataset: getElementDataset(elements[0].element),
            ancestors: getAncestorTrail(elements[0].element),
            id: elements[0].element.id,
            outerHTML: elements[0].element.outerHTML,
            textContent: getElementText(elements[0].element),
            computedStyle: getComputedStyleSummary(elements[0].element)
          };
          context.bbox = elements[0].bbox;
        } else {
          // Multiple elements - send as array
          context.elements = elements.map((item, index) => ({
            index: index + 1,
            tagName: item.element.tagName,
            selector: item.selector,
            className: item.element.className,
            classList: getElementClassList(item.element),
            dataset: getElementDataset(item.element),
            ancestors: getAncestorTrail(item.element),
            id: item.element.id,
            outerHTML: item.element.outerHTML,
            textContent: getElementText(item.element),
            computedStyle: getComputedStyleSummary(item.element),
            bbox: item.bbox
          }));
          context.elementCount = elements.length;
        }
      }
      
      // Add screenshot context (single + multiple)
      if (screenshots && screenshots.length > 0) {
        context.screenshots = screenshots.map((s, i) => ({ index: i + 1, bbox: s.bbox }));
      }
      if (screenshot) {
        context.screenshot = screenshot;
      }

      // Include WYSIWYG edits if present
      if (edits && edits.length) {
        context.edits = edits.map(e => ({
          index: e.index,
          selector: e.selector,
          changes: e.changes,
          summary: e.summary
        }));
      }
      
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
  .header-btn {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-secondary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  }
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
  .header-btn:hover { 
    color: var(--text); 
    background: var(--surface-hover); 
    transform: scale(1.05);
  }
  .header-btn.header-close {
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-secondary);
    font-size: 18px;
  }
  .header-btn.header-close:hover { 
    color: var(--text); 
    background: var(--surface-hover);
  }

  .tabs {
    display: flex;
    gap: 6px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
  .tab {
    flex: 1;
    text-align: center;
    padding: 8px 16px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary);
    background: transparent;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1);
    position: relative;
  }
  .tab:hover { 
    color: var(--text); 
    background: var(--surface-hover);
  }
  .tab.active { 
    color: var(--primary); 
    background: var(--glass-bg);
    box-shadow: var(--shadow);
    font-weight: 600;
  }

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
  .icon {
    width: 32px;
    height: 32px;
    border-radius: 16px;
    border: 1px solid var(--border);
    background: var(--surface);
    display: grid;
    place-items: center;
    cursor: pointer;
    transition: background 0.15s ease, border 0.15s ease;
  }
  .icon:hover { background: color-mix(in srgb, var(--dock-bg) 88%, transparent); }
  .send {
    padding: 6px 18px;
    border-radius: 18px;
    border: 1px solid var(--border);
    background: color-mix(in srgb, var(--dock-fg) 92%, transparent);
    color: var(--on-strong);
    font-size: 12px;
    cursor: pointer;
  }
  .send:disabled { opacity: 0.5; cursor: not-allowed; }
`;

  function applyDockThemeAuto() {
    try {
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

  function watchDockTheme() {
    try {
      if (window.matchMedia) {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        if (typeof mq.addEventListener === 'function') {
          mq.addEventListener('change', applyDockThemeAuto);
        } else if (typeof mq.addListener === 'function') {
          mq.addListener(applyDockThemeAuto);
        }
      }
      const ro = new MutationObserver(() => applyDockThemeAuto());
      ro.observe(document.documentElement, { attributes: true, attributeFilter: ['class'], subtree: false });
      // Also watch body style changes that could flip background dramatically
      const bo = new MutationObserver(() => applyDockThemeAuto());
      bo.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
    } catch (_) {}
  }

  function escapeHtml(str = '') {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
    }

    mount() {
      if (this.host) return;
      this.host = document.createElement('div');
      this.host.id = 'lumi-dock-root';
      this.host.style.cssText = 'position: fixed; top: 0; right: 0; height: 100vh; width: 420px; z-index: 2147483646; display: none;';
      this.shadow = this.host.attachShadow({ mode: 'open' });
      this.shadow.innerHTML = this.renderHTML();
      document.body.appendChild(this.host);
      
      // Apply squeeze mode to document.documentElement
      this.applySqueeze(false);
      
      this.createHandle();
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
            <button class="header-btn header-toggle" id="dock-toggle" title="Collapse Dock" aria-label="Collapse Dock">
              <svg id="icon-collapse" viewBox="0 0 24 24" aria-hidden="true" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="14" height="16" rx="2"></rect>
                <path d="M19 4v16"></path>
                <path d="M12 12l-3-3m3 3l-3 3"></path>
              </svg>
              <svg id="icon-expand" style="display:none" viewBox="0 0 24 24" aria-hidden="true" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="7" y="4" width="14" height="16" rx="2"></rect>
                <path d="M5 4v16"></path>
                <path d="M12 12l3-3m-3 3l3 3"></path>
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
      this.toggleCollapse = this.shadow.getElementById('icon-collapse');
      this.toggleExpand = this.shadow.getElementById('icon-expand');

      const settingsBtn = this.shadow.getElementById('gear');
      this.toggleBtn = this.shadow.getElementById('dock-toggle');
      settingsBtn.addEventListener('click', () => this.eventBus.emit('settings:open'));
      this.toggleBtn.addEventListener('click', () => {
        const state = this.stateManager.get('ui.dockState');
        const next = state === 'compact' ? 'normal' : 'compact';
        this.stateManager.set('ui.dockState', next);
      });

      const closeBtn = this.shadow.getElementById('dock-close');
      closeBtn.addEventListener('click', () => {
        this.stateManager.set('ui.dockOpen', false);
        this.setVisible(false);
      });

      this.tabsEl.addEventListener('click', (e) => {
        const tab = e.target.closest('.tab');
        if (!tab) return;
        this.setTab(tab.dataset.tab);
      });

      this.shadow.getElementById('select-btn').addEventListener('click', () => this.eventBus.emit('mode:toggle-element'));
      this.shadow.getElementById('shot-btn').addEventListener('click', () => this.eventBus.emit('mode:toggle-screenshot'));
      this.shadow.getElementById('new-session-btn').addEventListener('click', () => this.eventBus.emit('session:create'));

      this.engineSelect.addEventListener('change', () => {
        const value = this.engineSelect.value === 'claude' ? 'claude' : 'codex';
        this.eventBus.emit('engine:select', value);
      });

      this.editorEl.addEventListener('input', () => {
        this.updatePlaceholder();
        this.eventBus.emit('input:changed');
        this.updateSendState();
        this.captureSelection();
      });
      this.editorEl.addEventListener('keydown', (e) => {
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
      });

      this.sendBtn.addEventListener('click', () => this.eventBus.emit('submit:requested'));

      this.historyPane.addEventListener('click', (event) => this.handleHistoryClick(event));

      // State subscriptions
      this.stateManager.subscribe('engine.current', (engine) => this.updateEngine(engine));
      this.stateManager.subscribe('engine.available', () => this.updateEngineAvailability());
      this.stateManager.subscribe('selection.elements', (elements) => this.renderChips(elements || []));
      this.stateManager.subscribe('sessions.list', () => this.renderBody());
      this.stateManager.subscribe('sessions.currentId', () => this.renderBody());
      this.stateManager.subscribe('ui.dockTab', (tab) => this.setTab(tab, true));
      this.stateManager.subscribe('ui.dockOpen', (open) => this.setVisible(open !== false));
      this.stateManager.subscribe('ui.dockState', (state) => this.updateDockState(state));
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
      this.applyTheme();

      // Live updates for session changes (ensure History/UI refresh immediately)
      this.stateManager.subscribe('sessions.list', () => {
        const tab = this.stateManager.get('ui.dockTab') || this.activeTab;
        if (tab === 'history') this.renderHistory(); else this.renderChat();
      });
      this.stateManager.subscribe('sessions.currentId', () => {
        const tab = this.stateManager.get('ui.dockTab') || this.activeTab;
        if (tab === 'history') this.renderHistory(); else this.renderChat();
      });
    }

    applyTheme() {
      try {
        applyDockThemeAuto();
        const dock = this.shadow.getElementById('dock');
        if (!dock) return;
        const isDark = document.documentElement.classList.contains('dark-dock');
        dock.classList.toggle('dark', isDark);
      } catch (_) {}
    }

    applySqueeze(isOpen) {
      const html = document.documentElement;
      const body = document.body;
      
      if (isOpen) {
        // Squeeze mode: reduce viewport width
        html.style.transition = 'margin-right 0.25s cubic-bezier(0.22, 1, 0.36, 1)';
        html.style.marginRight = '420px';
        html.style.overflow = 'hidden';
        body.style.overflow = 'auto';
      } else {
        // Normal: restore full width
        html.style.transition = 'margin-right 0.25s cubic-bezier(0.22, 1, 0.36, 1)';
        html.style.marginRight = '0';
        setTimeout(() => {
          html.style.overflow = '';
        }, 250);
      }
    }

    updateDockState(state) {
      const dock = this.shadow.getElementById('dock');
      if (!dock) return;
      dock.classList.toggle('compact', state === 'compact');
      
      const isCompact = state === 'compact';
      const dockWidth = isCompact ? '56px' : '420px';
      
      if (this.host) {
        this.host.style.pointerEvents = isCompact ? 'none' : 'auto';
        this.host.style.transition = 'width 0.2s cubic-bezier(0.22, 1, 0.36, 1)';
        this.host.style.width = dockWidth;
      }
      
      // Update squeeze based on compact state
      const isOpen = this.stateManager.get('ui.dockOpen') !== false;
      if (isOpen) {
        const html = document.documentElement;
        html.style.transition = 'margin-right 0.25s cubic-bezier(0.22, 1, 0.36, 1)';
        html.style.marginRight = isCompact ? '56px' : '420px';
      }
      
      // Hide toggle button when compact (use handle instead)
      if (this.toggleBtn) {
        this.toggleBtn.style.display = 'flex';
        const label = isCompact ? 'Expand Dock' : 'Collapse Dock';
        this.toggleBtn.title = label;
        this.toggleBtn.setAttribute('aria-label', label);
      }
      if (this.toggleCollapse && this.toggleExpand) {
        this.toggleCollapse.style.display = isCompact ? 'none' : 'block';
        this.toggleExpand.style.display = isCompact ? 'block' : 'none';
      }
      if (this.handle) {
        this.handle.style.display = isOpen && isCompact ? 'flex' : 'none';
        if (isCompact) {
          const currentTop = parseFloat(this.handle.style.top || `${window.innerHeight / 2 - 26}`);
          this.positionHandle(currentTop);
        }
      }
    }

    setVisible(isOpen) {
      if (!this.host) return;
      this.host.style.display = isOpen ? 'block' : 'none';
      
      // Apply or remove squeeze
      this.applySqueeze(isOpen);
      
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
      }
      this.renderBody();
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
        const item = document.createElement('div');
        item.className = 'chat-item assistant';
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        const body = document.createElement('div');
        body.className = 'bubble';
        const summary = document.createElement('div');
        summary.className = 'summary';
        summary.textContent = msg.summary || (msg.applied ? 'Applied ✓' : (msg.text || 'Response'));
        body.appendChild(summary);
        if (msg.details && msg.details.length) {
          const details = document.createElement('div');
          details.className = 'details';
          details.textContent = msg.details.join(' ; ');
          body.appendChild(details);
        }
        item.appendChild(avatar);
        item.appendChild(body);
        return item;
      }
      const item = document.createElement('div');
      item.className = 'chat-item user';
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.textContent = msg.text;
      item.appendChild(bubble);
      return item;
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
          <button data-action="resume">Resume</button>
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
      if (action === 'resume') {
        this.eventBus.emit('session:resume', sessionId);
      } else if (action === 'rename') {
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

    createHandle() {
      if (this.handle) return;
      const button = document.createElement('button');
      button.id = 'lumi-dock-handle';
      button.type = 'button';
      button.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14 5 8 12 14 19"></polyline><line x1="16" y1="5" x2="16" y2="19"></line></svg>';
      button.setAttribute('aria-label', 'Expand Dock');
      button.style.cssText = `
      position: fixed;
      top: calc(50% - 24px);
      right: 18px;
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
      cursor: grab;
      z-index: 2147483646;
      user-select: none;
      transition: all 0.2s ease;
    `;
      button.addEventListener('mouseenter', () => {
        button.style.transform = 'scale(1.05)';
        button.style.boxShadow = 'var(--shadow-lg)';
      });
      button.addEventListener('mouseleave', () => {
        if (!this.handleDragState?.active) {
          button.style.transform = 'scale(1)';
          button.style.boxShadow = 'var(--shadow)';
        }
      });
      button.addEventListener('click', () => {
        if (this.handleDragState?.active) return;
        this.stateManager.set('ui.dockState', 'normal');
      });
      document.body.appendChild(button);
      this.handle = button;
      this.positionHandle(window.innerHeight / 2 - 26);
      this.setupHandleDrag();
    }

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
      button.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"></path><path d="M9 7v10"></path><path d="M15 7v10"></path></svg>';
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

    setupHandleDrag() {
      if (!this.handle) return;
      this.handleDragState = { active: false, moved: false, offsetY: 0 };
      this.handle.addEventListener('mousedown', (event) => {
        if (event.button !== 0) return;
        this.handleDragState.active = true;
        this.handleDragState.moved = false;
        const rect = this.handle.getBoundingClientRect();
        this.handleDragState.offsetY = event.clientY - rect.top;
        event.preventDefault();
      });
      window.addEventListener('mousemove', (event) => {
        if (!this.handleDragState?.active) return;
        this.handleDragState.moved = true;
        this.positionHandle(event.clientY - this.handleDragState.offsetY);
      });
      window.addEventListener('mouseup', (event) => {
        if (!this.handleDragState?.active) return;
        const moved = this.handleDragState.moved;
        this.handleDragState.active = false;
        if (!moved) {
          this.stateManager.set('ui.dockState', 'normal');
        }
      });
    }

    positionHandle(top) {
      if (!this.handle) return;
      const min = 24;
      const max = window.innerHeight - 60;
      const clamped = Math.min(max, Math.max(min, top));
      this.handle.style.top = `${clamped}px`;
    }

    renderChips(elements) {
      this.syncChips(elements);
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
      if (chips.length > elements.length) {
        for (let i = chips.length - 1; i >= elements.length; i -= 1) {
          const chip = chips[i];
          const next = chip.nextSibling;
          chip.remove();
          if (next && next.nodeType === Node.TEXT_NODE && /^\u00A0?$/.test(next.textContent || '')) {
            next.remove();
          }
        }
      } else if (elements.length > chips.length) {
        for (let i = chips.length; i < elements.length; i += 1) {
          this.appendChip(elements[i], i);
        }
      }
      const updatedChips = this.getChipNodes();
      updatedChips.forEach((chip, idx) => {
        const item = elements[idx];
        if (!item) return;
        this.decorateChip(chip, item, idx);
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

    appendChip(item, index) {
      if (!this.editorEl) return;
      const chip = this.createChipElement(item, index);
      this.editorEl.appendChild(chip);
      this.editorEl.appendChild(document.createTextNode('\u00A0'));
    }

    getChipNodes() {
      if (!this.editorEl) return [];
      return Array.from(this.editorEl.querySelectorAll('.chip'));
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
    soft: '0 6px 18px rgba(15,23,42,0.12)',
    medium: '0 12px 28px rgba(15,23,42,0.16)',
    deep: '0 24px 44px rgba(15,23,42,0.2)'
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
      width: 420px; /* updated dynamically in open() */
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
        <button type="button" id="dock-edit-reset" class="dock-edit-btn" style="border:1px solid var(--dock-stroke);background:color-mix(in srgb, var(--dock-bg) 94%, transparent);border-radius:12px;padding:6px 12px;color:var(--dock-fg-2);">Reset</button>
        <button type="button" id="dock-edit-apply" class="dock-edit-apply" style="border:1px solid var(--dock-stroke);background:var(--surface, color-mix(in srgb, var(--dock-bg) 96%, transparent));border-radius:12px;padding:6px 12px;color:var(--dock-fg);">Apply</button>
      </div>
    `;

      this.form = this.container.querySelector('#dock-edit-form');
      this.scrollContainer = this.container.querySelector('#dock-edit-scroll');
      this.container.querySelector('#dock-edit-close').addEventListener('click', () => this.close(true));
      this.container.querySelector('#dock-edit-reset').addEventListener('click', () => this.resetChanges());
      this.container.querySelector('#dock-edit-apply').addEventListener('click', () => this.applyChanges());

      // Prevent scroll events from bubbling to page
      this.container.addEventListener('wheel', (e) => {
        e.stopPropagation();
      }, { passive: true });
      
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

    positionOverlay() {
      try {
        const state = this.stateManager.get('ui.dockState');
        const dockWidth = state === 'compact' ? 56 : (this.stateManager.get('ui.dockWidth') || 420);
        this.backdrop.style.left = (window.innerWidth - dockWidth) + 'px';
        this.backdrop.style.width = dockWidth + 'px';
        // keep container aligned to right visually
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
      this.targets.forEach(({ element }, idx) => {
        const data = this.inline[idx];
        if (!data) return;
        element.textContent = data.text;
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

      form.appendChild(this.renderTextField('Text', 'text', base.text));
      form.appendChild(this.renderColorField('Text Color', 'color', base.color));
      form.appendChild(this.renderColorField('Background', 'backgroundColor', base.backgroundColor));
      form.appendChild(this.renderNumberField('Font Size (px)', 'fontSize', base.fontSize, { unit: 'px' }));
      form.appendChild(this.renderSelectField('Font Weight', 'fontWeight', base.fontWeight, ['300','400','500','600','700']));
      form.appendChild(this.renderNumberField('Line Height', 'lineHeight', base.lineHeight));

      form.appendChild(this.renderPaddingGroup(base));
      form.appendChild(this.renderNumberField('Border Radius (px)', 'borderRadius', base.borderRadius, {unit:'px'}));
      form.appendChild(this.renderShadowField(base.boxShadow));
    }

    renderTextField(label, key, value) {
      const wrapper = document.createElement('label');
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.gap = '6px';
      wrapper.innerHTML = `<span style="font-size:12px;color:var(--dock-fg-2);">${label}</span>`;
      const textarea = document.createElement('textarea');
      textarea.style.fontSize = '13px';
      textarea.style.padding = '8px 10px';
      textarea.style.border = '1px solid var(--dock-stroke)';
      textarea.style.borderRadius = '10px';
      textarea.style.background = 'color-mix(in srgb, var(--dock-bg) 96%, transparent)';
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
      wrapper.innerHTML = `<span style="font-size:12px;color:var(--dock-fg-2);">${label}</span>`;
      const input = document.createElement('input');
      input.type = 'color';
      input.value = this.toHex(value === 'mixed' ? '#999999' : value);
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
      wrapper.innerHTML = `<span style="font-size:12px;color:var(--dock-fg-2);">${label}</span>`;
      const input = document.createElement('input');
      input.type = 'number';
      input.style.padding = '6px 10px';
      input.style.border = '1px solid var(--dock-stroke)';
      input.style.borderRadius = '10px';
      input.style.background = 'color-mix(in srgb, var(--dock-bg) 96%, transparent)';
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
      wrapper.innerHTML = `<span style="font-size:12px;color:var(--dock-fg-2);">${label}</span>`;
      const select = document.createElement('select');
      select.style.padding = '6px 10px';
      select.style.border = '1px solid var(--dock-stroke)';
      select.style.borderRadius = '10px';
      select.style.background = 'color-mix(in srgb, var(--dock-bg) 96%, transparent)';
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
      this.targets.forEach(({ element }) => {
        if (changes.text !== undefined) {
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
    }

    resetChanges() {
      this.restoreBase();
      this.current = {};
      this.renderForm();
      this.syncPending();
    }

    applyChanges() {
      if (!this.targets.length) return;
      const changes = { ...this.current };
      Object.keys(changes).forEach(key => {
        if (changes[key] === undefined) delete changes[key];
      });
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
      this.close();
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
      if (!color) return '#000000';
      if (color.startsWith('#')) return color.length === 7 ? color : '#000000';
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.fillStyle = color;
      return ctx.fillStyle;
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
  }

  /**
   * LUMI Content Script v3.1 - Modular Architecture
   * Main orchestrator for all modules
   */


  if (window.LUMI_INJECTED) {
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
    try { window.__lumiEventBus = eventBus; } catch (_) {}

    // If the script is accidentally loaded in page context (no runtime), bail out early
    if (!chromeBridge.isRuntimeAvailable()) {
      console.warn('[LUMI] Chrome runtime not available in this context; skipping init');
      return;
    }

    // Initialize UI
    const topBanner = new TopBanner();
    let dockRoot = null;
    let editModal = null;
    // InteractionBubble removed for a simpler UX
    const styleApplier = new StyleApplier(eventBus);
    const styleHistory = new StyleHistory();

    // Initialize selection helpers (instantiated after UI mounts)
    const highlightManager = new HighlightManager(eventBus);
    let elementSelector = null;
    let screenshotSelector = null;

    // Initialize engine & health
    const engineManager = new EngineManager(eventBus, stateManager, chromeBridge);
    const healthChecker = new HealthChecker(eventBus, stateManager, chromeBridge, engineManager);

    ensureDefaultSession();

    function ensureDefaultSession() {
      let sessions = stateManager.get('sessions.list');
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
          snapshotTokens: []
        };
        stateManager.batch({
          'sessions.list': [session],
          'sessions.currentId': id
        });
        sessions = [session];
      }
      if (!stateManager.get('sessions.currentId') && sessions.length) {
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
      updateSessionById(sessionId, (session) => {
        session.transcript.push({ ...message, timestamp: message.timestamp || Date.now() });
        session.updatedAt = Date.now();
        if (message.role === 'assistant' && typeof message.applied === 'boolean') {
          session.lastAppliedOk = !!message.applied;
        }
      });
    }

    function formatEditDetails(edits = []) {
      const details = [];
      edits.forEach(entry => {
        const changes = entry?.changes || {};
        Object.entries(changes).forEach(([prop, value]) => {
          details.push(`${prop} → ${value}`);
        });
      });
      return details;
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
        highlightManager.clearAllSelections();
        const elements = stateManager.get('selection.elements');
        elements.forEach(item => highlightManager.addSelection(item.element));
      }

      // Selection events
      eventBus.on('element:selected', (item) => {
        const elements = stateManager.get('selection.elements') || [];
        const index = elements.findIndex((e) => e && e.element === item.element);
        if (dockRoot && index >= 0) {
          // Always insert chip at cursor position
          dockRoot.insertChipForElement(elements[index], index);
        }
        // no-op (bubble removed)
        stateManager.set('ui.dockState', 'normal');
        // Do not insert plain-text tokens into Dock input; chips reflect selection state.
      });

      // Handle remove event from InteractionBubble
      eventBus.on('element:remove', (index) => {
        const elements = stateManager.get('selection.elements') || [];
        if (index >= 0 && index < elements.length) {
          const updated = elements.filter((_, i) => i !== index);
          stateManager.set('selection.elements', updated);
          eventBus.emit('element:removed', index);
        }
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
        highlightManager.clearAll();
        if (dockRoot) {
          dockRoot.clearChips();
          dockRoot.updateSendState();
        }
        if (editModal) editModal.close();
        // no-op (bubble removed)
        stateManager.set('ui.dockState', 'normal');
      });

      eventBus.on('screenshot:captured', () => {
        if (dockRoot) dockRoot.updateSendState();
        const shots = stateManager.get('selection.screenshots') || [];
        const last = shots[shots.length - 1];
        if (last) {
          // Previously showed a confirm bubble; keep selection and return to normal state
          stateManager.set('ui.dockState', 'normal');
        }
      });

      eventBus.on('screenshot:removed', () => {
        if (dockRoot) dockRoot.updateSendState();
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
          snapshotTokens: tokens
        };
        const list = [session, ...(stateManager.get('sessions.list') || [])];
        stateManager.batch({
          'sessions.list': list,
          'sessions.currentId': id
        });
        if (dockRoot) dockRoot.clearInput();
      });

      eventBus.on('session:resume', (id) => {
        const sessions = stateManager.get('sessions.list') || [];
        if (!sessions.some(s => s.id === id)) return;
        stateManager.batch({
          'sessions.currentId': id,
          'ui.dockTab': 'chat'
        });
      });

      eventBus.on('session:rename', ({ id, title }) => {
        const value = (title || '').trim();
        if (!value) return;
        updateSessionById(id, (session) => {
          session.title = value;
          session.updatedAt = Date.now();
        });
      });

      eventBus.on('session:delete', (id) => {
        const list = (stateManager.get('sessions.list') || []).filter(session => session.id !== id);
        stateManager.set('sessions.list', list);
        const currentId = stateManager.get('sessions.currentId');
        if (currentId === id) {
          const nextId = list[0]?.id || null;
          stateManager.batch({
            'sessions.currentId': nextId,
            'ui.dockTab': nextId ? 'chat' : 'history'
          });
          if (!nextId) ensureDefaultSession();
        }
      });

      // Context tag click events
      eventBus.on('context-tag:element-clicked', (index) => {
        const elements = stateManager.get('selection.elements');
        const item = elements[index];
        if (item) {
          item.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          highlightManager.clearAll();
          elements.forEach(entry => highlightManager.addSelection(entry.element));
        }
      });

      eventBus.on('edit:open', (payload = {}) => {
        if (!editModal) return;
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
        if (!elementSelector || !screenshotSelector) return;
        const currentMode = stateManager.get('ui.mode');

        if (currentMode === 'element') {
          elementSelector.deactivate();
          // no-op (bubble removed)
        } else {
          screenshotSelector.deactivate();
          elementSelector.activate();
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

      // Dock events (legacy bubble hooks mapped to dock)
      eventBus.on('bubble:close', () => {
        stateManager.set('ui.dockOpen', false);
        if (dockRoot) dockRoot.setVisible(false);
        if (elementSelector) elementSelector.deactivate();
        if (screenshotSelector) screenshotSelector.deactivate();
        highlightManager.clearAll();
        // no-op (bubble removed)
        if (editModal) editModal.close();
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
        Object.entries(changes || {}).forEach(([prop, value]) => {
          if (prop === 'text') {
            element.textContent = value;
            committed[prop] = value;
            return;
          }
          styleApplier.apply(element, prop, value, context);
          committed[prop] = value;
        });
        if (Object.keys(committed).length) {
          styleHistory.push({ index, selector, changes: committed });
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
        if (dockRoot) dockRoot.updateSendState();
      });

      eventBus.on('wysiwyg:reset', () => {
        const pending = stateManager.get('wysiwyg.pending');
        if (pending && pending.index !== undefined) {
          const elements = stateManager.get('selection.elements');
          const item = elements[pending.index];
          if (item && item.element) {
            Object.entries(pending.changes || {}).forEach(([prop, value]) => {
              if (prop === 'text') {
                item.element.textContent = value;
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
        if (sessionId && intent && intent.trim()) {
          appendMessage(sessionId, {
            id: 'm' + Math.random().toString(36).slice(2),
            role: 'user',
            text: intent.trim()
          });
        }

        stateManager.set('processing.active', true);

        try {
          const pageInfo = {
            url: window.location.href,
            title: document.title
          };

          const lastScreenshot = screenshots.length ? screenshots[screenshots.length - 1] : null;
          const result = await serverClient.execute(
            engine,
            intent,
            elements,
            lastScreenshot,
            pageInfo,
            screenshots,
            edits
          );

          if (sessionId) {
            appendMessage(sessionId, {
              id: 'm' + Math.random().toString(36).slice(2),
              role: 'assistant',
              text: result.success ? 'Applied ✓' : (result.error || 'Request failed'),
              summary: result.success ? 'Applied ✓' : undefined,
              details: result.success ? formatEditDetails(edits) : [],
              applied: !!result.success
            });
            updateSessionById(sessionId, (session) => {
              session.snapshotTokens = selectionToTokens();
            });
          }

          if (result.success) {
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
            if (dockRoot) dockRoot.updateSendState();
            highlightManager.clearAll();
            if (editModal) editModal.close();
          } else {
            topBanner.update(result.error || 'Request failed');
            setTimeout(() => topBanner.hide(), 2200);
          }
        } catch (error) {
          console.error('[Content] Submit failed:', error);
          topBanner.update('Network error: ' + error.message);
          setTimeout(() => topBanner.hide(), 2200);
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
        highlightManager.clearAll();
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

    // Keyboard shortcuts
    function setupKeyboardShortcuts() {
      document.addEventListener('keydown', (e) => {
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

        // Cmd+K: Clear context
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
          eventBus.emit('context:clear');
          e.preventDefault();
        }
      });
    }

    // Initialize application
    async function init() {
      console.log('[LUMI] Initializing...');

      injectGlobalStyles();
      // Apply global dock theme tokens on page
      try { applyDockThemeAuto(); watchDockTheme(); } catch (_) {}

      // Mount UI components
      topBanner.mount();
      dockRoot = new DockRoot(eventBus, stateManager);
      dockRoot.mount();
      editModal = new DockEditModal(eventBus, stateManager, document.body);
      editModal.mount();
      // Interaction bubble removed

      // ControlsOverlay currently disabled; use highlight pen modal instead

      // Initialize selectors after UI is ready
      elementSelector = new ElementSelector(eventBus, stateManager, highlightManager, topBanner);
      screenshotSelector = new ScreenshotSelector(eventBus, stateManager, highlightManager, topBanner, chromeBridge);

      // Bind all events (after UI is mounted)
      bindEvents();

      // Setup keyboard shortcuts
      setupKeyboardShortcuts();

      // Listen for background messages
      chromeBridge.onMessage((message) => {
        if (message.type === 'TOGGLE_BUBBLE') {
          eventBus.emit('bubble:toggle');
        }
      });

      // Initialize engine (restore saved preference) - this will trigger engine:selected
      await engineManager.init();

      // Start health checker
      healthChecker.start();

      console.log('[LUMI] Initialized successfully');
    }

    // Start the application
    init().catch(error => {
      console.error('[LUMI] Initialization failed:', error);
    });
  }

})();
//# sourceMappingURL=content.js.map
