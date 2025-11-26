import { DOCK_STYLES } from './styles.js';
// Manual theming is handled via ui.theme and setDockThemeMode in content
import { readableElementName } from '../../utils/dom.js';
import { escapeHtml } from './utils.js';
import { renderMarkdown } from './MarkdownRenderer.js';
import { buildTimelineFromChunks, EntryKind, EntryStatus } from './client-timeline.js';

export default class DockRoot {
  constructor(eventBus, stateManager) {
    this.eventBus = eventBus;
    this.stateManager = stateManager;
    this.host = null;
    this.shadow = null;
    this.activeTab = 'chat';
    this.chatMessages = [];
    this.renameState = null;
    this.handle = null;
    this.handleDragState = null;
    this.editorEl = null;
    this.toggleBtn = null;
    this.toggleIcon = null;
    this.launcher = null;
    this.savedRange = null;
    this.captureSelection = this.captureSelection.bind(this);
    this._renderTimer = null;
  }

  updateTheme() {
    try {
      const mode = this.stateManager.get('ui.theme') || 'light';
      const dock = this.shadow && this.shadow.getElementById('dock');
      if (!dock) return;
      if (mode === 'dark') dock.classList.add('dark'); else dock.classList.remove('dark');
    } catch (_) { }
  }

  reflectMode(mode) {
    try {
      const select = this.shadow.getElementById('select-btn');
      const shot = this.shadow.getElementById('shot-btn');
      if (select) select.classList.toggle('active', mode === 'element');
      if (shot) shot.classList.toggle('active', mode === 'screenshot');
    } catch (_) { }
  }

  mount() {
    if (this.host) return;
    this.host = document.createElement('div');
    this.host.id = 'lumi-dock-root';
    this.host.style.cssText = 'position: fixed; top: 0; right: 0; height: 100vh; width: 420px; z-index: 2147483646; display: none;';
    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.shadow.innerHTML = this.renderHTML();
    document.body.appendChild(this.host);

    // Apply initial layout (no squeeze until shown)
    this.applySqueeze(false);

    // Remove compact handle – prefer close + launcher orb UX
    this.createLauncher();
    this.bind();
    this.renderChips(this.stateManager.get('selection.elements') || []);
    this.renderBody();
    this.updateSendState();
  }

  renderHTML() {
    return `
      <style>${DOCK_STYLES}</style>
      <div class="dock" id="dock">
        <div class="header">
          <div class="project" id="project-name">Lumi — Demo Project</div>
          <div class="header-actions">
            <button class="header-btn header-theme" id="theme-toggle" title="Toggle Theme" aria-label="Toggle Theme">
              <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path data-icon="sun" d="M12 4V2m0 20v-2m8-8h2M2 12h2m12.95 6.95l1.41 1.41M4.64 4.64l1.41 1.41m0 12.9l-1.41 1.41m12.9-12.9l1.41-1.41"/>
                <circle data-icon="sun" cx="12" cy="12" r="3.5"></circle>
                <path data-icon="moon" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" style="display:none"/>
              </svg>
            </button>
            <button class="header-btn header-settings" id="gear" title="Open Settings" aria-label="Open Settings">
              <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2l9 4.5v9L12 20l-9-4.5v-9L12 2z"></path>
                <circle cx="12" cy="11" r="3"></circle>
              </svg>
            </button>
            <button class="header-btn header-close" id="dock-close" title="Close Dock" aria-label="Close Dock">
              <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 6l12 12M18 6l-12 12"></path>
              </svg>
            </button>
          </div>
        </div>
        <nav class="tabs" id="tabs">
          <button class="tab" data-tab="chat">Chat</button>
          <button class="tab" data-tab="history">History</button>
        </nav>
        <div class="body">
          <div id="chat-pane" class="chat-list view-active"></div>
          <div id="history-pane" class="history-list view-hidden"></div>
        </div>
        <div class="footer">
          <div class="composer-top" id="composer">
            <div class="editor" id="composer-editor" contenteditable="true" data-placeholder="Describe anything you want"></div>
          </div>
          <div class="toolbar">
            <div class="engine" id="engine">
              <span class="dot" id="engine-light"></span>
              <select id="engine-select">
                <option value="codex">Codex</option>
                <option value="claude">Claude Code</option>
              </select>
            </div>
            <div class="actions">
              <button class="icon" id="select-btn" title="Element Select" aria-label="Element Select">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M4 3l8 18 2-7 7-2z"></path>
                </svg>
              </button>
              <button class="icon" id="shot-btn" title="Screenshot" aria-label="Screenshot">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="2"></rect>
                  <path d="M7 13l3-3 5 6 3-4"></path>
                  <circle cx="9" cy="9" r="1.5"></circle>
                </svg>
              </button>
              <button class="icon" id="new-session-btn" title="New Session" aria-label="New Session">＋</button>
              <button class="send" id="send-btn" title="Send" aria-label="Send" disabled>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M22 2L11 13"></path>
                  <path d="M22 2L15 22l-4-9-9-4z"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  bind() {
    this.chatPane = this.shadow.getElementById('chat-pane');
    this.historyPane = this.shadow.getElementById('history-pane');
    this.tabsEl = this.shadow.getElementById('tabs');
    this.editorEl = this.shadow.getElementById('composer-editor');
    this.footerEl = this.shadow.querySelector('.footer');
    this.inputEl = this.editorEl;
    this.sendBtn = this.shadow.getElementById('send-btn');
    this.engineSelect = this.shadow.getElementById('engine-select');
    this.engineShell = this.shadow.getElementById('engine');
    this.projectLabel = this.shadow.getElementById('project-name');
    this.toggleCollapse = null;
    this.toggleExpand = null;

    const settingsBtn = this.shadow.getElementById('gear');
    this.toggleBtn = null;
    settingsBtn.addEventListener('click', () => {
      try { chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }); } catch (_) { }
    });
    // collapse/expand removed

    const themeBtn = this.shadow.getElementById('theme-toggle');
    const reflectThemeIcon = () => {
      const mode = this.stateManager.get('ui.theme') || 'light';
      const svg = themeBtn && themeBtn.querySelector('svg');
      if (!svg) return;
      svg.querySelectorAll('[data-icon="sun"]').forEach(n => n.style.display = (mode === 'dark') ? 'none' : 'block');
      const moon = svg.querySelector('[data-icon="moon"]');
      if (moon) moon.style.display = (mode === 'dark') ? 'block' : 'none';
      themeBtn.title = mode === 'dark' ? 'Light Mode' : 'Dark Mode';
    };
    if (themeBtn) themeBtn.addEventListener('click', () => {
      const cur = this.stateManager.get('ui.theme') || 'light';
      const next = cur === 'dark' ? 'light' : 'dark';
      this.stateManager.set('ui.theme', next);
      this.eventBus.emit('theme:set', next);
      reflectThemeIcon();
    });
    reflectThemeIcon();
    try {
      this.stateManager.subscribe('ui.theme', () => {
        reflectThemeIcon();
        this.updateTheme();
      });
      this.stateManager.subscribe('ui.mode', (mode) => this.reflectMode(mode));
    } catch (_) { }

    // Apply theme and mode on mount
    this.updateTheme();
    this.reflectMode(this.stateManager.get('ui.mode'));

    const closeBtn = this.shadow.getElementById('dock-close');
    closeBtn.addEventListener('click', () => {
      this.stateManager.set('ui.dockOpen', false);
      this.setVisible(false);
      try { this.eventBus.emit('bubble:close'); } catch (_) { }
    });

    this.tabsEl.addEventListener('click', (e) => {
      const tab = e.target.closest('.tab');
      if (!tab) return;
      this.setTab(tab.dataset.tab);
    });

    this.shadow.getElementById('select-btn').addEventListener('click', () => this.eventBus.emit('mode:toggle-element'));
    this.shadow.getElementById('shot-btn').addEventListener('click', () => this.eventBus.emit('mode:toggle-screenshot'));
    this.shadow.getElementById('new-session-btn').addEventListener('click', () => this.eventBus.emit('session:create'));

    // Ensure immediate UI switch to Chat when creating/resuming sessions
    try {
      this.eventBus.on('session:create', () => this.setTab('chat'));
      this.eventBus.on('session:resume', () => this.setTab('chat'));
    } catch (_) { }

    this.engineSelect.addEventListener('change', () => {
      const value = this.engineSelect.value === 'claude' ? 'claude' : 'codex';
      this.eventBus.emit('engine:select', value);
    });

    this.editorEl.addEventListener('input', () => {
      this.updatePlaceholder();
      this.eventBus.emit('input:changed');
      this.updateSendState();
      this.captureSelection();
      this.reconcileSelectionWithChips();
    });
    this.editorEl.addEventListener('keydown', (e) => {
      // Remove adjacent chip via Backspace/Delete
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const sel = this.getSelection();
        if (sel && sel.rangeCount && this.editorEl.contains(sel.anchorNode)) {
          const range = sel.getRangeAt(0);
          const removeChip = (chip) => {
            if (!chip || !chip.classList || !chip.classList.contains('chip')) return false;
            const idx = Number(chip.dataset.index || '-1');
            if (idx >= 0) {
              e.preventDefault();
              e.stopPropagation();
              this.removeElementAt(idx);
              this.captureSelection();
              this.updateSendState();
              return true;
            }
            if (chip.dataset.shotId !== undefined) {
              e.preventDefault();
              e.stopPropagation();
              const rawId = chip.dataset.shotId;
              const numericId = Number(rawId);
              const shotId = Number.isNaN(numericId) ? rawId : numericId;
              this.eventBus.emit('screenshot:remove', shotId);
              this.captureSelection();
              this.updateSendState();
              return true;
            }
            return false;
          };
          const isEmptyText = (n) => n && n.nodeType === Node.TEXT_NODE && /^\s*$/.test(n.textContent || '');
          let node = range.startContainer;
          // If selection spans multiple nodes, prefer default behavior
          if (!range.collapsed) return;
          if (e.key === 'Backspace') {
            // When at start of a text node, look left to previous sibling
            if (node.nodeType === Node.TEXT_NODE && range.startOffset === 0) {
              let prev = node.previousSibling;
              while (isEmptyText(prev)) prev = prev && prev.previousSibling;
              if (removeChip(prev)) return;
            }
            // If in element node with an offset, check prior child
            if (node.nodeType === Node.ELEMENT_NODE) {
              const idx = Math.max(0, range.startOffset - 1);
              let prev = node.childNodes[idx] || node.childNodes[idx - 1] || node.previousSibling;
              while (isEmptyText(prev)) prev = prev && prev.previousSibling;
              if (removeChip(prev)) return;
            }
          } else if (e.key === 'Delete') {
            if (node.nodeType === Node.TEXT_NODE && range.startOffset >= (node.textContent || '').length) {
              let next = node.nextSibling;
              while (isEmptyText(next)) next = next && next.nextSibling;
              if (removeChip(next)) return;
            }
            if (node.nodeType === Node.ELEMENT_NODE) {
              let next = node.childNodes[range.startOffset] || node.nextSibling;
              while (isEmptyText(next)) next = next && next.nextSibling;
              if (removeChip(next)) return;
            }
          }
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        this.eventBus.emit('submit:requested');
      }
    });
    this.editorEl.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text');
      document.execCommand('insertText', false, text);
      this.captureSelection();
    });
    this.editorEl.addEventListener('mouseup', this.captureSelection);
    this.editorEl.addEventListener('keyup', this.captureSelection);
    this.editorEl.addEventListener('focus', this.captureSelection);
    this.editorEl.addEventListener('blur', () => {
      this.sanitizeEditor();
      this.captureSelection();
      this.reconcileSelectionWithChips();
    });

    this.sendBtn.addEventListener('click', () => this.eventBus.emit('submit:requested'));

    this.historyPane.addEventListener('click', (event) => this.handleHistoryClick(event));

    // State subscriptions
    this.stateManager.subscribe('engine.current', (engine) => this.updateEngine(engine));
    this.stateManager.subscribe('engine.available', () => this.updateEngineAvailability());
    this.stateManager.subscribe('selection.elements', (elements) => this.renderChips(elements || []));
    this.stateManager.subscribe('selection.screenshots', () => this.renderChips(this.stateManager.get('selection.elements') || []));
    this.stateManager.subscribe('ui.dockTab', (tab) => this.setTab(tab, true));
    this.stateManager.subscribe('ui.dockOpen', (open) => this.setVisible(open !== false));
    // Keep state wired, but collapse/expand is disabled; always enforce 'normal'
    this.stateManager.subscribe('ui.dockState', () => this.updateDockState('normal'));
    this.stateManager.subscribe('processing.active', () => this.updateSendState());
    this.stateManager.subscribe('wysiwyg.hasDiffs', () => this.updateSendState());
    this.stateManager.subscribe('projects.allowed', () => this.updateSendState());
    this.stateManager.subscribe('projects.current', (project) => this.updateProjectName(project));
    this.stateManager.subscribe('server.workingDirectory', () => {
      this.updateProjectName(this.stateManager.get('projects.current'));
    });

    // Also listen for batched state updates so we react when HealthChecker
    // updates projects.current / server.workingDirectory via batch(...)
    try {
      this.eventBus.on('state:batch-update', (updates) => {
        if (!updates) return;
        if (Object.prototype.hasOwnProperty.call(updates, 'projects.current')
          || Object.prototype.hasOwnProperty.call(updates, 'server.workingDirectory')) {
          this.updateProjectName(this.stateManager.get('projects.current'));
        }
      });
    } catch (_) { /* ignore debug wiring errors */ }

    this.updateEngine(this.stateManager.get('engine.current'));
    this.updateEngineAvailability();
    this.activeTab = this.stateManager.get('ui.dockTab') || 'chat';
    this.setTab(this.activeTab, true);
    this.setVisible(this.stateManager.get('ui.dockOpen') !== false);
    this.updateDockState(this.stateManager.get('ui.dockState') || 'normal');
    this.updateProjectName(this.stateManager.get('projects.current'));
    this.updatePlaceholder();
    this.updateTheme();

    // Live updates for session changes (ensure History/UI refresh immediately)
    const scheduleRender = () => {
      if (this._renderTimer) return;
      this._renderTimer = setTimeout(() => {
        this._renderTimer = null;
        const tab = this.stateManager.get('ui.dockTab') || this.activeTab;
        if (tab === 'history') this.renderHistory(); else this.renderChat();
      }, 100);
    };
    this.stateManager.subscribe('sessions.list', scheduleRender);
    // Switch session should re-render immediately to avoid stale content flash
    this.stateManager.subscribe('sessions.currentId', () => {
      const tab = this.stateManager.get('ui.dockTab') || this.activeTab;
      if (tab === 'history') this.renderHistory(); else this.renderChat();
    });

    // Prepare screenshot preview containers
    this.ensureShotPreviewContainers();
  }

  applySqueeze(isOpen) {
    // Overlay mode: do not squeeze page (user feedback: squeeze was too strong)
    try {
      const html = document.documentElement;
      const body = document.body;
      html.style.paddingRight = '0px';
      body.style.paddingRight = '0px';
    } catch (_) { }
  }

  updateDockState(state) {
    const dock = this.shadow.getElementById('dock');
    if (!dock) return;
    dock.classList.remove('compact');
    const isCompact = false;
    const dockWidth = '420px';

    if (this.host) {
      this.host.style.pointerEvents = isCompact ? 'none' : 'auto';
      this.host.style.transition = 'width 0.2s cubic-bezier(0.22, 1, 0.36, 1)';
      this.host.style.width = dockWidth;
    }

    // Update squeeze based on compact state
    const isOpen = this.stateManager.get('ui.dockOpen') !== false;
    if (isOpen) this.applySqueeze(false);

    // Hide Dock surface entirely in compact; use handle instead
    dock.style.display = isCompact ? 'none' : 'flex';

    // Hide collapse/expand affordances completely
    if (this.toggleBtn) this.toggleBtn.style.display = 'none';
    if (this.toggleCollapse) this.toggleCollapse.style.display = 'none';
    if (this.toggleExpand) this.toggleExpand.style.display = 'none';
  }

  setVisible(isOpen) {
    if (!this.host) return;
    this.host.style.display = isOpen ? 'block' : 'none';

    // Overlay mode, no squeeze
    this.applySqueeze(false);

    if (this.handle) {
      const state = this.stateManager.get('ui.dockState');
      this.handle.style.display = isOpen && state === 'compact' ? 'flex' : 'none';
    }
    if (this.launcher) {
      this.launcher.style.display = isOpen ? 'none' : 'flex';
    }
  }

  setTab(name, fromState = false) {
    if (!name) return;
    this.activeTab = name;
    Array.from(this.tabsEl.querySelectorAll('.tab')).forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === name);
    });
    if (!fromState) {
      this.stateManager.set('ui.dockTab', name);
      // Defer render to allow any related state (e.g., sessions.currentId) to commit first
      setTimeout(() => this.renderBody(), 0);
    } else {
      this.renderBody();
    }
  }

  renderBody() {
    const tab = this.stateManager.get('ui.dockTab') || this.activeTab;
    // Hide composer when viewing History
    if (this.footerEl) {
      this.footerEl.style.display = tab === 'history' ? 'none' : 'block';
    }
    if (tab === 'history') {
      this.chatPane.classList.add('view-hidden');
      this.chatPane.classList.remove('view-active');
      this.historyPane.classList.remove('view-hidden');
      this.historyPane.classList.add('view-active');
      this.renderHistory();
    } else {
      this.historyPane.classList.add('view-hidden');
      this.historyPane.classList.remove('view-active');
      this.chatPane.classList.remove('view-hidden');
      this.chatPane.classList.add('view-active');
      this.renderChat();
    }
  }

  renderChat() {
    if (!this.chatPane) return;
    const pane = this.chatPane;
    pane.innerHTML = '';
    const sessions = this.stateManager.get('sessions.list') || [];
    const currentId = this.stateManager.get('sessions.currentId');
    const session = sessions.find(s => s.id === currentId) || sessions[0];
    if (!session || session.transcript.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'chat-empty';
      empty.textContent = 'Start by selecting elements or typing a message.';
      pane.appendChild(empty);
      return;
    }
    session.transcript.forEach(msg => {
      pane.appendChild(this.renderChatMessage(msg));
    });
  }

  renderChatMessage(msg) {
    if (msg.role === 'assistant') {
      return this.renderAssistantMessage(msg);
    }
    // User message: no avatar, simple style
    const item = document.createElement('div');
    item.className = 'msg user';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = msg.text;
    item.appendChild(bubble);
    return item;
  }

  renderAssistantMessage(msg) {
    const doc = this.shadow?.ownerDocument || document;
    const item = doc.createElement('div');
    item.className = 'msg assistant';

    const state = this.getAssistantState(msg);
    const header = doc.createElement('div');
    header.className = 'feed-header';
    const label = doc.createElement('span');
    let labelText = 'Finished';
    if (state === 'queued' || state === 'streaming') {
      labelText = 'Working';
      label.className = 'working-label';
      label.textContent = labelText;
      const dots = doc.createElement('span');
      dots.className = 'working-dots';
      dots.textContent = '...';
      label.appendChild(dots);
    } else if (state === 'done-error') {
      labelText = 'Finished with issues';
      label.textContent = labelText;
    } else {
      label.textContent = labelText;
    }
    header.appendChild(label);
    let toggleBtn = null;

    const timeline = this.renderAssistantTimeline(msg, state);
    if (timeline && (state === 'done' || state === 'done-error')) {
      toggleBtn = doc.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'timeline-toggle';
      toggleBtn.textContent = '▸';
      header.appendChild(toggleBtn);
    }
    item.appendChild(header);

    if (timeline) {
      item.appendChild(timeline);
      if (toggleBtn) {
        const body = timeline.querySelector('.timeline-body');
        const setOpen = (open) => {
          timeline.classList.toggle('timeline-open', open);
          if (body) body.style.display = open ? 'block' : 'none';
          toggleBtn.textContent = open ? '▾' : '▸';
        };
        setOpen(state === 'streaming');
        toggleBtn.addEventListener('click', () => setOpen(!timeline.classList.contains('timeline-open')));
      }
    }

    const summary = this.renderAssistantSummary(msg);
    if (summary) item.appendChild(summary);

    return item;
  }

  renderAssistantSummary(msg) {
    const doc = this.shadow?.ownerDocument || document;
    const result = msg.result || {};
    const turnSummary = msg.turnSummary || null;
    const resultChunks = Array.isArray(msg.chunks) ? msg.chunks : [];

    const title = turnSummary?.title
      || result.title
      || (resultChunks.find((c) => c?.type === 'result' && c.resultSummary)?.resultSummary)
      || '';
    const description = (() => {
      if (turnSummary && Array.isArray(turnSummary.bullets) && turnSummary.bullets.length) {
        return turnSummary.bullets[0];
      }
      let text =
        result.description ||
        (resultChunks.find((c) => c?.type === 'result' && c.text)?.text) ||
        msg.text ||
        '';
      return text || '';
    })();

    const container = doc.createElement('div');
    container.className = 'assistant-summary';

    // Meta line (duration / tests only)
    if (turnSummary?.meta) {
      const metaLine = doc.createElement('div');
      metaLine.className = 'summary-meta';
      const parts = [];
      if (typeof turnSummary.meta.durationMs === 'number') parts.push(this.formatDuration(turnSummary.meta.durationMs));
      if (turnSummary.meta.testsStatus) parts.push(`tests ${turnSummary.meta.testsStatus}`);

      const text = parts.filter(Boolean).join(' · ');
      if (text) {
        metaLine.textContent = text;
        container.appendChild(metaLine);
      }
    }

    if (msg.streaming && !msg.done) {
      container.appendChild(this.renderResultSkeleton(doc));
      return container;
    }

    // If we have a description, show it. This is the "Result" text the user missed.
    if (description) {
      const desc = doc.createElement('div');
      desc.className = 'summary-body';
      // Render markdown when present
      if (/```|^#\s/m.test(description)) {
        desc.appendChild(renderMarkdown(description, doc));
      } else {
        desc.textContent = description;
      }
      container.appendChild(desc);
    } else if (title) {
      // Fallback to title if no description
      const titleEl = doc.createElement('div');
      titleEl.className = 'summary-title';
      titleEl.textContent = title;
      container.appendChild(titleEl);
    }

    return container;
  }

  cleanMarkdown(text = '') {
    if (!text) return '';
    return String(text)
      .replace(/\*\*(.*?)\*\*/g, '$1') // Bold
      .replace(/\*(.*?)\*/g, '$1')     // Italic
      .replace(/`(.*?)`/g, '$1')       // Code
      .replace(/^#+\s+/, '')           // Headers
      .trim();
  }

  renderAssistantTimeline(msg, state) {
    let timelineEntries = Array.isArray(msg.timelineEntries) ? msg.timelineEntries : [];
    const chunks = Array.isArray(msg.chunks) ? msg.chunks : [];

    // If no server-provided entries yet (streaming), build them client-side
    if (timelineEntries.length === 0 && chunks.length > 0) {
      const built = buildTimelineFromChunks(chunks);
      if (built && built.timeline) {
        timelineEntries = built.timeline;
      }
    }

    const hasTimeline = timelineEntries.length > 0;
    if (!hasTimeline && state === 'done') return null;

    const doc = this.shadow?.ownerDocument || document;
    const wrapper = doc.createElement('div');
    wrapper.className = 'assistant-timeline';
    if (state === 'done' || state === 'done-error') {
      wrapper.classList.add('collapsed');
    }
    const body = doc.createElement('div');
    body.className = 'timeline-body';
    if (state === 'streaming') {
      body.style.display = 'block';
      wrapper.classList.add('timeline-open');
    } else {
      body.style.display = 'none';
    }

    if (timelineEntries.length) {
      body.appendChild(this.renderTimelineEntries(timelineEntries));
    } else if (state === 'streaming') {
      // If streaming but no entries yet (e.g. just started), show placeholder or nothing
      // We don't want the old renderTimeline fallback.
      const placeholder = doc.createElement('div');
      placeholder.className = 'timeline-placeholder';
      placeholder.textContent = 'Thinking...';
      body.appendChild(placeholder);
    } else {
      const placeholder = doc.createElement('div');
      placeholder.className = 'timeline-placeholder';
      placeholder.textContent = 'No events to display.';
      body.appendChild(placeholder);
    }

    wrapper.appendChild(body);
    return wrapper;
  }

  getAssistantState(msg) {
    const hasChunks = Array.isArray(msg.chunks) && msg.chunks.length > 0;
    if (msg.streaming && !hasChunks) return 'queued';
    if (msg.streaming && hasChunks) return 'streaming';
    if (msg.applied === false) return 'done-error';
    return 'done';
  }

  createStatusIcon(doc, state, msg) {
    const span = doc.createElement('span');
    span.className = 'icon';
    // Keep status text only; icons intentionally minimal
    if (state === 'done-error') {
      span.textContent = '!';
    }
    return span;
  }

  renderResultSkeleton(doc) {
    const skeleton = doc.createElement('div');
    skeleton.className = 'result-skeleton';
    for (let i = 0; i < 2; i++) {
      const line = doc.createElement('div');
      line.className = 'result-skeleton-line';
      skeleton.appendChild(line);
    }
    return skeleton;
  }

  createSpinner(doc) {
    const spinner = doc.createElement('span');
    spinner.className = 'spinner';
    spinner.setAttribute('aria-hidden', 'true');
    return spinner;
  }

  formatDuration(ms) {
    if (!ms || Number.isNaN(ms)) return '';
    if (ms < 1000) return `${ms}ms`;
    const seconds = ms / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const remain = seconds % 60;
    return `${minutes}m ${remain.toFixed(0)}s`;
  }

  renderTimeline(chunks = []) {
    const doc = this.shadow?.ownerDocument || document;
    const list = doc.createElement('ul');
    list.className = 'timeline-feed';
    let logShown = 0;
    chunks.forEach((c) => {
      if (!c || typeof c !== 'object') return;
      if (c.type === 'edit' && (!c.file || c.file === 'unknown')) return;
      const row = doc.createElement('li');
      row.className = 'timeline-item';
      row.style.whiteSpace = 'pre-wrap';
      row.style.lineHeight = '1.5';
      let text = '';
      switch (c.type) {
        case 'thinking':
          text = `Thinking: ${c.text || ''}`;
          break;
        case 'run':
          text = `Run: ${c.cmd || ''}`;
          break;
        case 'edit': {
          const meta = [];
          if (typeof c.added === 'number') meta.push(`+${c.added}`);
          if (typeof c.removed === 'number') meta.push(`-${c.removed}`);
          text = `Edited ${c.file || 'file'} ${meta.join(' ')}`.trim();
          break;
        }
        case 'log':
          if (logShown >= 12) return;
          logShown++;
          text = c.text || '';
          break;
        case 'result':
          text = c.resultSummary || c.text || '';
          break;
        case 'error':
          text = `Error: ${c.message || c.text || ''}`;
          break;
        default:
          text = c.text || '';
      }
      row.textContent = escapeHtml(String(text));
      if (c.type === 'edit' && c.diff) {
        row.appendChild(this.renderDiffDetails(doc, c.diff));
      }
      list.appendChild(row);
    });
    return list;
  }

  renderRawLogs(chunks = []) {
    const doc = this.shadow?.ownerDocument || document;
    const details = doc.createElement('details');
    details.className = 'raw-logs';
    const summary = doc.createElement('summary');
    summary.textContent = 'View raw logs';
    details.appendChild(summary);
    const pre = doc.createElement('pre');
    pre.className = 'raw-logs-body';
    const lines = [];
    chunks.forEach((c) => {
      if (!c || typeof c !== 'object') return;
      if (c.type === 'log' && c.text) lines.push(c.text);
      else if (c.type === 'run' && c.cmd) lines.push(`[run] ${c.cmd}`);
      else if (c.type === 'error' && (c.text || c.message)) lines.push(`[error] ${c.text || c.message}`);
    });
    pre.textContent = lines.join('\n');
    details.appendChild(pre);
    return details;
  }

  renderTimelineEntries(entries = []) {
    const doc = this.shadow?.ownerDocument || document;
    const container = doc.createElement('div');
    container.className = 'timeline-entries';

    entries.forEach((e) => {
      // Clean the title before rendering
      const cleanedEntry = { ...e, title: this.cleanMarkdown(e.title) };

      let item = null;
      switch (cleanedEntry.kind) {
        case EntryKind.THINKING: item = this.renderThinkingEntry(doc, cleanedEntry); break;
        case EntryKind.COMMAND: item = this.renderCommandEntry(doc, cleanedEntry); break;
        case EntryKind.FILE_CHANGE: item = this.renderEditEntry(doc, cleanedEntry); break;
        case EntryKind.TEST: item = this.renderTestEntry(doc, cleanedEntry); break;
        case EntryKind.ERROR: item = this.renderErrorEntry(doc, cleanedEntry); break;
        case EntryKind.FINAL: item = this.renderFinalEntry(doc, cleanedEntry); break;
        default: item = this.renderGenericEntry(doc, cleanedEntry);
      }
      if (item) container.appendChild(item);
    });

    return container;
  }

  renderThinkingEntry(doc, e) {
    return this.renderTimelineEntry(doc, e, {
      icon: this.renderEntryIcon(doc, e.kind),
      title: e.title,
      body: e.body, // Thinking content
      isThinking: true
    });
  }

  renderCommandEntry(doc, e) {
    return this.renderTimelineEntry(doc, e, {
      icon: this.renderEntryIcon(doc, e.kind),
      title: e.title,
      body: e.body, // Output logs
      detailsLabel: 'Show output'
    });
  }

  renderEditEntry(doc, e) {
    const item = this.renderTimelineEntry(doc, e, {
      icon: this.renderEntryIcon(doc, e.kind),
      title: e.title,
      // Custom body for file list
    });

    // Add file list to body if available
    if (e.details && Array.isArray(e.details)) {
      const fileList = doc.createElement('div');
      fileList.className = 'timeline-file-list';
      e.details.forEach(f => {
        const row = doc.createElement('div');
        row.className = 'timeline-file';
        const name = doc.createElement('span');
        name.textContent = f.path;
        row.appendChild(name);

        if (f.added) {
          const added = doc.createElement('span');
          added.className = 'timeline-file-stat added';
          added.textContent = `+${f.added}`;
          row.appendChild(added);
        }
        if (f.removed) {
          const removed = doc.createElement('span');
          removed.className = 'timeline-file-stat removed';
          removed.textContent = `-${f.removed}`;
          row.appendChild(removed);
        }
        fileList.appendChild(row);
      });

      // Append to content
      const content = item.querySelector('.timeline-content');
      if (content) content.appendChild(fileList);
    }

    return item;
  }

  renderTestEntry(doc, e) {
    return this.renderTimelineEntry(doc, e, {
      icon: this.renderEntryIcon(doc, e.kind),
      title: e.title,
      body: e.body,
      detailsLabel: 'Show test output'
    });
  }

  renderErrorEntry(doc, e) {
    return this.renderTimelineEntry(doc, e, {
      icon: this.renderEntryIcon(doc, e.kind),
      title: e.title,
      body: e.body,
      detailsLabel: 'Show error details'
    });
  }

  renderFinalEntry(doc, e) {
    // Usually we don't show final entry in timeline if it's just a result summary, 
    // but if it has body we might.
    // For now, let's skip it if it duplicates the main result, or show it as a checkmark.
    return this.renderTimelineEntry(doc, e, {
      icon: this.renderEntryIcon(doc, e.kind),
      title: e.title,
      body: e.body
    });
  }

  renderGenericEntry(doc, e) {
    return this.renderTimelineEntry(doc, e, {
      icon: this.renderEntryIcon(doc, 'default'),
      title: e.title || e.summary,
      body: e.body
    });
  }

  renderTimelineEntry(doc, e, options = {}) {
    const el = doc.createElement('div');
    el.className = `timeline-entry ${e.status || ''} ${e.kind || ''}`;

    if (options.icon) {
      el.appendChild(options.icon);
    }

    const content = doc.createElement('div');
    content.className = 'timeline-content';

    const header = doc.createElement('div');
    header.className = 'timeline-header';
    // Make header clickable if there is a body to toggle
    if (options.body && !options.isThinking) {
      header.style.cursor = 'pointer';
      header.classList.add('clickable');
      header.onclick = () => {
        el.classList.toggle('expanded');
      };
    }

    const title = doc.createElement('div');
    title.className = 'timeline-title';
    title.textContent = options.title || '';
    header.appendChild(title);

    // Add chevron if expandable
    if (options.body && !options.isThinking) {
      const chevron = doc.createElement('span');
      chevron.className = 'timeline-chevron';
      chevron.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
      header.appendChild(chevron);
    }

    // Duration could be added here if available in entry

    content.appendChild(header);

    if (options.body) {
      if (options.isThinking) {
        const body = doc.createElement('div');
        body.className = 'timeline-body';
        body.textContent = options.body;
        content.appendChild(body);
      } else {
        // Hidden by default, toggled via .expanded class on parent
        const details = doc.createElement('div');
        details.className = 'timeline-details-body';

        const pre = doc.createElement('div');
        pre.className = 'timeline-pre';
        pre.textContent = options.body;
        details.appendChild(pre);

        content.appendChild(details);
      }
    }

    // Add file list to body if available (for edit entries)
    if (e.details && Array.isArray(e.details) && e.kind === EntryKind.FILE_CHANGE) {
      // ... existing file list logic ...
      // This part was handled in renderEditEntry, but we need to ensure it's inside the toggleable area if desired.
      // For now, let's keep it simple and assume renderEditEntry appends to content.
    }

    el.appendChild(content);
    return el;
  }

  renderEntryIcon(doc, kind) {
    const span = doc.createElement('span');
    span.className = 'timeline-icon';

    // SVG Icons
    let svgPath = '';
    switch (kind) {
      case EntryKind.THINKING:
        // Brain or Thought Bubble
        svgPath = '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>'; // Message bubble
        break;
      case EntryKind.COMMAND:
        // Terminal
        svgPath = '<polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line>';
        break;
      case EntryKind.TEST:
        // Beaker
        svgPath = '<path d="M10 2v7.31"/><path d="M14 2v7.31"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/>';
        break;
      case EntryKind.FILE_CHANGE:
        // Edit/Pencil
        svgPath = '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>';
        break;
      case EntryKind.FINAL:
        // Check
        svgPath = '<polyline points="20 6 9 17 4 12"></polyline>';
        break;
      case EntryKind.ERROR:
        // Alert
        svgPath = '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>';
        break;
      default:
        // Dot
        svgPath = '<circle cx="12" cy="12" r="2"></circle>';
    }

    span.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg>`;
    return span;
  }

  renderDiffDetails(doc, diffText = '') {
    const details = doc.createElement('details');
    details.className = 'diff-details';
    const summary = doc.createElement('summary');
    summary.textContent = 'Show diff';
    details.appendChild(summary);
    const body = doc.createElement('div');
    body.className = 'diff-body';
    diffText.split(/\r?\n/).forEach((line) => {
      if (line === undefined || line === null) return;
      const row = doc.createElement('div');
      row.className = 'diff-line';
      if (/^\+(?!\+\+)/.test(line)) row.classList.add('add');
      else if (/^-(?!---)/.test(line)) row.classList.add('del');
      else row.classList.add('ctx');
      row.textContent = line || '\u00A0';
      body.appendChild(row);
    });
    details.appendChild(body);
    return details;
  }

  renderHistory() {
    const pane = this.historyPane;
    if (!pane) return;
    pane.innerHTML = '';
    this.renameState = null;

    const newBtn = document.createElement('div');
    newBtn.className = 'history-new';
    newBtn.textContent = '＋ New Session';
    newBtn.addEventListener('click', () => this.eventBus.emit('session:create'));
    pane.appendChild(newBtn);

    const sessions = this.stateManager.get('sessions.list') || [];
    const currentId = this.stateManager.get('sessions.currentId');
    if (!sessions.length) {
      const empty = document.createElement('div');
      empty.className = 'placeholder';
      empty.textContent = 'History remembers your conversations.';
      pane.appendChild(empty);
      return;
    }

    sessions.forEach(session => {
      const row = document.createElement('div');
      row.className = 'history-row' + (session.id === currentId ? ' active' : '');
      row.dataset.sessionId = session.id;

      row.innerHTML = `
        <div class="history-main">
          <div class="history-title">${session.title ? escapeHtml(session.title) : 'Untitled session'}</div>
          <div class="history-meta">${this.timeAgo(session.updatedAt || session.createdAt)}</div>
        </div>
        <div class="history-actions">
          <button data-action="rename">Rename</button>
          <button data-action="delete">Delete</button>
        </div>
      `;
      pane.appendChild(row);
    });
  }

  handleHistoryClick(event) {
    const actionBtn = event.target.closest('button[data-action]');
    const row = event.target.closest('.history-row');
    if (!row) return;
    const sessionId = row.dataset.sessionId;
    if (!actionBtn) {
      this.eventBus.emit('session:resume', sessionId);
      return;
    }
    const action = actionBtn.dataset.action;
    if (action === 'rename') {
      if (row.classList.contains('renaming')) return;
      this.startRename(row, sessionId);
    } else if (action === 'delete') {
      if (window.confirm('Delete this session?')) {
        this.eventBus.emit('session:delete', sessionId);
      }
    }
  }

  startRename(row, sessionId) {
    if (!row) return;
    if (this.renameState && this.renameState.cancel) {
      this.renameState.cancel();
    }
    const main = row.querySelector('.history-main');
    const titleEl = row.querySelector('.history-title');
    const metaEl = row.querySelector('.history-meta');
    if (!main || !titleEl) return;

    const current = (titleEl.textContent || '').trim();
    const input = document.createElement('input');
    input.type = 'text';
    input.value = current;
    input.placeholder = 'Session title';
    input.className = 'history-rename';
    input.setAttribute('aria-label', 'Rename session');

    main.insertBefore(input, metaEl || null);
    titleEl.style.display = 'none';
    row.classList.add('renaming');

    let finished = false;

    const cleanup = (text = null) => {
      input.removeEventListener('keydown', onKeyDown);
      input.removeEventListener('blur', onBlur);
      row.classList.remove('renaming');
      if (titleEl) {
        titleEl.style.display = '';
        if (text !== null) {
          titleEl.textContent = text;
        }
      }
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
      if (this.renameState && this.renameState.input === input) {
        this.renameState = null;
      }
    };

    const commit = () => {
      if (finished) return;
      finished = true;
      const next = input.value.trim();
      cleanup(next || current);
      if (next && next !== current) {
        this.eventBus.emit('session:rename', { id: sessionId, title: next });
      }
    };

    const cancel = () => {
      if (finished) return;
      finished = true;
      cleanup(current);
    };

    const onKeyDown = (evt) => {
      if (evt.key === 'Enter') {
        evt.preventDefault();
        commit();
      } else if (evt.key === 'Escape') {
        evt.preventDefault();
        cancel();
      }
    };

    const onBlur = () => {
      commit();
    };

    input.addEventListener('keydown', onKeyDown);
    input.addEventListener('blur', onBlur);
    this.renameState = { row, input, titleEl, cancel };
    input.focus();
    input.select();
  }

  updateEngine(engine) {
    if (this.engineSelect) {
      this.engineSelect.value = engine === 'claude' ? 'claude' : 'codex';
    }
    this.updateEngineAvailability();
  }

  updateEngineAvailability() {
    if (!this.engineShell) return;
    const available = this.stateManager.get('engine.available') || {};
    const current = this.stateManager.get('engine.current');
    const dot = this.shadow.getElementById('engine-light');
    const isAvailable = !!available[current];
    this.engineShell.classList.toggle('available', isAvailable);
    if (dot) {
      dot.style.background = '';
    }
  }

  updateProjectName(project) {
    if (!this.projectLabel) return;

    try {
      const serverWd = this.stateManager.get('server.workingDirectory');
      const debugProject = project && typeof project === 'object'
        ? {
          id: project.id,
          name: project.name,
          workingDirectory: project.workingDirectory
        }
        : null;
      // eslint-disable-next-line no-console
      console.log('[LUMI][Dock] updateProjectName', {
        project: debugProject,
        serverWorkingDirectory: serverWd
      });
    } catch (_) { /* ignore debug logging errors */ }

    const projectAllowed = this.stateManager.get('projects.allowed');

    // If there is no mapped project or the host is blocked, treat as unmapped
    if (!project || projectAllowed === false) {
      this.projectLabel.textContent = 'Lumi — Unmapped Page';
      return;
    }

    // Prefer the matched project's working directory as identity when available
    try {
      const projectWd = project && typeof project === 'object' ? project.workingDirectory : null;
      if (projectWd && typeof projectWd === 'string') {
        const cleaned = projectWd.replace(/[\\/]+$/, '');
        const parts = cleaned.split(/[\\/]/);
        const base = parts[parts.length - 1] || cleaned;
        this.projectLabel.textContent = `Lumi — ${base}`;
        return;
      }
    } catch (_) { /* ignore */ }

    // Fallback: use explicit project name when available
    if (project && typeof project === 'object') {
      const name = project.name || project.id || 'Linked Project';
      this.projectLabel.textContent = `Lumi — ${name}`;
      return;
    }

    this.projectLabel.textContent = 'Lumi — Unmapped Page';
  }

  updateSendState() {
    if (!this.sendBtn) return;
    const elements = this.stateManager.get('selection.elements') || [];
    const screenshots = this.stateManager.get('selection.screenshots') || [];
    const hasContext = elements.length > 0 || screenshots.length > 0;
    const hasIntent = this.getPlainText().trim().length > 0;
    const hasEdits = this.stateManager.get('wysiwyg.hasDiffs')
      || (Array.isArray(elements) && elements.some(e => e && e.edited));
    const isProcessing = this.stateManager.get('processing.active');
    const projectAllowed = this.stateManager.get('projects.allowed');
    this.sendBtn.disabled = !hasContext || !(hasIntent || hasEdits) || isProcessing || projectAllowed === false;
    this.sendBtn.classList.toggle('processing', !!isProcessing);
  }

  getPlainText() {
    if (!this.editorEl) return '';
    let text = '';
    this.editorEl.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || '';
      } else if (node.classList?.contains('chip')) {
        // Element chip
        if (node.dataset.index !== undefined) {
          const idx = Number(node.dataset.index);
          text += `[@element${idx + 1}]`;
        }
        // Screenshot chip
        else if (node.dataset.shotId !== undefined) {
          const shots = this.stateManager.get('selection.screenshots') || [];
          const shotIdx = shots.findIndex(s => String(s.id) === node.dataset.shotId);
          if (shotIdx >= 0) {
            text += `[@screenshot${shotIdx + 1}]`;
          }
        }
      }
    });
    return text;
  }

  getInputValue() {
    return this.getPlainText().trim();
  }

  clearInput() {
    if (!this.editorEl) return;
    const nodes = Array.from(this.editorEl.childNodes);
    nodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        node.remove();
      }
    });
    this.updatePlaceholder();
    this.updateSendState();
  }

  focusComposer() {
    if (!this.editorEl) return;
    this.editorEl.focus();
    try {
      if (!this.restoreSelection()) {
        const selection = this.getSelection();
        if (!selection) return;
        const range = document.createRange();
        range.selectNodeContents(this.editorEl);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
        this.savedRange = range.cloneRange();
      }
    } catch (_) {
      // Ignore focus errors
    }
  }

  getShadowRoot() {
    return this.shadow;
  }

  // (compact handle removed)

  createLauncher() {
    if (this.launcher) return;
    const button = document.createElement('button');
    button.id = 'lumi-dock-launcher';
    button.type = 'button';
    button.setAttribute('aria-label', 'Show Lumi Dock');
    button.style.cssText = `
      position: fixed;
      bottom: 28px;
      right: 24px;
      width: 52px;
      height: 52px;
      border-radius: 26px;
      border: 1px solid var(--dock-stroke);
      background: var(--dock-bg);
      box-shadow: var(--shadow);
      color: var(--dock-fg);
      font-size: 18px;
      display: none;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 2147483646;
      user-select: none;
      transition: all 0.2s ease;
    `;
    button.textContent = 'L';
    button.style.fontWeight = '700';
    button.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    button.addEventListener('mouseenter', () => {
      button.style.transform = 'scale(1.05)';
      button.style.boxShadow = 'var(--shadow-lg)';
    });
    button.addEventListener('mouseleave', () => {
      button.style.transform = 'scale(1)';
      button.style.boxShadow = 'var(--shadow)';
    });
    button.addEventListener('click', () => {
      this.stateManager.set('ui.dockOpen', true);
      this.stateManager.set('ui.dockState', 'normal');
    });
    document.body.appendChild(button);
    this.launcher = button;
  }

  // (compact handle removed)

  // (compact handle removed)

  renderChips(elements) {
    this.syncChips(elements);
    this.renderScreenshotChips();
    this.updatePlaceholder();
    this.updateSendState();
  }

  insertChipForElement(item, index) {
    if (!this.editorEl) return;
    const selection = this.ensureCaretSelection();
    const chip = this.createChipElement(item, index);
    const frag = document.createDocumentFragment();
    frag.appendChild(chip);
    frag.appendChild(document.createTextNode('\u00A0'));

    if (selection && selection.rangeCount && this.editorEl.contains(selection.anchorNode)) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(frag);
      const space = chip.nextSibling;
      if (space) {
        const caret = document.createRange();
        caret.setStartAfter(space);
        caret.collapse(true);
        selection.removeAllRanges();
        selection.addRange(caret);
        this.savedRange = caret.cloneRange();
      }
    } else {
      this.editorEl.appendChild(frag);
      this.captureSelection();
    }
    this.updatePlaceholder();
  }

  moveChipToCaret(index) {
    if (!this.editorEl) return false;
    const chip = this.editorEl.querySelector(`.chip[data-index="${index}"]`);
    if (!chip) return false;
    const selection = this.ensureCaretSelection();
    const trailing = chip.nextSibling;
    chip.remove();
    if (trailing && trailing.nodeType === Node.TEXT_NODE && /^\u00A0?$/.test(trailing.textContent || '')) {
      trailing.remove();
    }

    const frag = document.createDocumentFragment();
    frag.appendChild(chip);
    frag.appendChild(document.createTextNode('\u00A0'));

    if (selection && selection.rangeCount && this.editorEl.contains(selection.anchorNode)) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(frag);
      const space = chip.nextSibling;
      if (space) {
        const caret = document.createRange();
        caret.setStartAfter(space);
        caret.collapse(true);
        selection.removeAllRanges();
        selection.addRange(caret);
        this.savedRange = caret.cloneRange();
      }
    } else {
      this.editorEl.appendChild(frag);
      this.captureSelection();
    }
    this.updatePlaceholder();
    return true;
  }

  ensureCaretSelection() {
    if (!this.editorEl) return null;
    if (!this.restoreSelection()) {
      this.focusComposer();
    }
    const selection = this.getSelection();
    if (!selection || !selection.rangeCount || !this.editorEl.contains(selection.anchorNode)) {
      try {
        const range = document.createRange();
        range.selectNodeContents(this.editorEl);
        range.collapse(false);
        const sel = this.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
          this.savedRange = range.cloneRange();
          return sel;
        }
      } catch (_) {
        return selection;
      }
    }
    return selection;
  }

  getSelection() {
    if (this.shadow && typeof this.shadow.getSelection === 'function') {
      const sel = this.shadow.getSelection();
      if (sel) return sel;
    }
    return window.getSelection();
  }

  captureSelection() {
    if (!this.editorEl) return;
    const sel = this.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (!this.editorEl.contains(range.startContainer) || !this.editorEl.contains(range.endContainer)) return;
    this.savedRange = range.cloneRange();
  }

  restoreSelection() {
    if (!this.editorEl || !this.savedRange) return false;
    try {
      const sel = this.getSelection();
      if (!sel) return false;
      sel.removeAllRanges();
      sel.addRange(this.savedRange);
      return true;
    } catch (_) {
      this.savedRange = null;
      return false;
    }
  }

  removeChipForElement(index) {
    if (!this.editorEl) return;
    const chip = this.editorEl.querySelector(`.chip[data-index="${index}"]`);
    if (!chip) return;
    const space = chip.nextSibling;
    chip.remove();
    if (space && space.nodeType === Node.TEXT_NODE && /^\u00A0?$/.test(space.textContent || '')) {
      space.remove();
    }
    this.updateChipIndices(index);
    this.updatePlaceholder();
    this.updateSendState();
  }

  clearChips() {
    if (!this.editorEl) return;
    this.getChipNodes().forEach((chip) => {
      const next = chip.nextSibling;
      chip.remove();
      if (next && next.nodeType === Node.TEXT_NODE && /^\u00A0?$/.test(next.textContent || '')) {
        next.remove();
      }
    });
    this.updatePlaceholder();
    this.updateSendState();
  }

  syncChips(elements) {
    if (!this.editorEl) return;
    const chips = this.getChipNodes();
    // 1) Remove chips whose index is out of range or duplicates for same index
    const seen = new Set();
    chips.forEach((chip) => {
      // Skip screenshot chips (they have data-shot-id instead of data-index)
      if (chip.dataset.shotId !== undefined) return;

      const idx = Number(chip.dataset.index || '-1');
      const invalid = !(idx >= 0 && idx < elements.length);
      const duplicate = seen.has(idx);
      if (invalid || duplicate) {
        const next = chip.nextSibling;
        chip.remove();
        if (next && next.nodeType === Node.TEXT_NODE && /^\u00A0?$/.test(next.textContent || '')) next.remove();
      } else {
        seen.add(idx);
      }
    });
    // 2) Add chips for any missing indices
    for (let i = 0; i < elements.length; i += 1) {
      if (!this.editorEl.querySelector(`.chip[data-index="${i}"]`)) {
        this.appendChip(elements[i], i);
      }
    }
    // 3) Decorate all according to current state
    const updated = this.getChipNodes();
    updated.forEach((chip) => {
      // Skip screenshot chips
      if (chip.dataset.shotId !== undefined) return;

      const idx = Number(chip.dataset.index || '-1');
      const item = elements[idx];
      if (item) this.decorateChip(chip, item, idx);
    });
  }

  createChipElement(item, index) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.dataset.index = String(index);
    chip.contentEditable = 'false';

    const labelBtn = document.createElement('button');
    labelBtn.type = 'button';
    labelBtn.className = 'chip-label';
    labelBtn.addEventListener('click', () => {
      const current = Number(chip.dataset.index || index);
      this.eventBus.emit('context-tag:element-clicked', current);
      this.eventBus.emit('edit:open', { index: current });
    });

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'x';
    close.textContent = '×';
    close.title = 'Remove';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      const current = Number(chip.dataset.index || index);
      this.removeElementAt(current);
    });

    chip.appendChild(labelBtn);
    chip.appendChild(close);
    this.decorateChip(chip, item, index);
    return chip;
  }

  createScreenshotChip(shot) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.dataset.shotId = String(shot?.id || Date.now());
    chip.contentEditable = 'false';

    const labelBtn = document.createElement('button');
    labelBtn.type = 'button';
    labelBtn.className = 'chip-label';
    // Provide distinct label like "@shot 1 (WxH)"
    try {
      const shots = this.stateManager.get('selection.screenshots') || [];
      const idx = Math.max(0, shots.findIndex(s => s && s.id === shot.id));
      const n = idx + 1;
      const w = Math.round(shot?.bbox?.width || 0);
      const h = Math.round(shot?.bbox?.height || 0);
      labelBtn.textContent = (w && h) ? `@shot ${n} (${w}×${h})` : `@shot ${n}`;
    } catch (_) {
      labelBtn.textContent = '@shot';
    }
    labelBtn.title = 'Screenshot preview';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'x';
    close.textContent = '×';
    close.title = 'Remove Screenshot';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      const idRaw = chip.dataset.shotId;
      const id = isNaN(Number(idRaw)) ? idRaw : Number(idRaw);
      try {
        this.eventBus.emit('screenshot:remove', id);
      } catch (err) {
        console.error('[LUMI] Error emitting screenshot:remove', err);
      }
    });

    chip.appendChild(labelBtn);
    chip.appendChild(close);
    // Hover preview and click-to-open
    chip.addEventListener('mouseenter', () => this.showShotPreview(shot, chip));
    chip.addEventListener('mouseleave', () => this.hideShotPreview());
    labelBtn.addEventListener('click', (e) => { e.stopPropagation(); this.openShotLightbox(shot); });
    return chip;
  }

  appendChip(item, index) {
    if (!this.editorEl) return;
    const chip = this.createChipElement(item, index);
    this.editorEl.appendChild(chip);
    this.editorEl.appendChild(document.createTextNode('\u00A0'));
  }

  renderScreenshotChips() {
    if (!this.editorEl) return;
    // Remove existing screenshot chips
    const existing = this.editorEl.querySelectorAll('.chip[data-shot-id]');
    existing.forEach(n => n.remove());

    const shots = this.stateManager.get('selection.screenshots') || [];
    shots.forEach((shot) => {
      const chip = this.createScreenshotChip(shot);
      this.editorEl.appendChild(chip);
      this.editorEl.appendChild(document.createTextNode('\u00A0'));
    });
  }

  getChipNodes() {
    if (!this.editorEl) return [];
    return Array.from(this.editorEl.querySelectorAll('.chip'));
  }

  // If user manually deletes chips in the editor (e.g., Backspace), reconcile selection accordingly
  reconcileSelectionWithChips() {
    try {
      const chips = this.getChipNodes();
      const presentElements = new Set();
      const presentShotIds = new Set();
      chips.forEach((chip) => {
        if (!chip || !chip.dataset) return;
        if (chip.dataset.index !== undefined) {
          const idx = Number(chip.dataset.index || '-1');
          if (idx >= 0) presentElements.add(idx);
          return;
        }
        if (chip.dataset.shotId !== undefined) {
          presentShotIds.add(String(chip.dataset.shotId));
        }
      });

      const elements = this.stateManager.get('selection.elements') || [];
      if (elements.length) {
        const toRemove = [];
        for (let i = 0; i < elements.length; i += 1) {
          if (!presentElements.has(i)) toRemove.push(i);
        }
        if (toRemove.length) {
          toRemove.sort((a, b) => b - a).forEach((idx) => this.eventBus.emit('element:removed', idx));
        }
      }

      const screenshots = this.stateManager.get('selection.screenshots') || [];
      if (screenshots.length) {
        const staleShots = [];
        screenshots.forEach((shot) => {
          if (!shot || shot.id === undefined) return;
          if (!presentShotIds.has(String(shot.id))) {
            staleShots.push(shot.id);
          }
        });
        if (staleShots.length) {
          staleShots.forEach((id) => this.eventBus.emit('screenshot:remove', id));
        }
      }
    } catch (_) { }
  }

  decorateChip(chip, item, index) {
    if (!chip || !item) return;
    chip.dataset.index = String(index);
    chip.classList.toggle('edited', !!item.edited);
    chip.title = item.diffSummary || '';
    const labelBtn = chip.querySelector('.chip-label') || chip.querySelector('button');
    if (labelBtn) {
      const label = item.element ? readableElementName(item.element) : 'element';
      labelBtn.textContent = '@' + label;
    }
  }

  updateChipIndices(startIndex = 0) {
    const chips = this.getChipNodes();
    for (let i = startIndex; i < chips.length; i += 1) {
      chips[i].dataset.index = String(i);
    }
  }

  updatePlaceholder() {
    if (!this.editorEl) return;
    const hasContent = this.editorEl.textContent.trim().length > 0 || this.getChipNodes().length > 0;
    this.editorEl.classList.toggle('has-content', hasContent);
  }

  // Screenshot preview helpers
  ensureShotPreviewContainers() {
    if (!this.shadow) return;
    const dock = this.shadow.getElementById('dock');
    if (!dock) return;
    if (!this.shotTooltip) {
      const tip = document.createElement('div');
      tip.id = 'shot-tooltip';
      tip.style.cssText = 'position:absolute; display:none; z-index:10000; padding:6px; border:1px solid var(--border); background: var(--surface); box-shadow: var(--shadow-lg); border-radius: 10px;';
      const img = document.createElement('img');
      img.style.cssText = 'display:block; max-width:200px; max-height:140px; border-radius:6px;';
      tip.appendChild(img);
      dock.appendChild(tip);
      this.shotTooltip = tip;
      this.shotTooltipImg = img;
    }
    if (!this.shotLightbox) {
      const overlay = document.createElement('div');
      overlay.id = 'shot-lightbox';
      overlay.style.cssText = 'position:absolute; inset:0; z-index:10000; display:none; background: color-mix(in srgb, var(--dock-fg) 20%, transparent); align-items:center; justify-content:center;';
      const box = document.createElement('div');
      box.style.cssText = 'position:relative; max-width: calc(100% - 32px); max-height: calc(100% - 32px); padding:12px; background: var(--surface); border:1px solid var(--border); border-radius:12px; box-shadow: var(--shadow-lg); display:flex; align-items:center; justify-content:center;';
      const img = document.createElement('img');
      img.style.cssText = 'max-width:100%; max-height:80vh; display:block; border-radius:8px;';
      const close = document.createElement('button');
      close.textContent = '×';
      close.title = 'Close';
      close.style.cssText = 'position:absolute; top:8px; right:8px; width:28px; height:28px; border-radius:14px; border:1px solid var(--border); background: var(--surface); color: var(--text-secondary); cursor:pointer;';
      close.addEventListener('click', () => this.hideShotLightbox());
      box.appendChild(close);
      box.appendChild(img);
      overlay.appendChild(box);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) this.hideShotLightbox(); });
      dock.appendChild(overlay);
      this.shotLightbox = overlay;
      this.shotLightboxImg = img;
    }
  }

  showShotPreview(shot, anchorEl) {
    try { this.ensureShotPreviewContainers(); } catch (_) { }
    if (!this.shotTooltip || !this.shotTooltipImg) return;
    this.shotTooltipImg.src = shot.dataUrl;
    const chipRect = anchorEl.getBoundingClientRect();
    const dock = this.shadow.getElementById('dock');
    const dockRect = dock ? dock.getBoundingClientRect() : { top: 0, left: 0, width: window.innerWidth };
    const top = Math.max(8, chipRect.top - dockRect.top - 8 - 140);
    const left = Math.min(dockRect.width - 220, Math.max(8, chipRect.left - dockRect.left));
    this.shotTooltip.style.top = `${top}px`;
    this.shotTooltip.style.left = `${left}px`;
    this.shotTooltip.style.display = 'block';
  }

  hideShotPreview() {
    if (this.shotTooltip) this.shotTooltip.style.display = 'none';
  }

  openShotLightbox(shot) {
    try { this.ensureShotPreviewContainers(); } catch (_) { }
    if (!this.shotLightbox || !this.shotLightboxImg) return;
    this.shotLightboxImg.src = shot.dataUrl;
    this.shotLightbox.style.display = 'flex';
  }

  hideShotLightbox() {
    if (this.shotLightbox) this.shotLightbox.style.display = 'none';
  }

  sanitizeEditor() {
    if (!this.editorEl) return;
    const nodes = Array.from(this.editorEl.childNodes);
    nodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'DIV') {
        const text = document.createTextNode(node.textContent || '');
        this.editorEl.replaceChild(text, node);
      }
    });
    this.updatePlaceholder();
  }

  removeElementAt(index) {
    const list = (this.stateManager.get('selection.elements') || []).slice();
    if (index < 0 || index >= list.length) return;
    try { this.eventBus.emit('element:pre-remove', { index, snapshot: list[index] }); } catch (_) { }
    list.splice(index, 1);
    this.stateManager.set('selection.elements', list);
    this.eventBus.emit('element:removed', index);
  }

  timeAgo(ts) {
    if (!ts) return 'Just now';
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 60) return m <= 1 ? 'Just now' : `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(ts).toLocaleDateString();
  }
}
