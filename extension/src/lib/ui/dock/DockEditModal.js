import { describeChanges } from '../../engine/ElementSchema.js';
import { readableElementName } from '../../utils/dom.js';

const SHADOW_PRESETS = {
  none: 'none',
  soft: '0 6px 18px rgba(15,23,42,0.12)',
  medium: '0 12px 28px rgba(15,23,42,0.16)',
  deep: '0 24px 44px rgba(15,23,42,0.2)'
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
    this.bodyScrollLocked = false;
  }

  mount() {
    if (this.container) return;
    this.backdrop = document.createElement('div');
    this.backdrop.id = 'dock-edit-overlay';
    this.backdrop.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      left: auto;
      width: 420px; /* updated dynamically in open() */
      background: color-mix(in srgb, var(--dock-fg, #0f172a) 22%, transparent);
      backdrop-filter: blur(8px);
      z-index: 2147483647;
      display: none;
      `;
    this.backdrop.addEventListener('click', () => this.close(true));

    this.container = document.createElement('div');
    this.container.id = 'dock-edit-modal';
    this.container.style.cssText = `
      position: fixed;
      right: 24px;
      top: 72px;
      width: 360px;
      background: var(--dock-bg);
      backdrop-filter: blur(24px);
      border-radius: var(--radius-panel, 18px);
      border: 1px solid var(--dock-stroke);
      box-shadow: var(--shadow);
      padding: 20px 22px;
      display: none; /* hidden by default; becomes flex on open() */
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: var(--dock-fg);
      max-height: calc(100vh - 144px);
      overflow: hidden;
      flex-direction: column;
    `;

    this.container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-shrink:0;">
        <div id="dock-edit-title" style="font-weight:600;font-size:14px;">Edit</div>
        <button id="dock-edit-close" style="border:none;background:transparent;font-size:18px;cursor:pointer;color:var(--dock-fg-2);">×</button>
      </div>
      <div id="dock-edit-scroll" style="flex:1;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;padding-right:4px;min-height:0;">
        <form id="dock-edit-form" class="dock-edit-form" style="display:flex;flex-direction:column;gap:14px;"></form>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px;flex-shrink:0;">
        <button type="button" id="dock-edit-reset" class="dock-edit-btn" style="border:1px solid var(--dock-stroke);background:color-mix(in srgb, var(--dock-bg) 94%, transparent);border-radius:12px;padding:6px 12px;color:var(--dock-fg-2);">Reset</button>
        <button type="button" id="dock-edit-apply" class="dock-edit-apply" style="border:1px solid var(--dock-stroke);background:var(--surface, color-mix(in srgb, var(--dock-bg) 96%, transparent));border-radius:12px;padding:6px 12px;color:var(--dock-fg);">Apply</button>
      </div>
    `;

    this.form = this.container.querySelector('#dock-edit-form');
    this.scrollContainer = this.container.querySelector('#dock-edit-scroll');
    this.container.querySelector('#dock-edit-close').addEventListener('click', () => this.close(true));
    this.container.querySelector('#dock-edit-reset').addEventListener('click', () => this.resetChanges());
    this.container.querySelector('#dock-edit-apply').addEventListener('click', () => this.applyChanges());

    // Prevent scroll events from bubbling to page
    this.container.addEventListener('wheel', (e) => {
      e.stopPropagation();
    }, { passive: true });
    
    // Ensure scroll only happens within modal
    if (this.scrollContainer) {
      this.scrollContainer.addEventListener('wheel', (e) => {
        const { scrollTop, scrollHeight, clientHeight } = this.scrollContainer;
        const isScrollingUp = e.deltaY < 0;
        const isScrollingDown = e.deltaY > 0;
        const isAtTop = scrollTop === 0;
        const isAtBottom = scrollTop + clientHeight >= scrollHeight;
        
        if ((isAtTop && isScrollingUp) || (isAtBottom && isScrollingDown)) {
          e.preventDefault();
        }
        e.stopPropagation();
      }, { passive: false });
    }

    if (!this.mountRoot) return;
    this.mountRoot.appendChild(this.backdrop);
    this.mountRoot.appendChild(this.container);
  }

  open({ index, element } = {}) {
    this.mount();
    const selection = this.stateManager.get('selection.elements') || [];
    if (!Array.isArray(selection) || selection.length === 0) return;

    let indices = [];
    if (typeof index === 'number' && selection[index]) {
      indices = [index];
    } else if (element) {
      const found = selection.findIndex(item => item.element === element);
      if (found >= 0) indices = [found];
    }
    if (!indices.length) {
      indices = selection.map((_, i) => i);
    }

    this.indices = indices;
    this.targets = indices
      .map((i) => {
        const item = selection[i];
        return item && item.element ? { element: item.element, selector: item.selector } : null;
      })
      .filter(Boolean);

    if (!this.targets.length) return;

    this.current = {};
    this.collectBase();
    this.renderForm();
    this.stateManager.set('wysiwyg.pending', null);
    this.stateManager.set('wysiwyg.active', true);
    if (!this.bodyScrollLocked) {
      document.body.classList.add('lumi-scroll-lock');
      this.bodyScrollLocked = true;
    }
    // Ensure overlay only covers Dock area
    this.positionOverlay();
    this.backdrop.style.display = 'block';
    this.container.style.display = 'flex';
  }

  close(cancel = false) {
    if (!this.container) return;
    if (cancel) {
      this.restoreBase();
    }
    this.backdrop.style.display = 'none';
    this.container.style.display = 'none';
    window.removeEventListener('resize', this._onResize);
    this.form.innerHTML = '';
    this.current = {};
    this.targets = [];
    this.indices = [];
    this.stateManager.set('wysiwyg.pending', null);
    this.stateManager.set('wysiwyg.active', false);
    if (this.bodyScrollLocked) {
      document.body.classList.remove('lumi-scroll-lock');
      this.bodyScrollLocked = false;
    }
  }

  positionOverlay() {
    try {
      const state = this.stateManager.get('ui.dockState');
      const dockWidth = state === 'compact' ? 56 : (this.stateManager.get('ui.dockWidth') || 420);
      this.backdrop.style.left = (window.innerWidth - dockWidth) + 'px';
      this.backdrop.style.width = dockWidth + 'px';
      // keep container aligned to right visually
      this.container.style.right = '24px';
    } catch (_) {}
    if (!this._onResize) {
      this._onResize = () => this.positionOverlay();
    }
    window.addEventListener('resize', this._onResize, { passive: true });
  }

  collectBase() {
    const base = {
      text: null,
      color: null,
      backgroundColor: null,
      fontSize: null,
      fontWeight: null,
      lineHeight: null,
      paddingTop: null,
      paddingRight: null,
      paddingBottom: null,
      paddingLeft: null,
      borderRadius: null,
      boxShadow: null
    };
    const inline = [];
    this.targets.forEach(({ element }) => {
      const style = window.getComputedStyle(element);
      const entry = {
        text: element.textContent,
        color: style.color,
        backgroundColor: style.backgroundColor,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        paddingTop: style.paddingTop,
        paddingRight: style.paddingRight,
        paddingBottom: style.paddingBottom,
        paddingLeft: style.paddingLeft,
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow,
        inline: {
          color: element.style.color,
          backgroundColor: element.style.backgroundColor,
          fontSize: element.style.fontSize,
          fontWeight: element.style.fontWeight,
          lineHeight: element.style.lineHeight,
          paddingTop: element.style.paddingTop,
          paddingRight: element.style.paddingRight,
          paddingBottom: element.style.paddingBottom,
          paddingLeft: element.style.paddingLeft,
          borderRadius: element.style.borderRadius,
          boxShadow: element.style.boxShadow
        }
      };
      inline.push(entry);
      Object.keys(base).forEach((key) => {
        if (base[key] === null) {
          base[key] = entry[key];
        } else if (base[key] !== entry[key]) {
          base[key] = 'mixed';
        }
      });
    });
    this.base = base;
    this.inline = inline;
  }

  restoreBase() {
    this.targets.forEach(({ element }, idx) => {
      const data = this.inline[idx];
      if (!data) return;
      element.textContent = data.text;
      element.style.color = data.inline.color;
      element.style.backgroundColor = data.inline.backgroundColor;
      element.style.fontSize = data.inline.fontSize;
      element.style.fontWeight = data.inline.fontWeight;
      element.style.lineHeight = data.inline.lineHeight;
      element.style.paddingTop = data.inline.paddingTop;
      element.style.paddingRight = data.inline.paddingRight;
      element.style.paddingBottom = data.inline.paddingBottom;
      element.style.paddingLeft = data.inline.paddingLeft;
      element.style.borderRadius = data.inline.borderRadius;
      element.style.boxShadow = data.inline.boxShadow;
    });
  }

  renderForm() {
    const base = this.base;
    const form = this.form;
    form.innerHTML = '';

    const title = this.container.querySelector('#dock-edit-title');
    if (this.targets.length > 1) {
      title.textContent = `${this.targets.length} elements selected`;
    } else {
      const el = this.targets[0].element;
      title.textContent = readableElementName(el);
    }

    form.appendChild(this.renderTextField('Text', 'text', base.text));
    form.appendChild(this.renderColorField('Text Color', 'color', base.color));
    form.appendChild(this.renderColorField('Background', 'backgroundColor', base.backgroundColor));
    form.appendChild(this.renderNumberField('Font Size (px)', 'fontSize', base.fontSize, { unit: 'px' }));
    form.appendChild(this.renderSelectField('Font Weight', 'fontWeight', base.fontWeight, ['300','400','500','600','700']));
    form.appendChild(this.renderNumberField('Line Height', 'lineHeight', base.lineHeight));

    form.appendChild(this.renderPaddingGroup(base));
    form.appendChild(this.renderNumberField('Border Radius (px)', 'borderRadius', base.borderRadius, {unit:'px'}));
    form.appendChild(this.renderShadowField(base.boxShadow));
  }

  renderTextField(label, key, value) {
    const wrapper = document.createElement('label');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.gap = '6px';
    wrapper.innerHTML = `<span style="font-size:12px;color:var(--dock-fg-2);">${label}</span>`;
    const textarea = document.createElement('textarea');
    textarea.style.fontSize = '13px';
    textarea.style.padding = '8px 10px';
    textarea.style.border = '1px solid var(--dock-stroke)';
    textarea.style.borderRadius = '10px';
    textarea.style.background = 'color-mix(in srgb, var(--dock-bg) 96%, transparent)';
    textarea.style.resize = 'vertical';
    textarea.value = value === 'mixed' ? '' : (value || '');
    textarea.placeholder = value === 'mixed' ? 'Mixed' : '';
    textarea.addEventListener('input', () => {
      if (value === 'mixed' && !textarea.value.trim()) {
        delete this.current[key];
      } else {
        this.current[key] = textarea.value;
      }
      this.preview();
    });
    wrapper.appendChild(textarea);
    return wrapper;
  }

  renderColorField(label, key, value) {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.gap = '6px';
    wrapper.innerHTML = `<span style="font-size:12px;color:var(--dock-fg-2);">${label}</span>`;
    const input = document.createElement('input');
    input.type = 'color';
    input.value = this.toHex(value === 'mixed' ? '#999999' : value);
    input.addEventListener('input', () => {
      this.current[key] = input.value;
      this.preview();
    });
    wrapper.appendChild(input);
    return wrapper;
  }

  renderNumberField(label, key, value, opts = {}) {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.gap = '6px';
    wrapper.innerHTML = `<span style="font-size:12px;color:var(--dock-fg-2);">${label}</span>`;
    const input = document.createElement('input');
    input.type = 'number';
    input.style.padding = '6px 10px';
    input.style.border = '1px solid var(--dock-stroke)';
    input.style.borderRadius = '10px';
    input.style.background = 'color-mix(in srgb, var(--dock-bg) 96%, transparent)';
    input.step = opts.step || '1';
    if (value !== 'mixed' && value !== null) {
      input.value = this.parseNumeric(value, opts.unit);
    } else {
      input.placeholder = 'Mixed';
    }
    input.addEventListener('input', () => {
      if (input.value === '') {
        delete this.current[key];
      } else {
        const unit = opts.unit || '';
        this.current[key] = unit ? `${input.value}${unit}` : input.value;
      }
      this.preview();
    });
    wrapper.appendChild(input);
    return wrapper;
  }

  renderSelectField(label, key, value, options) {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.gap = '6px';
    wrapper.innerHTML = `<span style="font-size:12px;color:var(--dock-fg-2);">${label}</span>`;
    const select = document.createElement('select');
    select.style.padding = '6px 10px';
    select.style.border = '1px solid var(--dock-stroke)';
    select.style.borderRadius = '10px';
    select.style.background = 'color-mix(in srgb, var(--dock-bg) 96%, transparent)';
    select.innerHTML = `<option value="">Mixed</option>` + options.map(opt => `<option value="${opt}">${opt}</option>`).join('');
    if (value && value !== 'mixed') {
      select.value = value.replace(/[^0-9]/g, '') || value;
    }
    select.addEventListener('change', () => {
      if (!select.value) {
        delete this.current[key];
      } else {
        this.current[key] = select.value;
      }
      this.preview();
    });
    wrapper.appendChild(select);
    return wrapper;
  }

  renderPaddingGroup(base) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `<span style="font-size:12px;color:var(--dock-fg-2);">Padding (px)</span>`;
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
    grid.style.gap = '10px';

    ['Top','Right','Bottom','Left'].forEach(side => {
      const key = `padding${side}`;
      const cell = this.renderNumberField(side, key, base[key], { unit: 'px' });
      grid.appendChild(cell);
    });
    wrapper.appendChild(grid);
    return wrapper;
  }

  renderShadowField(value) {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.gap = '6px';
    wrapper.innerHTML = `<span style="font-size:12px;color:var(--dock-fg-2);">Shadow</span>`;
    const select = document.createElement('select');
    select.style.padding = '6px 10px';
    select.style.border = '1px solid var(--dock-stroke)';
    select.style.borderRadius = '10px';
    select.style.background = 'color-mix(in srgb, var(--dock-bg) 96%, transparent)';
    select.innerHTML = `
      <option value="none">None</option>
      <option value="soft">Soft</option>
      <option value="medium">Medium</option>
      <option value="deep">Deep</option>
    `;
    const matched = Object.entries(SHADOW_PRESETS).find(([key, preset]) => preset === value);
    select.value = matched ? matched[0] : 'none';
    select.addEventListener('change', () => {
      const preset = SHADOW_PRESETS[select.value] || 'none';
      this.current.boxShadow = preset;
      this.preview();
    });
    wrapper.appendChild(select);
    return wrapper;
  }

  preview() {
    const changes = this.current;
    this.targets.forEach(({ element }) => {
      if (changes.text !== undefined) {
        element.textContent = changes.text;
      }
      if (changes.color !== undefined) element.style.color = changes.color;
      if (changes.backgroundColor !== undefined) element.style.backgroundColor = changes.backgroundColor;
      if (changes.fontSize !== undefined) element.style.fontSize = this.withUnit(changes.fontSize, 'px');
      if (changes.fontWeight !== undefined) element.style.fontWeight = changes.fontWeight;
      if (changes.lineHeight !== undefined) element.style.lineHeight = changes.lineHeight;
      if (changes.paddingTop !== undefined) element.style.paddingTop = this.withUnit(changes.paddingTop, 'px');
      if (changes.paddingRight !== undefined) element.style.paddingRight = this.withUnit(changes.paddingRight, 'px');
      if (changes.paddingBottom !== undefined) element.style.paddingBottom = this.withUnit(changes.paddingBottom, 'px');
      if (changes.paddingLeft !== undefined) element.style.paddingLeft = this.withUnit(changes.paddingLeft, 'px');
      if (changes.borderRadius !== undefined) element.style.borderRadius = this.withUnit(changes.borderRadius, 'px');
      if (changes.boxShadow !== undefined) element.style.boxShadow = changes.boxShadow;
    });
    this.syncPending();
  }

  resetChanges() {
    this.restoreBase();
    this.current = {};
    this.renderForm();
    this.syncPending();
  }

  applyChanges() {
    if (!this.targets.length) return;
    const changes = { ...this.current };
    Object.keys(changes).forEach(key => {
      if (changes[key] === undefined) delete changes[key];
    });
    const summary = describeChanges(changes) || 'Edited';
    this.targets.forEach(({ selector }, idx) => {
      const index = this.indices[idx];
      this.eventBus.emit('wysiwyg:apply', {
        index,
        selector,
        changes,
        summary
      });
    });
    this.close();
  }

  parseNumeric(value, unit) {
    if (!value || value === 'mixed') return '';
    if (unit === 'px') {
      const match = String(value).match(/-?\d+(?:\.\d+)?/);
      return match ? match[0] : '';
    }
    if (String(value).endsWith('px')) return value.replace('px', '');
    return value;
  }

  withUnit(value, unit) {
    if (value === undefined || value === null || value === '') return '';
    if (String(value).endsWith(unit)) return value;
    return `${value}${unit}`;
  }

  toHex(color) {
    if (!color) return '#000000';
    if (color.startsWith('#')) return color.length === 7 ? color : '#000000';
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = color;
    return ctx.fillStyle;
  }

  syncPending() {
    if (!this.indices.length || this.indices.length !== 1) {
      this.stateManager.set('wysiwyg.pending', null);
      return;
    }
    const trimmed = {};
    Object.entries(this.current || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        trimmed[key] = value;
      }
    });
    if (Object.keys(trimmed).length) {
      this.stateManager.set('wysiwyg.pending', {
        index: this.indices[0],
        changes: trimmed
      });
    } else {
      this.stateManager.set('wysiwyg.pending', null);
    }
  }
}
