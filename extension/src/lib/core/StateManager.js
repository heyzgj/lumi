/**
 * StateManager - Centralized state management with observer pattern
 * Manages all application state and notifies listeners on changes
 */

export default class StateManager {
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
