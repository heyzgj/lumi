import { TOKENS_CSS } from '../../../shared/tokens.js';

const STYLES = `
${TOKENS_CSS}

:host {
  position: fixed;
  z-index: 2147483647;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-sans);
  pointer-events: none; /* Let clicks pass through container */
  transition: transform 0.2s ease-out, opacity 0.2s ease-out;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px;
  background: rgba(22, 22, 24, 0.9); /* Dark glass */
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  box-shadow: 
    0 4px 20px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(0, 0, 0, 0.4);
  pointer-events: auto; /* Re-enable clicks on toolbar */
  animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slideUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.group {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 4px;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
}

.group:last-child {
  border-right: none;
}

.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.btn.active {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.btn svg {
  width: 18px;
  height: 18px;
}

/* Color picker dots */
.color-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
  margin: 0 2px;
  transition: transform 0.15s;
}

.color-btn:hover {
  transform: scale(1.1);
}

.color-btn.active {
  border-color: #fff;
  transform: scale(1.1);
}

.divider {
  width: 1px;
  height: 20px;
  background: rgba(255, 255, 255, 0.15);
  margin: 0 4px;
}

.action-btn {
  padding: 0 12px;
  height: 32px;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 500;
  width: auto;
  gap: 6px;
}

.action-btn.primary {
  background: #fff;
  color: #000;
}

.action-btn.primary:hover {
  background: #f0f0f0;
}

.action-btn.danger:hover {
  background: rgba(255, 59, 48, 0.2);
  color: #ff3b30;
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
        
        <div class="divider"></div>
        
        <div class="group">
          ${this.colors.map(c => `
            <button class="color-btn ${c === this.activeColor ? 'active' : ''}" 
                    data-color="${c}" 
                    style="background-color: ${c}">
            </button>
          `).join('')}
        </div>

        <div class="divider"></div>

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

        <div class="divider"></div>

        <div class="group">
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
}
