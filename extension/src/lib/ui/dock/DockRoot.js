import { DOCK_STYLES } from './styles.js';
import { applyDockThemeAuto } from './theme.js';
import { readableElementName } from '../../utils/dom.js';
import { escapeHtml } from './utils.js';

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
  }

  mount() {
    if (this.host) return;
    this.host = document.createElement('div');
    this.host.id = 'lumi-dock-root';
    this.host.style.cssText = 'position: fixed; top: 0; right: 0; height: 100vh; width: 420px; z-index: 2147483646; display: none;';
    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.shadow.innerHTML = this.renderHTML();
    document.body.appendChild(this.host);
    
    // Apply squeeze mode to document.documentElement
    this.applySqueeze(false);
    
    this.createHandle();
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
            <button class="header-btn header-toggle" id="dock-toggle" title="Collapse Dock" aria-label="Collapse Dock">
              <svg id="icon-collapse" viewBox="0 0 24 24" aria-hidden="true" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="14" height="16" rx="2"></rect>
                <path d="M19 4v16"></path>
                <path d="M12 12l-3-3m3 3l-3 3"></path>
              </svg>
              <svg id="icon-expand" style="display:none" viewBox="0 0 24 24" aria-hidden="true" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="7" y="4" width="14" height="16" rx="2"></rect>
                <path d="M5 4v16"></path>
                <path d="M12 12l3-3m-3 3l3 3"></path>
              </svg>
            </button>
            <button class="header-btn header-settings" id="gear" title="Open Settings" aria-label="Open Settings">
              <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3.5"></circle>
                <path d="M4.8 9.5l-1.5 2.6a1 1 0 0 0 .4 1.4l1.6.9a8 8 0 0 0 0 1.2l-1.6.9a1 1 0 0 0-.4 1.4l1.5 2.6a1 1 0 0 0 1.3.4l1.6-.9c.4.3.8.6 1.2.8l.1 1.8a1 1 0 0 0 1 .9h3a1 1 0 0 0 1-.9l.1-1.8c.4-.2.8-.5 1.2-.8l1.6.9a1 1 0 0 0 1.3-.4l1.5-2.6a1 1 0 0 0-.4-1.4l-1.6-.9c.1-.4.1-.8 0-1.2l1.6-.9a1 1 0 0 0 .4-1.4l-1.5-2.6a1 1 0 0 0-1.3-.4l-1.6.9c-.4-.3-.8-.6-1.2-.8L13 4.1a1 1 0 0 0-1-.9h-3a1 1 0 0 0-1 .9l-.1 1.8c-.4.2-.8.5-1.2.8l-1.6-.9a1 1 0 0 0-1.3.4z"></path>
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
    this.inputEl = this.editorEl;
    this.sendBtn = this.shadow.getElementById('send-btn');
    this.engineSelect = this.shadow.getElementById('engine-select');
    this.engineShell = this.shadow.getElementById('engine');
    this.projectLabel = this.shadow.getElementById('project-name');
    this.toggleCollapse = this.shadow.getElementById('icon-collapse');
    this.toggleExpand = this.shadow.getElementById('icon-expand');

    const settingsBtn = this.shadow.getElementById('gear');
    this.toggleBtn = this.shadow.getElementById('dock-toggle');
    settingsBtn.addEventListener('click', () => this.eventBus.emit('settings:open'));
    this.toggleBtn.addEventListener('click', () => {
      const state = this.stateManager.get('ui.dockState');
      const next = state === 'compact' ? 'normal' : 'compact';
      this.stateManager.set('ui.dockState', next);
    });

    const closeBtn = this.shadow.getElementById('dock-close');
    closeBtn.addEventListener('click', () => {
      this.stateManager.set('ui.dockOpen', false);
      this.setVisible(false);
    });

    this.tabsEl.addEventListener('click', (e) => {
      const tab = e.target.closest('.tab');
      if (!tab) return;
      this.setTab(tab.dataset.tab);
    });

    this.shadow.getElementById('select-btn').addEventListener('click', () => this.eventBus.emit('mode:toggle-element'));
    this.shadow.getElementById('shot-btn').addEventListener('click', () => this.eventBus.emit('mode:toggle-screenshot'));
    this.shadow.getElementById('new-session-btn').addEventListener('click', () => this.eventBus.emit('session:create'));

    this.engineSelect.addEventListener('change', () => {
      const value = this.engineSelect.value === 'claude' ? 'claude' : 'codex';
      this.eventBus.emit('engine:select', value);
    });

    this.editorEl.addEventListener('input', () => {
      this.updatePlaceholder();
      this.eventBus.emit('input:changed');
      this.updateSendState();
      this.captureSelection();
    });
    this.editorEl.addEventListener('keydown', (e) => {
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
    });

    this.sendBtn.addEventListener('click', () => this.eventBus.emit('submit:requested'));

    this.historyPane.addEventListener('click', (event) => this.handleHistoryClick(event));

    // State subscriptions
    this.stateManager.subscribe('engine.current', (engine) => this.updateEngine(engine));
    this.stateManager.subscribe('engine.available', () => this.updateEngineAvailability());
    this.stateManager.subscribe('selection.elements', (elements) => this.renderChips(elements || []));
    this.stateManager.subscribe('sessions.list', () => this.renderBody());
    this.stateManager.subscribe('sessions.currentId', () => this.renderBody());
    this.stateManager.subscribe('ui.dockTab', (tab) => this.setTab(tab, true));
    this.stateManager.subscribe('ui.dockOpen', (open) => this.setVisible(open !== false));
    this.stateManager.subscribe('ui.dockState', (state) => this.updateDockState(state));
    this.stateManager.subscribe('processing.active', () => this.updateSendState());
    this.stateManager.subscribe('wysiwyg.hasDiffs', () => this.updateSendState());
    this.stateManager.subscribe('projects.allowed', () => this.updateSendState());
    this.stateManager.subscribe('projects.current', (project) => this.updateProjectName(project));

    this.updateEngine(this.stateManager.get('engine.current'));
    this.updateEngineAvailability();
    this.activeTab = this.stateManager.get('ui.dockTab') || 'chat';
    this.setTab(this.activeTab, true);
    this.setVisible(this.stateManager.get('ui.dockOpen') !== false);
    this.updateDockState(this.stateManager.get('ui.dockState') || 'normal');
    this.updateProjectName(this.stateManager.get('projects.current'));
    this.updatePlaceholder();
    this.applyTheme();

    // Live updates for session changes (ensure History/UI refresh immediately)
    this.stateManager.subscribe('sessions.list', () => {
      const tab = this.stateManager.get('ui.dockTab') || this.activeTab;
      if (tab === 'history') this.renderHistory(); else this.renderChat();
    });
    this.stateManager.subscribe('sessions.currentId', () => {
      const tab = this.stateManager.get('ui.dockTab') || this.activeTab;
      if (tab === 'history') this.renderHistory(); else this.renderChat();
    });
  }

  applyTheme() {
    try {
      applyDockThemeAuto();
      const dock = this.shadow.getElementById('dock');
      if (!dock) return;
      const isDark = document.documentElement.classList.contains('dark-dock');
      dock.classList.toggle('dark', isDark);
    } catch (_) {}
  }

  applySqueeze(isOpen) {
    const html = document.documentElement;
    const body = document.body;
    
    if (isOpen) {
      // Squeeze mode: reduce viewport width
      html.style.transition = 'margin-right 0.25s cubic-bezier(0.22, 1, 0.36, 1)';
      html.style.marginRight = '420px';
      html.style.overflow = 'hidden';
      body.style.overflow = 'auto';
    } else {
      // Normal: restore full width
      html.style.transition = 'margin-right 0.25s cubic-bezier(0.22, 1, 0.36, 1)';
      html.style.marginRight = '0';
      setTimeout(() => {
        html.style.overflow = '';
      }, 250);
    }
  }

  updateDockState(state) {
    const dock = this.shadow.getElementById('dock');
    if (!dock) return;
    dock.classList.toggle('compact', state === 'compact');
    
    const isCompact = state === 'compact';
    const dockWidth = isCompact ? '56px' : '420px';
    
    if (this.host) {
      this.host.style.pointerEvents = isCompact ? 'none' : 'auto';
      this.host.style.transition = 'width 0.2s cubic-bezier(0.22, 1, 0.36, 1)';
      this.host.style.width = dockWidth;
    }
    
    // Update squeeze based on compact state
    const isOpen = this.stateManager.get('ui.dockOpen') !== false;
    if (isOpen) {
      const html = document.documentElement;
      html.style.transition = 'margin-right 0.25s cubic-bezier(0.22, 1, 0.36, 1)';
      html.style.marginRight = isCompact ? '56px' : '420px';
    }
    
    // Hide toggle button when compact (use handle instead)
    if (this.toggleBtn) {
      this.toggleBtn.style.display = 'flex';
      const label = isCompact ? 'Expand Dock' : 'Collapse Dock';
      this.toggleBtn.title = label;
      this.toggleBtn.setAttribute('aria-label', label);
    }
    if (this.toggleCollapse && this.toggleExpand) {
      this.toggleCollapse.style.display = isCompact ? 'none' : 'block';
      this.toggleExpand.style.display = isCompact ? 'block' : 'none';
    }
    if (this.handle) {
      this.handle.style.display = isOpen && isCompact ? 'flex' : 'none';
      if (isCompact) {
        const currentTop = parseFloat(this.handle.style.top || `${window.innerHeight / 2 - 26}`);
        this.positionHandle(currentTop);
      }
    }
  }

  setVisible(isOpen) {
    if (!this.host) return;
    this.host.style.display = isOpen ? 'block' : 'none';
    
    // Apply or remove squeeze
    this.applySqueeze(isOpen);
    
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
    }
    this.renderBody();
  }

  renderBody() {
    const tab = this.stateManager.get('ui.dockTab') || this.activeTab;
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
      const item = document.createElement('div');
      item.className = 'chat-item assistant';
      const avatar = document.createElement('div');
      avatar.className = 'avatar';
      const body = document.createElement('div');
      body.className = 'bubble';
      const summary = document.createElement('div');
      summary.className = 'summary';
      summary.textContent = msg.summary || (msg.applied ? 'Applied ✓' : (msg.text || 'Response'));
      body.appendChild(summary);
      if (msg.details && msg.details.length) {
        const details = document.createElement('div');
        details.className = 'details';
        details.textContent = msg.details.join(' ; ');
        body.appendChild(details);
      }
      item.appendChild(avatar);
      item.appendChild(body);
      return item;
    }
    const item = document.createElement('div');
    item.className = 'chat-item user';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = msg.text;
    item.appendChild(bubble);
    return item;
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
          <div class="history-meta">${this.timeAgo(session.updatedAt || session.createdAt)} • ${session.msgCount || 0}<span class="status-dot ${session.lastAppliedOk ? 'ok' : ''}"></span></div>
        </div>
        <div class="history-actions">
          <button data-action="resume">Resume</button>
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
    if (action === 'resume') {
      this.eventBus.emit('session:resume', sessionId);
    } else if (action === 'rename') {
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
    if (project && typeof project === 'object') {
      const name = project.name || project.id || 'Linked Project';
      this.projectLabel.textContent = `Lumi — ${name}`;
    } else {
      this.projectLabel.textContent = 'Lumi — Unmapped Page';
    }
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
    this.sendBtn.textContent = isProcessing ? 'Sending...' : 'Send';
  }

  getPlainText() {
    if (!this.editorEl) return '';
    let text = '';
    this.editorEl.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || '';
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

  createHandle() {
    if (this.handle) return;
    const button = document.createElement('button');
    button.id = 'lumi-dock-handle';
    button.type = 'button';
    button.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14 5 8 12 14 19"></polyline><line x1="16" y1="5" x2="16" y2="19"></line></svg>';
    button.setAttribute('aria-label', 'Expand Dock');
    button.style.cssText = `
      position: fixed;
      top: calc(50% - 24px);
      right: 18px;
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
      cursor: grab;
      z-index: 2147483646;
      user-select: none;
      transition: all 0.2s ease;
    `;
    button.addEventListener('mouseenter', () => {
      button.style.transform = 'scale(1.05)';
      button.style.boxShadow = 'var(--shadow-lg)';
    });
    button.addEventListener('mouseleave', () => {
      if (!this.handleDragState?.active) {
        button.style.transform = 'scale(1)';
        button.style.boxShadow = 'var(--shadow)';
      }
    });
    button.addEventListener('click', () => {
      if (this.handleDragState?.active) return;
      this.stateManager.set('ui.dockState', 'normal');
    });
    document.body.appendChild(button);
    this.handle = button;
    this.positionHandle(window.innerHeight / 2 - 26);
    this.setupHandleDrag();
  }

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
    button.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"></path><path d="M9 7v10"></path><path d="M15 7v10"></path></svg>';
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

  setupHandleDrag() {
    if (!this.handle) return;
    this.handleDragState = { active: false, moved: false, offsetY: 0 };
    this.handle.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      this.handleDragState.active = true;
      this.handleDragState.moved = false;
      const rect = this.handle.getBoundingClientRect();
      this.handleDragState.offsetY = event.clientY - rect.top;
      event.preventDefault();
    });
    window.addEventListener('mousemove', (event) => {
      if (!this.handleDragState?.active) return;
      this.handleDragState.moved = true;
      this.positionHandle(event.clientY - this.handleDragState.offsetY);
    });
    window.addEventListener('mouseup', (event) => {
      if (!this.handleDragState?.active) return;
      const moved = this.handleDragState.moved;
      this.handleDragState.active = false;
      if (!moved) {
        this.stateManager.set('ui.dockState', 'normal');
      }
    });
  }

  positionHandle(top) {
    if (!this.handle) return;
    const min = 24;
    const max = window.innerHeight - 60;
    const clamped = Math.min(max, Math.max(min, top));
    this.handle.style.top = `${clamped}px`;
  }

  renderChips(elements) {
    this.syncChips(elements);
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
    if (chips.length > elements.length) {
      for (let i = chips.length - 1; i >= elements.length; i -= 1) {
        const chip = chips[i];
        const next = chip.nextSibling;
        chip.remove();
        if (next && next.nodeType === Node.TEXT_NODE && /^\u00A0?$/.test(next.textContent || '')) {
          next.remove();
        }
      }
    } else if (elements.length > chips.length) {
      for (let i = chips.length; i < elements.length; i += 1) {
        this.appendChip(elements[i], i);
      }
    }
    const updatedChips = this.getChipNodes();
    updatedChips.forEach((chip, idx) => {
      const item = elements[idx];
      if (!item) return;
      this.decorateChip(chip, item, idx);
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

  appendChip(item, index) {
    if (!this.editorEl) return;
    const chip = this.createChipElement(item, index);
    this.editorEl.appendChild(chip);
    this.editorEl.appendChild(document.createTextNode('\u00A0'));
  }

  getChipNodes() {
    if (!this.editorEl) return [];
    return Array.from(this.editorEl.querySelectorAll('.chip'));
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
