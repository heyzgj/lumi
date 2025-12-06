/**
 * TopBanner - Top notification banner for mode hints
 */

export default class TopBanner {
  constructor() {
    this.banner = null;
    this._rightOffset = '0px';
  }

  mount() {
    if (this.banner) return;
    
    this.banner = document.createElement('div');
    this.banner.id = 'lumi-top-banner';
    this.banner.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 2147483646;
      padding: 12px 24px;
      background: var(--lumi-accent);
      backdrop-filter: blur(12px);
      color: var(--lumi-on-accent);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      font-weight: 500;
      text-align: center;
      box-shadow: var(--shadow);
      display: none;
      animation: slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    `;
    
    document.body.appendChild(this.banner);
  }

  show(message) {
    if (!this.banner) this.mount();
    this.banner.textContent = message;
    this.banner.style.right = this._rightOffset || '0px';
    this.banner.style.display = 'block';
  }

  hide() {
    if (this.banner) {
      this.banner.style.display = 'none';
    }
  }

  update(message) {
    if (!message) {
      this.hide();
    } else {
      this.show(message);
    }
  }

  setRightOffset(px) {
    this._rightOffset = typeof px === 'string' ? px : `${px || 0}px`;
    if (this.banner && this.banner.style.display === 'block') {
      this.banner.style.right = this._rightOffset;
    }
  }

  destroy() {
    if (this.banner) {
      this.banner.remove();
      this.banner = null;
    }
  }
}
