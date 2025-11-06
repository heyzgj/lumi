/**
 * ControlsOverlay - On-canvas handles for padding and radius adjustments
 */

const HANDLE_SIZE = 12;

export default class ControlsOverlay {
  constructor(eventBus, stateManager) {
    this.eventBus = eventBus;
    this.stateManager = stateManager;

    this.overlay = null;
    this.targetElement = null;
    this.targetIndex = null;

    this.dragState = null;

    this.boundUpdate = this.updatePosition.bind(this);
  }

  mount() {
    if (this.overlay) return;

    const overlay = document.createElement('div');
    overlay.id = 'lumi-controls-overlay';
    overlay.style.cssText = `
      position: absolute;
      z-index: 2147483646;
      display: none;
      pointer-events: none;
    `;

    const box = document.createElement('div');
    box.className = 'lumi-overlay-box';
    box.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      border: 2px solid color-mix(in srgb, var(--accent) 65%, transparent);
      border-radius: 4px;
      background: color-mix(in srgb, var(--accent) 8%, transparent);
      pointer-events: none;
    `;
    overlay.appendChild(box);

    const handles = [
      { type: 'padding', side: 'top' },
      { type: 'padding', side: 'right' },
      { type: 'padding', side: 'bottom' },
      { type: 'padding', side: 'left' },
      { type: 'corner', corner: 'top-left' },
      { type: 'corner', corner: 'top-right' },
      { type: 'corner', corner: 'bottom-right' },
      { type: 'corner', corner: 'bottom-left' }
    ];

    handles.forEach(cfg => {
      const handle = document.createElement('div');
      handle.className = 'lumi-overlay-handle';
      handle.dataset.type = cfg.type;
      if (cfg.side) handle.dataset.side = cfg.side;
      if (cfg.corner) handle.dataset.corner = cfg.corner;
      handle.style.cssText = this.getHandleStyle(cfg);
      overlay.appendChild(handle);
    });

    document.body.appendChild(overlay);
    this.overlay = overlay;

    this.attachHandleListeners();

    window.addEventListener('scroll', this.boundUpdate, true);
    window.addEventListener('resize', this.boundUpdate, true);

    this.eventBus.on('overlay:update-position', (payload = {}) => {
      if (payload.index !== undefined && payload.index !== this.targetIndex) return;
      this.updatePosition();
    });
  }

  show(element, index) {
    if (!this.overlay || !element) return;
    this.targetElement = element;
    this.targetIndex = index;
    this.updatePosition();
    this.overlay.style.display = 'block';
  }

  hide() {
    if (!this.overlay) return;
    this.overlay.style.display = 'none';
    this.targetElement = null;
    this.targetIndex = null;
    this.stopDrag();
  }

  updatePosition() {
    if (!this.overlay || !this.targetElement) return;
    const rect = this.targetElement.getBoundingClientRect();
    this.overlay.style.top = `${rect.top + window.scrollY}px`;
    this.overlay.style.left = `${rect.left + window.scrollX}px`;
    this.overlay.style.width = `${rect.width}px`;
    this.overlay.style.height = `${rect.height}px`;
  }

  attachHandleListeners() {
    if (!this.overlay) return;
    this.overlay.querySelectorAll('.lumi-overlay-handle').forEach(handle => {
      handle.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        this.startDrag(event, handle.dataset, handle);
      });
    });
  }

  startDrag(event, dataset, handleEl) {
    if (!this.targetElement) return;

    const pointerId = event.pointerId;
    const rect = this.targetElement.getBoundingClientRect();
    const computed = window.getComputedStyle(this.targetElement);

    this.dragState = {
      pointerId,
      handleEl,
      type: dataset.type,
      side: dataset.side,
      corner: dataset.corner,
      startX: event.clientX,
      startY: event.clientY,
      rect,
      basePadding: {
        top: parseFloat(computed.paddingTop) || 0,
        right: parseFloat(computed.paddingRight) || 0,
        bottom: parseFloat(computed.paddingBottom) || 0,
        left: parseFloat(computed.paddingLeft) || 0
      },
      baseRadius: parseFloat(computed.borderTopLeftRadius) || 0
    };

    handleEl.setPointerCapture(pointerId);
    handleEl.addEventListener('pointermove', this.handlePointerMove);
    handleEl.addEventListener('pointerup', this.handlePointerUp, { once: true });
    handleEl.addEventListener('pointercancel', this.handlePointerUp, { once: true });
    document.documentElement.classList.add('lumi-overlay-dragging');
    document.body.classList.add('lumi-overlay-dragging');
  }

  stopDrag() {
    if (!this.dragState) return;
    try {
      this.dragState.handleEl.releasePointerCapture(this.dragState.pointerId);
    } catch (_) {}
    this.dragState.handleEl.removeEventListener('pointermove', this.handlePointerMove);
    this.dragState = null;
    document.documentElement.classList.remove('lumi-overlay-dragging');
    document.body.classList.remove('lumi-overlay-dragging');
  }

  handlePointerMove = (event) => {
    if (!this.dragState || !this.targetElement) return;
    if (event.pointerId !== this.dragState.pointerId) return;

    const dx = event.clientX - this.dragState.startX;
    const dy = event.clientY - this.dragState.startY;

    const modifier = event.shiftKey ? 10 : event.altKey ? 0.1 : 1;

    if (this.dragState.type === 'padding') {
      const side = this.dragState.side;
      const base = this.dragState.basePadding[side];
      let delta = 0;
      if (side === 'top') delta = -dy;
      if (side === 'bottom') delta = dy;
      if (side === 'left') delta = -dx;
      if (side === 'right') delta = dx;
      const value = Math.max(0, Math.round(base + delta * modifier));
      const property = `padding${capitalize(side)}`;
      this.eventBus.emit('overlay:change', {
        index: this.targetIndex,
        property,
        value: `${value}px`
      });
      requestAnimationFrame(() => this.updatePosition());
      return;
    }

    if (this.dragState.type === 'corner') {
      const base = this.dragState.baseRadius;
      const delta = (Math.abs(dx) + Math.abs(dy)) / 2;
      const value = Math.max(0, Math.round(base + delta * modifier));
      this.eventBus.emit('overlay:change', {
        index: this.targetIndex,
        property: 'borderRadius',
        value: `${value}px`
      });
      requestAnimationFrame(() => this.updatePosition());
    }
  };

  handlePointerUp = (event) => {
    if (!this.dragState || event.pointerId !== this.dragState.pointerId) return;
    this.stopDrag();
  };

  getHandleStyle(cfg) {
    const base = `
      position: absolute;
      width: ${HANDLE_SIZE}px;
      height: ${HANDLE_SIZE}px;
      background: var(--dock-fg);
      border: 2px solid color-mix(in srgb, var(--accent) 80%, transparent);
      border-radius: 50%;
      pointer-events: auto;
      cursor: pointer;
      box-shadow: var(--shadow);
      touch-action: none;
      user-select: none;
    `;

    if (cfg.type === 'padding') {
      if (cfg.side === 'top') return base + `top: -${HANDLE_SIZE / 2}px; left: 50%; transform: translate(-50%, -50%); cursor: ns-resize;`;
      if (cfg.side === 'bottom') return base + `bottom: -${HANDLE_SIZE / 2}px; left: 50%; transform: translate(-50%, 50%); cursor: ns-resize;`;
      if (cfg.side === 'left') return base + `left: -${HANDLE_SIZE / 2}px; top: 50%; transform: translate(-50%, -50%); cursor: ew-resize;`;
      if (cfg.side === 'right') return base + `right: -${HANDLE_SIZE / 2}px; top: 50%; transform: translate(50%, -50%); cursor: ew-resize;`;
    }

    if (cfg.type === 'corner') {
      const cursor = cfg.corner.includes('top') ? (cfg.corner.includes('left') ? 'nwse-resize' : 'nesw-resize') : (cfg.corner.includes('left') ? 'nesw-resize' : 'nwse-resize');
      if (cfg.corner === 'top-left') return base + `top: -${HANDLE_SIZE / 2}px; left: -${HANDLE_SIZE / 2}px; cursor: ${cursor};`;
      if (cfg.corner === 'top-right') return base + `top: -${HANDLE_SIZE / 2}px; right: -${HANDLE_SIZE / 2}px; cursor: ${cursor};`;
      if (cfg.corner === 'bottom-right') return base + `bottom: -${HANDLE_SIZE / 2}px; right: -${HANDLE_SIZE / 2}px; cursor: ${cursor};`;
      if (cfg.corner === 'bottom-left') return base + `bottom: -${HANDLE_SIZE / 2}px; left: -${HANDLE_SIZE / 2}px; cursor: ${cursor};`;
    }

    return base;
  }
}

function capitalize(value = '') {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}
