// jsdom lacks what HeroUI's tabs and scroll shadows use: ResizeObserver and Element.getAnimations.
class StubResizeObserver implements ResizeObserver {
  observe() {
    /* no layout in jsdom */
  }
  unobserve() {
    /* no layout in jsdom */
  }
  disconnect() {
    /* no layout in jsdom */
  }
}

globalThis.ResizeObserver ??= StubResizeObserver;
if (typeof Element !== 'undefined' && !Element.prototype.getAnimations) {
  Object.defineProperty(Element.prototype, 'getAnimations', { configurable: true, value: () => [] });
}
