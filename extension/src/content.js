/**
 * LUMI Content Script v3.1 - Modular Architecture
 * Main orchestrator for all modules
 */

// Core
import EventBus from './lib/core/EventBus.js';
import StateManager from './lib/core/StateManager.js';

// UI
import BubbleUI from './lib/ui/BubbleUI.js';
import TopBanner from './lib/ui/TopBanner.js';
import ContextTags from './lib/ui/ContextTags.js';
import { GLOBAL_STYLES } from './lib/ui/styles.js';

// Selection
import HighlightManager from './lib/selection/HighlightManager.js';
import ElementSelector from './lib/selection/ElementSelector.js';
import ScreenshotSelector from './lib/selection/ScreenshotSelector.js';

// Engine & Communication
import EngineManager from './lib/engine/EngineManager.js';
import HealthChecker from './lib/engine/HealthChecker.js';
import ChromeBridge from './lib/communication/ChromeBridge.js';
import ServerClient from './lib/communication/ServerClient.js';

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
