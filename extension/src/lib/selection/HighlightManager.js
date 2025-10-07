/**
 * HighlightManager - Unified management of all page highlights
 */

export default class HighlightManager {
  constructor() {
    this.hoverHighlight = null;
    this.selectionHighlights = [];
    this.screenshotOverlay = null;
  }

  /**
   * Show hover highlight for element
   */
  showHover(element) {
    this.hideHover();
    
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
    this.hoverHighlight = highlight;
  }

  /**
   * Hide hover highlight
   */
  hideHover() {
    if (this.hoverHighlight) {
      this.hoverHighlight.remove();
      this.hoverHighlight = null;
    }
  }

  /**
   * Add selection highlight for element
   */
  addSelection(element) {
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
    this.selectionHighlights.push(highlight);
    
    return this.selectionHighlights.length - 1;
  }

  /**
   * Remove selection highlight by index
   */
  removeSelection(index) {
    if (this.selectionHighlights[index]) {
      this.selectionHighlights[index].remove();
      this.selectionHighlights.splice(index, 1);
    }
  }

  /**
   * Clear all selection highlights
   */
  clearAllSelections() {
    this.selectionHighlights.forEach(h => h.remove());
    this.selectionHighlights = [];
  }

  /**
   * Show screenshot overlay
   */
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
      border: 2px dashed #3b82f6;
      background: rgba(59, 130, 246, 0.1);
      pointer-events: none;
      z-index: 2147483645;
    `;
    
    document.body.appendChild(overlay);
    this.screenshotOverlay = overlay;
  }

  /**
   * Update screenshot overlay dimensions
   */
  updateScreenshotOverlay(bbox) {
    if (!this.screenshotOverlay) {
      this.showScreenshotOverlay(bbox);
      return;
    }
    
    this.screenshotOverlay.style.left = bbox.left + 'px';
    this.screenshotOverlay.style.top = bbox.top + 'px';
    this.screenshotOverlay.style.width = bbox.width + 'px';
    this.screenshotOverlay.style.height = bbox.height + 'px';
  }

  /**
   * Hide screenshot overlay
   */
  hideScreenshotOverlay() {
    if (this.screenshotOverlay) {
      this.screenshotOverlay.remove();
      this.screenshotOverlay = null;
    }
  }

  /**
   * Clear all highlights
   */
  clearAll() {
    this.hideHover();
    this.clearAllSelections();
    this.hideScreenshotOverlay();
  }
}

