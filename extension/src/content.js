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

// Core
import EventBus from './lib/core/EventBus.js';
import StateManager from './lib/core/StateManager.js';

// UI
// TopBanner removed; keep styles only
import { GLOBAL_STYLES } from './lib/ui/styles.js';
import { TOKENS_CSS } from '../shared/tokens.js';
import { readableElementName } from './lib/utils/dom.js';

// Selection
import HighlightManager from './lib/selection/HighlightManager.js';
import ElementSelector from './lib/selection/ElementSelector.js';
import ScreenshotSelector from './lib/selection/ScreenshotSelector.js';

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
  try { window.__lumiEventBus = eventBus; } catch (_) {}

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

  // Viewport scaffolding (reflow toggle supported)
  const viewportController = new ViewportController(eventBus, stateManager);
  viewportController.init();
  const viewportBar = new TopViewportBar(eventBus, stateManager);

  // Default to iframe stage for true responsive behavior, but auto-disable on known blocked hosts
  const HOST_IFRAME_BLOCKLIST = /(^|\.)google\.[a-z.]+$|(^|\.)apply\.ycombinator\.com$/i;
  const blocked = HOST_IFRAME_BLOCKLIST.test(window.location.hostname);
  stateManager.set('ui.viewport.useIframeStage', !blocked);

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

    // Handle remove event from legacy bubble (capture baseline before removal)
    eventBus.on('element:remove', (index) => {
      const elements = stateManager.get('selection.elements') || [];
      if (index >= 0 && index < elements.length) {
        try { eventBus.emit('element:pre-remove', { index, snapshot: elements[index] }); } catch (_) {}
        const updated = elements.filter((_, i) => i !== index);
        stateManager.set('selection.elements', updated);
        eventBus.emit('element:removed', index);
      }
    });

    // Revert DOM to baseline when tag is removed
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
        // 2) Restore text content if baseline captured it
        if (snapshot.baseline && Object.prototype.hasOwnProperty.call(snapshot.baseline, 'text')) {
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
      screenshotSelector && screenshotSelector.deactivate();
      if (useIframe) {
        if (elementSelectorFrame) {
          elementSelectorFrame.activate();
        } else {
          // Wait for existing iframe mount to finish; do not remount to avoid page refresh
          pendingElementMode = true;
          topBanner.update('Preparing responsive frame…');
          setTimeout(() => topBanner.hide(), 1200);
        }
      } else {
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
          try { styleHistory.clear(); } catch (_) {}
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

    // Apply initial viewport visibility (flag off by default)
    try {
      const enabled = !!stateManager.get('ui.viewport.enabled');
      viewportController.setEnabled(enabled);
      viewportBar.mount();
      viewportBar.setVisible(enabled);
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

    // Top bar follows dock visibility, and viewport toggles with dock
    try {
      stateManager.subscribe('ui.dockOpen', (open) => {
        const on = open !== false;
        viewportBar.setVisible(on);
        eventBus.emit('viewport:toggle', on);
      });
      stateManager.subscribe('ui.theme', (mode) => {
        try { setDockThemeMode(mode); } catch (_) {}
      });
    } catch (_) {}

    // (moved into bindEvents scope as setupIframeSelectionLocal)

    // Listen for background messages
    chromeBridge.onMessage((message) => {
      if (message.type === 'TOGGLE_BUBBLE') {
        eventBus.emit('bubble:toggle');
        // Ensure viewport bar is visible with dock
        try {
          const open = stateManager.get('ui.dockOpen') !== false;
          if (open) {
            eventBus.emit('viewport:toggle', true);
          }
        } catch (_) {}
      }
    });

    // Initialize engine (restore saved preference) - this will trigger engine:selected
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

  // Start the application
  init().catch(error => {
    console.error('[LUMI] Initialization failed:', error);
  });
}
