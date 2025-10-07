/**
 * ScreenshotSelector - Handle screenshot selection mode
 */

import { shouldIgnoreElement } from '../utils/dom.js';

export default class ScreenshotSelector {
  constructor(eventBus, stateManager, highlightManager, topBanner, chromeBridge) {
    this.eventBus = eventBus;
    this.stateManager = stateManager;
    this.highlightManager = highlightManager;
    this.topBanner = topBanner;
    this.chromeBridge = chromeBridge;
    this.isActive = false;
    this.screenshotStart = null;
    
    // Bind methods
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
  }

  activate() {
    if (this.isActive) return;
    
    this.isActive = true;
    this.stateManager.set('ui.mode', 'screenshot');
    
    this.topBanner.update('Drag to select area for screenshot');
    
    document.addEventListener('mousedown', this.handleMouseDown, true);
    document.documentElement.classList.add('lumi-screenshot-cursor');
    document.body.classList.add('lumi-screenshot-cursor');
    
    this.eventBus.emit('screenshot-mode:activated');
  }

  deactivate() {
    if (!this.isActive) return;
    
    this.isActive = false;
    this.stateManager.set('ui.mode', 'idle');
    
    this.topBanner.hide();
    this.highlightManager.hideScreenshotOverlay();
    
    document.removeEventListener('mousedown', this.handleMouseDown, true);
    document.removeEventListener('mousemove', this.handleMouseMove, true);
    document.removeEventListener('mouseup', this.handleMouseUp, true);
    document.documentElement.classList.remove('lumi-screenshot-cursor');
    document.body.classList.remove('lumi-screenshot-cursor');
    
    this.eventBus.emit('screenshot-mode:deactivated');
  }

  handleMouseDown(e) {
    if (!this.isActive) return;

    const tag = e.target?.tagName && e.target.tagName.toLowerCase();
    const isPageBackground = tag === 'html' || tag === 'body';

    if (!isPageBackground && shouldIgnoreElement(e.target)) {
      return;
    }

    e.preventDefault();

    this.screenshotStart = {
      x: e.clientX,
      y: e.clientY
    };
    
    document.addEventListener('mousemove', this.handleMouseMove, true);
    document.addEventListener('mouseup', this.handleMouseUp, true);
  }

  handleMouseMove(e) {
    if (!this.screenshotStart) return;
    
    const current = {
      x: e.clientX,
      y: e.clientY
    };
    
    const bbox = {
      left: Math.min(this.screenshotStart.x, current.x) + window.scrollX,
      top: Math.min(this.screenshotStart.y, current.y) + window.scrollY,
      width: Math.abs(current.x - this.screenshotStart.x),
      height: Math.abs(current.y - this.screenshotStart.y)
    };
    
    this.highlightManager.updateScreenshotOverlay(bbox);
  }

  handleMouseUp(e) {
    if (!this.screenshotStart) return;
    
    const end = {
      x: e.clientX,
      y: e.clientY
    };
    
    const bbox = {
      left: Math.min(this.screenshotStart.x, end.x) + window.scrollX,
      top: Math.min(this.screenshotStart.y, end.y) + window.scrollY,
      width: Math.abs(end.x - this.screenshotStart.x),
      height: Math.abs(end.y - this.screenshotStart.y)
    };
    
    // Minimum size check
    if (bbox.width > 20 && bbox.height > 20) {
      this.captureScreenshot(bbox);
    }
    
    this.highlightManager.hideScreenshotOverlay();
    this.screenshotStart = null;
    
    document.removeEventListener('mousemove', this.handleMouseMove, true);
    document.removeEventListener('mouseup', this.handleMouseUp, true);
    
    this.deactivate();
  }

  async captureScreenshot(bbox) {
    try {
      const dataUrl = await this.chromeBridge.captureScreenshot();
      
      this.stateManager.set('selection.screenshot', {
        dataUrl,
        bbox
      });
      
      this.eventBus.emit('screenshot:captured', { dataUrl, bbox });
    } catch (error) {
      console.error('[ScreenshotSelector] Failed to capture:', error);
      this.eventBus.emit('screenshot:error', error);
    }
  }
}
