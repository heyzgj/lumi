import { describeChanges, getElementSchema } from '../../engine/ElementSchema.js';
import { readableElementName } from '../../utils/dom.js';
import TokenScanner from '../../engine/TokenScanner.js';

const SHADOW_PRESETS = {
    none: 'none',
    soft: '0 6px 18px color-mix(in srgb, var(--dock-fg) 12%, transparent)',
    medium: '0 12px 28px color-mix(in srgb, var(--dock-fg) 16%, transparent)',
    deep: '0 24px 44px color-mix(in srgb, var(--dock-fg) 20%, transparent)'
};

export default class DockEditModal {
    constructor(eventBus, stateManager, mountRoot) {
        this.eventBus = eventBus;
        this.stateManager = stateManager;
        this.mountRoot = mountRoot || document.body;
        this.container = null;
        this.backdrop = null;
        this.form = null;
        this.targets = [];
        this.indices = [];
        this.base = null;
        this.inline = null;
        this.current = {};
        this.intents = {}; // Store semantic intents for keys
        this.bodyScrollLocked = false;
        this.previewHistory = [];
        this.lastPreviewState = {};

        this._blockerEnabled = false;
        this._blockRegistrations = [];
        this._iframeWindow = null;

        this.tokenScanner = new TokenScanner();
        this.tokens = { colors: [], spacing: [], radius: [] };
    }

    mount() {
        if (this.container) return;
        this.backdrop = document.createElement('div');
        this.backdrop.id = 'dock-edit-overlay';
        this.backdrop.style.cssText = `
      position: fixed; top: 0; right: 0; bottom: 0; left: auto; width: 420px;
      background: color-mix(in srgb, var(--dock-fg, #0f172a) 22%, transparent);
      backdrop-filter: blur(8px); z-index: 2147483647; display: none;
    `;
        this.backdrop.addEventListener('click', () => this.close(true));

        this.container = document.createElement('div');
        this.container.id = 'dock-edit-modal';
        this.container.style.cssText = `
      position: fixed; right: 24px; top: 72px; width: 360px;
      background: var(--dock-bg); backdrop-filter: blur(24px);
      border-radius: var(--radius-panel, 18px); border: 1px solid var(--dock-stroke);
      box-shadow: var(--shadow); padding: 20px 22px; display: none;
      z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      color: var(--dock-fg); max-height: calc(100vh - 144px);
      overflow: hidden; flex-direction: column;
    `;

        this.container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-shrink:0;">
        <div id="dock-edit-title" style="font-weight:600;font-size:14px;">Edit</div>
        <button id="dock-edit-close" style="border:none;background:transparent;font-size:18px;cursor:pointer;color:var(--dock-fg-2);">×</button>
      </div>
      <div id="dock-edit-scroll" style="flex:1;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;padding-right:4px;min-height:0;">
        <form id="dock-edit-form" class="dock-edit-form" style="display:flex;flex-direction:column;gap:18px;"></form>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px;flex-shrink:0;">
        <button type="button" id="dock-edit-reset" style="border:1px solid var(--dock-stroke);background:transparent;border-radius:12px;padding:6px 12px;color:var(--dock-fg-2);cursor:pointer;margin-right:auto;">Reset</button>
        <button type="button" id="dock-edit-undo" style="border:1px solid var(--dock-stroke);background:color-mix(in srgb, var(--dock-bg) 94%, transparent);border-radius:12px;padding:6px 12px;color:var(--dock-fg-2);cursor:pointer;">Undo</button>
        <button type="button" id="dock-edit-apply" style="border:1px solid var(--dock-stroke);background:var(--surface, color-mix(in srgb, var(--dock-bg) 96%, transparent));border-radius:12px;padding:6px 12px;color:var(--dock-fg);cursor:pointer;">Apply</button>
      </div>
    `;

        this.form = this.container.querySelector('#dock-edit-form');
        this.scrollContainer = this.container.querySelector('#dock-edit-scroll');
        this.container.setAttribute('tabindex', '-1');
        this.container.querySelector('#dock-edit-close').addEventListener('click', () => this.close(true));
        this.container.querySelector('#dock-edit-reset').addEventListener('click', () => this.resetChanges());
        this.undoBtn = this.container.querySelector('#dock-edit-undo');
        if (this.undoBtn) this.undoBtn.addEventListener('click', () => { try { this.eventBus.emit('wysiwyg:undo'); } catch (_) { } });
        this.applyBtn = this.container.querySelector('#dock-edit-apply');
        if (this.applyBtn) this.applyBtn.addEventListener('click', () => this.applyChanges());

        // Prevent scroll events from bubbling
        this.container.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
        this.container.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
                e.preventDefault();
                try { this.eventBus.emit('wysiwyg:undo'); } catch (_) { }
            }
        });

        if (!this.mountRoot) return;
        this.mountRoot.appendChild(this.backdrop);
        this.mountRoot.appendChild(this.container);
        this.updateUndoAvailability();

        // Listen for inline edit sync
        this.eventBus.on('wysiwyg:sync', ({ text }) => {
            if (this.current.text !== text) {
                this.current.text = text;
                const textarea = this.form.querySelector('textarea');
                if (textarea) textarea.value = text;
                this.syncPending();
            }
        });

        // Track viewport iframe for interaction blocking
        this.eventBus.on('viewport:iframe-ready', ({ iframe }) => {
            try {
                this._iframeWindow = iframe?.contentWindow || null;
                if (this._blockerEnabled) {
                    this._attachBlockers(this._iframeWindow);
                }
            } catch (_) {
                this._iframeWindow = null;
            }
        });
    }

    open({ index, element } = {}) {
        this.mount();
        const selection = this.stateManager.get('selection.elements') || [];
        if (!Array.isArray(selection) || selection.length === 0) return;

        let indices = [];
        if (typeof index === 'number' && selection[index]) indices = [index];
        else if (element) {
            const found = selection.findIndex(item => item.element === element);
            if (found >= 0) indices = [found];
        }
        if (!indices.length) indices = selection.map((_, i) => i);

        this.indices = indices;
        this.targets = indices.map(i => selection[i] && selection[i].element ? { element: selection[i].element, selector: selection[i].selector } : null).filter(Boolean);

        if (!this.targets.length) return;

        // Scan tokens on open
        this.tokens = this.tokenScanner.scan();

        this.current = {};
        this.intents = {};
        this.collectBase();
        this.renderForm();

        this.stateManager.set('wysiwyg.pending', null);
        this.stateManager.set('wysiwyg.active', true);
        this.previewHistory = [];
        this.lastPreviewState = {};

        if (!this.bodyScrollLocked) {
            document.body.classList.add('lumi-scroll-lock');
            this.bodyScrollLocked = true;
        }
        this.positionOverlay();
        this.backdrop.style.display = 'block';
        this.container.style.display = 'flex';
        try { this.container.focus({ preventScroll: true }); } catch (_) { }

        // Block page interactions via event capture
        this.enableInteractionBlocker();
    }

    close(cancel = false) {
        if (!this.container) return;
        if (cancel) this.restoreBase();
        this.backdrop.style.display = 'none';
        this.container.style.display = 'none';
        window.removeEventListener('resize', this._onResize);
        this.form.innerHTML = '';
        this.current = {};
        this.intents = {};
        this.targets = [];
        this.indices = [];
        this.stateManager.set('wysiwyg.pending', null);
        this.stateManager.set('wysiwyg.active', false);
        if (this.bodyScrollLocked) {
            document.body.classList.remove('lumi-scroll-lock');
            this.bodyScrollLocked = false;
        }

        // Remove page blocker
        this.disableInteractionBlocker();
    }

    enableInteractionBlocker() {
        if (this._blockerEnabled) return;
        // Blur active element to avoid lingering focus triggers
        try { if (document.activeElement) document.activeElement.blur(); } catch (_) { }

        // Opportunistically capture current viewport iframe if present
        if (!this._iframeWindow) {
            try {
                const iframe = document.getElementById('lumi-viewport-iframe');
                if (iframe && iframe.contentWindow) this._iframeWindow = iframe.contentWindow;
            } catch (_) { this._iframeWindow = null; }
        }

        this._blockerEnabled = true;
        this._blockRegistrations = [];
        this._attachBlockers(window);
        if (this._iframeWindow) this._attachBlockers(this._iframeWindow);
    }

    disableInteractionBlocker() {
        if (!this._blockerEnabled) return;
        this._blockRegistrations.forEach((entry) => {
            try {
                if (typeof entry === 'function') entry();
                else if (entry && typeof entry.remove === 'function') entry.remove();
            } catch (_) { }
        });
        this._blockRegistrations = [];
        this._blockerEnabled = false;
    }

    _attachBlockers(win) {
        if (!win) return;
        // Avoid duplicate attachment
        if (this._blockRegistrations.some(entry => entry && entry.win === win)) return;

        const registrations = [];
        const add = (type, handler, options = { capture: true }) => {
            try {
                win.addEventListener(type, handler, options);
                registrations.push({ win, remove: () => win.removeEventListener(type, handler, options) });
            } catch (_) { }
        };

        const pointerHandler = (e) => this._handleBlockEvent(e);
        const keyHandler = (e) => this._handleKeyBlock(e);
        const focusHandler = (e) => this._handleFocusBlock(e);

        ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick', 'auxclick', 'contextmenu'].forEach(evt => add(evt, pointerHandler));
        add('keydown', keyHandler);
        add('focusin', focusHandler);

        this._blockRegistrations.push(...registrations);
    }

    _isLumiTarget(target) {
        if (!target) return false;
        if (this.container && this.container.contains(target)) return true;
        if (this.backdrop && this.backdrop.contains(target)) return true;
        if (target.id === 'lumi-dock-root' || target.closest?.('#lumi-dock-root')) return true;
        if (target.id === 'dock-edit-overlay' || target.closest?.('#dock-edit-overlay')) return true;
        if (target.id === 'dock-edit-modal' || target.closest?.('#dock-edit-modal')) return true;
        if (target.id === 'lumi-dock-launcher' || target.closest?.('#lumi-dock-launcher')) return true;
        if (target.closest?.('#lumi-bubble-container')) return true;
        if (target.closest?.('#lumi-top-banner')) return true;
        if (target.closest?.('#lumi-interaction-bubble')) return true;
        if (target.closest?.('#lumi-controls-overlay')) return true;
        if (target.classList?.contains('lumi-highlight') || target.closest?.('.lumi-highlight')) return true;
        if (target.classList?.contains('lumi-screenshot-overlay') || target.closest?.('.lumi-screenshot-overlay')) return true;
        if (target.classList?.contains('lumi-highlight-pen')) return true;
        // Shadow host check for dock
        try {
            const root = target.getRootNode && target.getRootNode();
            if (root && root.host && root.host.id === 'lumi-dock-root') return true;
        } catch (_) { }
        return false;
    }

    _isSelectedTextTarget(target) {
        if (!target) return false;
        return this.targets.some(({ element }) => {
            if (!element) return false;
            return (element === target || element.contains(target)) && this.canEditText(element);
        });
    }

    _handleBlockEvent(e) {
        const target = e.target;
        if (this._isLumiTarget(target)) return;

        if (this._isSelectedTextTarget(target)) {
            if (e.type === 'dblclick') return; // allow inline text edits
            if (e.type === 'mousedown' || e.type === 'mouseup' || e.type === 'pointerdown' || e.type === 'pointerup') return;
            if (e.type === 'click') { e.preventDefault(); e.stopPropagation(); return; }
        }

        // Block all other interactions
        e.preventDefault();
        e.stopPropagation();
    }

    _handleKeyBlock(e) {
        const target = e.target;
        if (this._isLumiTarget(target)) return;
        if (this._isSelectedTextTarget(target)) return;
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            e.stopPropagation();
        }
    }

    _handleFocusBlock(e) {
        const target = e.target;
        if (this._isLumiTarget(target)) return;
        if (this._isSelectedTextTarget(target)) return;
        e.preventDefault();
        e.stopPropagation();
        this._focusModal();
    }

    _focusModal() {
        try {
            const focusable = this.container?.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (focusable) focusable.focus({ preventScroll: true });
            else if (this.container) this.container.focus({ preventScroll: true });
        } catch (_) { }
    }

    // ... (getVar, positionOverlay, collectBase, restoreBase, restoreBaseline same as before) ...
    getVar(name) { try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || ''; } catch (_) { return ''; } }
    positionOverlay() { /* ... same implementation ... */
        try {
            const host = document.getElementById('lumi-dock-root');
            const rect = host ? host.getBoundingClientRect() : null;
            const fallbackWidth = this.stateManager.get('ui.dockWidth') || 420;
            const hasVisibleDock = !!rect && rect.width >= 40 && rect.right > 0;
            const dockWidth = Math.round(hasVisibleDock ? rect.width : fallbackWidth);
            if (hasVisibleDock) {
                const dockLeft = Math.max(0, Math.round(rect.left));
                this.backdrop.style.left = dockLeft + 'px';
                this.backdrop.style.right = '';
                this.backdrop.style.width = dockWidth + 'px';
            } else {
                this.backdrop.style.left = '';
                this.backdrop.style.right = '0px';
                this.backdrop.style.width = dockWidth + 'px';
            }
            const maxModal = Math.max(260, dockWidth - 48);
            const modalWidth = Math.min(360, maxModal);
            this.container.style.width = modalWidth + 'px';
            this.container.style.right = '24px';
        } catch (_) { }
        if (!this._onResize) {
            this._onResize = () => this.positionOverlay();
        }
        window.addEventListener('resize', this._onResize, { passive: true });
    }

    collectBase() {
        const base = {
            text: null, color: null, backgroundColor: null, fontSize: null, fontWeight: null, lineHeight: null,
            paddingTop: null, paddingRight: null, paddingBottom: null, paddingLeft: null,
            marginTop: null, marginRight: null, marginBottom: null, marginLeft: null,
            borderRadius: null, boxShadow: null
        };
        const inline = [];
        this.targets.forEach(({ element }) => {
            const style = window.getComputedStyle(element);

            // Calculate proper line height (convert px to unitless ratio if needed)
            let lineHeight = style.lineHeight;
            if (lineHeight && lineHeight !== 'normal' && lineHeight.includes('px')) {
                const lineHeightPx = parseFloat(lineHeight);
                const fontSizePx = parseFloat(style.fontSize);
                if (fontSizePx > 0) {
                    lineHeight = (lineHeightPx / fontSizePx).toFixed(2);
                }
            }

            const entry = {
                text: element.textContent,
                color: style.color, backgroundColor: style.backgroundColor,
                fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: lineHeight,
                paddingTop: style.paddingTop, paddingRight: style.paddingRight, paddingBottom: style.paddingBottom, paddingLeft: style.paddingLeft,
                marginTop: style.marginTop, marginRight: style.marginRight, marginBottom: style.marginBottom, marginLeft: style.marginLeft,
                borderRadius: style.borderRadius, boxShadow: style.boxShadow,
                inline: { ...element.style }
            };
            inline.push(entry);
            Object.keys(base).forEach((key) => {
                if (base[key] === null) base[key] = entry[key];
                else if (base[key] !== entry[key]) base[key] = 'mixed';
            });
        });
        this.base = base;
        this.inline = inline;
    }

    restoreBase() {
        this.targets.forEach(({ element }, idx) => {
            const data = this.inline[idx];
            if (!data) return;
            if (this.canEditText(element)) element.textContent = data.text;
            // Cannot use Object.assign on CSSStyleDeclaration, must set properties individually
            const inlineStyle = data.inline || {};
            Object.keys(inlineStyle).forEach(prop => {
                try {
                    if (typeof prop === 'string' && inlineStyle[prop] !== undefined) {
                        element.style[prop] = inlineStyle[prop];
                    }
                } catch (e) { }
            });
        });
    }

    restoreBaseline() {
        const selection = this.stateManager.get('selection.elements') || [];
        this.targets.forEach(({ element }, idx) => {
            const index = this.indices[idx];
            const selItem = selection && typeof index === 'number' ? selection[index] : null;
            const base = selItem && selItem.baseline ? selItem.baseline : null;
            if (!base) return;
            if (this.canEditText(element) && base.text !== undefined) element.textContent = base.text;
            // Cannot use Object.assign on CSSStyleDeclaration
            const inlineStyle = base.inline || {};
            Object.keys(inlineStyle).forEach(prop => {
                try {
                    if (typeof prop === 'string' && inlineStyle[prop] !== undefined) {
                        element.style[prop] = inlineStyle[prop];
                    }
                } catch (e) { }
            });
        });
    }

    renderForm() {
        const base = this.base;
        const form = this.form;
        form.innerHTML = '';

        const title = this.container.querySelector('#dock-edit-title');
        if (this.targets.length > 1) title.textContent = `${this.targets.length} elements selected`;
        else title.textContent = readableElementName(this.targets[0].element);

        // Use ElementSchema to determine controls
        // For multiple selection, we intersect the schemas or just use 'container' fallback
        const schema = this.targets.length === 1 ? getElementSchema(this.targets[0].element) : getElementSchema(null);

        // Render Groups based on Schema
        if (schema.controls.has('content')) {
            const allowText = this.targets.length === 1 && this.canEditText(this.targets[0].element);
            if (allowText) form.appendChild(this.renderTextField('Content', 'text', base.text));

            // Image Replacement
            if (this.targets.length === 1 && this.targets[0].element.tagName === 'IMG') {
                const group = document.createElement('div');
                group.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
                group.innerHTML = `<span style="font-size:12px;color:var(--dock-fg-2);">Image Source</span>`;
                const input = document.createElement('input');
                input.type = 'text';
                input.value = this.targets[0].element.src;
                input.style.cssText = 'padding:6px;border:1px solid var(--dock-stroke);border-radius:8px;background:color-mix(in srgb, var(--dock-bg) 96%, transparent);color:var(--dock-fg);font-size:12px;';
                input.addEventListener('change', () => {
                    this.current['src'] = input.value;
                    this.intents['src'] = `Replace image source`;
                    this.targets[0].element.src = input.value; // Direct preview for image
                    this.syncPending();
                });
                group.appendChild(input);
                form.appendChild(group);
            }
        }

        // Typography First
        if (schema.controls.has('typography')) {
            const group = document.createElement('div');
            group.style.display = 'flex'; group.style.flexDirection = 'column'; group.style.gap = '12px';
            group.innerHTML = `<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--dock-fg-2);">Typography</div>`;
            form.appendChild(group);

            // Font Family
            group.appendChild(this.renderSelectField('Font Family', 'fontFamily', base.fontFamily,
                ['Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'system-ui', 'serif', 'monospace']));

            // Row 1: Size & Weight
            const row1 = document.createElement('div');
            row1.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;';
            row1.appendChild(this.renderNumberField('Size', 'fontSize', base.fontSize, { unit: 'px' }));
            row1.appendChild(this.renderSelectField('Weight', 'fontWeight', base.fontWeight, ['300', '400', '500', '600', '700', '800', '900']));
            group.appendChild(row1);

            // Row 2: Line Height & Style/Deco
            const row2 = document.createElement('div');
            row2.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:end;';
            row2.appendChild(this.renderNumberField('Line Height', 'lineHeight', base.lineHeight, { min: 0.5, step: 0.1, preserveUnitless: true }));

            // Style Icons (Italic, Underline)
            const styleWrap = document.createElement('div');
            styleWrap.style.cssText = 'display:flex;gap:2px;background:color-mix(in srgb, var(--dock-bg) 96%, transparent);padding:2px;border-radius:6px;height:32px;align-items:center;';

            const renderIconBtn = (icon, active, onClick) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.innerHTML = icon;
                btn.style.cssText = `flex:1;border:none;background:${active ? 'color-mix(in srgb, var(--dock-fg) 10%, var(--dock-bg))' : 'transparent'};color:${active ? 'var(--dock-fg)' : 'var(--dock-fg-2)'};cursor:pointer;border-radius:4px;height:28px;display:flex;align-items:center;justify-content:center;`;
                btn.addEventListener('click', (e) => { e.preventDefault(); onClick(); });
                return btn;
            };

            const currentFontStyle = this.current.fontStyle !== undefined ? this.current.fontStyle : base.fontStyle;
            const currentTextDeco = this.current.textDecoration !== undefined ? this.current.textDecoration : base.textDecoration;

            styleWrap.appendChild(renderIconBtn('<i>I</i>', currentFontStyle === 'italic', () => {
                const val = (this.current.fontStyle || base.fontStyle) === 'italic' ? 'normal' : 'italic';
                this.current.fontStyle = val;
                this.intents.fontStyle = `Set font style to ${val}`;
                this.preview();
                this.renderForm(); // Re-render to update active state
            }));

            styleWrap.appendChild(renderIconBtn('<u>U</u>', currentTextDeco && currentTextDeco.includes('underline'), () => {
                const current = this.current.textDecoration || base.textDecoration || '';
                const val = current.includes('underline') ? 'none' : 'underline';
                this.current.textDecoration = val;
                this.intents.textDecoration = `Set text decoration to ${val}`;
                this.preview();
                this.renderForm();
            }));

            row2.appendChild(styleWrap);
            group.appendChild(row2);

            // Alignment Icons
            const alignWrap = document.createElement('div');
            alignWrap.style.cssText = 'display:flex;gap:2px;background:color-mix(in srgb, var(--dock-bg) 96%, transparent);padding:2px;border-radius:6px;height:32px;align-items:center;margin-top:4px;';
            const alignments = [
                { value: 'left', label: 'Align Left', path: 'M3 21h18v-2H3v2zm0-4h12v-2H3v2zm0-4h18v-2H3v2zm0-4h12V7H3v2zm0-6v2h18V3H3z' },
                { value: 'center', label: 'Align Center', path: 'M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z' },
                { value: 'right', label: 'Align Right', path: 'M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zm-6-6v2h18V3H3z' },
                { value: 'justify', label: 'Justify', path: 'M3 21h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18V7H3v2zm0-6v2h18V3H3z' }
            ];
            alignments.forEach(({ value, label, path }) => {
                const currentAlign = this.current.textAlign !== undefined ? this.current.textAlign : base.textAlign;
                const isActive = currentAlign === value;
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.title = label;
                btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="${path}"/></svg>`;
                btn.style.cssText = `flex:1;border:none;background:${isActive ? 'color-mix(in srgb, var(--dock-fg) 10%, var(--dock-bg))' : 'transparent'};color:${isActive ? 'var(--dock-fg)' : 'var(--dock-fg-2)'};cursor:pointer;border-radius:4px;height:28px;display:flex;align-items:center;justify-content:center;`;
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.current['textAlign'] = value;
                    this.intents['textAlign'] = `Align text ${value}`;
                    this.preview();
                    this.renderForm();
                });
                alignWrap.appendChild(btn);
            });
            group.appendChild(alignWrap);
        }

        // Color Second (Dropdown style)
        if (schema.controls.has('color')) {
            const group = document.createElement('div');
            group.style.display = 'flex'; group.style.flexDirection = 'column'; group.style.gap = '12px';
            group.innerHTML = `<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--dock-fg-2);">Color</div>`;
            form.appendChild(group);

            const row = document.createElement('div');
            row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;';

            row.appendChild(this.renderColorDropdown('Text', 'color', base.color));
            if (schema.type !== 'image') {
                row.appendChild(this.renderColorDropdown('Background', 'backgroundColor', base.backgroundColor));
            }
            group.appendChild(row);
        }

        if (schema.controls.has('spacing')) {
            const group = document.createElement('div');
            group.style.display = 'flex'; group.style.flexDirection = 'column'; group.style.gap = '12px';
            group.innerHTML = `<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--dock-fg-2);">Spacing</div>`;
            form.appendChild(group);

            // Padding
            const paddingLabel = document.createElement('div');
            paddingLabel.style.cssText = 'font-size:10px;color:var(--dock-fg-2);margin-top:4px;';
            paddingLabel.textContent = 'Padding';
            group.appendChild(paddingLabel);
            group.appendChild(this.renderPaddingGroup(base));

            // Margin
            const marginLabel = document.createElement('div');
            marginLabel.style.cssText = 'font-size:10px;color:var(--dock-fg-2);margin-top:8px;';
            marginLabel.textContent = 'Margin';
            group.appendChild(marginLabel);
            group.appendChild(this.renderMarginGroup(base));
        }

        if (schema.controls.has('appearance')) {
            const group = document.createElement('div');
            group.style.display = 'flex'; group.style.flexDirection = 'column'; group.style.gap = '12px';
            group.innerHTML = `<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--dock-fg-2);">Appearance</div>`;
            form.appendChild(group);
            group.appendChild(this.renderNumberField('Radius', 'borderRadius', base.borderRadius, { unit: 'px' }));
            group.appendChild(this.renderShadowField(base.boxShadow));
        }
    }

    // --- New Token-Aware Controls ---

    renderColorDropdown(label, key, value) {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position:relative;display:flex;flex-direction:column;gap:6px;';
        wrapper.innerHTML = `<span style="font-size:12px;color:var(--dock-fg-2);">${label}</span>`;

        const trigger = document.createElement('button');
        trigger.type = 'button';
        const displayVal = value === 'mixed' ? 'Mixed' : (value || 'None');
        const displayColor = value === 'mixed' ? 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)' : (value || 'transparent');

        trigger.style.cssText = `
            display:flex;align-items:center;gap:8px;padding:6px 8px;
            border:1px solid var(--dock-stroke);border-radius:8px;
            background:color-mix(in srgb, var(--dock-bg) 96%, transparent);
            color:var(--dock-fg);cursor:pointer;width:100%;text-align:left;
        `;
        trigger.innerHTML = `
            <div style="width:16px;height:16px;border-radius:4px;border:1px solid var(--dock-stroke);background:${displayColor};flex-shrink:0;"></div>
            <span style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${displayVal}</span>
        `;

        const popover = document.createElement('div');
        popover.style.cssText = `
            position:absolute;top:100%;left:0;width:240px;z-index:100;
            background:var(--dock-bg);border:1px solid var(--dock-stroke);
            border-radius:12px;box-shadow:var(--shadow);padding:12px;
            display:none;flex-direction:column;gap:12px;margin-top:4px;
        `;

        // Tabs inside popover
        const tabs = document.createElement('div');
        tabs.style.cssText = `display:flex;gap:4px;background:color-mix(in srgb, var(--dock-bg) 96%, transparent);padding:2px;border-radius:8px;`;
        const btnTokens = document.createElement('button');
        const btnCustom = document.createElement('button');

        const styleBtn = (active) => `
            flex:1;border:none;background:${active ? 'var(--dock-bg)' : 'transparent'};
            color:${active ? 'var(--dock-fg)' : 'var(--dock-fg-2)'};
            font-size:11px;padding:4px;border-radius:6px;cursor:pointer;
            box-shadow:${active ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'};
        `;

        btnTokens.textContent = 'Tokens';
        btnCustom.textContent = 'Custom';
        btnTokens.type = 'button';
        btnCustom.type = 'button';

        const content = document.createElement('div');

        const renderTokens = () => {
            btnTokens.style.cssText = styleBtn(true);
            btnCustom.style.cssText = styleBtn(false);
            content.innerHTML = '';

            if (this.tokens.colors.length > 0) {
                const search = document.createElement('input');
                search.placeholder = 'Search tokens...';
                search.style.cssText = `width:100%;padding:6px;border:1px solid var(--dock-stroke);border-radius:6px;background:transparent;color:var(--dock-fg);font-size:12px;margin-bottom:8px;`;
                content.appendChild(search);

                const list = document.createElement('div');
                list.style.cssText = `display:flex;flex-direction:column;gap:4px;max-height:160px;overflow-y:auto;`;

                const renderList = (filter = '') => {
                    list.innerHTML = '';
                    this.tokens.colors.filter(t => t.name.toLowerCase().includes(filter.toLowerCase())).forEach(token => {
                        const row = document.createElement('div');
                        row.style.cssText = `display:flex;align-items:center;gap:8px;padding:4px;cursor:pointer;border-radius:4px;`;
                        row.innerHTML = `
                            <div style="width:16px;height:16px;border-radius:4px;background:${token.value};border:1px solid var(--dock-stroke);"></div>
                            <span style="font-size:12px;color:var(--dock-fg);">${token.name}</span>
                        `;
                        row.addEventListener('mouseenter', () => row.style.background = 'color-mix(in srgb, var(--dock-fg) 5%, transparent)');
                        row.addEventListener('mouseleave', () => row.style.background = 'transparent');
                        row.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            this.current[key] = token.value;
                            this.intents[key] = `Set ${label.toLowerCase()} to var(${token.name})`;
                            this.preview();
                            popover.style.display = 'none';
                            this.renderForm(); // Update trigger
                        });
                        list.appendChild(row);
                    });
                };
                renderList();
                search.addEventListener('input', (e) => renderList(e.target.value));
                content.appendChild(list);
            } else {
                content.innerHTML = `<div style="padding:8px;font-size:12px;color:var(--dock-fg-2);">No tokens found</div>`;
            }
        };

        const renderCustom = () => {
            btnTokens.style.cssText = styleBtn(false);
            btnCustom.style.cssText = styleBtn(true);
            content.innerHTML = '';

            const row = document.createElement('div');
            row.style.cssText = `display:flex;align-items:center;gap:8px;padding:4px;`;

            const colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.value = this.toHex(value === 'mixed' ? '#000000' : value);
            colorInput.style.cssText = `width:32px;height:32px;border:none;background:transparent;cursor:pointer;`;

            const textInput = document.createElement('input');
            textInput.type = 'text';
            textInput.value = value === 'mixed' ? 'Mixed' : (value || '');
            textInput.style.cssText = `flex:1;padding:6px;border:1px solid var(--dock-stroke);border-radius:6px;background:transparent;color:var(--dock-fg);font-size:12px;`;

            const update = (val) => {
                this.current[key] = val;
                this.intents[key] = `Set ${label.toLowerCase()} to ${val}`;
                this.preview();
            };

            colorInput.addEventListener('input', (e) => { e.stopPropagation(); textInput.value = colorInput.value; update(colorInput.value); });
            textInput.addEventListener('change', (e) => { e.stopPropagation(); update(textInput.value); colorInput.value = this.toHex(textInput.value); });

            row.appendChild(colorInput);
            row.appendChild(textInput);
            content.appendChild(row);
        };

        btnTokens.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); renderTokens(); });
        btnCustom.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); renderCustom(); });

        tabs.appendChild(btnTokens);
        tabs.appendChild(btnCustom);
        popover.appendChild(tabs);
        popover.appendChild(content);

        // Toggle Popover
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isVisible = popover.style.display === 'flex';
            // Close others
            this.form.querySelectorAll('.color-popover').forEach(el => el.style.display = 'none');
            popover.style.display = isVisible ? 'none' : 'flex';
            if (!isVisible) {
                if (this.tokens.colors.length > 0) renderTokens(); else renderCustom();
            }
        });

        // Close on click outside
        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) popover.style.display = 'none';
        });

        popover.classList.add('color-popover');
        wrapper.appendChild(trigger);
        wrapper.appendChild(popover);
        return wrapper;
    }

    // --- Existing Controls (Simplified) ---

    renderTextField(label, key, value) {
        const wrapper = document.createElement('label');
        wrapper.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
        wrapper.innerHTML = `<span style="font-size:12px;color:var(--dock-fg-2);">${label}</span>`;
        const textarea = document.createElement('textarea');
        textarea.style.cssText = 'font-size:13px;padding:8px;border:1px solid var(--dock-stroke);border-radius:8px;background:color-mix(in srgb, var(--dock-bg) 96%, transparent);color:var(--dock-fg);resize:vertical;';
        textarea.value = value === 'mixed' ? '' : (value || '');
        textarea.placeholder = value === 'mixed' ? 'Mixed' : '';
        textarea.addEventListener('input', () => {
            this.current[key] = textarea.value;
            this.intents[key] = `Update text content`;
            this.preview();
        });
        wrapper.appendChild(textarea);
        return wrapper;
    }

    renderNumberField(label, key, value, opts = {}) {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
        wrapper.innerHTML = `<span style="font-size:12px;color:var(--dock-fg-2);">${label}</span>`;
        const input = document.createElement('input');
        input.type = 'number';
        input.style.cssText = 'padding:6px;border:1px solid var(--dock-stroke);border-radius:8px;background:color-mix(in srgb, var(--dock-bg) 96%, transparent);color:var(--dock-fg);';
        input.step = opts.step || '1';
        if (opts.min !== undefined) input.min = opts.min;
        if (opts.max !== undefined) input.max = opts.max;

        if (value !== 'mixed' && value !== null) {
            // For line-height, check if it's unitless (typically < 10)
            const parsed = this.parseNumeric(value, opts.unit);
            input.value = parsed;
        } else {
            input.placeholder = 'Mixed';
        }

        input.addEventListener('input', () => {
            // For line-height, if value is small (< 10), keep it unitless, otherwise add px
            let val = input.value;
            if (opts.preserveUnitless && parseFloat(val) < 10) {
                // Keep unitless for values like 1.5, 2, etc.
                val = val;
            } else if (opts.unit) {
                val = `${val}${opts.unit}`;
            }
            this.current[key] = val;
            this.intents[key] = `Set ${label.toLowerCase()} to ${val}`;
            this.preview();
            this.updateApplyAvailability();
        });
        wrapper.appendChild(input);
        return wrapper;
    }

    renderSelectField(label, key, value, options) {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
        wrapper.innerHTML = `<span style="font-size:12px;color:var(--dock-fg-2);">${label}</span>`;
        const select = document.createElement('select');
        select.style.cssText = 'padding:6px;border:1px solid var(--dock-stroke);border-radius:8px;background:color-mix(in srgb, var(--dock-bg) 96%, transparent);color:var(--dock-fg);';
        select.innerHTML = `<option value="">Mixed</option>` + options.map(opt => `<option value="${opt}">${opt}</option>`).join('');
        if (value && value !== 'mixed') select.value = value.replace(/[^0-9]/g, '') || value;

        select.addEventListener('change', () => {
            this.current[key] = select.value;
            this.intents[key] = `Set ${label.toLowerCase()} to ${select.value}`;
            this.preview();
        });
        wrapper.appendChild(select);
        return wrapper;
    }

    renderPaddingGroup(base) {
        const wrapper = document.createElement('div');
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;';

        const renderInput = (icon, key, val) => {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'display:flex;align-items:center;gap:6px;background:color-mix(in srgb, var(--dock-bg) 96%, transparent);border:1px solid var(--dock-stroke);border-radius:6px;padding:0 6px;height:32px;';
            wrap.innerHTML = `<span style="color:var(--dock-fg-2);font-size:14px;">${icon}</span>`;
            const input = document.createElement('input');
            input.type = 'number';
            input.min = '0';
            input.value = this.parseNumeric(val, 'px');
            input.style.cssText = 'flex:1;border:none;background:transparent;color:var(--dock-fg);font-size:12px;width:0;';
            input.addEventListener('input', () => {
                this.current[key] = input.value + 'px';
                this.intents[key] = `Set ${key} to ${input.value}px`;
                this.preview();
                this.updateApplyAvailability();
            });
            wrap.appendChild(input);
            return wrap;
        };

        // Icons: Top, Right, Bottom, Left
        grid.appendChild(renderInput('⭡', 'paddingTop', base.paddingTop));
        grid.appendChild(renderInput('⭢', 'paddingRight', base.paddingRight));
        grid.appendChild(renderInput('⭣', 'paddingBottom', base.paddingBottom));
        grid.appendChild(renderInput('⭠', 'paddingLeft', base.paddingLeft));

        wrapper.appendChild(grid);
        return wrapper;
    }

    renderMarginGroup(base) {
        const wrapper = document.createElement('div');
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;';

        const renderInput = (icon, key, val) => {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'display:flex;align-items:center;gap:6px;background:color-mix(in srgb, var(--dock-bg) 96%, transparent);border:1px solid var(--dock-stroke);border-radius:6px;padding:0 6px;height:32px;';
            wrap.innerHTML = `<span style="color:var(--dock-fg-2);font-size:14px;">${icon}</span>`;
            const input = document.createElement('input');
            input.type = 'number';
            input.value = this.parseNumeric(val, 'px');
            input.style.cssText = 'flex:1;border:none;background:transparent;color:var(--dock-fg);font-size:12px;width:0;';
            input.addEventListener('input', () => {
                this.current[key] = input.value + 'px';
                this.intents[key] = `Set ${key} to ${input.value}px`;
                this.preview();
                this.updateApplyAvailability();
            });
            wrap.appendChild(input);
            return wrap;
        };

        // Icons: Top, Right, Bottom, Left
        grid.appendChild(renderInput('⭡', 'marginTop', base.marginTop));
        grid.appendChild(renderInput('⭢', 'marginRight', base.marginRight));
        grid.appendChild(renderInput('⭣', 'marginBottom', base.marginBottom));
        grid.appendChild(renderInput('⭠', 'marginLeft', base.marginLeft));

        wrapper.appendChild(grid);
        return wrapper;
    }

    renderShadowField(value) {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
        wrapper.innerHTML = `<span style="font-size:12px;color:var(--dock-fg-2);">Shadow</span>`;
        const select = document.createElement('select');
        select.style.cssText = 'padding:6px;border:1px solid var(--dock-stroke);border-radius:8px;background:color-mix(in srgb, var(--dock-bg) 96%, transparent);';
        select.innerHTML = `<option value="none">None</option><option value="soft">Soft</option><option value="medium">Medium</option><option value="deep">Deep</option>`;
        const matched = Object.entries(SHADOW_PRESETS).find(([k, v]) => v === value);
        select.value = matched ? matched[0] : 'none';

        select.addEventListener('change', () => {
            const preset = SHADOW_PRESETS[select.value] || 'none';
            this.current.boxShadow = preset;
            this.intents.boxShadow = `Set shadow to ${select.value} preset`;
            this.preview();
        });
        wrapper.appendChild(select);
        return wrapper;
    }

    // ... (preview, undoPreviewStep, isOpen, resetChanges same as before, just ensure intents are handled) ...

    preview() {
        const changes = this.current;
        // ... (same preview logic as before) ...
        const trimmed = {};
        Object.entries(changes || {}).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') trimmed[key] = value;
        });
        const changedKeys = Object.keys(trimmed).filter(k => this.lastPreviewState[k] !== trimmed[k]);
        Object.keys(this.lastPreviewState).forEach((k) => { if (!Object.prototype.hasOwnProperty.call(trimmed, k)) changedKeys.push(k); });

        if (changedKeys.length) {
            const step = { prevByIndex: new Map(), keys: Array.from(new Set(changedKeys)) };
            this.targets.forEach((t, i) => {
                const idx = this.indices[i];
                const el = t.element;
                const prev = {};
                step.keys.forEach((key) => {
                    if (key === 'text') { if (this.canEditText(el)) prev.text = el.textContent; }
                    else prev[key] = el.style[key] || '';
                });
                step.prevByIndex.set(idx, prev);
            });
            this.previewHistory.push(step);
            this.lastPreviewState = { ...trimmed };
        }
        this.targets.forEach(({ element }) => {
            if (changes.text !== undefined && this.canEditText(element)) element.textContent = changes.text;
            Object.entries(changes).forEach(([k, v]) => {
                if (k !== 'text' && k !== 'src') {
                    // Use !important for margin/padding to ensure they apply
                    if (k.startsWith('margin') || k.startsWith('padding')) {
                        element.style.setProperty(k, v, 'important');
                    } else {
                        element.style[k] = v;
                    }
                }
            });
        });
        this.syncPending();
        this.updateUndoAvailability();
        this.updateApplyAvailability();
    }

    undoPreviewStep() {
        if (!this.previewHistory.length) return false;
        const step = this.previewHistory.pop();
        this.targets.forEach((t, i) => {
            const idx = this.indices[i];
            const prev = step.prevByIndex.get(idx) || {};
            const el = t.element;
            step.keys.forEach((key) => {
                if (key === 'text') { if (this.canEditText(el)) el.textContent = prev.text; }
                else el.style[key] = prev[key] || '';
            });
        });
        this.current = {};
        this.lastPreviewState = {};
        this.collectBase();
        this.renderForm();
        this.syncPending();
        this.updateUndoAvailability();
        return true;
    }

    isOpen() { return !!this.container && this.container.style.display === 'flex'; }

    resetChanges() {
        // Reset to original page state (baseline from first selection)
        this.restoreBaseline();
        this.current = {};
        this.intents = {};
        // Re-collect base from the now-restored DOM
        this.collectBase();
        this.renderForm();
        this.syncPending();
        this.previewHistory = [];
        this.lastPreviewState = {};
        this.updateUndoAvailability();
        this.updateApplyAvailability();
    }

    refresh() {
        if (!this.isOpen()) return;
        this.collectBase();
        this.renderForm();
        this.current = {};
        this.intents = {};
        this.stateManager.set('wysiwyg.pending', null);
        this.previewHistory = [];
        this.lastPreviewState = {};
        this.updateUndoAvailability();
    }

    applyChanges() {
        if (!this.targets.length) return;
        const changes = { ...this.current };
        if (Object.prototype.hasOwnProperty.call(changes, 'text')) {
            const allow = this.targets.length === 1 && this.canEditText(this.targets[0].element);
            if (!allow) delete changes.text;
        }
        Object.keys(changes).forEach(key => {
            if (changes[key] === undefined || changes[key] === null || changes[key] === '') delete changes[key];
        });

        const hasDiff = Object.keys(changes).length > 0;

        // Generate Hybrid Summary from Intents
        const intentList = Object.keys(changes).map(k => this.intents[k]).filter(Boolean);
        const summary = intentList.length > 0 ? intentList.join(', ') : (describeChanges(changes) || 'Edited');

        this.targets.forEach(({ selector }, idx) => {
            const index = this.indices[idx];
            this.eventBus.emit('wysiwyg:apply', {
                index,
                selector,
                changes,
                summary
            });
        });
        if (hasDiff) this.close();
        this.updateUndoAvailability();
    }

    // ... (helpers) ...
    canEditText(element) {
        try {
            if (!element) return false;
            const tag = (element.tagName || '').toLowerCase();
            if (['input', 'textarea', 'img', 'video', 'canvas', 'svg', 'hr', 'br'].includes(tag)) return false;

            // Allow if no children
            if (element.childElementCount === 0) return true;

            // Allow if children are only inline phrasing content (span, b, i, strong, em, a, code, etc.)
            // and NOT block elements (div, p, section, ul, li, etc.)
            const blockTags = ['DIV', 'P', 'SECTION', 'ARTICLE', 'NAV', 'ASIDE', 'HEADER', 'FOOTER', 'MAIN', 'UL', 'OL', 'LI', 'TABLE', 'TR', 'TD', 'TH', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'];
            const children = Array.from(element.children);
            const hasBlockChild = children.some(child => blockTags.includes(child.tagName));

            return !hasBlockChild;
        } catch (_) { return false; }
    }
    updateUndoAvailability() {
        try {
            if (!this.undoBtn) return;
            const canUndo = this.previewHistory.length > 0;
            this.undoBtn.disabled = !canUndo;
            this.undoBtn.style.opacity = canUndo ? '1' : '0.5';
            this.undoBtn.style.cursor = canUndo ? 'pointer' : 'not-allowed';
        } catch (_) { }
    }
    updateApplyAvailability() {
        try {
            if (!this.applyBtn) return;
            const trimmed = {};
            Object.entries(this.current || {}).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== '') trimmed[key] = value;
            });
            const hasChanges = Object.keys(trimmed).length > 0;
            this.applyBtn.disabled = !hasChanges;
            this.applyBtn.style.opacity = hasChanges ? '1' : '0.5';
            this.applyBtn.style.cursor = hasChanges ? 'pointer' : 'not-allowed';
        } catch (_) { }
    }
    parseNumeric(value, unit) {
        if (!value || value === 'mixed') return '';

        // For line-height, preserve unitless values
        const str = String(value);
        const match = str.match(/-?\d+(?:\.\d+)?/);
        if (!match) return '';

        const numericValue = match[0];

        // If unit is specified in options and value has no unit, it's a unitless number
        if (unit === 'px' && !str.includes('px') && !str.includes('%') && !str.includes('em')) {
            // For properties like line-height that can be unitless, return as-is if < 10
            const num = parseFloat(numericValue);
            if (num < 10) return numericValue; // Likely unitless line-height
        }

        return numericValue;
    }
    toHex(color) {
        const fallback = '#000000';
        if (!color) return fallback;
        if (color.startsWith('#')) return color.length === 7 ? color : fallback;
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.fillStyle = color;
        return ctx.fillStyle;
    }
    syncPending() {
        if (this.indices.length !== 1) { this.stateManager.set('wysiwyg.pending', null); return; }
        const trimmed = {};
        Object.entries(this.current || {}).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') trimmed[key] = value;
        });
        if (Object.keys(trimmed).length) this.stateManager.set('wysiwyg.pending', { index: this.indices[0], changes: trimmed });
        else this.stateManager.set('wysiwyg.pending', null);
    }
}
