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

// Core
import EventBus from './lib/core/EventBus.js';
import StateManager from './lib/core/StateManager.js';

// UI
import TopBanner from './lib/ui/TopBanner.js';
import { GLOBAL_STYLES } from './lib/ui/styles.js';
import { TOKENS_CSS } from '../shared/tokens.js';
import { readableElementName } from './lib/utils/dom.js';

// Selection
import HighlightManager from './lib/selection/HighlightManager.js';
import ElementSelector from './lib/selection/ElementSelector.js';
import AnnotateManager from './lib/annotate/AnnotateManager.js';

// Engine & Communication
import EngineManager from './lib/engine/EngineManager.js';
import HealthChecker from './lib/engine/HealthChecker.js';
import ChromeBridge from './lib/communication/ChromeBridge.js';
import ServerClient from './lib/communication/ServerClient.js';
import DockRoot from './lib/ui/dock/DockRoot.js';
import { setDockThemeMode } from './lib/ui/dock/theme.js';
import DockEditModal from './lib/ui/dock/DockEditModal.js';
import StyleApplier from './lib/engine/StyleApplier.js';
import StyleHistory from './lib/engine/StyleHistory.js';
import { deriveChunksFromText } from './lib/engine/deriveChunksFromText.js';
// Viewport (M0 scaffolding)
import ViewportController from './lib/ui/viewport/ViewportController.js';
import TopViewportBar from './lib/ui/viewport/TopViewportBar.js';

console.info('[LUMI] host', window.location.host, 'inject=true');
if (__LUMI_SKIP_BOOTSTRAP__) {
  // Do nothing in iframe stage context
} else if (window.LUMI_INJECTED) {
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
  const topBanner = new TopBanner();
  let dockRoot = null;
  let editModal = null;
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

        // Auto-open edit modal for immediate value delivery
        try {
          if (editModal && typeof editModal.open === 'function') {
            editModal.open({ element: item.element, index });
          }
        } catch (_) { }
      }
      // no-op (bubble removed)
      stateManager.set('ui.dockState', 'normal');
      // Do not insert plain-text tokens into Dock input; chips reflect selection state.
    });

    // Revert DOM to baseline when chip/tag is removed
    eventBus.on('element:pre-remove', ({ index, snapshot }) => {
      try {
        if (!snapshot || !snapshot.element) return;
        const el = snapshot.element;

        // 1) Restore text content first
        if (snapshot.baseline && typeof snapshot.baseline.text === 'string') {
          try { el.textContent = snapshot.baseline.text; } catch (_) { }
        }

        // 2) Restore all inline styles from baseline
        const baseInline = (snapshot.baseline && snapshot.baseline.inline) || {};
        Object.entries(baseInline).forEach(([prop, value]) => {
          try {
            // Handle margin/padding with setProperty for proper reset
            if (prop.startsWith('margin') || prop.startsWith('padding')) {
              const cssProperty = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
              if (!value || value === '') {
                el.style.removeProperty(cssProperty);
              } else {
                el.style.setProperty(cssProperty, value, '');
              }
            } else {
              // For other props, just set directly (or remove if empty)
              el.style[prop] = value || '';
            }
          } catch (_) { }
        });

        // 3) Additionally remove any edited props not in baseline (for safety)
        const edits = stateManager.get('wysiwyg.edits') || [];
        const entry = edits.find(e => e && e.index === index);
        if (entry && entry.changes) {
          Object.keys(entry.changes).forEach((prop) => {
            // If this prop was edited but not in baseline, remove it
            if (baseInline[prop] === undefined) {
              try {
                if (prop.startsWith('margin') || prop.startsWith('padding')) {
                  const cssProperty = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
                  el.style.removeProperty(cssProperty);
                } else {
                  el.style[prop] = '';
                }
              } catch (_) { }
            }
          });
        }
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
      try { annotateManager && annotateManager.setIframeHost(iframe); } catch (_) { }
    });
    eventBus.on('viewport:iframe-fallback', () => {
      if (pendingElementMode) {
        pendingElementMode = false;
        try { elementSelector.activate(); } catch (_) { }
      }
      // Rebind highlights to top document after fallback
      try { rebindHighlightsToActive(); } catch (_) { }
      try { annotateManager && annotateManager.setInlineHost(); } catch (_) { }
    });

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
      // Dock reflects engine via state subscription
    });

    eventBus.on('engine:availability-updated', ({ codex, claude }) => {
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
    });

    // Keep TopBanner width aligned with Dock squeeze
    const alignTopBanner = () => {
      const open = stateManager.get('ui.dockOpen') !== false;
      const state = stateManager.get('ui.dockState');
      const offset = open && state !== 'compact' ? 420 : 0;
      try { topBanner.setRightOffset(offset + 'px'); } catch (_) { }
      // Offset top when viewport bar is visible to avoid overlap
      const viewportOn = !!stateManager.get('ui.viewport.enabled');
      try { topBanner.setTopOffset(viewportOn ? '48px' : '0px'); } catch (_) { }
    };
    stateManager.subscribe('ui.dockOpen', alignTopBanner);
    stateManager.subscribe('ui.dockState', alignTopBanner);
    stateManager.subscribe('ui.viewport.enabled', alignTopBanner);

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

      // Normalize inline preview for margin/padding so committed rules take over
      Object.keys(changes || {}).forEach((prop) => {
        if (!prop) return;
        if (prop.startsWith('margin') || prop.startsWith('padding')) {
          try {
            const cssProperty = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
            element.style.removeProperty(cssProperty);
          } catch (_) { }
        }
      });

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

    // Open Settings
    eventBus.on('settings:open', () => {
      try {
        // Try to use runtime API first
        chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }, (response) => {
          // Check if extension context is still valid
          if (chrome.runtime.lastError) {
            // Extension was reloaded, fall back to direct URL
            console.warn('[LUMI] Extension context invalidated, opening options via URL');
            try {
              const optionsUrl = chrome.runtime.getURL('options.html');
              window.open(optionsUrl, '_blank');
            } catch (urlErr) {
              console.error('[LUMI] Failed to open options page:', urlErr);
            }
          }
        });
      } catch (err) {
        // sendMessage failed entirely, try direct URL
        console.warn('[LUMI] Message passing unavailable, opening options via URL');
        try {
          const optionsUrl = chrome.runtime.getURL('options.html');
          window.open(optionsUrl, '_blank');
        } catch (urlErr) {
          console.error('[LUMI] Failed to open options page:', urlErr);
        }
      }
    });

    // Copy Prompt
    eventBus.on('prompt:copy', async () => {
      let intent = dockRoot ? dockRoot.getInputValue() : '';
      const elements = stateManager.get('selection.elements') || [];
      const screenshots = stateManager.get('selection.screenshots') || [];
      const edits = stateManager.get('wysiwyg.edits') || [];

      // Helper to clean intent text
      const cleanIntent = (() => {
        try {
          const str = String(intent || '');
          return str.replace(/\[@(element|screenshot)(\d+)\]/g, (m, type, num) => {
            const idx = Math.max(0, Number(num) - 1);
            if (type === 'element' && elements[idx] && elements[idx].element) {
              return '@' + readableElementName(elements[idx].element);
            }
            if (type === 'screenshot' && screenshots[idx]) {
              return `@shot ${idx + 1}`;
            }
            return m;
          });
        } catch (_) { return String(intent || ''); }
      })();

      const parts = [];

      // 1. User Intent
      if (cleanIntent.trim()) {
        parts.push(`# User Intent\n${cleanIntent.trim()}`);
      }

      // 2. Context (Selected Elements)
      if (elements.length > 0) {
        parts.push('\n# Context');
        elements.forEach((el, i) => {
          if (el && el.element) {
            const name = readableElementName(el.element);
            const tagName = el.element.tagName.toLowerCase();
            const id = el.element.id ? `#${el.element.id}` : '';
            const classes = Array.from(el.element.classList).map(c => `.${c}`).join('');
            const simpleSelector = `${tagName}${id}${classes}`;
            parts.push(`Target ${i + 1}: ${name}\n   Selector: ${simpleSelector}`);
          }
        });
      }

      // 3. Visual Edits
      if (edits.length > 0) {
        parts.push('\n# Visual Edits\nI have applied the following visual changes. Please update the code to match:');

        edits.forEach((edit, i) => {
          const el = elements[edit.index];
          const name = el ? readableElementName(el.element) : 'Unknown Element';
          parts.push(`\n## Edit ${i + 1}: ${name}`);
          parts.push(`Selector: ${edit.selector}`);
          parts.push('Changes:');

          if (edit.changes) {
            Object.entries(edit.changes).forEach(([prop, val]) => {
              // Format property names (camelCase -> kebab-case for CSS)
              const cssProp = prop === 'text' ? 'text-content' : prop.replace(/([A-Z])/g, '-$1').toLowerCase();
              parts.push(`- ${cssProp}: "${val}"`);
            });
          }
        });
      }

      // 4. Screenshots Note
      if (screenshots.length > 0) {
        parts.push(`\n# Screenshots\n${screenshots.length} screenshot(s) captured. Please refer to the attached image(s) for visual context.`);
      }

      const finalText = parts.join('\n');

      try {
        await navigator.clipboard.writeText(finalText);

        // Auto-download screenshots if present
        if (screenshots.length > 0) {
          screenshots.forEach((shot, i) => {
            const a = document.createElement('a');
            a.href = shot.dataUrl;
            a.download = `lumi-screenshot-${i + 1}-${shot.timestamp}.png`;
            a.click();
          });
          topBanner.update('Prompt copied & images downloaded! 📋');
        } else {
          topBanner.update('Prompt copied to clipboard! 📋');
        }

        setTimeout(() => topBanner.hide(), 3000);
      } catch (err) {
        console.error('[LUMI] Failed to copy prompt:', err);
        topBanner.update('Failed to copy to clipboard');
        setTimeout(() => topBanner.hide(), 2000);
      }
    });
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
        let message = 'Codex CLI not detected. Please install Codex CLI to enable.';
        if (engine === 'claude') {
          message = 'Claude CLI not detected. Please install Claude Code CLI to enable.';
        } else if (engine === 'droid') {
          message = 'Droid CLI not detected. Please install Factory Droid CLI and set FACTORY_API_KEY.';
        }
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
        const canUseStream = engine === 'codex' || engine === 'claude' || engine === 'droid';

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
      // Set flag for DockRoot to show tooltip on send button hover
      stateManager.set('projects.blocked', true);
      if (dockRoot) dockRoot.updateSendState();
    });

    eventBus.on('projects:allowed', () => {
      stateManager.set('projects.blocked', false);
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
    injectGlobalStyles();
    // Manual theming only; auto detection disabled

    // Initialize engine preference and run an initial health check
    // so that project mapping is known before restoring sessions.
    await engineManager.init();
    try {
      await healthChecker.checkOnce();
    } catch (_) {
      // Ignore initial health failures; periodic checks will keep running.
    }

    // Restore sessions scoped to the current project (if any)
    await restoreSessions();

    // Mount UI components
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

    // Initialize selectors after UI is ready
    elementSelector = new ElementSelector(eventBus, stateManager, highlightManager, topBanner, document, window);


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

    // Start periodic health checks
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

        // Only check stage existence if viewport is enabled
        const enabled = get('ui.viewport.enabled');
        if (enabled) {
          const stage = document.getElementById('lumi-viewport-stage');
          need(!!stage, 'Viewport stage missing');
        }
      })();
    } catch (_) { }

    // First-run experience: auto-activate element select mode
    try {
      const storage = await chromeBridge.storageGet('lumi_first_run_done');
      if (!storage || !storage.lumi_first_run_done) {
        // Mark as completed (only auto-activate once)
        await chromeBridge.storageSet({ lumi_first_run_done: true });
        // Wait for all initial state to settle, then open dock and activate element mode
        setTimeout(() => {
          stateManager.set('ui.dockOpen', true);
          if (dockRoot) dockRoot.setVisible(true);
          // Activate element selection mode
          if (elementSelector && typeof elementSelector.activate === 'function') {
            elementSelector.activate();
          }
        }, 600);
      }
    } catch (err) {
      console.warn('[LUMI] First-run check failed:', err);
    }
  }

  // Persist/restore sessions (simplified: host-only key to avoid race conditions)
  function getSessionsKey() {
    try {
      const allowed = stateManager.get('projects.allowed');
      const project = stateManager.get('projects.current');
      const projectId = project && typeof project.id === 'string' ? project.id.trim() : '';
      if (allowed && projectId) {
        return `lumi.sessions:project:${projectId}`;
      }
    } catch (_) {
      // Fall through to null
    }
    // Unmapped or unknown project: do not persist history
    return null;
  }

  async function restoreSessions() {
    try {
      const key = getSessionsKey();
      if (!key) return;
      const data = await chromeBridge.storageGet([key]);
      const payload = data && data[key];

      if (!payload || !Array.isArray(payload.list) || !payload.list.length) {
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
    } catch (err) {
      console.error('[LUMI] Restore sessions failed:', err);
    }
  }

  function persistSessions() {
    try {
      const key = getSessionsKey();
      if (!key) return;
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
