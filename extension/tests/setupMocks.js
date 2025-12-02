import { jest } from '@jest/globals';

// Mock canvas native binding before modules load
jest.mock('canvas', () => ({
  createCanvas: () => ({
    getContext: () => ({
      fillRect: () => {},
      clearRect: () => {},
      getImageData: () => ({ data: [] }),
      putImageData: () => {},
      createImageData: () => [],
      setTransform: () => {},
      drawImage: () => {},
      save: () => {},
      fillText: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      stroke: () => {},
      translate: () => {},
      scale: () => {},
      rotate: () => {},
      arc: () => {},
      fill: () => {},
      strokeRect: () => {},
      measureText: () => ({ width: 0 }),
      transform: () => {}
    }),
    toBuffer: () => Buffer.from(''),
    toDataURL: () => 'data:image/png;base64,',
    width: 0,
    height: 0
  }),
  Image: function Image() {},
  loadImage: async () => ({})
}), { virtual: true });

// Mock fabric to avoid pulling in native canvas
jest.mock('fabric', () => {
  class Base { constructor(opts = {}) { Object.assign(this, opts); } }
  class Canvas {
    constructor() {
      this._handlers = {};
      this._objects = [];
      this.isDrawingMode = false;
      this.selection = true;
      this.freeDrawingBrush = null;
    }
    on(evt, fn) { this._handlers[evt] = fn; }
    setDimensions() {}
    dispose() {}
    getActiveObjects() { return []; }
    discardActiveObject() {}
    remove(obj) { this._objects = this._objects.filter(o => o !== obj); }
    add(obj) { this._objects.push(obj); }
    requestRenderAll() {}
    getPointer() { return { x: 0, y: 0 }; }
    setActiveObject(obj) { this._active = obj; }
    getObjects() { return this._objects.slice(); }
    clear() { this._objects = []; }
    setBackgroundColor() {}
  }
  class PencilBrush { constructor(canvas) { this.canvas = canvas; this.color = '#000'; this.width = 1; } }
  class Rect extends Base {}
  class Path extends Base {}
  class IText extends Base {}
  return { Canvas, PencilBrush, Rect, Path, IText };
}, { virtual: true });
