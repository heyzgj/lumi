/**
 * LUMI Background Service Worker
 * Handles extension lifecycle, content script injection, and local server communication
 */

const SERVER_URL = 'http://127.0.0.1:3456';
let serverHealthy = false;

// Initialize on install/update
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[LUMI] Extension installed/updated:', details.reason);
  
  // Initialize storage with defaults
  chrome.storage.local.get(['engine', 'selectionMode'], (result) => {
    if (!result.engine) {
      chrome.storage.local.set({ engine: 'codex' });
    }
    if (!result.selectionMode) {
      chrome.storage.local.set({ selectionMode: 'rectangle' });
    }
  });
});

// Health check for local server
async function checkServerHealth() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch(`${SERVER_URL}/health`, {
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const data = await response.json();
      serverHealthy = (data.status === 'ok');
      if (serverHealthy) {
        console.log('[LUMI] Server is healthy');
      }
      // Return structured data so content script can reflect capabilities
      return { healthy: serverHealthy, config: data };
    }
    
    serverHealthy = false;
    return { healthy: false };
  } catch (error) {
    console.error('[LUMI] Server health check failed:', error.message);
    serverHealthy = false;
    return { healthy: false, error: error.message };
  }
}

// Handle extension icon click - inject content script
chrome.action.onClicked.addListener(async (tab) => {
  console.log('[LUMI] Extension icon clicked for tab:', tab.id);

  try {
    // Check if content script is already injected
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => !!window.LUMI_INJECTED
    });

    if (result.result) {
      console.log('[LUMI] Content script already injected, toggling bubble');
      // Send message to toggle bubble
      chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_BUBBLE' });
      return;
    }

    // Inject content script and styles
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });

    console.log('[LUMI] Content script injected successfully');
    // After injection, explicitly toggle bubble once so first click shows bubble only
    setTimeout(() => {
      chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_BUBBLE' });
    }, 80);
    
  } catch (error) {
    console.error('[LUMI] Failed to inject content script:', error);
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((message = {}, sender = {}, sendResponse) => {
  const { type } = message;
  console.log('[LUMI] Message received:', type);

  if (type === 'CHECK_SERVER') {
    checkServerHealth()
      .then((result) => {
        if (typeof result === 'boolean') {
          sendResponse({ healthy: result });
        } else {
          sendResponse({ healthy: !!result.healthy, config: result.config });
        }
      })
      .catch((error) => {
        console.error('[LUMI] CHECK_SERVER failed:', error);
        sendResponse({ healthy: false, error: error?.message || 'Health check failed' });
      });
    return true; // Keep message channel open
  }

  if (type === 'CAPTURE_SCREENSHOT') {
    handleScreenshotCapture(sender, sendResponse);
    return true; // Async response
  }

  if (type === 'SEND_TO_SERVER') {
    const { engine, context } = message.payload || {};
    forwardToServer(engine, context)
      .then((result) => sendResponse(result))
      .catch((error) => {
        console.error('[LUMI] SEND_TO_SERVER failed:', error);
        sendResponse({
          error: error?.message || 'Failed to connect to server. Is the LUMI server running?',
          errorName: error?.name,
          errorMessage: error?.message,
          details: error?.toString(),
          timestamp: Date.now()
        });
      });
    return true;
  }

  return false;
});

async function forwardToServer(engine, context) {
  if (!engine) {
    console.warn('[LUMI] Missing engine in SEND_TO_SERVER payload');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3900000); // 65 minutes

  try {
    console.log('[LUMI] Forwarding to server /execute');

    const payload = JSON.stringify({ engine, context });
    const payloadSize = new Blob([payload]).size;
    console.log('[LUMI] Payload size:', (payloadSize / 1024 / 1024).toFixed(2), 'MB');

    if (payloadSize > 50 * 1024 * 1024) {
      console.warn('[LUMI] Payload exceeds 50MB limit!');
    }

    const response = await fetch(`${SERVER_URL}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: payload,
      signal: controller.signal
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Server error' }));
      return {
        error: errorData.error || `Server returned ${response.status}`,
        timestamp: Date.now()
      };
    }

    const result = await response.json();
    console.log('[LUMI] Sending response back to content:', !!result && Object.keys(result));
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

function handleScreenshotCapture(sender, sendResponse) {
  const windowId = sender?.tab?.windowId;

  const respondWithError = (message) => {
    console.error('[LUMI] Screenshot failed:', message);
    sendResponse({ error: message });
  };

  const capture = (targetWindowId) => {
    try {
      chrome.tabs.captureVisibleTab(targetWindowId, { format: 'png' }, (dataUrl) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          respondWithError(lastError.message);
          return;
        }
        if (!dataUrl) {
          respondWithError('Screenshot capture failed');
          return;
        }
        sendResponse({ dataUrl });
      });
    } catch (error) {
      respondWithError(error?.message || 'Screenshot capture failed');
    }
  };

  if (typeof windowId === 'number') {
    capture(windowId);
  } else {
    console.warn('[LUMI] Screenshot request missing windowId, using current window');
    chrome.windows.getCurrent((win) => {
      const targetId = win?.id;
      if (typeof targetId !== 'number') {
        respondWithError('Unable to determine target window for screenshot');
        return;
      }
      capture(targetId);
    });
  }
}

// Check server on startup
checkServerHealth();

console.log('[LUMI] Background service worker initialized v2.0 (HTTP Server)');
