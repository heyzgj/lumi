import { TOKENS_CSS } from '../../../shared/tokens.js';

const STYLES = `
${TOKENS_CSS}

:host {
  position: fixed;
  z-index: 2147483647;
  bottom: 48px;
  left: 50%;
  transform: translateX(-50%);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  pointer-events: none;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease-out;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  /* Glassmorphism */
  background: color-mix(in srgb, var(--dock-bg) 85%, transparent);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--dock-stroke);
  border-radius: 999px;
  /* Floating shadow */
  box-shadow: 
    0 8px 32px -4px rgba(0, 0, 0, 0.12),
    0 0 0 1px var(--dock-stroke);
  color: var(--dock-fg);
  pointer-events: auto;
  animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slideUp {
  from { transform: translateY(40px) scale(0.95); opacity: 0; }
  to { transform: translateY(0) scale(1); opacity: 1; }
}

.group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  color: var(--dock-fg-2);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.btn:hover {
  background: var(--dock-stroke);
  color: var(--dock-fg);
  transform: translateY(-2px);
}

.btn:active {
  transform: scale(0.92);
}

.btn.active {
  background: var(--accent);
  color: var(--on-accent);
  box-shadow: 0 4px 12px -2px var(--accent);
}

.btn svg {
  width: 20px;
  height: 20px;
}

/* Color picker dots */
.color-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
  margin: 0 4px;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.color-btn:hover {
  transform: scale(1.2);
}

.color-btn.active {
  border-color: var(--dock-fg);
  transform: scale(1.2);
  box-shadow: 0 0 0 2px var(--dock-bg), 0 0 0 4px var(--dock-fg);
}

.action-btn {
  padding: 0 16px;
  height: 36px;
  border-radius: 99px;
  font-size: 14px;
  font-weight: 600;
  width: auto;
  gap: 8px;
}

.action-btn.primary {
  background: var(--dock-fg);
  color: var(--dock-bg);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.action-btn.primary:hover {
  opacity: 0.9;
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0,0,0,0.2);
}

.action-btn.danger {
  color: var(--error);
}

.action-btn.danger:hover {
  background: color-mix(in srgb, var(--error) 10%, transparent);
  transform: translateY(-2px);
}
`;

export default class AnnotateToolbar {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.host = null;
    this.shadow = null;
    this.activeTool = 'select';
    this.activeColor = '#ef4444'; // default red

    this.tools = [
      { id: 'select', icon: '<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>' },
      { id: 'rect', icon: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>' },
      { id: 'arrow', icon: '<path d="M5 12h14M12 5l7 7-7 7"/>' },
      { id: 'text', icon: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>' },
      { id: 'pen', icon: '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>' }
    ];

    this.colors = [
      '#ef4444', // red
      '#eab308', // yellow
      '#22c55e', // green
      '#3b82f6', // blue
      '#a855f7', // purple
      '#ffffff'  // white
    ];
  }

  mount() {
    if (this.host) return;
    this.host = document.createElement('div');
    this.host.id = 'lumi-annotate-toolbar';
    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.shadow.innerHTML = this.render();
    document.body.appendChild(this.host);
    this.bindEvents();
  }

  unmount() {
    if (this.host) {
      this.host.remove();
      this.host = null;
    }
  }

  render() {
    return `
      <style>${STYLES}</style>
      <div class="toolbar">
        <div class="group">
          ${this.tools.map(t => `
            <button class="btn ${t.id === this.activeTool ? 'active' : ''}" 
                    data-tool="${t.id}" 
                    title="${t.id.charAt(0).toUpperCase() + t.id.slice(1)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                ${t.icon}
              </svg>
            </button>
          `).join('')}
        </div>
        
        <div class="group">
          ${this.colors.map(c => `
            <button class="color-btn ${c === this.activeColor ? 'active' : ''}" 
                    data-color="${c}" 
                    style="background-color: ${c}">
            </button>
          `).join('')}
        </div>

        <div class="group">
          <button class="btn" id="undo-btn" title="Undo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/>
            </svg>
          </button>
          <button class="btn" id="reset-btn" title="Clear All">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
            </svg>
          </button>
        </div>

        <div class="group">
          <button class="btn" id="copy-btn" title="Copy to Clipboard">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
          <button class="btn" id="download-btn" title="Download Image">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
        </div>

        <div class="group" style="margin-left: 8px;">
          <button class="btn action-btn danger" id="cancel-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          <button class="btn action-btn primary" id="done-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Add to Chat</span>
          </button>
        </div>
      </div>
    `;
  }

  bindEvents() {
    const root = this.shadow;

    // Tools
    root.querySelectorAll('[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        this.setActiveTool(tool);
        this.eventBus.emit('annotate:tool', tool);
      });
    });

    // Colors
    root.querySelectorAll('[data-color]').forEach(btn => {
      btn.addEventListener('click', () => {
        const color = btn.dataset.color;
        this.setActiveColor(color);
        this.eventBus.emit('annotate:color', color);
      });
    });

    // Actions
    root.getElementById('undo-btn').addEventListener('click', () => this.eventBus.emit('annotate:undo'));
    root.getElementById('reset-btn').addEventListener('click', () => this.eventBus.emit('annotate:reset'));
    root.getElementById('copy-btn').addEventListener('click', () => this.eventBus.emit('annotate:copy'));
    root.getElementById('download-btn').addEventListener('click', () => this.eventBus.emit('annotate:download'));
    root.getElementById('cancel-btn').addEventListener('click', () => this.eventBus.emit('annotate:cancel'));
    root.getElementById('done-btn').addEventListener('click', () => this.eventBus.emit('annotate:submit'));
  }

  setActiveTool(tool) {
    this.activeTool = tool;
    this.shadow.querySelectorAll('[data-tool]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });
  }

  setActiveColor(color) {
    this.activeColor = color;
    this.shadow.querySelectorAll('[data-color]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.color === color);
    });
  }

  setTheme(mode) {
    if (this.host) {
      if (mode === 'dark') {
        this.host.classList.add('dark-dock');
      } else {
        this.host.classList.remove('dark-dock');
      }
    }
  }
}
