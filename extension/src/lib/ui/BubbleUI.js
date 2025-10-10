/**
 * BubbleUI - Main Bubble interface with Shadow DOM
 */

import { BUBBLE_STYLES } from './styles.js';

export default class BubbleUI {
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
    });
    
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
  }

  setupDrag() {
    const dragHandle = this.shadow.getElementById('drag-handle');
    const bubbleMain = this.shadow.getElementById('bubble-main');
    let isDragging = false;
    let startX, startY, initialLeft, initialBottom;
    
    dragHandle.addEventListener('mousedown', (e) => {
      // Ignore if clicking on buttons
      if (e.target.closest('.icon-btn') || e.target.closest('.engine-selector')) {
        return;
      }
      
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      
      const rect = this.container.getBoundingClientRect();
      initialLeft = rect.left;
      initialBottom = window.innerHeight - rect.bottom;
      
      bubbleMain.classList.add('dragging');
      
      e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      let newLeft = initialLeft + deltaX;
      let newBottom = initialBottom - deltaY;
      
      // Keep bubble within viewport
      const maxLeft = window.innerWidth - 420; // bubble width
      const maxBottom = window.innerHeight - 200; // min visible height
      
      newLeft = Math.max(0, Math.min(newLeft, maxLeft));
      newBottom = Math.max(0, Math.min(newBottom, maxBottom));
      
      this.container.style.left = newLeft + 'px';
      this.container.style.bottom = newBottom + 'px';
    });
    
    const endDrag = () => {
      if (isDragging) {
        isDragging = false;
        bubbleMain.classList.remove('dragging');
      }
    };

    document.addEventListener('mouseup', endDrag, true);
    document.addEventListener('pointerup', endDrag, true);
    document.addEventListener('mouseleave', endDrag, true);
    window.addEventListener('blur', endDrag);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') endDrag();
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
    const screenshot = this.stateManager.get('selection.screenshot');
    const projectAllowed = this.stateManager.get('projects.allowed');
    
    const hasContext = elements.length > 0 || screenshot;
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
