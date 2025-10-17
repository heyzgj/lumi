/**
 * LUMI Background Service Worker
 * Handles extension lifecycle, content script injection, and local server communication
 */

const DEFAULT_SERVER_URL = 'http://127.0.0.1:3456';
const STORAGE_KEY = 'lumiSettings';
const DEFAULT_SETTINGS = {
  serverUrl: DEFAULT_SERVER_URL,
  defaultEngine: 'codex',
  codex: {
    model: 'gpt-5-codex-high',
    sandbox: 'workspace-write',
    approvals: 'never',
    extraArgs: ''
  },
  claude: {
    model: 'claude-sonnet-4.5',
    tools: ['TextEditor', 'Read'],
    outputFormat: 'json',
    permissionMode: 'acceptEdits',
    extraArgs: ''
  },
  projects: []
};

let serverUrl = DEFAULT_SERVER_URL;
let serverHealthy = false;

function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return DEFAULT_SERVER_URL;
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function normalizeHostPattern(value) {
  if (!value) return '';
  let pattern = String(value).trim().toLowerCase();
  if (!pattern) return '';

  if (pattern.startsWith('http://')) {
    pattern = pattern.slice(7);
  } else if (pattern.startsWith('https://')) {
    pattern = pattern.slice(8);
  }

  if (pattern.startsWith('//')) {
    pattern = pattern.slice(2);
  }

  if (pattern.endsWith('/')) {
    pattern = pattern.replace(/\/+$/, '');
  }

  return pattern;
}

function sanitizeProjects(projects = []) {
  if (!Array.isArray(projects)) return [];
  return projects
    .map((project) => {
      if (!project || typeof project !== 'object') return null;
      const id = typeof project.id === 'string' && project.id.trim().length ? project.id.trim() : undefined;
      const name = typeof project.name === 'string' ? project.name : '';
      const workingDirectory = typeof project.workingDirectory === 'string'
        ? project.workingDirectory.trim()
        : '';
      const hosts = Array.isArray(project.hosts)
        ? project.hosts.map((host) => normalizeHostPattern(String(host))).filter(Boolean)
        : [];
      const enabled = project.enabled !== false;

      if (!workingDirectory || hosts.length === 0) return null;

      return {
        id,
        name,
        workingDirectory,
        hosts,
        enabled
      };
    })
    .filter(Boolean);
}

async function refreshSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY, 'engine', 'selectionMode'], (result) => {
      const stored = result[STORAGE_KEY];
      const settings = stored ? mergeSettings(stored) : DEFAULT_SETTINGS;
      serverUrl = sanitizeUrl(settings.serverUrl);

      const updates = {};
      if (!stored) updates[STORAGE_KEY] = settings;
      if (!result.engine) updates.engine = settings.defaultEngine || DEFAULT_SETTINGS.defaultEngine;
      if (!result.selectionMode) updates.selectionMode = 'rectangle';

      if (Object.keys(updates).length > 0) {
        chrome.storage.local.set(updates);
      }

      resolve(settings);
    });
  });
}

function mergeSettings(input = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...input,
    codex: {
      ...DEFAULT_SETTINGS.codex,
      ...(input.codex || {})
    },
    claude: {
      ...DEFAULT_SETTINGS.claude,
      ...(input.claude || {})
    },
    projects: sanitizeProjects(input.projects)
  };
}

refreshSettings().then((settings) => {
  handleApplySettings(settings).catch((error) => {
    console.warn('[LUMI] Initial config sync failed:', error?.message);
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEY]) {
    const next = changes[STORAGE_KEY].newValue || DEFAULT_SETTINGS;
    serverUrl = sanitizeUrl(next.serverUrl);
  }
});

// Initialize on install/update
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[LUMI] Extension installed/updated:', details.reason);
  await refreshSettings();

  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage().catch((error) => {
      console.warn('[LUMI] Failed to open options page:', error?.message);
    });
  }
});

// Health check for local server
async function checkServerHealth() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${serverUrl}/health`, {
      method: 'GET',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      serverHealthy = data.status === 'ok';
      if (serverHealthy) {
        console.log('[LUMI] Server is healthy');
      }
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
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => !!window.LUMI_INJECTED
    });

    if (result.result) {
      console.log('[LUMI] Content script already injected, toggling bubble');
      chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_BUBBLE' });
      return;
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });

    console.log('[LUMI] Content script injected successfully');
    setTimeout(() => {
      chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_BUBBLE' });
    }, 80);
  } catch (error) {
    console.error('[LUMI] Failed to inject content script:', error);
  }
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

    const response = await fetch(`${serverUrl}/execute`, {
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

async function handleApplySettings(payload = {}) {
  const merged = mergeSettings(payload);
  const projects = sanitizeProjects(merged.projects);
  merged.projects = projects;
  serverUrl = sanitizeUrl(merged.serverUrl);

  try {
    const response = await fetch(`${serverUrl}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        defaultEngine: merged.defaultEngine,
        workingDirectory: merged.workingDirectory,
        codex: merged.codex,
        claude: merged.claude,
        projects
      })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Server responded with ${response.status}`);
    }
  } catch (error) {
    console.warn('[LUMI] Failed to sync config with server:', error?.message);
  }

  return merged;
}

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
    return true;
  }

  if (type === 'CAPTURE_SCREENSHOT') {
    handleScreenshotCapture(sender, sendResponse);
    return true;
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

  if (type === 'APPLY_SETTINGS') {
    handleApplySettings(message.payload)
      .then((settings) => sendResponse({ success: true, settings }))
      .catch((error) => {
        console.error('[LUMI] APPLY_SETTINGS failed:', error);
        sendResponse({ success: false, error: error?.message });
      });
    return true;
  }

  return false;
});

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

console.log('[LUMI] Background service worker initialized v3.0 (configurable server)');
