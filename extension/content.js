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
          bubbleVisible: false,
          bubblePosition: { left: 24, bottom: 24 },
          mode: 'idle', // 'idle' | 'element' | 'screenshot'
          loading: false,
          loadingText: 'Processing...'
        },
        selection: {
          elements: [],
          screenshots: [],
          hoveredElement: null
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
     * @param {string} [path] - Dot-separated path (e.g., 'ui.bubbleVisible')
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
          bubbleVisible: false,
          bubblePosition: { left: 24, bottom: 24 },
          mode: 'idle',
          loading: false,
          loadingText: 'Processing...'
        },
        selection: {
          elements: [],
          screenshots: [],
          hoveredElement: null
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
   * UI Styles - Centralized CSS definitions
   * All Shadow DOM styles in one place
   */

  const BUBBLE_STYLES = `
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

  /* Screenshot tags use same base styling as element tags; inserted state turns green */

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

  .context-tag.inserted {
    background: rgba(34, 197, 94, 0.15);
    border-color: rgba(34, 197, 94, 0.3);
    color: #86efac;
  }

  .context-tag.inserted .tag-label {
    opacity: 0.7;
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
    touch-action: none;
  }

  .bubble.dragging {
    transition: none !important;
    pointer-events: none;
  }

  .bubble.dragging * {
    pointer-events: none;
  }
`;

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
`;

  /**
   * BubbleUI - Main Bubble interface with Shadow DOM
   */


  class BubbleUI {
    constructor(eventBus, stateManager) {
      this.eventBus = eventBus;
      this.stateManager = stateManager;
      this.container = null;
      this.shadow = null;
    }

    mount() {
      if (this.container) return;
      
      // Create container
      this.container = document.createElement('div');
      this.container.id = 'lumi-bubble-container';
      this.container.style.cssText = `
      position: fixed;
      left: 24px;
      bottom: 24px;
      z-index: 2147483647;
      display: none;
    `;
      
      // Create Shadow DOM
      this.shadow = this.container.attachShadow({ mode: 'open' });
      this.shadow.innerHTML = this.getHTML();
      
      document.body.appendChild(this.container);
      
      // Setup event listeners
      this.setupListeners();
    }

    getHTML() {
      return `
      <style>${BUBBLE_STYLES}</style>
      
      <div class="bubble" id="bubble-main">
        <!-- Top Bar (draggable) -->
        <div class="top-bar drag-handle" id="drag-handle">
          <div class="left-section">
            <div class="logo">LUMI</div>
            <div class="engine-selector" id="engine-selector">
              <div class="status-indicator" id="status-indicator"></div>
              <span class="engine-name" id="engine-name">Codex</span>
              <span class="dropdown-arrow">▼</span>
            </div>
            <!-- Engine Dropdown Menu -->
            <div class="engine-dropdown" id="engine-dropdown">
              <div class="engine-option selected" data-engine="codex">
                <div class="engine-option-left">
                  <span class="engine-status-dot" id="engine-status-codex"></span>
                  <span class="engine-option-name">Codex</span>
                </div>
                <span class="engine-check">✓</span>
              </div>
              <div class="engine-option" data-engine="claude">
                <div class="engine-option-left">
                  <span class="engine-status-dot" id="engine-status-claude"></span>
                  <span class="engine-option-name">Claude</span>
                </div>
                <span class="engine-check">✓</span>
              </div>
            </div>
          </div>
          <div class="right-section">
            <button class="icon-btn" id="element-mode-btn" title="Element Mode (Cmd+E)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9h18M9 3v18"/>
              </svg>
            </button>
            <button class="icon-btn" id="screenshot-mode-btn" title="Screenshot Mode (Cmd+S)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
            <button class="icon-btn" id="close-btn" title="Close (Esc)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Input Container -->
        <div class="input-container">
          <!-- Context Tags (elements + screenshot) -->
          <div class="context-tags" id="context-tags"></div>
          <div class="input-wrapper">
            <div 
              class="input-field" 
              id="intent-input" 
              contenteditable="true"
              data-placeholder="Type your instructions..."
            ></div>
            <button class="send-btn" id="send-btn" disabled>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
            <div class="loading-overlay" id="loading-overlay">
              <div class="loading-content">
                <div class="spinner"></div>
                <div class="loading-text" id="loading-text">Processing...</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Status Message -->
        <div class="status-message" id="status-message">
          <span class="status-icon" id="status-icon"></span>
          <span id="status-text"></span>
          <button class="status-close" id="status-close">×</button>
        </div>
      </div>
    `;
    }

    setupListeners() {
      try { console.log('[BubbleUI] setupListeners invoked'); } catch (_) {}
      // Close button
      const closeBtn = this.shadow.getElementById('close-btn');
      closeBtn.addEventListener('click', () => {
        this.eventBus.emit('bubble:close');
      });
      
      // Mode buttons
      const elementModeBtn = this.shadow.getElementById('element-mode-btn');
      const screenshotModeBtn = this.shadow.getElementById('screenshot-mode-btn');
      
      elementModeBtn.addEventListener('click', () => {
        this.eventBus.emit('mode:toggle-element');
      });
      
      screenshotModeBtn.addEventListener('click', () => {
        this.eventBus.emit('mode:toggle-screenshot');
      });
      
      // Input field
      const inputField = this.shadow.getElementById('intent-input');
      const sendBtn = this.shadow.getElementById('send-btn');
      
      inputField.addEventListener('input', () => {
        this.eventBus.emit('input:changed');
        this.updateSendButtonState();
      });
      
      inputField.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          this.eventBus.emit('submit:requested');
        }
        // Prevent host page shortcuts from intercepting while typing in bubble
        e.stopPropagation();
      });

      // Make sure page-level shortcuts don't override bubble when focused
      try {
        this.shadow.addEventListener('keydown', (e) => {
          if (this.shadow.contains(e.target)) e.stopPropagation();
        }, { capture: true });
        this.shadow.addEventListener('keypress', (e) => {
          if (this.shadow.contains(e.target)) e.stopPropagation();
        }, { capture: true });
        this.shadow.addEventListener('keyup', (e) => {
          if (this.shadow.contains(e.target)) e.stopPropagation();
        }, { capture: true });
      } catch (_) {}
      
      sendBtn.addEventListener('click', () => {
        this.eventBus.emit('submit:requested');
      });
      
      // Engine selector dropdown
      const engineSelector = this.shadow.getElementById('engine-selector');
      engineSelector.addEventListener('click', (e) => {
        e.stopPropagation();
        // Defensive: ensure we are not in dragging state so dropdown is clickable
        const bubbleMain = this.shadow.getElementById('bubble-main');
        if (bubbleMain) bubbleMain.classList.remove('dragging');
        this.toggleEngineDropdown();
      });
      
      // Engine options (event delegation for reliability)
      const engineDropdown = this.shadow.getElementById('engine-dropdown');
      if (!engineDropdown) {
        try { console.warn('[BubbleUI] engine-dropdown not found'); } catch (_) {}
      }
      engineDropdown.addEventListener('pointerdown', (e) => {
        const option = e.target.closest('.engine-option');
        if (!option) return;
        e.stopPropagation();
        e.preventDefault();
        const bubbleMain = this.shadow.getElementById('bubble-main');
        if (bubbleMain) bubbleMain.classList.remove('dragging');
        const engine = option.dataset.engine;
        try { console.log('[BubbleUI] pointerdown on option:', engine); } catch (_) {}
        if (option.classList.contains('disabled')) {
          const message = engine === 'claude'
            ? 'Claude CLI not detected. Please install Claude Code CLI to enable.'
            : 'Codex CLI not detected. Please install Codex CLI to enable.';
          this.showStatus(message, 'error');
          this.eventBus.emit('notify:error', message);
          this.closeEngineDropdown();
          return;
        }
        this.eventBus.emit('engine:select', engine);
        try { console.log('[BubbleUI] Emitted engine:select', engine); } catch (_) {}
        this.closeEngineDropdown();
      });
      
      // Close dropdown when clicking outside
      document.addEventListener('click', () => {
        this.closeEngineDropdown();
      });
      
      // Status close button
      const statusClose = this.shadow.getElementById('status-close');
      statusClose.addEventListener('click', () => {
        this.hideStatus();
      });
      
      // Drag functionality
      this.setupDrag();
      
      // State subscriptions
      this.stateManager.subscribe('ui.mode', (mode) => {
        this.updateModeButtons(mode);
      });
      
      this.stateManager.subscribe('engine.current', (engine) => {
        this.updateEngineSelector(engine);
      });
      
      this.stateManager.subscribe('engine.serverHealthy', (healthy) => {
        this.updateServerStatus(healthy);
      });
      
      this.stateManager.subscribe('engine.available', (available) => {
        this.updateEngineAvailability(available);
      });

      // Sync initial UI with current state snapshot
      this.updateModeButtons(this.stateManager.get('ui.mode'));
      this.updateEngineSelector(this.stateManager.get('engine.current'));
      this.updateServerStatus(this.stateManager.get('engine.serverHealthy'));
      this.updateEngineAvailability(this.stateManager.get('engine.available'));
    }

    setupDrag() {
      const dragHandle = this.shadow.getElementById('drag-handle');
      const bubbleMain = this.shadow.getElementById('bubble-main');
      if (!dragHandle || !bubbleMain) return;

      let isDragging = false;
      let startX = 0;
      let startY = 0;
      let initialLeft = 0;
      let initialBottom = 0;
      let bubbleWidth = 0;
      let bubbleHeight = 0;
      let activePointerId = null;

      const startDrag = (clientX, clientY) => {
        isDragging = true;
        startX = clientX;
        startY = clientY;

        const rect = this.container.getBoundingClientRect();
        initialLeft = rect.left;
        initialBottom = window.innerHeight - rect.bottom;
        bubbleWidth = rect.width;
        bubbleHeight = rect.height;

        bubbleMain.classList.add('dragging');
      };

      const updateDrag = (clientX, clientY) => {
        if (!isDragging) return;

        const deltaX = clientX - startX;
        const deltaY = clientY - startY;

        let newLeft = initialLeft + deltaX;
        let newBottom = initialBottom - deltaY;

        const maxLeft = Math.max(0, window.innerWidth - bubbleWidth);
        const maxBottom = Math.max(0, window.innerHeight - bubbleHeight);

        newLeft = Math.min(Math.max(0, newLeft), maxLeft);
        newBottom = Math.min(Math.max(0, newBottom), maxBottom);

        this.container.style.left = newLeft + 'px';
        this.container.style.bottom = newBottom + 'px';
      };

      const releasePointerCapture = () => {
        if (activePointerId === null) return;
        if (typeof dragHandle.releasePointerCapture === 'function') {
          try {
            dragHandle.releasePointerCapture(activePointerId);
          } catch (_) {}
        }
        activePointerId = null;
      };

      const stopDragging = () => {
        if (!isDragging) return;
        isDragging = false;
        releasePointerCapture();
        bubbleMain.classList.remove('dragging');
      };

      const shouldIgnoreTarget = (target) => {
        return target.closest('.icon-btn') || target.closest('.engine-selector');
      };

      const supportsPointerEvents = typeof window !== 'undefined' && window.PointerEvent;

      if (supportsPointerEvents) {
        dragHandle.addEventListener('pointerdown', (e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          if (shouldIgnoreTarget(e.target)) return;

          activePointerId = e.pointerId;

          if (typeof dragHandle.setPointerCapture === 'function') {
            try {
              dragHandle.setPointerCapture(activePointerId);
            } catch (_) {}
          }

          startDrag(e.clientX, e.clientY);
          e.preventDefault();
        });

        dragHandle.addEventListener('pointermove', (e) => {
          if (!isDragging || e.pointerId !== activePointerId) return;
          updateDrag(e.clientX, e.clientY);
        });

        const pointerEndHandler = (e) => {
          if (e.pointerId !== activePointerId) return;
          stopDragging();
        };

        dragHandle.addEventListener('pointerup', pointerEndHandler);
        dragHandle.addEventListener('pointercancel', pointerEndHandler);
        dragHandle.addEventListener('lostpointercapture', stopDragging);
      } else {
        const handleMouseMove = (e) => {
          if (!isDragging) return;
          updateDrag(e.clientX, e.clientY);
        };

        const handleMouseUp = () => {
          document.removeEventListener('mousemove', handleMouseMove, true);
          document.removeEventListener('mouseup', handleMouseUp, true);
          stopDragging();
        };

        dragHandle.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          if (shouldIgnoreTarget(e.target)) return;

          startDrag(e.clientX, e.clientY);

          document.addEventListener('mousemove', handleMouseMove, true);
          document.addEventListener('mouseup', handleMouseUp, true);
          e.preventDefault();
        });
      }

      const cancelOnLeave = () => {
        if (!isDragging) return;
        stopDragging();
      };

      document.addEventListener('mouseleave', cancelOnLeave, true);
      window.addEventListener('blur', stopDragging);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') stopDragging();
      });
    }

    show() {
      if (this.container) {
        this.container.style.display = 'block';
        this.stateManager.set('ui.bubbleVisible', true);
      }
    }

    hide() {
      if (this.container) {
        this.container.style.display = 'none';
        this.stateManager.set('ui.bubbleVisible', false);
      }
    }

    updateModeButtons(mode) {
      const elementBtn = this.shadow.getElementById('element-mode-btn');
      const screenshotBtn = this.shadow.getElementById('screenshot-mode-btn');
      
      elementBtn.classList.toggle('active', mode === 'element');
      screenshotBtn.classList.toggle('active', mode === 'screenshot');
    }

    updateEngineSelector(engine) {
      const engineName = this.shadow.getElementById('engine-name');
      try {
        console.log('[BubbleUI] updateEngineSelector called with', engine, 'current label:', engineName?.textContent);
      } catch (_) {}
      engineName.textContent = engine === 'codex' ? 'Codex' : 'Claude';
      try {
        console.log('[BubbleUI] engine-name updated to', engineName.textContent);
      } catch (_) {}
      
      this.shadow.querySelectorAll('.engine-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.engine === engine);
        try {
          console.log('[BubbleUI] option', opt.dataset.engine, 'selected?', opt.classList.contains('selected'));
        } catch (_) {}
      });
    }

    updateServerStatus(healthy) {
      const indicator = this.shadow.getElementById('status-indicator');
      indicator.classList.toggle('offline', !healthy);
    }

    updateEngineAvailability(available) {
      const codexDot = this.shadow.getElementById('engine-status-codex');
      const claudeDot = this.shadow.getElementById('engine-status-claude');
      const codexOption = this.shadow.querySelector('.engine-option[data-engine="codex"]');
      const claudeOption = this.shadow.querySelector('.engine-option[data-engine="claude"]');
      
      codexDot.classList.toggle('available', !!available.codex);
      claudeDot.classList.toggle('available', !!available.claude);
      
      if (codexOption) {
        codexOption.classList.toggle('disabled', !available.codex);
        codexOption.setAttribute('title', available.codex ? '' : 'Codex CLI not detected');
      }
      if (claudeOption) {
        claudeOption.classList.toggle('disabled', !available.claude);
        claudeOption.setAttribute('title', available.claude ? '' : 'Claude Code CLI not detected');
      }
    }

    toggleEngineDropdown() {
      const dropdown = this.shadow.getElementById('engine-dropdown');
      const selector = this.shadow.getElementById('engine-selector');
      
      const isOpen = dropdown.classList.contains('open');
      dropdown.classList.toggle('open', !isOpen);
      selector.classList.toggle('open', !isOpen);
    }

    closeEngineDropdown() {
      const dropdown = this.shadow.getElementById('engine-dropdown');
      const selector = this.shadow.getElementById('engine-selector');
      
      dropdown.classList.remove('open');
      selector.classList.remove('open');
    }

    setLoading(isLoading, text = 'Processing...') {
      const loadingOverlay = this.shadow.getElementById('loading-overlay');
      const loadingText = this.shadow.getElementById('loading-text');
      
      if (isLoading) {
        loadingOverlay.classList.add('active');
        loadingText.textContent = text;
        this.stateManager.set('ui.loading', true);
      } else {
        loadingOverlay.classList.remove('active');
        this.stateManager.set('ui.loading', false);
      }
    }

    showStatus(message, type = 'success') {
      const statusMessage = this.shadow.getElementById('status-message');
      const statusIcon = this.shadow.getElementById('status-icon');
      const statusText = this.shadow.getElementById('status-text');
      
      statusMessage.className = 'status-message active ' + type;
      statusIcon.textContent = type === 'success' ? '✓' : '✕';
      statusText.textContent = message;
    }

    hideStatus() {
      const statusMessage = this.shadow.getElementById('status-message');
      statusMessage.classList.remove('active');
    }

    getInputValue() {
      const input = this.shadow.getElementById('intent-input');
      return input ? input.textContent.trim() : '';
    }

    clearInput() {
      const input = this.shadow.getElementById('intent-input');
      if (input) {
        input.textContent = '';
        this.updateSendButtonState();
      }
    }

    updateSendButtonState() {
      const sendBtn = this.shadow.getElementById('send-btn');
      const input = this.shadow.getElementById('intent-input');
      const elements = this.stateManager.get('selection.elements');
      const screenshots = this.stateManager.get('selection.screenshots') || [];
      const projectAllowed = this.stateManager.get('projects.allowed');
      
      const hasContext = elements.length > 0 || screenshots.length > 0;
      const hasIntent = input && input.textContent.trim().length > 0;
      const isProcessing = this.stateManager.get('processing.active');
      
      sendBtn.disabled = !hasContext || !hasIntent || isProcessing || projectAllowed === false;
    }

    getShadowRoot() {
      return this.shadow;
    }

    destroy() {
      if (this.container) {
        this.container.remove();
        this.container = null;
        this.shadow = null;
      }
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
      background: rgba(59, 130, 246, 0.95);
      backdrop-filter: blur(12px);
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      font-weight: 500;
      text-align: center;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
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
      fontFamily: computed.fontFamily,
      padding: computed.padding,
      margin: computed.margin,
      border: computed.border
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
        element.classList?.contains('lumi-highlight') ||
        element.classList?.contains('lumi-screenshot-overlay')) {
      return true;
    }
    
    const tag = element.tagName && element.tagName.toLowerCase();
    if (tag === 'html' || tag === 'body') return true;
    
    return false;
  }

  /**
   * ContextTags - Manage context tags (elements and screenshot)
   * Handles tag display, deletion, and inline chip insertion
   */


  class ContextTags {
    constructor(shadowRoot, eventBus, stateManager) {
      this.shadowRoot = shadowRoot;
      this.eventBus = eventBus;
      this.stateManager = stateManager;
      this.container = null;
      this.lastIntentRange = null; // persist caret position within intent input
      this.CARET_MARK_ATTR = 'data-caret-marker';
      this._pointerInserted = false;
    }

    mount() {
      this.container = this.shadowRoot.getElementById('context-tags');
      if (!this.container) {
        console.error('[ContextTags] Container not found');
      }

      // Track caret position inside the intent input so we can restore it
      const input = this.shadowRoot.getElementById('intent-input');
      if (input) {
        const updateRange = (source) => {
          const sel = this._getSelection();
          if (sel && sel.rangeCount > 0 && input.contains(sel.anchorNode)) {
            this.lastIntentRange = sel.getRangeAt(0).cloneRange();
          }
        };
        // Capture on common user interactions that change caret (avoid 'focus' which may be [input,0])
        ['keyup', 'mouseup', 'input'].forEach(evt => {
          input.addEventListener(evt, () => updateRange());
        });

        // Global selection tracking covers keyboard-based caret moves and OS selection changes
        document.addEventListener('selectionchange', () => updateRange());

        input.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return; // left click only
          try {
            const x = e.clientX, y = e.clientY;
            const hit = this._rangeFromPoint(x, y, input);
            const shouldOverride = !!hit;
            if (shouldOverride) e.preventDefault();
            requestAnimationFrame(() => {
              input.focus();
              if (shouldOverride) {
                const sel = this._getSelection();
                sel.removeAllRanges();
                sel.addRange(hit);
                this.lastIntentRange = hit.cloneRange();
              }
            });
          } catch (_) {}
        });

        // Capture selection just before any click inside the bubble changes it (capture phase)
        const preClickSnapshot = () => {
          const sel = this._getSelection();
          if (sel && sel.rangeCount > 0 && input.contains(sel.anchorNode)) {
            this.lastIntentRange = sel.getRangeAt(0).cloneRange();
          }
        };
        try {
          this.shadowRoot.addEventListener('pointerdown', preClickSnapshot, { capture: true });
          this.shadowRoot.addEventListener('mousedown', preClickSnapshot, { capture: true });
          this.shadowRoot.addEventListener('touchstart', preClickSnapshot, { capture: true, passive: true });
        } catch (_) {
          // Fallback for environments without options support
          this.shadowRoot.addEventListener('pointerdown', preClickSnapshot, true);
          this.shadowRoot.addEventListener('mousedown', preClickSnapshot, true);
          this.shadowRoot.addEventListener('touchstart', preClickSnapshot, true);
        }
      }
    }

    render() {
      if (!this.container) return;

      this.container.innerHTML = '';

      const elements = this.stateManager.get('selection.elements');
      const screenshots = this.stateManager.get('selection.screenshots') || [];
      const input = this.shadowRoot.getElementById('intent-input');

      // Helper function to check if tag is already inserted
      const isTagInserted = (type, index) => {
        if (!input) return false;
        if (type === 'screenshot') {
          return input.querySelector(`.inline-element-tag[data-index="${String(index)}"]`) !== null;
        } else {
          return input.querySelector(`.inline-element-tag[data-index="${String(index)}"]`) !== null;
        }
      };

      // Render element tags
      elements.forEach((item, index) => {
        const tag = document.createElement('div');
        const isInserted = isTagInserted('element', index);

        tag.className = `context-tag${isInserted ? ' inserted' : ''}`;
        tag.innerHTML = `
        <span class="tag-label" data-index="${index}" data-type="element">${readableElementName(item.element)}</span>
        <span class="tag-remove" data-type="element" data-index="${index}">×</span>
      `;
        this.container.appendChild(tag);
      });

      // Render screenshot tags (multiple)
      screenshots.forEach((shot, idx) => {
        const tag = document.createElement('div');
        const key = `ss-${shot.id}`;
        const isInserted = isTagInserted('screenshot', key);

        tag.className = `context-tag${isInserted ? ' inserted' : ''}`;
        tag.innerHTML = `
        <span class="tag-label" data-type="screenshot" data-index="${key}">Screenshot ${idx + 1}</span>
        <span class="tag-remove" data-type="screenshot" data-id="${shot.id}">×</span>
      `;
        this.container.appendChild(tag);
      });

      // Add event listeners and sync inserted state
      this.attachListeners();
      this.updateInsertedStates();
    }

    attachListeners() {
      if (!this.container) return;
      
      // Remove buttons
      this.container.querySelectorAll('.tag-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const type = e.target.dataset.type;
          const index = e.target.dataset.index;
          
          if (type === 'element') {
            this.removeElement(parseInt(index));
          } else if (type === 'screenshot') {
            const id = e.target.dataset.id ? parseInt(e.target.dataset.id) : null;
            this.removeScreenshot(id);
          }
        });
      });
      
      // Label click to insert inline chip
      this.container.querySelectorAll('.tag-label').forEach(label => {
        // Prevent focus change so the input caret stays intact
        label.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          // Snapshot caret before input blurs (pointerdown fires before blur/click)
          const input = this.shadowRoot.getElementById('intent-input');
          if (!input) return;
          const sel = this._getSelection();
          if (sel && sel.rangeCount > 0 && input.contains(sel.anchorNode)) {
            this.lastIntentRange = sel.getRangeAt(0).cloneRange();
            // Also drop a temporary marker so we can recover exact spot even if focus shifts
            this._placeCaretMarker(this.lastIntentRange);
          }
          // If no stored range and no live selection inside input, seed to end of input
          if (!this.lastIntentRange) {
            const seeded = document.createRange();
            seeded.selectNodeContents(input);
            seeded.collapse(false);
            this.lastIntentRange = seeded.cloneRange();
          }

          // Perform insertion immediately on pointerdown to avoid any post-up focus/selection changes
          const type = e.currentTarget.dataset.type;
          if (type === 'screenshot') {
            this._pointerInserted = true;
            const key = e.currentTarget.dataset.index;
            this.insertInlineTag(e.currentTarget.textContent, key);
          } else {
            const idx = parseInt(e.currentTarget.dataset.index);
            const elements = this.stateManager.get('selection.elements');
            if (elements[idx]) {
              this._pointerInserted = true;
              this.insertInlineTag(readableElementName(elements[idx].element), idx);
            }
          }
        });
        label.addEventListener('mousedown', (e) => {
          // Some environments dispatch only mouse events; prevent default to avoid focus steal
          e.preventDefault();
        });

        label.addEventListener('click', (e) => {
          // If we already handled pointerdown insertion, ignore the click
          if (this._pointerInserted) {
            this._pointerInserted = false;
            e.preventDefault();
            return;
          }
          e.preventDefault();
          const type = e.currentTarget.dataset.type;
          
          if (type === 'screenshot') {
            const key = e.currentTarget.dataset.index;
            this.insertInlineTag(e.currentTarget.textContent, key);
          } else {
            const idx = parseInt(e.currentTarget.dataset.index);
            const elements = this.stateManager.get('selection.elements');
            if (elements[idx]) {
              this.insertInlineTag(readableElementName(elements[idx].element), idx);
            }
          }
        });
      });
    }

    insertInlineTag(label, index) {
      const input = this.shadowRoot.getElementById('intent-input');
      if (!input) return;

      // Check if tag is already inserted (prevent duplicates)
      const existingTag = input.querySelector(`.inline-element-tag[data-index="${String(index)}"]`);
      if (existingTag) {
        // Tag already exists, just focus it and scroll into view
        existingTag.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        input.focus();
        return;
      }

      // Choose the best available caret: prefer explicit marker, then live selection, then cached range
      const selection = this._getSelection();
      let workingRange = null;

      // If input isn't focused or selection isn't in input, try to restore the last known caret first
      const shadowActive = this.shadowRoot.activeElement;
      if ((!shadowActive || shadowActive !== input) && this.lastIntentRange) {
        try {
          selection.removeAllRanges();
          selection.addRange(this.lastIntentRange.cloneRange());
        } catch (_) {}
      }
      const marker = input.querySelector(`[${this.CARET_MARK_ATTR}="1"]`);
      if (marker) {
        workingRange = document.createRange();
        workingRange.setStartBefore(marker);
        workingRange.collapse(true);
        // Clean up marker immediately
        marker.remove();
      }
      if (!workingRange && selection && selection.rangeCount > 0 && input.contains(selection.anchorNode)) {
        workingRange = selection.getRangeAt(0).cloneRange();
      } else if (!workingRange && this.lastIntentRange) {
        workingRange = this.lastIntentRange.cloneRange();
      }

      input.focus();
      if (workingRange) {
        selection.removeAllRanges();
        selection.addRange(workingRange);
      }

      const range = workingRange || (() => {
        // Fallback: find better insertion point than just end of input
        const fallbackRange = document.createRange();

        // If there's existing content, find the logical insertion point
        const walker = document.createTreeWalker(input, NodeFilter.SHOW_TEXT, null);
        let lastTextNode = null;
        let textNode;

        while (textNode = walker.nextNode()) {
          lastTextNode = textNode;
        }

        if (lastTextNode && lastTextNode.textContent.trim()) {
          // Insert at end of last meaningful text content
          fallbackRange.setStart(lastTextNode, lastTextNode.textContent.length);
          fallbackRange.setEnd(lastTextNode, lastTextNode.textContent.length);
        } else {
          // Empty or only tags - insert at end of input
          fallbackRange.selectNodeContents(input);
          fallbackRange.collapse(false);
        }

        return fallbackRange;
      })();
      
      const tag = document.createElement('span');
      tag.className = 'inline-element-tag';
      tag.dataset.index = String(index);
      tag.textContent = label;
      tag.setAttribute('contenteditable', 'false');

      const remove = document.createElement('span');
      remove.className = 'inline-tag-remove';
      remove.textContent = '×';
      remove.addEventListener('click', (e) => {
        e.stopPropagation();
        tag.remove();
        this.eventBus.emit('input:changed');
        this.updateInsertedStates();
      });
      tag.appendChild(remove);

      // Normalize whitespace: remove trailing spaces before insertion
      if (range.startContainer.nodeType === 3 && /\s$/.test(range.startContainer.textContent)) {
        range.startContainer.textContent = range.startContainer.textContent.replace(/\s+$/, ' ');
      }

      range.deleteContents();
      range.insertNode(tag);
      range.setStartAfter(tag);
      range.collapse(true);

      // Insert trailing space for easier deletion (simplified logic)
      const space = document.createTextNode(' ');
      range.insertNode(space);
      range.setStartAfter(space);
      range.collapse(true);

      selection.removeAllRanges();
      selection.addRange(range);
      // Persist the latest caret position for the next interaction
      this.lastIntentRange = range.cloneRange();
      this.eventBus.emit('input:changed');
      this.updateInsertedStates();
    }

    _placeCaretMarker(range) {
      try {
        if (!range) return;
        // Remove any existing markers first
        const input = this.shadowRoot.getElementById('intent-input');
        if (!input) return;
        input.querySelectorAll(`[${this.CARET_MARK_ATTR}]`).forEach(n => n.remove());

        const marker = document.createElement('span');
        marker.setAttribute(this.CARET_MARK_ATTR, '1');
        // Invisible, zero footprint
        marker.style.cssText = 'display:inline-block;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none;';
        // Use a ZWSP to ensure the node positions correctly in text nodes
        marker.textContent = '\u200b';
        const collapsed = range.cloneRange();
        collapsed.collapse(true);
        collapsed.insertNode(marker);
      } catch (_) {
        // Best-effort; if marker fails we still rely on cached range
      }
    }

    updateInsertedStates() {
      if (!this.container) return;
      const input = this.shadowRoot.getElementById('intent-input');
      if (!input) return;

      this.container.querySelectorAll('.context-tag').forEach(tag => {
        const label = tag.querySelector('.tag-label');
        if (!label) return;
        const index = label.dataset.index;
        const selector = `.inline-element-tag[data-index="${String(index)}"]`;
        const inserted = !!input.querySelector(selector);
        tag.classList.toggle('inserted', inserted);
      });
    }

    _getSelection() {
      try {
        if (this.shadowRoot && typeof this.shadowRoot.getSelection === 'function') {
          const sel = this.shadowRoot.getSelection();
          if (sel) return sel;
        }
      } catch (_) {}
      try {
        return window.getSelection();
      } catch (_) {
        return null;
      }
    }

    _rangeFromPoint(x, y, root) {
      try {
        let range = null;
        // Prefer standard caretPositionFromPoint if available (gives node + offset)
        const pos = (this.shadowRoot && typeof this.shadowRoot.caretPositionFromPoint === 'function')
          ? this.shadowRoot.caretPositionFromPoint(x, y)
          : (document.caretPositionFromPoint ? document.caretPositionFromPoint(x, y) : null);
        if (pos && pos.offsetNode) {
          range = document.createRange();
          range.setStart(pos.offsetNode, pos.offset);
          range.collapse(true);
        }
        if (!range) {
          const r2 = (this.shadowRoot && typeof this.shadowRoot.caretRangeFromPoint === 'function')
            ? this.shadowRoot.caretRangeFromPoint(x, y)
            : (document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null);
          if (r2) {
            range = r2;
          }
        }
        if (range && root && !root.contains(range.startContainer)) {
          // If the calculated range is not within the input, ignore it
          return null;
        }
        return range;
      } catch (_) {
        return null;
      }
    }

    removeElement(index) {
      const elements = this.stateManager.get('selection.elements');
      elements.splice(index, 1);
      this.stateManager.set('selection.elements', elements);

      // Remove corresponding inline chips and update indices for remaining elements
      const input = this.shadowRoot.getElementById('intent-input');
      if (input) {
        // Remove the specific inline tag for this element
        input.querySelectorAll(`.inline-element-tag[data-index="${String(index)}"]`).forEach(node => {
          this.cleanupWhitespaceAroundNode(node);
          node.remove();
        });

        // Update indices for all subsequent inline tags (critical fix)
        input.querySelectorAll('.inline-element-tag').forEach(tag => {
          const currentIndex = parseInt(tag.dataset.index);
          if (currentIndex > index) {
            tag.dataset.index = String(currentIndex - 1);
          }
        });
      }

      this.eventBus.emit('element:removed', index);
      this.render();
    }

    removeScreenshot(id) {
      const list = (this.stateManager.get('selection.screenshots') || []).slice();
      const idx = list.findIndex(s => s.id === id);
      if (idx >= 0) list.splice(idx, 1);
      this.stateManager.set('selection.screenshots', list);
      
      // Remove corresponding inline chips
      const input = this.shadowRoot.getElementById('intent-input');
      if (input) {
        input.querySelectorAll(`.inline-element-tag[data-index="ss-${id}"]`).forEach(node => {
          this.cleanupWhitespaceAroundNode(node);
          node.remove();
        });
      }
      
      this.eventBus.emit('screenshot:removed');
      this.render();
    }

    cleanupWhitespaceAroundNode(node) {
      const prev = node.previousSibling;
      const next = node.nextSibling;
      
      if (next && next.nodeType === 3 && next.textContent.startsWith(' ')) {
        next.textContent = next.textContent.slice(1);
      } else if (prev && prev.nodeType === 3 && /\s$/.test(prev.textContent)) {
        prev.textContent = prev.textContent.replace(/\s$/, '');
      }
    }

    clear() {
      this.stateManager.batch({
        'selection.elements': [],
        'selection.screenshots': []
      });

      const input = this.shadowRoot.getElementById('intent-input');
      if (input) {
        // Remove all inline tags and clear the input
        input.querySelectorAll('.inline-element-tag').forEach(tag => {
          tag.remove();
        });
        input.textContent = '';
      }

      this.render();
    }
  }

  /**
   * HighlightManager - Unified management of all page highlights
   */

  class HighlightManager {
    constructor() {
      this.hoverHighlight = null;
      this.selectionHighlights = [];
      this.screenshotOverlay = null;
    }

    /**
     * Show hover highlight for element
     */
    showHover(element) {
      this.hideHover();
      
      const bbox = element.getBoundingClientRect();
      const highlight = document.createElement('div');
      highlight.className = 'lumi-highlight lumi-hover';
      highlight.style.cssText = `
      position: absolute;
      top: ${bbox.top + window.scrollY}px;
      left: ${bbox.left + window.scrollX}px;
      width: ${bbox.width}px;
      height: ${bbox.height}px;
      background: rgba(59, 130, 246, 0.1);
      border: 2px solid #3b82f6;
      pointer-events: none;
      z-index: 2147483645;
      border-radius: 2px;
      animation: fadeIn 0.15s;
    `;
      
      document.body.appendChild(highlight);
      this.hoverHighlight = highlight;
    }

    /**
     * Hide hover highlight
     */
    hideHover() {
      if (this.hoverHighlight) {
        this.hoverHighlight.remove();
        this.hoverHighlight = null;
      }
    }

    /**
     * Add selection highlight for element
     */
    addSelection(element) {
      const bbox = element.getBoundingClientRect();
      const highlight = document.createElement('div');
      highlight.className = 'lumi-highlight lumi-selected';
      highlight.style.cssText = `
      position: absolute;
      top: ${bbox.top + window.scrollY}px;
      left: ${bbox.left + window.scrollX}px;
      width: ${bbox.width}px;
      height: ${bbox.height}px;
      background: rgba(16, 185, 129, 0.15);
      border: 2px solid #10b981;
      pointer-events: none;
      z-index: 2147483645;
      border-radius: 2px;
      animation: scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    `;
      
      // Add label
      const label = document.createElement('div');
      label.style.cssText = `
      position: absolute;
      top: -24px;
      left: 0;
      padding: 4px 8px;
      background: #10b981;
      color: white;
      font-size: 11px;
      font-weight: 500;
      border-radius: 4px;
      white-space: nowrap;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
      label.textContent = element.tagName.toLowerCase() + (element.className ? '.' + element.className.split(' ')[0] : '');
      highlight.appendChild(label);
      
      document.body.appendChild(highlight);
      this.selectionHighlights.push(highlight);
      
      return this.selectionHighlights.length - 1;
    }

    /**
     * Remove selection highlight by index
     */
    removeSelection(index) {
      if (this.selectionHighlights[index]) {
        this.selectionHighlights[index].remove();
        this.selectionHighlights.splice(index, 1);
      }
    }

    /**
     * Clear all selection highlights
     */
    clearAllSelections() {
      this.selectionHighlights.forEach(h => h.remove());
      this.selectionHighlights = [];
    }

    /**
     * Show screenshot overlay
     */
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
      border: 2px dashed #3b82f6;
      background: rgba(59, 130, 246, 0.1);
      pointer-events: none;
      z-index: 2147483645;
    `;
      
      document.body.appendChild(overlay);
      this.screenshotOverlay = overlay;
    }

    /**
     * Update screenshot overlay dimensions
     */
    updateScreenshotOverlay(bbox) {
      if (!this.screenshotOverlay) {
        this.showScreenshotOverlay(bbox);
        return;
      }
      
      this.screenshotOverlay.style.left = bbox.left + 'px';
      this.screenshotOverlay.style.top = bbox.top + 'px';
      this.screenshotOverlay.style.width = bbox.width + 'px';
      this.screenshotOverlay.style.height = bbox.height + 'px';
    }

    /**
     * Hide screenshot overlay
     */
    hideScreenshotOverlay() {
      if (this.screenshotOverlay) {
        this.screenshotOverlay.remove();
        this.screenshotOverlay = null;
      }
    }

    /**
     * Clear all highlights
     */
    clearAll() {
      this.hideHover();
      this.clearAllSelections();
      this.hideScreenshotOverlay();
    }
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

      this.highlightManager.addSelection(element);
      this.eventBus.emit('element:selected', item);
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
      const host = url.host;
      for (const project of projects) {
        if (!project || project.enabled === false) continue;
        const hosts = Array.isArray(project.hosts) ? project.hosts : [];
        if (hosts.some((pattern) => hostMatches(pattern, host))) {
          return { project };
        }
      }
    } catch (error) {
      return { project: null };
    }

    return { project: null };
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

    async execute(engine, intent, elements, screenshot, pageInfo, screenshots = []) {
      const context = this.buildContext(intent, elements, screenshot, pageInfo, screenshots);
      
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

    buildContext(intent, elements, screenshot, pageInfo, screenshots = []) {
      const context = {
        intent,
        pageUrl: pageInfo.url,
        pageTitle: pageInfo.title,
        selectionMode: elements.length > 0 ? 'element' : 'screenshot'
      };
      
      // Add element context - support multiple elements
      if (elements.length > 0) {
        if (elements.length === 1) {
          // Single element - keep original format
          context.element = {
            tagName: elements[0].element.tagName,
            selector: elements[0].selector,
            className: elements[0].element.className,
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
      
      return context;
    }
  }

  function getElementText(element) {
    if (!element) return '';
    const text = (element.textContent || '').trim();
    return text.length > 400 ? text.slice(0, 400) + '…' : text;
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

    // If the script is accidentally loaded in page context (no runtime), bail out early
    if (!chromeBridge.isRuntimeAvailable()) {
      console.warn('[LUMI] Chrome runtime not available in this context; skipping init');
      return;
    }

    // Initialize UI
    const bubbleUI = new BubbleUI(eventBus, stateManager);
    const topBanner = new TopBanner();
    let contextTags = null;

    // Initialize selection helpers (instantiated after UI mounts)
    const highlightManager = new HighlightManager();
    let elementSelector = null;
    let screenshotSelector = null;

    // Initialize engine & health
    const engineManager = new EngineManager(eventBus, stateManager, chromeBridge);
    const healthChecker = new HealthChecker(eventBus, stateManager, chromeBridge, engineManager);

    // Inject global styles
    function injectGlobalStyles() {
      const style = document.createElement('style');
      style.textContent = GLOBAL_STYLES;
      document.head.appendChild(style);
    }

    // Event bindings
    function bindEvents() {
      function refreshElementHighlights() {
        highlightManager.clearAllSelections();
        const elements = stateManager.get('selection.elements');
        elements.forEach(item => highlightManager.addSelection(item.element));
      }

      // Selection events
      eventBus.on('element:selected', () => {
        bubbleUI.updateSendButtonState();
        if (contextTags) {
          contextTags.render();
        }
      });

      eventBus.on('element:removed', () => {
        bubbleUI.updateSendButtonState();
        refreshElementHighlights();
        if (contextTags) {
          contextTags.render();
        }
      });

      eventBus.on('selection:clear', () => {
        highlightManager.clearAll();
        bubbleUI.updateSendButtonState();
        if (contextTags) {
          contextTags.render();
        }
      });

      eventBus.on('screenshot:captured', () => {
        bubbleUI.updateSendButtonState();
        if (contextTags) {
          contextTags.render();
        }
      });

      eventBus.on('screenshot:removed', () => {
        bubbleUI.updateSendButtonState();
        if (contextTags) {
          contextTags.render();
        }
      });

      eventBus.on('screenshot:error', (error) => {
        const message = error?.message || 'Screenshot capture failed';
        bubbleUI.showStatus(message, 'error');
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

      // Mode toggle events
      eventBus.on('mode:toggle-element', () => {
        if (!elementSelector || !screenshotSelector) return;
        const currentMode = stateManager.get('ui.mode');

        if (currentMode === 'element') {
          elementSelector.deactivate();
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
        } else {
          elementSelector.deactivate();
          screenshotSelector.activate();
        }
      });

      // Bubble events
      eventBus.on('bubble:close', () => {
        bubbleUI.hide();
        if (elementSelector) elementSelector.deactivate();
        if (screenshotSelector) screenshotSelector.deactivate();
        highlightManager.clearAll();
      });

      eventBus.on('bubble:toggle', () => {
        const isVisible = stateManager.get('ui.bubbleVisible');

        if (isVisible) {
          bubbleUI.hide();
          if (elementSelector) elementSelector.deactivate();
          if (screenshotSelector) screenshotSelector.deactivate();
          highlightManager.clearAll();
        } else {
          bubbleUI.show();
          if (elementSelector) elementSelector.activate(); // Auto-activate element mode
        }
      });

      // Engine events
      eventBus.on('engine:select', (engine) => {
        console.log('[Content] Engine select requested:', engine);
        if (!engineManager.isEngineAvailable(engine)) {
          const message = engine === 'claude'
            ? 'Claude CLI not detected. Please install Claude Code CLI to enable.'
            : 'Codex CLI not detected. Please install Codex CLI to enable.';
          bubbleUI.showStatus(message, 'error');
          return;
        }
        // Switch engine and update UI immediately for responsiveness
        engineManager.selectEngine(engine);
        bubbleUI.updateEngineSelector(engine);
      });

      eventBus.on('engine:selected', (engine) => {
        console.log('[Content] Engine selected, updating UI:', engine);
        const shadow = bubbleUI.getShadowRoot();
        if (shadow) {
          bubbleUI.updateEngineSelector(engine);
        }
      });

      eventBus.on('engine:availability-updated', ({ codex, claude }) => {
        console.log('[Content] Engine availability event received:', { codex, claude });
        bubbleUI.updateEngineAvailability({ codex, claude });
        const current = engineManager.getCurrentEngine();
        if (!engineManager.isEngineAvailable(current)) {
          const fallback = codex ? 'codex' : claude ? 'claude' : null;
          if (fallback && fallback !== current) {
            console.log('[Content] Current engine unavailable, falling back to:', fallback);
            engineManager.selectEngine(fallback);
            const message = current === 'claude'
              ? 'Claude CLI not detected. Switched back to Codex.'
              : 'Codex CLI not detected. Switched back to Claude.';
            bubbleUI.showStatus(message, 'error');
          } else {
            const message = current === 'claude'
              ? 'Claude CLI not detected. Please install Claude Code CLI to enable.'
              : 'Codex CLI not detected. Please install Codex CLI to enable.';
            bubbleUI.showStatus(message, 'error');
          }
        }
      });

      // State subscription: Update UI when engine state changes
      stateManager.subscribe('engine.current', (newEngine, oldEngine) => {
        console.log('[Content] Engine state changed:', oldEngine, '->', newEngine);
        const shadow = bubbleUI.getShadowRoot();
        if (shadow) {
          bubbleUI.updateEngineSelector(newEngine);
        }
      });

      // Input events
      eventBus.on('input:changed', () => {
        bubbleUI.updateSendButtonState();
        if (contextTags) contextTags.updateInsertedStates();
      });

      // Submit event
      eventBus.on('submit:requested', async () => {
        const intent = bubbleUI.getInputValue();
        const elements = stateManager.get('selection.elements');
        const screenshots = stateManager.get('selection.screenshots') || [];
        const projectAllowed = stateManager.get('projects.allowed');

        if (!intent || (elements.length === 0 && screenshots.length === 0)) {
          bubbleUI.showStatus('Please select an element or capture a screenshot first', 'error');
          return;
        }

        if (projectAllowed === false) {
          const message = 'LUMI is not configured for this site. Open Settings to map it to a project before submitting.';
          bubbleUI.showStatus(message, 'error');
          eventBus.emit('notify:error', message);
          return;
        }

      const engine = engineManager.getCurrentEngine();
      if (!engineManager.isEngineAvailable(engine)) {
        const message = engine === 'claude'
          ? 'Claude CLI not detected. Please install Claude Code CLI to enable.'
          : 'Codex CLI not detected. Please install Codex CLI to enable.';
        bubbleUI.showStatus(message, 'error');
        return;
      }

      stateManager.set('processing.active', true);
      bubbleUI.setLoading(true, 'Analyzing...');

      try {
        console.log('[Content] Submitting with engine:', engine, 'elements:', elements.length);

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
            screenshots
          );

          if (result.success) {
            bubbleUI.showStatus('Success! Changes applied.', 'success');
            bubbleUI.clearInput();

            // Clear selections after successful submission
            stateManager.batch({
              'selection.elements': [],
              'selection.screenshots': []
            });
            if (contextTags) {
              contextTags.render();
            }
            bubbleUI.updateSendButtonState();
            highlightManager.clearAll();
          } else {
            bubbleUI.showStatus(result.error || 'Request failed', 'error');
          }
        } catch (error) {
          console.error('[Content] Submit failed:', error);
          bubbleUI.showStatus('Network error: ' + error.message, 'error');
        } finally {
          stateManager.set('processing.active', false);
          bubbleUI.setLoading(false);
        }
      });

      // Health check events
      eventBus.on('health:server-status-changed', (isHealthy) => {
        bubbleUI.updateServerStatus(isHealthy);
      });

      eventBus.on('health:capabilities-updated', ({ codex, claude }) => {
        console.log('[Content] Engine capabilities updated:', { codex, claude });
        bubbleUI.updateEngineAvailability({ codex, claude });
      });

      // Context clear
      eventBus.on('context:clear', () => {
        stateManager.batch({
          'selection.elements': [],
          'selection.screenshots': []
        });
        bubbleUI.updateSendButtonState();
        if (contextTags) {
          contextTags.render();
        }
        highlightManager.clearAll();
      });

      eventBus.on('projects:blocked', ({ host }) => {
        if (stateManager.get('ui.bubbleVisible')) {
          topBanner.update('LUMI is not configured for this page. Open Settings to map it to a project.');
        }
        bubbleUI.updateSendButtonState();
      });

      eventBus.on('projects:allowed', () => {
        topBanner.hide();
        bubbleUI.updateSendButtonState();
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

        // Esc: Close bubble or deactivate mode
        if (e.key === 'Escape') {
          const isVisible = stateManager.get('ui.bubbleVisible');
          const mode = stateManager.get('ui.mode');

          if (mode !== 'idle') {
            if (elementSelector) elementSelector.deactivate();
            if (screenshotSelector) screenshotSelector.deactivate();
          } else if (isVisible) {
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

      // Mount UI components
      bubbleUI.mount();
      topBanner.mount();

      // Mount context tags inside bubble shadow DOM
      const shadowRoot = bubbleUI.getShadowRoot();
      contextTags = new ContextTags(shadowRoot, eventBus, stateManager);
      contextTags.mount();

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
