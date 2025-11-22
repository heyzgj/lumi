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
let BG_DEBUG = false;

function bgLog(...args) {
  try { if (BG_DEBUG) console.info('[LUMI BG]', ...args); } catch (_) {}
}

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

      if (!workingDirectory) return null;

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
  if (area === 'local' && changes.lumiDebug) {
    BG_DEBUG = !!changes.lumiDebug.newValue;
    bgLog('lumiDebug toggled:', BG_DEBUG);
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
function isAllowedHost(url = '') {
  try {
    const { hostname } = new URL(url);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch (_) {
    return false;
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  // Allow toggling/injection on any host; page-level blocking is handled in-app
  console.info('[LUMI] action clicked for', tab?.url || 'unknown', 'inject=forced');
  console.log('[LUMI] Extension icon clicked for tab:', tab.id);

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => !!window.LUMI_INJECTED
    });

    if (result.result) {
      console.log('[LUMI] Content script already injected, toggling bubble');
      try {
        chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_BUBBLE' }, () => {
          const err = chrome.runtime.lastError;
          if (err) console.debug('[LUMI] toggle sendMessage lastError (non-fatal):', err.message);
        });
      } catch (err) {
        console.debug('[LUMI] toggle sendMessage threw (non-fatal):', err?.message);
      }
      return;
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });

    console.log('[LUMI] Content script injected successfully');
    setTimeout(() => {
      try {
        chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_BUBBLE' }, () => {
          const err = chrome.runtime.lastError;
          if (err) console.debug('[LUMI] post-inject sendMessage lastError (non-fatal):', err.message);
        });
      } catch (err) {
        console.debug('[LUMI] post-inject sendMessage threw (non-fatal):', err?.message);
      }
    }, 120);
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

async function forwardStreamToServer(engine, context, tabId, streamId) {
  if (!tabId) {
    console.warn('[LUMI] Missing tabId for stream request');
    return;
  }

  const emitToTab = (payload) => {
    try {
      chrome.tabs.sendMessage(tabId, payload, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          console.debug('[LUMI] stream sendMessage lastError (non-fatal):', err.message);
        }
      });
    } catch (error) {
      console.debug('[LUMI] stream sendMessage threw (non-fatal):', error?.message);
    }
  };

  const emitError = (message) => {
    emitToTab({ type: 'STREAM_ERROR', streamId, error: message });
  };

  const emitDone = (result) => {
    emitToTab({ type: 'STREAM_DONE', streamId, result });
  };

  const emitChunk = (chunk) => {
    emitToTab({ type: 'STREAM_CHUNK', streamId, chunk });
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3900000); // 65 minutes

  try {
    const response = await fetch(`${serverUrl}/execute/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ engine, context }),
      signal: controller.signal
    });

    if (!response.ok || !response.body) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData.error || `Server returned ${response.status}`;
      emitError(message);
      emitDone({ success: false, error: message, timestamp: Date.now() });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const handleEvent = (raw) => {
      if (!raw) return;
      const dataLines = raw
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.replace(/^data:\s?/, ''))
        .join('\n');
      if (!dataLines.trim()) return;
      let payload;
      try {
        payload = JSON.parse(dataLines);
      } catch (error) {
        console.warn('[LUMI] Failed to parse SSE payload:', error?.message);
        return;
      }
      const { type } = payload || {};
      if (type === 'chunk' && payload.chunk) {
        emitChunk(payload.chunk);
        return;
      }
      if (type === 'error') {
        emitError(payload.error || 'Stream error');
        return;
      }
      if (type === 'done') {
        emitDone(payload);
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep = buffer.indexOf('\n\n');
      while (sep !== -1) {
        const raw = buffer.slice(0, sep).trim();
        buffer = buffer.slice(sep + 2);
        handleEvent(raw);
        sep = buffer.indexOf('\n\n');
      }
    }

    if (buffer.trim()) {
      handleEvent(buffer.trim());
    }
  } catch (error) {
    console.error('[LUMI] STREAM fetch failed:', error?.message);
    emitError(error?.message || 'Failed to connect to stream');
    emitDone({ success: false, error: error?.message || 'Stream aborted', timestamp: Date.now() });
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
  bgLog('onMessage', type);

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
    bgLog('SEND_TO_SERVER', { engine, intent: context?.intent?.slice?.(0, 60) });
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

  if (type === 'EXECUTE_STREAM') {
    const { engine, context, streamId } = message.payload || {};
    const tabId = sender?.tab?.id;
    bgLog('EXECUTE_STREAM', { engine, intent: context?.intent?.slice?.(0, 60), streamId });
    forwardStreamToServer(engine, context, tabId, streamId).catch((error) => {
      console.error('[LUMI] EXECUTE_STREAM failed:', error);
      try {
        chrome.tabs.sendMessage(tabId, {
          type: 'STREAM_ERROR',
          streamId,
          error: error?.message || 'Stream execution failed'
        });
      } catch (_) {}
    });
    sendResponse({ success: true });
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

// Auto-inject on mapped hosts
const injectedTabs = new Set();

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

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Clear injection flag when navigation starts (page refresh/reload)
  if (changeInfo.status === 'loading') {
    injectedTabs.delete(tabId);
    return;
  }
  
  // Only inject when page has fully loaded
  if (changeInfo.status !== 'complete') return;
  
  // Avoid duplicate injection within same page lifecycle
  if (injectedTabs.has(tabId)) return;
  
  // Check if auto-inject is enabled
  const { autoInject = true } = await chrome.storage.local.get('autoInject');
  if (autoInject === false) return;
  
  // Check if host is mapped to a project
  const settings = await refreshSettings();
  const projects = settings.projects || [];
  
  try {
    const url = new URL(tab.url);
    const host = url.host;
    
    const mapped = projects.some(p => 
      p.enabled && (p.hosts || []).some(pattern => hostMatches(pattern, host))
    );
    
    if (!mapped) return;
    
    // Inject content script
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    
    injectedTabs.add(tabId);
    console.log('[LUMI] Auto-injected content script for', host);
    
    // Don't auto-open Dock on refresh - let user click icon to open
  } catch (err) {
    console.error('[LUMI] Auto-inject failed:', err);
  }
});

// Clean up closed tabs
chrome.tabs.onRemoved.addListener((tabId) => {
  injectedTabs.delete(tabId);
});

// Rebuild injected tabs on startup (in case extension was reloaded)
chrome.runtime.onStartup.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => !!window.LUMI_INJECTED
      });
      if (result?.result) {
        injectedTabs.add(tab.id);
      }
    } catch (err) {
      // Tab may not be accessible, ignore
    }
  }
});

// Check server on startup
checkServerHealth();

console.log('[LUMI] Background service worker initialized v3.1 (auto-inject + session persistence)');
