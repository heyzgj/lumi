import * as fabric from 'fabric';
import AnnotateToolbar from './AnnotateToolbar.js';

export default class AnnotateManager {
    constructor(eventBus, stateManager, chromeBridge) {
        this.eventBus = eventBus;
        this.stateManager = stateManager;
        this.chromeBridge = chromeBridge;

        this.canvas = null;
        this.fabricCanvas = null;
        this.toolbar = null;
        this.isActive = false;

        this.currentTool = 'select';
        this.currentColor = '#ef4444';
        this.isDrawing = false;
        this.startPoint = null;
        this.activeObject = null;

        // Bind methods
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleResize = this.handleResize.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.updateToolbarPosition = this.updateToolbarPosition.bind(this);

        this.unsubscribers = [];
    }

    activate() {
        if (this.isActive) return;
        this.isActive = true;

        // Create canvas overlay
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'lumi-annotate-canvas';
        this.canvas.style.cssText = 'position: fixed; top: 0; left: 0; z-index: 2147483646; cursor: crosshair;';
        document.body.appendChild(this.canvas);

        // Initialize Fabric
        this.fabricCanvas = new fabric.Canvas(this.canvas, {
            width: window.innerWidth,
            height: window.innerHeight,
            selection: false // Manual selection handling
        });

        // Initialize Toolbar
        this.toolbar = new AnnotateToolbar(this.eventBus);
        this.toolbar.mount();
        this.updateToolbarPosition();

        // Bind Events
        this.bindEvents();

        // Set initial state
        this.setTool('select');
        this.setColor(this.currentColor);

        // Update state
        this.stateManager.set('ui.mode', 'screenshot'); // Reusing 'screenshot' mode for now
    }

    deactivate() {
        if (!this.isActive) return;
        this.isActive = false;

        // Cleanup Fabric
        if (this.fabricCanvas) {
            this.fabricCanvas.dispose();
            this.fabricCanvas = null;
        }

        // Remove DOM elements
        if (this.canvas) {
            this.canvas.remove();
            this.canvas = null;
        }

        if (this.toolbar) {
            this.toolbar.unmount();
            this.toolbar = null;
        }

        // Unbind events
        this.unbindEvents();

        // Reset state
        this.stateManager.set('ui.mode', 'idle');
    }

    bindEvents() {
        // Fabric events
        this.fabricCanvas.on('mouse:down', this.handleMouseDown);
        this.fabricCanvas.on('mouse:move', this.handleMouseMove);
        this.fabricCanvas.on('mouse:up', this.handleMouseUp);

        // Window events
        window.addEventListener('resize', this.handleResize);
        window.addEventListener('keydown', this.handleKeyDown);

        // Bus events
        this.unsubscribers.push(this.eventBus.on('annotate:tool', (tool) => this.setTool(tool)));
        this.unsubscribers.push(this.eventBus.on('annotate:color', (color) => this.setColor(color)));
        this.unsubscribers.push(this.eventBus.on('annotate:undo', () => this.undo()));
        this.unsubscribers.push(this.eventBus.on('annotate:reset', () => this.reset()));
        this.unsubscribers.push(this.eventBus.on('annotate:cancel', () => this.deactivate()));
        this.unsubscribers.push(this.eventBus.on('annotate:submit', () => this.captureAndSubmit()));

        // Dock state changes (for toolbar positioning)
        this.unsubscribers.push(this.stateManager.subscribe('ui.dockOpen', this.updateToolbarPosition));
        this.unsubscribers.push(this.stateManager.subscribe('ui.dockState', this.updateToolbarPosition));
    }

    unbindEvents() {
        window.removeEventListener('resize', this.handleResize);
        window.removeEventListener('keydown', this.handleKeyDown);

        // Unsubscribe from all bus/state events
        this.unsubscribers.forEach(unsubscribe => unsubscribe());
        this.unsubscribers = [];
    }

    handleResize() {
        if (this.fabricCanvas) {
            this.fabricCanvas.setDimensions({
                width: window.innerWidth,
                height: window.innerHeight
            });
            this.updateToolbarPosition();
        }
    }

    updateToolbarPosition() {
        if (!this.toolbar || !this.toolbar.host) return;

        const dockOpen = this.stateManager.get('ui.dockOpen') !== false;
        const dockWidth = 420; // Assumed width

        // If dock is open, center in the remaining space
        // Center X = (WindowWidth - DockWidth) / 2
        // But toolbar is fixed, so we set left: calc(50% - 210px) roughly?
        // Better: left: (WindowWidth - DockWidth) / 2

        if (dockOpen) {
            const availableWidth = window.innerWidth - dockWidth;
            const center = availableWidth / 2;
            this.toolbar.host.style.left = `${center}px`;
            this.toolbar.host.style.transform = 'translateX(-50%)';
        } else {
            this.toolbar.host.style.left = '50%';
            this.toolbar.host.style.transform = 'translateX(-50%)';
        }
    }

    handleKeyDown(e) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            const activeObjects = this.fabricCanvas.getActiveObjects();
            // If any active object is currently being edited (e.g. IText), do not delete
            if (activeObjects.some(obj => obj.isEditing)) return;

            if (activeObjects.length) {
                this.fabricCanvas.discardActiveObject();
                activeObjects.forEach((obj) => {
                    this.fabricCanvas.remove(obj);
                });
                this.fabricCanvas.requestRenderAll();
            }
        }
    }

    setTool(tool) {
        this.currentTool = tool;
        if (this.toolbar) this.toolbar.setActiveTool(tool);

        this.fabricCanvas.isDrawingMode = (tool === 'pen');
        this.fabricCanvas.selection = (tool === 'select');

        if (tool === 'pen') {
            this.fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(this.fabricCanvas);
            this.fabricCanvas.freeDrawingBrush.color = this.currentColor;
            this.fabricCanvas.freeDrawingBrush.width = 3;
        }

        // Cursor handling
        this.fabricCanvas.defaultCursor = tool === 'select' ? 'default' : 'crosshair';
        this.fabricCanvas.hoverCursor = tool === 'select' ? 'move' : 'crosshair';
    }

    setColor(color) {
        this.currentColor = color;
        if (this.toolbar) this.toolbar.setActiveColor(color);

        // Update active object if any
        const activeObj = this.fabricCanvas.getActiveObject();
        if (activeObj) {
            if (activeObj.type === 'path') {
                activeObj.set({ stroke: color });
            } else if (activeObj.type === 'i-text') {
                activeObj.set({ fill: color });
            } else {
                activeObj.set({ stroke: color });
            }
            this.fabricCanvas.requestRenderAll();
        }

        // Update brush
        if (this.fabricCanvas.freeDrawingBrush) {
            this.fabricCanvas.freeDrawingBrush.color = color;
        }
    }

    handleMouseDown(o) {
        if (this.currentTool === 'select' || this.currentTool === 'pen') return;

        this.isDrawing = true;
        const pointer = this.fabricCanvas.getPointer(o.e);
        this.startPoint = pointer;

        if (this.currentTool === 'rect') {
            this.activeObject = new fabric.Rect({
                left: pointer.x,
                top: pointer.y,
                width: 0,
                height: 0,
                fill: 'transparent',
                stroke: this.currentColor,
                strokeWidth: 3,
                rx: 2,
                ry: 2,
                selectable: false
            });
            this.fabricCanvas.add(this.activeObject);
        } else if (this.currentTool === 'arrow') {
            // Simplified arrow: line + triangle head (implemented as a group or path later)
            // For MVP, let's use a Path
            const path = `M ${pointer.x} ${pointer.y} L ${pointer.x} ${pointer.y}`;
            this.activeObject = new fabric.Path(path, {
                stroke: this.currentColor,
                strokeWidth: 3,
                fill: 'transparent',
                selectable: false,
                objectCaching: false
            });
            this.fabricCanvas.add(this.activeObject);
        } else if (this.currentTool === 'text') {
            this.isDrawing = false; // Text is click-to-add
            const text = new fabric.IText('', {
                left: pointer.x,
                top: pointer.y,
                fontFamily: 'sans-serif',
                fill: this.currentColor,
                fontSize: 20,
                selectable: true
            });
            this.fabricCanvas.add(text);
            this.fabricCanvas.setActiveObject(text);
            text.enterEditing();
            text.hiddenTextarea.focus();

            // Auto-switch to select after adding text
            this.setTool('select');
        }
    }

    handleMouseMove(o) {
        if (!this.isDrawing) return;
        const pointer = this.fabricCanvas.getPointer(o.e);

        if (this.currentTool === 'rect') {
            const w = Math.abs(pointer.x - this.startPoint.x);
            const h = Math.abs(pointer.y - this.startPoint.y);
            this.activeObject.set({ width: w, height: h });

            if (this.startPoint.x > pointer.x) {
                this.activeObject.set({ left: pointer.x });
            }
            if (this.startPoint.y > pointer.y) {
                this.activeObject.set({ top: pointer.y });
            }
        } else if (this.currentTool === 'arrow') {
            // Update path
            // M startX startY L endX endY
            // We need to redraw the arrow head too.
            // For simplicity, let's just draw a line for now, or use a custom class if we had one.
            // Re-creating path is expensive, but okay for MVP.

            // Better: use Line object
            // But we started with Path. Let's switch to Line for Arrow body?
            // Actually, let's just update the path data.
            // M startX startY L currentX currentY
            // Plus arrow head logic... omitted for brevity, just a line for now.
            const path = `M ${this.startPoint.x} ${this.startPoint.y} L ${pointer.x} ${pointer.y}`;
            // this.activeObject.set({ path: ... }) is not simple in Fabric.
            // Let's remove and re-add.
            this.fabricCanvas.remove(this.activeObject);

            // Draw Arrow Head
            const headLength = 15;
            const angle = Math.atan2(pointer.y - this.startPoint.y, pointer.x - this.startPoint.x);
            const x1 = pointer.x - headLength * Math.cos(angle - Math.PI / 6);
            const y1 = pointer.y - headLength * Math.sin(angle - Math.PI / 6);
            const x2 = pointer.x - headLength * Math.cos(angle + Math.PI / 6);
            const y2 = pointer.y - headLength * Math.sin(angle + Math.PI / 6);

            const arrowPath = `M ${this.startPoint.x} ${this.startPoint.y} L ${pointer.x} ${pointer.y} M ${pointer.x} ${pointer.y} L ${x1} ${y1} M ${pointer.x} ${pointer.y} L ${x2} ${y2}`;

            this.activeObject = new fabric.Path(arrowPath, {
                stroke: this.currentColor,
                strokeWidth: 3,
                fill: 'transparent',
                selectable: false,
                strokeLineCap: 'round',
                strokeLineJoin: 'round'
            });
            this.fabricCanvas.add(this.activeObject);
        }

        this.fabricCanvas.requestRenderAll();
    }

    handleMouseUp() {
        if (this.isDrawing) {
            this.isDrawing = false;
            if (this.activeObject) {
                this.activeObject.setCoords();
                this.activeObject.set({ selectable: true }); // Make it selectable now

                // Auto-switch to select mode and select the object
                this.setTool('select');
                this.fabricCanvas.setActiveObject(this.activeObject);
                this.fabricCanvas.requestRenderAll();

                this.activeObject = null;
            }
        }
    }

    undo() {
        // Simple undo: remove last object
        const objects = this.fabricCanvas.getObjects();
        if (objects.length > 0) {
            this.fabricCanvas.remove(objects[objects.length - 1]);
        }
    }

    reset() {
        this.fabricCanvas.clear();
        this.fabricCanvas.setBackgroundColor('rgba(0,0,0,0)', this.fabricCanvas.renderAll.bind(this.fabricCanvas));
    }

    async captureAndSubmit() {
        if (this.isCapturing) return;
        this.isCapturing = true;

        // Hide toolbar for screenshot
        if (this.toolbar && this.toolbar.host) {
            this.toolbar.host.style.display = 'none';
        }

        // Deselect everything to remove selection handles
        this.fabricCanvas.discardActiveObject();
        this.fabricCanvas.requestRenderAll();

        // Wait a frame
        await new Promise(r => requestAnimationFrame(r));

        try {
            // Capture visible tab (includes our canvas overlay)
            const dataUrl = await this.chromeBridge.captureScreenshot();

            // Add to selection
            const screenshots = this.stateManager.get('selection.screenshots') || [];
            const newShot = {
                id: 'shot-' + Date.now(),
                dataUrl: dataUrl,
                timestamp: Date.now(),
                bbox: { // Full viewport
                    left: 0, top: 0,
                    width: window.innerWidth, height: window.innerHeight
                }
            };

            this.stateManager.set('selection.screenshots', [...screenshots, newShot]);
            this.eventBus.emit('screenshot:captured', newShot);

            // Close annotate mode
            this.deactivate();

        } catch (err) {
            console.error('Screenshot failed:', err);
            this.eventBus.emit('screenshot:error', err);
            if (this.toolbar && this.toolbar.host) {
                this.toolbar.host.style.display = 'block';
            }
        } finally {
            this.isCapturing = false;
        }
    }
}
