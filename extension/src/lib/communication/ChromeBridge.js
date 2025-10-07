/**
 * ChromeBridge - Abstraction layer for Chrome extension APIs
 * Provides safe wrappers for all Chrome API calls
 */

export default class ChromeBridge {
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
