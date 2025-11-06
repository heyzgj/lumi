/**
 * HighlightManager - Manage hover/selection halos and screenshot overlays
 */

export default class HighlightManager {
  constructor(eventBus = null) {
    this.eventBus = eventBus;
    this.hoverHighlight = null;
    this.selectionHighlights = [];
    this.selectionElements = [];
    this.selectionListeners = new Map();
    this.screenshotOverlay = null;
  }

  showHover(element) {
    this.hideHover();
    const bbox = element.getBoundingClientRect();
    const halo = document.createElement('div');
    halo.className = 'lumi-highlight lumi-hover';
    halo.style.cssText = this.buildHaloStyle(bbox, element);
    // Hover halo must never intercept pointer events; clicks should go to the page element
    halo.style.pointerEvents = 'none';
    document.body.appendChild(halo);
    this.hoverHighlight = halo;
  }

  hideHover() {
    if (this.hoverHighlight) {
      this.hoverHighlight.remove();
      this.hoverHighlight = null;
    }
  }

  addSelection(element, index = null) {
    const bbox = element.getBoundingClientRect();
    const halo = document.createElement('div');
    halo.className = 'lumi-highlight lumi-selected';
    halo.style.cssText = this.buildHaloStyle(bbox, element);

    const resolveIndex = () => {
      const current = this.selectionElements.indexOf(element);
      if (current >= 0) return current;
      return typeof index === 'number' ? index : 0;
    };

    halo.addEventListener('mouseenter', () => {
      if (this.eventBus) {
        this.eventBus.emit('interaction:hover', { element, index: resolveIndex() });
      }
    });
    halo.addEventListener('mouseleave', () => {
      if (this.eventBus) {
        this.eventBus.emit('interaction:leave', { element, index: resolveIndex() });
      }
    });

    document.body.appendChild(halo);
    const nextIndex = this.selectionHighlights.push(halo) - 1;
    this.selectionElements.push(element);

    const onEnter = () => {
      if (this.eventBus) {
        this.eventBus.emit('interaction:hover', { element, index: resolveIndex() });
      }
    };
    const onLeave = () => {
      if (this.eventBus) {
        this.eventBus.emit('interaction:leave', { element, index: resolveIndex() });
      }
    };
    element.addEventListener('mouseenter', onEnter);
    element.addEventListener('mouseleave', onLeave);
    this.selectionListeners.set(element, { onEnter, onLeave });

    halo.dataset.index = String(nextIndex);
    return nextIndex;
  }

  removeSelection(index) {
    const highlight = this.selectionHighlights[index];
    if (highlight) {
      highlight.remove();
    }
    this.selectionHighlights.splice(index, 1);

    const element = this.selectionElements[index];
    if (element) {
      const handlers = this.selectionListeners.get(element);
      if (handlers) {
        element.removeEventListener('mouseenter', handlers.onEnter);
        element.removeEventListener('mouseleave', handlers.onLeave);
        this.selectionListeners.delete(element);
      }
    }
    this.selectionElements.splice(index, 1);

    this.selectionHighlights.forEach((halo, idx) => {
      halo.dataset.index = String(idx);
    });
  }

  clearAllSelections() {
    this.selectionHighlights.forEach(h => h.remove());
    this.selectionHighlights = [];
    this.selectionElements.forEach((element) => {
      const handlers = this.selectionListeners.get(element);
      if (handlers) {
        element.removeEventListener('mouseenter', handlers.onEnter);
        element.removeEventListener('mouseleave', handlers.onLeave);
      }
    });
    this.selectionElements = [];
    this.selectionListeners.clear();
  }

  showScreenshotOverlay(bbox) {
    this.hideScreenshotOverlay();
    const overlay = document.createElement('div');
    overlay.className = 'lumi-screenshot-overlay';
    overlay.style.cssText = `
      position: absolute;
      left: ${bbox.left}px;
      top: ${bbox.top}px;
      width: ${bbox.width}px;
      height: ${bbox.height}px;
      border: 2px dashed var(--accent);
      background: color-mix(in srgb, var(--accent) 14%, transparent);
      pointer-events: none;
      z-index: 2147483645;
    `;
    document.body.appendChild(overlay);
    this.screenshotOverlay = overlay;
  }

  updateScreenshotOverlay(bbox) {
    if (!this.screenshotOverlay) {
      this.showScreenshotOverlay(bbox);
      return;
    }
    this.screenshotOverlay.style.left = `${bbox.left}px`;
    this.screenshotOverlay.style.top = `${bbox.top}px`;
    this.screenshotOverlay.style.width = `${bbox.width}px`;
    this.screenshotOverlay.style.height = `${bbox.height}px`;
  }

  hideScreenshotOverlay() {
    if (this.screenshotOverlay) {
      this.screenshotOverlay.remove();
      this.screenshotOverlay = null;
    }
  }

  clearAll() {
    this.hideHover();
    this.clearAllSelections();
    this.hideScreenshotOverlay();
  }

  buildHaloStyle(bbox, element) {
    const computed = window.getComputedStyle(element);
    const radius = computed.borderRadius || '14px';
    return `
      position: absolute;
      top: ${bbox.top + window.scrollY}px;
      left: ${bbox.left + window.scrollX}px;
      width: ${bbox.width}px;
      height: ${bbox.height}px;
      pointer-events: none;
      z-index: 2147483645;
      border-radius: ${radius};
      box-shadow: 0 0 0 2px var(--dock-stroke);
      background: transparent;
      cursor: default;
      transition: box-shadow 0.15s ease;
    `;
  }

  penSVG() { return ''; }
}
