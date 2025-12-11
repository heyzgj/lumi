export default class RestoreHelper {
  constructor() {
    this.savedScroll = { x: 0, y: 0 };
  }

  saveScroll() {
    this.savedScroll = { x: window.pageXOffset || 0, y: window.pageYOffset || 0 };
  }

  restoreScroll() {
    try { window.scrollTo(this.savedScroll.x, this.savedScroll.y); } catch (_) {}
  }

  restoreOriginalPage(wrapper, root, anchor) {
    console.log('[LUMI] restore step 1 ok');
    const body = document.body;
    if (wrapper) {
      const nodes = Array.from(wrapper.childNodes);
      nodes.forEach((node) => {
        if (anchor && anchor.parentNode) {
          anchor.parentNode.insertBefore(node, anchor);
        } else {
          body.appendChild(node);
        }
      });
    }
    console.log('[LUMI] restore step 2 ok');
    if (root) {
      try { root.remove(); console.log('[LUMI] restore step 3 ok'); } catch (_) {}
    }
    if (anchor) {
      try { anchor.remove(); console.log('[LUMI] restore step 4 ok'); } catch (_) {}
    }
    this.restoreScroll();
    console.log('[LUMI] restore step 5 ok (scroll restored)');
  }
}

