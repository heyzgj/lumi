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
        this.lastBoundsLog = null;
        this.lastPointerLog = 0;
        this.hostContext = {
            type: 'inline',
            doc: document,
            win: window,
            containerResolver: () => document.getElementById('lumi-viewport-canvas') || document.getElementById('lumi-viewport-stage') || document.body
        };
        this.keydownTargets = [];
        this.resizeTargets = [];
        this.hostType = 'inline';
        this.bodyScrollLocked = false;
        this.extraWheelTargets = [];

        // Bind methods
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleResize = this.handleResize.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.updateToolbarPosition = this.updateToolbarPosition.bind(this);
        this.updateCanvasBounds = this.updateCanvasBounds.bind(this);
        this.handleViewportScroll = this.handleViewportScroll.bind(this);
        this.setInlineHost = this.setInlineHost.bind(this);
        this.setIframeHost = this.setIframeHost.bind(this);
        this.handleWheelBlock = this.handleWheelBlock.bind(this);

        this.unsubscribers = [];
    }

    setInlineHost() {
        if (this.hostType === 'inline') return;
        this.hostContext = {
            type: 'inline',
            doc: document,
            win: window,
            containerResolver: () => document.getElementById('lumi-viewport-canvas') || document.getElementById('lumi-viewport-stage') || document.body
        };
        this.hostType = 'inline';
        if (this.isActive) {
            this.deactivate();
            this.activate();
        }
    }

    setIframeHost(iframe) {
        const doc = iframe?.contentDocument;
        const win = iframe?.contentWindow;
        if (!doc || !win) return;
        this.hostContext = {
            type: 'iframe',
            doc,
            win,
            containerResolver: () => doc.body || doc.documentElement
        };
        this.hostType = 'iframe';
        if (this.isActive) {
            this.deactivate();
            this.activate();
        }
    }

    getHostContext() {
        const ctx = this.hostContext || {};
        const doc = ctx.doc || document;
        const win = ctx.win || window;
        let container = null;
        try {
            container = (typeof ctx.containerResolver === 'function' && ctx.containerResolver()) || ctx.container;
        } catch (_) { }
        if (!container) container = doc.body || doc.documentElement || document.body;
        return { doc, win, container };
    }

    activate() {
        if (this.isActive) return;
        this.isActive = true;

        const { doc, container } = this.getHostContext();

        // Lock page scroll while annotating (viewport overlay UX)
        if (!this.bodyScrollLocked) {
            try {
                document.body.classList.add('lumi-annotate-lock');
                this.bodyScrollLocked = true;
            } catch (_) { }
        }

        // Create canvas overlay
        this.canvas = doc.createElement('canvas');
        this.canvas.id = 'lumi-annotate-canvas';
        // z-index 2147483645 is one less than Dock (...46) so UI overlays it
        if (this.hostContext?.type === 'inline' && container === doc.body) {
            // Inline pages: treat annotate as a pure viewport overlay so it always
            // covers the current visible area regardless of scroll position.
            this.canvas.style.cssText = 'position: fixed; inset: 0; z-index: 2147483645; cursor: crosshair;';
        } else {
            // Viewport/iframe stages: keep the canvas anchored to the stage container
            // so coordinates stay aligned with the emulated viewport.
            this.canvas.style.cssText = 'position: absolute; inset: 0; z-index: 2147483645; cursor: crosshair;';
        }
        container.appendChild(this.canvas);

        // Initialize Fabric
        this.fabricCanvas = new fabric.Canvas(this.canvas, {
            width: 0,
            height: 0,
            selection: false, // Manual selection handling
            enableRetinaScaling: false // Keep 1:1 with CSS pixels to avoid pointer drift
        });
        this.updateCanvasBounds();

        // Initialize Toolbar
        this.toolbar = new AnnotateToolbar(this.eventBus);
        this.toolbar.mount();
        this.toolbar.setTheme(this.stateManager.get('ui.theme') || 'light');
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

        // Release scroll lock if we acquired it
        if (this.bodyScrollLocked) {
            try {
                document.body.classList.remove('lumi-annotate-lock');
            } catch (_) { }
            this.bodyScrollLocked = false;
        }

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
        try {
            window.addEventListener('wheel', this.handleWheelBlock, { passive: false, capture: true });
        } catch (_) { }
        const { win } = this.getHostContext();
        if (win && win !== window) {
            win.addEventListener('resize', this.handleResize);
            win.addEventListener('keydown', this.handleKeyDown);
            this.resizeTargets.push(win);
            this.keydownTargets.push(win);
            try {
                win.addEventListener('wheel', this.handleWheelBlock, { passive: false, capture: true });
                this.extraWheelTargets.push(win);
            } catch (_) { }
        }

        // Bus events
        this.unsubscribers.push(this.eventBus.on('annotate:tool', (tool) => this.setTool(tool)));
        this.unsubscribers.push(this.eventBus.on('annotate:color', (color) => this.setColor(color)));
        this.unsubscribers.push(this.eventBus.on('annotate:undo', () => this.undo()));
        this.unsubscribers.push(this.eventBus.on('annotate:reset', () => this.reset()));
        this.unsubscribers.push(this.eventBus.on('annotate:cancel', () => this.deactivate()));
        this.unsubscribers.push(this.eventBus.on('annotate:submit', () => this.captureAndSubmit()));
        this.unsubscribers.push(this.eventBus.on('annotate:copy', () => this.captureAndCopy()));
        this.unsubscribers.push(this.eventBus.on('annotate:download', () => this.captureAndDownload()));
        this.unsubscribers.push(this.eventBus.on('viewport:scrolled', this.handleViewportScroll));

        // Dock state changes (for toolbar positioning)
        this.unsubscribers.push(this.stateManager.subscribe('ui.dockOpen', this.updateToolbarPosition));
        this.unsubscribers.push(this.stateManager.subscribe('ui.dockState', this.updateToolbarPosition));
        this.unsubscribers.push(this.stateManager.subscribe('ui.viewport.scale', this.updateCanvasBounds));
        this.unsubscribers.push(this.stateManager.subscribe('ui.viewport.logical', this.updateCanvasBounds));
        this.unsubscribers.push(this.stateManager.subscribe('ui.viewport.useIframeStage', this.updateCanvasBounds));

        // Sync theme
        this.unsubscribers.push(this.stateManager.subscribe('ui.theme', (mode) => {
            if (this.toolbar) this.toolbar.setTheme(mode);
        }));
    }

    unbindEvents() {
        window.removeEventListener('resize', this.handleResize);
        window.removeEventListener('keydown', this.handleKeyDown);
        try {
            window.removeEventListener('wheel', this.handleWheelBlock, { capture: true });
        } catch (_) { }
        this.keydownTargets.forEach(target => {
            try { target.removeEventListener('keydown', this.handleKeyDown); } catch (_) { }
        });
        this.keydownTargets = [];
        this.resizeTargets.forEach(target => {
            try { target.removeEventListener('resize', this.handleResize); } catch (_) { }
        });
        this.resizeTargets = [];
        this.extraWheelTargets.forEach(target => {
            try { target.removeEventListener('wheel', this.handleWheelBlock, { capture: true }); } catch (_) { }
        });
        this.extraWheelTargets = [];

        // Unsubscribe from all bus/state events
        this.unsubscribers.forEach(unsubscribe => unsubscribe());
        this.unsubscribers = [];
    }

    handleResize() {
        if (this.fabricCanvas && this.canvas) {
            this.updateCanvasBounds();
            this.updateToolbarPosition();
        }
    }

    handleWheelBlock(e) {
        try {
            e.preventDefault();
        } catch (_) { }
    }

    updateToolbarPosition() {
        if (!this.toolbar || !this.toolbar.host) return;

        const dockOpen = this.stateManager.get('ui.dockOpen') !== false;
        const rect = this.getStageRect();

        // Center within the stage rect (it already reflects dock/topbar offsets)
        const center = rect.left + (rect.width / 2);
        this.toolbar.host.style.left = `${center}px`;
        this.toolbar.host.style.transform = 'translateX(-50%)';
        // Keep toolbar pinned near bottom of viewport stage
        this.toolbar.host.style.bottom = dockOpen ? '32px' : '32px';
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

    getStageRect() {
        try {
            const { container } = this.getHostContext();
            if (container?.getBoundingClientRect) {
                const rect = container.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) return rect;
            }
            const stage = document.getElementById('lumi-viewport-stage');
            if (stage) {
                const rect = stage.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) return rect;
            }
        } catch (_) { }
        return {
            left: 0,
            top: 0,
            width: window.innerWidth,
            height: window.innerHeight
        };
    }

    updateCanvasBounds() {
        if (!this.canvas || !this.fabricCanvas) return;
        const { container } = this.getHostContext();
        const rect = container?.getBoundingClientRect ? container.getBoundingClientRect() : null;
        const width = Math.max(1, Math.round(container?.clientWidth || rect?.width || window.innerWidth));
        const height = Math.max(1, Math.round(container?.clientHeight || rect?.height || window.innerHeight));

        // Keep Fabric dimensions in CSS pixels; Fabric will handle retina scaling internally.
        this.canvas.width = width;
        this.canvas.height = height;
        this.fabricCanvas.setDimensions({ width, height });
        this.fabricCanvas.calcOffset();

        // Align drawing coordinates to the visible viewport size (no additional zooming).
        this.fabricCanvas.setViewportTransform([1, 0, 0, 1, 0, 0]);

        const stamp = `${width},${height}`;
        if (this.lastBoundsLog !== stamp) {
            this.lastBoundsLog = stamp;
            this.debugLog('canvas:bounds', {
                stage: this.getStageRect(),
                canvas: { width: this.canvas.width, height: this.canvas.height, styleLeft: this.canvas.style.left, styleTop: this.canvas.style.top },
                scale: this.stateManager.get('ui.viewport.scale')
            });
        }
    }

    handleViewportScroll() {
        this.updateCanvasBounds();
        this.updateToolbarPosition();
    }

    handleMouseDown(o) {
        if (this.currentTool === 'select' || this.currentTool === 'pen') return;

        this.isDrawing = true;
        const pointer = this.fabricCanvas.getPointer(o.e);
        this.debugLog('mouse:down', {
            client: { x: o.e.clientX, y: o.e.clientY },
            pointer,
            stage: this.getStageRect(),
            canvas: { width: this.canvas?.width, height: this.canvas?.height, left: this.canvas?.style.left, top: this.canvas?.style.top }
        });
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
        const now = Date.now();
        if (now - this.lastPointerLog > 350) {
            this.lastPointerLog = now;
            this.debugLog('mouse:move', {
                client: { x: o.e.clientX, y: o.e.clientY },
                pointer,
                stage: this.getStageRect(),
                canvas: { width: this.canvas?.width, height: this.canvas?.height, left: this.canvas?.style.left, top: this.canvas?.style.top }
            });
        }

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
        if (!this.fabricCanvas) return;
        this.fabricCanvas.clear();
        if (typeof this.fabricCanvas.setBackgroundColor === 'function') {
            this.fabricCanvas.setBackgroundColor('rgba(0,0,0,0)', this.fabricCanvas.renderAll.bind(this.fabricCanvas));
        } else {
            this.fabricCanvas.requestRenderAll();
        }
    }

    async captureAndSubmit() {
        if (this.isCapturing) return;
        this.isCapturing = true;

        // Hide toolbar for screenshot
        if (this.toolbar && this.toolbar.host) {
            this.toolbar.host.style.display = 'none';
        }
        const restoreUI = this.temporarilyHideUI();

        // Deselect everything to remove selection handles
        this.fabricCanvas.discardActiveObject();
        this.fabricCanvas.requestRenderAll();

        // Wait a frame
        await new Promise(r => requestAnimationFrame(r));

        try {
            // Capture visible tab (includes our canvas overlay)
            const dataUrl = await this.chromeBridge.captureScreenshot();
            let finalDataUrl = dataUrl;
            let bbox = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };

            // Crop to the active viewport stage (iframe or inline)
            const rect = this.getStageRect();
            if (rect.width > 0 && rect.height > 0 && (rect.width !== window.innerWidth || rect.height !== window.innerHeight || rect.left !== 0 || rect.top !== 0)) {
                finalDataUrl = await this.cropImage(dataUrl, rect);
                bbox = {
                    left: rect.left,
                    top: rect.top,
                    width: rect.width,
                    height: rect.height
                };
            }

            // Add to selection
            const screenshots = this.stateManager.get('selection.screenshots') || [];
            const newShot = {
                id: 'shot-' + Date.now(),
                dataUrl: finalDataUrl,
                timestamp: Date.now(),
                bbox: bbox
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
            restoreUI();
        } finally {
            restoreUI();
            this.isCapturing = false;
        }
    }

    async captureAndCopy() {
        const dataUrl = await this.captureInternal();
        if (!dataUrl) return;
        try {
            const blob = await (await fetch(dataUrl)).blob();
            await navigator.clipboard.write([
                new ClipboardItem({ [blob.type]: blob })
            ]);
            // Show toast via event bus (content script will handle if needed, or just console)
            console.log('[LUMI] Screenshot copied to clipboard');
            // Flash effect?
        } catch (err) {
            console.error('Copy failed:', err);
        }
    }

    async captureAndDownload() {
        const dataUrl = await this.captureInternal();
        if (!dataUrl) return;
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `lumi-screenshot-${Date.now()}.png`;
        a.click();
    }

    async captureInternal() {
        if (this.isCapturing) return null;
        this.isCapturing = true;

        if (this.toolbar && this.toolbar.host) this.toolbar.host.style.display = 'none';
        const restoreUI = this.temporarilyHideUI();
        this.fabricCanvas.discardActiveObject();
        this.fabricCanvas.requestRenderAll();
        await new Promise(r => requestAnimationFrame(r));

        try {
            const dataUrl = await this.chromeBridge.captureScreenshot();
            let finalDataUrl = dataUrl;

            const rect = this.getStageRect();
            if (rect.width > 0 && rect.height > 0 && (rect.width !== window.innerWidth || rect.height !== window.innerHeight || rect.left !== 0 || rect.top !== 0)) {
                finalDataUrl = await this.cropImage(dataUrl, rect);
            }
            return finalDataUrl;
        } catch (err) {
            console.error('Capture failed:', err);
            return null;
        } finally {
            if (this.toolbar && this.toolbar.host) this.toolbar.host.style.display = 'block';
            restoreUI();
            this.isCapturing = false;
        }
    }

    cropImage(dataUrl, rect) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                // Calculate ratio between captured image and window dimensions
                // (Handles Retina/High-DPI displays where capture is larger than window innerWidth)
                const ratio = img.width / window.innerWidth;

                canvas.width = rect.width * ratio;
                canvas.height = rect.height * ratio;
                const ctx = canvas.getContext('2d');

                ctx.drawImage(img,
                    rect.left * ratio, rect.top * ratio, rect.width * ratio, rect.height * ratio,
                    0, 0, canvas.width, canvas.height
                );
                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = reject;
            img.src = dataUrl;
        });
    }

    temporarilyHideUI() {
        const nodes = [
            document.getElementById('lumi-dock-root'),
            document.getElementById('lumi-viewport-bar-root'),
            document.getElementById('lumi-dock-launcher')
        ].filter(Boolean);
        const prev = nodes.map((el) => {
            const visibility = el.style.visibility;
            el.style.visibility = 'hidden';
            return { el, visibility };
        });
        return () => {
            prev.forEach(({ el, visibility }) => {
                el.style.visibility = visibility;
            });
        };
    }

    debugLog(label, payload) {
        try {
            const enabled = window.__LUMI_DEBUG === true || localStorage.getItem('LUMI_ANNOTATE_DEBUG') === '1';
            if (!enabled) return;
            console.debug(`[Annotate] ${label}`, payload);
        } catch (_) { }
    }
}
