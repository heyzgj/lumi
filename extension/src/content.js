/**
 * LUMI Content Script v3.1 - Modular Architecture
 * Main orchestrator for all modules
 */

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
import ScreenshotSelector from './lib/selection/ScreenshotSelector.js';

// Engine & Communication
import EngineManager from './lib/engine/EngineManager.js';
import HealthChecker from './lib/engine/HealthChecker.js';
import ChromeBridge from './lib/communication/ChromeBridge.js';
import ServerClient from './lib/communication/ServerClient.js';
import DockRoot from './lib/ui/dock/DockRoot.js';
import { applyDockThemeAuto, watchDockTheme } from './lib/ui/dock/theme.js';
import DockEditModal from './lib/ui/dock/DockEditModal.js';
import StyleApplier from './lib/engine/StyleApplier.js';
import StyleHistory from './lib/engine/StyleHistory.js';

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
