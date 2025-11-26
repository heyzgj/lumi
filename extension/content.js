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
      const sameRef = oldValue === value;
      if (!sameRef) {
        this._setNestedValue(this.state, path, value);
      }

      // Even when references match (objects/arrays mutated in place), still notify subscribers
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
        this.set(path, value, false);
      });

      // Single notification for all changes (aggregated payload)
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

      // Inline Text Editing
      halo.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Only allow if it's a text-like element
        if (element.children.length > 0 && !['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN', 'A', 'LI', 'BUTTON'].includes(element.tagName)) return;

        element.contentEditable = 'true';
        element.focus();

        // Disable pointer events on children to prevent link clicks
        const children = element.querySelectorAll('*');
        children.forEach(c => c.style.pointerEvents = 'none');

        // Temporarily hide halo while editing
        halo.style.display = 'none';

        const originalText = element.textContent;

        const finishEdit = () => {
          element.removeAttribute('contenteditable');
          // Restore pointer events
          children.forEach(c => c.style.pointerEvents = '');

          halo.style.display = 'block';

          const newText = element.textContent;
          if (newText !== originalText && this.eventBus) {
            const idx = resolveIndex();
            this.eventBus.emit('wysiwyg:apply', {
              index: idx,
              selector: this.readable(element),
              changes: { text: newText },
              summary: `Edit text content`
            });
          }

          element.removeEventListener('blur', finishEdit);
          element.removeEventListener('keydown', onKey);
          element.removeEventListener('input', onInput);
        };

        const onKey = (ke) => {
          if (ke.key === 'Enter' && !ke.shiftKey) {
            ke.preventDefault();
            element.blur(); // Triggers finishEdit
          }
          if (ke.key === 'Escape') {
            element.textContent = originalText;
            element.blur();
          }
        };

        const onInput = () => {
          if (this.eventBus) {
            this.eventBus.emit('wysiwyg:sync', { text: element.textContent });
          }
        };

        element.addEventListener('blur', finishEdit);
        element.addEventListener('keydown', onKey);
        element.addEventListener('input', onInput);
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
      try { this._mo.observe(this.doc.body, { attributes: true, childList: true, subtree: true }); } catch (_) { }
      this.win.addEventListener('scroll', this._onScroll, true);
      this.win.addEventListener('resize', this._onResize, true);
      if (this._extraScrollEl) {
        try { this._extraScrollEl.addEventListener('scroll', this._onScroll, { passive: true }); } catch (_) { }
      }
    }

    teardownObservers() {
      if (this._mo) { try { this._mo.disconnect(); } catch (_) { } this._mo = null; }
      this.win.removeEventListener('scroll', this._onScroll, true);
      this.win.removeEventListener('resize', this._onResize, true);
      if (this._extraScrollEl) {
        try { this._extraScrollEl.removeEventListener('scroll', this._onScroll); } catch (_) { }
      }
      if (this._raf) { this.win.cancelAnimationFrame ? this.win.cancelAnimationFrame(this._raf) : cancelAnimationFrame(this._raf); this._raf = null; }
    }

    setExtraScrollContainer(el) {
      if (this._extraScrollEl && this._extraScrollEl !== el) {
        try { this._extraScrollEl.removeEventListener('scroll', this._onScroll); } catch (_) { }
      }
      this._extraScrollEl = el || null;
      // If observers are active, attach immediately
      if (this._extraScrollEl && this._mo) {
        try { this._extraScrollEl.addEventListener('scroll', this._onScroll, { passive: true }); } catch (_) { }
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
        try { halo.style.borderRadius = this.win.getComputedStyle(el).borderRadius || '14px'; } catch (_) { }
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
        if (['input', 'textarea', 'img', 'video', 'canvas', 'svg'].includes(tag)) return false;
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
      ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu'].forEach(evt => {
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
      this._blockers.forEach(({ evt, block }) => {
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

  function t(t,e,s){return (e=function(t){var e=function(t,e){if("object"!=typeof t||!t)return t;var s=t[Symbol.toPrimitive];if(void 0!==s){var i=s.call(t,e);if("object"!=typeof i)return i;throw new TypeError("@@toPrimitive must return a primitive value.")}return ("string"===e?String:Number)(t)}(t,"string");return "symbol"==typeof e?e:e+""}(e))in t?Object.defineProperty(t,e,{value:s,enumerable:true,configurable:true,writable:true}):t[e]=s,t}function e(t,e){var s=Object.keys(t);if(Object.getOwnPropertySymbols){var i=Object.getOwnPropertySymbols(t);e&&(i=i.filter((function(e){return Object.getOwnPropertyDescriptor(t,e).enumerable}))),s.push.apply(s,i);}return s}function s(s){for(var i=1;i<arguments.length;i++){var r=null!=arguments[i]?arguments[i]:{};i%2?e(Object(r),true).forEach((function(e){t(s,e,r[e]);})):Object.getOwnPropertyDescriptors?Object.defineProperties(s,Object.getOwnPropertyDescriptors(r)):e(Object(r)).forEach((function(t){Object.defineProperty(s,t,Object.getOwnPropertyDescriptor(r,t));}));}return s}function i(t,e){if(null==t)return {};var s,i,r=function(t,e){if(null==t)return {};var s={};for(var i in t)if({}.hasOwnProperty.call(t,i)){if(e.indexOf(i)>=0)continue;s[i]=t[i];}return s}(t,e);if(Object.getOwnPropertySymbols){var n=Object.getOwnPropertySymbols(t);for(i=0;i<n.length;i++)s=n[i],e.indexOf(s)>=0||{}.propertyIsEnumerable.call(t,s)&&(r[s]=t[s]);}return r}function r(t,e){return e||(e=t.slice(0)),Object.freeze(Object.defineProperties(t,{raw:{value:Object.freeze(e)}}))}class n{constructor(){t(this,"browserShadowBlurConstant",1),t(this,"DPI",96),t(this,"devicePixelRatio","undefined"!=typeof window?window.devicePixelRatio:1),t(this,"perfLimitSizeTotal",2097152),t(this,"maxCacheSideLimit",4096),t(this,"minCacheSideLimit",256),t(this,"disableStyleCopyPaste",false),t(this,"enableGLFiltering",true),t(this,"textureSize",4096),t(this,"forceGLPutImageData",false),t(this,"cachesBoundsOfCurve",false),t(this,"fontPaths",{}),t(this,"NUM_FRACTION_DIGITS",4);}}const o=new class extends n{constructor(t){super(),this.configure(t);}configure(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};Object.assign(this,t);}addFonts(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};this.fontPaths=s(s({},this.fontPaths),t);}removeFonts(){(arguments.length>0&&void 0!==arguments[0]?arguments[0]:[]).forEach((t=>{delete this.fontPaths[t];}));}clearFonts(){this.fontPaths={};}restoreDefaults(t){const e=new n,s=(null==t?void 0:t.reduce(((t,s)=>(t[s]=e[s],t)),{}))||e;this.configure(s);}},a=function(t){for(var e=arguments.length,s=new Array(e>1?e-1:0),i=1;i<e;i++)s[i-1]=arguments[i];return console[t]("fabric",...s)};class h extends Error{constructor(t,e){super("fabric: ".concat(t),e);}}class c extends h{constructor(t){super("".concat(t," 'options.signal' is in 'aborted' state"));}}class l{}class u extends l{testPrecision(t,e){const s="precision ".concat(e," float;\nvoid main(){}"),i=t.createShader(t.FRAGMENT_SHADER);return !!i&&(t.shaderSource(i,s),t.compileShader(i),!!t.getShaderParameter(i,t.COMPILE_STATUS))}queryWebGL(t){const e=t.getContext("webgl");e&&(this.maxTextureSize=e.getParameter(e.MAX_TEXTURE_SIZE),this.GLPrecision=["highp","mediump","lowp"].find((t=>this.testPrecision(e,t))),e.getExtension("WEBGL_lose_context").loseContext(),a("log","WebGL: max texture size ".concat(this.maxTextureSize)));}isSupported(t){return !!this.maxTextureSize&&this.maxTextureSize>=t}}const d={};let g;const p=()=>g||(g={document:document,window:window,isTouchSupported:"ontouchstart"in window||"ontouchstart"in document||window&&window.navigator&&window.navigator.maxTouchPoints>0,WebGLProbe:new u,dispose(){},copyPasteData:d}),m=()=>p().document,v=()=>p().window,y=()=>{var t;return Math.max(null!==(t=o.devicePixelRatio)&&void 0!==t?t:v().devicePixelRatio,1)};const _=new class{constructor(){t(this,"boundsOfCurveCache",{}),this.charWidthsCache=new Map;}getFontCache(t){let{fontFamily:e,fontStyle:s,fontWeight:i}=t;e=e.toLowerCase();const r=this.charWidthsCache;r.has(e)||r.set(e,new Map);const n=r.get(e),o="".concat(s.toLowerCase(),"_").concat((i+"").toLowerCase());return n.has(o)||n.set(o,new Map),n.get(o)}clearFontCache(t){t?this.charWidthsCache.delete((t||"").toLowerCase()):this.charWidthsCache=new Map;}limitDimsByArea(t){const{perfLimitSizeTotal:e}=o,s=Math.sqrt(e*t);return [Math.floor(s),Math.floor(e/s)]}};const x="6.9.0";function C(){}const b=Math.PI/2,S=2*Math.PI,w=Math.PI/180,T=Object.freeze([1,0,0,1,0,0]),O=16,k=.4477152502,D="center",M="left",P="top",E="bottom",A="right",j="none",F=/\r?\n/,L="moving",R="scaling",I="rotating",B="rotate",X="skewing",Y="resizing",W="modifyPoly",V="modifyPath",z="changed",G="scale",H="scaleX",N="scaleY",U="skewX",q="skewY",K="fill",J="stroke",Q="modified",Z="json",$="svg";const tt=new class{constructor(){this[Z]=new Map,this[$]=new Map;}has(t){return this[Z].has(t)}getClass(t){const e=this[Z].get(t);if(!e)throw new h("No class registered for ".concat(t));return e}setClass(t,e){e?this[Z].set(e,t):(this[Z].set(t.type,t),this[Z].set(t.type.toLowerCase(),t));}getSVGClass(t){return this[$].get(t)}setSVGClass(t,e){this[$].set(null!=e?e:t.type.toLowerCase(),t);}};const et=new class extends Array{remove(t){const e=this.indexOf(t);e>-1&&this.splice(e,1);}cancelAll(){const t=this.splice(0);return t.forEach((t=>t.abort())),t}cancelByCanvas(t){if(!t)return [];const e=this.filter((e=>{var s;return e.target===t||"object"==typeof e.target&&(null===(s=e.target)||void 0===s?void 0:s.canvas)===t}));return e.forEach((t=>t.abort())),e}cancelByTarget(t){if(!t)return [];const e=this.filter((e=>e.target===t));return e.forEach((t=>t.abort())),e}};class st{constructor(){t(this,"__eventListeners",{});}on(t,e){if(this.__eventListeners||(this.__eventListeners={}),"object"==typeof t)return Object.entries(t).forEach((t=>{let[e,s]=t;this.on(e,s);})),()=>this.off(t);if(e){const s=t;return this.__eventListeners[s]||(this.__eventListeners[s]=[]),this.__eventListeners[s].push(e),()=>this.off(s,e)}return ()=>false}once(t,e){if("object"==typeof t){const e=[];return Object.entries(t).forEach((t=>{let[s,i]=t;e.push(this.once(s,i));})),()=>e.forEach((t=>t()))}if(e){const s=this.on(t,(function(){for(var t=arguments.length,i=new Array(t),r=0;r<t;r++)i[r]=arguments[r];e.call(this,...i),s();}));return s}return ()=>false}_removeEventListener(t,e){if(this.__eventListeners[t])if(e){const s=this.__eventListeners[t],i=s.indexOf(e);i>-1&&s.splice(i,1);}else this.__eventListeners[t]=[];}off(t,e){if(this.__eventListeners)if(void 0===t)for(const t in this.__eventListeners)this._removeEventListener(t);else "object"==typeof t?Object.entries(t).forEach((t=>{let[e,s]=t;this._removeEventListener(e,s);})):this._removeEventListener(t,e);}fire(t,e){var s;if(!this.__eventListeners)return;const i=null===(s=this.__eventListeners[t])||void 0===s?void 0:s.concat();if(i)for(let t=0;t<i.length;t++)i[t].call(this,e||{});}}const it=(t,e)=>{const s=t.indexOf(e);return  -1!==s&&t.splice(s,1),t},rt=t=>{if(0===t)return 1;switch(Math.abs(t)/b){case 1:case 3:return 0;case 2:return  -1}return Math.cos(t)},nt=t=>{if(0===t)return 0;const e=t/b,s=Math.sign(t);switch(e){case 1:return s;case 2:return 0;case 3:return -s}return Math.sin(t)};class ot{constructor(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:0,e=arguments.length>1&&void 0!==arguments[1]?arguments[1]:0;"object"==typeof t?(this.x=t.x,this.y=t.y):(this.x=t,this.y=e);}add(t){return new ot(this.x+t.x,this.y+t.y)}addEquals(t){return this.x+=t.x,this.y+=t.y,this}scalarAdd(t){return new ot(this.x+t,this.y+t)}scalarAddEquals(t){return this.x+=t,this.y+=t,this}subtract(t){return new ot(this.x-t.x,this.y-t.y)}subtractEquals(t){return this.x-=t.x,this.y-=t.y,this}scalarSubtract(t){return new ot(this.x-t,this.y-t)}scalarSubtractEquals(t){return this.x-=t,this.y-=t,this}multiply(t){return new ot(this.x*t.x,this.y*t.y)}scalarMultiply(t){return new ot(this.x*t,this.y*t)}scalarMultiplyEquals(t){return this.x*=t,this.y*=t,this}divide(t){return new ot(this.x/t.x,this.y/t.y)}scalarDivide(t){return new ot(this.x/t,this.y/t)}scalarDivideEquals(t){return this.x/=t,this.y/=t,this}eq(t){return this.x===t.x&&this.y===t.y}lt(t){return this.x<t.x&&this.y<t.y}lte(t){return this.x<=t.x&&this.y<=t.y}gt(t){return this.x>t.x&&this.y>t.y}gte(t){return this.x>=t.x&&this.y>=t.y}lerp(t){let e=arguments.length>1&&void 0!==arguments[1]?arguments[1]:.5;return e=Math.max(Math.min(1,e),0),new ot(this.x+(t.x-this.x)*e,this.y+(t.y-this.y)*e)}distanceFrom(t){const e=this.x-t.x,s=this.y-t.y;return Math.sqrt(e*e+s*s)}midPointFrom(t){return this.lerp(t)}min(t){return new ot(Math.min(this.x,t.x),Math.min(this.y,t.y))}max(t){return new ot(Math.max(this.x,t.x),Math.max(this.y,t.y))}toString(){return "".concat(this.x,",").concat(this.y)}setXY(t,e){return this.x=t,this.y=e,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setFromPoint(t){return this.x=t.x,this.y=t.y,this}swap(t){const e=this.x,s=this.y;this.x=t.x,this.y=t.y,t.x=e,t.y=s;}clone(){return new ot(this.x,this.y)}rotate(t){let e=arguments.length>1&&void 0!==arguments[1]?arguments[1]:at;const s=nt(t),i=rt(t),r=this.subtract(e);return new ot(r.x*i-r.y*s,r.x*s+r.y*i).add(e)}transform(t){let e=arguments.length>1&&void 0!==arguments[1]&&arguments[1];return new ot(t[0]*this.x+t[2]*this.y+(e?0:t[4]),t[1]*this.x+t[3]*this.y+(e?0:t[5]))}}const at=new ot(0,0),ht=t=>!!t&&Array.isArray(t._objects);function ct(e){class s extends e{constructor(){super(...arguments),t(this,"_objects",[]);}_onObjectAdded(t){}_onObjectRemoved(t){}_onStackOrderChanged(t){}add(){for(var t=arguments.length,e=new Array(t),s=0;s<t;s++)e[s]=arguments[s];const i=this._objects.push(...e);return e.forEach((t=>this._onObjectAdded(t))),i}insertAt(t){for(var e=arguments.length,s=new Array(e>1?e-1:0),i=1;i<e;i++)s[i-1]=arguments[i];return this._objects.splice(t,0,...s),s.forEach((t=>this._onObjectAdded(t))),this._objects.length}remove(){const t=this._objects,e=[];for(var s=arguments.length,i=new Array(s),r=0;r<s;r++)i[r]=arguments[r];return i.forEach((s=>{const i=t.indexOf(s);-1!==i&&(t.splice(i,1),e.push(s),this._onObjectRemoved(s));})),e}forEachObject(t){this.getObjects().forEach(((e,s,i)=>t(e,s,i)));}getObjects(){for(var t=arguments.length,e=new Array(t),s=0;s<t;s++)e[s]=arguments[s];return 0===e.length?[...this._objects]:this._objects.filter((t=>t.isType(...e)))}item(t){return this._objects[t]}isEmpty(){return 0===this._objects.length}size(){return this._objects.length}contains(t,e){return !!this._objects.includes(t)||!!e&&this._objects.some((e=>e instanceof s&&e.contains(t,true)))}complexity(){return this._objects.reduce(((t,e)=>t+=e.complexity?e.complexity():0),0)}sendObjectToBack(t){return !(!t||t===this._objects[0])&&(it(this._objects,t),this._objects.unshift(t),this._onStackOrderChanged(t),true)}bringObjectToFront(t){return !(!t||t===this._objects[this._objects.length-1])&&(it(this._objects,t),this._objects.push(t),this._onStackOrderChanged(t),true)}sendObjectBackwards(t,e){if(!t)return  false;const s=this._objects.indexOf(t);if(0!==s){const i=this.findNewLowerIndex(t,s,e);return it(this._objects,t),this._objects.splice(i,0,t),this._onStackOrderChanged(t),true}return  false}bringObjectForward(t,e){if(!t)return  false;const s=this._objects.indexOf(t);if(s!==this._objects.length-1){const i=this.findNewUpperIndex(t,s,e);return it(this._objects,t),this._objects.splice(i,0,t),this._onStackOrderChanged(t),true}return  false}moveObjectTo(t,e){return t!==this._objects[e]&&(it(this._objects,t),this._objects.splice(e,0,t),this._onStackOrderChanged(t),true)}findNewLowerIndex(t,e,s){let i;if(s){i=e;for(let s=e-1;s>=0;--s)if(t.isOverlapping(this._objects[s])){i=s;break}}else i=e-1;return i}findNewUpperIndex(t,e,s){let i;if(s){i=e;for(let s=e+1;s<this._objects.length;++s)if(t.isOverlapping(this._objects[s])){i=s;break}}else i=e+1;return i}collectObjects(t){let{left:e,top:s,width:i,height:r}=t,{includeIntersecting:n=true}=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{};const o=[],a=new ot(e,s),h=a.add(new ot(i,r));for(let t=this._objects.length-1;t>=0;t--){const e=this._objects[t];e.selectable&&e.visible&&(n&&e.intersectsWithRect(a,h)||e.isContainedWithinRect(a,h)||n&&e.containsPoint(a)||n&&e.containsPoint(h))&&o.push(e);}return o}}return s}class lt extends st{_setOptions(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};for(const e in t)this.set(e,t[e]);}_setObject(t){for(const e in t)this._set(e,t[e]);}set(t,e){return "object"==typeof t?this._setObject(t):this._set(t,e),this}_set(t,e){this[t]=e;}toggle(t){const e=this.get(t);return "boolean"==typeof e&&this.set(t,!e),this}get(t){return this[t]}}function ut(t){return v().requestAnimationFrame(t)}function dt(t){return v().cancelAnimationFrame(t)}let gt=0;const ft=()=>gt++,pt=()=>{const t=m().createElement("canvas");if(!t||void 0===t.getContext)throw new h("Failed to create `canvas` element");return t},mt=()=>m().createElement("img"),vt=t=>{const e=pt();return e.width=t.width,e.height=t.height,e},yt=(t,e,s)=>t.toDataURL("image/".concat(e),s),_t=(t,e,s)=>new Promise(((i,r)=>{t.toBlob(i,"image/".concat(e),s);})),xt=t=>t*w,Ct=t=>t/w,bt=t=>t.every(((t,e)=>t===T[e])),St=(t,e,s)=>new ot(t).transform(e,s),wt=t=>{const e=1/(t[0]*t[3]-t[1]*t[2]),s=[e*t[3],-e*t[1],-e*t[2],e*t[0],0,0],{x:i,y:r}=new ot(t[4],t[5]).transform(s,true);return s[4]=-i,s[5]=-r,s},Tt=(t,e,s)=>[t[0]*e[0]+t[2]*e[1],t[1]*e[0]+t[3]*e[1],t[0]*e[2]+t[2]*e[3],t[1]*e[2]+t[3]*e[3],s?0:t[0]*e[4]+t[2]*e[5]+t[4],s?0:t[1]*e[4]+t[3]*e[5]+t[5]],Ot=(t,e)=>t.reduceRight(((t,s)=>s&&t?Tt(s,t,e):s||t),void 0)||T.concat(),kt=t=>{let[e,s]=t;return Math.atan2(s,e)},Dt=t=>{const e=kt(t),s=Math.pow(t[0],2)+Math.pow(t[1],2),i=Math.sqrt(s),r=(t[0]*t[3]-t[2]*t[1])/i,n=Math.atan2(t[0]*t[2]+t[1]*t[3],s);return {angle:Ct(e),scaleX:i,scaleY:r,skewX:Ct(n),skewY:0,translateX:t[4]||0,translateY:t[5]||0}},Mt=function(t){return [1,0,0,1,t,arguments.length>1&&void 0!==arguments[1]?arguments[1]:0]};function Pt(){let{angle:t=0}=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{},{x:e=0,y:s=0}=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{};const i=xt(t),r=rt(i),n=nt(i);return [r,n,-n,r,e?e-(r*e-n*s):0,s?s-(n*e+r*s):0]}const Et=function(t){return [t,0,0,arguments.length>1&&void 0!==arguments[1]?arguments[1]:t,0,0]},At=t=>Math.tan(xt(t)),jt=t=>[1,0,At(t),1,0,0],Ft=t=>[1,At(t),0,1,0,0],Lt=t=>{let{scaleX:e=1,scaleY:s=1,flipX:i=false,flipY:r=false,skewX:n=0,skewY:o=0}=t,a=Et(i?-e:e,r?-s:s);return n&&(a=Tt(a,jt(n),true)),o&&(a=Tt(a,Ft(o),true)),a},Rt=t=>{const{translateX:e=0,translateY:s=0,angle:i=0}=t;let r=Mt(e,s);i&&(r=Tt(r,Pt({angle:i})));const n=Lt(t);return bt(n)||(r=Tt(r,n)),r},It=function(t){let{signal:e,crossOrigin:s=null}=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{};return new Promise((function(i,r){if(e&&e.aborted)return r(new c("loadImage"));const n=mt();let o;e&&(o=function(t){n.src="",r(t);},e.addEventListener("abort",o,{once:true}));const a=function(){n.onload=n.onerror=null,o&&(null==e||e.removeEventListener("abort",o)),i(n);};t?(n.onload=a,n.onerror=function(){o&&(null==e||e.removeEventListener("abort",o)),r(new h("Error loading ".concat(n.src)));},s&&(n.crossOrigin=s),n.src=t):a();}))},Bt=function(t){let{signal:e,reviver:s=C}=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{};return new Promise(((i,r)=>{const n=[];e&&e.addEventListener("abort",r,{once:true}),Promise.all(t.map((t=>tt.getClass(t.type).fromObject(t,{signal:e}).then((e=>(s(t,e),n.push(e),e)))))).then(i).catch((t=>{n.forEach((t=>{t.dispose&&t.dispose();})),r(t);})).finally((()=>{e&&e.removeEventListener("abort",r);}));}))},Xt=function(t){let{signal:e}=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{};return new Promise(((s,i)=>{const r=[];e&&e.addEventListener("abort",i,{once:true});const n=Object.values(t).map((t=>t&&t.type&&tt.has(t.type)?Bt([t],{signal:e}).then((t=>{let[e]=t;return r.push(e),e})):t)),o=Object.keys(t);Promise.all(n).then((t=>t.reduce(((t,e,s)=>(t[o[s]]=e,t)),{}))).then(s).catch((t=>{r.forEach((t=>{t.dispose&&t.dispose();})),i(t);})).finally((()=>{e&&e.removeEventListener("abort",i);}));}))},Yt=function(t){return (arguments.length>1&&void 0!==arguments[1]?arguments[1]:[]).reduce(((e,s)=>(s in t&&(e[s]=t[s]),e)),{})},Wt=(t,e)=>Object.keys(t).reduce(((s,i)=>(e(t[i],i,t)&&(s[i]=t[i]),s)),{}),Vt=(t,e)=>parseFloat(Number(t).toFixed(e)),zt=t=>"matrix("+t.map((t=>Vt(t,o.NUM_FRACTION_DIGITS))).join(" ")+")",Gt=t=>!!t&&void 0!==t.toLive,Ht=t=>!!t&&"function"==typeof t.toObject,Nt=t=>!!t&&void 0!==t.offsetX&&"source"in t,Ut=t=>!!t&&"multiSelectionStacking"in t;function qt(t){const e=t&&Kt(t);let s=0,i=0;if(!t||!e)return {left:s,top:i};let r=t;const n=e.documentElement,o=e.body||{scrollLeft:0,scrollTop:0};for(;r&&(r.parentNode||r.host)&&(r=r.parentNode||r.host,r===e?(s=o.scrollLeft||n.scrollLeft||0,i=o.scrollTop||n.scrollTop||0):(s+=r.scrollLeft||0,i+=r.scrollTop||0),1!==r.nodeType||"fixed"!==r.style.position););return {left:s,top:i}}const Kt=t=>t.ownerDocument||null,Jt=t=>{var e;return (null===(e=t.ownerDocument)||void 0===e?void 0:e.defaultView)||null},Qt=function(t,e,s){let{width:i,height:r}=s,n=arguments.length>3&&void 0!==arguments[3]?arguments[3]:1;t.width=i,t.height=r,n>1&&(t.setAttribute("width",(i*n).toString()),t.setAttribute("height",(r*n).toString()),e.scale(n,n));},Zt=(t,e)=>{let{width:s,height:i}=e;s&&(t.style.width="number"==typeof s?"".concat(s,"px"):s),i&&(t.style.height="number"==typeof i?"".concat(i,"px"):i);};function $t(t){return void 0!==t.onselectstart&&(t.onselectstart=()=>false),t.style.userSelect=j,t}class te{constructor(e){t(this,"_originalCanvasStyle",void 0),t(this,"lower",void 0);const s=this.createLowerCanvas(e);this.lower={el:s,ctx:s.getContext("2d")};}createLowerCanvas(t){const e=(s=t)&&void 0!==s.getContext?t:t&&m().getElementById(t)||pt();var s;if(e.hasAttribute("data-fabric"))throw new h("Trying to initialize a canvas that has already been initialized. Did you forget to dispose the canvas?");return this._originalCanvasStyle=e.style.cssText,e.setAttribute("data-fabric","main"),e.classList.add("lower-canvas"),e}cleanupDOM(t){let{width:e,height:s}=t;const{el:i}=this.lower;i.classList.remove("lower-canvas"),i.removeAttribute("data-fabric"),i.setAttribute("width","".concat(e)),i.setAttribute("height","".concat(s)),i.style.cssText=this._originalCanvasStyle||"",this._originalCanvasStyle=void 0;}setDimensions(t,e){const{el:s,ctx:i}=this.lower;Qt(s,i,t,e);}setCSSDimensions(t){Zt(this.lower.el,t);}calcOffset(){return function(t){var e;const s=t&&Kt(t),i={left:0,top:0};if(!s)return i;const r=(null===(e=Jt(t))||void 0===e?void 0:e.getComputedStyle(t,null))||{};i.left+=parseInt(r.borderLeftWidth,10)||0,i.top+=parseInt(r.borderTopWidth,10)||0,i.left+=parseInt(r.paddingLeft,10)||0,i.top+=parseInt(r.paddingTop,10)||0;let n={left:0,top:0};const o=s.documentElement;void 0!==t.getBoundingClientRect&&(n=t.getBoundingClientRect());const a=qt(t);return {left:n.left+a.left-(o.clientLeft||0)+i.left,top:n.top+a.top-(o.clientTop||0)+i.top}}(this.lower.el)}dispose(){p().dispose(this.lower.el),delete this.lower;}}const ee={backgroundVpt:true,backgroundColor:"",overlayVpt:true,overlayColor:"",includeDefaultValues:true,svgViewportTransformation:true,renderOnAddRemove:true,skipOffscreen:true,enableRetinaScaling:true,imageSmoothingEnabled:true,controlsAboveOverlay:false,allowTouchScrolling:false,viewportTransform:[...T]},se=["objects"];class ie extends(ct(lt)){get lowerCanvasEl(){var t;return null===(t=this.elements.lower)||void 0===t?void 0:t.el}get contextContainer(){var t;return null===(t=this.elements.lower)||void 0===t?void 0:t.ctx}static getDefaults(){return ie.ownDefaults}constructor(t){let e=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{};super(),Object.assign(this,this.constructor.getDefaults()),this.set(e),this.initElements(t),this._setDimensionsImpl({width:this.width||this.elements.lower.el.width||0,height:this.height||this.elements.lower.el.height||0}),this.skipControlsDrawing=false,this.viewportTransform=[...this.viewportTransform],this.calcViewportBoundaries();}initElements(t){this.elements=new te(t);}add(){const t=super.add(...arguments);return arguments.length>0&&this.renderOnAddRemove&&this.requestRenderAll(),t}insertAt(t){for(var e=arguments.length,s=new Array(e>1?e-1:0),i=1;i<e;i++)s[i-1]=arguments[i];const r=super.insertAt(t,...s);return s.length>0&&this.renderOnAddRemove&&this.requestRenderAll(),r}remove(){const t=super.remove(...arguments);return t.length>0&&this.renderOnAddRemove&&this.requestRenderAll(),t}_onObjectAdded(t){t.canvas&&t.canvas!==this&&(a("warn","Canvas is trying to add an object that belongs to a different canvas.\nResulting to default behavior: removing object from previous canvas and adding to new canvas"),t.canvas.remove(t)),t._set("canvas",this),t.setCoords(),this.fire("object:added",{target:t}),t.fire("added",{target:this});}_onObjectRemoved(t){t._set("canvas",void 0),this.fire("object:removed",{target:t}),t.fire("removed",{target:this});}_onStackOrderChanged(){this.renderOnAddRemove&&this.requestRenderAll();}getRetinaScaling(){return this.enableRetinaScaling?y():1}calcOffset(){return this._offset=this.elements.calcOffset()}getWidth(){return this.width}getHeight(){return this.height}setWidth(t,e){return this.setDimensions({width:t},e)}setHeight(t,e){return this.setDimensions({height:t},e)}_setDimensionsImpl(t){let{cssOnly:e=false,backstoreOnly:i=false}=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{};if(!e){const e=s({width:this.width,height:this.height},t);this.elements.setDimensions(e,this.getRetinaScaling()),this.hasLostContext=true,this.width=e.width,this.height=e.height;}i||this.elements.setCSSDimensions(t),this.calcOffset();}setDimensions(t,e){this._setDimensionsImpl(t,e),e&&e.cssOnly||this.requestRenderAll();}getZoom(){return this.viewportTransform[0]}setViewportTransform(t){this.viewportTransform=t,this.calcViewportBoundaries(),this.renderOnAddRemove&&this.requestRenderAll();}zoomToPoint(t,e){const s=t,i=[...this.viewportTransform],r=St(t,wt(i));i[0]=e,i[3]=e;const n=St(r,i);i[4]+=s.x-n.x,i[5]+=s.y-n.y,this.setViewportTransform(i);}setZoom(t){this.zoomToPoint(new ot(0,0),t);}absolutePan(t){const e=[...this.viewportTransform];return e[4]=-t.x,e[5]=-t.y,this.setViewportTransform(e)}relativePan(t){return this.absolutePan(new ot(-t.x-this.viewportTransform[4],-t.y-this.viewportTransform[5]))}getElement(){return this.elements.lower.el}clearContext(t){t.clearRect(0,0,this.width,this.height);}getContext(){return this.elements.lower.ctx}clear(){this.remove(...this.getObjects()),this.backgroundImage=void 0,this.overlayImage=void 0,this.backgroundColor="",this.overlayColor="",this.clearContext(this.getContext()),this.fire("canvas:cleared"),this.renderOnAddRemove&&this.requestRenderAll();}renderAll(){this.cancelRequestedRender(),this.destroyed||this.renderCanvas(this.getContext(),this._objects);}renderAndReset(){this.nextRenderHandle=0,this.renderAll();}requestRenderAll(){this.nextRenderHandle||this.disposed||this.destroyed||(this.nextRenderHandle=ut((()=>this.renderAndReset())));}calcViewportBoundaries(){const t=this.width,e=this.height,s=wt(this.viewportTransform),i=St({x:0,y:0},s),r=St({x:t,y:e},s),n=i.min(r),o=i.max(r);return this.vptCoords={tl:n,tr:new ot(o.x,n.y),bl:new ot(n.x,o.y),br:o}}cancelRequestedRender(){this.nextRenderHandle&&(dt(this.nextRenderHandle),this.nextRenderHandle=0);}drawControls(t){}renderCanvas(t,e){if(this.destroyed)return;const s=this.viewportTransform,i=this.clipPath;this.calcViewportBoundaries(),this.clearContext(t),t.imageSmoothingEnabled=this.imageSmoothingEnabled,t.patternQuality="best",this.fire("before:render",{ctx:t}),this._renderBackground(t),t.save(),t.transform(s[0],s[1],s[2],s[3],s[4],s[5]),this._renderObjects(t,e),t.restore(),this.controlsAboveOverlay||this.skipControlsDrawing||this.drawControls(t),i&&(i._set("canvas",this),i.shouldCache(),i._transformDone=true,i.renderCache({forClipping:true}),this.drawClipPathOnCanvas(t,i)),this._renderOverlay(t),this.controlsAboveOverlay&&!this.skipControlsDrawing&&this.drawControls(t),this.fire("after:render",{ctx:t}),this.__cleanupTask&&(this.__cleanupTask(),this.__cleanupTask=void 0);}drawClipPathOnCanvas(t,e){const s=this.viewportTransform;t.save(),t.transform(...s),t.globalCompositeOperation="destination-in",e.transform(t),t.scale(1/e.zoomX,1/e.zoomY),t.drawImage(e._cacheCanvas,-e.cacheTranslationX,-e.cacheTranslationY),t.restore();}_renderObjects(t,e){for(let s=0,i=e.length;s<i;++s)e[s]&&e[s].render(t);}_renderBackgroundOrOverlay(t,e){const s=this["".concat(e,"Color")],i=this["".concat(e,"Image")],r=this.viewportTransform,n=this["".concat(e,"Vpt")];if(!s&&!i)return;const o=Gt(s);if(s){if(t.save(),t.beginPath(),t.moveTo(0,0),t.lineTo(this.width,0),t.lineTo(this.width,this.height),t.lineTo(0,this.height),t.closePath(),t.fillStyle=o?s.toLive(t):s,n&&t.transform(...r),o){t.transform(1,0,0,1,s.offsetX||0,s.offsetY||0);const e=s.gradientTransform||s.patternTransform;e&&t.transform(...e);}t.fill(),t.restore();}if(i){t.save();const{skipOffscreen:e}=this;this.skipOffscreen=n,n&&t.transform(...r),i.render(t),this.skipOffscreen=e,t.restore();}}_renderBackground(t){this._renderBackgroundOrOverlay(t,"background");}_renderOverlay(t){this._renderBackgroundOrOverlay(t,"overlay");}getCenter(){return {top:this.height/2,left:this.width/2}}getCenterPoint(){return new ot(this.width/2,this.height/2)}centerObjectH(t){return this._centerObject(t,new ot(this.getCenterPoint().x,t.getCenterPoint().y))}centerObjectV(t){return this._centerObject(t,new ot(t.getCenterPoint().x,this.getCenterPoint().y))}centerObject(t){return this._centerObject(t,this.getCenterPoint())}viewportCenterObject(t){return this._centerObject(t,this.getVpCenter())}viewportCenterObjectH(t){return this._centerObject(t,new ot(this.getVpCenter().x,t.getCenterPoint().y))}viewportCenterObjectV(t){return this._centerObject(t,new ot(t.getCenterPoint().x,this.getVpCenter().y))}getVpCenter(){return St(this.getCenterPoint(),wt(this.viewportTransform))}_centerObject(t,e){t.setXY(e,D,D),t.setCoords(),this.renderOnAddRemove&&this.requestRenderAll();}toDatalessJSON(t){return this.toDatalessObject(t)}toObject(t){return this._toObjectMethod("toObject",t)}toJSON(){return this.toObject()}toDatalessObject(t){return this._toObjectMethod("toDatalessObject",t)}_toObjectMethod(t,e){const i=this.clipPath,r=i&&!i.excludeFromExport?this._toObject(i,t,e):null;return s(s(s({version:x},Yt(this,e)),{},{objects:this._objects.filter((t=>!t.excludeFromExport)).map((s=>this._toObject(s,t,e)))},this.__serializeBgOverlay(t,e)),r?{clipPath:r}:null)}_toObject(t,e,s){let i;this.includeDefaultValues||(i=t.includeDefaultValues,t.includeDefaultValues=false);const r=t[e](s);return this.includeDefaultValues||(t.includeDefaultValues=!!i),r}__serializeBgOverlay(t,e){const s={},i=this.backgroundImage,r=this.overlayImage,n=this.backgroundColor,o=this.overlayColor;return Gt(n)?n.excludeFromExport||(s.background=n.toObject(e)):n&&(s.background=n),Gt(o)?o.excludeFromExport||(s.overlay=o.toObject(e)):o&&(s.overlay=o),i&&!i.excludeFromExport&&(s.backgroundImage=this._toObject(i,t,e)),r&&!r.excludeFromExport&&(s.overlayImage=this._toObject(r,t,e)),s}toSVG(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{},e=arguments.length>1?arguments[1]:void 0;t.reviver=e;const s=[];return this._setSVGPreamble(s,t),this._setSVGHeader(s,t),this.clipPath&&s.push('<g clip-path="url(#'.concat(this.clipPath.clipPathId,')" >\n')),this._setSVGBgOverlayColor(s,"background"),this._setSVGBgOverlayImage(s,"backgroundImage",e),this._setSVGObjects(s,e),this.clipPath&&s.push("</g>\n"),this._setSVGBgOverlayColor(s,"overlay"),this._setSVGBgOverlayImage(s,"overlayImage",e),s.push("</svg>"),s.join("")}_setSVGPreamble(t,e){e.suppressPreamble||t.push('<?xml version="1.0" encoding="',e.encoding||"UTF-8",'" standalone="no" ?>\n','<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" ','"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n');}_setSVGHeader(t,e){const s=e.width||"".concat(this.width),i=e.height||"".concat(this.height),r=o.NUM_FRACTION_DIGITS,n=e.viewBox;let a;if(n)a='viewBox="'.concat(n.x," ").concat(n.y," ").concat(n.width," ").concat(n.height,'" ');else if(this.svgViewportTransformation){const t=this.viewportTransform;a='viewBox="'.concat(Vt(-t[4]/t[0],r)," ").concat(Vt(-t[5]/t[3],r)," ").concat(Vt(this.width/t[0],r)," ").concat(Vt(this.height/t[3],r),'" ');}else a='viewBox="0 0 '.concat(this.width," ").concat(this.height,'" ');t.push("<svg ",'xmlns="http://www.w3.org/2000/svg" ','xmlns:xlink="http://www.w3.org/1999/xlink" ','version="1.1" ','width="',s,'" ','height="',i,'" ',a,'xml:space="preserve">\n',"<desc>Created with Fabric.js ",x,"</desc>\n","<defs>\n",this.createSVGFontFacesMarkup(),this.createSVGRefElementsMarkup(),this.createSVGClipPathMarkup(e),"</defs>\n");}createSVGClipPathMarkup(t){const e=this.clipPath;return e?(e.clipPathId="CLIPPATH_".concat(ft()),'<clipPath id="'.concat(e.clipPathId,'" >\n').concat(e.toClipPathSVG(t.reviver),"</clipPath>\n")):""}createSVGRefElementsMarkup(){return ["background","overlay"].map((t=>{const e=this["".concat(t,"Color")];if(Gt(e)){const s=this["".concat(t,"Vpt")],i=this.viewportTransform,r={isType:()=>false,width:this.width/(s?i[0]:1),height:this.height/(s?i[3]:1)};return e.toSVG(r,{additionalTransform:s?zt(i):""})}})).join("")}createSVGFontFacesMarkup(){const t=[],e={},s=o.fontPaths;this._objects.forEach((function e(s){t.push(s),ht(s)&&s._objects.forEach(e);})),t.forEach((t=>{if(!(i=t)||"function"!=typeof i._renderText)return;var i;const{styles:r,fontFamily:n}=t;!e[n]&&s[n]&&(e[n]=true,r&&Object.values(r).forEach((t=>{Object.values(t).forEach((t=>{let{fontFamily:i=""}=t;!e[i]&&s[i]&&(e[i]=true);}));})));}));const i=Object.keys(e).map((t=>"\t\t@font-face {\n\t\t\tfont-family: '".concat(t,"';\n\t\t\tsrc: url('").concat(s[t],"');\n\t\t}\n"))).join("");return i?'\t<style type="text/css"><![CDATA[\n'.concat(i,"]]></style>\n"):""}_setSVGObjects(t,e){this.forEachObject((s=>{s.excludeFromExport||this._setSVGObject(t,s,e);}));}_setSVGObject(t,e,s){t.push(e.toSVG(s));}_setSVGBgOverlayImage(t,e,s){const i=this[e];i&&!i.excludeFromExport&&i.toSVG&&t.push(i.toSVG(s));}_setSVGBgOverlayColor(t,e){const s=this["".concat(e,"Color")];if(s)if(Gt(s)){const i=s.repeat||"",r=this.width,n=this.height,o=this["".concat(e,"Vpt")]?zt(wt(this.viewportTransform)):"";t.push('<rect transform="'.concat(o," translate(").concat(r/2,",").concat(n/2,')" x="').concat(s.offsetX-r/2,'" y="').concat(s.offsetY-n/2,'" width="').concat("repeat-y"!==i&&"no-repeat"!==i||!Nt(s)?r:s.source.width,'" height="').concat("repeat-x"!==i&&"no-repeat"!==i||!Nt(s)?n:s.source.height,'" fill="url(#SVGID_').concat(s.id,')"></rect>\n'));}else t.push('<rect x="0" y="0" width="100%" height="100%" ','fill="',s,'"',"></rect>\n");}loadFromJSON(t,e){let{signal:s}=arguments.length>2&&void 0!==arguments[2]?arguments[2]:{};if(!t)return Promise.reject(new h("`json` is undefined"));const r="string"==typeof t?JSON.parse(t):t,{objects:n=[]}=r,o=i(r,se),{backgroundImage:a,background:c,overlayImage:l,overlay:u,clipPath:d}=o,g=this.renderOnAddRemove;return this.renderOnAddRemove=false,Promise.all([Bt(n,{reviver:e,signal:s}),Xt({backgroundImage:a,backgroundColor:c,overlayImage:l,overlayColor:u,clipPath:d},{signal:s})]).then((t=>{let[e,s]=t;return this.clear(),this.add(...e),this.set(o),this.set(s),this.renderOnAddRemove=g,this}))}clone(t){const e=this.toObject(t);return this.cloneWithoutData().loadFromJSON(e)}cloneWithoutData(){const t=vt(this);return new this.constructor(t)}toDataURL(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};const{format:e="png",quality:s=1,multiplier:i=1,enableRetinaScaling:r=false}=t,n=i*(r?this.getRetinaScaling():1);return yt(this.toCanvasElement(n,t),e,s)}toBlob(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};const{format:e="png",quality:s=1,multiplier:i=1,enableRetinaScaling:r=false}=t,n=i*(r?this.getRetinaScaling():1);return _t(this.toCanvasElement(n,t),e,s)}toCanvasElement(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:1,{width:e,height:s,left:i,top:r,filter:n}=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{};const o=(e||this.width)*t,a=(s||this.height)*t,h=this.getZoom(),c=this.width,l=this.height,u=this.skipControlsDrawing,d=h*t,g=this.viewportTransform,f=[d,0,0,d,(g[4]-(i||0))*t,(g[5]-(r||0))*t],p=this.enableRetinaScaling,m=vt({width:o,height:a}),v=n?this._objects.filter((t=>n(t))):this._objects;return this.enableRetinaScaling=false,this.viewportTransform=f,this.width=o,this.height=a,this.skipControlsDrawing=true,this.calcViewportBoundaries(),this.renderCanvas(m.getContext("2d"),v),this.viewportTransform=g,this.width=c,this.height=l,this.calcViewportBoundaries(),this.enableRetinaScaling=p,this.skipControlsDrawing=u,m}dispose(){return !this.disposed&&this.elements.cleanupDOM({width:this.width,height:this.height}),et.cancelByCanvas(this),this.disposed=true,new Promise(((t,e)=>{const s=()=>{this.destroy(),t(true);};s.kill=e,this.__cleanupTask&&this.__cleanupTask.kill("aborted"),this.destroyed?t(false):this.nextRenderHandle?this.__cleanupTask=s:s();}))}destroy(){this.destroyed=true,this.cancelRequestedRender(),this.forEachObject((t=>t.dispose())),this._objects=[],this.backgroundImage&&this.backgroundImage.dispose(),this.backgroundImage=void 0,this.overlayImage&&this.overlayImage.dispose(),this.overlayImage=void 0,this.elements.dispose();}toString(){return "#<Canvas (".concat(this.complexity(),"): { objects: ").concat(this._objects.length," }>")}}t(ie,"ownDefaults",ee);const re=["touchstart","touchmove","touchend"];const ne=t=>{const e=qt(t.target),s=function(t){const e=t.changedTouches;return e&&e[0]?e[0]:t}(t);return new ot(s.clientX+e.left,s.clientY+e.top)},oe=t=>re.includes(t.type)||"touch"===t.pointerType,ae=t=>{t.preventDefault(),t.stopPropagation();},he=t=>{let e=0,s=0,i=0,r=0;for(let n=0,o=t.length;n<o;n++){const{x:o,y:a}=t[n];(o>i||!n)&&(i=o),(o<e||!n)&&(e=o),(a>r||!n)&&(r=a),(a<s||!n)&&(s=a);}return {left:e,top:s,width:i-e,height:r-s}},ce=["translateX","translateY","scaleX","scaleY"],le=(t,e)=>ue(t,Tt(e,t.calcOwnMatrix())),ue=(t,e)=>{const s=Dt(e),{translateX:r,translateY:n,scaleX:o,scaleY:a}=s,h=i(s,ce),c=new ot(r,n);t.flipX=false,t.flipY=false,Object.assign(t,h),t.set({scaleX:o,scaleY:a}),t.setPositionByOrigin(c,D,D);},de=t=>{t.scaleX=1,t.scaleY=1,t.skewX=0,t.skewY=0,t.flipX=false,t.flipY=false,t.rotate(0);},ge=t=>({scaleX:t.scaleX,scaleY:t.scaleY,skewX:t.skewX,skewY:t.skewY,angle:t.angle,left:t.left,flipX:t.flipX,flipY:t.flipY,top:t.top}),fe=(t,e,s)=>{const i=t/2,r=e/2,n=[new ot(-i,-r),new ot(i,-r),new ot(-i,r),new ot(i,r)].map((t=>t.transform(s))),o=he(n);return new ot(o.width,o.height)},pe=function(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:T;return Tt(wt(arguments.length>1&&void 0!==arguments[1]?arguments[1]:T),t)},me=function(t){let e=arguments.length>1&&void 0!==arguments[1]?arguments[1]:T,s=arguments.length>2&&void 0!==arguments[2]?arguments[2]:T;return t.transform(pe(e,s))},ve=function(t){let e=arguments.length>1&&void 0!==arguments[1]?arguments[1]:T,s=arguments.length>2&&void 0!==arguments[2]?arguments[2]:T;return t.transform(pe(e,s),true)},ye=(t,e,s)=>{const i=pe(e,s);return ue(t,Tt(i,t.calcOwnMatrix())),i},_e=(t,e)=>{var i;const{transform:{target:r}}=e;null===(i=r.canvas)||void 0===i||i.fire("object:".concat(t),s(s({},e),{},{target:r})),r.fire(t,e);},xe={left:-0.5,top:-0.5,center:0,bottom:.5,right:.5},Ce=t=>"string"==typeof t?xe[t]:t-.5,be="not-allowed";function Se(t){return Ce(t.originX)===Ce(D)&&Ce(t.originY)===Ce(D)}function we(t){return .5-Ce(t)}const Te=(t,e)=>t[e],Oe=(t,e,s,i)=>({e:t,transform:e,pointer:new ot(s,i)});function ke(t,e){const s=t.getTotalAngle()+Ct(Math.atan2(e.y,e.x))+360;return Math.round(s%360/45)}function De(t,e,s,i,r){var n;let{target:o,corner:a}=t;const h=o.controls[a],c=(null===(n=o.canvas)||void 0===n?void 0:n.getZoom())||1,l=o.padding/c,u=function(t,e,s,i){const r=t.getRelativeCenterPoint(),n=void 0!==s&&void 0!==i?t.translateToGivenOrigin(r,D,D,s,i):new ot(t.left,t.top);return (t.angle?e.rotate(-xt(t.angle),r):e).subtract(n)}(o,new ot(i,r),e,s);return u.x>=l&&(u.x-=l),u.x<=-l&&(u.x+=l),u.y>=l&&(u.y-=l),u.y<=l&&(u.y+=l),u.x-=h.offsetX,u.y-=h.offsetY,u}const Me=(t,e,s,i)=>{const{target:r,offsetX:n,offsetY:o}=e,a=s-n,h=i-o,c=!Te(r,"lockMovementX")&&r.left!==a,l=!Te(r,"lockMovementY")&&r.top!==h;return c&&r.set(M,a),l&&r.set(P,h),(c||l)&&_e(L,Oe(t,e,s,i)),c||l},Pe=t=>t.replace(/\s+/g," "),Ee={aliceblue:"#F0F8FF",antiquewhite:"#FAEBD7",aqua:"#0FF",aquamarine:"#7FFFD4",azure:"#F0FFFF",beige:"#F5F5DC",bisque:"#FFE4C4",black:"#000",blanchedalmond:"#FFEBCD",blue:"#00F",blueviolet:"#8A2BE2",brown:"#A52A2A",burlywood:"#DEB887",cadetblue:"#5F9EA0",chartreuse:"#7FFF00",chocolate:"#D2691E",coral:"#FF7F50",cornflowerblue:"#6495ED",cornsilk:"#FFF8DC",crimson:"#DC143C",cyan:"#0FF",darkblue:"#00008B",darkcyan:"#008B8B",darkgoldenrod:"#B8860B",darkgray:"#A9A9A9",darkgrey:"#A9A9A9",darkgreen:"#006400",darkkhaki:"#BDB76B",darkmagenta:"#8B008B",darkolivegreen:"#556B2F",darkorange:"#FF8C00",darkorchid:"#9932CC",darkred:"#8B0000",darksalmon:"#E9967A",darkseagreen:"#8FBC8F",darkslateblue:"#483D8B",darkslategray:"#2F4F4F",darkslategrey:"#2F4F4F",darkturquoise:"#00CED1",darkviolet:"#9400D3",deeppink:"#FF1493",deepskyblue:"#00BFFF",dimgray:"#696969",dimgrey:"#696969",dodgerblue:"#1E90FF",firebrick:"#B22222",floralwhite:"#FFFAF0",forestgreen:"#228B22",fuchsia:"#F0F",gainsboro:"#DCDCDC",ghostwhite:"#F8F8FF",gold:"#FFD700",goldenrod:"#DAA520",gray:"#808080",grey:"#808080",green:"#008000",greenyellow:"#ADFF2F",honeydew:"#F0FFF0",hotpink:"#FF69B4",indianred:"#CD5C5C",indigo:"#4B0082",ivory:"#FFFFF0",khaki:"#F0E68C",lavender:"#E6E6FA",lavenderblush:"#FFF0F5",lawngreen:"#7CFC00",lemonchiffon:"#FFFACD",lightblue:"#ADD8E6",lightcoral:"#F08080",lightcyan:"#E0FFFF",lightgoldenrodyellow:"#FAFAD2",lightgray:"#D3D3D3",lightgrey:"#D3D3D3",lightgreen:"#90EE90",lightpink:"#FFB6C1",lightsalmon:"#FFA07A",lightseagreen:"#20B2AA",lightskyblue:"#87CEFA",lightslategray:"#789",lightslategrey:"#789",lightsteelblue:"#B0C4DE",lightyellow:"#FFFFE0",lime:"#0F0",limegreen:"#32CD32",linen:"#FAF0E6",magenta:"#F0F",maroon:"#800000",mediumaquamarine:"#66CDAA",mediumblue:"#0000CD",mediumorchid:"#BA55D3",mediumpurple:"#9370DB",mediumseagreen:"#3CB371",mediumslateblue:"#7B68EE",mediumspringgreen:"#00FA9A",mediumturquoise:"#48D1CC",mediumvioletred:"#C71585",midnightblue:"#191970",mintcream:"#F5FFFA",mistyrose:"#FFE4E1",moccasin:"#FFE4B5",navajowhite:"#FFDEAD",navy:"#000080",oldlace:"#FDF5E6",olive:"#808000",olivedrab:"#6B8E23",orange:"#FFA500",orangered:"#FF4500",orchid:"#DA70D6",palegoldenrod:"#EEE8AA",palegreen:"#98FB98",paleturquoise:"#AFEEEE",palevioletred:"#DB7093",papayawhip:"#FFEFD5",peachpuff:"#FFDAB9",peru:"#CD853F",pink:"#FFC0CB",plum:"#DDA0DD",powderblue:"#B0E0E6",purple:"#800080",rebeccapurple:"#639",red:"#F00",rosybrown:"#BC8F8F",royalblue:"#4169E1",saddlebrown:"#8B4513",salmon:"#FA8072",sandybrown:"#F4A460",seagreen:"#2E8B57",seashell:"#FFF5EE",sienna:"#A0522D",silver:"#C0C0C0",skyblue:"#87CEEB",slateblue:"#6A5ACD",slategray:"#708090",slategrey:"#708090",snow:"#FFFAFA",springgreen:"#00FF7F",steelblue:"#4682B4",tan:"#D2B48C",teal:"#008080",thistle:"#D8BFD8",tomato:"#FF6347",turquoise:"#40E0D0",violet:"#EE82EE",wheat:"#F5DEB3",white:"#FFF",whitesmoke:"#F5F5F5",yellow:"#FF0",yellowgreen:"#9ACD32"},Ae=(t,e,s)=>(s<0&&(s+=1),s>1&&(s-=1),s<1/6?t+6*(e-t)*s:s<.5?e:s<2/3?t+(e-t)*(2/3-s)*6:t),je=(t,e,s,i)=>{t/=255,e/=255,s/=255;const r=Math.max(t,e,s),n=Math.min(t,e,s);let o,a;const h=(r+n)/2;if(r===n)o=a=0;else {const i=r-n;switch(a=h>.5?i/(2-r-n):i/(r+n),r){case t:o=(e-s)/i+(e<s?6:0);break;case e:o=(s-t)/i+2;break;case s:o=(t-e)/i+4;}o/=6;}return [Math.round(360*o),Math.round(100*a),Math.round(100*h),i]},Fe=function(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:"1";return parseFloat(t)/(t.endsWith("%")?100:1)},Le=t=>Math.min(Math.round(t),255).toString(16).toUpperCase().padStart(2,"0"),Re=t=>{let[e,s,i,r=1]=t;const n=Math.round(.3*e+.59*s+.11*i);return [n,n,n,r]};class Ie{constructor(e){if(t(this,"isUnrecognised",false),e)if(e instanceof Ie)this.setSource([...e._source]);else if(Array.isArray(e)){const[t,s,i,r=1]=e;this.setSource([t,s,i,r]);}else this.setSource(this._tryParsingColor(e));else this.setSource([0,0,0,1]);}_tryParsingColor(t){return (t=t.toLowerCase())in Ee&&(t=Ee[t]),"transparent"===t?[255,255,255,0]:Ie.sourceFromHex(t)||Ie.sourceFromRgb(t)||Ie.sourceFromHsl(t)||(this.isUnrecognised=true)&&[0,0,0,1]}getSource(){return this._source}setSource(t){this._source=t;}toRgb(){const[t,e,s]=this.getSource();return "rgb(".concat(t,",").concat(e,",").concat(s,")")}toRgba(){return "rgba(".concat(this.getSource().join(","),")")}toHsl(){const[t,e,s]=je(...this.getSource());return "hsl(".concat(t,",").concat(e,"%,").concat(s,"%)")}toHsla(){const[t,e,s,i]=je(...this.getSource());return "hsla(".concat(t,",").concat(e,"%,").concat(s,"%,").concat(i,")")}toHex(){return this.toHexa().slice(0,6)}toHexa(){const[t,e,s,i]=this.getSource();return "".concat(Le(t)).concat(Le(e)).concat(Le(s)).concat(Le(Math.round(255*i)))}getAlpha(){return this.getSource()[3]}setAlpha(t){return this._source[3]=t,this}toGrayscale(){return this.setSource(Re(this.getSource())),this}toBlackWhite(t){const[e,,,s]=Re(this.getSource()),i=e<(t||127)?0:255;return this.setSource([i,i,i,s]),this}overlayWith(t){t instanceof Ie||(t=new Ie(t));const e=this.getSource(),s=t.getSource(),[i,r,n]=e.map(((t,e)=>Math.round(.5*t+.5*s[e])));return this.setSource([i,r,n,e[3]]),this}static fromRgb(t){return Ie.fromRgba(t)}static fromRgba(t){return new Ie(Ie.sourceFromRgb(t))}static sourceFromRgb(t){const e=Pe(t).match(/^rgba?\(\s?(\d{0,3}(?:\.\d+)?%?)\s?[\s|,]\s?(\d{0,3}(?:\.\d+)?%?)\s?[\s|,]\s?(\d{0,3}(?:\.\d+)?%?)\s?(?:\s?[,/]\s?(\d{0,3}(?:\.\d+)?%?)\s?)?\)$/i);if(e){const[t,s,i]=e.slice(1,4).map((t=>{const e=parseFloat(t);return t.endsWith("%")?Math.round(2.55*e):e}));return [t,s,i,Fe(e[4])]}}static fromHsl(t){return Ie.fromHsla(t)}static fromHsla(t){return new Ie(Ie.sourceFromHsl(t))}static sourceFromHsl(t){const e=Pe(t).match(/^hsla?\(\s?([+-]?\d{0,3}(?:\.\d+)?(?:deg|turn|rad)?)\s?[\s|,]\s?(\d{0,3}(?:\.\d+)?%?)\s?[\s|,]\s?(\d{0,3}(?:\.\d+)?%?)\s?(?:\s?[,/]\s?(\d*(?:\.\d+)?%?)\s?)?\)$/i);if(!e)return;const s=(Ie.parseAngletoDegrees(e[1])%360+360)%360/360,i=parseFloat(e[2])/100,r=parseFloat(e[3])/100;let n,o,a;if(0===i)n=o=a=r;else {const t=r<=.5?r*(i+1):r+i-r*i,e=2*r-t;n=Ae(e,t,s+1/3),o=Ae(e,t,s),a=Ae(e,t,s-1/3);}return [Math.round(255*n),Math.round(255*o),Math.round(255*a),Fe(e[4])]}static fromHex(t){return new Ie(Ie.sourceFromHex(t))}static sourceFromHex(t){if(t.match(/^#?(([0-9a-f]){3,4}|([0-9a-f]{2}){3,4})$/i)){const e=t.slice(t.indexOf("#")+1);let s;s=e.length<=4?e.split("").map((t=>t+t)):e.match(/.{2}/g);const[i,r,n,o=255]=s.map((t=>parseInt(t,16)));return [i,r,n,o/255]}}static parseAngletoDegrees(t){const e=t.toLowerCase(),s=parseFloat(e);return e.includes("rad")?Ct(s):e.includes("turn")?360*s:s}}const Be=function(t){let e=arguments.length>1&&void 0!==arguments[1]?arguments[1]:O;const s=/\D{0,2}$/.exec(t),i=parseFloat(t),r=o.DPI;switch(null==s?void 0:s[0]){case "mm":return i*r/25.4;case "cm":return i*r/2.54;case "in":return i*r;case "pt":return i*r/72;case "pc":return i*r/72*12;case "em":return i*e;default:return i}},Xe=t=>{const[e,s]=t.trim().split(" "),[i,r]=(n=e)&&n!==j?[n.slice(1,4),n.slice(5,8)]:n===j?[n,n]:["Mid","Mid"];var n;return {meetOrSlice:s||"meet",alignX:i,alignY:r}},Ye=function(t,e){let s,i,r=!(arguments.length>2&&void 0!==arguments[2])||arguments[2];if(e)if(e.toLive)s="url(#SVGID_".concat(e.id,")");else {const t=new Ie(e),r=t.getAlpha();s=t.toRgb(),1!==r&&(i=r.toString());}else s="none";return r?"".concat(t,": ").concat(s,"; ").concat(i?"".concat(t,"-opacity: ").concat(i,"; "):""):"".concat(t,'="').concat(s,'" ').concat(i?"".concat(t,'-opacity="').concat(i,'" '):"")};class We{getSvgStyles(t){const e=this.fillRule?this.fillRule:"nonzero",s=this.strokeWidth?this.strokeWidth:"0",i=this.strokeDashArray?this.strokeDashArray.join(" "):j,r=this.strokeDashOffset?this.strokeDashOffset:"0",n=this.strokeLineCap?this.strokeLineCap:"butt",o=this.strokeLineJoin?this.strokeLineJoin:"miter",a=this.strokeMiterLimit?this.strokeMiterLimit:"4",h=void 0!==this.opacity?this.opacity:"1",c=this.visible?"":" visibility: hidden;",l=t?"":this.getSvgFilter(),u=Ye(K,this.fill);return [Ye(J,this.stroke),"stroke-width: ",s,"; ","stroke-dasharray: ",i,"; ","stroke-linecap: ",n,"; ","stroke-dashoffset: ",r,"; ","stroke-linejoin: ",o,"; ","stroke-miterlimit: ",a,"; ",u,"fill-rule: ",e,"; ","opacity: ",h,";",l,c].join("")}getSvgFilter(){return this.shadow?"filter: url(#SVGID_".concat(this.shadow.id,");"):""}getSvgCommons(){return [this.id?'id="'.concat(this.id,'" '):"",this.clipPath?'clip-path="url(#'.concat(this.clipPath.clipPathId,')" '):""].join("")}getSvgTransform(t){let e=arguments.length>1&&void 0!==arguments[1]?arguments[1]:"";const s=t?this.calcTransformMatrix():this.calcOwnMatrix(),i='transform="'.concat(zt(s));return "".concat(i).concat(e,'" ')}_toSVG(t){return [""]}toSVG(t){return this._createBaseSVGMarkup(this._toSVG(t),{reviver:t})}toClipPathSVG(t){return "\t"+this._createBaseClipPathSVGMarkup(this._toSVG(t),{reviver:t})}_createBaseClipPathSVGMarkup(t){let{reviver:e,additionalTransform:s=""}=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{};const i=[this.getSvgTransform(true,s),this.getSvgCommons()].join(""),r=t.indexOf("COMMON_PARTS");return t[r]=i,e?e(t.join("")):t.join("")}_createBaseSVGMarkup(t){let{noStyle:e,reviver:s,withShadow:i,additionalTransform:r}=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{};const n=e?"":'style="'.concat(this.getSvgStyles(),'" '),o=i?'style="'.concat(this.getSvgFilter(),'" '):"",a=this.clipPath,h=this.strokeUniform?'vector-effect="non-scaling-stroke" ':"",c=a&&a.absolutePositioned,l=this.stroke,u=this.fill,d=this.shadow,g=[],f=t.indexOf("COMMON_PARTS");let p;a&&(a.clipPathId="CLIPPATH_".concat(ft()),p='<clipPath id="'.concat(a.clipPathId,'" >\n').concat(a.toClipPathSVG(s),"</clipPath>\n")),c&&g.push("<g ",o,this.getSvgCommons()," >\n"),g.push("<g ",this.getSvgTransform(false),c?"":o+this.getSvgCommons()," >\n");const m=[n,h,e?"":this.addPaintOrder()," ",r?'transform="'.concat(r,'" '):""].join("");return t[f]=m,Gt(u)&&g.push(u.toSVG(this)),Gt(l)&&g.push(l.toSVG(this)),d&&g.push(d.toSVG(this)),a&&g.push(p),g.push(t.join("")),g.push("</g>\n"),c&&g.push("</g>\n"),s?s(g.join("")):g.join("")}addPaintOrder(){return this.paintFirst!==K?' paint-order="'.concat(this.paintFirst,'" '):""}}function Ve(t){return new RegExp("^("+t.join("|")+")\\b","i")}const ze="textDecorationThickness",Ge=["fontSize","fontWeight","fontFamily","fontStyle"],He=["underline","overline","linethrough"],Ne=[...Ge,"lineHeight","text","charSpacing","textAlign","styles","path","pathStartOffset","pathSide","pathAlign"],Ue=[...Ne,...He,"textBackgroundColor","direction",ze],qe=[...Ge,...He,J,"strokeWidth",K,"deltaY","textBackgroundColor",ze],Ke={_reNewline:F,_reSpacesAndTabs:/[ \t\r]/g,_reSpaceAndTab:/[ \t\r]/,_reWords:/\S+/g,fontSize:40,fontWeight:"normal",fontFamily:"Times New Roman",underline:false,overline:false,linethrough:false,textAlign:M,fontStyle:"normal",lineHeight:1.16,textBackgroundColor:"",stroke:null,shadow:null,path:void 0,pathStartOffset:0,pathSide:M,pathAlign:"baseline",charSpacing:0,deltaY:0,direction:"ltr",CACHE_FONT_SIZE:400,MIN_TEXT_WIDTH:2,superscript:{size:.6,baseline:-0.35},subscript:{size:.6,baseline:.11},_fontSizeFraction:.222,offsets:{underline:.1,linethrough:-0.28167,overline:-0.81333},_fontSizeMult:1.13,[ze]:66.667},Je="justify",Qe="justify-left",Ze="justify-right",$e="justify-center";var ts,es,ss;const is=String.raw(ts||(ts=r(["[-+]?(?:d*.d+|d+.?)(?:[eE][-+]?d+)?"],["[-+]?(?:\\d*\\.\\d+|\\d+\\.?)(?:[eE][-+]?\\d+)?"]))),rs=String.raw(es||(es=r(["(?:s*,?s+|s*,s*)"],["(?:\\s*,?\\s+|\\s*,\\s*)"]))),os=new RegExp("(normal|italic)?\\s*(normal|small-caps)?\\s*(normal|bold|bolder|lighter|100|200|300|400|500|600|700|800|900)?\\s*("+is+"(?:px|cm|mm|em|pt|pc|in)*)(?:\\/(normal|"+is+"))?\\s+(.*)"),as={cx:M,x:M,r:"radius",cy:P,y:P,display:"visible",visibility:"visible",transform:"transformMatrix","fill-opacity":"fillOpacity","fill-rule":"fillRule","font-family":"fontFamily","font-size":"fontSize","font-style":"fontStyle","font-weight":"fontWeight","letter-spacing":"charSpacing","paint-order":"paintFirst","stroke-dasharray":"strokeDashArray","stroke-dashoffset":"strokeDashOffset","stroke-linecap":"strokeLineCap","stroke-linejoin":"strokeLineJoin","stroke-miterlimit":"strokeMiterLimit","stroke-opacity":"strokeOpacity","stroke-width":"strokeWidth","text-decoration":"textDecoration","text-anchor":"textAnchor",opacity:"opacity","clip-path":"clipPath","clip-rule":"clipRule","vector-effect":"strokeUniform","image-rendering":"imageSmoothing","text-decoration-thickness":ze},hs="font-size",cs="clip-path";Ve(["path","circle","polygon","polyline","ellipse","rect","line","image","text"]);Ve(["symbol","image","marker","pattern","view","svg"]);const ds=Ve(["symbol","g","a","svg","clipPath","defs"]);new RegExp(String.raw(ss||(ss=r(["^s*(",")","(",")","(",")","(",")s*$"],["^\\s*(",")","(",")","(",")","(",")\\s*$"])),is,rs,is,rs,is,rs,is));const fs=new ot(1,0),ps=new ot,ms=(t,e)=>t.rotate(e),vs=(t,e)=>new ot(e).subtract(t),ys=t=>t.distanceFrom(ps),_s=(t,e)=>Math.atan2(Ss(t,e),ws(t,e)),xs=t=>_s(fs,t),Cs=t=>t.eq(ps)?t:t.scalarDivide(ys(t)),bs=function(t){let e=!(arguments.length>1&&void 0!==arguments[1])||arguments[1];return Cs(new ot(-t.y,t.x).scalarMultiply(e?1:-1))},Ss=(t,e)=>t.x*e.y-t.y*e.x,ws=(t,e)=>t.x*e.x+t.y*e.y,Ts=(t,e,s)=>{if(t.eq(e)||t.eq(s))return  true;const i=Ss(e,s),r=Ss(e,t),n=Ss(s,t);return i>=0?r>=0&&n<=0:!(r<=0&&n>=0)},Os="(-?\\d+(?:\\.\\d*)?(?:px)?(?:\\s?|$))?",ks=new RegExp("(?:\\s|^)"+Os+Os+"("+is+"?(?:px)?)?(?:\\s?|$)(?:$|\\s)");class Ds{constructor(t){const e="string"==typeof t?Ds.parseShadow(t):t;Object.assign(this,Ds.ownDefaults,e),this.id=ft();}static parseShadow(t){const e=t.trim(),[,s=0,i=0,r=0]=(ks.exec(e)||[]).map((t=>parseFloat(t)||0));return {color:(e.replace(ks,"")||"rgb(0,0,0)").trim(),offsetX:s,offsetY:i,blur:r}}toString(){return [this.offsetX,this.offsetY,this.blur,this.color].join("px ")}toSVG(t){const e=ms(new ot(this.offsetX,this.offsetY),xt(-t.angle)),s=new Ie(this.color);let i=40,r=40;return t.width&&t.height&&(i=100*Vt((Math.abs(e.x)+this.blur)/t.width,o.NUM_FRACTION_DIGITS)+20,r=100*Vt((Math.abs(e.y)+this.blur)/t.height,o.NUM_FRACTION_DIGITS)+20),t.flipX&&(e.x*=-1),t.flipY&&(e.y*=-1),'<filter id="SVGID_'.concat(this.id,'" y="-').concat(r,'%" height="').concat(100+2*r,'%" x="-').concat(i,'%" width="').concat(100+2*i,'%" >\n\t<feGaussianBlur in="SourceAlpha" stdDeviation="').concat(Vt(this.blur?this.blur/2:0,o.NUM_FRACTION_DIGITS),'"></feGaussianBlur>\n\t<feOffset dx="').concat(Vt(e.x,o.NUM_FRACTION_DIGITS),'" dy="').concat(Vt(e.y,o.NUM_FRACTION_DIGITS),'" result="oBlur" ></feOffset>\n\t<feFlood flood-color="').concat(s.toRgb(),'" flood-opacity="').concat(s.getAlpha(),'"/>\n\t<feComposite in2="oBlur" operator="in" />\n\t<feMerge>\n\t\t<feMergeNode></feMergeNode>\n\t\t<feMergeNode in="SourceGraphic"></feMergeNode>\n\t</feMerge>\n</filter>\n')}toObject(){const t={color:this.color,blur:this.blur,offsetX:this.offsetX,offsetY:this.offsetY,affectStroke:this.affectStroke,nonScaling:this.nonScaling,type:this.constructor.type},e=Ds.ownDefaults;return this.includeDefaultValues?t:Wt(t,((t,s)=>t!==e[s]))}static async fromObject(t){return new this(t)}}t(Ds,"ownDefaults",{color:"rgb(0,0,0)",blur:0,offsetX:0,offsetY:0,affectStroke:false,includeDefaultValues:true,nonScaling:false}),t(Ds,"type","shadow"),tt.setClass(Ds,"shadow");const Ms=(t,e,s)=>Math.max(t,Math.min(e,s)),Ps=[P,M,H,N,"flipX","flipY","originX","originY","angle","opacity","globalCompositeOperation","shadow","visible",U,q],Es=[K,J,"strokeWidth","strokeDashArray","width","height","paintFirst","strokeUniform","strokeLineCap","strokeDashOffset","strokeLineJoin","strokeMiterLimit","backgroundColor","clipPath"],As={top:0,left:0,width:0,height:0,angle:0,flipX:false,flipY:false,scaleX:1,scaleY:1,minScaleLimit:0,skewX:0,skewY:0,originX:M,originY:P,strokeWidth:1,strokeUniform:false,padding:0,opacity:1,paintFirst:K,fill:"rgb(0,0,0)",fillRule:"nonzero",stroke:null,strokeDashArray:null,strokeDashOffset:0,strokeLineCap:"butt",strokeLineJoin:"miter",strokeMiterLimit:4,globalCompositeOperation:"source-over",backgroundColor:"",shadow:null,visible:true,includeDefaultValues:true,excludeFromExport:false,objectCaching:true,clipPath:void 0,inverted:false,absolutePositioned:false,centeredRotation:true,centeredScaling:false,dirty:true},Ls=(t,e,s,i)=>-s*Math.cos(t/i*b)+s+e;const Xs=()=>false;class Ys{constructor(e){let{startValue:s,byValue:i,duration:r=500,delay:n=0,easing:o=Ls,onStart:a=C,onChange:h=C,onComplete:c=C,abort:l=Xs,target:u}=e;t(this,"_state","pending"),t(this,"durationProgress",0),t(this,"valueProgress",0),this.tick=this.tick.bind(this),this.duration=r,this.delay=n,this.easing=o,this._onStart=a,this._onChange=h,this._onComplete=c,this._abort=l,this.target=u,this.startValue=s,this.byValue=i,this.value=this.startValue,this.endValue=Object.freeze(this.calculate(this.duration).value);}get state(){return this._state}isDone(){return "aborted"===this._state||"completed"===this._state}start(){const t=t=>{"pending"===this._state&&(this.startTime=t||+new Date,this._state="running",this._onStart(),this.tick(this.startTime));};this.register(),this.delay>0?setTimeout((()=>ut(t)),this.delay):ut(t);}tick(t){const e=(t||+new Date)-this.startTime,s=Math.min(e,this.duration);this.durationProgress=s/this.duration;const{value:i,valueProgress:r}=this.calculate(s);this.value=Object.freeze(i),this.valueProgress=r,"aborted"!==this._state&&(this._abort(this.value,this.valueProgress,this.durationProgress)?(this._state="aborted",this.unregister()):e>=this.duration?(this.durationProgress=this.valueProgress=1,this._onChange(this.endValue,this.valueProgress,this.durationProgress),this._state="completed",this._onComplete(this.endValue,this.valueProgress,this.durationProgress),this.unregister()):(this._onChange(this.value,this.valueProgress,this.durationProgress),ut(this.tick)));}register(){et.push(this);}unregister(){et.remove(this);}abort(){this._state="aborted",this.unregister();}}const Ws=["startValue","endValue"];class Vs extends Ys{constructor(t){let{startValue:e=0,endValue:r=100}=t;super(s(s({},i(t,Ws)),{},{startValue:e,byValue:r-e}));}calculate(t){const e=this.easing(t,this.startValue,this.byValue,this.duration);return {value:e,valueProgress:Math.abs((e-this.startValue)/this.byValue)}}}const zs=["startValue","endValue"];class Gs extends Ys{constructor(t){let{startValue:e=[0],endValue:r=[100]}=t;super(s(s({},i(t,zs)),{},{startValue:e,byValue:r.map(((t,s)=>t-e[s]))}));}calculate(t){const e=this.startValue.map(((e,s)=>this.easing(t,e,this.byValue[s],this.duration,s)));return {value:e,valueProgress:Math.abs((e[0]-this.startValue[0])/this.byValue[0])}}}const Hs=["startValue","endValue","easing","onChange","onComplete","abort"],Ns=(t,e,s,i)=>e+s*(1-Math.cos(t/i*b)),Us=t=>t&&((e,s,i)=>t(new Ie(e).toRgba(),s,i));class qs extends Ys{constructor(t){let{startValue:e,endValue:r,easing:n=Ns,onChange:o,onComplete:a,abort:h}=t,c=i(t,Hs);const l=new Ie(e).getSource(),u=new Ie(r).getSource();super(s(s({},c),{},{startValue:l,byValue:u.map(((t,e)=>t-l[e])),easing:n,onChange:Us(o),onComplete:Us(a),abort:Us(h)}));}calculate(t){const[e,s,i,r]=this.startValue.map(((e,s)=>this.easing(t,e,this.byValue[s],this.duration,s))),n=[...[e,s,i].map(Math.round),Ms(0,r,1)];return {value:n,valueProgress:n.map(((t,e)=>0!==this.byValue[e]?Math.abs((t-this.startValue[e])/this.byValue[e]):0)).find((t=>0!==t))||0}}}function Ks(t){const e=(t=>Array.isArray(t.startValue)||Array.isArray(t.endValue))(t)?new Gs(t):new Vs(t);return e.start(),e}function Js(t){const e=new qs(t);return e.start(),e}class Qs{constructor(t){this.status=t,this.points=[];}includes(t){return this.points.some((e=>e.eq(t)))}append(){for(var t=arguments.length,e=new Array(t),s=0;s<t;s++)e[s]=arguments[s];return this.points=this.points.concat(e.filter((t=>!this.includes(t)))),this}static isPointContained(t,e,s){let i=arguments.length>3&&void 0!==arguments[3]&&arguments[3];if(e.eq(s))return t.eq(e);if(e.x===s.x)return t.x===e.x&&(i||t.y>=Math.min(e.y,s.y)&&t.y<=Math.max(e.y,s.y));if(e.y===s.y)return t.y===e.y&&(i||t.x>=Math.min(e.x,s.x)&&t.x<=Math.max(e.x,s.x));{const r=vs(e,s),n=vs(e,t).divide(r);return i?Math.abs(n.x)===Math.abs(n.y):n.x===n.y&&n.x>=0&&n.x<=1}}static isPointInPolygon(t,e){const s=new ot(t).setX(Math.min(t.x-1,...e.map((t=>t.x))));let i=0;for(let r=0;r<e.length;r++){const n=this.intersectSegmentSegment(e[r],e[(r+1)%e.length],t,s);if(n.includes(t))return  true;i+=Number("Intersection"===n.status);}return i%2==1}static intersectLineLine(t,e,s,i){let r=!(arguments.length>4&&void 0!==arguments[4])||arguments[4],n=!(arguments.length>5&&void 0!==arguments[5])||arguments[5];const o=e.x-t.x,a=e.y-t.y,h=i.x-s.x,c=i.y-s.y,l=t.x-s.x,u=t.y-s.y,d=h*u-c*l,g=o*u-a*l,f=c*o-h*a;if(0!==f){const e=d/f,s=g/f;return (r||0<=e&&e<=1)&&(n||0<=s&&s<=1)?new Qs("Intersection").append(new ot(t.x+e*o,t.y+e*a)):new Qs}if(0===d||0===g){const o=r||n||Qs.isPointContained(t,s,i)||Qs.isPointContained(e,s,i)||Qs.isPointContained(s,t,e)||Qs.isPointContained(i,t,e);return new Qs(o?"Coincident":void 0)}return new Qs("Parallel")}static intersectSegmentLine(t,e,s,i){return Qs.intersectLineLine(t,e,s,i,false,true)}static intersectSegmentSegment(t,e,s,i){return Qs.intersectLineLine(t,e,s,i,false,false)}static intersectLinePolygon(t,e,s){let i=!(arguments.length>3&&void 0!==arguments[3])||arguments[3];const r=new Qs,n=s.length;for(let o,a,h,c=0;c<n;c++){if(o=s[c],a=s[(c+1)%n],h=Qs.intersectLineLine(t,e,o,a,i,false),"Coincident"===h.status)return h;r.append(...h.points);}return r.points.length>0&&(r.status="Intersection"),r}static intersectSegmentPolygon(t,e,s){return Qs.intersectLinePolygon(t,e,s,false)}static intersectPolygonPolygon(t,e){const s=new Qs,i=t.length,r=[];for(let n=0;n<i;n++){const o=t[n],a=t[(n+1)%i],h=Qs.intersectSegmentPolygon(o,a,e);"Coincident"===h.status?(r.push(h),s.append(o,a)):s.append(...h.points);}return r.length>0&&r.length===t.length?new Qs("Coincident"):(s.points.length>0&&(s.status="Intersection"),s)}static intersectPolygonRectangle(t,e,s){const i=e.min(s),r=e.max(s),n=new ot(r.x,i.y),o=new ot(i.x,r.y);return Qs.intersectPolygonPolygon(t,[i,n,r,o])}}class Zs extends lt{getX(){return this.getXY().x}setX(t){this.setXY(this.getXY().setX(t));}getY(){return this.getXY().y}setY(t){this.setXY(this.getXY().setY(t));}getRelativeX(){return this.left}setRelativeX(t){this.left=t;}getRelativeY(){return this.top}setRelativeY(t){this.top=t;}getXY(){const t=this.getRelativeXY();return this.group?St(t,this.group.calcTransformMatrix()):t}setXY(t,e,s){this.group&&(t=St(t,wt(this.group.calcTransformMatrix()))),this.setRelativeXY(t,e,s);}getRelativeXY(){return new ot(this.left,this.top)}setRelativeXY(t){let e=arguments.length>1&&void 0!==arguments[1]?arguments[1]:this.originX,s=arguments.length>2&&void 0!==arguments[2]?arguments[2]:this.originY;this.setPositionByOrigin(t,e,s);}isStrokeAccountedForInDimensions(){return  false}getCoords(){const{tl:t,tr:e,br:s,bl:i}=this.aCoords||(this.aCoords=this.calcACoords()),r=[t,e,s,i];if(this.group){const t=this.group.calcTransformMatrix();return r.map((e=>St(e,t)))}return r}intersectsWithRect(t,e){return "Intersection"===Qs.intersectPolygonRectangle(this.getCoords(),t,e).status}intersectsWithObject(t){const e=Qs.intersectPolygonPolygon(this.getCoords(),t.getCoords());return "Intersection"===e.status||"Coincident"===e.status||t.isContainedWithinObject(this)||this.isContainedWithinObject(t)}isContainedWithinObject(t){return this.getCoords().every((e=>t.containsPoint(e)))}isContainedWithinRect(t,e){const{left:s,top:i,width:r,height:n}=this.getBoundingRect();return s>=t.x&&s+r<=e.x&&i>=t.y&&i+n<=e.y}isOverlapping(t){return this.intersectsWithObject(t)||this.isContainedWithinObject(t)||t.isContainedWithinObject(this)}containsPoint(t){return Qs.isPointInPolygon(t,this.getCoords())}isOnScreen(){if(!this.canvas)return  false;const{tl:t,br:e}=this.canvas.vptCoords;return !!this.getCoords().some((s=>s.x<=e.x&&s.x>=t.x&&s.y<=e.y&&s.y>=t.y))||(!!this.intersectsWithRect(t,e)||this.containsPoint(t.midPointFrom(e)))}isPartiallyOnScreen(){if(!this.canvas)return  false;const{tl:t,br:e}=this.canvas.vptCoords;if(this.intersectsWithRect(t,e))return  true;return this.getCoords().every((s=>(s.x>=e.x||s.x<=t.x)&&(s.y>=e.y||s.y<=t.y)))&&this.containsPoint(t.midPointFrom(e))}getBoundingRect(){return he(this.getCoords())}getScaledWidth(){return this._getTransformedDimensions().x}getScaledHeight(){return this._getTransformedDimensions().y}scale(t){this._set(H,t),this._set(N,t),this.setCoords();}scaleToWidth(t){const e=this.getBoundingRect().width/this.getScaledWidth();return this.scale(t/this.width/e)}scaleToHeight(t){const e=this.getBoundingRect().height/this.getScaledHeight();return this.scale(t/this.height/e)}getCanvasRetinaScaling(){var t;return (null===(t=this.canvas)||void 0===t?void 0:t.getRetinaScaling())||1}getTotalAngle(){return this.group?Ct(kt(this.calcTransformMatrix())):this.angle}getViewportTransform(){var t;return (null===(t=this.canvas)||void 0===t?void 0:t.viewportTransform)||T.concat()}calcACoords(){const t=Pt({angle:this.angle}),{x:e,y:s}=this.getRelativeCenterPoint(),i=Mt(e,s),r=Tt(i,t),n=this._getTransformedDimensions(),o=n.x/2,a=n.y/2;return {tl:St({x:-o,y:-a},r),tr:St({x:o,y:-a},r),bl:St({x:-o,y:a},r),br:St({x:o,y:a},r)}}setCoords(){this.aCoords=this.calcACoords();}transformMatrixKey(){let t=arguments.length>0&&void 0!==arguments[0]&&arguments[0],e=[];return !t&&this.group&&(e=this.group.transformMatrixKey(t)),e.push(this.top,this.left,this.width,this.height,this.scaleX,this.scaleY,this.angle,this.strokeWidth,this.skewX,this.skewY,+this.flipX,+this.flipY,Ce(this.originX),Ce(this.originY)),e}calcTransformMatrix(){let t=arguments.length>0&&void 0!==arguments[0]&&arguments[0],e=this.calcOwnMatrix();if(t||!this.group)return e;const s=this.transformMatrixKey(t),i=this.matrixCache;return i&&i.key.every(((t,e)=>t===s[e]))?i.value:(this.group&&(e=Tt(this.group.calcTransformMatrix(false),e)),this.matrixCache={key:s,value:e},e)}calcOwnMatrix(){const t=this.transformMatrixKey(true),e=this.ownMatrixCache;if(e&&e.key===t)return e.value;const s=this.getRelativeCenterPoint(),i={angle:this.angle,translateX:s.x,translateY:s.y,scaleX:this.scaleX,scaleY:this.scaleY,skewX:this.skewX,skewY:this.skewY,flipX:this.flipX,flipY:this.flipY},r=Rt(i);return this.ownMatrixCache={key:t,value:r},r}_getNonTransformedDimensions(){return new ot(this.width,this.height).scalarAdd(this.strokeWidth)}_calculateCurrentDimensions(t){return this._getTransformedDimensions(t).transform(this.getViewportTransform(),true).scalarAdd(2*this.padding)}_getTransformedDimensions(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};const e=s({scaleX:this.scaleX,scaleY:this.scaleY,skewX:this.skewX,skewY:this.skewY,width:this.width,height:this.height,strokeWidth:this.strokeWidth},t),i=e.strokeWidth;let r=i,n=0;this.strokeUniform&&(r=0,n=i);const o=e.width+r,a=e.height+r;let h;return h=0===e.skewX&&0===e.skewY?new ot(o*e.scaleX,a*e.scaleY):fe(o,a,Lt(e)),h.scalarAdd(n)}translateToGivenOrigin(t,e,s,i,r){let n=t.x,o=t.y;const a=Ce(i)-Ce(e),h=Ce(r)-Ce(s);if(a||h){const t=this._getTransformedDimensions();n+=a*t.x,o+=h*t.y;}return new ot(n,o)}translateToCenterPoint(t,e,s){if(e===D&&s===D)return t;const i=this.translateToGivenOrigin(t,e,s,D,D);return this.angle?i.rotate(xt(this.angle),t):i}translateToOriginPoint(t,e,s){const i=this.translateToGivenOrigin(t,D,D,e,s);return this.angle?i.rotate(xt(this.angle),t):i}getCenterPoint(){const t=this.getRelativeCenterPoint();return this.group?St(t,this.group.calcTransformMatrix()):t}getRelativeCenterPoint(){return this.translateToCenterPoint(new ot(this.left,this.top),this.originX,this.originY)}getPointByOrigin(t,e){return this.translateToOriginPoint(this.getRelativeCenterPoint(),t,e)}setPositionByOrigin(t,e,s){const i=this.translateToCenterPoint(t,e,s),r=this.translateToOriginPoint(i,this.originX,this.originY);this.set({left:r.x,top:r.y});}_getLeftTopCoords(){return this.translateToOriginPoint(this.getRelativeCenterPoint(),M,P)}}const $s=["type"],ti=["extraParam"];let ei=class e extends Zs{static getDefaults(){return e.ownDefaults}get type(){const t=this.constructor.type;return "FabricObject"===t?"object":t.toLowerCase()}set type(t){a("warn","Setting type has no effect",t);}constructor(s){super(),t(this,"_cacheContext",null),Object.assign(this,e.ownDefaults),this.setOptions(s);}_createCacheCanvas(){this._cacheCanvas=pt(),this._cacheContext=this._cacheCanvas.getContext("2d"),this._updateCacheCanvas(),this.dirty=true;}_limitCacheSize(t){const e=t.width,s=t.height,i=o.maxCacheSideLimit,r=o.minCacheSideLimit;if(e<=i&&s<=i&&e*s<=o.perfLimitSizeTotal)return e<r&&(t.width=r),s<r&&(t.height=r),t;const n=e/s,[a,h]=_.limitDimsByArea(n),c=Ms(r,a,i),l=Ms(r,h,i);return e>c&&(t.zoomX/=e/c,t.width=c,t.capped=true),s>l&&(t.zoomY/=s/l,t.height=l,t.capped=true),t}_getCacheCanvasDimensions(){const t=this.getTotalObjectScaling(),e=this._getTransformedDimensions({skewX:0,skewY:0}),s=e.x*t.x/this.scaleX,i=e.y*t.y/this.scaleY;return {width:Math.ceil(s+2),height:Math.ceil(i+2),zoomX:t.x,zoomY:t.y,x:s,y:i}}_updateCacheCanvas(){const t=this._cacheCanvas,e=this._cacheContext,{width:s,height:i,zoomX:r,zoomY:n,x:o,y:a}=this._limitCacheSize(this._getCacheCanvasDimensions()),h=s!==t.width||i!==t.height,c=this.zoomX!==r||this.zoomY!==n;if(!t||!e)return  false;if(h||c){s!==t.width||i!==t.height?(t.width=s,t.height=i):(e.setTransform(1,0,0,1,0,0),e.clearRect(0,0,t.width,t.height));const h=o/2,c=a/2;return this.cacheTranslationX=Math.round(t.width/2-h)+h,this.cacheTranslationY=Math.round(t.height/2-c)+c,e.translate(this.cacheTranslationX,this.cacheTranslationY),e.scale(r,n),this.zoomX=r,this.zoomY=n,true}return  false}setOptions(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};this._setOptions(t);}transform(t){const e=this.group&&!this.group._transformDone||this.group&&this.canvas&&t===this.canvas.contextTop,s=this.calcTransformMatrix(!e);t.transform(s[0],s[1],s[2],s[3],s[4],s[5]);}getObjectScaling(){if(!this.group)return new ot(Math.abs(this.scaleX),Math.abs(this.scaleY));const t=Dt(this.calcTransformMatrix());return new ot(Math.abs(t.scaleX),Math.abs(t.scaleY))}getTotalObjectScaling(){const t=this.getObjectScaling();if(this.canvas){const e=this.canvas.getZoom(),s=this.getCanvasRetinaScaling();return t.scalarMultiply(e*s)}return t}getObjectOpacity(){let t=this.opacity;return this.group&&(t*=this.group.getObjectOpacity()),t}_constrainScale(t){return Math.abs(t)<this.minScaleLimit?t<0?-this.minScaleLimit:this.minScaleLimit:0===t?1e-4:t}_set(t,e){t!==H&&t!==N||(e=this._constrainScale(e)),t===H&&e<0?(this.flipX=!this.flipX,e*=-1):"scaleY"===t&&e<0?(this.flipY=!this.flipY,e*=-1):"shadow"!==t||!e||e instanceof Ds||(e=new Ds(e));const s=this[t]!==e;return this[t]=e,s&&this.constructor.cacheProperties.includes(t)&&(this.dirty=true),this.parent&&(this.dirty||s&&this.constructor.stateProperties.includes(t))&&this.parent._set("dirty",true),this}isNotVisible(){return 0===this.opacity||!this.width&&!this.height&&0===this.strokeWidth||!this.visible}render(t){this.isNotVisible()||this.canvas&&this.canvas.skipOffscreen&&!this.group&&!this.isOnScreen()||(t.save(),this._setupCompositeOperation(t),this.drawSelectionBackground(t),this.transform(t),this._setOpacity(t),this._setShadow(t),this.shouldCache()?(this.renderCache(),this.drawCacheOnCanvas(t)):(this._removeCacheCanvas(),this.drawObject(t,false,{}),this.dirty=false),t.restore());}drawSelectionBackground(t){}renderCache(t){if(t=t||{},this._cacheCanvas&&this._cacheContext||this._createCacheCanvas(),this.isCacheDirty()&&this._cacheContext){const{zoomX:e,zoomY:s,cacheTranslationX:i,cacheTranslationY:r}=this,{width:n,height:o}=this._cacheCanvas;this.drawObject(this._cacheContext,t.forClipping,{zoomX:e,zoomY:s,cacheTranslationX:i,cacheTranslationY:r,width:n,height:o,parentClipPaths:[]}),this.dirty=false;}}_removeCacheCanvas(){this._cacheCanvas=void 0,this._cacheContext=null;}hasStroke(){return this.stroke&&"transparent"!==this.stroke&&0!==this.strokeWidth}hasFill(){return this.fill&&"transparent"!==this.fill}needsItsOwnCache(){return !!(this.paintFirst===J&&this.hasFill()&&this.hasStroke()&&this.shadow)||!!this.clipPath}shouldCache(){return this.ownCaching=this.objectCaching&&(!this.parent||!this.parent.isOnACache())||this.needsItsOwnCache(),this.ownCaching}willDrawShadow(){return !!this.shadow&&(0!==this.shadow.offsetX||0!==this.shadow.offsetY)}drawClipPathOnCache(t,e,s){t.save(),e.inverted?t.globalCompositeOperation="destination-out":t.globalCompositeOperation="destination-in",t.setTransform(1,0,0,1,0,0),t.drawImage(s,0,0),t.restore();}drawObject(t,e,s){const i=this.fill,r=this.stroke;e?(this.fill="black",this.stroke="",this._setClippingProperties(t)):this._renderBackground(t),this._render(t),this._drawClipPath(t,this.clipPath,s),this.fill=i,this.stroke=r;}createClipPathLayer(t,e){const s=vt(e),i=s.getContext("2d");if(i.translate(e.cacheTranslationX,e.cacheTranslationY),i.scale(e.zoomX,e.zoomY),t._cacheCanvas=s,e.parentClipPaths.forEach((t=>{t.transform(i);})),e.parentClipPaths.push(t),t.absolutePositioned){const t=wt(this.calcTransformMatrix());i.transform(t[0],t[1],t[2],t[3],t[4],t[5]);}return t.transform(i),t.drawObject(i,true,e),s}_drawClipPath(t,e,s){if(!e)return;e._transformDone=true;const i=this.createClipPathLayer(e,s);this.drawClipPathOnCache(t,e,i);}drawCacheOnCanvas(t){t.scale(1/this.zoomX,1/this.zoomY),t.drawImage(this._cacheCanvas,-this.cacheTranslationX,-this.cacheTranslationY);}isCacheDirty(){let t=arguments.length>0&&void 0!==arguments[0]&&arguments[0];if(this.isNotVisible())return  false;const e=this._cacheCanvas,s=this._cacheContext;return !(!e||!s||t||!this._updateCacheCanvas())||!!(this.dirty||this.clipPath&&this.clipPath.absolutePositioned)&&(e&&s&&!t&&(s.save(),s.setTransform(1,0,0,1,0,0),s.clearRect(0,0,e.width,e.height),s.restore()),true)}_renderBackground(t){if(!this.backgroundColor)return;const e=this._getNonTransformedDimensions();t.fillStyle=this.backgroundColor,t.fillRect(-e.x/2,-e.y/2,e.x,e.y),this._removeShadow(t);}_setOpacity(t){this.group&&!this.group._transformDone?t.globalAlpha=this.getObjectOpacity():t.globalAlpha*=this.opacity;}_setStrokeStyles(t,e){const s=e.stroke;s&&(t.lineWidth=e.strokeWidth,t.lineCap=e.strokeLineCap,t.lineDashOffset=e.strokeDashOffset,t.lineJoin=e.strokeLineJoin,t.miterLimit=e.strokeMiterLimit,Gt(s)?"percentage"===s.gradientUnits||s.gradientTransform||s.patternTransform?this._applyPatternForTransformedGradient(t,s):(t.strokeStyle=s.toLive(t),this._applyPatternGradientTransform(t,s)):t.strokeStyle=e.stroke);}_setFillStyles(t,e){let{fill:s}=e;s&&(Gt(s)?(t.fillStyle=s.toLive(t),this._applyPatternGradientTransform(t,s)):t.fillStyle=s);}_setClippingProperties(t){t.globalAlpha=1,t.strokeStyle="transparent",t.fillStyle="#000000";}_setLineDash(t,e){e&&0!==e.length&&t.setLineDash(e);}_setShadow(t){if(!this.shadow)return;const e=this.shadow,s=this.canvas,i=this.getCanvasRetinaScaling(),[r,,,n]=(null==s?void 0:s.viewportTransform)||T,a=r*i,h=n*i,c=e.nonScaling?new ot(1,1):this.getObjectScaling();t.shadowColor=e.color,t.shadowBlur=e.blur*o.browserShadowBlurConstant*(a+h)*(c.x+c.y)/4,t.shadowOffsetX=e.offsetX*a*c.x,t.shadowOffsetY=e.offsetY*h*c.y;}_removeShadow(t){this.shadow&&(t.shadowColor="",t.shadowBlur=t.shadowOffsetX=t.shadowOffsetY=0);}_applyPatternGradientTransform(t,e){if(!Gt(e))return {offsetX:0,offsetY:0};const s=e.gradientTransform||e.patternTransform,i=-this.width/2+e.offsetX||0,r=-this.height/2+e.offsetY||0;return "percentage"===e.gradientUnits?t.transform(this.width,0,0,this.height,i,r):t.transform(1,0,0,1,i,r),s&&t.transform(s[0],s[1],s[2],s[3],s[4],s[5]),{offsetX:i,offsetY:r}}_renderPaintInOrder(t){this.paintFirst===J?(this._renderStroke(t),this._renderFill(t)):(this._renderFill(t),this._renderStroke(t));}_render(t){}_renderFill(t){this.fill&&(t.save(),this._setFillStyles(t,this),"evenodd"===this.fillRule?t.fill("evenodd"):t.fill(),t.restore());}_renderStroke(t){if(this.stroke&&0!==this.strokeWidth){if(this.shadow&&!this.shadow.affectStroke&&this._removeShadow(t),t.save(),this.strokeUniform){const e=this.getObjectScaling();t.scale(1/e.x,1/e.y);}this._setLineDash(t,this.strokeDashArray),this._setStrokeStyles(t,this),t.stroke(),t.restore();}}_applyPatternForTransformedGradient(t,e){var s;const i=this._limitCacheSize(this._getCacheCanvasDimensions()),r=this.getCanvasRetinaScaling(),n=i.x/this.scaleX/r,o=i.y/this.scaleY/r,a=vt({width:Math.ceil(n),height:Math.ceil(o)}),h=a.getContext("2d");h&&(h.beginPath(),h.moveTo(0,0),h.lineTo(n,0),h.lineTo(n,o),h.lineTo(0,o),h.closePath(),h.translate(n/2,o/2),h.scale(i.zoomX/this.scaleX/r,i.zoomY/this.scaleY/r),this._applyPatternGradientTransform(h,e),h.fillStyle=e.toLive(t),h.fill(),t.translate(-this.width/2-this.strokeWidth/2,-this.height/2-this.strokeWidth/2),t.scale(r*this.scaleX/i.zoomX,r*this.scaleY/i.zoomY),t.strokeStyle=null!==(s=h.createPattern(a,"no-repeat"))&&void 0!==s?s:"");}_findCenterFromElement(){return new ot(this.left+this.width/2,this.top+this.height/2)}clone(t){const e=this.toObject(t);return this.constructor.fromObject(e)}cloneAsImage(t){const e=this.toCanvasElement(t);return new(tt.getClass("image"))(e)}toCanvasElement(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};const e=ge(this),s=this.group,i=this.shadow,r=Math.abs,n=t.enableRetinaScaling?y():1,o=(t.multiplier||1)*n,a=t.canvasProvider||(t=>new ie(t,{enableRetinaScaling:false,renderOnAddRemove:false,skipOffscreen:false}));delete this.group,t.withoutTransform&&de(this),t.withoutShadow&&(this.shadow=null),t.viewportTransform&&ye(this,this.getViewportTransform()),this.setCoords();const h=pt(),c=this.getBoundingRect(),l=this.shadow,u=new ot;if(l){const t=l.blur,e=l.nonScaling?new ot(1,1):this.getObjectScaling();u.x=2*Math.round(r(l.offsetX)+t)*r(e.x),u.y=2*Math.round(r(l.offsetY)+t)*r(e.y);}const d=c.width+u.x,g=c.height+u.y;h.width=Math.ceil(d),h.height=Math.ceil(g);const f=a(h);"jpeg"===t.format&&(f.backgroundColor="#fff"),this.setPositionByOrigin(new ot(f.width/2,f.height/2),D,D);const p=this.canvas;f._objects=[this],this.set("canvas",f),this.setCoords();const m=f.toCanvasElement(o||1,t);return this.set("canvas",p),this.shadow=i,s&&(this.group=s),this.set(e),this.setCoords(),f._objects=[],f.destroy(),m}toDataURL(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};return yt(this.toCanvasElement(t),t.format||"png",t.quality||1)}toBlob(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};return _t(this.toCanvasElement(t),t.format||"png",t.quality||1)}isType(){for(var t=arguments.length,e=new Array(t),s=0;s<t;s++)e[s]=arguments[s];return e.includes(this.constructor.type)||e.includes(this.type)}complexity(){return 1}toJSON(){return this.toObject()}rotate(t){const{centeredRotation:e,originX:s,originY:i}=this;if(e){const{x:t,y:e}=this.getRelativeCenterPoint();this.originX=D,this.originY=D,this.left=t,this.top=e;}if(this.set("angle",t),e){const{x:t,y:e}=this.translateToOriginPoint(this.getRelativeCenterPoint(),s,i);this.left=t,this.top=e,this.originX=s,this.originY=i;}}setOnGroup(){}_setupCompositeOperation(t){this.globalCompositeOperation&&(t.globalCompositeOperation=this.globalCompositeOperation);}dispose(){et.cancelByTarget(this),this.off(),this._set("canvas",void 0),this._cacheCanvas&&p().dispose(this._cacheCanvas),this._cacheCanvas=void 0,this._cacheContext=null;}animate(t,e){return Object.entries(t).reduce(((t,s)=>{let[i,r]=s;return t[i]=this._animate(i,r,e),t}),{})}_animate(t,e){let i=arguments.length>2&&void 0!==arguments[2]?arguments[2]:{};const r=t.split("."),n=this.constructor.colorProperties.includes(r[r.length-1]),{abort:o,startValue:a,onChange:h,onComplete:c}=i,l=s(s({},i),{},{target:this,startValue:null!=a?a:r.reduce(((t,e)=>t[e]),this),endValue:e,abort:null==o?void 0:o.bind(this),onChange:(t,e,s)=>{r.reduce(((e,s,i)=>(i===r.length-1&&(e[s]=t),e[s])),this),h&&h(t,e,s);},onComplete:(t,e,s)=>{this.setCoords(),c&&c(t,e,s);}});return n?Js(l):Ks(l)}isDescendantOf(t){const{parent:e,group:s}=this;return e===t||s===t||!!e&&e.isDescendantOf(t)||!!s&&s!==e&&s.isDescendantOf(t)}getAncestors(){const t=[];let e=this;do{e=e.parent,e&&t.push(e);}while(e);return t}findCommonAncestors(t){if(this===t)return {fork:[],otherFork:[],common:[this,...this.getAncestors()]};const e=this.getAncestors(),s=t.getAncestors();if(0===e.length&&s.length>0&&this===s[s.length-1])return {fork:[],otherFork:[t,...s.slice(0,s.length-1)],common:[this]};for(let i,r=0;r<e.length;r++){if(i=e[r],i===t)return {fork:[this,...e.slice(0,r)],otherFork:[],common:e.slice(r)};for(let n=0;n<s.length;n++){if(this===s[n])return {fork:[],otherFork:[t,...s.slice(0,n)],common:[this,...e]};if(i===s[n])return {fork:[this,...e.slice(0,r)],otherFork:[t,...s.slice(0,n)],common:e.slice(r)}}}return {fork:[this,...e],otherFork:[t,...s],common:[]}}hasCommonAncestors(t){const e=this.findCommonAncestors(t);return e&&!!e.common.length}isInFrontOf(t){if(this===t)return;const e=this.findCommonAncestors(t);if(e.fork.includes(t))return  true;if(e.otherFork.includes(this))return  false;const s=e.common[0]||this.canvas;if(!s)return;const i=e.fork.pop(),r=e.otherFork.pop(),n=s._objects.indexOf(i),o=s._objects.indexOf(r);return n>-1&&n>o}toObject(){const t=(arguments.length>0&&void 0!==arguments[0]?arguments[0]:[]).concat(e.customProperties,this.constructor.customProperties||[]);let i;const r=o.NUM_FRACTION_DIGITS,{clipPath:n,fill:a,stroke:h,shadow:c,strokeDashArray:l,left:u,top:d,originX:g,originY:f,width:p,height:m,strokeWidth:v,strokeLineCap:y,strokeDashOffset:_,strokeLineJoin:C,strokeUniform:b,strokeMiterLimit:S,scaleX:w,scaleY:T,angle:O,flipX:k,flipY:D,opacity:M,visible:P,backgroundColor:E,fillRule:A,paintFirst:j,globalCompositeOperation:F,skewX:L,skewY:R}=this;n&&!n.excludeFromExport&&(i=n.toObject(t.concat("inverted","absolutePositioned")));const I=t=>Vt(t,r),B=s(s({},Yt(this,t)),{},{type:this.constructor.type,version:x,originX:g,originY:f,left:I(u),top:I(d),width:I(p),height:I(m),fill:Ht(a)?a.toObject():a,stroke:Ht(h)?h.toObject():h,strokeWidth:I(v),strokeDashArray:l?l.concat():l,strokeLineCap:y,strokeDashOffset:_,strokeLineJoin:C,strokeUniform:b,strokeMiterLimit:I(S),scaleX:I(w),scaleY:I(T),angle:I(O),flipX:k,flipY:D,opacity:I(M),shadow:c?c.toObject():c,visible:P,backgroundColor:E,fillRule:A,paintFirst:j,globalCompositeOperation:F,skewX:I(L),skewY:I(R)},i?{clipPath:i}:null);return this.includeDefaultValues?B:this._removeDefaultValues(B)}toDatalessObject(t){return this.toObject(t)}_removeDefaultValues(t){const e=this.constructor.getDefaults(),s=Object.keys(e).length>0?e:Object.getPrototypeOf(this);return Wt(t,((t,e)=>{if(e===M||e===P||"type"===e)return  true;const i=s[e];return t!==i&&!(Array.isArray(t)&&Array.isArray(i)&&0===t.length&&0===i.length)}))}toString(){return "#<".concat(this.constructor.type,">")}static _fromObject(t){let e=i(t,$s),s=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{},{extraParam:r}=s,n=i(s,ti);return Xt(e,n).then((t=>r?(delete t[r],new this(e[r],t)):new this(t)))}static fromObject(t,e){return this._fromObject(t,e)}};t(ei,"stateProperties",Ps),t(ei,"cacheProperties",Es),t(ei,"ownDefaults",As),t(ei,"type","FabricObject"),t(ei,"colorProperties",[K,J,"backgroundColor"]),t(ei,"customProperties",[]),tt.setClass(ei),tt.setClass(ei,"object");const si=(t,e,i)=>(r,n,o,a)=>{const h=e(r,n,o,a);return h&&_e(t,s(s({},Oe(r,n,o,a)),i)),h};function ii(t){return (e,s,i,r)=>{const{target:n,originX:o,originY:a}=s,h=n.getRelativeCenterPoint(),c=n.translateToOriginPoint(h,o,a),l=t(e,s,i,r);return n.setPositionByOrigin(c,s.originX,s.originY),l}}const ri=si(Y,ii(((t,e,s,i)=>{const r=De(e,e.originX,e.originY,s,i);if(Ce(e.originX)===Ce(D)||Ce(e.originX)===Ce(A)&&r.x<0||Ce(e.originX)===Ce(M)&&r.x>0){const{target:t}=e,s=t.strokeWidth/(t.strokeUniform?t.scaleX:1),i=Se(e)?2:1,n=t.width,o=Math.abs(r.x*i/t.scaleX)-s;return t.set("width",Math.max(o,1)),n!==t.width}return  false})));function ni(t,e,s,i,r){i=i||{};const n=this.sizeX||i.cornerSize||r.cornerSize,o=this.sizeY||i.cornerSize||r.cornerSize,a=void 0!==i.transparentCorners?i.transparentCorners:r.transparentCorners,h=a?J:K,c=!a&&(i.cornerStrokeColor||r.cornerStrokeColor);let l,u=e,d=s;t.save(),t.fillStyle=i.cornerColor||r.cornerColor||"",t.strokeStyle=i.cornerStrokeColor||r.cornerStrokeColor||"",n>o?(l=n,t.scale(1,o/n),d=s*n/o):o>n?(l=o,t.scale(n/o,1),u=e*o/n):l=n,t.beginPath(),t.arc(u,d,l/2,0,S,false),t[h](),c&&t.stroke(),t.restore();}function oi(t,e,s,i,r){i=i||{};const n=this.sizeX||i.cornerSize||r.cornerSize,o=this.sizeY||i.cornerSize||r.cornerSize,a=void 0!==i.transparentCorners?i.transparentCorners:r.transparentCorners,h=a?J:K,c=!a&&(i.cornerStrokeColor||r.cornerStrokeColor),l=n/2,u=o/2;t.save(),t.fillStyle=i.cornerColor||r.cornerColor||"",t.strokeStyle=i.cornerStrokeColor||r.cornerStrokeColor||"",t.translate(e,s);const d=r.getTotalAngle();t.rotate(xt(d)),t["".concat(h,"Rect")](-l,-u,n,o),c&&t.strokeRect(-l,-u,n,o),t.restore();}class ai{constructor(e){t(this,"visible",true),t(this,"actionName",G),t(this,"angle",0),t(this,"x",0),t(this,"y",0),t(this,"offsetX",0),t(this,"offsetY",0),t(this,"sizeX",0),t(this,"sizeY",0),t(this,"touchSizeX",0),t(this,"touchSizeY",0),t(this,"cursorStyle","crosshair"),t(this,"withConnection",false),Object.assign(this,e);}shouldActivate(t,e,s,i){var r;let{tl:n,tr:o,br:a,bl:h}=i;return (null===(r=e.canvas)||void 0===r?void 0:r.getActiveObject())===e&&e.isControlVisible(t)&&Qs.isPointInPolygon(s,[n,o,a,h])}getActionHandler(t,e,s){return this.actionHandler}getMouseDownHandler(t,e,s){return this.mouseDownHandler}getMouseUpHandler(t,e,s){return this.mouseUpHandler}cursorStyleHandler(t,e,s){return e.cursorStyle}getActionName(t,e,s){return e.actionName}getVisibility(t,e){var s,i;return null!==(s=null===(i=t._controlsVisibility)||void 0===i?void 0:i[e])&&void 0!==s?s:this.visible}setVisibility(t,e,s){this.visible=t;}positionHandler(t,e,s,i){return new ot(this.x*t.x+this.offsetX,this.y*t.y+this.offsetY).transform(e)}calcCornerCoords(t,e,s,i,r,n){const o=Ot([Mt(s,i),Pt({angle:t}),Et((r?this.touchSizeX:this.sizeX)||e,(r?this.touchSizeY:this.sizeY)||e)]);return {tl:new ot(-0.5,-0.5).transform(o),tr:new ot(.5,-0.5).transform(o),br:new ot(.5,.5).transform(o),bl:new ot(-0.5,.5).transform(o)}}render(t,e,s,i,r){if("circle"===((i=i||{}).cornerStyle||r.cornerStyle))ni.call(this,t,e,s,i,r);else oi.call(this,t,e,s,i,r);}}const hi=(t,e,s)=>s.lockRotation?be:e.cursorStyle,ci=si(I,ii(((t,e,s,i)=>{let{target:r,ex:n,ey:o,theta:a,originX:h,originY:c}=e;const l=r.translateToOriginPoint(r.getRelativeCenterPoint(),h,c);if(Te(r,"lockRotation"))return  false;const u=Math.atan2(o-l.y,n-l.x),d=Math.atan2(i-l.y,s-l.x);let g=Ct(d-u+a);if(r.snapAngle&&r.snapAngle>0){const t=r.snapAngle,e=r.snapThreshold||t,s=Math.ceil(g/t)*t,i=Math.floor(g/t)*t;Math.abs(g-i)<e?g=i:Math.abs(g-s)<e&&(g=s);}g<0&&(g=360+g),g%=360;const f=r.angle!==g;return r.angle=g,f})));function li(t,e){const s=e.canvas,i=t[s.uniScaleKey];return s.uniformScaling&&!i||!s.uniformScaling&&i}function ui(t,e,s){const i=Te(t,"lockScalingX"),r=Te(t,"lockScalingY");if(i&&r)return  true;if(!e&&(i||r)&&s)return  true;if(i&&"x"===e)return  true;if(r&&"y"===e)return  true;const{width:n,height:o,strokeWidth:a}=t;return 0===n&&0===a&&"y"!==e||0===o&&0===a&&"x"!==e}const di=["e","se","s","sw","w","nw","n","ne","e"],gi=(t,e,s)=>{const i=li(t,s);if(ui(s,0!==e.x&&0===e.y?"x":0===e.x&&0!==e.y?"y":"",i))return be;const r=ke(s,e);return "".concat(di[r],"-resize")};function fi(t,e,s,i){let r=arguments.length>4&&void 0!==arguments[4]?arguments[4]:{};const n=e.target,o=r.by,a=li(t,n);let h,c,l,u,d,g;if(ui(n,o,a))return  false;if(e.gestureScale)c=e.scaleX*e.gestureScale,l=e.scaleY*e.gestureScale;else {if(h=De(e,e.originX,e.originY,s,i),d="y"!==o?Math.sign(h.x||e.signX||1):1,g="x"!==o?Math.sign(h.y||e.signY||1):1,e.signX||(e.signX=d),e.signY||(e.signY=g),Te(n,"lockScalingFlip")&&(e.signX!==d||e.signY!==g))return  false;if(u=n._getTransformedDimensions(),a&&!o){const t=Math.abs(h.x)+Math.abs(h.y),{original:s}=e,i=t/(Math.abs(u.x*s.scaleX/n.scaleX)+Math.abs(u.y*s.scaleY/n.scaleY));c=s.scaleX*i,l=s.scaleY*i;}else c=Math.abs(h.x*n.scaleX/u.x),l=Math.abs(h.y*n.scaleY/u.y);Se(e)&&(c*=2,l*=2),e.signX!==d&&"y"!==o&&(e.originX=we(e.originX),c*=-1,e.signX=d),e.signY!==g&&"x"!==o&&(e.originY=we(e.originY),l*=-1,e.signY=g);}const f=n.scaleX,p=n.scaleY;return o?("x"===o&&n.set(H,c),"y"===o&&n.set(N,l)):(!Te(n,"lockScalingX")&&n.set(H,c),!Te(n,"lockScalingY")&&n.set(N,l)),f!==n.scaleX||p!==n.scaleY}const pi=si(R,ii(((t,e,s,i)=>fi(t,e,s,i)))),mi=si(R,ii(((t,e,s,i)=>fi(t,e,s,i,{by:"x"})))),vi=si(R,ii(((t,e,s,i)=>fi(t,e,s,i,{by:"y"})))),yi=["target","ex","ey","skewingSide"],_i={x:{counterAxis:"y",scale:H,skew:U,lockSkewing:"lockSkewingX",origin:"originX",flip:"flipX"},y:{counterAxis:"x",scale:N,skew:q,lockSkewing:"lockSkewingY",origin:"originY",flip:"flipY"}},xi=["ns","nesw","ew","nwse"],Ci=(t,e,s)=>{if(0!==e.x&&Te(s,"lockSkewingY"))return be;if(0!==e.y&&Te(s,"lockSkewingX"))return be;const i=ke(s,e)%4;return "".concat(xi[i],"-resize")};function bi(t,e,r,n,o){const{target:a}=r,{counterAxis:h,origin:c,lockSkewing:l,skew:u,flip:d}=_i[t];if(Te(a,l))return  false;const{origin:g,flip:f}=_i[h],p=Ce(r[g])*(a[f]?-1:1),m=-Math.sign(p)*(a[d]?-1:1),v=.5*-((0===a[u]&&De(r,D,D,n,o)[t]>0||a[u]>0?1:-1)*m)+.5,y=si(X,ii(((e,s,r,n)=>function(t,e,s){let{target:r,ex:n,ey:o,skewingSide:a}=e,h=i(e,yi);const{skew:c}=_i[t],l=s.subtract(new ot(n,o)).divide(new ot(r.scaleX,r.scaleY))[t],u=r[c],d=h[c],g=Math.tan(xt(d)),f="y"===t?r._getTransformedDimensions({scaleX:1,scaleY:1,skewX:0}).x:r._getTransformedDimensions({scaleX:1,scaleY:1}).y,p=2*l*a/Math.max(f,1)+g,m=Ct(Math.atan(p));r.set(c,m);const v=u!==r[c];if(v&&"y"===t){const{skewX:t,scaleX:e}=r,s=r._getTransformedDimensions({skewY:u}),i=r._getTransformedDimensions(),n=0!==t?s.x/i.x:1;1!==n&&r.set(H,n*e);}return v}(t,s,new ot(r,n)))));return y(e,s(s({},r),{},{[c]:v,skewingSide:m}),n,o)}const Si=(t,e,s,i)=>bi("x",t,e,s,i),wi=(t,e,s,i)=>bi("y",t,e,s,i);function Ti(t,e){return t[e.canvas.altActionKey]}const Oi=(t,e,s)=>{const i=Ti(t,s);return 0===e.x?i?U:N:0===e.y?i?q:H:""},ki=(t,e,s)=>Ti(t,s)?Ci(0,e,s):gi(t,e,s),Di=(t,e,s,i)=>Ti(t,e.target)?wi(t,e,s,i):mi(t,e,s,i),Mi=(t,e,s,i)=>Ti(t,e.target)?Si(t,e,s,i):vi(t,e,s,i),Pi=()=>({ml:new ai({x:-0.5,y:0,cursorStyleHandler:ki,actionHandler:Di,getActionName:Oi}),mr:new ai({x:.5,y:0,cursorStyleHandler:ki,actionHandler:Di,getActionName:Oi}),mb:new ai({x:0,y:.5,cursorStyleHandler:ki,actionHandler:Mi,getActionName:Oi}),mt:new ai({x:0,y:-0.5,cursorStyleHandler:ki,actionHandler:Mi,getActionName:Oi}),tl:new ai({x:-0.5,y:-0.5,cursorStyleHandler:gi,actionHandler:pi}),tr:new ai({x:.5,y:-0.5,cursorStyleHandler:gi,actionHandler:pi}),bl:new ai({x:-0.5,y:.5,cursorStyleHandler:gi,actionHandler:pi}),br:new ai({x:.5,y:.5,cursorStyleHandler:gi,actionHandler:pi}),mtr:new ai({x:0,y:-0.5,actionHandler:ci,cursorStyleHandler:hi,offsetY:-40,withConnection:true,actionName:B})}),Ei=()=>({mr:new ai({x:.5,y:0,actionHandler:ri,cursorStyleHandler:ki,actionName:Y}),ml:new ai({x:-0.5,y:0,actionHandler:ri,cursorStyleHandler:ki,actionName:Y})}),Ai=()=>s(s({},Pi()),Ei());class ji extends ei{static getDefaults(){return s(s({},super.getDefaults()),ji.ownDefaults)}constructor(t){super(),Object.assign(this,this.constructor.createControls(),ji.ownDefaults),this.setOptions(t);}static createControls(){return {controls:Pi()}}_updateCacheCanvas(){const t=this.canvas;if(this.noScaleCache&&t&&t._currentTransform){const e=t._currentTransform,s=e.target,i=e.action;if(this===s&&i&&i.startsWith(G))return  false}return super._updateCacheCanvas()}getActiveControl(){const t=this.__corner;return t?{key:t,control:this.controls[t],coord:this.oCoords[t]}:void 0}findControl(t){let e=arguments.length>1&&void 0!==arguments[1]&&arguments[1];if(!this.hasControls||!this.canvas)return;this.__corner=void 0;const s=Object.entries(this.oCoords);for(let i=s.length-1;i>=0;i--){const[r,n]=s[i],o=this.controls[r];if(o.shouldActivate(r,this,t,e?n.touchCorner:n.corner))return this.__corner=r,{key:r,control:o,coord:this.oCoords[r]}}}calcOCoords(){const t=this.getViewportTransform(),e=this.getCenterPoint(),s=Mt(e.x,e.y),i=Pt({angle:this.getTotalAngle()-(this.group&&this.flipX?180:0)}),r=Tt(s,i),n=Tt(t,r),o=Tt(n,[1/t[0],0,0,1/t[3],0,0]),a=this.group?Dt(this.calcTransformMatrix()):void 0;a&&(a.scaleX=Math.abs(a.scaleX),a.scaleY=Math.abs(a.scaleY));const h=this._calculateCurrentDimensions(a),c={};return this.forEachControl(((t,e)=>{const s=t.positionHandler(h,o,this,t);c[e]=Object.assign(s,this._calcCornerCoords(t,s));})),c}_calcCornerCoords(t,e){const s=this.getTotalAngle();return {corner:t.calcCornerCoords(s,this.cornerSize,e.x,e.y,false,this),touchCorner:t.calcCornerCoords(s,this.touchCornerSize,e.x,e.y,true,this)}}setCoords(){super.setCoords(),this.canvas&&(this.oCoords=this.calcOCoords());}forEachControl(t){for(const e in this.controls)t(this.controls[e],e,this);}drawSelectionBackground(t){if(!this.selectionBackgroundColor||this.canvas&&this.canvas._activeObject!==this)return;t.save();const e=this.getRelativeCenterPoint(),s=this._calculateCurrentDimensions(),i=this.getViewportTransform();t.translate(e.x,e.y),t.scale(1/i[0],1/i[3]),t.rotate(xt(this.angle)),t.fillStyle=this.selectionBackgroundColor,t.fillRect(-s.x/2,-s.y/2,s.x,s.y),t.restore();}strokeBorders(t,e){t.strokeRect(-e.x/2,-e.y/2,e.x,e.y);}_drawBorders(t,e){let i=arguments.length>2&&void 0!==arguments[2]?arguments[2]:{};const r=s({hasControls:this.hasControls,borderColor:this.borderColor,borderDashArray:this.borderDashArray},i);t.save(),t.strokeStyle=r.borderColor,this._setLineDash(t,r.borderDashArray),this.strokeBorders(t,e),r.hasControls&&this.drawControlsConnectingLines(t,e),t.restore();}_renderControls(t){let e=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{};const{hasBorders:i,hasControls:r}=this,n=s({hasBorders:i,hasControls:r},e),o=this.getViewportTransform(),a=n.hasBorders,h=n.hasControls,c=Tt(o,this.calcTransformMatrix()),l=Dt(c);t.save(),t.translate(l.translateX,l.translateY),t.lineWidth=this.borderScaleFactor,this.group===this.parent&&(t.globalAlpha=this.isMoving?this.borderOpacityWhenMoving:1),this.flipX&&(l.angle-=180),t.rotate(xt(this.group?l.angle:this.angle)),a&&this.drawBorders(t,l,e),h&&this.drawControls(t,e),t.restore();}drawBorders(t,e,s){let i;if(s&&s.forActiveSelection||this.group){const t=fe(this.width,this.height,Lt(e)),s=this.isStrokeAccountedForInDimensions()?at:(this.strokeUniform?(new ot).scalarAdd(this.canvas?this.canvas.getZoom():1):new ot(e.scaleX,e.scaleY)).scalarMultiply(this.strokeWidth);i=t.add(s).scalarAdd(this.borderScaleFactor).scalarAdd(2*this.padding);}else i=this._calculateCurrentDimensions().scalarAdd(this.borderScaleFactor);this._drawBorders(t,i,s);}drawControlsConnectingLines(t,e){let s=false;t.beginPath(),this.forEachControl(((i,r)=>{i.withConnection&&i.getVisibility(this,r)&&(s=true,t.moveTo(i.x*e.x,i.y*e.y),t.lineTo(i.x*e.x+i.offsetX,i.y*e.y+i.offsetY));})),s&&t.stroke();}drawControls(t){let e=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{};t.save();const i=this.getCanvasRetinaScaling(),{cornerStrokeColor:r,cornerDashArray:n,cornerColor:o}=this,a=s({cornerStrokeColor:r,cornerDashArray:n,cornerColor:o},e);t.setTransform(i,0,0,i,0,0),t.strokeStyle=t.fillStyle=a.cornerColor,this.transparentCorners||(t.strokeStyle=a.cornerStrokeColor),this._setLineDash(t,a.cornerDashArray),this.forEachControl(((e,s)=>{if(e.getVisibility(this,s)){const i=this.oCoords[s];e.render(t,i.x,i.y,a,this);}})),t.restore();}isControlVisible(t){return this.controls[t]&&this.controls[t].getVisibility(this,t)}setControlVisible(t,e){this._controlsVisibility||(this._controlsVisibility={}),this._controlsVisibility[t]=e;}setControlsVisibility(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};Object.entries(t).forEach((t=>{let[e,s]=t;return this.setControlVisible(e,s)}));}clearContextTop(t){if(!this.canvas)return;const e=this.canvas.contextTop;if(!e)return;const s=this.canvas.viewportTransform;e.save(),e.transform(s[0],s[1],s[2],s[3],s[4],s[5]),this.transform(e);const i=this.width+4,r=this.height+4;return e.clearRect(-i/2,-r/2,i,r),t||e.restore(),e}onDeselect(t){return  false}onSelect(t){return  false}shouldStartDragging(t){return  false}onDragStart(t){return  false}canDrop(t){return  false}renderDragSourceEffect(t){}renderDropTargetEffect(t){}}function Fi(t,e){return e.forEach((e=>{Object.getOwnPropertyNames(e.prototype).forEach((s=>{"constructor"!==s&&Object.defineProperty(t.prototype,s,Object.getOwnPropertyDescriptor(e.prototype,s)||Object.create(null));}));})),t}t(ji,"ownDefaults",{noScaleCache:true,lockMovementX:false,lockMovementY:false,lockRotation:false,lockScalingX:false,lockScalingY:false,lockSkewingX:false,lockSkewingY:false,lockScalingFlip:false,cornerSize:13,touchCornerSize:24,transparentCorners:true,cornerColor:"rgb(178,204,255)",cornerStrokeColor:"",cornerStyle:"rect",cornerDashArray:null,hasControls:true,borderColor:"rgb(178,204,255)",borderDashArray:null,borderOpacityWhenMoving:.4,borderScaleFactor:1,hasBorders:true,selectionBackgroundColor:"",selectable:true,evented:true,perPixelTargetFind:false,activeOn:"down",hoverCursor:null,moveCursor:null});class Li extends ji{}Fi(Li,[We]),tt.setClass(Li),tt.setClass(Li,"object");const Ri=(t,e,s,i)=>{const r=2*(i=Math.round(i))+1,{data:n}=t.getImageData(e-i,s-i,r,r);for(let t=3;t<n.length;t+=4){if(n[t]>0)return  false}return  true};class Ii{constructor(t){this.options=t,this.strokeProjectionMagnitude=this.options.strokeWidth/2,this.scale=new ot(this.options.scaleX,this.options.scaleY),this.strokeUniformScalar=this.options.strokeUniform?new ot(1/this.options.scaleX,1/this.options.scaleY):new ot(1,1);}createSideVector(t,e){const s=vs(t,e);return this.options.strokeUniform?s.multiply(this.scale):s}projectOrthogonally(t,e,s){return this.applySkew(t.add(this.calcOrthogonalProjection(t,e,s)))}isSkewed(){return 0!==this.options.skewX||0!==this.options.skewY}applySkew(t){const e=new ot(t);return e.y+=e.x*Math.tan(xt(this.options.skewY)),e.x+=e.y*Math.tan(xt(this.options.skewX)),e}scaleUnitVector(t,e){return t.multiply(this.strokeUniformScalar).scalarMultiply(e)}}const Bi=new ot;class Xi extends Ii{static getOrthogonalRotationFactor(t,e){const s=e?_s(t,e):xs(t);return Math.abs(s)<b?-1:1}constructor(e,s,i,r){super(r),t(this,"AB",void 0),t(this,"AC",void 0),t(this,"alpha",void 0),t(this,"bisector",void 0),this.A=new ot(e),this.B=new ot(s),this.C=new ot(i),this.AB=this.createSideVector(this.A,this.B),this.AC=this.createSideVector(this.A,this.C),this.alpha=_s(this.AB,this.AC),this.bisector=Cs(ms(this.AB.eq(Bi)?this.AC:this.AB,this.alpha/2));}calcOrthogonalProjection(t,e){let s=arguments.length>2&&void 0!==arguments[2]?arguments[2]:this.strokeProjectionMagnitude;const i=this.createSideVector(t,e),r=bs(i),n=Xi.getOrthogonalRotationFactor(r,this.bisector);return this.scaleUnitVector(r,s*n)}projectBevel(){const t=[];return (this.alpha%S==0?[this.B]:[this.B,this.C]).forEach((e=>{t.push(this.projectOrthogonally(this.A,e)),t.push(this.projectOrthogonally(this.A,e,-this.strokeProjectionMagnitude));})),t}projectMiter(){const t=[],e=Math.abs(this.alpha),s=1/Math.sin(e/2),i=this.scaleUnitVector(this.bisector,-this.strokeProjectionMagnitude*s),r=this.options.strokeUniform?ys(this.scaleUnitVector(this.bisector,this.options.strokeMiterLimit)):this.options.strokeMiterLimit;return ys(i)/this.strokeProjectionMagnitude<=r&&t.push(this.applySkew(this.A.add(i))),t.push(...this.projectBevel()),t}projectRoundNoSkew(t,e){const s=[],i=new ot(Xi.getOrthogonalRotationFactor(this.bisector),Xi.getOrthogonalRotationFactor(new ot(this.bisector.y,this.bisector.x)));return [new ot(1,0).scalarMultiply(this.strokeProjectionMagnitude).multiply(this.strokeUniformScalar).multiply(i),new ot(0,1).scalarMultiply(this.strokeProjectionMagnitude).multiply(this.strokeUniformScalar).multiply(i)].forEach((i=>{Ts(i,t,e)&&s.push(this.A.add(i));})),s}projectRoundWithSkew(t,e){const s=[],{skewX:i,skewY:r,scaleX:n,scaleY:o,strokeUniform:a}=this.options,h=new ot(Math.tan(xt(i)),Math.tan(xt(r))),c=this.strokeProjectionMagnitude,l=a?c/o/Math.sqrt(1/o**2+1/n**2*h.y**2):c/Math.sqrt(1+h.y**2),u=new ot(Math.sqrt(Math.max(c**2-l**2,0)),l),d=a?c/Math.sqrt(1+h.x**2*(1/o)**2/(1/n+1/n*h.x*h.y)**2):c/Math.sqrt(1+h.x**2/(1+h.x*h.y)**2),g=new ot(d,Math.sqrt(Math.max(c**2-d**2,0)));return [g,g.scalarMultiply(-1),u,u.scalarMultiply(-1)].map((t=>this.applySkew(a?t.multiply(this.strokeUniformScalar):t))).forEach((i=>{Ts(i,t,e)&&s.push(this.applySkew(this.A).add(i));})),s}projectRound(){const t=[];t.push(...this.projectBevel());const e=this.alpha%S==0,s=this.applySkew(this.A),i=t[e?0:2].subtract(s),r=t[e?1:0].subtract(s),n=e?this.applySkew(this.AB.scalarMultiply(-1)):this.applySkew(this.bisector.multiply(this.strokeUniformScalar).scalarMultiply(-1)),o=Ss(i,n)>0,a=o?i:r,h=o?r:i;return this.isSkewed()?t.push(...this.projectRoundWithSkew(a,h)):t.push(...this.projectRoundNoSkew(a,h)),t}projectPoints(){switch(this.options.strokeLineJoin){case "miter":return this.projectMiter();case "round":return this.projectRound();default:return this.projectBevel()}}project(){return this.projectPoints().map((t=>({originPoint:this.A,projectedPoint:t,angle:this.alpha,bisector:this.bisector})))}}class Yi extends Ii{constructor(t,e,s){super(s),this.A=new ot(t),this.T=new ot(e);}calcOrthogonalProjection(t,e){let s=arguments.length>2&&void 0!==arguments[2]?arguments[2]:this.strokeProjectionMagnitude;const i=this.createSideVector(t,e);return this.scaleUnitVector(bs(i),s)}projectButt(){return [this.projectOrthogonally(this.A,this.T,this.strokeProjectionMagnitude),this.projectOrthogonally(this.A,this.T,-this.strokeProjectionMagnitude)]}projectRound(){const t=[];if(!this.isSkewed()&&this.A.eq(this.T)){const e=new ot(1,1).scalarMultiply(this.strokeProjectionMagnitude).multiply(this.strokeUniformScalar);t.push(this.applySkew(this.A.add(e)),this.applySkew(this.A.subtract(e)));}else t.push(...new Xi(this.A,this.T,this.T,this.options).projectRound());return t}projectSquare(){const t=[];if(this.A.eq(this.T)){const e=new ot(1,1).scalarMultiply(this.strokeProjectionMagnitude).multiply(this.strokeUniformScalar);t.push(this.A.add(e),this.A.subtract(e));}else {const e=this.calcOrthogonalProjection(this.A,this.T,this.strokeProjectionMagnitude),s=this.scaleUnitVector(Cs(this.createSideVector(this.A,this.T)),-this.strokeProjectionMagnitude),i=this.A.add(s);t.push(i.add(e),i.subtract(e));}return t.map((t=>this.applySkew(t)))}projectPoints(){switch(this.options.strokeLineCap){case "round":return this.projectRound();case "square":return this.projectSquare();default:return this.projectButt()}}project(){return this.projectPoints().map((t=>({originPoint:this.A,projectedPoint:t})))}}const Wi=function(t,e){let s=arguments.length>2&&void 0!==arguments[2]&&arguments[2];const i=[];if(0===t.length)return i;const r=t.reduce(((t,e)=>(t[t.length-1].eq(e)||t.push(new ot(e)),t)),[new ot(t[0])]);if(1===r.length)s=true;else if(!s){const t=r[0],e=((t,e)=>{for(let s=t.length-1;s>=0;s--)if(e(t[s],s,t))return s;return  -1})(r,(e=>!e.eq(t)));r.splice(e+1);}return r.forEach(((t,r,n)=>{let o,a;0===r?(a=n[1],o=s?t:n[n.length-1]):r===n.length-1?(o=n[r-1],a=s?t:n[0]):(o=n[r-1],a=n[r+1]),s&&1===n.length?i.push(...new Yi(t,t,e).project()):!s||0!==r&&r!==n.length-1?i.push(...new Xi(t,o,a,e).project()):i.push(...new Yi(t,0===r?a:o,e).project());})),i},Vi=t=>{const e={};return Object.keys(t).forEach((i=>{e[i]={},Object.keys(t[i]).forEach((r=>{e[i][r]=s({},t[i][r]);}));})),e},zi=t=>t.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/'/g,"&apos;").replace(/</g,"&lt;").replace(/>/g,"&gt;");let Gi;const Hi=t=>{if(Gi||Gi||(Gi="Intl"in v()&&"Segmenter"in Intl&&new Intl.Segmenter(void 0,{granularity:"grapheme"})),Gi){const e=Gi.segment(t);return Array.from(e).map((t=>{let{segment:e}=t;return e}))}return Ni(t)},Ni=t=>{const e=[];for(let s,i=0;i<t.length;i++) false!==(s=Ui(t,i))&&e.push(s);return e},Ui=(t,e)=>{const s=t.charCodeAt(e);if(isNaN(s))return "";if(s<55296||s>57343)return t.charAt(e);if(55296<=s&&s<=56319){if(t.length<=e+1)throw "High surrogate without following low surrogate";const s=t.charCodeAt(e+1);if(56320>s||s>57343)throw "High surrogate without following low surrogate";return t.charAt(e)+t.charAt(e+1)}if(0===e)throw "Low surrogate without preceding high surrogate";const i=t.charCodeAt(e-1);if(55296>i||i>56319)throw "Low surrogate without preceding high surrogate";return  false};const Ki=function(t,e){let s=arguments.length>2&&void 0!==arguments[2]&&arguments[2];return t.fill!==e.fill||t.stroke!==e.stroke||t.strokeWidth!==e.strokeWidth||t.fontSize!==e.fontSize||t.fontFamily!==e.fontFamily||t.fontWeight!==e.fontWeight||t.fontStyle!==e.fontStyle||t.textDecorationThickness!==e.textDecorationThickness||t.textBackgroundColor!==e.textBackgroundColor||t.deltaY!==e.deltaY||s&&(t.overline!==e.overline||t.underline!==e.underline||t.linethrough!==e.linethrough)},Ji=(t,e)=>{const s=e.split("\n"),i=[];let r=-1,n={};t=Vi(t);for(let e=0;e<s.length;e++){const o=Hi(s[e]);if(t[e])for(let s=0;s<o.length;s++){r++;const o=t[e][s];o&&Object.keys(o).length>0&&(Ki(n,o,true)?i.push({start:r,end:r+1,style:o}):i[i.length-1].end++),n=o||{};}else r+=o.length,n={};}return i},Qi=(t,e)=>{if(!Array.isArray(t))return Vi(t);const i=e.split(F),r={};let n=-1,o=0;for(let e=0;e<i.length;e++){const a=Hi(i[e]);for(let i=0;i<a.length;i++)n++,t[o]&&t[o].start<=n&&n<t[o].end&&(r[e]=r[e]||{},r[e][i]=s({},t[o].style),n===t[o].end-1&&o++);}return r},Zi=["display","transform",K,"fill-opacity","fill-rule","opacity",J,"stroke-dasharray","stroke-linecap","stroke-dashoffset","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke-width","id","paint-order","vector-effect","instantiated_by_use","clip-path"];function $i(t,e){const s=t.nodeName,i=t.getAttribute("class"),r=t.getAttribute("id"),n="(?![a-zA-Z\\-]+)";let o;if(o=new RegExp("^"+s,"i"),e=e.replace(o,""),r&&e.length&&(o=new RegExp("#"+r+n,"i"),e=e.replace(o,"")),i&&e.length){const t=i.split(" ");for(let s=t.length;s--;)o=new RegExp("\\."+t[s]+n,"i"),e=e.replace(o,"");}return 0===e.length}function tr(t,e){let s=true;const i=$i(t,e.pop());return i&&e.length&&(s=function(t,e){let s,i=true;for(;t.parentElement&&1===t.parentElement.nodeType&&e.length;)i&&(s=e.pop()),i=$i(t=t.parentElement,s);return 0===e.length}(t,e)),i&&s&&0===e.length}const er=t=>{var e;return null!==(e=as[t])&&void 0!==e?e:t},sr=new RegExp("(".concat(is,")"),"gi"),ir=t=>Pe(t.replace(sr," $1 ").replace(/,/gi," "));var rr,nr,or,ar,hr,cr,lr;const ur="(".concat(is,")"),dr=String.raw(rr||(rr=r(["(skewX)(",")"],["(skewX)\\(","\\)"])),ur),gr=String.raw(nr||(nr=r(["(skewY)(",")"],["(skewY)\\(","\\)"])),ur),fr=String.raw(or||(or=r(["(rotate)(","(?: "," ",")?)"],["(rotate)\\(","(?: "," ",")?\\)"])),ur,ur,ur),pr=String.raw(ar||(ar=r(["(scale)(","(?: ",")?)"],["(scale)\\(","(?: ",")?\\)"])),ur,ur),mr=String.raw(hr||(hr=r(["(translate)(","(?: ",")?)"],["(translate)\\(","(?: ",")?\\)"])),ur,ur),vr=String.raw(cr||(cr=r(["(matrix)("," "," "," "," "," ",")"],["(matrix)\\("," "," "," "," "," ","\\)"])),ur,ur,ur,ur,ur,ur),yr="(?:".concat(vr,"|").concat(mr,"|").concat(fr,"|").concat(pr,"|").concat(dr,"|").concat(gr,")"),_r="(?:".concat(yr,"*)"),xr=String.raw(lr||(lr=r(["^s*(?:","?)s*$"],["^\\s*(?:","?)\\s*$"])),_r),Cr=new RegExp(xr),br=new RegExp(yr),Sr=new RegExp(yr,"g");function wr(t){const e=[];if(!(t=ir(t).replace(/\s*([()])\s*/gi,"$1"))||t&&!Cr.test(t))return [...T];for(const s of t.matchAll(Sr)){const t=br.exec(s[0]);if(!t)continue;let i=T;const r=t.filter((t=>!!t)),[,n,...o]=r,[a,h,c,l,u,d]=o.map((t=>parseFloat(t)));switch(n){case "translate":i=Mt(a,h);break;case B:i=Pt({angle:a},{x:h,y:c});break;case G:i=Et(a,h);break;case U:i=jt(a);break;case q:i=Ft(a);break;case "matrix":i=[a,h,c,l,u,d];}e.push(i);}return Ot(e)}function Tr(t,e,s,i){const r=Array.isArray(e);let n,o=e;if(t!==K&&t!==J||e!==j){if("strokeUniform"===t)return "non-scaling-stroke"===e;if("strokeDashArray"===t)o=e===j?null:e.replace(/,/g," ").split(/\s+/).map(parseFloat);else if("transformMatrix"===t)o=s&&s.transformMatrix?Tt(s.transformMatrix,wr(e)):wr(e);else if("visible"===t)o=e!==j&&"hidden"!==e,s&&false===s.visible&&(o=false);else if("opacity"===t)o=parseFloat(e),s&&void 0!==s.opacity&&(o*=s.opacity);else if("textAnchor"===t)o="start"===e?M:"end"===e?A:D;else if("charSpacing"===t||t===ze)n=Be(e,i)/i*1e3;else if("paintFirst"===t){const t=e.indexOf(K),s=e.indexOf(J);o=K,(t>-1&&s>-1&&s<t||-1===t&&s>-1)&&(o=J);}else {if("href"===t||"xlink:href"===t||"font"===t||"id"===t)return e;if("imageSmoothing"===t)return "optimizeQuality"===e;n=r?e.map(Be):Be(e,i);}}else o="";return !r&&isNaN(n)?o:n}function Or(t,e){const s=t.match(os);if(!s)return;const i=s[1],r=s[3],n=s[4],o=s[5],a=s[6];i&&(e.fontStyle=i),r&&(e.fontWeight=isNaN(parseFloat(r))?r:parseFloat(r)),n&&(e.fontSize=Be(n)),a&&(e.fontFamily=a),o&&(e.lineHeight="normal"===o?1:o);}function kr(t,e){t.replace(/;\s*$/,"").split(";").forEach((t=>{if(!t)return;const[s,i]=t.split(":");e[s.trim().toLowerCase()]=i.trim();}));}function Dr(t){const e={},s=t.getAttribute("style");return s?("string"==typeof s?kr(s,e):function(t,e){Object.entries(t).forEach((t=>{let[s,i]=t;void 0!==i&&(e[s.toLowerCase()]=i);}));}(s,e),e):e}const Mr={stroke:"strokeOpacity",fill:"fillOpacity"};function Pr(t,e,i){if(!t)return {};let r,n={},o=O;t.parentNode&&ds.test(t.parentNode.nodeName)&&(n=Pr(t.parentElement,e,i),n.fontSize&&(r=o=Be(n.fontSize)));const a=s(s(s({},e.reduce(((e,s)=>{const i=t.getAttribute(s);return i&&(e[s]=i),e}),{})),function(t){let e=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{},i={};for(const r in e)tr(t,r.split(" "))&&(i=s(s({},i),e[r]));return i}(t,i)),Dr(t));a[cs]&&t.setAttribute(cs,a[cs]),a[hs]&&(r=Be(a[hs],o),a[hs]="".concat(r));const h={};for(const t in a){const e=er(t),s=Tr(e,a[t],n,r);h[e]=s;}h&&h.font&&Or(h.font,h);const c=s(s({},n),h);return ds.test(t.nodeName)?c:function(t){const e=Li.getDefaults();return Object.entries(Mr).forEach((s=>{let[i,r]=s;if(void 0===t[r]||""===t[i])return;if(void 0===t[i]){if(!e[i])return;t[i]=e[i];}if(0===t[i].indexOf("url("))return;const n=new Ie(t[i]);t[i]=n.setAlpha(Vt(n.getAlpha()*t[r],2)).toRgba();})),t}(c)}const Er=["left","top","width","height","visible"],Ar=["rx","ry"];class jr extends Li{static getDefaults(){return s(s({},super.getDefaults()),jr.ownDefaults)}constructor(t){super(),Object.assign(this,jr.ownDefaults),this.setOptions(t),this._initRxRy();}_initRxRy(){const{rx:t,ry:e}=this;t&&!e?this.ry=t:e&&!t&&(this.rx=e);}_render(t){const{width:e,height:s}=this,i=-e/2,r=-s/2,n=this.rx?Math.min(this.rx,e/2):0,o=this.ry?Math.min(this.ry,s/2):0,a=0!==n||0!==o;t.beginPath(),t.moveTo(i+n,r),t.lineTo(i+e-n,r),a&&t.bezierCurveTo(i+e-k*n,r,i+e,r+k*o,i+e,r+o),t.lineTo(i+e,r+s-o),a&&t.bezierCurveTo(i+e,r+s-k*o,i+e-k*n,r+s,i+e-n,r+s),t.lineTo(i+n,r+s),a&&t.bezierCurveTo(i+k*n,r+s,i,r+s-k*o,i,r+s-o),t.lineTo(i,r+o),a&&t.bezierCurveTo(i,r+k*o,i+k*n,r,i+n,r),t.closePath(),this._renderPaintInOrder(t);}toObject(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:[];return super.toObject([...Ar,...t])}_toSVG(){const{width:t,height:e,rx:s,ry:i}=this;return ["<rect ","COMMON_PARTS",'x="'.concat(-t/2,'" y="').concat(-e/2,'" rx="').concat(s,'" ry="').concat(i,'" width="').concat(t,'" height="').concat(e,'" />\n')]}static async fromElement(t,e,r){const n=Pr(t,this.ATTRIBUTE_NAMES,r),{left:o=0,top:a=0,width:h=0,height:c=0,visible:l=true}=n,u=i(n,Er);return new this(s(s(s({},e),u),{},{left:o,top:a,width:h,height:c,visible:Boolean(l&&h&&c)}))}}t(jr,"type","Rect"),t(jr,"cacheProperties",[...Es,...Ar]),t(jr,"ownDefaults",{rx:0,ry:0}),t(jr,"ATTRIBUTE_NAMES",[...Zi,"x","y","rx","ry","width","height"]),tt.setClass(jr),tt.setSVGClass(jr);const Fr="initialization",Lr="added",Rr="removed",Ir="imperative",Br=(t,e)=>{const{strokeUniform:s,strokeWidth:i,width:r,height:n,group:o}=e,a=o&&o!==t?pe(o.calcTransformMatrix(),t.calcTransformMatrix()):null,h=a?e.getRelativeCenterPoint().transform(a):e.getRelativeCenterPoint(),c=!e.isStrokeAccountedForInDimensions(),l=s&&c?ve(new ot(i,i),void 0,t.calcTransformMatrix()):at,u=!s&&c?i:0,d=fe(r+u,n+u,Ot([a,e.calcOwnMatrix()],true)).add(l).scalarDivide(2);return [h.subtract(d),h.add(d)]};class Xr{calcLayoutResult(t,e){if(this.shouldPerformLayout(t))return this.calcBoundingBox(e,t)}shouldPerformLayout(t){let{type:e,prevStrategy:s,strategy:i}=t;return e===Fr||e===Ir||!!s&&i!==s}shouldLayoutClipPath(t){let{type:e,target:{clipPath:s}}=t;return e!==Fr&&s&&!s.absolutePositioned}getInitialSize(t,e){return e.size}calcBoundingBox(t,e){const{type:s,target:i}=e;if(s===Ir&&e.overrides)return e.overrides;if(0===t.length)return;const{left:r,top:n,width:o,height:a}=he(t.map((t=>Br(i,t))).reduce(((t,e)=>t.concat(e)),[])),h=new ot(o,a),c=new ot(r,n).add(h.scalarDivide(2));if(s===Fr){const t=this.getInitialSize(e,{size:h,center:c});return {center:c,relativeCorrection:new ot(0,0),size:t}}return {center:c.transform(i.calcOwnMatrix()),size:h}}}t(Xr,"type","strategy");class Yr extends Xr{shouldPerformLayout(t){return  true}}t(Yr,"type","fit-content"),tt.setClass(Yr);const Wr=["strategy"],Vr=["target","strategy","bubbles","prevStrategy"],zr="layoutManager";class Gr{constructor(){let e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:new Yr;t(this,"strategy",void 0),this.strategy=e,this._subscriptions=new Map;}performLayout(t){const e=s(s({bubbles:true,strategy:this.strategy},t),{},{prevStrategy:this._prevLayoutStrategy,stopPropagation(){this.bubbles=false;}});this.onBeforeLayout(e);const i=this.getLayoutResult(e);i&&this.commitLayout(e,i),this.onAfterLayout(e,i),this._prevLayoutStrategy=e.strategy;}attachHandlers(t,e){const{target:s}=e;return [Q,L,Y,I,R,X,z,W,V].map((e=>t.on(e,(t=>this.performLayout(e===Q?{type:"object_modified",trigger:e,e:t,target:s}:{type:"object_modifying",trigger:e,e:t,target:s})))))}subscribe(t,e){this.unsubscribe(t,e);const s=this.attachHandlers(t,e);this._subscriptions.set(t,s);}unsubscribe(t,e){(this._subscriptions.get(t)||[]).forEach((t=>t())),this._subscriptions.delete(t);}unsubscribeTargets(t){t.targets.forEach((e=>this.unsubscribe(e,t)));}subscribeTargets(t){t.targets.forEach((e=>this.subscribe(e,t)));}onBeforeLayout(t){const{target:e,type:r}=t,{canvas:n}=e;if(r===Fr||r===Lr?this.subscribeTargets(t):r===Rr&&this.unsubscribeTargets(t),e.fire("layout:before",{context:t}),n&&n.fire("object:layout:before",{target:e,context:t}),r===Ir&&t.deep){const r=i(t,Wr);e.forEachObject((t=>t.layoutManager&&t.layoutManager.performLayout(s(s({},r),{},{bubbles:false,target:t}))));}}getLayoutResult(t){const{target:e,strategy:s,type:i}=t,r=s.calcLayoutResult(t,e.getObjects());if(!r)return;const n=i===Fr?new ot:e.getRelativeCenterPoint(),{center:o,correction:a=new ot,relativeCorrection:h=new ot}=r,c=n.subtract(o).add(a).transform(i===Fr?T:wt(e.calcOwnMatrix()),true).add(h);return {result:r,prevCenter:n,nextCenter:o,offset:c}}commitLayout(t,e){const{target:s}=t,{result:{size:i},nextCenter:r}=e;var n,o;(s.set({width:i.x,height:i.y}),this.layoutObjects(t,e),t.type===Fr)?s.set({left:null!==(n=t.x)&&void 0!==n?n:r.x+i.x*Ce(s.originX),top:null!==(o=t.y)&&void 0!==o?o:r.y+i.y*Ce(s.originY)}):(s.setPositionByOrigin(r,D,D),s.setCoords(),s.set("dirty",true));}layoutObjects(t,e){const{target:s}=t;s.forEachObject((i=>{i.group===s&&this.layoutObject(t,e,i);})),t.strategy.shouldLayoutClipPath(t)&&this.layoutObject(t,e,s.clipPath);}layoutObject(t,e,s){let{offset:i}=e;s.set({left:s.left+i.x,top:s.top+i.y});}onAfterLayout(t,e){const{target:r,strategy:n,bubbles:o,prevStrategy:a}=t,h=i(t,Vr),{canvas:c}=r;r.fire("layout:after",{context:t,result:e}),c&&c.fire("object:layout:after",{context:t,result:e,target:r});const l=r.parent;o&&null!=l&&l.layoutManager&&((h.path||(h.path=[])).push(r),l.layoutManager.performLayout(s(s({},h),{},{target:l}))),r.set("dirty",true);}dispose(){const{_subscriptions:t}=this;t.forEach((t=>t.forEach((t=>t())))),t.clear();}toObject(){return {type:zr,strategy:this.strategy.constructor.type}}toJSON(){return this.toObject()}}tt.setClass(Gr,zr);const Hr=["type","objects","layoutManager"];class Nr extends Gr{performLayout(){}}class Ur extends(ct(Li)){static getDefaults(){return s(s({},super.getDefaults()),Ur.ownDefaults)}constructor(){let e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:[],s=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{};super(),t(this,"_activeObjects",[]),t(this,"__objectSelectionTracker",void 0),t(this,"__objectSelectionDisposer",void 0),Object.assign(this,Ur.ownDefaults),this.setOptions(s),this.groupInit(e,s);}groupInit(t,e){var s;this._objects=[...t],this.__objectSelectionTracker=this.__objectSelectionMonitor.bind(this,true),this.__objectSelectionDisposer=this.__objectSelectionMonitor.bind(this,false),this.forEachObject((t=>{this.enterGroup(t,false);})),this.layoutManager=null!==(s=e.layoutManager)&&void 0!==s?s:new Gr,this.layoutManager.performLayout({type:Fr,target:this,targets:[...t],x:e.left,y:e.top});}canEnterGroup(t){return t===this||this.isDescendantOf(t)?(a("error","Group: circular object trees are not supported, this call has no effect"),false):-1===this._objects.indexOf(t)||(a("error","Group: duplicate objects are not supported inside group, this call has no effect"),false)}_filterObjectsBeforeEnteringGroup(t){return t.filter(((t,e,s)=>this.canEnterGroup(t)&&s.indexOf(t)===e))}add(){for(var t=arguments.length,e=new Array(t),s=0;s<t;s++)e[s]=arguments[s];const i=this._filterObjectsBeforeEnteringGroup(e),r=super.add(...i);return this._onAfterObjectsChange(Lr,i),r}insertAt(t){for(var e=arguments.length,s=new Array(e>1?e-1:0),i=1;i<e;i++)s[i-1]=arguments[i];const r=this._filterObjectsBeforeEnteringGroup(s),n=super.insertAt(t,...r);return this._onAfterObjectsChange(Lr,r),n}remove(){const t=super.remove(...arguments);return this._onAfterObjectsChange(Rr,t),t}_onObjectAdded(t){this.enterGroup(t,true),this.fire("object:added",{target:t}),t.fire("added",{target:this});}_onObjectRemoved(t,e){this.exitGroup(t,e),this.fire("object:removed",{target:t}),t.fire("removed",{target:this});}_onAfterObjectsChange(t,e){this.layoutManager.performLayout({type:t,targets:e,target:this});}_onStackOrderChanged(){this._set("dirty",true);}_set(t,e){const s=this[t];return super._set(t,e),"canvas"===t&&s!==e&&(this._objects||[]).forEach((s=>{s._set(t,e);})),this}_shouldSetNestedCoords(){return this.subTargetCheck}removeAll(){return this._activeObjects=[],this.remove(...this._objects)}__objectSelectionMonitor(t,e){let{target:s}=e;const i=this._activeObjects;if(t)i.push(s),this._set("dirty",true);else if(i.length>0){const t=i.indexOf(s);t>-1&&(i.splice(t,1),this._set("dirty",true));}}_watchObject(t,e){t&&this._watchObject(false,e),t?(e.on("selected",this.__objectSelectionTracker),e.on("deselected",this.__objectSelectionDisposer)):(e.off("selected",this.__objectSelectionTracker),e.off("deselected",this.__objectSelectionDisposer));}enterGroup(t,e){t.group&&t.group.remove(t),t._set("parent",this),this._enterGroup(t,e);}_enterGroup(t,e){e&&ue(t,Tt(wt(this.calcTransformMatrix()),t.calcTransformMatrix())),this._shouldSetNestedCoords()&&t.setCoords(),t._set("group",this),t._set("canvas",this.canvas),this._watchObject(true,t);const s=this.canvas&&this.canvas.getActiveObject&&this.canvas.getActiveObject();s&&(s===t||t.isDescendantOf(s))&&this._activeObjects.push(t);}exitGroup(t,e){this._exitGroup(t,e),t._set("parent",void 0),t._set("canvas",void 0);}_exitGroup(t,e){t._set("group",void 0),e||(ue(t,Tt(this.calcTransformMatrix(),t.calcTransformMatrix())),t.setCoords()),this._watchObject(false,t);const s=this._activeObjects.length>0?this._activeObjects.indexOf(t):-1;s>-1&&this._activeObjects.splice(s,1);}shouldCache(){const t=Li.prototype.shouldCache.call(this);if(t)for(let t=0;t<this._objects.length;t++)if(this._objects[t].willDrawShadow())return this.ownCaching=false,false;return t}willDrawShadow(){if(super.willDrawShadow())return  true;for(let t=0;t<this._objects.length;t++)if(this._objects[t].willDrawShadow())return  true;return  false}isOnACache(){return this.ownCaching||!!this.parent&&this.parent.isOnACache()}drawObject(t,e,s){this._renderBackground(t);for(let e=0;e<this._objects.length;e++){var i;const s=this._objects[e];null!==(i=this.canvas)&&void 0!==i&&i.preserveObjectStacking&&s.group!==this?(t.save(),t.transform(...wt(this.calcTransformMatrix())),s.render(t),t.restore()):s.group===this&&s.render(t);}this._drawClipPath(t,this.clipPath,s);}setCoords(){super.setCoords(),this._shouldSetNestedCoords()&&this.forEachObject((t=>t.setCoords()));}triggerLayout(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};this.layoutManager.performLayout(s({target:this,type:Ir},t));}render(t){this._transformDone=true,super.render(t),this._transformDone=false;}__serializeObjects(t,e){const s=this.includeDefaultValues;return this._objects.filter((function(t){return !t.excludeFromExport})).map((function(i){const r=i.includeDefaultValues;i.includeDefaultValues=s;const n=i[t||"toObject"](e);return i.includeDefaultValues=r,n}))}toObject(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:[];const e=this.layoutManager.toObject();return s(s(s({},super.toObject(["subTargetCheck","interactive",...t])),"fit-content"!==e.strategy||this.includeDefaultValues?{layoutManager:e}:{}),{},{objects:this.__serializeObjects("toObject",t)})}toString(){return "#<Group: (".concat(this.complexity(),")>")}dispose(){this.layoutManager.unsubscribeTargets({targets:this.getObjects(),target:this}),this._activeObjects=[],this.forEachObject((t=>{this._watchObject(false,t),t.dispose();})),super.dispose();}_createSVGBgRect(t){if(!this.backgroundColor)return "";const e=jr.prototype._toSVG.call(this),s=e.indexOf("COMMON_PARTS");e[s]='for="group" ';const i=e.join("");return t?t(i):i}_toSVG(t){const e=["<g ","COMMON_PARTS"," >\n"],s=this._createSVGBgRect(t);s&&e.push("\t\t",s);for(let s=0;s<this._objects.length;s++)e.push("\t\t",this._objects[s].toSVG(t));return e.push("</g>\n"),e}getSvgStyles(){const t=void 0!==this.opacity&&1!==this.opacity?"opacity: ".concat(this.opacity,";"):"",e=this.visible?"":" visibility: hidden;";return [t,this.getSvgFilter(),e].join("")}toClipPathSVG(t){const e=[],s=this._createSVGBgRect(t);s&&e.push("\t",s);for(let s=0;s<this._objects.length;s++)e.push("\t",this._objects[s].toClipPathSVG(t));return this._createBaseClipPathSVGMarkup(e,{reviver:t})}static fromObject(t,e){let{type:r,objects:n=[],layoutManager:o}=t,a=i(t,Hr);return Promise.all([Bt(n,e),Xt(a,e)]).then((t=>{let[e,i]=t;const r=new this(e,s(s(s({},a),i),{},{layoutManager:new Nr}));if(o){const t=tt.getClass(o.type),e=tt.getClass(o.strategy);r.layoutManager=new t(new e);}else r.layoutManager=new Gr;return r.layoutManager.subscribeTargets({type:Fr,target:r,targets:r.getObjects()}),r.setCoords(),r}))}}t(Ur,"type","Group"),t(Ur,"ownDefaults",{strokeWidth:0,subTargetCheck:false,interactive:false}),tt.setClass(Ur);const qr=(t,e)=>Math.min(e.width/t.width,e.height/t.height),Kr=(t,e)=>Math.max(e.width/t.width,e.height/t.height),Jr="\\s*,?\\s*",Qr="".concat(Jr,"(").concat(is,")"),Zr="".concat(Qr).concat(Qr).concat(Qr).concat(Jr,"([01])").concat(Jr,"([01])").concat(Qr).concat(Qr),$r={m:"l",M:"L"},tn=(t,e,s,i,r,n,o,a,h,c,l)=>{const u=rt(t),d=nt(t),g=rt(e),f=nt(e),p=s*r*g-i*n*f+o,m=i*r*g+s*n*f+a;return ["C",c+h*(-s*r*d-i*n*u),l+h*(-i*r*d+s*n*u),p+h*(s*r*f+i*n*g),m+h*(i*r*f-s*n*g),p,m]},en=(t,e,s,i)=>{const r=Math.atan2(e,t),n=Math.atan2(i,s);return n>=r?n-r:2*Math.PI-(r-n)};function sn(t,e,s,i,r,n,a,h){let c;if(o.cachesBoundsOfCurve&&(c=[...arguments].join(),_.boundsOfCurveCache[c]))return _.boundsOfCurveCache[c];const l=Math.sqrt,u=Math.abs,d=[],g=[[0,0],[0,0]];let f=6*t-12*s+6*r,p=-3*t+9*s-9*r+3*a,m=3*s-3*t;for(let t=0;t<2;++t){if(t>0&&(f=6*e-12*i+6*n,p=-3*e+9*i-9*n+3*h,m=3*i-3*e),u(p)<1e-12){if(u(f)<1e-12)continue;const t=-m/f;0<t&&t<1&&d.push(t);continue}const s=f*f-4*m*p;if(s<0)continue;const r=l(s),o=(-f+r)/(2*p);0<o&&o<1&&d.push(o);const a=(-f-r)/(2*p);0<a&&a<1&&d.push(a);}let v=d.length;const y=v,x=an(t,e,s,i,r,n,a,h);for(;v--;){const{x:t,y:e}=x(d[v]);g[0][v]=t,g[1][v]=e;}g[0][y]=t,g[1][y]=e,g[0][y+1]=a,g[1][y+1]=h;const C=[new ot(Math.min(...g[0]),Math.min(...g[1])),new ot(Math.max(...g[0]),Math.max(...g[1]))];return o.cachesBoundsOfCurve&&(_.boundsOfCurveCache[c]=C),C}const rn=(t,e,s)=>{let[i,r,n,o,a,h,c,l]=s;const u=((t,e,s,i,r,n,o)=>{if(0===s||0===i)return [];let a=0,h=0,c=0;const l=Math.PI,u=o*w,d=nt(u),g=rt(u),f=.5*(-g*t-d*e),p=.5*(-g*e+d*t),m=s**2,v=i**2,y=p**2,_=f**2,x=m*v-m*y-v*_;let C=Math.abs(s),b=Math.abs(i);if(x<0){const t=Math.sqrt(1-x/(m*v));C*=t,b*=t;}else c=(r===n?-1:1)*Math.sqrt(x/(m*y+v*_));const S=c*C*p/b,T=-c*b*f/C,O=g*S-d*T+.5*t,k=d*S+g*T+.5*e;let D=en(1,0,(f-S)/C,(p-T)/b),M=en((f-S)/C,(p-T)/b,(-f-S)/C,(-p-T)/b);0===n&&M>0?M-=2*l:1===n&&M<0&&(M+=2*l);const P=Math.ceil(Math.abs(M/l*2)),E=[],A=M/P,j=8/3*Math.sin(A/4)*Math.sin(A/4)/Math.sin(A/2);let F=D+A;for(let t=0;t<P;t++)E[t]=tn(D,F,g,d,C,b,O,k,j,a,h),a=E[t][5],h=E[t][6],D=F,F+=A;return E})(c-t,l-e,r,n,a,h,o);for(let s=0,i=u.length;s<i;s++)u[s][1]+=t,u[s][2]+=e,u[s][3]+=t,u[s][4]+=e,u[s][5]+=t,u[s][6]+=e;return u},nn=t=>{let e=0,s=0,i=0,r=0;const n=[];let o,a=0,h=0;for(const c of t){const t=[...c];let l;switch(t[0]){case "l":t[1]+=e,t[2]+=s;case "L":e=t[1],s=t[2],l=["L",e,s];break;case "h":t[1]+=e;case "H":e=t[1],l=["L",e,s];break;case "v":t[1]+=s;case "V":s=t[1],l=["L",e,s];break;case "m":t[1]+=e,t[2]+=s;case "M":e=t[1],s=t[2],i=t[1],r=t[2],l=["M",e,s];break;case "c":t[1]+=e,t[2]+=s,t[3]+=e,t[4]+=s,t[5]+=e,t[6]+=s;case "C":a=t[3],h=t[4],e=t[5],s=t[6],l=["C",t[1],t[2],a,h,e,s];break;case "s":t[1]+=e,t[2]+=s,t[3]+=e,t[4]+=s;case "S":"C"===o?(a=2*e-a,h=2*s-h):(a=e,h=s),e=t[3],s=t[4],l=["C",a,h,t[1],t[2],e,s],a=l[3],h=l[4];break;case "q":t[1]+=e,t[2]+=s,t[3]+=e,t[4]+=s;case "Q":a=t[1],h=t[2],e=t[3],s=t[4],l=["Q",a,h,e,s];break;case "t":t[1]+=e,t[2]+=s;case "T":"Q"===o?(a=2*e-a,h=2*s-h):(a=e,h=s),e=t[1],s=t[2],l=["Q",a,h,e,s];break;case "a":t[6]+=e,t[7]+=s;case "A":rn(e,s,t).forEach((t=>n.push(t))),e=t[6],s=t[7];break;case "z":case "Z":e=i,s=r,l=["Z"];}l?(n.push(l),o=l[0]):o="";}return n},on=(t,e,s,i)=>Math.sqrt((s-t)**2+(i-e)**2),an=(t,e,s,i,r,n,o,a)=>h=>{const c=h**3,l=(t=>3*t**2*(1-t))(h),u=(t=>3*t*(1-t)**2)(h),d=(t=>(1-t)**3)(h);return new ot(o*c+r*l+s*u+t*d,a*c+n*l+i*u+e*d)},hn=t=>t**2,cn=t=>2*t*(1-t),ln=t=>(1-t)**2,un=(t,e,s,i,r,n,o,a)=>h=>{const c=hn(h),l=cn(h),u=ln(h),d=3*(u*(s-t)+l*(r-s)+c*(o-r)),g=3*(u*(i-e)+l*(n-i)+c*(a-n));return Math.atan2(g,d)},dn=(t,e,s,i,r,n)=>o=>{const a=hn(o),h=cn(o),c=ln(o);return new ot(r*a+s*h+t*c,n*a+i*h+e*c)},gn=(t,e,s,i,r,n)=>o=>{const a=1-o,h=2*(a*(s-t)+o*(r-s)),c=2*(a*(i-e)+o*(n-i));return Math.atan2(c,h)},fn=(t,e,s)=>{let i=new ot(e,s),r=0;for(let e=1;e<=100;e+=1){const s=t(e/100);r+=on(i.x,i.y,s.x,s.y),i=s;}return r},pn=(t,e)=>{let i,r=0,n=0,o={x:t.x,y:t.y},a=s({},o),h=.01,c=0;const l=t.iterator,u=t.angleFinder;for(;n<e&&h>1e-4;)a=l(r),c=r,i=on(o.x,o.y,a.x,a.y),i+n>e?(r-=h,h/=2):(o=a,r+=h,n+=i);return s(s({},a),{},{angle:u(c)})},mn=t=>{let e,s,i=0,r=0,n=0,o=0,a=0;const h=[];for(const c of t){const t={x:r,y:n,command:c[0],length:0};switch(c[0]){case "M":s=t,s.x=o=r=c[1],s.y=a=n=c[2];break;case "L":s=t,s.length=on(r,n,c[1],c[2]),r=c[1],n=c[2];break;case "C":e=an(r,n,c[1],c[2],c[3],c[4],c[5],c[6]),s=t,s.iterator=e,s.angleFinder=un(r,n,c[1],c[2],c[3],c[4],c[5],c[6]),s.length=fn(e,r,n),r=c[5],n=c[6];break;case "Q":e=dn(r,n,c[1],c[2],c[3],c[4]),s=t,s.iterator=e,s.angleFinder=gn(r,n,c[1],c[2],c[3],c[4]),s.length=fn(e,r,n),r=c[3],n=c[4];break;case "Z":s=t,s.destX=o,s.destY=a,s.length=on(r,n,o,a),r=o,n=a;}i+=s.length,h.push(s);}return h.push({length:i,x:r,y:n}),h},vn=function(t,e){let i=arguments.length>2&&void 0!==arguments[2]?arguments[2]:mn(t),r=0;for(;e-i[r].length>0&&r<i.length-2;)e-=i[r].length,r++;const n=i[r],o=e/n.length,a=t[r];switch(n.command){case "M":return {x:n.x,y:n.y,angle:0};case "Z":return s(s({},new ot(n.x,n.y).lerp(new ot(n.destX,n.destY),o)),{},{angle:Math.atan2(n.destY-n.y,n.destX-n.x)});case "L":return s(s({},new ot(n.x,n.y).lerp(new ot(a[1],a[2]),o)),{},{angle:Math.atan2(a[2]-n.y,a[1]-n.x)});case "C":case "Q":return pn(n,e)}},yn=new RegExp("[mzlhvcsqta][^mzlhvcsqta]*","gi"),_n=new RegExp(Zr,"g"),xn=new RegExp(is,"gi"),Cn={m:2,l:2,h:1,v:1,c:6,s:4,q:4,t:2,a:7},bn=t=>{var e;const s=[],i=null!==(e=t.match(yn))&&void 0!==e?e:[];for(const t of i){const e=t[0];if("z"===e||"Z"===e){s.push([e]);continue}const i=Cn[e.toLowerCase()];let r=[];if("a"===e||"A"===e){_n.lastIndex=0;for(let e=null;e=_n.exec(t);)r.push(...e.slice(1));}else r=t.match(xn)||[];for(let t=0;t<r.length;t+=i){const n=new Array(i),o=$r[e];n[0]=t>0&&o?o:e;for(let e=0;e<i;e++)n[e+1]=parseFloat(r[t+e]);s.push(n);}}return s},Sn=function(t){let e=arguments.length>1&&void 0!==arguments[1]?arguments[1]:0,s=new ot(t[0]),i=new ot(t[1]),r=1,n=0;const o=[],a=t.length,h=a>2;let c;for(h&&(r=t[2].x<i.x?-1:t[2].x===i.x?0:1,n=t[2].y<i.y?-1:t[2].y===i.y?0:1),o.push(["M",s.x-r*e,s.y-n*e]),c=1;c<a;c++){if(!s.eq(i)){const t=s.midPointFrom(i);o.push(["Q",s.x,s.y,t.x,t.y]);}s=t[c],c+1<t.length&&(i=t[c+1]);}return h&&(r=s.x>t[c-2].x?1:s.x===t[c-2].x?0:-1,n=s.y>t[c-2].y?1:s.y===t[c-2].y?0:-1),o.push(["L",s.x+r*e,s.y+n*e]),o},wn=(t,e)=>t.map((t=>t.map(((t,s)=>0===s||void 0===e?t:Vt(t,e))).join(" "))).join(" ");function Tn(t,e){const s=t.style;s&&e&&("string"==typeof e?s.cssText+=";"+e:Object.entries(e).forEach((t=>{let[e,i]=t;return s.setProperty(e,i)})));}class Pn extends te{constructor(e){let{allowTouchScrolling:s=false,containerClass:i=""}=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{};super(e),t(this,"upper",void 0),t(this,"container",void 0);const{el:r}=this.lower,n=this.createUpperCanvas();this.upper={el:n,ctx:n.getContext("2d")},this.applyCanvasStyle(r,{allowTouchScrolling:s}),this.applyCanvasStyle(n,{allowTouchScrolling:s,styles:{position:"absolute",left:"0",top:"0"}});const o=this.createContainerElement();o.classList.add(i),r.parentNode&&r.parentNode.replaceChild(o,r),o.append(r,n),this.container=o;}createUpperCanvas(){const{el:t}=this.lower,e=pt();return e.className=t.className,e.classList.remove("lower-canvas"),e.classList.add("upper-canvas"),e.setAttribute("data-fabric","top"),e.style.cssText=t.style.cssText,e.setAttribute("draggable","true"),e}createContainerElement(){const t=m().createElement("div");return t.setAttribute("data-fabric","wrapper"),Tn(t,{position:"relative"}),$t(t),t}applyCanvasStyle(t,e){const{styles:i,allowTouchScrolling:r}=e;Tn(t,s(s({},i),{},{"touch-action":r?"manipulation":j})),$t(t);}setDimensions(t,e){super.setDimensions(t,e);const{el:s,ctx:i}=this.upper;Qt(s,i,t,e);}setCSSDimensions(t){super.setCSSDimensions(t),Zt(this.upper.el,t),Zt(this.container,t);}cleanupDOM(t){const e=this.container,{el:s}=this.lower,{el:i}=this.upper;super.cleanupDOM(t),e.removeChild(i),e.removeChild(s),e.parentNode&&e.parentNode.replaceChild(s,e);}dispose(){super.dispose(),p().dispose(this.upper.el),delete this.upper,delete this.container;}}class En extends ie{constructor(){super(...arguments),t(this,"targets",[]),t(this,"_hoveredTargets",[]),t(this,"_currentTransform",null),t(this,"_groupSelector",null),t(this,"contextTopDirty",false);}static getDefaults(){return s(s({},super.getDefaults()),En.ownDefaults)}get upperCanvasEl(){var t;return null===(t=this.elements.upper)||void 0===t?void 0:t.el}get contextTop(){var t;return null===(t=this.elements.upper)||void 0===t?void 0:t.ctx}get wrapperEl(){return this.elements.container}initElements(t){this.elements=new Pn(t,{allowTouchScrolling:this.allowTouchScrolling,containerClass:this.containerClass}),this._createCacheCanvas();}_onObjectAdded(t){this._objectsToRender=void 0,super._onObjectAdded(t);}_onObjectRemoved(t){this._objectsToRender=void 0,t===this._activeObject&&(this.fire("before:selection:cleared",{deselected:[t]}),this._discardActiveObject(),this.fire("selection:cleared",{deselected:[t]}),t.fire("deselected",{target:t})),t===this._hoveredTarget&&(this._hoveredTarget=void 0,this._hoveredTargets=[]),super._onObjectRemoved(t);}_onStackOrderChanged(){this._objectsToRender=void 0,super._onStackOrderChanged();}_chooseObjectsToRender(){const t=this._activeObject;return !this.preserveObjectStacking&&t?this._objects.filter((e=>!e.group&&e!==t)).concat(t):this._objects}renderAll(){this.cancelRequestedRender(),this.destroyed||(!this.contextTopDirty||this._groupSelector||this.isDrawingMode||(this.clearContext(this.contextTop),this.contextTopDirty=false),this.hasLostContext&&(this.renderTopLayer(this.contextTop),this.hasLostContext=false),!this._objectsToRender&&(this._objectsToRender=this._chooseObjectsToRender()),this.renderCanvas(this.getContext(),this._objectsToRender));}renderTopLayer(t){t.save(),this.isDrawingMode&&this._isCurrentlyDrawing&&(this.freeDrawingBrush&&this.freeDrawingBrush._render(),this.contextTopDirty=true),this.selection&&this._groupSelector&&(this._drawSelection(t),this.contextTopDirty=true),t.restore();}renderTop(){const t=this.contextTop;this.clearContext(t),this.renderTopLayer(t),this.fire("after:render",{ctx:t});}setTargetFindTolerance(t){t=Math.round(t),this.targetFindTolerance=t;const e=this.getRetinaScaling(),s=Math.ceil((2*t+1)*e);this.pixelFindCanvasEl.width=this.pixelFindCanvasEl.height=s,this.pixelFindContext.scale(e,e);}isTargetTransparent(t,e,s){const i=this.targetFindTolerance,r=this.pixelFindContext;this.clearContext(r),r.save(),r.translate(-e+i,-s+i),r.transform(...this.viewportTransform);const n=t.selectionBackgroundColor;t.selectionBackgroundColor="",t.render(r),t.selectionBackgroundColor=n,r.restore();const o=Math.round(i*this.getRetinaScaling());return Ri(r,o,o,o)}_isSelectionKeyPressed(t){const e=this.selectionKey;return !!e&&(Array.isArray(e)?!!e.find((e=>!!e&&true===t[e])):t[e])}_shouldClearSelection(t,e){const s=this.getActiveObjects(),i=this._activeObject;return !!(!e||e&&i&&s.length>1&&-1===s.indexOf(e)&&i!==e&&!this._isSelectionKeyPressed(t)||e&&!e.evented||e&&!e.selectable&&i&&i!==e)}_shouldCenterTransform(t,e,s){if(!t)return;let i;return e===G||e===H||e===N||e===Y?i=this.centeredScaling||t.centeredScaling:e===B&&(i=this.centeredRotation||t.centeredRotation),i?!s:s}_getOriginFromCorner(t,e){const s={x:t.originX,y:t.originY};return e?(["ml","tl","bl"].includes(e)?s.x=A:["mr","tr","br"].includes(e)&&(s.x=M),["tl","mt","tr"].includes(e)?s.y=E:["bl","mb","br"].includes(e)&&(s.y=P),s):s}_setupCurrentTransform(t,e,i){var r;const n=e.group?me(this.getScenePoint(t),void 0,e.group.calcTransformMatrix()):this.getScenePoint(t),{key:o="",control:a}=e.getActiveControl()||{},h=i&&a?null===(r=a.getActionHandler(t,e,a))||void 0===r?void 0:r.bind(a):Me,c=((t,e,s,i)=>{if(!e||!t)return "drag";const r=i.controls[e];return r.getActionName(s,r,i)})(i,o,t,e),l=t[this.centeredKey],u=this._shouldCenterTransform(e,c,l)?{x:D,y:D}:this._getOriginFromCorner(e,o),d={target:e,action:c,actionHandler:h,actionPerformed:false,corner:o,scaleX:e.scaleX,scaleY:e.scaleY,skewX:e.skewX,skewY:e.skewY,offsetX:n.x-e.left,offsetY:n.y-e.top,originX:u.x,originY:u.y,ex:n.x,ey:n.y,lastX:n.x,lastY:n.y,theta:xt(e.angle),width:e.width,height:e.height,shiftKey:t.shiftKey,altKey:l,original:s(s({},ge(e)),{},{originX:u.x,originY:u.y})};this._currentTransform=d,this.fire("before:transform",{e:t,transform:d});}setCursor(t){this.upperCanvasEl.style.cursor=t;}_drawSelection(t){const{x:e,y:s,deltaX:i,deltaY:r}=this._groupSelector,n=new ot(e,s).transform(this.viewportTransform),o=new ot(e+i,s+r).transform(this.viewportTransform),a=this.selectionLineWidth/2;let h=Math.min(n.x,o.x),c=Math.min(n.y,o.y),l=Math.max(n.x,o.x),u=Math.max(n.y,o.y);this.selectionColor&&(t.fillStyle=this.selectionColor,t.fillRect(h,c,l-h,u-c)),this.selectionLineWidth&&this.selectionBorderColor&&(t.lineWidth=this.selectionLineWidth,t.strokeStyle=this.selectionBorderColor,h+=a,c+=a,l-=a,u-=a,Li.prototype._setLineDash.call(this,t,this.selectionDashArray),t.strokeRect(h,c,l-h,u-c));}findTarget(t){if(this.skipTargetFind)return;const e=this.getViewportPoint(t),s=this._activeObject,i=this.getActiveObjects();if(this.targets=[],s&&i.length>=1){if(s.findControl(e,oe(t)))return s;if(i.length>1&&this.searchPossibleTargets([s],e))return s;if(s===this.searchPossibleTargets([s],e)){if(this.preserveObjectStacking){const i=this.targets;this.targets=[];const r=this.searchPossibleTargets(this._objects,e);return t[this.altSelectionKey]&&r&&r!==s?(this.targets=i,s):r}return s}}return this.searchPossibleTargets(this._objects,e)}_pointIsInObjectSelectionArea(t,e){let s=t.getCoords();const i=this.getZoom(),r=t.padding/i;if(r){const[t,e,i,n]=s,o=Math.atan2(e.y-t.y,e.x-t.x),a=rt(o)*r,h=nt(o)*r,c=a+h,l=a-h;s=[new ot(t.x-l,t.y-c),new ot(e.x+c,e.y-l),new ot(i.x+l,i.y+c),new ot(n.x-c,n.y+l)];}return Qs.isPointInPolygon(e,s)}_checkTarget(t,e){if(t&&t.visible&&t.evented&&this._pointIsInObjectSelectionArea(t,me(e,void 0,this.viewportTransform))){if(!this.perPixelTargetFind&&!t.perPixelTargetFind||t.isEditing)return  true;if(!this.isTargetTransparent(t,e.x,e.y))return  true}return  false}_searchPossibleTargets(t,e){let s=t.length;for(;s--;){const i=t[s];if(this._checkTarget(i,e)){if(ht(i)&&i.subTargetCheck){const t=this._searchPossibleTargets(i._objects,e);t&&this.targets.push(t);}return i}}}searchPossibleTargets(t,e){const s=this._searchPossibleTargets(t,e);if(s&&ht(s)&&s.interactive&&this.targets[0]){const t=this.targets;for(let e=t.length-1;e>0;e--){const s=t[e];if(!ht(s)||!s.interactive)return s}return t[0]}return s}getViewportPoint(t){return this._pointer?this._pointer:this.getPointer(t,true)}getScenePoint(t){return this._absolutePointer?this._absolutePointer:this.getPointer(t)}getPointer(t){let e=arguments.length>1&&void 0!==arguments[1]&&arguments[1];const s=this.upperCanvasEl,i=s.getBoundingClientRect();let r=ne(t),n=i.width||0,o=i.height||0;n&&o||(P in i&&E in i&&(o=Math.abs(i.top-i.bottom)),A in i&&M in i&&(n=Math.abs(i.right-i.left))),this.calcOffset(),r.x=r.x-this._offset.left,r.y=r.y-this._offset.top,e||(r=me(r,void 0,this.viewportTransform));const a=this.getRetinaScaling();1!==a&&(r.x/=a,r.y/=a);const h=0===n||0===o?new ot(1,1):new ot(s.width/n,s.height/o);return r.multiply(h)}_setDimensionsImpl(t,e){this._resetTransformEventData(),super._setDimensionsImpl(t,e),this._isCurrentlyDrawing&&this.freeDrawingBrush&&this.freeDrawingBrush._setBrushStyles(this.contextTop);}_createCacheCanvas(){this.pixelFindCanvasEl=pt(),this.pixelFindContext=this.pixelFindCanvasEl.getContext("2d",{willReadFrequently:true}),this.setTargetFindTolerance(this.targetFindTolerance);}getTopContext(){return this.elements.upper.ctx}getSelectionContext(){return this.elements.upper.ctx}getSelectionElement(){return this.elements.upper.el}getActiveObject(){return this._activeObject}getActiveObjects(){const t=this._activeObject;return Ut(t)?t.getObjects():t?[t]:[]}_fireSelectionEvents(t,e){let s=false,i=false;const r=this.getActiveObjects(),n=[],o=[];t.forEach((t=>{r.includes(t)||(s=true,t.fire("deselected",{e:e,target:t}),o.push(t));})),r.forEach((i=>{t.includes(i)||(s=true,i.fire("selected",{e:e,target:i}),n.push(i));})),t.length>0&&r.length>0?(i=true,s&&this.fire("selection:updated",{e:e,selected:n,deselected:o})):r.length>0?(i=true,this.fire("selection:created",{e:e,selected:n})):t.length>0&&(i=true,this.fire("selection:cleared",{e:e,deselected:o})),i&&(this._objectsToRender=void 0);}setActiveObject(t,e){const s=this.getActiveObjects(),i=this._setActiveObject(t,e);return this._fireSelectionEvents(s,e),i}_setActiveObject(t,e){const s=this._activeObject;return s!==t&&(!(!this._discardActiveObject(e,t)&&this._activeObject)&&(!t.onSelect({e:e})&&(this._activeObject=t,Ut(t)&&s!==t&&t.set("canvas",this),t.setCoords(),true)))}_discardActiveObject(t,e){const s=this._activeObject;return !!s&&(!s.onDeselect({e:t,object:e})&&(this._currentTransform&&this._currentTransform.target===s&&this.endCurrentTransform(t),Ut(s)&&s===this._hoveredTarget&&(this._hoveredTarget=void 0),this._activeObject=void 0,true))}discardActiveObject(t){const e=this.getActiveObjects(),s=this.getActiveObject();e.length&&this.fire("before:selection:cleared",{e:t,deselected:[s]});const i=this._discardActiveObject(t);return this._fireSelectionEvents(e,t),i}endCurrentTransform(t){const e=this._currentTransform;this._finalizeCurrentTransform(t),e&&e.target&&(e.target.isMoving=false),this._currentTransform=null;}_finalizeCurrentTransform(t){const e=this._currentTransform,s=e.target,i={e:t,target:s,transform:e,action:e.action};s._scaling&&(s._scaling=false),s.setCoords(),e.actionPerformed&&(this.fire("object:modified",i),s.fire(Q,i));}setViewportTransform(t){super.setViewportTransform(t);const e=this._activeObject;e&&e.setCoords();}destroy(){const t=this._activeObject;Ut(t)&&(t.removeAll(),t.dispose()),delete this._activeObject,super.destroy(),this.pixelFindContext=null,this.pixelFindCanvasEl=void 0;}clear(){this.discardActiveObject(),this._activeObject=void 0,this.clearContext(this.contextTop),super.clear();}drawControls(t){const e=this._activeObject;e&&e._renderControls(t);}_toObject(t,e,s){const i=this._realizeGroupTransformOnObject(t),r=super._toObject(t,e,s);return t.set(i),r}_realizeGroupTransformOnObject(t){const{group:e}=t;if(e&&Ut(e)&&this._activeObject===e){const s=Yt(t,["angle","flipX","flipY",M,H,N,U,q,P]);return le(t,e.calcOwnMatrix()),s}return {}}_setSVGObject(t,e,s){const i=this._realizeGroupTransformOnObject(e);super._setSVGObject(t,e,s),e.set(i);}}t(En,"ownDefaults",{uniformScaling:true,uniScaleKey:"shiftKey",centeredScaling:false,centeredRotation:false,centeredKey:"altKey",altActionKey:"shiftKey",selection:true,selectionKey:"shiftKey",selectionColor:"rgba(100, 100, 255, 0.3)",selectionDashArray:[],selectionBorderColor:"rgba(255, 255, 255, 0.3)",selectionLineWidth:1,selectionFullyContained:false,hoverCursor:"move",moveCursor:"move",defaultCursor:"default",freeDrawingCursor:"crosshair",notAllowedCursor:"not-allowed",perPixelTargetFind:false,targetFindTolerance:0,skipTargetFind:false,stopContextMenu:false,fireRightClick:false,fireMiddleClick:false,enablePointerEvents:false,containerClass:"canvas-container",preserveObjectStacking:false});class An{constructor(e){t(this,"targets",[]),t(this,"__disposer",void 0);const s=()=>{const{hiddenTextarea:t}=e.getActiveObject()||{};t&&t.focus();},i=e.upperCanvasEl;i.addEventListener("click",s),this.__disposer=()=>i.removeEventListener("click",s);}exitTextEditing(){this.target=void 0,this.targets.forEach((t=>{t.isEditing&&t.exitEditing();}));}add(t){this.targets.push(t);}remove(t){this.unregister(t),it(this.targets,t);}register(t){this.target=t;}unregister(t){t===this.target&&(this.target=void 0);}onMouseMove(t){var e;(null===(e=this.target)||void 0===e?void 0:e.isEditing)&&this.target.updateSelectionOnMouseMove(t);}clear(){this.targets=[],this.target=void 0;}dispose(){this.clear(),this.__disposer(),delete this.__disposer;}}const jn=["target","oldTarget","fireCanvas","e"],Fn={passive:false},Ln=(t,e)=>{const s=t.getViewportPoint(e),i=t.getScenePoint(e);return {viewportPoint:s,scenePoint:i,pointer:s,absolutePointer:i}},Rn=function(t){for(var e=arguments.length,s=new Array(e>1?e-1:0),i=1;i<e;i++)s[i-1]=arguments[i];return t.addEventListener(...s)},In=function(t){for(var e=arguments.length,s=new Array(e>1?e-1:0),i=1;i<e;i++)s[i-1]=arguments[i];return t.removeEventListener(...s)},Bn={mouse:{in:"over",out:"out",targetIn:"mouseover",targetOut:"mouseout",canvasIn:"mouse:over",canvasOut:"mouse:out"},drag:{in:"enter",out:"leave",targetIn:"dragenter",targetOut:"dragleave",canvasIn:"drag:enter",canvasOut:"drag:leave"}};class Xn extends En{constructor(e){super(e,arguments.length>1&&void 0!==arguments[1]?arguments[1]:{}),t(this,"_isClick",void 0),t(this,"textEditingManager",new An(this)),["_onMouseDown","_onTouchStart","_onMouseMove","_onMouseUp","_onTouchEnd","_onResize","_onMouseWheel","_onMouseOut","_onMouseEnter","_onContextMenu","_onClick","_onDragStart","_onDragEnd","_onDragProgress","_onDragOver","_onDragEnter","_onDragLeave","_onDrop"].forEach((t=>{this[t]=this[t].bind(this);})),this.addOrRemove(Rn,"add");}_getEventPrefix(){return this.enablePointerEvents?"pointer":"mouse"}addOrRemove(t,e){const s=this.upperCanvasEl,i=this._getEventPrefix();t(Jt(s),"resize",this._onResize),t(s,i+"down",this._onMouseDown),t(s,"".concat(i,"move"),this._onMouseMove,Fn),t(s,"".concat(i,"out"),this._onMouseOut),t(s,"".concat(i,"enter"),this._onMouseEnter),t(s,"wheel",this._onMouseWheel,{passive:false}),t(s,"contextmenu",this._onContextMenu),t(s,"click",this._onClick),t(s,"dblclick",this._onClick),t(s,"dragstart",this._onDragStart),t(s,"dragend",this._onDragEnd),t(s,"dragover",this._onDragOver),t(s,"dragenter",this._onDragEnter),t(s,"dragleave",this._onDragLeave),t(s,"drop",this._onDrop),this.enablePointerEvents||t(s,"touchstart",this._onTouchStart,Fn);}removeListeners(){this.addOrRemove(In,"remove");const t=this._getEventPrefix(),e=Kt(this.upperCanvasEl);In(e,"".concat(t,"up"),this._onMouseUp),In(e,"touchend",this._onTouchEnd,Fn),In(e,"".concat(t,"move"),this._onMouseMove,Fn),In(e,"touchmove",this._onMouseMove,Fn),clearTimeout(this._willAddMouseDown);}_onMouseWheel(t){this.__onMouseWheel(t);}_onMouseOut(t){const e=this._hoveredTarget,i=s({e:t},Ln(this,t));this.fire("mouse:out",s(s({},i),{},{target:e})),this._hoveredTarget=void 0,e&&e.fire("mouseout",s({},i)),this._hoveredTargets.forEach((t=>{this.fire("mouse:out",s(s({},i),{},{target:t})),t&&t.fire("mouseout",s({},i));})),this._hoveredTargets=[];}_onMouseEnter(t){this._currentTransform||this.findTarget(t)||(this.fire("mouse:over",s({e:t},Ln(this,t))),this._hoveredTarget=void 0,this._hoveredTargets=[]);}_onDragStart(t){this._isClick=false;const e=this.getActiveObject();if(e&&e.onDragStart(t)){this._dragSource=e;const s={e:t,target:e};return this.fire("dragstart",s),e.fire("dragstart",s),void Rn(this.upperCanvasEl,"drag",this._onDragProgress)}ae(t);}_renderDragEffects(t,e,s){let i=false;const r=this._dropTarget;r&&r!==e&&r!==s&&(r.clearContextTop(),i=true),null==e||e.clearContextTop(),s!==e&&(null==s||s.clearContextTop());const n=this.contextTop;n.save(),n.transform(...this.viewportTransform),e&&(n.save(),e.transform(n),e.renderDragSourceEffect(t),n.restore(),i=true),s&&(n.save(),s.transform(n),s.renderDropTargetEffect(t),n.restore(),i=true),n.restore(),i&&(this.contextTopDirty=true);}_onDragEnd(t){const e=!!t.dataTransfer&&t.dataTransfer.dropEffect!==j,s=e?this._activeObject:void 0,i={e:t,target:this._dragSource,subTargets:this.targets,dragSource:this._dragSource,didDrop:e,dropTarget:s};In(this.upperCanvasEl,"drag",this._onDragProgress),this.fire("dragend",i),this._dragSource&&this._dragSource.fire("dragend",i),delete this._dragSource,this._onMouseUp(t);}_onDragProgress(t){const e={e:t,target:this._dragSource,dragSource:this._dragSource,dropTarget:this._draggedoverTarget};this.fire("drag",e),this._dragSource&&this._dragSource.fire("drag",e);}findDragTargets(t){this.targets=[];return {target:this._searchPossibleTargets(this._objects,this.getViewportPoint(t)),targets:[...this.targets]}}_onDragOver(t){const e="dragover",{target:s,targets:i}=this.findDragTargets(t),r=this._dragSource,n={e:t,target:s,subTargets:i,dragSource:r,canDrop:false,dropTarget:void 0};let o;this.fire(e,n),this._fireEnterLeaveEvents(s,n),s&&(s.canDrop(t)&&(o=s),s.fire(e,n));for(let s=0;s<i.length;s++){const r=i[s];r.canDrop(t)&&(o=r),r.fire(e,n);}this._renderDragEffects(t,r,o),this._dropTarget=o;}_onDragEnter(t){const{target:e,targets:s}=this.findDragTargets(t),i={e:t,target:e,subTargets:s,dragSource:this._dragSource};this.fire("dragenter",i),this._fireEnterLeaveEvents(e,i);}_onDragLeave(t){const e={e:t,target:this._draggedoverTarget,subTargets:this.targets,dragSource:this._dragSource};this.fire("dragleave",e),this._fireEnterLeaveEvents(void 0,e),this._renderDragEffects(t,this._dragSource),this._dropTarget=void 0,this.targets=[],this._hoveredTargets=[];}_onDrop(t){const{target:e,targets:i}=this.findDragTargets(t),r=this._basicEventHandler("drop:before",s({e:t,target:e,subTargets:i,dragSource:this._dragSource},Ln(this,t)));r.didDrop=false,r.dropTarget=void 0,this._basicEventHandler("drop",r),this.fire("drop:after",r);}_onContextMenu(t){const e=this.findTarget(t),s=this.targets||[],i=this._basicEventHandler("contextmenu:before",{e:t,target:e,subTargets:s});return this.stopContextMenu&&ae(t),this._basicEventHandler("contextmenu",i),false}_onClick(t){const e=t.detail;e>3||e<2||(this._cacheTransformEventData(t),2==e&&"dblclick"===t.type&&this._handleEvent(t,"dblclick"),3==e&&this._handleEvent(t,"tripleclick"),this._resetTransformEventData());}getPointerId(t){const e=t.changedTouches;return e?e[0]&&e[0].identifier:this.enablePointerEvents?t.pointerId:-1}_isMainEvent(t){return  true===t.isPrimary||false!==t.isPrimary&&("touchend"===t.type&&0===t.touches.length||(!t.changedTouches||t.changedTouches[0].identifier===this.mainTouchId))}_onTouchStart(t){let e=!this.allowTouchScrolling;const s=this._activeObject;void 0===this.mainTouchId&&(this.mainTouchId=this.getPointerId(t)),this.__onMouseDown(t),(this.isDrawingMode||s&&this._target===s)&&(e=true),e&&t.preventDefault(),this._resetTransformEventData();const i=this.upperCanvasEl,r=this._getEventPrefix(),n=Kt(i);Rn(n,"touchend",this._onTouchEnd,Fn),e&&Rn(n,"touchmove",this._onMouseMove,Fn),In(i,"".concat(r,"down"),this._onMouseDown);}_onMouseDown(t){this.__onMouseDown(t),this._resetTransformEventData();const e=this.upperCanvasEl,s=this._getEventPrefix();In(e,"".concat(s,"move"),this._onMouseMove,Fn);const i=Kt(e);Rn(i,"".concat(s,"up"),this._onMouseUp),Rn(i,"".concat(s,"move"),this._onMouseMove,Fn);}_onTouchEnd(t){if(t.touches.length>0)return;this.__onMouseUp(t),this._resetTransformEventData(),delete this.mainTouchId;const e=this._getEventPrefix(),s=Kt(this.upperCanvasEl);In(s,"touchend",this._onTouchEnd,Fn),In(s,"touchmove",this._onMouseMove,Fn),this._willAddMouseDown&&clearTimeout(this._willAddMouseDown),this._willAddMouseDown=setTimeout((()=>{Rn(this.upperCanvasEl,"".concat(e,"down"),this._onMouseDown),this._willAddMouseDown=0;}),400);}_onMouseUp(t){this.__onMouseUp(t),this._resetTransformEventData();const e=this.upperCanvasEl,s=this._getEventPrefix();if(this._isMainEvent(t)){const t=Kt(this.upperCanvasEl);In(t,"".concat(s,"up"),this._onMouseUp),In(t,"".concat(s,"move"),this._onMouseMove,Fn),Rn(e,"".concat(s,"move"),this._onMouseMove,Fn);}}_onMouseMove(t){const e=this.getActiveObject();!this.allowTouchScrolling&&(!e||!e.shouldStartDragging(t))&&t.preventDefault&&t.preventDefault(),this.__onMouseMove(t);}_onResize(){this.calcOffset(),this._resetTransformEventData();}_shouldRender(t){const e=this.getActiveObject();return !!e!=!!t||e&&t&&e!==t}__onMouseUp(t){var e;this._cacheTransformEventData(t),this._handleEvent(t,"up:before");const s=this._currentTransform,i=this._isClick,r=this._target,{button:n}=t;if(n)return (this.fireMiddleClick&&1===n||this.fireRightClick&&2===n)&&this._handleEvent(t,"up"),void this._resetTransformEventData();if(this.isDrawingMode&&this._isCurrentlyDrawing)return void this._onMouseUpInDrawingMode(t);if(!this._isMainEvent(t))return;let o,a,h=false;if(s&&(this._finalizeCurrentTransform(t),h=s.actionPerformed),!i){const e=r===this._activeObject;this.handleSelection(t),h||(h=this._shouldRender(r)||!e&&r===this._activeObject);}if(r){const e=r.findControl(this.getViewportPoint(t),oe(t)),{key:i,control:n}=e||{};if(a=i,r.selectable&&r!==this._activeObject&&"up"===r.activeOn)this.setActiveObject(r,t),h=true;else if(n){const e=n.getMouseUpHandler(t,r,n);e&&(o=this.getScenePoint(t),e.call(n,t,s,o.x,o.y));}r.isMoving=false;}if(s&&(s.target!==r||s.corner!==a)){const e=s.target&&s.target.controls[s.corner],i=e&&e.getMouseUpHandler(t,s.target,e);o=o||this.getScenePoint(t),i&&i.call(e,t,s,o.x,o.y);}this._setCursorFromEvent(t,r),this._handleEvent(t,"up"),this._groupSelector=null,this._currentTransform=null,r&&(r.__corner=void 0),h?this.requestRenderAll():i||null!==(e=this._activeObject)&&void 0!==e&&e.isEditing||this.renderTop();}_basicEventHandler(t,e){const{target:s,subTargets:i=[]}=e;this.fire(t,e),s&&s.fire(t,e);for(let r=0;r<i.length;r++)i[r]!==s&&i[r].fire(t,e);return e}_handleEvent(t,e,i){const r=this._target,n=this.targets||[],o=s(s(s({e:t,target:r,subTargets:n},Ln(this,t)),{},{transform:this._currentTransform},"up:before"===e||"up"===e?{isClick:this._isClick,currentTarget:this.findTarget(t),currentSubTargets:this.targets}:{}),"down:before"===e||"down"===e?i:{});this.fire("mouse:".concat(e),o),r&&r.fire("mouse".concat(e),o);for(let t=0;t<n.length;t++)n[t]!==r&&n[t].fire("mouse".concat(e),o);}_onMouseDownInDrawingMode(t){this._isCurrentlyDrawing=true,this.getActiveObject()&&(this.discardActiveObject(t),this.requestRenderAll());const e=this.getScenePoint(t);this.freeDrawingBrush&&this.freeDrawingBrush.onMouseDown(e,{e:t,pointer:e}),this._handleEvent(t,"down",{alreadySelected:false});}_onMouseMoveInDrawingMode(t){if(this._isCurrentlyDrawing){const e=this.getScenePoint(t);this.freeDrawingBrush&&this.freeDrawingBrush.onMouseMove(e,{e:t,pointer:e});}this.setCursor(this.freeDrawingCursor),this._handleEvent(t,"move");}_onMouseUpInDrawingMode(t){const e=this.getScenePoint(t);this.freeDrawingBrush?this._isCurrentlyDrawing=!!this.freeDrawingBrush.onMouseUp({e:t,pointer:e}):this._isCurrentlyDrawing=false,this._handleEvent(t,"up");}__onMouseDown(t){this._isClick=true,this._cacheTransformEventData(t),this._handleEvent(t,"down:before");let e=this._target,s=!!e&&e===this._activeObject;const{button:i}=t;if(i)return (this.fireMiddleClick&&1===i||this.fireRightClick&&2===i)&&this._handleEvent(t,"down",{alreadySelected:s}),void this._resetTransformEventData();if(this.isDrawingMode)return void this._onMouseDownInDrawingMode(t);if(!this._isMainEvent(t))return;if(this._currentTransform)return;let r=this._shouldRender(e),n=false;if(this.handleMultiSelection(t,e)?(e=this._activeObject,n=true,r=true):this._shouldClearSelection(t,e)&&this.discardActiveObject(t),this.selection&&(!e||!e.selectable&&!e.isEditing&&e!==this._activeObject)){const e=this.getScenePoint(t);this._groupSelector={x:e.x,y:e.y,deltaY:0,deltaX:0};}if(s=!!e&&e===this._activeObject,e){e.selectable&&"down"===e.activeOn&&this.setActiveObject(e,t);const i=e.findControl(this.getViewportPoint(t),oe(t));if(e===this._activeObject&&(i||!n)){this._setupCurrentTransform(t,e,s);const r=i?i.control:void 0,n=this.getScenePoint(t),o=r&&r.getMouseDownHandler(t,e,r);o&&o.call(r,t,this._currentTransform,n.x,n.y);}}r&&(this._objectsToRender=void 0),this._handleEvent(t,"down",{alreadySelected:s}),r&&this.requestRenderAll();}_resetTransformEventData(){this._target=this._pointer=this._absolutePointer=void 0;}_cacheTransformEventData(t){this._resetTransformEventData(),this._pointer=this.getViewportPoint(t),this._absolutePointer=me(this._pointer,void 0,this.viewportTransform),this._target=this._currentTransform?this._currentTransform.target:this.findTarget(t);}__onMouseMove(t){if(this._isClick=false,this._cacheTransformEventData(t),this._handleEvent(t,"move:before"),this.isDrawingMode)return void this._onMouseMoveInDrawingMode(t);if(!this._isMainEvent(t))return;const e=this._groupSelector;if(e){const s=this.getScenePoint(t);e.deltaX=s.x-e.x,e.deltaY=s.y-e.y,this.renderTop();}else if(this._currentTransform)this._transformObject(t);else {const e=this.findTarget(t);this._setCursorFromEvent(t,e),this._fireOverOutEvents(t,e);}this.textEditingManager.onMouseMove(t),this._handleEvent(t,"move"),this._resetTransformEventData();}_fireOverOutEvents(t,e){const s=this._hoveredTarget,i=this._hoveredTargets,r=this.targets,n=Math.max(i.length,r.length);this.fireSyntheticInOutEvents("mouse",{e:t,target:e,oldTarget:s,fireCanvas:true});for(let o=0;o<n;o++)r[o]===e||i[o]&&i[o]===s||this.fireSyntheticInOutEvents("mouse",{e:t,target:r[o],oldTarget:i[o]});this._hoveredTarget=e,this._hoveredTargets=this.targets.concat();}_fireEnterLeaveEvents(t,e){const i=this._draggedoverTarget,r=this._hoveredTargets,n=this.targets,o=Math.max(r.length,n.length);this.fireSyntheticInOutEvents("drag",s(s({},e),{},{target:t,oldTarget:i,fireCanvas:true}));for(let t=0;t<o;t++)this.fireSyntheticInOutEvents("drag",s(s({},e),{},{target:n[t],oldTarget:r[t]}));this._draggedoverTarget=t;}fireSyntheticInOutEvents(t,e){let{target:r,oldTarget:n,fireCanvas:o,e:a}=e,h=i(e,jn);const{targetIn:c,targetOut:l,canvasIn:u,canvasOut:d}=Bn[t],g=n!==r;if(n&&g){const t=s(s({},h),{},{e:a,target:n,nextTarget:r},Ln(this,a));o&&this.fire(d,t),n.fire(l,t);}if(r&&g){const t=s(s({},h),{},{e:a,target:r,previousTarget:n},Ln(this,a));o&&this.fire(u,t),r.fire(c,t);}}__onMouseWheel(t){this._cacheTransformEventData(t),this._handleEvent(t,"wheel"),this._resetTransformEventData();}_transformObject(t){const e=this.getScenePoint(t),s=this._currentTransform,i=s.target,r=i.group?me(e,void 0,i.group.calcTransformMatrix()):e;s.shiftKey=t.shiftKey,s.altKey=!!this.centeredKey&&t[this.centeredKey],this._performTransformAction(t,s,r),s.actionPerformed&&this.requestRenderAll();}_performTransformAction(t,e,s){const{action:i,actionHandler:r,target:n}=e,o=!!r&&r(t,e,s.x,s.y);o&&n.setCoords(),"drag"===i&&o&&(e.target.isMoving=true,this.setCursor(e.target.moveCursor||this.moveCursor)),e.actionPerformed=e.actionPerformed||o;}_setCursorFromEvent(t,e){if(!e)return void this.setCursor(this.defaultCursor);let s=e.hoverCursor||this.hoverCursor;const i=Ut(this._activeObject)?this._activeObject:null,r=(!i||e.group!==i)&&e.findControl(this.getViewportPoint(t));if(r){const s=r.control;this.setCursor(s.cursorStyleHandler(t,s,e));}else e.subTargetCheck&&this.targets.concat().reverse().map((t=>{s=t.hoverCursor||s;})),this.setCursor(s);}handleMultiSelection(t,e){const s=this._activeObject,i=Ut(s);if(s&&this._isSelectionKeyPressed(t)&&this.selection&&e&&e.selectable&&(s!==e||i)&&(i||!e.isDescendantOf(s)&&!s.isDescendantOf(e))&&!e.onSelect({e:t})&&!s.getActiveControl()){if(i){const i=s.getObjects();if(e===s){const s=this.getViewportPoint(t);if(!(e=this.searchPossibleTargets(i,s)||this.searchPossibleTargets(this._objects,s))||!e.selectable)return  false}e.group===s?(s.remove(e),this._hoveredTarget=e,this._hoveredTargets=[...this.targets],1===s.size()&&this._setActiveObject(s.item(0),t)):(s.multiSelectAdd(e),this._hoveredTarget=s,this._hoveredTargets=[...this.targets]),this._fireSelectionEvents(i,t);}else {s.isEditing&&s.exitEditing();const i=new(tt.getClass("ActiveSelection"))([],{canvas:this});i.multiSelectAdd(s,e),this._hoveredTarget=i,this._setActiveObject(i,t),this._fireSelectionEvents([s],t);}return  true}return  false}handleSelection(t){if(!this.selection||!this._groupSelector)return  false;const{x:e,y:s,deltaX:i,deltaY:r}=this._groupSelector,n=new ot(e,s),o=n.add(new ot(i,r)),a=n.min(o),h=n.max(o).subtract(a),c=this.collectObjects({left:a.x,top:a.y,width:h.x,height:h.y},{includeIntersecting:!this.selectionFullyContained}),l=n.eq(o)?c[0]?[c[0]]:[]:c.length>1?c.filter((e=>!e.onSelect({e:t}))).reverse():c;if(1===l.length)this.setActiveObject(l[0],t);else if(l.length>1){const e=tt.getClass("ActiveSelection");this.setActiveObject(new e(l,{canvas:this}),t);}return this._groupSelector=null,true}clear(){this.textEditingManager.clear(),super.clear();}destroy(){this.removeListeners(),this.textEditingManager.dispose(),super.destroy();}}const Yn={x1:0,y1:0,x2:0,y2:0},Wn=s(s({},Yn),{},{r1:0,r2:0}),Vn=(t,e)=>isNaN(t)&&"number"==typeof e?e:t;function zn(t){return t&&/%$/.test(t)&&Number.isFinite(parseFloat(t))}function Gn(t,e){const s="number"==typeof t?t:"string"==typeof t?parseFloat(t)/(zn(t)?100:1):NaN;return Ms(0,Vn(s,e),1)}const Hn=/\s*;\s*/,Nn=/\s*:\s*/;function Un(t,e){let s,i;const r=t.getAttribute("style");if(r){const t=r.split(Hn);""===t[t.length-1]&&t.pop();for(let e=t.length;e--;){const[r,n]=t[e].split(Nn).map((t=>t.trim()));"stop-color"===r?s=n:"stop-opacity"===r&&(i=n);}}const n=new Ie(s||t.getAttribute("stop-color")||"rgb(0,0,0)");return {offset:Gn(t.getAttribute("offset"),0),color:n.toRgb(),opacity:Vn(parseFloat(i||t.getAttribute("stop-opacity")||""),1)*n.getAlpha()*e}}function qn(t,e){const s=[],i=t.getElementsByTagName("stop"),r=Gn(e,1);for(let t=i.length;t--;)s.push(Un(i[t],r));return s}function Kn(t){return "linearGradient"===t.nodeName||"LINEARGRADIENT"===t.nodeName?"linear":"radial"}function Jn(t){return "userSpaceOnUse"===t.getAttribute("gradientUnits")?"pixels":"percentage"}function Qn(t,e){return t.getAttribute(e)}function Zn(t,e){return function(t,e){let s,{width:i,height:r,gradientUnits:n}=e;return Object.entries(t).reduce(((t,e)=>{let[o,a]=e;if("Infinity"===a)s=1;else if("-Infinity"===a)s=0;else {const t="string"==typeof a;s=t?parseFloat(a):a,t&&zn(a)&&(s*=.01,"pixels"===n&&("x1"!==o&&"x2"!==o&&"r2"!==o||(s*=i),"y1"!==o&&"y2"!==o||(s*=r)));}return t[o]=s,t}),{})}("linear"===Kn(t)?function(t){return {x1:Qn(t,"x1")||0,y1:Qn(t,"y1")||0,x2:Qn(t,"x2")||"100%",y2:Qn(t,"y2")||0}}(t):function(t){return {x1:Qn(t,"fx")||Qn(t,"cx")||"50%",y1:Qn(t,"fy")||Qn(t,"cy")||"50%",r1:0,x2:Qn(t,"cx")||"50%",y2:Qn(t,"cy")||"50%",r2:Qn(t,"r")||"50%"}}(t),s(s({},e),{},{gradientUnits:Jn(t)}))}class $n{constructor(t){const{type:e="linear",gradientUnits:i="pixels",coords:r={},colorStops:n=[],offsetX:o=0,offsetY:a=0,gradientTransform:h,id:c}=t||{};Object.assign(this,{type:e,gradientUnits:i,coords:s(s({},"radial"===e?Wn:Yn),r),colorStops:n,offsetX:o,offsetY:a,gradientTransform:h,id:c?"".concat(c,"_").concat(ft()):ft()});}addColorStop(t){for(const e in t){const s=new Ie(t[e]);this.colorStops.push({offset:parseFloat(e),color:s.toRgb(),opacity:s.getAlpha()});}return this}toObject(t){return s(s({},Yt(this,t)),{},{type:this.type,coords:s({},this.coords),colorStops:this.colorStops.map((t=>s({},t))),offsetX:this.offsetX,offsetY:this.offsetY,gradientUnits:this.gradientUnits,gradientTransform:this.gradientTransform?[...this.gradientTransform]:void 0})}toSVG(t){let{additionalTransform:e}=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{};const i=[],r=this.gradientTransform?this.gradientTransform.concat():T.concat(),n="pixels"===this.gradientUnits?"userSpaceOnUse":"objectBoundingBox",o=this.colorStops.map((t=>s({},t))).sort(((t,e)=>t.offset-e.offset));let a=-this.offsetX,h=-this.offsetY;var c;"objectBoundingBox"===n?(a/=t.width,h/=t.height):(a+=t.width/2,h+=t.height/2),(c=t)&&"function"==typeof c._renderPathCommands&&"percentage"!==this.gradientUnits&&(a-=t.pathOffset.x,h-=t.pathOffset.y),r[4]-=a,r[5]-=h;const l=['id="SVGID_'.concat(this.id,'"'),'gradientUnits="'.concat(n,'"'),'gradientTransform="'.concat(e?e+" ":"").concat(zt(r),'"'),""].join(" ");if("linear"===this.type){const{x1:t,y1:e,x2:s,y2:r}=this.coords;i.push("<linearGradient ",l,' x1="',t,'" y1="',e,'" x2="',s,'" y2="',r,'">\n');}else if("radial"===this.type){const{x1:t,y1:e,x2:s,y2:r,r1:n,r2:a}=this.coords,h=n>a;i.push("<radialGradient ",l,' cx="',h?t:s,'" cy="',h?e:r,'" r="',h?n:a,'" fx="',h?s:t,'" fy="',h?r:e,'">\n'),h&&(o.reverse(),o.forEach((t=>{t.offset=1-t.offset;})));const c=Math.min(n,a);if(c>0){const t=c/Math.max(n,a);o.forEach((e=>{e.offset+=t*(1-e.offset);}));}}return o.forEach((t=>{let{color:e,offset:s,opacity:r}=t;i.push("<stop ",'offset="',100*s+"%",'" style="stop-color:',e,void 0!==r?";stop-opacity: "+r:";",'"/>\n');})),i.push("linear"===this.type?"</linearGradient>":"</radialGradient>","\n"),i.join("")}toLive(t){const{x1:e,y1:s,x2:i,y2:r,r1:n,r2:o}=this.coords,a="linear"===this.type?t.createLinearGradient(e,s,i,r):t.createRadialGradient(e,s,n,i,r,o);return this.colorStops.forEach((t=>{let{color:e,opacity:s,offset:i}=t;a.addColorStop(i,void 0!==s?new Ie(e).setAlpha(s).toRgba():e);})),a}static async fromObject(t){const{colorStops:e,gradientTransform:i}=t;return new this(s(s({},t),{},{colorStops:e?e.map((t=>s({},t))):void 0,gradientTransform:i?[...i]:void 0}))}static fromElement(t,e,i){const r=Jn(t),n=e._findCenterFromElement();return new this(s({id:t.getAttribute("id")||void 0,type:Kn(t),coords:Zn(t,{width:i.viewBoxWidth||i.width,height:i.viewBoxHeight||i.height}),colorStops:qn(t,i.opacity),gradientUnits:r,gradientTransform:wr(t.getAttribute("gradientTransform")||"")},"pixels"===r?{offsetX:e.width/2-n.x,offsetY:e.height/2-n.y}:{offsetX:0,offsetY:0}))}}t($n,"type","Gradient"),tt.setClass($n,"gradient"),tt.setClass($n,"linear"),tt.setClass($n,"radial");const to=["type","source","patternTransform"];class eo{get type(){return "pattern"}set type(t){a("warn","Setting type has no effect",t);}constructor(e){t(this,"repeat","repeat"),t(this,"offsetX",0),t(this,"offsetY",0),t(this,"crossOrigin",""),this.id=ft(),Object.assign(this,e);}isImageSource(){return !!this.source&&"string"==typeof this.source.src}isCanvasSource(){return !!this.source&&!!this.source.toDataURL}sourceToString(){return this.isImageSource()?this.source.src:this.isCanvasSource()?this.source.toDataURL():""}toLive(t){return this.source&&(!this.isImageSource()||this.source.complete&&0!==this.source.naturalWidth&&0!==this.source.naturalHeight)?t.createPattern(this.source,this.repeat):null}toObject(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:[];const{repeat:e,crossOrigin:i}=this;return s(s({},Yt(this,t)),{},{type:"pattern",source:this.sourceToString(),repeat:e,crossOrigin:i,offsetX:Vt(this.offsetX,o.NUM_FRACTION_DIGITS),offsetY:Vt(this.offsetY,o.NUM_FRACTION_DIGITS),patternTransform:this.patternTransform?[...this.patternTransform]:null})}toSVG(t){let{width:e,height:s}=t;const{source:i,repeat:r,id:n}=this,o=Vn(this.offsetX/e,0),a=Vn(this.offsetY/s,0),h="repeat-y"===r||"no-repeat"===r?1+Math.abs(o||0):Vn(i.width/e,0),c="repeat-x"===r||"no-repeat"===r?1+Math.abs(a||0):Vn(i.height/s,0);return ['<pattern id="SVGID_'.concat(n,'" x="').concat(o,'" y="').concat(a,'" width="').concat(h,'" height="').concat(c,'">'),'<image x="0" y="0" width="'.concat(i.width,'" height="').concat(i.height,'" xlink:href="').concat(this.sourceToString(),'"></image>'),"</pattern>",""].join("\n")}static async fromObject(t,e){let{type:r,source:n,patternTransform:o}=t,a=i(t,to);const h=await It(n,s(s({},e),{},{crossOrigin:a.crossOrigin}));return new this(s(s({},a),{},{patternTransform:o&&o.slice(0),source:h}))}}t(eo,"type","Pattern"),tt.setClass(eo),tt.setClass(eo,"pattern");class so{constructor(e){t(this,"color","rgb(0, 0, 0)"),t(this,"width",1),t(this,"shadow",null),t(this,"strokeLineCap","round"),t(this,"strokeLineJoin","round"),t(this,"strokeMiterLimit",10),t(this,"strokeDashArray",null),t(this,"limitedToCanvasSize",false),this.canvas=e;}_setBrushStyles(t){t.strokeStyle=this.color,t.lineWidth=this.width,t.lineCap=this.strokeLineCap,t.miterLimit=this.strokeMiterLimit,t.lineJoin=this.strokeLineJoin,t.setLineDash(this.strokeDashArray||[]);}_saveAndTransform(t){const e=this.canvas.viewportTransform;t.save(),t.transform(e[0],e[1],e[2],e[3],e[4],e[5]);}needsFullRender(){return new Ie(this.color).getAlpha()<1||!!this.shadow}_setShadow(){if(!this.shadow||!this.canvas)return;const t=this.canvas,e=this.shadow,s=t.contextTop,i=t.getZoom()*t.getRetinaScaling();s.shadowColor=e.color,s.shadowBlur=e.blur*i,s.shadowOffsetX=e.offsetX*i,s.shadowOffsetY=e.offsetY*i;}_resetShadow(){const t=this.canvas.contextTop;t.shadowColor="",t.shadowBlur=t.shadowOffsetX=t.shadowOffsetY=0;}_isOutSideCanvas(t){return t.x<0||t.x>this.canvas.getWidth()||t.y<0||t.y>this.canvas.getHeight()}}const io=["path","left","top"],ro=["d"];class no extends Li{constructor(t){let e=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{},{path:s,left:r,top:n}=e,o=i(e,io);super(),Object.assign(this,no.ownDefaults),this.setOptions(o),this._setPath(t||[],true),"number"==typeof r&&this.set(M,r),"number"==typeof n&&this.set(P,n);}_setPath(t,e){this.path=nn(Array.isArray(t)?t:bn(t)),this.setBoundingBox(e);}_findCenterFromElement(){const t=this._calcBoundsFromPath();return new ot(t.left+t.width/2,t.top+t.height/2)}_renderPathCommands(t){const e=-this.pathOffset.x,s=-this.pathOffset.y;t.beginPath();for(const i of this.path)switch(i[0]){case "L":t.lineTo(i[1]+e,i[2]+s);break;case "M":t.moveTo(i[1]+e,i[2]+s);break;case "C":t.bezierCurveTo(i[1]+e,i[2]+s,i[3]+e,i[4]+s,i[5]+e,i[6]+s);break;case "Q":t.quadraticCurveTo(i[1]+e,i[2]+s,i[3]+e,i[4]+s);break;case "Z":t.closePath();}}_render(t){this._renderPathCommands(t),this._renderPaintInOrder(t);}toString(){return "#<Path (".concat(this.complexity(),'): { "top": ').concat(this.top,', "left": ').concat(this.left," }>")}toObject(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:[];return s(s({},super.toObject(t)),{},{path:this.path.map((t=>t.slice()))})}toDatalessObject(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:[];const e=this.toObject(t);return this.sourcePath&&(delete e.path,e.sourcePath=this.sourcePath),e}_toSVG(){const t=wn(this.path,o.NUM_FRACTION_DIGITS);return ["<path ","COMMON_PARTS",'d="'.concat(t,'" stroke-linecap="round" />\n')]}_getOffsetTransform(){const t=o.NUM_FRACTION_DIGITS;return " translate(".concat(Vt(-this.pathOffset.x,t),", ").concat(Vt(-this.pathOffset.y,t),")")}toClipPathSVG(t){const e=this._getOffsetTransform();return "\t"+this._createBaseClipPathSVGMarkup(this._toSVG(),{reviver:t,additionalTransform:e})}toSVG(t){const e=this._getOffsetTransform();return this._createBaseSVGMarkup(this._toSVG(),{reviver:t,additionalTransform:e})}complexity(){return this.path.length}setDimensions(){this.setBoundingBox();}setBoundingBox(t){const{width:e,height:s,pathOffset:i}=this._calcDimensions();this.set({width:e,height:s,pathOffset:i}),t&&this.setPositionByOrigin(i,D,D);}_calcBoundsFromPath(){const t=[];let e=0,s=0,i=0,r=0;for(const n of this.path)switch(n[0]){case "L":i=n[1],r=n[2],t.push({x:e,y:s},{x:i,y:r});break;case "M":i=n[1],r=n[2],e=i,s=r;break;case "C":t.push(...sn(i,r,n[1],n[2],n[3],n[4],n[5],n[6])),i=n[5],r=n[6];break;case "Q":t.push(...sn(i,r,n[1],n[2],n[1],n[2],n[3],n[4])),i=n[3],r=n[4];break;case "Z":i=e,r=s;}return he(t)}_calcDimensions(){const t=this._calcBoundsFromPath();return s(s({},t),{},{pathOffset:new ot(t.left+t.width/2,t.top+t.height/2)})}static fromObject(t){return this._fromObject(t,{extraParam:"path"})}static async fromElement(t,e,r){const n=Pr(t,this.ATTRIBUTE_NAMES,r),{d:o}=n;return new this(o,s(s(s({},i(n,ro)),e),{},{left:void 0,top:void 0}))}}t(no,"type","Path"),t(no,"cacheProperties",[...Es,"path","fillRule"]),t(no,"ATTRIBUTE_NAMES",[...Zi,"d"]),tt.setClass(no),tt.setSVGClass(no);class oo extends so{constructor(e){super(e),t(this,"decimate",.4),t(this,"drawStraightLine",false),t(this,"straightLineKey","shiftKey"),this._points=[],this._hasStraightLine=false;}needsFullRender(){return super.needsFullRender()||this._hasStraightLine}static drawSegment(t,e,s){const i=e.midPointFrom(s);return t.quadraticCurveTo(e.x,e.y,i.x,i.y),i}onMouseDown(t,e){let{e:s}=e;this.canvas._isMainEvent(s)&&(this.drawStraightLine=!!this.straightLineKey&&s[this.straightLineKey],this._prepareForDrawing(t),this._addPoint(t),this._render());}onMouseMove(t,e){let{e:s}=e;if(this.canvas._isMainEvent(s)&&(this.drawStraightLine=!!this.straightLineKey&&s[this.straightLineKey],(true!==this.limitedToCanvasSize||!this._isOutSideCanvas(t))&&this._addPoint(t)&&this._points.length>1))if(this.needsFullRender())this.canvas.clearContext(this.canvas.contextTop),this._render();else {const t=this._points,e=t.length,s=this.canvas.contextTop;this._saveAndTransform(s),this.oldEnd&&(s.beginPath(),s.moveTo(this.oldEnd.x,this.oldEnd.y)),this.oldEnd=oo.drawSegment(s,t[e-2],t[e-1]),s.stroke(),s.restore();}}onMouseUp(t){let{e:e}=t;return !this.canvas._isMainEvent(e)||(this.drawStraightLine=false,this.oldEnd=void 0,this._finalizeAndAddPath(),false)}_prepareForDrawing(t){this._reset(),this._addPoint(t),this.canvas.contextTop.moveTo(t.x,t.y);}_addPoint(t){return !(this._points.length>1&&t.eq(this._points[this._points.length-1]))&&(this.drawStraightLine&&this._points.length>1&&(this._hasStraightLine=true,this._points.pop()),this._points.push(t),true)}_reset(){this._points=[],this._setBrushStyles(this.canvas.contextTop),this._setShadow(),this._hasStraightLine=false;}_render(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:this.canvas.contextTop,e=this._points[0],s=this._points[1];if(this._saveAndTransform(t),t.beginPath(),2===this._points.length&&e.x===s.x&&e.y===s.y){const t=this.width/1e3;e.x-=t,s.x+=t;}t.moveTo(e.x,e.y);for(let i=1;i<this._points.length;i++)oo.drawSegment(t,e,s),e=this._points[i],s=this._points[i+1];t.lineTo(e.x,e.y),t.stroke(),t.restore();}convertPointsToSVGPath(t){const e=this.width/1e3;return Sn(t,e)}createPath(t){const e=new no(t,{fill:null,stroke:this.color,strokeWidth:this.width,strokeLineCap:this.strokeLineCap,strokeMiterLimit:this.strokeMiterLimit,strokeLineJoin:this.strokeLineJoin,strokeDashArray:this.strokeDashArray});return this.shadow&&(this.shadow.affectStroke=true,e.shadow=new Ds(this.shadow)),e}decimatePoints(t,e){if(t.length<=2)return t;let s,i=t[0];const r=this.canvas.getZoom(),n=Math.pow(e/r,2),o=t.length-1,a=[i];for(let e=1;e<o-1;e++)s=Math.pow(i.x-t[e].x,2)+Math.pow(i.y-t[e].y,2),s>=n&&(i=t[e],a.push(i));return a.push(t[o]),a}_finalizeAndAddPath(){this.canvas.contextTop.closePath(),this.decimate&&(this._points=this.decimatePoints(this._points,this.decimate));const t=this.convertPointsToSVGPath(this._points);if(function(t){return "M 0 0 Q 0 0 0 0 L 0 0"===wn(t)}(t))return void this.canvas.requestRenderAll();const e=this.createPath(t);this.canvas.clearContext(this.canvas.contextTop),this.canvas.fire("before:path:created",{path:e}),this.canvas.add(e),this.canvas.requestRenderAll(),e.setCoords(),this._resetShadow(),this.canvas.fire("path:created",{path:e});}}const ao=["left","top","radius"],ho=["radius","startAngle","endAngle","counterClockwise"];class co extends Li{static getDefaults(){return s(s({},super.getDefaults()),co.ownDefaults)}constructor(t){super(),Object.assign(this,co.ownDefaults),this.setOptions(t);}_set(t,e){return super._set(t,e),"radius"===t&&this.setRadius(e),this}_render(t){t.beginPath(),t.arc(0,0,this.radius,xt(this.startAngle),xt(this.endAngle),this.counterClockwise),this._renderPaintInOrder(t);}getRadiusX(){return this.get("radius")*this.get(H)}getRadiusY(){return this.get("radius")*this.get(N)}setRadius(t){this.radius=t,this.set({width:2*t,height:2*t});}toObject(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:[];return super.toObject([...ho,...t])}_toSVG(){const t=(this.endAngle-this.startAngle)%360;if(0===t)return ["<circle ","COMMON_PARTS",'cx="0" cy="0" ','r="',"".concat(this.radius),'" />\n'];{const{radius:e}=this,s=xt(this.startAngle),i=xt(this.endAngle),r=rt(s)*e,n=nt(s)*e,o=rt(i)*e,a=nt(i)*e,h=t>180?1:0,c=this.counterClockwise?0:1;return ['<path d="M '.concat(r," ").concat(n," A ").concat(e," ").concat(e," 0 ").concat(h," ").concat(c," ").concat(o," ").concat(a,'" '),"COMMON_PARTS"," />\n"]}}static async fromElement(t,e,r){const n=Pr(t,this.ATTRIBUTE_NAMES,r),{left:o=0,top:a=0,radius:h=0}=n;return new this(s(s({},i(n,ao)),{},{radius:h,left:o-h,top:a-h}))}static fromObject(t){return super._fromObject(t)}}t(co,"type","Circle"),t(co,"cacheProperties",[...Es,...ho]),t(co,"ownDefaults",{radius:0,startAngle:0,endAngle:360,counterClockwise:false}),t(co,"ATTRIBUTE_NAMES",["cx","cy","r",...Zi]),tt.setClass(co),tt.setSVGClass(co);const fo=["x1","y1","x2","y2"],po=["x1","y1","x2","y2"],mo=["x1","x2","y1","y2"];class vo extends Li{constructor(){let[t,e,s,i]=arguments.length>0&&void 0!==arguments[0]?arguments[0]:[0,0,0,0],r=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{};super(),Object.assign(this,vo.ownDefaults),this.setOptions(r),this.x1=t,this.x2=s,this.y1=e,this.y2=i,this._setWidthHeight();const{left:n,top:o}=r;"number"==typeof n&&this.set(M,n),"number"==typeof o&&this.set(P,o);}_setWidthHeight(){const{x1:t,y1:e,x2:s,y2:i}=this;this.width=Math.abs(s-t),this.height=Math.abs(i-e);const{left:r,top:n,width:o,height:a}=he([{x:t,y:e},{x:s,y:i}]),h=new ot(r+o/2,n+a/2);this.setPositionByOrigin(h,D,D);}_set(t,e){return super._set(t,e),mo.includes(t)&&this._setWidthHeight(),this}_render(t){t.beginPath();const e=this.calcLinePoints();t.moveTo(e.x1,e.y1),t.lineTo(e.x2,e.y2),t.lineWidth=this.strokeWidth;const s=t.strokeStyle;var i;Gt(this.stroke)?t.strokeStyle=this.stroke.toLive(t):t.strokeStyle=null!==(i=this.stroke)&&void 0!==i?i:t.fillStyle;this.stroke&&this._renderStroke(t),t.strokeStyle=s;}_findCenterFromElement(){return new ot((this.x1+this.x2)/2,(this.y1+this.y2)/2)}toObject(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:[];return s(s({},super.toObject(t)),this.calcLinePoints())}_getNonTransformedDimensions(){const t=super._getNonTransformedDimensions();return "butt"===this.strokeLineCap&&(0===this.width&&(t.y-=this.strokeWidth),0===this.height&&(t.x-=this.strokeWidth)),t}calcLinePoints(){const{x1:t,x2:e,y1:s,y2:i,width:r,height:n}=this,o=t<=e?-1:1,a=s<=i?-1:1;return {x1:o*r/2,x2:o*-r/2,y1:a*n/2,y2:a*-n/2}}_toSVG(){const{x1:t,x2:e,y1:s,y2:i}=this.calcLinePoints();return ["<line ","COMMON_PARTS",'x1="'.concat(t,'" y1="').concat(s,'" x2="').concat(e,'" y2="').concat(i,'" />\n')]}static async fromElement(t,e,s){const r=Pr(t,this.ATTRIBUTE_NAMES,s),{x1:n=0,y1:o=0,x2:a=0,y2:h=0}=r;return new this([n,o,a,h],i(r,fo))}static fromObject(t){let{x1:e,y1:r,x2:n,y2:o}=t,a=i(t,po);return this._fromObject(s(s({},a),{},{points:[e,r,n,o]}),{extraParam:"points"})}}t(vo,"type","Line"),t(vo,"cacheProperties",[...Es,...mo]),t(vo,"ATTRIBUTE_NAMES",Zi.concat(mo)),tt.setClass(vo),tt.setSVGClass(vo);class yo extends Li{static getDefaults(){return s(s({},super.getDefaults()),yo.ownDefaults)}constructor(t){super(),Object.assign(this,yo.ownDefaults),this.setOptions(t);}_render(t){const e=this.width/2,s=this.height/2;t.beginPath(),t.moveTo(-e,s),t.lineTo(0,-s),t.lineTo(e,s),t.closePath(),this._renderPaintInOrder(t);}_toSVG(){const t=this.width/2,e=this.height/2;return ["<polygon ","COMMON_PARTS",'points="',"".concat(-t," ").concat(e,",0 ").concat(-e,",").concat(t," ").concat(e),'" />']}}t(yo,"type","Triangle"),t(yo,"ownDefaults",{width:100,height:100}),tt.setClass(yo),tt.setSVGClass(yo);const _o=["rx","ry"];class xo extends Li{static getDefaults(){return s(s({},super.getDefaults()),xo.ownDefaults)}constructor(t){super(),Object.assign(this,xo.ownDefaults),this.setOptions(t);}_set(t,e){switch(super._set(t,e),t){case "rx":this.rx=e,this.set("width",2*e);break;case "ry":this.ry=e,this.set("height",2*e);}return this}getRx(){return this.get("rx")*this.get(H)}getRy(){return this.get("ry")*this.get(N)}toObject(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:[];return super.toObject([..._o,...t])}_toSVG(){return ["<ellipse ","COMMON_PARTS",'cx="0" cy="0" rx="'.concat(this.rx,'" ry="').concat(this.ry,'" />\n')]}_render(t){t.beginPath(),t.save(),t.transform(1,0,0,this.ry/this.rx,0,0),t.arc(0,0,this.rx,0,S,false),t.restore(),this._renderPaintInOrder(t);}static async fromElement(t,e,s){const i=Pr(t,this.ATTRIBUTE_NAMES,s);return i.left=(i.left||0)-i.rx,i.top=(i.top||0)-i.ry,new this(i)}}function Co(t){if(!t)return [];const e=t.replace(/,/g," ").trim().split(/\s+/),s=[];for(let t=0;t<e.length;t+=2)s.push({x:parseFloat(e[t]),y:parseFloat(e[t+1])});return s}t(xo,"type","Ellipse"),t(xo,"cacheProperties",[...Es,..._o]),t(xo,"ownDefaults",{rx:0,ry:0}),t(xo,"ATTRIBUTE_NAMES",[...Zi,"cx","cy","rx","ry"]),tt.setClass(xo),tt.setSVGClass(xo);const bo=["left","top"],So={exactBoundingBox:false};class wo extends Li{static getDefaults(){return s(s({},super.getDefaults()),wo.ownDefaults)}constructor(){let e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:[],s=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{};super(),t(this,"strokeDiff",void 0),Object.assign(this,wo.ownDefaults),this.setOptions(s),this.points=e;const{left:i,top:r}=s;this.initialized=true,this.setBoundingBox(true),"number"==typeof i&&this.set(M,i),"number"==typeof r&&this.set(P,r);}isOpen(){return  true}_projectStrokeOnPoints(t){return Wi(this.points,t,this.isOpen())}_calcDimensions(t){t=s({scaleX:this.scaleX,scaleY:this.scaleY,skewX:this.skewX,skewY:this.skewY,strokeLineCap:this.strokeLineCap,strokeLineJoin:this.strokeLineJoin,strokeMiterLimit:this.strokeMiterLimit,strokeUniform:this.strokeUniform,strokeWidth:this.strokeWidth},t||{});const e=this.exactBoundingBox?this._projectStrokeOnPoints(t).map((t=>t.projectedPoint)):this.points;if(0===e.length)return {left:0,top:0,width:0,height:0,pathOffset:new ot,strokeOffset:new ot,strokeDiff:new ot};const i=he(e),r=Lt(s(s({},t),{},{scaleX:1,scaleY:1})),n=he(this.points.map((t=>St(t,r,true)))),o=new ot(this.scaleX,this.scaleY);let a=i.left+i.width/2,h=i.top+i.height/2;return this.exactBoundingBox&&(a-=h*Math.tan(xt(this.skewX)),h-=a*Math.tan(xt(this.skewY))),s(s({},i),{},{pathOffset:new ot(a,h),strokeOffset:new ot(n.left,n.top).subtract(new ot(i.left,i.top)).multiply(o),strokeDiff:new ot(i.width,i.height).subtract(new ot(n.width,n.height)).multiply(o)})}_findCenterFromElement(){const t=he(this.points);return new ot(t.left+t.width/2,t.top+t.height/2)}setDimensions(){this.setBoundingBox();}setBoundingBox(t){const{left:e,top:s,width:i,height:r,pathOffset:n,strokeOffset:o,strokeDiff:a}=this._calcDimensions();this.set({width:i,height:r,pathOffset:n,strokeOffset:o,strokeDiff:a}),t&&this.setPositionByOrigin(new ot(e+i/2,s+r/2),D,D);}isStrokeAccountedForInDimensions(){return this.exactBoundingBox}_getNonTransformedDimensions(){return this.exactBoundingBox?new ot(this.width,this.height):super._getNonTransformedDimensions()}_getTransformedDimensions(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};if(this.exactBoundingBox){let n;if(Object.keys(t).some((t=>this.strokeUniform||this.constructor.layoutProperties.includes(t)))){var e,s;const{width:i,height:r}=this._calcDimensions(t);n=new ot(null!==(e=t.width)&&void 0!==e?e:i,null!==(s=t.height)&&void 0!==s?s:r);}else {var i,r;n=new ot(null!==(i=t.width)&&void 0!==i?i:this.width,null!==(r=t.height)&&void 0!==r?r:this.height);}return n.multiply(new ot(t.scaleX||this.scaleX,t.scaleY||this.scaleY))}return super._getTransformedDimensions(t)}_set(t,e){const s=this.initialized&&this[t]!==e,i=super._set(t,e);return this.exactBoundingBox&&s&&((t===H||t===N)&&this.strokeUniform&&this.constructor.layoutProperties.includes("strokeUniform")||this.constructor.layoutProperties.includes(t))&&this.setDimensions(),i}toObject(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:[];return s(s({},super.toObject(t)),{},{points:this.points.map((t=>{let{x:e,y:s}=t;return {x:e,y:s}}))})}_toSVG(){const t=[],e=this.pathOffset.x,s=this.pathOffset.y,i=o.NUM_FRACTION_DIGITS;for(let r=0,n=this.points.length;r<n;r++)t.push(Vt(this.points[r].x-e,i),",",Vt(this.points[r].y-s,i)," ");return ["<".concat(this.constructor.type.toLowerCase()," "),"COMMON_PARTS",'points="'.concat(t.join(""),'" />\n')]}_render(t){const e=this.points.length,s=this.pathOffset.x,i=this.pathOffset.y;if(e&&!isNaN(this.points[e-1].y)){t.beginPath(),t.moveTo(this.points[0].x-s,this.points[0].y-i);for(let r=0;r<e;r++){const e=this.points[r];t.lineTo(e.x-s,e.y-i);}!this.isOpen()&&t.closePath(),this._renderPaintInOrder(t);}}complexity(){return this.points.length}static async fromElement(t,e,r){return new this(Co(t.getAttribute("points")),s(s({},i(Pr(t,this.ATTRIBUTE_NAMES,r),bo)),e))}static fromObject(t){return this._fromObject(t,{extraParam:"points"})}}t(wo,"ownDefaults",So),t(wo,"type","Polyline"),t(wo,"layoutProperties",[U,q,"strokeLineCap","strokeLineJoin","strokeMiterLimit","strokeWidth","strokeUniform","points"]),t(wo,"cacheProperties",[...Es,"points"]),t(wo,"ATTRIBUTE_NAMES",[...Zi]),tt.setClass(wo),tt.setSVGClass(wo);class To extends wo{isOpen(){return  false}}t(To,"ownDefaults",So),t(To,"type","Polygon"),tt.setClass(To),tt.setSVGClass(To);class Oo extends Li{isEmptyStyles(t){if(!this.styles)return  true;if(void 0!==t&&!this.styles[t])return  true;const e=void 0===t?this.styles:{line:this.styles[t]};for(const t in e)for(const s in e[t])for(const i in e[t][s])return  false;return  true}styleHas(t,e){if(!this.styles)return  false;if(void 0!==e&&!this.styles[e])return  false;const s=void 0===e?this.styles:{0:this.styles[e]};for(const e in s)for(const i in s[e])if(void 0!==s[e][i][t])return  true;return  false}cleanStyle(t){if(!this.styles)return  false;const e=this.styles;let s,i,r=0,n=true,o=0;for(const o in e){s=0;for(const a in e[o]){const h=e[o][a]||{};r++,void 0!==h[t]?(i?h[t]!==i&&(n=false):i=h[t],h[t]===this[t]&&delete h[t]):n=false,0!==Object.keys(h).length?s++:delete e[o][a];}0===s&&delete e[o];}for(let t=0;t<this._textLines.length;t++)o+=this._textLines[t].length;n&&r===o&&(this[t]=i,this.removeStyle(t));}removeStyle(t){if(!this.styles)return;const e=this.styles;let s,i,r;for(i in e){for(r in s=e[i],s)delete s[r][t],0===Object.keys(s[r]).length&&delete s[r];0===Object.keys(s).length&&delete e[i];}}_extendStyles(t,e){const{lineIndex:i,charIndex:r}=this.get2DCursorLocation(t);this._getLineStyle(i)||this._setLineStyle(i);const n=Wt(s(s({},this._getStyleDeclaration(i,r)),e),(t=>void 0!==t));this._setStyleDeclaration(i,r,n);}getSelectionStyles(t,e,s){const i=[];for(let r=t;r<(e||t);r++)i.push(this.getStyleAtPosition(r,s));return i}getStyleAtPosition(t,e){const{lineIndex:s,charIndex:i}=this.get2DCursorLocation(t);return e?this.getCompleteStyleDeclaration(s,i):this._getStyleDeclaration(s,i)}setSelectionStyles(t,e,s){for(let i=e;i<(s||e);i++)this._extendStyles(i,t);this._forceClearCache=true;}_getStyleDeclaration(t,e){var s;const i=this.styles&&this.styles[t];return i&&null!==(s=i[e])&&void 0!==s?s:{}}getCompleteStyleDeclaration(t,e){return s(s({},Yt(this,this.constructor._styleProperties)),this._getStyleDeclaration(t,e))}_setStyleDeclaration(t,e,s){this.styles[t][e]=s;}_deleteStyleDeclaration(t,e){delete this.styles[t][e];}_getLineStyle(t){return !!this.styles[t]}_setLineStyle(t){this.styles[t]={};}_deleteLineStyle(t){delete this.styles[t];}}t(Oo,"_styleProperties",qe);const ko=/  +/g,Do=/"/g;function Mo(t,e,s,i,r){return "\t\t".concat(function(t,e){let{left:s,top:i,width:r,height:n}=e,a=arguments.length>2&&void 0!==arguments[2]?arguments[2]:o.NUM_FRACTION_DIGITS;const h=Ye(K,t,false),[c,l,u,d]=[s,i,r,n].map((t=>Vt(t,a)));return "<rect ".concat(h,' x="').concat(c,'" y="').concat(l,'" width="').concat(u,'" height="').concat(d,'"></rect>')}(t,{left:e,top:s,width:i,height:r}),"\n")}const Po=["textAnchor","textDecoration","dx","dy","top","left","fontSize","strokeWidth"];let Eo;class Ao extends Oo{static getDefaults(){return s(s({},super.getDefaults()),Ao.ownDefaults)}constructor(e,s){super(),t(this,"__charBounds",[]),Object.assign(this,Ao.ownDefaults),this.setOptions(s),this.styles||(this.styles={}),this.text=e,this.initialized=true,this.path&&this.setPathInfo(),this.initDimensions(),this.setCoords();}setPathInfo(){const t=this.path;t&&(t.segmentsInfo=mn(t.path));}_splitText(){const t=this._splitTextIntoLines(this.text);return this.textLines=t.lines,this._textLines=t.graphemeLines,this._unwrappedTextLines=t._unwrappedLines,this._text=t.graphemeText,t}initDimensions(){this._splitText(),this._clearCache(),this.dirty=true,this.path?(this.width=this.path.width,this.height=this.path.height):(this.width=this.calcTextWidth()||this.cursorWidth||this.MIN_TEXT_WIDTH,this.height=this.calcTextHeight()),this.textAlign.includes(Je)&&this.enlargeSpaces();}enlargeSpaces(){let t,e,s,i,r,n,o;for(let a=0,h=this._textLines.length;a<h;a++)if((this.textAlign===Je||a!==h-1&&!this.isEndOfWrapping(a))&&(i=0,r=this._textLines[a],e=this.getLineWidth(a),e<this.width&&(o=this.textLines[a].match(this._reSpacesAndTabs)))){s=o.length,t=(this.width-e)/s;for(let e=0;e<=r.length;e++)n=this.__charBounds[a][e],this._reSpaceAndTab.test(r[e])?(n.width+=t,n.kernedWidth+=t,n.left+=i,i+=t):n.left+=i;}}isEndOfWrapping(t){return t===this._textLines.length-1}missingNewlineOffset(t){return 1}get2DCursorLocation(t,e){const s=e?this._unwrappedTextLines:this._textLines;let i;for(i=0;i<s.length;i++){if(t<=s[i].length)return {lineIndex:i,charIndex:t};t-=s[i].length+this.missingNewlineOffset(i,e);}return {lineIndex:i-1,charIndex:s[i-1].length<t?s[i-1].length:t}}toString(){return "#<Text (".concat(this.complexity(),'): { "text": "').concat(this.text,'", "fontFamily": "').concat(this.fontFamily,'" }>')}_getCacheCanvasDimensions(){const t=super._getCacheCanvasDimensions(),e=this.fontSize;return t.width+=e*t.zoomX,t.height+=e*t.zoomY,t}_render(t){const e=this.path;e&&!e.isNotVisible()&&e._render(t),this._setTextStyles(t),this._renderTextLinesBackground(t),this._renderTextDecoration(t,"underline"),this._renderText(t),this._renderTextDecoration(t,"overline"),this._renderTextDecoration(t,"linethrough");}_renderText(t){this.paintFirst===J?(this._renderTextStroke(t),this._renderTextFill(t)):(this._renderTextFill(t),this._renderTextStroke(t));}_setTextStyles(t,e,s){if(t.textBaseline="alphabetic",this.path)switch(this.pathAlign){case D:t.textBaseline="middle";break;case "ascender":t.textBaseline=P;break;case "descender":t.textBaseline=E;}t.font=this._getFontDeclaration(e,s);}calcTextWidth(){let t=this.getLineWidth(0);for(let e=1,s=this._textLines.length;e<s;e++){const s=this.getLineWidth(e);s>t&&(t=s);}return t}_renderTextLine(t,e,s,i,r,n){this._renderChars(t,e,s,i,r,n);}_renderTextLinesBackground(t){if(!this.textBackgroundColor&&!this.styleHas("textBackgroundColor"))return;const e=t.fillStyle,s=this._getLeftOffset();let i=this._getTopOffset();for(let e=0,r=this._textLines.length;e<r;e++){const r=this.getHeightOfLine(e);if(!this.textBackgroundColor&&!this.styleHas("textBackgroundColor",e)){i+=r;continue}const n=this._textLines[e].length,o=this._getLineLeftOffset(e);let a,h,c=0,l=0,u=this.getValueOfPropertyAt(e,0,"textBackgroundColor");const d=this.getHeightOfLineImpl(e);for(let r=0;r<n;r++){const n=this.__charBounds[e][r];h=this.getValueOfPropertyAt(e,r,"textBackgroundColor"),this.path?(t.save(),t.translate(n.renderLeft,n.renderTop),t.rotate(n.angle),t.fillStyle=h,h&&t.fillRect(-n.width/2,-d*(1-this._fontSizeFraction),n.width,d),t.restore()):h!==u?(a=s+o+l,"rtl"===this.direction&&(a=this.width-a-c),t.fillStyle=u,u&&t.fillRect(a,i,c,d),l=n.left,c=n.width,u=h):c+=n.kernedWidth;}h&&!this.path&&(a=s+o+l,"rtl"===this.direction&&(a=this.width-a-c),t.fillStyle=h,t.fillRect(a,i,c,d)),i+=r;}t.fillStyle=e,this._removeShadow(t);}_measureChar(t,e,s,i){const r=_.getFontCache(e),n=this._getFontDeclaration(e),o=s+t,a=s&&n===this._getFontDeclaration(i),h=e.fontSize/this.CACHE_FONT_SIZE;let c,l,u,d;if(s&&r.has(s)&&(u=r.get(s)),r.has(t)&&(d=c=r.get(t)),a&&r.has(o)&&(l=r.get(o),d=l-u),void 0===c||void 0===u||void 0===l){const i=function(){if(!Eo){const t=vt({width:0,height:0});Eo=t.getContext("2d");}return Eo}();this._setTextStyles(i,e,true),void 0===c&&(d=c=i.measureText(t).width,r.set(t,c)),void 0===u&&a&&s&&(u=i.measureText(s).width,r.set(s,u)),a&&void 0===l&&(l=i.measureText(o).width,r.set(o,l),d=l-u);}return {width:c*h,kernedWidth:d*h}}getHeightOfChar(t,e){return this.getValueOfPropertyAt(t,e,"fontSize")}measureLine(t){const e=this._measureLine(t);return 0!==this.charSpacing&&(e.width-=this._getWidthOfCharSpacing()),e.width<0&&(e.width=0),e}_measureLine(t){let e,s,i=0;const r=this.pathSide===A,n=this.path,o=this._textLines[t],a=o.length,h=new Array(a);this.__charBounds[t]=h;for(let r=0;r<a;r++){const n=o[r];s=this._getGraphemeBox(n,t,r,e),h[r]=s,i+=s.kernedWidth,e=n;}if(h[a]={left:s?s.left+s.width:0,width:0,kernedWidth:0,height:this.fontSize,deltaY:0},n&&n.segmentsInfo){let t=0;const e=n.segmentsInfo[n.segmentsInfo.length-1].length;switch(this.textAlign){case M:t=r?e-i:0;break;case D:t=(e-i)/2;break;case A:t=r?0:e-i;}t+=this.pathStartOffset*(r?-1:1);for(let i=r?a-1:0;r?i>=0:i<a;r?i--:i++)s=h[i],t>e?t%=e:t<0&&(t+=e),this._setGraphemeOnPath(t,s),t+=s.kernedWidth;}return {width:i,numOfSpaces:0}}_setGraphemeOnPath(t,e){const s=t+e.kernedWidth/2,i=this.path,r=vn(i.path,s,i.segmentsInfo);e.renderLeft=r.x-i.pathOffset.x,e.renderTop=r.y-i.pathOffset.y,e.angle=r.angle+(this.pathSide===A?Math.PI:0);}_getGraphemeBox(t,e,s,i,r){const n=this.getCompleteStyleDeclaration(e,s),o=i?this.getCompleteStyleDeclaration(e,s-1):{},a=this._measureChar(t,n,i,o);let h,c=a.kernedWidth,l=a.width;0!==this.charSpacing&&(h=this._getWidthOfCharSpacing(),l+=h,c+=h);const u={width:l,left:0,height:n.fontSize,kernedWidth:c,deltaY:n.deltaY};if(s>0&&!r){const t=this.__charBounds[e][s-1];u.left=t.left+t.width+a.kernedWidth-a.width;}return u}getHeightOfLineImpl(t){const e=this.__lineHeights;if(e[t])return e[t];let s=this.getHeightOfChar(t,0);for(let e=1,i=this._textLines[t].length;e<i;e++)s=Math.max(this.getHeightOfChar(t,e),s);return e[t]=s*this._fontSizeMult}getHeightOfLine(t){return this.getHeightOfLineImpl(t)*this.lineHeight}calcTextHeight(){let t=0;for(let e=0,s=this._textLines.length;e<s;e++)t+=e===s-1?this.getHeightOfLineImpl(e):this.getHeightOfLine(e);return t}_getLeftOffset(){return "ltr"===this.direction?-this.width/2:this.width/2}_getTopOffset(){return -this.height/2}_renderTextCommon(t,e){t.save();let s=0;const i=this._getLeftOffset(),r=this._getTopOffset();for(let n=0,o=this._textLines.length;n<o;n++)this._renderTextLine(e,t,this._textLines[n],i+this._getLineLeftOffset(n),r+s+this.getHeightOfLineImpl(n),n),s+=this.getHeightOfLine(n);t.restore();}_renderTextFill(t){(this.fill||this.styleHas(K))&&this._renderTextCommon(t,"fillText");}_renderTextStroke(t){(this.stroke&&0!==this.strokeWidth||!this.isEmptyStyles())&&(this.shadow&&!this.shadow.affectStroke&&this._removeShadow(t),t.save(),this._setLineDash(t,this.strokeDashArray),t.beginPath(),this._renderTextCommon(t,"strokeText"),t.closePath(),t.restore());}_renderChars(t,e,s,i,r,n){const o=this.textAlign.includes(Je),a=this.path,h=!o&&0===this.charSpacing&&this.isEmptyStyles(n)&&!a,c="ltr"===this.direction,l="ltr"===this.direction?1:-1,u=e.direction;let d,g,f,p,m,v="",y=0;if(e.save(),u!==this.direction&&(e.canvas.setAttribute("dir",c?"ltr":"rtl"),e.direction=c?"ltr":"rtl",e.textAlign=c?M:A),r-=this.getHeightOfLineImpl(n)*this._fontSizeFraction,h)return this._renderChar(t,e,n,0,s.join(""),i,r),void e.restore();for(let h=0,c=s.length-1;h<=c;h++)p=h===c||this.charSpacing||a,v+=s[h],f=this.__charBounds[n][h],0===y?(i+=l*(f.kernedWidth-f.width),y+=f.width):y+=f.kernedWidth,o&&!p&&this._reSpaceAndTab.test(s[h])&&(p=true),p||(d=d||this.getCompleteStyleDeclaration(n,h),g=this.getCompleteStyleDeclaration(n,h+1),p=Ki(d,g,false)),p&&(a?(e.save(),e.translate(f.renderLeft,f.renderTop),e.rotate(f.angle),this._renderChar(t,e,n,h,v,-y/2,0),e.restore()):(m=i,this._renderChar(t,e,n,h,v,m,r)),v="",d=g,i+=l*y,y=0);e.restore();}_applyPatternGradientTransformText(t){const e=this.width+this.strokeWidth,s=this.height+this.strokeWidth,i=vt({width:e,height:s}),r=i.getContext("2d");return i.width=e,i.height=s,r.beginPath(),r.moveTo(0,0),r.lineTo(e,0),r.lineTo(e,s),r.lineTo(0,s),r.closePath(),r.translate(e/2,s/2),r.fillStyle=t.toLive(r),this._applyPatternGradientTransform(r,t),r.fill(),r.createPattern(i,"no-repeat")}handleFiller(t,e,s){let i,r;return Gt(s)?"percentage"===s.gradientUnits||s.gradientTransform||s.patternTransform?(i=-this.width/2,r=-this.height/2,t.translate(i,r),t[e]=this._applyPatternGradientTransformText(s),{offsetX:i,offsetY:r}):(t[e]=s.toLive(t),this._applyPatternGradientTransform(t,s)):(t[e]=s,{offsetX:0,offsetY:0})}_setStrokeStyles(t,e){let{stroke:s,strokeWidth:i}=e;return t.lineWidth=i,t.lineCap=this.strokeLineCap,t.lineDashOffset=this.strokeDashOffset,t.lineJoin=this.strokeLineJoin,t.miterLimit=this.strokeMiterLimit,this.handleFiller(t,"strokeStyle",s)}_setFillStyles(t,e){let{fill:s}=e;return this.handleFiller(t,"fillStyle",s)}_renderChar(t,e,s,i,r,n,o){const a=this._getStyleDeclaration(s,i),h=this.getCompleteStyleDeclaration(s,i),c="fillText"===t&&h.fill,l="strokeText"===t&&h.stroke&&h.strokeWidth;if(l||c){if(e.save(),e.font=this._getFontDeclaration(h),a.textBackgroundColor&&this._removeShadow(e),a.deltaY&&(o+=a.deltaY),c){const t=this._setFillStyles(e,h);e.fillText(r,n-t.offsetX,o-t.offsetY);}if(l){const t=this._setStrokeStyles(e,h);e.strokeText(r,n-t.offsetX,o-t.offsetY);}e.restore();}}setSuperscript(t,e){this._setScript(t,e,this.superscript);}setSubscript(t,e){this._setScript(t,e,this.subscript);}_setScript(t,e,s){const i=this.get2DCursorLocation(t,true),r=this.getValueOfPropertyAt(i.lineIndex,i.charIndex,"fontSize"),n=this.getValueOfPropertyAt(i.lineIndex,i.charIndex,"deltaY"),o={fontSize:r*s.size,deltaY:n+r*s.baseline};this.setSelectionStyles(o,t,e);}_getLineLeftOffset(t){const e=this.getLineWidth(t),s=this.width-e,i=this.textAlign,r=this.direction,n=this.isEndOfWrapping(t);let o=0;return i===Je||i===$e&&!n||i===Ze&&!n||i===Qe&&!n?0:(i===D&&(o=s/2),i===A&&(o=s),i===$e&&(o=s/2),i===Ze&&(o=s),"rtl"===r&&(i===A||i===Je||i===Ze?o=0:i===M||i===Qe?o=-s:i!==D&&i!==$e||(o=-s/2)),o)}_clearCache(){this._forceClearCache=false,this.__lineWidths=[],this.__lineHeights=[],this.__charBounds=[];}getLineWidth(t){if(void 0!==this.__lineWidths[t])return this.__lineWidths[t];const{width:e}=this.measureLine(t);return this.__lineWidths[t]=e,e}_getWidthOfCharSpacing(){return 0!==this.charSpacing?this.fontSize*this.charSpacing/1e3:0}getValueOfPropertyAt(t,e,s){var i;return null!==(i=this._getStyleDeclaration(t,e)[s])&&void 0!==i?i:this[s]}_renderTextDecoration(t,e){if(!this[e]&&!this.styleHas(e))return;let s=this._getTopOffset();const i=this._getLeftOffset(),r=this.path,n=this._getWidthOfCharSpacing(),o="linethrough"===e?.5:"overline"===e?1:0,a=this.offsets[e];for(let h=0,c=this._textLines.length;h<c;h++){const c=this.getHeightOfLine(h);if(!this[e]&&!this.styleHas(e,h)){s+=c;continue}const l=this._textLines[h],u=c/this.lineHeight,d=this._getLineLeftOffset(h);let g=0,f=0,p=this.getValueOfPropertyAt(h,0,e),m=this.getValueOfPropertyAt(h,0,K),v=this.getValueOfPropertyAt(h,0,ze),y=p,_=m,x=v;const C=s+u*(1-this._fontSizeFraction);let b=this.getHeightOfChar(h,0),S=this.getValueOfPropertyAt(h,0,"deltaY");for(let s=0,n=l.length;s<n;s++){const n=this.__charBounds[h][s];y=this.getValueOfPropertyAt(h,s,e),_=this.getValueOfPropertyAt(h,s,K),x=this.getValueOfPropertyAt(h,s,ze);const c=this.getHeightOfChar(h,s),l=this.getValueOfPropertyAt(h,s,"deltaY");if(r&&y&&_){const e=this.fontSize*x/1e3;t.save(),t.fillStyle=m,t.translate(n.renderLeft,n.renderTop),t.rotate(n.angle),t.fillRect(-n.kernedWidth/2,a*c+l-o*e,n.kernedWidth,e),t.restore();}else if((y!==p||_!==m||c!==b||x!==v||l!==S)&&f>0){const e=this.fontSize*v/1e3;let s=i+d+g;"rtl"===this.direction&&(s=this.width-s-f),p&&m&&v&&(t.fillStyle=m,t.fillRect(s,C+a*b+S-o*e,f,e)),g=n.left,f=n.width,p=y,v=x,m=_,b=c,S=l;}else f+=n.kernedWidth;}let w=i+d+g;"rtl"===this.direction&&(w=this.width-w-f),t.fillStyle=_;const T=this.fontSize*x/1e3;y&&_&&x&&t.fillRect(w,C+a*b+S-o*T,f-n,T),s+=c;}this._removeShadow(t);}_getFontDeclaration(){let{fontFamily:t=this.fontFamily,fontStyle:e=this.fontStyle,fontWeight:s=this.fontWeight,fontSize:i=this.fontSize}=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{},r=arguments.length>1?arguments[1]:void 0;const n=t.includes("'")||t.includes('"')||t.includes(",")||Ao.genericFonts.includes(t.toLowerCase())?t:'"'.concat(t,'"');return [e,s,"".concat(r?this.CACHE_FONT_SIZE:i,"px"),n].join(" ")}render(t){this.visible&&(this.canvas&&this.canvas.skipOffscreen&&!this.group&&!this.isOnScreen()||(this._forceClearCache&&this.initDimensions(),super.render(t)));}graphemeSplit(t){return Hi(t)}_splitTextIntoLines(t){const e=t.split(this._reNewline),s=new Array(e.length),i=["\n"];let r=[];for(let t=0;t<e.length;t++)s[t]=this.graphemeSplit(e[t]),r=r.concat(s[t],i);return r.pop(),{_unwrappedLines:s,lines:e,graphemeText:r,graphemeLines:s}}toObject(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:[];return s(s({},super.toObject([...Ue,...t])),{},{styles:Ji(this.styles,this.text)},this.path?{path:this.path.toObject()}:{})}set(t,e){const{textLayoutProperties:s}=this.constructor;super.set(t,e);let i=false,r=false;if("object"==typeof t)for(const e in t)"path"===e&&this.setPathInfo(),i=i||s.includes(e),r=r||"path"===e;else i=s.includes(t),r="path"===t;return r&&this.setPathInfo(),i&&this.initialized&&(this.initDimensions(),this.setCoords()),this}complexity(){return 1}static async fromElement(t,e,r){const n=Pr(t,Ao.ATTRIBUTE_NAMES,r),o=s(s({},e),n),{textAnchor:a=M,textDecoration:h="",dx:c=0,dy:l=0,top:u=0,left:d=0,fontSize:g=O,strokeWidth:f=1}=o,p=i(o,Po),m=new this(Pe(t.textContent||"").trim(),s({left:d+c,top:u+l,underline:h.includes("underline"),overline:h.includes("overline"),linethrough:h.includes("line-through"),strokeWidth:0,fontSize:g},p)),v=m.getScaledHeight()/m.height,y=((m.height+m.strokeWidth)*m.lineHeight-m.height)*v,_=m.getScaledHeight()+y;let x=0;return a===D&&(x=m.getScaledWidth()/2),a===A&&(x=m.getScaledWidth()),m.set({left:m.left-x,top:m.top-(_-m.fontSize*(.07+m._fontSizeFraction))/m.lineHeight,strokeWidth:f}),m}static fromObject(t){return this._fromObject(s(s({},t),{},{styles:Qi(t.styles||{},t.text)}),{extraParam:"text"})}}t(Ao,"textLayoutProperties",Ne),t(Ao,"cacheProperties",[...Es,...Ue]),t(Ao,"ownDefaults",Ke),t(Ao,"type","Text"),t(Ao,"genericFonts",["serif","sans-serif","monospace","cursive","fantasy","system-ui","ui-serif","ui-sans-serif","ui-monospace","ui-rounded","math","emoji","fangsong"]),t(Ao,"ATTRIBUTE_NAMES",Zi.concat("x","y","dx","dy","font-family","font-style","font-weight","font-size","letter-spacing","text-decoration","text-anchor")),Fi(Ao,[class extends We{_toSVG(){const t=this._getSVGLeftTopOffsets(),e=this._getSVGTextAndBg(t.textTop,t.textLeft);return this._wrapSVGTextAndBg(e)}toSVG(t){const e=this._createBaseSVGMarkup(this._toSVG(),{reviver:t,noStyle:true,withShadow:true}),s=this.path;return s?e+s._createBaseSVGMarkup(s._toSVG(),{reviver:t,withShadow:true,additionalTransform:zt(this.calcOwnMatrix())}):e}_getSVGLeftTopOffsets(){return {textLeft:-this.width/2,textTop:-this.height/2,lineTop:this.getHeightOfLine(0)}}_wrapSVGTextAndBg(t){let{textBgRects:e,textSpans:s}=t;const i=this.getSvgTextDecoration(this);return [e.join(""),'\t\t<text xml:space="preserve" ','font-family="'.concat(this.fontFamily.replace(Do,"'"),'" '),'font-size="'.concat(this.fontSize,'" '),this.fontStyle?'font-style="'.concat(this.fontStyle,'" '):"",this.fontWeight?'font-weight="'.concat(this.fontWeight,'" '):"",i?'text-decoration="'.concat(i,'" '):"","rtl"===this.direction?'direction="'.concat(this.direction,'" '):"",'style="',this.getSvgStyles(true),'"',this.addPaintOrder()," >",s.join(""),"</text>\n"]}_getSVGTextAndBg(t,e){const s=[],i=[];let r,n=t;this.backgroundColor&&i.push(...Mo(this.backgroundColor,-this.width/2,-this.height/2,this.width,this.height));for(let t=0,o=this._textLines.length;t<o;t++)r=this._getLineLeftOffset(t),"rtl"===this.direction&&(r+=this.width),(this.textBackgroundColor||this.styleHas("textBackgroundColor",t))&&this._setSVGTextLineBg(i,t,e+r,n),this._setSVGTextLineText(s,t,e+r,n),n+=this.getHeightOfLine(t);return {textSpans:s,textBgRects:i}}_createTextCharSpan(t,e,s,i,r){const n=o.NUM_FRACTION_DIGITS,a=this.getSvgSpanStyles(e,t!==t.trim()||!!t.match(ko)),h=a?'style="'.concat(a,'"'):"",c=e.deltaY,l=c?' dy="'.concat(Vt(c,n),'" '):"",{angle:u,renderLeft:d,renderTop:g,width:f}=r;let p="";if(void 0!==d){const t=f/2;u&&(p=' rotate="'.concat(Vt(Ct(u),n),'"'));const e=Pt({angle:Ct(u)});e[4]=d,e[5]=g;const r=new ot(-t,0).transform(e);s=r.x,i=r.y;}return '<tspan x="'.concat(Vt(s,n),'" y="').concat(Vt(i,n),'" ').concat(l).concat(p).concat(h,">").concat(zi(t),"</tspan>")}_setSVGTextLineText(t,e,s,i){const r=this.getHeightOfLine(e),n=this.textAlign.includes(Je),o=this._textLines[e];let a,h,c,l,u,d="",g=0;i+=r*(1-this._fontSizeFraction)/this.lineHeight;for(let r=0,f=o.length-1;r<=f;r++)u=r===f||this.charSpacing||this.path,d+=o[r],c=this.__charBounds[e][r],0===g?(s+=c.kernedWidth-c.width,g+=c.width):g+=c.kernedWidth,n&&!u&&this._reSpaceAndTab.test(o[r])&&(u=true),u||(a=a||this.getCompleteStyleDeclaration(e,r),h=this.getCompleteStyleDeclaration(e,r+1),u=Ki(a,h,true)),u&&(l=this._getStyleDeclaration(e,r),t.push(this._createTextCharSpan(d,l,s,i,c)),d="",a=h,"rtl"===this.direction?s-=g:s+=g,g=0);}_setSVGTextLineBg(t,e,s,i){const r=this._textLines[e],n=this.getHeightOfLine(e)/this.lineHeight;let o,a=0,h=0,c=this.getValueOfPropertyAt(e,0,"textBackgroundColor");for(let l=0;l<r.length;l++){const{left:r,width:u,kernedWidth:d}=this.__charBounds[e][l];o=this.getValueOfPropertyAt(e,l,"textBackgroundColor"),o!==c?(c&&t.push(...Mo(c,s+h,i,a,n)),h=r,a=u,c=o):a+=d;}o&&t.push(...Mo(c,s+h,i,a,n));}_getSVGLineTopOffset(t){let e,s=0;for(e=0;e<t;e++)s+=this.getHeightOfLine(e);const i=this.getHeightOfLine(e);return {lineTop:s,offset:(this._fontSizeMult-this._fontSizeFraction)*i/(this.lineHeight*this._fontSizeMult)}}getSvgStyles(t){return "".concat(super.getSvgStyles(t)," text-decoration-thickness: ").concat(Vt(this.textDecorationThickness*this.getObjectScaling().y/10,o.NUM_FRACTION_DIGITS),"%; white-space: pre;")}getSvgSpanStyles(t,e){const{fontFamily:s,strokeWidth:i,stroke:r,fill:n,fontSize:a,fontStyle:h,fontWeight:c,deltaY:l,textDecorationThickness:u,linethrough:d,overline:g,underline:f}=t,p=this.getSvgTextDecoration({underline:null!=f?f:this.underline,overline:null!=g?g:this.overline,linethrough:null!=d?d:this.linethrough}),m=u||this.textDecorationThickness;return [r?Ye(J,r):"",i?"stroke-width: ".concat(i,"; "):"",s?"font-family: ".concat(s.includes("'")||s.includes('"')?s:"'".concat(s,"'"),"; "):"",a?"font-size: ".concat(a,"px; "):"",h?"font-style: ".concat(h,"; "):"",c?"font-weight: ".concat(c,"; "):"",p?"text-decoration: ".concat(p,"; text-decoration-thickness: ").concat(Vt(m*this.getObjectScaling().y/10,o.NUM_FRACTION_DIGITS),"%; "):"",n?Ye(K,n):"",l?"baseline-shift: ".concat(-l,"; "):"",e?"white-space: pre; ":""].join("")}getSvgTextDecoration(t){return ["overline","underline","line-through"].filter((e=>t[e.replace("-","")])).join(" ")}}]),tt.setClass(Ao),tt.setSVGClass(Ao);class jo{constructor(e){t(this,"target",void 0),t(this,"__mouseDownInPlace",false),t(this,"__dragStartFired",false),t(this,"__isDraggingOver",false),t(this,"__dragStartSelection",void 0),t(this,"__dragImageDisposer",void 0),t(this,"_dispose",void 0),this.target=e;const s=[this.target.on("dragenter",this.dragEnterHandler.bind(this)),this.target.on("dragover",this.dragOverHandler.bind(this)),this.target.on("dragleave",this.dragLeaveHandler.bind(this)),this.target.on("dragend",this.dragEndHandler.bind(this)),this.target.on("drop",this.dropHandler.bind(this))];this._dispose=()=>{s.forEach((t=>t())),this._dispose=void 0;};}isPointerOverSelection(t){const e=this.target,s=e.getSelectionStartFromPointer(t);return e.isEditing&&s>=e.selectionStart&&s<=e.selectionEnd&&e.selectionStart<e.selectionEnd}start(t){return this.__mouseDownInPlace=this.isPointerOverSelection(t)}isActive(){return this.__mouseDownInPlace}end(t){const e=this.isActive();return e&&!this.__dragStartFired&&(this.target.setCursorByClick(t),this.target.initDelayedCursor(true)),this.__mouseDownInPlace=false,this.__dragStartFired=false,this.__isDraggingOver=false,e}getDragStartSelection(){return this.__dragStartSelection}setDragImage(t,e){var s;let{selectionStart:i,selectionEnd:r}=e;const n=this.target,o=n.canvas,a=new ot(n.flipX?-1:1,n.flipY?-1:1),h=n._getCursorBoundaries(i),c=new ot(h.left+h.leftOffset,h.top+h.topOffset).multiply(a).transform(n.calcTransformMatrix()),l=o.getScenePoint(t).subtract(c),u=n.getCanvasRetinaScaling(),d=n.getBoundingRect(),g=c.subtract(new ot(d.left,d.top)),f=o.viewportTransform,p=g.add(l).transform(f,true),m=n.backgroundColor,v=Vi(n.styles);n.backgroundColor="";const y={stroke:"transparent",fill:"transparent",textBackgroundColor:"transparent"};n.setSelectionStyles(y,0,i),n.setSelectionStyles(y,r,n.text.length),n.dirty=true;const _=n.toCanvasElement({enableRetinaScaling:o.enableRetinaScaling,viewportTransform:true});n.backgroundColor=m,n.styles=v,n.dirty=true,Tn(_,{position:"fixed",left:"".concat(-_.width,"px"),border:j,width:"".concat(_.width/u,"px"),height:"".concat(_.height/u,"px")}),this.__dragImageDisposer&&this.__dragImageDisposer(),this.__dragImageDisposer=()=>{_.remove();},Kt(t.target||this.target.hiddenTextarea).body.appendChild(_),null===(s=t.dataTransfer)||void 0===s||s.setDragImage(_,p.x,p.y);}onDragStart(t){this.__dragStartFired=true;const e=this.target,i=this.isActive();if(i&&t.dataTransfer){const i=this.__dragStartSelection={selectionStart:e.selectionStart,selectionEnd:e.selectionEnd},r=e._text.slice(i.selectionStart,i.selectionEnd).join(""),n=s({text:e.text,value:r},i);t.dataTransfer.setData("text/plain",r),t.dataTransfer.setData("application/fabric",JSON.stringify({value:r,styles:e.getSelectionStyles(i.selectionStart,i.selectionEnd,true)})),t.dataTransfer.effectAllowed="copyMove",this.setDragImage(t,n);}return e.abortCursorAnimation(),i}canDrop(t){if(this.target.editable&&!this.target.getActiveControl()&&!t.defaultPrevented){if(this.isActive()&&this.__dragStartSelection){const e=this.target.getSelectionStartFromPointer(t),s=this.__dragStartSelection;return e<s.selectionStart||e>s.selectionEnd}return  true}return  false}targetCanDrop(t){return this.target.canDrop(t)}dragEnterHandler(t){let{e:e}=t;const s=this.targetCanDrop(e);!this.__isDraggingOver&&s&&(this.__isDraggingOver=true);}dragOverHandler(t){const{e:e}=t,s=this.targetCanDrop(e);!this.__isDraggingOver&&s?this.__isDraggingOver=true:this.__isDraggingOver&&!s&&(this.__isDraggingOver=false),this.__isDraggingOver&&(e.preventDefault(),t.canDrop=true,t.dropTarget=this.target);}dragLeaveHandler(){(this.__isDraggingOver||this.isActive())&&(this.__isDraggingOver=false);}dropHandler(t){var e;const{e:s}=t,i=s.defaultPrevented;this.__isDraggingOver=false,s.preventDefault();let r=null===(e=s.dataTransfer)||void 0===e?void 0:e.getData("text/plain");if(r&&!i){const e=this.target,i=e.canvas;let n=e.getSelectionStartFromPointer(s);const{styles:o}=s.dataTransfer.types.includes("application/fabric")?JSON.parse(s.dataTransfer.getData("application/fabric")):{},a=r[Math.max(0,r.length-1)],h=0;if(this.__dragStartSelection){const t=this.__dragStartSelection.selectionStart,s=this.__dragStartSelection.selectionEnd;n>t&&n<=s?n=t:n>s&&(n-=s-t),e.removeChars(t,s),delete this.__dragStartSelection;}e._reNewline.test(a)&&(e._reNewline.test(e._text[n])||n===e._text.length)&&(r=r.trimEnd()),t.didDrop=true,t.dropTarget=e,e.insertChars(r,o,n),i.setActiveObject(e),e.enterEditing(s),e.selectionStart=Math.min(n+h,e._text.length),e.selectionEnd=Math.min(e.selectionStart+r.length,e._text.length),e.hiddenTextarea.value=e.text,e._updateTextarea(),e.hiddenTextarea.focus(),e.fire(z,{index:n+h,action:"drop"}),i.fire("text:changed",{target:e}),i.contextTopDirty=true,i.requestRenderAll();}}dragEndHandler(t){let{e:e}=t;if(this.isActive()&&this.__dragStartFired&&this.__dragStartSelection){var s;const t=this.target,i=this.target.canvas,{selectionStart:r,selectionEnd:n}=this.__dragStartSelection,o=(null===(s=e.dataTransfer)||void 0===s?void 0:s.dropEffect)||j;o===j?(t.selectionStart=r,t.selectionEnd=n,t._updateTextarea(),t.hiddenTextarea.focus()):(t.clearContextTop(),"move"===o&&(t.removeChars(r,n),t.selectionStart=t.selectionEnd=r,t.hiddenTextarea&&(t.hiddenTextarea.value=t.text),t._updateTextarea(),t.fire(z,{index:r,action:"dragend"}),i.fire("text:changed",{target:t}),i.requestRenderAll()),t.exitEditing());}this.__dragImageDisposer&&this.__dragImageDisposer(),delete this.__dragImageDisposer,delete this.__dragStartSelection,this.__isDraggingOver=false;}dispose(){this._dispose&&this._dispose();}}const Fo=/[ \n\.,;!\?\-]/;class Lo extends Ao{constructor(){super(...arguments),t(this,"_currentCursorOpacity",1);}initBehavior(){this._tick=this._tick.bind(this),this._onTickComplete=this._onTickComplete.bind(this),this.updateSelectionOnMouseMove=this.updateSelectionOnMouseMove.bind(this);}onDeselect(t){return this.isEditing&&this.exitEditing(),this.selected=false,super.onDeselect(t)}_animateCursor(t){let{toValue:e,duration:s,delay:i,onComplete:r}=t;return Ks({startValue:this._currentCursorOpacity,endValue:e,duration:s,delay:i,onComplete:r,abort:()=>!this.canvas||this.selectionStart!==this.selectionEnd,onChange:t=>{this._currentCursorOpacity=t,this.renderCursorOrSelection();}})}_tick(t){this._currentTickState=this._animateCursor({toValue:0,duration:this.cursorDuration/2,delay:Math.max(t||0,100),onComplete:this._onTickComplete});}_onTickComplete(){var t;null===(t=this._currentTickCompleteState)||void 0===t||t.abort(),this._currentTickCompleteState=this._animateCursor({toValue:1,duration:this.cursorDuration,onComplete:this._tick});}initDelayedCursor(t){this.abortCursorAnimation(),this._tick(t?0:this.cursorDelay);}abortCursorAnimation(){let t=false;[this._currentTickState,this._currentTickCompleteState].forEach((e=>{e&&!e.isDone()&&(t=true,e.abort());})),this._currentCursorOpacity=1,t&&this.clearContextTop();}restartCursorIfNeeded(){[this._currentTickState,this._currentTickCompleteState].some((t=>!t||t.isDone()))&&this.initDelayedCursor();}selectAll(){return this.selectionStart=0,this.selectionEnd=this._text.length,this._fireSelectionChanged(),this._updateTextarea(),this}cmdAll(){this.selectAll(),this.renderCursorOrSelection();}getSelectedText(){return this._text.slice(this.selectionStart,this.selectionEnd).join("")}findWordBoundaryLeft(t){let e=0,s=t-1;if(this._reSpace.test(this._text[s]))for(;this._reSpace.test(this._text[s]);)e++,s--;for(;/\S/.test(this._text[s])&&s>-1;)e++,s--;return t-e}findWordBoundaryRight(t){let e=0,s=t;if(this._reSpace.test(this._text[s]))for(;this._reSpace.test(this._text[s]);)e++,s++;for(;/\S/.test(this._text[s])&&s<this._text.length;)e++,s++;return t+e}findLineBoundaryLeft(t){let e=0,s=t-1;for(;!/\n/.test(this._text[s])&&s>-1;)e++,s--;return t-e}findLineBoundaryRight(t){let e=0,s=t;for(;!/\n/.test(this._text[s])&&s<this._text.length;)e++,s++;return t+e}searchWordBoundary(t,e){const s=this._text;let i=t>0&&this._reSpace.test(s[t])&&(-1===e||!F.test(s[t-1]))?t-1:t,r=s[i];for(;i>0&&i<s.length&&!Fo.test(r);)i+=e,r=s[i];return  -1===e&&Fo.test(r)&&i++,i}selectWord(t){var e;t=null!==(e=t)&&void 0!==e?e:this.selectionStart;const s=this.searchWordBoundary(t,-1),i=Math.max(s,this.searchWordBoundary(t,1));this.selectionStart=s,this.selectionEnd=i,this._fireSelectionChanged(),this._updateTextarea(),this.renderCursorOrSelection();}selectLine(t){var e;t=null!==(e=t)&&void 0!==e?e:this.selectionStart;const s=this.findLineBoundaryLeft(t),i=this.findLineBoundaryRight(t);this.selectionStart=s,this.selectionEnd=i,this._fireSelectionChanged(),this._updateTextarea();}enterEditing(t){!this.isEditing&&this.editable&&(this.enterEditingImpl(),this.fire("editing:entered",t?{e:t}:void 0),this._fireSelectionChanged(),this.canvas&&(this.canvas.fire("text:editing:entered",{target:this,e:t}),this.canvas.requestRenderAll()));}enterEditingImpl(){this.canvas&&(this.canvas.calcOffset(),this.canvas.textEditingManager.exitTextEditing()),this.isEditing=true,this.initHiddenTextarea(),this.hiddenTextarea.focus(),this.hiddenTextarea.value=this.text,this._updateTextarea(),this._saveEditingProps(),this._setEditingProps(),this._textBeforeEdit=this.text,this._tick();}updateSelectionOnMouseMove(t){if(this.getActiveControl())return;const e=this.hiddenTextarea;Kt(e).activeElement!==e&&e.focus();const s=this.getSelectionStartFromPointer(t),i=this.selectionStart,r=this.selectionEnd;(s===this.__selectionStartOnMouseDown&&i!==r||i!==s&&r!==s)&&(s>this.__selectionStartOnMouseDown?(this.selectionStart=this.__selectionStartOnMouseDown,this.selectionEnd=s):(this.selectionStart=s,this.selectionEnd=this.__selectionStartOnMouseDown),this.selectionStart===i&&this.selectionEnd===r||(this._fireSelectionChanged(),this._updateTextarea(),this.renderCursorOrSelection()));}_setEditingProps(){this.hoverCursor="text",this.canvas&&(this.canvas.defaultCursor=this.canvas.moveCursor="text"),this.borderColor=this.editingBorderColor,this.hasControls=this.selectable=false,this.lockMovementX=this.lockMovementY=true;}fromStringToGraphemeSelection(t,e,s){const i=s.slice(0,t),r=this.graphemeSplit(i).length;if(t===e)return {selectionStart:r,selectionEnd:r};const n=s.slice(t,e);return {selectionStart:r,selectionEnd:r+this.graphemeSplit(n).length}}fromGraphemeToStringSelection(t,e,s){const i=s.slice(0,t).join("").length;if(t===e)return {selectionStart:i,selectionEnd:i};return {selectionStart:i,selectionEnd:i+s.slice(t,e).join("").length}}_updateTextarea(){if(this.cursorOffsetCache={},this.hiddenTextarea){if(!this.inCompositionMode){const t=this.fromGraphemeToStringSelection(this.selectionStart,this.selectionEnd,this._text);this.hiddenTextarea.selectionStart=t.selectionStart,this.hiddenTextarea.selectionEnd=t.selectionEnd;}this.updateTextareaPosition();}}updateFromTextArea(){if(!this.hiddenTextarea)return;this.cursorOffsetCache={};const t=this.hiddenTextarea;this.text=t.value,this.set("dirty",true),this.initDimensions(),this.setCoords();const e=this.fromStringToGraphemeSelection(t.selectionStart,t.selectionEnd,t.value);this.selectionEnd=this.selectionStart=e.selectionEnd,this.inCompositionMode||(this.selectionStart=e.selectionStart),this.updateTextareaPosition();}updateTextareaPosition(){if(this.selectionStart===this.selectionEnd){const t=this._calcTextareaPosition();this.hiddenTextarea.style.left=t.left,this.hiddenTextarea.style.top=t.top;}}_calcTextareaPosition(){if(!this.canvas)return {left:"1px",top:"1px"};const t=this.inCompositionMode?this.compositionStart:this.selectionStart,e=this._getCursorBoundaries(t),s=this.get2DCursorLocation(t),i=s.lineIndex,r=s.charIndex,n=this.getValueOfPropertyAt(i,r,"fontSize")*this.lineHeight,o=e.leftOffset,a=this.getCanvasRetinaScaling(),h=this.canvas.upperCanvasEl,c=h.width/a,l=h.height/a,u=c-n,d=l-n,g=new ot(e.left+o,e.top+e.topOffset+n).transform(this.calcTransformMatrix()).transform(this.canvas.viewportTransform).multiply(new ot(h.clientWidth/c,h.clientHeight/l));return g.x<0&&(g.x=0),g.x>u&&(g.x=u),g.y<0&&(g.y=0),g.y>d&&(g.y=d),g.x+=this.canvas._offset.left,g.y+=this.canvas._offset.top,{left:"".concat(g.x,"px"),top:"".concat(g.y,"px"),fontSize:"".concat(n,"px"),charHeight:n}}_saveEditingProps(){this._savedProps={hasControls:this.hasControls,borderColor:this.borderColor,lockMovementX:this.lockMovementX,lockMovementY:this.lockMovementY,hoverCursor:this.hoverCursor,selectable:this.selectable,defaultCursor:this.canvas&&this.canvas.defaultCursor,moveCursor:this.canvas&&this.canvas.moveCursor};}_restoreEditingProps(){this._savedProps&&(this.hoverCursor=this._savedProps.hoverCursor,this.hasControls=this._savedProps.hasControls,this.borderColor=this._savedProps.borderColor,this.selectable=this._savedProps.selectable,this.lockMovementX=this._savedProps.lockMovementX,this.lockMovementY=this._savedProps.lockMovementY,this.canvas&&(this.canvas.defaultCursor=this._savedProps.defaultCursor||this.canvas.defaultCursor,this.canvas.moveCursor=this._savedProps.moveCursor||this.canvas.moveCursor),delete this._savedProps);}_exitEditing(){const t=this.hiddenTextarea;this.selected=false,this.isEditing=false,t&&(t.blur&&t.blur(),t.parentNode&&t.parentNode.removeChild(t)),this.hiddenTextarea=null,this.abortCursorAnimation(),this.selectionStart!==this.selectionEnd&&this.clearContextTop();}exitEditingImpl(){this._exitEditing(),this.selectionEnd=this.selectionStart,this._restoreEditingProps(),this._forceClearCache&&(this.initDimensions(),this.setCoords());}exitEditing(){const t=this._textBeforeEdit!==this.text;return this.exitEditingImpl(),this.fire("editing:exited"),t&&this.fire(Q),this.canvas&&(this.canvas.fire("text:editing:exited",{target:this}),t&&this.canvas.fire("object:modified",{target:this})),this}_removeExtraneousStyles(){for(const t in this.styles)this._textLines[t]||delete this.styles[t];}removeStyleFromTo(t,e){const{lineIndex:s,charIndex:i}=this.get2DCursorLocation(t,true),{lineIndex:r,charIndex:n}=this.get2DCursorLocation(e,true);if(s!==r){if(this.styles[s])for(let t=i;t<this._unwrappedTextLines[s].length;t++)delete this.styles[s][t];if(this.styles[r])for(let t=n;t<this._unwrappedTextLines[r].length;t++){const e=this.styles[r][t];e&&(this.styles[s]||(this.styles[s]={}),this.styles[s][i+t-n]=e);}for(let t=s+1;t<=r;t++)delete this.styles[t];this.shiftLineStyles(r,s-r);}else if(this.styles[s]){const t=this.styles[s],e=n-i;for(let e=i;e<n;e++)delete t[e];for(const i in this.styles[s]){const s=parseInt(i,10);s>=n&&(t[s-e]=t[i],delete t[i]);}}}shiftLineStyles(t,e){const s=Object.assign({},this.styles);for(const i in this.styles){const r=parseInt(i,10);r>t&&(this.styles[r+e]=s[r],s[r-e]||delete this.styles[r]);}}insertNewlineStyleObject(t,e,i,r){const n={},o=this._unwrappedTextLines[t].length,a=o===e;let h=false;i||(i=1),this.shiftLineStyles(t,i);const c=this.styles[t]?this.styles[t][0===e?e:e-1]:void 0;for(const s in this.styles[t]){const i=parseInt(s,10);i>=e&&(h=true,n[i-e]=this.styles[t][s],a&&0===e||delete this.styles[t][s]);}let l=false;for(h&&!a&&(this.styles[t+i]=n,l=true),(l||o>e)&&i--;i>0;)r&&r[i-1]?this.styles[t+i]={0:s({},r[i-1])}:c?this.styles[t+i]={0:s({},c)}:delete this.styles[t+i],i--;this._forceClearCache=true;}insertCharStyleObject(t,e,i,r){this.styles||(this.styles={});const n=this.styles[t],o=n?s({},n):{};i||(i=1);for(const t in o){const s=parseInt(t,10);s>=e&&(n[s+i]=o[s],o[s-i]||delete n[s]);}if(this._forceClearCache=true,r){for(;i--;)Object.keys(r[i]).length&&(this.styles[t]||(this.styles[t]={}),this.styles[t][e+i]=s({},r[i]));return}if(!n)return;const a=n[e?e-1:1];for(;a&&i--;)this.styles[t][e+i]=s({},a);}insertNewStyleBlock(t,e,s){const i=this.get2DCursorLocation(e,true),r=[0];let n,o=0;for(let e=0;e<t.length;e++)"\n"===t[e]?(o++,r[o]=0):r[o]++;for(r[0]>0&&(this.insertCharStyleObject(i.lineIndex,i.charIndex,r[0],s),s=s&&s.slice(r[0]+1)),o&&this.insertNewlineStyleObject(i.lineIndex,i.charIndex+r[0],o),n=1;n<o;n++)r[n]>0?this.insertCharStyleObject(i.lineIndex+n,0,r[n],s):s&&this.styles[i.lineIndex+n]&&s[0]&&(this.styles[i.lineIndex+n][0]=s[0]),s=s&&s.slice(r[n]+1);r[n]>0&&this.insertCharStyleObject(i.lineIndex+n,0,r[n],s);}removeChars(t){let e=arguments.length>1&&void 0!==arguments[1]?arguments[1]:t+1;this.removeStyleFromTo(t,e),this._text.splice(t,e-t),this.text=this._text.join(""),this.set("dirty",true),this.initDimensions(),this.setCoords(),this._removeExtraneousStyles();}insertChars(t,e,s){let i=arguments.length>3&&void 0!==arguments[3]?arguments[3]:s;i>s&&this.removeStyleFromTo(s,i);const r=this.graphemeSplit(t);this.insertNewStyleBlock(r,s,e),this._text=[...this._text.slice(0,s),...r,...this._text.slice(i)],this.text=this._text.join(""),this.set("dirty",true),this.initDimensions(),this.setCoords(),this._removeExtraneousStyles();}setSelectionStartEndWithShift(t,e,s){s<=t?(e===t?this._selectionDirection=M:this._selectionDirection===A&&(this._selectionDirection=M,this.selectionEnd=t),this.selectionStart=s):s>t&&s<e?this._selectionDirection===A?this.selectionEnd=s:this.selectionStart=s:(e===t?this._selectionDirection=A:this._selectionDirection===M&&(this._selectionDirection=A,this.selectionStart=e),this.selectionEnd=s);}}class Ro extends Lo{initHiddenTextarea(){const t=this.canvas&&Kt(this.canvas.getElement())||m(),e=t.createElement("textarea");Object.entries({autocapitalize:"off",autocorrect:"off",autocomplete:"off",spellcheck:"false","data-fabric":"textarea",wrap:"off",name:"fabricTextarea"}).map((t=>{let[s,i]=t;return e.setAttribute(s,i)}));const{top:s,left:i,fontSize:r}=this._calcTextareaPosition();e.style.cssText="position: absolute; top: ".concat(s,"; left: ").concat(i,"; z-index: -999; opacity: 0; width: 1px; height: 1px; font-size: 1px; padding-top: ").concat(r,";"),(this.hiddenTextareaContainer||t.body).appendChild(e),Object.entries({blur:"blur",keydown:"onKeyDown",keyup:"onKeyUp",input:"onInput",copy:"copy",cut:"copy",paste:"paste",compositionstart:"onCompositionStart",compositionupdate:"onCompositionUpdate",compositionend:"onCompositionEnd"}).map((t=>{let[s,i]=t;return e.addEventListener(s,this[i].bind(this))})),this.hiddenTextarea=e;}blur(){this.abortCursorAnimation();}onKeyDown(t){if(!this.isEditing)return;const e="rtl"===this.direction?this.keysMapRtl:this.keysMap;if(t.keyCode in e)this[e[t.keyCode]](t);else {if(!(t.keyCode in this.ctrlKeysMapDown)||!t.ctrlKey&&!t.metaKey)return;this[this.ctrlKeysMapDown[t.keyCode]](t);}t.stopImmediatePropagation(),t.preventDefault(),t.keyCode>=33&&t.keyCode<=40?(this.inCompositionMode=false,this.clearContextTop(),this.renderCursorOrSelection()):this.canvas&&this.canvas.requestRenderAll();}onKeyUp(t){!this.isEditing||this._copyDone||this.inCompositionMode?this._copyDone=false:t.keyCode in this.ctrlKeysMapUp&&(t.ctrlKey||t.metaKey)&&(this[this.ctrlKeysMapUp[t.keyCode]](t),t.stopImmediatePropagation(),t.preventDefault(),this.canvas&&this.canvas.requestRenderAll());}onInput(t){const e=this.fromPaste,{value:s,selectionStart:i,selectionEnd:r}=this.hiddenTextarea;if(this.fromPaste=false,t&&t.stopPropagation(),!this.isEditing)return;const n=()=>{this.updateFromTextArea(),this.fire(z),this.canvas&&(this.canvas.fire("text:changed",{target:this}),this.canvas.requestRenderAll());};if(""===this.hiddenTextarea.value)return this.styles={},void n();const a=this._splitTextIntoLines(s).graphemeText,h=this._text.length,c=a.length,l=this.selectionStart,u=this.selectionEnd,d=l!==u;let g,f,m,v,y=c-h;const _=this.fromStringToGraphemeSelection(i,r,s),x=l>_.selectionStart;d?(f=this._text.slice(l,u),y+=u-l):c<h&&(f=x?this._text.slice(u+y,u):this._text.slice(l,l-y));const C=a.slice(_.selectionEnd-y,_.selectionEnd);if(f&&f.length&&(C.length&&(g=this.getSelectionStyles(l,l+1,false),g=C.map((()=>g[0]))),d?(m=l,v=u):x?(m=u-f.length,v=u):(m=u,v=u+f.length),this.removeStyleFromTo(m,v)),C.length){const{copyPasteData:t}=p();e&&C.join("")===t.copiedText&&!o.disableStyleCopyPaste&&(g=t.copiedTextStyle),this.insertNewStyleBlock(C,l,g);}n();}onCompositionStart(){this.inCompositionMode=true;}onCompositionEnd(){this.inCompositionMode=false;}onCompositionUpdate(t){let{target:e}=t;const{selectionStart:s,selectionEnd:i}=e;this.compositionStart=s,this.compositionEnd=i,this.updateTextareaPosition();}copy(){if(this.selectionStart===this.selectionEnd)return;const{copyPasteData:t}=p();t.copiedText=this.getSelectedText(),o.disableStyleCopyPaste?t.copiedTextStyle=void 0:t.copiedTextStyle=this.getSelectionStyles(this.selectionStart,this.selectionEnd,true),this._copyDone=true;}paste(){this.fromPaste=true;}_getWidthBeforeCursor(t,e){let s,i=this._getLineLeftOffset(t);return e>0&&(s=this.__charBounds[t][e-1],i+=s.left+s.width),i}getDownCursorOffset(t,e){const s=this._getSelectionForOffset(t,e),i=this.get2DCursorLocation(s),r=i.lineIndex;if(r===this._textLines.length-1||t.metaKey||34===t.keyCode)return this._text.length-s;const n=i.charIndex,o=this._getWidthBeforeCursor(r,n),a=this._getIndexOnLine(r+1,o);return this._textLines[r].slice(n).length+a+1+this.missingNewlineOffset(r)}_getSelectionForOffset(t,e){return t.shiftKey&&this.selectionStart!==this.selectionEnd&&e?this.selectionEnd:this.selectionStart}getUpCursorOffset(t,e){const s=this._getSelectionForOffset(t,e),i=this.get2DCursorLocation(s),r=i.lineIndex;if(0===r||t.metaKey||33===t.keyCode)return -s;const n=i.charIndex,o=this._getWidthBeforeCursor(r,n),a=this._getIndexOnLine(r-1,o),h=this._textLines[r].slice(0,n),c=this.missingNewlineOffset(r-1);return -this._textLines[r-1].length+a-h.length+(1-c)}_getIndexOnLine(t,e){const s=this._textLines[t];let i,r,n=this._getLineLeftOffset(t),o=0;for(let a=0,h=s.length;a<h;a++)if(i=this.__charBounds[t][a].width,n+=i,n>e){r=true;const t=n-i,s=n,h=Math.abs(t-e);o=Math.abs(s-e)<h?a:a-1;break}return r||(o=s.length-1),o}moveCursorDown(t){this.selectionStart>=this._text.length&&this.selectionEnd>=this._text.length||this._moveCursorUpOrDown("Down",t);}moveCursorUp(t){0===this.selectionStart&&0===this.selectionEnd||this._moveCursorUpOrDown("Up",t);}_moveCursorUpOrDown(t,e){const s=this["get".concat(t,"CursorOffset")](e,this._selectionDirection===A);if(e.shiftKey?this.moveCursorWithShift(s):this.moveCursorWithoutShift(s),0!==s){const t=this.text.length;this.selectionStart=Ms(0,this.selectionStart,t),this.selectionEnd=Ms(0,this.selectionEnd,t),this.abortCursorAnimation(),this.initDelayedCursor(),this._fireSelectionChanged(),this._updateTextarea();}}moveCursorWithShift(t){const e=this._selectionDirection===M?this.selectionStart+t:this.selectionEnd+t;return this.setSelectionStartEndWithShift(this.selectionStart,this.selectionEnd,e),0!==t}moveCursorWithoutShift(t){return t<0?(this.selectionStart+=t,this.selectionEnd=this.selectionStart):(this.selectionEnd+=t,this.selectionStart=this.selectionEnd),0!==t}moveCursorLeft(t){0===this.selectionStart&&0===this.selectionEnd||this._moveCursorLeftOrRight("Left",t);}_move(t,e,s){let i;if(t.altKey)i=this["findWordBoundary".concat(s)](this[e]);else {if(!t.metaKey&&35!==t.keyCode&&36!==t.keyCode)return this[e]+="Left"===s?-1:1,true;i=this["findLineBoundary".concat(s)](this[e]);}return void 0!==i&&this[e]!==i&&(this[e]=i,true)}_moveLeft(t,e){return this._move(t,e,"Left")}_moveRight(t,e){return this._move(t,e,"Right")}moveCursorLeftWithoutShift(t){let e=true;return this._selectionDirection=M,this.selectionEnd===this.selectionStart&&0!==this.selectionStart&&(e=this._moveLeft(t,"selectionStart")),this.selectionEnd=this.selectionStart,e}moveCursorLeftWithShift(t){return this._selectionDirection===A&&this.selectionStart!==this.selectionEnd?this._moveLeft(t,"selectionEnd"):0!==this.selectionStart?(this._selectionDirection=M,this._moveLeft(t,"selectionStart")):void 0}moveCursorRight(t){this.selectionStart>=this._text.length&&this.selectionEnd>=this._text.length||this._moveCursorLeftOrRight("Right",t);}_moveCursorLeftOrRight(t,e){const s="moveCursor".concat(t).concat(e.shiftKey?"WithShift":"WithoutShift");this._currentCursorOpacity=1,this[s](e)&&(this.abortCursorAnimation(),this.initDelayedCursor(),this._fireSelectionChanged(),this._updateTextarea());}moveCursorRightWithShift(t){return this._selectionDirection===M&&this.selectionStart!==this.selectionEnd?this._moveRight(t,"selectionStart"):this.selectionEnd!==this._text.length?(this._selectionDirection=A,this._moveRight(t,"selectionEnd")):void 0}moveCursorRightWithoutShift(t){let e=true;return this._selectionDirection=A,this.selectionStart===this.selectionEnd?(e=this._moveRight(t,"selectionStart"),this.selectionEnd=this.selectionStart):this.selectionStart=this.selectionEnd,e}}const Io=t=>!!t.button;class Bo extends Ro{constructor(){super(...arguments),t(this,"draggableTextDelegate",void 0);}initBehavior(){this.on("mousedown",this._mouseDownHandler),this.on("mouseup",this.mouseUpHandler),this.on("mousedblclick",this.doubleClickHandler),this.on("mousetripleclick",this.tripleClickHandler),this.draggableTextDelegate=new jo(this),super.initBehavior();}shouldStartDragging(){return this.draggableTextDelegate.isActive()}onDragStart(t){return this.draggableTextDelegate.onDragStart(t)}canDrop(t){return this.draggableTextDelegate.canDrop(t)}doubleClickHandler(t){this.isEditing&&(this.selectWord(this.getSelectionStartFromPointer(t.e)),this.renderCursorOrSelection());}tripleClickHandler(t){this.isEditing&&(this.selectLine(this.getSelectionStartFromPointer(t.e)),this.renderCursorOrSelection());}_mouseDownHandler(t){let{e:e,alreadySelected:s}=t;this.canvas&&this.editable&&!Io(e)&&!this.getActiveControl()&&(this.draggableTextDelegate.start(e)||(this.canvas.textEditingManager.register(this),s&&(this.inCompositionMode=false,this.setCursorByClick(e)),this.isEditing&&(this.__selectionStartOnMouseDown=this.selectionStart,this.selectionStart===this.selectionEnd&&this.abortCursorAnimation(),this.renderCursorOrSelection()),this.selected||(this.selected=s||this.isEditing)));}mouseUpHandler(t){let{e:e,transform:s}=t;const i=this.draggableTextDelegate.end(e);if(this.canvas){this.canvas.textEditingManager.unregister(this);const t=this.canvas._activeObject;if(t&&t!==this)return}!this.editable||this.group&&!this.group.interactive||s&&s.actionPerformed||Io(e)||i||this.selected&&!this.getActiveControl()&&(this.enterEditing(e),this.selectionStart===this.selectionEnd?this.initDelayedCursor(true):this.renderCursorOrSelection());}setCursorByClick(t){const e=this.getSelectionStartFromPointer(t),s=this.selectionStart,i=this.selectionEnd;t.shiftKey?this.setSelectionStartEndWithShift(s,i,e):(this.selectionStart=e,this.selectionEnd=e),this.isEditing&&(this._fireSelectionChanged(),this._updateTextarea());}getSelectionStartFromPointer(t){const e=this.canvas.getScenePoint(t).transform(wt(this.calcTransformMatrix())).add(new ot(-this._getLeftOffset(),-this._getTopOffset()));let s=0,i=0,r=0;for(let t=0;t<this._textLines.length&&s<=e.y;t++)s+=this.getHeightOfLine(t),r=t,t>0&&(i+=this._textLines[t-1].length+this.missingNewlineOffset(t-1));let n=Math.abs(this._getLineLeftOffset(r));const o=this._textLines[r].length,a=this.__charBounds[r];for(let t=0;t<o;t++){const s=n+a[t].kernedWidth;if(e.x<=s){Math.abs(e.x-s)<=Math.abs(e.x-n)&&i++;break}n=s,i++;}return Math.min(this.flipX?o-i:i,this._text.length)}}const Xo="moveCursorUp",Yo="moveCursorDown",Wo="moveCursorLeft",Vo="moveCursorRight",zo="exitEditing",Go=(t,e)=>{const s=e.getRetinaScaling();t.setTransform(s,0,0,s,0,0);const i=e.viewportTransform;t.transform(i[0],i[1],i[2],i[3],i[4],i[5]);},Ho=s({selectionStart:0,selectionEnd:0,selectionColor:"rgba(17,119,255,0.3)",isEditing:false,editable:true,editingBorderColor:"rgba(102,153,255,0.25)",cursorWidth:2,cursorColor:"",cursorDelay:1e3,cursorDuration:600,caching:true,hiddenTextareaContainer:null,keysMap:{9:zo,27:zo,33:Xo,34:Yo,35:Vo,36:Wo,37:Wo,38:Xo,39:Vo,40:Yo},keysMapRtl:{9:zo,27:zo,33:Xo,34:Yo,35:Wo,36:Vo,37:Vo,38:Xo,39:Wo,40:Yo},ctrlKeysMapDown:{65:"cmdAll"},ctrlKeysMapUp:{67:"copy",88:"cut"}},{_selectionDirection:null,_reSpace:/\s|\r?\n/,inCompositionMode:false});class No extends Bo{static getDefaults(){return s(s({},super.getDefaults()),No.ownDefaults)}get type(){const t=super.type;return "itext"===t?"i-text":t}constructor(t,e){super(t,s(s({},No.ownDefaults),e)),this.initBehavior();}_set(t,e){return this.isEditing&&this._savedProps&&t in this._savedProps?(this._savedProps[t]=e,this):("canvas"===t&&(this.canvas instanceof Xn&&this.canvas.textEditingManager.remove(this),e instanceof Xn&&e.textEditingManager.add(this)),super._set(t,e))}setSelectionStart(t){t=Math.max(t,0),this._updateAndFire("selectionStart",t);}setSelectionEnd(t){t=Math.min(t,this.text.length),this._updateAndFire("selectionEnd",t);}_updateAndFire(t,e){this[t]!==e&&(this._fireSelectionChanged(),this[t]=e),this._updateTextarea();}_fireSelectionChanged(){this.fire("selection:changed"),this.canvas&&this.canvas.fire("text:selection:changed",{target:this});}initDimensions(){this.isEditing&&this.initDelayedCursor(),super.initDimensions();}getSelectionStyles(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:this.selectionStart||0,e=arguments.length>1&&void 0!==arguments[1]?arguments[1]:this.selectionEnd,s=arguments.length>2?arguments[2]:void 0;return super.getSelectionStyles(t,e,s)}setSelectionStyles(t){let e=arguments.length>1&&void 0!==arguments[1]?arguments[1]:this.selectionStart||0,s=arguments.length>2&&void 0!==arguments[2]?arguments[2]:this.selectionEnd;return super.setSelectionStyles(t,e,s)}get2DCursorLocation(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:this.selectionStart,e=arguments.length>1?arguments[1]:void 0;return super.get2DCursorLocation(t,e)}render(t){super.render(t),this.cursorOffsetCache={},this.renderCursorOrSelection();}toCanvasElement(t){const e=this.isEditing;this.isEditing=false;const s=super.toCanvasElement(t);return this.isEditing=e,s}renderCursorOrSelection(){if(!this.isEditing||!this.canvas)return;const t=this.clearContextTop(true);if(!t)return;const e=this._getCursorBoundaries(),s=this.findAncestorsWithClipPath(),i=s.length>0;let r,n=t;if(i){r=vt(t.canvas),n=r.getContext("2d"),Go(n,this.canvas);const e=this.calcTransformMatrix();n.transform(e[0],e[1],e[2],e[3],e[4],e[5]);}if(this.selectionStart!==this.selectionEnd||this.inCompositionMode?this.renderSelection(n,e):this.renderCursor(n,e),i)for(const e of s){const s=e.clipPath,i=vt(t.canvas),r=i.getContext("2d");if(Go(r,this.canvas),!s.absolutePositioned){const t=e.calcTransformMatrix();r.transform(t[0],t[1],t[2],t[3],t[4],t[5]);}s.transform(r),s.drawObject(r,true,{}),this.drawClipPathOnCache(n,s,i);}i&&(t.setTransform(1,0,0,1,0,0),t.drawImage(r,0,0)),this.canvas.contextTopDirty=true,t.restore();}findAncestorsWithClipPath(){const t=[];let e=this;for(;e;)e.clipPath&&t.push(e),e=e.parent;return t}_getCursorBoundaries(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:this.selectionStart,e=arguments.length>1?arguments[1]:void 0;const s=this._getLeftOffset(),i=this._getTopOffset(),r=this._getCursorBoundariesOffsets(t,e);return {left:s,top:i,leftOffset:r.left,topOffset:r.top}}_getCursorBoundariesOffsets(t,e){return e?this.__getCursorBoundariesOffsets(t):this.cursorOffsetCache&&"top"in this.cursorOffsetCache?this.cursorOffsetCache:this.cursorOffsetCache=this.__getCursorBoundariesOffsets(t)}__getCursorBoundariesOffsets(t){let e=0,s=0;const{charIndex:i,lineIndex:r}=this.get2DCursorLocation(t);for(let t=0;t<r;t++)e+=this.getHeightOfLine(t);const n=this._getLineLeftOffset(r),o=this.__charBounds[r][i];o&&(s=o.left),0!==this.charSpacing&&i===this._textLines[r].length&&(s-=this._getWidthOfCharSpacing());const a={top:e,left:n+(s>0?s:0)};return "rtl"===this.direction&&(this.textAlign===A||this.textAlign===Je||this.textAlign===Ze?a.left*=-1:this.textAlign===M||this.textAlign===Qe?a.left=n-(s>0?s:0):this.textAlign!==D&&this.textAlign!==$e||(a.left=n-(s>0?s:0))),a}renderCursorAt(t){this._renderCursor(this.canvas.contextTop,this._getCursorBoundaries(t,true),t);}renderCursor(t,e){this._renderCursor(t,e,this.selectionStart);}getCursorRenderingData(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:this.selectionStart,e=arguments.length>1&&void 0!==arguments[1]?arguments[1]:this._getCursorBoundaries(t);const s=this.get2DCursorLocation(t),i=s.lineIndex,r=s.charIndex>0?s.charIndex-1:0,n=this.getValueOfPropertyAt(i,r,"fontSize"),o=this.getObjectScaling().x*this.canvas.getZoom(),a=this.cursorWidth/o,h=this.getValueOfPropertyAt(i,r,"deltaY"),c=e.topOffset+(1-this._fontSizeFraction)*this.getHeightOfLine(i)/this.lineHeight-n*(1-this._fontSizeFraction);return {color:this.cursorColor||this.getValueOfPropertyAt(i,r,"fill"),opacity:this._currentCursorOpacity,left:e.left+e.leftOffset-a/2,top:c+e.top+h,width:a,height:n}}_renderCursor(t,e,s){const{color:i,opacity:r,left:n,top:o,width:a,height:h}=this.getCursorRenderingData(s,e);t.fillStyle=i,t.globalAlpha=r,t.fillRect(n,o,a,h);}renderSelection(t,e){const s={selectionStart:this.inCompositionMode?this.hiddenTextarea.selectionStart:this.selectionStart,selectionEnd:this.inCompositionMode?this.hiddenTextarea.selectionEnd:this.selectionEnd};this._renderSelection(t,s,e);}renderDragSourceEffect(){const t=this.draggableTextDelegate.getDragStartSelection();this._renderSelection(this.canvas.contextTop,t,this._getCursorBoundaries(t.selectionStart,true));}renderDropTargetEffect(t){const e=this.getSelectionStartFromPointer(t);this.renderCursorAt(e);}_renderSelection(t,e,s){const i=e.selectionStart,r=e.selectionEnd,n=this.textAlign.includes(Je),o=this.get2DCursorLocation(i),a=this.get2DCursorLocation(r),h=o.lineIndex,c=a.lineIndex,l=o.charIndex<0?0:o.charIndex,u=a.charIndex<0?0:a.charIndex;for(let e=h;e<=c;e++){const i=this._getLineLeftOffset(e)||0;let r=this.getHeightOfLine(e),o=0,a=0,d=0;if(e===h&&(a=this.__charBounds[h][l].left),e>=h&&e<c)d=n&&!this.isEndOfWrapping(e)?this.width:this.getLineWidth(e)||5;else if(e===c)if(0===u)d=this.__charBounds[c][u].left;else {const t=this._getWidthOfCharSpacing();d=this.__charBounds[c][u-1].left+this.__charBounds[c][u-1].width-t;}o=r,(this.lineHeight<1||e===c&&this.lineHeight>1)&&(r/=this.lineHeight);let g=s.left+i+a,f=r,p=0;const m=d-a;this.inCompositionMode?(t.fillStyle=this.compositionColor||"black",f=1,p=r):t.fillStyle=this.selectionColor,"rtl"===this.direction&&(this.textAlign===A||this.textAlign===Je||this.textAlign===Ze?g=this.width-g-m:this.textAlign===M||this.textAlign===Qe?g=s.left+i-d:this.textAlign!==D&&this.textAlign!==$e||(g=s.left+i-d)),t.fillRect(g,s.top+s.topOffset+p,m,f),s.topOffset+=o;}}getCurrentCharFontSize(){const t=this._getCurrentCharIndex();return this.getValueOfPropertyAt(t.l,t.c,"fontSize")}getCurrentCharColor(){const t=this._getCurrentCharIndex();return this.getValueOfPropertyAt(t.l,t.c,K)}_getCurrentCharIndex(){const t=this.get2DCursorLocation(this.selectionStart,true),e=t.charIndex>0?t.charIndex-1:0;return {l:t.lineIndex,c:e}}dispose(){this.exitEditingImpl(),this.draggableTextDelegate.dispose(),super.dispose();}}t(No,"ownDefaults",Ho),t(No,"type","IText"),tt.setClass(No),tt.setClass(No,"i-text");class Uo extends No{static getDefaults(){return s(s({},super.getDefaults()),Uo.ownDefaults)}constructor(t,e){super(t,s(s({},Uo.ownDefaults),e));}static createControls(){return {controls:Ai()}}initDimensions(){this.initialized&&(this.isEditing&&this.initDelayedCursor(),this._clearCache(),this.dynamicMinWidth=0,this._styleMap=this._generateStyleMap(this._splitText()),this.dynamicMinWidth>this.width&&this._set("width",this.dynamicMinWidth),this.textAlign.includes(Je)&&this.enlargeSpaces(),this.height=this.calcTextHeight());}_generateStyleMap(t){let e=0,s=0,i=0;const r={};for(let n=0;n<t.graphemeLines.length;n++)"\n"===t.graphemeText[i]&&n>0?(s=0,i++,e++):!this.splitByGrapheme&&this._reSpaceAndTab.test(t.graphemeText[i])&&n>0&&(s++,i++),r[n]={line:e,offset:s},i+=t.graphemeLines[n].length,s+=t.graphemeLines[n].length;return r}styleHas(t,e){if(this._styleMap&&!this.isWrapping){const t=this._styleMap[e];t&&(e=t.line);}return super.styleHas(t,e)}isEmptyStyles(t){if(!this.styles)return  true;let e,s=0,i=t+1,r=false;const n=this._styleMap[t],o=this._styleMap[t+1];n&&(t=n.line,s=n.offset),o&&(i=o.line,r=i===t,e=o.offset);const a=void 0===t?this.styles:{line:this.styles[t]};for(const t in a)for(const i in a[t]){const n=parseInt(i,10);if(n>=s&&(!r||n<e))for(const e in a[t][i])return  false}return  true}_getStyleDeclaration(t,e){if(this._styleMap&&!this.isWrapping){const s=this._styleMap[t];if(!s)return {};t=s.line,e=s.offset+e;}return super._getStyleDeclaration(t,e)}_setStyleDeclaration(t,e,s){const i=this._styleMap[t];super._setStyleDeclaration(i.line,i.offset+e,s);}_deleteStyleDeclaration(t,e){const s=this._styleMap[t];super._deleteStyleDeclaration(s.line,s.offset+e);}_getLineStyle(t){const e=this._styleMap[t];return !!this.styles[e.line]}_setLineStyle(t){const e=this._styleMap[t];super._setLineStyle(e.line);}_wrapText(t,e){this.isWrapping=true;const s=this.getGraphemeDataForRender(t),i=[];for(let t=0;t<s.wordsData.length;t++)i.push(...this._wrapLine(t,e,s));return this.isWrapping=false,i}getGraphemeDataForRender(t){const e=this.splitByGrapheme,s=e?"":" ";let i=0;return {wordsData:t.map(((t,r)=>{let n=0;const o=e?this.graphemeSplit(t):this.wordSplit(t);return 0===o.length?[{word:[],width:0}]:o.map((t=>{const o=e?[t]:this.graphemeSplit(t),a=this._measureWord(o,r,n);return i=Math.max(a,i),n+=o.length+s.length,{word:o,width:a}}))})),largestWordWidth:i}}_measureWord(t,e){let s,i=arguments.length>2&&void 0!==arguments[2]?arguments[2]:0,r=0;for(let n=0,o=t.length;n<o;n++){r+=this._getGraphemeBox(t[n],e,n+i,s,true).kernedWidth,s=t[n];}return r}wordSplit(t){return t.split(this._wordJoiners)}_wrapLine(t,e,s){let{largestWordWidth:i,wordsData:r}=s,n=arguments.length>3&&void 0!==arguments[3]?arguments[3]:0;const o=this._getWidthOfCharSpacing(),a=this.splitByGrapheme,h=[],c=a?"":" ";let l=0,u=[],d=0,g=0,f=true;e-=n;const p=Math.max(e,i,this.dynamicMinWidth),m=r[t];let v;for(d=0,v=0;v<m.length;v++){const{word:e,width:s}=m[v];d+=e.length,l+=g+s-o,l>p&&!f?(h.push(u),u=[],l=s,f=true):l+=o,f||a||u.push(c),u=u.concat(e),g=a?0:this._measureWord([c],t,d),d++,f=false;}return v&&h.push(u),i+n>this.dynamicMinWidth&&(this.dynamicMinWidth=i-o+n),h}isEndOfWrapping(t){return !this._styleMap[t+1]||this._styleMap[t+1].line!==this._styleMap[t].line}missingNewlineOffset(t,e){return this.splitByGrapheme&&!e?this.isEndOfWrapping(t)?1:0:1}_splitTextIntoLines(t){const e=super._splitTextIntoLines(t),s=this._wrapText(e.lines,this.width),i=new Array(s.length);for(let t=0;t<s.length;t++)i[t]=s[t].join("");return e.lines=i,e.graphemeLines=s,e}getMinWidth(){return Math.max(this.minWidth,this.dynamicMinWidth)}_removeExtraneousStyles(){const t=new Map;for(const e in this._styleMap){const s=parseInt(e,10);if(this._textLines[s]){const s=this._styleMap[e].line;t.set("".concat(s),true);}}for(const e in this.styles)t.has(e)||delete this.styles[e];}toObject(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:[];return super.toObject(["minWidth","splitByGrapheme",...t])}}t(Uo,"type","Textbox"),t(Uo,"textLayoutProperties",[...No.textLayoutProperties,"width"]),t(Uo,"ownDefaults",{minWidth:20,dynamicMinWidth:2,lockScalingFlip:true,noScaleCache:false,_wordJoiners:/[ \t\r]/,splitByGrapheme:false}),tt.setClass(Uo);class qo extends Xr{shouldPerformLayout(t){return !!t.target.clipPath&&super.shouldPerformLayout(t)}shouldLayoutClipPath(){return  false}calcLayoutResult(t,e){const{target:s}=t,{clipPath:i,group:r}=s;if(!i||!this.shouldPerformLayout(t))return;const{width:n,height:o}=he(Br(s,i)),a=new ot(n,o);if(i.absolutePositioned){return {center:me(i.getRelativeCenterPoint(),void 0,r?r.calcTransformMatrix():void 0),size:a}}{const r=i.getRelativeCenterPoint().transform(s.calcOwnMatrix(),true);if(this.shouldPerformLayout(t)){const{center:s=new ot,correction:i=new ot}=this.calcBoundingBox(e,t)||{};return {center:s.add(r),correction:i.subtract(r),size:a}}return {center:s.getRelativeCenterPoint().add(r),size:a}}}}t(qo,"type","clip-path"),tt.setClass(qo);class Ko extends Xr{getInitialSize(t,e){let{target:s}=t,{size:i}=e;return new ot(s.width||i.x,s.height||i.y)}}t(Ko,"type","fixed"),tt.setClass(Ko);class Jo extends Gr{subscribeTargets(t){const e=t.target;t.targets.reduce(((t,e)=>(e.parent&&t.add(e.parent),t)),new Set).forEach((t=>{t.layoutManager.subscribeTargets({target:t,targets:[e]});}));}unsubscribeTargets(t){const e=t.target,s=e.getObjects();t.targets.reduce(((t,e)=>(e.parent&&t.add(e.parent),t)),new Set).forEach((t=>{!s.some((e=>e.parent===t))&&t.layoutManager.unsubscribeTargets({target:t,targets:[e]});}));}}class Qo extends Ur{static getDefaults(){return s(s({},super.getDefaults()),Qo.ownDefaults)}constructor(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:[],e=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{};super(),Object.assign(this,Qo.ownDefaults),this.setOptions(e);const{left:s,top:i,layoutManager:r}=e;this.groupInit(t,{left:s,top:i,layoutManager:null!=r?r:new Jo});}_shouldSetNestedCoords(){return  true}__objectSelectionMonitor(){}multiSelectAdd(){for(var t=arguments.length,e=new Array(t),s=0;s<t;s++)e[s]=arguments[s];"selection-order"===this.multiSelectionStacking?this.add(...e):e.forEach((t=>{const e=this._objects.findIndex((e=>e.isInFrontOf(t))),s=-1===e?this.size():e;this.insertAt(s,t);}));}canEnterGroup(t){return this.getObjects().some((e=>e.isDescendantOf(t)||t.isDescendantOf(e)))?(a("error","ActiveSelection: circular object trees are not supported, this call has no effect"),false):super.canEnterGroup(t)}enterGroup(t,e){t.parent&&t.parent===t.group?t.parent._exitGroup(t):t.group&&t.parent!==t.group&&t.group.remove(t),this._enterGroup(t,e);}exitGroup(t,e){this._exitGroup(t,e),t.parent&&t.parent._enterGroup(t,true);}_onAfterObjectsChange(t,e){super._onAfterObjectsChange(t,e);const s=new Set;e.forEach((t=>{const{parent:e}=t;e&&s.add(e);})),t===Rr?s.forEach((t=>{t._onAfterObjectsChange(Lr,e);})):s.forEach((t=>{t._set("dirty",true);}));}onDeselect(){return this.removeAll(),false}toString(){return "#<ActiveSelection: (".concat(this.complexity(),")>")}shouldCache(){return  false}isOnACache(){return  false}_renderControls(t,e,i){t.save(),t.globalAlpha=this.isMoving?this.borderOpacityWhenMoving:1;const r=s(s({hasControls:false},i),{},{forActiveSelection:true});for(let e=0;e<this._objects.length;e++)this._objects[e]._renderControls(t,r);super._renderControls(t,e),t.restore();}}t(Qo,"type","ActiveSelection"),t(Qo,"ownDefaults",{multiSelectionStacking:"canvas-stacking"}),tt.setClass(Qo),tt.setClass(Qo,"activeSelection");class Zo{constructor(){t(this,"resources",{});}applyFilters(t,e,s,i,r){const n=r.getContext("2d");if(!n)return;n.drawImage(e,0,0,s,i);const o={sourceWidth:s,sourceHeight:i,imageData:n.getImageData(0,0,s,i),originalEl:e,originalImageData:n.getImageData(0,0,s,i),canvasEl:r,ctx:n,filterBackend:this};t.forEach((t=>{t.applyTo(o);}));const{imageData:a}=o;return a.width===s&&a.height===i||(r.width=a.width,r.height=a.height),n.putImageData(a,0,0),o}}class $o{constructor(){let{tileSize:e=o.textureSize}=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};t(this,"aPosition",new Float32Array([0,0,0,1,1,0,1,1])),t(this,"resources",{}),this.tileSize=e,this.setupGLContext(e,e),this.captureGPUInfo();}setupGLContext(t,e){this.dispose(),this.createWebGLCanvas(t,e);}createWebGLCanvas(t,e){const s=vt({width:t,height:e}),i=s.getContext("webgl",{alpha:true,premultipliedAlpha:false,depth:false,stencil:false,antialias:false});i&&(i.clearColor(0,0,0,0),this.canvas=s,this.gl=i);}applyFilters(t,e,s,i,r,n){const o=this.gl,a=r.getContext("2d");if(!o||!a)return;let h;n&&(h=this.getCachedTexture(n,e));const c={originalWidth:e.width||e.naturalWidth||0,originalHeight:e.height||e.naturalHeight||0,sourceWidth:s,sourceHeight:i,destinationWidth:s,destinationHeight:i,context:o,sourceTexture:this.createTexture(o,s,i,h?void 0:e),targetTexture:this.createTexture(o,s,i),originalTexture:h||this.createTexture(o,s,i,h?void 0:e),passes:t.length,webgl:true,aPosition:this.aPosition,programCache:this.programCache,pass:0,filterBackend:this,targetCanvas:r},l=o.createFramebuffer();return o.bindFramebuffer(o.FRAMEBUFFER,l),t.forEach((t=>{t&&t.applyTo(c);})),function(t){const e=t.targetCanvas,s=e.width,i=e.height,r=t.destinationWidth,n=t.destinationHeight;s===r&&i===n||(e.width=r,e.height=n);}(c),this.copyGLTo2D(o,c),o.bindTexture(o.TEXTURE_2D,null),o.deleteTexture(c.sourceTexture),o.deleteTexture(c.targetTexture),o.deleteFramebuffer(l),a.setTransform(1,0,0,1,0,0),c}dispose(){this.canvas&&(this.canvas=null,this.gl=null),this.clearWebGLCaches();}clearWebGLCaches(){this.programCache={},this.textureCache={};}createTexture(t,e,s,i,r){const{NEAREST:n,TEXTURE_2D:o,RGBA:a,UNSIGNED_BYTE:h,CLAMP_TO_EDGE:c,TEXTURE_MAG_FILTER:l,TEXTURE_MIN_FILTER:u,TEXTURE_WRAP_S:d,TEXTURE_WRAP_T:g}=t,f=t.createTexture();return t.bindTexture(o,f),t.texParameteri(o,l,r||n),t.texParameteri(o,u,r||n),t.texParameteri(o,d,c),t.texParameteri(o,g,c),i?t.texImage2D(o,0,a,a,h,i):t.texImage2D(o,0,a,e,s,0,a,h,null),f}getCachedTexture(t,e,s){const{textureCache:i}=this;if(i[t])return i[t];{const r=this.createTexture(this.gl,e.width,e.height,e,s);return r&&(i[t]=r),r}}evictCachesForKey(t){this.textureCache[t]&&(this.gl.deleteTexture(this.textureCache[t]),delete this.textureCache[t]);}copyGLTo2D(t,e){const s=t.canvas,i=e.targetCanvas,r=i.getContext("2d");if(!r)return;r.translate(0,i.height),r.scale(1,-1);const n=s.height-i.height;r.drawImage(s,0,n,i.width,i.height,0,0,i.width,i.height);}copyGLTo2DPutImageData(t,e){const s=e.targetCanvas.getContext("2d"),i=e.destinationWidth,r=e.destinationHeight,n=i*r*4;if(!s)return;const o=new Uint8Array(this.imageBuffer,0,n),a=new Uint8ClampedArray(this.imageBuffer,0,n);t.readPixels(0,0,i,r,t.RGBA,t.UNSIGNED_BYTE,o);const h=new ImageData(a,i,r);s.putImageData(h,0,0);}captureGPUInfo(){if(this.gpuInfo)return this.gpuInfo;const t=this.gl,e={renderer:"",vendor:""};if(!t)return e;const s=t.getExtension("WEBGL_debug_renderer_info");if(s){const i=t.getParameter(s.UNMASKED_RENDERER_WEBGL),r=t.getParameter(s.UNMASKED_VENDOR_WEBGL);i&&(e.renderer=i.toLowerCase()),r&&(e.vendor=r.toLowerCase());}return this.gpuInfo=e,e}}let ta;function ea(){const{WebGLProbe:t}=p();return t.queryWebGL(pt()),o.enableGLFiltering&&t.isSupported(o.textureSize)?new $o({tileSize:o.textureSize}):new Zo}function sa(){return !ta&&(!(arguments.length>0&&void 0!==arguments[0])||arguments[0])&&(ta=ea()),ta}const ra=["filters","resizeFilter","src","crossOrigin","type"],na=["cropX","cropY"];class oa extends Li{static getDefaults(){return s(s({},super.getDefaults()),oa.ownDefaults)}constructor(e,s){super(),t(this,"_lastScaleX",1),t(this,"_lastScaleY",1),t(this,"_filterScalingX",1),t(this,"_filterScalingY",1),this.filters=[],Object.assign(this,oa.ownDefaults),this.setOptions(s),this.cacheKey="texture".concat(ft()),this.setElement("string"==typeof e?(this.canvas&&Kt(this.canvas.getElement())||m()).getElementById(e):e,s);}getElement(){return this._element}setElement(t){var e;let s=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{};this.removeTexture(this.cacheKey),this.removeTexture("".concat(this.cacheKey,"_filtered")),this._element=t,this._originalElement=t,this._setWidthHeight(s),null===(e=t.classList)||void 0===e||e.add(oa.CSS_CANVAS),0!==this.filters.length&&this.applyFilters(),this.resizeFilter&&this.applyResizeFilters();}removeTexture(t){const e=sa(false);e instanceof $o&&e.evictCachesForKey(t);}dispose(){super.dispose(),this.removeTexture(this.cacheKey),this.removeTexture("".concat(this.cacheKey,"_filtered")),this._cacheContext=null,["_originalElement","_element","_filteredEl","_cacheCanvas"].forEach((t=>{const e=this[t];e&&p().dispose(e),this[t]=void 0;}));}getCrossOrigin(){return this._originalElement&&(this._originalElement.crossOrigin||null)}getOriginalSize(){const t=this.getElement();return t?{width:t.naturalWidth||t.width,height:t.naturalHeight||t.height}:{width:0,height:0}}_stroke(t){if(!this.stroke||0===this.strokeWidth)return;const e=this.width/2,s=this.height/2;t.beginPath(),t.moveTo(-e,-s),t.lineTo(e,-s),t.lineTo(e,s),t.lineTo(-e,s),t.lineTo(-e,-s),t.closePath();}toObject(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:[];const e=[];return this.filters.forEach((t=>{t&&e.push(t.toObject());})),s(s({},super.toObject([...na,...t])),{},{src:this.getSrc(),crossOrigin:this.getCrossOrigin(),filters:e},this.resizeFilter?{resizeFilter:this.resizeFilter.toObject()}:{})}hasCrop(){return !!this.cropX||!!this.cropY||this.width<this._element.width||this.height<this._element.height}_toSVG(){const t=[],e=this._element,s=-this.width/2,i=-this.height/2;let r=[],n=[],o="",a="";if(!e)return [];if(this.hasCrop()){const t=ft();r.push('<clipPath id="imageCrop_'+t+'">\n','\t<rect x="'+s+'" y="'+i+'" width="'+this.width+'" height="'+this.height+'" />\n',"</clipPath>\n"),o=' clip-path="url(#imageCrop_'+t+')" ';}if(this.imageSmoothing||(a=' image-rendering="optimizeSpeed"'),t.push("\t<image ","COMMON_PARTS",'xlink:href="'.concat(this.getSvgSrc(true),'" x="').concat(s-this.cropX,'" y="').concat(i-this.cropY,'" width="').concat(e.width||e.naturalWidth,'" height="').concat(e.height||e.naturalHeight,'"').concat(a).concat(o,"></image>\n")),this.stroke||this.strokeDashArray){const t=this.fill;this.fill=null,n=['\t<rect x="'.concat(s,'" y="').concat(i,'" width="').concat(this.width,'" height="').concat(this.height,'" style="').concat(this.getSvgStyles(),'" />\n')],this.fill=t;}return r=this.paintFirst!==K?r.concat(n,t):r.concat(t,n),r}getSrc(t){const e=t?this._element:this._originalElement;return e?e.toDataURL?e.toDataURL():this.srcFromAttribute?e.getAttribute("src")||"":e.src:this.src||""}getSvgSrc(t){return this.getSrc(t)}setSrc(t){let{crossOrigin:e,signal:s}=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{};return It(t,{crossOrigin:e,signal:s}).then((t=>{ void 0!==e&&this.set({crossOrigin:e}),this.setElement(t);}))}toString(){return '#<Image: { src: "'.concat(this.getSrc(),'" }>')}applyResizeFilters(){const t=this.resizeFilter,e=this.minimumScaleTrigger,s=this.getTotalObjectScaling(),i=s.x,r=s.y,n=this._filteredEl||this._originalElement;if(this.group&&this.set("dirty",true),!t||i>e&&r>e)return this._element=n,this._filterScalingX=1,this._filterScalingY=1,this._lastScaleX=i,void(this._lastScaleY=r);const o=vt(n),{width:a,height:h}=n;this._element=o,this._lastScaleX=t.scaleX=i,this._lastScaleY=t.scaleY=r,sa().applyFilters([t],n,a,h,this._element),this._filterScalingX=o.width/this._originalElement.width,this._filterScalingY=o.height/this._originalElement.height;}applyFilters(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:this.filters||[];if(t=t.filter((t=>t&&!t.isNeutralState())),this.set("dirty",true),this.removeTexture("".concat(this.cacheKey,"_filtered")),0===t.length)return this._element=this._originalElement,this._filteredEl=void 0,this._filterScalingX=1,void(this._filterScalingY=1);const e=this._originalElement,s=e.naturalWidth||e.width,i=e.naturalHeight||e.height;if(this._element===this._originalElement){const t=vt({width:s,height:i});this._element=t,this._filteredEl=t;}else this._filteredEl&&(this._element=this._filteredEl,this._filteredEl.getContext("2d").clearRect(0,0,s,i),this._lastScaleX=1,this._lastScaleY=1);sa().applyFilters(t,this._originalElement,s,i,this._element,this.cacheKey),this._originalElement.width===this._element.width&&this._originalElement.height===this._element.height||(this._filterScalingX=this._element.width/this._originalElement.width,this._filterScalingY=this._element.height/this._originalElement.height);}_render(t){t.imageSmoothingEnabled=this.imageSmoothing,true!==this.isMoving&&this.resizeFilter&&this._needsResize()&&this.applyResizeFilters(),this._stroke(t),this._renderPaintInOrder(t);}drawCacheOnCanvas(t){t.imageSmoothingEnabled=this.imageSmoothing,super.drawCacheOnCanvas(t);}shouldCache(){return this.needsItsOwnCache()}_renderFill(t){const e=this._element;if(!e)return;const s=this._filterScalingX,i=this._filterScalingY,r=this.width,n=this.height,o=Math.max(this.cropX,0),a=Math.max(this.cropY,0),h=e.naturalWidth||e.width,c=e.naturalHeight||e.height,l=o*s,u=a*i,d=Math.min(r*s,h-l),g=Math.min(n*i,c-u),f=-r/2,p=-n/2,m=Math.min(r,h/s-o),v=Math.min(n,c/i-a);e&&t.drawImage(e,l,u,d,g,f,p,m,v);}_needsResize(){const t=this.getTotalObjectScaling();return t.x!==this._lastScaleX||t.y!==this._lastScaleY}_resetWidthHeight(){this.set(this.getOriginalSize());}_setWidthHeight(){let{width:t,height:e}=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};const s=this.getOriginalSize();this.width=t||s.width,this.height=e||s.height;}parsePreserveAspectRatioAttribute(){const t=Xe(this.preserveAspectRatio||""),e=this.width,s=this.height,i={width:e,height:s};let r,n=this._element.width,o=this._element.height,a=1,h=1,c=0,l=0,u=0,d=0;return !t||t.alignX===j&&t.alignY===j?(a=e/n,h=s/o):("meet"===t.meetOrSlice&&(a=h=qr(this._element,i),r=(e-n*a)/2,"Min"===t.alignX&&(c=-r),"Max"===t.alignX&&(c=r),r=(s-o*h)/2,"Min"===t.alignY&&(l=-r),"Max"===t.alignY&&(l=r)),"slice"===t.meetOrSlice&&(a=h=Kr(this._element,i),r=n-e/a,"Mid"===t.alignX&&(u=r/2),"Max"===t.alignX&&(u=r),r=o-s/h,"Mid"===t.alignY&&(d=r/2),"Max"===t.alignY&&(d=r),n=e/a,o=s/h)),{width:n,height:o,scaleX:a,scaleY:h,offsetLeft:c,offsetTop:l,cropX:u,cropY:d}}static fromObject(t,e){let{filters:r,resizeFilter:n,src:o,crossOrigin:a,type:h}=t,c=i(t,ra);return Promise.all([It(o,s(s({},e),{},{crossOrigin:a})),r&&Bt(r,e),n&&Bt([n],e),Xt(c,e)]).then((t=>{let[e,i=[],[r]=[],n={}]=t;return new this(e,s(s({},c),{},{src:o,filters:i,resizeFilter:r},n))}))}static fromURL(t){let{crossOrigin:e=null,signal:s}=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{},i=arguments.length>2?arguments[2]:void 0;return It(t,{crossOrigin:e,signal:s}).then((t=>new this(t,i)))}static async fromElement(t){let e=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{},s=arguments.length>2?arguments[2]:void 0;const i=Pr(t,this.ATTRIBUTE_NAMES,s);return this.fromURL(i["xlink:href"]||i.href,e,i).catch((t=>(a("log","Unable to parse Image",t),null)))}}t(oa,"type","Image"),t(oa,"cacheProperties",[...Es,...na]),t(oa,"ownDefaults",{strokeWidth:0,srcFromAttribute:false,minimumScaleTrigger:.5,cropX:0,cropY:0,imageSmoothing:true}),t(oa,"CSS_CANVAS","canvas-img"),t(oa,"ATTRIBUTE_NAMES",[...Zi,"x","y","width","height","preserveAspectRatio","xlink:href","href","crossOrigin","image-rendering"]),tt.setClass(oa),tt.setSVGClass(oa);Ve(["pattern","defs","symbol","metadata","clipPath","mask","desc"]);const La=t=>void 0!==t.webgl,Ia="precision highp float",Ba="\n    ".concat(Ia,";\n    varying vec2 vTexCoord;\n    uniform sampler2D uTexture;\n    void main() {\n      gl_FragColor = texture2D(uTexture, vTexCoord);\n    }"),Xa=["type"],Ya=["type"],Wa=new RegExp(Ia,"g");class Va{get type(){return this.constructor.type}constructor(){let t=i(arguments.length>0&&void 0!==arguments[0]?arguments[0]:{},Xa);Object.assign(this,this.constructor.defaults,t);}getFragmentSource(){return Ba}getVertexSource(){return "\n    attribute vec2 aPosition;\n    varying vec2 vTexCoord;\n    void main() {\n      vTexCoord = aPosition;\n      gl_Position = vec4(aPosition * 2.0 - 1.0, 0.0, 1.0);\n    }"}createProgram(t){let e=arguments.length>1&&void 0!==arguments[1]?arguments[1]:this.getFragmentSource(),s=arguments.length>2&&void 0!==arguments[2]?arguments[2]:this.getVertexSource();const{WebGLProbe:{GLPrecision:i="highp"}}=p();"highp"!==i&&(e=e.replace(Wa,Ia.replace("highp",i)));const r=t.createShader(t.VERTEX_SHADER),n=t.createShader(t.FRAGMENT_SHADER),o=t.createProgram();if(!r||!n||!o)throw new h("Vertex, fragment shader or program creation error");if(t.shaderSource(r,s),t.compileShader(r),!t.getShaderParameter(r,t.COMPILE_STATUS))throw new h("Vertex shader compile error for ".concat(this.type,": ").concat(t.getShaderInfoLog(r)));if(t.shaderSource(n,e),t.compileShader(n),!t.getShaderParameter(n,t.COMPILE_STATUS))throw new h("Fragment shader compile error for ".concat(this.type,": ").concat(t.getShaderInfoLog(n)));if(t.attachShader(o,r),t.attachShader(o,n),t.linkProgram(o),!t.getProgramParameter(o,t.LINK_STATUS))throw new h('Shader link error for "'.concat(this.type,'" ').concat(t.getProgramInfoLog(o)));const a=this.getUniformLocations(t,o)||{};return a.uStepW=t.getUniformLocation(o,"uStepW"),a.uStepH=t.getUniformLocation(o,"uStepH"),{program:o,attributeLocations:this.getAttributeLocations(t,o),uniformLocations:a}}getAttributeLocations(t,e){return {aPosition:t.getAttribLocation(e,"aPosition")}}getUniformLocations(t,e){const s=this.constructor.uniformLocations,i={};for(let r=0;r<s.length;r++)i[s[r]]=t.getUniformLocation(e,s[r]);return i}sendAttributeData(t,e,s){const i=e.aPosition,r=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,r),t.enableVertexAttribArray(i),t.vertexAttribPointer(i,2,t.FLOAT,false,0,0),t.bufferData(t.ARRAY_BUFFER,s,t.STATIC_DRAW);}_setupFrameBuffer(t){const e=t.context;if(t.passes>1){const s=t.destinationWidth,i=t.destinationHeight;t.sourceWidth===s&&t.sourceHeight===i||(e.deleteTexture(t.targetTexture),t.targetTexture=t.filterBackend.createTexture(e,s,i)),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,t.targetTexture,0);}else e.bindFramebuffer(e.FRAMEBUFFER,null),e.finish();}_swapTextures(t){t.passes--,t.pass++;const e=t.targetTexture;t.targetTexture=t.sourceTexture,t.sourceTexture=e;}isNeutralState(t){return  false}applyTo(t){La(t)?(this._setupFrameBuffer(t),this.applyToWebGL(t),this._swapTextures(t)):this.applyTo2d(t);}applyTo2d(t){}getCacheKey(){return this.type}retrieveShader(t){const e=this.getCacheKey();return t.programCache[e]||(t.programCache[e]=this.createProgram(t.context)),t.programCache[e]}applyToWebGL(t){const e=t.context,s=this.retrieveShader(t);0===t.pass&&t.originalTexture?e.bindTexture(e.TEXTURE_2D,t.originalTexture):e.bindTexture(e.TEXTURE_2D,t.sourceTexture),e.useProgram(s.program),this.sendAttributeData(e,s.attributeLocations,t.aPosition),e.uniform1f(s.uniformLocations.uStepW,1/t.sourceWidth),e.uniform1f(s.uniformLocations.uStepH,1/t.sourceHeight),this.sendUniformData(e,s.uniformLocations),e.viewport(0,0,t.destinationWidth,t.destinationHeight),e.drawArrays(e.TRIANGLE_STRIP,0,4);}bindAdditionalTexture(t,e,s){t.activeTexture(s),t.bindTexture(t.TEXTURE_2D,e),t.activeTexture(t.TEXTURE0);}unbindAdditionalTexture(t,e){t.activeTexture(e),t.bindTexture(t.TEXTURE_2D,null),t.activeTexture(t.TEXTURE0);}sendUniformData(t,e){}createHelpLayer(t){if(!t.helpLayer){const{sourceWidth:e,sourceHeight:s}=t,i=vt({width:e,height:s});t.helpLayer=i;}}toObject(){const t=Object.keys(this.constructor.defaults||{});return s({type:this.type},t.reduce(((t,e)=>(t[e]=this[e],t)),{}))}toJSON(){return this.toObject()}static async fromObject(t,e){return new this(i(t,Ya))}}t(Va,"type","BaseFilter"),t(Va,"uniformLocations",[]);const za={multiply:"gl_FragColor.rgb *= uColor.rgb;\n",screen:"gl_FragColor.rgb = 1.0 - (1.0 - gl_FragColor.rgb) * (1.0 - uColor.rgb);\n",add:"gl_FragColor.rgb += uColor.rgb;\n",difference:"gl_FragColor.rgb = abs(gl_FragColor.rgb - uColor.rgb);\n",subtract:"gl_FragColor.rgb -= uColor.rgb;\n",lighten:"gl_FragColor.rgb = max(gl_FragColor.rgb, uColor.rgb);\n",darken:"gl_FragColor.rgb = min(gl_FragColor.rgb, uColor.rgb);\n",exclusion:"gl_FragColor.rgb += uColor.rgb - 2.0 * (uColor.rgb * gl_FragColor.rgb);\n",overlay:"\n    if (uColor.r < 0.5) {\n      gl_FragColor.r *= 2.0 * uColor.r;\n    } else {\n      gl_FragColor.r = 1.0 - 2.0 * (1.0 - gl_FragColor.r) * (1.0 - uColor.r);\n    }\n    if (uColor.g < 0.5) {\n      gl_FragColor.g *= 2.0 * uColor.g;\n    } else {\n      gl_FragColor.g = 1.0 - 2.0 * (1.0 - gl_FragColor.g) * (1.0 - uColor.g);\n    }\n    if (uColor.b < 0.5) {\n      gl_FragColor.b *= 2.0 * uColor.b;\n    } else {\n      gl_FragColor.b = 1.0 - 2.0 * (1.0 - gl_FragColor.b) * (1.0 - uColor.b);\n    }\n    ",tint:"\n    gl_FragColor.rgb *= (1.0 - uColor.a);\n    gl_FragColor.rgb += uColor.rgb;\n    "};class Ga extends Va{getCacheKey(){return "".concat(this.type,"_").concat(this.mode)}getFragmentSource(){return "\n      precision highp float;\n      uniform sampler2D uTexture;\n      uniform vec4 uColor;\n      varying vec2 vTexCoord;\n      void main() {\n        vec4 color = texture2D(uTexture, vTexCoord);\n        gl_FragColor = color;\n        if (color.a > 0.0) {\n          ".concat(za[this.mode],"\n        }\n      }\n      ")}applyTo2d(t){let{imageData:{data:e}}=t;const s=new Ie(this.color).getSource(),i=this.alpha,r=s[0]*i,n=s[1]*i,o=s[2]*i,a=1-i;for(let t=0;t<e.length;t+=4){const s=e[t],i=e[t+1],h=e[t+2];let c,l,u;switch(this.mode){case "multiply":c=s*r/255,l=i*n/255,u=h*o/255;break;case "screen":c=255-(255-s)*(255-r)/255,l=255-(255-i)*(255-n)/255,u=255-(255-h)*(255-o)/255;break;case "add":c=s+r,l=i+n,u=h+o;break;case "difference":c=Math.abs(s-r),l=Math.abs(i-n),u=Math.abs(h-o);break;case "subtract":c=s-r,l=i-n,u=h-o;break;case "darken":c=Math.min(s,r),l=Math.min(i,n),u=Math.min(h,o);break;case "lighten":c=Math.max(s,r),l=Math.max(i,n),u=Math.max(h,o);break;case "overlay":c=r<128?2*s*r/255:255-2*(255-s)*(255-r)/255,l=n<128?2*i*n/255:255-2*(255-i)*(255-n)/255,u=o<128?2*h*o/255:255-2*(255-h)*(255-o)/255;break;case "exclusion":c=r+s-2*r*s/255,l=n+i-2*n*i/255,u=o+h-2*o*h/255;break;case "tint":c=r+s*a,l=n+i*a,u=o+h*a;}e[t]=c,e[t+1]=l,e[t+2]=u;}}sendUniformData(t,e){const s=new Ie(this.color).getSource();s[0]=this.alpha*s[0]/255,s[1]=this.alpha*s[1]/255,s[2]=this.alpha*s[2]/255,s[3]=this.alpha,t.uniform4fv(e.uColor,s);}}t(Ga,"defaults",{color:"#F95C63",mode:"multiply",alpha:1}),t(Ga,"type","BlendColor"),t(Ga,"uniformLocations",["uColor"]),tt.setClass(Ga);const Ha={multiply:"\n    precision highp float;\n    uniform sampler2D uTexture;\n    uniform sampler2D uImage;\n    uniform vec4 uColor;\n    varying vec2 vTexCoord;\n    varying vec2 vTexCoord2;\n    void main() {\n      vec4 color = texture2D(uTexture, vTexCoord);\n      vec4 color2 = texture2D(uImage, vTexCoord2);\n      color.rgba *= color2.rgba;\n      gl_FragColor = color;\n    }\n    ",mask:"\n    precision highp float;\n    uniform sampler2D uTexture;\n    uniform sampler2D uImage;\n    uniform vec4 uColor;\n    varying vec2 vTexCoord;\n    varying vec2 vTexCoord2;\n    void main() {\n      vec4 color = texture2D(uTexture, vTexCoord);\n      vec4 color2 = texture2D(uImage, vTexCoord2);\n      color.a = color2.a;\n      gl_FragColor = color;\n    }\n    "},Na=["type","image"];class Ua extends Va{getCacheKey(){return "".concat(this.type,"_").concat(this.mode)}getFragmentSource(){return Ha[this.mode]}getVertexSource(){return "\n    attribute vec2 aPosition;\n    varying vec2 vTexCoord;\n    varying vec2 vTexCoord2;\n    uniform mat3 uTransformMatrix;\n    void main() {\n      vTexCoord = aPosition;\n      vTexCoord2 = (uTransformMatrix * vec3(aPosition, 1.0)).xy;\n      gl_Position = vec4(aPosition * 2.0 - 1.0, 0.0, 1.0);\n    }\n    "}applyToWebGL(t){const e=t.context,s=this.createTexture(t.filterBackend,this.image);this.bindAdditionalTexture(e,s,e.TEXTURE1),super.applyToWebGL(t),this.unbindAdditionalTexture(e,e.TEXTURE1);}createTexture(t,e){return t.getCachedTexture(e.cacheKey,e.getElement())}calculateMatrix(){const t=this.image,{width:e,height:s}=t.getElement();return [1/t.scaleX,0,0,0,1/t.scaleY,0,-t.left/e,-t.top/s,1]}applyTo2d(t){let{imageData:{data:e,width:s,height:i},filterBackend:{resources:r}}=t;const n=this.image;r.blendImage||(r.blendImage=pt());const o=r.blendImage,a=o.getContext("2d");o.width!==s||o.height!==i?(o.width=s,o.height=i):a.clearRect(0,0,s,i),a.setTransform(n.scaleX,0,0,n.scaleY,n.left,n.top),a.drawImage(n.getElement(),0,0,s,i);const h=a.getImageData(0,0,s,i).data;for(let t=0;t<e.length;t+=4){const s=e[t],i=e[t+1],r=e[t+2],n=e[t+3],o=h[t],a=h[t+1],c=h[t+2],l=h[t+3];switch(this.mode){case "multiply":e[t]=s*o/255,e[t+1]=i*a/255,e[t+2]=r*c/255,e[t+3]=n*l/255;break;case "mask":e[t+3]=l;}}}sendUniformData(t,e){const s=this.calculateMatrix();t.uniform1i(e.uImage,1),t.uniformMatrix3fv(e.uTransformMatrix,false,s);}toObject(){return s(s({},super.toObject()),{},{image:this.image&&this.image.toObject()})}static async fromObject(t,e){let{type:r,image:n}=t,o=i(t,Na);return oa.fromObject(n,e).then((t=>new this(s(s({},o),{},{image:t}))))}}t(Ua,"type","BlendImage"),t(Ua,"defaults",{mode:"multiply",alpha:1}),t(Ua,"uniformLocations",["uTransformMatrix","uImage"]),tt.setClass(Ua);class qa extends Va{getFragmentSource(){return "\n    precision highp float;\n    uniform sampler2D uTexture;\n    uniform vec2 uDelta;\n    varying vec2 vTexCoord;\n    const float nSamples = 15.0;\n    vec3 v3offset = vec3(12.9898, 78.233, 151.7182);\n    float random(vec3 scale) {\n      /* use the fragment position for a different seed per-pixel */\n      return fract(sin(dot(gl_FragCoord.xyz, scale)) * 43758.5453);\n    }\n    void main() {\n      vec4 color = vec4(0.0);\n      float totalC = 0.0;\n      float totalA = 0.0;\n      float offset = random(v3offset);\n      for (float t = -nSamples; t <= nSamples; t++) {\n        float percent = (t + offset - 0.5) / nSamples;\n        vec4 sample = texture2D(uTexture, vTexCoord + uDelta * percent);\n        float weight = 1.0 - abs(percent);\n        float alpha = weight * sample.a;\n        color.rgb += sample.rgb * alpha;\n        color.a += alpha;\n        totalA += weight;\n        totalC += alpha;\n      }\n      gl_FragColor.rgb = color.rgb / totalC;\n      gl_FragColor.a = color.a / totalA;\n    }\n  "}applyTo(t){La(t)?(this.aspectRatio=t.sourceWidth/t.sourceHeight,t.passes++,this._setupFrameBuffer(t),this.horizontal=true,this.applyToWebGL(t),this._swapTextures(t),this._setupFrameBuffer(t),this.horizontal=false,this.applyToWebGL(t),this._swapTextures(t)):this.applyTo2d(t);}applyTo2d(t){let{imageData:{data:e,width:s,height:i}}=t;this.aspectRatio=s/i,this.horizontal=true;let r=this.getBlurValue()*s;const n=new Uint8ClampedArray(e),o=15,a=4*s;for(let t=0;t<e.length;t+=4){let s=0,i=0,h=0,c=0,l=0;const u=t-t%a,d=u+a;for(let n=-14;n<o;n++){const a=n/o,g=4*Math.floor(r*a),f=1-Math.abs(a);let p=t+g;p<u?p=u:p>d&&(p=d);const m=e[p+3]*f;s+=e[p]*m,i+=e[p+1]*m,h+=e[p+2]*m,c+=m,l+=f;}n[t]=s/c,n[t+1]=i/c,n[t+2]=h/c,n[t+3]=c/l;}this.horizontal=false,r=this.getBlurValue()*i;for(let t=0;t<n.length;t+=4){let s=0,i=0,h=0,c=0,l=0;const u=t%a,d=n.length-a+u;for(let e=-14;e<o;e++){const g=e/o,f=Math.floor(r*g)*a,p=1-Math.abs(g);let m=t+f;m<u?m=u:m>d&&(m=d);const v=n[m+3]*p;s+=n[m]*v,i+=n[m+1]*v,h+=n[m+2]*v,c+=v,l+=p;}e[t]=s/c,e[t+1]=i/c,e[t+2]=h/c,e[t+3]=c/l;}}sendUniformData(t,e){const s=this.chooseRightDelta();t.uniform2fv(e.uDelta,s);}isNeutralState(){return 0===this.blur}getBlurValue(){let t=1;const{horizontal:e,aspectRatio:s}=this;return e?s>1&&(t=1/s):s<1&&(t=s),t*this.blur*.12}chooseRightDelta(){const t=this.getBlurValue();return this.horizontal?[t,0]:[0,t]}}t(qa,"type","Blur"),t(qa,"defaults",{blur:0}),t(qa,"uniformLocations",["uDelta"]),tt.setClass(qa);class Ka extends Va{getFragmentSource(){return "\n  precision highp float;\n  uniform sampler2D uTexture;\n  uniform float uBrightness;\n  varying vec2 vTexCoord;\n  void main() {\n    vec4 color = texture2D(uTexture, vTexCoord);\n    color.rgb += uBrightness;\n    gl_FragColor = color;\n  }\n"}applyTo2d(t){let{imageData:{data:e}}=t;const s=Math.round(255*this.brightness);for(let t=0;t<e.length;t+=4)e[t]+=s,e[t+1]+=s,e[t+2]+=s;}isNeutralState(){return 0===this.brightness}sendUniformData(t,e){t.uniform1f(e.uBrightness,this.brightness);}}t(Ka,"type","Brightness"),t(Ka,"defaults",{brightness:0}),t(Ka,"uniformLocations",["uBrightness"]),tt.setClass(Ka);const Ja={matrix:[1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1,0],colorsOnly:true};class Qa extends Va{getFragmentSource(){return "\n  precision highp float;\n  uniform sampler2D uTexture;\n  varying vec2 vTexCoord;\n  uniform mat4 uColorMatrix;\n  uniform vec4 uConstants;\n  void main() {\n    vec4 color = texture2D(uTexture, vTexCoord);\n    color *= uColorMatrix;\n    color += uConstants;\n    gl_FragColor = color;\n  }"}applyTo2d(t){const e=t.imageData.data,s=this.matrix,i=this.colorsOnly;for(let t=0;t<e.length;t+=4){const r=e[t],n=e[t+1],o=e[t+2];if(e[t]=r*s[0]+n*s[1]+o*s[2]+255*s[4],e[t+1]=r*s[5]+n*s[6]+o*s[7]+255*s[9],e[t+2]=r*s[10]+n*s[11]+o*s[12]+255*s[14],!i){const i=e[t+3];e[t]+=i*s[3],e[t+1]+=i*s[8],e[t+2]+=i*s[13],e[t+3]=r*s[15]+n*s[16]+o*s[17]+i*s[18]+255*s[19];}}}sendUniformData(t,e){const s=this.matrix,i=[s[0],s[1],s[2],s[3],s[5],s[6],s[7],s[8],s[10],s[11],s[12],s[13],s[15],s[16],s[17],s[18]],r=[s[4],s[9],s[14],s[19]];t.uniformMatrix4fv(e.uColorMatrix,false,i),t.uniform4fv(e.uConstants,r);}toObject(){return s(s({},super.toObject()),{},{matrix:[...this.matrix]})}}function Za(e,s){var i;const r=(t(i=class extends Qa{toObject(){return {type:this.type,colorsOnly:this.colorsOnly}}},"type",e),t(i,"defaults",{colorsOnly:false,matrix:s}),i);return tt.setClass(r,e),r}t(Qa,"type","ColorMatrix"),t(Qa,"defaults",Ja),t(Qa,"uniformLocations",["uColorMatrix","uConstants"]),tt.setClass(Qa);Za("Brownie",[.5997,.34553,-0.27082,0,.186,-0.0377,.86095,.15059,0,-0.1449,.24113,-0.07441,.44972,0,-0.02965,0,0,0,1,0]);Za("Vintage",[.62793,.32021,-0.03965,0,.03784,.02578,.64411,.03259,0,.02926,.0466,-0.08512,.52416,0,.02023,0,0,0,1,0]);Za("Kodachrome",[1.12855,-0.39673,-0.03992,0,.24991,-0.16404,1.08352,-0.05498,0,.09698,-0.16786,-0.56034,1.60148,0,.13972,0,0,0,1,0]);Za("Technicolor",[1.91252,-0.85453,-0.09155,0,.04624,-0.30878,1.76589,-0.10601,0,-0.27589,-0.2311,-0.75018,1.84759,0,.12137,0,0,0,1,0]);Za("Polaroid",[1.438,-0.062,-0.062,0,0,-0.122,1.378,-0.122,0,0,-0.016,-0.016,1.483,0,0,0,0,0,1,0]);Za("Sepia",[.393,.769,.189,0,0,.349,.686,.168,0,0,.272,.534,.131,0,0,0,0,0,1,0]);Za("BlackWhite",[1.5,1.5,1.5,0,-1,1.5,1.5,1.5,0,-1,1.5,1.5,1.5,0,-1,0,0,0,1,0]);class oh extends Va{constructor(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};super(t),this.subFilters=t.subFilters||[];}applyTo(t){La(t)&&(t.passes+=this.subFilters.length-1),this.subFilters.forEach((e=>{e.applyTo(t);}));}toObject(){return {type:this.type,subFilters:this.subFilters.map((t=>t.toObject()))}}isNeutralState(){return !this.subFilters.some((t=>!t.isNeutralState()))}static fromObject(t,e){return Promise.all((t.subFilters||[]).map((t=>tt.getClass(t.type).fromObject(t,e)))).then((t=>new this({subFilters:t})))}}t(oh,"type","Composed"),tt.setClass(oh);class ah extends Va{getFragmentSource(){return "\n  precision highp float;\n  uniform sampler2D uTexture;\n  uniform float uContrast;\n  varying vec2 vTexCoord;\n  void main() {\n    vec4 color = texture2D(uTexture, vTexCoord);\n    float contrastF = 1.015 * (uContrast + 1.0) / (1.0 * (1.015 - uContrast));\n    color.rgb = contrastF * (color.rgb - 0.5) + 0.5;\n    gl_FragColor = color;\n  }"}isNeutralState(){return 0===this.contrast}applyTo2d(t){let{imageData:{data:e}}=t;const s=Math.floor(255*this.contrast),i=259*(s+255)/(255*(259-s));for(let t=0;t<e.length;t+=4)e[t]=i*(e[t]-128)+128,e[t+1]=i*(e[t+1]-128)+128,e[t+2]=i*(e[t+2]-128)+128;}sendUniformData(t,e){t.uniform1f(e.uContrast,this.contrast);}}t(ah,"type","Contrast"),t(ah,"defaults",{contrast:0}),t(ah,"uniformLocations",["uContrast"]),tt.setClass(ah);const hh={Convolute_3_1:"\n    precision highp float;\n    uniform sampler2D uTexture;\n    uniform float uMatrix[9];\n    uniform float uStepW;\n    uniform float uStepH;\n    varying vec2 vTexCoord;\n    void main() {\n      vec4 color = vec4(0, 0, 0, 0);\n      for (float h = 0.0; h < 3.0; h+=1.0) {\n        for (float w = 0.0; w < 3.0; w+=1.0) {\n          vec2 matrixPos = vec2(uStepW * (w - 1), uStepH * (h - 1));\n          color += texture2D(uTexture, vTexCoord + matrixPos) * uMatrix[int(h * 3.0 + w)];\n        }\n      }\n      gl_FragColor = color;\n    }\n    ",Convolute_3_0:"\n    precision highp float;\n    uniform sampler2D uTexture;\n    uniform float uMatrix[9];\n    uniform float uStepW;\n    uniform float uStepH;\n    varying vec2 vTexCoord;\n    void main() {\n      vec4 color = vec4(0, 0, 0, 1);\n      for (float h = 0.0; h < 3.0; h+=1.0) {\n        for (float w = 0.0; w < 3.0; w+=1.0) {\n          vec2 matrixPos = vec2(uStepW * (w - 1.0), uStepH * (h - 1.0));\n          color.rgb += texture2D(uTexture, vTexCoord + matrixPos).rgb * uMatrix[int(h * 3.0 + w)];\n        }\n      }\n      float alpha = texture2D(uTexture, vTexCoord).a;\n      gl_FragColor = color;\n      gl_FragColor.a = alpha;\n    }\n    ",Convolute_5_1:"\n    precision highp float;\n    uniform sampler2D uTexture;\n    uniform float uMatrix[25];\n    uniform float uStepW;\n    uniform float uStepH;\n    varying vec2 vTexCoord;\n    void main() {\n      vec4 color = vec4(0, 0, 0, 0);\n      for (float h = 0.0; h < 5.0; h+=1.0) {\n        for (float w = 0.0; w < 5.0; w+=1.0) {\n          vec2 matrixPos = vec2(uStepW * (w - 2.0), uStepH * (h - 2.0));\n          color += texture2D(uTexture, vTexCoord + matrixPos) * uMatrix[int(h * 5.0 + w)];\n        }\n      }\n      gl_FragColor = color;\n    }\n    ",Convolute_5_0:"\n    precision highp float;\n    uniform sampler2D uTexture;\n    uniform float uMatrix[25];\n    uniform float uStepW;\n    uniform float uStepH;\n    varying vec2 vTexCoord;\n    void main() {\n      vec4 color = vec4(0, 0, 0, 1);\n      for (float h = 0.0; h < 5.0; h+=1.0) {\n        for (float w = 0.0; w < 5.0; w+=1.0) {\n          vec2 matrixPos = vec2(uStepW * (w - 2.0), uStepH * (h - 2.0));\n          color.rgb += texture2D(uTexture, vTexCoord + matrixPos).rgb * uMatrix[int(h * 5.0 + w)];\n        }\n      }\n      float alpha = texture2D(uTexture, vTexCoord).a;\n      gl_FragColor = color;\n      gl_FragColor.a = alpha;\n    }\n    ",Convolute_7_1:"\n    precision highp float;\n    uniform sampler2D uTexture;\n    uniform float uMatrix[49];\n    uniform float uStepW;\n    uniform float uStepH;\n    varying vec2 vTexCoord;\n    void main() {\n      vec4 color = vec4(0, 0, 0, 0);\n      for (float h = 0.0; h < 7.0; h+=1.0) {\n        for (float w = 0.0; w < 7.0; w+=1.0) {\n          vec2 matrixPos = vec2(uStepW * (w - 3.0), uStepH * (h - 3.0));\n          color += texture2D(uTexture, vTexCoord + matrixPos) * uMatrix[int(h * 7.0 + w)];\n        }\n      }\n      gl_FragColor = color;\n    }\n    ",Convolute_7_0:"\n    precision highp float;\n    uniform sampler2D uTexture;\n    uniform float uMatrix[49];\n    uniform float uStepW;\n    uniform float uStepH;\n    varying vec2 vTexCoord;\n    void main() {\n      vec4 color = vec4(0, 0, 0, 1);\n      for (float h = 0.0; h < 7.0; h+=1.0) {\n        for (float w = 0.0; w < 7.0; w+=1.0) {\n          vec2 matrixPos = vec2(uStepW * (w - 3.0), uStepH * (h - 3.0));\n          color.rgb += texture2D(uTexture, vTexCoord + matrixPos).rgb * uMatrix[int(h * 7.0 + w)];\n        }\n      }\n      float alpha = texture2D(uTexture, vTexCoord).a;\n      gl_FragColor = color;\n      gl_FragColor.a = alpha;\n    }\n    ",Convolute_9_1:"\n    precision highp float;\n    uniform sampler2D uTexture;\n    uniform float uMatrix[81];\n    uniform float uStepW;\n    uniform float uStepH;\n    varying vec2 vTexCoord;\n    void main() {\n      vec4 color = vec4(0, 0, 0, 0);\n      for (float h = 0.0; h < 9.0; h+=1.0) {\n        for (float w = 0.0; w < 9.0; w+=1.0) {\n          vec2 matrixPos = vec2(uStepW * (w - 4.0), uStepH * (h - 4.0));\n          color += texture2D(uTexture, vTexCoord + matrixPos) * uMatrix[int(h * 9.0 + w)];\n        }\n      }\n      gl_FragColor = color;\n    }\n    ",Convolute_9_0:"\n    precision highp float;\n    uniform sampler2D uTexture;\n    uniform float uMatrix[81];\n    uniform float uStepW;\n    uniform float uStepH;\n    varying vec2 vTexCoord;\n    void main() {\n      vec4 color = vec4(0, 0, 0, 1);\n      for (float h = 0.0; h < 9.0; h+=1.0) {\n        for (float w = 0.0; w < 9.0; w+=1.0) {\n          vec2 matrixPos = vec2(uStepW * (w - 4.0), uStepH * (h - 4.0));\n          color.rgb += texture2D(uTexture, vTexCoord + matrixPos).rgb * uMatrix[int(h * 9.0 + w)];\n        }\n      }\n      float alpha = texture2D(uTexture, vTexCoord).a;\n      gl_FragColor = color;\n      gl_FragColor.a = alpha;\n    }\n    "};class ch extends Va{getCacheKey(){return "".concat(this.type,"_").concat(Math.sqrt(this.matrix.length),"_").concat(this.opaque?1:0)}getFragmentSource(){return hh[this.getCacheKey()]}applyTo2d(t){const e=t.imageData,s=e.data,i=this.matrix,r=Math.round(Math.sqrt(i.length)),n=Math.floor(r/2),o=e.width,a=e.height,h=t.ctx.createImageData(o,a),c=h.data,l=this.opaque?1:0;let u,d,g,f,p,m,v,y,_,x,C,b,S;for(C=0;C<a;C++)for(x=0;x<o;x++){for(p=4*(C*o+x),u=0,d=0,g=0,f=0,S=0;S<r;S++)for(b=0;b<r;b++)v=C+S-n,m=x+b-n,v<0||v>=a||m<0||m>=o||(y=4*(v*o+m),_=i[S*r+b],u+=s[y]*_,d+=s[y+1]*_,g+=s[y+2]*_,l||(f+=s[y+3]*_));c[p]=u,c[p+1]=d,c[p+2]=g,c[p+3]=l?s[p+3]:f;}t.imageData=h;}sendUniformData(t,e){t.uniform1fv(e.uMatrix,this.matrix);}toObject(){return s(s({},super.toObject()),{},{opaque:this.opaque,matrix:[...this.matrix]})}}t(ch,"type","Convolute"),t(ch,"defaults",{opaque:false,matrix:[0,0,0,0,1,0,0,0,0]}),t(ch,"uniformLocations",["uMatrix","uOpaque","uHalfSize","uSize"]),tt.setClass(ch);const lh="Gamma";class uh extends Va{getFragmentSource(){return "\n  precision highp float;\n  uniform sampler2D uTexture;\n  uniform vec3 uGamma;\n  varying vec2 vTexCoord;\n  void main() {\n    vec4 color = texture2D(uTexture, vTexCoord);\n    vec3 correction = (1.0 / uGamma);\n    color.r = pow(color.r, correction.r);\n    color.g = pow(color.g, correction.g);\n    color.b = pow(color.b, correction.b);\n    gl_FragColor = color;\n    gl_FragColor.rgb *= color.a;\n  }\n"}constructor(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};super(t),this.gamma=t.gamma||this.constructor.defaults.gamma.concat();}applyTo2d(t){let{imageData:{data:e}}=t;const s=this.gamma,i=1/s[0],r=1/s[1],n=1/s[2];this.rgbValues||(this.rgbValues={r:new Uint8Array(256),g:new Uint8Array(256),b:new Uint8Array(256)});const o=this.rgbValues;for(let t=0;t<256;t++)o.r[t]=255*Math.pow(t/255,i),o.g[t]=255*Math.pow(t/255,r),o.b[t]=255*Math.pow(t/255,n);for(let t=0;t<e.length;t+=4)e[t]=o.r[e[t]],e[t+1]=o.g[e[t+1]],e[t+2]=o.b[e[t+2]];}sendUniformData(t,e){t.uniform3fv(e.uGamma,this.gamma);}isNeutralState(){const{gamma:t}=this;return 1===t[0]&&1===t[1]&&1===t[2]}toObject(){return {type:lh,gamma:this.gamma.concat()}}}t(uh,"type",lh),t(uh,"defaults",{gamma:[1,1,1]}),t(uh,"uniformLocations",["uGamma"]),tt.setClass(uh);const dh={average:"\n    precision highp float;\n    uniform sampler2D uTexture;\n    varying vec2 vTexCoord;\n    void main() {\n      vec4 color = texture2D(uTexture, vTexCoord);\n      float average = (color.r + color.b + color.g) / 3.0;\n      gl_FragColor = vec4(average, average, average, color.a);\n    }\n    ",lightness:"\n    precision highp float;\n    uniform sampler2D uTexture;\n    uniform int uMode;\n    varying vec2 vTexCoord;\n    void main() {\n      vec4 col = texture2D(uTexture, vTexCoord);\n      float average = (max(max(col.r, col.g),col.b) + min(min(col.r, col.g),col.b)) / 2.0;\n      gl_FragColor = vec4(average, average, average, col.a);\n    }\n    ",luminosity:"\n    precision highp float;\n    uniform sampler2D uTexture;\n    uniform int uMode;\n    varying vec2 vTexCoord;\n    void main() {\n      vec4 col = texture2D(uTexture, vTexCoord);\n      float average = 0.21 * col.r + 0.72 * col.g + 0.07 * col.b;\n      gl_FragColor = vec4(average, average, average, col.a);\n    }\n    "};class gh extends Va{applyTo2d(t){let{imageData:{data:e}}=t;for(let t,s=0;s<e.length;s+=4){const i=e[s],r=e[s+1],n=e[s+2];switch(this.mode){case "average":t=(i+r+n)/3;break;case "lightness":t=(Math.min(i,r,n)+Math.max(i,r,n))/2;break;case "luminosity":t=.21*i+.72*r+.07*n;}e[s+2]=e[s+1]=e[s]=t;}}getCacheKey(){return "".concat(this.type,"_").concat(this.mode)}getFragmentSource(){return dh[this.mode]}sendUniformData(t,e){t.uniform1i(e.uMode,1);}isNeutralState(){return  false}}t(gh,"type","Grayscale"),t(gh,"defaults",{mode:"average"}),t(gh,"uniformLocations",["uMode"]),tt.setClass(gh);const fh=s(s({},Ja),{},{rotation:0});class ph extends Qa{calculateMatrix(){const t=this.rotation*Math.PI,e=rt(t),s=nt(t),i=1/3,r=Math.sqrt(i)*s,n=1-e;this.matrix=[e+n/3,i*n-r,i*n+r,0,0,i*n+r,e+i*n,i*n-r,0,0,i*n-r,i*n+r,e+i*n,0,0,0,0,0,1,0];}isNeutralState(){return 0===this.rotation}applyTo(t){this.calculateMatrix(),super.applyTo(t);}toObject(){return {type:this.type,rotation:this.rotation}}}t(ph,"type","HueRotation"),t(ph,"defaults",fh),tt.setClass(ph);class mh extends Va{applyTo2d(t){let{imageData:{data:e}}=t;for(let t=0;t<e.length;t+=4)e[t]=255-e[t],e[t+1]=255-e[t+1],e[t+2]=255-e[t+2],this.alpha&&(e[t+3]=255-e[t+3]);}getFragmentSource(){return "\n  precision highp float;\n  uniform sampler2D uTexture;\n  uniform int uInvert;\n  uniform int uAlpha;\n  varying vec2 vTexCoord;\n  void main() {\n    vec4 color = texture2D(uTexture, vTexCoord);\n    if (uInvert == 1) {\n      if (uAlpha == 1) {\n        gl_FragColor = vec4(1.0 - color.r,1.0 -color.g,1.0 -color.b,1.0 -color.a);\n      } else {\n        gl_FragColor = vec4(1.0 - color.r,1.0 -color.g,1.0 -color.b,color.a);\n      }\n    } else {\n      gl_FragColor = color;\n    }\n  }\n"}isNeutralState(){return !this.invert}sendUniformData(t,e){t.uniform1i(e.uInvert,Number(this.invert)),t.uniform1i(e.uAlpha,Number(this.alpha));}}t(mh,"type","Invert"),t(mh,"defaults",{alpha:false,invert:true}),t(mh,"uniformLocations",["uInvert","uAlpha"]),tt.setClass(mh);class vh extends Va{getFragmentSource(){return "\n  precision highp float;\n  uniform sampler2D uTexture;\n  uniform float uStepH;\n  uniform float uNoise;\n  uniform float uSeed;\n  varying vec2 vTexCoord;\n  float rand(vec2 co, float seed, float vScale) {\n    return fract(sin(dot(co.xy * vScale ,vec2(12.9898 , 78.233))) * 43758.5453 * (seed + 0.01) / 2.0);\n  }\n  void main() {\n    vec4 color = texture2D(uTexture, vTexCoord);\n    color.rgb += (0.5 - rand(vTexCoord, uSeed, 0.1 / uStepH)) * uNoise;\n    gl_FragColor = color;\n  }\n"}applyTo2d(t){let{imageData:{data:e}}=t;const s=this.noise;for(let t=0;t<e.length;t+=4){const i=(.5-Math.random())*s;e[t]+=i,e[t+1]+=i,e[t+2]+=i;}}sendUniformData(t,e){t.uniform1f(e.uNoise,this.noise/255),t.uniform1f(e.uSeed,Math.random());}isNeutralState(){return 0===this.noise}}t(vh,"type","Noise"),t(vh,"defaults",{noise:0}),t(vh,"uniformLocations",["uNoise","uSeed"]),tt.setClass(vh);class yh extends Va{applyTo2d(t){let{imageData:{data:e,width:s,height:i}}=t;for(let t=0;t<i;t+=this.blocksize)for(let r=0;r<s;r+=this.blocksize){const n=4*t*s+4*r,o=e[n],a=e[n+1],h=e[n+2],c=e[n+3];for(let n=t;n<Math.min(t+this.blocksize,i);n++)for(let t=r;t<Math.min(r+this.blocksize,s);t++){const i=4*n*s+4*t;e[i]=o,e[i+1]=a,e[i+2]=h,e[i+3]=c;}}}isNeutralState(){return 1===this.blocksize}getFragmentSource(){return "\n  precision highp float;\n  uniform sampler2D uTexture;\n  uniform float uBlocksize;\n  uniform float uStepW;\n  uniform float uStepH;\n  varying vec2 vTexCoord;\n  void main() {\n    float blockW = uBlocksize * uStepW;\n    float blockH = uBlocksize * uStepH;\n    int posX = int(vTexCoord.x / blockW);\n    int posY = int(vTexCoord.y / blockH);\n    float fposX = float(posX);\n    float fposY = float(posY);\n    vec2 squareCoords = vec2(fposX * blockW, fposY * blockH);\n    vec4 color = texture2D(uTexture, squareCoords);\n    gl_FragColor = color;\n  }\n"}sendUniformData(t,e){t.uniform1f(e.uBlocksize,this.blocksize);}}t(yh,"type","Pixelate"),t(yh,"defaults",{blocksize:4}),t(yh,"uniformLocations",["uBlocksize"]),tt.setClass(yh);class _h extends Va{getFragmentSource(){return "\nprecision highp float;\nuniform sampler2D uTexture;\nuniform vec4 uLow;\nuniform vec4 uHigh;\nvarying vec2 vTexCoord;\nvoid main() {\n  gl_FragColor = texture2D(uTexture, vTexCoord);\n  if(all(greaterThan(gl_FragColor.rgb,uLow.rgb)) && all(greaterThan(uHigh.rgb,gl_FragColor.rgb))) {\n    gl_FragColor.a = 0.0;\n  }\n}\n"}applyTo2d(t){let{imageData:{data:e}}=t;const s=255*this.distance,i=new Ie(this.color).getSource(),r=[i[0]-s,i[1]-s,i[2]-s],n=[i[0]+s,i[1]+s,i[2]+s];for(let t=0;t<e.length;t+=4){const s=e[t],i=e[t+1],o=e[t+2];s>r[0]&&i>r[1]&&o>r[2]&&s<n[0]&&i<n[1]&&o<n[2]&&(e[t+3]=0);}}sendUniformData(t,e){const s=new Ie(this.color).getSource(),i=this.distance,r=[0+s[0]/255-i,0+s[1]/255-i,0+s[2]/255-i,1],n=[s[0]/255+i,s[1]/255+i,s[2]/255+i,1];t.uniform4fv(e.uLow,r),t.uniform4fv(e.uHigh,n);}}t(_h,"type","RemoveColor"),t(_h,"defaults",{color:"#FFFFFF",distance:.02,useAlpha:false}),t(_h,"uniformLocations",["uLow","uHigh"]),tt.setClass(_h);class xh extends Va{sendUniformData(t,e){t.uniform2fv(e.uDelta,this.horizontal?[1/this.width,0]:[0,1/this.height]),t.uniform1fv(e.uTaps,this.taps);}getFilterWindow(){const t=this.tempScale;return Math.ceil(this.lanczosLobes/t)}getCacheKey(){const t=this.getFilterWindow();return "".concat(this.type,"_").concat(t)}getFragmentSource(){const t=this.getFilterWindow();return this.generateShader(t)}getTaps(){const t=this.lanczosCreate(this.lanczosLobes),e=this.tempScale,s=this.getFilterWindow(),i=new Array(s);for(let r=1;r<=s;r++)i[r-1]=t(r*e);return i}generateShader(t){const e=new Array(t);for(let s=1;s<=t;s++)e[s-1]="".concat(s,".0 * uDelta");return "\n      precision highp float;\n      uniform sampler2D uTexture;\n      uniform vec2 uDelta;\n      varying vec2 vTexCoord;\n      uniform float uTaps[".concat(t,"];\n      void main() {\n        vec4 color = texture2D(uTexture, vTexCoord);\n        float sum = 1.0;\n        ").concat(e.map(((t,e)=>"\n              color += texture2D(uTexture, vTexCoord + ".concat(t,") * uTaps[").concat(e,"] + texture2D(uTexture, vTexCoord - ").concat(t,") * uTaps[").concat(e,"];\n              sum += 2.0 * uTaps[").concat(e,"];\n            "))).join("\n"),"\n        gl_FragColor = color / sum;\n      }\n    ")}applyToForWebgl(t){t.passes++,this.width=t.sourceWidth,this.horizontal=true,this.dW=Math.round(this.width*this.scaleX),this.dH=t.sourceHeight,this.tempScale=this.dW/this.width,this.taps=this.getTaps(),t.destinationWidth=this.dW,super.applyTo(t),t.sourceWidth=t.destinationWidth,this.height=t.sourceHeight,this.horizontal=false,this.dH=Math.round(this.height*this.scaleY),this.tempScale=this.dH/this.height,this.taps=this.getTaps(),t.destinationHeight=this.dH,super.applyTo(t),t.sourceHeight=t.destinationHeight;}applyTo(t){La(t)?this.applyToForWebgl(t):this.applyTo2d(t);}isNeutralState(){return 1===this.scaleX&&1===this.scaleY}lanczosCreate(t){return e=>{if(e>=t||e<=-t)return 0;if(e<1.1920929e-7&&e>-1.1920929e-7)return 1;const s=(e*=Math.PI)/t;return Math.sin(e)/e*Math.sin(s)/s}}applyTo2d(t){const e=t.imageData,s=this.scaleX,i=this.scaleY;this.rcpScaleX=1/s,this.rcpScaleY=1/i;const r=e.width,n=e.height,o=Math.round(r*s),a=Math.round(n*i);let h;h="sliceHack"===this.resizeType?this.sliceByTwo(t,r,n,o,a):"hermite"===this.resizeType?this.hermiteFastResize(t,r,n,o,a):"bilinear"===this.resizeType?this.bilinearFiltering(t,r,n,o,a):"lanczos"===this.resizeType?this.lanczosResize(t,r,n,o,a):new ImageData(o,a),t.imageData=h;}sliceByTwo(t,e,s,i,r){const n=t.imageData,o=.5;let a=false,h=false,c=e*o,l=s*o;const u=t.filterBackend.resources;let d=0,g=0;const f=e;let p=0;u.sliceByTwo||(u.sliceByTwo=pt());const m=u.sliceByTwo;(m.width<1.5*e||m.height<s)&&(m.width=1.5*e,m.height=s);const v=m.getContext("2d");for(v.clearRect(0,0,1.5*e,s),v.putImageData(n,0,0),i=Math.floor(i),r=Math.floor(r);!a||!h;)e=c,s=l,i<Math.floor(c*o)?c=Math.floor(c*o):(c=i,a=true),r<Math.floor(l*o)?l=Math.floor(l*o):(l=r,h=true),v.drawImage(m,d,g,e,s,f,p,c,l),d=f,g=p,p+=l;return v.getImageData(d,g,i,r)}lanczosResize(t,e,s,i,r){const n=t.imageData.data,o=t.ctx.createImageData(i,r),a=o.data,h=this.lanczosCreate(this.lanczosLobes),c=this.rcpScaleX,l=this.rcpScaleY,u=2/this.rcpScaleX,d=2/this.rcpScaleY,g=Math.ceil(c*this.lanczosLobes/2),f=Math.ceil(l*this.lanczosLobes/2),p={},m={x:0,y:0},v={x:0,y:0};return function t(y){let _,x,C,b,S,w,T,O,k,D,M;for(m.x=(y+.5)*c,v.x=Math.floor(m.x),_=0;_<r;_++){for(m.y=(_+.5)*l,v.y=Math.floor(m.y),S=0,w=0,T=0,O=0,k=0,x=v.x-g;x<=v.x+g;x++)if(!(x<0||x>=e)){D=Math.floor(1e3*Math.abs(x-m.x)),p[D]||(p[D]={});for(let t=v.y-f;t<=v.y+f;t++)t<0||t>=s||(M=Math.floor(1e3*Math.abs(t-m.y)),p[D][M]||(p[D][M]=h(Math.sqrt(Math.pow(D*u,2)+Math.pow(M*d,2))/1e3)),C=p[D][M],C>0&&(b=4*(t*e+x),S+=C,w+=C*n[b],T+=C*n[b+1],O+=C*n[b+2],k+=C*n[b+3]));}b=4*(_*i+y),a[b]=w/S,a[b+1]=T/S,a[b+2]=O/S,a[b+3]=k/S;}return ++y<i?t(y):o}(0)}bilinearFiltering(t,e,s,i,r){let n,o,a,h,c,l,u,d,g,f,p,m,v,y=0;const _=this.rcpScaleX,x=this.rcpScaleY,C=4*(e-1),b=t.imageData.data,S=t.ctx.createImageData(i,r),w=S.data;for(u=0;u<r;u++)for(d=0;d<i;d++)for(c=Math.floor(_*d),l=Math.floor(x*u),g=_*d-c,f=x*u-l,v=4*(l*e+c),p=0;p<4;p++)n=b[v+p],o=b[v+4+p],a=b[v+C+p],h=b[v+C+4+p],m=n*(1-g)*(1-f)+o*g*(1-f)+a*f*(1-g)+h*g*f,w[y++]=m;return S}hermiteFastResize(t,e,s,i,r){const n=this.rcpScaleX,o=this.rcpScaleY,a=Math.ceil(n/2),h=Math.ceil(o/2),c=t.imageData.data,l=t.ctx.createImageData(i,r),u=l.data;for(let t=0;t<r;t++)for(let s=0;s<i;s++){const r=4*(s+t*i);let l=0,d=0,g=0,f=0,p=0,m=0,v=0;const y=(t+.5)*o;for(let i=Math.floor(t*o);i<(t+1)*o;i++){const t=Math.abs(y-(i+.5))/h,r=(s+.5)*n,o=t*t;for(let t=Math.floor(s*n);t<(s+1)*n;t++){let s=Math.abs(r-(t+.5))/a;const n=Math.sqrt(o+s*s);n>1&&n<-1||(l=2*n*n*n-3*n*n+1,l>0&&(s=4*(t+i*e),v+=l*c[s+3],g+=l,c[s+3]<255&&(l=l*c[s+3]/250),f+=l*c[s],p+=l*c[s+1],m+=l*c[s+2],d+=l));}}u[r]=f/d,u[r+1]=p/d,u[r+2]=m/d,u[r+3]=v/g;}return l}}t(xh,"type","Resize"),t(xh,"defaults",{resizeType:"hermite",scaleX:1,scaleY:1,lanczosLobes:3}),t(xh,"uniformLocations",["uDelta","uTaps"]),tt.setClass(xh);class Ch extends Va{getFragmentSource(){return "\n  precision highp float;\n  uniform sampler2D uTexture;\n  uniform float uSaturation;\n  varying vec2 vTexCoord;\n  void main() {\n    vec4 color = texture2D(uTexture, vTexCoord);\n    float rgMax = max(color.r, color.g);\n    float rgbMax = max(rgMax, color.b);\n    color.r += rgbMax != color.r ? (rgbMax - color.r) * uSaturation : 0.00;\n    color.g += rgbMax != color.g ? (rgbMax - color.g) * uSaturation : 0.00;\n    color.b += rgbMax != color.b ? (rgbMax - color.b) * uSaturation : 0.00;\n    gl_FragColor = color;\n  }\n"}applyTo2d(t){let{imageData:{data:e}}=t;const s=-this.saturation;for(let t=0;t<e.length;t+=4){const i=e[t],r=e[t+1],n=e[t+2],o=Math.max(i,r,n);e[t]+=o!==i?(o-i)*s:0,e[t+1]+=o!==r?(o-r)*s:0,e[t+2]+=o!==n?(o-n)*s:0;}}sendUniformData(t,e){t.uniform1f(e.uSaturation,-this.saturation);}isNeutralState(){return 0===this.saturation}}t(Ch,"type","Saturation"),t(Ch,"defaults",{saturation:0}),t(Ch,"uniformLocations",["uSaturation"]),tt.setClass(Ch);class bh extends Va{getFragmentSource(){return "\n  precision highp float;\n  uniform sampler2D uTexture;\n  uniform float uVibrance;\n  varying vec2 vTexCoord;\n  void main() {\n    vec4 color = texture2D(uTexture, vTexCoord);\n    float max = max(color.r, max(color.g, color.b));\n    float avg = (color.r + color.g + color.b) / 3.0;\n    float amt = (abs(max - avg) * 2.0) * uVibrance;\n    color.r += max != color.r ? (max - color.r) * amt : 0.00;\n    color.g += max != color.g ? (max - color.g) * amt : 0.00;\n    color.b += max != color.b ? (max - color.b) * amt : 0.00;\n    gl_FragColor = color;\n  }\n"}applyTo2d(t){let{imageData:{data:e}}=t;const s=-this.vibrance;for(let t=0;t<e.length;t+=4){const i=e[t],r=e[t+1],n=e[t+2],o=Math.max(i,r,n),a=(i+r+n)/3,h=2*Math.abs(o-a)/255*s;e[t]+=o!==i?(o-i)*h:0,e[t+1]+=o!==r?(o-r)*h:0,e[t+2]+=o!==n?(o-n)*h:0;}}sendUniformData(t,e){t.uniform1f(e.uVibrance,-this.vibrance);}isNeutralState(){return 0===this.vibrance}}t(bh,"type","Vibrance"),t(bh,"defaults",{vibrance:0}),t(bh,"uniformLocations",["uVibrance"]),tt.setClass(bh);

  const STYLES = `
${TOKENS_CSS}

:host {
  position: fixed;
  z-index: 2147483647;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-sans);
  pointer-events: none; /* Let clicks pass through container */
  transition: transform 0.2s ease-out, opacity 0.2s ease-out;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px;
  background: rgba(22, 22, 24, 0.9); /* Dark glass */
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  box-shadow: 
    0 4px 20px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(0, 0, 0, 0.4);
  pointer-events: auto; /* Re-enable clicks on toolbar */
  animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slideUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.group {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 4px;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
}

.group:last-child {
  border-right: none;
}

.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.btn.active {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.btn svg {
  width: 18px;
  height: 18px;
}

/* Color picker dots */
.color-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
  margin: 0 2px;
  transition: transform 0.15s;
}

.color-btn:hover {
  transform: scale(1.1);
}

.color-btn.active {
  border-color: #fff;
  transform: scale(1.1);
}

.divider {
  width: 1px;
  height: 20px;
  background: rgba(255, 255, 255, 0.15);
  margin: 0 4px;
}

.action-btn {
  padding: 0 12px;
  height: 32px;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 500;
  width: auto;
  gap: 6px;
}

.action-btn.primary {
  background: #fff;
  color: #000;
}

.action-btn.primary:hover {
  background: #f0f0f0;
}

.action-btn.danger:hover {
  background: rgba(255, 59, 48, 0.2);
  color: #ff3b30;
}
`;

  class AnnotateToolbar {
    constructor(eventBus) {
      this.eventBus = eventBus;
      this.host = null;
      this.shadow = null;
      this.activeTool = 'select';
      this.activeColor = '#ef4444'; // default red

      this.tools = [
        { id: 'select', icon: '<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>' },
        { id: 'rect', icon: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>' },
        { id: 'arrow', icon: '<path d="M5 12h14M12 5l7 7-7 7"/>' },
        { id: 'text', icon: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>' },
        { id: 'pen', icon: '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>' }
      ];

      this.colors = [
        '#ef4444', // red
        '#eab308', // yellow
        '#22c55e', // green
        '#3b82f6', // blue
        '#a855f7', // purple
        '#ffffff'  // white
      ];
    }

    mount() {
      if (this.host) return;
      this.host = document.createElement('div');
      this.host.id = 'lumi-annotate-toolbar';
      this.shadow = this.host.attachShadow({ mode: 'open' });
      this.shadow.innerHTML = this.render();
      document.body.appendChild(this.host);
      this.bindEvents();
    }

    unmount() {
      if (this.host) {
        this.host.remove();
        this.host = null;
      }
    }

    render() {
      return `
      <style>${STYLES}</style>
      <div class="toolbar">
        <div class="group">
          ${this.tools.map(t => `
            <button class="btn ${t.id === this.activeTool ? 'active' : ''}" 
                    data-tool="${t.id}" 
                    title="${t.id.charAt(0).toUpperCase() + t.id.slice(1)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                ${t.icon}
              </svg>
            </button>
          `).join('')}
        </div>
        
        <div class="divider"></div>
        
        <div class="group">
          ${this.colors.map(c => `
            <button class="color-btn ${c === this.activeColor ? 'active' : ''}" 
                    data-color="${c}" 
                    style="background-color: ${c}">
            </button>
          `).join('')}
        </div>

        <div class="divider"></div>

        <div class="group">
          <button class="btn" id="undo-btn" title="Undo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/>
            </svg>
          </button>
          <button class="btn" id="reset-btn" title="Clear All">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
            </svg>
          </button>
        </div>

        <div class="divider"></div>

        <div class="group">
          <button class="btn action-btn danger" id="cancel-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          <button class="btn action-btn primary" id="done-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Add to Chat</span>
          </button>
        </div>
      </div>
    `;
    }

    bindEvents() {
      const root = this.shadow;

      // Tools
      root.querySelectorAll('[data-tool]').forEach(btn => {
        btn.addEventListener('click', () => {
          const tool = btn.dataset.tool;
          this.setActiveTool(tool);
          this.eventBus.emit('annotate:tool', tool);
        });
      });

      // Colors
      root.querySelectorAll('[data-color]').forEach(btn => {
        btn.addEventListener('click', () => {
          const color = btn.dataset.color;
          this.setActiveColor(color);
          this.eventBus.emit('annotate:color', color);
        });
      });

      // Actions
      root.getElementById('undo-btn').addEventListener('click', () => this.eventBus.emit('annotate:undo'));
      root.getElementById('reset-btn').addEventListener('click', () => this.eventBus.emit('annotate:reset'));
      root.getElementById('cancel-btn').addEventListener('click', () => this.eventBus.emit('annotate:cancel'));
      root.getElementById('done-btn').addEventListener('click', () => this.eventBus.emit('annotate:submit'));
    }

    setActiveTool(tool) {
      this.activeTool = tool;
      this.shadow.querySelectorAll('[data-tool]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === tool);
      });
    }

    setActiveColor(color) {
      this.activeColor = color;
      this.shadow.querySelectorAll('[data-color]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.color === color);
      });
    }
  }

  class AnnotateManager {
      constructor(eventBus, stateManager, chromeBridge) {
          this.eventBus = eventBus;
          this.stateManager = stateManager;
          this.chromeBridge = chromeBridge;

          this.canvas = null;
          this.fabricCanvas = null;
          this.toolbar = null;
          this.isActive = false;

          this.currentTool = 'select';
          this.currentColor = '#ef4444';
          this.isDrawing = false;
          this.startPoint = null;
          this.activeObject = null;

          // Bind methods
          this.handleMouseDown = this.handleMouseDown.bind(this);
          this.handleMouseMove = this.handleMouseMove.bind(this);
          this.handleMouseUp = this.handleMouseUp.bind(this);
          this.handleResize = this.handleResize.bind(this);
          this.handleKeyDown = this.handleKeyDown.bind(this);
          this.updateToolbarPosition = this.updateToolbarPosition.bind(this);

          this.unsubscribers = [];
      }

      activate() {
          if (this.isActive) return;
          this.isActive = true;

          // Create canvas overlay
          this.canvas = document.createElement('canvas');
          this.canvas.id = 'lumi-annotate-canvas';
          this.canvas.style.cssText = 'position: fixed; top: 0; left: 0; z-index: 2147483646; cursor: crosshair;';
          document.body.appendChild(this.canvas);

          // Initialize Fabric
          this.fabricCanvas = new Xn(this.canvas, {
              width: window.innerWidth,
              height: window.innerHeight,
              selection: false // Manual selection handling
          });

          // Initialize Toolbar
          this.toolbar = new AnnotateToolbar(this.eventBus);
          this.toolbar.mount();
          this.updateToolbarPosition();

          // Bind Events
          this.bindEvents();

          // Set initial state
          this.setTool('select');
          this.setColor(this.currentColor);

          // Update state
          this.stateManager.set('ui.mode', 'screenshot'); // Reusing 'screenshot' mode for now
      }

      deactivate() {
          if (!this.isActive) return;
          this.isActive = false;

          // Cleanup Fabric
          if (this.fabricCanvas) {
              this.fabricCanvas.dispose();
              this.fabricCanvas = null;
          }

          // Remove DOM elements
          if (this.canvas) {
              this.canvas.remove();
              this.canvas = null;
          }

          if (this.toolbar) {
              this.toolbar.unmount();
              this.toolbar = null;
          }

          // Unbind events
          this.unbindEvents();

          // Reset state
          this.stateManager.set('ui.mode', 'idle');
      }

      bindEvents() {
          // Fabric events
          this.fabricCanvas.on('mouse:down', this.handleMouseDown);
          this.fabricCanvas.on('mouse:move', this.handleMouseMove);
          this.fabricCanvas.on('mouse:up', this.handleMouseUp);

          // Window events
          window.addEventListener('resize', this.handleResize);
          window.addEventListener('keydown', this.handleKeyDown);

          // Bus events
          this.unsubscribers.push(this.eventBus.on('annotate:tool', (tool) => this.setTool(tool)));
          this.unsubscribers.push(this.eventBus.on('annotate:color', (color) => this.setColor(color)));
          this.unsubscribers.push(this.eventBus.on('annotate:undo', () => this.undo()));
          this.unsubscribers.push(this.eventBus.on('annotate:reset', () => this.reset()));
          this.unsubscribers.push(this.eventBus.on('annotate:cancel', () => this.deactivate()));
          this.unsubscribers.push(this.eventBus.on('annotate:submit', () => this.captureAndSubmit()));

          // Dock state changes (for toolbar positioning)
          this.unsubscribers.push(this.stateManager.subscribe('ui.dockOpen', this.updateToolbarPosition));
          this.unsubscribers.push(this.stateManager.subscribe('ui.dockState', this.updateToolbarPosition));
      }

      unbindEvents() {
          window.removeEventListener('resize', this.handleResize);
          window.removeEventListener('keydown', this.handleKeyDown);

          // Unsubscribe from all bus/state events
          this.unsubscribers.forEach(unsubscribe => unsubscribe());
          this.unsubscribers = [];
      }

      handleResize() {
          if (this.fabricCanvas) {
              this.fabricCanvas.setDimensions({
                  width: window.innerWidth,
                  height: window.innerHeight
              });
              this.updateToolbarPosition();
          }
      }

      updateToolbarPosition() {
          if (!this.toolbar || !this.toolbar.host) return;

          const dockOpen = this.stateManager.get('ui.dockOpen') !== false;
          const dockWidth = 420; // Assumed width

          // If dock is open, center in the remaining space
          // Center X = (WindowWidth - DockWidth) / 2
          // But toolbar is fixed, so we set left: calc(50% - 210px) roughly?
          // Better: left: (WindowWidth - DockWidth) / 2

          if (dockOpen) {
              const availableWidth = window.innerWidth - dockWidth;
              const center = availableWidth / 2;
              this.toolbar.host.style.left = `${center}px`;
              this.toolbar.host.style.transform = 'translateX(-50%)';
          } else {
              this.toolbar.host.style.left = '50%';
              this.toolbar.host.style.transform = 'translateX(-50%)';
          }
      }

      handleKeyDown(e) {
          if (e.key === 'Delete' || e.key === 'Backspace') {
              const activeObjects = this.fabricCanvas.getActiveObjects();
              // If any active object is currently being edited (e.g. IText), do not delete
              if (activeObjects.some(obj => obj.isEditing)) return;

              if (activeObjects.length) {
                  this.fabricCanvas.discardActiveObject();
                  activeObjects.forEach((obj) => {
                      this.fabricCanvas.remove(obj);
                  });
                  this.fabricCanvas.requestRenderAll();
              }
          }
      }

      setTool(tool) {
          this.currentTool = tool;
          if (this.toolbar) this.toolbar.setActiveTool(tool);

          this.fabricCanvas.isDrawingMode = (tool === 'pen');
          this.fabricCanvas.selection = (tool === 'select');

          if (tool === 'pen') {
              this.fabricCanvas.freeDrawingBrush = new oo(this.fabricCanvas);
              this.fabricCanvas.freeDrawingBrush.color = this.currentColor;
              this.fabricCanvas.freeDrawingBrush.width = 3;
          }

          // Cursor handling
          this.fabricCanvas.defaultCursor = tool === 'select' ? 'default' : 'crosshair';
          this.fabricCanvas.hoverCursor = tool === 'select' ? 'move' : 'crosshair';
      }

      setColor(color) {
          this.currentColor = color;
          if (this.toolbar) this.toolbar.setActiveColor(color);

          // Update active object if any
          const activeObj = this.fabricCanvas.getActiveObject();
          if (activeObj) {
              if (activeObj.type === 'path') {
                  activeObj.set({ stroke: color });
              } else if (activeObj.type === 'i-text') {
                  activeObj.set({ fill: color });
              } else {
                  activeObj.set({ stroke: color });
              }
              this.fabricCanvas.requestRenderAll();
          }

          // Update brush
          if (this.fabricCanvas.freeDrawingBrush) {
              this.fabricCanvas.freeDrawingBrush.color = color;
          }
      }

      handleMouseDown(o) {
          if (this.currentTool === 'select' || this.currentTool === 'pen') return;

          this.isDrawing = true;
          const pointer = this.fabricCanvas.getPointer(o.e);
          this.startPoint = pointer;

          if (this.currentTool === 'rect') {
              this.activeObject = new jr({
                  left: pointer.x,
                  top: pointer.y,
                  width: 0,
                  height: 0,
                  fill: 'transparent',
                  stroke: this.currentColor,
                  strokeWidth: 3,
                  rx: 2,
                  ry: 2,
                  selectable: false
              });
              this.fabricCanvas.add(this.activeObject);
          } else if (this.currentTool === 'arrow') {
              // Simplified arrow: line + triangle head (implemented as a group or path later)
              // For MVP, let's use a Path
              const path = `M ${pointer.x} ${pointer.y} L ${pointer.x} ${pointer.y}`;
              this.activeObject = new no(path, {
                  stroke: this.currentColor,
                  strokeWidth: 3,
                  fill: 'transparent',
                  selectable: false,
                  objectCaching: false
              });
              this.fabricCanvas.add(this.activeObject);
          } else if (this.currentTool === 'text') {
              this.isDrawing = false; // Text is click-to-add
              const text = new No('', {
                  left: pointer.x,
                  top: pointer.y,
                  fontFamily: 'sans-serif',
                  fill: this.currentColor,
                  fontSize: 20,
                  selectable: true
              });
              this.fabricCanvas.add(text);
              this.fabricCanvas.setActiveObject(text);
              text.enterEditing();
              text.hiddenTextarea.focus();

              // Auto-switch to select after adding text
              this.setTool('select');
          }
      }

      handleMouseMove(o) {
          if (!this.isDrawing) return;
          const pointer = this.fabricCanvas.getPointer(o.e);

          if (this.currentTool === 'rect') {
              const w = Math.abs(pointer.x - this.startPoint.x);
              const h = Math.abs(pointer.y - this.startPoint.y);
              this.activeObject.set({ width: w, height: h });

              if (this.startPoint.x > pointer.x) {
                  this.activeObject.set({ left: pointer.x });
              }
              if (this.startPoint.y > pointer.y) {
                  this.activeObject.set({ top: pointer.y });
              }
          } else if (this.currentTool === 'arrow') {
              // Update path
              // M startX startY L endX endY
              // We need to redraw the arrow head too.
              // For simplicity, let's just draw a line for now, or use a custom class if we had one.
              // Re-creating path is expensive, but okay for MVP.

              // Better: use Line object
              // But we started with Path. Let's switch to Line for Arrow body?
              // Actually, let's just update the path data.
              // M startX startY L currentX currentY
              // Plus arrow head logic... omitted for brevity, just a line for now.
              `M ${this.startPoint.x} ${this.startPoint.y} L ${pointer.x} ${pointer.y}`;
              // this.activeObject.set({ path: ... }) is not simple in Fabric.
              // Let's remove and re-add.
              this.fabricCanvas.remove(this.activeObject);

              // Draw Arrow Head
              const headLength = 15;
              const angle = Math.atan2(pointer.y - this.startPoint.y, pointer.x - this.startPoint.x);
              const x1 = pointer.x - headLength * Math.cos(angle - Math.PI / 6);
              const y1 = pointer.y - headLength * Math.sin(angle - Math.PI / 6);
              const x2 = pointer.x - headLength * Math.cos(angle + Math.PI / 6);
              const y2 = pointer.y - headLength * Math.sin(angle + Math.PI / 6);

              const arrowPath = `M ${this.startPoint.x} ${this.startPoint.y} L ${pointer.x} ${pointer.y} M ${pointer.x} ${pointer.y} L ${x1} ${y1} M ${pointer.x} ${pointer.y} L ${x2} ${y2}`;

              this.activeObject = new no(arrowPath, {
                  stroke: this.currentColor,
                  strokeWidth: 3,
                  fill: 'transparent',
                  selectable: false,
                  strokeLineCap: 'round',
                  strokeLineJoin: 'round'
              });
              this.fabricCanvas.add(this.activeObject);
          }

          this.fabricCanvas.requestRenderAll();
      }

      handleMouseUp() {
          if (this.isDrawing) {
              this.isDrawing = false;
              if (this.activeObject) {
                  this.activeObject.setCoords();
                  this.activeObject.set({ selectable: true }); // Make it selectable now

                  // Auto-switch to select mode and select the object
                  this.setTool('select');
                  this.fabricCanvas.setActiveObject(this.activeObject);
                  this.fabricCanvas.requestRenderAll();

                  this.activeObject = null;
              }
          }
      }

      undo() {
          // Simple undo: remove last object
          const objects = this.fabricCanvas.getObjects();
          if (objects.length > 0) {
              this.fabricCanvas.remove(objects[objects.length - 1]);
          }
      }

      reset() {
          this.fabricCanvas.clear();
          this.fabricCanvas.setBackgroundColor('rgba(0,0,0,0)', this.fabricCanvas.renderAll.bind(this.fabricCanvas));
      }

      async captureAndSubmit() {
          if (this.isCapturing) return;
          this.isCapturing = true;

          // Hide toolbar for screenshot
          if (this.toolbar && this.toolbar.host) {
              this.toolbar.host.style.display = 'none';
          }

          // Deselect everything to remove selection handles
          this.fabricCanvas.discardActiveObject();
          this.fabricCanvas.requestRenderAll();

          // Wait a frame
          await new Promise(r => requestAnimationFrame(r));

          try {
              // Capture visible tab (includes our canvas overlay)
              const dataUrl = await this.chromeBridge.captureScreenshot();

              // Add to selection
              const screenshots = this.stateManager.get('selection.screenshots') || [];
              const newShot = {
                  id: 'shot-' + Date.now(),
                  dataUrl: dataUrl,
                  timestamp: Date.now(),
                  bbox: { // Full viewport
                      left: 0, top: 0,
                      width: window.innerWidth, height: window.innerHeight
                  }
              };

              this.stateManager.set('selection.screenshots', [...screenshots, newShot]);
              this.eventBus.emit('screenshot:captured', newShot);

              // Close annotate mode
              this.deactivate();

          } catch (err) {
              console.error('Screenshot failed:', err);
              this.eventBus.emit('screenshot:error', err);
              if (this.toolbar && this.toolbar.host) {
                  this.toolbar.host.style.display = 'block';
              }
          } finally {
              this.isCapturing = false;
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
        const workingDirectory = rawConfig?.workingDirectory
          || rawConfig?.config?.workingDirectory
          || null;
        const host = window.location?.host || '';
        const projectMatch = resolveProject(projects, window.location?.href);
        const projectAllowed = !!projectMatch?.project;

        try {
          const debugProject = projectMatch?.project
            ? {
                id: projectMatch.project.id,
                name: projectMatch.project.name,
                workingDirectory: projectMatch.project.workingDirectory
              }
            : null;
          // eslint-disable-next-line no-console
          console.log('[LUMI][HealthChecker] /health resolved', {
            healthy: !!result?.healthy,
            host,
            projectsCount: projects.length,
            workingDirectory,
            projectAllowed,
            project: debugProject
          });
        } catch (_) { /* ignore debug logging errors */ }

        this.stateManager.batch({
          'projects.allowed': projectAllowed,
          'projects.current': projectMatch?.project || null,
          'projects.list': projects,
          'server.workingDirectory': workingDirectory
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
      const host = (url.host || '').toLowerCase();
      const isFile = url.protocol === 'file:';
      const pathname = (url.pathname || '').toLowerCase();
      let best = null;
      let bestScore = -Infinity;
      for (const project of projects) {
        if (!project || project.enabled === false) continue;
        const hosts = Array.isArray(project.hosts) ? project.hosts : [];
        if (hosts.length === 0) {
          // Wildcard project: matches any URL with lowest priority
          const score = -1;
          if (score > bestScore) {
            bestScore = score;
            best = project;
          }
          continue;
        }
        for (const pattern of hosts) {
          const raw = String(pattern || '').trim().toLowerCase();
          if (!raw) continue;

          // file:// 页面支持路径前缀匹配
          if (isFile && (raw.startsWith('file:///') || raw.startsWith('/'))) {
            let prefix = raw;
            if (prefix.startsWith('file://')) {
              prefix = prefix.slice('file://'.length);
            }
            if (!pathname.startsWith(prefix)) continue;
            const score = 5000 + prefix.length;
            if (score > bestScore) {
              bestScore = score;
              best = project;
            }
            continue;
          }

          // 其它协议按 host pattern 匹配
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
  .history-meta { margin-top: 4px; font-size: 12px; color: var(--hint); }

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
  .footer { border-top: 1px solid var(--glass-border); padding: 12px 18px 16px; display: flex; flex-direction: column; gap: 24px; }

  .composer-top {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    border-radius: 12px;
    border: 1px solid var(--border);
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
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: var(--dock-fg);
    color: var(--dock-bg);
    display: grid;
    place-items: center;
    cursor: pointer;
    transition: transform 0.15s ease, opacity 0.2s ease, background 0.2s ease;
    position: relative;
    padding: 0;
  }
  .send:hover { transform: scale(1.05); }
  .send:active { transform: scale(0.95); }
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
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
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
    color: var(--text);
    flex: 1; /* Push chevron to right */
  }

  .timeline-chevron {
    color: var(--text-secondary);
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
    border: 1px solid var(--border);
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
    color: var(--text);
    background: transparent; /* Background handled by container */
    border: none; /* Border handled by container */
  }

  /* Summary Body Truncation Fix */
  .summary-body {
    font-size: 13px;
    line-height: 1.5;
    color: var(--text);
    margin-top: 8px;
    white-space: pre-wrap; /* Ensure wrapping */
    overflow-wrap: break-word; /* Prevent overflow */
    max-width: 100%;
  }

  /* Specific Entry Types */
  .timeline-entry.thinking .timeline-title {
    font-style: italic;
    color: var(--text-secondary);
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
    color: var(--text);
  }
  .timeline-file-stat {
    font-size: 10px;
    padding: 1px 4px;
    border-radius: 4px;
    background: var(--surface);
    color: var(--text-secondary);
  }
  .timeline-file-stat.added { color: var(--success, #10b981); background: color-mix(in srgb, var(--success, #10b981) 10%, transparent); }
  .timeline-file-stat.removed { color: var(--error, #ef4444); background: color-mix(in srgb, var(--error, #ef4444) 10%, transparent); }
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

  function cleanText(text = '') {
      if (!text) return '';
      return String(text)
          .replace(/\*\*(.*?)\*\*/g, '$1') // Bold
          .replace(/\*(.*?)\*/g, '$1')     // Italic
          .replace(/`(.*?)`/g, '$1')       // Code
          .trim();
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
                      title: 'Thinking...',
                      body: cleanText(c.text || c.resultSummary),
                      sourceChunkIds: c.id ? [c.id] : undefined
                  });
              }
          } else if (c.type === 'run') {
              // Look ahead for logs/errors associated with this run
              const logs = [];
              let status = EntryStatus.DONE;
              let errorMsg = null;
              let testSummary = null;

              // Consume subsequent logs/errors until next non-log chunk
              let j = i + 1;
              while (j < chunkArray.length) {
                  const next = chunkArray[j];
                  if (next.type === 'log') {
                      if (next.text) {
                          logs.push(next.text);
                          // Try to extract test summary from logs
                          if (/(\d+)\s+passing/.test(next.text)) {
                              testSummary = next.text.trim();
                          } else if (/(\d+)\s+failing/.test(next.text)) {
                              testSummary = next.text.trim();
                              status = EntryStatus.FAILED;
                          }
                      }
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

              // Refine title/body based on kind
              let title = c.cmd || 'Run command';
              let body = logs.join('\n');

              if (kind === EntryKind.TEST) {
                  if (status === EntryStatus.FAILED) {
                      title = 'Tests Failed';
                  } else if (testSummary) {
                      title = 'Tests Passed';
                  } else {
                      title = 'Ran Tests';
                  }
                  if (testSummary) {
                      body = testSummary + '\n\n' + body;
                  }
              }

              if (errorMsg) {
                  body = `${errorMsg}\n${body}`;
              }

              entries.push({
                  id: nextId(kind),
                  kind,
                  status,
                  title: cleanText(title),
                  body,
                  sourceChunkIds: c.id ? [c.id] : undefined
              });

          } else if (c.type === 'edit') {
              // Aggregate consecutive edits
              const files = [];
              const sourceIds = c.id ? [c.id] : [];

              // Process first edit
              files.push({
                  path: c.file,
                  added: c.added,
                  removed: c.removed
              });

              let j = i + 1;
              while (j < chunkArray.length) {
                  const next = chunkArray[j];
                  if (next.type === 'edit') {
                      files.push({
                          path: next.file,
                          added: next.added,
                          removed: next.removed
                      });
                      if (next.id) sourceIds.push(next.id);
                      j++;
                  } else {
                      break;
                  }
              }
              i = j - 1;

              const uniqueFiles = Array.from(new Set(files.map(f => f.path).filter(Boolean)));

              let title = '';
              if (uniqueFiles.length === 1) {
                  title = `Edited ${uniqueFiles[0]}`;
              } else {
                  title = `Edited ${uniqueFiles.length} files`;
              }

              entries.push({
                  id: nextId(EntryKind.FILE_CHANGE),
                  kind: EntryKind.FILE_CHANGE,
                  status: EntryStatus.DONE,
                  title,
                  files: uniqueFiles,
                  details: files, // Keep full details
                  sourceChunkIds: sourceIds
              });

          } else if (c.type === 'result') {
              if (c.resultSummary || c.text) {
                  entries.push({
                      id: nextId(EntryKind.FINAL),
                      kind: EntryKind.FINAL,
                      status: EntryStatus.DONE,
                      title: 'Result',
                      body: cleanText(c.resultSummary || c.text || ''),
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

      const summary = {
          status,
          title: null, // Deprecated in favor of timeline
          meta: {
              durationMs: typeof timing.durationMs === 'number' ? timing.durationMs : undefined,
              testsStatus
          },
          bullets: []
      };

      // Extract bullets from final result or edits
      const finalEntry = entries.findLast(e => e.kind === EntryKind.FINAL);
      if (finalEntry && finalEntry.body) {
          summary.bullets.push(finalEntry.body);
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
                <path d="M12 2l9 4.5v9L12 20l-9-4.5v-9L12 2z"></path>
                <circle cx="12" cy="11" r="3"></circle>
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
      this.footerEl = this.shadow.querySelector('.footer');
      this.inputEl = this.editorEl;
      this.sendBtn = this.shadow.getElementById('send-btn');
      this.engineSelect = this.shadow.getElementById('engine-select');
      this.engineShell = this.shadow.getElementById('engine');
      this.projectLabel = this.shadow.getElementById('project-name');
      this.toggleCollapse = null;
      this.toggleExpand = null;

      const settingsBtn = this.shadow.getElementById('gear');
      this.toggleBtn = null;
      settingsBtn.addEventListener('click', () => {
        try { chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }); } catch (_) { }
      });
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
              if (chip.dataset.shotId !== undefined) {
                e.preventDefault();
                e.stopPropagation();
                const rawId = chip.dataset.shotId;
                const numericId = Number(rawId);
                const shotId = Number.isNaN(numericId) ? rawId : numericId;
                this.eventBus.emit('screenshot:remove', shotId);
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
      this.stateManager.subscribe('server.workingDirectory', () => {
        this.updateProjectName(this.stateManager.get('projects.current'));
      });

      // Also listen for batched state updates so we react when HealthChecker
      // updates projects.current / server.workingDirectory via batch(...)
      try {
        this.eventBus.on('state:batch-update', (updates) => {
          if (!updates) return;
          if (Object.prototype.hasOwnProperty.call(updates, 'projects.current')
            || Object.prototype.hasOwnProperty.call(updates, 'server.workingDirectory')) {
            this.updateProjectName(this.stateManager.get('projects.current'));
          }
        });
      } catch (_) { /* ignore debug wiring errors */ }

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
      // Hide composer when viewing History
      if (this.footerEl) {
        this.footerEl.style.display = tab === 'history' ? 'none' : 'block';
      }
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

      const title = turnSummary?.title
        || result.title
        || (resultChunks.find((c) => c?.type === 'result' && c.resultSummary)?.resultSummary)
        || '';
      const description = (() => {
        if (turnSummary && Array.isArray(turnSummary.bullets) && turnSummary.bullets.length) {
          return turnSummary.bullets[0];
        }
        let text =
          result.description ||
          (resultChunks.find((c) => c?.type === 'result' && c.text)?.text) ||
          msg.text ||
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

      // If we have a description, show it. This is the "Result" text the user missed.
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
      } else if (title) {
        // Fallback to title if no description
        const titleEl = doc.createElement('div');
        titleEl.className = 'summary-title';
        titleEl.textContent = title;
        container.appendChild(titleEl);
      }

      return container;
    }

    cleanMarkdown(text = '') {
      if (!text) return '';
      return String(text)
        .replace(/\*\*(.*?)\*\*/g, '$1') // Bold
        .replace(/\*(.*?)\*/g, '$1')     // Italic
        .replace(/`(.*?)`/g, '$1')       // Code
        .replace(/^#+\s+/, '')           // Headers
        .trim();
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

      const hasTimeline = timelineEntries.length > 0;
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
      } else if (state === 'streaming') {
        // If streaming but no entries yet (e.g. just started), show placeholder or nothing
        // We don't want the old renderTimeline fallback.
        const placeholder = doc.createElement('div');
        placeholder.className = 'timeline-placeholder';
        placeholder.textContent = 'Thinking...';
        body.appendChild(placeholder);
      } else {
        const placeholder = doc.createElement('div');
        placeholder.className = 'timeline-placeholder';
        placeholder.textContent = 'No events to display.';
        body.appendChild(placeholder);
      }

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

      entries.forEach((e) => {
        // Clean the title before rendering
        const cleanedEntry = { ...e, title: this.cleanMarkdown(e.title) };

        let item = null;
        switch (cleanedEntry.kind) {
          case EntryKind.THINKING: item = this.renderThinkingEntry(doc, cleanedEntry); break;
          case EntryKind.COMMAND: item = this.renderCommandEntry(doc, cleanedEntry); break;
          case EntryKind.FILE_CHANGE: item = this.renderEditEntry(doc, cleanedEntry); break;
          case EntryKind.TEST: item = this.renderTestEntry(doc, cleanedEntry); break;
          case EntryKind.ERROR: item = this.renderErrorEntry(doc, cleanedEntry); break;
          case EntryKind.FINAL: item = this.renderFinalEntry(doc, cleanedEntry); break;
          default: item = this.renderGenericEntry(doc, cleanedEntry);
        }
        if (item) container.appendChild(item);
      });

      return container;
    }

    renderThinkingEntry(doc, e) {
      return this.renderTimelineEntry(doc, e, {
        icon: this.renderEntryIcon(doc, e.kind),
        title: e.title,
        body: e.body, // Thinking content
        isThinking: true
      });
    }

    renderCommandEntry(doc, e) {
      return this.renderTimelineEntry(doc, e, {
        icon: this.renderEntryIcon(doc, e.kind),
        title: e.title,
        body: e.body, // Output logs
        detailsLabel: 'Show output'
      });
    }

    renderEditEntry(doc, e) {
      const item = this.renderTimelineEntry(doc, e, {
        icon: this.renderEntryIcon(doc, e.kind),
        title: e.title,
        // Custom body for file list
      });

      // Add file list to body if available
      if (e.details && Array.isArray(e.details)) {
        const fileList = doc.createElement('div');
        fileList.className = 'timeline-file-list';
        e.details.forEach(f => {
          const row = doc.createElement('div');
          row.className = 'timeline-file';
          const name = doc.createElement('span');
          name.textContent = f.path;
          row.appendChild(name);

          if (f.added) {
            const added = doc.createElement('span');
            added.className = 'timeline-file-stat added';
            added.textContent = `+${f.added}`;
            row.appendChild(added);
          }
          if (f.removed) {
            const removed = doc.createElement('span');
            removed.className = 'timeline-file-stat removed';
            removed.textContent = `-${f.removed}`;
            row.appendChild(removed);
          }
          fileList.appendChild(row);
        });

        // Append to content
        const content = item.querySelector('.timeline-content');
        if (content) content.appendChild(fileList);
      }

      return item;
    }

    renderTestEntry(doc, e) {
      return this.renderTimelineEntry(doc, e, {
        icon: this.renderEntryIcon(doc, e.kind),
        title: e.title,
        body: e.body,
        detailsLabel: 'Show test output'
      });
    }

    renderErrorEntry(doc, e) {
      return this.renderTimelineEntry(doc, e, {
        icon: this.renderEntryIcon(doc, e.kind),
        title: e.title,
        body: e.body,
        detailsLabel: 'Show error details'
      });
    }

    renderFinalEntry(doc, e) {
      // Usually we don't show final entry in timeline if it's just a result summary, 
      // but if it has body we might.
      // For now, let's skip it if it duplicates the main result, or show it as a checkmark.
      return this.renderTimelineEntry(doc, e, {
        icon: this.renderEntryIcon(doc, e.kind),
        title: e.title,
        body: e.body
      });
    }

    renderGenericEntry(doc, e) {
      return this.renderTimelineEntry(doc, e, {
        icon: this.renderEntryIcon(doc, 'default'),
        title: e.title || e.summary,
        body: e.body
      });
    }

    renderTimelineEntry(doc, e, options = {}) {
      const el = doc.createElement('div');
      el.className = `timeline-entry ${e.status || ''} ${e.kind || ''}`;

      if (options.icon) {
        el.appendChild(options.icon);
      }

      const content = doc.createElement('div');
      content.className = 'timeline-content';

      const header = doc.createElement('div');
      header.className = 'timeline-header';
      // Make header clickable if there is a body to toggle
      if (options.body && !options.isThinking) {
        header.style.cursor = 'pointer';
        header.classList.add('clickable');
        header.onclick = () => {
          el.classList.toggle('expanded');
        };
      }

      const title = doc.createElement('div');
      title.className = 'timeline-title';
      title.textContent = options.title || '';
      header.appendChild(title);

      // Add chevron if expandable
      if (options.body && !options.isThinking) {
        const chevron = doc.createElement('span');
        chevron.className = 'timeline-chevron';
        chevron.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
        header.appendChild(chevron);
      }

      // Duration could be added here if available in entry

      content.appendChild(header);

      if (options.body) {
        if (options.isThinking) {
          const body = doc.createElement('div');
          body.className = 'timeline-body';
          body.textContent = options.body;
          content.appendChild(body);
        } else {
          // Hidden by default, toggled via .expanded class on parent
          const details = doc.createElement('div');
          details.className = 'timeline-details-body';

          const pre = doc.createElement('div');
          pre.className = 'timeline-pre';
          pre.textContent = options.body;
          details.appendChild(pre);

          content.appendChild(details);
        }
      }

      // Add file list to body if available (for edit entries)
      if (e.details && Array.isArray(e.details) && e.kind === EntryKind.FILE_CHANGE) ;

      el.appendChild(content);
      return el;
    }

    renderEntryIcon(doc, kind) {
      const span = doc.createElement('span');
      span.className = 'timeline-icon';

      // SVG Icons
      let svgPath = '';
      switch (kind) {
        case EntryKind.THINKING:
          // Brain or Thought Bubble
          svgPath = '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>'; // Message bubble
          break;
        case EntryKind.COMMAND:
          // Terminal
          svgPath = '<polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line>';
          break;
        case EntryKind.TEST:
          // Beaker
          svgPath = '<path d="M10 2v7.31"/><path d="M14 2v7.31"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/>';
          break;
        case EntryKind.FILE_CHANGE:
          // Edit/Pencil
          svgPath = '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>';
          break;
        case EntryKind.FINAL:
          // Check
          svgPath = '<polyline points="20 6 9 17 4 12"></polyline>';
          break;
        case EntryKind.ERROR:
          // Alert
          svgPath = '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>';
          break;
        default:
          // Dot
          svgPath = '<circle cx="12" cy="12" r="2"></circle>';
      }

      span.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg>`;
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
          <div class="history-meta">${this.timeAgo(session.updatedAt || session.createdAt)}</div>
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

      try {
        const serverWd = this.stateManager.get('server.workingDirectory');
        const debugProject = project && typeof project === 'object'
          ? {
            id: project.id,
            name: project.name,
            workingDirectory: project.workingDirectory
          }
          : null;
        // eslint-disable-next-line no-console
        console.log('[LUMI][Dock] updateProjectName', {
          project: debugProject,
          serverWorkingDirectory: serverWd
        });
      } catch (_) { /* ignore debug logging errors */ }

      const projectAllowed = this.stateManager.get('projects.allowed');

      // If there is no mapped project or the host is blocked, treat as unmapped
      if (!project || projectAllowed === false) {
        this.projectLabel.textContent = 'Lumi — Unmapped Page';
        return;
      }

      // Prefer the matched project's working directory as identity when available
      try {
        const projectWd = project && typeof project === 'object' ? project.workingDirectory : null;
        if (projectWd && typeof projectWd === 'string') {
          const cleaned = projectWd.replace(/[\\/]+$/, '');
          const parts = cleaned.split(/[\\/]/);
          const base = parts[parts.length - 1] || cleaned;
          this.projectLabel.textContent = `Lumi — ${base}`;
          return;
        }
      } catch (_) { /* ignore */ }

      // Fallback: use explicit project name when available
      if (project && typeof project === 'object') {
        const name = project.name || project.id || 'Linked Project';
        this.projectLabel.textContent = `Lumi — ${name}`;
        return;
      }

      this.projectLabel.textContent = 'Lumi — Unmapped Page';
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
      this.sendBtn.classList.toggle('processing', !!isProcessing);
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
        // Skip screenshot chips (they have data-shot-id instead of data-index)
        if (chip.dataset.shotId !== undefined) return;

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
        // Skip screenshot chips
        if (chip.dataset.shotId !== undefined) return;

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
        try {
          this.eventBus.emit('screenshot:remove', id);
        } catch (err) {
          console.error('[LUMI] Error emitting screenshot:remove', err);
        }
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
      const existing = this.editorEl.querySelectorAll('.chip[data-shot-id]');
      existing.forEach(n => n.remove());

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
        const presentElements = new Set();
        const presentShotIds = new Set();
        chips.forEach((chip) => {
          if (!chip || !chip.dataset) return;
          if (chip.dataset.index !== undefined) {
            const idx = Number(chip.dataset.index || '-1');
            if (idx >= 0) presentElements.add(idx);
            return;
          }
          if (chip.dataset.shotId !== undefined) {
            presentShotIds.add(String(chip.dataset.shotId));
          }
        });

        const elements = this.stateManager.get('selection.elements') || [];
        if (elements.length) {
          const toRemove = [];
          for (let i = 0; i < elements.length; i += 1) {
            if (!presentElements.has(i)) toRemove.push(i);
          }
          if (toRemove.length) {
            toRemove.sort((a, b) => b - a).forEach((idx) => this.eventBus.emit('element:removed', idx));
          }
        }

        const screenshots = this.stateManager.get('selection.screenshots') || [];
        if (screenshots.length) {
          const staleShots = [];
          screenshots.forEach((shot) => {
            if (!shot || shot.id === undefined) return;
            if (!presentShotIds.has(String(shot.id))) {
              staleShots.push(shot.id);
            }
          });
          if (staleShots.length) {
            staleShots.forEach((id) => this.eventBus.emit('screenshot:remove', id));
          }
        }
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

  const TEXT_TAGS = new Set([
    'p', 'span', 'strong', 'em', 'label', 'li', 'dt', 'dd',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
  ]);

  const BUTTON_TAGS = new Set(['button']);
  const LINK_TAGS = new Set(['a']);
  const INPUT_TAGS = new Set(['input', 'textarea', 'select']);
  const IMAGE_TAGS = new Set(['img', 'picture', 'figure']);

  const CONTROL_DEFS = {
    text: {
      id: 'text',
      label: 'Text',
      type: 'textarea',
      group: 'content'
    },
    textColor: {
      id: 'color',
      label: 'Text Color',
      type: 'color',
      group: 'color',
      property: 'color'
    },
    backgroundColor: {
      id: 'backgroundColor',
      label: 'Background',
      type: 'color',
      group: 'color',
      property: 'backgroundColor'
    },
    fontSize: {
      id: 'fontSize',
      label: 'Font Size',
      type: 'number',
      unit: 'px',
      group: 'typography',
      property: 'fontSize',
      min: 8,
      max: 128
    },
    fontWeight: {
      id: 'fontWeight',
      label: 'Font Weight',
      type: 'select',
      options: ['300', '400', '500', '600', '700'],
      group: 'typography',
      property: 'fontWeight'
    },
    lineHeight: {
      id: 'lineHeight',
      label: 'Line Height',
      type: 'number',
      unit: null,
      step: 0.05,
      min: 0.5,
      max: 3,
      group: 'typography',
      property: 'lineHeight'
    },
    borderRadius: {
      id: 'borderRadius',
      label: 'Border Radius',
      type: 'number',
      unit: 'px',
      group: 'appearance',
      property: 'borderRadius',
      min: 0,
      max: 128
    },
    padding: {
      id: 'padding',
      label: 'Padding',
      type: 'padding',
      group: 'spacing',
      property: 'padding'
    },
    boxShadow: {
      id: 'boxShadow',
      label: 'Shadow',
      type: 'shadow',
      group: 'effects',
      property: 'boxShadow'
    }
  };

  const GROUP_ORDER = ['content', 'color', 'typography', 'spacing', 'appearance', 'effects'];

  const GROUP_LABELS = {
    content: 'Content',
    color: 'Color',
    typography: 'Typography',
    spacing: 'Spacing',
    appearance: 'Appearance',
    effects: 'Effects'
  };

  function inferType(element) {
    const tag = element.tagName?.toLowerCase() || '';

    if (BUTTON_TAGS.has(tag)) return 'button';
    if (LINK_TAGS.has(tag)) return 'link';
    if (INPUT_TAGS.has(tag)) return 'form';
    if (IMAGE_TAGS.has(tag)) return 'image';
    if (TEXT_TAGS.has(tag)) return 'text';

    return 'container';
  }

  function supportsTextControls(elementType) {
    return elementType === 'text' || elementType === 'button' || elementType === 'link' || elementType === 'form';
  }

  function supportsBackground(elementType) {
    return elementType !== 'image';
  }

  function supportsTypography(elementType) {
    return elementType !== 'image';
  }

  function supportsPadding(elementType) {
    return elementType !== 'image';
  }

  function supportsShadow(elementType) {
    return elementType !== 'form';
  }

  function getElementSchema(element) {
    if (!element) {
      return {
        type: 'unknown',
        controls: new Map(),
        order: []
      };
    }

    const type = inferType(element);
    const controls = new Map();

    if (supportsTextControls(type)) {
      controls.set('content', [CONTROL_DEFS.text]);
    }

    const colorControls = [];
    colorControls.push(CONTROL_DEFS.textColor);
    if (supportsBackground(type)) {
      colorControls.push(CONTROL_DEFS.backgroundColor);
    }
    controls.set('color', colorControls);

    if (supportsTypography(type)) {
      controls.set('typography', [
        CONTROL_DEFS.fontSize,
        CONTROL_DEFS.fontWeight,
        CONTROL_DEFS.lineHeight
      ]);
    }

    if (supportsPadding(type)) {
      controls.set('spacing', [CONTROL_DEFS.padding]);
    }

    controls.set('appearance', [CONTROL_DEFS.borderRadius]);

    if (supportsShadow(type)) {
      controls.set('effects', [CONTROL_DEFS.boxShadow]);
    }

    const order = GROUP_ORDER.filter(group => controls.has(group));

    return {
      type,
      controls,
      order,
      labels: GROUP_LABELS
    };
  }

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

  /**
   * TokenScanner - Scans the page for Design Tokens (CSS Variables & Common Values)
   */

  class TokenScanner {
      constructor() {
          this.tokens = {
              colors: [],
              spacing: [],
              typography: [],
              radius: []
          };
          this.scanned = false;
      }

      scan() {
          if (this.scanned) return this.tokens;

          const colorVars = new Map();
          const spacingVars = new Map();
          const radiusVars = new Map();

          // 1. Scan CSS Variables from document.styleSheets (if accessible)
          // Note: accessing cssRules can be blocked by CORS for external sheets.
          // We'll try our best, and fallback to computed styles on :root.

          // Scan :root computed style for variables
          window.getComputedStyle(document.documentElement);
          // There is no API to enumerate all defined variables on an element.
          // We have to rely on iterating styleSheets or known conventions.
          // However, we can try to guess common prefixes or just rely on what we find in sheets.

          try {
              Array.from(document.styleSheets).forEach(sheet => {
                  try {
                      Array.from(sheet.cssRules).forEach(rule => {
                          if (rule.type === 1 && (rule.selectorText === ':root' || rule.selectorText === 'html' || rule.selectorText === 'body')) {
                              const style = rule.style;
                              for (let i = 0; i < style.length; i++) {
                                  const prop = style[i];
                                  if (prop.startsWith('--')) {
                                      const val = style.getPropertyValue(prop).trim();
                                      this.categorizeVar(prop, val, { colorVars, spacingVars, radiusVars });
                                  }
                              }
                          }
                      });
                  } catch (e) {
                      // CORS or other access error, ignore
                  }
              });
          } catch (e) { }

          // Convert Maps to Arrays
          this.tokens.colors = Array.from(colorVars.entries()).map(([name, value]) => ({ name, value }));
          this.tokens.spacing = Array.from(spacingVars.entries()).map(([name, value]) => ({ name, value }));
          this.tokens.radius = Array.from(radiusVars.entries()).map(([name, value]) => ({ name, value }));

          // Sort tokens
          this.tokens.spacing.sort((a, b) => this.parsePx(a.value) - this.parsePx(b.value));

          this.scanned = true;
          return this.tokens;
      }

      categorizeVar(name, value, { colorVars, spacingVars, radiusVars }) {
          // Colors
          if (name.includes('color') || name.includes('bg') || name.includes('text') || name.includes('primary') || name.includes('accent') || name.includes('gray') || value.startsWith('#') || value.startsWith('rgb') || value.startsWith('hsl')) {
              // Basic check if value is a color
              if (this.isColor(value)) {
                  colorVars.set(name, value);
                  return;
              }
          }

          // Spacing
          if (name.includes('spacing') || name.includes('gap') || name.includes('margin') || name.includes('padding')) {
              if (value.endsWith('px') || value.endsWith('rem') || value.endsWith('em')) {
                  spacingVars.set(name, value);
                  return;
              }
          }

          // Radius
          if (name.includes('radius')) {
              radiusVars.set(name, value);
              return;
          }
      }

      isColor(value) {
          const s = new Option().style;
          s.color = value;
          return s.color !== '';
      }

      parsePx(value) {
          if (value.endsWith('px')) return parseFloat(value);
          if (value.endsWith('rem')) return parseFloat(value) * 16; // Assumption
          return 0;
      }

      getColors() {
          this.scan();
          return this.tokens.colors;
      }

      getSpacing() {
          this.scan();
          return this.tokens.spacing;
      }
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
          this.intents = {}; // Store semantic intents for keys
          this.bodyScrollLocked = false;
          this.previewHistory = [];
          this.lastPreviewState = {};

          this._blockerEnabled = false;
          this._blockRegistrations = [];
          this._iframeWindow = null;

          this.tokenScanner = new TokenScanner();
          this.tokens = { colors: [], spacing: [], radius: [] };
      }

      mount() {
          if (this.container) return;
          this.backdrop = document.createElement('div');
          this.backdrop.id = 'dock-edit-overlay';
          this.backdrop.style.cssText = `
      position: fixed; top: 0; right: 0; bottom: 0; left: auto; width: 420px;
      background: color-mix(in srgb, var(--dock-fg, #0f172a) 22%, transparent);
      backdrop-filter: blur(8px); z-index: 2147483647; display: none;
    `;
          this.backdrop.addEventListener('click', () => this.close(true));

          this.container = document.createElement('div');
          this.container.id = 'dock-edit-modal';
          this.container.style.cssText = `
      position: fixed; right: 24px; top: 72px; width: 360px;
      background: var(--dock-bg); backdrop-filter: blur(24px);
      border-radius: var(--radius-panel, 18px); border: 1px solid var(--dock-stroke);
      box-shadow: var(--shadow); padding: 20px 22px; display: none;
      z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      color: var(--dock-fg); max-height: calc(100vh - 144px);
      overflow: hidden; flex-direction: column;
    `;

          this.container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-shrink:0;">
        <div id="dock-edit-title" style="font-weight:600;font-size:14px;">Edit</div>
        <button id="dock-edit-close" style="border:none;background:transparent;font-size:18px;cursor:pointer;color:var(--dock-fg-2);">×</button>
      </div>
      <div id="dock-edit-scroll" style="flex:1;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;padding-right:4px;min-height:0;">
        <form id="dock-edit-form" class="dock-edit-form" style="display:flex;flex-direction:column;gap:18px;"></form>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px;flex-shrink:0;">
        <button type="button" id="dock-edit-reset" style="border:1px solid var(--dock-stroke);background:transparent;border-radius:12px;padding:6px 12px;color:var(--dock-fg-2);cursor:pointer;margin-right:auto;">Reset</button>
        <button type="button" id="dock-edit-undo" style="border:1px solid var(--dock-stroke);background:color-mix(in srgb, var(--dock-bg) 94%, transparent);border-radius:12px;padding:6px 12px;color:var(--dock-fg-2);cursor:pointer;">Undo</button>
        <button type="button" id="dock-edit-apply" style="border:1px solid var(--dock-stroke);background:var(--surface, color-mix(in srgb, var(--dock-bg) 96%, transparent));border-radius:12px;padding:6px 12px;color:var(--dock-fg);cursor:pointer;">Apply</button>
      </div>
    `;

          this.form = this.container.querySelector('#dock-edit-form');
          this.scrollContainer = this.container.querySelector('#dock-edit-scroll');
          this.container.setAttribute('tabindex', '-1');
          this.container.querySelector('#dock-edit-close').addEventListener('click', () => this.close(true));
          this.container.querySelector('#dock-edit-reset').addEventListener('click', () => this.resetChanges());
          this.undoBtn = this.container.querySelector('#dock-edit-undo');
          if (this.undoBtn) this.undoBtn.addEventListener('click', () => { try { this.eventBus.emit('wysiwyg:undo'); } catch (_) { } });
          this.applyBtn = this.container.querySelector('#dock-edit-apply');
          if (this.applyBtn) this.applyBtn.addEventListener('click', () => this.applyChanges());

          // Prevent scroll events from bubbling
          this.container.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
          this.container.addEventListener('keydown', (e) => {
              if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
                  e.preventDefault();
                  try { this.eventBus.emit('wysiwyg:undo'); } catch (_) { }
              }
          });

          if (!this.mountRoot) return;
          this.mountRoot.appendChild(this.backdrop);
          this.mountRoot.appendChild(this.container);
          this.updateUndoAvailability();

          // Listen for inline edit sync
          this.eventBus.on('wysiwyg:sync', ({ text }) => {
              if (this.current.text !== text) {
                  this.current.text = text;
                  const textarea = this.form.querySelector('textarea');
                  if (textarea) textarea.value = text;
                  this.syncPending();
              }
          });

          // Track viewport iframe for interaction blocking
          this.eventBus.on('viewport:iframe-ready', ({ iframe }) => {
              try {
                  this._iframeWindow = iframe?.contentWindow || null;
                  if (this._blockerEnabled) {
                      this._attachBlockers(this._iframeWindow);
                  }
              } catch (_) {
                  this._iframeWindow = null;
              }
          });
      }

      open({ index, element } = {}) {
          this.mount();
          const selection = this.stateManager.get('selection.elements') || [];
          if (!Array.isArray(selection) || selection.length === 0) return;

          let indices = [];
          if (typeof index === 'number' && selection[index]) indices = [index];
          else if (element) {
              const found = selection.findIndex(item => item.element === element);
              if (found >= 0) indices = [found];
          }
          if (!indices.length) indices = selection.map((_, i) => i);

          this.indices = indices;
          this.targets = indices.map(i => selection[i] && selection[i].element ? { element: selection[i].element, selector: selection[i].selector } : null).filter(Boolean);

          if (!this.targets.length) return;

          // Scan tokens on open
          this.tokens = this.tokenScanner.scan();

          this.current = {};
          this.intents = {};
          this.collectBase();
          this.renderForm();

          this.stateManager.set('wysiwyg.pending', null);
          this.stateManager.set('wysiwyg.active', true);
          this.previewHistory = [];
          this.lastPreviewState = {};

          if (!this.bodyScrollLocked) {
              document.body.classList.add('lumi-scroll-lock');
              this.bodyScrollLocked = true;
          }
          this.positionOverlay();
          this.backdrop.style.display = 'block';
          this.container.style.display = 'flex';
          try { this.container.focus({ preventScroll: true }); } catch (_) { }

          // Block page interactions via event capture
          this.enableInteractionBlocker();
      }

      close(cancel = false) {
          if (!this.container) return;
          if (cancel) this.restoreBase();
          this.backdrop.style.display = 'none';
          this.container.style.display = 'none';
          window.removeEventListener('resize', this._onResize);
          this.form.innerHTML = '';
          this.current = {};
          this.intents = {};
          this.targets = [];
          this.indices = [];
          this.stateManager.set('wysiwyg.pending', null);
          this.stateManager.set('wysiwyg.active', false);
          if (this.bodyScrollLocked) {
              document.body.classList.remove('lumi-scroll-lock');
              this.bodyScrollLocked = false;
          }

          // Remove page blocker
          this.disableInteractionBlocker();
      }

      enableInteractionBlocker() {
          if (this._blockerEnabled) return;
          // Blur active element to avoid lingering focus triggers
          try { if (document.activeElement) document.activeElement.blur(); } catch (_) { }

          // Opportunistically capture current viewport iframe if present
          if (!this._iframeWindow) {
              try {
                  const iframe = document.getElementById('lumi-viewport-iframe');
                  if (iframe && iframe.contentWindow) this._iframeWindow = iframe.contentWindow;
              } catch (_) { this._iframeWindow = null; }
          }

          this._blockerEnabled = true;
          this._blockRegistrations = [];
          this._attachBlockers(window);
          if (this._iframeWindow) this._attachBlockers(this._iframeWindow);
      }

      disableInteractionBlocker() {
          if (!this._blockerEnabled) return;
          this._blockRegistrations.forEach((entry) => {
              try {
                  if (typeof entry === 'function') entry();
                  else if (entry && typeof entry.remove === 'function') entry.remove();
              } catch (_) { }
          });
          this._blockRegistrations = [];
          this._blockerEnabled = false;
      }

      _attachBlockers(win) {
          if (!win) return;
          // Avoid duplicate attachment
          if (this._blockRegistrations.some(entry => entry && entry.win === win)) return;

          const registrations = [];
          const add = (type, handler, options = { capture: true }) => {
              try {
                  win.addEventListener(type, handler, options);
                  registrations.push({ win, remove: () => win.removeEventListener(type, handler, options) });
              } catch (_) { }
          };

          const pointerHandler = (e) => this._handleBlockEvent(e);
          const keyHandler = (e) => this._handleKeyBlock(e);
          const focusHandler = (e) => this._handleFocusBlock(e);

          ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick', 'auxclick', 'contextmenu'].forEach(evt => add(evt, pointerHandler));
          add('keydown', keyHandler);
          add('focusin', focusHandler);

          this._blockRegistrations.push(...registrations);
      }

      _isLumiTarget(target) {
          if (!target) return false;
          if (this.container && this.container.contains(target)) return true;
          if (this.backdrop && this.backdrop.contains(target)) return true;
          if (target.id === 'lumi-dock-root' || target.closest?.('#lumi-dock-root')) return true;
          if (target.id === 'dock-edit-overlay' || target.closest?.('#dock-edit-overlay')) return true;
          if (target.id === 'dock-edit-modal' || target.closest?.('#dock-edit-modal')) return true;
          if (target.id === 'lumi-dock-launcher' || target.closest?.('#lumi-dock-launcher')) return true;
          if (target.closest?.('#lumi-bubble-container')) return true;
          if (target.closest?.('#lumi-top-banner')) return true;
          if (target.closest?.('#lumi-interaction-bubble')) return true;
          if (target.closest?.('#lumi-controls-overlay')) return true;
          if (target.classList?.contains('lumi-highlight') || target.closest?.('.lumi-highlight')) return true;
          if (target.classList?.contains('lumi-screenshot-overlay') || target.closest?.('.lumi-screenshot-overlay')) return true;
          if (target.classList?.contains('lumi-highlight-pen')) return true;
          // Shadow host check for dock
          try {
              const root = target.getRootNode && target.getRootNode();
              if (root && root.host && root.host.id === 'lumi-dock-root') return true;
          } catch (_) { }
          return false;
      }

      _isSelectedTextTarget(target) {
          if (!target) return false;
          return this.targets.some(({ element }) => {
              if (!element) return false;
              return (element === target || element.contains(target)) && this.canEditText(element);
          });
      }

      _handleBlockEvent(e) {
          const target = e.target;
          if (this._isLumiTarget(target)) return;

          if (this._isSelectedTextTarget(target)) {
              if (e.type === 'dblclick') return; // allow inline text edits
              if (e.type === 'mousedown' || e.type === 'mouseup' || e.type === 'pointerdown' || e.type === 'pointerup') return;
              if (e.type === 'click') { e.preventDefault(); e.stopPropagation(); return; }
          }

          // Block all other interactions
          e.preventDefault();
          e.stopPropagation();
      }

      _handleKeyBlock(e) {
          const target = e.target;
          if (this._isLumiTarget(target)) return;
          if (this._isSelectedTextTarget(target)) return;
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
              e.preventDefault();
              e.stopPropagation();
          }
      }

      _handleFocusBlock(e) {
          const target = e.target;
          if (this._isLumiTarget(target)) return;
          if (this._isSelectedTextTarget(target)) return;
          e.preventDefault();
          e.stopPropagation();
          this._focusModal();
      }

      _focusModal() {
          try {
              const focusable = this.container?.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
              if (focusable) focusable.focus({ preventScroll: true });
              else if (this.container) this.container.focus({ preventScroll: true });
          } catch (_) { }
      }

      // ... (getVar, positionOverlay, collectBase, restoreBase, restoreBaseline same as before) ...
      getVar(name) { try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || ''; } catch (_) { return ''; } }
      positionOverlay() { /* ... same implementation ... */
          try {
              const host = document.getElementById('lumi-dock-root');
              const rect = host ? host.getBoundingClientRect() : null;
              const fallbackWidth = this.stateManager.get('ui.dockWidth') || 420;
              const hasVisibleDock = !!rect && rect.width >= 40 && rect.right > 0;
              const dockWidth = Math.round(hasVisibleDock ? rect.width : fallbackWidth);
              if (hasVisibleDock) {
                  const dockLeft = Math.max(0, Math.round(rect.left));
                  this.backdrop.style.left = dockLeft + 'px';
                  this.backdrop.style.right = '';
                  this.backdrop.style.width = dockWidth + 'px';
              } else {
                  this.backdrop.style.left = '';
                  this.backdrop.style.right = '0px';
                  this.backdrop.style.width = dockWidth + 'px';
              }
              const maxModal = Math.max(260, dockWidth - 48);
              const modalWidth = Math.min(360, maxModal);
              this.container.style.width = modalWidth + 'px';
              this.container.style.right = '24px';
          } catch (_) { }
          if (!this._onResize) {
              this._onResize = () => this.positionOverlay();
          }
          window.addEventListener('resize', this._onResize, { passive: true });
      }

      collectBase() {
          const base = {
              text: null, color: null, backgroundColor: null, fontSize: null, fontWeight: null, lineHeight: null,
              paddingTop: null, paddingRight: null, paddingBottom: null, paddingLeft: null,
              marginTop: null, marginRight: null, marginBottom: null, marginLeft: null,
              borderRadius: null, boxShadow: null
          };
          const inline = [];
          this.targets.forEach(({ element }) => {
              const style = window.getComputedStyle(element);

              // Calculate proper line height (convert px to unitless ratio if needed)
              let lineHeight = style.lineHeight;
              if (lineHeight && lineHeight !== 'normal' && lineHeight.includes('px')) {
                  const lineHeightPx = parseFloat(lineHeight);
                  const fontSizePx = parseFloat(style.fontSize);
                  if (fontSizePx > 0) {
                      lineHeight = (lineHeightPx / fontSizePx).toFixed(2);
                  }
              }

              const entry = {
                  text: element.textContent,
                  color: style.color, backgroundColor: style.backgroundColor,
                  fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: lineHeight,
                  paddingTop: style.paddingTop, paddingRight: style.paddingRight, paddingBottom: style.paddingBottom, paddingLeft: style.paddingLeft,
                  marginTop: style.marginTop, marginRight: style.marginRight, marginBottom: style.marginBottom, marginLeft: style.marginLeft,
                  borderRadius: style.borderRadius, boxShadow: style.boxShadow,
                  inline: { ...element.style }
              };
              inline.push(entry);
              Object.keys(base).forEach((key) => {
                  if (base[key] === null) base[key] = entry[key];
                  else if (base[key] !== entry[key]) base[key] = 'mixed';
              });
          });
          this.base = base;
          this.inline = inline;
      }

      restoreBase() {
          this.targets.forEach(({ element }, idx) => {
              const data = this.inline[idx];
              if (!data) return;
              if (this.canEditText(element)) element.textContent = data.text;
              // Cannot use Object.assign on CSSStyleDeclaration, must set properties individually
              const inlineStyle = data.inline || {};
              Object.keys(inlineStyle).forEach(prop => {
                  try {
                      if (typeof prop === 'string' && inlineStyle[prop] !== undefined) {
                          element.style[prop] = inlineStyle[prop];
                      }
                  } catch (e) { }
              });
          });
      }

      restoreBaseline() {
          const selection = this.stateManager.get('selection.elements') || [];
          this.targets.forEach(({ element }, idx) => {
              const index = this.indices[idx];
              const selItem = selection && typeof index === 'number' ? selection[index] : null;
              const base = selItem && selItem.baseline ? selItem.baseline : null;
              if (!base) return;
              if (this.canEditText(element) && base.text !== undefined) element.textContent = base.text;
              // Cannot use Object.assign on CSSStyleDeclaration
              const inlineStyle = base.inline || {};
              Object.keys(inlineStyle).forEach(prop => {
                  try {
                      if (typeof prop === 'string' && inlineStyle[prop] !== undefined) {
                          element.style[prop] = inlineStyle[prop];
                      }
                  } catch (e) { }
              });
          });
      }

      renderForm() {
          const base = this.base;
          const form = this.form;
          form.innerHTML = '';

          const title = this.container.querySelector('#dock-edit-title');
          if (this.targets.length > 1) title.textContent = `${this.targets.length} elements selected`;
          else title.textContent = readableElementName(this.targets[0].element);

          // Use ElementSchema to determine controls
          // For multiple selection, we intersect the schemas or just use 'container' fallback
          const schema = this.targets.length === 1 ? getElementSchema(this.targets[0].element) : getElementSchema(null);

          // Render Groups based on Schema
          if (schema.controls.has('content')) {
              const allowText = this.targets.length === 1 && this.canEditText(this.targets[0].element);
              if (allowText) form.appendChild(this.renderTextField('Content', 'text', base.text));

              // Image Replacement
              if (this.targets.length === 1 && this.targets[0].element.tagName === 'IMG') {
                  const group = document.createElement('div');
                  group.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
                  group.innerHTML = `<span style="font-size:12px;color:var(--dock-fg-2);">Image Source</span>`;
                  const input = document.createElement('input');
                  input.type = 'text';
                  input.value = this.targets[0].element.src;
                  input.style.cssText = 'padding:6px;border:1px solid var(--dock-stroke);border-radius:8px;background:color-mix(in srgb, var(--dock-bg) 96%, transparent);color:var(--dock-fg);font-size:12px;';
                  input.addEventListener('change', () => {
                      this.current['src'] = input.value;
                      this.intents['src'] = `Replace image source`;
                      this.targets[0].element.src = input.value; // Direct preview for image
                      this.syncPending();
                  });
                  group.appendChild(input);
                  form.appendChild(group);
              }
          }

          // Typography First
          if (schema.controls.has('typography')) {
              const group = document.createElement('div');
              group.style.display = 'flex'; group.style.flexDirection = 'column'; group.style.gap = '12px';
              group.innerHTML = `<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--dock-fg-2);">Typography</div>`;
              form.appendChild(group);

              // Font Family
              group.appendChild(this.renderSelectField('Font Family', 'fontFamily', base.fontFamily,
                  ['Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'system-ui', 'serif', 'monospace']));

              // Row 1: Size & Weight
              const row1 = document.createElement('div');
              row1.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;';
              row1.appendChild(this.renderNumberField('Size', 'fontSize', base.fontSize, { unit: 'px' }));
              row1.appendChild(this.renderSelectField('Weight', 'fontWeight', base.fontWeight, ['300', '400', '500', '600', '700', '800', '900']));
              group.appendChild(row1);

              // Row 2: Line Height & Style/Deco
              const row2 = document.createElement('div');
              row2.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:end;';
              row2.appendChild(this.renderNumberField('Line Height', 'lineHeight', base.lineHeight, { min: 0.5, step: 0.1, preserveUnitless: true }));

              // Style Icons (Italic, Underline)
              const styleWrap = document.createElement('div');
              styleWrap.style.cssText = 'display:flex;gap:2px;background:color-mix(in srgb, var(--dock-bg) 96%, transparent);padding:2px;border-radius:6px;height:32px;align-items:center;';

              const renderIconBtn = (icon, active, onClick) => {
                  const btn = document.createElement('button');
                  btn.type = 'button';
                  btn.innerHTML = icon;
                  btn.style.cssText = `flex:1;border:none;background:${active ? 'color-mix(in srgb, var(--dock-fg) 10%, var(--dock-bg))' : 'transparent'};color:${active ? 'var(--dock-fg)' : 'var(--dock-fg-2)'};cursor:pointer;border-radius:4px;height:28px;display:flex;align-items:center;justify-content:center;`;
                  btn.addEventListener('click', (e) => { e.preventDefault(); onClick(); });
                  return btn;
              };

              const currentFontStyle = this.current.fontStyle !== undefined ? this.current.fontStyle : base.fontStyle;
              const currentTextDeco = this.current.textDecoration !== undefined ? this.current.textDecoration : base.textDecoration;

              styleWrap.appendChild(renderIconBtn('<i>I</i>', currentFontStyle === 'italic', () => {
                  const val = (this.current.fontStyle || base.fontStyle) === 'italic' ? 'normal' : 'italic';
                  this.current.fontStyle = val;
                  this.intents.fontStyle = `Set font style to ${val}`;
                  this.preview();
                  this.renderForm(); // Re-render to update active state
              }));

              styleWrap.appendChild(renderIconBtn('<u>U</u>', currentTextDeco && currentTextDeco.includes('underline'), () => {
                  const current = this.current.textDecoration || base.textDecoration || '';
                  const val = current.includes('underline') ? 'none' : 'underline';
                  this.current.textDecoration = val;
                  this.intents.textDecoration = `Set text decoration to ${val}`;
                  this.preview();
                  this.renderForm();
              }));

              row2.appendChild(styleWrap);
              group.appendChild(row2);

              // Alignment Icons
              const alignWrap = document.createElement('div');
              alignWrap.style.cssText = 'display:flex;gap:2px;background:color-mix(in srgb, var(--dock-bg) 96%, transparent);padding:2px;border-radius:6px;height:32px;align-items:center;margin-top:4px;';
              const alignments = [
                  { value: 'left', label: 'Align Left', path: 'M3 21h18v-2H3v2zm0-4h12v-2H3v2zm0-4h18v-2H3v2zm0-4h12V7H3v2zm0-6v2h18V3H3z' },
                  { value: 'center', label: 'Align Center', path: 'M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z' },
                  { value: 'right', label: 'Align Right', path: 'M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zm-6-6v2h18V3H3z' },
                  { value: 'justify', label: 'Justify', path: 'M3 21h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18V7H3v2zm0-6v2h18V3H3z' }
              ];
              alignments.forEach(({ value, label, path }) => {
                  const currentAlign = this.current.textAlign !== undefined ? this.current.textAlign : base.textAlign;
                  const isActive = currentAlign === value;
                  const btn = document.createElement('button');
                  btn.type = 'button';
                  btn.title = label;
                  btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="${path}"/></svg>`;
                  btn.style.cssText = `flex:1;border:none;background:${isActive ? 'color-mix(in srgb, var(--dock-fg) 10%, var(--dock-bg))' : 'transparent'};color:${isActive ? 'var(--dock-fg)' : 'var(--dock-fg-2)'};cursor:pointer;border-radius:4px;height:28px;display:flex;align-items:center;justify-content:center;`;
                  btn.addEventListener('click', (e) => {
                      e.preventDefault();
                      this.current['textAlign'] = value;
                      this.intents['textAlign'] = `Align text ${value}`;
                      this.preview();
                      this.renderForm();
                  });
                  alignWrap.appendChild(btn);
              });
              group.appendChild(alignWrap);
          }

          // Color Second (Dropdown style)
          if (schema.controls.has('color')) {
              const group = document.createElement('div');
              group.style.display = 'flex'; group.style.flexDirection = 'column'; group.style.gap = '12px';
              group.innerHTML = `<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--dock-fg-2);">Color</div>`;
              form.appendChild(group);

              const row = document.createElement('div');
              row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;';

              row.appendChild(this.renderColorDropdown('Text', 'color', base.color));
              if (schema.type !== 'image') {
                  row.appendChild(this.renderColorDropdown('Background', 'backgroundColor', base.backgroundColor, 'right'));
              }
              group.appendChild(row);
          }

          if (schema.controls.has('spacing')) {
              const group = document.createElement('div');
              group.style.display = 'flex'; group.style.flexDirection = 'column'; group.style.gap = '12px';
              group.innerHTML = `<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--dock-fg-2);">Spacing</div>`;
              form.appendChild(group);

              // Padding
              const paddingLabel = document.createElement('div');
              paddingLabel.style.cssText = 'font-size:10px;color:var(--dock-fg-2);margin-top:4px;';
              paddingLabel.textContent = 'Padding';
              group.appendChild(paddingLabel);
              group.appendChild(this.renderPaddingGroup(base));

              // Margin
              const marginLabel = document.createElement('div');
              marginLabel.style.cssText = 'font-size:10px;color:var(--dock-fg-2);margin-top:8px;';
              marginLabel.textContent = 'Margin';
              group.appendChild(marginLabel);
              group.appendChild(this.renderMarginGroup(base));
          }

          if (schema.controls.has('appearance')) {
              const group = document.createElement('div');
              group.style.display = 'flex'; group.style.flexDirection = 'column'; group.style.gap = '12px';
              group.innerHTML = `<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--dock-fg-2);">Appearance</div>`;
              form.appendChild(group);
              group.appendChild(this.renderNumberField('Radius', 'borderRadius', base.borderRadius, { unit: 'px' }));
              group.appendChild(this.renderShadowField(base.boxShadow));
          }
      }

      // --- New Token-Aware Controls ---

      renderColorDropdown(label, key, value, align = 'left') {
          const wrapper = document.createElement('div');
          wrapper.style.cssText = 'position:relative;display:flex;flex-direction:column;gap:6px;';
          wrapper.innerHTML = `<span style="font-size:12px;color:var(--dock-fg-2);">${label}</span>`;

          const trigger = document.createElement('button');
          trigger.type = 'button';
          const displayVal = value === 'mixed' ? 'Mixed' : (value || 'None');
          const displayColor = value === 'mixed' ? 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)' : (value || 'transparent');

          trigger.style.cssText = `
            display:flex;align-items:center;gap:8px;padding:6px 8px;
            border:1px solid var(--dock-stroke);border-radius:8px;
            background:color-mix(in srgb, var(--dock-bg) 96%, transparent);
            color:var(--dock-fg);cursor:pointer;width:100%;text-align:left;
        `;
          trigger.innerHTML = `
            <div style="width:16px;height:16px;border-radius:4px;border:1px solid var(--dock-stroke);background:${displayColor};flex-shrink:0;"></div>
            <span style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${displayVal}</span>
        `;

          const popover = document.createElement('div');
          popover.style.cssText = `
            position:absolute;top:100%;${align === 'right' ? 'right:0;left:auto;' : 'left:0;'}width:240px;z-index:100;
            background:var(--dock-bg);border:1px solid var(--dock-stroke);
            border-radius:12px;box-shadow:var(--shadow);padding:12px;
            display:none;flex-direction:column;gap:12px;margin-top:4px;
        `;

          // Tabs inside popover
          const tabs = document.createElement('div');
          tabs.style.cssText = `display:flex;gap:4px;background:color-mix(in srgb, var(--dock-bg) 96%, transparent);padding:2px;border-radius:8px;`;
          const btnTokens = document.createElement('button');
          const btnCustom = document.createElement('button');

          const styleBtn = (active) => `
            flex:1;border:none;background:${active ? 'var(--dock-bg)' : 'transparent'};
            color:${active ? 'var(--dock-fg)' : 'var(--dock-fg-2)'};
            font-size:11px;padding:4px;border-radius:6px;cursor:pointer;
            box-shadow:${active ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'};
        `;

          btnTokens.textContent = 'Tokens';
          btnCustom.textContent = 'Custom';
          btnTokens.type = 'button';
          btnCustom.type = 'button';

          const content = document.createElement('div');

          const renderTokens = () => {
              btnTokens.style.cssText = styleBtn(true);
              btnCustom.style.cssText = styleBtn(false);
              content.innerHTML = '';

              if (this.tokens.colors.length > 0) {
                  const search = document.createElement('input');
                  search.placeholder = 'Search tokens...';
                  search.style.cssText = `width:100%;padding:6px;border:1px solid var(--dock-stroke);border-radius:6px;background:transparent;color:var(--dock-fg);font-size:12px;margin-bottom:8px;`;
                  content.appendChild(search);

                  const list = document.createElement('div');
                  list.style.cssText = `display:flex;flex-direction:column;gap:4px;max-height:160px;overflow-y:auto;`;

                  const renderList = (filter = '') => {
                      list.innerHTML = '';
                      this.tokens.colors.filter(t => t.name.toLowerCase().includes(filter.toLowerCase())).forEach(token => {
                          const row = document.createElement('div');
                          row.style.cssText = `display:flex;align-items:center;gap:8px;padding:4px;cursor:pointer;border-radius:4px;`;
                          row.innerHTML = `
                            <div style="width:16px;height:16px;border-radius:4px;background:${token.value};border:1px solid var(--dock-stroke);"></div>
                            <span style="font-size:12px;color:var(--dock-fg);">${token.name}</span>
                        `;
                          row.addEventListener('mouseenter', () => row.style.background = 'color-mix(in srgb, var(--dock-fg) 5%, transparent)');
                          row.addEventListener('mouseleave', () => row.style.background = 'transparent');
                          row.addEventListener('click', (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              this.current[key] = token.value;
                              this.intents[key] = `Set ${label.toLowerCase()} to var(${token.name})`;
                              this.preview();
                              popover.style.display = 'none';
                              this.renderForm(); // Update trigger
                          });
                          list.appendChild(row);
                      });
                  };
                  renderList();
                  search.addEventListener('input', (e) => renderList(e.target.value));
                  content.appendChild(list);
              } else {
                  content.innerHTML = `<div style="padding:8px;font-size:12px;color:var(--dock-fg-2);">No tokens found</div>`;
              }
          };

          const renderCustom = () => {
              btnTokens.style.cssText = styleBtn(false);
              btnCustom.style.cssText = styleBtn(true);
              content.innerHTML = '';

              const row = document.createElement('div');
              row.style.cssText = `display:flex;align-items:center;gap:8px;padding:4px;`;

              const colorInput = document.createElement('input');
              colorInput.type = 'color';
              colorInput.value = this.toHex(value === 'mixed' ? '#000000' : value);
              colorInput.style.cssText = `width:32px;height:32px;border:none;background:transparent;cursor:pointer;`;

              const textInput = document.createElement('input');
              textInput.type = 'text';
              textInput.value = value === 'mixed' ? 'Mixed' : (value || '');
              textInput.style.cssText = `flex:1;padding:6px;border:1px solid var(--dock-stroke);border-radius:6px;background:transparent;color:var(--dock-fg);font-size:12px;`;

              const update = (val) => {
                  this.current[key] = val;
                  this.intents[key] = `Set ${label.toLowerCase()} to ${val}`;
                  this.preview();
              };

              colorInput.addEventListener('input', (e) => { e.stopPropagation(); textInput.value = colorInput.value; update(colorInput.value); });
              textInput.addEventListener('change', (e) => { e.stopPropagation(); update(textInput.value); colorInput.value = this.toHex(textInput.value); });

              row.appendChild(colorInput);
              row.appendChild(textInput);
              content.appendChild(row);
          };

          btnTokens.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); renderTokens(); });
          btnCustom.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); renderCustom(); });

          tabs.appendChild(btnTokens);
          tabs.appendChild(btnCustom);
          popover.appendChild(tabs);
          popover.appendChild(content);

          // Toggle Popover
          trigger.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              const isVisible = popover.style.display === 'flex';
              // Close others
              this.form.querySelectorAll('.color-popover').forEach(el => el.style.display = 'none');
              popover.style.display = isVisible ? 'none' : 'flex';
              if (!isVisible) {
                  if (this.tokens.colors.length > 0) renderTokens(); else renderCustom();
              }
          });

          // Close on click outside
          document.addEventListener('click', (e) => {
              if (!wrapper.contains(e.target)) popover.style.display = 'none';
          });

          popover.classList.add('color-popover');
          wrapper.appendChild(trigger);
          wrapper.appendChild(popover);
          return wrapper;
      }

      // --- Existing Controls (Simplified) ---

      renderTextField(label, key, value) {
          const wrapper = document.createElement('label');
          wrapper.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
          wrapper.innerHTML = `<span style="font-size:12px;color:var(--dock-fg-2);">${label}</span>`;
          const textarea = document.createElement('textarea');
          textarea.style.cssText = 'font-size:13px;padding:8px;border:1px solid var(--dock-stroke);border-radius:8px;background:color-mix(in srgb, var(--dock-bg) 96%, transparent);color:var(--dock-fg);resize:vertical;';
          textarea.value = value === 'mixed' ? '' : (value || '');
          textarea.placeholder = value === 'mixed' ? 'Mixed' : '';
          textarea.addEventListener('input', () => {
              this.current[key] = textarea.value;
              this.intents[key] = `Update text content`;
              this.preview();
          });
          wrapper.appendChild(textarea);
          return wrapper;
      }

      renderNumberField(label, key, value, opts = {}) {
          const wrapper = document.createElement('div');
          wrapper.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
          wrapper.innerHTML = `<span style="font-size:12px;color:var(--dock-fg-2);">${label}</span>`;
          const input = document.createElement('input');
          input.type = 'number';
          input.style.cssText = 'padding:6px;border:1px solid var(--dock-stroke);border-radius:8px;background:color-mix(in srgb, var(--dock-bg) 96%, transparent);color:var(--dock-fg);';
          input.step = opts.step || '1';
          if (opts.min !== undefined) input.min = opts.min;
          if (opts.max !== undefined) input.max = opts.max;

          if (value !== 'mixed' && value !== null) {
              // For line-height, check if it's unitless (typically < 10)
              const parsed = this.parseNumeric(value, opts.unit);
              input.value = parsed;
          } else {
              input.placeholder = 'Mixed';
          }

          input.addEventListener('input', () => {
              // For line-height, if value is small (< 10), keep it unitless, otherwise add px
              let val = input.value;
              if (opts.preserveUnitless && parseFloat(val) < 10) {
                  // Keep unitless for values like 1.5, 2, etc.
                  val = val;
              } else if (opts.unit) {
                  val = `${val}${opts.unit}`;
              }
              this.current[key] = val;
              this.intents[key] = `Set ${label.toLowerCase()} to ${val}`;
              this.preview();
              this.updateApplyAvailability();
          });
          wrapper.appendChild(input);
          return wrapper;
      }

      renderSelectField(label, key, value, options) {
          const wrapper = document.createElement('div');
          wrapper.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
          wrapper.innerHTML = `<span style="font-size:12px;color:var(--dock-fg-2);">${label}</span>`;
          const select = document.createElement('select');
          select.style.cssText = 'padding:6px;border:1px solid var(--dock-stroke);border-radius:8px;background:color-mix(in srgb, var(--dock-bg) 96%, transparent);color:var(--dock-fg);';
          select.innerHTML = `<option value="">Mixed</option>` + options.map(opt => `<option value="${opt}">${opt}</option>`).join('');
          if (value && value !== 'mixed') select.value = value.replace(/[^0-9]/g, '') || value;

          select.addEventListener('change', () => {
              this.current[key] = select.value;
              this.intents[key] = `Set ${label.toLowerCase()} to ${select.value}`;
              this.preview();
          });
          wrapper.appendChild(select);
          return wrapper;
      }

      renderPaddingGroup(base) {
          const wrapper = document.createElement('div');
          const grid = document.createElement('div');
          grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;';

          const renderInput = (icon, key, val) => {
              const wrap = document.createElement('div');
              wrap.style.cssText = 'display:flex;align-items:center;gap:6px;background:color-mix(in srgb, var(--dock-bg) 96%, transparent);border:1px solid var(--dock-stroke);border-radius:6px;padding:0 6px;height:32px;';
              wrap.innerHTML = `<span style="color:var(--dock-fg-2);font-size:14px;">${icon}</span>`;
              const input = document.createElement('input');
              input.type = 'number';
              input.min = '0';
              input.value = this.parseNumeric(val, 'px');
              input.style.cssText = 'flex:1;border:none;background:transparent;color:var(--dock-fg);font-size:12px;width:0;';
              input.addEventListener('input', () => {
                  this.current[key] = input.value + 'px';
                  this.intents[key] = `Set ${key} to ${input.value}px`;
                  this.preview();
                  this.updateApplyAvailability();
              });
              wrap.appendChild(input);
              return wrap;
          };

          // Icons: Top, Right, Bottom, Left
          grid.appendChild(renderInput('⭡', 'paddingTop', base.paddingTop));
          grid.appendChild(renderInput('⭢', 'paddingRight', base.paddingRight));
          grid.appendChild(renderInput('⭣', 'paddingBottom', base.paddingBottom));
          grid.appendChild(renderInput('⭠', 'paddingLeft', base.paddingLeft));

          wrapper.appendChild(grid);
          return wrapper;
      }

      renderMarginGroup(base) {
          const wrapper = document.createElement('div');
          const grid = document.createElement('div');
          grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;';

          const renderInput = (icon, key, val) => {
              const wrap = document.createElement('div');
              wrap.style.cssText = 'display:flex;align-items:center;gap:6px;background:color-mix(in srgb, var(--dock-bg) 96%, transparent);border:1px solid var(--dock-stroke);border-radius:6px;padding:0 6px;height:32px;';
              wrap.innerHTML = `<span style="color:var(--dock-fg-2);font-size:14px;">${icon}</span>`;
              const input = document.createElement('input');
              input.type = 'number';
              input.value = this.parseNumeric(val, 'px');
              input.style.cssText = 'flex:1;border:none;background:transparent;color:var(--dock-fg);font-size:12px;width:0;';
              input.addEventListener('input', () => {
                  this.current[key] = input.value + 'px';
                  this.intents[key] = `Set ${key} to ${input.value}px`;
                  this.preview();
                  this.updateApplyAvailability();
              });
              wrap.appendChild(input);
              return wrap;
          };

          // Icons: Top, Right, Bottom, Left
          grid.appendChild(renderInput('⭡', 'marginTop', base.marginTop));
          grid.appendChild(renderInput('⭢', 'marginRight', base.marginRight));
          grid.appendChild(renderInput('⭣', 'marginBottom', base.marginBottom));
          grid.appendChild(renderInput('⭠', 'marginLeft', base.marginLeft));

          wrapper.appendChild(grid);
          return wrapper;
      }

      renderShadowField(value) {
          const wrapper = document.createElement('div');
          wrapper.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
          wrapper.innerHTML = `<span style="font-size:12px;color:var(--dock-fg-2);">Shadow</span>`;
          const select = document.createElement('select');
          select.style.cssText = 'padding:6px;border:1px solid var(--dock-stroke);border-radius:8px;background:color-mix(in srgb, var(--dock-bg) 96%, transparent);';
          select.innerHTML = `<option value="none">None</option><option value="soft">Soft</option><option value="medium">Medium</option><option value="deep">Deep</option>`;
          const matched = Object.entries(SHADOW_PRESETS).find(([k, v]) => v === value);
          select.value = matched ? matched[0] : 'none';

          select.addEventListener('change', () => {
              const preset = SHADOW_PRESETS[select.value] || 'none';
              this.current.boxShadow = preset;
              this.intents.boxShadow = `Set shadow to ${select.value} preset`;
              this.preview();
          });
          wrapper.appendChild(select);
          return wrapper;
      }

      // ... (preview, undoPreviewStep, isOpen, resetChanges same as before, just ensure intents are handled) ...

      preview() {
          const changes = this.current;
          // ... (same preview logic as before) ...
          const trimmed = {};
          Object.entries(changes || {}).forEach(([key, value]) => {
              if (value !== undefined && value !== null && value !== '') trimmed[key] = value;
          });
          const changedKeys = Object.keys(trimmed).filter(k => this.lastPreviewState[k] !== trimmed[k]);
          Object.keys(this.lastPreviewState).forEach((k) => { if (!Object.prototype.hasOwnProperty.call(trimmed, k)) changedKeys.push(k); });

          if (changedKeys.length) {
              const step = { prevByIndex: new Map(), keys: Array.from(new Set(changedKeys)) };
              this.targets.forEach((t, i) => {
                  const idx = this.indices[i];
                  const el = t.element;
                  const prev = {};
                  step.keys.forEach((key) => {
                      if (key === 'text') { if (this.canEditText(el)) prev.text = el.textContent; }
                      else prev[key] = el.style[key] || '';
                  });
                  step.prevByIndex.set(idx, prev);
              });
              this.previewHistory.push(step);
              this.lastPreviewState = { ...trimmed };
          }
          this.targets.forEach(({ element }) => {
              if (changes.text !== undefined && this.canEditText(element)) element.textContent = changes.text;
              Object.entries(changes).forEach(([k, v]) => {
                  if (k !== 'text' && k !== 'src') {
                      // Use !important for margin/padding to ensure they apply
                      if (k.startsWith('margin') || k.startsWith('padding')) {
                          element.style.setProperty(k, v, 'important');
                      } else {
                          element.style[k] = v;
                      }
                  }
              });
          });
          this.syncPending();
          this.updateUndoAvailability();
          this.updateApplyAvailability();
      }

      undoPreviewStep() {
          if (!this.previewHistory.length) return false;
          const step = this.previewHistory.pop();
          this.targets.forEach((t, i) => {
              const idx = this.indices[i];
              const prev = step.prevByIndex.get(idx) || {};
              const el = t.element;
              step.keys.forEach((key) => {
                  if (key === 'text') { if (this.canEditText(el)) el.textContent = prev.text; }
                  else el.style[key] = prev[key] || '';
              });
          });
          this.current = {};
          this.lastPreviewState = {};
          this.collectBase();
          this.renderForm();
          this.syncPending();
          this.updateUndoAvailability();
          return true;
      }

      isOpen() { return !!this.container && this.container.style.display === 'flex'; }

      resetChanges() {
          // Reset to original page state (baseline from first selection)
          this.restoreBaseline();
          this.current = {};
          this.intents = {};
          // Re-collect base from the now-restored DOM
          this.collectBase();
          this.renderForm();
          this.syncPending();
          this.previewHistory = [];
          this.lastPreviewState = {};
          this.updateUndoAvailability();
          this.updateApplyAvailability();
      }

      refresh() {
          if (!this.isOpen()) return;
          this.collectBase();
          this.renderForm();
          this.current = {};
          this.intents = {};
          this.stateManager.set('wysiwyg.pending', null);
          this.previewHistory = [];
          this.lastPreviewState = {};
          this.updateUndoAvailability();
      }

      applyChanges() {
          if (!this.targets.length) return;
          const changes = { ...this.current };
          if (Object.prototype.hasOwnProperty.call(changes, 'text')) {
              const allow = this.targets.length === 1 && this.canEditText(this.targets[0].element);
              if (!allow) delete changes.text;
          }
          Object.keys(changes).forEach(key => {
              if (changes[key] === undefined || changes[key] === null || changes[key] === '') delete changes[key];
          });

          const hasDiff = Object.keys(changes).length > 0;

          // Generate Hybrid Summary from Intents
          const intentList = Object.keys(changes).map(k => this.intents[k]).filter(Boolean);
          const summary = intentList.length > 0 ? intentList.join(', ') : (describeChanges(changes) || 'Edited');

          this.targets.forEach(({ selector }, idx) => {
              const index = this.indices[idx];
              this.eventBus.emit('wysiwyg:apply', {
                  index,
                  selector,
                  changes,
                  summary
              });
          });
          if (hasDiff) this.close();
          this.updateUndoAvailability();
      }

      // ... (helpers) ...
      canEditText(element) {
          try {
              if (!element) return false;
              const tag = (element.tagName || '').toLowerCase();
              if (['input', 'textarea', 'img', 'video', 'canvas', 'svg', 'hr', 'br'].includes(tag)) return false;

              // Allow if no children
              if (element.childElementCount === 0) return true;

              // Allow if children are only inline phrasing content (span, b, i, strong, em, a, code, etc.)
              // and NOT block elements (div, p, section, ul, li, etc.)
              const blockTags = ['DIV', 'P', 'SECTION', 'ARTICLE', 'NAV', 'ASIDE', 'HEADER', 'FOOTER', 'MAIN', 'UL', 'OL', 'LI', 'TABLE', 'TR', 'TD', 'TH', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'];
              const children = Array.from(element.children);
              const hasBlockChild = children.some(child => blockTags.includes(child.tagName));

              return !hasBlockChild;
          } catch (_) { return false; }
      }
      updateUndoAvailability() {
          try {
              if (!this.undoBtn) return;
              const canUndo = this.previewHistory.length > 0;
              this.undoBtn.disabled = !canUndo;
              this.undoBtn.style.opacity = canUndo ? '1' : '0.5';
              this.undoBtn.style.cursor = canUndo ? 'pointer' : 'not-allowed';
          } catch (_) { }
      }
      updateApplyAvailability() {
          try {
              if (!this.applyBtn) return;
              const trimmed = {};
              Object.entries(this.current || {}).forEach(([key, value]) => {
                  if (value !== undefined && value !== null && value !== '') trimmed[key] = value;
              });
              const hasChanges = Object.keys(trimmed).length > 0;
              this.applyBtn.disabled = !hasChanges;
              this.applyBtn.style.opacity = hasChanges ? '1' : '0.5';
              this.applyBtn.style.cursor = hasChanges ? 'pointer' : 'not-allowed';
          } catch (_) { }
      }
      parseNumeric(value, unit) {
          if (!value || value === 'mixed') return '';

          // For line-height, preserve unitless values
          const str = String(value);
          const match = str.match(/-?\d+(?:\.\d+)?/);
          if (!match) return '';

          const numericValue = match[0];

          // If unit is specified in options and value has no unit, it's a unitless number
          if (unit === 'px' && !str.includes('px') && !str.includes('%') && !str.includes('em')) {
              // For properties like line-height that can be unitless, return as-is if < 10
              const num = parseFloat(numericValue);
              if (num < 10) return numericValue; // Likely unitless line-height
          }

          return numericValue;
      }
      toHex(color) {
          const fallback = '#000000';
          if (!color) return fallback;
          if (color.startsWith('#')) return color.length === 7 ? color : fallback;
          const ctx = document.createElement('canvas').getContext('2d');
          ctx.fillStyle = color;
          return ctx.fillStyle;
      }
      syncPending() {
          if (this.indices.length !== 1) { this.stateManager.set('wysiwyg.pending', null); return; }
          const trimmed = {};
          Object.entries(this.current || {}).forEach(([key, value]) => {
              if (value !== undefined && value !== null && value !== '') trimmed[key] = value;
          });
          if (Object.keys(trimmed).length) this.stateManager.set('wysiwyg.pending', { index: this.indices[0], changes: trimmed });
          else this.stateManager.set('wysiwyg.pending', null);
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
      try { window.LUMI_INJECTED = true; } catch (_) { }
      console.info('[LUMI] Skipping bootstrap inside viewport iframe');
    }
  } catch (_) { }

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
      (function () {
        try {
          const u = new URL(window.location.href);
          if (u.searchParams.get('_lumi_debug') === '1') window.__LUMI_DEBUG = true;
          if (localStorage.getItem('LUMI_DEBUG') === '1') window.__LUMI_DEBUG = true;
        } catch (_) { }
      })();
    } catch (_) { }

    // If the script is accidentally loaded in page context (no runtime), bail out early
    if (!chromeBridge.isRuntimeAvailable()) {
      console.warn('[LUMI] Chrome runtime not available in this context; skipping init');
      return;
    }

    // Initialize UI
    // TopBanner removed; provide no-op API to keep calls harmless
    const topBanner = { update: () => { }, hide: () => { }, setRightOffset: () => { } };
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
    let annotateManager = null;
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

    // Initialize AnnotateManager (replaces ScreenshotSelector)
    annotateManager = new AnnotateManager(eventBus, stateManager, chromeBridge);

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
          try { mutator(m); } catch (_) { }
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
          try { highlightManagerFrame.clearAll(); } catch (_) { }
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
        } catch (_) { }
        highlightManagerFrame = new HighlightManager(eventBus, iframe.contentDocument, iframe.contentWindow);
        elementSelectorFrame = new ElementSelector(eventBus, stateManager, highlightManagerFrame, topBanner, iframe.contentDocument, iframe.contentWindow);
        // Activate correct selector depending on mode
        const mode = stateManager.get('ui.mode');
        if (mode === 'element' || pendingElementMode) {
          pendingElementMode = false;
          try { elementSelector.deactivate(); } catch (_) { }
          try { elementSelectorFrame.activate(); } catch (_) { }
        }
        // Rebind highlights into the active document to avoid duplicates/drift
        rebindHighlightsToActive();
      }

      function rebindHighlightsToActive() {
        const elements = stateManager.get('selection.elements') || [];
        try { highlightManager.clearAllSelections(); } catch (_) { }
        try { highlightManagerFrame && highlightManagerFrame.clearAllSelections(); } catch (_) { }
        const useIframe = !!stateManager.get('ui.viewport.useIframeStage');
        const mgr = (useIframe && highlightManagerFrame) ? highlightManagerFrame : highlightManager;
        elements.forEach((item, idx) => { try { mgr.addSelection(item.element, idx); } catch (_) { } });
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
        try { highlightManager.clearAllSelections(); } catch (_) { }
        try { highlightManagerFrame && highlightManagerFrame.clearAllSelections(); } catch (_) { }
        const mgr = (useIframe && highlightManagerFrame) ? highlightManagerFrame : highlightManager;
        const elements = stateManager.get('selection.elements') || [];
        elements.forEach((item, idx) => { try { mgr.addSelection(item.element, idx); } catch (_) { } });
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
          try { dockRoot.renderChips(stateManager.get('selection.elements') || []); } catch (_) { }
          try { dockRoot.updateSendState(); } catch (_) { }
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
                try { el.style[prop] = ''; } catch (_) { }
              } else {
                try { el.style[prop] = base; } catch (_) { }
              }
            });
          }
          // 2) Restore text content only for leaf nodes with a string baseline
          if (snapshot.baseline && typeof snapshot.baseline.text === 'string') {
            try { el.textContent = snapshot.baseline.text; } catch (_) { }
          }
          // 3) Restore key inline properties from baseline to guarantee full reset
          const baseInline = (snapshot.baseline && snapshot.baseline.inline) || {};
          Object.entries(baseInline).forEach(([prop, value]) => {
            try { el.style[prop] = value || ''; } catch (_) { }
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
        try { highlightManager.clearAll(); } catch (_) { }
        try { highlightManagerFrame && highlightManagerFrame.clearAll(); } catch (_) { }
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
          try { dockRoot.renderChips(stateManager.get('selection.elements') || []); } catch (_) { }
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
          try { dockRoot.renderChips(stateManager.get('selection.elements') || []); } catch (_) { }
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
        try { item.element.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) { }
        // Clear both managers to avoid duplicate halos across documents
        try { highlightManager.clearAllSelections(); } catch (_) { }
        try { highlightManagerFrame && highlightManagerFrame.clearAllSelections(); } catch (_) { }
        const useIframe = !!stateManager.get('ui.viewport.useIframeStage');
        const mgr = (useIframe && highlightManagerFrame) ? highlightManagerFrame : highlightManager;
        elements.forEach((entry, idx) => { try { mgr.addSelection(entry.element, idx); } catch (_) { } });
      });

      eventBus.on('edit:open', (payload = {}) => {
        if (!editModal) return;
        try { highlightManager.hideHover(); } catch (_) { }
        try { highlightManagerFrame && highlightManagerFrame.hideHover(); } catch (_) { }
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
          try { elementSelector.deactivate(); } catch (_) { }
          try { elementSelectorFrame && elementSelectorFrame.deactivate(); } catch (_) { }
          return;
        }
        // Switching into element mode
        if (annotateManager) annotateManager.deactivate();

        // Prefer iframe stage when ready; otherwise fall back to top document immediately
        const viewportEnabled = !!stateManager.get('ui.viewport.enabled');
        if (useIframe && viewportEnabled && elementSelectorFrame) {
          elementSelectorFrame.activate();
        } else {
          // Immediate fallback to ensure user can select without waiting
          try { elementSelector.activate(); } catch (_) { }
          // If iframe stage is desired but not ready, arm a one-shot auto-activation when it becomes ready
          pendingElementMode = !!useIframe;
        }
      });

      eventBus.on('mode:toggle-screenshot', () => {
        if (!elementSelector || !annotateManager) return;
        const currentMode = stateManager.get('ui.mode');

        if (currentMode === 'screenshot') {
          annotateManager.deactivate();
          // no-op (bubble removed)
        } else {
          elementSelector.deactivate();
          annotateManager.activate();
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
          try { elementSelector.activate(); } catch (_) { }
        }
        // Rebind highlights to top document after fallback
        try { rebindHighlightsToActive(); } catch (_) { }
      });

      // Dock events (legacy bubble hooks mapped to dock)
      eventBus.on('bubble:close', () => {
        stateManager.set('ui.dockOpen', false);
        if (dockRoot) dockRoot.setVisible(false);
        if (elementSelector) elementSelector.deactivate();
        if (annotateManager) annotateManager.deactivate();
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
        } catch (_) { }
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
          if (annotateManager) annotateManager.deactivate();
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
        try { topBanner.setRightOffset(offset + 'px'); } catch (_) { }
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
              try { prev[prop] = element.textContent; } catch (_) { }
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
          try { dockRoot.renderChips(stateManager.get('selection.elements') || []); } catch (_) { }
        }
        try { highlightManager.updateAllPositions(); } catch (_) { }
        try { highlightManagerFrame && highlightManagerFrame.updateAllPositions(); } catch (_) { }
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
          try { target = document.querySelector(selector); } catch (_) { }
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
          } catch (_) { }
          const keys = Object.keys(base.inline || {});
          for (const k of keys) {
            try {
              const cur = item.element.style[k] || '';
              const orig = base.inline[k] || '';
              if (cur !== orig) { stillEdited = true; break; }
            } catch (_) { }
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
          try { dockRoot.renderChips(stateManager.get('selection.elements') || []); } catch (_) { }
          dockRoot.updateSendState();
        }

        // Sync modal if open
        if (editModal && typeof editModal.refresh === 'function') {
          editModal.refresh();
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
          try { if (dockRoot) dockRoot.clearInput(); } catch (_) { }
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
          } catch (_) { }
        }

        // Build context snapshot
        const pageInfo = { url: window.location.href, title: document.title };
        const lastScreenshot = screenshots.length ? screenshots[screenshots.length - 1] : null;
        const reqElements = elements;
        const reqScreenshots = screenshots;
        const reqEdits = edits;

        // Clear context immediately for a cleaner UX during processing
        try { highlightManager.clearAll(); } catch (_) { }
        try { highlightManagerFrame && highlightManagerFrame.clearAll(); } catch (_) { }
        stateManager.batch({
          'selection.elements': [],
          'selection.screenshots': [],
          'wysiwyg.pending': null,
          'wysiwyg.edits': [],
          'wysiwyg.hasDiffs': false
        });
        try { dockRoot && dockRoot.clearChips(); } catch (_) { }
        try { dockRoot && dockRoot.updateSendState(); } catch (_) { }

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
            try { styleHistory.clear(); } catch (_) { }
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
        try { highlightManager.clearAll(); } catch (_) { }
        try { highlightManagerFrame && highlightManagerFrame.clearAll(); } catch (_) { }
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
        if (['input', 'textarea', 'img', 'video', 'canvas', 'svg'].includes(tag)) return false;
        return el.childElementCount === 0;
      } catch (_) { return false; }
    }

    // Keyboard shortcuts
    function setupKeyboardShortcuts() {
      document.addEventListener('keydown', (e) => {
        // track space pressed for panning
        if (e.key === ' ') { try { window.__lumiSpacePressed = true; } catch (_) { } }
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
            if (annotateManager) annotateManager.deactivate();
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
        if (e.key === ' ') { try { window.__lumiSpacePressed = false; } catch (_) { } }
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
      // screenshotSelector removed; annotateManager initialized earlier


      // Bind all events (after UI is mounted)
      bindEvents();

      // Setup keyboard shortcuts
      setupKeyboardShortcuts();

      // Theme: manual only, default light (no persistence)
      try {
        stateManager.set('ui.theme', 'light');
        setDockThemeMode('light');
      } catch (_) { }

      // Apply initial viewport visibility, synced with dock state
      try {
        const enabled = !!stateManager.get('ui.viewport.enabled');
        const dockOpen = stateManager.get('ui.dockOpen') !== false;
        const on = enabled && dockOpen; // viewport should follow dock on refresh
        viewportController.setEnabled(on);
        viewportBar.mount();
        viewportBar.setVisible(on);
        stateManager.set('ui.viewport.enabled', on);
      } catch (_) { }

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
      } catch (_) { }

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
          try { setDockThemeMode(mode); } catch (_) { }
          try { viewportBar.setTheme(mode); } catch (_) { }
        });
      } catch (_) { }

      // (moved into bindEvents scope as setupIframeSelectionLocal)

      // Listen for background messages (toggle only)
      chromeBridge.onMessage((message) => {
        if (!message || !message.type) return;
        if (message.type === 'TOGGLE_BUBBLE') {
          eventBus.emit('bubble:toggle');
          try {
            const open = stateManager.get('ui.dockOpen') !== false;
            if (open) eventBus.emit('viewport:toggle', true);
          } catch (_) { }
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
        (function selfCheck() {
          const get = (p) => stateManager.get(p);
          const need = (cond, msg) => { if (!cond) console.error('[LUMI SelfCheck]', msg); };
          const p = get('ui.viewport.preset');
          need(['responsive', 'mobile', 'pad', 'laptop'].includes(p), 'Unknown preset: ' + p);
          const logical = get('ui.viewport.logical') || {};
          need(logical.width > 0 && logical.height > 0, 'Logical size invalid');
          const auto = get('ui.viewport.auto');
          const scale = get('ui.viewport.scale');
          need((auto || (scale >= 0.25 && scale <= 2)), 'Scale out of range or auto mis-set');
          const bar = document.getElementById('lumi-viewport-bar-root');
          need(!!bar, 'TopViewportBar not mounted');
          const stage = document.getElementById('lumi-viewport-stage');
          need(!!stage, 'Viewport stage missing');
          const stageInfo = viewportController?.getStageInfo?.() || { mode: 'unknown', fallback: 'n/a', enabled: stateManager.get('ui.viewport.enabled') };
          console.info(`[LUMI] preset=${p} ${logical.width}x${logical.height} scale=${scale} mode=${stageInfo.mode} (fallback:${stageInfo.fallback || 'none'}) enabled=${stageInfo.enabled}`);
          console.info('[LUMI SelfCheck] done');
        })();
      } catch (_) { }

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
