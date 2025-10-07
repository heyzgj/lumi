/**
 * LUMI Content Script v3.0
 * Modern minimalist UI with Element & Screenshot selection modes
 */

(function() {
  'use strict';

  // Prevent double injection
  if (window.LUMI_INJECTED) {
    console.log('[LUMI v3] Already injected');
    return;
  }
  window.LUMI_INJECTED = true;

  console.log('[LUMI v3] Initializing modern UI...');

  // ========== State ==========
  let state = {
    bubble: null,
    bubbleShadow: null,
    topBanner: null,
    currentEngine: 'codex',
    isServerHealthy: false,
    availableEngines: { codex: false, claude: false },
    engineRestored: false,
    
    // Modes
    isElementModeActive: true,
    isScreenshotModeActive: false,
    
    // Selection
    selectedElements: [], // [{element, selector, tagName, bbox}]
    screenshotData: null, // {dataUrl, bbox}
    hoveredElement: null,
    
    // Overlays
    hoverHighlight: null,
    selectionHighlights: [],
    screenshotOverlay: null,
    screenshotStart: null,
    
    // UI state
    isProcessing: false
  };

  // ========== Initialize ==========
  init();

  function init() {
    injectStyles();
    createTopBanner();
    createBubble();
    setupKeyboardShortcuts();
    checkServerHealth();
    
    // Default: show bubble only; element mode will be activated on first toggle
  }

  // ========== Top Banner ==========
  function createTopBanner() {
    if (state.topBanner) return;
    
    const banner = document.createElement('div');
    banner.id = 'lumi-top-banner';
    banner.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 2147483646;
      padding: 12px 24px;
      background: rgba(59, 130, 246, 0.95);
      backdrop-filter: blur(12px);
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      font-weight: 500;
      text-align: center;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
      display: none;
      animation: slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    `;
    
    document.body.appendChild(banner);
    state.topBanner = banner;
  }

  function updateTopBanner(message) {
    if (!state.topBanner) return;
    state.topBanner.textContent = message;
    state.topBanner.style.display = message ? 'block' : 'none';
  }

  // ========== Bubble UI ==========
  function createBubble() {
    if (state.bubble) return;
    
    // Container
    const container = document.createElement('div');
    container.id = 'lumi-bubble-container';
    container.style.cssText = `
      position: fixed;
      left: 24px;
      bottom: 24px;
      z-index: 2147483647;
      display: none;
    `;
    
    // Shadow DOM
    const shadow = container.attachShadow({ mode: 'open' });
    
    shadow.innerHTML = getBubbleHTML();
    
    document.body.appendChild(container);
    state.bubble = container;
    state.bubbleShadow = shadow;
    
    setupBubbleListeners();
  }

  function restoreEngineFromStorage() {
    chrome.storage.local.get(['engine'], (res) => {
      const stored = res.engine;
      if (stored === 'codex' || stored === 'claude') {
        state.currentEngine = stored;
        const shadow = state.bubbleShadow;
        if (shadow) {
          const engineName = shadow.getElementById('engine-name');
          if (engineName) engineName.textContent = stored === 'codex' ? 'Codex' : 'Claude';
          shadow.querySelectorAll('.engine-option').forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.engine === stored);
          });
        }
      }
    });
  }

  function getBubbleHTML() {
    return `
      <style>
        ${getBubbleStyles()}
      </style>
      
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
              <div class="engine-option" data-engine="codex">
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
            <button class="icon-btn active" id="element-mode-btn" title="Element Mode (Cmd+E)">
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
            <!-- Inline context tags inside rich input -->
            <div 
              class="input-field" 
              id="intent-input" 
              contenteditable="true"
              data-placeholder="Type your instructions... Use inline tags to target specific elements"
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

  function getBubbleStyles() {
    return `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      :host {
        --bg-primary: rgba(15, 23, 42, 0.95);
        --bg-secondary: rgba(30, 41, 59, 0.9);
        --accent-blue: #3b82f6;
        --accent-green: #10b981;
        --text-primary: rgba(248, 250, 252, 0.95);
        --text-secondary: rgba(226, 232, 240, 0.6);
        --border: rgba(148, 163, 184, 0.2);
      }

      .bubble {
        width: 420px;
        background: var(--bg-primary);
        backdrop-filter: blur(24px) saturate(180%);
        border-radius: 12px;
        border: 1px solid var(--border);
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: var(--text-primary);
        animation: slideInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        overflow: hidden;
      }

      @keyframes slideInUp {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* Top Bar */
      .top-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid var(--border);
        background: rgba(15, 23, 42, 0.6);
      }

      .left-section {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .logo {
        font-size: 14px;
        font-weight: 600;
        letter-spacing: 0.5px;
      }

      .engine-selector {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid var(--border);
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.15s;
      }

      .engine-selector:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(148, 163, 184, 0.3);
      }

      .status-indicator {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--accent-green);
        animation: pulse 2s ease-in-out infinite;
      }

      .status-indicator.offline {
        background: #ef4444;
        animation: none;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      .engine-name {
        font-size: 12px;
        font-weight: 500;
      }

      .dropdown-arrow {
        font-size: 10px;
        opacity: 0.6;
        transition: transform 0.2s;
      }

      .engine-selector.open .dropdown-arrow {
        transform: rotate(180deg);
      }

      /* Engine Dropdown */
      .engine-dropdown {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        min-width: 120px;
        background: rgba(30, 41, 59, 0.98);
        backdrop-filter: blur(12px);
        border: 1px solid var(--border);
        border-radius: 6px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        display: none;
        z-index: 100;
        animation: dropdownSlideIn 0.2s ease-out;
      }

      @keyframes dropdownSlideIn {
        from {
          opacity: 0;
          transform: translateY(-8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .engine-dropdown.open {
        display: block;
      }

      .engine-option {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        cursor: pointer;
        transition: background 0.15s;
        font-size: 12px;
      }

      .engine-option:hover {
        background: rgba(255, 255, 255, 0.08);
      }

      .engine-option:first-child {
        border-radius: 6px 6px 0 0;
      }

      .engine-option:last-child {
        border-radius: 0 0 6px 6px;
      }

      .engine-option-name {
        font-weight: 500;
      }

      .engine-check {
        opacity: 0;
        color: var(--accent-green);
        font-size: 14px;
      }

      .engine-option.selected .engine-check {
        opacity: 1;
      }

      .engine-option-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .engine-status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #6b7280; /* Gray (unavailable) */
      }

      .engine-status-dot.available {
        background: var(--accent-green);
      }

      .left-section {
        position: relative;
      }

      .right-section {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .icon-btn {
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid transparent;
        background: transparent;
        border-radius: 6px;
        cursor: pointer;
        color: var(--text-secondary);
        transition: all 0.15s;
      }

      .icon-btn:hover {
        background: rgba(255, 255, 255, 0.08);
        color: var(--text-primary);
        border-color: var(--border);
      }

      .icon-btn.active {
        background: var(--accent-blue);
        color: white;
        border-color: var(--accent-blue);
      }

      .icon-btn svg {
        width: 16px;
        height: 16px;
      }

      /* Context Tags (generic) */
      .context-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding: 8px 8px;
      }

      .context-tags:empty {
        display: none;
      }

      .context-tag {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 8px;
        background: rgba(59, 130, 246, 0.15);
        border: 1px solid rgba(59, 130, 246, 0.3);
        border-radius: 6px;
        font-size: 11px;
        font-weight: 500;
        color: #93c5fd;
        animation: scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }

      @keyframes scaleIn {
        from {
          opacity: 0;
          transform: scale(0.8);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }

      .context-tag.screenshot {
        background: rgba(16, 185, 129, 0.15);
        border-color: rgba(16, 185, 129, 0.3);
        color: #6ee7b7;
      }

      .tag-remove {
        width: 14px;
        height: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 3px;
        cursor: pointer;
        font-size: 10px;
        opacity: 0.6;
        transition: all 0.15s;
      }

      .tag-remove:hover {
        opacity: 1;
        background: rgba(255, 255, 255, 0.1);
      }

      /* Inline Element Tags (inside contenteditable) */
      .inline-element-tag {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 6px;
        background: rgba(59, 130, 246, 0.25);
        border: 1px solid rgba(59, 130, 246, 0.4);
        border-radius: 4px;
        font-size: 11px;
        font-weight: 500;
        color: #93c5fd;
        cursor: default;
        user-select: none;
        margin: 0 2px;
        vertical-align: middle;
      }

      .inline-tag-remove {
        font-size: 9px;
        opacity: 0.7;
        margin-left: 2px;
      }

      .inline-tag-remove:hover {
        opacity: 1;
      }

      /* Input Container */
      .input-container {
        padding: 16px;
        position: relative;
      }

      .input-wrapper {
        position: relative;
        background: var(--bg-secondary);
        border: 1px solid var(--border);
        border-radius: 8px;
        transition: all 0.15s;
      }

      .input-wrapper:focus-within {
        border-color: var(--accent-blue);
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }

      .input-field {
        width: 100%;
        min-height: 80px;
        max-height: 200px;
        padding: 12px 48px 12px 12px;
        background: transparent;
        border: none;
        color: var(--text-primary);
        font-size: 13px;
        font-family: inherit;
        line-height: 1.5;
        outline: none;
        overflow-y: auto;
        white-space: pre-wrap;
        word-wrap: break-word;
      }

      .input-field:empty:before {
        content: attr(data-placeholder);
        color: var(--text-secondary);
        pointer-events: none;
      }

      .send-btn {
        position: absolute;
        right: 8px;
        bottom: 8px;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--accent-blue);
        border: none;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.15s;
        color: white;
      }

      .send-btn:hover:not(:disabled) {
        background: #2563eb;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
      }

      .send-btn:active:not(:disabled) {
        transform: translateY(0);
      }

      .send-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .send-btn svg {
        width: 16px;
        height: 16px;
      }

      /* Loading Overlay */
      .loading-overlay {
        position: absolute;
        inset: 0;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(15, 23, 42, 0.9);
        backdrop-filter: blur(4px);
        border-radius: 8px;
        animation: fadeIn 0.2s;
      }

      .loading-overlay.active {
        display: flex;
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .loading-content {
        text-align: center;
      }

      .spinner {
        width: 32px;
        height: 32px;
        border: 3px solid rgba(59, 130, 246, 0.2);
        border-top-color: var(--accent-blue);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        margin: 0 auto 8px;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .loading-text {
        font-size: 12px;
        color: var(--text-secondary);
      }

      /* Status Message */
      .status-message {
        padding: 12px 16px;
        border-top: 1px solid var(--border);
        font-size: 12px;
        display: none;
        align-items: center;
        gap: 8px;
        animation: slideDown 0.2s;
        position: relative;
      }

      @keyframes slideDown {
        from {
          opacity: 0;
          transform: translateY(-10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .status-message.active {
        display: flex;
      }

      .status-message.success {
        background: rgba(16, 185, 129, 0.1);
        color: var(--accent-green);
      }

      .status-message.error {
        background: rgba(239, 68, 68, 0.1);
        color: #ef4444;
      }

      #status-text {
        flex: 1;
      }

      .status-close {
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 16px;
        color: inherit;
        opacity: 0.6;
        transition: all 0.15s;
      }

      .status-close:hover {
        opacity: 1;
        background: rgba(255, 255, 255, 0.1);
      }

      /* Drag Handle */
      .drag-handle {
        cursor: move;
        user-select: none;
      }

      .bubble.dragging {
        transition: none !important;
        pointer-events: none;
      }

      .bubble.dragging * {
        pointer-events: none;
      }
    `;
  }

  // ========== Event Listeners ==========
  function setupBubbleListeners() {
    const shadow = state.bubbleShadow;
    
    // Close button
    const closeBtn = shadow.getElementById('close-btn');
    closeBtn.addEventListener('click', hideBubble);
    
    // Mode buttons
    const elementModeBtn = shadow.getElementById('element-mode-btn');
    const screenshotModeBtn = shadow.getElementById('screenshot-mode-btn');
    
    elementModeBtn.addEventListener('click', () => {
      if (!state.isElementModeActive) {
        activateElementMode();
      } else {
        deactivateElementMode();
      }
    });
    
    screenshotModeBtn.addEventListener('click', () => {
      if (!state.isScreenshotModeActive) {
        activateScreenshotMode();
      } else {
        deactivateScreenshotMode();
      }
    });
    
    // Input field (contenteditable)
    const inputField = shadow.getElementById('intent-input');
    const sendBtn = shadow.getElementById('send-btn');
    
    inputField.addEventListener('input', () => {
      updateSendButtonState();
    });
    // Arrow navigation across inline chips
    inputField.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        let boundaryNode = null;
        if (e.key === 'ArrowLeft') {
          boundaryNode = range.startContainer.previousSibling;
        } else {
          boundaryNode = range.startContainer.nextSibling;
        }
        if (boundaryNode && boundaryNode.nodeType === 1 && boundaryNode.classList && boundaryNode.classList.contains('inline-element-tag')) {
          e.preventDefault();
          const newRange = document.createRange();
          if (e.key === 'ArrowLeft') newRange.setStartBefore(boundaryNode); else newRange.setStartAfter(boundaryNode);
          newRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(newRange);
        }
      }
    });
    
    inputField.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    });
    
    // Send button
    sendBtn.addEventListener('click', handleSubmit);
    
    // Engine selector dropdown
    const engineSelector = shadow.getElementById('engine-selector');
    engineSelector.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleEngine();
    });
    
    // Engine options
    shadow.querySelectorAll('.engine-option').forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const engine = option.dataset.engine;
        toggleEngine(engine);
      });
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      const dropdown = shadow.getElementById('engine-dropdown');
      const selector = shadow.getElementById('engine-selector');
      if (dropdown && dropdown.classList.contains('open')) {
        dropdown.classList.remove('open');
        selector.classList.remove('open');
      }
    });
    
    // Initialize engine selection and label from storage
    restoreEngineFromStorage();
    
    // Drag functionality
    setupBubbleDrag(shadow);
  }

  function setupBubbleDrag(shadow) {
    const dragHandle = shadow.getElementById('drag-handle');
    const bubbleMain = shadow.getElementById('bubble-main');
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
      
      const rect = state.bubble.getBoundingClientRect();
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
      
      state.bubble.style.left = newLeft + 'px';
      state.bubble.style.bottom = newBottom + 'px';
    });
    
    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        bubbleMain.classList.remove('dragging');
      }
    });
  }

  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Esc - Close bubble or cancel mode
      if (e.key === 'Escape') {
        if (state.bubble && state.bubble.style.display !== 'none') {
          hideBubble();
        } else if (state.isElementModeActive) {
          deactivateElementMode();
        } else if (state.isScreenshotModeActive) {
          deactivateScreenshotMode();
        }
      }
      
      // Cmd/Ctrl + E - Toggle Element Mode
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault();
        if (state.isElementModeActive) {
          deactivateElementMode();
        } else {
          activateElementMode();
        }
      }
      
      // Cmd/Ctrl + S - Toggle Screenshot Mode
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (state.isScreenshotModeActive) {
          deactivateScreenshotMode();
        } else {
          activateScreenshotMode();
        }
      }
      
      // Cmd/Ctrl + K - Clear all context
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        clearAllContext();
      }
    });
  }

  // ========== Mode Management ==========
  function activateElementMode() {
    state.isElementModeActive = true;
    state.isScreenshotModeActive = false;
    
    updateTopBanner('Click to select element • Shift+Click to add to context');
    updateModeButtons();
    
    // Attach element event listeners
    document.addEventListener('mousemove', handleElementHover, true);
    document.addEventListener('click', handleElementClick, true);
    document.documentElement.classList.add('lumi-element-cursor');
    document.body.classList.add('lumi-element-cursor');
    
    console.log('[LUMI] Element mode activated');
  }

  function deactivateElementMode() {
    state.isElementModeActive = false;
    
    updateTopBanner('');
    updateModeButtons();
    removeHoverHighlight();
    
    // Remove element event listeners
    document.removeEventListener('mousemove', handleElementHover, true);
    document.removeEventListener('click', handleElementClick, true);
    document.documentElement.classList.remove('lumi-element-cursor');
    document.body.classList.remove('lumi-element-cursor');
    
    console.log('[LUMI] Element mode deactivated');
  }

  function activateScreenshotMode() {
    state.isScreenshotModeActive = true;
    state.isElementModeActive = false;
    deactivateElementMode();
    
    updateTopBanner('Drag to select area for screenshot');
    updateModeButtons();
    
    // Attach screenshot event listeners
    document.addEventListener('mousedown', handleScreenshotStart, true);
    document.documentElement.classList.add('lumi-screenshot-cursor');
    document.body.classList.add('lumi-screenshot-cursor');
    
    console.log('[LUMI] Screenshot mode activated');
  }

  function deactivateScreenshotMode() {
    state.isScreenshotModeActive = false;
    
    updateTopBanner('');
    updateModeButtons();
    removeScreenshotOverlay();
    
    // Remove screenshot event listeners
    document.removeEventListener('mousedown', handleScreenshotStart, true);
    document.removeEventListener('mousemove', handleScreenshotDrag, true);
    document.removeEventListener('mouseup', handleScreenshotEnd, true);
    document.documentElement.classList.remove('lumi-screenshot-cursor');
    document.body.classList.remove('lumi-screenshot-cursor');
    
    console.log('[LUMI] Screenshot mode deactivated');
  }

  function updateModeButtons() {
    const shadow = state.bubbleShadow;
    if (!shadow) return;
    
    const elementBtn = shadow.getElementById('element-mode-btn');
    const screenshotBtn = shadow.getElementById('screenshot-mode-btn');
    
    elementBtn.classList.toggle('active', state.isElementModeActive);
    screenshotBtn.classList.toggle('active', state.isScreenshotModeActive);
  }

  // ========== Element Selection ==========
  function handleElementHover(e) {
    if (!state.isElementModeActive) return;
    if (shouldIgnoreElement(e.target)) return;
    
    if (state.hoveredElement !== e.target) {
      state.hoveredElement = e.target;
      showHoverHighlight(e.target);
    }
  }

  function handleElementClick(e) {
    if (!state.isElementModeActive) return;
    if (shouldIgnoreElement(e.target)) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const element = e.target;
    
    // Always add to selection (追加模式)
    // Users can remove individual tags if needed
    addElementToSelection(element);
    
    showBubble();
  }

  function shouldIgnoreElement(element) {
    // Ignore bubble, banner, overlays, and the html/body backgrounds
    if (element.closest('#lumi-bubble-container') || 
        element.closest('#lumi-top-banner') ||
        element.classList.contains('lumi-highlight') ||
        element.classList.contains('lumi-screenshot-overlay')) {
      return true;
    }
    const tag = element.tagName && element.tagName.toLowerCase();
    if (tag === 'html' || tag === 'body') return true;
    return false;
  }

  function addElementToSelection(element) {
    // Check if already selected
    const exists = state.selectedElements.some(item => item.element === element);
    if (exists) return;
    
    const selector = getElementSelector(element);
    const bbox = element.getBoundingClientRect();
    
    state.selectedElements.push({
      element,
      selector,
      tagName: element.tagName.toLowerCase(),
      bbox: {
        top: bbox.top + window.scrollY,
        left: bbox.left + window.scrollX,
        width: bbox.width,
        height: bbox.height
      }
    });
    
    showSelectionHighlight(element);
    updateContextTags();
    updateSendButtonState();
    
    console.log('[LUMI] Element added:', selector);
  }

  function clearElementSelections() {
    state.selectedElements = [];
    removeAllSelectionHighlights();
    updateContextTags();
    updateSendButtonState();
  }

  // ========== Screenshot Selection ==========
  function handleScreenshotStart(e) {
    if (!state.isScreenshotModeActive) return;
    if (shouldIgnoreElement(e.target)) return;
    
    e.preventDefault();
    
    state.screenshotStart = {
      x: e.clientX,
      y: e.clientY
    };
    
    createScreenshotOverlay();
    document.addEventListener('mousemove', handleScreenshotDrag, true);
    document.addEventListener('mouseup', handleScreenshotEnd, true);
  }

  function handleScreenshotDrag(e) {
    if (!state.screenshotStart) return;
    
    const current = {
      x: e.clientX,
      y: e.clientY
    };
    
    updateScreenshotOverlay(state.screenshotStart, current);
  }

  function handleScreenshotEnd(e) {
    if (!state.screenshotStart) return;
    
    const end = {
      x: e.clientX,
      y: e.clientY
    };
    
    const bbox = {
      left: Math.min(state.screenshotStart.x, end.x),
      top: Math.min(state.screenshotStart.y, end.y),
      width: Math.abs(end.x - state.screenshotStart.x),
      height: Math.abs(end.y - state.screenshotStart.y)
    };
    
    // Minimum size check
    if (bbox.width > 20 && bbox.height > 20) {
      captureScreenshot(bbox);
    }
    
    removeScreenshotOverlay();
    state.screenshotStart = null;
    
    document.removeEventListener('mousemove', handleScreenshotDrag, true);
    document.removeEventListener('mouseup', handleScreenshotEnd, true);
    
    deactivateScreenshotMode();
  }

  function captureScreenshot(bbox) {
    safeSendMessage({
      type: 'CAPTURE_SCREENSHOT'
    }, (response) => {
      if (response && response.dataUrl) {
        state.screenshotData = {
          dataUrl: response.dataUrl,
          bbox
        };
        updateContextTags();
        updateSendButtonState();
        showBubble();
        console.log('[LUMI] Screenshot captured');
      }
    });
  }

  // ========== Highlights & Overlays ==========
  function showHoverHighlight(element) {
    removeHoverHighlight();
    
    const bbox = element.getBoundingClientRect();
    const highlight = document.createElement('div');
    highlight.className = 'lumi-highlight lumi-hover';
    highlight.style.cssText = `
      position: absolute;
      top: ${bbox.top + window.scrollY}px;
      left: ${bbox.left + window.scrollX}px;
      width: ${bbox.width}px;
      height: ${bbox.height}px;
      background: rgba(59, 130, 246, 0.1);
      border: 2px solid #3b82f6;
      pointer-events: none;
      z-index: 2147483645;
      border-radius: 2px;
      animation: fadeIn 0.15s;
    `;
    
    document.body.appendChild(highlight);
    state.hoverHighlight = highlight;
  }

  function removeHoverHighlight() {
    if (state.hoverHighlight) {
      state.hoverHighlight.remove();
      state.hoverHighlight = null;
    }
  }

  function showSelectionHighlight(element) {
    const bbox = element.getBoundingClientRect();
    const highlight = document.createElement('div');
    highlight.className = 'lumi-highlight lumi-selected';
    highlight.style.cssText = `
      position: absolute;
      top: ${bbox.top + window.scrollY}px;
      left: ${bbox.left + window.scrollX}px;
      width: ${bbox.width}px;
      height: ${bbox.height}px;
      background: rgba(16, 185, 129, 0.15);
      border: 2px solid #10b981;
      pointer-events: none;
      z-index: 2147483645;
      border-radius: 2px;
      animation: scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    `;
    
    // Add label
    const label = document.createElement('div');
    label.style.cssText = `
      position: absolute;
      top: -24px;
      left: 0;
      padding: 4px 8px;
      background: #10b981;
      color: white;
      font-size: 11px;
      font-weight: 500;
      border-radius: 4px;
      white-space: nowrap;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    label.textContent = element.tagName.toLowerCase() + (element.className ? '.' + element.className.split(' ')[0] : '');
    highlight.appendChild(label);
    
    document.body.appendChild(highlight);
    state.selectionHighlights.push(highlight);
  }

  function removeAllSelectionHighlights() {
    state.selectionHighlights.forEach(h => h.remove());
    state.selectionHighlights = [];
  }

  function createScreenshotOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'lumi-screenshot-overlay';
    overlay.style.cssText = `
      position: absolute;
      border: 2px dashed #3b82f6;
      background: rgba(59, 130, 246, 0.1);
      pointer-events: none;
      z-index: 2147483645;
    `;
    document.body.appendChild(overlay);
    state.screenshotOverlay = overlay;
  }

  function updateScreenshotOverlay(start, current) {
    if (!state.screenshotOverlay) return;
    
    const left = Math.min(start.x, current.x);
    const top = Math.min(start.y, current.y);
    const width = Math.abs(current.x - start.x);
    const height = Math.abs(current.y - start.y);
    
    state.screenshotOverlay.style.left = left + window.scrollX + 'px';
    state.screenshotOverlay.style.top = top + window.scrollY + 'px';
    state.screenshotOverlay.style.width = width + 'px';
    state.screenshotOverlay.style.height = height + 'px';
  }

  function removeScreenshotOverlay() {
    if (state.screenshotOverlay) {
      state.screenshotOverlay.remove();
      state.screenshotOverlay = null;
    }
  }

  // ========== Context Tags ==========
  function updateContextTags() {
    const shadow = state.bubbleShadow;
    if (!shadow) return;
    
    const tagsContainer = shadow.getElementById('context-tags');
    tagsContainer.innerHTML = '';
    
    // Render element tags (click to insert inline)
    state.selectedElements.forEach((item, index) => {
      const tag = document.createElement('div');
      tag.className = 'context-tag';
      tag.innerHTML = `
        <span class="tag-label" data-index="${index}">${readableElementName(item.element)}</span>
        <span class="tag-remove" data-type="element" data-index="${index}">×</span>
      `;
      tagsContainer.appendChild(tag);
    });
    
    // Add screenshot tag
    if (state.screenshotData) {
      const tag = document.createElement('div');
      tag.className = 'context-tag screenshot';
      tag.innerHTML = `
        <span class="tag-label" data-type="screenshot">📷 Screenshot</span>
        <span class="tag-remove" data-type="screenshot">×</span>
      `;
      tagsContainer.appendChild(tag);
    }
    
    // Add remove listeners
    // Remove listeners
    tagsContainer.querySelectorAll('.tag-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const type = e.target.dataset.type;
        const index = e.target.dataset.index;
        
        if (type === 'element') {
          removeElementTag(parseInt(index));
        } else if (type === 'screenshot') {
          removeScreenshotTag();
        }
      });
    });

    // Insert-inline listeners on label click
    tagsContainer.querySelectorAll('.tag-label').forEach(label => {
      label.addEventListener('click', (e) => {
        const type = label.dataset.type;
        if (type === 'screenshot') {
          insertInlineTag('📷 Screenshot', 'screenshot');
        } else {
          const idx = parseInt(label.dataset.index);
          insertInlineTag(readableElementName(state.selectedElements[idx]?.element), idx);
        }
      });
    });
  }

  function insertInlineTag(label, index) {
    const shadow = state.bubbleShadow;
    if (!shadow) return;
    const input = shadow.getElementById('intent-input');
    input.focus();

    const selection = window.getSelection();
    let range;
    if (selection && selection.rangeCount > 0 && input.contains(selection.anchorNode)) {
      range = selection.getRangeAt(0);
    } else {
      range = document.createRange();
      range.selectNodeContents(input);
      range.collapse(false);
    }

    const tag = document.createElement('span');
    tag.className = 'inline-element-tag';
    tag.dataset.index = String(index);
    tag.textContent = label;
    tag.setAttribute('contenteditable', 'false');
    const remove = document.createElement('span');
    remove.className = 'inline-tag-remove';
    remove.textContent = '×';
    remove.addEventListener('click', (e) => {
      e.stopPropagation();
      tag.remove();
      updateSendButtonState();
    });
    tag.appendChild(remove);

    // Normalize whitespace around insertion point to avoid line breaks
    // Remove preceding excessive spaces
    if (range.startContainer.nodeType === 3 && /\s$/.test(range.startContainer.textContent)) {
      range.startContainer.textContent = range.startContainer.textContent.replace(/\s+$/, ' ');
    }
    range.deleteContents();
    range.insertNode(tag);
    range.setStartAfter(tag);
    range.collapse(true);
    // Insert a single trailing space after chip to allow right-to-left deletion
    const space = document.createTextNode(' ');
    if (!range.startContainer || range.startContainer !== input) {
      range.insertNode(space);
      range.setStartAfter(space);
      range.collapse(true);
    }
    selection.removeAllRanges();
    selection.addRange(range);

    updateSendButtonState();
  }

  function readableElementName(el) {
    if (!el) return 'element';
    if (el.id) return `#${el.id}`;
    const firstClass = (el.className || '').split(' ').filter(Boolean)[0];
    if (firstClass) return `${el.tagName.toLowerCase()}.${firstClass}`;
    return el.tagName.toLowerCase();
  }

  function removeElementTag(index) {
    if (state.selectionHighlights[index]) {
      state.selectionHighlights[index].remove();
      state.selectionHighlights.splice(index, 1);
    }
    state.selectedElements.splice(index, 1);
    // Also remove any inline chips corresponding to this element
    const shadow = state.bubbleShadow;
    if (shadow) {
      const input = shadow.getElementById('intent-input');
      input.querySelectorAll(`.inline-element-tag[data-index="${String(index)}"]`).forEach(node => {
        // Clean adjacent spaces
        const prev = node.previousSibling;
        const next = node.nextSibling;
        if (next && next.nodeType === 3 && next.textContent.startsWith(' ')) {
          next.textContent = next.textContent.slice(1);
        } else if (prev && prev.nodeType === 3 && /\s$/.test(prev.textContent)) {
          prev.textContent = prev.textContent.replace(/\s$/, '');
        }
        node.remove();
      });
    }
    updateContextTags();
    updateSendButtonState();
  }

  function removeScreenshotTag() {
    state.screenshotData = null;
    // Also remove inline screenshot chips
    const shadow = state.bubbleShadow;
    if (shadow) {
      const input = shadow.getElementById('intent-input');
      input.querySelectorAll('.inline-element-tag[data-index="screenshot"]').forEach(node => {
        const prev = node.previousSibling;
        const next = node.nextSibling;
        if (next && next.nodeType === 3 && next.textContent.startsWith(' ')) {
          next.textContent = next.textContent.slice(1);
        } else if (prev && prev.nodeType === 3 && /\s$/.test(prev.textContent)) {
          prev.textContent = prev.textContent.replace(/\s$/, '');
        }
        node.remove();
      });
    }
    updateContextTags();
    updateSendButtonState();
  }

  function clearAllContext() {
    clearElementSelections();
    removeScreenshotTag();
    const shadow = state.bubbleShadow;
    if (shadow) {
      shadow.getElementById('intent-input').textContent = '';
    }
    updateSendButtonState();
  }

  // ========== Submit Handler ==========
  async function handleSubmit() {
    const shadow = state.bubbleShadow;
    const input = shadow.getElementById('intent-input');
    const intent = input.textContent.trim();
    
    if (!intent || state.isProcessing) return;
    if (state.selectedElements.length === 0 && !state.screenshotData) {
      showStatusMessage('Please select an element or capture a screenshot first', 'error');
      return;
    }
    
    state.isProcessing = true;
    setLoadingState(true, 'Analyzing...');
    
    try {
      // Build context
      const context = {
        intent,
        pageUrl: window.location.href,
        pageTitle: document.title,
        selectionMode: state.selectedElements.length > 0 ? 'element' : 'screenshot'
      };
      
      // Add element context
      if (state.selectedElements.length > 0) {
        context.element = {
          tagName: state.selectedElements[0].element.tagName,
          selector: state.selectedElements[0].selector,
          className: state.selectedElements[0].element.className,
          id: state.selectedElements[0].element.id,
          outerHTML: state.selectedElements[0].element.outerHTML,
          computedStyle: getComputedStyleSummary(state.selectedElements[0].element)
        };
        context.bbox = state.selectedElements[0].bbox;
      }
      
      // Send to background script
      safeSendMessage({
        type: 'SEND_TO_SERVER',
        payload: {
          engine: state.currentEngine,
          context,
          screenshot: state.screenshotData?.dataUrl
        }
      }, (response) => {
        state.isProcessing = false;
        setLoadingState(false);
        
        if (response && response.error) {
          showStatusMessage(`Error: ${response.error}`, 'error');
        } else if (response && response.filesModified) {
          showStatusMessage('✓ Files modified successfully! Reload page to see changes.', 'success');
          setTimeout(() => {
            clearAllContext();
            input.textContent = '';
          }, 1500);
        } else {
          showStatusMessage('Request completed', 'success');
        }
      });
      
    } catch (error) {
      state.isProcessing = false;
      setLoadingState(false);
      showStatusMessage(`Error: ${error.message}`, 'error');
    }
  }

  // ========== UI Updates ==========
  function showBubble() {
    if (!state.bubble) return;
    state.bubble.style.display = 'block';
    // Restore existing selection highlights if any were present
    removeAllSelectionHighlights();
    state.selectedElements.forEach(item => {
      if (item.element && document.contains(item.element)) {
        showSelectionHighlight(item.element);
      }
    });
  }

  function hideBubble() {
    if (!state.bubble) return;
    state.bubble.style.display = 'none';
    deactivateElementMode();
    deactivateScreenshotMode();
    // Remove any selection highlights and hover highlights on close
    removeAllSelectionHighlights();
    removeHoverHighlight();
  }

  function updateSendButtonState() {
    const shadow = state.bubbleShadow;
    if (!shadow) return;
    
    const sendBtn = shadow.getElementById('send-btn');
    const input = shadow.getElementById('intent-input');
    const hasContext = state.selectedElements.length > 0 || state.screenshotData;
    const hasIntent = input.textContent.trim().length > 0;
    
    sendBtn.disabled = !hasContext || !hasIntent || state.isProcessing;
  }

  function setLoadingState(isLoading, text = 'Processing...') {
    const shadow = state.bubbleShadow;
    if (!shadow) return;
    
    const loadingOverlay = shadow.getElementById('loading-overlay');
    const loadingText = shadow.getElementById('loading-text');
    
    if (isLoading) {
      loadingOverlay.classList.add('active');
      loadingText.textContent = text;
    } else {
      loadingOverlay.classList.remove('active');
    }
  }

  function showStatusMessage(text, type = 'success') {
    const shadow = state.bubbleShadow;
    if (!shadow) return;
    
    const statusMessage = shadow.getElementById('status-message');
    const statusIcon = shadow.getElementById('status-icon');
    const statusText = shadow.getElementById('status-text');
    const statusClose = shadow.getElementById('status-close');
    
    statusMessage.className = 'status-message active ' + type;
    statusIcon.textContent = type === 'success' ? '✓' : '✕';
    statusText.textContent = text;
    
    // Add close button event (only once)
    if (!statusClose.dataset.hasListener) {
      statusClose.addEventListener('click', () => {
        statusMessage.classList.remove('active');
      });
      statusClose.dataset.hasListener = 'true';
    }
    
    // No auto-hide - user must manually close
  }

  function toggleEngine(engine = null) {
    const shadow = state.bubbleShadow;
    if (!shadow) return;
    
    const dropdown = shadow.getElementById('engine-dropdown');
    const selector = shadow.getElementById('engine-selector');
    
    // If engine provided, select it and close dropdown
    if (engine) {
      state.currentEngine = engine;
      const engineName = shadow.getElementById('engine-name');
      engineName.textContent = engine === 'codex' ? 'Codex' : 'Claude';
      
      // Update selected state
      shadow.querySelectorAll('.engine-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.engine === engine);
      });
      
      dropdown.classList.remove('open');
      selector.classList.remove('open');
      
      console.log('[LUMI] Engine switched to:', state.currentEngine);
      chrome.storage.local.set({ engine: state.currentEngine });
    } else {
      // Toggle dropdown
      const isOpen = dropdown.classList.contains('open');
      dropdown.classList.toggle('open', !isOpen);
      selector.classList.toggle('open', !isOpen);
    }
  }

  // ========== Server Health ==========
  function checkServerHealth() {
    safeSendMessage({ type: 'CHECK_SERVER' }, (response) => {
      state.isServerHealthy = response && response.healthy;
      // Update engine availability when config present (fallback to healthy true)
      if (response && response.config && response.config.cliCapabilities) {
        const caps = response.config.cliCapabilities || {};
        state.availableEngines.codex = !!(caps.codex && caps.codex.available);
        state.availableEngines.claude = !!(caps.claude && caps.claude.available);
      } else {
        // If server is healthy but no specific caps, assume codex available by default
        state.availableEngines.codex = !!state.isServerHealthy;
        // Claude remains false unless explicitly reported
      }
      updateEngineStatus();
      if (!state.engineRestored) {
        chrome.storage.local.get(['engine'], (res) => {
          if (res.engine && (res.engine === 'codex' || res.engine === 'claude')) {
            state.currentEngine = res.engine;
            const shadow = state.bubbleShadow;
            if (shadow) {
              const engineName = shadow.getElementById('engine-name');
              engineName.textContent = res.engine === 'codex' ? 'Codex' : 'Claude';
              shadow.querySelectorAll('.engine-option').forEach(opt => {
                opt.classList.toggle('selected', opt.dataset.engine === res.engine);
              });
            }
          }
          state.engineRestored = true;
          updateServerStatus();
        });
      } else {
        updateServerStatus();
      }
    });
    
    // Check every 10 seconds
    setInterval(() => {
      safeSendMessage({ type: 'CHECK_SERVER' }, (response) => {
        state.isServerHealthy = response && response.healthy;
        if (response && response.config && response.config.cliCapabilities) {
          const caps = response.config.cliCapabilities;
          state.availableEngines.codex = !!(caps.codex && caps.codex.available);
          state.availableEngines.claude = !!(caps.claude && caps.claude.available);
          updateEngineStatus();
        }
        updateServerStatus();
      });
    }, 10000);
  }

  // ========== Safe Messaging ==========
  function safeSendMessage(message, callback) {
    try {
      if (!window.chrome || !chrome.runtime || !chrome.runtime.id) {
        if (callback) callback(undefined);
        return;
      }
      chrome.runtime.sendMessage(message, callback);
    } catch (err) {
      console.warn('[LUMI] runtime context invalidated, skipping message', err);
      if (callback) callback(undefined);
    }
  }

  function updateServerStatus() {
    const shadow = state.bubbleShadow;
    if (!shadow) return;
    
    const indicator = shadow.getElementById('status-indicator');
    indicator.classList.toggle('offline', !state.isServerHealthy);
    
    // Also update engine availability indicators in dropdown if present
    const codexDot = shadow.getElementById('engine-status-codex');
    const claudeDot = shadow.getElementById('engine-status-claude');
    if (codexDot) codexDot.classList.toggle('available', !!state.availableEngines.codex);
    if (claudeDot) claudeDot.classList.toggle('available', !!state.availableEngines.claude);
  }

  function updateEngineStatus() {
    const shadow = state.bubbleShadow;
    if (!shadow) return;
    
    // Update engine availability dots in dropdown
    const codexDot = shadow.getElementById('engine-status-codex');
    const claudeDot = shadow.getElementById('engine-status-claude');
    if (codexDot) codexDot.classList.toggle('available', !!state.availableEngines.codex);
    if (claudeDot) claudeDot.classList.toggle('available', !!state.availableEngines.claude);
  }

  // ========== Utilities ==========
  function getElementSelector(element) {
    if (element.id) return `#${element.id}`;
    if (element.className) {
      const classes = element.className.split(' ').filter(c => c).slice(0, 2);
      return `${element.tagName.toLowerCase()}.${classes.join('.')}`;
    }
    return element.tagName.toLowerCase();
  }

  function getComputedStyleSummary(element) {
    const computed = window.getComputedStyle(element);
    return {
      display: computed.display,
      position: computed.position,
      width: computed.width,
      height: computed.height,
      backgroundColor: computed.backgroundColor,
      color: computed.color,
      fontSize: computed.fontSize,
      fontFamily: computed.fontFamily,
      padding: computed.padding,
      margin: computed.margin,
      border: computed.border
    };
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes scaleIn {
        from {
          opacity: 0;
          transform: scale(0.8);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }
      @keyframes slideDown {
        from {
          transform: translateY(-100%);
        }
        to {
          transform: translateY(0);
        }
      }
      /* Global cursor helpers for selection modes */
      html.lumi-element-cursor, body.lumi-element-cursor { cursor: pointer !important; }
      html.lumi-screenshot-cursor, body.lumi-screenshot-cursor { cursor: crosshair !important; }
    `;
    document.head.appendChild(style);
  }

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TOGGLE_BUBBLE') {
      const isVisible = state.bubble && state.bubble.style.display !== 'none';
      
      if (isVisible) {
        hideBubble();
      } else {
        // First click: show bubble and enable element mode so users can select immediately
        showBubble();
        activateElementMode();
      }
      sendResponse({ success: true });
      return true;
    }
  });

  console.log('[LUMI v3] Initialized successfully');

})();

